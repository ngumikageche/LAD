from __future__ import annotations

import math
import uuid

from flask import g
from collections import defaultdict
from datetime import datetime

from sqlalchemy import and_, case, func, or_

from ..extensions import cache, db
from ..models.assessment import Assessment
from ..models.course import Course
from ..models.attendance import Attendance
from ..models.attendance_session import AttendanceRecord, AttendanceSession
from ..models.competency import Competency
from ..models.portfolio_evidence import PortfolioEvidence
from ..models.score import Score
from ..models.module import Module
from ..models.student import Student
from ..models.student_subject import StudentSubject
from ..models.subject import Subject
from ..models.term import Term
from ..models.trainer import Trainer
from ..models.trainer_subject import TrainerSubject
from ..models.user import User
from .scoping import score_percentage_expr

LOW_MASTERY = 50.0
MEDIUM_MASTERY = 75.0


def _iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def _round(value: float | None, digits: int = 2) -> float:
    return round(float(value or 0), digits)


def _uuid_or_none(value: str | None) -> uuid.UUID | None:
    if not value:
        return None
    return uuid.UUID(str(value))


def _request_memo(key: tuple, build):
    """
    Memoize a scope lookup for the life of one request.

    A single dashboard calls six analytics functions, and each independently
    resolves the same subject and student id lists — twelve identical
    multi-join queries for one page. Request scope is used rather than the
    shared cache so the result cannot outlive the data it was derived from.
    """
    try:
        store = g.setdefault("_analytics_scope_memo", {})
    except RuntimeError:
        # No application context (a script or a test) — resolve without memoizing.
        return build()
    if key not in store:
        store[key] = build()
    return store[key]


def _resolve_subject_ids(
    department_id: str | None = None,
    course_id: str | None = None,
    module_id: str | None = None,
    subject_id: str | None = None,
    trainer_id: str | None = None,
    student_id: str | None = None,
) -> list[uuid.UUID] | None:
    return _request_memo(
        ("subjects", department_id, course_id, module_id, subject_id, trainer_id, student_id),
        lambda: _resolve_subject_ids_uncached(
            department_id, course_id, module_id, subject_id, trainer_id, student_id
        ),
    )


def _resolve_subject_ids_uncached(
    department_id: str | None = None,
    course_id: str | None = None,
    module_id: str | None = None,
    subject_id: str | None = None,
    trainer_id: str | None = None,
    student_id: str | None = None,
) -> list[uuid.UUID] | None:
    query = db.session.query(Subject.id).filter(Subject.deleted_at.is_(None))

    if department_id or course_id:
        query = query.join(Module, Module.id == Subject.module_id)
    if department_id:
        query = query.join(Course, Course.id == Module.course_id).filter(
            Course.department_id == _uuid_or_none(department_id)
        )
    if course_id:
        query = query.filter(Module.course_id == _uuid_or_none(course_id))
    if module_id:
        query = query.filter(Subject.module_id == _uuid_or_none(module_id))
    if subject_id:
        query = query.filter(Subject.id == _uuid_or_none(subject_id))
    if trainer_id:
        query = query.join(TrainerSubject, TrainerSubject.subject_id == Subject.id).filter(
            TrainerSubject.trainer_id == _uuid_or_none(trainer_id)
        )
    if student_id:
        query = query.join(StudentSubject, StudentSubject.subject_id == Subject.id).filter(
            StudentSubject.student_id == _uuid_or_none(student_id)
        )

    return [row[0] for row in query.distinct().all()]


def _resolve_student_ids(
    department_id: str | None = None,
    course_id: str | None = None,
    module_id: str | None = None,
    subject_id: str | None = None,
    trainer_id: str | None = None,
    student_id: str | None = None,
) -> list[uuid.UUID] | None:
    return _request_memo(
        ("students", department_id, course_id, module_id, subject_id, trainer_id, student_id),
        lambda: _resolve_student_ids_uncached(
            department_id, course_id, module_id, subject_id, trainer_id, student_id
        ),
    )


def _resolve_student_ids_uncached(
    department_id: str | None = None,
    course_id: str | None = None,
    module_id: str | None = None,
    subject_id: str | None = None,
    trainer_id: str | None = None,
    student_id: str | None = None,
) -> list[uuid.UUID] | None:
    query = db.session.query(Student.id).filter(Student.deleted_at.is_(None))

    if department_id:
        query = query.join(Course, Course.id == Student.course_id).filter(
            Course.department_id == _uuid_or_none(department_id)
        )
    if course_id:
        query = query.filter(Student.course_id == _uuid_or_none(course_id))
    if module_id or subject_id or trainer_id:
        query = query.join(StudentSubject, StudentSubject.student_id == Student.id).join(
            Subject, Subject.id == StudentSubject.subject_id
        )
    if module_id:
        query = query.filter(Subject.module_id == _uuid_or_none(module_id))
    if subject_id:
        query = query.filter(StudentSubject.subject_id == _uuid_or_none(subject_id))
    if trainer_id:
        query = query.join(TrainerSubject, TrainerSubject.subject_id == Subject.id).filter(
            TrainerSubject.trainer_id == _uuid_or_none(trainer_id)
        )
    if student_id:
        query = query.filter(Student.id == _uuid_or_none(student_id))

    return [row[0] for row in query.distinct().all()]


