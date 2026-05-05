from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from flask import Blueprint, request
from sqlalchemy import func, and_, case

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
from ..services.learning_analytics import build_role_dashboard

bp = Blueprint("admin_analytics", __name__, url_prefix="/admin/analytics")


def _parse_uuid(value: str | None, field: str) -> uuid.UUID:
    if not value:
        raise ValueError(f"Missing '{field}'")
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError) as exc:
        raise ValueError(f"Invalid '{field}'") from exc


def _score_agg(filter_clause):
    """Return (total, passed, avg_marks) using SQL aggregation."""
    row = db.session.query(
        func.count(Score.id).label("total"),
        func.sum(case((Score.is_passed == True, 1), else_=0)).label("passed"),
        func.avg(Score.marks_obtained).label("avg_marks"),
    ).filter(filter_clause, Score.deleted_at.is_(None)).one()
    total = int(row.total or 0)
    passed = int(row.passed or 0)
    avg = round(float(row.avg_marks or 0), 2)
    pass_rate = round(passed / total * 100, 2) if total > 0 else 0.0
    return total, passed, avg, pass_rate


@bp.get("/dashboard")
def admin_dashboard():
    user, error, status = require_permission("admin.analytics.read")
    if error:
        return error, status

    total_students = db.session.query(func.count(Student.id)).filter(Student.deleted_at.is_(None)).scalar() or 0
    total_trainers = db.session.query(func.count(Trainer.id)).filter(Trainer.deleted_at.is_(None)).scalar() or 0
    total_institutions = db.session.query(func.count(Institution.id)).filter(Institution.deleted_at.is_(None)).scalar() or 0
    total_departments = db.session.query(func.count(Department.id)).filter(Department.deleted_at.is_(None)).scalar() or 0
    total_courses = db.session.query(func.count(Course.id)).filter(Course.deleted_at.is_(None)).scalar() or 0
    active_terms = db.session.query(func.count(Term.id)).filter(Term.is_active == True, Term.deleted_at.is_(None)).scalar() or 0

    total_scores, passed_count, overall_avg, overall_pass_rate = _score_agg(Score.id.isnot(None))
    failed_count = total_scores - passed_count

    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    recent_count = db.session.query(func.count(Score.id)).filter(
        Score.created_at >= seven_days_ago, Score.deleted_at.is_(None)
    ).scalar() or 0

    # Recent score activity list (last 10)
    recent_scores = (
        db.session.query(Score)
        .filter(Score.created_at >= seven_days_ago, Score.deleted_at.is_(None))
        .order_by(Score.created_at.desc())
        .limit(10)
        .all()
    )
    recent_list = [
        {
            "student_name": s.student.user.name if s.student and s.student.user else None,
            "subject_name": s.subject.name if s.subject else None,
            "marks": s.marks_obtained,
            "term": s.term,
            "recorded_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in recent_scores
    ]

    # At-risk students (avg < 50 across all scores)
    at_risk_rows = (
        db.session.query(
            Student.id,
            User.name,
            func.avg(Score.marks_obtained).label("avg"),
        )
        .join(User, User.id == Student.user_id)
        .join(Score, Score.student_id == Student.id)
        .filter(Score.deleted_at.is_(None), Student.deleted_at.is_(None))
        .group_by(Student.id, User.name)
        .having(func.avg(Score.marks_obtained) < 50)
        .order_by(func.avg(Score.marks_obtained).asc())
        .limit(10)
        .all()
    )
    at_risk = [
        {"student_id": str(r.id), "name": r.name, "avg_score": round(float(r.avg), 2)}
        for r in at_risk_rows
    ]

    # Term trend — avg score per term (using Score.term string)
    term_trend_rows = (
        db.session.query(
            Score.term,
            func.avg(Score.marks_obtained).label("avg"),
            func.count(Score.id).label("count"),
            func.sum(case((Score.is_passed == True, 1), else_=0)).label("passed"),
        )
        .filter(Score.deleted_at.is_(None), Score.term.isnot(None))
        .group_by(Score.term)
        .order_by(Score.term.asc())
        .all()
    )
    term_trend = [
        {
            "term": r.term,
            "avg_score": round(float(r.avg), 2),
            "scores_count": int(r.count),
            "pass_rate": round(int(r.passed) / int(r.count) * 100, 2) if r.count else 0,
        }
        for r in term_trend_rows
    ]

    log_view(user, "admin_dashboard", metadata={"scope": "system_overview"})

    advanced = build_role_dashboard("admin")

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
            "total_assessments": total_scores,
            "passed_count": passed_count,
            "failed_count": failed_count,
            "overall_pass_rate": overall_pass_rate,
            "overall_avg": overall_avg,
        },
        "recent_activity": {
            "scores_in_last_7_days": recent_count,
            "recent_scores": recent_list,
        },
        "at_risk_students": at_risk,
        "term_trend": term_trend,
        "summary_panel": advanced["summary_panel"],
        "analytics": advanced,
        "timestamp": datetime.utcnow().isoformat(),
    }, 200


