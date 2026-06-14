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
from .permissions import trainer_or_admin_required, trainer_required


bp = Blueprint("trainer_portal", __name__, url_prefix="/api/v1/trainer")


@bp.errorhandler(ValueError)
def handle_value_error(error: ValueError):
    return {"error": str(error)}, 400


@bp.errorhandler(HTTPException)
def handle_http_exception(error: HTTPException):
    return {"error": error.description}, error.code


@bp.get("/courses")
@trainer_required("attendance.read")
def list_assigned_courses():
    """Return courses this trainer is assigned to, for attendance session creation."""
    from ..models.trainer_course import TrainerCourse
    from ..models.course import Course
    rows = (
        db.session.query(Course)
        .join(TrainerCourse, TrainerCourse.course_id == Course.id)
        .filter(TrainerCourse.trainer_id == g.current_trainer.id)
        .order_by(Course.name.asc())
        .all()
    )
    return [{"id": str(c.id), "name": c.name, "cbet_level": c.cbet_level} for c in rows], 200


@bp.get("/assigned-subjects")
@trainer_or_admin_required("attendance.read")
def list_assigned_subjects():
    """Return assigned subjects with module/course context.

    Trainers receive their own subjects. Admins receive all assigned trainer
    subject pairs so they can create a session on behalf of a trainer.
    """
    from ..models.trainer_subject import TrainerSubject
    from ..models.subject import Subject
    from ..models.module import Module
    from ..models.course import Course
    from ..models.trainer import Trainer
    from ..models.user import User

    rows = (
        db.session.query(Subject, Module, Course, Trainer, User, TrainerSubject)
        .join(TrainerSubject, TrainerSubject.subject_id == Subject.id)
        .join(Trainer, Trainer.id == TrainerSubject.trainer_id)
        .join(User, User.id == Trainer.user_id)
        .join(Module, Module.id == Subject.module_id)
        .join(Course, Course.id == Module.course_id)
        .order_by(Subject.name.asc())
    )

    if g.current_trainer:
        rows = rows.filter(TrainerSubject.trainer_id == g.current_trainer.id)
    elif request.args.get("trainer_id"):
        rows = rows.filter(TrainerSubject.trainer_id == parse_uuid(request.args["trainer_id"], "trainer_id"))

    return [
        {
            "id": str(s.id),
            "assignment_id": str(ts.id),
            "name": s.name,
            "trainer_id": str(t.id),
            "trainer_name": u.name,
            "module_id": str(m.id),
            "module_name": m.name,
            "course_id": str(c.id),
            "course_name": c.name,
            "cbet_level": c.cbet_level,
        }
        for s, m, c, t, u, ts in rows.all()
    ], 200


@bp.get("/attendance/sessions")
@trainer_required("attendance.read")
def list_trainer_sessions():
    """All attendance sessions created by this trainer, newest first."""
    from ..models.attendance_session import AttendanceSession
    from ..models.subject import Subject
    sessions = (
        db.session.query(AttendanceSession)
        .filter(AttendanceSession.trainer_id == g.current_trainer.id)
        .order_by(AttendanceSession.started_at.desc())
        .limit(100)
        .all()
    )
    result = []
    for s in sessions:
        subject_name = None
        if s.subject_id:
            subj = db.session.get(Subject, s.subject_id)
            subject_name = subj.name if subj else None
        result.append({
            "id": str(s.id),
            "subject_id": str(s.subject_id) if s.subject_id else None,
            "subject_name": subject_name,
            "session_code": s.session_code,
            "status": s.status,
            "started_at": s.started_at.isoformat(),
            "expires_at": s.expires_at.isoformat(),
            "allowed_radius_meters": s.allowed_radius_meters,
            "total_checkins": len([r for r in s.records if r.status == "success"]),
            "total_submissions": len(s.records),
        })
    return result, 200


@bp.get("/attendance/sessions/<session_id>/records")
@trainer_required("attendance.read")
def get_trainer_session_records(session_id: str):
    """Full attendance records for a session with student details."""
    import uuid as _uuid
    from ..models.attendance_session import AttendanceSession, AttendanceRecord
    from sqlalchemy.orm import joinedload
    session = db.session.query(AttendanceSession).filter_by(
        id=_uuid.UUID(session_id),
        trainer_id=g.current_trainer.id
    ).first()
    if not session:
        return {"error": "Session not found"}, 404
    records = (
        db.session.query(AttendanceRecord)
        .options(joinedload(AttendanceRecord.student).joinedload(Student.user))
        .filter(AttendanceRecord.attendance_session_id == session.id)
        .order_by(AttendanceRecord.checked_in_at.asc())
        .all()
    )
    return {
        "session": {
            "id": str(session.id),
            "session_code": session.session_code,
            "subject_name": session.subject.name if session.subject else None,
            "status": session.status,
            "started_at": session.started_at.isoformat(),
            "expires_at": session.expires_at.isoformat(),
            "allowed_radius_meters": session.allowed_radius_meters,
        },
        "records": [
            {
                "id": str(r.id),
                "student_name": r.student.user.name if r.student and r.student.user else None,
                "registration_number": r.student.registration_number if r.student else None,
                "status": r.status,
                "checked_in_at": r.checked_in_at.isoformat(),
                "distance_from_trainer": r.distance_from_trainer,
            }
            for r in records
        ],
    }, 200


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
    from ..services.score_evidence import allowed_score_evidence, save_score_evidence_files, usable_score_evidence_files

    evidence_files = usable_score_evidence_files(request.files.getlist("exam_copies"))
    if not evidence_files:
        return {"error": "Upload at least one physical exam copy before saving marks"}, 400
    invalid_file = next((file.filename for file in evidence_files if not allowed_score_evidence(file.filename or "")), None)
    if invalid_file:
        return {"error": f"Exam copy file type not allowed: {invalid_file}"}, 400

    if not (request.content_type and request.content_type.startswith("multipart/form-data")):
        return {"error": "Use multipart/form-data and include exam_copies files"}, 400

    payload = {
        "student_id": request.form.get("student_id"),
        "subject_id": request.form.get("subject_id"),
        "term": request.form.get("term"),
        "feedback": request.form.get("feedback") or None,
    }
    try:
        payload["score"] = float(request.form.get("score", ""))
    except (TypeError, ValueError):
        payload["score"] = request.form.get("score")

    from ..services.trainer_portal import create_score as svc_create_score
    score = svc_create_score(g.current_trainer, payload)
    try:
        save_score_evidence_files(
            evidence_files,
            uploaded_by=g.current_user.id,
            trainer_id=g.current_trainer.id,
            score_id=score.id,
            subject_id=score.subject_id,
        )
        db.session.commit()
    except ValueError as exc:
        db.session.rollback()
        return {"error": str(exc)}, 400
    return score_payload(score), 201


@bp.get("/reports/<subject_id>")
@trainer_required("scores.read")
def get_subject_report(subject_id: str):
    term = request.args.get("term")
    subject_uuid = parse_uuid(subject_id, "subject_id")
    return trainer_subject_report(g.current_trainer, subject_uuid, term), 200