def _scope_subject_filter(
    query,
    department_id: str | None = None,
    course_id: str | None = None,
    module_id: str | None = None,
    subject_id: str | None = None,
    trainer_id: str | None = None,
    student_id: str | None = None,
):
    subject_ids = _resolve_subject_ids(department_id, course_id, module_id, subject_id, trainer_id, student_id)
    if subject_ids is not None:
        query = query.filter(Subject.id.in_(subject_ids))
    return query


def _scope_student_filter(
    query,
    department_id: str | None = None,
    course_id: str | None = None,
    module_id: str | None = None,
    subject_id: str | None = None,
    trainer_id: str | None = None,
    student_id: str | None = None,
):
    student_ids = _resolve_student_ids(department_id, course_id, module_id, subject_id, trainer_id, student_id)
    if student_ids is not None:
        query = query.filter(Student.id.in_(student_ids))
    return query


def mastery_label(score: float) -> str:
    if score < LOW_MASTERY:
        return "low"
    if score < MEDIUM_MASTERY:
        return "medium"
    return "high"


def _student_name_expr():
    return func.coalesce(User.name, Student.registration_number, "Unknown")


def _score_mastery_share(
    subject_ids: list[uuid.UUID] | None,
    student_ids: list[uuid.UUID] | None,
) -> tuple[float, int]:
    """
    High-mastery share measured from marks, for scopes holding no competency
    evidence. Returns the percentage and how many learners it was measured over.

    Mastery is defined against competencies, but nothing in the API creates a
    competency or attaches one to an assessment — they arrive only through the
    catalogue seeder. Reporting 0% in that case describes the wiring rather
    than the cohort, so where there is no competency evidence the same
    threshold is applied to the marks that do exist: a learner averaging at or
    above `MEDIUM_MASTERY` counts as high, exactly as `mastery_label` grades a
    competency cell.
    """
    # `score_percentage_expr` rather than a bare division: an assessment with no
    # recorded total means the mark is already out of 100, which is the rule the
    # rest of the application averages by. Dividing by it regardless produced
    # NULL for those marks, `avg` skipped them, and a learner whose marks all sat
    # on such assessments vanished from the sample entirely — reported on screen
    # as a mastery rate of nothing.
    query = (
        db.session.query(
            Score.student_id.label("student_id"),
            func.avg(score_percentage_expr()).label("average"),
        )
        .join(Assessment, Assessment.id == Score.assessment_id)
        .filter(
            Score.deleted_at.is_(None),
            Assessment.deleted_at.is_(None),
            Score.student_id.isnot(None),
        )
        .group_by(Score.student_id)
    )
    if subject_ids is not None:
        taught_module_ids = db.session.query(Subject.module_id).filter(Subject.id.in_(subject_ids))
        query = query.filter(
            or_(
                Score.subject_id.in_(subject_ids),
                and_(Score.subject_id.is_(None), Assessment.module_id.in_(taught_module_ids)),
            )
        )
    if student_ids is not None:
        query = query.filter(Score.student_id.in_(student_ids))

    averages = [float(row.average) for row in query.all() if row.average is not None]
    if not averages:
        return 0.0, 0
    high = sum(1 for average in averages if average >= MEDIUM_MASTERY)
    return _round(high / len(averages) * 100), len(averages)


@cache.memoize(timeout=60)
def get_heatmap(
    department_id: str | None = None,
    course_id: str | None = None,
    module_id: str | None = None,
    subject_id: str | None = None,
    trainer_id: str | None = None,
    student_id: str | None = None,
) -> dict:
    query = (
        db.session.query(
            Student.id.label("student_id"),
            User.name.label("student_name"),
            Competency.id.label("competency_id"),
            Competency.name.label("competency_name"),
            # NULL only when no mark exists at all — which is what `assessed`
            # below reads. An assessment with no recorded total means the mark is
            # already out of 100 rather than unmarked, so it must not turn the
            # cell NULL and have it graded "unassessed".
            func.avg(score_percentage_expr()).label("score"),
        )
        .join(User, User.id == Student.user_id)
        .join(StudentSubject, StudentSubject.student_id == Student.id)
        .join(Subject, Subject.id == StudentSubject.subject_id)
        .join(Competency, Competency.module_id == Subject.module_id)
        .outerjoin(
            Assessment,
            (Assessment.competency_id == Competency.id) & (Assessment.deleted_at.is_(None)),
        )
        .outerjoin(
            Score,
            (Score.assessment_id == Assessment.id)
            & (Score.student_id == Student.id)
            & (Score.deleted_at.is_(None)),
        )
        .filter(
            Student.deleted_at.is_(None),
            Subject.deleted_at.is_(None),
            Competency.deleted_at.is_(None),
        )
    )

    query = _scope_subject_filter(query, department_id, course_id, module_id, subject_id, trainer_id, student_id)
    query = _scope_student_filter(query, department_id, course_id, module_id, subject_id, trainer_id, student_id)

    rows = (
        query.group_by(Student.id, User.name, Competency.id, Competency.name)
        .order_by(User.name.asc(), Competency.name.asc())
        .all()
    )

    items = []
    student_ids = set()
    competency_ids = set()
    assessed_count = 0
    for row in rows:
        student_ids.add(str(row.student_id))
        competency_ids.add(str(row.competency_id))
        # A competency nobody has been assessed against yet returns NULL here,
        # and rounding that to 0 graded it "low" — an unassessed competency
        # counted as failed mastery. A module part-way through delivery was
        # therefore capped at the fraction already assessed, and one with no
        # marks at all reported 0% mastery rather than "nothing measured yet".
        assessed = row.score is not None
        score = _round(row.score)
        if assessed:
            assessed_count += 1
        items.append(
            {
                "student_id": str(row.student_id),
                "student_name": row.student_name,
                "competency_id": str(row.competency_id),
                "competency_name": row.competency_name,
                # Kept numeric whether or not it was assessed, because callers
                # format it directly; `assessed` is what tells them it is real.
                "score": score,
                "assessed": assessed,
                "mastery_level": mastery_label(score) if assessed else "unassessed",
            }
        )

    return {
        "items": items,
        "students_count": len(student_ids),
        "competencies_count": len(competency_ids),
        "assessed_count": assessed_count,
        "last_updated": datetime.utcnow().isoformat(),
    }


