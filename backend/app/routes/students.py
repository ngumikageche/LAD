from __future__ import annotations

import uuid
import random
from flask import Blueprint, request
from sqlalchemy.exc import IntegrityError
from sqlalchemy import and_
from ..extensions import db
from ..models.course import Course
from ..models.module import Module
from ..models.student import Student
from ..models.user import User
from ..models.enrollment import Enrollment
from ..models.student_subject import StudentSubject
from ..models.subject import Subject
from ..models.trainer_subject import TrainerSubject
from ..models.trainer import Trainer
from .permissions import log_view, require_permission
from .permissions import get_current_user

bp = Blueprint("students", __name__, url_prefix="/students")

# Enroll or update a student's module assignment
@bp.post("/<student_id>/enroll")
def enroll_student(student_id):
    user, error, status = require_permission("students.update")
    if error:
        return error, status
    payload = request.get_json(silent=True) or {}
    try:
        student_uuid = _parse_uuid(student_id, "student_id")
        module_uuid = _parse_uuid(payload.get("module_id"), "module_id")
        course_uuid = _parse_uuid(payload.get("course_id"), "course_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    student = db.session.get(Student, student_uuid)
    if not student:
        return {"error": "Student not found"}, 404

    course = db.session.get(Course, course_uuid)
    module = db.session.get(Module, module_uuid)
    if not course:
        return {"error": "Course not found"}, 404
    if not module:
        return {"error": "Module not found"}, 404
    if module.course_id != course.id:
        return {"error": "Selected module does not belong to the selected course"}, 400

    # Keep the student profile, current enrollment, and subject links in one
    # transaction. Trainer/student access is derived from StudentSubject, so an
    # enrollment save is incomplete unless those links are synchronized.
    student.course_id = course.id
    enrollment = (
        db.session.query(Enrollment)
        .filter(
            Enrollment.student_id == student.id,
            Enrollment.deleted_at.is_(None),
            Enrollment.status == "active",
        )
        .order_by(Enrollment.updated_at.desc(), Enrollment.created_at.desc())
        .first()
    )
    previous_module_id = enrollment.module_id if enrollment else None
    if enrollment:
        enrollment.module_id = module.id
        enrollment.course_id = course.id
    else:
        enrollment = Enrollment(
            student_id=student.id,
            module_id=module.id,
            course_id=course.id,
            status="active",
        )
        db.session.add(enrollment)

    new_subject_ids = {
        row[0]
        for row in db.session.query(Subject.id).filter(
            Subject.module_id == module.id,
            Subject.deleted_at.is_(None),
        ).all()
    }
    existing_subject_ids = {
        row[0]
        for row in db.session.query(StudentSubject.subject_id).filter(
            StudentSubject.student_id == student.id,
        ).all()
    }
    added_subject_ids = new_subject_ids - existing_subject_ids
    db.session.add_all(
        StudentSubject(student_id=student.id, subject_id=subject_id)
        for subject_id in added_subject_ids
    )

    removed_subject_ids: set[uuid.UUID] = set()
    if previous_module_id and previous_module_id != module.id:
        previous_subject_ids = {
            row[0]
            for row in db.session.query(Subject.id).filter(
                Subject.module_id == previous_module_id,
            ).all()
        }
        removed_subject_ids = previous_subject_ids - new_subject_ids
        if removed_subject_ids:
            db.session.query(StudentSubject).filter(
                StudentSubject.student_id == student.id,
                StudentSubject.subject_id.in_(removed_subject_ids),
            ).delete(synchronize_session=False)

    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return {"error": "Enrollment could not be saved because of conflicting data"}, 409

    return {
        "status": "enrolled",
        "student_id": str(student.id),
        "course_id": str(course.id),
        "module_id": str(module.id),
        "subjects_added": len(added_subject_ids),
        "subjects_removed": len(removed_subject_ids),
    }, 200





def _parse_uuid(value: str | None, field: str) -> uuid.UUID:
    if not value:
        raise ValueError(f"Missing '{field}'")
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError) as exc:
        raise ValueError(f"Invalid '{field}'") from exc


def _generate_registration_number(enrollment_year: int) -> str:
    for _ in range(10):
        suffix = random.randint(1000, 9999)
        candidate = f"REG-{enrollment_year}-{suffix}"
        exists = db.session.query(Student.id).filter(Student.registration_number == candidate).first()
        if not exists:
            return candidate
    raise RuntimeError("Unable to generate unique registration number")


