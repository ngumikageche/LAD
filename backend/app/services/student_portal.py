from __future__ import annotations

import math
import uuid
from collections import defaultdict

from sqlalchemy import func, or_

from ..extensions import db
from ..models.announcement import Announcement, AnnouncementRead
from ..models.assessment import Assessment
from ..models.notification import Notification
from ..models.score import Score
from ..models.student import Student
from ..models.student_subject import StudentSubject
from ..models.subject import Subject
from ..models.trainer_subject import TrainerSubject
from ..models.user import User
from .learning_analytics import build_role_dashboard


def pagination_meta(page: int, per_page: int, total: int) -> dict:
    return {
        "page": page,
        "per_page": per_page,
        "total": total,
        "total_pages": max(1, math.ceil(total / per_page)) if per_page else 1,
    }


def parse_uuid(value: str | None, field: str) -> uuid.UUID:
    if not value:
        raise ValueError(f"Missing '{field}'")
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError) as exc:
        raise ValueError(f"Invalid '{field}'") from exc


def _subject_rows(student_id: uuid.UUID) -> list[Subject]:
    return (
        db.session.query(Subject)
        .join(StudentSubject, StudentSubject.subject_id == Subject.id)
        .filter(StudentSubject.student_id == student_id)
        .order_by(Subject.name.asc())
        .all()
    )


def _trainer_payload_for_subject(subject_id: uuid.UUID) -> list[dict]:
    trainer_rows = (
        db.session.query(TrainerSubject)
        .filter(TrainerSubject.subject_id == subject_id)
        .all()
    )
    payload = []
    for row in trainer_rows:
        trainer = row.trainer
        if not trainer or not trainer.user:
            continue
        payload.append(
            {
                "id": str(trainer.id),
                "name": trainer.user.name,
                "email": trainer.user.email,
                "specialization": trainer.specialization,
            }
        )
    return payload


def subject_payload(subject: Subject) -> dict:
    module = subject.module
    course = module.course if module else None
    return {
        "id": str(subject.id),
        "name": subject.name,
        "description": subject.description,
        "course": {
            "id": str(course.id),
            "name": course.name,
            "cbet_level": course.cbet_level,
        } if course else None,
        "module": {
            "id": str(module.id),
            "name": module.name,
            "description": module.description,
        } if module else None,
        "trainers": _trainer_payload_for_subject(subject.id),
    }


def student_subjects_payload(student: Student) -> dict:
    subjects = [subject_payload(subject) for subject in _subject_rows(student.id)]
    return {
        "items": subjects,
        "total": len(subjects),
    }


def _subject_map(student_id: uuid.UUID) -> tuple[dict[uuid.UUID, Subject], dict[uuid.UUID, Subject]]:
    subjects = _subject_rows(student_id)
    by_id = {subject.id: subject for subject in subjects}
    by_module_id = {subject.module_id: subject for subject in subjects if subject.module_id}
    return by_id, by_module_id


def _resolve_score_subject(score: Score, by_id: dict[uuid.UUID, Subject], by_module_id: dict[uuid.UUID, Subject]) -> Subject | None:
    if score.subject_id and score.subject_id in by_id:
        return by_id[score.subject_id]
    module_id = score.assessment.module_id if score.assessment else None
    if module_id and module_id in by_module_id:
        return by_module_id[module_id]
    return None


def score_payload(score: Score, by_id: dict[uuid.UUID, Subject], by_module_id: dict[uuid.UUID, Subject]) -> dict:
    subject = _resolve_score_subject(score, by_id, by_module_id)
    term_name = score.term
    if not term_name and score.assessment and score.assessment.term:
        term_name = score.assessment.term.name

    return {
        "id": str(score.id),
        "student_id": str(score.student_id) if score.student_id else None,
        "subject_id": str(subject.id) if subject else (str(score.subject_id) if score.subject_id else None),
        "subject": {
            "id": str(subject.id),
            "name": subject.name,
        } if subject else None,
        "score": score.marks_obtained,
        "grade": score.grade,
        "term": term_name,
        "feedback": score.feedback,
        "is_passed": score.is_passed,
        "assessment": {
            "id": str(score.assessment.id),
            "name": score.assessment.name,
            "type": score.assessment.assessment_type,
        } if score.assessment else None,
        "recorded_at": score.created_at.isoformat() if score.created_at else None,
    }


def _student_scores_query(student: Student):
    return (
        db.session.query(Score)
        .outerjoin(Assessment, Assessment.id == Score.assessment_id)
        .filter(
            or_(
                Score.student_id == student.id,
                Score.enrollment.has(student_id=student.id),
            )
        )
        .order_by(Score.created_at.desc())
    )


def student_scores(student: Student, subject_id: uuid.UUID | None = None, term: str | None = None, page: int = 1, per_page: int = 20) -> dict:
    by_id, by_module_id = _subject_map(student.id)
    allowed_subject_ids = set(by_id.keys())

    query = _student_scores_query(student)
    if term:
        query = query.filter(
            or_(
                Score.term == term,
                Assessment.term.has(name=term),
            )
        )

    scores = query.all()
    items = []
    for score in scores:
        subject = _resolve_score_subject(score, by_id, by_module_id)
        if subject_id and (not subject or subject.id != subject_id):
            continue
        if subject and subject.id not in allowed_subject_ids:
            continue
        items.append(score_payload(score, by_id, by_module_id))

    total = len(items)
    start = (page - 1) * per_page
    end = start + per_page
    return {
        "items": items[start:end],
        "pagination": pagination_meta(page, per_page, total),
    }


