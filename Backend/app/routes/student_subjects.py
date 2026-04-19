from __future__ import annotations

import uuid
from flask import Blueprint, request, jsonify
from sqlalchemy.exc import IntegrityError
from sqlalchemy import and_
from ..extensions import db
from ..models.student_subject import StudentSubject
from ..models.student import Student
from ..models.subject import Subject
from ..models.module import Module
from ..models.trainer_subject import TrainerSubject
from ..models.trainer import Trainer
from ..models.user import User
from .permissions import log_view, require_permission

bp = Blueprint('student_subjects', __name__, url_prefix='/student-subjects')


def _parse_uuid(value: str | None, field: str) -> uuid.UUID:
    if not value:
        raise ValueError(f"Missing '{field}'")
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError) as exc:
        raise ValueError(f"Invalid '{field}'") from exc


def _trainer_payload(trainer: Trainer) -> dict:
    """Build trainer info payload"""
    return {
        "id": str(trainer.id),
        "user_id": str(trainer.user_id),
        "name": trainer.user.name if trainer.user else None,
        "email": trainer.user.email if trainer.user else None,
        "specialization": trainer.specialization,
    }


def _subject_with_details_payload(subject: Subject, with_trainers: bool = True) -> dict:
    """Build subject payload with module and optionally trainer details"""
    payload = {
        "id": str(subject.id),
        "name": subject.name,
        "description": subject.description,
        "module": {
            "id": str(subject.module.id),
            "name": subject.module.name,
            "description": subject.module.description,
        } if subject.module else None,
    }
    
    if with_trainers:
        # Get trainers for this subject
        trainer_subjects = db.session.query(TrainerSubject).filter(
            TrainerSubject.subject_id == subject.id
        ).all()
        payload["trainers"] = [_trainer_payload(ts.trainer) for ts in trainer_subjects if ts.trainer]
    
    return payload


@bp.post("")
def enroll_student_subject():
    """Assign a subject to a student"""
    _, error, status = require_permission("student_subjects.create")
    if error:
        return error, status
    
    payload = request.get_json(silent=True) or {}
    student_id = payload.get("student_id")
    subject_id = payload.get("subject_id")
    
    if not student_id or not subject_id:
        return {"error": "Missing 'student_id' or 'subject_id'"}, 400
    
    try:
        student_uuid = _parse_uuid(student_id, "student_id")
        subject_uuid = _parse_uuid(subject_id, "subject_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400
    
    # Verify student exists
    student = db.session.get(Student, student_uuid)
    if not student:
        return {"error": "Student not found"}, 404
    
    # Verify subject exists
    subject = db.session.get(Subject, subject_uuid)
    if not subject:
        return {"error": "Subject not found"}, 404
    
    try:
        ss = StudentSubject(student_id=student_uuid, subject_id=subject_uuid)
        db.session.add(ss)
        db.session.commit()
        return {
            "id": str(ss.id),
            "student_id": str(ss.student_id),
            "subject_id": str(ss.subject_id),
            "message": "Student enrolled in subject"
        }, 201
    except IntegrityError:
        db.session.rollback()
        return {"error": "Student already enrolled in this subject"}, 409
    except Exception as e:
        db.session.rollback()
        return {"error": str(e)}, 500


@bp.get("/<student_id>")
def get_student_subjects(student_id: str):
    """Get all subjects for a student with full details (module, trainers)"""
    _, error, status = require_permission("student_subjects.read")
    if error:
        return error, status
    
    try:
        student_uuid = _parse_uuid(student_id, "student_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400
    
    student = db.session.get(Student, student_uuid)
    if not student:
        return {"error": "Student not found"}, 404
    
    # Get all student-subject enrollments
    enrollments = db.session.query(StudentSubject).filter(
        StudentSubject.student_id == student_uuid
    ).all()
    
    subjects = [_subject_with_details_payload(ss.subject) for ss in enrollments]
    log_view(None, "student_subjects", entity_id=student_id, metadata={"scope": "list"})
    
    return {
        "student_id": str(student_uuid),
        "subjects": subjects,
        "total": len(subjects)
    }, 200


@bp.delete("/<student_id>/<subject_id>")
def unenroll_student_subject(student_id: str, subject_id: str):
    """Remove a subject from a student"""
    _, error, status = require_permission("student_subjects.delete")
    if error:
        return error, status
    
    try:
        student_uuid = _parse_uuid(student_id, "student_id")
        subject_uuid = _parse_uuid(subject_id, "subject_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400
    
    enrollment = db.session.query(StudentSubject).filter(
        and_(
            StudentSubject.student_id == student_uuid,
            StudentSubject.subject_id == subject_uuid
        )
    ).first()
    
    if not enrollment:
        return {"error": "Enrollment not found"}, 404
    
    db.session.delete(enrollment)
    db.session.commit()
    
    return {"status": "deleted"}, 200
