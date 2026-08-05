from __future__ import annotations

import os
import uuid
from copy import deepcopy
import hashlib
import hmac
import json
import mimetypes
import time
from datetime import datetime

from flask import Blueprint, current_app, has_request_context, request, send_from_directory, url_for
from sqlalchemy import exists
from werkzeug.utils import secure_filename

from ..extensions import db
from ..models.practical_assessment_report import PracticalAssessmentReport
from ..models.enrollment import Enrollment
from ..models.institution import Institution
from ..models.notification import Notification
from ..models.course import Course
from ..models.department import Department
from ..models.student import Student
from ..models.student_subject import StudentSubject
from ..models.subject import Subject
from ..models.term import Term
from ..models.trainer import Trainer
from ..models.trainer_subject import TrainerSubject
from ..models.user import User
from .permissions import get_current_user, _has_permission, _is_admin, _is_student, _is_trainer


bp = Blueprint("practical_assessments", __name__)

PRACTICAL_MEDIA_UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "practical_assessments")
PRACTICAL_MEDIA_ALLOWED_EXTENSIONS = {
    "png", "jpg", "jpeg", "gif", "webp", "bmp", "heic", "heif",
    "mp4", "mov", "avi", "mkv", "webm", "mpeg", "mpg", "m4v",
    "mp3", "wav", "ogg", "oga", "m4a", "aac", "flac",
    "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "rtf",
}
PRACTICAL_MEDIA_MAX_BYTES = 25 * 1024 * 1024
PRACTICAL_PREVIEW_TTL_SECONDS = 5 * 60

DEFAULT_AWARDING_BODY = "TVET Curriculum Development, Assessment and Certification Council (TVET CDACC)"

# Sample values that older reports were seeded with before the assessment
# context was resolved from the database. They are never shown: a report falls
# back to the live institution, department, course and subject records instead.
_STATIC_CONTEXT_VALUES = {
    "institution_name": {"Thika Technical Training Institute"},
    "department_name": {"Electrical and Electronics Engineering Department"},
    "awarding_body": {"Thika Technical Training Institute"},
    "qualification": {"Electrical Engineering Level 6"},
    "unit_of_competency": {"Install Electrical Power Lines"},
    "unit_code": {"ENG/OS/PO/CR/01/6"},
    "period": {"January – April 2025", "January - April 2025"},
}

# Context keys that map to a column on the report and can therefore be seeded.
_CONTEXT_COLUMN_FIELDS = (
    "institution_name",
    "department_name",
    "awarding_body",
    "qualification",
    "unit_of_competency",
    "unit_code",
    "period",
)


PRACTICAL_MANAGE_PERMISSION = "practical.assessments.manage"


def _can_manage_practical(user: User) -> bool:
    """
    Who may author and administer practical assessment records: admins,
    trainers, and any other role explicitly granted the manage right from the
    Roles page (a quality manager or HOD, for example).
    """
    return (
        _is_admin(user)
        or _is_trainer(user)
        or _has_permission(user, PRACTICAL_MANAGE_PERMISSION)
    )


def _parse_uuid(value: str | None, field: str) -> uuid.UUID:
    if not value:
        raise ValueError(f"Missing '{field}'")
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Invalid '{field}'") from exc


def _allowed_media_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in PRACTICAL_MEDIA_ALLOWED_EXTENSIONS