@cache.memoize(timeout=60)
def get_mastery_progress(
    department_id: str | None = None,
    course_id: str | None = None,
    module_id: str | None = None,
    subject_id: str | None = None,
    trainer_id: str | None = None,
    student_id: str | None = None,
) -> dict:
    query = (
        db.session.query(
            Score.student_id.label("student_id"),
            User.name.label("student_name"),
            Subject.id.label("subject_id"),
            Subject.name.label("subject_name"),
            func.coalesce(Assessment.recorded_at, Score.term, Term.name).label("period"),
            # Percentages, not raw marks: a paper out of 40 and one out of 100
            # averaged together report a figure that matches nothing else.
            func.avg(score_percentage_expr()).label("average_score"),
        )
        .join(Student, Student.id == Score.student_id)
        .join(User, User.id == Student.user_id)
        .outerjoin(Subject, Subject.id == Score.subject_id)
        .outerjoin(Assessment, Assessment.id == Score.assessment_id)
        .outerjoin(Term, Term.id == Assessment.term_id)
        .filter(Score.deleted_at.is_(None), Student.deleted_at.is_(None))
    )

    subject_ids = _resolve_subject_ids(department_id, course_id, module_id, subject_id, trainer_id, student_id)
    student_ids = _resolve_student_ids(department_id, course_id, module_id, subject_id, trainer_id, student_id)
    if subject_ids is not None:
        # A mark predating the `subject_id` column, or uploaded against an
        # assessment whose module owns more than one subject, carries no subject
        # and reaches one only through its assessment's module. Matching on
        # `subject_id` alone dropped every one of them — the same rule
        # `_score_mastery_share` and `get_attendance_performance` already apply.
        taught_module_ids = db.session.query(Subject.module_id).filter(Subject.id.in_(subject_ids))
        query = query.filter(
            or_(
                Score.subject_id.in_(subject_ids),
                and_(Score.subject_id.is_(None), Assessment.module_id.in_(taught_module_ids)),
            )
        )
    if student_ids is not None:
        query = query.filter(Score.student_id.in_(student_ids))

    rows = (
        query.group_by(
            Score.student_id,
            User.name,
            Subject.id,
            Subject.name,
            func.coalesce(Assessment.recorded_at, Score.term, Term.name),
        )
        .order_by(func.coalesce(Assessment.recorded_at, Score.term, Term.name).asc())
        .all()
    )

    items = [
        {
            "student_id": str(row.student_id) if row.student_id else None,
            "student_name": row.student_name,
            "subject_id": str(row.subject_id) if row.subject_id else None,
            "subject_name": row.subject_name,
            "date": row.period,
            "average_score": _round(row.average_score),
        }
        for row in rows
    ]

    cohort_map: dict[str, list[float]] = defaultdict(list)
    for row in items:
        if row["date"]:
            cohort_map[row["date"]].append(row["average_score"])

    cohort_trend = [
        {
            "date": period,
            "average_score": _round(sum(values) / len(values)),
        }
        for period, values in sorted(cohort_map.items())
    ]

    return {
        "items": items,
        "cohort_trend": cohort_trend,
        "last_updated": datetime.utcnow().isoformat(),
    }


def _pearson(xs: list[float], ys: list[float]) -> float:
    n = min(len(xs), len(ys))
    if n < 2:
        return 0.0
    x_avg = sum(xs) / n
    y_avg = sum(ys) / n
    numerator = sum((xs[i] - x_avg) * (ys[i] - y_avg) for i in range(n))
    x_var = sum((xs[i] - x_avg) ** 2 for i in range(n))
    y_var = sum((ys[i] - y_avg) ** 2 for i in range(n))
    denominator = math.sqrt(x_var * y_var)
    if denominator == 0:
        return 0.0
    return numerator / denominator


