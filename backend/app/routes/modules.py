from __future__ import annotations

import uuid

from flask import Blueprint, request
from sqlalchemy.exc import IntegrityError

from ..extensions import db
from ..models.module import Module
from ..models.course import Course
from ..models.subject import Subject
from ..models.competency import Competency
from ..models.dashboard_metric import DashboardMetric
from ..models.enrollment import Enrollment
from ..models.student_subject import StudentSubject
from ..services.scoping import scope_courses, scope_modules
from .permissions import log_view, require_permission

bp = Blueprint("modules", __name__, url_prefix="/modules")

def _parse_uuid(value: str | None, field: str) -> uuid.UUID:
    if not value:
        raise ValueError(f"Missing '{field}'")
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError) as exc:
        raise ValueError(f"Invalid '{field}'") from exc

def _integrity_message(exc: IntegrityError) -> str:
    """Turn a database integrity error into something a user can act on."""
    detail = str(getattr(exc, "orig", exc))
    lowered = detail.lower()
    if "modules_code_key" in lowered or "modules_name" in lowered:
        return "A module with that code or name already exists"
    if "unique" in lowered or "duplicate key" in lowered:
        return "A module with those details already exists"
    if "not-null" in lowered or "null value" in lowered:
        return "Module is missing required related data"
    if "foreign key" in lowered:
        return "Module references a record that does not exist"
    return "Module could not be saved due to a data conflict"


def _module_payload(module: Module) -> dict:
    return {
        "id": str(module.id),
        "code": module.code,
        "course_id": str(module.course_id),
        "name": module.name,
        "description": module.description,
        "created_at": module.created_at.isoformat() if module.created_at else None,
    }

def _module_in_scope(user, module_uuid) -> Module | None:
    return scope_modules(db.session.query(Module), user).filter(Module.id == module_uuid).first()


