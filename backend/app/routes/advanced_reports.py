from __future__ import annotations

from flask import Blueprint, g, request

from ..services.learning_analytics import (
    get_at_risk_analytics,
    get_attendance_performance,
    get_mastery_progress,
    get_portfolio_tracking,
    get_recommendations,
)
from .permissions import admin_required, student_required, trainer_required

bp = Blueprint("advanced_reports", __name__, url_prefix="/api/v1/reports")


@bp.get("")
def get_reports():
    scope = (request.args.get("scope") or "student").lower()

    if scope == "student":
        @student_required()
        def _student():
            student_id = str(g.current_student.id)
            return {
                "scope": "student",
                "progress": get_mastery_progress(student_id=student_id),
                "attendance": get_attendance_performance(student_id=student_id),
                "portfolio": get_portfolio_tracking(student_id=student_id),
                "recommendations": get_recommendations(student_id=student_id),
            }, 200

        return _student()

    if scope == "trainer":
        @trainer_required("scores.read")
        def _trainer():
            subject_id = request.args.get("subject_id")
            return {
                "scope": "trainer",
                "subject_id": subject_id,
                "progress": get_mastery_progress(subject_id=subject_id),
                "attendance": get_attendance_performance(subject_id=subject_id),
                "at_risk": get_at_risk_analytics(subject_id=subject_id),
                "recommendations": get_recommendations(subject_id=subject_id),
            }, 200

        return _trainer()

    @admin_required("admin.analytics.read")
    def _admin():
        return {
            "scope": "institution",
            "progress": get_mastery_progress(),
            "attendance": get_attendance_performance(),
            "at_risk": get_at_risk_analytics(),
            "portfolio": get_portfolio_tracking(),
            "recommendations": get_recommendations(),
        }, 200

    return _admin()
