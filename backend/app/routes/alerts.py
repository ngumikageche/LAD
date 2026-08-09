"""Alerts on poor performance and low attendance, scoped to the caller."""

from __future__ import annotations

import uuid

from flask import Blueprint, request

from ..extensions import db
from ..models.alert import Alert
from ..models.student import Student
from ..services.alerts import (
    ATTENDANCE,
    ATTENDANCE_THRESHOLD,
    PERFORMANCE,
    PERFORMANCE_THRESHOLD,
    alert_payload,
    evaluate_students,
)
from ..services.scoping import can_view_master_data, is_student, scope_students
from .permissions import log_view, require_permission


bp = Blueprint("alerts", __name__, url_prefix="/alerts")

TRUTHY = {"1", "true", "yes", "on"}


def _visible_students(user) -> list[Student]:
    """
    The learners this caller may be alerted about — their institution, and for a
    trainer only the ones in their subjects. A learner sees only themselves.
    """
    query = scope_students(db.session.query(Student), user).filter(Student.deleted_at.is_(None))
    return query.all()


@bp.get("")
def list_alerts():
    user, error, status = require_permission("alerts.read")
    if error:
        # Students reach their own alerts through their notification permission
        # rather than needing a separate grant.
        user, error, status = require_permission("notifications.read")
        if error:
            return error, status

    student_ids = [student.id for student in _visible_students(user)]
    if not student_ids:
        return {"alerts": [], "total": 0, "unresolved": 0}, 200

    query = db.session.query(Alert).filter(
        Alert.student_id.in_(student_ids),
        Alert.deleted_at.is_(None),
    )

    alert_type = (request.args.get("type") or "").strip().lower()
    if alert_type:
        if alert_type not in {PERFORMANCE, ATTENDANCE}:
            return {"error": "'type' must be one of: performance, attendance"}, 400
        query = query.filter(Alert.alert_type == alert_type)

    if (request.args.get("include_resolved") or "").lower() not in TRUTHY:
        query = query.filter(Alert.resolved.is_(False))

    alerts = query.order_by(Alert.triggered_at.desc()).all()
    log_view(user, "alerts", metadata={"scope": "list", "count": len(alerts)})
    return {
        "alerts": [alert_payload(alert) for alert in alerts],
        "total": len(alerts),
        "unresolved": sum(1 for alert in alerts if not alert.resolved),
        "thresholds": {"performance": PERFORMANCE_THRESHOLD, "attendance": ATTENDANCE_THRESHOLD},
    }, 200


@bp.post("/evaluate")
def evaluate_alerts():
    """
    Recompute both signals for every learner in the caller's scope, opening,
    refreshing, or resolving alerts and notifying learners and their trainers.
    """
    user, error, status = require_permission("alerts.manage")
    if error:
        user, error, status = require_permission("reports.student.write")
        if error:
            return error, status

    if is_student(user) and not can_view_master_data(user):
        return {"error": "Permission denied"}, 403

    students = _visible_students(user)
    summary = evaluate_students(students)
    log_view(
        user,
        "alerts.evaluate",
        metadata={
            "action": "evaluate",
            "evaluated": summary["evaluated"],
            "raised": summary["raised"],
            "resolved": summary["resolved"],
        },
    )
    return summary, 200


@bp.post("/<alert_id>/resolve")
def resolve_alert(alert_id: str):
    user, error, status = require_permission("alerts.manage")
    if error:
        user, error, status = require_permission("reports.student.write")
        if error:
            return error, status

    try:
        alert_uuid = uuid.UUID(str(alert_id))
    except (TypeError, ValueError):
        return {"error": "Invalid 'alert_id'"}, 400

    alert = db.session.get(Alert, alert_uuid)
    if not alert or alert.deleted_at:
        return {"error": "Alert not found"}, 404

    visible_ids = {student.id for student in _visible_students(user)}
    if alert.student_id not in visible_ids:
        return {"error": "Alert not found"}, 404

    alert.resolved = True
    db.session.commit()
    log_view(user, "alerts", entity_id=alert_id, metadata={"action": "resolve"})
    return alert_payload(alert), 200
