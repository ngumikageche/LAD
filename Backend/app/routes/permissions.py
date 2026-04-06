from __future__ import annotations

from typing import Any

from ..extensions import db
from ..models.system_log import SystemLog
from ..models.user import User
from .auth import _get_bearer_token, _verify_token


def get_current_user():
    token = _get_bearer_token()
    if not token:
        return None, {"error": "Missing bearer token"}, 401

    user = _verify_token(token)
    if not user:
        return None, {"error": "Invalid or expired token"}, 401

    return user, None, None


def _has_permission(user: User, key: str) -> bool:
    if not user.role:
        return False
    permissions = user.role.permissions or {}
    if permissions.get("*") is True:
        return True
    if user.role.role_name == "Admin":
        return True
    return permissions.get(key) is True


def require_permission(key: str):
    user, error, status = get_current_user()
    if error:
        return None, error, status
    if not _has_permission(user, key):
        return None, {"error": "Permission denied"}, 403
    return user, None, None


def log_view(user: User, entity: str, entity_id: str | None = None, metadata: dict[str, Any] | None = None) -> None:
    payload = {
        "entity": entity,
        "entity_id": entity_id,
        "metadata": metadata or {},
    }
    log = SystemLog(action=f"{entity}.read", user_id=user.id, meta_data=payload)
    db.session.add(log)
    db.session.commit()
