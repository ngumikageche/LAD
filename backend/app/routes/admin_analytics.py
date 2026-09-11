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
from ..models.module import Module
from ..models.subject import Subject
from ..models.student import Student
from ..models.trainer import Trainer
from ..models.trainer_subject import TrainerSubject
from ..models.user import User
from ..models.institution import Institution
from ..models.department import Department
from ..models.term import Term
from .permissions import require_permission, log_view
from ..services.learning_analytics import build_role_dashboard, _resolve_student_ids, _resolve_subject_ids
from ..services.scoping import score_percentage_expr

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
        func.avg(score_percentage_expr()).label("avg_marks"),
    ).outerjoin(Assessment, Assessment.id == Score.assessment_id).filter(filter_clause, Score.deleted_at.is_(None)).one()
    total = int(row.total or 0)
    passed = int(row.passed or 0)
    avg = round(float(row.avg_marks or 0), 2)
    pass_rate = round(passed / total * 100, 2) if total > 0 else 0.0
    return total, passed, avg, pass_rate


def _scope_args() -> dict[str, str | None]:
    return {
        "department_id": request.args.get("department_id"),
        "course_id": request.args.get("course_id"),
        "module_id": request.args.get("module_id"),
        "subject_id": request.args.get("subject_id"),
        "trainer_id": request.args.get("trainer_id"),
        "student_id": request.args.get("student_id"),
    }


def _scope_ids() -> tuple[list[uuid.UUID] | None, list[uuid.UUID] | None]:
    scope = _scope_args()
    return (
        _resolve_subject_ids(**scope),
        _resolve_student_ids(**scope),
    )


def _apply_scope_filters(query, subject_ids: list[uuid.UUID] | None, student_ids: list[uuid.UUID] | None):
    if subject_ids is not None:
        query = query.filter(Score.subject_id.in_(subject_ids))
    if student_ids is not None:
        query = query.filter(Score.student_id.in_(student_ids))
    return query