@cache.memoize(timeout=60)
def get_attendance_performance(
    department_id: str | None = None,
    course_id: str | None = None,
    module_id: str | None = None,
    subject_id: str | None = None,
    trainer_id: str | None = None,
    student_id: str | None = None,
) -> dict:
    """
    Attendance per learner, alongside the marks they earned.

    Attendance is counted independently of marks. This used to reach the
    register by joining through `Score` — subject taken from the score, module
    taken from that subject — and then filtered on `Score.subject_id`, a WHERE
    against an outer-joined table that quietly became an inner join. Any
    learner without a mark in the caller's subjects was dropped before their
    attendance was read, and a scope where that was true of everyone produced
    no rows at all, which the dashboard reported as an attendance signal of 0%
    while the register was plainly full.

    Both registers are read, because a learner may appear in either and looking
    at one alone reports 0% for a cohort that uses the other: `attendance` is a
    manual roll call carrying a status, `attendance_records` is a QR/GPS
    check-in against a session. This is the rule `alerts.attendance_rate`
    already applies for the same reason.
    """
    subject_ids = _resolve_subject_ids(department_id, course_id, module_id, subject_id, trainer_id, student_id)
    student_ids = _resolve_student_ids(department_id, course_id, module_id, subject_id, trainer_id, student_id)

    # ── Manual register ─────────────────────────────────────────────────
    presentish = case((func.lower(Attendance.status).in_(["present", "late"]), 1), else_=0)
    manual_query = (
        db.session.query(
            Attendance.student_id.label("student_id"),
            func.count(Attendance.id).label("sittings"),
            func.sum(presentish).label("attended"),
        )
        .filter(Attendance.deleted_at.is_(None), Attendance.student_id.isnot(None))
        .group_by(Attendance.student_id)
    )
    if subject_ids is not None:
        taught_module_ids = db.session.query(Subject.module_id).filter(Subject.id.in_(subject_ids))
        # A roll call that never named a module cannot be attributed to one, so
        # it counts toward whichever scope is being viewed rather than nowhere
        # — the rule `term_match_clause` applies to marks carrying no term.
        manual_query = manual_query.filter(
            or_(Attendance.module_id.is_(None), Attendance.module_id.in_(taught_module_ids))
        )
    if student_ids is not None:
        manual_query = manual_query.filter(Attendance.student_id.in_(student_ids))

    # ── QR/GPS register ─────────────────────────────────────────────────
    # Every session run for a subject the learner takes is a sitting they were
    # expected at; one they have no successful check-in for is an absence.
    expected_query = (
        db.session.query(
            StudentSubject.student_id.label("student_id"),
            func.count(func.distinct(AttendanceSession.id)).label("sittings"),
        )
        .join(AttendanceSession, AttendanceSession.subject_id == StudentSubject.subject_id)
        .filter(
            AttendanceSession.deleted_at.is_(None),
            StudentSubject.deleted_at.is_(None),
        )
        .group_by(StudentSubject.student_id)
    )
    checked_in_query = (
        db.session.query(
            AttendanceRecord.student_id.label("student_id"),
            func.count(func.distinct(AttendanceRecord.attendance_session_id)).label("attended"),
        )
        .join(AttendanceSession, AttendanceSession.id == AttendanceRecord.attendance_session_id)
        .filter(
            AttendanceRecord.deleted_at.is_(None),
            AttendanceRecord.status == "success",
            AttendanceSession.deleted_at.is_(None),
        )
        .group_by(AttendanceRecord.student_id)
    )
    if subject_ids is not None:
        expected_query = expected_query.filter(AttendanceSession.subject_id.in_(subject_ids))
        checked_in_query = checked_in_query.filter(AttendanceSession.subject_id.in_(subject_ids))
    if student_ids is not None:
        expected_query = expected_query.filter(StudentSubject.student_id.in_(student_ids))
        checked_in_query = checked_in_query.filter(AttendanceRecord.student_id.in_(student_ids))

    tally: dict[uuid.UUID, dict[str, float]] = defaultdict(lambda: {"attended": 0.0, "sittings": 0.0})
    for row in manual_query.all():
        tally[row.student_id]["attended"] += float(row.attended or 0)
        tally[row.student_id]["sittings"] += float(row.sittings or 0)
    for row in expected_query.all():
        tally[row.student_id]["sittings"] += float(row.sittings or 0)
    for row in checked_in_query.all():
        tally[row.student_id]["attended"] += float(row.attended or 0)

    # ── Marks, read separately so they cannot gate attendance ───────────
    averages: dict[uuid.UUID, float] = {}
    if tally:
        score_query = (
            db.session.query(
                Score.student_id.label("student_id"),
                func.avg(Score.marks_obtained).label("average_score"),
            )
            .filter(
                Score.deleted_at.is_(None),
                Score.student_id.in_(list(tally.keys())),
            )
            .group_by(Score.student_id)
        )
        if subject_ids is not None:
            taught_module_ids = db.session.query(Subject.module_id).filter(Subject.id.in_(subject_ids))
            # Marks predating `subject_id` reach their subject only through the
            # assessment's module; matching on `subject_id` alone drops them,
            # the same fallback `scope_scores` and the class report apply.
            score_query = score_query.filter(
                or_(
                    Score.subject_id.in_(subject_ids),
                    and_(
                        Score.subject_id.is_(None),
                        Score.assessment.has(Assessment.module_id.in_(taught_module_ids)),
                    ),
                )
            )
        averages = {row.student_id: row.average_score for row in score_query.all()}

    names: dict[uuid.UUID, str] = {}
    if tally:
        names = {
            row.id: row.student_name
            for row in db.session.query(Student.id, _student_name_expr().label("student_name"))
            .outerjoin(User, User.id == Student.user_id)
            .filter(Student.deleted_at.is_(None), Student.id.in_(list(tally.keys())))
            .all()
        }

    items = []
    for candidate_id, counts in tally.items():
        sittings = counts["sittings"]
        if sittings <= 0 or candidate_id not in names:
            # No sitting to measure against, or a learner who has since been
            # removed: reporting either as 0% would understate the cohort.
            continue
        attended = min(counts["attended"], sittings)
        items.append(
            {
                "student_id": str(candidate_id),
                "student_name": names[candidate_id],
                "attendance_rate": _round(attended / sittings * 100),
                "average_score": _round(averages.get(candidate_id)),
            }
        )
    items.sort(key=lambda item: (item["student_name"] or "").lower())

    # Correlated over learners who have both signals. Pairing an attendance
    # rate with the 0 stood in for "no marks yet" would report a relationship
    # between attendance and achievement that the data does not show.
    scored_ids = {str(key) for key in averages}
    correlated = [item for item in items if item["student_id"] in scored_ids]
    correlation = _pearson(
        [item["attendance_rate"] for item in correlated],
        [item["average_score"] for item in correlated],
    )
    return {
        "items": items,
        "correlation": {
            "value": _round(correlation, 4),
            "label": (
                "positive"
                if correlation > 0.2
                else "negative"
                if correlation < -0.2
                else "weak"
            ),
        },
        "last_updated": datetime.utcnow().isoformat(),
    }


