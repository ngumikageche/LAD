from __future__ import annotations

import uuid

from flask import Blueprint, request
from sqlalchemy.exc import IntegrityError

from ..extensions import db
from ..models.course import Course
from ..models.department import Department
from ..models.score import Score
from ..models.student import Student
from ..models.student_subject import StudentSubject
from ..models.subject import Subject
from ..models.trainer import Trainer
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
from .permissions import get_current_user, log_view, require_permission, trainer_required


bp = Blueprint("trainers", __name__, url_prefix="/trainers")


def _parse_uuid(value: str | None, field: str) -> uuid.UUID:
    if not value:
        raise ValueError(f"Missing '{field}'")
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError) as exc:
        raise ValueError(f"Invalid '{field}'") from exc


def _trainer_payload(trainer: Trainer) -> dict:
    return {
        "id": str(trainer.id),
        "user_id": str(trainer.user_id),
        "department_id": str(trainer.department_id),
        "specialization": trainer.specialization,
        "user": {
            "id": str(trainer.user.id),
            "name": trainer.user.name,
            "email": trainer.user.email,
            "phone": trainer.user.phone,
            "role_id": str(trainer.user.role_id),
            "institution_id": str(trainer.user.institution_id) if trainer.user.institution_id else None,
        },
        "created_at": trainer.created_at.isoformat() if trainer.created_at else None,
    }


def _course_payload(course: Course) -> dict:
    return {
        "id": str(course.id),
        "department_id": str(course.department_id),
        "name": course.name,
        "cbet_level": course.cbet_level,
        "created_at": course.created_at.isoformat() if course.created_at else None,
    }


def _student_payload(student: Student) -> dict:
    return {
        "id": str(student.id),
        "user_id": str(student.user_id),
        "registration_number": student.registration_number,
        "course_id": str(student.course_id),
        "enrollment_year": student.enrollment_year,
        "user": {
            "id": str(student.user.id),
            "name": student.user.name,
            "email": student.user.email,
            "phone": student.user.phone,
            "role_id": str(student.user.role_id),
            "institution_id": str(student.user.institution_id) if student.user.institution_id else None,
        },
        "created_at": student.created_at.isoformat() if student.created_at else None,
    }


def _trainer_for_user(user_id: uuid.UUID) -> Trainer | None:
    return db.session.query(Trainer).filter(Trainer.user_id == user_id).first()


@bp.get("/subjects")
@trainer_required()
def list_trainer_subjects():
    trainer = _trainer_for_user(get_current_user()[0].id)
    if not trainer:
        return {"error": "Trainer profile not found"}, 404

    subjects = (
        db.session.query(Subject)
        .join(TrainerSubject, TrainerSubject.subject_id == Subject.id)
        .filter(TrainerSubject.trainer_id == trainer.id)
        .order_by(Subject.name.asc())
        .all()
    )
    return [
        {
            "id": item["id"],
            "subject_name": item["name"],
            "subject_code": item["module_name"] or item["name"][:8].upper(),
            "course_id": item["course_id"],
            "course_name": item["course_name"],
            "department_id": item["department_id"],
            "department_name": item["department_name"],
            "term_id": None,
            "term_name": "Current",
            "students_count": item["students_count"],
            "total_assessments": item["recent_scores_count"],
            "avg_score": item["average_score"],
        }
        for item in (subject_payload(subject) for subject in subjects)
    ], 200


@bp.get("/subjects/<subject_id>")
@trainer_required()
def trainer_subject_detail(subject_id: str):
    trainer = _trainer_for_user(get_current_user()[0].id)
    if not trainer:
        return {"error": "Trainer profile not found"}, 404
    subject = ensure_subject_access(trainer, parse_uuid(subject_id, "subject_id"))
    item = subject_payload(subject)
    return {
        "id": item["id"],
        "subject_name": item["name"],
        "subject_code": item["module_name"] or item["name"][:8].upper(),
        "course_id": item["course_id"],
        "course_name": item["course_name"],
        "department_id": item["department_id"],
        "department_name": item["department_name"],
        "term_id": None,
        "term_name": "Current",
        "students_count": item["students_count"],
        "total_assessments": item["recent_scores_count"],
        "avg_score": item["average_score"],
        "description": item["description"],
    }, 200