@bp.get("/dashboard")
def admin_dashboard():
    user, error, status = require_permission("admin.analytics.read")
    if error:
        return error, status

    scope = _scope_args()
    subject_ids, student_ids = _scope_ids()

    student_query = db.session.query(func.count(Student.id)).filter(Student.deleted_at.is_(None))
    if student_ids is not None:
        student_query = student_query.filter(Student.id.in_(student_ids))
    total_students = student_query.scalar() or 0

    trainer_query = db.session.query(func.count(func.distinct(TrainerSubject.trainer_id)))
    if subject_ids is not None:
        trainer_query = trainer_query.filter(TrainerSubject.subject_id.in_(subject_ids))
    total_trainers = trainer_query.scalar() or 0

    if scope.get("course_id"):
        total_courses = (
            db.session.query(func.count(Course.id))
            .filter(
                Course.id == _parse_uuid(scope["course_id"], "course_id"),
                Course.deleted_at.is_(None),
            )
            .scalar()
            or 0
        )
    elif scope.get("department_id"):
        total_courses = (
            db.session.query(func.count(Course.id))
            .filter(
                Course.department_id == _parse_uuid(scope["department_id"], "department_id"),
                Course.deleted_at.is_(None),
            )
            .scalar()
            or 0
        )
    elif subject_ids is not None:
        total_courses = (
            db.session.query(func.count(func.distinct(Course.id)))
            .join(Module, Module.course_id == Course.id)
            .join(Subject, Subject.module_id == Module.id)
            .filter(Subject.id.in_(subject_ids), Course.deleted_at.is_(None))
            .scalar()
            or 0
        )
    elif student_ids is not None:
        total_courses = (
            db.session.query(func.count(func.distinct(Course.id)))
            .join(Student, Student.course_id == Course.id)
            .filter(Student.id.in_(student_ids), Course.deleted_at.is_(None))
            .scalar()
            or 0
        )
    else:
        total_courses = db.session.query(func.count(Course.id)).filter(Course.deleted_at.is_(None)).scalar() or 0

    total_institutions = db.session.query(func.count(Institution.id)).filter(Institution.deleted_at.is_(None)).scalar() or 0
    department_query = db.session.query(func.count(Department.id)).filter(Department.deleted_at.is_(None))
    if scope.get("department_id"):
        department_query = department_query.filter(Department.id == _parse_uuid(scope["department_id"], "department_id"))
    total_departments = department_query.scalar() or 0
    active_terms = db.session.query(func.count(Term.id)).filter(Term.is_active == True, Term.deleted_at.is_(None)).scalar() or 0

    score_query = db.session.query(
        func.count(Score.id).label("total"),
        func.sum(case((Score.is_passed == True, 1), else_=0)).label("passed"),
        func.avg(score_percentage_expr()).label("avg_marks"),
    ).outerjoin(Assessment, Assessment.id == Score.assessment_id).filter(Score.deleted_at.is_(None))
    if subject_ids is not None:
        score_query = score_query.filter(Score.subject_id.in_(subject_ids))
    if student_ids is not None:
        score_query = score_query.filter(Score.student_id.in_(student_ids))
    score_row = score_query.one()
    total_scores = int(score_row.total or 0)
    passed_count = int(score_row.passed or 0)
    overall_avg = round(float(score_row.avg_marks or 0), 2)
    overall_pass_rate = round(passed_count / total_scores * 100, 2) if total_scores > 0 else 0.0
    failed_count = total_scores - passed_count

    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    recent_query = db.session.query(func.count(Score.id)).filter(Score.created_at >= seven_days_ago, Score.deleted_at.is_(None))
    recent_query = _apply_scope_filters(recent_query, subject_ids, student_ids)
    recent_count = recent_query.scalar() or 0

    # Recent score activity list (last 10)
    recent_scores = (
        db.session.query(Score)
        .filter(Score.created_at >= seven_days_ago, Score.deleted_at.is_(None))
        .filter(Score.subject_id.in_(subject_ids) if subject_ids is not None else True)
        .filter(Score.student_id.in_(student_ids) if student_ids is not None else True)
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
            func.avg(score_percentage_expr()).label("avg"),
        )
        .join(User, User.id == Student.user_id)
        .join(Score, Score.student_id == Student.id)
        .outerjoin(Assessment, Assessment.id == Score.assessment_id)
        .filter(Score.deleted_at.is_(None), Student.deleted_at.is_(None))
        .filter(Score.subject_id.in_(subject_ids) if subject_ids is not None else True)
        .filter(Student.id.in_(student_ids) if student_ids is not None else True)
        .group_by(Student.id, User.name)
        .having(func.avg(score_percentage_expr()) < 50)
        .order_by(func.avg(score_percentage_expr()).asc())
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
            func.avg(score_percentage_expr()).label("avg"),
            func.count(Score.id).label("count"),
            func.sum(case((Score.is_passed == True, 1), else_=0)).label("passed"),
        )
        .outerjoin(Assessment, Assessment.id == Score.assessment_id)
        .filter(Score.deleted_at.is_(None), Score.term.isnot(None))
        .filter(Score.subject_id.in_(subject_ids) if subject_ids is not None else True)
        .filter(Score.student_id.in_(student_ids) if student_ids is not None else True)
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

    advanced = build_role_dashboard("admin", **scope)

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
            func.avg(score_percentage_expr()).label("avg"),
        )
        .join(Department, Department.institution_id == Institution.id)
        .join(Course, Course.department_id == Department.id)
        .join(Student, Student.course_id == Course.id)
        .join(Score, Score.student_id == Student.id)
        .outerjoin(Assessment, Assessment.id == Score.assessment_id)
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

    subject_ids, student_ids = _scope_ids()

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
            func.avg(score_percentage_expr()).label("avg"),
        )
        .join(Course, Course.department_id == Department.id)
        .join(Student, Student.course_id == Course.id)
        .join(Score, Score.student_id == Student.id)
        .outerjoin(Assessment, Assessment.id == Score.assessment_id)
        .filter(Department.deleted_at.is_(None), Score.deleted_at.is_(None))
        .filter(Score.subject_id.in_(subject_ids) if subject_ids is not None else True)
        .filter(Student.id.in_(student_ids) if student_ids is not None else True)
        .group_by(Department.id)
        .all()
    )
    dept_score_map = {str(r.id): r for r in dept_score_rows}

    departments_query = db.session.query(Department).filter(Department.deleted_at.is_(None))
    selected_department = _scope_args().get("department_id")
    if selected_department:
        departments_query = departments_query.filter(Department.id == _parse_uuid(selected_department, "department_id"))
    departments = departments_query.all()
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

    subject_ids, student_ids = _scope_ids()

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
            func.avg(score_percentage_expr()).label("avg"),
        )
        .join(Student, Student.course_id == Course.id)
        .join(Score, Score.student_id == Student.id)
        .outerjoin(Assessment, Assessment.id == Score.assessment_id)
        .filter(Course.deleted_at.is_(None), Score.deleted_at.is_(None))
        .filter(Score.subject_id.in_(subject_ids) if subject_ids is not None else True)
        .filter(Student.id.in_(student_ids) if student_ids is not None else True)
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

    subject_ids, student_ids = _scope_ids()

    inst_rows = (
        db.session.query(
            Institution.id, Institution.name,
            func.avg(score_percentage_expr()).label("avg"),
            func.count(Score.id).label("count"),
        )
        .join(Department, Department.institution_id == Institution.id)
        .join(Course, Course.department_id == Department.id)
        .join(Student, Student.course_id == Course.id)
        .join(Score, Score.student_id == Student.id)
        .outerjoin(Assessment, Assessment.id == Score.assessment_id)
        .filter(Institution.deleted_at.is_(None), Score.deleted_at.is_(None))
        .filter(Score.subject_id.in_(subject_ids) if subject_ids is not None else True)
        .filter(Student.id.in_(student_ids) if student_ids is not None else True)
        .group_by(Institution.id, Institution.name)
        .order_by(func.avg(score_percentage_expr()).desc())
        .all()
    )
    inst_list = [{"institution_id": str(r.id), "name": r.name, "avg_score": round(float(r.avg), 2), "scores_count": int(r.count)} for r in inst_rows]

    dept_rows = (
        db.session.query(
            Department.id, Department.name,
            func.avg(score_percentage_expr()).label("avg"),
            func.count(Score.id).label("count"),
        )
        .join(Course, Course.department_id == Department.id)
        .join(Student, Student.course_id == Course.id)
        .join(Score, Score.student_id == Student.id)
        .outerjoin(Assessment, Assessment.id == Score.assessment_id)
        .filter(Department.deleted_at.is_(None), Score.deleted_at.is_(None))
        .filter(Score.subject_id.in_(subject_ids) if subject_ids is not None else True)
        .filter(Student.id.in_(student_ids) if student_ids is not None else True)
        .group_by(Department.id, Department.name)
        .order_by(func.avg(score_percentage_expr()).desc())
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

    subject_ids, student_ids = _scope_ids()

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
            func.avg(score_percentage_expr()).label("avg"),
            func.sum(case((Score.is_passed == True, 1), else_=0)).label("passed"),
        )
        .outerjoin(Assessment, Assessment.id == Score.assessment_id)
        .filter(Score.deleted_at.is_(None), Score.term.isnot(None))
        .filter(Score.subject_id.in_(subject_ids) if subject_ids is not None else True)
        .filter(Score.student_id.in_(student_ids) if student_ids is not None else True)
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
