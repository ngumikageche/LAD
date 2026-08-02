from __future__ import annotations

import uuid
from datetime import datetime

from flask import Blueprint, g, request
from sqlalchemy import func

from ..extensions import db
from ..models.notification import Notification
from ..models.student_subject import StudentSubject
from ..models.subject import Subject
from ..models.trainer import Trainer
from ..models.trainer_feedback import TrainerFeedback
from ..models.trainer_subject import TrainerSubject
from ..models.user import User
from .permissions import (
    _has_permission,
    _is_admin,
    _is_student,
    _is_trainer,
    get_current_user,
    student_required,
)

bp = Blueprint("trainer_feedback", __name__, url_prefix="/trainer-feedback")

VIEW_PERMISSION = "feedback.trainer.view"
MODERATE_PERMISSION = "feedback.trainer.moderate"
SUBMIT_PERMISSION = "feedback.trainer.submit"

RATING_FIELDS = ("teaching_rating", "communication_rating", "support_rating")
CATEGORIES = {"general", "teaching", "materials", "communication", "support", "facilities"}
MAX_COMMENT_LENGTH = 2000


def _parse_uuid(value, field: str) -> uuid.UUID:
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Invalid '{field}'") from exc


def _parse_rating(value, field: str, required: bool) -> int | None:
    if value in (None, ""):
        if required:
            raise ValueError(f"'{field}' is required")
        return None
    try:
        rating = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"'{field}' must be a whole number from 1 to 5") from exc
    if rating < 1 or rating > 5:
        raise ValueError(f"'{field}' must be between 1 and 5")
    return rating


def _student_trainer_pairs(student_id: uuid.UUID):
    """(trainer, subject) pairs the learner is actually taught by."""
    return (
        db.session.query(Trainer, Subject)
        .join(TrainerSubject, TrainerSubject.trainer_id == Trainer.id)
        .join(Subject, Subject.id == TrainerSubject.subject_id)
        .join(StudentSubject, StudentSubject.subject_id == TrainerSubject.subject_id)
        .filter(
            StudentSubject.student_id == student_id,
            Subject.deleted_at.is_(None),
            Trainer.deleted_at.is_(None),
        )
        .all()
    )


def _can_review(student_id: uuid.UUID, trainer_id: uuid.UUID, subject_id: uuid.UUID | None) -> bool:
    query = (
        db.session.query(TrainerSubject.id)
        .join(StudentSubject, StudentSubject.subject_id == TrainerSubject.subject_id)
        .filter(
            TrainerSubject.trainer_id == trainer_id,
            StudentSubject.student_id == student_id,
        )
    )
    if subject_id:
        query = query.filter(TrainerSubject.subject_id == subject_id)
    return db.session.query(query.exists()).scalar()


def _payload(feedback: TrainerFeedback, *, reveal_identity: bool) -> dict:
    student_user = feedback.student.user if feedback.student else None
    identified = reveal_identity or not feedback.is_anonymous
    return {
        "id": str(feedback.id),
        "trainer_id": str(feedback.trainer_id),
        "trainer_name": feedback.trainer.user.name if feedback.trainer and feedback.trainer.user else None,
        "subject_id": str(feedback.subject_id) if feedback.subject_id else None,
        "subject_code": feedback.subject.code if feedback.subject else None,
        "subject_name": feedback.subject.name if feedback.subject else None,
        "rating": feedback.rating,
        "teaching_rating": feedback.teaching_rating,
        "communication_rating": feedback.communication_rating,
        "support_rating": feedback.support_rating,
        "category": feedback.category,
        "comment": feedback.comment,
        "is_anonymous": feedback.is_anonymous,
        "status": feedback.status,
        "trainer_response": feedback.trainer_response,
        "responded_at": feedback.responded_at.isoformat() if feedback.responded_at else None,
        "student_id": str(feedback.student_id) if identified else None,
        "student_name": (student_user.name if student_user else None) if identified else "Anonymous learner",
        "created_at": feedback.created_at.isoformat() if feedback.created_at else None,
        "updated_at": feedback.updated_at.isoformat() if feedback.updated_at else None,
    }


