from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import datetime

from flask import Blueprint, request
from sqlalchemy import and_, func

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
from ..models.student_report import StudentReport
from ..models.attendance_session import AttendanceRecord, AttendanceSession
from ..models.practical_assessment_report import PracticalAssessmentReport
from ..models.score_evidence import ScoreEvidence
from ..models.trainer import Trainer
from ..models.user import User
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


def _parse_behaviour_report_body(body: str | None) -> dict[str, str | None]:
    content = (body or "").strip()
    if not content:
        return {"incident_date": None, "category": None, "action_taken": None, "notes": None}

    parsed = {"incident_date": None, "category": None, "action_taken": None, "notes": None}
    note_lines: list[str] = []
    in_notes = False

    for raw_line in content.splitlines():
        line = raw_line.strip()
        lower = line.lower()
        if lower.startswith("incident date:"):
            parsed["incident_date"] = line.split(":", 1)[1].strip() or None
            in_notes = False
            continue
        if lower.startswith("category:"):
            parsed["category"] = line.split(":", 1)[1].strip() or None
            in_notes = False
            continue
        if lower.startswith("action taken:"):
            parsed["action_taken"] = line.split(":", 1)[1].strip() or None
            in_notes = False
            continue
        if lower == "notes:":
            in_notes = True
            continue

        if in_notes or (not parsed["incident_date"] and not parsed["category"] and not parsed["action_taken"]):
            if raw_line.strip():
                note_lines.append(raw_line.strip())

    if note_lines:
        parsed["notes"] = "\n".join(note_lines).strip()
    elif content:
        parsed["notes"] = content

    return parsed


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
    try:
        sid = _parse_uuid(student_id, "student_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    student = db.session.get(Student, sid)
    if not student or student.deleted_at:
        return {"error": "Student not found"}, 404

    access = check_report_permission(user, "student_discipline", student_id)
    student_is_owner = bool(_is_student(user) and user.student and user.student.id == sid)
    if not access.canView and not student_is_owner:
        return {"error": access.reason}, 403

    query = db.session.query(StudentReport).filter(
        StudentReport.student_id == sid,
        StudentReport.report_type == "behaviour",
        StudentReport.deleted_at.is_(None),
    )
    if student_is_owner:
        query = query.filter(StudentReport.visibility == "student")
    if _is_trainer(user) and user.trainer and not _is_admin(user):
        query = query.filter(StudentReport.trainer_id == user.trainer.id)

    reports = query.order_by(StudentReport.created_at.desc()).all()
    incidents = []
    actions = []
    for report in reports:
        parsed = _parse_behaviour_report_body(report.body)
        incident = {
            "id": str(report.id),
            "title": report.title,
            "category": parsed["category"] or "General",
            "incident_date": parsed["incident_date"] or (report.created_at.date().isoformat() if report.created_at else None),
            "subject_id": str(report.subject_id) if report.subject_id else None,
            "subject_name": report.subject.name if report.subject else None,
            "recorded_by": report.author.name if report.author else None,
            "notes": parsed["notes"],
            "action_taken": parsed["action_taken"],
            "attachments": report.attachments if isinstance(report.attachments, list) else [],
            "created_at": report.created_at.isoformat() if report.created_at else None,
        }
        incidents.append(incident)
        if parsed["action_taken"]:
            actions.append(
                {
                    "report_id": str(report.id),
                    "title": report.title,
                    "incident_date": incident["incident_date"],
                    "action_taken": parsed["action_taken"],
                    "recorded_by": incident["recorded_by"],
                    "created_at": incident["created_at"],
                }
            )

    log_view(user, "student_discipline", entity_id=student_id, metadata={"count": len(incidents)})
    return {
        "student_id": student_id,
        "student_name": student.user.name if student.user else student.registration_number,
        "incidents": incidents,
        "actions": actions,
        "note": "Generated from existing behaviour records.",
        "permissions": {
            "canPrint": access.canPrint if not student_is_owner else False,
            "canExport": access.canExport if not student_is_owner else False,
        },
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
    if not _is_admin(user):
        return {"error": "Admin access required"}, 403
    minimum_attendance = float(request.args.get("minimum_attendance", 75))
    students = db.session.query(Student).filter(Student.deleted_at.is_(None)).all()
    learner_rows = []
    for student in students:
        subject_ids = [
            row[0]
            for row in db.session.query(StudentSubject.subject_id).filter(
                StudentSubject.student_id == student.id
            ).all()
        ]
        expected_subjects = len(set(subject_ids))
        completed_subjects = (
            db.session.query(func.count(func.distinct(Score.subject_id)))
            .filter(
                Score.student_id == student.id,
                Score.subject_id.in_(subject_ids) if subject_ids else False,
                Score.deleted_at.is_(None),
            )
            .scalar()
        ) or 0
        session_ids = [
            row[0]
            for row in db.session.query(AttendanceSession.id).filter(
                AttendanceSession.subject_id.in_(subject_ids) if subject_ids else False,
                AttendanceSession.deleted_at.is_(None),
            ).all()
        ]
        successful_checkins = (
            db.session.query(func.count(AttendanceRecord.id))
            .filter(
                AttendanceRecord.student_id == student.id,
                AttendanceRecord.attendance_session_id.in_(session_ids) if session_ids else False,
                AttendanceRecord.status.in_(["success", "manual"]),
                AttendanceRecord.deleted_at.is_(None),
            )
            .scalar()
        ) or 0
        attendance_rate = round(successful_checkins / len(session_ids) * 100, 1) if session_ids else 0.0
        assessments_complete = expected_subjects > 0 and completed_subjects >= expected_subjects
        attendance_compliant = attendance_rate >= minimum_attendance
        learner_rows.append({
            "student_id": str(student.id),
            "student_name": student.user.name if student.user else student.registration_number,
            "registration_number": student.registration_number,
            "attendance_rate": attendance_rate,
            "attendance_sessions": len(session_ids),
            "successful_checkins": successful_checkins,
            "subjects_expected": expected_subjects,
            "subjects_with_formative_scores": int(completed_subjects),
            "assessments_complete": assessments_complete,
            "attendance_compliant": attendance_compliant,
            "ready_for_final_assessment": attendance_compliant and assessments_complete,
        })

    trainer_rows = []
    trainers = db.session.query(Trainer).filter(Trainer.deleted_at.is_(None)).all()
    for trainer in trainers:
        subject_ids = [
            row[0]
            for row in db.session.query(TrainerSubject.subject_id).filter(
                TrainerSubject.trainer_id == trainer.id
            ).all()
        ]
        attendance_sessions = db.session.query(func.count(AttendanceSession.id)).filter(
            AttendanceSession.trainer_id == trainer.id,
            AttendanceSession.deleted_at.is_(None),
        ).scalar() or 0
        scored_records = db.session.query(func.count(Score.id)).filter(
            Score.trainer_id == trainer.id,
            Score.deleted_at.is_(None),
        ).scalar() or 0
        marked_scripts = db.session.query(func.count(ScoreEvidence.id)).filter(
            ScoreEvidence.trainer_id == trainer.id,
            ScoreEvidence.deleted_at.is_(None),
        ).scalar() or 0
        practical_reports = db.session.query(PracticalAssessmentReport).filter(
            PracticalAssessmentReport.trainer_id == trainer.id,
            PracticalAssessmentReport.deleted_at.is_(None),
        ).all()
        practical_evidence = sum(len(report.media_attachments or []) for report in practical_reports)
        oral_evidence = sum(
            1
            for report in practical_reports
            for attachment in (report.media_attachments or [])
            if isinstance(attachment, dict) and attachment.get("evidence_type") == "oral_audio"
        )
        trainer_rows.append({
            "trainer_id": str(trainer.id),
            "trainer_name": trainer.user.name if trainer.user else "Unknown trainer",
            "assigned_subjects": len(subject_ids),
            "attendance_sessions": int(attendance_sessions),
            "scored_records": int(scored_records),
            "marked_script_files": int(marked_scripts),
            "practical_evidence_files": practical_evidence,
            "oral_evidence_files": oral_evidence,
            "compliant": bool(attendance_sessions and scored_records and marked_scripts),
        })
    ready_count = sum(1 for row in learner_rows if row["ready_for_final_assessment"])
    return {
        "minimum_attendance": minimum_attendance,
        "summary": {
            "learners": len(learner_rows),
            "ready": ready_count,
            "not_ready": len(learner_rows) - ready_count,
            "trainer_compliance": sum(1 for row in trainer_rows if row["compliant"]),
            "trainers": len(trainer_rows),
        },
        "learners": learner_rows,
        "trainers": trainer_rows,
        "generated_at": datetime.utcnow().isoformat(),
    }, 200
