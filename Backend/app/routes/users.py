from __future__ import annotations

import uuid
from datetime import datetime

from flask import Blueprint, request
from sqlalchemy.exc import IntegrityError

from ..extensions import db
from ..models.institution import Institution
from ..models.role_permission import RolePermission
from ..models.user import User
from .permissions import log_view, require_permission


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


def _user_payload(user: User) -> dict:
    return {
        "id": str(user.id),
        "name": user.name,
        "email": user.email,
        "phone": user.phone,
        "role_id": str(user.role_id),
        "role_name": user.role.role_name if user.role else None,
        "institution_id": str(user.institution_id) if user.institution_id else None,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "disabled_at": user.deleted_at.isoformat() if user.deleted_at else None,
    }


@bp.post("")
def create_user():
    _, error, status = require_permission("users.create")
    if error:
        return error, status

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

    return _user_payload(user), 201


@bp.get("")
def list_users():
    user, error, status = require_permission("users.read")
    if error:
        return error, status

    include_deleted = request.args.get("include_deleted") == "1"
    query = db.session.query(User)
    if not include_deleted:
        query = query.filter(User.deleted_at.is_(None))
    users = query.order_by(User.created_at.desc()).all()
    log_view(user, "users", metadata={"scope": "list"})
    return [_user_payload(user) for user in users], 200


@bp.get("/<user_id>")
def get_user(user_id: str):
    user, error, status = require_permission("users.read")
    if error:
        return error, status

    try:
        user_uuid = _parse_uuid(user_id, "user_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    user = db.session.get(User, user_uuid)
    if not user:
        return {"error": "User not found"}, 404

    log_view(user, "users", entity_id=user_id, metadata={"scope": "detail"})
    return _user_payload(user), 200


@bp.put("/<user_id>")
def update_user(user_id: str):
    _, error, status = require_permission("users.update")
    if error:
        return error, status

    try:
        user_uuid = _parse_uuid(user_id, "user_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    user = db.session.get(User, user_uuid)
    if not user:
        return {"error": "User not found"}, 404

    payload = request.get_json(silent=True) or {}

    name = payload.get("name")
    if name is not None:
        if not isinstance(name, str) or not name.strip():
            return {"error": "'name' must be a non-empty string"}, 400
        user.name = name.strip()

    email = payload.get("email")
    if email is not None:
        if not isinstance(email, str) or not email.strip():
            return {"error": "'email' must be a non-empty string"}, 400
        user.email = email.strip().lower()

    phone = payload.get("phone")
    if phone is not None:
        if not isinstance(phone, str) or not phone.strip():
            user.phone = None
        else:
            user.phone = phone.strip()

    if "role_id" in payload:
        try:
            role_id = _parse_uuid(payload.get("role_id"), "role_id")
        except ValueError as exc:
            return {"error": str(exc)}, 400
        if not db.session.get(RolePermission, role_id):
            return {"error": "Invalid 'role_id'"}, 400
        user.role_id = role_id

    if "institution_id" in payload:
        try:
            institution_id = _parse_optional_uuid(payload.get("institution_id"), "institution_id")
        except ValueError as exc:
            return {"error": str(exc)}, 400
        if institution_id is not None and not db.session.get(Institution, institution_id):
            return {"error": "Invalid 'institution_id'"}, 400
        user.institution_id = institution_id

    password = payload.get("password")
    if password is not None:
        if not isinstance(password, str) or not password:
            return {"error": "'password' must be a non-empty string"}, 400
        from werkzeug.security import generate_password_hash

        user.password_hash = generate_password_hash(password)

    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return {"error": "User already exists (email/phone may be taken)"}, 409

    return _user_payload(user), 200


@bp.delete("/<user_id>")
def delete_user(user_id: str):
    _, error, status = require_permission("users.delete")
    if error:
        return error, status

    try:
        user_uuid = _parse_uuid(user_id, "user_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    user = db.session.get(User, user_uuid)
    if not user:
        return {"error": "User not found"}, 404

    db.session.delete(user)
    db.session.commit()
    return {"status": "deleted"}, 200


@bp.put("/<user_id>/disable")
def disable_user(user_id: str):
    _, error, status = require_permission("users.update")
    if error:
        return error, status

    try:
        user_uuid = _parse_uuid(user_id, "user_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    user = db.session.get(User, user_uuid)
    if not user:
        return {"error": "User not found"}, 404

    user.deleted_at = datetime.utcnow()
    db.session.commit()
    return _user_payload(user), 200