@cache.memoize(timeout=60)
def get_portfolio_tracking(
    department_id: str | None = None,
    course_id: str | None = None,
    module_id: str | None = None,
    subject_id: str | None = None,
    trainer_id: str | None = None,
    student_id: str | None = None,
) -> dict:
    query = (
        db.session.query(
            Student.id.label("student_id"),
            User.name.label("student_name"),
            func.count(func.distinct(Competency.id)).label("required_count"),
            func.count(func.distinct(PortfolioEvidence.competency_id)).label("submitted_count"),
        )
        .join(User, User.id == Student.user_id)
        .join(StudentSubject, StudentSubject.student_id == Student.id)
        .join(Subject, Subject.id == StudentSubject.subject_id)
        .join(Competency, Competency.module_id == Subject.module_id)
        .outerjoin(
            PortfolioEvidence,
            (PortfolioEvidence.student_id == Student.id)
            & (PortfolioEvidence.competency_id == Competency.id)
            & (PortfolioEvidence.deleted_at.is_(None)),
        )
        .filter(
            Student.deleted_at.is_(None),
            Subject.deleted_at.is_(None),
            Competency.deleted_at.is_(None),
        )
    )
    query = _scope_subject_filter(query, department_id, course_id, module_id, subject_id, trainer_id, student_id)
    query = _scope_student_filter(query, department_id, course_id, module_id, subject_id, trainer_id, student_id)

    rows = query.group_by(Student.id, User.name).order_by(User.name.asc()).all()
    items = []
    for row in rows:
        required = int(row.required_count or 0)
        submitted = int(row.submitted_count or 0)
        missing = max(required - submitted, 0)
        completion = _round((submitted / required * 100) if required else 0)
        items.append(
            {
                "student_id": str(row.student_id),
                "student_name": row.student_name,
                "required_count": required,
                "submitted_count": submitted,
                "missing_count": missing,
                "completion_rate": completion,
            }
        )
    return {
        "items": items,
        "last_updated": datetime.utcnow().isoformat(),
    }


@cache.memoize(timeout=60)
def get_at_risk_analytics(
    department_id: str | None = None,
    course_id: str | None = None,
    module_id: str | None = None,
    subject_id: str | None = None,
    trainer_id: str | None = None,
    student_id: str | None = None,
    score_threshold: float = 50.0,
    attendance_threshold: float = 75.0,
) -> dict:
    attendance = get_attendance_performance(
        department_id=department_id,
        course_id=course_id,
        module_id=module_id,
        subject_id=subject_id,
        trainer_id=trainer_id,
        student_id=student_id,
    )["items"]
    attendance_by_student = {item["student_id"]: item for item in attendance}

    query = (
        db.session.query(
            Student.id.label("student_id"),
            User.name.label("student_name"),
            func.avg(Score.marks_obtained).label("average_score"),
            func.count(Score.id).label("scores_count"),
        )
        .join(User, User.id == Student.user_id)
        .join(Score, (Score.student_id == Student.id) & (Score.deleted_at.is_(None)))
        .filter(Student.deleted_at.is_(None))
    )
    subject_ids = _resolve_subject_ids(department_id, course_id, module_id, subject_id, trainer_id, student_id)
    student_ids = _resolve_student_ids(department_id, course_id, module_id, subject_id, trainer_id, student_id)
    if subject_ids is not None:
        query = query.filter(Score.subject_id.in_(subject_ids))
    if student_ids is not None:
        query = query.filter(Student.id.in_(student_ids))

    rows = query.group_by(Student.id, User.name).order_by(func.avg(Score.marks_obtained).asc()).all()
    items = []
    for row in rows:
        student_key = str(row.student_id)
        attendance_rate = attendance_by_student.get(student_key, {}).get("attendance_rate", 0.0)
        average_score = _round(row.average_score)
        is_at_risk = average_score < score_threshold or attendance_rate < attendance_threshold
        if not is_at_risk:
            continue
        items.append(
            {
                "student_id": student_key,
                "student_name": row.student_name,
                "average_score": average_score,
                "scores_count": int(row.scores_count or 0),
                "attendance_rate": _round(attendance_rate),
                "risk_level": (
                    "high"
                    if average_score < score_threshold and attendance_rate < attendance_threshold
                    else "medium"
                ),
            }
        )
    return {
        "items": items,
        "thresholds": {
            "score": score_threshold,
            "attendance": attendance_threshold,
        },
        "last_updated": datetime.utcnow().isoformat(),
    }