def _media_kind(filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext in {"mp3", "wav", "ogg", "oga", "m4a", "aac", "flac"}:
        return "audio"
    if ext in {"mp4", "mov", "avi", "mkv", "webm", "mpeg", "mpg", "m4v"}:
        return "video"
    if ext in {"pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "rtf"}:
        return "document"
    return "image"


def _preview_signature(filename: str, expires: int) -> str:
    secret = str(current_app.config["SECRET_KEY"]).encode("utf-8")
    message = f"{filename}:{expires}".encode("utf-8")
    return hmac.new(secret, message, hashlib.sha256).hexdigest()


def _valid_preview_signature(filename: str) -> bool:
    try:
        expires = int(request.args.get("expires", "0"))
    except ValueError:
        return False
    supplied = request.args.get("signature", "")
    if not supplied or expires < int(time.time()):
        return False
    return hmac.compare_digest(supplied, _preview_signature(filename, expires))


def _can_access_report(user: User, report: PracticalAssessmentReport) -> bool:
    if _is_admin(user):
        return True
    if _is_trainer(user):
        trainer = _trainer_profile(user)
        return bool(trainer and report.trainer_id == trainer.id)
    if _is_student(user):
        student = _student_profile(user)
        return bool(
            student
            and report.student_id == student.id
            and report.status == "released"
            and report.released_at is not None
        )
    return False


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


def _fallback_institution() -> Institution | None:
    """
    Last resort when neither the candidate nor the assessor is linked to an
    institution: a single-institution deployment can only mean that one. With
    several on record we would be guessing, so we show nothing instead.
    """
    institutions = (
        db.session.query(Institution)
        .filter(Institution.deleted_at.is_(None))
        .limit(2)
        .all()
    )
    return institutions[0] if len(institutions) == 1 else None


def _resolve_institution(student: Student, trainer: Trainer) -> Institution | None:
    """The institution this assessment belongs to, always read from the DB."""
    if student.user and student.user.institution:
        return student.user.institution
    if student.course and student.course.department and student.course.department.institution:
        return student.course.department.institution
    if trainer.user and trainer.user.institution:
        return trainer.user.institution
    if trainer.department and trainer.department.institution:
        return trainer.department.institution

    if has_request_context():
        current_user, error, _ = get_current_user()
        if not error and current_user is not None and current_user.institution:
            return current_user.institution

    return _fallback_institution()


def _assessment_context(student: Student, trainer: Trainer) -> dict[str, str | None]:
    institution = _resolve_institution(student, trainer)
    institution_name = institution.name if institution else None

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
        "institution_location": institution.location if institution else None,
        "department_name": department_name,
        "awarding_body": DEFAULT_AWARDING_BODY,
        "qualification": qualification,
        "unit_of_competency": unit_of_competency,
        "unit_code": unit_code,
        "period": period,
    }


def _stored_context_value(report: PracticalAssessmentReport, field: str) -> str | None:
    """The value saved on the report, ignoring the legacy sample values."""
    stored_value = (getattr(report, field, None) or "").strip()
    if not stored_value or stored_value in _STATIC_CONTEXT_VALUES.get(field, ()):
        return None
    return stored_value


def _display_context_value(report: PracticalAssessmentReport, field: str, context: dict[str, str | None]) -> str | None:
    resolved = context.get(field)
    if resolved:
        return resolved
    return _stored_context_value(report, field)


def _seed_context_fields(report: PracticalAssessmentReport, student: Student, trainer: Trainer) -> None:
    context = _assessment_context(student, trainer)
    for field in _CONTEXT_COLUMN_FIELDS:
        value = context.get(field)
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
    if isinstance(report.report_sections, list) and report.report_sections:
        scores: list[float] = []
        total_max = 0.0
        total_items = 0
        for section in report.report_sections:
            if not isinstance(section, dict):
                continue
            for item in section.get("items") or []:
                if not isinstance(item, dict):
                    continue
                total_items += 1
                total_max += float(item.get("max_score") or PracticalAssessmentReport.MAX_TASK_SCORE)
                if item.get("score") is not None:
                    scores.append(float(item.get("score")))
        if not scores:
            return None, "INCOMPLETE"
        total = sum(scores)
        if len(scores) < total_items or total_max <= 0:
            return total, "INCOMPLETE"
        percentage = (total / total_max) * 100
        return total, PracticalAssessmentReport.rating_for(percentage)

    if isinstance(report.task_items, list) and report.task_items:
        filled_scores = [float(item.get("score")) for item in report.task_items if item.get("score") is not None]
        if not filled_scores:
            return None, "INCOMPLETE"

        total = sum(filled_scores)
        total_max = sum(float(item.get("max_score") or PracticalAssessmentReport.MAX_TASK_SCORE) for item in report.task_items)
        if len(filled_scores) < len(report.task_items) or total_max <= 0:
            return total, "INCOMPLETE"
        percentage = (total / total_max) * 100
        return total, PracticalAssessmentReport.rating_for(percentage)

    scores = [report.task_1_score, report.task_2_score, report.task_3_score, report.task_4_score]
    filled_scores = [score for score in scores if score is not None]
    if not filled_scores:
        return None, "INCOMPLETE"

    total = sum(filled_scores)
    if len(filled_scores) < len(scores):
        return total, "INCOMPLETE"

    legacy_max = float(PracticalAssessmentReport.MAX_TASK_SCORE * len(scores))
    return total, PracticalAssessmentReport.rating_for((total / legacy_max) * 100)


def _normalize_task_items(raw_items) -> list[dict]:
    if raw_items in (None, ""):
        return []
    if not isinstance(raw_items, list):
        raise ValueError("'task_items' must be a list")

    items = []
    for index, raw in enumerate(raw_items, start=1):
        if not isinstance(raw, dict):
            raise ValueError(f"'task_items[{index}]' must be an object")
        description = raw.get("description")
        remark = raw.get("remark")
        score = raw.get("score")
        max_score = raw.get("max_score", PracticalAssessmentReport.MAX_TASK_SCORE)

        if description not in (None, "") and not isinstance(description, str):
            raise ValueError(f"'task_items[{index}].description' must be a string")
        if remark not in (None, "") and not isinstance(remark, str):
            raise ValueError(f"'task_items[{index}].remark' must be a string")
        if score not in (None, ""):
            try:
                score = float(score)
            except (TypeError, ValueError) as exc:
                raise ValueError(f"'task_items[{index}].score' must be a number") from exc
            if score < 0:
                raise ValueError(f"'task_items[{index}].score' must be zero or greater")
        else:
            score = None
        try:
            max_score = float(max_score)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"'task_items[{index}].max_score' must be a number") from exc
        if max_score <= 0:
            raise ValueError(f"'task_items[{index}].max_score' must be greater than zero")

        if description in (None, "") and score is None and remark in (None, ""):
            continue

        items.append(
            {
                "number": index,
                "description": description.strip() if isinstance(description, str) and description.strip() else None,
                "score": score,
                "remark": remark.strip() if isinstance(remark, str) and remark.strip() else None,
                "max_score": max_score,
            }
        )
    return items


def _normalize_oral_questions(raw_questions) -> list[dict]:
    if raw_questions in (None, ""):
        return []
    if not isinstance(raw_questions, list):
        raise ValueError("'oral_questions' must be a list")

    questions = []
    for index, raw in enumerate(raw_questions, start=1):
        if not isinstance(raw, dict):
            raise ValueError(f"'oral_questions[{index}]' must be an object")
        question = raw.get("question")
        answer_guidance = raw.get("answer_guidance")
        awarded_score = raw.get("awarded_score")
        max_score = raw.get("max_score", PracticalAssessmentReport.DEFAULT_ORAL_MAX_SCORE)

        if question not in (None, "") and not isinstance(question, str):
            raise ValueError(f"'oral_questions[{index}].question' must be a string")
        if answer_guidance not in (None, "") and not isinstance(answer_guidance, str):
            raise ValueError(f"'oral_questions[{index}].answer_guidance' must be a string")
        if awarded_score not in (None, ""):
            try:
                awarded_score = float(awarded_score)
            except (TypeError, ValueError) as exc:
                raise ValueError(f"'oral_questions[{index}].awarded_score' must be a number") from exc
            if awarded_score < 0:
                raise ValueError(f"'oral_questions[{index}].awarded_score' must be zero or greater")
        else:
            awarded_score = None
        try:
            max_score = float(max_score)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"'oral_questions[{index}].max_score' must be a number") from exc
        if max_score <= 0:
            raise ValueError(f"'oral_questions[{index}].max_score' must be greater than zero")

        if question in (None, "") and answer_guidance in (None, "") and awarded_score is None:
            continue

        questions.append(
            {
                "number": index,
                "question": question.strip() if isinstance(question, str) and question.strip() else None,
                "answer_guidance": answer_guidance.strip() if isinstance(answer_guidance, str) and answer_guidance.strip() else None,
                "awarded_score": awarded_score,
                "max_score": max_score,
            }
        )
    return questions


