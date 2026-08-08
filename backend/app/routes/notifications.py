from __future__ import annotations

import uuid

from flask import Blueprint, request
from sqlalchemy import distinct, func
from sqlalchemy.exc import IntegrityError

from ..extensions import db
from ..models.course import Course
from ..models.module import Module
from ..models.notification import Notification
from ..models.role_permission import RolePermission
from ..models.student import Student
from ..models.student_subject import StudentSubject
from ..services.communications import send_email, send_sms
from ..models.subject import Subject
from ..models.user import User
from .permissions import _is_admin, log_view, require_permission


bp = Blueprint("notifications", __name__, url_prefix="/notifications")
ALLOWED_DELIVERY_CHANNELS = {"system", "email", "sms"}
DEFAULT_PAGE_SIZE = 10
MAX_PAGE_SIZE = 100
PAGE_SIZE_OPTIONS = [10, 25, 50, 100]
TRUTHY = {"1", "true", "yes", "on"}


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


def _parse_pagination() -> tuple[int, int]:
    try:
        page = max(int(request.args.get("page", 1)), 1)
        per_page = int(request.args.get("per_page", DEFAULT_PAGE_SIZE))
    except (TypeError, ValueError) as exc:
        raise ValueError("'page' and 'per_page' must be integers") from exc
    return page, min(max(per_page, 1), MAX_PAGE_SIZE)


def _scoped_notification_query(user: User, target_user_id: str | None):
    """Notifications the actor may see: their own, or anyone's when admin."""
    query = db.session.query(Notification).filter(Notification.deleted_at.is_(None))
    if not _is_admin(user):
        return query.filter(Notification.user_id == user.id)
    if target_user_id:
        return query.filter(Notification.user_id == _parse_uuid(target_user_id, "user_id"))
    return query


def _recipient_payload(user: User) -> dict:
    return {
        "id": str(user.id),
        "name": user.name,
        "email": user.email,
        "phone": user.phone,
        "role_name": user.role.role_name if user.role else None,
    }


def _normalize_delivery_channels(payload: dict) -> list[str]:
    raw_channels = payload.get("delivery_channels")
    if raw_channels is None:
        return ["system", "email"]
    if not isinstance(raw_channels, list):
        raise ValueError("'delivery_channels' must be an array")

    channels: list[str] = []
    for item in raw_channels:
        if not isinstance(item, str):
            raise ValueError("'delivery_channels' entries must be strings")
        value = item.strip().lower()
        if value not in ALLOWED_DELIVERY_CHANNELS:
            raise ValueError("Invalid delivery channel")
        if value not in channels:
            channels.append(value)

    if not channels:
        raise ValueError("Select at least one delivery channel")
    return channels


def _bulk_recipient_query(filters: dict, actor: User):
    target = filters.get("target", "all")
    query = db.session.query(User).filter(User.deleted_at.is_(None))
    if actor.institution_id is not None:
        query = query.filter(User.institution_id == actor.institution_id)

    if target == "all":
        return query

    if target == "role":
        role_name = filters.get("role_name")
        if not role_name or not isinstance(role_name, str):
            raise ValueError("'role_name' is required for role targeting")
        return query.join(RolePermission).filter(RolePermission.role_name == role_name.strip())

    if target in {"course", "module", "subject", "year"}:
        query = query.join(Student, Student.user_id == User.id)

    if target == "course":
        course_id = _parse_uuid(filters.get("course_id"), "course_id")
        if not db.session.get(Course, course_id):
            raise ValueError("Invalid 'course_id'")
        return query.filter(Student.course_id == course_id)

    if target == "module":
        module_id = _parse_uuid(filters.get("module_id"), "module_id")
        if not db.session.get(Module, module_id):
            raise ValueError("Invalid 'module_id'")
        subject_ids = db.session.query(Subject.id).filter(Subject.module_id == module_id)
        student_ids = db.session.query(distinct(StudentSubject.student_id)).filter(StudentSubject.subject_id.in_(subject_ids))
        return query.filter(Student.id.in_(student_ids))

    if target == "subject":
        subject_id = _parse_uuid(filters.get("subject_id"), "subject_id")
        if not db.session.get(Subject, subject_id):
            raise ValueError("Invalid 'subject_id'")
        student_ids = db.session.query(distinct(StudentSubject.student_id)).filter(StudentSubject.subject_id == subject_id)
        return query.filter(Student.id.in_(student_ids))

    if target == "year":
        try:
            year = int(filters.get("enrollment_year"))
        except (TypeError, ValueError) as exc:
            raise ValueError("'enrollment_year' must be a valid year") from exc
        return query.filter(Student.enrollment_year == year)

    raise ValueError("Invalid 'target'")


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
        delivery_channels = _normalize_delivery_channels(payload)
    except ValueError as exc:
        return {"error": str(exc)}, 400

    recipient = db.session.get(User, user_id)
    if not recipient:
        return {"error": "Invalid 'user_id'"}, 400

    notification = None
    if "system" in delivery_channels:
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
    email_result = (
        send_email(recipient.email, title.strip(), message.strip())
        if "email" in delivery_channels
        else {"status": "disabled"}
    )
    sms_result = (
        send_sms(recipient.phone, f"{title.strip()}: {message.strip()}")
        if "sms" in delivery_channels
        else {"status": "disabled"}
    )

    return {
        **(
            _notification_payload(notification)
            if notification
            else {
                "id": None,
                "user_id": str(recipient.id),
                "title": title.strip(),
                "message": message.strip(),
                "is_read": False,
                "created_at": None,
            }
        ),
        "delivery_channels": delivery_channels,
        "delivery_summary": {
            "system": {
                "enabled": "system" in delivery_channels,
                "created": notification is not None,
            },
            "email": {
                "enabled": "email" in delivery_channels,
                "recipient": recipient.email,
                **email_result,
            },
            "sms": {
                "enabled": "sms" in delivery_channels,
                "recipient": recipient.phone,
                **sms_result,
            },
        },
    }, 201


