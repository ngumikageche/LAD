from __future__ import annotations

from functools import wraps
from typing import Any

from flask import g

from ..extensions import db
from ..models.system_log import SystemLog
from ..models.trainer import Trainer
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


def _is_trainer(user: User) -> bool:
    role_name = (user.role.role_name if user.role else "") or ""
    return role_name.lower() == "trainer" or user.trainer is not None


def trainer_required(permission_key: str | None = None):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            user, error, status = get_current_user()
            if error:
                return error, status
            if not _is_trainer(user):
                return {"error": "Trainer access required"}, 403
            has_trainer_role = (user.role.role_name if user.role else "").lower() == "trainer"
            if permission_key and not _has_permission(user, permission_key) and not has_trainer_role:
                return {"error": "Permission denied"}, 403

            trainer = db.session.query(Trainer).filter(Trainer.user_id == user.id).first()
            if not trainer:
                return {"error": "Trainer profile not found"}, 404

            g.current_user = user
            g.current_trainer = trainer
            return func(*args, **kwargs)

        return wrapper

    return decorator


def trainer_or_admin_required(permission_key: str | None = None):
    """
    Allows access to trainers and admins only.
    Students are explicitly blocked regardless of permissions.
    When a trainer calls the endpoint, g.current_trainer is set.
    When an admin calls it, g.current_trainer is None.
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            user, error, status = get_current_user()
            if error:
                return error, status

            # Hard block: students can never access session management
            if _is_student(user) and not _is_trainer(user) and not _is_admin(user):
                return {"error": "Access denied: students cannot manage attendance sessions"}, 403

            is_admin = _is_admin(user)
            is_trainer = _is_trainer(user)

            if not is_admin and not is_trainer:
                return {"error": "Trainer or admin access required"}, 403

            # Permission check — admins always pass (wildcard), trainers need the key
            if permission_key and not _has_permission(user, permission_key):
                return {"error": "Permission denied"}, 403

            g.current_user = user
            g.current_trainer = None

            if is_trainer:
                trainer = db.session.query(Trainer).filter(Trainer.user_id == user.id).first()
                if not trainer and not is_admin:
                    return {"error": "Trainer profile not found"}, 404
                g.current_trainer = trainer

            return func(*args, **kwargs)

        return wrapper

    return decorator


def _is_admin(user: User) -> bool:
    role_name = (user.role.role_name if user.role else "") or ""
    return role_name.lower() == "admin" or (user.role and user.role.permissions.get("*") is True)


def admin_required(permission_key: str | None = None):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            user, error, status = get_current_user()
            if error:
                return error, status
            if not _is_admin(user):
                return {"error": "Admin access required"}, 403
            if permission_key and not _has_permission(user, permission_key):
                return {"error": "Permission denied"}, 403

            g.current_user = user
            return func(*args, **kwargs)

        return wrapper

    return decorator


def _is_student(user: User) -> bool:
    role_name = (user.role.role_name if user.role else "") or ""
    return role_name.lower() == "student" or user.student is not None


def student_required(permission_key: str | None = None):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            user, error, status = get_current_user()
            if error:
                return error, status
            if not _is_student(user):
                return {"error": "Student access required"}, 403
            has_student_role = (user.role.role_name if user.role else "").lower() == "student"
            if permission_key and not _has_permission(user, permission_key) and not has_student_role:
                return {"error": "Permission denied"}, 403

            student = user.student
            if not student:
                return {"error": "Student profile not found"}, 404

            g.current_user = user
            g.current_student = student
            return func(*args, **kwargs)

        return wrapper

    return decorator


def log_view(user: User, entity: str, entity_id: str | None = None, metadata: dict[str, Any] | None = None) -> None:
    payload = {
        "entity": entity,
        "entity_id": entity_id,
        "metadata": metadata or {},
    }
    log = SystemLog(action=f"{entity}.read", user_id=user.id, meta_data=payload)
    db.session.add(log)
    db.session.commit()
