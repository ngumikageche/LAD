from __future__ import annotations

import uuid
from flask import Blueprint, request
from sqlalchemy import and_, func
from sqlalchemy.orm import joinedload
from ..extensions import db
from ..models.score import Score
from ..models.enrollment import Enrollment
from ..models.assessment import Assessment
from ..models.student import Student
from ..models.subject import Subject
from ..services.scoping import can_access_score, can_view_master_data, scope_scores
from .permissions import require_permission, log_view


bp = Blueprint("admin_scores", __name__, url_prefix="/api/v1/admin/scores")


def _parse_uuid(value: str | None, field: str) -> uuid.UUID:
    if not value:
        raise ValueError(f"Missing '{field}'")
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError) as exc:
        raise ValueError(f"Invalid '{field}'") from exc


def _payload(score: Score) -> dict:
    student = score.student
    subject = score.subject
    assessment = score.assessment
    
    # Get course and module info from subject
    course_name = subject.module.course.name if subject and subject.module and subject.module.course else None
    module_name = subject.module.name if subject and subject.module else None
    
    return {
        "id": str(score.id),
        "student_id": str(score.student_id) if score.student_id else None,
        "student_name": student.user.name if student and student.user else None,
        "registration_number": student.registration_number if student else None,
        "subject_id": str(score.subject_id) if score.subject_id else None,
        "subject_name": subject.name if subject else None,
        "module_name": module_name,
        "course_name": course_name,
        "assessment_id": str(score.assessment_id) if score.assessment_id else None,
        "assessment_name": assessment.name if assessment else None,
        "marks_obtained": score.marks_obtained,
        "grade": score.grade,
        "is_passed": score.is_passed,
        "term": score.term,
        "created_at": score.created_at.isoformat() if score.created_at else None,
    }


@bp.get("")
def list_scores():
    user, error, status = require_permission("admin.scores.read")
    if error:
        return error, status

    # Score Management is an administrative screen, but the rows it lists are
    # still the caller's own: a trainer sees marks on the subjects assigned to
    # them, not every mark in the institution.
    q = scope_scores(db.session.query(Score), user).filter(Score.deleted_at.is_(None))

    student_id = request.args.get("student_id")
    subject_id = request.args.get("subject_id")
    term = request.args.get("term")
    page = int(request.args.get("page", 1))
    per_page = min(int(request.args.get("per_page", 50)), 200)

    if student_id:
        try:
            sid = _parse_uuid(student_id, "student_id")
        except ValueError as exc:
            return {"error": str(exc)}, 400
        q = q.filter(Score.student_id == sid)

    if subject_id:
        try:
            suid = _parse_uuid(subject_id, "subject_id")
        except ValueError as exc:
            return {"error": str(exc)}, 400
        q = q.filter(Score.subject_id == suid)

    if term:
        q = q.filter(Score.term == term)

    # Ensure scores have student_id by joining enrollment if needed
    q = q.options(
        joinedload(Score.student),
        joinedload(Score.subject),
        joinedload(Score.enrollment),
        joinedload(Score.assessment),
    )

    total = q.count()
    items = q.order_by(Score.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()
    log_view(user, "admin.scores", metadata={"scope": "list", "master": can_view_master_data(user), "count": total})
    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "items": [_payload(s) for s in items],
        "scope": "all" if can_view_master_data(user) else "assigned",
    }, 200


@bp.put("/<score_id>")
def update_score(score_id: str):
    user, error, status = require_permission("admin.scores.update")
    if error:
        return error, status

    try:
        sid = _parse_uuid(score_id, "score_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    score = db.session.get(Score, sid)
    if not score or score.deleted_at or not can_access_score(user, score.id):
        return {"error": "Score not found"}, 404

    payload = request.get_json(silent=True) or {}
    if "marks_obtained" in payload:
        marks = payload.get("marks_obtained")
        if not isinstance(marks, (int, float)):
            return {"error": "marks_obtained must be a number"}, 400
        # Verify against assessment if present
        if score.assessment_id:
            assessment = db.session.get(Assessment, score.assessment_id)
            if assessment and (marks < 0 or marks > assessment.total_marks):
                return {"error": f"marks_obtained must be between 0 and {assessment.total_marks}"}, 400
        score.marks_obtained = marks
        # Recalculate pass flag
        if score.assessment_id:
            assessment = db.session.get(Assessment, score.assessment_id)
            if assessment and assessment.pass_marks is not None:
                score.is_passed = marks >= assessment.pass_marks

    if "grade" in payload:
        score.grade = payload.get("grade")
    if "feedback" in payload:
        score.feedback = payload.get("feedback")

    db.session.commit()
    log_view(user, "admin.scores", entity_id=str(score.id), metadata={"action": "updated"})
    return _payload(score), 200


@bp.delete("/<score_id>")
def delete_score(score_id: str):
    user, error, status = require_permission("admin.scores.delete")
    if error:
        return error, status

    try:
        sid = _parse_uuid(score_id, "score_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    score = db.session.get(Score, sid)
    if not score or not can_access_score(user, score.id):
        return {"error": "Score not found"}, 404

    # soft delete
    score.deleted_at = db.func.now()
    db.session.commit()
    log_view(user, "admin.scores", entity_id=str(score.id), metadata={"action": "deleted"})
    return {"message": "Score deleted"}, 200