@bp.get("/institutions")
def list_institution_analytics():
    user, error, status = require_permission("admin.analytics.read")
    if error:
        return error, status

    # Single query: institution → course → enrollment → student count
    inst_student_counts = dict(
        db.session.query(Institution.id, func.count(func.distinct(Student.id)))
        .join(Department, Department.institution_id == Institution.id)
        .join(Course, Course.department_id == Department.id)
        .join(Student, Student.course_id == Course.id)
        .filter(Institution.deleted_at.is_(None), Student.deleted_at.is_(None))
        .group_by(Institution.id)
        .all()
    )

    # Score aggregates per institution via course chain
    inst_score_rows = (
        db.session.query(
            Institution.id,
            func.count(Score.id).label("total"),
            func.sum(case((Score.is_passed == True, 1), else_=0)).label("passed"),
            func.avg(Score.marks_obtained).label("avg"),
        )
        .join(Department, Department.institution_id == Institution.id)
        .join(Course, Course.department_id == Department.id)
        .join(Student, Student.course_id == Course.id)
        .join(Score, Score.student_id == Student.id)
        .filter(Institution.deleted_at.is_(None), Score.deleted_at.is_(None))
        .group_by(Institution.id)
        .all()
    )
    inst_score_map = {str(r.id): r for r in inst_score_rows}

    institutions = db.session.query(Institution).filter(Institution.deleted_at.is_(None)).all()
    results = []
    for inst in institutions:
        sid = str(inst.id)
        r = inst_score_map.get(sid)
        total = int(r.total) if r else 0
        passed = int(r.passed or 0) if r else 0
        avg = round(float(r.avg or 0), 2) if r else 0
        pass_rate = round(passed / total * 100, 2) if total > 0 else 0
        results.append({
            "institution_id": sid,
            "name": inst.name,
            "students_count": inst_student_counts.get(inst.id, 0),
            "scores_count": total,
            "pass_rate": pass_rate,
            "avg_score": avg,
        })

    log_view(user, "institutions_analytics", metadata={"scope": "list"})
    return results, 200


