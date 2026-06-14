from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import datetime

from flask import Blueprint, request
from sqlalchemy import and_

from ..extensions import db
from ..models.attendance import Attendance
from ..models.enrollment import Enrollment
from ..models.score import Score
from ..models.student import Student
from ..models.subject import Subject
from ..models.term import Term
from ..models.trainer_subject import TrainerSubject
from ..models.student_subject import StudentSubject
from ..models.institution import Institution
from .permissions import get_current_user, log_view, _is_admin, _is_trainer, _is_student
from ..services.report_permissions import check_report_permission
from ..services import report_queries

bp = Blueprint("reports", __name__, url_prefix="/reports")


def _parse_uuid(value: str | None, field: str) -> uuid.UUID:
    if not value:
        raise ValueError(f"Missing '{field}'")
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError) as exc:
        raise ValueError(f"Invalid '{field}'") from exc


def _school_info(user) -> dict:
    inst = user.institution
    if not inst and user.student and user.student.course:
        dept = getattr(user.student.course, "department", None)
        inst = getattr(dept, "institution", None) if dept else None
    return {
        "name": inst.name if inst else "Learning & Development",
        "location": inst.location if inst else "",
        "type": inst.type if inst else "",
    }


def _can_access_student(user, student: Student) -> bool:
    """Return True if the requesting user may view this student's reports."""
    return check_report_permission(user, "student_term", student.id).canView


# ─────────────────────────────────────────────────────────────
# S1 — Report Card
# ─────────────────────────────────────────────────────────────