@cache.memoize(timeout=60)
def get_recommendations(
    department_id: str | None = None,
    course_id: str | None = None,
    module_id: str | None = None,
    subject_id: str | None = None,
    trainer_id: str | None = None,
    student_id: str | None = None,
) -> dict:
    heatmap = get_heatmap(
        department_id=department_id,
        course_id=course_id,
        module_id=module_id,
        subject_id=subject_id,
        trainer_id=trainer_id,
        student_id=student_id,
    )["items"]
    at_risk = get_at_risk_analytics(
        department_id=department_id,
        course_id=course_id,
        module_id=module_id,
        subject_id=subject_id,
        trainer_id=trainer_id,
        student_id=student_id,
    )["items"]
    recommendations = []

    low_cells = [item for item in heatmap if item["mastery_level"] == "low"]
    low_by_competency: dict[str, list[dict]] = defaultdict(list)
    for item in low_cells:
        low_by_competency[item["competency_name"]].append(item)

    for competency_name, rows in sorted(low_by_competency.items(), key=lambda item: len(item[1]), reverse=True):
        recommendations.append(
            {
                "recommendation_type": "competency_remediation",
                "message": f"Re-teach competency {competency_name} for {len(rows)} learner(s).",
            }
        )

    if len(at_risk) >= 3:
        recommendations.append(
            {
                "recommendation_type": "group_remediation",
                "message": f"Group remediation recommended for {len(at_risk)} at-risk learner(s).",
            }
        )

    if not recommendations:
        recommendations.append(
            {
                "recommendation_type": "maintain_momentum",
                "message": "Current competency and attendance signals are stable. Maintain the current instructional plan.",
            }
        )

    return {
        "items": recommendations,
        "last_updated": datetime.utcnow().isoformat(),
    }


@cache.memoize(timeout=60)
def get_cohort_comparison(
    subject_a_id: str | None = None,
    subject_b_id: str | None = None,
    department_id: str | None = None,
    course_id: str | None = None,
    module_id: str | None = None,
    subject_id: str | None = None,
    trainer_id: str | None = None,
    student_id: str | None = None,
) -> dict:
    ids: list[uuid.UUID] = []
    if subject_a_id and subject_b_id:
        ids = [uuid.UUID(subject_a_id), uuid.UUID(subject_b_id)]
    else:
        query = (
            db.session.query(
                Subject.id.label("subject_id"),
                func.count(Score.id).label("scores_count"),
            )
            .join(Score, (Score.subject_id == Subject.id) & (Score.deleted_at.is_(None)))
            .filter(Subject.deleted_at.is_(None))
        )
        query = _scope_subject_filter(query, department_id, course_id, module_id, subject_id, trainer_id, student_id)
        rows = (
            query.group_by(Subject.id)
            .order_by(func.count(Score.id).desc(), Subject.id.asc())
            .limit(2)
            .all()
        )
        ids = [row.subject_id for row in rows]

    if len(ids) < 2:
        return {
            "cohort_a_avg": 0.0,
            "cohort_b_avg": 0.0,
            "cohorts": [],
            "last_updated": datetime.utcnow().isoformat(),
        }

    rows = (
        db.session.query(
            Subject.id.label("subject_id"),
            Subject.name.label("subject_name"),
            func.avg(Score.marks_obtained).label("avg_score"),
            func.count(func.distinct(Score.student_id)).label("students_count"),
        )
        .join(Score, (Score.subject_id == Subject.id) & (Score.deleted_at.is_(None)))
        .filter(Subject.id.in_(ids), Subject.deleted_at.is_(None))
        .group_by(Subject.id, Subject.name)
        .order_by(Subject.name.asc())
        .all()
    )
    payload = {
        "cohort_a_avg": 0.0,
        "cohort_b_avg": 0.0,
        "cohorts": [],
        "last_updated": datetime.utcnow().isoformat(),
    }
    for index, row in enumerate(rows):
        entry = {
            "subject_id": str(row.subject_id),
            "subject_name": row.subject_name,
            "average_score": _round(row.avg_score),
            "students_count": int(row.students_count or 0),
        }
        payload["cohorts"].append(entry)
        if index == 0:
            payload["cohort_a_avg"] = entry["average_score"]
        elif index == 1:
            payload["cohort_b_avg"] = entry["average_score"]
    return payload


