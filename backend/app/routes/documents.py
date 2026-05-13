from __future__ import annotations

import os
import uuid
from datetime import datetime

from flask import Blueprint, current_app, g, request
from sqlalchemy import and_
from werkzeug.utils import secure_filename

from ..extensions import db
from ..models.document import Document
from ..models.notification import Notification
from ..models.student import Student
from ..models.student_subject import StudentSubject
from ..models.subject import Subject
from ..models.trainer_subject import TrainerSubject
from ..models.user import User
from .permissions import (
    get_current_user,
    _is_trainer,
    _is_admin,
    _is_student,
    trainer_required,
    admin_required,
    require_permission,
)

bp = Blueprint("documents", __name__, url_prefix="/documents")

ALLOWED_EXTENSIONS = {
    "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
    "txt", "csv", "png", "jpg", "jpeg", "gif", "zip",
}

UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), "..", "..", "uploads")


def _allowed(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def _payload(doc: Document) -> dict:
    return {
        "id": str(doc.id),
        "title": doc.title,
        "description": doc.description,
        "file_name": doc.file_name,
        "file_url": doc.file_url,
        "file_type": doc.file_type,
        "file_size": doc.file_size,
        "uploaded_by": str(doc.uploaded_by) if doc.uploaded_by else None,
        "uploader_name": doc.uploader.name if doc.uploader else None,
        "subject_id": str(doc.subject_id) if doc.subject_id else None,
        "subject_name": doc.subject.name if doc.subject else None,
        "created_at": doc.created_at.isoformat() if doc.created_at else None,
    }


def _notify_students(student_user_ids: list, doc: Document, subject_name: str | None) -> int:
    """Create notifications for a list of user IDs. Returns count sent."""
    host = request.host_url.rstrip("/")
    sent = 0
    for uid in student_user_ids:
        notif = Notification(
            user_id=uid,
            title=f"New Document: {doc.title}",
            message=(
                f"A new document '{doc.title}' has been shared with you"
                + (f" for {subject_name}" if subject_name else "")
                + f". Download: {host}{doc.file_url}"
            ),
            is_read=False,
        )
        db.session.add(notif)
        sent += 1
    return sent


def _students_for_subject(subject_id) -> list:
    """Return user_ids of all students assigned to a subject."""
    rows = (
        db.session.query(Student.user_id)
        .join(StudentSubject, StudentSubject.student_id == Student.id)
        .filter(
            StudentSubject.subject_id == subject_id,
            Student.user_id.isnot(None),
        )
        .all()
    )
    return [r.user_id for r in rows]


def _all_student_user_ids() -> list:
    """Return user_ids of every student on the system."""
    rows = db.session.query(Student.user_id).filter(Student.user_id.isnot(None)).all()
    return [r.user_id for r in rows]


# ── Upload ────────────────────────────────────────────────────────────────────

@bp.post("")
def upload_document():
    user, error, status = require_permission("documents.create")
    if error:
        return error, status

    title = request.form.get("title", "").strip()
    description = request.form.get("description", "").strip() or None

    if not title:
        return {"error": "'title' is required"}, 400

    file = request.files.get("file")
    if not file or not file.filename:
        return {"error": "No file provided"}, 400

    if not _allowed(file.filename):
        return {"error": f"File type not allowed. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}"}, 400

    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    safe_name = secure_filename(file.filename)
    unique_name = f"{uuid.uuid4().hex}_{safe_name}"
    save_path = os.path.join(UPLOAD_FOLDER, unique_name)
    file.save(save_path)

    file_size = os.path.getsize(save_path)
    ext = safe_name.rsplit(".", 1)[-1].lower() if "." in safe_name else None
    file_url = f"/documents/files/{unique_name}"

    # Determine subject scope from form data
    subject_id_str = request.form.get("subject_id", "").strip()
    subject_uuid = None
    subject_name = None
    if subject_id_str:
        try:
            subject_uuid = uuid.UUID(subject_id_str)
            subj = db.session.get(Subject, subject_uuid)
            subject_name = subj.name if subj else None
        except ValueError:
            return {"error": "Invalid subject_id"}, 400

    doc = Document(
        title=title,
        description=description,
        file_name=safe_name,
        file_url=file_url,
        file_type=ext,
        file_size=file_size,
        uploaded_by=user.id,
        subject_id=subject_uuid,
    )
    db.session.add(doc)
    db.session.flush()  # get doc.id before notifications

    sent = 0

    if _is_trainer(user):
        # Trainer: auto-send to students of the given subject (must be one they teach)
        if subject_uuid:
            trainer = user.trainer
            if trainer:
                # Verify trainer teaches this subject
                teaches = db.session.query(TrainerSubject).filter(
                    and_(
                        TrainerSubject.trainer_id == trainer.id,
                        TrainerSubject.subject_id == subject_uuid,
                    )
                ).first()
                if not teaches:
                    db.session.rollback()
                    return {"error": "You are not assigned to that subject"}, 403
            user_ids = _students_for_subject(subject_uuid)
            sent = _notify_students(user_ids, doc, subject_name)

    elif _is_admin(user):
        # Admin: send based on explicit target field
        target = request.form.get("target", "").strip()  # "subject", "everyone", or ""
        if target == "everyone":
            user_ids = _all_student_user_ids()
            sent = _notify_students(user_ids, doc, None)
        elif target == "subject" and subject_uuid:
            user_ids = _students_for_subject(subject_uuid)
            sent = _notify_students(user_ids, doc, subject_name)
        # target == "" means no auto-send; admin can use /send later

    db.session.commit()
    return {**_payload(doc), "notifications_sent": sent}, 201


# ── Serve file ────────────────────────────────────────────────────────────────

@bp.get("/files/<path:filename>")
def serve_file(filename: str):
    from flask import send_from_directory
    return send_from_directory(os.path.abspath(UPLOAD_FOLDER), filename)


# ── List ──────────────────────────────────────────────────────────────────────

@bp.get("")
def list_documents():
    user, error, status = require_permission("documents.read")
    if error:
        return error, status

    query = db.session.query(Document).filter(Document.deleted_at.is_(None))

    # Trainers only see documents they uploaded or for their subjects
    if _is_trainer(user) and not _is_admin(user):
        trainer = user.trainer
        if trainer:
            subject_ids = [
                row.subject_id
                for row in db.session.query(TrainerSubject.subject_id)
                .filter(TrainerSubject.trainer_id == trainer.id)
                .all()
            ]
            query = query.filter(
                db.or_(
                    Document.uploaded_by == user.id,
                    Document.subject_id.in_(subject_ids) if subject_ids else db.false(),
                )
            )

    docs = query.order_by(Document.created_at.desc()).all()
    return [_payload(d) for d in docs], 200


# ── Delete ────────────────────────────────────────────────────────────────────

@bp.delete("/<doc_id>")
def delete_document(doc_id: str):
    _, error, status = require_permission("documents.delete")
    if error:
        return error, status

    try:
        uid = uuid.UUID(doc_id)
    except ValueError:
        return {"error": "Invalid document id"}, 400

    doc = db.session.get(Document, uid)
    if not doc or doc.deleted_at:
        return {"error": "Document not found"}, 404

    doc.deleted_at = datetime.utcnow()
    db.session.commit()
    return {"message": "Document deleted"}, 200


# ── Send (admin re-send / manual send) ───────────────────────────────────────

@bp.post("/<doc_id>/send")
def send_document(doc_id: str):
    """
    Admin: send an existing document to a subject's students or everyone.
    Trainer: send to their own subject's students.
    """
    user, error, status = require_permission("documents.create")
    if error:
        return error, status

    try:
        uid = uuid.UUID(doc_id)
    except ValueError:
        return {"error": "Invalid document id"}, 400

    doc = db.session.get(Document, uid)
    if not doc or doc.deleted_at:
        return {"error": "Document not found"}, 404

    payload = request.get_json(silent=True) or {}
    target = payload.get("target", "subject")  # "subject" | "everyone"
    subject_id_str = payload.get("subject_id", "")

    subject_uuid = None
    subject_name = None
    if subject_id_str:
        try:
            subject_uuid = uuid.UUID(subject_id_str)
            subj = db.session.get(Subject, subject_uuid)
            subject_name = subj.name if subj else None
        except ValueError:
            return {"error": "Invalid subject_id"}, 400

    if _is_admin(user):
        if target == "everyone":
            user_ids = _all_student_user_ids()
        elif subject_uuid:
            user_ids = _students_for_subject(subject_uuid)
        else:
            return {"error": "Provide subject_id or set target='everyone'"}, 400
    elif _is_trainer(user):
        if not subject_uuid:
            return {"error": "subject_id required"}, 400
        trainer = user.trainer
        if trainer:
            teaches = db.session.query(TrainerSubject).filter(
                and_(
                    TrainerSubject.trainer_id == trainer.id,
                    TrainerSubject.subject_id == subject_uuid,
                )
            ).first()
            if not teaches:
                return {"error": "You are not assigned to that subject"}, 403
        user_ids = _students_for_subject(subject_uuid)
    else:
        return {"error": "Not authorised"}, 403

    if not user_ids:
        return {"error": "No students found for the selected target"}, 404

    sent = _notify_students(user_ids, doc, subject_name)
    db.session.commit()
    return {"message": f"Document sent to {sent} student(s)", "sent": sent}, 200


# ── Subjects list (for frontend picker) ──────────────────────────────────────

@bp.get("/subjects")
def list_subjects_for_send():
    """
    Trainers get only their assigned subjects.
    Admins get all subjects.
    """
    user, error, status = require_permission("documents.read")
    if error:
        return error, status

    if _is_trainer(user) and not _is_admin(user):
        trainer = user.trainer
        if not trainer:
            return [], 200
        rows = (
            db.session.query(Subject)
            .join(TrainerSubject, TrainerSubject.subject_id == Subject.id)
            .filter(TrainerSubject.trainer_id == trainer.id)
            .order_by(Subject.name.asc())
            .all()
        )
    else:
        rows = db.session.query(Subject).order_by(Subject.name.asc()).all()

    return [
        {
            "id": str(s.id),
            "name": s.name,
            "module_name": s.module.name if s.module else None,
            "course_name": s.module.course.name if s.module and s.module.course else None,
        }
        for s in rows
    ], 200
