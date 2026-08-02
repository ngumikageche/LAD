from __future__ import annotations

import csv
import io
import json
import uuid

from flask import Blueprint, request, send_file, send_from_directory
from openpyxl import Workbook, load_workbook
from openpyxl.utils import get_column_letter

from ..extensions import db
from ..models.assessment import Assessment
from ..models.course import Course
from ..models.score import Score
from ..models.score_evidence import ScoreEvidence
from ..models.student import Student
from ..models.student_subject import StudentSubject
from ..models.subject import Subject
from ..models.enrollment import Enrollment
from ..models.module import Module
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


def _cell_text(value) -> str:
    """Return a stable text value for CSV and XLSX cells."""
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def _read_marks_upload(upload) -> tuple[list[str], list[tuple[int, dict[str, str]]]]:
    """Read marks rows from either CSV or the first worksheet of an XLSX file."""
    filename = str(upload.filename or "")
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if extension == "csv":
        try:
            content = upload.read().decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise ValueError("CSV files must use UTF-8 encoding") from exc
        reader = csv.DictReader(io.StringIO(content))
        if not reader.fieldnames:
            raise ValueError("CSV is empty or has no headers")
        fieldnames = [_cell_text(field).lower() for field in reader.fieldnames]
        rows = []
        for row_number, raw in enumerate(reader, start=2):
            row = {
                _cell_text(key).lower(): _cell_text(value)
                for key, value in raw.items()
                if key is not None
            }
            if any(row.values()):
                rows.append((row_number, row))
        return fieldnames, rows

    if extension == "xlsx":
        try:
            workbook = load_workbook(upload, read_only=True, data_only=True)
        except Exception as exc:
            raise ValueError("The XLSX workbook could not be read") from exc
        worksheet = (
            workbook["Marks Upload"]
            if "Marks Upload" in workbook.sheetnames
            else workbook[workbook.sheetnames[0]]
        )
        values = worksheet.iter_rows(values_only=True)
        headers = next(values, None)
        if not headers:
            raise ValueError("The workbook has no header row")
        fieldnames = [_cell_text(header).lower() for header in headers]
        rows = []
        for row_number, values_row in enumerate(values, start=2):
            row = {
                header: _cell_text(value)
                for header, value in zip(fieldnames, values_row)
                if header
            }
            if any(row.values()):
                rows.append((row_number, row))
        return fieldnames, rows

    raise ValueError("Upload a CSV or XLSX file")


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
    Parse an uploaded CSV or XLSX file and return a preview with validation results.
    Required columns:
        student_id  (STU001 code OR registration_number)
        marks_obtained
        assessment_code  (ASM001 code)
    Optional:
        assessment_id  (legacy; UUID or ASM-code)
        subject_code  (SUB001 code)
        subject_id  (legacy; SUB001 code OR subject UUID)
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
        fieldnames, uploaded_rows = _read_marks_upload(file)
    except ValueError as exc:
        return {"error": str(exc)}, 400

    fields = set(fieldnames)
    # Accept either student_id (new) or registration_number (legacy)
    has_student = "student_id" in fields or "registration_number" in fields
    required = {"marks_obtained"}
    missing = required - fields
    if not has_student:
        missing.add("student_id")
    if "assessment_code" not in fields and "assessment_id" not in fields:
        missing.add("assessment_code")
    if missing:
        return {"error": f"Missing required columns: {', '.join(sorted(missing))}"}, 400

    # Cache lookups
    student_cache: dict[str, Student | None] = {}
    assessment_cache: dict[str, Assessment | None] = {}
    subject_cache: dict[str, Subject | None] = {}

    rows = []
    for i, row in uploaded_rows:

        # Accept student_id (new) or registration_number (legacy)
        student_key = row.get("student_id") or row.get("registration_number", "")
        marks_str = row.get("marks_obtained", "")
        assessment_id_str = row.get("assessment_code") or row.get("assessment_id", "")
        # New exports use the accurately named subject_code column. Keep
        # accepting subject_id so previously downloaded files still work.
        subject_str = row.get("subject_code") or row.get("subject_id", "")
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
            errors.append("assessment_code is required")

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
    "assessment_code",
    "subject_code",
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


def _template_subject_reference(user, assessment: Assessment | None) -> list[list[str]]:
    """Subject reference rows visible to the uploader, optionally scoped by course."""
    query = (
        db.session.query(Subject)
        .join(Module, Module.id == Subject.module_id)
        .join(Course, Course.id == Module.course_id)
        .filter(Subject.deleted_at.is_(None))
    )
    if assessment and assessment.course_id:
        query = query.filter(Module.course_id == assessment.course_id)

    trainer = _uploader_trainer(user)
    if trainer:
        subject_ids = _trainer_subject_ids(trainer)
        if not subject_ids:
            return []
        query = query.filter(Subject.id.in_(subject_ids))

    rows = []
    for subject in query.order_by(Course.name, Module.name, Subject.name).all():
        module = subject.module
        course = module.course if module else None
        rows.append([
            module.code or str(module.id) if module else "",
            module.name if module else "",
            course.code or str(course.id) if course else "",
            course.name if course else "",
            subject.code or str(subject.id),
            subject.name,
        ])
    return rows


def _format_template_sheet(worksheet) -> None:
    worksheet.freeze_panes = "A2"
    worksheet.auto_filter.ref = worksheet.dimensions
    for column_number, cells in enumerate(worksheet.columns, start=1):
        width = min(max(len(str(cell.value or "")) for cell in cells) + 2, 42)
        worksheet.column_dimensions[get_column_letter(column_number)].width = width


@bp.get("/template")
def download_template():
    """
    XLSX template for a marks upload.

    With `assessment_id` (and optionally `subject_code`) it comes back prefilled
    with the class list — one row per learner, marks left blank. The second sheet
    lists module, course, and subject codes available to the uploader.
    """
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

    workbook = Workbook()
    marks_sheet = workbook.active
    marks_sheet.title = "Marks Upload"
    marks_sheet.append(TEMPLATE_HEADER)

    learner_rows = 0
    if assessment:
        term = assessment.term.name if assessment.term else ""
        subject_code = batch_subject.code if batch_subject else ""
        for student in _template_roster(user, assessment, batch_subject):
            marks_sheet.append([
                student.code or student.registration_number,
                student.user.name if student.user else "",
                "",  # marks_obtained — the one column to fill in
                # Use the human-readable assessment code in exported files.
                # Legacy records without a code fall back to their UUID.
                assessment.code or str(assessment.id),
                subject_code,
                term,
                "",
            ])
            learner_rows += 1
        filename = f"marks_template_{assessment.code or 'assessment'}.xlsx"
    else:
        # A generic template must not contain made-up identifiers that look
        # uploadable. Select an assessment to receive a populated class list.
        marks_sheet.append(["", "", "", "", "", "", ""])
        filename = "marks_upload_template.xlsx"
    _format_template_sheet(marks_sheet)

    reference_sheet = workbook.create_sheet("Module Course Subjects")
    reference_sheet.append([
        "module_code",
        "module_name",
        "course_code",
        "course_name",
        "subject_code",
        "subject_name",
    ])
    for reference_row in _template_subject_reference(user, assessment):
        reference_sheet.append(reference_row)
    _format_template_sheet(reference_sheet)

    output = io.BytesIO()
    workbook.save(output)
    output.seek(0)
    response = send_file(
        output,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        as_attachment=True,
        download_name=filename,
    )
    response.headers["X-Template-Rows"] = str(learner_rows)
    response.headers["X-Template-Prefilled"] = "1" if assessment else "0"
    return response


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
