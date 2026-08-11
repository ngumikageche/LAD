from __future__ import annotations

from flask import Blueprint
from sqlalchemy import and_, case, func
from datetime import datetime, timedelta

from ..extensions import db
from ..models.score import Score
from ..models.assessment import Assessment
from ..models.course import Course
from ..models.module import Module
from ..models.student import Student
from ..models.subject import Subject
from ..models.trainer import Trainer
from ..models.student_subject import StudentSubject
from ..models.trainer_subject import TrainerSubject
from ..models.user import User
from ..models.institution import Institution
from ..models.department import Department
from ..models.term import Term
from ..services.scoping import (
    scope_courses,
    scope_departments,
    scope_institutions,
    scope_modules,
    scope_scores,
    scope_students,
    scope_subjects,
    scope_trainers,
    score_percentage_expr,
    visible_institution_id,
)
from .permissions import require_permission, log_view

bp = Blueprint("admin_dashboard", __name__, url_prefix="/admin/dashboard")


def _score_totals(user):
    """
    Assessment counts and the mark aggregate, computed in the database.

    Loading every score into Python to sum it also lazy-loaded each score's
    assessment — one query per row — which is what made this endpoint scale
    with the size of the marks table.
    """
    # The mean of each score's percentage, which is how every other average in
    # the application is computed. Summing marks over summed totals instead
    # weights the figure by paper size and reports a different number.
    row = (
        scope_scores(
            db.session.query(
                func.count(Score.id).label("total"),
                func.sum(case((Score.is_passed.is_(True), 1), else_=0)).label("passed"),
                func.sum(case((Score.is_passed.is_(False), 1), else_=0)).label("failed"),
                func.avg(score_percentage_expr()).label("average"),
            ).outerjoin(Assessment, Assessment.id == Score.assessment_id),
            user,
        )
        .filter(Score.deleted_at.is_(None))
        .one()
    )
    total = int(row.total or 0)
    return {
        "total_assessments": total,
        "passed_count": int(row.passed or 0),
        "failed_count": int(row.failed or 0),
        "overall_pass_rate": round(int(row.passed or 0) / total * 100, 2) if total else 0,
        "overall_avg": round(float(row.average or 0), 2),
    }


def _entity_counts(user) -> dict:
    """One COUNT per entity, each scoped to what the caller may see."""
    def count(model, scoper):
        return int(
            scoper(db.session.query(func.count(model.id)), user)
            .filter(model.deleted_at.is_(None))
            .scalar()
            or 0
        )

    return {
        "total_students": count(Student, scope_students),
        "total_trainers": count(Trainer, scope_trainers),
        "total_institutions": count(Institution, scope_institutions),
        "total_departments": count(Department, scope_departments),
        "total_courses": count(Course, scope_courses),
        "active_terms": int(
            db.session.query(func.count(Term.id))
            .filter(and_(Term.is_active.is_(True), Term.deleted_at.is_(None)))
            .scalar()
            or 0
        ),
    }


@bp.get("/stats")
def get_dashboard_stats():
    """Counts, pass rate, and average for the caller's scope."""
    user, error, status = require_permission("admin.analytics.read")
    if error:
        return error, status

    counts = _entity_counts(user)
    academic = _score_totals(user)

    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    recent_count = int(
        scope_scores(db.session.query(func.count(Score.id)), user)
        .filter(and_(Score.created_at >= seven_days_ago, Score.deleted_at.is_(None)))
        .scalar()
        or 0
    )

    log_view(user, "admin_dashboard_stats", metadata={"scope": "system_overview"})

    return {
        "system_overview": counts,
        "academic_metrics": academic,
        "recent_activity": {"scores_in_last_7_days": recent_count},
        "timestamp": datetime.utcnow().isoformat(),
    }, 200


@bp.get("")
def get_dashboard_overview():
    """The condensed form of `/stats`, for the header tiles."""
    user, error, status = require_permission("admin.analytics.read")
    if error:
        return error, status

    counts = _entity_counts(user)
    academic = _score_totals(user)

    log_view(user, "admin_dashboard_overview", metadata={"scope": "system_overview"})

    return {
        "total_students": counts["total_students"],
        "total_trainers": counts["total_trainers"],
        "total_institutions": counts["total_institutions"],
        "total_assessments": academic["total_assessments"],
        "pass_rate": academic["overall_pass_rate"],
        "timestamp": datetime.utcnow().isoformat(),
    }, 200