@bp.get("/students")
@trainer_required()
def list_trainer_students():
    trainer = _trainer_for_user(get_current_user()[0].id)
    if not trainer:
        return {"error": "Trainer profile not found"}, 404

    subject_ids = get_trainer_subject_ids(trainer)
    if not subject_ids:
        return [], 200

    subject_id = request.args.get("subject_id")
    if subject_id:
        subject_uuid = parse_uuid(subject_id, "subject_id")
        ensure_subject_access(trainer, subject_uuid)
        subject_ids = [subject_uuid]

    students = (
        db.session.query(Student)
        .join(StudentSubject, StudentSubject.student_id == Student.id)
        .filter(StudentSubject.subject_id.in_(subject_ids))
        .distinct()
        .order_by(Student.created_at.desc(), Student.id.asc())
        .all()
    )

    rows = (
        db.session.query(StudentSubject.student_id, Subject.name)
        .join(Subject, Subject.id == StudentSubject.subject_id)
        .filter(
            StudentSubject.student_id.in_([student.id for student in students]),
            StudentSubject.subject_id.in_(subject_ids),
        )
        .all()
    ) if students else []
    subject_names_by_student: dict[uuid.UUID, list[str]] = {}
    for student_uuid, subject_name in rows:
        subject_names_by_student.setdefault(student_uuid, []).append(subject_name)

    response = []
    for student in students:
        related_scores = (
            db.session.query(Score)
            .filter(Score.student_id == student.id, Score.subject_id.in_(subject_ids))
            .all()
        )
        overall_avg = round(sum(item.marks_obtained for item in related_scores) / len(related_scores), 2) if related_scores else 0.0
        response.append(
            {
                "id": str(student.id),
                "name": student.user.name if student.user else None,
                "email": student.user.email if student.user else None,
                "student_id": student.registration_number,
                "enrollment_status": "active",
                "subjects": subject_names_by_student.get(student.id, []),
                "overall_avg": overall_avg,
                "assessments_taken": len(related_scores),
                "subject_averages": {},
            }
        )
    return response, 200


@bp.get("/students/<student_id>")
@trainer_required()
def trainer_student_profile(student_id: str):
    trainer = _trainer_for_user(get_current_user()[0].id)
    if not trainer:
        return {"error": "Trainer profile not found"}, 404

    subject_ids = get_trainer_subject_ids(trainer)
    try:
        student_uuid = parse_uuid(student_id, "student_id")
        student = (
            db.session.query(Student)
            .join(StudentSubject, StudentSubject.student_id == Student.id)
            .filter(Student.id == student_uuid, StudentSubject.subject_id.in_(subject_ids))
            .first()
        )
    except ValueError:
        student = (
            db.session.query(Student)
            .join(StudentSubject, StudentSubject.student_id == Student.id)
            .filter(
                Student.registration_number == student_id,
                StudentSubject.subject_id.in_(subject_ids),
            )
            .first()
        )
    if not student:
        return {"error": "Student not found in your assigned subjects"}, 404

    related_scores = (
        db.session.query(Score)
        .filter(Score.student_id == student.id, Score.subject_id.in_(subject_ids))
        .order_by(Score.created_at.desc())
        .all()
    )
    return {
        "id": str(student.id),
        "name": student.user.name if student.user else None,
        "email": student.user.email if student.user else None,
        "student_id": student.registration_number,
        "enrollment_status": "active",
        "subjects": [],
        "overall_avg": round(sum(item.marks_obtained for item in related_scores) / len(related_scores), 2) if related_scores else 0.0,
        "assessments_taken": len(related_scores),
        "subject_averages": {},
    }, 200


@bp.get("/reports/history")
@trainer_required()
def trainer_report_history():
    trainer = _trainer_for_user(get_current_user()[0].id)
    if not trainer:
        return {"error": "Trainer profile not found"}, 404
    reports = []
    for subject_id in get_trainer_subject_ids(trainer):
        report = trainer_subject_report(trainer, subject_id)
        reports.append(
            {
                "id": report["subject"]["id"],
                "subject_name": report["subject"]["name"],
                "total_students": report["total_students"],
                "avg_score": report["average_score"],
                "pass_rate": report["pass_rate"],
                "generated_date": report["subject"]["created_at"],
            }
        )
    return reports, 200