@bp.get("/departments")
def list_department_analytics():
    user, error, status = require_permission("admin.analytics.read")
    if error:
        return error, status

    dept_courses = dict(
        db.session.query(Department.id, func.count(Course.id))
        .join(Course, Course.department_id == Department.id)
        .filter(Department.deleted_at.is_(None), Course.deleted_at.is_(None))
        .group_by(Department.id)
        .all()
    )

    dept_students = dict(
        db.session.query(Department.id, func.count(func.distinct(Student.id)))
        .join(Course, Course.department_id == Department.id)
        .join(Student, Student.course_id == Course.id)
        .filter(Department.deleted_at.is_(None), Student.deleted_at.is_(None))
        .group_by(Department.id)
        .all()
    )

    dept_score_rows = (
        db.session.query(
            Department.id,
            func.count(Score.id).label("total"),
            func.sum(case((Score.is_passed == True, 1), else_=0)).label("passed"),
            func.avg(Score.marks_obtained).label("avg"),
        )
        .join(Course, Course.department_id == Department.id)
        .join(Student, Student.course_id == Course.id)
        .join(Score, Score.student_id == Student.id)
        .filter(Department.deleted_at.is_(None), Score.deleted_at.is_(None))
        .group_by(Department.id)
        .all()
    )
    dept_score_map = {str(r.id): r for r in dept_score_rows}

    departments = db.session.query(Department).filter(Department.deleted_at.is_(None)).all()
    results = []
    for dept in departments:
        sid = str(dept.id)
        r = dept_score_map.get(sid)
        total = int(r.total) if r else 0
        passed = int(r.passed or 0) if r else 0
        avg = round(float(r.avg or 0), 2) if r else 0
        pass_rate = round(passed / total * 100, 2) if total > 0 else 0
        results.append({
            "department_id": sid,
            "name": dept.name,
            "institution_id": str(dept.institution_id),
            "courses_count": dept_courses.get(dept.id, 0),
            "students_count": dept_students.get(dept.id, 0),
            "scores_count": total,
            "pass_rate": pass_rate,
            "avg_score": avg,
        })

    log_view(user, "departments_analytics", metadata={"scope": "list"})
    return results, 200


@bp.get("/courses")
def list_course_analytics():
    user, error, status = require_permission("admin.analytics.read")
    if error:
        return error, status

    course_enrolled = dict(
        db.session.query(Course.id, func.count(func.distinct(Student.id)))
        .join(Student, Student.course_id == Course.id)
        .filter(Course.deleted_at.is_(None), Student.deleted_at.is_(None))
        .group_by(Course.id)
        .all()
    )

    course_score_rows = (
        db.session.query(
            Course.id,
            func.count(Score.id).label("total"),
            func.sum(case((Score.is_passed == True, 1), else_=0)).label("passed"),
            func.avg(Score.marks_obtained).label("avg"),
        )
        .join(Student, Student.course_id == Course.id)
        .join(Score, Score.student_id == Student.id)
        .filter(Course.deleted_at.is_(None), Score.deleted_at.is_(None))
        .group_by(Course.id)
        .all()
    )
    course_score_map = {str(r.id): r for r in course_score_rows}

    courses = db.session.query(Course).filter(Course.deleted_at.is_(None)).all()
    results = []
    for course in courses:
        sid = str(course.id)
        r = course_score_map.get(sid)
        total = int(r.total) if r else 0
        passed = int(r.passed or 0) if r else 0
        avg = round(float(r.avg or 0), 2) if r else 0
        pass_rate = round(passed / total * 100, 2) if total > 0 else 0
        results.append({
            "course_id": sid,
            "name": course.name,
            "department_id": str(course.department_id) if course.department_id else None,
            "enrolled_count": course_enrolled.get(course.id, 0),
            "scores_count": total,
            "pass_rate": pass_rate,
            "avg_score": avg,
        })

    log_view(user, "courses_analytics", metadata={"scope": "list"})
    return results, 200


