from __future__ import annotations

import math
import uuid

from flask import abort
from sqlalchemy import case, func

from ..extensions import db
from ..models.assessment import Assessment
from ..models.enrollment import Enrollment
from ..models.notification import Notification
from ..models.score import Score
from ..models.student import Student
from ..models.student_subject import StudentSubject
from ..models.subject import Subject
from ..models.trainer import Trainer
from ..models.trainer_subject import TrainerSubject
from ..models.user import User
from .learning_analytics import build_role_dashboard
from .scoping import average_percentage, grade_for_percentage, percentage, score_percentage_expr
from .subject_enrollment import link_student_to_subject

PASS_MARK = 50.0


def assessment_grade(score: float, total_marks: int) -> str:
    # `percentage` treats a missing/zero total as a mark already out of 100 —
    # the rule every average follows — where this used to grade such marks F.
    return grade_for_percentage(percentage(score, total_marks)) or "F"


def parse_uuid(value: str | None, field: str) -> uuid.UUID:
    if not value:
        raise ValueError(f"Missing '{field}'")
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError) as exc:
        raise ValueError(f"Invalid '{field}'") from exc


def pagination_meta(page: int, per_page: int, total: int) -> dict:
    total_pages = max(1, math.ceil(total / per_page)) if per_page else 1
    return {
        "page": page,
        "per_page": per_page,
        "total": total,
        "total_pages": total_pages,
    }


def get_trainer_subject_ids(trainer: Trainer) -> list[uuid.UUID]:
    rows = (
        db.session.query(TrainerSubject.subject_id)
        .filter(TrainerSubject.trainer_id == trainer.id)
        .all()
    )
    return [row[0] for row in rows]


def ensure_subject_access(trainer: Trainer, subject_id: uuid.UUID) -> Subject:
    subject = db.session.get(Subject, subject_id)
    if not subject:
        abort(404, description="Subject not found")

    assigned = (
        db.session.query(TrainerSubject.id)
        .filter(
            TrainerSubject.trainer_id == trainer.id,
            TrainerSubject.subject_id == subject_id,
        )
        .first()
    )
    if not assigned:
        abort(403, description="You do not have access to this subject")

    return subject


def ensure_student_enrolled(student_id: uuid.UUID, subject_id: uuid.UUID) -> Student:
    """
    The learner the mark belongs to, attached to the subject if they were not
    already. Callers check the trainer owns the subject first, which is the same
    right the enrolment endpoint requires, so recording a mark also fixes a
    roster that never had the learner on the subject.
    """
    student = db.session.get(Student, student_id)
    if not student or student.deleted_at:
        abort(404, description="Student not found")

    link_student_to_subject(student_id, subject_id)
    return student


def resolve_score_enrollment(student: Student, subject: Subject) -> Enrollment | None:
    query = db.session.query(Enrollment).filter(Enrollment.student_id == student.id)
    if subject.module_id:
        query = query.filter(Enrollment.module_id == subject.module_id)
        if subject.module and subject.module.course_id:
            query = query.filter(Enrollment.course_id == subject.module.course_id)

    active_first = case((Enrollment.status == "active", 0), else_=1)
    return query.order_by(active_first.asc(), Enrollment.created_at.desc()).first()


def score_payload(score: Score) -> dict:
    student_user = score.student.user if score.student and score.student.user else None
    trainer_user = score.trainer.user if score.trainer and score.trainer.user else None
    return {
        "id": str(score.id),
        "student_id": str(score.student_id) if score.student_id else None,
        "subject_id": str(score.subject_id) if score.subject_id else None,
        "assessment_id": str(score.assessment_id) if score.assessment_id else None,
        "trainer_id": str(score.trainer_id) if score.trainer_id else None,
        "term": score.term,
        "score": score.marks_obtained,
        "feedback": score.feedback,
        "is_passed": score.is_passed,
        "grade": score.grade,
        "created_at": score.created_at.isoformat() if score.created_at else None,
        "student": {
            "id": str(score.student.id),
            "registration_number": score.student.registration_number,
            "name": student_user.name if student_user else None,
            "email": student_user.email if student_user else None,
        } if score.student else None,
        "subject": {
            "id": str(score.subject.id),
            "name": score.subject.name,
            "module_id": str(score.subject.module_id),
        } if score.subject else None,
        "assessment": {
            "id": str(score.assessment.id),
            "code": score.assessment.code,
            "name": score.assessment.name,
            "total_marks": score.assessment.total_marks,
            "pass_marks": score.assessment.pass_marks,
        } if score.assessment else None,
        "trainer": {
            "id": str(score.trainer.id),
            "name": trainer_user.name if trainer_user else None,
            "email": trainer_user.email if trainer_user else None,
        } if score.trainer else None,
    }


