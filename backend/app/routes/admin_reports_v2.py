from __future__ import annotations

from collections import defaultdict
from datetime import datetime
import uuid

from flask import Blueprint, request
from sqlalchemy import and_, false, func, or_

from ..extensions import cache, db
from ..models.assessment import Assessment
from ..models.attendance import Attendance
from ..models.course import Course
from ..models.department import Department
from ..models.enrollment import Enrollment
from ..models.score import Score
from ..models.student import Student
from ..models.subject import Subject
from ..models.term import Term
from ..models.user import User
from ..services.scoping import (
    oversight_scope,
    scope_scores,
    term_match_clause,
    trainer_subject_ids,
)
from .permissions import get_current_user, log_view, _has_permission, _is_admin, _is_student

bp = Blueprint("admin_reports_v2", __name__, url_prefix="/reports/admin")

PASS_MARK = 50.0


def _require_report_access(permission_key: str):
    """
    Admins always pass. Everyone else needs the matching report permission
    (e.g. `reports.admin.pass_rate.view`) so trainers and managers can be granted
    school-wide reports without being made admins. Students are always blocked.
    """
    user, error, status = get_current_user()
    if error:
        return None, error, status
    if _is_admin(user):
        return user, None, None
    if _is_student(user):
        return None, {"error": "Permission denied"}, 403
    if not (
        _has_permission(user, permission_key)
        or _has_permission(user, f"{permission_key}.view")
    ):
        return None, {"error": "Permission denied"}, 403
    return user, None, None


def _resolve_term(term_id_str: str | None) -> Term | None:
    if term_id_str:
        try:
            term_id = uuid.UUID(str(term_id_str))
        except (TypeError, ValueError):
            return None
        return db.session.get(Term, term_id)
    return db.session.query(Term).filter(Term.is_active == True).first()


def _school_info(user) -> dict:
    inst = user.institution
    return {
        "name": inst.name if inst else "Learning & Development",
        "location": inst.location if inst else "",
    }


