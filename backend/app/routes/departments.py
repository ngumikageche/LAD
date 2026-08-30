from __future__ import annotations

import uuid

from flask import Blueprint, request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from ..extensions import db
from ..models.course import Course
from ..models.department import Department
from ..models.institution import Institution
from ..models.module import Module
from ..models.subject import Subject
from ..services.scoping import can_access_institution, scope_departments, scope_subjects
from .permissions import log_view, require_permission


bp = Blueprint("departments", __name__, url_prefix="/departments")


def _parse_uuid(value: str | None, field: str) -> uuid.UUID:
    if not value:
        raise ValueError(f"Missing '{field}'")
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError) as exc:
        raise ValueError(f"Invalid '{field}'") from exc


def _department_payload(department: Department) -> dict:
    return {
        "id": str(department.id),
        "code": department.code,
        "institution_id": str(department.institution_id),
        "name": department.name,
        "created_at": department.created_at.isoformat() if department.created_at else None,
    }


@bp.post("")
def create_department():
    user, error, status = require_permission("departments.create")
    if error:
        return error, status
    payload = request.get_json(silent=True) or {}

    name = payload.get("name")
    if not name or not isinstance(name, str):
        return {"error": "'name' is required"}, 400

    try:
        institution_id = _parse_uuid(payload.get("institution_id"), "institution_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    if not db.session.get(Institution, institution_id) or not can_access_institution(user, institution_id):
        return {"error": "Invalid 'institution_id'"}, 400

    department = Department(
        name=name.strip(),
        institution_id=institution_id,
    )

    db.session.add(department)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return {"error": "Department already exists"}, 409

    return _department_payload(department), 201


@bp.get("")
def list_departments():
    user, error, status = require_permission("departments.read")
    if error:
        return error, status

    query = scope_departments(db.session.query(Department), user).order_by(Department.name.asc())
    institution_id = request.args.get("institution_id")
    if institution_id:
        try:
            institution_uuid = _parse_uuid(institution_id, "institution_id")
        except ValueError as exc:
            return {"error": str(exc)}, 400
        query = query.filter(Department.institution_id == institution_uuid)

    departments = query.all()
    log_view(user, "departments", metadata={"scope": "list"})
    return [_department_payload(department) for department in departments], 200


@bp.get("/<department_id>")
def get_department(department_id: str):
    user, error, status = require_permission("departments.read")
    if error:
        return error, status
    try:
        department_uuid = _parse_uuid(department_id, "department_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    department = db.session.get(Department, department_uuid)
    if not department or not can_access_institution(user, department.institution_id):
        return {"error": "Department not found"}, 404

    log_view(user, "departments", entity_id=department_id, metadata={"scope": "detail"})
    return _department_payload(department), 200


@bp.get("/<department_id>/subjects")
def list_department_subjects(department_id: str):
    """
    Every subject taught under a department, with the course and module it sits
    in.

    A subject is three levels below a department — department → course → module
    → subject — so answering "what is actually taught here?" otherwise means
    opening three screens and joining them by eye. The rows come back through
    `scope_subjects`, so a trainer opening a department they teach in sees the
    subjects assigned to them rather than the department's whole catalogue.
    """
    user, error, status = require_permission("departments.read")
    if error:
        return error, status
    try:
        department_uuid = _parse_uuid(department_id, "department_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    department = db.session.get(Department, department_uuid)
    if not department or not can_access_institution(user, department.institution_id):
        return {"error": "Department not found"}, 404

    subjects = (
        scope_subjects(db.session.query(Subject), user)
        .join(Module, Module.id == Subject.module_id)
        # An inner join to Course is deliberate: `Module.course_id` is nullable,
        # and a module detached from a course belongs to no department at all,
        # so it cannot honestly be listed under this one.
        .join(Course, Course.id == Module.course_id)
        .filter(
            Course.department_id == department_uuid,
            Subject.deleted_at.is_(None),
            Module.deleted_at.is_(None),
            Course.deleted_at.is_(None),
        )
        .options(selectinload(Subject.module).selectinload(Module.course))
        .order_by(Course.name.asc(), Module.name.asc(), Subject.name.asc())
        .all()
    )

    log_view(
        user,
        "departments",
        entity_id=department_id,
        metadata={"scope": "subjects", "count": len(subjects)},
    )
    return {
        "department": {
            "id": str(department.id),
            "code": department.code,
            "name": department.name,
        },
        "subjects": [
            {
                "id": str(subject.id),
                "code": subject.code,
                "name": subject.name,
                "module_id": str(subject.module_id),
                "module_name": subject.module.name if subject.module else None,
                "course_id": str(subject.module.course.id) if subject.module and subject.module.course else None,
                "course_name": subject.module.course.name if subject.module and subject.module.course else None,
            }
            for subject in subjects
        ],
    }, 200


@bp.put("/<department_id>")
def update_department(department_id: str):
    user, error, status = require_permission("departments.update")
    if error:
        return error, status
    try:
        department_uuid = _parse_uuid(department_id, "department_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    department = db.session.get(Department, department_uuid)
    if not department or not can_access_institution(user, department.institution_id):
        return {"error": "Department not found"}, 404

    payload = request.get_json(silent=True) or {}

    name = payload.get("name")
    if name is not None:
        if not isinstance(name, str) or not name.strip():
            return {"error": "'name' must be a non-empty string"}, 400
        department.name = name.strip()

    if "institution_id" in payload:
        try:
            institution_id = _parse_uuid(payload.get("institution_id"), "institution_id")
        except ValueError as exc:
            return {"error": str(exc)}, 400
        if not db.session.get(Institution, institution_id) or not can_access_institution(user, institution_id):
            return {"error": "Invalid 'institution_id'"}, 400
        department.institution_id = institution_id

    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return {"error": "Department already exists"}, 409

    return _department_payload(department), 200


@bp.delete("/<department_id>")
def delete_department(department_id: str):
    user, error, status = require_permission("departments.delete")
    if error:
        return error, status
    try:
        department_uuid = _parse_uuid(department_id, "department_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    department = db.session.get(Department, department_uuid)
    if not department or not can_access_institution(user, department.institution_id):
        return {"error": "Department not found"}, 404

    db.session.delete(department)
    db.session.commit()
    return {"status": "deleted"}, 200
