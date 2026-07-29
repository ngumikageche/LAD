from __future__ import annotations

import mimetypes
import os
import uuid
from datetime import datetime

from flask import Blueprint, request, send_from_directory
from sqlalchemy import exists
from werkzeug.utils import secure_filename

from ..extensions import db
from ..models.notification import Notification
from ..models.student import Student
from ..models.student_report import StudentReport
from ..models.student_subject import StudentSubject
from ..models.subject import Subject
from ..models.trainer import Trainer
from ..models.trainer_subject import TrainerSubject
from ..services.communications import send_email, send_sms
from .permissions import _has_permission, _is_admin, _is_student, _is_trainer, get_current_user


bp = Blueprint("student_reports", __name__, url_prefix="/trainers/students")
ALLOWED_DELIVERY_CHANNELS = {"system", "email", "sms"}
REPORT_UPLOAD_FOLDER = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "student_feedback")
)
REPORT_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "webp", "heic", "heif"}
REPORT_IMAGE_MAX_BYTES = 10 * 1024 * 1024
REPORT_DOCUMENT_EXTENSIONS = {
    "pdf", "doc", "docx", "odt", "txt",
    *REPORT_IMAGE_EXTENSIONS,
}
REPORT_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024


def _parse_uuid(value: str | None, field: str) -> uuid.UUID:
    if not value:
        raise ValueError(f"Missing '{field}'")
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Invalid '{field}'") from exc


def _trainer_can_report_on_student(trainer_id: uuid.UUID, student_id: uuid.UUID) -> bool:
    return db.session.query(
        exists().where(
            (TrainerSubject.trainer_id == trainer_id)
            & (StudentSubject.student_id == student_id)
            & (TrainerSubject.subject_id == StudentSubject.subject_id)
        )
    ).scalar()


def _trainer_can_use_subject(trainer_id: uuid.UUID, student_id: uuid.UUID, subject_id: uuid.UUID) -> bool:
    return db.session.query(
        exists().where(
            (TrainerSubject.trainer_id == trainer_id)
            & (StudentSubject.student_id == student_id)
            & (TrainerSubject.subject_id == subject_id)
            & (StudentSubject.subject_id == subject_id)
        )
    ).scalar()


def _require_report_writer():
    user, error, status = get_current_user()
    if error:
        return None, None, error, status

    if _is_admin(user):
        return user, None, None, None

    if not _is_trainer(user):
        return None, None, {"error": "Trainer or admin access required"}, 403

    has_trainer_role = (user.role.role_name if user.role else "").lower() == "trainer"
    if not _has_permission(user, "reports.student.write") and not has_trainer_role:
        return None, None, {"error": "Permission denied"}, 403

    trainer = db.session.query(Trainer).filter(Trainer.user_id == user.id).first()
    if not trainer:
        return None, None, {"error": "Trainer profile not found"}, 404

    return user, trainer, None, None


def _normalize_delivery_channels(payload: dict) -> list[str]:
    raw_channels = payload.get("delivery_channels")
    if raw_channels is None:
        return ["system", "email"]
    if not isinstance(raw_channels, list):
        raise ValueError("'delivery_channels' must be an array")

    channels: list[str] = []
    for item in raw_channels:
        if not isinstance(item, str):
            raise ValueError("'delivery_channels' entries must be strings")
        value = item.strip().lower()
        if value not in ALLOWED_DELIVERY_CHANNELS:
            raise ValueError("Invalid delivery channel")
        if value not in channels:
            channels.append(value)

    if not channels:
        raise ValueError("Select at least one delivery channel")
    return channels


def _payload(report: StudentReport) -> dict:
    return {
        "id": str(report.id),
        "student_id": str(report.student_id),
        "trainer_id": str(report.trainer_id) if report.trainer_id else None,
        "trainer_name": report.trainer.user.name if report.trainer and report.trainer.user else None,
        "author_user_id": str(report.author_user_id),
        "author_name": report.author.name if report.author else None,
        "subject_id": str(report.subject_id) if report.subject_id else None,
        "subject_name": report.subject.name if report.subject else None,
        "report_type": report.report_type,
        "title": report.title,
        "body": report.body,
        "visibility": report.visibility,
        "attachments": report.attachments if isinstance(report.attachments, list) else [],
        "created_at": report.created_at.isoformat() if report.created_at else None,
    }


