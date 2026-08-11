from __future__ import annotations

import logging
from functools import wraps
from typing import Any

from flask import current_app, g, has_request_context

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
    permissions = user.role.permissions if user.role and user.role.permissions else {}
    return role_name.lower() in {"admin", "super admin"} or permissions.get("*") is True


def admin_required(permission_key: str | None = None):
    """
    Guard an administrative endpoint.

    Admins always pass. When a `permission_key` is supplied, any other role that
    has been explicitly granted that key passes too — that is what lets a
    trainer or manager be given an admin screen from the Roles page without
    being made an admin. A bare `admin_required()` has no key to grant, so it
    stays admin-only.
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            user, error, status = get_current_user()
            if error:
                return error, status
            if not _is_admin(user):
                if not permission_key or not _has_permission(user, permission_key):
                    return {"error": "Admin access required"}, 403
            elif permission_key and not _has_permission(user, permission_key):
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


AUDIT_QUEUE_KEY = "_pending_audit_events"


def log_view(user: User | None, entity: str, entity_id: str | None = None, metadata: dict[str, Any] | None = None) -> None:
    """
    Queue an audit event to be written once, after the response is built.

    This used to open its own engine connection and commit a transaction inline,
    on every read — a second connection checkout and round trip that the caller
    waited for before their list could be returned. Events are now batched into
    a single insert in an `after_request` hook, so a handler that logs three
    times still costs one write, and it happens off the response path.

    The separate connection is kept (rather than the request's session) so an
    audit write can never commit or poison the caller's own transaction.
    """
    if user is None:
        current_app.logger.warning("Skipped audit event %s because no user was supplied", entity)
        return

    action = str((metadata or {}).get("action") or "read")
    event = {
        "action": f"{entity}.{action}",
        "user_id": user.id,
        "meta_data": {
            "entity": entity,
            "entity_id": entity_id,
            "metadata": metadata or {},
        },
    }

    # Only a request has an `after_request` hook to flush the queue. `g` also
    # exists in a bare application context (a script, a shell, a job), where
    # queueing would mean the event is never written at all — so those write
    # straight through.
    if has_request_context():
        g.setdefault(AUDIT_QUEUE_KEY, []).append(event)
    else:
        flush_audit_events([event])


def flush_audit_events(events: list[dict] | None = None) -> None:
    """Write queued audit events as one insert. Never raises into the caller."""
    if events is None:
        events = g.pop(AUDIT_QUEUE_KEY, None) if has_request_context() else None
    if not events:
        return
    try:
        with db.engine.begin() as connection:
            connection.execute(SystemLog.__table__.insert(), events)
    except Exception:
        # An audit write must never surface as a failed request, and this can
        # run without an application context (a management script), where
        # `current_app` is itself unavailable.
        try:
            current_app.logger.exception("Unable to write %d audit event(s)", len(events))
        except RuntimeError:
            logging.getLogger(__name__).exception("Unable to write %d audit event(s)", len(events))