def _student_payload(student: Student) -> dict:
    return {
        "id": str(student.id),
        "code": student.code,
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


@bp.post("")
def create_student():
    _, error, status = require_permission("students.create")
    if error:
        return error, status
    payload = request.get_json(silent=True) or {}

    registration_number = payload.get("registration_number")
    enrollment_year = payload.get("enrollment_year")

    if enrollment_year is None or not isinstance(enrollment_year, int):
        return {"error": "'enrollment_year' is required"}, 400

    if registration_number is None:
        registration_number = _generate_registration_number(enrollment_year)
    elif not isinstance(registration_number, str) or not registration_number.strip():
        return {"error": "'registration_number' must be a non-empty string"}, 400

    try:
        user_id = _parse_uuid(payload.get("user_id"), "user_id")
        course_id = _parse_uuid(payload.get("course_id"), "course_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    if not db.session.get(User, user_id):
        return {"error": "Invalid 'user_id'"}, 400

    if not db.session.get(Course, course_id):
        return {"error": "Invalid 'course_id'"}, 400

    student = Student(
        user_id=user_id,
        registration_number=registration_number.strip(),
        course_id=course_id,
        enrollment_year=enrollment_year,
    )

    db.session.add(student)
    # Keep subject visibility consistent with the selected course even when a
    # student is created outside the module-enrollment workflow.
    db.session.flush()
    course_subject_ids = [row[0] for row in db.session.query(Subject.id).join(Module, Subject.module_id == Module.id).filter(Module.course_id == course_id, Subject.deleted_at.is_(None)).all()]
    db.session.add_all(StudentSubject(student_id=student.id, subject_id=sid) for sid in course_subject_ids)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return {"error": "Student already exists"}, 409

    db.session.refresh(student)
    return _student_payload(student), 201


@bp.get("")
def list_students():
    user, error, status = require_permission("students.read")
    if error:
        return error, status

    query = db.session.query(Student).order_by(Student.created_at.desc())
    course_id = request.args.get("course_id")
    if course_id:
        try:
            course_uuid = _parse_uuid(course_id, "course_id")
        except ValueError as exc:
            return {"error": str(exc)}, 400
        query = query.filter(Student.course_id == course_uuid)

    students = query.all()
    log_view(user, "students", metadata={"scope": "list"})
    return [_student_payload(student) for student in students], 200


@bp.get('/me')
def get_my_student():
    """Return the student record for the currently authenticated user."""
    user, error, status = get_current_user()
    if error:
        return error, status

    # find student with this user_id
    student = db.session.query(Student).filter_by(user_id=user.id).first()
    if not student:
        return {"error": "Student record not found"}, 404

    log_view(user, "students.me", entity_id=str(student.id))
    return _student_payload(student), 200


@bp.get('/me/subjects')
def get_my_subjects():
    """Return subjects the current authenticated student is enrolled in."""
    user, error, status = get_current_user()
    if error:
        return error, status

    student = db.session.query(Student).filter_by(user_id=user.id).first()
    if not student:
        return {"error": "Student record not found"}, 404

    enrollments = db.session.query(StudentSubject).filter(StudentSubject.student_id == student.id).all()
    subjects = [_subject_with_details_payload(ss.subject) for ss in enrollments]
    log_view(user, "students.subjects.me", entity_id=str(student.id), metadata={"count": len(subjects)})
    return {"student_id": str(student.id), "subjects": subjects, "total": len(subjects)}, 200


@bp.get("/<student_id>")
def get_student(student_id: str):
    user, error, status = require_permission("students.read")
    if error:
        return error, status
    try:
        student_uuid = _parse_uuid(student_id, "student_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    student = db.session.get(Student, student_uuid)
    if not student:
        return {"error": "Student not found"}, 404

    log_view(user, "students", entity_id=student_id, metadata={"scope": "detail"})
    return _student_payload(student), 200


@bp.put("/<student_id>")
def update_student(student_id: str):
    _, error, status = require_permission("students.update")
    if error:
        return error, status
    try:
        student_uuid = _parse_uuid(student_id, "student_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    student = db.session.get(Student, student_uuid)
    if not student:
        return {"error": "Student not found"}, 404

    payload = request.get_json(silent=True) or {}

    registration_number = payload.get("registration_number")
    if registration_number is not None:
        if not isinstance(registration_number, str):
            return {"error": "'registration_number' must be a non-empty string"}, 400
        if not registration_number.strip():
            year_value = payload.get("enrollment_year")
            if year_value is None:
                year_value = student.enrollment_year
            if year_value is None:
                return {"error": "'enrollment_year' is required to generate registration number"}, 400
            student.registration_number = _generate_registration_number(int(year_value))
        else:
            student.registration_number = registration_number.strip()

    if "enrollment_year" in payload:
        enrollment_year = payload.get("enrollment_year")
        if enrollment_year is None or not isinstance(enrollment_year, int):
            return {"error": "'enrollment_year' must be an integer"}, 400
        student.enrollment_year = enrollment_year

    if "user_id" in payload:
        try:
            user_id = _parse_uuid(payload.get("user_id"), "user_id")
        except ValueError as exc:
            return {"error": str(exc)}, 400
        if not db.session.get(User, user_id):
            return {"error": "Invalid 'user_id'"}, 400
        student.user_id = user_id

    if "course_id" in payload:
        try:
            course_id = _parse_uuid(payload.get("course_id"), "course_id")
        except ValueError as exc:
            return {"error": str(exc)}, 400
        if not db.session.get(Course, course_id):
            return {"error": "Invalid 'course_id'"}, 400
        previous_course_id = student.course_id
        student.course_id = course_id
        new_subject_ids = {row[0] for row in db.session.query(Subject.id).join(Module, Subject.module_id == Module.id).filter(Module.course_id == course_id, Subject.deleted_at.is_(None)).all()}
        existing_subject_ids = {row[0] for row in db.session.query(StudentSubject.subject_id).filter(StudentSubject.student_id == student.id).all()}
        db.session.add_all(StudentSubject(student_id=student.id, subject_id=sid) for sid in new_subject_ids - existing_subject_ids)
        if previous_course_id and previous_course_id != course_id:
            old_subject_ids = {row[0] for row in db.session.query(Subject.id).join(Module, Subject.module_id == Module.id).filter(Module.course_id == previous_course_id).all()}
            removable = old_subject_ids - new_subject_ids
            if removable:
                db.session.query(StudentSubject).filter(StudentSubject.student_id == student.id, StudentSubject.subject_id.in_(removable)).delete(synchronize_session=False)

    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return {"error": "Student already exists"}, 409

    db.session.refresh(student)
    return _student_payload(student), 200


@bp.delete("/<student_id>")
def delete_student(student_id: str):
    _, error, status = require_permission("students.delete")
    if error:
        return error, status
    try:
        student_uuid = _parse_uuid(student_id, "student_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    student = db.session.get(Student, student_uuid)
    if not student:
        return {"error": "Student not found"}, 404

    db.session.delete(student)
    db.session.commit()
    return {"status": "deleted"}, 200


# ==================== STUDENT SUBJECTS ENDPOINTS ====================

def _trainer_payload(trainer: Trainer) -> dict:
    """Build trainer info payload"""
    return {
        "id": str(trainer.id),
        "user_id": str(trainer.user_id),
        "name": trainer.user.name if trainer.user else None,
        "email": trainer.user.email if trainer.user else None,
        "specialization": trainer.specialization,
    }


def _subject_with_details_payload(subject: Subject) -> dict:
    """Build subject payload with module and trainer details"""
    # Get trainers for this subject
    trainer_subjects = db.session.query(TrainerSubject).filter(
        TrainerSubject.subject_id == subject.id
    ).all()
    
    return {
        "id": str(subject.id),
        "name": subject.name,
        "description": subject.description,
        "module": {
            "id": str(subject.module.id),
            "name": subject.module.name,
            "description": subject.module.description,
        } if subject.module else None,
        "trainers": [_trainer_payload(ts.trainer) for ts in trainer_subjects if ts.trainer],
    }


@bp.get("/<student_id>/subjects")
def get_student_enrolled_subjects(student_id: str):
    """Get all subjects enrolled by a student with full details (module, trainers)
    
    This supports User Story: "As a student, I want to see all subjects I am enrolled in"
    """
    user, error, status = require_permission("students.read")
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
    log_view(user, "students.subjects", entity_id=student_id, metadata={"scope": "list"})
    
    return {
        "student_id": str(student_uuid),
        "subjects": subjects,
        "total": len(subjects)
    }, 200


@bp.post("/<student_id>/subjects/<subject_id>")
def enroll_student_in_subject(student_id: str, subject_id: str):
    """Enroll a student in a subject"""
    _, error, status = require_permission("students.update")
    if error:
        return error, status
    
    try:
        student_uuid = _parse_uuid(student_id, "student_id")
        subject_uuid = _parse_uuid(subject_id, "subject_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400
    
    student = db.session.get(Student, student_uuid)
    if not student:
        return {"error": "Student not found"}, 404
    
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
            "subject": _subject_with_details_payload(subject),
        }, 201
    except IntegrityError:
        db.session.rollback()
        return {"error": "Student already enrolled in this subject"}, 409


@bp.delete("/<student_id>/subjects/<subject_id>")
def unenroll_student_from_subject(student_id: str, subject_id: str):
    """Remove a subject from a student's enrollment"""
    _, error, status = require_permission("students.update")
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
