from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import uuid
from datetime import datetime
from pathlib import Path

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


# Types a browser renders natively, and types we can turn into one that it does.
NATIVELY_VIEWABLE = {"pdf", "png", "jpg", "jpeg", "gif", "txt", "csv"}
CONVERTIBLE_TO_PDF = {"doc", "docx", "odt", "xls", "xlsx", "ppt", "pptx", "rtf"}
PREVIEW_CACHE_FOLDER = os.path.join(UPLOAD_FOLDER, "_previews")
CONVERT_TIMEOUT_SECONDS = 60


def _soffice() -> str | None:
    """LibreOffice, if this host has it. Preview degrades gracefully without it."""
    return shutil.which("soffice") or shutil.which("libreoffice")


def _render_pdf_preview(stored_name: str) -> str | None:
    """
    A PDF rendition of an office document, cached beside the upload.

    Returns the cached file name, or None when the host cannot convert. A
    trainer should be able to read a Word handout in the browser rather than
    downloading it, and the only reliable way to do that across formats is to
    render it to PDF first.
    """
    source = os.path.join(os.path.abspath(UPLOAD_FOLDER), stored_name)
    if not os.path.exists(source):
        return None

    cached_name = f"{os.path.splitext(stored_name)[0]}.pdf"
    cached_path = os.path.join(PREVIEW_CACHE_FOLDER, cached_name)
    if os.path.exists(cached_path) and os.path.getmtime(cached_path) >= os.path.getmtime(source):
        return cached_name

    binary = _soffice()
    if not binary:
        return None

    os.makedirs(PREVIEW_CACHE_FOLDER, exist_ok=True)
    # LibreOffice refuses to run twice against one user profile, so two people
    # previewing at the same moment would abort each other. Give each run its
    # own throwaway profile.
    profile_dir = tempfile.mkdtemp(prefix="lad-soffice-")
    try:
        subprocess.run(
            [
                binary,
                f"-env:UserInstallation={Path(profile_dir).as_uri()}",
                "--headless", "--norestore", "--nolockcheck", "--nodefault",
                "--convert-to", "pdf", "--outdir", PREVIEW_CACHE_FOLDER, source,
            ],
            check=True,
            capture_output=True,
            timeout=CONVERT_TIMEOUT_SECONDS,
        )
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError):
        current_app.logger.exception("Could not render a preview for %s", stored_name)
        return None
    finally:
        shutil.rmtree(profile_dir, ignore_errors=True)

    return cached_name if os.path.exists(cached_path) else None


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


def _can_access_document(user: User, doc: Document) -> bool:
    if _is_admin(user) or doc.uploaded_by == user.id:
        return True
    if _is_trainer(user) and user.trainer:
        return (
            doc.subject_id is not None
            and db.session.query(TrainerSubject.id).filter(
                TrainerSubject.trainer_id == user.trainer.id,
                TrainerSubject.subject_id == doc.subject_id,
            ).first() is not None
        )
    if _is_student(user) and user.student:
        if doc.subject_id is None:
            return True
        return db.session.query(StudentSubject.id).filter(
            StudentSubject.student_id == user.student.id,
            StudentSubject.subject_id == doc.subject_id,
        ).first() is not None
    return False


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

    # Determine subject scope from form data
    subject_id_str = request.form.get("subject_id", "").strip()
    subject_uuid = None
    subject_name = None
    if subject_id_str:
        try:
            subject_uuid = uuid.UUID(subject_id_str)
            subj = db.session.get(Subject, subject_uuid)
            if not subj or subj.deleted_at:
                return {"error": "Subject not found"}, 404
            subject_name = subj.name
        except ValueError:
            return {"error": "Invalid subject_id"}, 400

    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    safe_name = secure_filename(file.filename)
    unique_name = f"{uuid.uuid4().hex}_{safe_name}"
    save_path = os.path.join(UPLOAD_FOLDER, unique_name)
    file.save(save_path)

    file_size = os.path.getsize(save_path)
    ext = safe_name.rsplit(".", 1)[-1].lower() if "." in safe_name else None
    file_url = f"/documents/files/{unique_name}"

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
                    if os.path.exists(save_path):
                        os.remove(save_path)
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

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        if os.path.exists(save_path):
            os.remove(save_path)
        current_app.logger.exception("Document upload transaction failed")
        return {"error": "Document could not be saved"}, 409
    return {**_payload(doc), "notifications_sent": sent}, 201


# ── Serve file ────────────────────────────────────────────────────────────────

