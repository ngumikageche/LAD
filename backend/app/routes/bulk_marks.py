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
from ..models.score_evidence import ScoreEvidence
from ..models.student import Student
from ..models.student_subject import StudentSubject
from ..models.subject import Subject
from ..models.enrollment import Enrollment
from ..models.trainer import Trainer
from ..models.trainer_subject import TrainerSubject
from .permissions import _is_admin
from ..services.score_evidence import (
    EVIDENCE_UPLOAD_FOLDER,
    can_access_score_evidence,
    remove_score_evidence_files,
    save_score_evidence_files,
    usable_score_evidence_files,
)
from .permissions import get_current_user, require_permission

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


def _uploader_trainer(user) -> Trainer | None:
    """Trainer profile of the uploader, or None for admins uploading school-wide."""
    if _is_admin(user):
        return None
    return db.session.query(Trainer).filter(Trainer.user_id == user.id).first()


def _trainer_subject_ids(trainer: Trainer) -> set[uuid.UUID]:
    rows = db.session.query(TrainerSubject.subject_id).filter(
        TrainerSubject.trainer_id == trainer.id
    ).all()
    return {row[0] for row in rows if row[0]}


def _selected_subject(user) -> tuple[Subject | None, dict | None, int | None]:
    """
    Resolve the subject the uploader picked for the whole batch.

    Accepts `subject_code` (SUB001) or `subject_id` (UUID or code) from the form
    body or query string. Returns (subject, error, status).
    """
    raw = (
        request.form.get("subject_code")
        or request.form.get("subject_id")
        or request.args.get("subject_code")
        or request.args.get("subject_id")
        or ""
    ).strip()
    if not raw:
        return None, None, None

    subject = _resolve_subject(raw)
    if not subject or subject.deleted_at:
        return None, {"error": f"Subject '{raw}' not found"}, 404

    trainer = _uploader_trainer(user)
    if trainer and subject.id not in _trainer_subject_ids(trainer):
        return None, {"error": "You are not assigned to this subject"}, 403
    return subject, None, None


@bp.get("/subjects")
def list_subjects():
    """Subjects the uploader may attach marks to, keyed by subject code."""
    user, error, status = require_permission("scores.create")
    if error:
        return error, status

    q = db.session.query(Subject).filter(Subject.deleted_at.is_(None))

    trainer = _uploader_trainer(user)
    if trainer:
        subject_ids = _trainer_subject_ids(trainer)
        if not subject_ids:
            return {"subjects": [], "total": 0, "scope": "trainer"}, 200
        q = q.filter(Subject.id.in_(subject_ids))

    search = (request.args.get("search") or "").strip().lower()
    items = []
    for subject in q.order_by(Subject.code.asc(), Subject.name.asc()).all():
        module = getattr(subject, "module", None)
        course = getattr(module, "course", None)
        if search and search not in f"{subject.code or ''} {subject.name}".lower():
            continue
        items.append({
            "id": str(subject.id),
            "code": subject.code,
            "name": subject.name,
            "module_id": str(subject.module_id) if subject.module_id else None,
            "module_name": module.name if module else None,
            "course_id": str(course.id) if course else None,
            "course_name": course.name if course else None,
        })

    return {
        "subjects": items,
        "total": len(items),
        "scope": "trainer" if trainer else "all",
    }, 200


