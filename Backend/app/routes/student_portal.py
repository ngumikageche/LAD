from __future__ import annotations

from flask import Blueprint, g, request
from sqlalchemy.exc import IntegrityError
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

from ..extensions import db
from ..models.notification import Notification
from ..services.student_portal import (
    parse_uuid,
    performance_payload,
    student_announcements,
    student_dashboard,
    student_notifications,
    student_profile_payload,
    student_scores,
    student_subjects_payload,
)
from .permissions import student_required


bp = Blueprint("student_portal", __name__, url_prefix="/api/v1/student")


@bp.errorhandler(ValueError)
def handle_value_error(error: ValueError):
    return {"error": str(error)}, 400


@bp.errorhandler(HTTPException)
def handle_http_error(error: HTTPException):
    return {"error": error.description}, error.code


def _parse_pagination() -> tuple[int, int]:
    page = max(int(request.args.get("page", 1)), 1)
    per_page = min(max(int(request.args.get("per_page", 20)), 1), 100)
    return page, per_page


@bp.get("/dashboard")
@student_required()
def get_dashboard():
    return student_dashboard(g.current_student), 200


@bp.get("/scores")
@student_required()
def get_scores():
    subject_id = request.args.get("subject_id")
    term = request.args.get("term")
    page, per_page = _parse_pagination()
    subject_uuid = parse_uuid(subject_id, "subject_id") if subject_id else None
    return student_scores(g.current_student, subject_uuid, term, page, per_page), 200


@bp.get("/results")
@student_required()
def get_results():
    subject_id = request.args.get("subject_id")
    term = request.args.get("term")
    page, per_page = _parse_pagination()
    subject_uuid = parse_uuid(subject_id, "subject_id") if subject_id else None
    return student_scores(g.current_student, subject_uuid, term, page, per_page), 200


@bp.get("/subjects")
@student_required()
def get_subjects():
    return student_subjects_payload(g.current_student), 200


@bp.get("/performance")
@student_required()
def get_performance():
    return performance_payload(g.current_student), 200


@bp.get("/notifications")
@student_required()
def get_notifications():
    page, per_page = _parse_pagination()
    return student_notifications(g.current_student, page, per_page), 200


@bp.put("/notifications/<notification_id>/read")
@student_required()
def mark_notification_read(notification_id: str):
    notification_uuid = parse_uuid(notification_id, "notification_id")
    notification = (
        db.session.query(Notification)
        .filter(Notification.id == notification_uuid, Notification.user_id == g.current_user.id)
        .first()
    )
    if notification is None:
        return {"error": "Notification not found"}, 404
    notification.is_read = True
    db.session.commit()
    return {"message": "Notification marked as read"}, 200


@bp.get("/profile")
@student_required()
def get_profile():
    return student_profile_payload(g.current_student), 200


@bp.put("/profile")
@student_required()
def update_profile():
    payload = request.get_json(silent=True) or {}
    user = g.current_user

    if "name" in payload:
        name = payload.get("name")
        if not isinstance(name, str) or not name.strip():
            return {"error": "'name' must be a non-empty string"}, 400
        user.name = name.strip()

    if "email" in payload:
        email = payload.get("email")
        if not isinstance(email, str) or not email.strip():
            return {"error": "'email' must be a non-empty string"}, 400
        user.email = email.strip().lower()

    if "phone" in payload:
        phone = payload.get("phone")
        if phone is not None and not isinstance(phone, str):
            return {"error": "'phone' must be a string"}, 400
        user.phone = phone.strip() if isinstance(phone, str) and phone.strip() else None

    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return {"error": "Profile update conflicts with an existing user record"}, 409

    db.session.refresh(g.current_student)
    return student_profile_payload(g.current_student), 200


@bp.put("/change-password")
@student_required()
def change_password():
    payload = request.get_json(silent=True) or {}
    current_password = payload.get("current_password")
    new_password = payload.get("new_password")
    confirm_password = payload.get("confirm_password")

    if not isinstance(current_password, str) or not current_password:
        return {"error": "'current_password' is required"}, 400
    if not isinstance(new_password, str) or len(new_password) < 8:
        return {"error": "New password must be at least 8 characters long"}, 400
    if new_password != confirm_password:
        return {"error": "New password and confirm password do not match"}, 400
    if not check_password_hash(g.current_user.password_hash, current_password):
        return {"error": "Current password is incorrect"}, 401

    g.current_user.password_hash = generate_password_hash(new_password)
    db.session.commit()
    return {"message": "Password changed successfully"}, 200


@bp.get("/announcements")
@student_required()
def get_student_announcements():
    page, per_page = _parse_pagination()
    return student_announcements(g.current_student, page, per_page), 200