def _normalize_section_items(raw_items, section_type: str, section_index: int) -> list[dict]:
    if raw_items in (None, ""):
        return []
    if not isinstance(raw_items, list):
        raise ValueError(f"'report_sections[{section_index}].items' must be a list")

    items = []
    default_max = (
        PracticalAssessmentReport.DEFAULT_ORAL_MAX_SCORE
        if section_type == "oral"
        else PracticalAssessmentReport.MAX_TASK_SCORE
    )
    for item_index, raw in enumerate(raw_items, start=1):
        if not isinstance(raw, dict):
            raise ValueError(f"'report_sections[{section_index}].items[{item_index}]' must be an object")

        prompt = raw.get("prompt")
        expected_response = raw.get("expected_response")
        remark = raw.get("remark")
        sub_items = raw.get("sub_items")
        score = raw.get("score")
        max_score = raw.get("max_score", default_max)

        for field_name, field_value in (
            ("prompt", prompt),
            ("expected_response", expected_response),
            ("remark", remark),
        ):
            if field_value not in (None, "") and not isinstance(field_value, str):
                raise ValueError(
                    f"'report_sections[{section_index}].items[{item_index}].{field_name}' must be a string"
                )
        if sub_items not in (None, ""):
            if not isinstance(sub_items, list) or any(not isinstance(value, str) for value in sub_items):
                raise ValueError(
                    f"'report_sections[{section_index}].items[{item_index}].sub_items' must be a list of strings"
                )
        else:
            sub_items = []

        if score not in (None, ""):
            try:
                score = float(score)
            except (TypeError, ValueError) as exc:
                raise ValueError(f"'report_sections[{section_index}].items[{item_index}].score' must be a number") from exc
            if score < 0:
                raise ValueError(f"'report_sections[{section_index}].items[{item_index}].score' must be zero or greater")
        else:
            score = None

        try:
            max_score = float(max_score)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"'report_sections[{section_index}].items[{item_index}].max_score' must be a number") from exc
        if max_score <= 0:
            raise ValueError(f"'report_sections[{section_index}].items[{item_index}].max_score' must be greater than zero")
        if score is not None and score > max_score:
            raise ValueError(
                f"'report_sections[{section_index}].items[{item_index}].score' cannot exceed max_score"
            )

        if prompt in (None, "") and expected_response in (None, "") and remark in (None, "") and score is None:
            continue

        items.append(
            {
                "number": item_index,
                "prompt": prompt.strip() if isinstance(prompt, str) and prompt.strip() else None,
                "expected_response": expected_response.strip() if isinstance(expected_response, str) and expected_response.strip() else None,
                "remark": remark.strip() if isinstance(remark, str) and remark.strip() else None,
                "sub_items": [value.strip() for value in sub_items if value.strip()],
                "score": score,
                "max_score": max_score,
            }
        )
    return items


def _normalize_report_sections(raw_sections) -> list[dict]:
    if raw_sections in (None, ""):
        return []
    if not isinstance(raw_sections, list):
        raise ValueError("'report_sections' must be a list")

    sections = []
    for section_index, raw in enumerate(raw_sections, start=1):
        if not isinstance(raw, dict):
            raise ValueError(f"'report_sections[{section_index}]' must be an object")
        title = raw.get("title")
        section_type = str(raw.get("type") or "narrative").strip().lower()
        description = raw.get("description")
        content = raw.get("content")
        duration_hours = raw.get("duration_hours")
        section_assessment_date = raw.get("assessment_date")
        section_assessment_venue = raw.get("assessment_venue")
        note = raw.get("note")

        if section_type not in {"narrative", "checklist", "oral", "session"}:
            raise ValueError(f"'report_sections[{section_index}].type' must be narrative, checklist, session, or oral")
        for field_name, field_value in (
            ("title", title),
            ("description", description),
            ("content", content),
            ("assessment_date", section_assessment_date),
            ("assessment_venue", section_assessment_venue),
            ("note", note),
        ):
            if field_value not in (None, "") and not isinstance(field_value, str):
                raise ValueError(f"'report_sections[{section_index}].{field_name}' must be a string")
        if duration_hours not in (None, ""):
            try:
                duration_hours = float(duration_hours)
            except (TypeError, ValueError) as exc:
                raise ValueError(f"'report_sections[{section_index}].duration_hours' must be a number") from exc
            if duration_hours <= 0:
                raise ValueError(f"'report_sections[{section_index}].duration_hours' must be greater than zero")
        else:
            duration_hours = None

        items = _normalize_section_items(raw.get("items"), section_type, section_index) if section_type != "narrative" else []
        if section_type == "narrative" and not (isinstance(content, str) and content.strip()) and not (isinstance(description, str) and description.strip()):
            continue
        if section_type != "narrative" and not items and not (isinstance(description, str) and description.strip()):
            continue

        sections.append(
            {
                "number": section_index,
                "title": title.strip() if isinstance(title, str) and title.strip() else None,
                "type": section_type,
                "description": description.strip() if isinstance(description, str) and description.strip() else None,
                "content": content.strip() if isinstance(content, str) and content.strip() else None,
                "duration_hours": duration_hours,
                "assessment_date": section_assessment_date.strip() if isinstance(section_assessment_date, str) and section_assessment_date.strip() else None,
                "assessment_venue": section_assessment_venue.strip() if isinstance(section_assessment_venue, str) and section_assessment_venue.strip() else None,
                "note": note.strip() if isinstance(note, str) and note.strip() else None,
                "items": items,
            }
        )
    return sections


def _legacy_report_sections(report: PracticalAssessmentReport) -> list[dict]:
    task_rows = _task_rows(report)
    oral_questions = _normalize_oral_questions(report.oral_questions) if isinstance(report.oral_questions, list) else []
    return _legacy_report_sections_from_data(report, task_rows, oral_questions)


