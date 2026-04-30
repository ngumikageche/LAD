from __future__ import annotations

import uuid

from flask import Blueprint, request
from sqlalchemy.exc import IntegrityError

from ..extensions import db
from ..models.notification import Notification
from ..models.user import User
from .permissions import log_view, require_permission


bp = Blueprint("notifications", __name__, url_prefix="/notifications")


def _parse_uuid(value: str | None, field: str) -> uuid.UUID:
    if not value:
        raise ValueError(f"Missing '{field}'")
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError) as exc:
        raise ValueError(f"Invalid '{field}'") from exc


def _notification_payload(notification: Notification) -> dict:
    return {
        "id": str(notification.id),
        "user_id": str(notification.user_id),
        "title": notification.title,
        "message": notification.message,
        "is_read": notification.is_read,
        "created_at": notification.created_at.isoformat() if notification.created_at else None,
    }


@bp.post("")
def create_notification():
    _, error, status = require_permission("notifications.create")
    if error:
        return error, status

    payload = request.get_json(silent=True) or {}
    title = payload.get("title")
    message = payload.get("message")

    if not title or not isinstance(title, str):
        return {"error": "'title' is required"}, 400
    if not message or not isinstance(message, str):
        return {"error": "'message' is required"}, 400

    try:
        user_id = _parse_uuid(payload.get("user_id"), "user_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    if not db.session.get(User, user_id):
        return {"error": "Invalid 'user_id'"}, 400

    notification = Notification(
        user_id=user_id,
        title=title.strip(),
        message=message.strip(),
        is_read=bool(payload.get("is_read", False)),
    )

    db.session.add(notification)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return {"error": "Unable to create notification"}, 409

    return _notification_payload(notification), 201


@bp.get("")
def list_notifications():
    user, error, status = require_permission("notifications.read")
    if error:
        return error, status

    target_user_id = request.args.get("user_id")
    query = db.session.query(Notification)
    if target_user_id:
        try:
            user_uuid = _parse_uuid(target_user_id, "user_id")
        except ValueError as exc:
            return {"error": str(exc)}, 400
        query = query.filter(Notification.user_id == user_uuid)

    notifications = query.order_by(Notification.created_at.desc()).all()
    log_view(user, "notifications", metadata={"scope": "list"})
    return [_notification_payload(notification) for notification in notifications], 200


@bp.get("/<notification_id>")
def get_notification(notification_id: str):
    user, error, status = require_permission("notifications.read")
    if error:
        return error, status

    try:
        notification_uuid = _parse_uuid(notification_id, "notification_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    notification = db.session.get(Notification, notification_uuid)
    if not notification:
        return {"error": "Notification not found"}, 404

    log_view(user, "notifications", entity_id=notification_id, metadata={"scope": "detail"})
    return _notification_payload(notification), 200


@bp.put("/<notification_id>")
def update_notification(notification_id: str):
    _, error, status = require_permission("notifications.update")
    if error:
        return error, status

    try:
        notification_uuid = _parse_uuid(notification_id, "notification_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    notification = db.session.get(Notification, notification_uuid)
    if not notification:
        return {"error": "Notification not found"}, 404

    payload = request.get_json(silent=True) or {}

    title = payload.get("title")
    if title is not None:
        if not isinstance(title, str) or not title.strip():
            return {"error": "'title' must be a non-empty string"}, 400
        notification.title = title.strip()

    message = payload.get("message")
    if message is not None:
        if not isinstance(message, str) or not message.strip():
            return {"error": "'message' must be a non-empty string"}, 400
        notification.message = message.strip()

    if "is_read" in payload:
        notification.is_read = bool(payload.get("is_read"))

    if "user_id" in payload:
        try:
            user_id = _parse_uuid(payload.get("user_id"), "user_id")
        except ValueError as exc:
            return {"error": str(exc)}, 400
        if not db.session.get(User, user_id):
            return {"error": "Invalid 'user_id'"}, 400
        notification.user_id = user_id

    db.session.commit()
    return _notification_payload(notification), 200


@bp.delete("/<notification_id>")
def delete_notification(notification_id: str):
    _, error, status = require_permission("notifications.delete")
    if error:
        return error, status

    try:
        notification_uuid = _parse_uuid(notification_id, "notification_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    notification = db.session.get(Notification, notification_uuid)
    if not notification:
        return {"error": "Notification not found"}, 404

    db.session.delete(notification)
    db.session.commit()
    return {"status": "deleted"}, 200
