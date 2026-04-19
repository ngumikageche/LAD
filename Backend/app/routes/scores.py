from __future__ import annotations

import uuid
from flask import Blueprint, request
from sqlalchemy.exc import IntegrityError
from sqlalchemy import and_, func
from datetime import datetime
from ..extensions import db
from ..models.assessment import Assessment
from ..models.student import Student
from ..models.trainer import Trainer
from ..models.module import Module
from ..models.subject import Subject
from ..models.competency import Competency
from ..models.student_subject import StudentSubject
from .permissions import log_view, require_permission
from flask_cors import cross_origin

bp = Blueprint('scores', __name__, url_prefix='/scores')


def _parse_uuid(value: str | None, field: str) -> uuid.UUID:
    if not value:
        raise ValueError(f"Missing '{field}'")
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError) as exc:
        raise ValueError(f"Invalid '{field}'") from exc


def _assessment_payload(assessment: Assessment) -> dict:
    """Build assessment payload with related details"""
    return {
        "id": str(assessment.id),
        "student_id": str(assessment.student_id),
        "trainer_id": str(assessment.trainer_id),
        "module_id": str(assessment.module_id),
        "competency_id": str(assessment.competency_id),
        "score": assessment.score,
        "performance_level": assessment.performance_level,
        "status": assessment.status,
        "recorded_at": assessment.recorded_at.isoformat() if assessment.recorded_at else None,
        "source": assessment.source,
        "term": assessment.term if hasattr(assessment, 'term') else None,
        "competency": {
            "id": str(assessment.competency.id),
            "name": assessment.competency.name,
        } if assessment.competency else None,
        "module": {
            "id": str(assessment.module.id),
            "name": assessment.module.name,
        } if assessment.module else None,
    }


@bp.post("")
@cross_origin()
def create_score():
    """Create an assessment/score for a student
    
    Supports User Story: "As a student, I want to see my grades for each assessment"
    """
    _, error, status = require_permission("scores.create")
    if error:
        return error, status
    
    payload = request.get_json(silent=True) or {}
    student_id = payload.get("student_id")
    trainer_id = payload.get("trainer_id")
    module_id = payload.get("module_id")
    competency_id = payload.get("competency_id")
    assessment_tasks = payload.get("assessment_tasks")
    performance_level = payload.get("performance_level")
    score = payload.get("score")
    term = payload.get("term")
    
    # Validate required fields
    if not all([student_id, trainer_id, module_id, score is not None]):
        return {
            "error": "Missing required fields: student_id, trainer_id, module_id, score"
        }, 400
    
    # Parse UUIDs
    try:
        student_uuid = _parse_uuid(student_id, "student_id")
        trainer_uuid = _parse_uuid(trainer_id, "trainer_id")
        module_uuid = _parse_uuid(module_id, "module_id")
        competency_uuid = _parse_uuid(competency_id, "competency_id") if competency_id else None
    except ValueError as exc:
        return {"error": str(exc)}, 400
    
    # Validate score value
    try:
        score = float(score)
        if not 0 <= score <= 100:
            return {"error": "Score must be between 0 and 100"}, 400
    except (ValueError, TypeError):
        return {"error": "Score must be a valid number"}, 400
    
    # Verify entities exist
    if not db.session.get(Student, student_uuid):
        return {"error": "Student not found"}, 404
    if not db.session.get(Trainer, trainer_uuid):
        return {"error": "Trainer not found"}, 404
    if not db.session.get(Module, module_uuid):
        return {"error": "Module not found"}, 404
    # Resolve or create competency if needed
    if competency_uuid:
        if not db.session.get(Competency, competency_uuid):
            return {"error": "Competency not found"}, 404
    else:
        # Always create a new competency with a generated unique 5-digit name
        import random

        def _generate_name():
            return f"C{random.randint(10000, 99999)}"

        for _ in range(10):
            name_candidate = _generate_name()
            exists = db.session.query(Competency.id).filter(Competency.name == name_candidate).first()
            if not exists:
                break
        else:
            return {"error": "Unable to generate unique competency name"}, 500

        comp = Competency(
            module_id=module_uuid,
            name=name_candidate,
            description=None,
            expected_outcome=None,
            mastery_threshold=payload.get('mastery_threshold') or 100.0,
            assessment_tasks=assessment_tasks if assessment_tasks else None,
            performance_levels={"4":"EE","3":"ME","2":"AE","1":"BE"}
        )
        db.session.add(comp)
        try:
            db.session.commit()
        except Exception:
            db.session.rollback()
            return {"error": "Failed creating competency"}, 500
        competency_uuid = comp.id
    
    try:
        assessment = Assessment(
            student_id=student_uuid,
            trainer_id=trainer_uuid,
            module_id=module_uuid,
            competency_id=competency_uuid,
            score=score,
            status=payload.get("status", "active"),
            recorded_at=datetime.utcnow(),
            source=payload.get("source", "manual"),
            term=term,
            performance_level=int(performance_level) if performance_level is not None else None
        )
        db.session.add(assessment)
        db.session.commit()
        return _assessment_payload(assessment), 201
    except IntegrityError:
        db.session.rollback()
        return {"error": "Assessment already exists"}, 409
    except Exception as e:
        db.session.rollback()
        return {"error": str(e)}, 500


