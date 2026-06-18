from __future__ import annotations

import uuid
from datetime import datetime

from flask import Blueprint, request
from sqlalchemy import exists

from ..extensions import db
from ..models.practical_assessment_report import PracticalAssessmentReport
from ..models.enrollment import Enrollment
from ..models.institution import Institution
from ..models.course import Course
from ..models.department import Department
from ..models.student import Student
from ..models.student_subject import StudentSubject
from ..models.subject import Subject
from ..models.term import Term
from ..models.trainer import Trainer
from ..models.trainer_subject import TrainerSubject
from ..models.user import User
from .permissions import get_current_user, _is_admin, _is_student, _is_trainer


bp = Blueprint("practical_assessments", __name__)

_STATIC_CONTEXT_VALUES = {
    "institution_name": "Thika Technical Training Institute",
    "department_name": "Electrical and Electronics Engineering Department",
    "qualification": "Electrical Engineering Level 6",
    "unit_of_competency": "Install Electrical Power Lines",
    "unit_code": "ENG/OS/PO/CR/01/6",
    "period": "January – April 2025",
}


def _parse_uuid(value: str | None, field: str) -> uuid.UUID:
    if not value:
        raise ValueError(f"Missing '{field}'")
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Invalid '{field}'") from exc


def _load_current_user():
    user, error, status = get_current_user()
    if error:
        return None, error, status
    return user, None, None


def _trainer_profile(user: User) -> Trainer | None:
    if user.trainer:
        return user.trainer
    return db.session.query(Trainer).filter(Trainer.user_id == user.id).first()


def _student_profile(user: User) -> Student | None:
    if user.student:
        return user.student
    return db.session.query(Student).filter(Student.user_id == user.id).first()


def _trainer_for_student(student_id: uuid.UUID) -> Trainer | None:
    trainer_ids = [
        row[0]
        for row in (
            db.session.query(Trainer.id)
            .join(TrainerSubject, TrainerSubject.trainer_id == Trainer.id)
            .join(StudentSubject, StudentSubject.subject_id == TrainerSubject.subject_id)
            .filter(StudentSubject.student_id == student_id)
            .distinct()
            .all()
        )
    ]
    if len(trainer_ids) != 1:
        return None
    return db.session.get(Trainer, trainer_ids[0])


def _shared_subject(student_id: uuid.UUID, trainer_id: uuid.UUID) -> Subject | None:
    return (
        db.session.query(Subject)
        .join(StudentSubject, StudentSubject.subject_id == Subject.id)
        .join(TrainerSubject, TrainerSubject.subject_id == Subject.id)
        .filter(StudentSubject.student_id == student_id, TrainerSubject.trainer_id == trainer_id)
        .order_by(Subject.name.asc())
        .first()
    )


def _assessment_period(student: Student) -> str | None:
    term_rows = [
        enrollment.term
        for enrollment in student.enrollments
        if getattr(enrollment, "term", None) is not None
    ]
    term_rows = [term for term in term_rows if term is not None]
    if term_rows:
        term_rows.sort(key=lambda term: term.start_date or datetime.min, reverse=True)
        return term_rows[0].name

    active_term = (
        db.session.query(Term)
        .filter(Term.is_active.is_(True))
        .order_by(Term.start_date.desc())
        .first()
    )
    return active_term.name if active_term else None


def _assessment_context(student: Student, trainer: Trainer) -> dict[str, str | None]:
    institution_name = None
    if student.user and student.user.institution:
        institution_name = student.user.institution.name
    elif student.course and student.course.department and student.course.department.institution:
        institution_name = student.course.department.institution.name
    elif trainer.user and trainer.user.institution:
        institution_name = trainer.user.institution.name
    elif trainer.department and trainer.department.institution:
        institution_name = trainer.department.institution.name

    department_name = None
    if student.course and student.course.department:
        department_name = student.course.department.name
    elif trainer.department:
        department_name = trainer.department.name

    qualification = student.course.name if student.course else None
    subject = _shared_subject(student.id, trainer.id)
    unit_of_competency = subject.name if subject else None
    unit_code = subject.code if subject and subject.code else (subject.module.code if subject and subject.module and subject.module.code else None)
    period = _assessment_period(student)

    return {
        "institution_name": institution_name,
        "department_name": department_name,
        "awarding_body": "TVET Curriculum Development, Assessment and Certification Council (TVET CDACC)",
        "qualification": qualification,
        "unit_of_competency": unit_of_competency,
        "unit_code": unit_code,
        "period": period,
    }


