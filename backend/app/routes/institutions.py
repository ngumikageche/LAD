from __future__ import annotations

import uuid

from flask import Blueprint, request
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError

from ..extensions import db
from ..models.institution import Institution
from ..services.scoping import (
    can_access_institution,
    can_view_master_data,
    scope_institutions,
)
from .permissions import log_view, require_permission


bp = Blueprint("institutions", __name__, url_prefix="/institutions")

# In-memory seed types — extended by types already in the DB
_SEED_TYPES: list[str] = [
    "University",
    "College",
    "TVET",
    "Secondary School",
    "Primary School",
    "Training Centre",
    "Polytechnic",
]


def _get_all_types(user=None) -> list[str]:
    query = db.session.query(Institution.type).distinct()
    if user is not None:
        query = scope_institutions(query, user)
    db_types = [row[0] for row in query.all() if row[0]]
    return sorted(dict.fromkeys(_SEED_TYPES + db_types))


def _get_all_locations(user=None) -> list[str]:
    query = db.session.query(Institution.location).distinct()
    if user is not None:
        query = scope_institutions(query, user)
    return sorted({row[0] for row in query.all() if row[0]})


def _parse_uuid(value: str | None, field: str) -> uuid.UUID:
    if not value:
        raise ValueError(f"Missing '{field}'")
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError) as exc:
        raise ValueError(f"Invalid '{field}'") from exc


def _institution_payload(institution: Institution) -> dict:
    return {
        "id": str(institution.id),
        "code": institution.code,
        "name": institution.name,
        "type": institution.type,
        "location": institution.location,
        "created_at": institution.created_at.isoformat() if institution.created_at else None,
    }


# ── Types endpoints (must be before /<institution_id>) ────────────────────────

@bp.get("/types")
def list_institution_types():
    user, error, status = require_permission("institutions.read")
    if error:
        return error, status
    return {"types": _get_all_types(user)}, 200


@bp.get("/filters")
def list_institution_filters():
    """Distinct values the Institutions screen offers as filter dropdowns."""
    user, error, status = require_permission("institutions.read")
    if error:
        return error, status
    return {
        "types": _get_all_types(user),
        "locations": _get_all_locations(user),
        "can_view_master_data": can_view_master_data(user),
    }, 200


@bp.post("/types")
def add_institution_type():
    user, error, status = require_permission("institutions.create")
    if error:
        return error, status
    payload = request.get_json(silent=True) or {}
    name = payload.get("name", "").strip()
    if not name:
        return {"error": "'name' is required"}, 400
    if name not in _SEED_TYPES:
        _SEED_TYPES.append(name)
    return {"types": _get_all_types(user)}, 201


@bp.delete("/types/<path:type_name>")
def delete_institution_type(type_name: str):
    user, error, status = require_permission("institutions.delete")
    if error:
        return error, status
    name = type_name.strip()
    in_use = db.session.query(Institution).filter(Institution.type == name).first()
    if in_use:
        return {"error": f"Type '{name}' is in use and cannot be deleted"}, 409
    if name in _SEED_TYPES:
        _SEED_TYPES.remove(name)
    return {"types": _get_all_types(user)}, 200


# ── Institution CRUD ──────────────────────────────────────────────────────────

@bp.post("")
def create_institution():
    _, error, status = require_permission("institutions.create")
    if error:
        return error, status
    payload = request.get_json(silent=True) or {}

    name = payload.get("name")
    institution_type = payload.get("type")
    location = payload.get("location")

    if not name or not isinstance(name, str):
        return {"error": "'name' is required"}, 400
    if not institution_type or not isinstance(institution_type, str):
        return {"error": "'type' is required"}, 400
    if not location or not isinstance(location, str):
        return {"error": "'location' is required"}, 400

    institution = Institution(
        name=name.strip(),
        type=institution_type.strip(),
        location=location.strip(),
    )
    db.session.add(institution)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return {"error": "Institution already exists"}, 409

    return _institution_payload(institution), 201


@bp.get("")
def list_institutions():
    user, error, status = require_permission("institutions.read")
    if error:
        return error, status

    query = scope_institutions(db.session.query(Institution), user)

    # Filters mirror the Courses and Subjects screens: an exact-match dropdown
    # per column plus a free-text search across the same columns.
    institution_type = (request.args.get("type") or "").strip()
    if institution_type:
        query = query.filter(Institution.type == institution_type)

    location = (request.args.get("location") or "").strip()
    if location:
        query = query.filter(Institution.location == location)

    search = (request.args.get("search") or "").strip()
    if search:
        pattern = f"%{search}%"
        query = query.filter(
            or_(
                Institution.name.ilike(pattern),
                Institution.code.ilike(pattern),
                Institution.type.ilike(pattern),
                Institution.location.ilike(pattern),
            )
        )

    institutions = query.order_by(Institution.name.asc()).all()
    log_view(
        user,
        "institutions",
        metadata={"scope": "list", "type": institution_type or None, "location": location or None},
    )
    return [_institution_payload(i) for i in institutions], 200


@bp.get("/<institution_id>")
def get_institution(institution_id: str):
    user, error, status = require_permission("institutions.read")
    if error:
        return error, status
    try:
        institution_uuid = _parse_uuid(institution_id, "institution_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    institution = db.session.get(Institution, institution_uuid)
    if not institution or not can_access_institution(user, institution.id):
        return {"error": "Institution not found"}, 404

    log_view(user, "institutions", entity_id=institution_id, metadata={"scope": "detail"})
    return _institution_payload(institution), 200


@bp.put("/<institution_id>")
def update_institution(institution_id: str):
    user, error, status = require_permission("institutions.update")
    if error:
        return error, status
    try:
        institution_uuid = _parse_uuid(institution_id, "institution_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    institution = db.session.get(Institution, institution_uuid)
    if not institution or not can_access_institution(user, institution.id):
        return {"error": "Institution not found"}, 404

    payload = request.get_json(silent=True) or {}
    name = payload.get("name")
    institution_type = payload.get("type")
    location = payload.get("location")

    if name is not None:
        if not isinstance(name, str) or not name.strip():
            return {"error": "'name' must be a non-empty string"}, 400
        institution.name = name.strip()

    if institution_type is not None:
        if not isinstance(institution_type, str) or not institution_type.strip():
            return {"error": "'type' must be a non-empty string"}, 400
        institution.type = institution_type.strip()

    if location is not None:
        if not isinstance(location, str) or not location.strip():
            return {"error": "'location' must be a non-empty string"}, 400
        institution.location = location.strip()

    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return {"error": "Institution already exists"}, 409

    return _institution_payload(institution), 200


@bp.delete("/<institution_id>")
def delete_institution(institution_id: str):
    user, error, status = require_permission("institutions.delete")
    if error:
        return error, status
    try:
        institution_uuid = _parse_uuid(institution_id, "institution_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    institution = db.session.get(Institution, institution_uuid)
    if not institution or not can_access_institution(user, institution.id):
        return {"error": "Institution not found"}, 404

    db.session.delete(institution)
    db.session.commit()
    return {"status": "deleted"}, 200
