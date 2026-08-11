from __future__ import annotations

import uuid
from flask import Blueprint, request
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import selectinload
from sqlalchemy.exc import IntegrityError
from ..extensions import db
from ..models.subject import Subject
from ..models.assessment import Assessment
from ..models.trainer_subject import TrainerSubject
from ..models.trainer import Trainer
from ..models.student_subject import StudentSubject
from ..models.student import Student
from ..models.user import User
from flask_cors import cross_origin
from ..models.course import Course
from ..models.module import Module
from ..services.scoping import (
    can_view_master_data,
    is_student,
    percentage,
    scope_subjects,
)
from .permissions import log_view, require_permission

bp = Blueprint("subjects", __name__, url_prefix="/subjects")

def _parse_uuid(value: str | None, field: str) -> uuid.UUID:
    if not value:
        raise ValueError(f"Missing '{field}'")
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError) as exc:
        raise ValueError(f"Invalid '{field}'") from exc

def _subject_payload(subject: Subject) -> dict:
    module = getattr(subject, "module", None)
    course = getattr(module, "course", None)
    department = getattr(course, "department", None)
    return {
        "id": str(subject.id),
        "code": subject.code,
        "module_id": str(subject.module_id),
        "module_name": module.name if module else None,
        "course_id": str(course.id) if course else None,
        "course_name": course.name if course else None,
        "department_id": str(department.id) if department else None,
        "department_name": department.name if department else None,
        "name": subject.name,
        "description": subject.description,
        "syllabus_topics": subject.syllabus_topics if isinstance(subject.syllabus_topics, list) else [],
        "created_at": subject.created_at.isoformat() if subject.created_at else None,
    }