@bp.post("/bulk")
def create_bulk_notifications():
    user, error, status = require_permission("notifications.create")
    if error:
        return error, status

    payload = request.get_json(silent=True) or {}
    title = payload.get("title")
    message = payload.get("message")
    filters = payload.get("filters") or {}
    sms_config = payload.get("sms_config") or {}

    if not title or not isinstance(title, str):
        return {"error": "'title' is required"}, 400
    if not message or not isinstance(message, str):
        return {"error": "'message' is required"}, 400
    if not isinstance(filters, dict):
        return {"error": "'filters' must be an object"}, 400
    if not isinstance(sms_config, dict):
        return {"error": "'sms_config' must be an object"}, 400

    try:
        recipient_query = _bulk_recipient_query(filters, user)
        delivery_channels = _normalize_delivery_channels(payload)
    except ValueError as exc:
        return {"error": str(exc)}, 400

    recipient_ids = [row[0] for row in recipient_query.with_entities(User.id).distinct().all()]
    if not recipient_ids:
        return {"error": "No recipients match this target"}, 400

    notifications = []
    if "system" in delivery_channels:
        notifications = [
            Notification(user_id=recipient_id, title=title.strip(), message=message.strip(), is_read=False)
            for recipient_id in recipient_ids
        ]
        db.session.add_all(notifications)

        try:
            db.session.commit()
        except IntegrityError:
            db.session.rollback()
            return {"error": "Unable to create bulk notifications"}, 409

    sms_enabled = bool(sms_config.get("enabled"))
    recipients = db.session.query(User).filter(User.id.in_(recipient_ids)).all()
    phone_ready = [recipient for recipient in recipients if recipient.phone]
    email_ready = [recipient for recipient in recipients if recipient.email]
    email_results = (
        [send_email(recipient.email, title.strip(), message.strip()) for recipient in email_ready]
        if "email" in delivery_channels
        else []
    )
    sms_requested = sms_enabled and "sms" in delivery_channels
    sms_results = (
        [send_sms(recipient.phone, f"{title.strip()}: {message.strip()}") for recipient in phone_ready]
        if sms_requested and not bool(sms_config.get("dry_run", True))
        else []
    )

    log_view(
        user,
        "notifications.bulk",
        metadata={
            "target": filters.get("target", "all"),
            "recipient_count": len(recipient_ids),
            "delivery_channels": delivery_channels,
            "sms_enabled": sms_enabled and "sms" in delivery_channels,
            "sms_provider": sms_config.get("provider"),
        },
    )

    return {
        "status": "created",
        "notifications_sent": len(notifications),
        "recipients": [_recipient_payload(recipient) for recipient in recipients[:25]],
        "recipient_count": len(recipient_ids),
        "delivery_channels": delivery_channels,
        "system": {
            "enabled": "system" in delivery_channels,
            "created_count": len(notifications),
        },
        "email": {
            "enabled": "email" in delivery_channels,
            "email_ready_count": len(email_ready),
            "skipped_no_email_count": len(recipient_ids) - len(email_ready),
            "sent_count": sum(1 for item in email_results if item.get("status") == "sent"),
            "failed_count": sum(1 for item in email_results if item.get("status") in {"failed", "not_configured"}),
            "status": "sent" if email_results and all(item.get("status") == "sent" for item in email_results) else "partial" if email_results else "disabled",
        },
        "sms": {
            "enabled": sms_enabled and "sms" in delivery_channels,
            "provider": sms_config.get("provider") or "manual",
            "sender_id": sms_config.get("sender_id") or None,
            "dry_run": bool(sms_config.get("dry_run", True)),
            "phone_ready_count": len(phone_ready),
            "skipped_no_phone_count": len(recipient_ids) - len(phone_ready),
            "sent_count": sum(1 for item in sms_results if item.get("status") == "sent"),
            "failed_count": sum(1 for item in sms_results if item.get("status") in {"failed", "not_configured"}),
            "status": "preview" if sms_requested and bool(sms_config.get("dry_run", True)) else "sent" if sms_results and all(item.get("status") == "sent" for item in sms_results) else "partial" if sms_results else "disabled",
        },
    }, 201