def _legacy_report_sections_from_data(
    report: PracticalAssessmentReport,
    task_rows: list[dict],
    oral_questions: list[dict],
) -> list[dict]:
    sections = []

    if report.practical_brief:
        sections.append(
            {
                "number": len(sections) + 1,
                "title": "Practical Brief",
                "type": "narrative",
                "description": None,
                "content": report.practical_brief,
                "items": [],
            }
        )
    if task_rows:
        sections.append(
            {
                "number": len(sections) + 1,
                "title": "Task Checklist",
                "type": "session",
                "description": None,
                "content": None,
                "duration_hours": None,
                "assessment_date": None,
                "assessment_venue": report.assessment_venue,
                "note": None,
                "items": [
                    {
                        "number": index + 1,
                        "prompt": row.get("description"),
                        "expected_response": None,
                        "remark": row.get("remark"),
                        "sub_items": [],
                        "score": row.get("score"),
                        "max_score": row.get("max_score"),
                    }
                    for index, row in enumerate(task_rows)
                ],
            }
        )
    if oral_questions:
        sections.append(
            {
                "number": len(sections) + 1,
                "title": "Oral Questions",
                "type": "oral",
                "description": None,
                "content": None,
                "duration_hours": None,
                "assessment_date": None,
                "assessment_venue": None,
                "note": None,
                "items": [
                    {
                        "number": index + 1,
                        "prompt": question.get("question"),
                        "expected_response": question.get("answer_guidance"),
                        "remark": None,
                        "sub_items": [],
                        "score": question.get("awarded_score"),
                        "max_score": question.get("max_score"),
                    }
                    for index, question in enumerate(oral_questions)
                ],
            }
        )
    if report.general_remarks:
        sections.append(
            {
                "number": len(sections) + 1,
                "title": "General Remarks",
                "type": "narrative",
                "description": None,
                "content": report.general_remarks,
                "items": [],
            }
        )
    return sections


def _legacy_task_rows(report: PracticalAssessmentReport) -> list[dict]:
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
                "max_score": PracticalAssessmentReport.MAX_TASK_SCORE,
            }
        )
    return rows


def _task_rows(report: PracticalAssessmentReport) -> list[dict]:
    if isinstance(report.task_items, list) and report.task_items:
        return _normalize_task_items(report.task_items)
    return _legacy_task_rows(report)


def _sync_legacy_task_fields(report: PracticalAssessmentReport, rows: list[dict]) -> None:
    for index in range(1, 5):
        row = rows[index - 1] if index - 1 < len(rows) else None
        setattr(report, f"task_{index}_description", row.get("description") if row else None)
        setattr(report, f"task_{index}_score", row.get("score") if row else None)
        setattr(report, f"task_{index}_remark", row.get("remark") if row else None)


def _score_percentage(task_rows: list[dict]) -> float | None:
    if not task_rows:
        return None
    scores = [float(item.get("score")) for item in task_rows if item.get("score") is not None]
    total_max = sum(float(item.get("max_score") or PracticalAssessmentReport.MAX_TASK_SCORE) for item in task_rows)
    if len(scores) != len(task_rows) or total_max <= 0:
        return None
    return (sum(scores) / total_max) * 100


def _section_score_summary(sections: list[dict]) -> tuple[float | None, float | None, float | None]:
    scored_items = []
    total_max = 0.0
    total_items = 0
    for section in sections:
        for item in section.get("items") or []:
            total_items += 1
            total_max += float(item.get("max_score") or PracticalAssessmentReport.MAX_TASK_SCORE)
            if item.get("score") is not None:
                scored_items.append(float(item.get("score")))
    if not scored_items:
        return None, None, None
    total_score = sum(scored_items)
    if len(scored_items) != total_items or total_max <= 0:
        return total_score, total_max, None
    return total_score, total_max, (total_score / total_max) * 100


def _safe_computed_scores(report: PracticalAssessmentReport) -> tuple[float | None, str | None]:
    try:
        return _computed_scores(report)
    except (AttributeError, TypeError, ValueError):
        return report.total_score, report.competency_outcome


def _safe_task_rows(report: PracticalAssessmentReport) -> list[dict]:
    try:
        return _task_rows(report)
    except (AttributeError, TypeError, ValueError):
        return _legacy_task_rows(report)


def _safe_oral_questions(report: PracticalAssessmentReport) -> list[dict]:
    if not isinstance(report.oral_questions, list):
        return []
    try:
        return _normalize_oral_questions(report.oral_questions)
    except (AttributeError, TypeError, ValueError):
        return []


def _safe_report_sections(
    report: PracticalAssessmentReport,
    task_rows: list[dict],
    oral_questions: list[dict],
) -> list[dict]:
    if isinstance(report.report_sections, list) and report.report_sections:
        try:
            return _normalize_report_sections(report.report_sections)
        except (AttributeError, TypeError, ValueError):
            pass
    return _legacy_report_sections_from_data(report, task_rows, oral_questions)


def _report_blueprint_sections(report: PracticalAssessmentReport) -> list[dict]:
    """Reusable report design with all learner-specific scoring removed."""
    sections = deepcopy(
        _safe_report_sections(report, _safe_task_rows(report), _safe_oral_questions(report))
    )
    for section in sections:
        if not isinstance(section, dict):
            continue
        for item in section.get("items") or []:
            if not isinstance(item, dict):
                continue
            item["score"] = None
            item["remark"] = None
    return _normalize_report_sections(sections)


def _report_blueprint_tasks(report: PracticalAssessmentReport) -> list[dict]:
    items = deepcopy(_safe_task_rows(report))
    for item in items:
        item["score"] = None
        item["remark"] = None
    return _normalize_task_items(items)


def _report_blueprint_oral_questions(report: PracticalAssessmentReport) -> list[dict]:
    questions = deepcopy(_safe_oral_questions(report))
    for question in questions:
        question["awarded_score"] = None
    return _normalize_oral_questions(questions)


def _template_root_id(report: PracticalAssessmentReport) -> uuid.UUID:
    """The id every copy of this report build shares."""
    return report.source_report_id or report.id