def _display_context_value(report: PracticalAssessmentReport, field: str, context: dict[str, str | None]) -> str | None:
    resolved = context.get(field)
    if resolved:
        return resolved
    stored_value = getattr(report, field)
    if stored_value in (None, "", _STATIC_CONTEXT_VALUES.get(field)):
        return None
    return stored_value


def _seed_context_fields(report: PracticalAssessmentReport, student: Student, trainer: Trainer) -> None:
    context = _assessment_context(student, trainer)
    for field, value in context.items():
        if value:
            setattr(report, field, value)


def _can_trainer_access_student(trainer_id: uuid.UUID, student_id: uuid.UUID) -> bool:
    return db.session.query(
        exists().where(
            (TrainerSubject.trainer_id == trainer_id)
            & (StudentSubject.student_id == student_id)
            & (TrainerSubject.subject_id == StudentSubject.subject_id)
        )
    ).scalar()


def _computed_scores(report: PracticalAssessmentReport) -> tuple[float | None, str | None]:
    scores = [report.task_1_score, report.task_2_score, report.task_3_score, report.task_4_score]
    filled_scores = [score for score in scores if score is not None]
    if not filled_scores:
        return None, "INCOMPLETE"

    total = sum(filled_scores)
    if len(filled_scores) < len(scores):
        return total, "INCOMPLETE"

    if total >= 70:
        return total, "COMPETENT"
    if total >= 50:
        return total, "BORDERLINE"
    return total, "NOT YET COMPETENT"


def _task_rows(report: PracticalAssessmentReport) -> list[dict]:
    rows = []
    for index in range(1, 5):
        description = getattr(report, f"task_{index}_description", None)
        score = getattr(report, f"task_{index}_score", None)
        remark = getattr(report, f"task_{index}_remark", None)
        if description in (None, "") and score is None and remark in (None, ""):
            continue
        rows.append(
            {
                "number": index,
                "description": description,
                "score": score,
                "remark": remark,
            }
        )
    return rows


def _report_payload(report: PracticalAssessmentReport) -> dict:
    total_score, competency_outcome = _computed_scores(report)
    context = _assessment_context(report.student, report.trainer) if report.student and report.trainer else {}
    return {
        "id": str(report.id),
        "student_id": str(report.student_id),
        "trainer_id": str(report.trainer_id),
        "student_name": report.student.user.name if report.student and report.student.user else None,
        "student_registration_number": report.student.registration_number if report.student else None,
        "trainer_name": report.trainer.user.name if report.trainer and report.trainer.user else None,
        "institution_name": _display_context_value(report, "institution_name", context),
        "department_name": _display_context_value(report, "department_name", context),
        "awarding_body": context.get("awarding_body") or report.awarding_body,
        "qualification": _display_context_value(report, "qualification", context),
        "unit_of_competency": _display_context_value(report, "unit_of_competency", context),
        "unit_code": _display_context_value(report, "unit_code", context),
        "period": _display_context_value(report, "period", context),
        "assessment_date": report.assessment_date.isoformat() if report.assessment_date else None,
        "task_items": _task_rows(report),
        "task_1_description": report.task_1_description,
        "task_2_description": report.task_2_description,
        "task_3_description": report.task_3_description,
        "task_4_description": report.task_4_description,
        "task_1_score": report.task_1_score,
        "task_2_score": report.task_2_score,
        "task_3_score": report.task_3_score,
        "task_4_score": report.task_4_score,
        "task_1_remark": report.task_1_remark,
        "task_2_remark": report.task_2_remark,
        "task_3_remark": report.task_3_remark,
        "task_4_remark": report.task_4_remark,
        "total_score": total_score,
        "competency_outcome": competency_outcome,
        "released_at": report.released_at.isoformat() if report.released_at else None,
        "released_by_user_id": str(report.released_by_user_id) if report.released_by_user_id else None,
        "released_by_name": report.released_by.name if report.released_by else None,
        "status": report.status,
        "created_at": report.created_at.isoformat() if report.created_at else None,
        "updated_at": report.updated_at.isoformat() if report.updated_at else None,
    }


