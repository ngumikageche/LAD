from __future__ import annotations

import uuid
from flask import Blueprint
from sqlalchemy import func, and_
from ..extensions import db
from ..services.scoping import average_percentage
from ..models.student import Student
from ..models.trainer import Trainer
from ..models.score import Score
from ..models.assessment import Assessment
from ..models.trainer_subject import TrainerSubject
from .permissions import require_permission, log_view


bp = Blueprint("admin_reports", __name__, url_prefix="/api/v1/admin/reports")


@bp.get("")
def system_report():
    user, error, status = require_permission("admin.reports.read")
    if error:
        return error, status

    # reuse some analytics: total students, avg score, pass rate
    total_students = db.session.query(func.count(Student.id)).filter(Student.deleted_at.is_(None)).scalar() or 0
    scores = db.session.query(Score).filter(Score.deleted_at.is_(None)).all()
    total_scores = len(scores)
    passed = sum(1 for s in scores if s.is_passed is True)
    avg_score = average_percentage(scores)

    log_view(user, "admin_reports.system", metadata={})
    return {
        "total_students": total_students,
        "total_scores": total_scores,
        "pass_rate": round((passed / total_scores * 100) if total_scores else 0, 2),
        "avg_score": round(avg_score, 2),
    }, 200


@bp.get("/trainers/<trainer_id>")
def trainer_report(trainer_id: str):
    user, error, status = require_permission("admin.reports.read")
    if error:
        return error, status

    try:
        trainer_uuid = uuid.UUID(trainer_id)
    except Exception:
        return {"error": "Invalid trainer_id"}, 400

    trainer = db.session.get(Trainer, trainer_uuid)
    if not trainer:
        return {"error": "Trainer not found"}, 404

    # Subjects taught
    subjects = db.session.query(TrainerSubject).filter(TrainerSubject.trainer_id == trainer.id).all()
    subject_ids = [s.subject_id for s in subjects]

    # Scores for those subjects
    scores = db.session.query(Score).filter(Score.subject_id.in_(subject_ids), Score.deleted_at.is_(None)).all() if subject_ids else []
    total = len(scores)
    passed = sum(1 for s in scores if s.is_passed is True)
    avg_score = average_percentage(scores)

    log_view(user, "admin_reports.trainer", entity_id=str(trainer.id), metadata={})
    return {
        "trainer_id": str(trainer.id),
        "subjects_count": len(subject_ids),
        "scores_count": total,
        "pass_rate": round((passed / total * 100) if total else 0, 2),
        "avg_score": round(avg_score, 2),
    }, 200


@bp.get("/students/<student_id>")
def student_report(student_id: str):
    user, error, status = require_permission("admin.reports.read")
    if error:
        return error, status

    try:
        student_uuid = uuid.UUID(student_id)
    except Exception:
        return {"error": "Invalid student_id"}, 400

    student = db.session.get(Student, student_uuid)
    if not student:
        return {"error": "Student not found"}, 404

    # Scores for student via enrollments
    scores = db.session.query(Score).join(Assessment, Assessment.id == Score.assessment_id).join(
        # join via enrollment if needed
        Student, Student.id == Score.student_id
    ).filter(Score.deleted_at.is_(None), Score.student_id == student.id).all()

    total = len(scores)
    passed = sum(1 for s in scores if s.is_passed is True)
    avg_score = average_percentage(scores)

    history = []
    for s in scores:
        history.append({
            "id": str(s.id),
            "subject_id": str(s.subject_id) if s.subject_id else None,
            "marks_obtained": s.marks_obtained,
            "is_passed": s.is_passed,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        })

    log_view(user, "admin_reports.student", entity_id=str(student.id), metadata={})
    return {
        "student_id": str(student.id),
        "total_scores": total,
        "pass_rate": round((passed / total * 100) if total else 0, 2),
        "avg_score": avg_score,
        "history": history,
    }, 200
