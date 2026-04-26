from __future__ import annotations

from flask import Blueprint, request
from ..extensions import db
from ..models.student import Student
from ..models.user import User
from ..models.course import Course
from .permissions import require_permission


bp = Blueprint("admin_students", __name__, url_prefix="/api/v1/admin/students")


@bp.post("")
def create_student():
    user, error, status = require_permission("admin.students.create")
    if error:
        return error, status

    payload = request.get_json(silent=True) or {}
    user_id = payload.get("user_id")
    registration_number = payload.get("registration_number")
    course_id = payload.get("course_id")
    enrollment_year = payload.get("enrollment_year")

    if not user_id or not registration_number or not enrollment_year:
        return {"error": "user_id, registration_number and enrollment_year are required"}, 400

    u = db.session.get(User, user_id)
    if not u:
        return {"error": "User not found"}, 404

    s = Student(user_id=u.id, registration_number=registration_number, course_id=course_id, enrollment_year=enrollment_year)
    db.session.add(s)
    db.session.commit()
    return {"id": str(s.id), "user_id": str(s.user_id)}, 201


@bp.get("")
def list_students():
    user, error, status = require_permission("admin.students.read")
    if error:
        return error, status

    q = db.session.query(Student).filter(Student.deleted_at.is_(None))
    items = [{"id": str(s.id), "registration_number": s.registration_number, "course_id": str(s.course_id) if s.course_id else None} for s in q.all()]
    return {"total": len(items), "items": items}, 200


@bp.put("/<student_id>")
def update_student(student_id: str):
    user, error, status = require_permission("admin.students.update")
    if error:
        return error, status

    s = db.session.get(Student, student_id)
    if not s or s.deleted_at:
        return {"error": "Student not found"}, 404

    payload = request.get_json(silent=True) or {}
    for key in ("registration_number", "course_id", "enrollment_year"):
        if key in payload:
            setattr(s, key, payload.get(key))

    db.session.commit()
    return {"id": str(s.id)}, 200


@bp.delete("/<student_id>")
def delete_student(student_id: str):
    user, error, status = require_permission("admin.students.delete")
    if error:
        return error, status

    s = db.session.get(Student, student_id)
    if not s or s.deleted_at:
        return {"error": "Student not found"}, 404

    s.deleted_at = db.func.now()
    db.session.commit()
    return {"message": "Student deleted"}, 200
