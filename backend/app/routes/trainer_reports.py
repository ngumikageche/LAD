from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import datetime

from flask import Blueprint, g, request
from sqlalchemy import and_, func

from ..extensions import db
from ..models.lesson_plan import LessonPlan
from ..models.score import Score
from ..models.staff_attendance import StaffAttendance
from ..models.student import Student
from ..models.student_subject import StudentSubject
from ..models.subject import Subject
from ..models.term import Term
from ..models.trainer_subject import TrainerSubject
from ..models.user import User
from .permissions import get_current_user, log_view, _is_admin, _is_trainer
from ..services.trainer_portal import (
    ensure_subject_access,
    get_trainer_subject_ids,
    parse_uuid,
    PASS_MARK,
)

bp = Blueprint("trainer_reports", __name__, url_prefix="/reports/trainer")


def _get_active_term() -> Term | None:
    return db.session.query(Term).filter(Term.is_active == True).first()


def _resolve_term(term_id_str: str | None) -> Term | None:
    if term_id_str:
        try:
            return db.session.get(Term, parse_uuid(term_id_str, "term_id"))
        except ValueError:
            return None
    return _get_active_term()


def _school_info(user) -> dict:
    inst = user.institution
    return {
        "name": inst.name if inst else "Learning & Development",
        "location": inst.location if inst else "",
    }


def _require_trainer_or_admin():
    """Returns (user, trainer_or_None, error, status)."""
    user, error, status = get_current_user()
    if error:
        return None, None, error, status
    trainer = user.trainer if user else None
    if not _is_admin(user) and not _is_trainer(user):
        return None, None, {"error": "Trainer or admin access required"}, 403
    return user, trainer, None, None


# ─────────────────────────────────────────────────────────────
# T1 — Class Performance Report
# GET /reports/trainer/subject/<subject_id>/performance
# ─────────────────────────────────────────────────────────────

