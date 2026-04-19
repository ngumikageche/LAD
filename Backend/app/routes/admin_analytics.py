from __future__ import annotations

import uuid
from flask import Blueprint, request
from sqlalchemy import func, and_
from datetime import datetime, timedelta

from ..extensions import db
from ..models.score import Score
from ..models.assessment import Assessment
from ..models.enrollment import Enrollment
from ..models.course import Course
from ..models.student import Student
from ..models.trainer import Trainer
from ..models.user import User
from ..models.institution import Institution
from ..models.department import Department
from ..models.term import Term
from .permissions import require_permission, log_view

bp = Blueprint("admin_analytics", __name__, url_prefix="/admin/analytics")


def _parse_uuid(value: str | None, field: str) -> uuid.UUID:
    if not value:
        raise ValueError(f"Missing '{field}'")
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError) as exc:
        raise ValueError(f"Invalid '{field}'") from exc


@bp.get("/dashboard")
def admin_dashboard():
    """
    Get admin dashboard with system-wide metrics
    Returns: total students, trainers, institutions, pass rate, avg score, etc.
    """
    user, error, status = require_permission("admin.analytics.read")
    if error:
        return error, status

    # Count entities
    total_students = db.session.query(func.count(Student.id)).filter(
        Student.deleted_at.is_(None)
    ).scalar() or 0

    total_trainers = db.session.query(func.count(Trainer.id)).filter(
        Trainer.deleted_at.is_(None)
    ).scalar() or 0

    total_institutions = db.session.query(func.count(Institution.id)).filter(
        Institution.deleted_at.is_(None)
    ).scalar() or 0

    total_departments = db.session.query(func.count(Department.id)).filter(
        Department.deleted_at.is_(None)
    ).scalar() or 0

    total_courses = db.session.query(func.count(Course.id)).filter(
        Course.deleted_at.is_(None)
    ).scalar() or 0

    # Score statistics
    scores = db.session.query(Score).filter(Score.deleted_at.is_(None)).all()
    
    total_assessments = len(scores)
    passed_count = sum(1 for s in scores if s.is_passed is True)
    failed_count = sum(1 for s in scores if s.is_passed is False)
    
    overall_pass_rate = (passed_count / total_assessments * 100) if total_assessments > 0 else 0
    overall_avg = (sum(s.marks_obtained for s in scores) / sum(s.assessment.total_marks for s in scores if s.assessment) * 100) if scores else 0

    # Recent scores (last 7 days)
    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    recent_scores = db.session.query(Score).filter(
        and_(
            Score.created_at >= seven_days_ago,
            Score.deleted_at.is_(None)
        )
    ).all()

    # Active terms
    active_terms = db.session.query(func.count(Term.id)).filter(
        and_(
            Term.is_active == True,
            Term.deleted_at.is_(None)
        )
    ).scalar() or 0

    log_view(user, "admin_dashboard", metadata={"scope": "system_overview"})

    return {
        "system_overview": {
            "total_students": total_students,
            "total_trainers": total_trainers,
            "total_institutions": total_institutions,
            "total_departments": total_departments,
            "total_courses": total_courses,
            "active_terms": active_terms,
        },
        "academic_metrics": {
            "total_assessments": total_assessments,
            "passed_count": passed_count,
            "failed_count": failed_count,
            "overall_pass_rate": round(overall_pass_rate, 2),
            "overall_avg": round(overall_avg, 2),
        },
        "recent_activity": {
            "scores_in_last_7_days": len(recent_scores),
        },
        "timestamp": datetime.utcnow().isoformat(),
    }, 200


@bp.get("/institutions")
def list_institution_analytics():
    """
    Get performance analytics for all institutions
    Returns: institution names, student count, pass rate, avg score
    """
    user, error, status = require_permission("admin.analytics.read")
    if error:
        return error, status

    institutions = db.session.query(Institution).filter(
        Institution.deleted_at.is_(None)
    ).all()

    results = []
    for institution in institutions:
        # Students in institution
        students_count = db.session.query(func.count(Student.id)).filter(
            and_(
                Student.institution_id == institution.id,
                Student.deleted_at.is_(None)
            )
        ).scalar() or 0

        # Scores from institution's students
        scores = db.session.query(Score).join(
            Enrollment, Enrollment.id == Score.enrollment_id
        ).join(
            Student, Student.id == Enrollment.student_id
        ).filter(
            and_(
                Student.institution_id == institution.id,
                Score.deleted_at.is_(None)
            )
        ).all()

        if scores:
            passed = sum(1 for s in scores if s.is_passed is True)
            total = len(scores)
            pass_rate = (passed / total * 100) if total > 0 else 0
            avg_score = (sum(s.marks_obtained for s in scores) / sum(s.assessment.total_marks for s in scores if s.assessment) * 100) if scores else 0
        else:
            pass_rate = 0
            avg_score = 0

        results.append({
            "institution_id": str(institution.id),
            "name": institution.name,
            "students_count": students_count,
            "scores_count": len(scores),
            "pass_rate": round(pass_rate, 2),
            "avg_score": round(avg_score, 2),
        })

    log_view(user, "institutions_analytics", metadata={"scope": "list"})
    return results, 200