def subject_statistics(subject_ids: list[uuid.UUID]) -> dict[uuid.UUID, dict]:
    """
    Learner counts and percentage averages for many subjects in two queries.

    Computing these per subject meant loading every score row for every subject
    into Python — on a trainer dashboard that is one full scan per unit taught.
    The average is still a mean of percentages, so a paper out of 40 and one out
    of 100 stay comparable; `COALESCE` treats a score with no assessment as
    being out of 100, matching `scoping.percentage`.
    """
    stats: dict[uuid.UUID, dict] = {
        subject_id: {"students_count": 0, "average_score": 0.0, "recent_scores_count": 0}
        for subject_id in subject_ids
    }
    if not subject_ids:
        return stats

    for subject_id, count in (
        db.session.query(StudentSubject.subject_id, func.count(StudentSubject.id))
        .filter(StudentSubject.subject_id.in_(subject_ids))
        .group_by(StudentSubject.subject_id)
        .all()
    ):
        stats[subject_id]["students_count"] = int(count or 0)

    for subject_id, average, count in (
        db.session.query(
            Score.subject_id,
            func.avg(score_percentage_expr()),
            func.count(Score.id),
        )
        .outerjoin(Assessment, Assessment.id == Score.assessment_id)
        .filter(Score.subject_id.in_(subject_ids), Score.deleted_at.is_(None))
        .group_by(Score.subject_id)
        .all()
    ):
        stats[subject_id]["average_score"] = round(float(average or 0), 1)
        stats[subject_id]["recent_scores_count"] = int(count or 0)

    return stats


def subject_payload(subject: Subject, stats: dict | None = None) -> dict:
    # `stats` comes from `subject_statistics` when a caller is rendering more
    # than one subject; on its own this falls back to a single-subject lookup.
    if stats is None:
        stats = subject_statistics([subject.id]).get(subject.id, {})
    avg_score = stats.get("average_score", 0.0)
    student_count = stats.get("students_count", 0)
    recent_score_count = stats.get("recent_scores_count", 0)

    module = subject.module
    course = module.course if module else None
    department = course.department if course else None

    return {
        "id": str(subject.id),
        "name": subject.name,
        "code": subject.code,
        # The trainer screens read `subject_name`/`subject_code` — their subject
        # dropdowns rendered blank options for every assigned subject without
        # these, which reads as "the list failed to load". Both spellings are
        # served rather than renaming, since other callers read `name`.
        "subject_name": subject.name,
        "subject_code": subject.code,
        "description": subject.description,
        "syllabus_topics": subject.syllabus_topics if isinstance(subject.syllabus_topics, list) else [],
        "module_id": str(subject.module_id),
        "module_name": module.name if module else None,
        "course_id": str(course.id) if course else None,
        "course_name": course.name if course else None,
        "department_id": str(department.id) if department else None,
        "department_name": department.name if department else None,
        "students_count": student_count,
        "average_score": avg_score,
        "recent_scores_count": recent_score_count,
        "created_at": subject.created_at.isoformat() if subject.created_at else None,
    }


def student_payload(student: Student, subject_names: list[str] | None = None) -> dict:
    user = student.user
    return {
        "id": str(student.id),
        "registration_number": student.registration_number,
        "course_id": str(student.course_id) if student.course_id else None,
        "enrollment_year": student.enrollment_year,
        "name": user.name if user else None,
        "email": user.email if user else None,
        "subjects": subject_names or [],
    }


