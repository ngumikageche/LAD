from __future__ import annotations

import uuid

from flask import Blueprint, request
from sqlalchemy.exc import IntegrityError

from ..extensions import db
from ..models.institution import Institution
from ..models.role_permission import RolePermission
from ..models.user import User


bp = Blueprint("users", __name__, url_prefix="/users")


def _parse_uuid(value: str | None, field: str) -> uuid.UUID:
    if not value:
        raise ValueError(f"Missing '{field}'")
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError) as exc:
        raise ValueError(f"Invalid '{field}'") from exc


def _parse_optional_uuid(value: str | None, field: str) -> uuid.UUID | None:
    if value is None or value == "":
        return None
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError) as exc:
        raise ValueError(f"Invalid '{field}'") from exc


@bp.post("")
def create_user():
    payload = request.get_json(silent=True) or {}

    name = payload.get("name")
    email = payload.get("email")
    phone = payload.get("phone")
    password = payload.get("password")

    if not name or not isinstance(name, str):
        return {"error": "'name' is required"}, 400
    if not email or not isinstance(email, str):
        return {"error": "'email' is required"}, 400
    if not password or not isinstance(password, str):
        return {"error": "'password' is required"}, 400

    try:
        role_id = _parse_uuid(payload.get("role_id"), "role_id")
        institution_id = _parse_optional_uuid(payload.get("institution_id"), "institution_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    if not db.session.get(RolePermission, role_id):
        return {"error": "Invalid 'role_id'"}, 400

    if institution_id is not None and not db.session.get(Institution, institution_id):
        return {"error": "Invalid 'institution_id'"}, 400

    # Werkzeug is part of Flask; good default for password hashing.
    from werkzeug.security import generate_password_hash

    user = User(
        name=name.strip(),
        email=email.strip().lower(),
        phone=phone.strip() if isinstance(phone, str) and phone.strip() else None,
        password_hash=generate_password_hash(password),
        role_id=role_id,
        institution_id=institution_id,
    )

    db.session.add(user)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return {"error": "User already exists (email/phone may be taken)"}, 409

    return {
        "id": str(user.id),
        "name": user.name,
        "email": user.email,
        "phone": user.phone,
        "role_id": str(user.role_id),
        "institution_id": str(user.institution_id) if user.institution_id else None,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }, 201
