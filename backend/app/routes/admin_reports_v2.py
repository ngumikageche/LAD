from __future__ import annotations

from collections import defaultdict
from datetime import datetime

from flask import Blueprint, request
from sqlalchemy import and_, func

from ..extensions import cache, db
from ..models.assessment import Assessment
from ..models.attendance import Attendance
from ..models.course import Course
from ..models.enrollment import Enrollment
from ..models.score import Score
from ..models.student import Student
from ..models.subject import Subject
from ..models.term import Term
from ..models.user import User
from .permissions import get_current_user, log_view, _is_admin

bp = Blueprint("admin_reports_v2", __name__, url_prefix="/reports/admin")

PASS_MARK = 50.0


def _admin_only():
    user, error, status = get_current_user()
    if error:
        return None, error, status
    if not _is_admin(user):
        return None, {"error": "Admin access required"}, 403
    return user, None, None


def _resolve_term(term_id_str: str | None) -> Term | None:
    if term_id_str:
        return db.session.get(Term, term_id_str)
    return db.session.query(Term).filter(Term.is_active == True).first()


def _school_info(user) -> dict:
    inst = user.institution
    return {
        "name": inst.name if inst else "Learning & Development",
        "location": inst.location if inst else "",
    }


def _prev_term(term: Term) -> Term | None:
    """Return the most recent term that ended before this one."""
    return (
        db.session.query(Term)
        .filter(Term.end_date < term.start_date, Term.deleted_at.is_(None))
        .order_by(Term.end_date.desc())
        .first()
    )


# ─────────────────────────────────────────────────────────────
# A1 — School-Wide Exam Results
# GET /reports/admin/exam-results?term_id=
# ─────────────────────────────────────────────────────────────

@bp.get("/exam-results")
def exam_results():
    user, error, status = _admin_only()
    if error:
        return error, status

    term_id_str = request.args.get("term_id")
    term = _resolve_term(term_id_str)

    cache_key = f"admin_exam_results_{term.id if term else 'all'}"
    cached = cache.get(cache_key)
    if cached:
        log_view(user, "report.admin.exam_results", metadata={"term": term.name if term else None, "cached": True})
        return cached, 200

    # Base score query filtered by term
    score_q = db.session.query(Score).filter(Score.deleted_at.is_(None))
    if term:
        score_q = score_q.filter(Score.term == term.name)
    all_scores = score_q.all()

    # ── By course (class) ──
    course_scores: dict[str, list[Score]] = defaultdict(list)
    for s in all_scores:
        if s.student and s.student.course_id:
            course_scores[str(s.student.course_id)].append(s)

    courses = db.session.query(Course).filter(Course.deleted_at.is_(None)).all()
    course_map = {str(c.id): c for c in courses}

    by_course = []
    for cid, scores in course_scores.items():
        course = course_map.get(cid)
        marks = [s.marks_obtained for s in scores]
        passed = sum(1 for s in scores if (s.is_passed is True or s.marks_obtained >= PASS_MARK))
        avg = round(sum(marks) / len(marks), 1) if marks else 0
        pass_pct = round(passed / len(scores) * 100, 1) if scores else 0

        # Top student in this course
        top_score = max(scores, key=lambda s: s.marks_obtained) if scores else None
        top_student = None
        if top_score and top_score.student and top_score.student.user:
            top_student = top_score.student.user.name

        by_course.append({
            "course_id": cid,
            "course_name": course.name if course else cid,
            "student_count": len({str(s.student_id) for s in scores if s.student_id}),
            "scores_count": len(scores),
            "avg_marks": avg,
            "pass_pct": pass_pct,
            "top_student": top_student,
            "top_mark": max(marks) if marks else 0,
        })
    by_course.sort(key=lambda x: x["avg_marks"], reverse=True)

    # ── By subject ──
    subject_scores: dict[str, list[Score]] = defaultdict(list)
    for s in all_scores:
        if s.subject_id:
            subject_scores[str(s.subject_id)].append(s)

    subjects = db.session.query(Subject).filter(Subject.deleted_at.is_(None)).all()
    subject_map = {str(s.id): s for s in subjects}

    by_subject = []
    for sid, scores in subject_scores.items():
        subj = subject_map.get(sid)
        marks = [s.marks_obtained for s in scores]
        passed = sum(1 for s in scores if (s.is_passed is True or s.marks_obtained >= PASS_MARK))
        avg = round(sum(marks) / len(marks), 1) if marks else 0
        pass_pct = round(passed / len(scores) * 100, 1) if scores else 0
        fail_pct = round(100 - pass_pct, 1)
        by_subject.append({
            "subject_id": sid,
            "subject_name": subj.name if subj else sid,
            "entries": len(scores),
            "avg_marks": avg,
            "pass_pct": pass_pct,
            "fail_pct": fail_pct,
        })
    by_subject.sort(key=lambda x: x["avg_marks"], reverse=True)

    # ── Overall summary ──
    all_marks = [s.marks_obtained for s in all_scores]
    total_passed = sum(1 for s in all_scores if (s.is_passed is True or s.marks_obtained >= PASS_MARK))
    school_avg = round(sum(all_marks) / len(all_marks), 1) if all_marks else 0
    pass_rate = round(total_passed / len(all_scores) * 100, 1) if all_scores else 0
    top_course = by_course[0]["course_name"] if by_course else None

    # ── Year-on-year trend vs previous term ──
    trend = None
    if term:
        prev = _prev_term(term)
        if prev:
            prev_scores = db.session.query(Score).filter(
                Score.term == prev.name, Score.deleted_at.is_(None)
            ).all()
            if prev_scores:
                prev_marks = [s.marks_obtained for s in prev_scores]
                prev_avg = sum(prev_marks) / len(prev_marks)
                prev_pass = sum(1 for s in prev_scores if (s.is_passed is True or s.marks_obtained >= PASS_MARK))
                prev_pass_rate = prev_pass / len(prev_scores) * 100
                trend = {
                    "prev_term": prev.name,
                    "avg_delta": round(school_avg - prev_avg, 1),
                    "pass_rate_delta": round(pass_rate - prev_pass_rate, 1),
                }

    result = {
        "school": _school_info(user),
        "term": {"id": str(term.id) if term else None, "name": term.name if term else None},
        "summary": {
            "school_avg": school_avg,
            "pass_rate": pass_rate,
            "total_scores": len(all_scores),
            "top_course": top_course,
        },
        "trend": trend,
        "by_course": by_course,
        "by_subject": by_subject,
        "generated_at": datetime.utcnow().isoformat(),
        "generated_by": user.name,
    }

    cache.set(cache_key, result, timeout=600)
    log_view(user, "report.admin.exam_results", metadata={"term": term.name if term else None})
    return result, 200


