from __future__ import annotations

from flask import Blueprint, request
from ..extensions import db
from ..models.subject import Subject
from ..models.module import Module
from .permissions import require_permission


bp = Blueprint("admin_subjects", __name__, url_prefix="/api/v1/subjects")


@bp.post("")
def create_subject():
    user, error, status = require_permission("admin.subjects.create")
    if error:
        return error, status

    payload = request.get_json(silent=True) or {}
    name = payload.get("name")
    module_id = payload.get("module_id")
    description = payload.get("description")

    if not name or not module_id:
        return {"error": "name and module_id are required"}, 400

    mod = db.session.get(Module, module_id)
    if not mod:
        return {"error": "Invalid module_id"}, 400

    s = Subject(name=name.strip(), module_id=mod.id, description=description)
    db.session.add(s)
    db.session.commit()
    return {"id": str(s.id), "name": s.name}, 201


@bp.get("")
def list_subjects():
    user, error, status = require_permission("admin.subjects.read")
    if error:
        return error, status

    module_id = request.args.get("module_id")
    q = db.session.query(Subject).filter(Subject.deleted_at.is_(None))
    if module_id:
        q = q.filter(Subject.module_id == module_id)
    items = [{"id": str(s.id), "name": s.name, "module_id": str(s.module_id)} for s in q.all()]
    return {"total": len(items), "items": items}, 200


@bp.put("/<subject_id>")
def update_subject(subject_id: str):
    user, error, status = require_permission("admin.subjects.update")
    if error:
        return error, status

    s = db.session.get(Subject, subject_id)
    if not s or s.deleted_at:
        return {"error": "Subject not found"}, 404

    payload = request.get_json(silent=True) or {}
    for key in ("name", "description", "module_id"):
        if key in payload:
            setattr(s, key, payload.get(key))

    db.session.commit()
    return {"id": str(s.id), "name": s.name}, 200


@bp.delete("/<subject_id>")
def delete_subject(subject_id: str):
    user, error, status = require_permission("admin.subjects.delete")
    if error:
        return error, status

    s = db.session.get(Subject, subject_id)
    if not s or s.deleted_at:
        return {"error": "Subject not found"}, 404

    s.deleted_at = db.func.now()
    db.session.commit()
    return {"message": "Subject deleted"}, 200