@bp.get("/comparisons")
def analytics_comparisons():
    user, error, status = require_permission("admin.analytics.read")
    if error:
        return error, status

    inst_rows = (
        db.session.query(
            Institution.id, Institution.name,
            func.avg(Score.marks_obtained).label("avg"),
            func.count(Score.id).label("count"),
        )
        .join(Department, Department.institution_id == Institution.id)
        .join(Course, Course.department_id == Department.id)
        .join(Student, Student.course_id == Course.id)
        .join(Score, Score.student_id == Student.id)
        .filter(Institution.deleted_at.is_(None), Score.deleted_at.is_(None))
        .group_by(Institution.id, Institution.name)
        .order_by(func.avg(Score.marks_obtained).desc())
        .all()
    )
    inst_list = [{"institution_id": str(r.id), "name": r.name, "avg_score": round(float(r.avg), 2), "scores_count": int(r.count)} for r in inst_rows]

    dept_rows = (
        db.session.query(
            Department.id, Department.name,
            func.avg(Score.marks_obtained).label("avg"),
            func.count(Score.id).label("count"),
        )
        .join(Course, Course.department_id == Department.id)
        .join(Student, Student.course_id == Course.id)
        .join(Score, Score.student_id == Student.id)
        .filter(Department.deleted_at.is_(None), Score.deleted_at.is_(None))
        .group_by(Department.id, Department.name)
        .order_by(func.avg(Score.marks_obtained).desc())
        .all()
    )
    dept_list = [{"department_id": str(r.id), "name": r.name, "avg_score": round(float(r.avg), 2), "scores_count": int(r.count)} for r in dept_rows]

    log_view(user, "analytics_comparisons", metadata={"scope": "comparative"})
    return {
        "top_institutions": inst_list[:5],
        "bottom_institutions": inst_list[-5:][::-1] if len(inst_list) > 5 else inst_list,
        "top_departments": dept_list[:5],
        "bottom_departments": dept_list[-5:][::-1] if len(dept_list) > 5 else dept_list,
    }, 200


@bp.get("/system-wide-report")
def system_wide_report():
    user, error, status = require_permission("admin.analytics.read")
    if error:
        return error, status

    total_students = db.session.query(func.count(Student.id)).filter(Student.deleted_at.is_(None)).scalar() or 0
    total_trainers = db.session.query(func.count(Trainer.id)).filter(Trainer.deleted_at.is_(None)).scalar() or 0
    total_users = db.session.query(func.count(User.id)).filter(User.deleted_at.is_(None)).scalar() or 0
    total_institutions = db.session.query(func.count(Institution.id)).filter(Institution.deleted_at.is_(None)).scalar() or 0
    total_departments = db.session.query(func.count(Department.id)).filter(Department.deleted_at.is_(None)).scalar() or 0
    total_courses = db.session.query(func.count(Course.id)).filter(Course.deleted_at.is_(None)).scalar() or 0
    total_assessments = db.session.query(func.count(Assessment.id)).filter(Assessment.deleted_at.is_(None)).scalar() or 0

    total_scores, passed, overall_avg, pass_rate = _score_agg(Score.id.isnot(None))
    failed = total_scores - passed

    # By term — use Score.term string (the reliable field)
    term_rows = (
        db.session.query(
            Score.term,
            func.count(Score.id).label("count"),
            func.avg(Score.marks_obtained).label("avg"),
            func.sum(case((Score.is_passed == True, 1), else_=0)).label("passed"),
        )
        .filter(Score.deleted_at.is_(None), Score.term.isnot(None))
        .group_by(Score.term)
        .order_by(Score.term.asc())
        .all()
    )
    term_stats = [
        {
            "term_name": r.term,
            "scores_count": int(r.count),
            "avg_score": round(float(r.avg or 0), 2),
            "pass_rate": round(int(r.passed or 0) / int(r.count) * 100, 2) if r.count else 0,
        }
        for r in term_rows
    ]

    log_view(user, "system_wide_report", metadata={"scope": "report"})
    return {
        "total_counts": {
            "students": total_students, "trainers": total_trainers, "users": total_users,
            "institutions": total_institutions, "departments": total_departments,
            "courses": total_courses, "assessments": total_assessments,
        },
        "academic_statistics": {
            "total_scores": total_scores, "passed": passed, "failed": failed,
            "pass_rate": pass_rate, "avg_score": overall_avg,
        },
        "by_term": term_stats,
        "generated_at": datetime.utcnow().isoformat(),
    }, 200
