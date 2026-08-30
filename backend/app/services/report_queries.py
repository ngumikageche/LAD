from __future__ import annotations

from collections import defaultdict
from datetime import datetime
import uuid

from sqlalchemy import false, func

from ..extensions import db
from .scoping import OversightScope, oversight_scope, term_match_clause
from ..models.attendance import Attendance
from ..models.course import Course
from ..models.enrollment import Enrollment
from ..models.score import Score
from ..models.staff_attendance import StaffAttendance
from ..models.student import Student
from ..models.subject import Subject
from ..models.term import Term
from ..models.user import User
from .report_permissions import check_report_permission

PASS_MARK = 50.0


def _active_term() -> Term | None:
    return db.session.query(Term).filter(Term.is_active == True, Term.deleted_at.is_(None)).first()


def _resolve_term(term_id: str | uuid.UUID | None) -> Term | None:
    if term_id:
        return db.session.get(Term, uuid.UUID(str(term_id)))
    return _active_term()


def _school_info(user: User) -> dict:
    inst = user.institution
    return {
        "name": inst.name if inst else "Learning & Development",
        "location": inst.location if inst else "",
        "type": inst.type if inst else "",
    }


def _scope_students_to(query, scope: OversightScope):
    """Narrow a learner query to the cohort one caller may count."""
    if scope.student_ids is None:
        return query
    if not scope.student_ids:
        return query.filter(false())
    return query.filter(Student.id.in_(scope.student_ids))


def _scope_courses_to(query, scope: OversightScope):
    """Narrow a course query to the programmes one caller oversees."""
    if scope.course_ids is None:
        return query
    if not scope.course_ids:
        return query.filter(false())
    return query.filter(Course.id.in_(scope.course_ids))


def _require_access(user: User, report_type: str, target_id: str | uuid.UUID | None = None):
    access = check_report_permission(user, report_type, target_id)
    if not access.canView:
        return None, {"error": access.reason}, 403
    return access, None, None


def student_term_report(user: User, student_id: str, term_id: str | None = None):
    sid = uuid.UUID(str(student_id))
    access, error, status = _require_access(user, "student_term", sid)
    if error:
        return error, status

    student = db.session.get(Student, sid)
    if not student or student.deleted_at:
        return {"error": "Student not found"}, 404
    term = _resolve_term(term_id)

    q = db.session.query(Score).filter(Score.student_id == sid, Score.deleted_at.is_(None))
    if term:
        q = q.filter(term_match_clause(term))
    scores = q.all()

    subjects = []
    marks = []
    for score in scores:
        total = score.assessment.total_marks if score.assessment else None
        pct = round(score.marks_obtained / total * 100, 1) if total else score.marks_obtained
        marks.append(pct)
        subjects.append({
            "subject_id": str(score.subject_id) if score.subject_id else None,
            "subject_name": score.subject.name if score.subject else "Unknown",
            "assessment_name": score.assessment.name if score.assessment else None,
            "marks_obtained": score.marks_obtained,
            "total_marks": total,
            "percentage": pct,
            "grade": score.grade,
            "is_passed": score.is_passed if score.is_passed is not None else pct >= PASS_MARK,
            "feedback": score.feedback,
            "teacher_remarks": score.feedback,
        })

    average = round(sum(marks) / len(marks), 1) if marks else 0
    return {
        "school": _school_info(user),
        "student": {
            "id": str(student.id),
            "name": student.user.name if student.user else "Unknown",
            "registration_number": student.registration_number,
            "course": student.course.name if student.course else None,
        },
        "term": {"id": str(term.id) if term else None, "name": term.name if term else None},
        "subjects": subjects,
        "summary": {"average": average, "subjects_count": len(subjects), "position_in_class": None},
        "permissions": {"canPrint": access.canPrint, "canExport": access.canExport},
        "generated_at": datetime.utcnow().isoformat(),
    }, 200