def create_score(trainer: Trainer, payload: dict) -> Score:
    student_id = parse_uuid(payload.get("student_id"), "student_id")
    subject_id = parse_uuid(payload.get("subject_id"), "subject_id")
    assessment_id = parse_uuid(payload.get("assessment_id"), "assessment_id")
    term = payload.get("term")
    raw_score = payload.get("score")

    if not isinstance(term, str) or not term.strip():
        abort(400, description="'term' is required")
    if not isinstance(raw_score, (int, float)):
        abort(400, description="'score' is required and must be numeric")
    trainer_id_value = payload.get("trainer_id")
    if trainer_id_value:
        trainer_id = parse_uuid(trainer_id_value, "trainer_id")
        if trainer_id != trainer.id:
            abort(403, description="You can only upload scores as yourself")

    subject = ensure_subject_access(trainer, subject_id)
    student = ensure_student_enrolled(student_id, subject_id)
    assessment = db.session.get(Assessment, assessment_id)
    if not assessment or assessment.deleted_at:
        abort(404, description="Assessment not found")
    if assessment.assessment_scope != "formative":
        abort(400, description="Only internal formative assessments can be reused")
    if assessment.module_id and assessment.module_id != subject.module_id:
        abort(400, description="The assessment does not belong to the selected subject's module")
    if raw_score < 0 or raw_score > assessment.total_marks:
        abort(400, description=f"'score' must be between 0 and {assessment.total_marks}")

    duplicate = (
        db.session.query(Score.id)
        .filter(
            Score.student_id == student_id,
            Score.assessment_id == assessment_id,
        )
        .first()
    )
    if duplicate:
        abort(409, description="This student already has a score for the selected assessment")

    enrollment = resolve_score_enrollment(student, subject)
    score = Score(
        enrollment_id=enrollment.id if enrollment else None,
        assessment_id=assessment.id,
        student_id=student.id,
        subject_id=subject.id,
        trainer_id=trainer.id,
        term=term.strip(),
        marks_obtained=float(raw_score),
        grade=assessment_grade(float(raw_score), assessment.total_marks),
        feedback=(payload.get("feedback") or None),
        is_passed=float(raw_score) >= (
            assessment.pass_marks
            if assessment.pass_marks is not None
            else assessment.total_marks * 0.5
        ),
    )

    db.session.add(score)

    if student.user_id:
        db.session.add(
            Notification(
                user_id=student.user_id,
                title="New Score Available",
                message=f"A new score was recorded for {assessment.name} in {subject.name} ({score.term}).",
                is_read=False,
            )
        )

        if score.is_passed is False:
            db.session.add(
                Notification(
                    user_id=student.user_id,
                    title="At-Risk Performance Alert",
                    message=f"Your {assessment.name} score for {score.term} is below the pass mark.",
                    is_read=False,
                )
            )

    # The route owns the transaction because score evidence is saved immediately
    # afterwards. Committing here could leave an orphan score when evidence
    # persistence fails.
    db.session.flush()
    return score


def update_feedback(trainer: Trainer, score: Score, feedback: str) -> Score:
    ensure_subject_access(trainer, score.subject_id)
    score.feedback = feedback.strip()
    db.session.commit()
    db.session.refresh(score)
    return score


def trainer_dashboard(trainer: Trainer, subject_id: uuid.UUID | None = None) -> dict:
    subject_ids = get_trainer_subject_ids(trainer)
    subject_count = len(subject_ids)
    scoped_subject_ids = subject_ids
    if subject_id:
        ensure_subject_access(trainer, subject_id)
        scoped_subject_ids = [subject_id]

    total_students = 0
    if scoped_subject_ids:
        total_students = (
            db.session.query(func.count(func.distinct(StudentSubject.student_id)))
            .filter(StudentSubject.subject_id.in_(scoped_subject_ids))
            .scalar()
        ) or 0

    subjects = (
        db.session.query(Subject)
        .join(TrainerSubject, TrainerSubject.subject_id == Subject.id)
        .filter(TrainerSubject.trainer_id == trainer.id)
        .order_by(Subject.name.asc())
        .all()
    )

    recent_scores = []
    avg_score = 0.0
    pass_rate = 0.0
    pass_count = 0
    fail_count = 0
    if scoped_subject_ids:
        # Scoped by subject, not by author. Marks entered by an admin, imported
        # in bulk, or recorded by a co-trainer still belong to this class, and
        # excluding them was what left the class average sitting at zero.
        recent_scores = (
            db.session.query(Score)
            .filter(
                Score.subject_id.in_(scoped_subject_ids),
                Score.deleted_at.is_(None),
            )
            .order_by(Score.created_at.desc())
            .limit(10)
            .all()
        )
        all_scores = (
            db.session.query(Score)
            .filter(
                Score.subject_id.in_(scoped_subject_ids),
                Score.deleted_at.is_(None),
            )
            .all()
        )
        if all_scores:
            avg_score = average_percentage(all_scores)
            pass_count = sum(
                1 for s in all_scores
                if s.is_passed is True or (percentage(s.marks_obtained, s.assessment.total_marks if s.assessment else None) or 0) >= PASS_MARK
            )
            fail_count = len(all_scores) - pass_count
            pass_rate = round(pass_count / len(all_scores) * 100, 2)

    advanced = build_role_dashboard(
        "trainer",
        trainer_id=str(trainer.id),
        subject_id=str(subject_id) if subject_id else None,
    )

    subject_stats = subject_statistics([subject.id for subject in subjects])

    return {
        "subjects_assigned": subject_count,
        "subjects": [subject_payload(subject, subject_stats.get(subject.id)) for subject in subjects],
        "total_students": total_students,
        "average_score": avg_score,
        "pass_rate": pass_rate,
        "pass_count": pass_count,
        "fail_count": fail_count,
        "recent_scores": [score_payload(score) for score in recent_scores],
        "summary_panel": advanced["summary_panel"],
        "analytics": advanced,
        "last_updated": advanced["last_updated"],
        "selected_subject_id": str(subject_id) if subject_id else None,
    }