@bp.get("/subject/<subject_id>/performance")
def class_performance(subject_id: str):
    user, trainer, error, status = _require_trainer_or_admin()
    if error:
        return error, status

    try:
        sub_uuid = parse_uuid(subject_id, "subject_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    subject = db.session.get(Subject, sub_uuid)
    if not subject:
        return {"error": "Subject not found"}, 404

    # Trainers must own the subject; admins bypass
    if not _is_admin(user):
        ensure_subject_access(trainer, sub_uuid)

    term_id_str = request.args.get("term_id")
    term = _resolve_term(term_id_str)

    # All students enrolled in this subject
    students = (
        db.session.query(Student)
        .join(StudentSubject, StudentSubject.student_id == Student.id)
        .join(User, User.id == Student.user_id)
        .filter(StudentSubject.subject_id == sub_uuid)
        .order_by(User.name.asc())
        .all()
    )

    # Scores for this subject, optionally filtered by term
    score_q = db.session.query(Score).filter(
        Score.subject_id == sub_uuid,
        Score.deleted_at.is_(None),
    )
    if term:
        score_q = score_q.filter(Score.term == term.name)
    scores = score_q.all()

    scores_by_student: dict[uuid.UUID, list[Score]] = defaultdict(list)
    for s in scores:
        if s.student_id:
            scores_by_student[s.student_id].append(s)

    # Build ranked rows
    rows = []
    for student in students:
        student_scores = scores_by_student.get(student.id, [])
        if student_scores:
            best = max(student_scores, key=lambda s: s.marks_obtained)
            rows.append({
                "student_id": str(student.id),
                "name": student.user.name if student.user else "Unknown",
                "registration_number": student.registration_number,
                "marks": best.marks_obtained,
                "total_marks": best.assessment.total_marks if best.assessment else None,
                "grade": best.grade,
                "is_passed": best.is_passed if best.is_passed is not None else best.marks_obtained >= PASS_MARK,
                "feedback": best.feedback,
            })
        else:
            rows.append({
                "student_id": str(student.id),
                "name": student.user.name if student.user else "Unknown",
                "registration_number": student.registration_number,
                "marks": None,
                "total_marks": None,
                "grade": None,
                "is_passed": None,
                "feedback": None,
            })

    # Sort by marks descending, assign rank
    scored = sorted([r for r in rows if r["marks"] is not None], key=lambda r: r["marks"], reverse=True)
    unscored = [r for r in rows if r["marks"] is None]
    for i, r in enumerate(scored):
        r["rank"] = i + 1
    for r in unscored:
        r["rank"] = None
    ranked = scored + unscored

    # Summary stats
    mark_values = [r["marks"] for r in scored]
    class_avg = round(sum(mark_values) / len(mark_values), 1) if mark_values else 0
    pass_count = sum(1 for r in scored if r["is_passed"])
    pass_rate = round(pass_count / len(scored) * 100, 1) if scored else 0
    top_mark = max(mark_values) if mark_values else 0

    # Grade distribution
    grade_dist: dict[str, int] = defaultdict(int)
    for r in scored:
        grade_dist[r["grade"] or "N/A"] += 1

    log_view(user, "report.class_performance", entity_id=subject_id,
             metadata={"term": term.name if term else None})

    return {
        "school": _school_info(user),
        "subject": {"id": str(subject.id), "name": subject.name},
        "term": {"id": str(term.id) if term else None, "name": term.name if term else None},
        "students": ranked,
        "summary": {
            "total_students": len(students),
            "scored_count": len(scored),
            "class_average": class_avg,
            "pass_rate": pass_rate,
            "top_mark": top_mark,
            "pass_count": pass_count,
            "fail_count": len(scored) - pass_count,
        },
        "grade_distribution": dict(grade_dist),
        "generated_at": datetime.utcnow().isoformat(),
    }, 200


# ─────────────────────────────────────────────────────────────
# T2 — Syllabus Coverage Tracker
# GET  /reports/trainer/<trainer_id>/syllabus
# POST /reports/trainer/<trainer_id>/syllabus  (add topic)
# PUT  /reports/trainer/<trainer_id>/syllabus/<plan_id>  (mark covered)
# ─────────────────────────────────────────────────────────────

@bp.get("/<trainer_id>/syllabus")
def syllabus_report(trainer_id: str):
    user, trainer, error, status = _require_trainer_or_admin()
    if error:
        return error, status

    try:
        t_uuid = parse_uuid(trainer_id, "trainer_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    # Trainers can only see their own syllabus
    if not _is_admin(user) and (not trainer or trainer.id != t_uuid):
        return {"error": "Permission denied"}, 403

    subject_id_str = request.args.get("subject_id")
    term_id_str = request.args.get("term_id")
    term = _resolve_term(term_id_str)

    q = db.session.query(LessonPlan).filter(
        LessonPlan.trainer_id == t_uuid,
        LessonPlan.deleted_at.is_(None),
    )
    if subject_id_str:
        try:
            q = q.filter(LessonPlan.subject_id == parse_uuid(subject_id_str, "subject_id"))
        except ValueError as exc:
            return {"error": str(exc)}, 400
    if term:
        q = q.filter(LessonPlan.term_id == term.id)

    plans = q.order_by(LessonPlan.planned_date.asc().nullslast(), LessonPlan.created_at.asc()).all()

    topics = [
        {
            "id": str(p.id),
            "topic": p.topic,
            "description": p.description,
            "planned_date": p.planned_date.isoformat() if p.planned_date else None,
            "covered_date": p.covered_date.isoformat() if p.covered_date else None,
            "status": "covered" if p.covered_date else "pending",
            "subject_id": str(p.subject_id),
            "subject_name": p.subject.name if p.subject else None,
        }
        for p in plans
    ]

    total = len(topics)
    covered = sum(1 for t in topics if t["status"] == "covered")
    pct = round(covered / total * 100, 1) if total > 0 else 0

    log_view(user, "report.syllabus", entity_id=trainer_id,
             metadata={"term": term.name if term else None})

    return {
        "school": _school_info(user),
        "trainer_id": trainer_id,
        "term": {"id": str(term.id) if term else None, "name": term.name if term else None},
        "topics": topics,
        "summary": {
            "total": total,
            "covered": covered,
            "pending": total - covered,
            "coverage_pct": pct,
        },
        "generated_at": datetime.utcnow().isoformat(),
    }, 200


@bp.post("/<trainer_id>/syllabus")
def add_syllabus_topic(trainer_id: str):
    user, trainer, error, status = _require_trainer_or_admin()
    if error:
        return error, status

    try:
        t_uuid = parse_uuid(trainer_id, "trainer_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    if not _is_admin(user) and (not trainer or trainer.id != t_uuid):
        return {"error": "Permission denied"}, 403

    payload = request.get_json(silent=True) or {}
    topic = (payload.get("topic") or "").strip()
    if not topic:
        return {"error": "'topic' is required"}, 400

    try:
        sub_uuid = parse_uuid(payload.get("subject_id"), "subject_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    term_id_str = payload.get("term_id")
    term_uuid = None
    if term_id_str:
        try:
            term_uuid = parse_uuid(term_id_str, "term_id")
        except ValueError as exc:
            return {"error": str(exc)}, 400

    planned_date = None
    if payload.get("planned_date"):
        try:
            from datetime import date
            planned_date = date.fromisoformat(payload["planned_date"])
        except ValueError:
            return {"error": "Invalid planned_date format, use YYYY-MM-DD"}, 400

    plan = LessonPlan(
        trainer_id=t_uuid,
        subject_id=sub_uuid,
        term_id=term_uuid,
        topic=topic,
        description=payload.get("description"),
        planned_date=planned_date,
    )
    db.session.add(plan)
    db.session.commit()
    db.session.refresh(plan)

    return {
        "id": str(plan.id),
        "topic": plan.topic,
        "planned_date": plan.planned_date.isoformat() if plan.planned_date else None,
        "covered_date": None,
        "status": "pending",
    }, 201


@bp.put("/<trainer_id>/syllabus/<plan_id>")
def update_syllabus_topic(trainer_id: str, plan_id: str):
    user, trainer, error, status = _require_trainer_or_admin()
    if error:
        return error, status

    try:
        t_uuid = parse_uuid(trainer_id, "trainer_id")
        p_uuid = parse_uuid(plan_id, "plan_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    if not _is_admin(user) and (not trainer or trainer.id != t_uuid):
        return {"error": "Permission denied"}, 403

    plan = db.session.get(LessonPlan, p_uuid)
    if not plan or plan.deleted_at:
        return {"error": "Topic not found"}, 404

    payload = request.get_json(silent=True) or {}
    if "topic" in payload:
        plan.topic = payload["topic"].strip()
    if "description" in payload:
        plan.description = payload["description"]
    if "planned_date" in payload:
        try:
            from datetime import date
            plan.planned_date = date.fromisoformat(payload["planned_date"]) if payload["planned_date"] else None
        except ValueError:
            return {"error": "Invalid planned_date format"}, 400
    if "covered_date" in payload:
        try:
            from datetime import date
            plan.covered_date = date.fromisoformat(payload["covered_date"]) if payload["covered_date"] else None
        except ValueError:
            return {"error": "Invalid covered_date format"}, 400
    if payload.get("mark_covered"):
        from datetime import date
        plan.covered_date = date.today()

    db.session.commit()
    return {
        "id": str(plan.id),
        "topic": plan.topic,
        "planned_date": plan.planned_date.isoformat() if plan.planned_date else None,
        "covered_date": plan.covered_date.isoformat() if plan.covered_date else None,
        "status": "covered" if plan.covered_date else "pending",
    }, 200


# ─────────────────────────────────────────────────────────────
# T3 — Teacher Attendance Summary
# GET  /reports/trainer/<trainer_id>/attendance
# POST /reports/trainer/<trainer_id>/attendance  (log a day)
# ─────────────────────────────────────────────────────────────

@bp.get("/<trainer_id>/attendance")
def trainer_attendance(trainer_id: str):
    user, trainer, error, status = _require_trainer_or_admin()
    if error:
        return error, status

    try:
        t_uuid = parse_uuid(trainer_id, "trainer_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    # Trainers can only see their own attendance
    if not _is_admin(user) and (not trainer or trainer.id != t_uuid):
        return {"error": "Permission denied"}, 403

    term_id_str = request.args.get("term_id")
    term = _resolve_term(term_id_str)

    from sqlalchemy.orm import joinedload
    q = db.session.query(StaffAttendance).filter(
        StaffAttendance.trainer_id == t_uuid,
        StaffAttendance.deleted_at.is_(None),
    ).options(
        joinedload(StaffAttendance.trainer),
        joinedload(StaffAttendance.term)
    )
    if term:
        q = q.filter(StaffAttendance.term_id == term.id)

    records = q.order_by(StaffAttendance.date.asc()).all()

    daily = [
        {
            "date": r.date.isoformat(),
            "status": r.status.lower(),
            "notes": r.notes,
        }
        for r in records
    ]

    total = len(daily)
    present = sum(1 for d in daily if d["status"] == "present")
    absent = sum(1 for d in daily if d["status"] == "absent")
    leave = sum(1 for d in daily if d["status"] == "leave")
    substituted = sum(1 for d in daily if d["status"] == "substituted")
    pct = round(present / total * 100, 1) if total > 0 else 0

    # Pattern warning: check if 3+ absences fall on same weekday
    from collections import Counter
    weekday_absences = Counter(
        datetime.fromisoformat(d["date"]).strftime("%A")
        for d in daily if d["status"] in ("absent", "leave")
    )
    warnings = [
        f"Frequent absences on {day} ({count} times)"
        for day, count in weekday_absences.items() if count >= 3
    ]

    # Trainer name — fetch the trainer record
    from ..models.trainer import Trainer as TrainerModel
    target_trainer = db.session.get(TrainerModel, t_uuid)
    trainer_name = target_trainer.user.name if target_trainer and target_trainer.user else "Unknown"

    log_view(user, "report.trainer_attendance", entity_id=trainer_id,
             metadata={"term": term.name if term else None})

    return {
        "school": _school_info(user),
        "trainer": {"id": trainer_id, "name": trainer_name},
        "term": {"id": str(term.id) if term else None, "name": term.name if term else None},
        "records": daily,
        "summary": {
            "total": total,
            "present": present,
            "absent": absent,
            "leave": leave,
            "substituted": substituted,
            "attendance_pct": pct,
        },
        "warnings": warnings,
        "generated_at": datetime.utcnow().isoformat(),
    }, 200


@bp.post("/<trainer_id>/attendance")
def log_trainer_attendance(trainer_id: str):
    user, trainer, error, status = _require_trainer_or_admin()
    if error:
        return error, status

    try:
        t_uuid = parse_uuid(trainer_id, "trainer_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    if not _is_admin(user) and (not trainer or trainer.id != t_uuid):
        return {"error": "Permission denied"}, 403

    payload = request.get_json(silent=True) or {}
    status_val = (payload.get("status") or "present").lower()
    if status_val not in ("present", "absent", "leave", "substituted"):
        return {"error": "status must be one of: present, absent, leave, substituted"}, 400

    try:
        from datetime import date
        att_date = date.fromisoformat(payload.get("date") or date.today().isoformat())
    except ValueError:
        return {"error": "Invalid date format, use YYYY-MM-DD"}, 400

    term_id_str = payload.get("term_id")
    term_uuid = None
    if term_id_str:
        try:
            term_uuid = parse_uuid(term_id_str, "term_id")
        except ValueError as exc:
            return {"error": str(exc)}, 400

    # Upsert — one record per trainer per date
    existing = db.session.query(StaffAttendance).filter(
        StaffAttendance.trainer_id == t_uuid,
        StaffAttendance.date == att_date,
        StaffAttendance.deleted_at.is_(None),
    ).first()

    if existing:
        existing.status = status_val
        existing.notes = payload.get("notes")
        existing.term_id = term_uuid or existing.term_id
        db.session.commit()
        record = existing
    else:
        record = StaffAttendance(
            trainer_id=t_uuid,
            term_id=term_uuid,
            date=att_date,
            status=status_val,
            notes=payload.get("notes"),
        )
        db.session.add(record)
        db.session.commit()

    return {
        "id": str(record.id),
        "date": record.date.isoformat(),
        "status": record.status,
    }, 201