def student_transcript(user: User, student_id: str):
    sid = uuid.UUID(str(student_id))
    access, error, status = _require_access(user, "student_transcript", sid)
    if error:
        return error, status
    student = db.session.get(Student, sid)
    if not student or student.deleted_at:
        return {"error": "Student not found"}, 404

    scores = (
        db.session.query(Score)
        .filter(Score.student_id == sid, Score.deleted_at.is_(None))
        .order_by(Score.term.asc().nullslast(), Score.created_at.asc())
        .all()
    )
    by_term: dict[str, list[Score]] = defaultdict(list)
    for score in scores:
        by_term[score.term or "Unassigned"].append(score)

    terms = []
    all_percentages = []
    for term_name, term_scores in by_term.items():
        rows = []
        percentages = []
        for score in term_scores:
            total = score.assessment.total_marks if score.assessment else None
            pct = round(score.marks_obtained / total * 100, 1) if total else score.marks_obtained
            percentages.append(pct)
            all_percentages.append(pct)
            rows.append({
                "subject_name": score.subject.name if score.subject else "Unknown",
                "assessment_name": score.assessment.name if score.assessment else None,
                "percentage": pct,
                "grade": score.grade,
                "is_passed": score.is_passed if score.is_passed is not None else pct >= PASS_MARK,
            })
        terms.append({
            "term": term_name,
            "average": round(sum(percentages) / len(percentages), 1) if percentages else 0,
            "subjects": rows,
        })

    cumulative = round(sum(all_percentages) / len(all_percentages), 1) if all_percentages else 0
    return {
        "school": _school_info(user),
        "student": {
            "id": str(student.id),
            "name": student.user.name if student.user else "Unknown",
            "registration_number": student.registration_number,
            "course": student.course.name if student.course else None,
        },
        "terms": terms,
        "summary": {"cumulative_average": cumulative, "cumulative_gpa": round(cumulative / 20, 2)},
        "permissions": {"canPrint": access.canPrint, "canExport": access.canExport},
        "generated_at": datetime.utcnow().isoformat(),
    }, 200


def student_attendance_report(user: User, student_id: str, date_from: str | None, date_to: str | None):
    sid = uuid.UUID(str(student_id))
    access, error, status = _require_access(user, "student_attendance", sid)
    if error:
        return error, status
    student = db.session.get(Student, sid)
    if not student or student.deleted_at:
        return {"error": "Student not found"}, 404

    q = db.session.query(Attendance).filter(Attendance.student_id == sid, Attendance.deleted_at.is_(None))
    if date_from:
        q = q.filter(Attendance.date >= datetime.fromisoformat(date_from).date())
    if date_to:
        q = q.filter(Attendance.date <= datetime.fromisoformat(date_to).date())
    records = q.order_by(Attendance.date.asc()).all()

    daily = [{"date": r.date.isoformat(), "status": r.status, "module_id": str(r.module_id) if r.module_id else None} for r in records]
    total = len(daily)
    present = sum(1 for r in daily if r["status"].lower() == "present")
    absent = sum(1 for r in daily if r["status"].lower() == "absent")
    late = sum(1 for r in daily if r["status"].lower() == "late")
    return {
        "school": _school_info(user),
        "student": {"id": str(student.id), "name": student.user.name if student.user else "Unknown"},
        "records": daily,
        "summary": {
            "total": total,
            "present": present,
            "absent": absent,
            "late": late,
            "percentage": round(present / total * 100, 1) if total else 0,
        },
        "permissions": {"canPrint": access.canPrint, "canExport": access.canExport},
        "generated_at": datetime.utcnow().isoformat(),
    }, 200