def _apply_payload(report: PracticalAssessmentReport, payload: dict) -> PracticalAssessmentReport:
    for field in (
        "assessment_date",
        "task_1_description",
        "task_2_description",
        "task_3_description",
        "task_4_description",
        "task_1_score",
        "task_2_score",
        "task_3_score",
        "task_4_score",
        "task_1_remark",
        "task_2_remark",
        "task_3_remark",
        "task_4_remark",
        "status",
    ):
        if field in payload:
            value = payload.get(field)
            if field == "assessment_date":
                if value in (None, ""):
                    continue
                try:
                    setattr(report, field, datetime.fromisoformat(str(value)))
                except ValueError as exc:
                    raise ValueError("Invalid 'assessment_date'") from exc
            else:
                setattr(report, field, value)
    return report


def _validate_score_fields(payload: dict) -> None:
    for field in ("task_1_score", "task_2_score", "task_3_score", "task_4_score"):
        if field not in payload:
            continue
        value = payload.get(field)
        if value in (None, ""):
            continue
        try:
            score = float(value)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Invalid '{field}'") from exc
        if score < 0 or score > PracticalAssessmentReport.MAX_TASK_SCORE:
            raise ValueError(f"'{field}' must be between 0 and {PracticalAssessmentReport.MAX_TASK_SCORE}")


def _validate_task_descriptions(payload: dict) -> None:
    for field in ("task_1_description", "task_2_description", "task_3_description", "task_4_description"):
        if field not in payload:
            continue
        value = payload.get(field)
        if value in (None, ""):
            continue
        if not isinstance(value, str):
            raise ValueError(f"'{field}' must be a string")


@bp.get("/practical-assessments")
def list_practical_assessments():
    user, error, status = _load_current_user()
    if error:
        return error, status

    student_id = request.args.get("student_id")
    status_filter = request.args.get("status")

    query = db.session.query(PracticalAssessmentReport).filter(PracticalAssessmentReport.deleted_at.is_(None))

    if _is_student(user):
        student = _student_profile(user)
        if not student:
            return {"error": "Student profile not found"}, 404
        query = query.filter(PracticalAssessmentReport.student_id == student.id)
    elif _is_trainer(user):
        trainer = _trainer_profile(user)
        if not trainer:
            return {"error": "Trainer profile not found"}, 404
        if student_id:
            try:
                student_uuid = _parse_uuid(student_id, "student_id")
            except ValueError as exc:
                return {"error": str(exc)}, 400
            if not _can_trainer_access_student(trainer.id, student_uuid):
                return {"error": "Student not found in your assigned subjects"}, 403
            query = query.filter(PracticalAssessmentReport.student_id == student_uuid)
        else:
            query = query.filter(
                exists().where(
                    (TrainerSubject.trainer_id == trainer.id)
                    & (StudentSubject.student_id == PracticalAssessmentReport.student_id)
                    & (TrainerSubject.subject_id == StudentSubject.subject_id)
                )
            )
    elif _is_admin(user):
        if student_id:
            try:
                query = query.filter(PracticalAssessmentReport.student_id == _parse_uuid(student_id, "student_id"))
            except ValueError as exc:
                return {"error": str(exc)}, 400
    else:
        return {"error": "Access denied"}, 403

    if status_filter:
        query = query.filter(PracticalAssessmentReport.status == status_filter)

    reports = query.order_by(PracticalAssessmentReport.created_at.desc()).all()
    return [_report_payload(report) for report in reports], 200


