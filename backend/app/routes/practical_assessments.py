from __future__ import annotations

import os
import uuid
from datetime import datetime

from flask import Blueprint, request, send_from_directory
from sqlalchemy import exists
from werkzeug.utils import secure_filename

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

PRACTICAL_MEDIA_UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "practical_assessments")
PRACTICAL_MEDIA_ALLOWED_EXTENSIONS = {
    "png", "jpg", "jpeg", "gif", "webp", "bmp", "heic", "heif",
    "mp4", "mov", "avi", "mkv", "webm", "mpeg", "mpg", "m4v",
}

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


def _allowed_media_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in PRACTICAL_MEDIA_ALLOWED_EXTENSIONS


def _media_kind(filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return "video" if ext in {"mp4", "mov", "avi", "mkv", "webm", "mpeg", "mpg", "m4v"} else "image"


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
        if percentage >= 70:
            return total, "COMPETENT"
        if percentage >= 50:
            return total, "BORDERLINE"
        return total, "NOT YET COMPETENT"

    if isinstance(report.task_items, list) and report.task_items:
        filled_scores = [float(item.get("score")) for item in report.task_items if item.get("score") is not None]
        if not filled_scores:
            return None, "INCOMPLETE"

        total = sum(filled_scores)
        total_max = sum(float(item.get("max_score") or PracticalAssessmentReport.MAX_TASK_SCORE) for item in report.task_items)
        if len(filled_scores) < len(report.task_items) or total_max <= 0:
            return total, "INCOMPLETE"
        percentage = (total / total_max) * 100
        if percentage >= 70:
            return total, "COMPETENT"
        if percentage >= 50:
            return total, "BORDERLINE"
        return total, "NOT YET COMPETENT"

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
    sections = []
    task_rows = _task_rows(report)
    oral_questions = _normalize_oral_questions(report.oral_questions) if isinstance(report.oral_questions, list) else []

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


def _report_payload(report: PracticalAssessmentReport) -> dict:
    total_score, competency_outcome = _computed_scores(report)
    task_rows = _task_rows(report)
    oral_questions = _normalize_oral_questions(report.oral_questions) if isinstance(report.oral_questions, list) else []
    report_sections = (
        _normalize_report_sections(report.report_sections)
        if isinstance(report.report_sections, list) and report.report_sections
        else _legacy_report_sections(report)
    )
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


@bp.post("/practical-assessments/<report_id>/media")
def upload_practical_assessment_media(report_id: str):
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

    media_file = request.files.get("file")
    if not media_file or not media_file.filename:
        return {"error": "No media file provided"}, 400
    if not _allowed_media_file(media_file.filename):
        allowed = ", ".join(sorted(PRACTICAL_MEDIA_ALLOWED_EXTENSIONS))
        return {"error": f"File type not allowed. Allowed: {allowed}"}, 400

    os.makedirs(PRACTICAL_MEDIA_UPLOAD_FOLDER, exist_ok=True)
    safe_name = secure_filename(media_file.filename)
    unique_name = f"{uuid.uuid4().hex}_{safe_name}"
    save_path = os.path.join(PRACTICAL_MEDIA_UPLOAD_FOLDER, unique_name)
    media_file.save(save_path)

    attachments = report.media_attachments if isinstance(report.media_attachments, list) else []
    attachment = {
        "id": uuid.uuid4().hex,
        "file_name": safe_name,
        "file_url": f"/practical-assessments/media/{unique_name}",
        "file_size": os.path.getsize(save_path),
        "media_type": _media_kind(safe_name),
        "uploaded_at": datetime.utcnow().isoformat(),
        "uploaded_by_user_id": str(user.id),
    }
    report.media_attachments = [*attachments, attachment]
    db.session.commit()
    db.session.refresh(report)
    return {"attachment": attachment, "report": _report_payload(report)}, 201


@bp.get("/practical-assessments/media/<path:filename>")
def serve_practical_assessment_media(filename: str):
    return send_from_directory(os.path.abspath(PRACTICAL_MEDIA_UPLOAD_FOLDER), filename)


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