@cache.memoize(timeout=60)
def get_cohort_drilldown(
    subject_id: str,
    department_id: str | None = None,
    course_id: str | None = None,
    module_id: str | None = None,
    trainer_id: str | None = None,
    student_id: str | None = None,
) -> dict:
    sid = uuid.UUID(subject_id)
    subject = db.session.get(Subject, sid)
    students = (
        db.session.query(Student, User.name)
        .join(User, User.id == Student.user_id)
        .join(StudentSubject, StudentSubject.student_id == Student.id)
        .filter(
            StudentSubject.subject_id == sid,
            Student.deleted_at.is_(None),
        )
        .order_by(User.name.asc())
        .all()
    )
    return {
        "subject": {
            "id": str(subject.id) if subject else subject_id,
            "name": subject.name if subject else "Unknown subject",
        },
        "students": [
            {
                "student_id": str(student.id),
                "student_name": name,
                "registration_number": student.registration_number,
            }
            for student, name in students
        ],
        "summary": {
            "heatmap": get_heatmap(
                department_id=department_id,
                course_id=course_id,
                module_id=module_id,
                subject_id=subject_id,
                trainer_id=trainer_id,
                student_id=student_id,
            ),
            "progress": get_mastery_progress(
                department_id=department_id,
                course_id=course_id,
                module_id=module_id,
                subject_id=subject_id,
                trainer_id=trainer_id,
                student_id=student_id,
            ),
            "attendance_correlation": get_attendance_performance(
                department_id=department_id,
                course_id=course_id,
                module_id=module_id,
                subject_id=subject_id,
                trainer_id=trainer_id,
                student_id=student_id,
            ),
            "portfolio": get_portfolio_tracking(
                department_id=department_id,
                course_id=course_id,
                module_id=module_id,
                subject_id=subject_id,
                trainer_id=trainer_id,
                student_id=student_id,
            ),
            "at_risk": get_at_risk_analytics(
                department_id=department_id,
                course_id=course_id,
                module_id=module_id,
                subject_id=subject_id,
                trainer_id=trainer_id,
                student_id=student_id,
            ),
            "recommendations": get_recommendations(
                department_id=department_id,
                course_id=course_id,
                module_id=module_id,
                subject_id=subject_id,
                trainer_id=trainer_id,
                student_id=student_id,
            ),
        },
        "last_updated": datetime.utcnow().isoformat(),
    }


@cache.memoize(timeout=60)
def get_student_drilldown(
    student_id: str,
    department_id: str | None = None,
    course_id: str | None = None,
    module_id: str | None = None,
    subject_id: str | None = None,
    trainer_id: str | None = None,
) -> dict:
    sid = uuid.UUID(student_id)
    student = db.session.get(Student, sid)
    user = student.user if student else None
    return {
        "student": {
            "id": student_id,
            "name": user.name if user else "Unknown student",
            "registration_number": student.registration_number if student else None,
        },
        "heatmap": get_heatmap(
            department_id=department_id,
            course_id=course_id,
            module_id=module_id,
            subject_id=subject_id,
            trainer_id=trainer_id,
            student_id=student_id,
        ),
        "progress": get_mastery_progress(
            department_id=department_id,
            course_id=course_id,
            module_id=module_id,
            subject_id=subject_id,
            trainer_id=trainer_id,
            student_id=student_id,
        ),
        "attendance_correlation": get_attendance_performance(
            department_id=department_id,
            course_id=course_id,
            module_id=module_id,
            subject_id=subject_id,
            trainer_id=trainer_id,
            student_id=student_id,
        ),
        "portfolio": get_portfolio_tracking(
            department_id=department_id,
            course_id=course_id,
            module_id=module_id,
            subject_id=subject_id,
            trainer_id=trainer_id,
            student_id=student_id,
        ),
        "at_risk": get_at_risk_analytics(
            department_id=department_id,
            course_id=course_id,
            module_id=module_id,
            subject_id=subject_id,
            trainer_id=trainer_id,
            student_id=student_id,
        ),
        "recommendations": get_recommendations(
            department_id=department_id,
            course_id=course_id,
            module_id=module_id,
            subject_id=subject_id,
            trainer_id=trainer_id,
            student_id=student_id,
        ),
        "last_updated": datetime.utcnow().isoformat(),
    }


@cache.memoize(timeout=60)
def get_competency_drilldown(competency_id: str) -> dict:
    cid = uuid.UUID(competency_id)
    competency = db.session.get(Competency, cid)
    heatmap_rows = [row for row in get_heatmap()["items"] if row["competency_id"] == competency_id]
    evidence_count = (
        db.session.query(func.count(PortfolioEvidence.id))
        .filter(
            PortfolioEvidence.competency_id == cid,
            PortfolioEvidence.deleted_at.is_(None),
        )
        .scalar()
    ) or 0
    return {
        "competency": {
            "id": competency_id,
            "name": competency.name if competency else "Unknown competency",
            "mastery_threshold": competency.mastery_threshold if competency else None,
        },
        "performance": heatmap_rows,
        "portfolio_evidence_count": int(evidence_count),
        "last_updated": datetime.utcnow().isoformat(),
    }