@bp.post("")
def create_trainer():
    _, error, status = require_permission("trainers.create")
    if error:
        return error, status
    payload = request.get_json(silent=True) or {}

    try:
        user_id = _parse_uuid(payload.get("user_id"), "user_id")
        department_id = _parse_uuid(payload.get("department_id"), "department_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    specialization = payload.get("specialization")
    if specialization is not None and not isinstance(specialization, str):
        return {"error": "'specialization' must be a string"}, 400

    if not db.session.get(User, user_id):
        return {"error": "Invalid 'user_id'"}, 400

    if not db.session.get(Department, department_id):
        return {"error": "Invalid 'department_id'"}, 400

    trainer = Trainer(
        user_id=user_id,
        department_id=department_id,
        specialization=specialization.strip() if isinstance(specialization, str) and specialization.strip() else None,
    )

    db.session.add(trainer)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return {"error": "Trainer already exists"}, 409

    db.session.refresh(trainer)
    return _trainer_payload(trainer), 201


@bp.get("")
def list_trainers():
    user, error, status = require_permission("trainers.read")
    if error:
        return error, status

    query = db.session.query(Trainer).order_by(Trainer.created_at.desc())
    department_id = request.args.get("department_id")
    if department_id:
        try:
            department_uuid = _parse_uuid(department_id, "department_id")
        except ValueError as exc:
            return {"error": str(exc)}, 400
        query = query.filter(Trainer.department_id == department_uuid)

    trainers = query.all()
    log_view(user, "trainers", metadata={"scope": "list"})
    return [_trainer_payload(trainer) for trainer in trainers], 200


@bp.get("/<trainer_id>")
def get_trainer(trainer_id: str):
    user, error, status = require_permission("trainers.read")
    if error:
        return error, status
    try:
        trainer_uuid = _parse_uuid(trainer_id, "trainer_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    trainer = db.session.get(Trainer, trainer_uuid)
    if not trainer:
        return {"error": "Trainer not found"}, 404

    log_view(user, "trainers", entity_id=trainer_id, metadata={"scope": "detail"})
    return _trainer_payload(trainer), 200


@bp.get("/me")
def get_my_trainer():
    user, error, status = require_permission("trainers.read")
    if error:
        return error, status

    trainer = _trainer_for_user(user.id)
    if not trainer:
        return {"error": "Trainer profile not found"}, 404

    log_view(user, "trainers", entity_id=str(trainer.id), metadata={"scope": "self"})
    return _trainer_payload(trainer), 200


@bp.get("/me/courses")
def get_my_courses():
    user, error, status = require_permission("courses.read")
    if error:
        return error, status

    trainer = _trainer_for_user(user.id)
    if not trainer:
        return {"error": "Trainer profile not found"}, 404

    courses = (
        db.session.query(Course)
        .filter(Course.department_id == trainer.department_id)
        .order_by(Course.name.asc())
        .all()
    )

    log_view(user, "courses", metadata={"scope": "trainer"})
    return [_course_payload(course) for course in courses], 200


@bp.get("/me/students")
def get_my_students():
    user, error, status = require_permission("students.read")
    if error:
        return error, status

    trainer = _trainer_for_user(user.id)
    if not trainer:
        return {"error": "Trainer profile not found"}, 404

    course_ids = (
        db.session.query(Course.id)
        .filter(Course.department_id == trainer.department_id)
        .subquery()
    )

    students = (
        db.session.query(Student)
        .filter(Student.course_id.in_(course_ids))
        .order_by(Student.created_at.desc())
        .all()
    )

    log_view(user, "students", metadata={"scope": "trainer"})
    return [_student_payload(student) for student in students], 200


@bp.put("/<trainer_id>")
def update_trainer(trainer_id: str):
    _, error, status = require_permission("trainers.update")
    if error:
        return error, status
    try:
        trainer_uuid = _parse_uuid(trainer_id, "trainer_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    trainer = db.session.get(Trainer, trainer_uuid)
    if not trainer:
        return {"error": "Trainer not found"}, 404

    payload = request.get_json(silent=True) or {}

    specialization = payload.get("specialization")
    if specialization is not None:
        if not isinstance(specialization, str):
            return {"error": "'specialization' must be a string"}, 400
        trainer.specialization = specialization.strip() if specialization.strip() else None

    if "user_id" in payload:
        try:
            user_id = _parse_uuid(payload.get("user_id"), "user_id")
        except ValueError as exc:
            return {"error": str(exc)}, 400
        if not db.session.get(User, user_id):
            return {"error": "Invalid 'user_id'"}, 400
        trainer.user_id = user_id

    if "department_id" in payload:
        try:
            department_id = _parse_uuid(payload.get("department_id"), "department_id")
        except ValueError as exc:
            return {"error": str(exc)}, 400
        if not db.session.get(Department, department_id):
            return {"error": "Invalid 'department_id'"}, 400
        trainer.department_id = department_id

    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return {"error": "Trainer already exists"}, 409

    db.session.refresh(trainer)
    return _trainer_payload(trainer), 200


@bp.delete("/<trainer_id>")
def delete_trainer(trainer_id: str):
    _, error, status = require_permission("trainers.delete")
    if error:
        return error, status
    try:
        trainer_uuid = _parse_uuid(trainer_id, "trainer_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    trainer = db.session.get(Trainer, trainer_uuid)
    if not trainer:
        return {"error": "Trainer not found"}, 404

    db.session.delete(trainer)
    db.session.commit()
    return {"status": "deleted"}, 200
