from __future__ import annotations

import uuid
from flask import Blueprint, request
from sqlalchemy import and_, or_

from ..extensions import db
from ..models.announcement import Announcement, AnnouncementRead
from ..models.course import Course
from ..models.enrollment import Enrollment
from ..models.student import Student
from .permissions import require_permission, log_view

bp = Blueprint("announcements", __name__, url_prefix="/announcements")


def _parse_uuid(value: str | None, field: str) -> uuid.UUID:
    if not value:
        raise ValueError(f"Missing '{field}'")
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError) as exc:
        raise ValueError(f"Invalid '{field}'") from exc


def _announcement_payload(announcement: Announcement, is_read: bool = False) -> dict:
    return {
        "id": str(announcement.id),
        "title": announcement.title,
        "content": announcement.content,
        "is_important": announcement.is_important,
        "is_published": announcement.is_published,
        "course_id": str(announcement.course_id) if announcement.course_id else None,
        "course_name": announcement.course.name if announcement.course else None,
        "created_at": announcement.created_at.isoformat() if announcement.created_at else None,
        "is_read": is_read,
    }


@bp.post("")
def create_announcement():
    """Create a new announcement (admin/trainer)"""
    user, error, status = require_permission("announcements.create")
    if error:
        return error, status

    payload = request.get_json(silent=True) or {}

    title = payload.get("title")
    content = payload.get("content")

    if not title or not isinstance(title, str):
        return {"error": "'title' is required"}, 400
    if not content or not isinstance(content, str):
        return {"error": "'content' is required"}, 400

    course_id = None
    if payload.get("course_id"):
        try:
            course_id = _parse_uuid(payload.get("course_id"), "course_id")
        except ValueError as exc:
            return {"error": str(exc)}, 400

        if not db.session.get(Course, course_id):
            return {"error": "Invalid course_id"}, 400

    announcement = Announcement(
        creator_id=uuid.UUID(user["id"]),
        title=title.strip(),
        content=content.strip(),
        course_id=course_id,
        is_important=payload.get("is_important", False),
        is_published=payload.get("is_published", True),
    )

    db.session.add(announcement)
    db.session.commit()

    log_view(user, "announcements", entity_id=str(announcement.id), metadata={"action": "created"})
    return _announcement_payload(announcement), 201


@bp.get("")
def list_announcements():
    """List announcements"""
    user, error, status = require_permission("announcements.read")
    if error:
        return error, status

    query = db.session.query(Announcement).filter(Announcement.is_published == True)

    # Filter by course
    course_id = request.args.get("course_id")
    if course_id:
        try:
            course_uuid = _parse_uuid(course_id, "course_id")
        except ValueError as exc:
            return {"error": str(exc)}, 400
        query = query.filter(
            or_(
                Announcement.course_id == course_uuid,
                Announcement.course_id == None,
            )
        )

    # Filter by importance
    if request.args.get("important") == "true":
        query = query.filter(Announcement.is_important == True)

    announcements = query.order_by(Announcement.created_at.desc()).all()

    result = []
    for announcement in announcements:
        is_read = (
            db.session.query(AnnouncementRead).filter(
                and_(
                    AnnouncementRead.announcement_id == announcement.id,
                    AnnouncementRead.user_id == uuid.UUID(user["id"]),
                )
            ).first()
            is not None
        )
        result.append(_announcement_payload(announcement, is_read=is_read))

    log_view(user, "announcements", metadata={"scope": "list"})
    return result, 200


@bp.get("/students/<student_id>")
def get_student_announcements(student_id: str):
    """Get announcements for a student (from enrolled courses + system-wide)"""
    user, error, status = require_permission("announcements.read")
    if error:
        return error, status

    try:
        student_uuid = _parse_uuid(student_id, "student_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    student = db.session.get(Student, student_uuid)
    if not student:
        return {"error": "Student not found"}, 404

    # Get student's enrolled courses
    enrollments = db.session.query(Enrollment).filter(Enrollment.student_id == student_uuid).all()
    course_ids = [e.course_id for e in enrollments]

    # Get announcements for student's courses + system-wide announcements
    announcements = db.session.query(Announcement).filter(
        and_(
            Announcement.is_published == True,
            or_(
                Announcement.course_id.in_(course_ids),
                Announcement.course_id == None,
            )
        )
    ).order_by(Announcement.created_at.desc()).all()

    result = []
    for announcement in announcements:
        is_read = (
            db.session.query(AnnouncementRead).filter(
                and_(
                    AnnouncementRead.announcement_id == announcement.id,
                    AnnouncementRead.user_id == student.user_id,
                )
            ).first()
            is not None
        )
        result.append(_announcement_payload(announcement, is_read=is_read))

    return result, 200


@bp.post("/<announcement_id>/mark-read")
def mark_announcement_read(announcement_id: str):
    """Mark an announcement as read by the current user"""
    user, error, status = require_permission("announcements.read")
    if error:
        return error, status

    try:
        announcement_uuid = _parse_uuid(announcement_id, "announcement_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    announcement = db.session.get(Announcement, announcement_uuid)
    if not announcement:
        return {"error": "Announcement not found"}, 404

    # Check if already marked as read
    existing = db.session.query(AnnouncementRead).filter(
        and_(
            AnnouncementRead.announcement_id == announcement_uuid,
            AnnouncementRead.user_id == uuid.UUID(user["id"]),
        )
    ).first()

    if not existing:
        read_record = AnnouncementRead(
            announcement_id=announcement_uuid,
            user_id=uuid.UUID(user["id"]),
        )
        db.session.add(read_record)
        db.session.commit()

    return {"message": "Announcement marked as read"}, 200


@bp.get("/<announcement_id>")
def get_announcement(announcement_id: str):
    """Get a specific announcement"""
    user, error, status = require_permission("announcements.read")
    if error:
        return error, status

    try:
        announcement_uuid = _parse_uuid(announcement_id, "announcement_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    announcement = db.session.get(Announcement, announcement_uuid)
    if not announcement or not announcement.is_published:
        return {"error": "Announcement not found"}, 404

    is_read = (
        db.session.query(AnnouncementRead).filter(
            and_(
                AnnouncementRead.announcement_id == announcement_uuid,
                AnnouncementRead.user_id == uuid.UUID(user["id"]),
            )
        ).first()
        is not None
    )

    log_view(user, "announcements", entity_id=announcement_id, metadata={"scope": "detail"})
    return _announcement_payload(announcement, is_read=is_read), 200