@bp.get("/practical-assessments/<report_id>")
def get_practical_assessment(report_id: str):
    user, error, status = _load_current_user()
    if error:
        return error, status

    try:
        report_uuid = _parse_uuid(report_id, "report_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    report = db.session.get(PracticalAssessmentReport, report_uuid)
    if not report or report.deleted_at:
        return {"error": "Report not found"}, 404

    if _is_student(user):
        student = _student_profile(user)
        if not student or report.student_id != student.id:
            return {"error": "Access denied"}, 403
    elif _is_trainer(user):
        trainer = _trainer_profile(user)
        if not trainer or report.trainer_id != trainer.id:
            return {"error": "Access denied"}, 403
    elif not _is_admin(user):
        return {"error": "Access denied"}, 403

    return _report_payload(report), 200


@bp.get("/students/<student_id>/practical-assessments")
def list_student_practical_assessments(student_id: str):
    user, error, status = _load_current_user()
    if error:
        return error, status

    try:
        student_uuid = _parse_uuid(student_id, "student_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    student = db.session.get(Student, student_uuid)
    if not student or student.deleted_at:
        return {"error": "Student not found"}, 404

    if _is_student(user):
        current_student = _student_profile(user)
        if not current_student or current_student.id != student_uuid:
            return {"error": "Access denied"}, 403
    elif _is_trainer(user):
        trainer = _trainer_profile(user)
        if not trainer or not _can_trainer_access_student(trainer.id, student_uuid):
            return {"error": "Student not found in your assigned subjects"}, 403
    elif not _is_admin(user):
        return {"error": "Access denied"}, 403

    reports = (
        db.session.query(PracticalAssessmentReport)
        .filter(
            PracticalAssessmentReport.student_id == student_uuid,
            PracticalAssessmentReport.deleted_at.is_(None),
        )
        .order_by(PracticalAssessmentReport.created_at.desc())
        .all()
    )
    return [_report_payload(report) for report in reports], 200


@bp.get("/students/<student_id>/practical-assessments/<report_id>")
def get_student_practical_assessment(student_id: str, report_id: str):
    user, error, status = _load_current_user()
    if error:
        return error, status

    try:
        student_uuid = _parse_uuid(student_id, "student_id")
        report_uuid = _parse_uuid(report_id, "report_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    report = db.session.get(PracticalAssessmentReport, report_uuid)
    if not report or report.deleted_at or report.student_id != student_uuid:
        return {"error": "Report not found"}, 404

    if _is_student(user):
        current_student = _student_profile(user)
        if not current_student or current_student.id != student_uuid:
            return {"error": "Access denied"}, 403
    elif _is_trainer(user):
        trainer = _trainer_profile(user)
        if not trainer or not _can_trainer_access_student(trainer.id, student_uuid):
            return {"error": "Access denied"}, 403
    elif not _is_admin(user):
        return {"error": "Access denied"}, 403

    return _report_payload(report), 200


@bp.post("/practical-assessments")
def create_practical_assessment():
    user, error, status = _load_current_user()
    if error:
        return error, status

    if not (_is_admin(user) or _is_trainer(user)):
        return {"error": "Trainer or admin access required"}, 403

    payload = request.get_json(silent=True) or {}
    try:
        student_uuid = _parse_uuid(payload.get("student_id"), "student_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    student = db.session.get(Student, student_uuid)
    if not student or student.deleted_at:
        return {"error": "Student not found"}, 404

    trainer = _trainer_profile(user)
    if _is_trainer(user):
        if not trainer:
            return {"error": "Trainer profile not found"}, 404
        if not _can_trainer_access_student(trainer.id, student_uuid):
            return {"error": "Student not found in your assigned subjects"}, 403
    elif _is_admin(user):
        trainer_uuid = payload.get("trainer_id")
        if trainer_uuid:
            try:
                trainer_id = _parse_uuid(trainer_uuid, "trainer_id")
            except ValueError as exc:
                return {"error": str(exc)}, 400
            trainer = db.session.get(Trainer, trainer_id)
            if not trainer:
                return {"error": "Trainer not found"}, 404
        else:
            trainer = _trainer_for_student(student_uuid)
            if not trainer:
                return {
                    "error": "trainer_id is required when the student is linked to multiple trainers"
                }, 400

    if trainer and not _can_trainer_access_student(trainer.id, student_uuid):
        return {"error": "Trainer is not assigned to this student"}, 403

    try:
        _validate_task_descriptions(payload)
        _validate_score_fields(payload)
    except ValueError as exc:
        return {"error": str(exc)}, 400

    report = PracticalAssessmentReport(
        student_id=student_uuid,
        trainer_id=trainer.id if trainer else None,
    )
    if report.trainer_id is None and _is_admin(user):
        trainer_id = payload.get("trainer_id")
        if trainer_id:
            try:
                trainer_uuid = _parse_uuid(trainer_id, "trainer_id")
            except ValueError as exc:
                return {"error": str(exc)}, 400
            report.trainer_id = trainer_uuid
        elif trainer:
            report.trainer_id = trainer.id
        else:
            return {"error": "trainer_id is required for admin-created reports"}, 400

    if trainer:
        _seed_context_fields(report, student, trainer)

    try:
        _apply_payload(report, payload)
    except ValueError as exc:
        return {"error": str(exc)}, 400
    db.session.add(report)
    db.session.commit()
    db.session.refresh(report)
    return _report_payload(report), 201


@bp.put("/practical-assessments/<report_id>")
def update_practical_assessment(report_id: str):
    user, error, status = _load_current_user()
    if error:
        return error, status

    if not (_is_admin(user) or _is_trainer(user)):
        return {"error": "Trainer or admin access required"}, 403

    try:
        report_uuid = _parse_uuid(report_id, "report_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    report = db.session.get(PracticalAssessmentReport, report_uuid)
    if not report or report.deleted_at:
        return {"error": "Report not found"}, 404

    if _is_trainer(user):
        trainer = _trainer_profile(user)
        if not trainer or report.trainer_id != trainer.id:
            return {"error": "Access denied"}, 403

    payload = request.get_json(silent=True) or {}
    try:
        _validate_task_descriptions(payload)
        _validate_score_fields(payload)
    except ValueError as exc:
        return {"error": str(exc)}, 400
    try:
        _apply_payload(report, payload)
    except ValueError as exc:
        return {"error": str(exc)}, 400
    if report.student and report.trainer:
        _seed_context_fields(report, report.student, report.trainer)
    db.session.commit()
    db.session.refresh(report)
    return _report_payload(report), 200


@bp.post("/practical-assessments/<report_id>/release")
def release_practical_assessment(report_id: str):
    user, error, status = _load_current_user()
    if error:
        return error, status

    if not (_is_admin(user) or _is_trainer(user)):
        return {"error": "Trainer or admin access required"}, 403

    try:
        report_uuid = _parse_uuid(report_id, "report_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    report = db.session.get(PracticalAssessmentReport, report_uuid)
    if not report or report.deleted_at:
        return {"error": "Report not found"}, 404

    if _is_trainer(user):
        trainer = _trainer_profile(user)
        if not trainer or report.trainer_id != trainer.id:
            return {"error": "Access denied"}, 403

    report.status = "released"
    report.released_at = datetime.utcnow()
    report.released_by_user_id = user.id
    db.session.commit()
    db.session.refresh(report)
    return _report_payload(report), 200


@bp.post("/practical-assessments/<report_id>/unsend")
@bp.post("/practical-assessments/<report_id>/unrelease")
def unsend_practical_assessment(report_id: str):
    user, error, status = _load_current_user()
    if error:
        return error, status

    if not (_is_admin(user) or _is_trainer(user)):
        return {"error": "Trainer or admin access required"}, 403

    try:
        report_uuid = _parse_uuid(report_id, "report_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    report = db.session.get(PracticalAssessmentReport, report_uuid)
    if not report or report.deleted_at:
        return {"error": "Report not found"}, 404

    if _is_trainer(user):
        trainer = _trainer_profile(user)
        if not trainer or report.trainer_id != trainer.id:
            return {"error": "Access denied"}, 403

    report.status = "draft"
    report.released_at = None
    report.released_by_user_id = None
    db.session.commit()
    db.session.refresh(report)
    return _report_payload(report), 200


@bp.delete("/practical-assessments/<report_id>")
def delete_practical_assessment(report_id: str):
    user, error, status = _load_current_user()
    if error:
        return error, status

    if not (_is_admin(user) or _is_trainer(user)):
        return {"error": "Trainer or admin access required"}, 403

    try:
        report_uuid = _parse_uuid(report_id, "report_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    report = db.session.get(PracticalAssessmentReport, report_uuid)
    if not report or report.deleted_at:
        return {"error": "Report not found"}, 404

    if _is_trainer(user):
        trainer = _trainer_profile(user)
        if not trainer or report.trainer_id != trainer.id:
            return {"error": "Access denied"}, 403

    report.soft_delete()
    db.session.commit()
    return {"status": "deleted"}, 200