@bp.get("/departments")
def list_department_analytics():
    """
    Get performance analytics for all departments
    Returns: department names, courses, students, pass rate, avg score
    """
    user, error, status = require_permission("admin.analytics.read")
    if error:
        return error, status

    departments = db.session.query(Department).filter(
        Department.deleted_at.is_(None)
    ).all()

    results = []
    for dept in departments:
        # Courses in department
        courses_count = db.session.query(func.count(Course.id)).filter(
            and_(
                Course.department_id == dept.id,
                Course.deleted_at.is_(None)
            )
        ).scalar() or 0

        # Students enrolled in dept courses
        students_count = db.session.query(func.count(Student.id.distinct())).join(
            Enrollment, Enrollment.student_id == Student.id
        ).join(
            Course, Course.id == Enrollment.course_id
        ).filter(
            and_(
                Course.department_id == dept.id,
                Student.deleted_at.is_(None),
                Enrollment.deleted_at.is_(None)
            )
        ).scalar() or 0

        # Scores from dept courses
        scores = db.session.query(Score).join(
            Enrollment, Enrollment.id == Score.enrollment_id
        ).join(
            Course, Course.id == Enrollment.course_id
        ).filter(
            and_(
                Course.department_id == dept.id,
                Score.deleted_at.is_(None)
            )
        ).all()

        if scores:
            passed = sum(1 for s in scores if s.is_passed is True)
            total = len(scores)
            pass_rate = (passed / total * 100) if total > 0 else 0
            avg_score = (sum(s.marks_obtained for s in scores) / sum(s.assessment.total_marks for s in scores if s.assessment) * 100) if scores else 0
        else:
            pass_rate = 0
            avg_score = 0

        results.append({
            "department_id": str(dept.id),
            "name": dept.name,
            "institution_id": str(dept.institution_id),
            "courses_count": courses_count,
            "students_count": students_count,
            "scores_count": len(scores),
            "pass_rate": round(pass_rate, 2),
            "avg_score": round(avg_score, 2),
        })

    log_view(user, "departments_analytics", metadata={"scope": "list"})
    return results, 200


@bp.get("/courses")
def list_course_analytics():
    """
    Get performance analytics for all courses
    Returns: course names, enrolled students, pass rate, avg score
    """
    user, error, status = require_permission("admin.analytics.read")
    if error:
        return error, status

    courses = db.session.query(Course).filter(
        Course.deleted_at.is_(None)
    ).all()

    results = []
    for course in courses:
        # Enrollments in course
        enrolled = db.session.query(func.count(Enrollment.id)).filter(
            and_(
                Enrollment.course_id == course.id,
                Enrollment.deleted_at.is_(None)
            )
        ).scalar() or 0

        # Scores for course
        scores = db.session.query(Score).join(
            Enrollment, Enrollment.id == Score.enrollment_id
        ).filter(
            and_(
                Enrollment.course_id == course.id,
                Score.deleted_at.is_(None)
            )
        ).all()

        if scores:
            passed = sum(1 for s in scores if s.is_passed is True)
            total = len(scores)
            pass_rate = (passed / total * 100) if total > 0 else 0
            avg_score = (sum(s.marks_obtained for s in scores) / sum(s.assessment.total_marks for s in scores if s.assessment) * 100) if scores else 0
        else:
            pass_rate = 0
            avg_score = 0

        results.append({
            "course_id": str(course.id),
            "name": course.name,
            "department_id": str(course.department_id),
            "enrolled_count": enrolled,
            "scores_count": len(scores),
            "pass_rate": round(pass_rate, 2),
            "avg_score": round(avg_score, 2),
        })

    log_view(user, "courses_analytics", metadata={"scope": "list"})
    return results, 200


