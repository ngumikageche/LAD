from __future__ import annotations

import uuid
from flask import Blueprint, request
from sqlalchemy.exc import IntegrityError
from sqlalchemy import and_, func
from sqlalchemy.orm import joinedload
from datetime import datetime
from ..extensions import db
from ..models.score import Score
from ..models.assessment import Assessment
from ..models.enrollment import Enrollment
from ..models.student import Student
from ..models.trainer import Trainer
from ..models.course import Course
from ..models.notification import Notification
from ..models.subject import Subject
from .permissions import log_view, require_permission, get_current_user

bp = Blueprint('scores', __name__, url_prefix='/scores')


def _parse_uuid(value: str | None, field: str) -> uuid.UUID:
    if not value:
        raise ValueError(f"Missing '{field}'")
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError) as exc:
        raise ValueError(f"Invalid '{field}'") from exc


def _score_payload(score: Score) -> dict:
    return {
        "id": str(score.id),
        "student_id": str(score.student_id) if score.student_id else (str(score.enrollment.student_id) if score.enrollment else None),
        "enrollment_id": str(score.enrollment_id),
        "assessment_id": str(score.assessment_id),
        "marks_obtained": score.marks_obtained,
        "grade": score.grade,
        "feedback": score.feedback,
        "is_passed": score.is_passed,
        "assessment_name": score.assessment.name if score.assessment else None,
        "course_name": score.enrollment.course.name if score.enrollment and score.enrollment.course else None,
        "created_at": score.created_at.isoformat() if score.created_at else None,
    }


