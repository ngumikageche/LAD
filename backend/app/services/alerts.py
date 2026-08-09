"""
Poor-performance and low-attendance alerting.

The `alerts` table existed but nothing ever wrote to it, so "at risk" was only
ever a number computed on the fly for a dashboard tile — nobody was told. This
evaluates both signals for a set of learners, persists one open alert per
(student, type), notifies the learner and the trainers who teach them, and
resolves an alert once the learner recovers so the list does not accumulate
stale warnings.

Thresholds are percentages, so a subject marked out of 40 and one marked out of
100 are judged on the same scale — see `scoping.percentage`.
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

from sqlalchemy import func

from ..extensions import db
from ..models.alert import Alert
from ..models.attendance import Attendance
from ..models.attendance_session import AttendanceRecord, AttendanceSession
from ..models.notification import Notification
from ..models.score import Score
from ..models.student import Student
from ..models.student_subject import StudentSubject
from ..models.subject import Subject
from ..models.trainer import Trainer
from ..models.trainer_subject import TrainerSubject
from .scoping import average_percentage

PERFORMANCE_THRESHOLD = 50.0
ATTENDANCE_THRESHOLD = 75.0
ATTENDANCE_LOOKBACK_DAYS = 90
MIN_SCORES_FOR_ALERT = 1
MIN_ATTENDANCE_EVENTS = 3

PERFORMANCE = "performance"
ATTENDANCE = "attendance"


# ── Signals ──────────────────────────────────────────────────────────────────

def performance_rate(student_id: uuid.UUID, subject_ids: list[uuid.UUID] | None = None) -> tuple[float | None, int]:
    """Average percentage across a learner's scores, and how many were counted."""
    query = db.session.query(Score).filter(
        Score.student_id == student_id,
        Score.deleted_at.is_(None),
    )
    if subject_ids is not None:
        if not subject_ids:
            return None, 0
        query = query.filter(Score.subject_id.in_(subject_ids))
    scores = query.all()
    if len(scores) < MIN_SCORES_FOR_ALERT:
        return None, len(scores)
    return average_percentage(scores), len(scores)


def attendance_rate(student_id: uuid.UUID, since: date | None = None) -> tuple[float | None, int]:
    """
    Attendance percentage across both registers.

    Marks live either in `attendance` (a manual register with a status) or in
    `attendance_records` (a QR/GPS check-in against a session). A learner who
    only ever used one of the two would otherwise look like they had no
    attendance history at all.
    """
    since = since or (date.today() - timedelta(days=ATTENDANCE_LOOKBACK_DAYS))

    manual = (
        db.session.query(Attendance)
        .filter(
            Attendance.student_id == student_id,
            Attendance.deleted_at.is_(None),
            Attendance.date >= since,
        )
        .all()
    )
    present = sum(1 for row in manual if (row.status or "").lower() in {"present", "late"})
    total = len(manual)

    # Every session the learner's subjects ran counts as an expected sitting;
    # a session with no record for them is an absence.
    subject_ids = [
        row[0] for row in db.session.query(StudentSubject.subject_id)
        .filter(StudentSubject.student_id == student_id)
        .all()
    ]
    if subject_ids:
        sessions = (
            db.session.query(AttendanceSession.id)
            .filter(
                AttendanceSession.subject_id.in_(subject_ids),
                AttendanceSession.deleted_at.is_(None),
                func.date(AttendanceSession.started_at) >= since,
            )
            .all()
        )
        session_ids = [row[0] for row in sessions]
        if session_ids:
            attended = (
                db.session.query(func.count(AttendanceRecord.id))
                .filter(
                    AttendanceRecord.attendance_session_id.in_(session_ids),
                    AttendanceRecord.student_id == student_id,
                    AttendanceRecord.status == "success",
                )
                .scalar()
            ) or 0
            present += attended
            total += len(session_ids)

    if total < MIN_ATTENDANCE_EVENTS:
        return None, total
    return round(present / total * 100, 1), total


# ── Alert lifecycle ──────────────────────────────────────────────────────────

def _open_alert(student_id: uuid.UUID, alert_type: str) -> Alert | None:
    return (
        db.session.query(Alert)
        .filter(
            Alert.student_id == student_id,
            Alert.alert_type == alert_type,
            Alert.resolved.is_(False),
            Alert.deleted_at.is_(None),
        )
        .first()
    )