@bp.get("")
def list_scores():
    """List all scores with optional filtering by student/module/term"""
    _, error, status = require_permission("scores.read")
    if error:
        return error, status
    
    query = db.session.query(Assessment)
    
    # Optional filters
    student_id = request.args.get("student_id")
    module_id = request.args.get("module_id")
    term = request.args.get("term")
    
    try:
        if student_id:
            student_uuid = _parse_uuid(student_id, "student_id")
            query = query.filter(Assessment.student_id == student_uuid)
        if module_id:
            module_uuid = _parse_uuid(module_id, "module_id")
            query = query.filter(Assessment.module_id == module_uuid)
        if term:
            query = query.filter(Assessment.term == term)
    except ValueError as exc:
        return {"error": str(exc)}, 400
    
    assessments = query.order_by(Assessment.recorded_at.desc()).all()
    log_view(None, "scores", metadata={"scope": "list", "filters": {"student": student_id, "module": module_id, "term": term}})
    
    return {
        "scores": [_assessment_payload(a) for a in assessments],
        "total": len(assessments)
    }, 200


@bp.get("/<assessment_id>")
def get_score(assessment_id: str):
    """Get a specific assessment/score"""
    _, error, status = require_permission("scores.read")
    if error:
        return error, status
    
    try:
        assessment_uuid = _parse_uuid(assessment_id, "assessment_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400
    
    assessment = db.session.get(Assessment, assessment_uuid)
    if not assessment:
        return {"error": "Assessment not found"}, 404
    
    log_view(None, "scores", entity_id=assessment_id)
    return _assessment_payload(assessment), 200


@bp.put("/<assessment_id>")
def update_score(assessment_id: str):
    """Update an assessment/score"""
    _, error, status = require_permission("scores.update")
    if error:
        return error, status
    
    try:
        assessment_uuid = _parse_uuid(assessment_id, "assessment_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400
    
    assessment = db.session.get(Assessment, assessment_uuid)
    if not assessment:
        return {"error": "Assessment not found"}, 404
    
    payload = request.get_json(silent=True) or {}
    
    if "score" in payload:
        try:
            score = float(payload["score"])
            if not 0 <= score <= 100:
                return {"error": "Score must be between 0 and 100"}, 400
            assessment.score = score
        except (ValueError, TypeError):
            return {"error": "Score must be a valid number"}, 400
    
    if "status" in payload:
        assessment.status = payload["status"]
    
    if "term" in payload:
        assessment.term = payload["term"]
    
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return {"error": str(e)}, 500
    
    return _assessment_payload(assessment), 200


@bp.delete("/<assessment_id>")
def delete_score(assessment_id: str):
    """Delete an assessment/score"""
    _, error, status = require_permission("scores.delete")
    if error:
        return error, status
    
    try:
        assessment_uuid = _parse_uuid(assessment_id, "assessment_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400
    
    assessment = db.session.get(Assessment, assessment_uuid)
    if not assessment:
        return {"error": "Assessment not found"}, 404
    
    db.session.delete(assessment)
    db.session.commit()
    return {"status": "deleted"}, 200


# ==================== STUDENT-SPECIFIC SCORE ENDPOINTS ====================

@bp.get("/student/<student_id>/scores")
def get_student_scores(student_id: str):
    """Get all scores for a specific student
    
    Supports User Story: "As a student, I want to view my scores per subject"
    """
    _, error, status = require_permission("scores.read")
    if error:
        return error, status
    
    try:
        student_uuid = _parse_uuid(student_id, "student_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400
    
    student = db.session.get(Student, student_uuid)
    if not student:
        return {"error": "Student not found"}, 404
    
    # Get all assessments for this student
    assessments = db.session.query(Assessment).filter(
        Assessment.student_id == student_uuid
    ).order_by(Assessment.recorded_at.desc()).all()
    
    log_view(None, "student.scores", entity_id=student_id)
    return {
        "student_id": str(student_uuid),
        "scores": [_assessment_payload(a) for a in assessments],
        "total": len(assessments),
        "average": round(sum(a.score for a in assessments) / len(assessments), 2) if assessments else 0
    }, 200


@bp.get("/student/<student_id>/subjects/<subject_id>/scores")
def get_student_subject_scores(student_id: str, subject_id: str):
    """Get scores for a student in a specific subject
    
    Supports User Story: "As a student, I want to see my scores by term"
    """
    _, error, status = require_permission("scores.read")
    if error:
        return error, status
    
    try:
        student_uuid = _parse_uuid(student_id, "student_id")
        subject_uuid = _parse_uuid(subject_id, "subject_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400
    
    # Verify student and subject exist
    student = db.session.get(Student, student_uuid)
    if not student:
        return {"error": "Student not found"}, 404
    
    subject = db.session.get(Subject, subject_uuid)
    if not subject:
        return {"error": "Subject not found"}, 404
    
    # Verify student is enrolled in this subject
    enrollment = db.session.query(StudentSubject).filter(
        and_(
            StudentSubject.student_id == student_uuid,
            StudentSubject.subject_id == subject_uuid
        )
    ).first()
    if not enrollment:
        return {"error": "Student not enrolled in this subject"}, 403
    
    # Get all assessments for this module (subject's parent module)
    assessments = db.session.query(Assessment).filter(
        and_(
            Assessment.student_id == student_uuid,
            Assessment.module_id == subject.module_id
        )
    ).order_by(Assessment.recorded_at.desc()).all()
    
    # Group by term
    scores_by_term = {}
    for assessment in assessments:
        term_key = assessment.term or "unspecified"
        if term_key not in scores_by_term:
            scores_by_term[term_key] = []
        scores_by_term[term_key].append(_assessment_payload(assessment))
    
    log_view(None, "student.subject_scores", entity_id=f"{student_id}/{subject_id}")
    
    return {
        "student_id": str(student_uuid),
        "subject_id": str(subject_uuid),
        "subject_name": subject.name,
        "scores_by_term": scores_by_term,
        "total_scores": len(assessments),
        "average": round(sum(a.score for a in assessments) / len(assessments), 2) if assessments else 0
    }, 200


@bp.get("/student/<student_id>/term/<term>")
def get_student_scores_by_term(student_id: str, term: str):
    """Get all scores for a student in a specific term
    
    Supports User Story: "As a student, I want to see my scores by term so that I can track my progress over time"
    """
    _, error, status = require_permission("scores.read")
    if error:
        return error, status
    
    try:
        student_uuid = _parse_uuid(student_id, "student_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400
    
    student = db.session.get(Student, student_uuid)
    if not student:
        return {"error": "Student not found"}, 404
    
    # Get assessments filtered by term
    assessments = db.session.query(Assessment).filter(
        and_(
            Assessment.student_id == student_uuid,
            Assessment.term == term
        )
    ).order_by(Assessment.recorded_at.desc()).all()
    
    log_view(None, "student.term_scores", entity_id=f"{student_id}/{term}")
    
    return {
        "student_id": str(student_uuid),
        "term": term,
        "scores": [_assessment_payload(a) for a in assessments],
        "total": len(assessments),
        "average": round(sum(a.score for a in assessments) / len(assessments), 2) if assessments else 0
    }, 200