def class_performance_report(
    user: User,
    course_id: str,
    term_id: str | None = None,
    report_type: str = "class_performance",
):
    cid = uuid.UUID(str(course_id))
    access, error, status = _require_access(user, report_type, cid)
    if error:
        return error, status
    course = db.session.get(Course, cid)
    if not course or course.deleted_at:
        return {"error": "Course not found"}, 404
    term = _resolve_term(term_id)

    students = db.session.query(Student).filter(Student.course_id == cid, Student.deleted_at.is_(None)).all()
    student_ids = [s.id for s in students]
    score_q = db.session.query(Score).filter(Score.student_id.in_(student_ids), Score.deleted_at.is_(None))
    if term:
        score_q = score_q.filter(term_match_clause(term))
    scores = score_q.all()
    scores_by_student: dict[uuid.UUID, list[Score]] = defaultdict(list)
    for score in scores:
        if score.student_id:
            scores_by_student[score.student_id].append(score)

    rows = []
    for student in students:
        student_scores = scores_by_student.get(student.id, [])
        percentages = []
        for score in student_scores:
            total = score.assessment.total_marks if score.assessment else None
            percentages.append(round(score.marks_obtained / total * 100, 1) if total else score.marks_obtained)
        avg = round(sum(percentages) / len(percentages), 1) if percentages else None
        rows.append({
            "student_id": str(student.id),
            "name": student.user.name if student.user else "Unknown",
            "registration_number": student.registration_number,
            "average": avg,
            "is_passed": avg is not None and avg >= PASS_MARK,
        })

    scored = sorted([r for r in rows if r["average"] is not None], key=lambda r: r["average"], reverse=True)
    for index, row in enumerate(scored, start=1):
        row["rank"] = index
    unscored = [r | {"rank": None} for r in rows if r["average"] is None]
    averages = [r["average"] for r in scored]
    return {
        "school": _school_info(user),
        "course": {"id": str(course.id), "name": course.name},
        "term": {"id": str(term.id) if term else None, "name": term.name if term else None},
        "students": scored + unscored,
        "summary": {
            "total_students": len(students),
            "class_average": round(sum(averages) / len(averages), 1) if averages else 0,
            "pass_rate": round(sum(1 for r in scored if r["is_passed"]) / len(scored) * 100, 1) if scored else 0,
        },
        "permissions": {"canPrint": access.canPrint, "canExport": access.canExport},
        "generated_at": datetime.utcnow().isoformat(),
    }, 200


def at_risk_students_report(user: User, course_id: str, term_id: str | None = None, threshold: float = PASS_MARK):
    payload, status = class_performance_report(user, course_id, term_id, "class_at_risk")
    if status != 200:
        return payload, status
    at_risk = [row for row in payload["students"] if row["average"] is not None and row["average"] < threshold]
    payload["at_risk"] = at_risk
    payload["summary"]["threshold"] = threshold
    payload["summary"]["at_risk_count"] = len(at_risk)
    return payload, 200


def teacher_attendance_report(user: User, trainer_id: str, date_from: str | None, date_to: str | None):
    tid = uuid.UUID(str(trainer_id))
    access, error, status = _require_access(user, "teacher_attendance", tid)
    if error:
        return error, status
    q = db.session.query(StaffAttendance).filter(StaffAttendance.trainer_id == tid, StaffAttendance.deleted_at.is_(None))
    if date_from:
        q = q.filter(StaffAttendance.date >= datetime.fromisoformat(date_from).date())
    if date_to:
        q = q.filter(StaffAttendance.date <= datetime.fromisoformat(date_to).date())
    records = q.order_by(StaffAttendance.date.asc()).all()
    daily = [{"date": r.date.isoformat(), "status": r.status, "notes": r.notes} for r in records]
    total = len(daily)
    present = sum(1 for r in daily if r["status"].lower() == "present")
    return {
        "school": _school_info(user),
        "trainer_id": str(tid),
        "records": daily,
        "summary": {"total": total, "present": present, "attendance_pct": round(present / total * 100, 1) if total else 0},
        "permissions": {"canPrint": access.canPrint, "canExport": access.canExport},
        "generated_at": datetime.utcnow().isoformat(),
    }, 200