# ─────────────────────────────────────────────────────────────
# A2 — Fee Collection Report (stub — no fees table)
# GET /reports/admin/fees?term_id=
# ─────────────────────────────────────────────────────────────

@bp.get("/fees")
def fee_collection():
    user, error, status = _admin_only()
    if error:
        return error, status

    term_id_str = request.args.get("term_id")
    term = _resolve_term(term_id_str)

    log_view(user, "report.admin.fees", metadata={"term": term.name if term else None})

    # Count students per course for the structure
    courses = db.session.query(Course).filter(Course.deleted_at.is_(None)).all()
    by_course = [
        {
            "course_id": str(c.id),
            "course_name": c.name,
            "student_count": db.session.query(func.count(Student.id))
                .filter(Student.course_id == c.id, Student.deleted_at.is_(None))
                .scalar() or 0,
            "total_billed": 0,
            "total_paid": 0,
            "collection_rate": 0,
        }
        for c in courses
    ]

    return {
        "school": _school_info(user),
        "term": {"id": str(term.id) if term else None, "name": term.name if term else None},
        "summary": {"total_billed": 0, "total_collected": 0, "outstanding": 0, "collection_rate": 0},
        "by_course": by_course,
        "defaulters": [],
        "note": "Fee management module not yet configured. No payments table exists in the current schema.",
        "generated_at": datetime.utcnow().isoformat(),
        "generated_by": user.name,
    }, 200


# ─────────────────────────────────────────────────────────────
# A3 — Enrolment & Attendance Overview
# GET /reports/admin/enrolment?term_id=
# ─────────────────────────────────────────────────────────────

@bp.get("/enrolment")
def enrolment_overview():
    user, error, status = _admin_only()
    if error:
        return error, status

    term_id_str = request.args.get("term_id")
    term = _resolve_term(term_id_str)

    cache_key = f"admin_enrolment_{term.id if term else 'all'}"
    cached = cache.get(cache_key)
    if cached:
        log_view(user, "report.admin.enrolment", metadata={"term": term.name if term else None, "cached": True})
        return cached, 200

    courses = db.session.query(Course).filter(Course.deleted_at.is_(None)).order_by(Course.name).all()

    by_course = []
    total_enrolled = 0

    for course in courses:
        # Students enrolled in this course
        enrolled = (
            db.session.query(func.count(Student.id))
            .filter(Student.course_id == course.id, Student.deleted_at.is_(None))
            .scalar() or 0
        )
        total_enrolled += enrolled

        # Attendance for students in this course, filtered by term date range
        att_q = (
            db.session.query(Attendance)
            .join(Student, Student.id == Attendance.student_id)
            .filter(
                Student.course_id == course.id,
                Attendance.deleted_at.is_(None),
            )
        )
        if term:
            att_q = att_q.filter(
                Attendance.date >= term.start_date,
                Attendance.date <= term.end_date,
            )
        att_records = att_q.all()

        if att_records:
            present = sum(1 for a in att_records if a.status.lower() == "present")
            att_pct = round(present / len(att_records) * 100, 1)
        else:
            att_pct = None

        by_course.append({
            "course_id": str(course.id),
            "course_name": course.name,
            "cbet_level": course.cbet_level,
            "enrolled": enrolled,
            "attendance_pct": att_pct,
            "below_threshold": att_pct is not None and att_pct < 75,
        })

    # Overall attendance
    all_att_q = db.session.query(Attendance).filter(Attendance.deleted_at.is_(None))
    if term:
        all_att_q = all_att_q.filter(
            Attendance.date >= term.start_date,
            Attendance.date <= term.end_date,
        )
    all_att = all_att_q.all()
    overall_att = None
    if all_att:
        present_all = sum(1 for a in all_att if a.status.lower() == "present")
        overall_att = round(present_all / len(all_att) * 100, 1)

    flagged = [c for c in by_course if c["below_threshold"]]

    result = {
        "school": _school_info(user),
        "term": {"id": str(term.id) if term else None, "name": term.name if term else None},
        "summary": {
            "total_enrolled": total_enrolled,
            "total_courses": len(courses),
            "overall_attendance_pct": overall_att,
            "flagged_courses": len(flagged),
        },
        "by_course": by_course,
        "flagged": flagged,
        "generated_at": datetime.utcnow().isoformat(),
        "generated_by": user.name,
    }

    cache.set(cache_key, result, timeout=600)
    log_view(user, "report.admin.enrolment", metadata={"term": term.name if term else None})
    return result, 200