@bp.post("")
def create_module():
    user, error, status = require_permission("modules.create")
    if error:
        return error, status
    payload = request.get_json(silent=True) or {}

    name = payload.get("name")
    course_id = payload.get("course_id")
    description = payload.get("description")

    if not name or not isinstance(name, str):
        return {"error": "'name' is required"}, 400
    if not course_id or not isinstance(course_id, str):
        return {"error": "'course_id' is required"}, 400
    try:
        course_uuid = _parse_uuid(course_id, "course_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400
    if not scope_courses(db.session.query(Course), user).filter(Course.id == course_uuid).first():
        return {"error": "Invalid 'course_id'"}, 400

    module = Module(
        name=name.strip(),
        course_id=course_uuid,
        description=description.strip() if description else None,
    )
    db.session.add(module)
    try:
        db.session.commit()
    except IntegrityError as exc:
        db.session.rollback()
        return {"error": _integrity_message(exc)}, 409
    return _module_payload(module), 201

@bp.get("")
def list_modules():
    user, error, status = require_permission("modules.read")
    if error:
        return error, status
    query = scope_modules(db.session.query(Module), user).order_by(Module.name.asc())
    course_id = request.args.get("course_id")
    if course_id:
        try:
            course_uuid = _parse_uuid(course_id, "course_id")
        except ValueError as exc:
            return {"error": str(exc)}, 400
        query = query.filter(Module.course_id == course_uuid)
    modules = query.all()
    log_view(user, "modules", metadata={"scope": "list"})
    return [_module_payload(module) for module in modules], 200

@bp.get("/<module_id>")
def get_module(module_id: str):
    user, error, status = require_permission("modules.read")
    if error:
        return error, status
    try:
        module_uuid = _parse_uuid(module_id, "module_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400
    module = _module_in_scope(user, module_uuid)
    if not module:
        return {"error": "Module not found"}, 404
    log_view(user, "modules", entity_id=module_id, metadata={"scope": "detail"})
    return _module_payload(module), 200


@bp.get("/<module_id>/competencies")
def get_module_competencies(module_id: str):
    user, error, status = require_permission("modules.read")
    if error:
        return error, status
    try:
        module_uuid = _parse_uuid(module_id, "module_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400
    if not _module_in_scope(user, module_uuid):
        return {"error": "Module not found"}, 404
    competencies = db.session.query(Competency).filter(Competency.module_id == module_uuid).order_by(Competency.name.asc()).all()
    result = [{"id": str(c.id), "name": c.name, "description": c.description} for c in competencies]
    log_view(user, "modules.competencies", entity_id=module_id, metadata={"count": len(result)})
    return {"competencies": result}, 200

@bp.put("/<module_id>")
def update_module(module_id: str):
    user, error, status = require_permission("modules.update")
    if error:
        return error, status
    try:
        module_uuid = _parse_uuid(module_id, "module_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400
    module = _module_in_scope(user, module_uuid)
    if not module:
        return {"error": "Module not found"}, 404
    payload = request.get_json(silent=True) or {}
    name = payload.get("name")
    description = payload.get("description")
    if name is not None:
        if not isinstance(name, str) or not name.strip():
            return {"error": "'name' must be a non-empty string"}, 400
        module.name = name.strip()
    if description is not None:
        if description and (not isinstance(description, str) or not description.strip()):
            return {"error": "'description' must be a string"}, 400
        module.description = description.strip() if description else None
    try:
        db.session.commit()
    except IntegrityError as exc:
        db.session.rollback()
        return {"error": _integrity_message(exc)}, 409
    return _module_payload(module), 200

@bp.delete("/<module_id>")
def delete_module(module_id: str):
    user, error, status = require_permission("modules.delete")
    if error:
        return error, status
    try:
        module_uuid = _parse_uuid(module_id, "module_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400
    module = _module_in_scope(user, module_uuid)
    if not module:
        return {"error": "Module not found"}, 404
    # Subjects and dashboard metrics require a module; SQLAlchemy would otherwise
    # try to NULL their module_id on delete and hit a not-null violation.
    subject_count = db.session.query(Subject.id).filter(Subject.module_id == module_uuid).count()
    metric_count = (
        db.session.query(DashboardMetric.id).filter(DashboardMetric.module_id == module_uuid).count()
    )
    if subject_count or metric_count:
        return {
            "error": "Module has dependent records and cannot be deleted",
            "subjects": subject_count,
            "dashboard_metrics": metric_count,
        }, 409
    try:
        db.session.delete(module)
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return {"error": "Module has dependent records and cannot be deleted"}, 409
    return {"status": "deleted"}, 200

@bp.post("/<module_id>/sync-subjects")
def sync_subjects_to_students(module_id: str):
    user, error, status = require_permission("modules.update")
    if error:
        return error, status
    try:
        module_uuid = _parse_uuid(module_id, "module_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400
    module = _module_in_scope(user, module_uuid)
    if not module:
        return {"error": "Module not found"}, 404

    # Get all subjects under this module
    subjects = db.session.query(Subject).filter(Subject.module_id == module_uuid).all()
    if not subjects:
        return {"error": "No subjects found for this module."}, 404

    # Get all enrollments for this module
    enrollments = db.session.query(Enrollment).filter(Enrollment.module_id == module_uuid).all()
    if not enrollments:
        return {"error": "No students enrolled in this module."}, 404

    subject_ids = {str(s.id) for s in subjects}
    student_ids = {str(e.student_id) for e in enrollments}

    # Find existing assignments to avoid duplicates
    existing = db.session.query(StudentSubject.student_id, StudentSubject.subject_id).filter(
        StudentSubject.student_id.in_(student_ids),
        StudentSubject.subject_id.in_(subject_ids)
    ).all()
    existing_pairs = {(str(sid), str(subid)) for sid, subid in existing}

    # Assign subjects to students if not already assigned
    new_links = []
    for student_id in student_ids:
        for subject in subjects:
            if (student_id, str(subject.id)) not in existing_pairs:
                new_links.append(StudentSubject(student_id=student_id, subject_id=subject.id))
    if new_links:
        db.session.add_all(new_links)
        db.session.commit()
    return {"status": "success", "assigned": len(new_links)}, 200