def school_pass_rate_report(user: User, term_id: str | None = None):
    access, error, status = _require_access(user, "admin_pass_rate")
    if error:
        return error, status
    term = _resolve_term(term_id)
    # A trainer reads their own learners, a head of department their department,
    # a college administrator their college — only the group super admin reads
    # every college. Without this the pass rate averaged all three institutions
    # together no matter who opened it.
    scope = oversight_scope(user)
    q = db.session.query(Score).filter(Score.deleted_at.is_(None))
    # `Score.student_id` is nullable, so the join below is only taken when a
    # restriction actually applies. Joining unconditionally would quietly drop
    # every score with no learner attached from the unrestricted view, changing
    # the figure the super admin reads for reasons that have nothing to do with
    # scope.
    #
    # In trainer mode the learner set is the precise boundary — it follows the
    # subject assignments — so it is used on its own. The wider modes have no
    # learner list and are carried by the course list instead. Applying both
    # would drop a learner the trainer teaches whose course record sits
    # elsewhere.
    if scope.student_ids is not None:
        q = _scope_students_to(
            q.join(Student, Student.id == Score.student_id)
            .filter(Student.deleted_at.is_(None)),
            scope,
        )
    elif scope.course_ids is not None:
        q = (
            q.join(Student, Student.id == Score.student_id)
            .filter(Student.deleted_at.is_(None))
        )
        q = (
            q.filter(Student.course_id.in_(scope.course_ids))
            if scope.course_ids
            else q.filter(false())
        )
    if term:
        q = q.filter(term_match_clause(term))
    scores = q.all()
    def score_passed(score: Score) -> bool:
        if score.is_passed is not None:
            return bool(score.is_passed)
        total = score.assessment.total_marks if score.assessment else None
        percentage = (score.marks_obtained / total * 100) if total else score.marks_obtained
        return percentage >= PASS_MARK

    passed = sum(1 for s in scores if score_passed(s))
    return {
        "school": _school_info(user),
        "term": {"id": str(term.id) if term else None, "name": term.name if term else None},
        "scope": {"mode": scope.mode, "label": scope.label},
        "summary": {
            "total_scores": len(scores),
            "passed": passed,
            "failed": len(scores) - passed,
            "pass_rate": round(passed / len(scores) * 100, 1) if scores else 0,
        },
        "permissions": {"canPrint": access.canPrint, "canExport": access.canExport},
        "generated_at": datetime.utcnow().isoformat(),
    }, 200


def enrolment_report(user: User, academic_year_id: str | None = None):
    access, error, status = _require_access(user, "admin_enrolment")
    if error:
        return error, status
    # Enrolment is a cross-cohort count, so it answers to the caller's oversight
    # level rather than to the whole database: a trainer sees the courses behind
    # their own subjects, a head of department their department, a college
    # administrator their college.
    scope = oversight_scope(user)
    # The learner restriction belongs in the join condition, not in a WHERE
    # clause: filtering after an outer join would silently turn it into an inner
    # join and drop every course the caller oversees but has no visible learners
    # in, when the honest answer for those is a row reading zero.
    join_clause = (Student.course_id == Course.id) & (Student.deleted_at.is_(None))
    if scope.student_ids is not None:
        join_clause = join_clause & (
            Student.id.in_(scope.student_ids) if scope.student_ids else false()
        )
    query = (
        db.session.query(Course.id, Course.name, func.count(Student.id))
        .outerjoin(Student, join_clause)
        .filter(Course.deleted_at.is_(None))
    )
    query = _scope_courses_to(query, scope)
    rows = query.group_by(Course.id, Course.name).order_by(Course.name.asc()).all()
    by_course = [{"course_id": str(cid), "course_name": name, "enrolled": count} for cid, name, count in rows]
    return {
        "school": _school_info(user),
        "scope": {"mode": scope.mode, "label": scope.label},
        "academic_year_id": academic_year_id,
        "summary": {"total_enrolled": sum(row["enrolled"] for row in by_course), "total_courses": len(by_course)},
        "by_course": by_course,
        "permissions": {"canPrint": access.canPrint, "canExport": access.canExport},
        "generated_at": datetime.utcnow().isoformat(),
    }, 200


def empty_admin_stub(user: User, report_type: str, title: str):
    access, error, status = _require_access(user, report_type)
    if error:
        return error, status
    return {
        "school": _school_info(user),
        "title": title,
        "items": [],
        "summary": {},
        "note": "No dedicated data table exists for this report in the current schema.",
        "permissions": {"canPrint": access.canPrint, "canExport": access.canExport},
        "generated_at": datetime.utcnow().isoformat(),
    }, 200