def _require_reader():
    """
    Returns (user, trainer, error, status).

    Trainers always see their own feedback. Anyone else needs
    `feedback.trainer.view`; admins pass on the wildcard. Learners are blocked —
    they read their own submissions through /trainer-feedback/mine instead.
    """
    user, error, status = get_current_user()
    if error:
        return None, None, error, status

    if _is_student(user) and not _is_trainer(user) and not _is_admin(user):
        return None, None, {"error": "Permission denied"}, 403

    trainer = db.session.query(Trainer).filter(Trainer.user_id == user.id).first()
    if _is_admin(user) or _has_permission(user, VIEW_PERMISSION):
        return user, trainer, None, None
    if trainer:
        return user, trainer, None, None
    return None, None, {"error": "Permission denied"}, 403


# ── Learner side ─────────────────────────────────────────────────────────────

@bp.get("/targets")
@student_required(SUBMIT_PERMISSION)
def list_targets():
    """Trainers (and the subjects they teach you) that you may review."""
    student = g.current_student
    pairs = _student_trainer_pairs(student.id)

    existing = {
        (row.trainer_id, row.subject_id): row
        for row in db.session.query(TrainerFeedback).filter(
            TrainerFeedback.student_id == student.id,
            TrainerFeedback.deleted_at.is_(None),
        ).all()
    }

    targets = []
    seen: set[tuple[uuid.UUID, uuid.UUID]] = set()
    for trainer, subject in pairs:
        key = (trainer.id, subject.id)
        if key in seen:
            continue
        seen.add(key)
        submitted = existing.get(key)
        targets.append({
            "trainer_id": str(trainer.id),
            "trainer_name": trainer.user.name if trainer.user else "Trainer",
            "trainer_email": trainer.user.email if trainer.user else None,
            "subject_id": str(subject.id),
            "subject_code": subject.code,
            "subject_name": subject.name,
            "already_submitted": submitted is not None,
            "my_rating": submitted.rating if submitted else None,
        })

    targets.sort(key=lambda item: (item["trainer_name"] or "", item["subject_code"] or ""))
    return {"targets": targets, "total": len(targets)}, 200


@bp.get("/mine")
@student_required(SUBMIT_PERMISSION)
def my_feedback():
    rows = (
        db.session.query(TrainerFeedback)
        .filter(
            TrainerFeedback.student_id == g.current_student.id,
            TrainerFeedback.deleted_at.is_(None),
        )
        .order_by(TrainerFeedback.created_at.desc())
        .all()
    )
    # The learner authored these, so their own identity is never hidden here.
    return {"feedback": [_payload(row, reveal_identity=True) for row in rows], "total": len(rows)}, 200


