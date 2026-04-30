from __future__ import annotations

import uuid
from flask import Blueprint, request
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
from ..models.module import Module
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
    return {
        "id": str(subject.id),
        "module_id": str(subject.module_id),
        "name": subject.name,
        "description": subject.description,
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
    )
    db.session.add(subject)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return {"error": "Subject already exists"}, 409
    return _subject_payload(subject), 201

@bp.get("")
def list_subjects():
    # Check for normal read permission first
    user, error, status = require_permission("subjects.read")
    print(f"[DEBUG] /subjects requested by user: {getattr(user, 'id', None)}, role: {getattr(getattr(user, 'role', None), 'role_name', None)}")
    if error:
        # If denied, allow trainers to view their assigned subjects
        user_trainer, err_tr, st_tr = require_permission("trainer_subjects.read")
        if not err_tr:
            # trainer view: return subjects assigned to this trainer
            from ..models.trainer import Trainer
            from ..models.trainer_subject import TrainerSubject
            trainer = db.session.query(Trainer).filter_by(user_id=user.id).first()
            if not trainer:
                return {"error": "Trainer record not found"}, 404
            subject_ids = db.session.query(TrainerSubject.subject_id).filter_by(trainer_id=trainer.id).all()
            subject_ids = [sid for (sid,) in subject_ids]
            query = db.session.query(Subject).filter(Subject.id.in_(subject_ids)).order_by(Subject.name.asc())
        else:
            # If denied, check for student self-view or assigned-subjects permission
            user, error, status = require_permission("students_view_own_subjects")
            if error:
                user, error, status = require_permission("student_subjects.read")
                if error:
                    return error, status
            # Only allow students to see their allocated subjects
            from ..models.student_subject import StudentSubject
            from ..models.student import Student
            student = db.session.query(Student).filter_by(user_id=user.id).first()
            if not student:
                return {"error": "Student record not found"}, 404
            subject_ids = db.session.query(StudentSubject.subject_id).filter_by(student_id=student.id).all()
            subject_ids = [sid for (sid,) in subject_ids]
            query = db.session.query(Subject).filter(Subject.id.in_(subject_ids)).order_by(Subject.name.asc())
        module_id = request.args.get("module_id")
        if module_id:
            try:
                module_uuid = _parse_uuid(module_id, "module_id")
            except ValueError as exc:
                return {"error": str(exc)}, 400
            query = query.filter(Subject.module_id == module_uuid)
        subjects = query.all()
        log_view(user, "subjects", metadata={"scope": "list_own"})
        return [_subject_payload(subject) for subject in subjects], 200
    # Normal permission: return all subjects
    query = db.session.query(Subject).order_by(Subject.name.asc())
    module_id = request.args.get("module_id")
    if module_id:
        try:
            module_uuid = _parse_uuid(module_id, "module_id")
        except ValueError as exc:
            return {"error": str(exc)}, 400
        query = query.filter(Subject.module_id == module_uuid)
    subjects = query.all()
    log_view(user, "subjects", metadata={"scope": "list"})
    return [_subject_payload(subject) for subject in subjects], 200

