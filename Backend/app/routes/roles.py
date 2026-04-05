from __future__ import annotations

from flask import Blueprint, request
from sqlalchemy.exc import IntegrityError

from ..extensions import db
from ..models.role_permission import RolePermission


bp = Blueprint("roles", __name__, url_prefix="/roles")


@bp.post("")
def create_role():
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