@bp.get("/files/<path:filename>")
def serve_file(filename: str):
    """
    Serve a document inline by default so it can be read in a viewer without
    being saved to disk first. `?download=1` asks for the attachment
    disposition instead, which is the only case that should force a save.
    """
    from flask import send_from_directory
    user, error, status = get_current_user()
    if error:
        return error, status
    doc = db.session.query(Document).filter(
        Document.file_url == f"/documents/files/{filename}",
        Document.deleted_at.is_(None),
    ).first()
    if not doc or not _can_access_document(user, doc):
        return {"error": "File not found"}, 404

    as_attachment = (request.args.get("download") or "").lower() in {"1", "true", "yes"}
    response = send_from_directory(
        os.path.abspath(UPLOAD_FOLDER),
        filename,
        as_attachment=as_attachment,
        download_name=doc.file_name or filename,
    )
    if not as_attachment:
        # Browsers otherwise guess from the stored name, which carries a random
        # prefix and can push a readable PDF into a download.
        response.headers["Content-Disposition"] = f'inline; filename="{doc.file_name or filename}"'
        response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@bp.get("/<doc_id>/preview")
def preview_document(doc_id: str):
    """
    A viewable rendition of a document.

    Natively viewable types stream as they are; office formats are rendered to
    PDF so they can be read in the browser instead of being downloaded first.
    Answers 415 when this host cannot render the format, which is the signal the
    dashboard uses to fall back to a download button.
    """
    from flask import send_from_directory

    user, error, status = get_current_user()
    if error:
        return error, status

    try:
        uid = uuid.UUID(doc_id)
    except ValueError:
        return {"error": "Invalid document id"}, 400

    doc = db.session.get(Document, uid)
    if not doc or doc.deleted_at or not _can_access_document(user, doc):
        return {"error": "Document not found"}, 404

    stored_name = (doc.file_url or "").rsplit("/", 1)[-1]
    if not stored_name or secure_filename(stored_name) != stored_name:
        return {"error": "Document not found"}, 404

    file_type = (doc.file_type or "").lower()

    if file_type in NATIVELY_VIEWABLE:
        response = send_from_directory(os.path.abspath(UPLOAD_FOLDER), stored_name)
        response.headers["Content-Disposition"] = f'inline; filename="{doc.file_name or stored_name}"'
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    if file_type in CONVERTIBLE_TO_PDF:
        rendered = _render_pdf_preview(stored_name)
        if not rendered:
            return {
                "error": "This document cannot be previewed on this server",
                "reason": "conversion_unavailable",
            }, 415
        response = send_from_directory(PREVIEW_CACHE_FOLDER, rendered)
        response.headers["Content-Type"] = "application/pdf"
        preview_name = f"{os.path.splitext(doc.file_name or stored_name)[0]}.pdf"
        response.headers["Content-Disposition"] = f'inline; filename="{preview_name}"'
        return response

    return {"error": "This file type cannot be previewed", "reason": "unsupported_type"}, 415


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


# ── Send to single student ────────────────────────────────────────────────────

@bp.post("/<doc_id>/send-student")
def send_document_to_student(doc_id: str):
    """Send a document to a single student by code (STU001) or registration_number."""
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
    key = str(payload.get("student_id", "")).strip()
    if not key:
        return {"error": "student_id (code or registration_number) is required"}, 400

    student = (
        db.session.query(Student).filter_by(code=key).first()
        or db.session.query(Student).filter_by(registration_number=key).first()
    )
    if not student:
        return {"error": f"Student '{key}' not found"}, 404
    if not student.user_id:
        return {"error": "Student has no linked user account"}, 400

    subject_name = doc.subject.name if doc.subject_id and doc.subject else None
    sent = _notify_students([student.user_id], doc, subject_name)
    db.session.commit()
    student_name = student.user.name if student.user else key
    return {"message": f"Document sent to {student_name}", "sent": sent}, 200


# ── Students search (for single-student send picker) ──────────────────────────

@bp.get("/students")
def search_students():
    """Search students by name, code, or registration_number."""
    user, error, status = require_permission("documents.create")
    if error:
        return error, status

    from sqlalchemy import or_
    from ..models.user import User as UserModel
    q = request.args.get("q", "").strip()
    query = db.session.query(Student).join(UserModel, UserModel.id == Student.user_id)
    if q:
        query = query.filter(
            or_(
                Student.code.ilike(f"%{q}%"),
                Student.registration_number.ilike(f"%{q}%"),
                UserModel.name.ilike(f"%{q}%"),
            )
        )
    rows = query.order_by(UserModel.name.asc()).limit(20).all()
    return [
        {
            "id": str(s.id),
            "code": s.code,
            "registration_number": s.registration_number,
            "name": s.user.name if s.user else None,
        }
        for s in rows
    ], 200


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
