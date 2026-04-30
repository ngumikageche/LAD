from __future__ import annotations

from flask import Blueprint, request
from ..extensions import db
from ..models.course import Course
from ..models.department import Department
from .permissions import require_permission


bp = Blueprint("admin_courses", __name__, url_prefix="/api/v1/courses")


@bp.post("")
def create_course():
    user, error, status = require_permission("admin.courses.create")
    if error:
        return error, status

    payload = request.get_json(silent=True) or {}
    name = payload.get("name")
    department_id = payload.get("department_id")
    cbet_level = payload.get("cbet_level")

    if not name or not cbet_level:
        return {"error": "name and cbet_level are required"}, 400

    if department_id:
        dept = db.session.get(Department, department_id)
        if not dept:
            return {"error": "Invalid department_id"}, 400
        department_id = dept.id

    c = Course(name=name.strip(), department_id=department_id, cbet_level=cbet_level)
    db.session.add(c)
    db.session.commit()
    return {"id": str(c.id), "name": c.name}, 201


@bp.get("")
def list_courses():
    user, error, status = require_permission("admin.courses.read")
    if error:
        return error, status

    department_id = request.args.get("department_id")
    q = db.session.query(Course).filter(Course.deleted_at.is_(None))
    if department_id:
        q = q.filter(Course.department_id == department_id)
    items = [{"id": str(c.id), "name": c.name, "department_id": str(c.department_id) if c.department_id else None} for c in q.all()]
    return {"total": len(items), "items": items}, 200


@bp.put("/<course_id>")
def update_course(course_id: str):
    user, error, status = require_permission("admin.courses.update")
    if error:
        return error, status

    c = db.session.get(Course, course_id)
    if not c or c.deleted_at:
        return {"error": "Course not found"}, 404

    payload = request.get_json(silent=True) or {}
    for key in ("name", "cbet_level", "department_id"):
        if key in payload:
            setattr(c, key, payload.get(key))

    db.session.commit()
    return {"id": str(c.id), "name": c.name}, 200


@bp.delete("/<course_id>")
def delete_course(course_id: str):
    user, error, status = require_permission("admin.courses.delete")
    if error:
        return error, status

    c = db.session.get(Course, course_id)
    if not c or c.deleted_at:
        return {"error": "Course not found"}, 404

    c.deleted_at = db.func.now()
    db.session.commit()
    return {"message": "Course deleted"}, 200