@bp.get("/comparisons")
def analytics_comparisons():
    """
    Get comparative analytics
    Returns: top performing institutions/departments, bottom performers
    """
    user, error, status = require_permission("admin.analytics.read")
    if error:
        return error, status

    # Institutions comparison
    institutions = db.session.query(Institution).filter(
        Institution.deleted_at.is_(None)
    ).all()

    inst_performance = []
    for inst in institutions:
        scores = db.session.query(Score).join(
            Enrollment, Enrollment.id == Score.enrollment_id
        ).join(
            Student, Student.id == Enrollment.student_id
        ).filter(
            and_(
                Student.institution_id == inst.id,
                Score.deleted_at.is_(None)
            )
        ).all()

        if scores:
            avg_score = (sum(s.marks_obtained for s in scores) / sum(s.assessment.total_marks for s in scores if s.assessment) * 100) if scores else 0
            inst_performance.append({
                "institution_id": str(inst.id),
                "name": inst.name,
                "avg_score": round(avg_score, 2),
                "scores_count": len(scores),
            })

    # Sort and get top/bottom
    inst_performance.sort(key=lambda x: x["avg_score"], reverse=True)

    # Departments comparison
    departments = db.session.query(Department).filter(
        Department.deleted_at.is_(None)
    ).all()

    dept_performance = []
    for dept in departments:
        scores = db.session.query(Score).join(
            Enrollment, Enrollment.id == Score.enrollment_id
        ).join(
            Course, Course.id == Enrollment.course_id
        ).filter(
            and_(
                Course.department_id == dept.id,
                Score.deleted_at.is_(None)
            )
        ).all()

        if scores:
            avg_score = (sum(s.marks_obtained for s in scores) / sum(s.assessment.total_marks for s in scores if s.assessment) * 100) if scores else 0
            dept_performance.append({
                "department_id": str(dept.id),
                "name": dept.name,
                "avg_score": round(avg_score, 2),
                "scores_count": len(scores),
            })

    dept_performance.sort(key=lambda x: x["avg_score"], reverse=True)

    log_view(user, "analytics_comparisons", metadata={"scope": "comparative"})

    return {
        "top_institutions": inst_performance[:5],
        "bottom_institutions": inst_performance[-5:] if len(inst_performance) > 5 else inst_performance,
        "top_departments": dept_performance[:5],
        "bottom_departments": dept_performance[-5:] if len(dept_performance) > 5 else dept_performance,
    }, 200


@bp.get("/system-wide-report")
def system_wide_report():
    """
    Get comprehensive system-wide report
    Returns: full statistics across system
    """
    user, error, status = require_permission("admin.analytics.read")
    if error:
        return error, status

    # Total counts
    total_students = db.session.query(func.count(Student.id)).filter(
        Student.deleted_at.is_(None)
    ).scalar() or 0

    total_trainers = db.session.query(func.count(Trainer.id)).filter(
        Trainer.deleted_at.is_(None)
    ).scalar() or 0

    total_users = db.session.query(func.count(User.id)).filter(
        User.deleted_at.is_(None)
    ).scalar() or 0

    total_institutions = db.session.query(func.count(Institution.id)).filter(
        Institution.deleted_at.is_(None)
    ).scalar() or 0

    total_departments = db.session.query(func.count(Department.id)).filter(
        Department.deleted_at.is_(None)
    ).scalar() or 0

    total_courses = db.session.query(func.count(Course.id)).filter(
        Course.deleted_at.is_(None)
    ).scalar() or 0

    total_assessments = db.session.query(func.count(Assessment.id)).filter(
        Assessment.deleted_at.is_(None)
    ).scalar() or 0

    # Score statistics
    scores = db.session.query(Score).filter(Score.deleted_at.is_(None)).all()
    passed = sum(1 for s in scores if s.is_passed is True)
    failed = sum(1 for s in scores if s.is_passed is False)
    total_scores = len(scores)
    
    if total_scores > 0:
        pass_rate = (passed / total_scores * 100)
        avg_score = (sum(s.marks_obtained for s in scores) / sum(s.assessment.total_marks for s in scores if s.assessment) * 100)
    else:
        pass_rate = 0
        avg_score = 0

    # By term
    terms = db.session.query(Term).filter(Term.deleted_at.is_(None)).all()
    term_stats = []
    for term in terms:
        term_scores = db.session.query(Score).join(
            Enrollment, Enrollment.id == Score.enrollment_id
        ).filter(
            and_(
                Enrollment.term_id == term.id,
                Score.deleted_at.is_(None)
            )
        ).all()

        if term_scores:
            term_passed = sum(1 for s in term_scores if s.is_passed is True)
            term_avg = (sum(s.marks_obtained for s in term_scores) / sum(s.assessment.total_marks for s in term_scores if s.assessment) * 100)
        else:
            term_passed = 0
            term_avg = 0

        term_stats.append({
            "term_id": str(term.id),
            "term_name": term.name,
            "is_active": term.is_active,
            "scores_count": len(term_scores),
            "pass_rate": round((term_passed / len(term_scores) * 100) if term_scores else 0, 2),
            "avg_score": round(term_avg, 2),
        })

    log_view(user, "system_wide_report", metadata={"scope": "report"})

    return {
        "total_counts": {
            "students": total_students,
            "trainers": total_trainers,
            "users": total_users,
            "institutions": total_institutions,
            "departments": total_departments,
            "courses": total_courses,
            "assessments": total_assessments,
        },
        "academic_statistics": {
            "total_scores": total_scores,
            "passed": passed,
            "failed": failed,
            "pass_rate": round(pass_rate, 2),
            "avg_score": round(avg_score, 2),
        },
        "by_term": term_stats,
        "generated_at": datetime.utcnow().isoformat(),
    }, 200