def build_role_dashboard(
    role: str,
    student_id: str | None = None,
    trainer_id: str | None = None,
    department_id: str | None = None,
    course_id: str | None = None,
    module_id: str | None = None,
    subject_id: str | None = None,
) -> dict:
    # No subject filter means "everything in this person's scope". Defaulting to
    # their first subject — which is what this used to do — made class average,
    # mastery, and the attendance signal describe one arbitrary unit and read as
    # 0% whenever that unit happened to have no data. `trainer_id`/`student_id`
    # already scope every query below, so leaving this None is both correct and
    # narrower than any wildcard.
    resolved_subject_id = subject_id

    at_risk = get_at_risk_analytics(
        department_id=department_id,
        course_id=course_id,
        module_id=module_id,
        subject_id=resolved_subject_id,
        trainer_id=trainer_id,
        student_id=student_id,
    )
    attendance = get_attendance_performance(
        department_id=department_id,
        course_id=course_id,
        module_id=module_id,
        subject_id=resolved_subject_id,
        trainer_id=trainer_id,
        student_id=student_id,
    )
    portfolio = get_portfolio_tracking(
        department_id=department_id,
        course_id=course_id,
        module_id=module_id,
        subject_id=resolved_subject_id,
        trainer_id=trainer_id,
        student_id=student_id,
    )
    heatmap = get_heatmap(
        department_id=department_id,
        course_id=course_id,
        module_id=module_id,
        subject_id=resolved_subject_id,
        trainer_id=trainer_id,
        student_id=student_id,
    )
    progress = get_mastery_progress(
        department_id=department_id,
        course_id=course_id,
        module_id=module_id,
        subject_id=resolved_subject_id,
        trainer_id=trainer_id,
        student_id=student_id,
    )

    heatmap_items = heatmap["items"]
    # Only cells actually assessed can say anything about mastery. Counting the
    # unassessed ones held the rate down in proportion to how much of the
    # module was still to be delivered.
    assessed_cells = [item for item in heatmap_items if item.get("assessed")]
    if assessed_cells:
        mastery_pct = _round(
            sum(1 for item in assessed_cells if item["mastery_level"] == "high")
            / len(assessed_cells)
            * 100
        )
        mastery_basis = "competency"
        mastery_sample = len(assessed_cells)
    else:
        # No competency evidence in this scope — see `_score_mastery_share`.
        mastery_pct, mastery_sample = _score_mastery_share(
            _resolve_subject_ids(department_id, course_id, module_id, resolved_subject_id, trainer_id, student_id),
            _resolve_student_ids(department_id, course_id, module_id, resolved_subject_id, trainer_id, student_id),
        )
        mastery_basis = "score" if mastery_sample else "none"
    attendance_items = attendance["items"]
    average_attendance = _round(
        sum(item["attendance_rate"] for item in attendance_items) / len(attendance_items)
        if attendance_items
        else 0
    )

    # Portfolio completion is evidence submitted against competencies required,
    # so a learner with nothing required of them has no completion to report —
    # averaging them in as 0% blames the cohort for a requirement that was
    # never defined. Nothing in the API creates a competency or a piece of
    # evidence (both arrive only through the seed scripts), so an untouched
    # install has no requirement anywhere and says so rather than reporting 0%.
    portfolio_items = [item for item in portfolio["items"] if item["required_count"] > 0]
    portfolio_completion = _round(
        sum(item["completion_rate"] for item in portfolio_items) / len(portfolio_items)
        if portfolio_items
        else 0
    )
    portfolio_basis = "competency" if portfolio_items else "none"

    return {
        "summary_panel": {
            "mastery_rate": mastery_pct,
            # What the rate was measured from, so the tile can say so rather
            # than implying competency evidence that does not exist.
            "mastery_basis": mastery_basis,
            "mastery_sample": mastery_sample,
            "at_risk_students": len(at_risk["items"]),
            "attendance_rate": average_attendance,
            "portfolio_completion_rate": portfolio_completion,
            # As with mastery: says whether a requirement exists at all, so the
            # UI need not present "nothing defined" as "nothing submitted".
            "portfolio_basis": portfolio_basis,
            "portfolio_sample": len(portfolio_items),
            "alerts": len(at_risk["items"]),
        },
        "heatmap": heatmap,
        "progress": progress,
        "attendance_correlation": attendance,
        "portfolio": portfolio,
        "at_risk": at_risk,
        "cohort_comparison": (
            get_cohort_comparison(trainer_id=trainer_id, department_id=department_id, course_id=course_id, module_id=module_id, subject_id=resolved_subject_id, student_id=student_id)
            if role == "trainer"
            else get_cohort_comparison(department_id=department_id, course_id=course_id, module_id=module_id, subject_id=resolved_subject_id, trainer_id=trainer_id, student_id=student_id)
            if role == "admin"
            else {"cohorts": [], "cohort_a_avg": 0.0, "cohort_b_avg": 0.0, "last_updated": datetime.utcnow().isoformat()}
        ),
        "recommendations": get_recommendations(
            department_id=department_id,
            course_id=course_id,
            module_id=module_id,
            subject_id=resolved_subject_id,
            trainer_id=trainer_id,
            student_id=student_id,
        ),
        "last_updated": datetime.utcnow().isoformat(),
    }
