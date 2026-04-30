from __future__ import annotations

import math
import uuid

from flask import abort
from sqlalchemy import case, func, or_

from ..extensions import db
from ..models.enrollment import Enrollment
from ..models.notification import Notification
from ..models.score import Score
from ..models.student import Student
from ..models.student_subject import StudentSubject
from ..models.subject import Subject
from ..models.trainer import Trainer
from ..models.trainer_subject import TrainerSubject
from ..models.user import User

PASS_MARK = 50.0


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
    student = db.session.get(Student, student_id)
    if not student:
        abort(404, description="Student not found")

    enrollment = (
        db.session.query(StudentSubject.id)
        .filter(
            StudentSubject.student_id == student_id,
            StudentSubject.subject_id == subject_id,
        )
        .first()
    )
    if not enrollment:
        abort(400, description="Student is not enrolled in this subject")

    return student


def resolve_score_enrollment(student: Student, subject: Subject) -> Enrollment | None:
    query = db.session.query(Enrollment).filter(Enrollment.student_id == student.id)
    if subject.module_id:
        enrollment_filters = [Enrollment.module_id == subject.module_id]
        if subject.module and subject.module.course_id:
            enrollment_filters.append(Enrollment.course_id == subject.module.course_id)
        query = query.filter(or_(*enrollment_filters))

    active_first = case((Enrollment.status == "active", 0), else_=1)
    return query.order_by(active_first.asc(), Enrollment.created_at.desc()).first()


def score_payload(score: Score) -> dict:
    student_user = score.student.user if score.student and score.student.user else None
    trainer_user = score.trainer.user if score.trainer and score.trainer.user else None
    return {
        "id": str(score.id),
        "student_id": str(score.student_id) if score.student_id else None,
        "subject_id": str(score.subject_id) if score.subject_id else None,
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
        "trainer": {
            "id": str(score.trainer.id),
            "name": trainer_user.name if trainer_user else None,
            "email": trainer_user.email if trainer_user else None,
        } if score.trainer else None,
    }


def subject_payload(subject: Subject) -> dict:
    avg_score = (
        db.session.query(func.avg(Score.marks_obtained))
        .filter(Score.subject_id == subject.id)
        .scalar()
    )
    student_count = (
        db.session.query(func.count(StudentSubject.id))
        .filter(StudentSubject.subject_id == subject.id)
        .scalar()
    ) or 0
    recent_score_count = (
        db.session.query(func.count(Score.id))
        .filter(Score.subject_id == subject.id)
        .scalar()
    ) or 0

    module = subject.module
    course = module.course if module else None
    department = course.department if course else None

    return {
        "id": str(subject.id),
        "name": subject.name,
        "description": subject.description,
        "module_id": str(subject.module_id),
        "module_name": module.name if module else None,
        "course_id": str(course.id) if course else None,
        "course_name": course.name if course else None,
        "department_id": str(department.id) if department else None,
        "department_name": department.name if department else None,
        "students_count": student_count,
        "average_score": round(float(avg_score or 0), 2),
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
    term = payload.get("term")
    raw_score = payload.get("score")

    if not isinstance(term, str) or not term.strip():
        abort(400, description="'term' is required")
    if not isinstance(raw_score, (int, float)):
        abort(400, description="'score' is required and must be numeric")
    if raw_score < 0 or raw_score > 100:
        abort(400, description="'score' must be between 0 and 100")

    trainer_id_value = payload.get("trainer_id")
    if trainer_id_value:
        trainer_id = parse_uuid(trainer_id_value, "trainer_id")
        if trainer_id != trainer.id:
            abort(403, description="You can only upload scores as yourself")

    subject = ensure_subject_access(trainer, subject_id)
    student = ensure_student_enrolled(student_id, subject_id)

    duplicate = (
        db.session.query(Score.id)
        .filter(
            Score.student_id == student_id,
            Score.subject_id == subject_id,
            Score.term == term.strip(),
        )
        .first()
    )
    if duplicate:
        abort(409, description="Score already exists for this student, subject, and term")

    enrollment = resolve_score_enrollment(student, subject)
    score = Score(
        enrollment_id=enrollment.id if enrollment else None,
        student_id=student.id,
        subject_id=subject.id,
        trainer_id=trainer.id,
        term=term.strip(),
        marks_obtained=float(raw_score),
        feedback=(payload.get("feedback") or None),
        is_passed=float(raw_score) >= PASS_MARK,
    )

    db.session.add(score)
    db.session.flush()

    if student.user_id:
        db.session.add(
            Notification(
                user_id=student.user_id,
                title="New Score Available",
                message=f"A new score was recorded for {subject.name} ({score.term}).",
                is_read=False,
            )
        )

        if score.marks_obtained < PASS_MARK:
            db.session.add(
                Notification(
                    user_id=student.user_id,
                    title="At-Risk Performance Alert",
                    message=f"Your {subject.name} score for {score.term} is below the pass mark.",
                    is_read=False,
                )
            )

    db.session.commit()
    db.session.refresh(score)
    return score


def update_feedback(trainer: Trainer, score: Score, feedback: str) -> Score:
    ensure_subject_access(trainer, score.subject_id)
    score.feedback = feedback.strip()
    db.session.commit()
    db.session.refresh(score)
    return score


def trainer_dashboard(trainer: Trainer) -> dict:
    subject_ids = get_trainer_subject_ids(trainer)
    subject_count = len(subject_ids)

    total_students = 0
    if subject_ids:
        total_students = (
            db.session.query(func.count(func.distinct(StudentSubject.student_id)))
            .filter(StudentSubject.subject_id.in_(subject_ids))
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
    if subject_ids:
        recent_scores = (
            db.session.query(Score)
            .filter(
                Score.subject_id.in_(subject_ids),
                Score.trainer_id == trainer.id,
            )
            .order_by(Score.created_at.desc())
            .limit(10)
            .all()
        )

    return {
        "subjects_assigned": subject_count,
        "subjects": [subject_payload(subject) for subject in subjects],
        "total_students": total_students,
        "recent_scores": [score_payload(score) for score in recent_scores],
    }


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

    average_score = round(sum(score.marks_obtained for score in scores) / len(scores), 2) if scores else 0.0
    pass_count = sum(1 for score in scores if (score.is_passed is True or score.marks_obtained >= PASS_MARK))
    fail_count = sum(1 for score in scores if (score.is_passed is False or score.marks_obtained < PASS_MARK))
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