@bp.post("")
@student_required(SUBMIT_PERMISSION)
def submit_feedback():
    """
    Submit (or revise) feedback about a trainer.

    One learner keeps a single record per trainer+subject; posting again updates
    it rather than stacking duplicates.
    """
    student = g.current_student
    payload = request.get_json(silent=True) or {}

    try:
        trainer_uuid = _parse_uuid(payload.get("trainer_id"), "trainer_id")
        subject_uuid = _parse_uuid(payload["subject_id"], "subject_id") if payload.get("subject_id") else None
        rating = _parse_rating(payload.get("rating"), "rating", required=True)
        dimension_ratings = {
            field: _parse_rating(payload.get(field), field, required=False)
            for field in RATING_FIELDS
        }
    except ValueError as exc:
        return {"error": str(exc)}, 400

    trainer = db.session.get(Trainer, trainer_uuid)
    if not trainer or trainer.deleted_at:
        return {"error": "Trainer not found"}, 404

    if subject_uuid:
        subject = db.session.get(Subject, subject_uuid)
        if not subject or subject.deleted_at:
            return {"error": "Subject not found"}, 404

    if not _can_review(student.id, trainer_uuid, subject_uuid):
        return {"error": "You can only review trainers who teach your subjects"}, 403

    category = (payload.get("category") or "general").strip().lower()
    if category not in CATEGORIES:
        return {"error": f"Invalid category. Use one of: {', '.join(sorted(CATEGORIES))}"}, 400

    comment = (payload.get("comment") or "").strip() or None
    if comment and len(comment) > MAX_COMMENT_LENGTH:
        return {"error": f"'comment' must be {MAX_COMMENT_LENGTH} characters or fewer"}, 400

    is_anonymous = payload.get("is_anonymous")
    is_anonymous = True if is_anonymous is None else bool(is_anonymous)

    feedback = (
        db.session.query(TrainerFeedback)
        .filter(
            TrainerFeedback.student_id == student.id,
            TrainerFeedback.trainer_id == trainer_uuid,
            TrainerFeedback.subject_id == subject_uuid,
            TrainerFeedback.deleted_at.is_(None),
        )
        .first()
    )
    created = feedback is None
    if created:
        feedback = TrainerFeedback(
            student_id=student.id,
            trainer_id=trainer_uuid,
            subject_id=subject_uuid,
        )
        db.session.add(feedback)

    feedback.rating = rating
    for field, value in dimension_ratings.items():
        setattr(feedback, field, value)
    feedback.category = category
    feedback.comment = comment
    feedback.is_anonymous = is_anonymous
    feedback.status = "submitted"
    feedback.trainer_response = None
    feedback.responded_at = None

    if created and trainer.user_id:
        db.session.add(
            Notification(
                user_id=trainer.user_id,
                title="New learner feedback",
                message="A learner shared feedback about your teaching.",
                is_read=False,
            )
        )

    db.session.commit()
    db.session.refresh(feedback)
    return _payload(feedback, reveal_identity=True), 201 if created else 200


