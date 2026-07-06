from __future__ import annotations

import uuid

from flask import Blueprint, request
from sqlalchemy import exists

from ..extensions import db
from ..models.notification import Notification
from ..models.student import Student
from ..models.student_report import StudentReport
from ..models.student_subject import StudentSubject
from ..models.subject import Subject
from ..models.trainer import Trainer
from ..models.trainer_subject import TrainerSubject
from .permissions import _has_permission, _is_admin, _is_trainer, get_current_user


bp = Blueprint("student_reports", __name__, url_prefix="/trainers/students")
ALLOWED_DELIVERY_CHANNELS = {"system", "email", "sms"}


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
        return ["system"]
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
                "status": "ready" if "email" in delivery_channels and recipient_email else "disabled" if "email" not in delivery_channels else "missing_email",
            },
            "sms": {
                "enabled": "sms" in delivery_channels,
                "recipient": recipient_phone,
                "status": "ready" if "sms" in delivery_channels and recipient_phone else "disabled" if "sms" not in delivery_channels else "missing_phone",
            },
        },
    }, 201
