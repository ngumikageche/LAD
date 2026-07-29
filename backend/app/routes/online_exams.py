from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from flask import Blueprint, g, request
from sqlalchemy import exists
from sqlalchemy.exc import IntegrityError

from ..extensions import db
from ..models.notification import Notification
from ..models.document import Document
from ..models.online_exam import OnlineExam, OnlineExamSubmission
from ..models.student import Student
from ..models.student_subject import StudentSubject
from ..models.subject import Subject
from ..models.trainer import Trainer
from ..models.trainer_subject import TrainerSubject
from .permissions import _is_admin, _is_trainer, get_current_user, student_required

bp = Blueprint("online_exams", __name__, url_prefix="/online-exams")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _parse_uuid(value: str | None, field: str) -> uuid.UUID:
    if not value:
        raise ValueError(f"Missing '{field}'")
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Invalid '{field}'") from exc


def _parse_datetime(value, field: str) -> datetime | None:
    if value in (None, ""):
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if parsed.tzinfo is not None:
            parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
        return parsed
    except ValueError as exc:
        raise ValueError(f"Invalid '{field}'") from exc


def _availability_error(exam: OnlineExam) -> str | None:
    now = _utcnow()
    if exam.available_from and now < exam.available_from:
        return "This exam is not open yet"
    if exam.available_until and now > exam.available_until:
        return "This exam has closed"
    return None


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
            if not correct_answer:
                raise ValueError(f"Question {index} requires a correct answer")
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
        "available_from": f"{exam.available_from.isoformat()}Z" if exam.available_from else None,
        "available_until": f"{exam.available_until.isoformat()}Z" if exam.available_until else None,
        "resource_documents": [
            {
                "id": str(document.id),
                "title": document.title,
                "file_url": document.file_url,
                "file_name": document.file_name,
            }
            for document in (
                db.session.query(Document)
                .filter(Document.id.in_([
                    uuid.UUID(str(item))
                    for item in (exam.resource_document_ids or [])
                    if item
                ]))
                .all()
                if exam.resource_document_ids
                else []
            )
        ],
        "created_at": exam.created_at.isoformat() if exam.created_at else None,
        "submission": {
            "id": str(submission.id),
            "score": submission.score,
            "max_score": submission.max_score,
            "status": submission.status,
            "submitted_at": submission.submitted_at.isoformat() if submission.submitted_at else None,
            "started_at": submission.started_at.isoformat() if submission.started_at else None,
            "grader_feedback": submission.grader_feedback,
            "seconds_remaining": (
                max(
                    0,
                    int(
                        (
                            submission.started_at
                            + timedelta(minutes=exam.duration_minutes)
                            - _utcnow()
                        ).total_seconds()
                    ),
                )
                if submission.started_at and exam.duration_minutes and submission.status == "in_progress"
                else None
            ),
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
        available_from = _parse_datetime(payload.get("available_from"), "available_from")
        available_until = _parse_datetime(payload.get("available_until"), "available_until")
    except ValueError as exc:
        return {"error": str(exc)}, 400
    if available_from and available_until and available_until <= available_from:
        return {"error": "available_until must be later than available_from"}, 400

    subject = db.session.get(Subject, subject_id)
    if not subject or subject.deleted_at:
        return {"error": "Subject not found"}, 404
    if trainer and not _trainer_can_use_subject(trainer.id, subject_id):
        return {"error": "You are not assigned to that subject"}, 403
    resource_ids = []
    for raw_id in payload.get("resource_document_ids") or []:
        try:
            document_id = _parse_uuid(raw_id, "resource_document_id")
        except ValueError as exc:
            return {"error": str(exc)}, 400
        document = db.session.get(Document, document_id)
        if not document or document.deleted_at or document.subject_id not in {None, subject_id}:
            return {"error": "A selected resource document is unavailable for this subject"}, 400
        resource_ids.append(str(document_id))

    status_value = payload.get("status") or "draft"
    if status_value not in {"draft", "published"}:
        return {"error": "status must be draft or published"}, 400

    duration_minutes = payload.get("duration_minutes")
    if duration_minutes is not None:
        if not isinstance(duration_minutes, int) or duration_minutes < 1 or duration_minutes > 480:
            return {"error": "duration_minutes must be an integer between 1 and 480"}, 400

    exam = OnlineExam(
        title=title,
        description=(payload.get("description") or "").strip() or None,
        subject_id=subject_id,
        trainer_id=trainer.id if trainer else None,
        created_by=user.id,
        status=status_value,
        duration_minutes=duration_minutes,
        auto_marking=bool(payload.get("auto_marking", True)),
        questions=questions,
        total_marks=sum(float(q.get("marks") or 0) for q in questions),
        published_at=_utcnow() if status_value == "published" else None,
        available_from=available_from,
        available_until=available_until,
        resource_document_ids=resource_ids,
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

    if exam.status == "published" and db.session.query(OnlineExamSubmission).filter_by(exam_id=exam.id).first():
        return {"error": "Published exams with submissions cannot be edited"}, 409

    payload = request.get_json(silent=True) or {}
    if "title" in payload:
        title = (payload.get("title") or "").strip()
        if not title:
            return {"error": "'title' is required"}, 400
        exam.title = title
    if "description" in payload:
        exam.description = (payload.get("description") or "").strip() or None
    if "duration_minutes" in payload:
        duration = payload.get("duration_minutes")
        if duration is not None and (not isinstance(duration, int) or duration < 1 or duration > 480):
            return {"error": "duration_minutes must be an integer between 1 and 480"}, 400
        exam.duration_minutes = duration
    if "auto_marking" in payload:
        exam.auto_marking = bool(payload.get("auto_marking"))
    if "available_from" in payload:
        try:
            exam.available_from = _parse_datetime(payload.get("available_from"), "available_from")
        except ValueError as exc:
            return {"error": str(exc)}, 400
    if "available_until" in payload:
        try:
            exam.available_until = _parse_datetime(payload.get("available_until"), "available_until")
        except ValueError as exc:
            return {"error": str(exc)}, 400
    if exam.available_from and exam.available_until and exam.available_until <= exam.available_from:
        return {"error": "available_until must be later than available_from"}, 400
    if "resource_document_ids" in payload:
        resource_ids = []
        for raw_id in payload.get("resource_document_ids") or []:
            document_id = _parse_uuid(raw_id, "resource_document_id")
            document = db.session.get(Document, document_id)
            if not document or document.deleted_at or document.subject_id not in {None, exam.subject_id}:
                return {"error": "A selected resource document is unavailable for this subject"}, 400
            resource_ids.append(str(document_id))
        exam.resource_document_ids = resource_ids
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
            exam.published_at = _utcnow()
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
    availability_error = _availability_error(exam)
    if availability_error:
        return {"error": availability_error}, 409
    return _exam_payload(exam, include_answers=False, student_id=student.id), 200


@bp.post("/student/<exam_id>/start")
@student_required()
def start_student_online_exam(exam_id: str):
    student = g.current_student
    exam = db.session.get(OnlineExam, _parse_uuid(exam_id, "exam_id"))
    if not exam or exam.deleted_at or exam.status != "published":
        return {"error": "Exam not found"}, 404
    if not _student_has_subject(student.id, exam.subject_id):
        return {"error": "Exam is not assigned to you"}, 403
    availability_error = _availability_error(exam)
    if availability_error:
        return {"error": availability_error}, 409
    submission = db.session.query(OnlineExamSubmission).filter_by(exam_id=exam.id, student_id=student.id).first()
    if submission:
        return _exam_payload(exam, include_answers=False, student_id=student.id), 200
    submission = OnlineExamSubmission(
        exam_id=exam.id,
        student_id=student.id,
        answers={},
        score=None,
        max_score=float(exam.total_marks or 0),
        status="in_progress",
        started_at=_utcnow(),
        submitted_at=_utcnow(),
    )
    db.session.add(submission)
    db.session.commit()
    return _exam_payload(exam, include_answers=False, student_id=student.id), 201


@bp.post("/student/<exam_id>/submit")
@student_required()
def submit_student_online_exam(exam_id: str):
    student = g.current_student
    exam = db.session.get(OnlineExam, _parse_uuid(exam_id, "exam_id"))
    if not exam or exam.deleted_at or exam.status != "published":
        return {"error": "Exam not found"}, 404
    if not _student_has_subject(student.id, exam.subject_id):
        return {"error": "Exam is not assigned to you"}, 403
    availability_error = _availability_error(exam)
    if availability_error:
        return {"error": availability_error}, 409

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
            correct = str(question.get("correct_answer", "")).strip()
            if correct and str(answers.get(qid, "")).strip() == correct:
                score += float(question.get("marks") or 0)

    submission = db.session.query(OnlineExamSubmission).filter_by(exam_id=exam.id, student_id=student.id).first()
    if submission and submission.status != "in_progress":
        return {"error": "You have already submitted this exam"}, 409
    started_at = submission.started_at if submission else _utcnow()
    if exam.duration_minutes and _utcnow() > started_at + timedelta(minutes=exam.duration_minutes):
        return {"error": "The exam duration has expired"}, 409
    has_manual_questions = any(question.get("type") != "multiple_choice" for question in (exam.questions or []))
    if not submission:
        submission = OnlineExamSubmission(exam_id=exam.id, student_id=student.id)
        db.session.add(submission)
    submission.answers = answers
    submission.score = score
    submission.max_score = max_score
    submission.status = "partially_marked" if exam.auto_marking and has_manual_questions else "auto_marked" if exam.auto_marking else "submitted"
    submission.started_at = started_at
    submission.submitted_at = _utcnow()
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


@bp.get("/<exam_id>/submissions")
def list_exam_submissions(exam_id: str):
    user, trainer, error, status = _require_exam_author()
    if error:
        return error, status
    exam = db.session.get(OnlineExam, _parse_uuid(exam_id, "exam_id"))
    if not exam or exam.deleted_at or (trainer and exam.trainer_id != trainer.id):
        return {"error": "Exam not found"}, 404
    submissions = (
        db.session.query(OnlineExamSubmission)
        .filter(OnlineExamSubmission.exam_id == exam.id, OnlineExamSubmission.status != "in_progress")
        .order_by(OnlineExamSubmission.submitted_at.desc())
        .all()
    )
    return [
        {
            "id": str(item.id),
            "student_id": str(item.student_id),
            "student_name": item.student.user.name if item.student and item.student.user else None,
            "answers": item.answers,
            "score": item.score,
            "max_score": item.max_score,
            "status": item.status,
            "grader_feedback": item.grader_feedback,
            "submitted_at": item.submitted_at.isoformat(),
        }
        for item in submissions
    ], 200


@bp.put("/<exam_id>/submissions/<submission_id>/grade")
def grade_exam_submission(exam_id: str, submission_id: str):
    user, trainer, error, status = _require_exam_author()
    if error:
        return error, status
    exam = db.session.get(OnlineExam, _parse_uuid(exam_id, "exam_id"))
    submission = db.session.get(OnlineExamSubmission, _parse_uuid(submission_id, "submission_id"))
    if (
        not exam
        or not submission
        or submission.exam_id != exam.id
        or (trainer and exam.trainer_id != trainer.id)
    ):
        return {"error": "Submission not found"}, 404
    payload = request.get_json(silent=True) or {}
    try:
        score = float(payload.get("score"))
    except (TypeError, ValueError):
        return {"error": "'score' must be numeric"}, 400
    if score < 0 or score > float(exam.total_marks or 0):
        return {"error": f"'score' must be between 0 and {exam.total_marks}"}, 400
    submission.score = score
    submission.status = "manually_marked"
    submission.graded_at = _utcnow()
    submission.graded_by = user.id
    submission.grader_feedback = str(payload.get("feedback") or "").strip() or None
    db.session.commit()
    return {"id": str(submission.id), "score": score, "status": submission.status}, 200
