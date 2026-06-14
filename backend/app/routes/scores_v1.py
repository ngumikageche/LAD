from __future__ import annotations

from flask import Blueprint, g, request
from sqlalchemy.exc import IntegrityError
from werkzeug.exceptions import HTTPException

from ..extensions import db
from ..models.score import Score
from ..services.trainer_portal import (
    create_score,
    ensure_subject_access,
    pagination_meta,
    parse_uuid,
    score_payload,
)
from .permissions import trainer_required


bp = Blueprint("scores_v1", __name__, url_prefix="/api/v1/scores")


@bp.errorhandler(ValueError)
def handle_value_error(error: ValueError):
    return {"error": str(error)}, 400


@bp.errorhandler(HTTPException)
def handle_http_exception(error: HTTPException):
    return {"error": error.description}, error.code


@bp.post("")
@trainer_required("scores.create")
def create_score_route():
    from ..services.score_evidence import allowed_score_evidence, save_score_evidence_files, usable_score_evidence_files

    evidence_files = usable_score_evidence_files(request.files.getlist("exam_copies"))
    if not evidence_files:
        return {"error": "Upload at least one physical exam copy before saving marks"}, 400
    invalid_file = next((file.filename for file in evidence_files if not allowed_score_evidence(file.filename or "")), None)
    if invalid_file:
        return {"error": f"Exam copy file type not allowed: {invalid_file}"}, 400

    if not (request.content_type and request.content_type.startswith("multipart/form-data")):
        return {"error": "Use multipart/form-data and include exam_copies files"}, 400

    payload = {
        "student_id": request.form.get("student_id"),
        "subject_id": request.form.get("subject_id"),
        "term": request.form.get("term"),
        "feedback": request.form.get("feedback") or None,
    }
    try:
        payload["score"] = float(request.form.get("score", ""))
    except (TypeError, ValueError):
        payload["score"] = request.form.get("score")

    try:
        score = create_score(g.current_trainer, payload)
        save_score_evidence_files(
            evidence_files,
            uploaded_by=g.current_user.id,
            trainer_id=g.current_trainer.id,
            score_id=score.id,
            subject_id=score.subject_id,
        )
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return {"error": "Score already exists for this student, subject, and term"}, 409
    except ValueError as exc:
        db.session.rollback()
        return {"error": str(exc)}, 400
    return score_payload(score), 201


@bp.get("")
@trainer_required("scores.read")
def list_scores():
    trainer = g.current_trainer
    payload_subject_id = request.args.get("subject_id")
    term = request.args.get("term")
    student_id = request.args.get("student_id")
    page = max(int(request.args.get("page", 1)), 1)
    per_page = min(max(int(request.args.get("per_page", 20)), 1), 100)

    query = db.session.query(Score).filter(Score.trainer_id == trainer.id)
    if payload_subject_id:
        subject = ensure_subject_access(trainer, parse_uuid(payload_subject_id, "subject_id"))
        query = query.filter(Score.subject_id == subject.id)
    if term:
        query = query.filter(Score.term == term)
    if student_id:
        query = query.filter(Score.student_id == parse_uuid(student_id, "student_id"))

    total = query.count()
    items = (
        query.order_by(Score.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    return {
        "items": [score_payload(item) for item in items],
        "pagination": pagination_meta(page, per_page, total),
    }, 200


@bp.put("/<score_id>/feedback")
@trainer_required("scores.update")
def update_score_feedback(score_id: str):
    score = db.session.get(Score, parse_uuid(score_id, "score_id"))
    if not score:
        return {"error": "Score not found"}, 404

    if not score.subject_id:
        return {"error": "Score is not linked to a subject"}, 400

    ensure_subject_access(g.current_trainer, score.subject_id)
    payload = request.get_json(silent=True) or {}
    feedback = payload.get("feedback")
    if not isinstance(feedback, str) or not feedback.strip():
        return {"error": "'feedback' is required"}, 400

    score.feedback = feedback.strip()
    db.session.commit()
    db.session.refresh(score)
    return score_payload(score), 200
