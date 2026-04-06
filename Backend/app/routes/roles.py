from __future__ import annotations

import uuid

from flask import Blueprint, request
from sqlalchemy.exc import IntegrityError

from ..extensions import db
from ..models.role_permission import RolePermission
from .permissions import log_view, require_permission


bp = Blueprint("roles", __name__, url_prefix="/roles")


@bp.post("")
def create_role():
    _, error, status = require_permission("roles.create")
    if error:
        return error, status
    payload = request.get_json(silent=True) or {}

    role_name = payload.get("role_name")
    permissions = payload.get("permissions", {})

    if not role_name or not isinstance(role_name, str):
        return {"error": "'role_name' is required"}, 400

    role_name = role_name.strip()
    if not role_name:
        return {"error": "'role_name' is required"}, 400

    if permissions is None:
        permissions = {}
    if not isinstance(permissions, dict):
        return {"error": "'permissions' must be an object"}, 400

    role = RolePermission(role_name=role_name, permissions=permissions)

    db.session.add(role)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return {"error": "Role already exists"}, 409

    return {
        "id": str(role.id),
        "role_name": role.role_name,
        "permissions": role.permissions,
        "created_at": role.created_at.isoformat() if role.created_at else None,
    }, 201


@bp.get("")
def list_roles():
    user, error, status = require_permission("roles.read")
    if error:
        return error, status

    roles = db.session.query(RolePermission).order_by(RolePermission.role_name.asc()).all()
    log_view(user, "roles", metadata={"scope": "list"})
    return [
        {
            "id": str(role.id),
            "role_name": role.role_name,
            "permissions": role.permissions,
            "created_at": role.created_at.isoformat() if role.created_at else None,
        }
        for role in roles
    ], 200


@bp.get("/<role_id>")
def get_role(role_id: str):
    user, error, status = require_permission("roles.read")
    if error:
        return error, status
    try:
        role_uuid = uuid.UUID(str(role_id))
    except (ValueError, TypeError):
        return {"error": "Invalid 'role_id'"}, 400

    role = db.session.get(RolePermission, role_uuid)
    if not role:
        return {"error": "Role not found"}, 404

    log_view(user, "roles", entity_id=role_id, metadata={"scope": "detail"})
    return {
        "id": str(role.id),
        "role_name": role.role_name,
        "permissions": role.permissions,
        "created_at": role.created_at.isoformat() if role.created_at else None,
    }, 200


@bp.put("/<role_id>")
def update_role(role_id: str):
    _, error, status = require_permission("roles.update")
    if error:
        return error, status
    try:
        role_uuid = uuid.UUID(str(role_id))
    except (ValueError, TypeError):
        return {"error": "Invalid 'role_id'"}, 400

    role = db.session.get(RolePermission, role_uuid)
    if not role:
        return {"error": "Role not found"}, 404

    payload = request.get_json(silent=True) or {}

    role_name = payload.get("role_name")
    if role_name is not None:
        if not isinstance(role_name, str) or not role_name.strip():
            return {"error": "'role_name' must be a non-empty string"}, 400
        role.role_name = role_name.strip()

    permissions = payload.get("permissions")
    if permissions is not None:
        if not isinstance(permissions, dict):
            return {"error": "'permissions' must be an object"}, 400
        role.permissions = permissions

    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return {"error": "Role already exists"}, 409

    return {
        "id": str(role.id),
        "role_name": role.role_name,
        "permissions": role.permissions,
        "created_at": role.created_at.isoformat() if role.created_at else None,
    }, 200