@bp.get("/<subject_id>")
def get_subject(subject_id: str):
    user, error, status = require_permission("subjects.read")
    if error:
        return error, status
    try:
        subject_uuid = _parse_uuid(subject_id, "subject_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400
    subject = db.session.get(Subject, subject_uuid)
    if not subject:
        return {"error": "Subject not found"}, 404
    log_view(user, "subjects", entity_id=subject_id, metadata={"scope": "detail"})
    return _subject_payload(subject), 200


@bp.get("/<subject_id>/trainers")
def get_subject_trainers(subject_id: str):
    user, error, status = require_permission("subjects.read")
    if error:
        return error, status
    try:
        subject_uuid = _parse_uuid(subject_id, "subject_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400
    subject = db.session.get(Subject, subject_uuid)
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
    # Allow normal subjects.read, or allow trainer_subjects.read if the trainer is assigned
    user, error, status = require_permission("subjects.read")
    trainer_view = False
    if error:
        user, error, status = require_permission("trainer_subjects.read")
        if error:
            # allow student self-view to get their own subjects' students (will be empty normally)
            user, error, status = require_permission("students_view_own_subjects")
            if error:
                return error, status
        else:
            trainer_view = True
    try:
        subject_uuid = _parse_uuid(subject_id, "subject_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400
    subject = db.session.get(Subject, subject_uuid)
    if not subject:
        return {"error": "Subject not found"}, 404

    # If trainer_view, ensure trainer is assigned to this subject
    if trainer_view:
        trainer = db.session.query(Trainer).filter_by(user_id=user.id).first()
        if not trainer:
            return {"error": "Trainer record not found"}, 404
        assigned = db.session.query(TrainerSubject).filter_by(trainer_id=trainer.id, subject_id=subject.id).first()
        if not assigned:
            return {"error": "Forbidden"}, 403

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
    # Allow normal read permission, or fall back to student self-view permissions
    user, error, status = require_permission("subjects.read")
    student_view = False
    if error:
        user, error, status = require_permission("students_view_own_subjects")
        if error:
            user, error, status = require_permission("student_subjects.read")
            if error:
                return error, status
        student_view = True
    try:
        subject_uuid = _parse_uuid(subject_id, "subject_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400
    subject = db.session.get(Subject, subject_uuid)
    if not subject:
        return {"error": "Subject not found"}, 404

    # Get scores for the subject's parent module by joining Score -> Assessment -> Enrollment
    from ..models.score import Score
    from ..models.enrollment import Enrollment
    from ..models.student import Student
    from ..models.student_subject import StudentSubject

    query = db.session.query(Score).join(Assessment, Score.assessment_id == Assessment.id).join(Enrollment, Score.enrollment_id == Enrollment.id).filter(Assessment.module_id == subject.module_id)
    if student_view:
        # find the student linked to this user
        student = db.session.query(Student).filter_by(user_id=user.id).first()
        if not student:
            return {"error": "Student record not found"}, 404
        # ensure the student is enrolled in this subject
        enrolled = db.session.query(StudentSubject).filter_by(student_id=student.id, subject_id=subject.id).first()
        if not enrolled:
            return {"error": "Forbidden"}, 403
        query = query.filter(Enrollment.student_id == student.id)

    scores = query.order_by(Assessment.recorded_at.desc()).all()

    marks = []
    for s in scores:
        student_name = None
        if s.enrollment and s.enrollment.student and s.enrollment.student.user:
            student_name = s.enrollment.student.user.name
        marks.append({
            "id": str(s.id),
            "subject_id": str(subject_uuid),
            "student_id": str(s.enrollment.student_id) if s.enrollment else None,
            "student_name": student_name,
            "value": s.marks_obtained,
            "recorded_at": (s.assessment.recorded_at.isoformat() if getattr(s.assessment, 'recorded_at', None) else (s.created_at.isoformat() if s.created_at else None)),
            "comment": (s.assessment.competency.name if getattr(s.assessment, 'competency', None) else None)
        })

    log_view(user, "subjects.marks", entity_id=subject_id, metadata={"count": len(marks)})
    return {"marks": marks}, 200

@bp.put("/<subject_id>")
def update_subject(subject_id: str):
    _, error, status = require_permission("subjects.update")
    if error:
        return error, status
    try:
        subject_uuid = _parse_uuid(subject_id, "subject_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400
    subject = db.session.get(Subject, subject_uuid)
    if not subject:
        return {"error": "Subject not found"}, 404
    payload = request.get_json(silent=True) or {}
    name = payload.get("name")
    description = payload.get("description")
    if name is not None:
        if not isinstance(name, str) or not name.strip():
            return {"error": "'name' must be a non-empty string"}, 400
        subject.name = name.strip()
    if description is not None:
        if description and (not isinstance(description, str) or not description.strip()):
            return {"error": "'description' must be a string"}, 400
        subject.description = description.strip() if description else None
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return {"error": "Subject already exists"}, 409
    return _subject_payload(subject), 200

@bp.delete("/<subject_id>")
def delete_subject(subject_id: str):
    _, error, status = require_permission("subjects.delete")
    if error:
        return error, status
    try:
        subject_uuid = _parse_uuid(subject_id, "subject_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400
    subject = db.session.get(Subject, subject_uuid)
    if not subject:
        return {"error": "Subject not found"}, 404
    db.session.delete(subject)
    db.session.commit()
    return {"status": "deleted"}, 200