def _department_options(user, head_of_department_id):
    """
    The departments a caller may pick from — their own college's, or, for a head
    of department, only the one they run.
    """
    query = db.session.query(Department).filter(Department.deleted_at.is_(None))
    if user.institution_id:
        query = query.filter(Department.institution_id == user.institution_id)
    if head_of_department_id is not None:
        query = query.filter(Department.id == head_of_department_id)
    return query.order_by(Department.name.asc()).all()


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
    user, error, status = _require_report_access("reports.admin.pass_rate")
    if error:
        return error, status

    term_id_str = request.args.get("term_id")
    term = _resolve_term(term_id_str)
    if term_id_str and not term:
        return {"error": "Term not found"}, 404

    department_id = request.args.get("department_id")
    course_id = request.args.get("course_id")
    subject_id = request.args.get("subject_id")

    def _valid_filter(model, value, label):
        if not value:
            return None, None
        try:
            item_id = uuid.UUID(str(value))
        except (TypeError, ValueError):
            return None, ({"error": f"Invalid {label.lower()}_id"}, 400)
        item = db.session.get(model, item_id)
        if not item or item.deleted_at:
            return None, ({"error": f"{label} not found"}, 404)
        return item, None

    department, filter_error = _valid_filter(Department, department_id, "Department")
    if filter_error:
        return filter_error
    course, filter_error = _valid_filter(Course, course_id, "Course")
    if filter_error:
        return filter_error
    subject, filter_error = _valid_filter(Subject, subject_id, "Subject")
    if filter_error:
        return filter_error
    taught_subject_ids = trainer_subject_ids(user)
    if subject and taught_subject_ids is not None and subject.id not in taught_subject_ids:
        return {"error": "Subject is outside your assigned subjects"}, 403
    if department and course and course.department_id != department.id:
        return {"error": "Selected course does not belong to the selected department"}, 400
    if course and subject and subject.module and subject.module.course_id != course.id:
        return {"error": "Selected subject does not belong to the selected course"}, 400
    if user.institution_id:
        if department and department.institution_id != user.institution_id:
            return {"error": "Department is outside your institution"}, 403
        if course and (not course.department or course.department.institution_id != user.institution_id):
            return {"error": "Course is outside your institution"}, 403
        subject_course = subject.module.course if subject and subject.module else None
        if subject and (
            not subject_course
            or not subject_course.department
            or subject_course.department.institution_id != user.institution_id
        ):
            return {"error": "Subject is outside your institution"}, 403

    # Base score query filtered by term
    score_q = db.session.query(Score).filter(Score.deleted_at.is_(None))

    def _student_course_clause(course_ids):
        return or_(
            Score.student.has(Student.course_id.in_(course_ids)),
            Score.enrollment.has(Enrollment.student.has(Student.course_id.in_(course_ids))),
        )

    def _score_student(score):
        return score.student or (score.enrollment.student if score.enrollment else None)

    if term:
        score_q = score_q.filter(term_match_clause(term))

    # A trainer holding this report reads their own teaching load, not the whole
    # institution. `scope_scores` is a no-op for admins and for anyone holding
    # `data.master`, so school-wide oversight is unaffected.
    score_q = scope_scores(score_q, user)

    # Counted before the course-membership filter below, so an empty report can
    # say whether the caller teaches nothing, nothing was marked this term, or
    # the marks exist but their learners are not attached to a course.
    scoped_score_count = score_q.count()

    permitted_course_ids = None
    if user.institution_id:
        permitted_course_ids = [
            row[0]
            for row in (
                db.session.query(Course.id)
                .join(Department, Department.id == Course.department_id)
                .filter(
                    Department.institution_id == user.institution_id,
                    Course.deleted_at.is_(None),
                    Department.deleted_at.is_(None),
                )
                .all()
            )
        ]

    # A head of department reads their own department, not the whole college.
    # Narrowed before the filter below so the course list, the subject picker,
    # and the previous-term baseline all inherit the same boundary.
    scope = oversight_scope(user)
    head_of_department_id = scope.department_id if scope.mode == "department" else None
    if head_of_department_id is not None:
        if department and department.id != head_of_department_id:
            return {"error": "Department is outside your department"}, 403
        allowed = set(scope.course_ids or [])
        permitted_course_ids = (
            [cid for cid in permitted_course_ids if cid in allowed]
            if permitted_course_ids is not None
            else list(allowed)
        )

    if permitted_course_ids is not None:
        score_q = score_q.filter(_student_course_clause(permitted_course_ids))
    department_course_ids = None
    if department:
        department_course_ids = [
            row[0] for row in db.session.query(Course.id).filter(
                Course.department_id == department.id,
                Course.deleted_at.is_(None),
            ).all()
        ]
        score_q = score_q.filter(_student_course_clause(department_course_ids))
    if course:
        score_q = score_q.filter(_student_course_clause([course.id]))
    if subject:
        score_q = score_q.filter(Score.subject_id == subject.id)
    all_scores = score_q.all()

    # ── By course (class) ──
    course_scores: dict[str, list[Score]] = defaultdict(list)
    for s in all_scores:
        score_student = _score_student(s)
        if score_student and score_student.course_id:
            course_scores[str(score_student.course_id)].append(s)

    courses_query = db.session.query(Course).filter(Course.deleted_at.is_(None))
    if permitted_course_ids is not None:
        courses_query = courses_query.filter(Course.id.in_(permitted_course_ids))
    courses = courses_query.all()
    course_map = {str(c.id): c for c in courses}

    by_course = []
    for cid, scores in course_scores.items():
        # Deliberately not named `course` — that is the requested course filter,
        # and rebinding it here silently changed which course the previous-term
        # trend baseline was measured against.
        row_course = course_map.get(cid)
        marks = [s.marks_obtained for s in scores]
        passed = sum(1 for s in scores if (s.is_passed is True or s.marks_obtained >= PASS_MARK))
        avg = round(sum(marks) / len(marks), 1) if marks else 0
        pass_pct = round(passed / len(scores) * 100, 1) if scores else 0

        # Top student in this course
        top_score = max(scores, key=lambda s: s.marks_obtained) if scores else None
        top_student = None
        top_score_student = _score_student(top_score) if top_score else None
        if top_score_student and top_score_student.user:
            top_student = top_score_student.user.name

        by_course.append({
            "course_id": cid,
            "course_name": row_course.name if row_course else cid,
            "student_count": len({
                str(score_student.id)
                for score in scores
                if (score_student := _score_student(score)) is not None
            }),
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

    subjects_query = db.session.query(Subject).filter(Subject.deleted_at.is_(None))
    if taught_subject_ids is not None:
        subjects_query = (
            subjects_query.filter(Subject.id.in_(taught_subject_ids))
            if taught_subject_ids
            else subjects_query.filter(false())
        )
    subjects = subjects_query.all()
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
            prev_query = scope_scores(
                db.session.query(Score).filter(
                    term_match_clause(prev), Score.deleted_at.is_(None)
                ),
                user,
            )
            if permitted_course_ids is not None:
                prev_query = prev_query.filter(_student_course_clause(permitted_course_ids))
            if department_course_ids is not None:
                prev_query = prev_query.filter(_student_course_clause(department_course_ids))
            if course:
                prev_query = prev_query.filter(_student_course_clause([course.id]))
            if subject:
                prev_query = prev_query.filter(Score.subject_id == subject.id)
            prev_scores = prev_query.all()
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
        "filter_options": {
            "terms": [
                {"id": str(item.id), "name": item.name}
                for item in db.session.query(Term)
                .filter(Term.deleted_at.is_(None))
                .order_by(Term.start_date.desc())
                .all()
            ],
            "departments": [
                {"id": str(item.id), "name": item.name}
                for item in _department_options(user, head_of_department_id)
            ],
            "courses": [
                {"id": str(item.id), "name": item.name, "department_id": str(item.department_id)}
                for item in courses
            ],
            "subjects": [
                {
                    "id": str(item.id),
                    "name": item.name,
                    "course_id": str(item.module.course_id) if item.module else None,
                }
                for item in subjects
                if item.module and (permitted_course_ids is None or item.module.course_id in permitted_course_ids)
            ],
        },
        # Why the report is empty, when it is. Without this the screen shows
        # "No data for this term" whether the caller teaches nothing, nothing
        # has been marked, or the marks exist but their learners sit outside
        # any course — three very different things to act on.
        "scope": {
            "mode": "all" if taught_subject_ids is None else "assigned",
            "assigned_subject_count": None if taught_subject_ids is None else len(taught_subject_ids),
            "scores_in_scope": scoped_score_count,
            "scores_reported": len(all_scores),
            "empty_reason": (
                None if all_scores
                else "no_assigned_subjects" if taught_subject_ids is not None and not taught_subject_ids
                else "no_scores_in_term" if scoped_score_count == 0
                else "learners_not_on_a_course"
            ),
        },
        "applied_filters": {
            "term_id": str(term.id) if term else None,
            "department_id": str(department.id) if department else None,
            "course_id": str(course.id) if course else None,
            "subject_id": str(subject.id) if subject else None,
        },
        "generated_at": datetime.utcnow().isoformat(),
        "generated_by": user.name,
    }

    log_view(user, "report.admin.exam_results", metadata={"term": term.name if term else None})
    return result, 200


# ─────────────────────────────────────────────────────────────
# A2 — Fee Collection Report (stub — no fees table)
# GET /reports/admin/fees?term_id=
# ─────────────────────────────────────────────────────────────

@bp.get("/fees")
def fee_collection():
    user, error, status = _require_report_access("reports.admin.fees")
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
    user, error, status = _require_report_access("reports.admin.enrolment")
    if error:
        return error, status

    term_id_str = request.args.get("term_id")
    term = _resolve_term(term_id_str)

    # Which cohorts this caller may count. A trainer reads their own subjects, a
    # head of department their department, a college administrator their college
    # — only the group super admin reads every college. Without this the report
    # listed every course in the database to whoever opened it.
    scope = oversight_scope(user)

    # The signature is part of the key because the report is no longer the same
    # document for every caller: a shared key served the first reader's scope to
    # everyone who came after them.
    cache_key = f"admin_enrolment_{term.id if term else 'all'}_{scope.cache_key}"
    cached = cache.get(cache_key)
    if cached:
        log_view(user, "report.admin.enrolment", metadata={"term": term.name if term else None, "cached": True})
        return cached, 200

    courses_query = db.session.query(Course).filter(Course.deleted_at.is_(None))
    if scope.course_ids is not None:
        courses_query = (
            courses_query.filter(Course.id.in_(scope.course_ids))
            if scope.course_ids
            else courses_query.filter(false())
        )
    courses = courses_query.order_by(Course.name).all()

    def _scoped_students(query):
        """Narrow a learner query to the cohort the caller may see."""
        if scope.student_ids is None:
            return query
        if not scope.student_ids:
            return query.filter(false())
        return query.filter(Student.id.in_(scope.student_ids))

    by_course = []
    total_enrolled = 0

    for course in courses:
        # Students enrolled in this course
        enrolled = _scoped_students(
            db.session.query(func.count(Student.id))
            .filter(Student.course_id == course.id, Student.deleted_at.is_(None))
        ).scalar() or 0
        total_enrolled += enrolled

        # Attendance for students in this course, filtered by term date range
        att_q = _scoped_students(
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

    # Overall attendance, over exactly the courses listed above rather than
    # across the whole table. Counted this way the headline cannot disagree with
    # the rows beneath it — previously it was a global figure sitting on top of a
    # per-course breakdown, so it answered a different question to every reader.
    listed_course_ids = [course.id for course in courses]
    all_att_q = _scoped_students(
        db.session.query(Attendance)
        .join(Student, Student.id == Attendance.student_id)
        .filter(Attendance.deleted_at.is_(None))
    )
    all_att_q = (
        all_att_q.filter(Student.course_id.in_(listed_course_ids))
        if listed_course_ids
        else all_att_q.filter(false())
    )
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
        # Says whose cohorts these numbers cover, so an unexpectedly small
        # report reads as "your scope" rather than as missing data.
        "scope": {"mode": scope.mode, "label": scope.label},
        "generated_at": datetime.utcnow().isoformat(),
        "generated_by": user.name,
    }

    cache.set(cache_key, result, timeout=600)
    log_view(user, "report.admin.enrolment", metadata={"term": term.name if term else None})
    return result, 200