def _group_ids(query) -> dict[str, list[str]]:
    """Turn (owner_id, value_id) rows into {owner: [values]}."""
    grouped: dict[str, list[str]] = {}
    if query is None:
        return grouped
    for owner_id, value_id in query.all():
        grouped.setdefault(str(owner_id), []).append(str(value_id))
    return grouped


@bp.get("/filter-options")
def get_filter_options():
    """
    Everything the dashboard's filter dropdowns need, in one lean response.

    The dashboard used to assemble these by fetching six full list endpoints —
    every student and trainer row in the institution, each of which lazy-loaded
    its user record. All that survives the trip is an id, a name, and a parent
    id, so that is all this returns, read straight out of the database as
    columns rather than hydrated models.
    """
    user, error, status = require_permission("admin.analytics.read")
    if error:
        return error, status

    departments = [
        {"id": str(row.id), "name": row.name}
        for row in scope_departments(
            db.session.query(Department.id, Department.name), user
        ).filter(Department.deleted_at.is_(None)).order_by(Department.name.asc()).all()
    ]

    courses = [
        {"id": str(row.id), "name": row.name, "department_id": str(row.department_id) if row.department_id else None}
        for row in scope_courses(
            db.session.query(Course.id, Course.name, Course.department_id), user
        ).filter(Course.deleted_at.is_(None)).order_by(Course.name.asc()).all()
    ]

    modules = [
        {"id": str(row.id), "name": row.name, "course_id": str(row.course_id) if row.course_id else None}
        for row in scope_modules(
            db.session.query(Module.id, Module.name, Module.course_id), user
        ).filter(Module.deleted_at.is_(None)).order_by(Module.name.asc()).all()
    ]

    subjects = [
        {
            "id": str(row.id),
            "name": row.name,
            "module_id": str(row.module_id) if row.module_id else None,
            "course_id": str(row.course_id) if row.course_id else None,
        }
        for row in scope_subjects(
            db.session.query(Subject.id, Subject.name, Subject.module_id, Module.course_id)
            .outerjoin(Module, Module.id == Subject.module_id),
            user,
        ).filter(Subject.deleted_at.is_(None)).order_by(Subject.name.asc()).all()
    ]

    trainer_rows = scope_trainers(
        db.session.query(Trainer.id, Trainer.department_id, User.name)
        .outerjoin(User, User.id == Trainer.user_id),
        user,
    ).filter(Trainer.deleted_at.is_(None)).order_by(User.name.asc()).all()

    student_rows = scope_students(
        db.session.query(Student.id, Student.course_id, Student.registration_number, User.name)
        .outerjoin(User, User.id == Student.user_id),
        user,
    ).filter(Student.deleted_at.is_(None)).order_by(User.name.asc()).all()

    # Subject assignments in one grouped query per side, restricted to the rows
    # actually being returned rather than scanning the whole join table.
    subjects_by_trainer = _group_ids(
        db.session.query(TrainerSubject.trainer_id, TrainerSubject.subject_id).filter(
            TrainerSubject.trainer_id.in_([row.id for row in trainer_rows])
        ) if trainer_rows else None
    )
    # The Student filter only enables once a subject or trainer is chosen, so
    # these ids are what make that dropdown usable at all — omitting them left
    # it permanently empty.
    subjects_by_student = _group_ids(
        db.session.query(StudentSubject.student_id, StudentSubject.subject_id).filter(
            StudentSubject.student_id.in_([row.id for row in student_rows])
        ) if student_rows else None
    )

    trainers = [
        {
            "id": str(row.id),
            "name": row.name or "Unnamed trainer",
            "department_id": str(row.department_id) if row.department_id else None,
            "subject_ids": subjects_by_trainer.get(str(row.id), []),
        }
        for row in trainer_rows
    ]

    students = [
        {
            "id": str(row.id),
            "name": row.name or row.registration_number or "Unnamed student",
            "course_id": str(row.course_id) if row.course_id else None,
            "subject_ids": subjects_by_student.get(str(row.id), []),
        }
        for row in student_rows
    ]

    return {
        "departments": departments,
        "courses": courses,
        "modules": modules,
        "subjects": subjects,
        "trainers": trainers,
        "students": students,
        "institution_id": str(visible_institution_id(user)) if visible_institution_id(user) else None,
    }, 200
