from __future__ import annotations

import csv
import io
import json
import uuid

from flask import Blueprint, request, send_from_directory

from ..extensions import db
from ..models.assessment import Assessment
from ..models.course import Course
from ..models.score import Score
from ..models.student import Student
from ..models.subject import Subject
from ..services.score_evidence import EVIDENCE_UPLOAD_FOLDER, save_score_evidence_files, usable_score_evidence_files
from .permissions import require_permission

bp = Blueprint("bulk_marks", __name__, url_prefix="/scores/bulk-marks")


def _grade(marks: float, total: float) -> str:
    pct = (marks / total * 100) if total else 0
    if pct >= 80: return "A"
    if pct >= 70: return "B"
    if pct >= 60: return "C"
    if pct >= 50: return "D"
    return "F"


def _resolve_student(value: str) -> Student | None:
    """Look up student by STU-code or registration_number."""
    if not value:
        return None
    s = db.session.query(Student).filter_by(code=value).first()
    if s:
        return s
    return db.session.query(Student).filter_by(registration_number=value).first()


def _resolve_subject(value: str) -> Subject | None:
    """Look up subject by SUB-code or UUID."""
    if not value:
        return None
    s = db.session.query(Subject).filter_by(code=value).first()
    if s:
        return s
    try:
        return db.session.get(Subject, uuid.UUID(value))
    except (ValueError, TypeError):
        return None

def _resolve_assessment(value: str) -> Assessment | None:
    """Look up assessment by ASM-code or UUID."""
    if not value:
        return None
    a = db.session.query(Assessment).filter_by(code=value).first()
    if a:
        return a
    try:
        return db.session.get(Assessment, uuid.UUID(value))
    except (ValueError, TypeError):
        return None


@bp.get("/assessments")
def list_assessments():
    user, error, status = require_permission("scores.create")
    if error:
        return error, status

    course_id = request.args.get("course_id")
    q = db.session.query(Assessment)
    if course_id:
        try:
            q = q.filter(Assessment.course_id == uuid.UUID(course_id))
        except (ValueError, TypeError):
            pass
    items = [
        {
            "id": str(a.id),
            "code": a.code,
            "name": a.name,
            "assessment_type": a.assessment_type,
            "total_marks": a.total_marks,
            "pass_marks": a.pass_marks,
            "course_id": str(a.course_id) if a.course_id else None,
            "course_name": a.course.name if a.course else None,
        }
        for a in q.order_by(Assessment.name.asc()).all()
    ]
    return {"assessments": items, "total": len(items)}, 200


# ── Preview / validate ────────────────────────────────────────────────────────

@bp.post("/preview")
def preview_bulk():
    """
    Parse uploaded CSV and return a preview with validation results.
    Required CSV columns:
        student_id  (STU001 code OR registration_number)
        marks_obtained
        assessment_id  (UUID of the assessment)
    Optional:
        subject_id  (SUB001 code OR subject UUID)
        term
        feedback
    """
    user, error, status = require_permission("scores.create")
    if error:
        return error, status

    file = request.files.get("file")
    if not file:
        return {"error": "No file provided"}, 400

    try:
        content = file.read().decode("utf-8-sig")
    except UnicodeDecodeError:
        return {"error": "File must be UTF-8 encoded"}, 400

    reader = csv.DictReader(io.StringIO(content))
    if not reader.fieldnames:
        return {"error": "CSV is empty or has no headers"}, 400

    fields = {f.strip().lower() for f in reader.fieldnames}
    # Accept either student_id (new) or registration_number (legacy)
    has_student = "student_id" in fields or "registration_number" in fields
    required = {"marks_obtained", "assessment_id"}
    missing = required - fields
    if not has_student:
        missing.add("student_id")
    if missing:
        return {"error": f"Missing required columns: {', '.join(sorted(missing))}"}, 400

    # Cache lookups
    student_cache: dict[str, Student | None] = {}
    assessment_cache: dict[str, Assessment | None] = {}
    subject_cache: dict[str, Subject | None] = {}

    rows = []
    for i, raw in enumerate(reader, start=2):
        row: dict = {k.strip().lower(): (v or "").strip() for k, v in raw.items()}

        # Accept student_id (new) or registration_number (legacy)
        student_key = row.get("student_id") or row.get("registration_number", "")
        marks_str = row.get("marks_obtained", "")
        assessment_id_str = row.get("assessment_id", "")
        subject_str = row.get("subject_id", "")
        term = row.get("term", "") or None
        feedback = row.get("feedback", "") or None

        errors = []

        # Validate marks
        try:
            marks = float(marks_str)
        except ValueError:
            marks = None
            errors.append("marks_obtained must be a number")

        # Validate assessment
        assessment = None
        if assessment_id_str:
            if assessment_id_str not in assessment_cache:
                assessment_cache[assessment_id_str] = _resolve_assessment(assessment_id_str)
            assessment = assessment_cache.get(assessment_id_str)
            if not assessment:
                errors.append(f"Assessment '{assessment_id_str}' not found")
        else:
            errors.append("assessment_id is required")

        # Validate marks range
        if marks is not None and assessment:
            if marks < 0 or marks > assessment.total_marks:
                errors.append(f"marks_obtained must be 0–{assessment.total_marks}")

        # Validate student
        student = None
        if student_key:
            if student_key not in student_cache:
                student_cache[student_key] = _resolve_student(student_key)
            student = student_cache[student_key]
            if not student:
                errors.append(f"Student '{student_key}' not found")
        else:
            errors.append("student_id is required")

        # Resolve subject (optional)
        subject = None
        if subject_str:
            if subject_str not in subject_cache:
                subject_cache[subject_str] = _resolve_subject(subject_str)
            subject = subject_cache[subject_str]
            if not subject:
                errors.append(f"Subject '{subject_str}' not found")

        # Compute grade
        grade = None
        is_passed = None
        if marks is not None and assessment:
            grade = _grade(marks, assessment.total_marks)
            is_passed = marks >= (assessment.pass_marks or assessment.total_marks * 0.5)

        rows.append({
            "row": i,
            "student_id": student_key,
            "student_code": student.code if student else None,
            "student_name": student.user.name if student and student.user else None,
            "registration_number": student.registration_number if student else student_key,
            "assessment_id": str(assessment.id) if assessment else assessment_id_str,
            "assessment_code": assessment.code if assessment else None,
            "assessment_name": assessment.name if assessment else None,
            "subject_id": str(subject.id) if subject else (subject_str or None),
            "subject_code": subject.code if subject else None,
            "subject_name": subject.name if subject else None,
            "marks_obtained": marks,
            "total_marks": assessment.total_marks if assessment else None,
            "grade": grade,
            "is_passed": is_passed,
            "term": term,
            "feedback": feedback,
            "errors": errors,
            "valid": len(errors) == 0,
        })

    valid_count = sum(1 for r in rows if r["valid"])
    return {
        "total": len(rows),
        "valid": valid_count,
        "invalid": len(rows) - valid_count,
        "rows": rows,
    }, 200


