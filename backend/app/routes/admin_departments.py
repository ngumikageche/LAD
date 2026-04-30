from __future__ import annotations

from flask import Blueprint, request
from ..extensions import db
from ..models.department import Department
from ..models.institution import Institution
from .permissions import require_permission


bp = Blueprint("admin_departments", __name__, url_prefix="/api/v1/departments")


@bp.post("")
def create_department():
    user, error, status = require_permission("admin.departments.create")
    if error:
        return error, status

    payload = request.get_json(silent=True) or {}
    name = payload.get("name")
    institution_id = payload.get("institution_id")
    if not name or not institution_id:
        return {"error": "name and institution_id are required"}, 400

    inst = db.session.get(Institution, institution_id)
    if not inst:
        return {"error": "Invalid institution_id"}, 400

    d = Department(name=name.strip(), institution_id=inst.id)
    db.session.add(d)
    db.session.commit()
    return {"id": str(d.id), "name": d.name}, 201


@bp.get("")
def list_departments():
    user, error, status = require_permission("admin.departments.read")
    if error:
        return error, status

    institution_id = request.args.get("institution_id")
    q = db.session.query(Department).filter(Department.deleted_at.is_(None))
    if institution_id:
        q = q.filter(Department.institution_id == institution_id)
    items = [{"id": str(d.id), "name": d.name, "institution_id": str(d.institution_id)} for d in q.all()]
    return {"total": len(items), "items": items}, 200


@bp.put("/<dept_id>")
def update_department(dept_id: str):
    user, error, status = require_permission("admin.departments.update")
    if error:
        return error, status

    d = db.session.get(Department, dept_id)
    if not d or d.deleted_at:
        return {"error": "Department not found"}, 404

    payload = request.get_json(silent=True) or {}
    if "name" in payload:
        d.name = payload.get("name")
    if "institution_id" in payload:
        inst = db.session.get(Institution, payload.get("institution_id"))
        if not inst:
            return {"error": "Invalid institution_id"}, 400
        d.institution_id = inst.id

    db.session.commit()
    return {"id": str(d.id), "name": d.name}, 200


@bp.delete("/<dept_id>")
def delete_department(dept_id: str):
    user, error, status = require_permission("admin.departments.delete")
    if error:
        return error, status

    d = db.session.get(Department, dept_id)
    if not d or d.deleted_at:
        return {"error": "Department not found"}, 404

    d.deleted_at = db.func.now()
    db.session.commit()
    return {"message": "Department deleted"}, 200
