from __future__ import annotations

from flask import Blueprint, request
from ..extensions import db
from ..models.institution import Institution
from ..models.user import User
from .permissions import require_permission


bp = Blueprint("admin_institutions", __name__, url_prefix="/api/v1/institutions")


@bp.post("")
def create_institution():
    user, error, status = require_permission("admin.institutions.create")
    if error:
        return error, status

    payload = request.get_json(silent=True) or {}
    name = payload.get("name")
    type_ = payload.get("type")
    location = payload.get("location")

    if not name or not type_ or not location:
        return {"error": "name, type and location are required"}, 400

    inst = Institution(name=name.strip(), type=type_.strip(), location=location.strip())
    db.session.add(inst)
    db.session.commit()
    return {"id": str(inst.id), "name": inst.name}, 201


@bp.get("")
def list_institutions():
    user, error, status = require_permission("admin.institutions.read")
    if error:
        return error, status

    q = db.session.query(Institution).filter(Institution.deleted_at.is_(None))
    items = [{"id": str(i.id), "name": i.name, "type": i.type, "location": i.location} for i in q.all()]
    return {"total": len(items), "items": items}, 200


@bp.put("/<inst_id>")
def update_institution(inst_id: str):
    user, error, status = require_permission("admin.institutions.update")
    if error:
        return error, status

    inst = db.session.get(Institution, inst_id)
    if not inst or inst.deleted_at:
        return {"error": "Institution not found"}, 404

    payload = request.get_json(silent=True) or {}
    for key in ("name", "type", "location"):
        if key in payload:
            setattr(inst, key if key != "type" else "type", payload.get(key))

    db.session.commit()
    return {"id": str(inst.id), "name": inst.name}, 200


@bp.delete("/<inst_id>")
def delete_institution(inst_id: str):
    user, error, status = require_permission("admin.institutions.delete")
    if error:
        return error, status

    inst = db.session.get(Institution, inst_id)
    if not inst or inst.deleted_at:
        return {"error": "Institution not found"}, 404

    inst.deleted_at = db.func.now()
    db.session.commit()
    return {"message": "Institution deleted"}, 200