@bp.get("")
def list_notifications():
    user, error, status = require_permission("notifications.read")
    if error:
        return error, status

    status_filter = request.args.get("status", "all").strip().lower()
    if request.args.get("unread_only", "").strip().lower() in TRUTHY:
        status_filter = "unread"
    if status_filter not in {"all", "read", "unread"}:
        return {"error": "'status' must be one of: all, read, unread"}, 400

    try:
        base_query = _scoped_notification_query(user, request.args.get("user_id"))
        page, per_page = _parse_pagination()
    except ValueError as exc:
        return {"error": str(exc)}, 400

    listed_query = base_query
    if status_filter != "all":
        listed_query = listed_query.filter(Notification.is_read.is_(status_filter == "read"))

    # Callers that ask for a page get the paginated envelope; a bare request
    # keeps the legacy bare-array contract.
    wants_page = any(key in request.args for key in ("page", "per_page", "paginated"))
    if not wants_page:
        notifications = listed_query.order_by(Notification.created_at.desc()).all()
        log_view(user, "notifications", metadata={"scope": "list", "status": status_filter})
        return [_notification_payload(notification) for notification in notifications], 200

    total = listed_query.count()
    notifications = (
        listed_query.order_by(Notification.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )
    unread_count = base_query.filter(Notification.is_read.is_(False)).count()

    log_view(
        user,
        "notifications",
        metadata={"scope": "list", "page": page, "per_page": per_page, "status": status_filter},
    )
    return {
        "items": [_notification_payload(notification) for notification in notifications],
        "pagination": {
            "page": page,
            "per_page": per_page,
            "total": total,
            "total_pages": max(1, -(-total // per_page)),
        },
        "unread_count": unread_count,
        "page_size_options": PAGE_SIZE_OPTIONS,
    }, 200


@bp.get("/unread-count")
def notifications_unread_count():
    """Cheap counter for the header badge — polled, so it is not audit-logged."""
    user, error, status = require_permission("notifications.read")
    if error:
        return error, status

    try:
        base_query = _scoped_notification_query(user, request.args.get("user_id"))
    except ValueError as exc:
        return {"error": str(exc)}, 400

    unread_count = base_query.filter(Notification.is_read.is_(False)).count()
    latest_created_at = base_query.with_entities(func.max(Notification.created_at)).scalar()
    return {
        "unread_count": unread_count,
        "total": base_query.count(),
        "latest_created_at": latest_created_at.isoformat() if latest_created_at else None,
    }, 200


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
    if not _is_admin(user) and notification.user_id != user.id:
        return {"error": "Notification not found"}, 404

    log_view(user, "notifications", entity_id=notification_id, metadata={"scope": "detail"})
    return _notification_payload(notification), 200


@bp.put("/<notification_id>")
def update_notification(notification_id: str):
    user, error, status = require_permission("notifications.update")
    if error:
        return error, status

    try:
        notification_uuid = _parse_uuid(notification_id, "notification_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    notification = db.session.get(Notification, notification_uuid)
    if not notification:
        return {"error": "Notification not found"}, 404
    is_admin = _is_admin(user)
    if not is_admin and notification.user_id != user.id:
        return {"error": "Notification not found"}, 404

    payload = request.get_json(silent=True) or {}

    title = payload.get("title") if is_admin else None
    if title is not None:
        if not isinstance(title, str) or not title.strip():
            return {"error": "'title' must be a non-empty string"}, 400
        notification.title = title.strip()

    message = payload.get("message") if is_admin else None
    if message is not None:
        if not isinstance(message, str) or not message.strip():
            return {"error": "'message' must be a non-empty string"}, 400
        notification.message = message.strip()

    if "is_read" in payload:
        notification.is_read = bool(payload.get("is_read"))

    if "user_id" in payload and is_admin:
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
    user, error, status = require_permission("notifications.delete")
    if error:
        return error, status

    try:
        notification_uuid = _parse_uuid(notification_id, "notification_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    notification = db.session.get(Notification, notification_uuid)
    if not notification:
        return {"error": "Notification not found"}, 404
    if not _is_admin(user) and notification.user_id != user.id:
        return {"error": "Notification not found"}, 404

    db.session.delete(notification)
    db.session.commit()
    return {"status": "deleted"}, 200