@bp.get("/assessments")
def list_assessments():
    user, error, status = require_permission("scores.create")
    if error:
        return error, status

    course_id = request.args.get("course_id")
    subject_ref = request.args.get("subject_code") or request.args.get("subject_id")
    q = db.session.query(Assessment)
    q = q.filter(Assessment.assessment_scope == "formative")
    if course_id:
        try:
            q = q.filter(Assessment.course_id == uuid.UUID(course_id))
        except (ValueError, TypeError):
            pass
    if subject_ref:
        subject = _resolve_subject(subject_ref.strip())
        module = getattr(subject, "module", None) if subject else None
        if module and module.course_id:
            q = q.filter(Assessment.course_id == module.course_id)
    items = [
        {
            "id": str(a.id),
            "code": a.code,
            "name": a.name,
            "assessment_type": a.assessment_type,
            "assessment_scope": a.assessment_scope,
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

    A `subject_code` form field selects one subject for the whole batch; rows
    without their own subject_id inherit it.
    """
    user, error, status = require_permission("scores.create")
    if error:
        return error, status

    batch_subject, subject_error, subject_status = _selected_subject(user)
    if subject_error:
        return subject_error, subject_status

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
            elif assessment.assessment_scope != "formative":
                errors.append("Only internal formative assessments can be uploaded")
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

        # Resolve subject — a row's own subject_id wins, otherwise the batch subject
        subject = None
        if subject_str:
            if subject_str not in subject_cache:
                subject_cache[subject_str] = _resolve_subject(subject_str)
            subject = subject_cache[subject_str]
            if not subject:
                errors.append(f"Subject '{subject_str}' not found")
        elif batch_subject:
            subject = batch_subject

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
        "subject": {
            "id": str(batch_subject.id),
            "code": batch_subject.code,
            "name": batch_subject.name,
        } if batch_subject else None,
    }, 200


# ── Commit ────────────────────────────────────────────────────────────────────

@bp.post("/commit")
def commit_bulk():
    user, error, status = require_permission("scores.create")
    if error:
        return error, status

    batch_subject, subject_error, subject_status = _selected_subject(user)
    if subject_error:
        return subject_error, subject_status

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
        # Never trust preview-only flags or calculated values from the client.
        # Re-resolve and validate every row during the write transaction.
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
        if assessment.assessment_scope != "formative":
            errors.append(f"Row {row.get('row')}: summative/external assessment evidence is not permitted")
            skipped += 1
            continue
        assessment_ids.add(assessment_uuid)

        try:
            marks = float(row["marks_obtained"])
        except (TypeError, ValueError):
            skipped += 1
            errors.append(f"Row {row.get('row')}: marks_obtained must be numeric")
            continue
        if marks < 0 or marks > assessment.total_marks:
            errors.append(f"marks_obtained must be 0–{assessment.total_marks}")
            skipped += 1
            continue
        grade = _grade(marks, assessment.total_marks)
        is_passed = marks >= (assessment.pass_marks or assessment.total_marks * 0.5)
        term = row.get("term") or (assessment.term.name if assessment.term else None)
        feedback = row.get("feedback") or None

        # Resolve subject_id (may be a UUID string or a code from preview output).
        # Re-resolve rather than trusting the client, and fall back to the
        # subject the uploader selected for the whole batch.
        subject_id = None
        raw_subject = str(row.get("subject_id") or "").strip()
        if raw_subject:
            row_subject = _resolve_subject(raw_subject)
            if not row_subject:
                errors.append(f"Row {row.get('row')}: subject '{raw_subject}' not found")
                skipped += 1
                continue
            subject_id = row_subject.id
        elif batch_subject:
            subject_id = batch_subject.id
        if subject_id:
            subject_ids.add(subject_id)

        enrollment = db.session.query(Enrollment).filter(
            Enrollment.student_id == student.id,
            Enrollment.course_id == assessment.course_id,
            Enrollment.deleted_at.is_(None),
        ).first()
        if not enrollment:
            errors.append(f"Row {row.get('row')}: student is not enrolled in the assessment course")
            skipped += 1
            continue
        trainer = db.session.query(Trainer).filter(Trainer.user_id == user.id).first()
        if trainer and not _is_admin(user):
            has_access = db.session.query(TrainerSubject).filter(
                TrainerSubject.trainer_id == trainer.id,
                TrainerSubject.subject_id == subject_id,
            ).first() if subject_id else None
            if not has_access:
                from ..models.trainer_course import TrainerCourse
                has_access = db.session.query(TrainerCourse).filter(
                    TrainerCourse.trainer_id == trainer.id,
                    TrainerCourse.course_id == assessment.course_id,
                ).first()
            if not has_access:
                errors.append(f"Row {row.get('row')}: you do not have access to this assessment")
                skipped += 1
                continue

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
                enrollment_id=enrollment.id,
                marks_obtained=marks,
                grade=grade,
                is_passed=is_passed,
                term=term,
                feedback=feedback,
            ))
            inserted += 1

    try:
        saved_evidence = save_score_evidence_files(
            evidence_files,
            uploaded_by=user.id,
            batch_id=batch_id,
            assessment_id=next(iter(assessment_ids)) if len(assessment_ids) == 1 else None,
            subject_id=next(iter(subject_ids)) if len(subject_ids) == 1 else None,
        )
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        remove_score_evidence_files(locals().get("saved_evidence", []))
        return {"error": "Marks could not be saved"}, 409

    return {
        "inserted": inserted,
        "updated": updated,
        "skipped": skipped,
        "errors": errors,
        "batch_id": batch_id,
        "evidence_files": len(evidence_files),
        "subject": {
            "id": str(batch_subject.id),
            "code": batch_subject.code,
            "name": batch_subject.name,
        } if batch_subject else None,
    }, 200


# ── Template download ─────────────────────────────────────────────────────────

TEMPLATE_HEADER = [
    "student_id",
    "student_name",
    "marks_obtained",
    "assessment_id",
    "subject_id",
    "term",
    "feedback",
]


def _template_roster(user, assessment: Assessment, subject: Subject | None) -> list[Student]:
    """
    Learners who may legitimately receive marks for this assessment.

    Mirrors the rules `commit_bulk` enforces — enrolled in the assessment's
    course, and within the uploader's own subjects when they are a trainer — so
    a prefilled row never turns into a rejected one.
    """
    query = (
        db.session.query(Student)
        .join(Enrollment, Enrollment.student_id == Student.id)
        .filter(
            Enrollment.deleted_at.is_(None),
            Student.deleted_at.is_(None),
        )
    )

    if assessment.course_id:
        query = query.filter(Enrollment.course_id == assessment.course_id)

    subject_ids: set[uuid.UUID] | None = None
    if subject:
        subject_ids = {subject.id}
    else:
        trainer = _uploader_trainer(user)
        if trainer:
            subject_ids = _trainer_subject_ids(trainer)
            if not subject_ids:
                return []

    if subject_ids is not None:
        query = query.join(
            StudentSubject, StudentSubject.student_id == Student.id
        ).filter(StudentSubject.subject_id.in_(subject_ids))

    if not assessment.course_id and subject_ids is None:
        # Nothing to scope by — refuse to dump every learner in the institution.
        return []

    return query.distinct().order_by(Student.code.asc()).all()


@bp.get("/template")
def download_template():
    """
    CSV template for a marks upload.

    With `assessment_id` (and optionally `subject_code`) it comes back prefilled
    with the class list — one row per learner, marks left blank. Without one it
    falls back to a single worked example.
    """
    from flask import Response

    user, error, status = require_permission("scores.create")
    if error:
        return error, status

    batch_subject, subject_error, subject_status = _selected_subject(user)
    if subject_error:
        return subject_error, subject_status

    assessment_ref = (
        request.args.get("assessment_id")
        or request.args.get("assessment_code")
        or ""
    ).strip()
    assessment = _resolve_assessment(assessment_ref) if assessment_ref else None
    if assessment_ref and not assessment:
        return {"error": f"Assessment '{assessment_ref}' not found"}, 404

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(TEMPLATE_HEADER)

    learner_rows = 0
    if assessment:
        term = assessment.term.name if assessment.term else ""
        subject_code = batch_subject.code if batch_subject else ""
        for student in _template_roster(user, assessment, batch_subject):
            writer.writerow([
                student.code or student.registration_number,
                student.user.name if student.user else "",
                "",  # marks_obtained — the one column to fill in
                assessment.code or str(assessment.id),
                subject_code,
                term,
                "",
            ])
            learner_rows += 1
        filename = f"marks_template_{assessment.code or 'assessment'}.csv"
    else:
        writer.writerow(["STU001", "Example Learner", "75.5", "ASM001", "SUB001", "Term 1 2026", "Good work"])
        filename = "marks_upload_template.csv"

    return Response(
        buffer.getvalue(),
        mimetype="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "X-Template-Rows": str(learner_rows),
            "X-Template-Prefilled": "1" if assessment else "0",
        },
    )


@bp.get("/evidence/files/<path:filename>")
def serve_evidence_file(filename: str):
    user, error, status = get_current_user()
    if error:
        return error, status
    evidence = db.session.query(ScoreEvidence).filter(
        ScoreEvidence.file_url == f"/scores/evidence/files/{filename}"
    ).first()
    if not evidence or not can_access_score_evidence(user, evidence):
        return {"error": "File not found"}, 404
    return send_from_directory(EVIDENCE_UPLOAD_FOLDER, filename)
