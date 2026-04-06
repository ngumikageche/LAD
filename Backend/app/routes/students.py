from __future__ import annotations

import uuid

from flask import Blueprint, request
from sqlalchemy.exc import IntegrityError

from ..extensions import db
from ..models.course import Course
from ..models.student import Student
from ..models.user import User
from .permissions import log_view, require_permission


bp = Blueprint("students", __name__, url_prefix="/students")


def _parse_uuid(value: str | None, field: str) -> uuid.UUID:
    if not value:
        raise ValueError(f"Missing '{field}'")
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError) as exc:
        raise ValueError(f"Invalid '{field}'") from exc


def _student_payload(student: Student) -> dict:
    return {
        "id": str(student.id),
        "user_id": str(student.user_id),
        "registration_number": student.registration_number,
        "course_id": str(student.course_id),
        "enrollment_year": student.enrollment_year,
        "user": {
            "id": str(student.user.id),
            "name": student.user.name,
            "email": student.user.email,
            "phone": student.user.phone,
            "role_id": str(student.user.role_id),
            "institution_id": str(student.user.institution_id) if student.user.institution_id else None,
        },
        "created_at": student.created_at.isoformat() if student.created_at else None,
    }


@bp.post("")
def create_student():
    _, error, status = require_permission("students.create")
    if error:
        return error, status
    payload = request.get_json(silent=True) or {}

    registration_number = payload.get("registration_number")
    enrollment_year = payload.get("enrollment_year")

    if not registration_number or not isinstance(registration_number, str):
        return {"error": "'registration_number' is required"}, 400
    if enrollment_year is None or not isinstance(enrollment_year, int):
        return {"error": "'enrollment_year' is required"}, 400

    try:
        user_id = _parse_uuid(payload.get("user_id"), "user_id")
        course_id = _parse_uuid(payload.get("course_id"), "course_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    if not db.session.get(User, user_id):
        return {"error": "Invalid 'user_id'"}, 400

    if not db.session.get(Course, course_id):
        return {"error": "Invalid 'course_id'"}, 400

    student = Student(
        user_id=user_id,
        registration_number=registration_number.strip(),
        course_id=course_id,
        enrollment_year=enrollment_year,
    )

    db.session.add(student)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return {"error": "Student already exists"}, 409

    db.session.refresh(student)
    return _student_payload(student), 201


@bp.get("")
def list_students():
    user, error, status = require_permission("students.read")
    if error:
        return error, status

    query = db.session.query(Student).order_by(Student.created_at.desc())
    course_id = request.args.get("course_id")
    if course_id:
        try:
            course_uuid = _parse_uuid(course_id, "course_id")
        except ValueError as exc:
            return {"error": str(exc)}, 400
        query = query.filter(Student.course_id == course_uuid)

    students = query.all()
    log_view(user, "students", metadata={"scope": "list"})
    return [_student_payload(student) for student in students], 200


@bp.get("/<student_id>")
def get_student(student_id: str):
    user, error, status = require_permission("students.read")
    if error:
        return error, status
    try:
        student_uuid = _parse_uuid(student_id, "student_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    student = db.session.get(Student, student_uuid)
    if not student:
        return {"error": "Student not found"}, 404

    log_view(user, "students", entity_id=student_id, metadata={"scope": "detail"})
    return _student_payload(student), 200


@bp.put("/<student_id>")
def update_student(student_id: str):
    _, error, status = require_permission("students.update")
    if error:
        return error, status
    try:
        student_uuid = _parse_uuid(student_id, "student_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    student = db.session.get(Student, student_uuid)
    if not student:
        return {"error": "Student not found"}, 404

    payload = request.get_json(silent=True) or {}

    registration_number = payload.get("registration_number")
    if registration_number is not None:
        if not isinstance(registration_number, str) or not registration_number.strip():
            return {"error": "'registration_number' must be a non-empty string"}, 400
        student.registration_number = registration_number.strip()

    if "enrollment_year" in payload:
        enrollment_year = payload.get("enrollment_year")
        if enrollment_year is None or not isinstance(enrollment_year, int):
            return {"error": "'enrollment_year' must be an integer"}, 400
        student.enrollment_year = enrollment_year

    if "user_id" in payload:
        try:
            user_id = _parse_uuid(payload.get("user_id"), "user_id")
        except ValueError as exc:
            return {"error": str(exc)}, 400
        if not db.session.get(User, user_id):
            return {"error": "Invalid 'user_id'"}, 400
        student.user_id = user_id

    if "course_id" in payload:
        try:
            course_id = _parse_uuid(payload.get("course_id"), "course_id")
        except ValueError as exc:
            return {"error": str(exc)}, 400
        if not db.session.get(Course, course_id):
            return {"error": "Invalid 'course_id'"}, 400
        student.course_id = course_id

    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return {"error": "Student already exists"}, 409

    db.session.refresh(student)
    return _student_payload(student), 200


@bp.delete("/<student_id>")
def delete_student(student_id: str):
    _, error, status = require_permission("students.delete")
    if error:
        return error, status
    try:
        student_uuid = _parse_uuid(student_id, "student_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    student = db.session.get(Student, student_uuid)
    if not student:
        return {"error": "Student not found"}, 404

    db.session.delete(student)
    db.session.commit()
    return {"status": "deleted"}, 200