# ── Commit ────────────────────────────────────────────────────────────────────

@bp.post("/commit")
def commit_bulk():
    user, error, status = require_permission("scores.create")
    if error:
        return error, status

    evidence_files = usable_score_evidence_files(request.files.getlist("exam_copies"))
    if not evidence_files:
        return {"error": "Upload at least one physical exam copy before committing marks"}, 400

    if not (request.content_type and request.content_type.startswith("multipart/form-data")):
        return {"error": "Use multipart/form-data and include exam_copies files"}, 400

    try:
        payload = {"rows": json.loads(request.form.get("rows", "[]"))}
    except json.JSONDecodeError:
        return {"error": "'rows' must be valid JSON"}, 400

    rows = payload.get("rows", [])
    if not rows:
        return {"error": "No rows provided"}, 400

    batch_id = uuid.uuid4().hex
    inserted = 0
    updated = 0
    skipped = 0
    errors = []
    assessment_ids = set()
    subject_ids = set()

    for row in rows:
        if not row.get("valid"):
            skipped += 1
            continue

        student_key = row.get("student_id") or row.get("registration_number", "")
        student = _resolve_student(student_key)
        if not student:
            errors.append(f"Row {row.get('row')}: student '{student_key}' not found")
            skipped += 1
            continue

        try:
            assessment_uuid = uuid.UUID(row["assessment_id"])
        except (ValueError, TypeError, KeyError):
            skipped += 1
            continue

        assessment = db.session.get(Assessment, assessment_uuid)
        if not assessment:
            skipped += 1
            continue
        assessment_ids.add(assessment_uuid)

        marks = float(row["marks_obtained"])
        grade = row.get("grade") or _grade(marks, assessment.total_marks)
        is_passed = bool(row.get("is_passed"))
        term = row.get("term") or None
        feedback = row.get("feedback") or None

        # Resolve subject_id (may be a UUID string from preview output)
        subject_id = None
        if row.get("subject_id"):
            try:
                subject_id = uuid.UUID(row["subject_id"])
                subject_ids.add(subject_id)
            except (ValueError, TypeError):
                pass

        existing = (
            db.session.query(Score)
            .filter_by(student_id=student.id, assessment_id=assessment_uuid)
            .first()
        )

        if existing:
            existing.marks_obtained = marks
            existing.grade = grade
            existing.is_passed = is_passed
            existing.term = term
            existing.feedback = feedback
            if subject_id:
                existing.subject_id = subject_id
            updated += 1
        else:
            db.session.add(Score(
                student_id=student.id,
                assessment_id=assessment_uuid,
                subject_id=subject_id,
                marks_obtained=marks,
                grade=grade,
                is_passed=is_passed,
                term=term,
                feedback=feedback,
            ))
            inserted += 1

    try:
        save_score_evidence_files(
            evidence_files,
            uploaded_by=user.id,
            batch_id=batch_id,
            assessment_id=next(iter(assessment_ids)) if len(assessment_ids) == 1 else None,
            subject_id=next(iter(subject_ids)) if len(subject_ids) == 1 else None,
        )
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        return {"error": str(exc)}, 500

    return {
        "inserted": inserted,
        "updated": updated,
        "skipped": skipped,
        "errors": errors,
        "batch_id": batch_id,
        "evidence_files": len(evidence_files),
    }, 200


# ── Template download ─────────────────────────────────────────────────────────

@bp.get("/template")
def download_template():
    from flask import Response
    header = "student_id,marks_obtained,assessment_id,subject_id,term,feedback\n"
    example = "STU001,75.5,ASM001,SUB001,Term 1 2026,Good work\n"
    return Response(
        header + example,
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=marks_upload_template.csv"},
    )


@bp.get("/evidence/files/<path:filename>")
def serve_evidence_file(filename: str):
    return send_from_directory(EVIDENCE_UPLOAD_FOLDER, filename)
