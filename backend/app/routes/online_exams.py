from __future__ import annotations

import uuid
from datetime import datetime

from flask import Blueprint, g, request
from sqlalchemy import exists
from sqlalchemy.exc import IntegrityError

from ..extensions import db
from ..models.notification import Notification
from ..models.online_exam import OnlineExam, OnlineExamSubmission
from ..models.student import Student
from ..models.student_subject import StudentSubject
from ..models.subject import Subject
from ..models.trainer import Trainer
from ..models.trainer_subject import TrainerSubject
from .permissions import _is_admin, _is_trainer, get_current_user, student_required

bp = Blueprint("online_exams", __name__, url_prefix="/online-exams")


def _parse_uuid(value: str | None, field: str) -> uuid.UUID:
    if not value:
        raise ValueError(f"Missing '{field}'")
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Invalid '{field}'") from exc


def _require_exam_author():
    user, error, status = get_current_user()
    if error:
        return None, None, error, status
    if _is_admin(user):
        return user, None, None, None
    if not _is_trainer(user):
        return None, None, {"error": "Trainer or admin access required"}, 403
    trainer = db.session.query(Trainer).filter(Trainer.user_id == user.id).first()
    if not trainer:
        return None, None, {"error": "Trainer profile not found"}, 404
    return user, trainer, None, None


def _trainer_can_use_subject(trainer_id: uuid.UUID, subject_id: uuid.UUID) -> bool:
    return db.session.query(
        exists().where(
            (TrainerSubject.trainer_id == trainer_id)
            & (TrainerSubject.subject_id == subject_id)
        )
    ).scalar()


def _student_has_subject(student_id: uuid.UUID, subject_id: uuid.UUID) -> bool:
    return db.session.query(
        exists().where(
            (StudentSubject.student_id == student_id)
            & (StudentSubject.subject_id == subject_id)
        )
    ).scalar()


def _normalize_questions(raw_questions) -> list[dict]:
    if not isinstance(raw_questions, list) or len(raw_questions) == 0:
        raise ValueError("At least one question is required")

    questions = []
    for index, raw in enumerate(raw_questions, start=1):
        if not isinstance(raw, dict):
            raise ValueError(f"Question {index} must be an object")
        text = (raw.get("text") or "").strip()
        q_type = (raw.get("type") or "short_answer").strip()
        if q_type not in {"multiple_choice", "short_answer", "essay"}:
            raise ValueError(f"Question {index} has an invalid type")
        try:
            marks = float(raw.get("marks") or 1)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Question {index} marks must be numeric") from exc
        if not text:
            raise ValueError(f"Question {index} text is required")
        if marks <= 0:
            raise ValueError(f"Question {index} marks must be greater than zero")

        options = raw.get("options") or []
        if q_type == "multiple_choice":
            options = [str(option).strip() for option in options if str(option).strip()]
            if len(options) < 2:
                raise ValueError(f"Question {index} needs at least two options")
            correct_answer = str(raw.get("correct_answer") or "").strip()
            if correct_answer and correct_answer not in options:
                raise ValueError(f"Question {index} correct answer must match one option")
        else:
            options = []
            correct_answer = str(raw.get("correct_answer") or "").strip()

        questions.append(
            {
                "id": raw.get("id") or uuid.uuid4().hex,
                "text": text,
                "type": q_type,
                "marks": marks,
                "options": options,
                "correct_answer": correct_answer,
            }
        )

    return questions


def _student_question(question: dict) -> dict:
    return {
        "id": question.get("id"),
        "text": question.get("text"),
        "type": question.get("type"),
        "marks": question.get("marks"),
        "options": question.get("options") or [],
    }


