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

bp = Blueprint("admin_dashboard", __name__, url_prefix="/admin/dashboard")


@bp.get("/stats")
def get_dashboard_stats():
    """
    Get admin dashboard statistics
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

    log_view(user, "admin_dashboard_stats", metadata={"scope": "system_overview"})

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


@bp.get("")
def get_dashboard_overview():
    """
    Get admin dashboard overview
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

    # Score statistics
    scores = db.session.query(Score).filter(Score.deleted_at.is_(None)).all()
    
    total_assessments = len(scores)
    passed_count = sum(1 for s in scores if s.is_passed is True)
    
    overall_pass_rate = (passed_count / total_assessments * 100) if total_assessments > 0 else 0

    log_view(user, "admin_dashboard_overview", metadata={"scope": "system_overview"})

    return {
        "total_students": total_students,
        "total_trainers": total_trainers,
        "total_institutions": total_institutions,
        "total_assessments": total_assessments,
        "pass_rate": round(overall_pass_rate, 2),
        "timestamp": datetime.utcnow().isoformat(),
    }, 200