def _blueprint_signature(report: PracticalAssessmentReport) -> str:
    """
    Stable fingerprint of a report's *design*, with every learner-specific value
    stripped out. Two reports built from the same template hash identically even
    after one of them has been scored, which lets pre-lineage reports (created
    before `source_report_id` existed) still be recognised as duplicates.
    """
    try:
        design = {
            "unit_code": (report.unit_code or "").strip().lower(),
            "unit_of_competency": (report.unit_of_competency or "").strip().lower(),
            "practical_brief": (report.practical_brief or "").strip().lower(),
            "sections": _report_blueprint_sections(report),
            "tasks": _report_blueprint_tasks(report),
            "oral_questions": _report_blueprint_oral_questions(report),
        }
    except (AttributeError, TypeError, ValueError):
        # A malformed report can never be matched against; fall back to its own
        # id so it only ever collides with itself.
        return f"unhashable:{report.id}"
    encoded = json.dumps(design, sort_keys=True, default=str).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _students_already_holding_template(source: PracticalAssessmentReport) -> set[uuid.UUID]:
    """
    Learners who already hold this report build, so reusing it must skip them.

    Covers two cases: copies linked to the same lineage root, and reports that
    predate lineage tracking but carry an identical design from the same
    assessor.
    """
    root_id = _template_root_id(source)
    holders: set[uuid.UUID] = {source.student_id}

    lineage = (
        db.session.query(PracticalAssessmentReport)
        .filter(
            PracticalAssessmentReport.deleted_at.is_(None),
            db.or_(
                PracticalAssessmentReport.id == root_id,
                PracticalAssessmentReport.source_report_id == root_id,
            ),
        )
        .all()
    )
    for report in lineage:
        holders.add(report.student_id)

    signature = _blueprint_signature(source)
    if signature.startswith("unhashable:"):
        return holders

    untracked = (
        db.session.query(PracticalAssessmentReport)
        .filter(
            PracticalAssessmentReport.deleted_at.is_(None),
            PracticalAssessmentReport.trainer_id == source.trainer_id,
            PracticalAssessmentReport.source_report_id.is_(None),
            PracticalAssessmentReport.id != root_id,
        )
        .all()
    )
    for report in untracked:
        if report.student_id in holders:
            continue
        if _blueprint_signature(report) == signature:
            holders.add(report.student_id)

    return holders


def _report_payload(report: PracticalAssessmentReport) -> dict:
    total_score, competency_outcome = _safe_computed_scores(report)
    task_rows = _safe_task_rows(report)
    oral_questions = _safe_oral_questions(report)
    report_sections = _safe_report_sections(report, task_rows, oral_questions)
    section_total_score, section_total_max, section_percentage = _section_score_summary(report_sections)
    total_max_score = (
        section_total_max
        if section_total_max is not None
        else (
            sum(float(item.get("max_score") or PracticalAssessmentReport.MAX_TASK_SCORE) for item in task_rows)
            if task_rows
            else float(PracticalAssessmentReport.MAX_TASK_SCORE * 4)
        )
    )
    context = _assessment_context(report.student, report.trainer) if report.student and report.trainer else {}
    return {
        "id": str(report.id),
        "student_id": str(report.student_id),
        "trainer_id": str(report.trainer_id),
        "source_report_id": str(report.source_report_id) if report.source_report_id else None,
        "template_root_id": str(_template_root_id(report)),
        "student_name": report.student.user.name if report.student and report.student.user else None,
        "student_registration_number": report.student.registration_number if report.student else None,
        "trainer_name": report.trainer.user.name if report.trainer and report.trainer.user else None,
        "institution_name": _display_context_value(report, "institution_name", context),
        "institution_location": context.get("institution_location"),
        "department_name": _display_context_value(report, "department_name", context),
        # An awarding body entered on the report wins; otherwise the default.
        "awarding_body": _stored_context_value(report, "awarding_body") or DEFAULT_AWARDING_BODY,
        "qualification": _display_context_value(report, "qualification", context),
        "unit_of_competency": _display_context_value(report, "unit_of_competency", context),
        "unit_code": _display_context_value(report, "unit_code", context),
        "period": _display_context_value(report, "period", context),
        "assessment_date": report.assessment_date.isoformat() if report.assessment_date else None,
        "company_name": report.company_name,
        "assessment_venue": report.assessment_venue,
        "practical_brief": report.practical_brief,
        "general_remarks": report.general_remarks,
        "report_sections": report_sections,
        "media_attachments": report.media_attachments if isinstance(report.media_attachments, list) else [],
        "task_items": task_rows,
        "oral_questions": oral_questions,
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
        "total_score": section_total_score if section_total_score is not None else total_score,
        "total_max_score": total_max_score,
        "score_percentage": section_percentage if section_percentage is not None else _score_percentage(task_rows),
        "competency_outcome": competency_outcome,
        "competence_rating_scale": PracticalAssessmentReport.COMPETENCE_BANDS,
        "competence_pass_mark": PracticalAssessmentReport.COMPETENCE_PASS_MARK,
        "released_at": report.released_at.isoformat() if report.released_at else None,
        "released_by_user_id": str(report.released_by_user_id) if report.released_by_user_id else None,
        "released_by_name": report.released_by.name if report.released_by else None,
        "status": report.status,
        "assessment_scope": "formative",
        "created_at": report.created_at.isoformat() if report.created_at else None,
        "updated_at": report.updated_at.isoformat() if report.updated_at else None,
    }


def _student_report_payload(report: PracticalAssessmentReport) -> dict:
    """Return only released learner-safe content; assessor guides stay private."""
    payload = _report_payload(report)
    safe_sections = []
    for section in payload.get("report_sections") or []:
        if not isinstance(section, dict):
            continue
        safe_section = {
            key: value
            for key, value in section.items()
            if key not in {"expected_response", "rubric", "assessor_guide"}
        }
        safe_items = []
        for item in section.get("items") or []:
            if not isinstance(item, dict):
                continue
            safe_items.append(
                {
                    key: value
                    for key, value in item.items()
                    if key not in {"expected_response", "details", "rubric", "assessor_guide"}
                }
            )
        safe_section["items"] = safe_items
        safe_sections.append(safe_section)
    payload["report_sections"] = safe_sections
    payload["oral_questions"] = [
        {
            key: value
            for key, value in item.items()
            if key not in {
                "answer_guidance",
                "expected_response",
                "details",
                "rubric",
                "assessor_guide",
            }
        }
        for item in (payload.get("oral_questions") or [])
        if isinstance(item, dict)
    ]
    payload["media_attachments"] = [
        item
        for item in (payload.get("media_attachments") or [])
        if isinstance(item, dict) and item.get("student_visible") is True
    ]
    return payload