@bp.delete("/<feedback_id>")
@student_required(SUBMIT_PERMISSION)
def withdraw_feedback(feedback_id: str):
    try:
        feedback_uuid = _parse_uuid(feedback_id, "feedback_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    feedback = db.session.get(TrainerFeedback, feedback_uuid)
    if not feedback or feedback.deleted_at or feedback.student_id != g.current_student.id:
        return {"error": "Feedback not found"}, 404

    feedback.soft_delete()
    db.session.commit()
    return {"message": "Feedback withdrawn"}, 200


# ── Trainer / staff side ─────────────────────────────────────────────────────

def _received_query(user, trainer: Trainer | None):
    query = db.session.query(TrainerFeedback).filter(TrainerFeedback.deleted_at.is_(None))

    can_see_all = _is_admin(user) or _has_permission(user, VIEW_PERMISSION)
    if not can_see_all:
        # Trainer without the school-wide view key: own feedback only.
        query = query.filter(TrainerFeedback.trainer_id == trainer.id)
        return query

    requested_trainer = request.args.get("trainer_id")
    if requested_trainer:
        query = query.filter(TrainerFeedback.trainer_id == _parse_uuid(requested_trainer, "trainer_id"))
    elif trainer and not _is_admin(user):
        # Staff who are also trainers default to their own inbox.
        query = query.filter(TrainerFeedback.trainer_id == trainer.id)

    subject_id = request.args.get("subject_id")
    if subject_id:
        query = query.filter(TrainerFeedback.subject_id == _parse_uuid(subject_id, "subject_id"))
    return query


@bp.get("/received")
def received_feedback():
    user, trainer, error, status = _require_reader()
    if error:
        return error, status

    try:
        query = _received_query(user, trainer)
    except ValueError as exc:
        return {"error": str(exc)}, 400

    # Anonymity holds for trainers; only moderators (admins by wildcard) see who wrote what.
    reveal = _has_permission(user, MODERATE_PERMISSION)
    rows = query.order_by(TrainerFeedback.created_at.desc()).all()
    return {
        "feedback": [_payload(row, reveal_identity=reveal) for row in rows],
        "total": len(rows),
        "can_see_identities": reveal,
    }, 200


@bp.get("/summary")
def feedback_summary():
    user, trainer, error, status = _require_reader()
    if error:
        return error, status

    try:
        query = _received_query(user, trainer)
    except ValueError as exc:
        return {"error": str(exc)}, 400

    rows = query.all()
    total = len(rows)
    if total == 0:
        return {
            "total": 0,
            "average_rating": None,
            "averages": {field: None for field in RATING_FIELDS},
            "distribution": {str(star): 0 for star in range(1, 6)},
            "awaiting_response": 0,
            "by_subject": [],
        }, 200

    def _avg(values: list[int]) -> float | None:
        return round(sum(values) / len(values), 2) if values else None

    distribution = {str(star): 0 for star in range(1, 6)}
    for row in rows:
        distribution[str(row.rating)] += 1

    by_subject: dict[str, dict] = {}
    for row in rows:
        key = str(row.subject_id) if row.subject_id else "general"
        bucket = by_subject.setdefault(key, {
            "subject_id": str(row.subject_id) if row.subject_id else None,
            "subject_code": row.subject.code if row.subject else None,
            "subject_name": row.subject.name if row.subject else "General",
            "ratings": [],
        })
        bucket["ratings"].append(row.rating)

    return {
        "total": total,
        "average_rating": _avg([row.rating for row in rows]),
        "averages": {
            field: _avg([value for value in (getattr(row, field) for row in rows) if value is not None])
            for field in RATING_FIELDS
        },
        "distribution": distribution,
        "awaiting_response": sum(1 for row in rows if row.status != "answered"),
        "by_subject": sorted(
            [
                {
                    "subject_id": bucket["subject_id"],
                    "subject_code": bucket["subject_code"],
                    "subject_name": bucket["subject_name"],
                    "count": len(bucket["ratings"]),
                    "average_rating": _avg(bucket["ratings"]),
                }
                for bucket in by_subject.values()
            ],
            key=lambda item: item["subject_name"] or "",
        ),
    }, 200


@bp.post("/<feedback_id>/respond")
def respond_to_feedback(feedback_id: str):
    user, trainer, error, status = _require_reader()
    if error:
        return error, status

    try:
        feedback_uuid = _parse_uuid(feedback_id, "feedback_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    feedback = db.session.get(TrainerFeedback, feedback_uuid)
    if not feedback or feedback.deleted_at:
        return {"error": "Feedback not found"}, 404

    is_owner = bool(trainer and feedback.trainer_id == trainer.id)
    if not (is_owner or _is_admin(user) or _has_permission(user, VIEW_PERMISSION)):
        return {"error": "Feedback not found"}, 404

    payload = request.get_json(silent=True) or {}
    response = (payload.get("response") or "").strip()
    if not response:
        return {"error": "'response' is required"}, 400
    if len(response) > MAX_COMMENT_LENGTH:
        return {"error": f"'response' must be {MAX_COMMENT_LENGTH} characters or fewer"}, 400

    feedback.trainer_response = response
    feedback.responded_at = datetime.utcnow()
    feedback.status = "answered"

    student_user_id = feedback.student.user_id if feedback.student else None
    if student_user_id:
        db.session.add(
            Notification(
                user_id=student_user_id,
                title="Your trainer replied to your feedback",
                message=response[:280],
                is_read=False,
            )
        )

    db.session.commit()
    db.session.refresh(feedback)
    reveal = _has_permission(user, MODERATE_PERMISSION)
    return _payload(feedback, reveal_identity=reveal), 200


@bp.get("/trainers")
def list_reviewable_trainers():
    """Trainer directory for staff filtering the feedback inbox."""
    user, trainer, error, status = _require_reader()
    if error:
        return error, status
    if not (_is_admin(user) or _has_permission(user, VIEW_PERMISSION)):
        return {"error": "Permission denied"}, 403

    rows = (
        db.session.query(Trainer, User, func.count(TrainerFeedback.id))
        .join(User, User.id == Trainer.user_id)
        .outerjoin(
            TrainerFeedback,
            (TrainerFeedback.trainer_id == Trainer.id) & (TrainerFeedback.deleted_at.is_(None)),
        )
        .filter(Trainer.deleted_at.is_(None))
        .group_by(Trainer.id, User.id)
        .order_by(User.name.asc())
        .all()
    )
    return {
        "trainers": [
            {
                "id": str(row_trainer.id),
                "name": row_user.name,
                "email": row_user.email,
                "feedback_count": count,
            }
            for row_trainer, row_user, count in rows
        ],
    }, 200