@bp.post("")
def create_subject():
    _, error, status = require_permission("subjects.create")
    if error:
        return error, status
    payload = request.get_json(silent=True) or {}

    name = payload.get("name")
    module_id = payload.get("module_id")
    description = payload.get("description")
    syllabus_topics = payload.get("syllabus_topics") or []
    if not isinstance(syllabus_topics, list):
        return {"error": "'syllabus_topics' must be an array"}, 400
    syllabus_topics = [str(topic).strip() for topic in syllabus_topics if str(topic).strip()]

    if not name or not isinstance(name, str):
        return {"error": "'name' is required"}, 400
    if not module_id or not isinstance(module_id, str):
        return {"error": "'module_id' is required"}, 400
    try:
        module_uuid = _parse_uuid(module_id, "module_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400
    if not db.session.get(Module, module_uuid):
        return {"error": "Invalid 'module_id'"}, 400

    subject = Subject(
        name=name.strip(),
        module_id=module_uuid,
        description=description.strip() if description else None,
        syllabus_topics=syllabus_topics,
    )
    db.session.add(subject)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return {"error": "Subject already exists"}, 409
    return _subject_payload(subject), 201

def _require_subject_reader():
    """
    Any of the four read grants opens this endpoint. Which rows come back is not
    decided here — `scope_subjects` narrows a trainer to the subjects they are
    assigned and a learner to the ones they are enrolled in, so holding the
    broad `subjects.read` key no longer means seeing every subject on the
    system. `data.master` is what lifts that narrowing.
    """
    for key in ("subjects.read", "trainer_subjects.read", "students_view_own_subjects", "student_subjects.read"):
        user, error, status = require_permission(key)
        if not error:
            return user, None, None
    return None, {"error": "Permission denied"}, 403


@bp.get("")
def list_subjects():
    user, error, status = _require_subject_reader()
    if error:
        return error, status

    # The payload walks subject → module → course → department for every row,
    # so without this each subject costs three extra queries.
    query = (
        scope_subjects(db.session.query(Subject), user)
        .options(selectinload(Subject.module).selectinload(Module.course).selectinload(Course.department))
        .order_by(Subject.name.asc())
    )

    module_id = request.args.get("module_id")
    if module_id:
        try:
            module_uuid = _parse_uuid(module_id, "module_id")
        except ValueError as exc:
            return {"error": str(exc)}, 400
        query = query.filter(Subject.module_id == module_uuid)

    subjects = query.all()
    log_view(
        user,
        "subjects",
        metadata={"scope": "list", "master": can_view_master_data(user), "count": len(subjects)},
    )
    return [_subject_payload(subject) for subject in subjects], 200

def _subject_in_scope(user, subject_uuid) -> Subject | None:
    return scope_subjects(db.session.query(Subject), user).filter(Subject.id == subject_uuid).first()


@bp.get("/<subject_id>")
def get_subject(subject_id: str):
    user, error, status = _require_subject_reader()
    if error:
        return error, status
    try:
        subject_uuid = _parse_uuid(subject_id, "subject_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400
    subject = _subject_in_scope(user, subject_uuid)
    if not subject:
        return {"error": "Subject not found"}, 404
    log_view(user, "subjects", entity_id=subject_id, metadata={"scope": "detail"})
    return _subject_payload(subject), 200


@bp.get("/<subject_id>/trainers")
def get_subject_trainers(subject_id: str):
    user, error, status = _require_subject_reader()
    if error:
        return error, status
    try:
        subject_uuid = _parse_uuid(subject_id, "subject_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400
    subject = _subject_in_scope(user, subject_uuid)
    if not subject:
        return {"error": "Subject not found"}, 404

    trainer_subjects = db.session.query(TrainerSubject).filter(TrainerSubject.subject_id == subject_uuid).all()
    trainers = []
    for ts in trainer_subjects:
        if ts.trainer:
            t = ts.trainer
            trainers.append({
                "id": str(t.id),
                "name": t.user.name if getattr(t, 'user', None) else None,
                "email": t.user.email if getattr(t, 'user', None) else None,
            })

    log_view(user, "subjects.trainers", entity_id=subject_id, metadata={"count": len(trainers)})
    return {"trainers": trainers}, 200


@bp.get("/<subject_id>/students")
def get_subject_students(subject_id: str):
    user, error, status = _require_subject_reader()
    if error:
        return error, status
    try:
        subject_uuid = _parse_uuid(subject_id, "subject_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    # `_subject_in_scope` already refuses a subject the trainer is not assigned
    # to, or one outside the caller's institution — no separate check needed.
    subject = _subject_in_scope(user, subject_uuid)
    if not subject:
        return {"error": "Subject not found"}, 404

    # A learner may confirm their own enrolment but not enumerate classmates.
    if is_student(user) and not can_view_master_data(user):
        return {"error": "Permission denied"}, 403

    # fetch student enrollments for this subject
    enrollments = db.session.query(StudentSubject).filter_by(subject_id=subject.id).all()
    students = []
    for en in enrollments:
        s = db.session.get(Student, en.student_id)
        if not s:
            continue
        students.append({
            "id": str(s.id),
            "registration_number": s.registration_number if getattr(s, 'registration_number', None) else None,
            "name": s.user.name if getattr(s, 'user', None) else None,
            "email": s.user.email if getattr(s, 'user', None) else None,
        })

    log_view(user, "subjects.students", entity_id=subject_id, metadata={"count": len(students)})
    return {"students": students, "total": len(students)}, 200


@bp.route("/<subject_id>/marks", methods=["GET", "OPTIONS"])
@cross_origin()
def get_subject_marks(subject_id: str):
    user, error, status = _require_subject_reader()
    if error:
        return error, status
    student_view = is_student(user) and not can_view_master_data(user)
    try:
        subject_uuid = _parse_uuid(subject_id, "subject_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400
    subject = _subject_in_scope(user, subject_uuid)
    if not subject:
        return {"error": "Subject not found"}, 404

    from ..models.enrollment import Enrollment
    from ..models.score import Score
    from ..models.student import Student
    from ..models.student_subject import StudentSubject

    # Scores reach a subject two ways: directly via `Score.subject_id` (how the
    # score form and the bulk-marks upload write them) or indirectly through an
    # assessment on the subject's module (the older enrolment-based path).
    # Inner-joining both tables dropped every directly-linked score, which is
    # why marks that had clearly been uploaded came back as an empty list.
    #
    # The module route is only unambiguous when this subject is the module's
    # only one — otherwise a sibling subject's marks would appear here.
    module_subject_count = db.session.query(func.count(Subject.id)).filter(
        Subject.module_id == subject.module_id,
        Subject.deleted_at.is_(None),
    ).scalar() or 0

    subject_match = Score.subject_id == subject.id
    if module_subject_count == 1:
        subject_match = or_(
            subject_match,
            and_(Score.subject_id.is_(None), Assessment.module_id == subject.module_id),
        )

    query = (
        db.session.query(Score)
        .outerjoin(Assessment, Score.assessment_id == Assessment.id)
        .outerjoin(Enrollment, Score.enrollment_id == Enrollment.id)
        .filter(Score.deleted_at.is_(None), subject_match)
    )

    if student_view:
        student = db.session.query(Student).filter_by(user_id=user.id).first()
        if not student:
            return {"error": "Student record not found"}, 404
        enrolled = db.session.query(StudentSubject).filter_by(student_id=student.id, subject_id=subject.id).first()
        if not enrolled:
            return {"error": "Forbidden"}, 403
        query = query.filter(
            or_(Score.student_id == student.id, Enrollment.student_id == student.id)
        )

    scores = query.order_by(Score.created_at.desc()).all()

    marks = []
    for s in scores:
        student_record = s.student or (s.enrollment.student if s.enrollment else None)
        total_marks = s.assessment.total_marks if s.assessment else None
        marks.append({
            "id": str(s.id),
            "subject_id": str(subject_uuid),
            "student_id": str(student_record.id) if student_record else None,
            "student_name": student_record.user.name if student_record and student_record.user else None,
            "value": s.marks_obtained,
            "total_marks": total_marks,
            "percentage": percentage(s.marks_obtained, total_marks),
            "term": s.term,
            "grade": s.grade,
            "recorded_at": (
                s.assessment.recorded_at
                if getattr(s.assessment, "recorded_at", None)
                else (s.created_at.isoformat() if s.created_at else None)
            ),
            "comment": (s.assessment.competency.name if getattr(s.assessment, "competency", None) else s.feedback),
        })

    log_view(user, "subjects.marks", entity_id=subject_id, metadata={"count": len(marks)})
    return {"marks": marks}, 200

@bp.put("/<subject_id>")
def update_subject(subject_id: str):
    user, error, status = require_permission("subjects.update")
    if error:
        return error, status
    try:
        subject_uuid = _parse_uuid(subject_id, "subject_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400
    subject = _subject_in_scope(user, subject_uuid)
    if not subject:
        return {"error": "Subject not found"}, 404
    payload = request.get_json(silent=True) or {}
    name = payload.get("name")
    description = payload.get("description")
    syllabus_topics = payload.get("syllabus_topics")
    if name is not None:
        if not isinstance(name, str) or not name.strip():
            return {"error": "'name' must be a non-empty string"}, 400
        subject.name = name.strip()
    if description is not None:
        if description and (not isinstance(description, str) or not description.strip()):
            return {"error": "'description' must be a string"}, 400
        subject.description = description.strip() if description else None
    if syllabus_topics is not None:
        if not isinstance(syllabus_topics, list):
            return {"error": "'syllabus_topics' must be an array"}, 400
        subject.syllabus_topics = [str(topic).strip() for topic in syllabus_topics if str(topic).strip()]
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return {"error": "Subject already exists"}, 409
    return _subject_payload(subject), 200

@bp.delete("/<subject_id>")
def delete_subject(subject_id: str):
    user, error, status = require_permission("subjects.delete")
    if error:
        return error, status
    try:
        subject_uuid = _parse_uuid(subject_id, "subject_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400
    subject = _subject_in_scope(user, subject_uuid)
    if not subject:
        return {"error": "Subject not found"}, 404
    db.session.delete(subject)
    db.session.commit()
    return {"status": "deleted"}, 200