@bp.get("/student/<student_id>/report-card")
def report_card(student_id: str):
    user, error, status = get_current_user()
    if error:
        return error, status

    try:
        sid = _parse_uuid(student_id, "student_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    student = db.session.get(Student, sid)
    if not student or student.deleted_at:
        return {"error": "Student not found"}, 404

    if not _can_access_student(user, student):
        return {"error": "Permission denied"}, 403

    term_id_str = request.args.get("term_id")
    term = None
    if term_id_str:
        try:
            term_uuid = _parse_uuid(term_id_str, "term_id")
            term = db.session.get(Term, term_uuid)
        except ValueError as exc:
            return {"error": str(exc)}, 400
    else:
        term = db.session.query(Term).filter(Term.is_active == True).first()

    # Scores for this student, optionally filtered by term name
    score_query = db.session.query(Score).filter(
        Score.student_id == sid,
        Score.deleted_at.is_(None),
    )
    if term:
        score_query = score_query.filter(Score.term == term.name)
    scores = score_query.all()

    # Build subject rows
    subject_rows = []
    for score in scores:
        subject = score.subject
        assessment = score.assessment
        total = assessment.total_marks if assessment else None
        subject_rows.append({
            "subject_id": str(score.subject_id) if score.subject_id else None,
            "subject_name": subject.name if subject else "Unknown",
            "assessment_name": assessment.name if assessment else None,
            "marks_obtained": score.marks_obtained,
            "total_marks": total,
            "percentage": round(score.marks_obtained / total * 100, 1) if total else None,
            "grade": score.grade,
            "is_passed": score.is_passed,
            "feedback": score.feedback,
        })

    # Attendance summary for the term
    att_query = db.session.query(Attendance).filter(
        Attendance.student_id == sid,
        Attendance.deleted_at.is_(None),
    )
    if term:
        att_query = att_query.filter(
            Attendance.date >= term.start_date,
            Attendance.date <= term.end_date,
        )
    attendances = att_query.all()
    att_summary = {
        "total": len(attendances),
        "present": sum(1 for a in attendances if a.status.lower() == "present"),
        "absent": sum(1 for a in attendances if a.status.lower() == "absent"),
        "late": sum(1 for a in attendances if a.status.lower() == "late"),
    }

    course = student.course
    log_view(user, "report.report_card", entity_id=student_id,
             metadata={"term": term.name if term else None})

    return {
        "school": _school_info(user),
        "student": {
            "id": str(student.id),
            "name": student.user.name if student.user else "Unknown",
            "registration_number": student.registration_number,
            "enrollment_year": student.enrollment_year,
            "course": course.name if course else None,
        },
        "term": {
            "id": str(term.id) if term else None,
            "name": term.name if term else None,
            "start_date": term.start_date.isoformat() if term else None,
            "end_date": term.end_date.isoformat() if term else None,
        },
        "subjects": subject_rows,
        "attendance": att_summary,
        "generated_at": datetime.utcnow().isoformat(),
    }, 200


# ─────────────────────────────────────────────────────────────
# S2 — Attendance Report
# ─────────────────────────────────────────────────────────────

@bp.get("/student/<student_id>/attendance")
def attendance_report(student_id: str):
    user, error, status = get_current_user()
    if error:
        return error, status

    try:
        sid = _parse_uuid(student_id, "student_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    student = db.session.get(Student, sid)
    if not student or student.deleted_at:
        return {"error": "Student not found"}, 404

    access = check_report_permission(user, "student_attendance", student.id)
    if not access.canView:
        return {"error": access.reason}, 403

    term_id_str = request.args.get("term_id")
    month_str = request.args.get("month")  # format: YYYY-MM
    term = None

    if term_id_str:
        try:
            term_uuid = _parse_uuid(term_id_str, "term_id")
            term = db.session.get(Term, term_uuid)
        except ValueError as exc:
            return {"error": str(exc)}, 400
    else:
        term = db.session.query(Term).filter(Term.is_active == True).first()

    att_query = db.session.query(Attendance).filter(
        Attendance.student_id == sid,
        Attendance.deleted_at.is_(None),
    )
    if term:
        att_query = att_query.filter(
            Attendance.date >= term.start_date,
            Attendance.date <= term.end_date,
        )
    if month_str:
        try:
            month_dt = datetime.strptime(month_str, "%Y-%m")
            from calendar import monthrange
            last_day = monthrange(month_dt.year, month_dt.month)[1]
            month_end = month_dt.replace(day=last_day)
            att_query = att_query.filter(
                Attendance.date >= month_dt,
                Attendance.date <= month_end,
            )
        except ValueError:
            return {"error": "Invalid month format, use YYYY-MM"}, 400

    attendances = att_query.order_by(Attendance.date).all()

    # Build daily records
    daily = [
        {
            "date": a.date.strftime("%Y-%m-%d") if hasattr(a.date, "strftime") else str(a.date),
            "status": a.status.lower(),
            "module_id": str(a.module_id) if a.module_id else None,
        }
        for a in attendances
    ]

    total = len(daily)
    present = sum(1 for d in daily if d["status"] == "present")
    absent = sum(1 for d in daily if d["status"] == "absent")
    late = sum(1 for d in daily if d["status"] == "late")
    percentage = round(present / total * 100, 1) if total > 0 else 0

    log_view(user, "report.attendance", entity_id=student_id,
             metadata={"term": term.name if term else None, "month": month_str})

    return {
        "school": _school_info(user),
        "student": {
            "id": str(student.id),
            "name": student.user.name if student.user else "Unknown",
            "registration_number": student.registration_number,
        },
        "term": {
            "id": str(term.id) if term else None,
            "name": term.name if term else None,
        },
        "month": month_str,
        "records": daily,
        "summary": {
            "total": total,
            "present": present,
            "absent": absent,
            "late": late,
            "percentage": percentage,
            "below_threshold": percentage < 75 and total > 0,
        },
        "generated_at": datetime.utcnow().isoformat(),
    }, 200


# ─────────────────────────────────────────────────────────────
# S3 — Fee Statement (stub — no fees table in schema)
# ─────────────────────────────────────────────────────────────

@bp.get("/student/<student_id>/fees")
def fee_statement(student_id: str):
    user, error, status = get_current_user()
    if error:
        return error, status

    # Trainers have no access to fee records
    if _is_trainer(user) and not _is_admin(user):
        return {"error": "Permission denied"}, 403

    try:
        sid = _parse_uuid(student_id, "student_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    student = db.session.get(Student, sid)
    if not student or student.deleted_at:
        return {"error": "Student not found"}, 404

    access = check_report_permission(user, "student_fees", student.id)
    if not access.canView:
        return {"error": access.reason}, 403

    term_id_str = request.args.get("term_id")
    term = None
    if term_id_str:
        try:
            term_uuid = _parse_uuid(term_id_str, "term_id")
            term = db.session.get(Term, term_uuid)
        except ValueError as exc:
            return {"error": str(exc)}, 400
    else:
        term = db.session.query(Term).filter(Term.is_active == True).first()

    log_view(user, "report.fees", entity_id=student_id,
             metadata={"term": term.name if term else None})

    # No fees table — return empty structure so frontend renders gracefully
    return {
        "school": _school_info(user),
        "student": {
            "id": str(student.id),
            "name": student.user.name if student.user else "Unknown",
            "registration_number": student.registration_number,
        },
        "term": {
            "id": str(term.id) if term else None,
            "name": term.name if term else None,
        },
        "line_items": [],
        "summary": {
            "total_charged": 0,
            "total_paid": 0,
            "balance": 0,
        },
        "payments": [],
        "note": "Fee management module not yet configured.",
        "generated_at": datetime.utcnow().isoformat(),
    }, 200


@bp.get("/student/<student_id>/term/<term_id>")
def student_term(student_id: str, term_id: str):
    user, error, status = get_current_user()
    if error:
        return error, status
    try:
        return report_queries.student_term_report(user, student_id, term_id)
    except ValueError:
        return {"error": "Invalid student_id or term_id"}, 400


@bp.get("/student/<student_id>/transcript")
def transcript(student_id: str):
    user, error, status = get_current_user()
    if error:
        return error, status
    try:
        return report_queries.student_transcript(user, student_id)
    except ValueError:
        return {"error": "Invalid student_id"}, 400


@bp.get("/student/<student_id>/discipline")
def discipline(student_id: str):
    user, error, status = get_current_user()
    if error:
        return error, status
    access = check_report_permission(user, "student_discipline", student_id)
    if not access.canView:
        return {"error": access.reason}, 403
    return {
        "student_id": student_id,
        "incidents": [],
        "actions": [],
        "note": "No discipline/behaviour table exists in the current schema.",
        "permissions": {"canPrint": access.canPrint, "canExport": access.canExport},
        "generated_at": datetime.utcnow().isoformat(),
    }, 200


@bp.get("/class/<class_id>/performance")
def class_performance_alias(class_id: str):
    user, error, status = get_current_user()
    if error:
        return error, status
    try:
        return report_queries.class_performance_report(user, class_id, request.args.get("term_id"))
    except ValueError:
        return {"error": "Invalid class_id or term_id"}, 400


@bp.get("/class/<class_id>/at-risk")
def class_at_risk(class_id: str):
    user, error, status = get_current_user()
    if error:
        return error, status
    try:
        threshold = float(request.args.get("threshold", 50))
        return report_queries.at_risk_students_report(user, class_id, request.args.get("term_id"), threshold)
    except ValueError:
        return {"error": "Invalid class_id, term_id, or threshold"}, 400


@bp.get("/teacher/<teacher_id>/attendance")
def teacher_attendance_alias(teacher_id: str):
    user, error, status = get_current_user()
    if error:
        return error, status
    try:
        return report_queries.teacher_attendance_report(
            user,
            teacher_id,
            request.args.get("dateFrom") or request.args.get("date_from"),
            request.args.get("dateTo") or request.args.get("date_to"),
        )
    except ValueError:
        return {"error": "Invalid teacher_id or date filter"}, 400


@bp.get("/teacher/<teacher_id>/appraisal")
def teacher_appraisal(teacher_id: str):
    user, error, status = get_current_user()
    if error:
        return error, status
    access = check_report_permission(user, "teacher_appraisal", teacher_id)
    if not access.canView:
        return {"error": access.reason}, 403
    return {
        "teacher_id": teacher_id,
        "items": [],
        "note": "No appraisal/evaluation table exists in the current schema.",
        "permissions": {"canPrint": access.canPrint, "canExport": access.canExport},
        "generated_at": datetime.utcnow().isoformat(),
    }, 200


@bp.get("/admin/pass-rate")
def admin_pass_rate_alias():
    user, error, status = get_current_user()
    if error:
        return error, status
    try:
        return report_queries.school_pass_rate_report(user, request.args.get("term_id"))
    except ValueError:
        return {"error": "Invalid term_id"}, 400


@bp.get("/admin/safeguarding")
def admin_safeguarding():
    user, error, status = get_current_user()
    if error:
        return error, status
    return report_queries.empty_admin_stub(user, "admin_safeguarding", "Safeguarding Log")


@bp.get("/admin/compliance")
def admin_compliance():
    user, error, status = get_current_user()
    if error:
        return error, status
    return report_queries.empty_admin_stub(user, "admin_compliance", "Compliance")