@bp.post("")
def create_score():
    """Create a new score (trainer uploads student scores)"""
    user, error, status = require_permission("scores.create")
    if error:
        return error, status

    payload = request.get_json(silent=True) or {}

    # Validate required fields
    try:
        enrollment_id = _parse_uuid(payload.get("enrollment_id"), "enrollment_id")
        assessment_id = _parse_uuid(payload.get("assessment_id"), "assessment_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    marks_obtained = payload.get("marks_obtained")
    if marks_obtained is None or not isinstance(marks_obtained, (int, float)):
        return {"error": "'marks_obtained' is required and must be a number"}, 400

    # Verify enrollment exists
    enrollment = db.session.get(Enrollment, enrollment_id)
    if not enrollment:
        return {"error": "Invalid 'enrollment_id'"}, 400

    # Verify assessment exists and get total marks
    assessment = db.session.get(Assessment, assessment_id)
    if not assessment:
        return {"error": "Invalid 'assessment_id'"}, 400

    # Validate marks against total
    if marks_obtained < 0 or marks_obtained > assessment.total_marks:
        return {
            "error": f"'marks_obtained' must be between 0 and {assessment.total_marks}"
        }, 400

    # Verify trainer has access to this course
    trainer = db.session.query(Trainer).filter(Trainer.user_id == user["id"]).first()
    if trainer:  # Only check if user is a trainer
        from ..models.trainer_course import TrainerCourse
        has_access = db.session.query(TrainerCourse).filter(
            and_(TrainerCourse.trainer_id == trainer.id, TrainerCourse.course_id == enrollment.course_id)
        ).first()
        if not has_access:
            return {"error": "You don't have access to this course"}, 403

    # Calculate grade if pass_marks is defined
    is_passed = None
    if assessment.pass_marks is not None:
        is_passed = marks_obtained >= assessment.pass_marks

    # Create score
    score = Score(
        enrollment_id=enrollment_id,
        assessment_id=assessment_id,
        marks_obtained=marks_obtained,
        is_passed=is_passed,
        feedback=payload.get("feedback"),
    )

    db.session.add(score)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return {"error": "Score already exists for this enrollment and assessment"}, 409

    db.session.refresh(score)

    # Create notification for student
    student = enrollment.student
    notification = Notification(
        user_id=student.user_id,
        title="New Score Available",
        message=f"Your score for {assessment.name} in {enrollment.course.name} is now available.",
        is_read=False,
    )
    db.session.add(notification)

    # Create alert if score is poor
    if is_passed is False:
        alert = Notification(
            user_id=student.user_id,
            title="Performance Alert",
            message=f"Your score in {enrollment.course.name} is below passing. Please take corrective action.",
            is_read=False,
        )
        db.session.add(alert)

    db.session.commit()

    log_view(user, "scores", entity_id=str(score.id), metadata={"action": "created"})
    return _score_payload(score), 201


@bp.put("/<score_id>")
def update_score(score_id: str):
    """Update an existing score"""
    user, error, status = require_permission("scores.update")
    if error:
        return error, status

    try:
        score_uuid = _parse_uuid(score_id, "score_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    score = db.session.get(Score, score_uuid)
    if not score:
        return {"error": "Score not found"}, 404

    # Verify trainer has access
    trainer = db.session.query(Trainer).filter(Trainer.user_id == user["id"]).first()
    if trainer:
        from ..models.trainer_course import TrainerCourse
        has_access = db.session.query(TrainerCourse).filter(
            and_(TrainerCourse.trainer_id == trainer.id, TrainerCourse.course_id == score.enrollment.course_id)
        ).first()
        if not has_access:
            return {"error": "You don't have access to this score"}, 403

    payload = request.get_json(silent=True) or {}

    # Update marks if provided
    if "marks_obtained" in payload:
        marks = payload.get("marks_obtained")
        if marks is None or not isinstance(marks, (int, float)):
            return {"error": "'marks_obtained' must be a number"}, 400
        if marks < 0 or marks > score.assessment.total_marks:
            return {
                "error": f"'marks_obtained' must be between 0 and {score.assessment.total_marks}"
            }, 400
        score.marks_obtained = marks

        # Recalculate pass status
        if score.assessment.pass_marks is not None:
            score.is_passed = marks >= score.assessment.pass_marks

    # Update feedback if provided
    if "feedback" in payload:
        score.feedback = payload.get("feedback")

    # Update grade if provided
    if "grade" in payload:
        score.grade = payload.get("grade")

    db.session.commit()

    log_view(user, "scores", entity_id=score_id, metadata={"action": "updated"})
    return _score_payload(score), 200


@bp.get("")
def list_scores():
    """List scores with optional filters"""
    user, error, status = require_permission("scores.read")
    if error:
        return error, status

    query = db.session.query(Score).order_by(Score.created_at.desc())
    query = query.options(
        joinedload(Score.enrollment),
        joinedload(Score.assessment),
    )

    # Filter by assessment
    assessment_id = request.args.get("assessment_id")
    if assessment_id:
        try:
            assessment_uuid = _parse_uuid(assessment_id, "assessment_id")
        except ValueError as exc:
            return {"error": str(exc)}, 400
        query = query.filter(Score.assessment_id == assessment_uuid)

    # Filter by enrollment
    enrollment_id = request.args.get("enrollment_id")
    if enrollment_id:
        try:
            enrollment_uuid = _parse_uuid(enrollment_id, "enrollment_id")
        except ValueError as exc:
            return {"error": str(exc)}, 400
        query = query.filter(Score.enrollment_id == enrollment_uuid)

    # Filter by course (for trainers)
    course_id = request.args.get("course_id")
    if course_id:
        try:
            course_uuid = _parse_uuid(course_id, "course_id")
        except ValueError as exc:
            return {"error": str(exc)}, 400
        query = query.join(Enrollment).filter(Enrollment.course_id == course_uuid)

    scores = query.all()
    log_view(user, "scores", metadata={"scope": "list"})
    return [_score_payload(score) for score in scores], 200


@bp.get("/<score_id>")
def get_score(score_id: str):
    """Get a specific score"""
    user, error, status = require_permission("scores.read")
    if error:
        return error, status

    try:
        score_uuid = _parse_uuid(score_id, "score_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    score = db.session.get(Score, score_uuid)
    if not score:
        return {"error": "Score not found"}, 404

    log_view(user, "scores", entity_id=score_id, metadata={"scope": "detail"})
    return _score_payload(score), 200


@bp.post("/<score_id>/feedback")
def add_feedback(score_id: str):
    """Add or update feedback for a score"""
    user, error, status = require_permission("scores.update")
    if error:
        return error, status

    try:
        score_uuid = _parse_uuid(score_id, "score_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    score = db.session.get(Score, score_uuid)
    if not score:
        return {"error": "Score not found"}, 404

    payload = request.get_json(silent=True) or {}
    feedback = payload.get("feedback")

    if not feedback or not isinstance(feedback, str):
        return {"error": "'feedback' is required and must be a string"}, 400

    score.feedback = feedback
    db.session.commit()

    # Notify student
    student = score.enrollment.student
    notification = Notification(
        user_id=student.user_id,
        title="New Feedback",
        message=f"Your trainer has provided feedback for {score.assessment.name}",
        is_read=False,
    )
    db.session.add(notification)
    db.session.commit()

    log_view(user, "scores", entity_id=score_id, metadata={"action": "added_feedback"})
    return _score_payload(score), 200


# ==================== CURRENT USER SCORE ENDPOINTS (students viewing own scores) ====================

@bp.get("/me/scores")
def get_my_scores():
    """Get all scores for the current authenticated student"""
    user, error, status = get_current_user()
    if error:
        return error, status
    
    # Find student record for this user
    student = db.session.query(Student).filter(Student.user_id == user.id).first()
    if not student:
        return {"error": "Student record not found"}, 404
    
    # Get all scores for this student's enrollments
    scores = db.session.query(Score).join(
        Enrollment, Enrollment.id == Score.enrollment_id
    ).filter(
        Enrollment.student_id == student.id
    ).order_by(Score.created_at.desc()).all()
    
    log_view(user, "scores.me", metadata={"count": len(scores)})
    return {
        "student_id": str(student.id),
        "scores": [_score_payload(score) for score in scores],
        "total": len(scores),
        "average": round(sum(s.marks_obtained for s in scores if s.marks_obtained) / len([s for s in scores if s.marks_obtained]), 2) if any(s.marks_obtained for s in scores) else 0
    }, 200


@bp.get("/me/subjects/<subject_id>/scores")
def get_my_subject_scores(subject_id: str):
    """Get scores for the current student in a specific subject"""
    user, error, status = get_current_user()
    if error:
        return error, status
    
    try:
        subject_uuid = _parse_uuid(subject_id, "subject_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400
    
    # Find student record
    student = db.session.query(Student).filter(Student.user_id == user.id).first()
    if not student:
        return {"error": "Student record not found"}, 404
    
    # Verify student is enrolled in this subject
    from ..models.student_subject import StudentSubject
    enrollment = db.session.query(StudentSubject).filter(
        and_(
            StudentSubject.student_id == student.id,
            StudentSubject.subject_id == subject_uuid
        )
    ).first()
    if not enrollment:
        return {"error": "You are not enrolled in this subject"}, 403
    
    # Get subject details
    subject = db.session.get(Subject, subject_uuid)
    if not subject:
        return {"error": "Subject not found"}, 404
    
    # Get scores related to this subject - only for this student's enrollments
    # Assessments are in the same module as the subject
    scores = db.session.query(Score).join(
        Enrollment, Enrollment.id == Score.enrollment_id
    ).join(
        Assessment, Assessment.id == Score.assessment_id
    ).filter(
        and_(
            Enrollment.student_id == student.id,
            Assessment.module_id == subject.module_id
        )
    ).order_by(Score.created_at.desc()).all()
    
    # Group scores by term (from enrollment.term)
    scores_by_term = {}
    total_marks = 0
    count = 0
    
    for score in scores:
        term_key = score.enrollment.term or "unspecified"
        if term_key not in scores_by_term:
            scores_by_term[term_key] = []
        
        score_payload = {
            "id": str(score.id),
            "score": score.marks_obtained,
            "recorded_at": score.created_at.isoformat() if score.created_at else None,
            "competency": {
                "id": str(score.assessment.id),
                "name": score.assessment.name
            }
        }
        scores_by_term[term_key].append(score_payload)
        total_marks += score.marks_obtained
        count += 1
    
    average = round(total_marks / count, 2) if count > 0 else 0
    
    log_view(user, "scores.me.subject", entity_id=subject_id, metadata={"count": len(scores)})
    return {
        "student_id": str(student.id),
        "subject_id": str(subject_uuid),
        "subject_name": subject.name,
        "scores_by_term": scores_by_term,
        "total_scores": len(scores),
        "average": average
    }, 200


@bp.get("/me/term/<term>")
def get_my_scores_by_term(term: str):
    """Get all scores for the current student in a specific term"""
    user, error, status = get_current_user()
    if error:
        return error, status
    
    # Find student record
    student = db.session.query(Student).filter(Student.user_id == user.id).first()
    if not student:
        return {"error": "Student record not found"}, 404
    
    # Get scores from enrollments in this term
    scores = db.session.query(Score).join(
        Enrollment, Enrollment.id == Score.enrollment_id
    ).filter(
        and_(
            Enrollment.student_id == student.id,
            Enrollment.term == term
        )
    ).order_by(Score.created_at.desc()).all()
    
    # Format scores with module information
    formatted_scores = []
    total_marks = 0
    for score in scores:
        score_payload = {
            "id": str(score.id),
            "score": score.marks_obtained,
            "recorded_at": score.created_at.isoformat() if score.created_at else None,
            "competency": {
                "id": str(score.assessment.id),
                "name": score.assessment.name
            },
            "module": {
                "id": str(score.assessment.module_id) if score.assessment.module_id else "",
                "name": score.assessment.module.name if score.assessment.module else "Unknown"
            }
        }
        formatted_scores.append(score_payload)
        total_marks += score.marks_obtained
    
    average = round(total_marks / len(scores), 2) if scores else 0
    
    log_view(user, "scores.me.term", entity_id=term, metadata={"count": len(scores)})
    return {
        "student_id": str(student.id),
        "term": term,
        "scores": formatted_scores,
        "total": len(scores),
        "average": average
    }, 200


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