def performance_payload(student: Student) -> dict:
    by_id, by_module_id = _subject_map(student.id)
    raw_scores = _student_scores_query(student).all()
    scores = [score_payload(score, by_id, by_module_id) for score in raw_scores]

    average_score = round(sum(item["score"] for item in scores) / len(scores), 2) if scores else 0.0
    subject_buckets: dict[str, list[float]] = defaultdict(list)
    term_buckets: dict[str, list[float]] = defaultdict(list)
    for item in scores:
        if item["subject"]:
            subject_buckets[item["subject"]["name"]].append(item["score"])
        if item["term"]:
            term_buckets[item["term"]].append(item["score"])

    return {
        "average_score": average_score,
        "subject_performance": [
            {
                "subject_name": name,
                "average_score": round(sum(values) / len(values), 2),
                "scores_count": len(values),
            }
            for name, values in sorted(subject_buckets.items())
        ],
        "trend": [
            {
                "term": term_name,
                "average_score": round(sum(values) / len(values), 2),
                "scores_count": len(values),
            }
            for term_name, values in sorted(term_buckets.items())
        ],
    }


def notification_payload(notification: Notification) -> dict:
    return {
        "id": str(notification.id),
        "type": notification.title,
        "title": notification.title,
        "message": notification.message,
        "read": notification.is_read,
        "created_at": notification.created_at.isoformat() if notification.created_at else None,
    }


def student_notifications(student: Student, page: int = 1, per_page: int = 20) -> dict:
    query = db.session.query(Notification).filter(
        Notification.user_id == student.user_id,
        Notification.deleted_at.is_(None),
    ).order_by(Notification.created_at.desc())
    total = query.count()
    items = query.offset((page - 1) * per_page).limit(per_page).all()
    unread_count = db.session.query(func.count(Notification.id)).filter(
        Notification.user_id == student.user_id,
        Notification.is_read == False,
        Notification.deleted_at.is_(None),
    ).scalar() or 0
    return {
        "items": [notification_payload(item) for item in items],
        "pagination": pagination_meta(page, per_page, total),
        "unread_count": unread_count,
    }


def announcement_payload(announcement: Announcement, is_read: bool) -> dict:
    return {
        "id": str(announcement.id),
        "title": announcement.title,
        "message": announcement.content,
        "created_at": announcement.created_at.isoformat() if announcement.created_at else None,
        "course_id": str(announcement.course_id) if announcement.course_id else None,
        "is_important": announcement.is_important,
        "read": is_read,
    }


def student_announcements(student: Student, page: int = 1, per_page: int = 20) -> dict:
    course_ids = [subject.module.course_id for subject in _subject_rows(student.id) if subject.module and subject.module.course_id]
    query = (
        db.session.query(Announcement)
        .filter(
            Announcement.is_published == True,
            or_(
                Announcement.course_id == None,
                Announcement.course_id.in_(course_ids) if course_ids else False,
            ),
        )
        .order_by(Announcement.created_at.desc())
    )
    total = query.count()
    items = query.offset((page - 1) * per_page).limit(per_page).all()

    read_ids = {
        row.announcement_id
        for row in db.session.query(AnnouncementRead).filter(AnnouncementRead.user_id == student.user_id).all()
    }
    return {
        "items": [announcement_payload(item, item.id in read_ids) for item in items],
        "pagination": pagination_meta(page, per_page, total),
    }


def student_dashboard(student: Student) -> dict:
    subjects = [subject_payload(subject) for subject in _subject_rows(student.id)]
    scores = student_scores(student, page=1, per_page=5)
    notifications = student_notifications(student, page=1, per_page=5)
    performance = performance_payload(student)
    advanced = build_role_dashboard("student", student_id=str(student.id))
    return {
        "average_score": performance["average_score"],
        "enrolled_subjects_count": len(subjects),
        "recent_scores": scores["items"],
        "subject_performance": performance["subject_performance"],
        "trend": performance["trend"],
        "notifications_summary": {
            "unread_count": notifications["unread_count"],
            "recent": notifications["items"][:5],
        },
        "summary_panel": advanced["summary_panel"],
        "analytics": advanced,
        "last_updated": advanced["last_updated"],
    }


def student_profile_payload(student: Student) -> dict:
    user = student.user
    course = student.course
    return {
        "id": str(student.id),
        "user_id": str(student.user_id),
        "registration_number": student.registration_number,
        "enrollment_year": student.enrollment_year,
        "course_id": str(student.course_id) if student.course_id else None,
        "course": {
            "id": str(course.id),
            "name": course.name,
            "cbet_level": course.cbet_level,
        } if course else None,
        "name": user.name if user else None,
        "email": user.email if user else None,
        "phone": user.phone if user else None,
    }
