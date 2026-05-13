from __future__ import annotations

import os
import uuid
from datetime import datetime

from flask import Blueprint, current_app, request
from werkzeug.utils import secure_filename

from ..extensions import db
from ..models.document import Document
from ..models.enrollment import Enrollment
from ..models.module import Module
from ..models.notification import Notification
from ..models.student import Student
from .permissions import require_permission

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
        "created_at": doc.created_at.isoformat() if doc.created_at else None,
    }


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

    doc = Document(
        title=title,
        description=description,
        file_name=safe_name,
        file_url=file_url,
        file_type=ext,
        file_size=file_size,
        uploaded_by=user.id,
    )
    db.session.add(doc)
    db.session.commit()
    return _payload(doc), 201


# ── Serve file ────────────────────────────────────────────────────────────────

@bp.get("/files/<path:filename>")
def serve_file(filename: str):
    from flask import send_from_directory
    return send_from_directory(os.path.abspath(UPLOAD_FOLDER), filename)


# ── List ──────────────────────────────────────────────────────────────────────

@bp.get("")
def list_documents():
    _, error, status = require_permission("documents.read")
    if error:
        return error, status

    docs = (
        db.session.query(Document)
        .filter(Document.deleted_at.is_(None))
        .order_by(Document.created_at.desc())
        .all()
    )
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

    # soft-delete
    doc.deleted_at = datetime.utcnow()
    db.session.commit()
    return {"message": "Document deleted"}, 200


# ── Send to module students ───────────────────────────────────────────────────

@bp.post("/<doc_id>/send")
def send_to_module(doc_id: str):
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
    module_id_str = payload.get("module_id", "")
    try:
        module_uuid = uuid.UUID(module_id_str)
    except (ValueError, TypeError):
        return {"error": "'module_id' is required and must be a valid UUID"}, 400

    module = db.session.get(Module, module_uuid)
    if not module:
        return {"error": "Module not found"}, 404

    # Find all active enrollments for this module
    enrollments = (
        db.session.query(Enrollment)
        .filter(
            Enrollment.module_id == module_uuid,
            Enrollment.deleted_at.is_(None),
        )
        .all()
    )

    if not enrollments:
        return {"error": "No students enrolled in this module"}, 404

    sent = 0
    for enr in enrollments:
        student = db.session.get(Student, enr.student_id)
        if not student or not student.user_id:
            continue
        notif = Notification(
            user_id=student.user_id,
            title=f"New Document: {doc.title}",
            message=(
                f"A new document '{doc.title}' has been shared with your module "
                f"'{module.name}'. Download: {request.host_url.rstrip('/')}{doc.file_url}"
            ),
            is_read=False,
        )
        db.session.add(notif)
        sent += 1

    db.session.commit()
    return {"message": f"Document sent to {sent} student(s) in module '{module.name}'"}, 200


# ── Modules list (helper for frontend picker) ─────────────────────────────────

@bp.get("/modules")
def list_modules_for_send():
    _, error, status = require_permission("documents.read")
    if error:
        return error, status

    modules = (
        db.session.query(Module)
        .filter(Module.deleted_at.is_(None))
        .order_by(Module.name.asc())
        .all()
    )
    return [
        {
            "id": str(m.id),
            "name": m.name,
            "course_name": m.course.name if m.course else None,
        }
        for m in modules
    ], 200