def _trainer_user_ids(student_id: uuid.UUID) -> list[uuid.UUID]:
    """Users teaching any subject this learner takes."""
    subject_ids = db.session.query(StudentSubject.subject_id).filter(
        StudentSubject.student_id == student_id
    )
    rows = (
        db.session.query(Trainer.user_id)
        .join(TrainerSubject, TrainerSubject.trainer_id == Trainer.id)
        .filter(TrainerSubject.subject_id.in_(subject_ids), Trainer.user_id.isnot(None))
        .distinct()
        .all()
    )
    return [row[0] for row in rows]


def _raise_alert(student: Student, alert_type: str, message: str, notify: bool = True) -> Alert | None:
    """Open an alert if one is not already open, and tell the people who act on it."""
    existing = _open_alert(student.id, alert_type)
    if existing:
        # Refresh the wording so the figure quoted stays current.
        existing.message = message
        return None

    alert = Alert(student_id=student.id, alert_type=alert_type, message=message, resolved=False)
    db.session.add(alert)

    if notify:
        title = (
            "Performance alert" if alert_type == PERFORMANCE else "Attendance alert"
        )
        if student.user_id:
            db.session.add(
                Notification(user_id=student.user_id, title=title, message=message, is_read=False)
            )
        learner_name = student.user.name if student.user else student.registration_number
        for trainer_user_id in _trainer_user_ids(student.id):
            db.session.add(
                Notification(
                    user_id=trainer_user_id,
                    title=f"{title}: {learner_name}",
                    message=message,
                    is_read=False,
                )
            )
    return alert


def _resolve_alert(student_id: uuid.UUID, alert_type: str) -> bool:
    alert = _open_alert(student_id, alert_type)
    if not alert:
        return False
    alert.resolved = True
    return True


def evaluate_student(student: Student, subject_ids: list[uuid.UUID] | None = None) -> dict:
    """Evaluate both signals for one learner and reconcile their open alerts."""
    result: dict = {
        "student_id": str(student.id),
        "student_name": student.user.name if student.user else student.registration_number,
        "raised": [],
        "resolved": [],
    }

    average, score_count = performance_rate(student.id, subject_ids)
    if average is not None:
        if average < PERFORMANCE_THRESHOLD:
            message = (
                f"Average performance is {average}% across {score_count} "
                f"assessment{'s' if score_count != 1 else ''}, below the {PERFORMANCE_THRESHOLD:.0f}% threshold."
            )
            if _raise_alert(student, PERFORMANCE, message):
                result["raised"].append(PERFORMANCE)
        elif _resolve_alert(student.id, PERFORMANCE):
            result["resolved"].append(PERFORMANCE)
    result["performance_rate"] = average

    rate, event_count = attendance_rate(student.id)
    if rate is not None:
        if rate < ATTENDANCE_THRESHOLD:
            message = (
                f"Attendance is {rate}% across {event_count} recorded "
                f"session{'s' if event_count != 1 else ''}, below the {ATTENDANCE_THRESHOLD:.0f}% threshold."
            )
            if _raise_alert(student, ATTENDANCE, message):
                result["raised"].append(ATTENDANCE)
        elif _resolve_alert(student.id, ATTENDANCE):
            result["resolved"].append(ATTENDANCE)
    result["attendance_rate"] = rate

    return result


def evaluate_students(students: list[Student], subject_ids: list[uuid.UUID] | None = None) -> dict:
    """Evaluate a cohort in one transaction and report what changed."""
    evaluations = [evaluate_student(student, subject_ids) for student in students]
    db.session.commit()
    return {
        "evaluated": len(evaluations),
        "raised": sum(len(item["raised"]) for item in evaluations),
        "resolved": sum(len(item["resolved"]) for item in evaluations),
        "thresholds": {
            "performance": PERFORMANCE_THRESHOLD,
            "attendance": ATTENDANCE_THRESHOLD,
        },
        "results": evaluations,
    }


def alert_payload(alert: Alert) -> dict:
    student = alert.student
    return {
        "id": str(alert.id),
        "student_id": str(alert.student_id) if alert.student_id else None,
        "student_name": (
            student.user.name if student and student.user else (student.registration_number if student else None)
        ),
        "registration_number": student.registration_number if student else None,
        "alert_type": alert.alert_type,
        "message": alert.message,
        "resolved": alert.resolved,
        "triggered_at": alert.triggered_at.isoformat() if alert.triggered_at else None,
    }
