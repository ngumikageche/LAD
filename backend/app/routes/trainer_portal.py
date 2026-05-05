from __future__ import annotations

import uuid

from flask import Blueprint, g, request
from sqlalchemy import func, or_
from werkzeug.exceptions import HTTPException

from ..extensions import db
from ..models.score import Score
from ..models.student import Student
from ..models.student_subject import StudentSubject
from ..models.subject import Subject
from ..models.trainer_subject import TrainerSubject
from ..models.user import User
from ..services.trainer_portal import (
    at_risk_students,
    ensure_subject_access,
    get_trainer_subject_ids,
    pagination_meta,
    parse_uuid,
    score_payload,
    student_payload,
    subject_payload,
    trainer_dashboard,
    trainer_subject_report,
)
from .permissions import trainer_required


bp = Blueprint("trainer_portal", __name__, url_prefix="/api/v1/trainer")


@bp.errorhandler(ValueError)
def handle_value_error(error: ValueError):
    return {"error": str(error)}, 400


@bp.errorhandler(HTTPException)
def handle_http_exception(error: HTTPException):
    return {"error": error.description}, error.code


@bp.get("/dashboard")
@trainer_required("scores.read")
def get_dashboard():
    return trainer_dashboard(g.current_trainer), 200


@bp.get("/subjects")
@trainer_required("subjects.read")
def list_subjects():
    trainer = g.current_trainer
    query = (
        db.session.query(Subject)
        .join(TrainerSubject, TrainerSubject.subject_id == Subject.id)
        .filter(TrainerSubject.trainer_id == trainer.id)
    )

    subject_id = request.args.get("subject_id")
    if subject_id:
        subject_uuid = parse_uuid(subject_id, "subject_id")
        query = query.filter(Subject.id == subject_uuid)

    subjects = query.order_by(Subject.name.asc()).all()
    return [subject_payload(subject) for subject in subjects], 200


@bp.get("/subjects/<subject_id>")
@trainer_required("subjects.read")
def get_subject(subject_id: str):
    subject = ensure_subject_access(g.current_trainer, parse_uuid(subject_id, "subject_id"))
    return subject_payload(subject), 200


@bp.get("/subjects/<subject_id>/scores")
@trainer_required("scores.read")
def get_subject_scores(subject_id: str):
    trainer = g.current_trainer
    subject_uuid = parse_uuid(subject_id, "subject_id")
    ensure_subject_access(trainer, subject_uuid)

    term = request.args.get("term")
    page = max(int(request.args.get("page", 1)), 1)
    per_page = min(max(int(request.args.get("per_page", 20)), 1), 100)

    query = db.session.query(Score).filter(Score.subject_id == subject_uuid)
    if term:
        query = query.filter(Score.term == term)

    total = query.count()
    items = (
        query.order_by(Score.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )
    summary = trainer_subject_report(trainer, subject_uuid, term)
    summary["scores"] = [score_payload(item) for item in items]
    summary["pagination"] = pagination_meta(page, per_page, total)
    return summary, 200


@bp.get("/students")
@trainer_required("students.read")
def list_students():
    trainer = g.current_trainer
    subject_ids = get_trainer_subject_ids(trainer)
    if not subject_ids:
        return {"items": [], "pagination": pagination_meta(1, 20, 0)}, 200

    subject_id = request.args.get("subject_id")
    if subject_id:
        subject_uuid = parse_uuid(subject_id, "subject_id")
        ensure_subject_access(trainer, subject_uuid)
        subject_ids = [subject_uuid]

    student_id = request.args.get("student_id")
    search = (request.args.get("search") or "").strip().lower()
    page = max(int(request.args.get("page", 1)), 1)
    per_page = min(max(int(request.args.get("per_page", 20)), 1), 100)

    query = (
        db.session.query(Student)
        .join(User, User.id == Student.user_id)
        .join(StudentSubject, StudentSubject.student_id == Student.id)
        .filter(StudentSubject.subject_id.in_(subject_ids))
        .distinct()
    )

    if student_id:
        query = query.filter(Student.id == parse_uuid(student_id, "student_id"))
    if search:
        like = f"%{search}%"
        query = query.filter(
            or_(
                func.lower(User.name).like(like),
                func.lower(User.email).like(like),
                func.lower(Student.registration_number).like(like),
            )
        )

    total = query.count()
    students = (
        query.order_by(Student.created_at.desc(), Student.id.asc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    subject_names_by_student: dict[uuid.UUID, list[str]] = {}
    rows = []
    if students:
        rows = (
            db.session.query(StudentSubject.student_id, Subject.name)
            .join(Subject, Subject.id == StudentSubject.subject_id)
            .filter(
                StudentSubject.student_id.in_([student.id for student in students]),
                StudentSubject.subject_id.in_(subject_ids),
            )
            .all()
        )
    for student_uuid, subject_name in rows:
        subject_names_by_student.setdefault(student_uuid, []).append(subject_name)

    return {
        "items": [
            student_payload(student, subject_names_by_student.get(student.id, []))
            for student in students
        ],
        "pagination": pagination_meta(page, per_page, total),
    }, 200


@bp.get("/students/<student_id>")
@trainer_required("students.read")
def get_student(student_id: str):
    trainer = g.current_trainer
    student_uuid = parse_uuid(student_id, "student_id")
    subject_ids = get_trainer_subject_ids(trainer)

    student = (
        db.session.query(Student)
        .join(StudentSubject, StudentSubject.student_id == Student.id)
        .filter(
            Student.id == student_uuid,
            StudentSubject.subject_id.in_(subject_ids),
        )
        .first()
    )
    if not student:
        return {"error": "Student not found in your assigned subjects"}, 404

    term = request.args.get("term")
    requested_subject = request.args.get("subject_id")
    score_query = db.session.query(Score).filter(
        Score.student_id == student_uuid,
        Score.subject_id.in_(subject_ids),
    )
    if requested_subject:
        requested_subject_uuid = parse_uuid(requested_subject, "subject_id")
        ensure_subject_access(trainer, requested_subject_uuid)
        score_query = score_query.filter(Score.subject_id == requested_subject_uuid)
    if term:
        score_query = score_query.filter(Score.term == term)

    scores = score_query.order_by(Score.created_at.desc()).all()
    return {
        **student_payload(student),
        "scores": [score_payload(score) for score in scores],
    }, 200


@bp.get("/at-risk-students")
@trainer_required("scores.read")
def get_at_risk_students():
    subject_id = request.args.get("subject_id")
    term = request.args.get("term")
    subject_uuid = parse_uuid(subject_id, "subject_id") if subject_id else None
    return at_risk_students(g.current_trainer, subject_uuid, term), 200


@bp.post("/scores")
@trainer_required("scores.create")
def create_score():
    payload = request.get_json(silent=True) or {}
    from ..services.trainer_portal import create_score as svc_create_score
    score = svc_create_score(g.current_trainer, payload)
    return score_payload(score), 201


@bp.get("/reports/<subject_id>")
@trainer_required("scores.read")
def get_subject_report(subject_id: str):
    term = request.args.get("term")
    subject_uuid = parse_uuid(subject_id, "subject_id")
    return trainer_subject_report(g.current_trainer, subject_uuid, term), 200
