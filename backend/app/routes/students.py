from __future__ import annotations

import uuid
import random
import secrets
from datetime import date, datetime

from flask import Blueprint, current_app, request, send_file
from sqlalchemy.exc import IntegrityError
from sqlalchemy import and_, func, or_
from werkzeug.security import generate_password_hash
from ..extensions import db
from ..models.course import Course
from ..models.department import Department
from ..models.module import Module
from ..models.role_permission import RolePermission
from ..models.student import Student
from ..models.user import User
from ..models.enrollment import Enrollment
from ..models.student_subject import StudentSubject
from ..models.subject import Subject
from ..models.trainer_subject import TrainerSubject
from ..models.trainer import Trainer
from .permissions import log_view, require_permission
from .permissions import get_current_user
from ..services.bulk_people_import import (
    build_template,
    first_value,
    normalize_lookup,
    read_people_upload,
)

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
    subject_ids = [
        str(row.subject_id)
        for row in db.session.query(StudentSubject.subject_id)
        .filter(StudentSubject.student_id == student.id)
        .all()
    ]
    return {
        "id": str(student.id),
        "code": student.code,
        "user_id": str(student.user_id),
        "registration_number": student.registration_number,
        "course_id": str(student.course_id),
        "enrollment_year": student.enrollment_year,
        "subject_ids": subject_ids,
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


STUDENT_IMPORT_HEADERS = [
    "Registration Number",
    "Name",
    "Email",
    "Mobile",
    "Course Code",
    "Module Code",
    "Admission Date",
]


def _import_enrollment_year(row: dict[str, str]) -> int:
    raw = first_value(
        row,
        "Admission Date",
        "Date Of Admission(dd/MM/yyyy)",
        "Date Of Admission",
        "Enrollment Year",
    )
    if raw:
        for format_value in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y"):
            try:
                return datetime.strptime(raw[:10], format_value).year
            except ValueError:
                continue
    return date.today().year


@bp.get("/import-template")
def student_import_template():
    actor, error, status = require_permission("data.import")
    if error:
        return error, status
    course_query = (
        db.session.query(Course)
        .join(Department, Course.department_id == Department.id)
        .filter(Course.deleted_at.is_(None))
    )
    if actor.institution_id:
        course_query = course_query.filter(Department.institution_id == actor.institution_id)
    courses = course_query.order_by(Course.name.asc()).all()
    module_query = (
        db.session.query(Module)
        .join(Course, Module.course_id == Course.id)
        .join(Department, Course.department_id == Department.id)
        .filter(
            Module.deleted_at.is_(None),
            Course.deleted_at.is_(None),
        )
    )
    if actor.institution_id:
        module_query = module_query.filter(Department.institution_id == actor.institution_id)
    modules = module_query.order_by(Course.name.asc(), Module.name.asc()).all()
    output = build_template(
        STUDENT_IMPORT_HEADERS,
        "Students Template",
        [
            "TVET/2026/001",
            "Amina Example",
            "amina@example.edu",
            "0712345678",
            "CRS001",
            "MOD001",
            "15/01/2026",
        ],
        reference_sheets={
            "Modules": (
                [
                    "Module Code",
                    "Module Name",
                    "Course Code",
                    "Course Name",
                ],
                [
                    [
                        module.code,
                        module.name,
                        module.course.code,
                        module.course.name,
                    ]
                    for module in modules
                ],
            ),
            "Course Codes": (
                [
                    "Course Code",
                    "Course Name",
                    "Institution Name",
                ],
                [
                    [
                        course.code,
                        course.name,
                        course.department.institution.name,
                    ]
                    for course in courses
                ],
            ),
        },
    )
    return send_file(
        output,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        as_attachment=True,
        download_name="studentsTemplate.xlsx",
    )


@bp.post("/bulk-upload")
def bulk_upload_students():
    actor, error, status = require_permission("data.import")
    if error:
        return error, status
    upload = request.files.get("file")
    if not upload or not upload.filename:
        return {"error": "Select a CSV or XLSX learner workbook"}, 400
    try:
        rows = read_people_upload(upload, preferred_sheet="Students Template")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    role = (
        db.session.query(RolePermission)
        .filter(func.lower(RolePermission.role_name) == "student")
        .first()
    )
    if not role:
        return {"error": "Student role is not configured"}, 409

    course_query = db.session.query(Course).join(Department, Course.department_id == Department.id)
    if actor.institution_id:
        course_query = course_query.filter(Department.institution_id == actor.institution_id)
    courses = course_query.filter(Course.deleted_at.is_(None)).all()
    course_map = {
        normalize_lookup(course.code): course
        for course in courses
        if course.code
    }
    module_query = (
        db.session.query(Module)
        .join(Course, Module.course_id == Course.id)
        .join(Department, Course.department_id == Department.id)
        .filter(
            Module.deleted_at.is_(None),
            Course.deleted_at.is_(None),
        )
    )
    if actor.institution_id:
        module_query = module_query.filter(Department.institution_id == actor.institution_id)
    modules = module_query.all()
    module_map = {
        (module.course_id, normalize_lookup(module.code)): module
        for module in modules
        if module.code
    }
    results = []
    created = 0
    duplicates = 0
    failed = 0
    for row_number, row in enumerate(rows, start=2):
        registration_number = first_value(row, "Reg No", "Registration Number")
        name = first_value(row, "Name", "Student Name")
        email = first_value(row, "Email").lower()
        phone = first_value(row, "Mobile", "Phone") or None
        course_code = first_value(row, "Course Code")
        module_code = first_value(row, "Module Code")
        course = course_map.get(normalize_lookup(course_code))
        module = module_map.get((course.id, normalize_lookup(module_code))) if course else None
        if not registration_number or not name or not email or not course_code or not module_code:
            failed += 1
            results.append({
                "row": row_number,
                "status": "failed",
                "registration_number": registration_number,
                "email": email,
                "message": "Reg No, Name, Email, Course Code, and Module Code are required",
            })
            continue
        if "@" not in email:
            failed += 1
            results.append({"row": row_number, "status": "failed", "email": email, "message": "Invalid email address"})
            continue
        if not course:
            failed += 1
            results.append({
                "row": row_number,
                "status": "failed",
                "registration_number": registration_number,
                "email": email,
                "message": f"Course Code not found or unavailable: {course_code}",
            })
            continue
        if not module:
            failed += 1
            results.append({
                "row": row_number,
                "status": "failed",
                "registration_number": registration_number,
                "email": email,
                "message": f"Module Code not found in course {course_code}: {module_code}",
            })
            continue
        existing = (
            db.session.query(Student)
            .join(User, Student.user_id == User.id)
            .filter(
                or_(
                    func.lower(Student.registration_number) == registration_number.lower(),
                    func.lower(User.email) == email,
                )
            )
            .first()
        )
        if existing:
            duplicates += 1
            results.append({
                "row": row_number,
                "status": "duplicate",
                "registration_number": registration_number,
                "email": email,
                "message": "Learner already exists",
            })
            continue

        initial_password = secrets.token_urlsafe(9)
        try:
            with db.session.begin_nested():
                user = User(
                    name=name,
                    email=email,
                    phone=phone,
                    password_hash=generate_password_hash(initial_password),
                    role_id=role.id,
                    institution_id=course.department.institution_id,
                )
                db.session.add(user)
                db.session.flush()
                student = Student(
                    user_id=user.id,
                    registration_number=registration_number,
                    course_id=course.id,
                    enrollment_year=_import_enrollment_year(row),
                )
                db.session.add(student)
                db.session.flush()
                db.session.add(Enrollment(
                    student_id=student.id,
                    course_id=course.id,
                    module_id=module.id,
                    status="active",
                ))
                subject_ids = [
                    item[0]
                    for item in db.session.query(Subject.id)
                    .filter(
                        Subject.module_id == module.id,
                        Subject.deleted_at.is_(None),
                    )
                    .all()
                ]
                db.session.add_all(
                    StudentSubject(student_id=student.id, subject_id=subject_id)
                    for subject_id in subject_ids
                )
                db.session.flush()
            created += 1
            results.append({
                "row": row_number,
                "status": "created",
                "registration_number": registration_number,
                "email": email,
                "initial_password": initial_password,
                "course": course.name,
                "module": module.name,
            })
        except IntegrityError:
            duplicates += 1
            results.append({
                "row": row_number,
                "status": "duplicate",
                "registration_number": registration_number,
                "email": email,
                "message": "Email, mobile, or registration number is already in use",
            })
        except Exception:
            current_app.logger.exception("Learner import failed at row %s", row_number)
            failed += 1
            results.append({
                "row": row_number,
                "status": "failed",
                "registration_number": registration_number,
                "email": email,
                "message": "This row could not be imported",
            })
    db.session.commit()
    return {
        "total_rows": len(rows),
        "created": created,
        "duplicates": duplicates,
        "failed": failed,
        "results": results,
    }, 200


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
