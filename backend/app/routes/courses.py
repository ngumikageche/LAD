from __future__ import annotations

import uuid

from flask import Blueprint, request
from sqlalchemy.exc import IntegrityError

from ..extensions import db
from ..models.course import Course
from ..models.department import Department
from .permissions import log_view, require_permission


bp = Blueprint("courses", __name__, url_prefix="/courses")


def _parse_uuid(value: str | None, field: str) -> uuid.UUID:
    if not value:
        raise ValueError(f"Missing '{field}'")
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError) as exc:
        raise ValueError(f"Invalid '{field}'") from exc


def _course_payload(course: Course) -> dict:
    return {
        "id": str(course.id),
        "code": course.code,
        "department_id": str(course.department_id),
        "name": course.name,
        "cbet_level": course.cbet_level,
        "created_at": course.created_at.isoformat() if course.created_at else None,
    }


@bp.post("")
def create_course():
    _, error, status = require_permission("courses.create")
    if error:
        return error, status
    payload = request.get_json(silent=True) or {}

    name = payload.get("name")
    cbet_level = payload.get("cbet_level")

    if not name or not isinstance(name, str):
        return {"error": "'name' is required"}, 400
    if not cbet_level or not isinstance(cbet_level, str):
        return {"error": "'cbet_level' is required"}, 400

    try:
        department_id = _parse_uuid(payload.get("department_id"), "department_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    if not db.session.get(Department, department_id):
        return {"error": "Invalid 'department_id'"}, 400

    course = Course(
        name=name.strip(),
        cbet_level=cbet_level.strip(),
        department_id=department_id,
    )

    db.session.add(course)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return {"error": "Course already exists"}, 409

    return _course_payload(course), 201


@bp.get("")
def list_courses():
    user, error, status = require_permission("courses.read")
    if error:
        return error, status

    query = db.session.query(Course).order_by(Course.name.asc())
    department_id = request.args.get("department_id")
    if department_id:
        try:
            department_uuid = _parse_uuid(department_id, "department_id")
        except ValueError as exc:
            return {"error": str(exc)}, 400
        query = query.filter(Course.department_id == department_uuid)

    courses = query.all()
    log_view(user, "courses", metadata={"scope": "list"})
    return [_course_payload(course) for course in courses], 200


@bp.get("/<course_id>")
def get_course(course_id: str):
    user, error, status = require_permission("courses.read")
    if error:
        return error, status
    try:
        course_uuid = _parse_uuid(course_id, "course_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    course = db.session.get(Course, course_uuid)
    if not course:
        return {"error": "Course not found"}, 404

    log_view(user, "courses", entity_id=course_id, metadata={"scope": "detail"})
    return _course_payload(course), 200


@bp.put("/<course_id>")
def update_course(course_id: str):
    _, error, status = require_permission("courses.update")
    if error:
        return error, status
    try:
        course_uuid = _parse_uuid(course_id, "course_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    course = db.session.get(Course, course_uuid)
    if not course:
        return {"error": "Course not found"}, 404

    payload = request.get_json(silent=True) or {}

    name = payload.get("name")
    if name is not None:
        if not isinstance(name, str) or not name.strip():
            return {"error": "'name' must be a non-empty string"}, 400
        course.name = name.strip()

    cbet_level = payload.get("cbet_level")
    if cbet_level is not None:
        if not isinstance(cbet_level, str) or not cbet_level.strip():
            return {"error": "'cbet_level' must be a non-empty string"}, 400
        course.cbet_level = cbet_level.strip()

    if "department_id" in payload:
        try:
            department_id = _parse_uuid(payload.get("department_id"), "department_id")
        except ValueError as exc:
            return {"error": str(exc)}, 400
        if not db.session.get(Department, department_id):
            return {"error": "Invalid 'department_id'"}, 400
        course.department_id = department_id

    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return {"error": "Course already exists"}, 409

    return _course_payload(course), 200


@bp.delete("/<course_id>")
def delete_course(course_id: str):
    _, error, status = require_permission("courses.delete")
    if error:
        return error, status
    try:
        course_uuid = _parse_uuid(course_id, "course_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    course = db.session.get(Course, course_uuid)
    if not course:
        return {"error": "Course not found"}, 404

    db.session.delete(course)
    db.session.commit()
    return {"status": "deleted"}, 200
