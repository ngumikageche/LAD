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


def _scope_args(*, include_trainer: bool = False, include_student: bool = False) -> dict[str, str | None]:
    scope = {
        "department_id": request.args.get("department_id"),
        "course_id": request.args.get("course_id"),
        "module_id": request.args.get("module_id"),
        "subject_id": request.args.get("subject_id"),
    }
    if include_trainer:
        scope["trainer_id"] = request.args.get("trainer_id")
    if include_student:
        scope["student_id"] = request.args.get("student_id")
    return scope


@bp.get("")
def get_reports():
    scope = (request.args.get("scope") or "student").lower()

    if scope == "student":
        @student_required()
        def _student():
            student_id = str(g.current_student.id)
            scope = _scope_args(include_trainer=True)
            return {
                "scope": "student",
                "progress": get_mastery_progress(student_id=student_id, **scope),
                "attendance": get_attendance_performance(student_id=student_id, **scope),
                "portfolio": get_portfolio_tracking(student_id=student_id, **scope),
                "recommendations": get_recommendations(student_id=student_id, **scope),
            }, 200

        return _student()

    if scope == "trainer":
        @trainer_required("scores.read")
        def _trainer():
            scope = _scope_args(include_student=True)
            return {
                "scope": "trainer",
                "subject_id": scope.get("subject_id"),
                "progress": get_mastery_progress(**scope),
                "attendance": get_attendance_performance(**scope),
                "at_risk": get_at_risk_analytics(**scope),
                "recommendations": get_recommendations(**scope),
            }, 200

        return _trainer()

    @admin_required("admin.analytics.read")
    def _admin():
        scope = _scope_args(include_trainer=True, include_student=True)
        return {
            "scope": "institution",
            "progress": get_mastery_progress(**scope),
            "attendance": get_attendance_performance(**scope),
            "at_risk": get_at_risk_analytics(**scope),
            "portfolio": get_portfolio_tracking(**scope),
            "recommendations": get_recommendations(**scope),
        }, 200

    return _admin()
