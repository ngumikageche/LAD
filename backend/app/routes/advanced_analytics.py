from __future__ import annotations

import uuid

from flask import Blueprint, g, request

from ..services.learning_analytics import (
    build_role_dashboard,
    get_at_risk_analytics,
    get_attendance_performance,
    get_cohort_comparison,
    get_cohort_drilldown,
    get_competency_drilldown,
    get_heatmap,
    get_mastery_progress,
    get_portfolio_tracking,
    get_recommendations,
    get_student_drilldown,
)
from .permissions import admin_required, student_required, trainer_required

bp = Blueprint("advanced_analytics", __name__, url_prefix="/api/v1/analytics")


def _optional_uuid(value: str | None, field: str) -> str | None:
    if not value:
        return None
    try:
        return str(uuid.UUID(str(value)))
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Invalid '{field}'") from exc


@bp.errorhandler(ValueError)
def handle_value_error(error: ValueError):
    return {"error": str(error)}, 400


@bp.get("/heatmap")
@trainer_required("scores.read")
def heatmap():
    return get_heatmap(
        subject_id=_optional_uuid(request.args.get("subject_id"), "subject_id"),
        student_id=_optional_uuid(request.args.get("student_id"), "student_id"),
    ), 200


@bp.get("/progress")
@trainer_required("scores.read")
def progress():
    return get_mastery_progress(
        subject_id=_optional_uuid(request.args.get("subject_id"), "subject_id"),
        student_id=_optional_uuid(request.args.get("student_id"), "student_id"),
    ), 200


@bp.get("/attendance-correlation")
@trainer_required("scores.read")
def attendance_correlation():
    return get_attendance_performance(
        subject_id=_optional_uuid(request.args.get("subject_id"), "subject_id"),
        student_id=_optional_uuid(request.args.get("student_id"), "student_id"),
    ), 200


@bp.get("/at-risk")
@trainer_required("scores.read")
def at_risk():
    return get_at_risk_analytics(
        subject_id=_optional_uuid(request.args.get("subject_id"), "subject_id"),
        student_id=_optional_uuid(request.args.get("student_id"), "student_id"),
        score_threshold=float(request.args.get("score_threshold", 50)),
        attendance_threshold=float(request.args.get("attendance_threshold", 75)),
    ), 200


@bp.get("/recommendations")
@trainer_required("scores.read")
def recommendations():
    return get_recommendations(
        subject_id=_optional_uuid(request.args.get("subject_id"), "subject_id"),
        student_id=_optional_uuid(request.args.get("student_id"), "student_id"),
    ), 200


@bp.get("/cohort")
@trainer_required("scores.read")
def cohort():
    subject_id = _optional_uuid(request.args.get("subject_id"), "subject_id")
    if not subject_id:
        return {"error": "Missing 'subject_id'"}, 400
    return get_cohort_drilldown(subject_id), 200


@bp.get("/student/<student_id>")
@trainer_required("students.read")
def student_detail(student_id: str):
    return get_student_drilldown(_optional_uuid(student_id, "student_id") or student_id), 200


@bp.get("/competency/<competency_id>")
@trainer_required("scores.read")
def competency_detail(competency_id: str):
    return get_competency_drilldown(_optional_uuid(competency_id, "competency_id") or competency_id), 200


@bp.get("/cohort-comparison")
@trainer_required("scores.read")
def cohort_comparison():
    cohort_a = _optional_uuid(request.args.get("cohort_a"), "cohort_a")
    cohort_b = _optional_uuid(request.args.get("cohort_b"), "cohort_b")
    return get_cohort_comparison(cohort_a, cohort_b, trainer_id=str(g.current_trainer.id)), 200


@bp.get("/student-dashboard")
@student_required()
def student_dashboard():
    return build_role_dashboard("student", student_id=str(g.current_student.id)), 200


@bp.get("/trainer-dashboard")
@trainer_required("scores.read")
def trainer_dashboard():
    return build_role_dashboard("trainer", trainer_id=str(g.current_trainer.id)), 200


@bp.get("/admin-dashboard")
@admin_required("admin.analytics.read")
def admin_dashboard():
    return build_role_dashboard("admin"), 200
