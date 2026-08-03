"""
Summary and detailed reporting over practical assessments and exam results.

Two report families, each in a summary and a detailed flavour:

* ``/reports/assessments/practical/...`` — CDACC practical assessment records,
  aggregated by unit, assessor, and course, or listed per learner with the full
  task-by-task breakdown.
* ``/reports/assessments/exams/...`` — recorded exam/assignment scores,
  aggregated by assessment, subject, and course, or listed per score entry.

Admins see the whole institution. Trainers holding the matching report
permission see only their own work: practical reports they assessed, and scores
for the subjects they teach. Students are always blocked.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime
import uuid

from flask import Blueprint, request

from ..extensions import db
from ..models.assessment import Assessment
from ..models.course import Course
from ..models.department import Department
from ..models.practical_assessment_report import PracticalAssessmentReport
from ..models.score import Score
from ..models.student import Student
from ..models.subject import Subject
from ..models.term import Term
from ..models.trainer import Trainer
from ..models.trainer_subject import TrainerSubject
from ..models.user import User
from .permissions import (
    get_current_user,
    log_view,
    _has_permission,
    _is_admin,
    _is_student,
    _is_trainer,
)
from .practical_assessments import (
    _safe_computed_scores,
    _safe_oral_questions,
    _safe_report_sections,
    _safe_task_rows,
    _score_percentage,
    _section_score_summary,
)

bp = Blueprint("assessment_reports", __name__, url_prefix="/reports/assessments")

PASS_MARK = 50.0
PRACTICAL_PERMISSION = "reports.practical.assessment"
EXAM_PERMISSION = "reports.admin.pass_rate"

DETAIL_ROW_LIMIT_DEFAULT = 1000
DETAIL_ROW_LIMIT_MAX = 5000

OUTCOME_ORDER = ["COMPETENT", "BORDERLINE", "NOT YET COMPETENT", "INCOMPLETE"]


# ── Access ───────────────────────────────────────────────────────────────────

def _require_report_access(permission_key: str):
    """
    Admins always pass. Other staff need the report permission (or its `.view`
    variant) so a trainer or manager can be granted the report without being
    made an admin. Students are always blocked.
    """
    user, error, status = get_current_user()
    if error:
        return None, error, status
    if _is_admin(user):
        return user, None, None
    if _is_student(user):
        return None, {"error": "Permission denied"}, 403
    if not (
        _has_permission(user, permission_key)
        or _has_permission(user, f"{permission_key}.view")
    ):
        return None, {"error": "Permission denied"}, 403
    return user, None, None


def _scope_trainer(user: User) -> Trainer | None:
    """The trainer whose own work a non-admin caller is limited to."""
    if _is_admin(user) or not _is_trainer(user):
        return None
    return db.session.query(Trainer).filter(Trainer.user_id == user.id).first()


def _school_info(user: User) -> dict:
    institution = user.institution
    return {
        "name": institution.name if institution else "Learning & Development",
        "location": institution.location if institution else "",
    }


def _parse_uuid_arg(value: str | None) -> uuid.UUID | None:
    if not value:
        return None
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError):
        return None


def _parse_date_arg(value: str | None) -> datetime | None:
    if not value:
        return None
    for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(value[:19] if "T" in value else value, fmt)
        except ValueError:
            continue
    return None


def _detail_limit() -> int:
    raw = request.args.get("limit")
    try:
        requested = int(raw) if raw else DETAIL_ROW_LIMIT_DEFAULT
    except (TypeError, ValueError):
        requested = DETAIL_ROW_LIMIT_DEFAULT
    return max(1, min(requested, DETAIL_ROW_LIMIT_MAX))


def _pct(part: float, whole: float) -> float:
    return round(part / whole * 100, 1) if whole else 0.0


def _avg(values: list[float]) -> float | None:
    return round(sum(values) / len(values), 1) if values else None


# ── Practical assessments ────────────────────────────────────────────────────

def _practical_query(user: User, scope_trainer: Trainer | None):
    query = db.session.query(PracticalAssessmentReport).filter(
        PracticalAssessmentReport.deleted_at.is_(None)
    )
    if scope_trainer:
        query = query.filter(PracticalAssessmentReport.trainer_id == scope_trainer.id)

    course_id = _parse_uuid_arg(request.args.get("course_id"))
    if course_id:
        query = query.join(Student, Student.id == PracticalAssessmentReport.student_id).filter(
            Student.course_id == course_id
        )

    trainer_id = _parse_uuid_arg(request.args.get("trainer_id"))
    if trainer_id and not scope_trainer:
        query = query.filter(PracticalAssessmentReport.trainer_id == trainer_id)

    status_filter = request.args.get("status")
    if status_filter and status_filter != "all":
        query = query.filter(PracticalAssessmentReport.status == status_filter)

    unit_code = request.args.get("unit_code")
    if unit_code and unit_code != "all":
        query = query.filter(PracticalAssessmentReport.unit_code == unit_code)

    date_from = _parse_date_arg(request.args.get("date_from"))
    if date_from:
        query = query.filter(PracticalAssessmentReport.assessment_date >= date_from)
    date_to = _parse_date_arg(request.args.get("date_to"))
    if date_to:
        query = query.filter(PracticalAssessmentReport.assessment_date <= date_to)

    return query.order_by(PracticalAssessmentReport.assessment_date.desc().nullslast())


def _practical_metrics(report: PracticalAssessmentReport) -> dict:
    """Score totals for one report, tolerant of legacy and malformed payloads."""
    task_rows = _safe_task_rows(report)
    oral_questions = _safe_oral_questions(report)
    sections = _safe_report_sections(report, task_rows, oral_questions)
    section_total, section_max, section_pct = _section_score_summary(sections)

    total_score, outcome = _safe_computed_scores(report)
    if section_total is not None:
        total_score = section_total

    if section_max is not None:
        total_max = section_max
    elif task_rows:
        total_max = sum(
            float(item.get("max_score") or PracticalAssessmentReport.MAX_TASK_SCORE)
            for item in task_rows
        )
    else:
        total_max = float(PracticalAssessmentReport.MAX_TASK_SCORE * 4)

    percentage = section_pct if section_pct is not None else _score_percentage(task_rows)

    return {
        "task_rows": task_rows,
        "oral_questions": oral_questions,
        "sections": sections,
        "total_score": total_score,
        "total_max_score": total_max,
        "score_percentage": percentage,
        "competency_outcome": outcome or "INCOMPLETE",
    }


def _practical_group_stats(entries: list[dict]) -> dict:
    percentages = [e["score_percentage"] for e in entries if e["score_percentage"] is not None]
    competent = sum(1 for e in entries if e["competency_outcome"] == "COMPETENT")
    return {
        "reports": len(entries),
        "learners": len({e["student_id"] for e in entries}),
        "avg_score_pct": _avg(percentages),
        "competent": competent,
        "competency_rate": _pct(competent, len(entries)),
    }


def _practical_dataset(user: User):
    """Shared row build for both the summary and detailed practical reports."""
    scope_trainer = _scope_trainer(user)
    reports = _practical_query(user, scope_trainer).all()

    outcome_filter = (request.args.get("outcome") or "all").upper()
    rows: list[dict] = []
    for report in reports:
        metrics = _practical_metrics(report)
        if outcome_filter != "ALL" and metrics["competency_outcome"] != outcome_filter:
            continue

        student = report.student
        trainer = report.trainer
        course = student.course if student else None
        rows.append(
            {
                "report_id": str(report.id),
                "student_id": str(report.student_id),
                "student_name": student.user.name if student and student.user else "Unnamed learner",
                "registration_number": (student.registration_number if student else None) or "—",
                "course_id": str(student.course_id) if student and student.course_id else None,
                "course_name": course.name if course else "—",
                "trainer_id": str(report.trainer_id),
                "assessor_name": trainer.user.name if trainer and trainer.user else "—",
                "unit_code": report.unit_code,
                "unit_of_competency": report.unit_of_competency,
                "qualification": report.qualification,
                "assessment_date": report.assessment_date.isoformat() if report.assessment_date else None,
                "assessment_venue": report.assessment_venue,
                "company_name": report.company_name,
                "status": report.status,
                "released_at": report.released_at.isoformat() if report.released_at else None,
                "total_score": metrics["total_score"],
                "total_max_score": metrics["total_max_score"],
                "score_percentage": metrics["score_percentage"],
                "competency_outcome": metrics["competency_outcome"],
                "general_remarks": report.general_remarks,
                "_metrics": metrics,
            }
        )
    return rows, scope_trainer


def _practical_summary_block(rows: list[dict]) -> dict:
    percentages = [r["score_percentage"] for r in rows if r["score_percentage"] is not None]
    outcomes = defaultdict(int)
    for row in rows:
        outcomes[row["competency_outcome"]] += 1
    statuses = defaultdict(int)
    for row in rows:
        statuses[row["status"]] += 1

    scored = sum(outcomes[key] for key in OUTCOME_ORDER if key != "INCOMPLETE")
    return {
        "total_reports": len(rows),
        "learners_assessed": len({r["student_id"] for r in rows}),
        "units_covered": len({r["unit_code"] for r in rows if r["unit_code"]}),
        "assessors": len({r["trainer_id"] for r in rows}),
        "draft": statuses.get("draft", 0),
        "complete": statuses.get("complete", 0),
        "released": statuses.get("released", 0),
        "competent": outcomes.get("COMPETENT", 0),
        "borderline": outcomes.get("BORDERLINE", 0),
        "not_yet_competent": outcomes.get("NOT YET COMPETENT", 0),
        "incomplete": outcomes.get("INCOMPLETE", 0),
        "competency_rate": _pct(outcomes.get("COMPETENT", 0), scored),
        "average_score_pct": _avg(percentages),
        "highest_score_pct": max(percentages) if percentages else None,
        "lowest_score_pct": min(percentages) if percentages else None,
    }


def _practical_filter_options(user: User, scope_trainer: Trainer | None) -> dict:
    units_query = db.session.query(
        PracticalAssessmentReport.unit_code, PracticalAssessmentReport.unit_of_competency
    ).filter(PracticalAssessmentReport.deleted_at.is_(None))
    trainers_query = db.session.query(Trainer).filter(Trainer.deleted_at.is_(None))
    if scope_trainer:
        units_query = units_query.filter(PracticalAssessmentReport.trainer_id == scope_trainer.id)
        trainers_query = trainers_query.filter(Trainer.id == scope_trainer.id)

    courses_query = db.session.query(Course).filter(Course.deleted_at.is_(None))
    if user.institution_id:
        courses_query = courses_query.join(
            Department, Department.id == Course.department_id
        ).filter(Department.institution_id == user.institution_id)

    return {
        "courses": [
            {"id": str(course.id), "name": course.name}
            for course in courses_query.order_by(Course.name.asc()).all()
        ],
        "trainers": [
            {"id": str(trainer.id), "name": trainer.user.name if trainer.user else "Unnamed assessor"}
            for trainer in trainers_query.all()
        ],
        "units": [
            {"unit_code": code, "unit_of_competency": name}
            for code, name in sorted({(code, name) for code, name in units_query.all() if code})
        ],
        "statuses": ["draft", "complete", "released"],
        "outcomes": OUTCOME_ORDER,
    }


def _applied_practical_filters() -> dict:
    return {
        "course_id": request.args.get("course_id") or None,
        "trainer_id": request.args.get("trainer_id") or None,
        "status": request.args.get("status") or "all",
        "outcome": request.args.get("outcome") or "all",
        "unit_code": request.args.get("unit_code") or "all",
        "date_from": request.args.get("date_from") or None,
        "date_to": request.args.get("date_to") or None,
    }


@bp.get("/practical/summary")
def practical_summary():
    """Aggregated competency outcomes across practical assessment records."""
    user, error, status = _require_report_access(PRACTICAL_PERMISSION)
    if error:
        return error, status

    rows, scope_trainer = _practical_dataset(user)

    by_unit: dict[tuple[str, str], list[dict]] = defaultdict(list)
    by_assessor: dict[str, list[dict]] = defaultdict(list)
    by_course: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        by_unit[(row["unit_code"] or "—", row["unit_of_competency"] or "—")].append(row)
        by_assessor[row["trainer_id"]].append(row)
        by_course[row["course_id"] or "—"].append(row)

    summary = _practical_summary_block(rows)
    outcome_distribution = [
        {
            "outcome": outcome,
            "count": sum(1 for row in rows if row["competency_outcome"] == outcome),
            "pct": _pct(sum(1 for row in rows if row["competency_outcome"] == outcome), len(rows)),
        }
        for outcome in OUTCOME_ORDER
    ]

    result = {
        "school": _school_info(user),
        "scope": "own" if scope_trainer else "institution",
        "summary": summary,
        "outcome_distribution": outcome_distribution,
        "by_unit": sorted(
            [
                {
                    "unit_code": code,
                    "unit_of_competency": name,
                    **_practical_group_stats(entries),
                }
                for (code, name), entries in by_unit.items()
            ],
            key=lambda item: item["reports"],
            reverse=True,
        ),
        "by_assessor": sorted(
            [
                {
                    "trainer_id": trainer_id,
                    "assessor_name": entries[0]["assessor_name"],
                    **_practical_group_stats(entries),
                }
                for trainer_id, entries in by_assessor.items()
            ],
            key=lambda item: item["reports"],
            reverse=True,
        ),
        "by_course": sorted(
            [
                {
                    "course_id": None if course_id == "—" else course_id,
                    "course_name": entries[0]["course_name"],
                    **_practical_group_stats(entries),
                }
                for course_id, entries in by_course.items()
            ],
            key=lambda item: item["reports"],
            reverse=True,
        ),
        "filter_options": _practical_filter_options(user, scope_trainer),
        "applied_filters": _applied_practical_filters(),
        "generated_at": datetime.utcnow().isoformat(),
        "generated_by": user.name,
    }

    log_view(user, "report.assessments.practical_summary", metadata={"reports": len(rows)})
    return result, 200


@bp.get("/practical/detailed")
def practical_detailed():
    """Per-learner practical assessment records with the task-level breakdown."""
    user, error, status = _require_report_access(PRACTICAL_PERMISSION)
    if error:
        return error, status

    rows, scope_trainer = _practical_dataset(user)
    limit = _detail_limit()
    truncated = len(rows) > limit

    detailed = []
    for row in rows[:limit]:
        metrics = row.pop("_metrics")
        tasks = []
        for section in metrics["sections"]:
            for item in section.get("items") or []:
                tasks.append(
                    {
                        "section": section.get("title") or f"Section {section.get('number')}",
                        "number": item.get("number"),
                        "prompt": item.get("prompt"),
                        "score": item.get("score"),
                        "max_score": item.get("max_score"),
                        "remark": item.get("remark"),
                    }
                )
        if not tasks:
            tasks = [
                {
                    "section": "Tasks",
                    "number": item.get("number"),
                    "prompt": item.get("description"),
                    "score": item.get("score"),
                    "max_score": item.get("max_score"),
                    "remark": item.get("remark"),
                }
                for item in metrics["task_rows"]
            ]

        oral = metrics["oral_questions"]
        detailed.append(
            {
                **row,
                "tasks": tasks,
                "tasks_scored": sum(1 for task in tasks if task["score"] is not None),
                "tasks_total": len(tasks),
                "oral_questions_total": len(oral),
                "oral_questions_scored": sum(
                    1 for question in oral if question.get("awarded_score") is not None
                ),
            }
        )

    for row in rows[limit:]:
        row.pop("_metrics", None)

    result = {
        "school": _school_info(user),
        "scope": "own" if scope_trainer else "institution",
        "summary": _practical_summary_block(rows),
        "rows": detailed,
        "row_count": len(detailed),
        "total_matching": len(rows),
        "truncated": truncated,
        "filter_options": _practical_filter_options(user, scope_trainer),
        "applied_filters": _applied_practical_filters(),
        "generated_at": datetime.utcnow().isoformat(),
        "generated_by": user.name,
    }

    log_view(user, "report.assessments.practical_detailed", metadata={"rows": len(detailed)})
    return result, 200


# ── Exam results ─────────────────────────────────────────────────────────────

def _grade_band(percentage: float | None) -> str:
    if percentage is None:
        return "—"
    if percentage >= 80:
        return "A"
    if percentage >= 70:
        return "B"
    if percentage >= 60:
        return "C"
    if percentage >= 50:
        return "D"
    return "E"


def _exam_query(user: User, scope_trainer: Trainer | None):
    query = db.session.query(Score).filter(Score.deleted_at.is_(None))

    if scope_trainer:
        taught_subject_ids = [
            row[0]
            for row in db.session.query(TrainerSubject.subject_id)
            .filter(TrainerSubject.trainer_id == scope_trainer.id)
            .all()
        ]
        query = query.filter(
            db.or_(
                Score.trainer_id == scope_trainer.id,
                Score.subject_id.in_(taught_subject_ids) if taught_subject_ids else False,
            )
        )

    term_id = _parse_uuid_arg(request.args.get("term_id"))
    if term_id:
        term = db.session.get(Term, term_id)
        if term:
            query = query.filter(Score.term == term.name)

    course_id = _parse_uuid_arg(request.args.get("course_id"))
    if course_id:
        query = query.join(Student, Student.id == Score.student_id).filter(
            Student.course_id == course_id
        )

    subject_id = _parse_uuid_arg(request.args.get("subject_id"))
    if subject_id:
        query = query.filter(Score.subject_id == subject_id)

    assessment_id = _parse_uuid_arg(request.args.get("assessment_id"))
    if assessment_id:
        query = query.filter(Score.assessment_id == assessment_id)

    assessment_type = request.args.get("assessment_type")
    if assessment_type and assessment_type != "all":
        query = query.join(Assessment, Assessment.id == Score.assessment_id).filter(
            Assessment.assessment_type == assessment_type
        )

    return query.order_by(Score.created_at.desc())


def _exam_row(score: Score) -> dict:
    student = score.student or (score.enrollment.student if score.enrollment else None)
    assessment = score.assessment
    total_marks = float(assessment.total_marks) if assessment and assessment.total_marks else 100.0
    percentage = round(score.marks_obtained / total_marks * 100, 1) if total_marks else None
    pass_mark = float(assessment.pass_marks) if assessment and assessment.pass_marks else PASS_MARK
    passed = score.is_passed if score.is_passed is not None else score.marks_obtained >= pass_mark

    return {
        "score_id": str(score.id),
        "student_id": str(student.id) if student else None,
        "student_name": student.user.name if student and student.user else "Unnamed learner",
        "registration_number": (student.registration_number if student else None) or "—",
        "course_id": str(student.course_id) if student and student.course_id else None,
        "course_name": student.course.name if student and student.course else "—",
        "subject_id": str(score.subject_id) if score.subject_id else None,
        "subject_name": score.subject.name if score.subject else "—",
        "assessment_id": str(score.assessment_id) if score.assessment_id else None,
        "assessment_name": assessment.name if assessment else "Continuous assessment",
        "assessment_type": assessment.assessment_type if assessment else "score",
        "term": score.term or "—",
        "marks_obtained": score.marks_obtained,
        "total_marks": total_marks,
        "percentage": percentage,
        "grade": score.grade or _grade_band(percentage),
        "outcome": "Pass" if passed else "Fail",
        "passed": bool(passed),
        "trainer_name": score.trainer.user.name if score.trainer and score.trainer.user else "—",
        "feedback": score.feedback,
        "recorded_at": score.created_at.isoformat() if score.created_at else None,
    }


def _exam_group_stats(entries: list[dict]) -> dict:
    percentages = [e["percentage"] for e in entries if e["percentage"] is not None]
    marks = [e["marks_obtained"] for e in entries]
    passed = sum(1 for e in entries if e["passed"])
    return {
        "entries": len(entries),
        "learners": len({e["student_id"] for e in entries if e["student_id"]}),
        "avg_marks": _avg(marks),
        "avg_pct": _avg(percentages),
        "pass_pct": _pct(passed, len(entries)),
        "fail_pct": round(100 - _pct(passed, len(entries)), 1),
        "highest": max(marks) if marks else None,
        "lowest": min(marks) if marks else None,
    }


def _exam_summary_block(rows: list[dict]) -> dict:
    percentages = [r["percentage"] for r in rows if r["percentage"] is not None]
    marks = [r["marks_obtained"] for r in rows]
    passed = sum(1 for r in rows if r["passed"])
    return {
        "total_entries": len(rows),
        "learners_assessed": len({r["student_id"] for r in rows if r["student_id"]}),
        "assessments_covered": len({r["assessment_id"] for r in rows if r["assessment_id"]}),
        "subjects_covered": len({r["subject_id"] for r in rows if r["subject_id"]}),
        "average_mark": _avg(marks),
        "average_pct": _avg(percentages),
        "pass_rate": _pct(passed, len(rows)),
        "passed": passed,
        "failed": len(rows) - passed,
        "highest_mark": max(marks) if marks else None,
        "lowest_mark": min(marks) if marks else None,
    }


def _exam_filter_options(user: User, scope_trainer: Trainer | None) -> dict:
    subjects_query = db.session.query(Subject).filter(Subject.deleted_at.is_(None))
    if scope_trainer:
        subjects_query = subjects_query.join(
            TrainerSubject, TrainerSubject.subject_id == Subject.id
        ).filter(TrainerSubject.trainer_id == scope_trainer.id)

    courses_query = db.session.query(Course).filter(Course.deleted_at.is_(None))
    if user.institution_id:
        courses_query = courses_query.join(
            Department, Department.id == Course.department_id
        ).filter(Department.institution_id == user.institution_id)

    return {
        "terms": [
            {"id": str(term.id), "name": term.name}
            for term in db.session.query(Term)
            .filter(Term.deleted_at.is_(None))
            .order_by(Term.start_date.desc())
            .all()
        ],
        "courses": [
            {"id": str(course.id), "name": course.name}
            for course in courses_query.order_by(Course.name.asc()).all()
        ],
        "subjects": [
            {"id": str(subject.id), "name": subject.name}
            for subject in subjects_query.order_by(Subject.name.asc()).all()
        ],
        "assessments": [
            {"id": str(item.id), "name": item.name, "assessment_type": item.assessment_type}
            for item in db.session.query(Assessment)
            .filter(Assessment.deleted_at.is_(None))
            .order_by(Assessment.name.asc())
            .all()
        ],
        "assessment_types": ["exam", "assignment", "quiz", "project"],
    }


def _applied_exam_filters() -> dict:
    return {
        "term_id": request.args.get("term_id") or None,
        "course_id": request.args.get("course_id") or None,
        "subject_id": request.args.get("subject_id") or None,
        "assessment_id": request.args.get("assessment_id") or None,
        "assessment_type": request.args.get("assessment_type") or "all",
    }


@bp.get("/exams/summary")
def exam_summary():
    """Exam and assignment outcomes aggregated by assessment, subject, and course."""
    user, error, status = _require_report_access(EXAM_PERMISSION)
    if error:
        return error, status

    scope_trainer = _scope_trainer(user)
    rows = [_exam_row(score) for score in _exam_query(user, scope_trainer).all()]

    by_assessment: dict[str, list[dict]] = defaultdict(list)
    by_subject: dict[str, list[dict]] = defaultdict(list)
    by_course: dict[str, list[dict]] = defaultdict(list)
    grades: dict[str, int] = defaultdict(int)
    for row in rows:
        by_assessment[row["assessment_id"] or "—"].append(row)
        by_subject[row["subject_id"] or "—"].append(row)
        by_course[row["course_id"] or "—"].append(row)
        grades[row["grade"]] += 1

    result = {
        "school": _school_info(user),
        "scope": "own" if scope_trainer else "institution",
        "summary": _exam_summary_block(rows),
        "by_assessment": sorted(
            [
                {
                    "assessment_id": None if key == "—" else key,
                    "assessment_name": entries[0]["assessment_name"],
                    "assessment_type": entries[0]["assessment_type"],
                    "total_marks": entries[0]["total_marks"],
                    **_exam_group_stats(entries),
                }
                for key, entries in by_assessment.items()
            ],
            key=lambda item: item["entries"],
            reverse=True,
        ),
        "by_subject": sorted(
            [
                {
                    "subject_id": None if key == "—" else key,
                    "subject_name": entries[0]["subject_name"],
                    **_exam_group_stats(entries),
                }
                for key, entries in by_subject.items()
            ],
            key=lambda item: item["avg_pct"] or 0,
            reverse=True,
        ),
        "by_course": sorted(
            [
                {
                    "course_id": None if key == "—" else key,
                    "course_name": entries[0]["course_name"],
                    **_exam_group_stats(entries),
                }
                for key, entries in by_course.items()
            ],
            key=lambda item: item["avg_pct"] or 0,
            reverse=True,
        ),
        "grade_distribution": [
            {"grade": grade, "count": count, "pct": _pct(count, len(rows))}
            for grade, count in sorted(grades.items())
        ],
        "filter_options": _exam_filter_options(user, scope_trainer),
        "applied_filters": _applied_exam_filters(),
        "generated_at": datetime.utcnow().isoformat(),
        "generated_by": user.name,
    }

    log_view(user, "report.assessments.exam_summary", metadata={"entries": len(rows)})
    return result, 200


@bp.get("/exams/detailed")
def exam_detailed():
    """Every recorded score entry, one row per learner per assessment."""
    user, error, status = _require_report_access(EXAM_PERMISSION)
    if error:
        return error, status

    scope_trainer = _scope_trainer(user)
    rows = [_exam_row(score) for score in _exam_query(user, scope_trainer).all()]
    limit = _detail_limit()

    result = {
        "school": _school_info(user),
        "scope": "own" if scope_trainer else "institution",
        "summary": _exam_summary_block(rows),
        "rows": rows[:limit],
        "row_count": len(rows[:limit]),
        "total_matching": len(rows),
        "truncated": len(rows) > limit,
        "filter_options": _exam_filter_options(user, scope_trainer),
        "applied_filters": _applied_exam_filters(),
        "generated_at": datetime.utcnow().isoformat(),
        "generated_by": user.name,
    }

    log_view(user, "report.assessments.exam_detailed", metadata={"rows": len(result["rows"])})
    return result, 200