def calculate_student_trend(student_id: uuid.UUID, subject_id: uuid.UUID, min_scores: int = 3) -> str | None:
    """
    Calculate trend for a student in a subject.
    Returns: 'improving', 'declining', 'stable', or None if insufficient data
    """
    scores = (
        db.session.query(Score)
        .filter(Score.student_id == student_id, Score.subject_id == subject_id)
        .order_by(Score.created_at.asc())
        .all()
    )
    
    if len(scores) < min_scores:
        return None
    
    mid = len(scores) // 2
    first_half = scores[:mid]
    second_half = scores[mid:]
    
    # Percentages, not raw marks: a half full of out-of-40 papers next to a
    # half of out-of-100 ones read as a huge swing that never happened.
    avg_first = average_percentage(first_half) if first_half else 0
    avg_second = average_percentage(second_half) if second_half else 0
    
    diff = avg_second - avg_first
    change_percent = abs(diff / avg_first * 100) if avg_first > 0 else 0
    
    if change_percent < 5:
        return "stable"
    elif diff > 0:
        return "improving"
    else:
        return "declining"


def trainer_subject_report(trainer: Trainer, subject_id: uuid.UUID, term: str | None = None) -> dict:
    subject = ensure_subject_access(trainer, subject_id)
    query = db.session.query(Score).filter(Score.subject_id == subject_id)
    if term:
        query = query.filter(Score.term == term)

    scores = query.order_by(Score.created_at.desc()).all()
    total_students = (
        db.session.query(func.count(func.distinct(StudentSubject.student_id)))
        .filter(StudentSubject.subject_id == subject_id)
        .scalar()
    ) or 0

    average_score = average_percentage(scores)
    pass_count = sum(
        1 for score in scores
        if score.is_passed is True
        or (percentage(score.marks_obtained, score.assessment.total_marks if score.assessment else None) or 0) >= PASS_MARK
    )
    fail_count = len(scores) - pass_count
    pass_rate = round((pass_count / len(scores)) * 100, 2) if scores else 0.0

    return {
        "subject": subject_payload(subject),
        "term": term,
        "total_students": total_students,
        "scores_count": len(scores),
        "average_score": average_score,
        "pass_count": pass_count,
        "fail_count": fail_count,
        "pass_rate": pass_rate,
        "scores": [score_payload(score) for score in scores],
    }


def at_risk_students(trainer: Trainer, subject_id: uuid.UUID | None = None, term: str | None = None) -> list[dict]:
    subject_ids = get_trainer_subject_ids(trainer)
    if subject_id:
        ensure_subject_access(trainer, subject_id)
        subject_ids = [subject_id]
    if not subject_ids:
        return []

    query = (
        db.session.query(
            Student.id.label("student_id"),
            User.name.label("student_name"),
            User.email.label("student_email"),
            func.avg(Score.marks_obtained).label("average_score"),
            func.count(Score.id).label("scores_count"),
        )
        .join(User, User.id == Student.user_id)
        .join(Score, Score.student_id == Student.id)
        .filter(Score.subject_id.in_(subject_ids))
        .group_by(Student.id, User.name, User.email)
        .having(func.avg(Score.marks_obtained) < PASS_MARK)
        .order_by(func.avg(Score.marks_obtained).asc())
    )
    if term:
        query = query.filter(Score.term == term)

    results = []
    for row in query.all():
        weak_subjects = (
            db.session.query(Subject.name)
            .join(Score, Score.subject_id == Subject.id)
            .filter(
                Score.student_id == row.student_id,
                Score.subject_id.in_(subject_ids),
                Score.marks_obtained < PASS_MARK,
            )
        )
        if term:
            weak_subjects = weak_subjects.filter(Score.term == term)

        results.append(
            {
                "student_id": str(row.student_id),
                "student_name": row.student_name,
                "student_email": row.student_email,
                "average_score": round(float(row.average_score or 0), 2),
                "scores_count": int(row.scores_count or 0),
                "weak_subjects": [name for (name,) in weak_subjects.distinct().all()],
            }
        )

    return results