@bp.get("/<student_id>/reports")
def list_student_reports(student_id: str):
    user, trainer, error, status = _require_report_writer()
    if error:
        return error, status

    try:
        student_uuid = _parse_uuid(student_id, "student_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    student = db.session.get(Student, student_uuid)
    if not student or student.deleted_at:
        return {"error": "Student not found"}, 404
    if trainer and not _trainer_can_report_on_student(trainer.id, student_uuid):
        return {"error": "Student not found in your assigned subjects"}, 403

    query = db.session.query(StudentReport).filter(
        StudentReport.student_id == student_uuid,
        StudentReport.deleted_at.is_(None),
    )
    if trainer:
        query = query.filter(StudentReport.trainer_id == trainer.id)

    reports = query.order_by(StudentReport.created_at.desc()).all()
    return [_payload(report) for report in reports], 200


@bp.post("/<student_id>/reports")
def create_student_report(student_id: str):
    user, trainer, error, status = _require_report_writer()
    if error:
        return error, status

    try:
        student_uuid = _parse_uuid(student_id, "student_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    student = db.session.get(Student, student_uuid)
    if not student or student.deleted_at:
        return {"error": "Student not found"}, 404
    if trainer and not _trainer_can_report_on_student(trainer.id, student_uuid):
        return {"error": "Student not found in your assigned subjects"}, 403

    payload = request.get_json(silent=True) or {}
    title = (payload.get("title") or "").strip()
    body = (payload.get("body") or payload.get("feedback") or "").strip()
    report_type = (payload.get("report_type") or "general").strip().lower()
    subject_uuid = None
    try:
        delivery_channels = _normalize_delivery_channels(payload)
    except ValueError as exc:
        return {"error": str(exc)}, 400

    if not title:
        return {"error": "'title' is required"}, 400
    if not body:
        return {"error": "'body' is required"}, 400
    if len(body) > 5000:
        return {"error": "'body' must be 5000 characters or fewer"}, 400
    if report_type not in {"general", "academic", "attendance", "behaviour", "support", "progress", "message"}:
        return {"error": "Invalid report_type"}, 400

    if payload.get("subject_id"):
        try:
            subject_uuid = _parse_uuid(payload.get("subject_id"), "subject_id")
        except ValueError as exc:
            return {"error": str(exc)}, 400
        subject = db.session.get(Subject, subject_uuid)
        if not subject or subject.deleted_at:
            return {"error": "Subject not found"}, 404
        if trainer and not _trainer_can_use_subject(trainer.id, student_uuid, subject_uuid):
            return {"error": "You are not assigned to this student for that subject"}, 403

    report = StudentReport(
        student_id=student_uuid,
        trainer_id=trainer.id if trainer else None,
        author_user_id=user.id,
        subject_id=subject_uuid,
        title=title,
        body=body,
        report_type=report_type,
        visibility=payload.get("visibility") or "student",
    )
    db.session.add(report)
    db.session.flush()

    created_system_notification = False
    recipient_email = student.user.email if student.user else None
    recipient_phone = student.user.phone if student.user else None
    if student.user_id and "system" in delivery_channels:
        author_name = trainer.user.name if trainer and trainer.user else user.name
        db.session.add(
            Notification(
                user_id=student.user_id,
                title=f"{'New message' if report_type == 'message' else 'New report'}: {title}",
                message=(
                    f"{author_name or 'Your school'} sent you a new message."
                    if report_type == "message"
                    else f"{author_name or 'Your school'} wrote a new {report_type} report for you."
                ),
                is_read=False,
            )
        )
        created_system_notification = True

    delivery_subject = f"{'New message' if report_type == 'message' else 'New learner report'}: {title}"
    email_result = (
        send_email(recipient_email, delivery_subject, body)
        if "email" in delivery_channels
        else {"status": "disabled"}
    )
    sms_result = (
        send_sms(recipient_phone, f"{delivery_subject}\n{body[:320]}")
        if "sms" in delivery_channels
        else {"status": "disabled"}
    )

    db.session.commit()
    db.session.refresh(report)
    return {
        **_payload(report),
        "delivery_channels": delivery_channels,
        "delivery_summary": {
            "system": {
                "enabled": "system" in delivery_channels,
                "created": created_system_notification,
            },
            "email": {
                "enabled": "email" in delivery_channels,
                "recipient": recipient_email,
                **email_result,
            },
            "sms": {
                "enabled": "sms" in delivery_channels,
                "recipient": recipient_phone,
                **sms_result,
            },
        },
    }, 201


@bp.post("/<student_id>/reports/<report_id>/handwritten-feedback")
def upload_handwritten_feedback(student_id: str, report_id: str):
    user, trainer, error, status = _require_report_writer()
    if error:
        return error, status
    try:
        student_uuid = _parse_uuid(student_id, "student_id")
        report_uuid = _parse_uuid(report_id, "report_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400
    report = db.session.get(StudentReport, report_uuid)
    if not report or report.deleted_at or report.student_id != student_uuid:
        return {"error": "Report not found"}, 404
    if trainer and report.trainer_id != trainer.id:
        return {"error": "Report not found"}, 404

    upload = request.files.get("file")
    if not upload or not upload.filename:
        return {"error": "Select a handwritten feedback image"}, 400
    safe_name = secure_filename(upload.filename)
    extension = safe_name.rsplit(".", 1)[-1].lower() if "." in safe_name else ""
    if extension not in REPORT_IMAGE_EXTENSIONS:
        return {"error": "Handwritten feedback must be a PNG, JPG, WEBP, HEIC, or HEIF image"}, 400
    os.makedirs(REPORT_UPLOAD_FOLDER, exist_ok=True)
    stored_name = f"{uuid.uuid4().hex}_{safe_name}"
    path = os.path.join(REPORT_UPLOAD_FOLDER, stored_name)
    upload.save(path)
    size = os.path.getsize(path)
    if size <= 0 or size > REPORT_IMAGE_MAX_BYTES:
        os.remove(path)
        return {"error": "Image must be between 1 byte and 10 MB"}, 413
    attachment = {
        "id": uuid.uuid4().hex,
        "kind": "handwritten_feedback",
        "file_name": safe_name,
        "file_url": f"/trainers/students/reports/media/{stored_name}",
        "file_size": size,
        "content_type": mimetypes.guess_type(safe_name)[0] or "application/octet-stream",
    }
    report.attachments = [*(report.attachments or []), attachment]
    db.session.commit()
    db.session.refresh(report)
    return _payload(report), 201


@bp.post("/<student_id>/reports/<report_id>/attachments")
def upload_report_attachment(student_id: str, report_id: str):
    user, error, status = get_current_user()
    if error:
        return error, status
    try:
        student_uuid = _parse_uuid(student_id, "student_id")
        report_uuid = _parse_uuid(report_id, "report_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    report = db.session.get(StudentReport, report_uuid)
    if (
        not report
        or report.deleted_at
        or report.student_id != student_uuid
        or report.report_type != "behaviour"
    ):
        return {"error": "Disciplinary record not found"}, 404

    trainer = (
        db.session.query(Trainer).filter(Trainer.user_id == user.id).first()
        if _is_trainer(user)
        else None
    )
    student_is_owner = bool(
        _is_student(user)
        and user.student
        and user.student.id == student_uuid
        and report.visibility == "student"
    )
    trainer_owns_report = bool(trainer and report.trainer_id == trainer.id)
    if not (_is_admin(user) or trainer_owns_report or student_is_owner):
        return {"error": "Disciplinary record not found"}, 404

    upload = request.files.get("file")
    if not upload or not upload.filename:
        return {"error": "Select a document to upload"}, 400
    safe_name = secure_filename(upload.filename)
    extension = safe_name.rsplit(".", 1)[-1].lower() if "." in safe_name else ""
    if extension not in REPORT_DOCUMENT_EXTENSIONS:
        return {
            "error": "Use PDF, DOC, DOCX, ODT, TXT, PNG, JPG, WEBP, HEIC, or HEIF"
        }, 400

    os.makedirs(REPORT_UPLOAD_FOLDER, exist_ok=True)
    stored_name = f"{uuid.uuid4().hex}_{safe_name}"
    path = os.path.join(REPORT_UPLOAD_FOLDER, stored_name)
    upload.save(path)
    size = os.path.getsize(path)
    if size <= 0 or size > REPORT_DOCUMENT_MAX_BYTES:
        os.remove(path)
        return {"error": "Document must be between 1 byte and 10 MB"}, 413

    attachment = {
        "id": uuid.uuid4().hex,
        "kind": "student_response" if student_is_owner else "supporting_document",
        "file_name": safe_name,
        "file_url": f"/trainers/students/reports/media/{stored_name}",
        "file_size": size,
        "content_type": mimetypes.guess_type(safe_name)[0] or "application/octet-stream",
        "uploaded_by_user_id": str(user.id),
        "uploaded_by_name": user.name,
        "uploaded_by_role": "student" if student_is_owner else ("admin" if _is_admin(user) else "trainer"),
        "uploaded_at": datetime.utcnow().isoformat(),
    }
    report.attachments = [*(report.attachments or []), attachment]
    db.session.commit()
    db.session.refresh(report)
    return _payload(report), 201


@bp.get("/reports/media/<path:filename>")
def serve_feedback_media(filename: str):
    user, error, status = get_current_user()
    if error:
        return error, status
    trainer = db.session.query(Trainer).filter(Trainer.user_id == user.id).first() if _is_trainer(user) else None
    safe_name = secure_filename(filename)
    if safe_name != filename:
        return {"error": "File not found"}, 404
    report = next(
        (
            item
            for item in db.session.query(StudentReport).filter(StudentReport.deleted_at.is_(None)).all()
            if any(
                attachment.get("file_url") == f"/trainers/students/reports/media/{filename}"
                for attachment in (item.attachments or [])
                if isinstance(attachment, dict)
            )
        ),
        None,
    )
    if (
        not report
        or (trainer and report.trainer_id != trainer.id)
        or (_is_student(user) and (not user.student or report.student_id != user.student.id or report.visibility != "student"))
        or not (_is_admin(user) or trainer or _is_student(user))
    ):
        return {"error": "File not found"}, 404
    return send_from_directory(REPORT_UPLOAD_FOLDER, filename, as_attachment=False)