def _exam_payload(exam: OnlineExam, include_answers: bool = True, student_id: uuid.UUID | None = None) -> dict:
    submission = None
    if student_id:
        submission = (
            db.session.query(OnlineExamSubmission)
            .filter(OnlineExamSubmission.exam_id == exam.id, OnlineExamSubmission.student_id == student_id)
            .first()
        )
    return {
        "id": str(exam.id),
        "title": exam.title,
        "description": exam.description,
        "subject_id": str(exam.subject_id),
        "subject_name": exam.subject.name if exam.subject else None,
        "trainer_id": str(exam.trainer_id) if exam.trainer_id else None,
        "status": exam.status,
        "duration_minutes": exam.duration_minutes,
        "auto_marking": exam.auto_marking,
        "total_marks": exam.total_marks,
        "questions": exam.questions if include_answers else [_student_question(q) for q in (exam.questions or [])],
        "published_at": exam.published_at.isoformat() if exam.published_at else None,
        "created_at": exam.created_at.isoformat() if exam.created_at else None,
        "submission": {
            "id": str(submission.id),
            "score": submission.score,
            "max_score": submission.max_score,
            "status": submission.status,
            "submitted_at": submission.submitted_at.isoformat() if submission.submitted_at else None,
        } if submission else None,
    }


def _notify_students_for_exam(exam: OnlineExam) -> int:
    rows = (
        db.session.query(Student.user_id)
        .join(StudentSubject, StudentSubject.student_id == Student.id)
        .filter(StudentSubject.subject_id == exam.subject_id, Student.user_id.isnot(None))
        .all()
    )
    sent = 0
    for row in rows:
        db.session.add(
            Notification(
                user_id=row.user_id,
                title=f"New online exam: {exam.title}",
                message=f"{exam.title} is now available online for {exam.subject.name if exam.subject else 'your subject'}.",
                is_read=False,
            )
        )
        sent += 1
    return sent


@bp.get("")
def list_online_exams():
    user, trainer, error, status = _require_exam_author()
    if error:
        return error, status

    query = db.session.query(OnlineExam).filter(OnlineExam.deleted_at.is_(None))
    if trainer:
        query = query.filter(OnlineExam.trainer_id == trainer.id)
    subject_id = request.args.get("subject_id")
    if subject_id:
        subject_uuid = _parse_uuid(subject_id, "subject_id")
        if trainer and not _trainer_can_use_subject(trainer.id, subject_uuid):
            return {"error": "You are not assigned to that subject"}, 403
        query = query.filter(OnlineExam.subject_id == subject_uuid)
    return [_exam_payload(exam) for exam in query.order_by(OnlineExam.created_at.desc()).all()], 200


@bp.post("")
def create_online_exam():
    user, trainer, error, status = _require_exam_author()
    if error:
        return error, status

    payload = request.get_json(silent=True) or {}
    title = (payload.get("title") or "").strip()
    if not title:
        return {"error": "'title' is required"}, 400
    try:
        subject_id = _parse_uuid(payload.get("subject_id"), "subject_id")
        questions = _normalize_questions(payload.get("questions"))
    except ValueError as exc:
        return {"error": str(exc)}, 400

    subject = db.session.get(Subject, subject_id)
    if not subject or subject.deleted_at:
        return {"error": "Subject not found"}, 404
    if trainer and not _trainer_can_use_subject(trainer.id, subject_id):
        return {"error": "You are not assigned to that subject"}, 403

    status_value = payload.get("status") or "draft"
    if status_value not in {"draft", "published"}:
        return {"error": "status must be draft or published"}, 400

    exam = OnlineExam(
        title=title,
        description=(payload.get("description") or "").strip() or None,
        subject_id=subject_id,
        trainer_id=trainer.id if trainer else None,
        created_by=user.id,
        status=status_value,
        duration_minutes=payload.get("duration_minutes") or None,
        auto_marking=bool(payload.get("auto_marking", True)),
        questions=questions,
        total_marks=sum(float(q.get("marks") or 0) for q in questions),
        published_at=datetime.utcnow() if status_value == "published" else None,
    )
    db.session.add(exam)
    db.session.flush()
    sent = _notify_students_for_exam(exam) if exam.status == "published" else 0
    db.session.commit()
    db.session.refresh(exam)
    return {**_exam_payload(exam), "notifications_sent": sent}, 201


