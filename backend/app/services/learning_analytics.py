from __future__ import annotations

import math
import uuid
from collections import defaultdict
from datetime import datetime

from sqlalchemy import case, func

from ..extensions import cache, db
from ..models.assessment import Assessment
from ..models.course import Course
from ..models.attendance import Attendance
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


def _resolve_subject_ids(
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


def _attendance_rate_expr():
    presentish = case((func.lower(Attendance.status).in_(["present", "late"]), 1), else_=0)
    total = func.count(Attendance.id)
    return (func.sum(presentish) * 100.0 / func.nullif(total, 0))


def _student_name_expr():
    return func.coalesce(User.name, Student.registration_number, "Unknown")


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
            func.avg((Score.marks_obtained / func.nullif(Assessment.total_marks, 0)) * 100.0).label("score"),
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
    for row in rows:
        score = _round(row.score)
        student_ids.add(str(row.student_id))
        competency_ids.add(str(row.competency_id))
        items.append(
            {
                "student_id": str(row.student_id),
                "student_name": row.student_name,
                "competency_id": str(row.competency_id),
                "competency_name": row.competency_name,
                "score": score,
                "mastery_level": mastery_label(score),
            }
        )

    return {
        "items": items,
        "students_count": len(student_ids),
        "competencies_count": len(competency_ids),
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
            func.avg(Score.marks_obtained).label("average_score"),
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
        query = query.filter(Score.subject_id.in_(subject_ids))
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
    attendance_rate = _attendance_rate_expr()
    query = (
        db.session.query(
            Student.id.label("student_id"),
            User.name.label("student_name"),
            attendance_rate.label("attendance_rate"),
            func.avg(Score.marks_obtained).label("average_score"),
        )
        .join(User, User.id == Student.user_id)
        .outerjoin(Score, (Score.student_id == Student.id) & (Score.deleted_at.is_(None)))
        .outerjoin(Subject, Subject.id == Score.subject_id)
        .outerjoin(
            Attendance,
            (Attendance.student_id == Student.id)
            & (Attendance.deleted_at.is_(None))
            & (
                (Subject.module_id.is_(None))
                | (Attendance.module_id == Subject.module_id)
            ),
        )
        .filter(Student.deleted_at.is_(None))
    )

    subject_ids = _resolve_subject_ids(department_id, course_id, module_id, subject_id, trainer_id, student_id)
    student_ids = _resolve_student_ids(department_id, course_id, module_id, subject_id, trainer_id, student_id)
    if subject_ids is not None:
        query = query.filter(Score.subject_id.in_(subject_ids))
    if student_ids is not None:
        query = query.filter(Student.id.in_(student_ids))

    rows = query.group_by(Student.id, User.name).order_by(User.name.asc()).all()
    items = [
        {
            "student_id": str(row.student_id),
            "student_name": row.student_name,
            "attendance_rate": _round(row.attendance_rate),
            "average_score": _round(row.average_score),
        }
        for row in rows
    ]
    correlation = _pearson(
        [item["attendance_rate"] for item in items],
        [item["average_score"] for item in items],
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
    mastery_pct = _round(
        (
            sum(1 for item in heatmap_items if item["mastery_level"] == "high")
            / len(heatmap_items)
            * 100
        )
        if heatmap_items
        else 0
    )
    attendance_items = attendance["items"]
    average_attendance = _round(
        sum(item["attendance_rate"] for item in attendance_items) / len(attendance_items)
        if attendance_items
        else 0
    )

    portfolio_items = portfolio["items"]
    portfolio_completion = _round(
        sum(item["completion_rate"] for item in portfolio_items) / len(portfolio_items)
        if portfolio_items
        else 0
    )

    return {
        "summary_panel": {
            "mastery_rate": mastery_pct,
            "at_risk_students": len(at_risk["items"]),
            "attendance_rate": average_attendance,
            "portfolio_completion_rate": portfolio_completion,
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