def _apply_payload(report: PracticalAssessmentReport, payload: dict) -> PracticalAssessmentReport:
    for field in (
        "assessment_date",
        "company_name",
        "assessment_venue",
        "practical_brief",
        "general_remarks",
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
                    setattr(report, field, None)
                    continue
                try:
                    setattr(report, field, datetime.fromisoformat(str(value)))
                except ValueError as exc:
                    raise ValueError("Invalid 'assessment_date'") from exc
            else:
                setattr(report, field, value)
    if "task_items" in payload:
        report.task_items = _normalize_task_items(payload.get("task_items"))
        _sync_legacy_task_fields(report, report.task_items)
    elif any(field in payload for field in (
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
    )):
        report.task_items = _legacy_task_rows(report)
    if "oral_questions" in payload:
        report.oral_questions = _normalize_oral_questions(payload.get("oral_questions"))
    if "report_sections" in payload:
        report.report_sections = _normalize_report_sections(payload.get("report_sections"))
    elif any(field in payload for field in (
        "practical_brief",
        "general_remarks",
        "task_items",
        "oral_questions",
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
    )):
        report.report_sections = _legacy_report_sections(report)
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
    if "status" in payload and payload.get("status") not in {"draft", "complete", "released"}:
        raise ValueError("'status' must be draft, complete, or released")
    if "report_sections" in payload:
        _normalize_report_sections(payload.get("report_sections"))
    if "task_items" in payload:
        _normalize_task_items(payload.get("task_items"))
    if "oral_questions" in payload:
        _normalize_oral_questions(payload.get("oral_questions"))
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
        query = query.filter(PracticalAssessmentReport.trainer_id == trainer.id)
        if student_id:
            try:
                student_uuid = _parse_uuid(student_id, "student_id")
            except ValueError as exc:
                return {"error": str(exc)}, 400
            if not _can_trainer_access_student(trainer.id, student_uuid):
                return {"error": "Student not found in your assigned subjects"}, 403
            query = query.filter(PracticalAssessmentReport.student_id == student_uuid)
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
        if (
            not student
            or report.student_id != student.id
            or report.status != "released"
            or report.released_at is None
        ):
            return {"error": "Report not found"}, 404
    elif _is_trainer(user):
        trainer = _trainer_profile(user)
        if not trainer or report.trainer_id != trainer.id:
            return {"error": "Access denied"}, 403
    elif not _is_admin(user):
        return {"error": "Access denied"}, 403

    return (_student_report_payload(report) if _is_student(user) else _report_payload(report)), 200


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
        reports = (
            db.session.query(PracticalAssessmentReport)
            .filter(
                PracticalAssessmentReport.student_id == student_uuid,
                PracticalAssessmentReport.status == "released",
                PracticalAssessmentReport.released_at.isnot(None),
                PracticalAssessmentReport.deleted_at.is_(None),
            )
            .order_by(PracticalAssessmentReport.created_at.desc())
            .all()
        )
        return [_student_report_payload(report) for report in reports], 200
    elif _is_trainer(user):
        trainer = _trainer_profile(user)
        if not trainer or not _can_trainer_access_student(trainer.id, student_uuid):
            return {"error": "Student not found in your assigned subjects"}, 403
        reports = (
            db.session.query(PracticalAssessmentReport)
            .filter(
                PracticalAssessmentReport.student_id == student_uuid,
                PracticalAssessmentReport.trainer_id == trainer.id,
                PracticalAssessmentReport.deleted_at.is_(None),
            )
            .order_by(PracticalAssessmentReport.created_at.desc())
            .all()
        )
        return [_report_payload(report) for report in reports], 200
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
        if (
            not current_student
            or current_student.id != student_uuid
            or report.status != "released"
            or report.released_at is None
        ):
            return {"error": "Report not found"}, 404
    elif _is_trainer(user):
        trainer = _trainer_profile(user)
        if not trainer or report.trainer_id != trainer.id:
            return {"error": "Access denied"}, 403
    elif not _is_admin(user):
        return {"error": "Access denied"}, 403

    return (_student_report_payload(report) if _is_student(user) else _report_payload(report)), 200


@bp.post("/practical-assessments")
def create_practical_assessment():
    user, error, status = _load_current_user()
    if error:
        return error, status

    if not _can_manage_practical(user):
        return {"error": "Trainer or admin access required"}, 403
    if (request.get_json(silent=True) or {}).get("assessment_scope", "formative") != "formative":
        return {"error": "Only internal formative practical assessments are permitted"}, 400

    payload = request.get_json(silent=True) or {}
    if payload.get("status") == "released":
        return {"error": "Use the release action after saving a complete assessment"}, 400
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
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return {"error": "Practical assessment could not be saved"}, 409
    db.session.refresh(report)
    return _report_payload(report), 201


@bp.post("/practical-assessments/<report_id>/assign")
def assign_practical_assessment_blueprint(report_id: str):
    """Reuse one practical report design for one or more additional learners."""
    user, error, status = _load_current_user()
    if error:
        return error, status
    if not _can_manage_practical(user):
        return {"error": "Trainer or admin access required"}, 403

    try:
        report_uuid = _parse_uuid(report_id, "report_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    source = db.session.get(PracticalAssessmentReport, report_uuid)
    if not source or source.deleted_at:
        return {"error": "Report not found"}, 404
    if _is_trainer(user):
        trainer = _trainer_profile(user)
        if not trainer or source.trainer_id != trainer.id:
            return {"error": "Access denied"}, 403

    payload = request.get_json(silent=True) or {}
    raw_student_ids = payload.get("student_ids")
    if not isinstance(raw_student_ids, list) or not raw_student_ids:
        return {"error": "Select at least one learner"}, 400
    if len(raw_student_ids) > 100:
        return {"error": "A report can be assigned to at most 100 learners at a time"}, 400

    target_ids: list[uuid.UUID] = []
    seen_ids: set[uuid.UUID] = set()
    try:
        for value in raw_student_ids:
            student_id = _parse_uuid(str(value), "student_id")
            if student_id not in seen_ids:
                seen_ids.add(student_id)
                target_ids.append(student_id)
    except ValueError as exc:
        return {"error": str(exc)}, 400

    source_subject = _shared_subject(source.student_id, source.trainer_id)
    already_assigned = _students_already_holding_template(source)
    targets: list[Student] = []
    skipped_student_ids: list[str] = []
    skipped_names: list[str] = []
    for student_id in target_ids:
        if student_id in already_assigned:
            skipped_student_ids.append(str(student_id))
            existing = db.session.get(Student, student_id)
            if existing and existing.user:
                skipped_names.append(existing.user.name)
            continue
        student = db.session.get(Student, student_id)
        if not student or student.deleted_at:
            return {"error": f"Learner '{student_id}' was not found"}, 404
        if not _can_trainer_access_student(source.trainer_id, student_id):
            return {"error": f"The report assessor is not assigned to {student.user.name if student.user else student_id}"}, 403
        if source_subject:
            is_enrolled = db.session.query(StudentSubject.id).filter(
                StudentSubject.student_id == student_id,
                StudentSubject.subject_id == source_subject.id,
            ).first()
            if not is_enrolled:
                return {
                    "error": (
                        f"{student.user.name if student.user else student_id} is not enrolled in "
                        f"{source_subject.name}"
                    )
                }, 400
        targets.append(student)

    if not targets:
        if skipped_student_ids:
            return {
                "error": (
                    "Every learner selected already has this report. "
                    "Pick learners who have not been assessed on this template yet."
                ),
                "skipped_student_ids": skipped_student_ids,
                "skipped_student_names": skipped_names,
            }, 409
        return {"error": "Select at least one different eligible learner"}, 400

    root_id = _template_root_id(source)
    sections = _report_blueprint_sections(source)
    task_items = _report_blueprint_tasks(source)
    oral_questions = _report_blueprint_oral_questions(source)
    created: list[PracticalAssessmentReport] = []
    for student in targets:
        report = PracticalAssessmentReport(
            student_id=student.id,
            trainer_id=source.trainer_id,
            source_report_id=root_id,
            assessment_date=source.assessment_date,
            company_name=source.company_name,
            assessment_venue=source.assessment_venue,
            practical_brief=source.practical_brief,
            general_remarks=None,
            report_sections=deepcopy(sections),
            task_items=deepcopy(task_items),
            oral_questions=deepcopy(oral_questions),
            task_1_description=source.task_1_description,
            task_2_description=source.task_2_description,
            task_3_description=source.task_3_description,
            task_4_description=source.task_4_description,
            task_1_score=None,
            task_2_score=None,
            task_3_score=None,
            task_4_score=None,
            task_1_remark=None,
            task_2_remark=None,
            task_3_remark=None,
            task_4_remark=None,
            media_attachments=[],
            status="draft",
            released_at=None,
            released_by_user_id=None,
        )
        if source.trainer:
            _seed_context_fields(report, student, source.trainer)
        db.session.add(report)
        created.append(report)

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return {"error": "The report could not be assigned to the selected learners"}, 409

    return {
        "source_report_id": str(source.id),
        "template_root_id": str(root_id),
        "created": [_report_payload(report) for report in created],
        "created_count": len(created),
        "skipped_student_ids": skipped_student_ids,
        "skipped_student_names": skipped_names,
        "skipped_count": len(skipped_student_ids),
    }, 201


@bp.get("/practical-assessments/<report_id>/eligible-students")
def practical_assessment_eligible_students(report_id: str):
    """Learners who can receive a draft copied from this report build."""
    user, error, status = _load_current_user()
    if error:
        return error, status
    if not _can_manage_practical(user):
        return {"error": "Trainer or admin access required"}, 403
    try:
        report_uuid = _parse_uuid(report_id, "report_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    source = db.session.get(PracticalAssessmentReport, report_uuid)
    if not source or source.deleted_at:
        return {"error": "Report not found"}, 404
    if _is_trainer(user):
        trainer = _trainer_profile(user)
        if not trainer or source.trainer_id != trainer.id:
            return {"error": "Access denied"}, 403

    source_subject = _shared_subject(source.student_id, source.trainer_id)
    already_assigned = _students_already_holding_template(source)
    query = db.session.query(Student).filter(
        Student.id.notin_(already_assigned),
        Student.deleted_at.is_(None),
    )
    if source_subject:
        query = query.join(
            StudentSubject, StudentSubject.student_id == Student.id
        ).filter(StudentSubject.subject_id == source_subject.id)
    else:
        query = query.join(
            StudentSubject, StudentSubject.student_id == Student.id
        ).join(
            TrainerSubject, TrainerSubject.subject_id == StudentSubject.subject_id
        ).filter(TrainerSubject.trainer_id == source.trainer_id)

    students = query.distinct().order_by(Student.registration_number.asc()).all()
    return [
        {
            "id": str(student.id),
            "name": student.user.name if student.user else "Unnamed learner",
            "email": student.user.email if student.user else "",
            "student_id": student.registration_number or student.code or "",
            "enrollment_status": "active",
            "overall_avg": 0,
            "subjects": [source_subject.name] if source_subject else [],
        }
        for student in students
    ], 200


@bp.put("/practical-assessments/<report_id>")
def update_practical_assessment(report_id: str):
    user, error, status = _load_current_user()
    if error:
        return error, status

    if not _can_manage_practical(user):
        return {"error": "Trainer or admin access required"}, 403

    try:
        report_uuid = _parse_uuid(report_id, "report_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    report = db.session.get(PracticalAssessmentReport, report_uuid)
    if not report or report.deleted_at:
        return {"error": "Report not found"}, 404
    if report.status == "released":
        return {"error": "Unsend the released assessment before editing it"}, 409

    if _is_trainer(user):
        trainer = _trainer_profile(user)
        if not trainer or report.trainer_id != trainer.id:
            return {"error": "Access denied"}, 403

    payload = request.get_json(silent=True) or {}
    if payload.get("status") == "released":
        return {"error": "Use the release action after saving a complete assessment"}, 400
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
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return {"error": "Practical assessment could not be updated"}, 409
    db.session.refresh(report)
    return _report_payload(report), 200


@bp.post("/practical-assessments/<report_id>/media")
def upload_practical_assessment_media(report_id: str):
    user, error, status = _load_current_user()
    if error:
        return error, status

    if not _can_manage_practical(user):
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

    media_file = request.files.get("file")
    if not media_file or not media_file.filename:
        return {"error": "No media file provided"}, 400
    if not _allowed_media_file(media_file.filename):
        allowed = ", ".join(sorted(PRACTICAL_MEDIA_ALLOWED_EXTENSIONS))
        return {"error": f"File type not allowed. Allowed: {allowed}"}, 400
    evidence_type = request.form.get("evidence_type", "").strip().lower()
    section_id = request.form.get("section_id", "").strip() or None
    student_visible = request.form.get("student_visible", "").strip().lower() in {"1", "true", "yes"}
    is_oral_audio = evidence_type == "oral_audio"
    is_audio_file = is_oral_audio or (media_file.mimetype or "").startswith("audio/")
    if is_oral_audio and not (
        (media_file.mimetype or "").startswith("audio/")
        or (media_file.mimetype or "") in {"video/webm", "application/ogg"}
    ):
        return {"error": "The oral evidence recording must be an audio file"}, 400

    os.makedirs(PRACTICAL_MEDIA_UPLOAD_FOLDER, exist_ok=True)
    safe_name = secure_filename(media_file.filename)
    unique_name = f"{uuid.uuid4().hex}_{safe_name}"
    save_path = os.path.join(PRACTICAL_MEDIA_UPLOAD_FOLDER, unique_name)
    media_file.save(save_path)
    file_size = os.path.getsize(save_path)
    if file_size <= 0 or file_size > PRACTICAL_MEDIA_MAX_BYTES:
        os.remove(save_path)
        return {"error": "File must be between 1 byte and 25 MB"}, 413

    attachments = report.media_attachments if isinstance(report.media_attachments, list) else []
    attachment = {
        "id": uuid.uuid4().hex,
        "file_name": safe_name,
        "file_url": f"/practical-assessments/media/{unique_name}",
        "file_size": file_size,
        "media_type": "audio" if is_audio_file else _media_kind(safe_name),
        "content_type": (
            media_file.mimetype
            if is_audio_file
            else mimetypes.guess_type(safe_name)[0]
        ) or "application/octet-stream",
        "uploaded_at": datetime.utcnow().isoformat(),
        "uploaded_by_user_id": str(user.id),
        "evidence_type": evidence_type or "practical_evidence",
        "section_id": section_id,
        "student_visible": student_visible,
    }
    report.media_attachments = [*attachments, attachment]
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        if os.path.exists(save_path):
            os.remove(save_path)
        return {"error": "Media attachment could not be saved"}, 409
    db.session.refresh(report)
    return {"attachment": attachment, "report": _report_payload(report)}, 201


@bp.get("/practical-assessments/<report_id>/media/<attachment_id>/preview-link")
def practical_assessment_media_preview_link(report_id: str, attachment_id: str):
    user, error, status = _load_current_user()
    if error:
        return error, status
    try:
        report_uuid = _parse_uuid(report_id, "report_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    report = db.session.get(PracticalAssessmentReport, report_uuid)
    if not report or report.deleted_at or not _can_access_report(user, report):
        return {"error": "File not found"}, 404

    attachment = next(
        (
            item for item in (report.media_attachments or [])
            if isinstance(item, dict) and item.get("id") == attachment_id
        ),
        None,
    )
    if not attachment:
        return {"error": "File not found"}, 404
    if _is_student(user) and attachment.get("student_visible") is not True:
        return {"error": "File not found"}, 404

    file_url = str(attachment.get("file_url") or "")
    filename = file_url.rsplit("/", 1)[-1]
    if not filename or secure_filename(filename) != filename:
        return {"error": "File not found"}, 404

    expires = int(time.time()) + PRACTICAL_PREVIEW_TTL_SECONDS
    preview_path = url_for(
        "practical_assessments.serve_practical_assessment_media",
        filename=filename,
        expires=expires,
        signature=_preview_signature(filename, expires),
    )
    return {"url": preview_path, "expires_at": expires}, 200


@bp.get("/practical-assessments/media/<path:filename>")
def serve_practical_assessment_media(filename: str):
    reports = db.session.query(PracticalAssessmentReport).filter(
        PracticalAssessmentReport.deleted_at.is_(None)
    ).all()
    report = next(
        (
            item for item in reports
            if any(
                attachment.get("file_url") == f"/practical-assessments/media/{filename}"
                for attachment in (item.media_attachments or [])
                if isinstance(attachment, dict)
            )
        ),
        None,
    )
    if not report:
        return {"error": "File not found"}, 404

    attachment = next(
        (
            item for item in (report.media_attachments or [])
            if isinstance(item, dict)
            and item.get("file_url") == f"/practical-assessments/media/{filename}"
        ),
        {},
    )
    if not _valid_preview_signature(filename):
        user, error, status = _load_current_user()
        if error:
            return error, status
        if not _can_access_report(user, report):
            return {"error": "File not found"}, 404
        if _is_student(user) and attachment.get("student_visible") is not True:
            return {"error": "File not found"}, 404

    response = send_from_directory(
        os.path.abspath(PRACTICAL_MEDIA_UPLOAD_FOLDER),
        filename,
        mimetype=attachment.get("content_type") or mimetypes.guess_type(filename)[0],
        as_attachment=False,
        download_name=attachment.get("file_name") or filename,
        conditional=True,
    )
    response.headers["Cache-Control"] = "private, max-age=300"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@bp.post("/practical-assessments/<report_id>/release")
def release_practical_assessment(report_id: str):
    user, error, status = _load_current_user()
    if error:
        return error, status

    if not _can_manage_practical(user):
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

    first_release = report.released_at is None
    report.status = "released"
    if first_release:
        score_percentage = _report_payload(report).get("score_percentage")
        report.released_at = datetime.utcnow()
        report.released_by_user_id = user.id
        if report.student and report.student.user_id:
            score_text = (
                f" Your result is {score_percentage:.1f}%"
                if score_percentage is not None
                else ""
            )
            outcome_text = (
                f" ({report.competency_outcome})"
                if report.competency_outcome
                else ""
            )
            db.session.add(
                Notification(
                    user_id=report.student.user_id,
                    title="Practical assessment published",
                    message=(
                        f"Your practical assessment for {report.unit_of_competency} "
                        f"has been published.{score_text}{outcome_text}. "
                        "Open Practical Assessments to review the report and evidence."
                    ),
                    is_read=False,
                )
            )
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return {"error": "Practical assessment could not be released"}, 409
    db.session.refresh(report)
    return _report_payload(report), 200


@bp.post("/practical-assessments/<report_id>/unsend")
@bp.post("/practical-assessments/<report_id>/unrelease")
def unsend_practical_assessment(report_id: str):
    user, error, status = _load_current_user()
    if error:
        return error, status

    if not _can_manage_practical(user):
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

    if not _can_manage_practical(user):
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
