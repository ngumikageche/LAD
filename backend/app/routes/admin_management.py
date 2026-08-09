from __future__ import annotations

import uuid
from flask import Blueprint, request
from sqlalchemy import and_, func
from sqlalchemy.exc import IntegrityError
from datetime import datetime

from ..extensions import db
from ..services.scoping import average_percentage, score_percentage
from ..models.user import User
from ..models.trainer import Trainer
from ..models.student import Student
from ..models.institution import Institution
from ..models.department import Department
from ..models.course import Course
from ..models.score import Score
from ..models.enrollment import Enrollment
from ..models.trainer_subject import TrainerSubject
from ..models.student_subject import StudentSubject
from .permissions import require_permission, log_view

bp = Blueprint("admin_management", __name__, url_prefix="/admin/management")


def _parse_uuid(value: str | None, field: str) -> uuid.UUID:
    if not value:
        raise ValueError(f"Missing '{field}'")
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError) as exc:
        raise ValueError(f"Invalid '{field}'") from exc


# ============================================================================
# TRAINER MANAGEMENT
# ============================================================================

@bp.post("/trainers/<trainer_id>/assign-departments")
def assign_trainer_departments(trainer_id: str):
    """
    Assign trainer to departments
    Body: {"department_ids": ["uuid1", "uuid2"]}
    """
    user, error, status = require_permission("admin.trainers.update")
    if error:
        return error, status

    try:
        trainer_uuid = _parse_uuid(trainer_id, "trainer_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    trainer = db.session.get(Trainer, trainer_uuid)
    if not trainer:
        return {"error": "Trainer not found"}, 404

    payload = request.get_json(silent=True) or {}
    department_ids = payload.get("department_ids", [])

    if not isinstance(department_ids, list):
        return {"error": "'department_ids' must be an array"}, 400

    # Validate all departments exist
    for dept_id_str in department_ids:
        try:
            dept_uuid = _parse_uuid(dept_id_str, "department_id")
            if not db.session.get(Department, dept_uuid):
                return {"error": f"Department {dept_id_str} not found"}, 404
        except ValueError as exc:
            return {"error": str(exc)}, 400

    # Update departments
    trainer.departments = []
    for dept_id_str in department_ids:
        dept_uuid = _parse_uuid(dept_id_str, "department_id")
        dept = db.session.get(Department, dept_uuid)
        if dept:
            trainer.departments.append(dept)

    db.session.commit()
    log_view(user, "trainer_assign_departments", entity_id=trainer_id, metadata={"departments_count": len(department_ids)})

    return {
        "trainer_id": str(trainer.id),
        "assigned_departments": len(trainer.departments),
    }, 200


@bp.get("/trainers/<trainer_id>/performance")
def trainer_performance(trainer_id: str):
    """
    Get trainer performance metrics
    Returns: students taught, avg student score, courses taught, etc.
    """
    user, error, status = require_permission("admin.trainers.read")
    if error:
        return error, status

    try:
        trainer_uuid = _parse_uuid(trainer_id, "trainer_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    trainer = db.session.get(Trainer, trainer_uuid)
    if not trainer:
        return {"error": "Trainer not found"}, 404

    # Get trainer's courses via TrainerCourse
    from ..models.trainer_course import TrainerCourse
    trainer_courses = db.session.query(TrainerCourse).filter(
        TrainerCourse.trainer_id == trainer_uuid
    ).all()

    course_ids = [tc.course_id for tc in trainer_courses]

    # Students in trainer's courses
    students_count = db.session.query(func.count(Student.id.distinct())).join(
        Enrollment, Enrollment.student_id == Student.id
    ).filter(
        and_(
            Enrollment.course_id.in_(course_ids) if course_ids else False,
            Student.deleted_at.is_(None),
            Enrollment.deleted_at.is_(None)
        )
    ).scalar() or 0

    # Average score of students in trainer's courses
    scores = db.session.query(Score).join(
        Enrollment, Enrollment.id == Score.enrollment_id
    ).filter(
        and_(
            Enrollment.course_id.in_(course_ids) if course_ids else False,
            Score.deleted_at.is_(None)
        )
    ).all()

    if scores:
        percentages = [value for value in (score_percentage(s) for s in scores) if value is not None]
        avg_student_score = sum(percentages) / len(percentages) if percentages else 0
        student_pass_rate = (sum(1 for s in scores if s.is_passed is True) / len(scores) * 100) if scores else 0
    else:
        avg_student_score = 0
        student_pass_rate = 0

    log_view(user, "trainer_performance", entity_id=trainer_id)

    return {
        "trainer_id": str(trainer.id),
        "trainer_name": trainer.user.name if trainer.user else "Unknown",
        "courses_count": len(course_ids),
        "students_taught": students_count,
        "total_assessments_created": db.session.query(func.count(Score.id)).filter(
            Score.enrollment_id.in_(
                db.session.query(Enrollment.id).filter(Enrollment.course_id.in_(course_ids)) if course_ids else []
            ),
            Score.deleted_at.is_(None)
        ).scalar() or 0,
        "avg_student_score": round(avg_student_score, 2),
        "student_pass_rate": round(student_pass_rate, 2),
    }, 200


# ============================================================================
# STUDENT MANAGEMENT & BULK OPERATIONS
# ============================================================================

@bp.post("/students/bulk-assign-courses")
def bulk_assign_courses():
    """
    Bulk assign students to courses
    Body: {"student_ids": ["uuid1", ...], "course_ids": ["uuid1", ...], "term_id": "uuid"}
    """
    user, error, status = require_permission("admin.students.update")
    if error:
        return error, status

    payload = request.get_json(silent=True) or {}
    student_ids = payload.get("student_ids", [])
    course_ids = payload.get("course_ids", [])
    term_id = payload.get("term_id")

    if not isinstance(student_ids, list) or not student_ids:
        return {"error": "'student_ids' must be a non-empty array"}, 400

    if not isinstance(course_ids, list) or not course_ids:
        return {"error": "'course_ids' must be a non-empty array"}, 400

    try:
        term_uuid = _parse_uuid(term_id, "term_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    # Validate students and courses exist
    from ..models.term import Term
    term = db.session.get(Term, term_uuid)
    if not term:
        return {"error": "Term not found"}, 404

    for student_id_str in student_ids:
        try:
            student_uuid = _parse_uuid(student_id_str, "student_id")
            if not db.session.get(Student, student_uuid):
                return {"error": f"Student {student_id_str} not found"}, 404
        except ValueError as exc:
            return {"error": str(exc)}, 400

    for course_id_str in course_ids:
        try:
            course_uuid = _parse_uuid(course_id_str, "course_id")
            if not db.session.get(Course, course_uuid):
                return {"error": f"Course {course_id_str} not found"}, 404
        except ValueError as exc:
            return {"error": str(exc)}, 400

    # Bulk assign
    created_count = 0
    skipped_count = 0

    for student_id_str in student_ids:
        student_uuid = _parse_uuid(student_id_str, "student_id")
        for course_id_str in course_ids:
            course_uuid = _parse_uuid(course_id_str, "course_id")
            
            # Check if already enrolled
            existing = db.session.query(Enrollment).filter(
                and_(
                    Enrollment.student_id == student_uuid,
                    Enrollment.course_id == course_uuid,
                    Enrollment.term_id == term_uuid,
                    Enrollment.deleted_at.is_(None)
                )
            ).first()

            if not existing:
                enrollment = Enrollment(
                    student_id=student_uuid,
                    course_id=course_uuid,
                    term_id=term_uuid,
                    status="active"
                )
                db.session.add(enrollment)
                created_count += 1
            else:
                skipped_count += 1

    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return {"error": "Failed to bulk assign courses"}, 409

    log_view(user, "bulk_assign_courses", metadata={
        "students_count": len(student_ids),
        "courses_count": len(course_ids),
        "created_count": created_count
    })

    return {
        "created_enrollments": created_count,
        "skipped_duplicates": skipped_count,
        "total_processed": len(student_ids) * len(course_ids),
    }, 201


@bp.put("/students/<student_id>/status")
def update_student_status(student_id: str):
    """
    Update student status (active, inactive, suspended)
    Body: {"status": "active|inactive|suspended"}
    """
    user, error, status = require_permission("admin.students.update")
    if error:
        return error, status

    try:
        student_uuid = _parse_uuid(student_id, "student_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    student = db.session.get(Student, student_uuid)
    if not student:
        return {"error": "Student not found"}, 404

    payload = request.get_json(silent=True) or {}
    new_status = payload.get("status")

    if new_status not in ["active", "inactive", "suspended"]:
        return {"error": "'status' must be one of: active, inactive, suspended"}, 400

    student.status = new_status
    db.session.commit()

    log_view(user, "update_student_status", entity_id=student_id, metadata={"new_status": new_status})

    return {
        "student_id": str(student.id),
        "status": student.status,
        "updated_at": datetime.utcnow().isoformat(),
    }, 200


@bp.get("/students/<student_id>/performance")
def student_admin_view(student_id: str):
    """
    Admin view of student performance (comprehensive)
    Returns: all scores, courses, enrolled terms, performance metrics
    """
    user, error, status = require_permission("admin.students.read")
    if error:
        return error, status

    try:
        student_uuid = _parse_uuid(student_id, "student_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    student = db.session.get(Student, student_uuid)
    if not student:
        return {"error": "Student not found"}, 404

    # Get enrollments
    enrollments = db.session.query(Enrollment).filter(
        and_(
            Enrollment.student_id == student_uuid,
            Enrollment.deleted_at.is_(None)
        )
    ).all()

    # Get scores
    scores = db.session.query(Score).join(
        Enrollment, Enrollment.id == Score.enrollment_id
    ).filter(
        and_(
            Enrollment.student_id == student_uuid,
            Score.deleted_at.is_(None)
        )
    ).all()

    # Analyze performance
    overall_avg = 0
    passed = 0
    failed = 0

    if scores:
        overall_avg = average_percentage(scores)
        passed = sum(1 for s in scores if s.is_passed is True)
        failed = sum(1 for s in scores if s.is_passed is False)

    # By course breakdown
    course_stats = []
    for enrollment in enrollments:
        course_scores = [s for s in scores if s.enrollment_id == enrollment.id]
        if course_scores:
            course_avg = average_percentage(course_scores)
            course_stats.append({
                "course_id": str(enrollment.course_id),
                "course_name": enrollment.course.name,
                "term": enrollment.term.name,
                "enrollment_status": enrollment.status,
                "scores_count": len(course_scores),
                "avg_score": round(course_avg, 2),
            })

    log_view(user, "student_admin_view", entity_id=student_id, metadata={"enrollments_count": len(enrollments)})

    return {
        "student_id": str(student.id),
        "student_name": student.user.name if student.user else "Unknown",
        "status": student.status if hasattr(student, 'status') else "unknown",
        "institution": student.institution.name if student.institution else None,
        "performance": {
            "overall_avg": round(overall_avg, 2),
            "passed": passed,
            "failed": failed,
            "total_assessments": len(scores),
        },
        "enrollments_count": len(enrollments),
        "courses": course_stats,
    }, 200


# ============================================================================
# SCORE MANAGEMENT & OVERRIDES
# ============================================================================

@bp.put("/scores/<score_id>/override")
def override_score(score_id: str):
    """
    Admin can override/correct a score
    Body: {"new_marks": 85, "reason": "Correction - calculation error"}
    """
    user, error, status = require_permission("admin.scores.update")
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
    new_marks = payload.get("new_marks")
    reason = payload.get("reason", "Admin override")

    if new_marks is None:
        return {"error": "'new_marks' is required"}, 400

    try:
        new_marks = float(new_marks)
    except (ValueError, TypeError):
        return {"error": "'new_marks' must be a number"}, 400

    # Validate marks
    # A score with no assessment is recorded out of 100.
    score_total = score.assessment.total_marks if score.assessment and score.assessment.total_marks else 100
    if new_marks < 0 or new_marks > score_total:
        return {"error": f"Marks must be between 0 and {score_total}"}, 400

    # Store old value for audit
    old_marks = score.marks_obtained

    # Update score
    score.marks_obtained = new_marks
    pass_marks = (
        score.assessment.pass_marks
        if score.assessment and score.assessment.pass_marks is not None
        else score_total * 0.5
    )
    score.is_passed = new_marks >= pass_marks

    # Grade calculation
    percentage = round(new_marks / score_total * 100, 2) if score_total > 0 else 0
    if percentage >= 90:
        score.grade = "A"
    elif percentage >= 80:
        score.grade = "B"
    elif percentage >= 70:
        score.grade = "C"
    elif percentage >= 60:
        score.grade = "D"
    else:
        score.grade = "F"

    # Log the override
    from ..models.system_log import SystemLog
    log_entry = SystemLog(
        user_id=user.id,
        action="score_override",
        entity_type="Score",
        entity_id=str(score.id),
        details={
            "old_marks": old_marks,
            "new_marks": new_marks,
            "reason": reason,
            "by_admin": user.name
        }
    )
    db.session.add(log_entry)
    db.session.commit()

    log_view(user, "score_override", entity_id=score_id, metadata={"old_marks": old_marks, "new_marks": new_marks})

    return {
        "score_id": str(score.id),
        "old_marks": old_marks,
        "new_marks": new_marks,
        "grade": score.grade,
        "is_passed": score.is_passed,
        "reason": reason,
        "overridden_by": user.name,
        "overridden_at": datetime.utcnow().isoformat(),
    }, 200


@bp.get("/scores/validation-issues")
def score_validation_issues():
    """
    Get all scores with potential issues
    Returns: duplicate scores, invalid scores, etc.
    """
    user, error, status = require_permission("admin.scores.read")
    if error:
        return error, status

    issues = {
        "duplicate_scores": [],
        "missing_grades": [],
        "invalid_assessments": [],
        "total_issues": 0,
    }

    # Find duplicate scores (same enrollment + assessment)
    duplicates = db.session.query(
        Enrollment.id,
        Score.assessment_id,
        func.count(Score.id).label('count')
    ).join(Score, Score.enrollment_id == Enrollment.id).group_by(
        Enrollment.id,
        Score.assessment_id
    ).having(func.count(Score.id) > 1).all()

    for enrollment_id, assessment_id, count in duplicates:
        duplicate_scores = db.session.query(Score).filter(
            and_(
                Score.enrollment_id == enrollment_id,
                Score.assessment_id == assessment_id,
                Score.deleted_at.is_(None)
            )
        ).all()

        for score in duplicate_scores:
            issues["duplicate_scores"].append({
                "score_id": str(score.id),
                "enrollment_id": str(enrollment_id),
                "assessment_id": str(assessment_id),
                "marks": score.marks_obtained,
                "created_at": score.created_at.isoformat(),
            })
            issues["total_issues"] += 1

    # Find scores without grades
    no_grade_scores = db.session.query(Score).filter(
        and_(
            Score.grade.is_(None),
            Score.deleted_at.is_(None)
        )
    ).all()

    for score in no_grade_scores[:10]:  # Limit to 10
        issues["missing_grades"].append({
            "score_id": str(score.id),
            "enrollment_id": str(score.enrollment_id),
            "marks": score.marks_obtained,
            "created_at": score.created_at.isoformat(),
        })
        issues["total_issues"] += 1

    log_view(user, "score_validation_issues", metadata={"issues_found": issues["total_issues"]})

    return issues, 200


# ============================================================================
# AUDIT & SECURITY
# ============================================================================

@bp.get("/system-logs")
def get_system_logs():
    """
    Get system audit logs (admin actions)
    Query params: limit, offset, user_id, action
    """
    user, error, status = require_permission("admin.audit.read")
    if error:
        return error, status

    from ..models.system_log import SystemLog

    limit = min(int(request.args.get("limit", 100)), 1000)
    offset = int(request.args.get("offset", 0))
    action_filter = request.args.get("action")
    user_id_filter = request.args.get("user_id")

    query = db.session.query(SystemLog)

    if action_filter:
        query = query.filter(SystemLog.action == action_filter)

    if user_id_filter:
        try:
            user_uuid = _parse_uuid(user_id_filter, "user_id")
            query = query.filter(SystemLog.user_id == user_uuid)
        except ValueError:
            return {"error": "Invalid user_id"}, 400

    logs = query.order_by(SystemLog.created_at.desc()).offset(offset).limit(limit).all()

    return [
        {
            "id": str(log.id),
            "user_id": str(log.user_id),
            "action": log.action,
            "entity_type": log.entity_type,
            "entity_id": log.entity_id,
            "details": log.details,
            "created_at": log.created_at.isoformat(),
        }
        for log in logs
    ], 200


@bp.post("/verify-data-integrity")
def verify_data_integrity():
    """
    Run data integrity checks
    Returns: issues found, recommendations
    """
    user, error, status = require_permission("admin.system.update")
    if error:
        return error, status

    issues = {
        "orphaned_enrollments": 0,
        "orphaned_scores": 0,
        "inconsistent_grades": 0,
        "issues_found": 0,
        "status": "OK",
    }

    # Check for orphaned enrollments (student or course not found)
    orphaned_enrollments = db.session.query(Enrollment).filter(
        and_(
            Enrollment.deleted_at.is_(None)
        )
    ).all()

    for enrollment in orphaned_enrollments:
        if not db.session.get(Student, enrollment.student_id) or not db.session.get(Course, enrollment.course_id):
            issues["orphaned_enrollments"] += 1
            issues["issues_found"] += 1

    # Check for orphaned scores
    orphaned_scores = db.session.query(Score).filter(
        Score.deleted_at.is_(None)
    ).all()

    for score in orphaned_scores:
        if not db.session.get(Enrollment, score.enrollment_id) or not db.session.get(Assessment, score.assessment_id):
            issues["orphaned_scores"] += 1
            issues["issues_found"] += 1

    # Check for inconsistent grades
    inconsistent = db.session.query(Score).filter(
        Score.deleted_at.is_(None)
    ).all()

    for score in inconsistent:
        percentage = score_percentage(score) or 0
        expected_grade = "A" if percentage >= 90 else "B" if percentage >= 80 else "C" if percentage >= 70 else "D" if percentage >= 60 else "F"

        if score.grade != expected_grade:
            issues["inconsistent_grades"] += 1
            issues["issues_found"] += 1

    if issues["issues_found"] > 0:
        issues["status"] = "ISSUES_FOUND"

    log_view(user, "verify_data_integrity", metadata=issues)

    return issues, 200