@bp.put("/<exam_id>")
def update_online_exam(exam_id: str):
    user, trainer, error, status = _require_exam_author()
    if error:
        return error, status

    exam = db.session.get(OnlineExam, _parse_uuid(exam_id, "exam_id"))
    if not exam or exam.deleted_at:
        return {"error": "Exam not found"}, 404
    if trainer and exam.trainer_id != trainer.id:
        return {"error": "You can only edit your own exams"}, 403

    payload = request.get_json(silent=True) or {}
    if "title" in payload:
        title = (payload.get("title") or "").strip()
        if not title:
            return {"error": "'title' is required"}, 400
        exam.title = title
    if "description" in payload:
        exam.description = (payload.get("description") or "").strip() or None
    if "duration_minutes" in payload:
        exam.duration_minutes = payload.get("duration_minutes") or None
    if "auto_marking" in payload:
        exam.auto_marking = bool(payload.get("auto_marking"))
    if "questions" in payload:
        try:
            exam.questions = _normalize_questions(payload.get("questions"))
        except ValueError as exc:
            return {"error": str(exc)}, 400
        exam.total_marks = sum(float(q.get("marks") or 0) for q in exam.questions)
    if "status" in payload:
        status_value = payload.get("status")
        if status_value not in {"draft", "published"}:
            return {"error": "status must be draft or published"}, 400
        if exam.status != "published" and status_value == "published":
            exam.published_at = datetime.utcnow()
            exam.status = "published"
            sent = _notify_students_for_exam(exam)
        else:
            exam.status = status_value
            sent = 0
    else:
        sent = 0

    db.session.commit()
    db.session.refresh(exam)
    return {**_exam_payload(exam), "notifications_sent": sent}, 200


@bp.get("/student")
@student_required()
def list_student_online_exams():
    student = g.current_student
    subject_ids = [
        row.subject_id
        for row in db.session.query(StudentSubject.subject_id)
        .filter(StudentSubject.student_id == student.id)
        .all()
    ]
    if not subject_ids:
        return [], 200
    exams = (
        db.session.query(OnlineExam)
        .filter(
            OnlineExam.deleted_at.is_(None),
            OnlineExam.status == "published",
            OnlineExam.subject_id.in_(subject_ids),
        )
        .order_by(OnlineExam.published_at.desc(), OnlineExam.created_at.desc())
        .all()
    )
    return [_exam_payload(exam, include_answers=False, student_id=student.id) for exam in exams], 200


@bp.get("/student/<exam_id>")
@student_required()
def get_student_online_exam(exam_id: str):
    student = g.current_student
    exam = db.session.get(OnlineExam, _parse_uuid(exam_id, "exam_id"))
    if not exam or exam.deleted_at or exam.status != "published":
        return {"error": "Exam not found"}, 404
    if not _student_has_subject(student.id, exam.subject_id):
        return {"error": "Exam is not assigned to you"}, 403
    return _exam_payload(exam, include_answers=False, student_id=student.id), 200


@bp.post("/student/<exam_id>/submit")
@student_required()
def submit_student_online_exam(exam_id: str):
    student = g.current_student
    exam = db.session.get(OnlineExam, _parse_uuid(exam_id, "exam_id"))
    if not exam or exam.deleted_at or exam.status != "published":
        return {"error": "Exam not found"}, 404
    if not _student_has_subject(student.id, exam.subject_id):
        return {"error": "Exam is not assigned to you"}, 403

    payload = request.get_json(silent=True) or {}
    answers = payload.get("answers") or {}
    if not isinstance(answers, dict):
        return {"error": "'answers' must be an object keyed by question id"}, 400

    score = 0.0 if exam.auto_marking else None
    max_score = float(exam.total_marks or 0)
    if exam.auto_marking:
        for question in exam.questions or []:
            if question.get("type") != "multiple_choice":
                continue
            qid = str(question.get("id"))
            if str(answers.get(qid, "")).strip() == str(question.get("correct_answer", "")).strip():
                score += float(question.get("marks") or 0)

    submission = OnlineExamSubmission(
        exam_id=exam.id,
        student_id=student.id,
        answers=answers,
        score=score,
        max_score=max_score,
        status="auto_marked" if exam.auto_marking else "submitted",
        submitted_at=datetime.utcnow(),
    )
    db.session.add(submission)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return {"error": "You have already submitted this exam"}, 409
    db.session.refresh(submission)
    return {
        "id": str(submission.id),
        "score": submission.score,
        "max_score": submission.max_score,
        "status": submission.status,
        "submitted_at": submission.submitted_at.isoformat(),
    }, 201
