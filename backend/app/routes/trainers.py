from __future__ import annotations

import uuid
import re
import secrets

from flask import Blueprint, current_app, request, send_file
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from werkzeug.security import generate_password_hash

from ..extensions import db
from ..models.course import Course
from ..models.department import Department
from ..models.module import Module
from ..models.role_permission import RolePermission
from ..models.score import Score
from ..models.student import Student
from ..models.student_subject import StudentSubject
from ..models.subject import Subject
from ..models.trainer import Trainer
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
from ..services.scoping import (
    can_view_master_data,
    scope_students,
    scope_trainers,
    trainer_subject_ids,
)
from .permissions import get_current_user, log_view, require_permission, trainer_required
from ..services.bulk_people_import import (
    apply_if_present,
    build_template,
    conflict_response,
    first_value,
    normalize_lookup,
    read_people_upload,
    resolve_conflict_mode,
)


bp = Blueprint("trainers", __name__, url_prefix="/trainers")


def _parse_uuid(value: str | None, field: str) -> uuid.UUID:
    if not value:
        raise ValueError(f"Missing '{field}'")
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError) as exc:
        raise ValueError(f"Invalid '{field}'") from exc


def _trainer_payload(trainer: Trainer) -> dict:
    subject_ids = [
        str(row.subject_id)
        for row in db.session.query(TrainerSubject.subject_id)
        .filter(TrainerSubject.trainer_id == trainer.id)
        .all()
    ]
    return {
        "id": str(trainer.id),
        "code": trainer.code,
        "user_id": str(trainer.user_id),
        "department_id": str(trainer.department_id),
        "specialization": trainer.specialization,
        "subject_ids": subject_ids,
        "user": {
            "id": str(trainer.user.id),
            "name": trainer.user.name,
            "email": trainer.user.email,
            "phone": trainer.user.phone,
            "role_id": str(trainer.user.role_id),
            "institution_id": str(trainer.user.institution_id) if trainer.user.institution_id else None,
        },
        "created_at": trainer.created_at.isoformat() if trainer.created_at else None,
    }


def _course_payload(course: Course) -> dict:
    return {
        "id": str(course.id),
        "code": course.code,
        "department_id": str(course.department_id),
        "name": course.name,
        "cbet_level": course.cbet_level,
        "created_at": course.created_at.isoformat() if course.created_at else None,
    }


def _student_payload(student: Student) -> dict:
    return {
        "id": str(student.id),
        "code": student.code,
        "user_id": str(student.user_id),
        "registration_number": student.registration_number,
        "course_id": str(student.course_id),
        "enrollment_year": student.enrollment_year,
        "user": {
            "id": str(student.user.id),
            "name": student.user.name,
            "email": student.user.email,
            "phone": student.user.phone,
            "role_id": str(student.user.role_id),
            "institution_id": str(student.user.institution_id) if student.user.institution_id else None,
        },
        "created_at": student.created_at.isoformat() if student.created_at else None,
    }


def _trainer_in_scope(user, trainer_uuid) -> Trainer | None:
    return scope_trainers(db.session.query(Trainer), user).filter(Trainer.id == trainer_uuid).first()


def _trainer_for_user(user_id: uuid.UUID) -> Trainer | None:
    return db.session.query(Trainer).filter(Trainer.user_id == user_id).first()


TRAINER_IMPORT_HEADERS = [
    "Staff No",
    "Name",
    "Email",
    "Mobile",
    "Department",
    "Specialization",
    "Subjects",
]


@bp.get("/import-template")
def trainer_import_template():
    _, error, status = require_permission("data.import")
    if error:
        return error, status
    output = build_template(
        TRAINER_IMPORT_HEADERS,
        "Trainers Template",
        [
            "TRN-001",
            "Trainer Example",
            "trainer@example.edu",
            "0712345678",
            "Enter exact department name or code",
            "Electrical installation",
            "Electrical Safety; Motor Rewinding",
        ],
    )
    return send_file(
        output,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        as_attachment=True,
        download_name="trainersTemplate.xlsx",
    )


@bp.post("/bulk-upload")
def bulk_upload_trainers():
    actor, error, status = require_permission("data.import")
    if error:
        return error, status
    upload = request.files.get("file")
    if not upload or not upload.filename:
        return {"error": "Select a CSV or XLSX trainer workbook"}, 400
    try:
        rows = read_people_upload(upload, preferred_sheet="Trainers Template")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    role = (
        db.session.query(RolePermission)
        .filter(func.lower(RolePermission.role_name) == "trainer")
        .first()
    )
    if not role:
        return {"error": "Trainer role is not configured"}, 409
    department_query = db.session.query(Department).filter(Department.deleted_at.is_(None))
    if actor.institution_id:
        department_query = department_query.filter(Department.institution_id == actor.institution_id)
    departments = department_query.all()
    department_map = {
        key: department
        for department in departments
        for key in {normalize_lookup(department.name), normalize_lookup(department.code)}
        if key
    }

    # ── Pass 1: plan every row without writing ────────────────────────────────
    # Nothing is committed until we know whether the file touches trainers that
    # already exist, and if so how the uploader wants them treated.
    mode = resolve_conflict_mode(request.form.get("on_conflict") or request.args.get("on_conflict"))

    def _resolve_subjects(department, subject_value: str):
        """(subjects, missing_names) for a semicolon/comma separated cell."""
        requested = [item.strip() for item in re.split(r"[;,|]", subject_value) if item.strip()]
        if not requested:
            return [], []
        department_subjects = (
            db.session.query(Subject)
            .join(Module, Subject.module_id == Module.id)
            .join(Course, Module.course_id == Course.id)
            .filter(
                Course.department_id == department.id,
                Subject.deleted_at.is_(None),
            )
            .all()
        )
        subject_map = {
            key: subject
            for subject in department_subjects
            for key in {normalize_lookup(subject.name), normalize_lookup(subject.code)}
            if key
        }
        missing = [item for item in requested if normalize_lookup(item) not in subject_map]
        if missing:
            return [], missing
        return [subject_map[normalize_lookup(item)] for item in requested], []

    plan: list[dict] = []
    for row_number, row in enumerate(rows, start=2):
        staff_number = first_value(row, "Staff No", "Staff Number", "Trainer Code")
        name = first_value(row, "Name", "Trainer Name")
        email = first_value(row, "Email").lower()
        phone = first_value(row, "Mobile", "Phone") or None
        department_value = first_value(row, "Department", "Department Code")
        specialization = first_value(row, "Specialization") or None
        subject_value = first_value(row, "Subjects", "Subject", "Units")

        entry = {
            "row": row_number,
            "staff_number": staff_number,
            "email": email,
            "name": name,
            "phone": phone,
            "specialization": specialization,
        }

        # Identity first: a row is an update when its email or staff number
        # already belongs to a trainer. Only new trainers must satisfy the
        # fuller required-column validation.
        if not email and not staff_number:
            entry.update(action="failed", message="Email or Staff No is required to identify the trainer")
            plan.append(entry)
            continue
        if email and "@" not in email:
            entry.update(action="failed", message="Invalid email address")
            plan.append(entry)
            continue
        if staff_number and len(staff_number) > 16:
            entry.update(action="failed", message="Staff No must be 16 characters or fewer")
            plan.append(entry)
            continue

        identity_filters = []
        if email:
            identity_filters.append(func.lower(User.email) == email)
        if staff_number:
            identity_filters.append(func.lower(Trainer.code) == staff_number.lower())
        existing = (
            db.session.query(Trainer)
            .join(User, Trainer.user_id == User.id)
            .filter(or_(*identity_filters))
            .first()
        )

        department = department_map.get(normalize_lookup(department_value)) if department_value else None
        if department_value and not department:
            entry.update(action="failed", message=f"Department not found: {department_value}")
            plan.append(entry)
            continue

        # Subjects are validated against the department that will own them:
        # the one named in the sheet, or the trainer's current one on update.
        subject_department = department or (existing.department if existing else None)
        subject_links = []
        if subject_value:
            if not subject_department:
                entry.update(action="failed", message="A Department is required to assign subjects")
                plan.append(entry)
                continue
            subject_links, missing_subjects = _resolve_subjects(subject_department, subject_value)
            if missing_subjects:
                entry.update(
                    action="failed",
                    message=f"Subject(s) not found in department: {', '.join(missing_subjects)}",
                )
                plan.append(entry)
                continue

        entry.update(department=department, subject_links=subject_links)

        if existing:
            entry.update(action="update", existing=existing, message="Trainer already exists")
            plan.append(entry)
            continue

        if not name or not email or not department_value:
            entry.update(
                action="failed",
                message="Name, Email, and Department are required for new trainers",
            )
            plan.append(entry)
            continue

        entry.update(action="create")
        plan.append(entry)

    # ── Conflict gate ─────────────────────────────────────────────────────────
    conflicts = [entry for entry in plan if entry["action"] == "update"]
    if conflicts and mode is None:
        return conflict_response(
            [
                {
                    "row": entry["row"],
                    "staff_number": entry["staff_number"],
                    "email": entry["email"],
                    "name": entry["name"],
                    "current_name": entry["existing"].user.name if entry["existing"].user else None,
                    "message": entry["message"],
                }
                for entry in conflicts
            ],
            len(rows),
            "trainers",
        )

    # ── Pass 2: write ─────────────────────────────────────────────────────────
    results = []
    created = 0
    updated = 0
    duplicates = 0
    failed = 0
    for entry in plan:
        row_number = entry["row"]
        staff_number = entry["staff_number"]
        email = entry["email"]

        if entry["action"] == "failed":
            failed += 1
            results.append({
                "row": row_number,
                "status": "failed",
                "staff_number": staff_number,
                "email": email,
                "message": entry["message"],
            })
            continue

        if entry["action"] == "update" and mode == "skip":
            duplicates += 1
            results.append({
                "row": row_number,
                "status": "duplicate",
                "staff_number": staff_number,
                "email": email,
                "message": "Trainer already exists — skipped",
            })
            continue

        if entry["action"] == "update":
            trainer = entry["existing"]
            department = entry["department"]
            subject_links = entry["subject_links"]
            try:
                with db.session.begin_nested():
                    changed = False
                    if trainer.user:
                        changed |= apply_if_present(trainer.user, "name", entry["name"])
                        changed |= apply_if_present(trainer.user, "phone", entry["phone"])
                    changed |= apply_if_present(trainer, "specialization", entry["specialization"])
                    changed |= apply_if_present(trainer, "code", staff_number or None)
                    if department:
                        changed |= apply_if_present(trainer, "department_id", department.id)
                        if trainer.user:
                            changed |= apply_if_present(
                                trainer.user, "institution_id", department.institution_id
                            )
                    # Subject links are added, never removed: a sheet that omits
                    # the column must not strip a trainer's existing teaching load.
                    if subject_links:
                        linked_ids = {
                            item[0]
                            for item in db.session.query(TrainerSubject.subject_id)
                            .filter(TrainerSubject.trainer_id == trainer.id)
                            .all()
                        }
                        new_links = [
                            TrainerSubject(trainer_id=trainer.id, subject_id=subject.id)
                            for subject in subject_links
                            if subject.id not in linked_ids
                        ]
                        if new_links:
                            db.session.add_all(new_links)
                            changed = True
                    db.session.flush()
                updated += 1
                results.append({
                    "row": row_number,
                    "status": "updated",
                    "staff_number": trainer.code,
                    "email": trainer.user.email if trainer.user else email,
                    "message": "Trainer updated" if changed else "No changes in this row",
                    "department": trainer.department.name if trainer.department else None,
                    "subjects_assigned": len(subject_links),
                })
            except IntegrityError:
                failed += 1
                results.append({
                    "row": row_number,
                    "status": "failed",
                    "staff_number": staff_number,
                    "email": email,
                    "message": "Email, mobile, or staff number is already in use",
                })
            except Exception:
                current_app.logger.exception("Trainer update failed at row %s", row_number)
                failed += 1
                results.append({
                    "row": row_number,
                    "status": "failed",
                    "staff_number": staff_number,
                    "email": email,
                    "message": "This row could not be updated",
                })
            continue

        department = entry["department"]
        subject_links = entry["subject_links"]
        initial_password = secrets.token_urlsafe(9)
        try:
            with db.session.begin_nested():
                user = User(
                    name=entry["name"],
                    email=email,
                    phone=entry["phone"],
                    password_hash=generate_password_hash(initial_password),
                    role_id=role.id,
                    institution_id=department.institution_id,
                )
                db.session.add(user)
                db.session.flush()
                trainer = Trainer(
                    code=staff_number or None,
                    user_id=user.id,
                    department_id=department.id,
                    specialization=entry["specialization"],
                )
                db.session.add(trainer)
                db.session.flush()
                db.session.add_all(
                    TrainerSubject(trainer_id=trainer.id, subject_id=subject.id)
                    for subject in subject_links
                )
                db.session.flush()
            created += 1
            results.append({
                "row": row_number,
                "status": "created",
                "staff_number": trainer.code,
                "email": email,
                "initial_password": initial_password,
                "department": department.name,
                "subjects_assigned": len(subject_links),
            })
        except IntegrityError:
            duplicates += 1
            results.append({
                "row": row_number,
                "status": "duplicate",
                "staff_number": staff_number,
                "email": email,
                "message": "Email, mobile, or staff number is already in use",
            })
        except Exception:
            current_app.logger.exception("Trainer import failed at row %s", row_number)
            failed += 1
            results.append({
                "row": row_number,
                "status": "failed",
                "staff_number": staff_number,
                "email": email,
                "message": "This row could not be imported",
            })
    db.session.commit()
    return {
        "total_rows": len(rows),
        "created": created,
        "updated": updated,
        "duplicates": duplicates,
        "failed": failed,
        "on_conflict": mode,
        "results": results,
    }, 200


@bp.get("/subjects")
@trainer_required()
def list_trainer_subjects():
    trainer = _trainer_for_user(get_current_user()[0].id)
    if not trainer:
        return {"error": "Trainer profile not found"}, 404

    subjects = (
        db.session.query(Subject)
        .join(TrainerSubject, TrainerSubject.subject_id == Subject.id)
        .filter(TrainerSubject.trainer_id == trainer.id)
        .order_by(Subject.name.asc())
        .all()
    )
    return [
        {
            "id": item["id"],
            "subject_name": item["name"],
            "subject_code": item["module_name"] or item["name"][:8].upper(),
            "course_id": item["course_id"],
            "course_name": item["course_name"],
            "department_id": item["department_id"],
            "department_name": item["department_name"],
            "term_id": None,
            "term_name": "Current",
            "students_count": item["students_count"],
            "total_assessments": item["recent_scores_count"],
            "avg_score": item["average_score"],
        }
        for item in (subject_payload(subject) for subject in subjects)
    ], 200


@bp.get("/subjects/<subject_id>")
@trainer_required()
def trainer_subject_detail(subject_id: str):
    trainer = _trainer_for_user(get_current_user()[0].id)
    if not trainer:
        return {"error": "Trainer profile not found"}, 404
    subject = ensure_subject_access(trainer, parse_uuid(subject_id, "subject_id"))
    item = subject_payload(subject)
    return {
        "id": item["id"],
        "subject_name": item["name"],
        "subject_code": item["module_name"] or item["name"][:8].upper(),
        "course_id": item["course_id"],
        "course_name": item["course_name"],
        "department_id": item["department_id"],
        "department_name": item["department_name"],
        "term_id": None,
        "term_name": "Current",
        "students_count": item["students_count"],
        "total_assessments": item["recent_scores_count"],
        "avg_score": item["average_score"],
        "description": item["description"],
    }, 200


@bp.get("/students")
@trainer_required()
def list_trainer_students():
    trainer = _trainer_for_user(get_current_user()[0].id)
    if not trainer:
        return {"error": "Trainer profile not found"}, 404

    subject_ids = get_trainer_subject_ids(trainer)
    if not subject_ids:
        return [], 200

    subject_id = request.args.get("subject_id")
    if subject_id:
        subject_uuid = parse_uuid(subject_id, "subject_id")
        ensure_subject_access(trainer, subject_uuid)
        subject_ids = [subject_uuid]

    students = (
        db.session.query(Student)
        .join(StudentSubject, StudentSubject.student_id == Student.id)
        .filter(StudentSubject.subject_id.in_(subject_ids))
        .distinct()
        .order_by(Student.created_at.desc(), Student.id.asc())
        .all()
    )

    rows = (
        db.session.query(StudentSubject.student_id, Subject.name)
        .join(Subject, Subject.id == StudentSubject.subject_id)
        .filter(
            StudentSubject.student_id.in_([student.id for student in students]),
            StudentSubject.subject_id.in_(subject_ids),
        )
        .all()
    ) if students else []
    subject_names_by_student: dict[uuid.UUID, list[str]] = {}
    for student_uuid, subject_name in rows:
        subject_names_by_student.setdefault(student_uuid, []).append(subject_name)

    response = []
    for student in students:
        related_scores = (
            db.session.query(Score)
            .filter(Score.student_id == student.id, Score.subject_id.in_(subject_ids))
            .all()
        )
        overall_avg = round(sum(item.marks_obtained for item in related_scores) / len(related_scores), 2) if related_scores else 0.0
        response.append(
            {
                "id": str(student.id),
                "name": student.user.name if student.user else None,
                "email": student.user.email if student.user else None,
                "student_id": student.registration_number,
                "enrollment_status": "active",
                "subjects": subject_names_by_student.get(student.id, []),
                "overall_avg": overall_avg,
                "assessments_taken": len(related_scores),
                "subject_averages": {},
            }
        )
    return response, 200


@bp.get("/students/<student_id>")
@trainer_required()
def trainer_student_profile(student_id: str):
    trainer = _trainer_for_user(get_current_user()[0].id)
    if not trainer:
        return {"error": "Trainer profile not found"}, 404

    subject_ids = get_trainer_subject_ids(trainer)
    try:
        student_uuid = parse_uuid(student_id, "student_id")
        student = (
            db.session.query(Student)
            .join(StudentSubject, StudentSubject.student_id == Student.id)
            .filter(Student.id == student_uuid, StudentSubject.subject_id.in_(subject_ids))
            .first()
        )
    except ValueError:
        student = (
            db.session.query(Student)
            .join(StudentSubject, StudentSubject.student_id == Student.id)
            .filter(
                Student.registration_number == student_id,
                StudentSubject.subject_id.in_(subject_ids),
            )
            .first()
        )
    if not student:
        return {"error": "Student not found in your assigned subjects"}, 404

    related_scores = (
        db.session.query(Score)
        .filter(Score.student_id == student.id, Score.subject_id.in_(subject_ids))
        .order_by(Score.created_at.desc())
        .all()
    )

    # Group scores by subject and calculate averages
    subject_averages = {}
    subjects_data = []
    by_subject = {}
    
    for score in related_scores:
        if score.subject_id not in by_subject:
            by_subject[score.subject_id] = []
        by_subject[score.subject_id].append(score)
    
    # Get subject details and build response
    for subject_id, scores in by_subject.items():
        subject = db.session.get(Subject, subject_id)
        if subject:
            avg = round(sum(s.marks_obtained for s in scores) / len(scores), 2) if scores else 0.0
            subject_averages[str(subject_id)] = avg
            subjects_data.append({
                "id": str(subject.id),
                "name": subject.name,
                "average": avg,
                "assessments_count": len(scores),
            })

    return {
        "id": str(student.id),
        "name": student.user.name if student.user else None,
        "email": student.user.email if student.user else None,
        "student_id": student.registration_number,
        "enrollment_status": "active",
        "subjects": subjects_data,
        "overall_avg": round(sum(item.marks_obtained for item in related_scores) / len(related_scores), 2) if related_scores else 0.0,
        "assessments_taken": len(related_scores),
        "subject_averages": subject_averages,
    }, 200


@bp.get("/reports/history")
@trainer_required()
def trainer_report_history():
    trainer = _trainer_for_user(get_current_user()[0].id)
    if not trainer:
        return {"error": "Trainer profile not found"}, 404
    reports = []
    for subject_id in get_trainer_subject_ids(trainer):
        report = trainer_subject_report(trainer, subject_id)
        reports.append(
            {
                "id": report["subject"]["id"],
                "subject_name": report["subject"]["name"],
                "total_students": report["total_students"],
                "avg_score": report["average_score"],
                "pass_rate": report["pass_rate"],
                "generated_date": report["subject"]["created_at"],
            }
        )
    return reports, 200


@bp.get("/reports/subject/<subject_id>")
@trainer_required()
def trainer_report_subject(subject_id: str):
    trainer = _trainer_for_user(get_current_user()[0].id)
    if not trainer:
        return {"error": "Trainer profile not found"}, 404
    
    try:
        sub_uuid = _parse_uuid(subject_id, "subject_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400
    
    # Verify trainer owns this subject
    ensure_subject_access(trainer, sub_uuid)
    
    # Get optional template parameter
    template = request.args.get('template', 'standard')  # standard, class-summary, performance-trends, at-risk
    
    report = trainer_subject_report(trainer, sub_uuid)
    
    # Format response based on template
    base_response = {
        "id": report["subject"]["id"],
        "subject_name": report["subject"]["name"],
        "total_students": report["total_students"],
        "avg_score": report["average_score"],
        "pass_rate": report["pass_rate"],
        "generated_date": report["subject"]["created_at"],
    }
    
    if template == 'class-summary':
        # Include distribution and pass/fail breakdown
        pass_count = report.get("pass_count", 0)
        fail_count = report.get("fail_count", 0)
        return {
            **base_response,
            "template": "class-summary",
            "summary": {
                "total_assessments": report["scores_count"],
                "pass_count": pass_count,
                "fail_count": fail_count,
                "average_score": report["average_score"],
            }
        }, 200
    elif template == 'performance-trends':
        # Include trend analysis
        return {
            **base_response,
            "template": "performance-trends",
            "scores_count": report["scores_count"],
            "data_points": report["scores_count"],
        }, 200
    elif template == 'at-risk':
        # Include at-risk students
        at_risk = at_risk_students(trainer, sub_uuid)
        return {
            **base_response,
            "template": "at-risk",
            "at_risk_count": len(at_risk),
            "at_risk_students": at_risk[:10],  # Top 10 at-risk students
        }, 200
    else:
        # Standard report
        return base_response, 200


@bp.get("/reports/export")
@trainer_required()
def trainer_report_export():
    import csv
    from io import StringIO, BytesIO
    
    trainer = _trainer_for_user(get_current_user()[0].id)
    if not trainer:
        return {"error": "Trainer profile not found"}, 404
    
    subject_id = request.args.get("subject_id")
    format_type = request.args.get("format", "csv").lower()
    
    if not subject_id:
        return {"error": "subject_id is required"}, 400
    
    # PDF is rendered in the browser from the same report payload, so the API
    # only serves the formats it can produce faithfully. It previously accepted
    # "pdf" and returned CSV bytes under a .pdf name.
    if format_type not in ["csv", "xlsx"]:
        return {"error": "format must be 'csv' or 'xlsx'"}, 400
    
    try:
        sub_uuid = _parse_uuid(subject_id, "subject_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400
    
    # Verify trainer owns this subject
    ensure_subject_access(trainer, sub_uuid)
    
    report = trainer_subject_report(trainer, sub_uuid)
    
    if format_type == "csv":
        # Create CSV export
        output = StringIO()
        writer = csv.writer(output)
        
        # Headers
        writer.writerow(["Subject Report Export"])
        writer.writerow([f"Subject: {report['subject']['name']}"])
        writer.writerow([f"Total Students: {report['total_students']}"])
        writer.writerow([f"Average Score: {report['average_score']:.1f}%"])
        writer.writerow([f"Pass Rate: {report['pass_rate']:.1f}%"])
        writer.writerow([])
        
        # Student data header
        writer.writerow(["Student Name", "Reg Number", "Average Score", "Pass Rate", "Grade"])
        
        # Student data
        for student in report.get("students", []):
            writer.writerow([
                student.get("name", ""),
                student.get("registration_number", ""),
                student.get("average_score", ""),
                student.get("pass_rate", ""),
                student.get("grade", ""),
            ])
        
        # Convert to bytes
        output.seek(0)
        bytes_output = BytesIO(output.getvalue().encode("utf-8"))
        bytes_output.seek(0)
        
        return send_file(
            bytes_output,
            mimetype="text/csv",
            as_attachment=True,
            download_name=f"report_{report['subject']['name'].replace(' ', '_')}.csv"
        )
    
    # format_type == "xlsx"
    from openpyxl import Workbook
    from openpyxl.styles import Font

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Subject Report"

    heading = Font(bold=True)
    sheet.append(["Subject Report Export"])
    sheet["A1"].font = heading
    sheet.append([f"Subject: {report['subject']['name']}"])
    sheet.append([f"Total Students: {report['total_students']}"])
    sheet.append([f"Average Score: {report['average_score']:.1f}%"])
    sheet.append([f"Pass Rate: {report['pass_rate']:.1f}%"])
    sheet.append([])

    header_row = sheet.max_row + 1
    sheet.append(["Student Name", "Reg Number", "Average Score", "Pass Rate", "Grade"])
    for cell in sheet[header_row]:
        cell.font = heading

    for student in report.get("students", []):
        sheet.append([
            student.get("name", ""),
            student.get("registration_number", ""),
            student.get("average_score", ""),
            student.get("pass_rate", ""),
            student.get("grade", ""),
        ])

    for column, width in zip("ABCDE", (28, 18, 15, 12, 10)):
        sheet.column_dimensions[column].width = width

    bytes_output = BytesIO()
    workbook.save(bytes_output)
    bytes_output.seek(0)

    return send_file(
        bytes_output,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        as_attachment=True,
        download_name=f"report_{report['subject']['name'].replace(' ', '_')}.xlsx",
    )


@bp.post("")
def create_trainer():
    _, error, status = require_permission("trainers.create")
    if error:
        return error, status
    payload = request.get_json(silent=True) or {}

    try:
        user_id = _parse_uuid(payload.get("user_id"), "user_id")
        department_id = _parse_uuid(payload.get("department_id"), "department_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    specialization = payload.get("specialization")
    if specialization is not None and not isinstance(specialization, str):
        return {"error": "'specialization' must be a string"}, 400

    if not db.session.get(User, user_id):
        return {"error": "Invalid 'user_id'"}, 400

    if not db.session.get(Department, department_id):
        return {"error": "Invalid 'department_id'"}, 400

    trainer = Trainer(
        user_id=user_id,
        department_id=department_id,
        specialization=specialization.strip() if isinstance(specialization, str) and specialization.strip() else None,
    )

    db.session.add(trainer)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return {"error": "Trainer already exists"}, 409

    db.session.refresh(trainer)
    return _trainer_payload(trainer), 201


@bp.get("")
def list_trainers():
    user, error, status = require_permission("trainers.read")
    if error:
        return error, status

    query = scope_trainers(db.session.query(Trainer), user).order_by(Trainer.created_at.desc())
    department_id = request.args.get("department_id")
    if department_id:
        try:
            department_uuid = _parse_uuid(department_id, "department_id")
        except ValueError as exc:
            return {"error": str(exc)}, 400
        query = query.filter(Trainer.department_id == department_uuid)

    trainers = query.all()
    log_view(
        user,
        "trainers",
        metadata={"scope": "list", "master": can_view_master_data(user), "count": len(trainers)},
    )
    return [_trainer_payload(trainer) for trainer in trainers], 200


@bp.get("/<trainer_id>")
def get_trainer(trainer_id: str):
    user, error, status = require_permission("trainers.read")
    if error:
        return error, status
    try:
        trainer_uuid = _parse_uuid(trainer_id, "trainer_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    trainer = _trainer_in_scope(user, trainer_uuid)
    if not trainer:
        return {"error": "Trainer not found"}, 404

    log_view(user, "trainers", entity_id=trainer_id, metadata={"scope": "detail"})
    return _trainer_payload(trainer), 200


@bp.get("/me")
def get_my_trainer():
    user, error, status = require_permission("trainers.read")
    if error:
        return error, status

    trainer = _trainer_for_user(user.id)
    if not trainer:
        return {"error": "Trainer profile not found"}, 404

    log_view(user, "trainers", entity_id=str(trainer.id), metadata={"scope": "self"})
    return _trainer_payload(trainer), 200


@bp.get("/me/courses")
def get_my_courses():
    user, error, status = require_permission("courses.read")
    if error:
        return error, status

    trainer = _trainer_for_user(user.id)
    if not trainer:
        return {"error": "Trainer profile not found"}, 404

    # Courses reachable through the subjects this trainer is actually assigned,
    # rather than everything their department happens to run.
    subject_ids = trainer_subject_ids(user)
    if subject_ids is None:
        courses = (
            db.session.query(Course)
            .filter(Course.department_id == trainer.department_id)
            .order_by(Course.name.asc())
            .all()
        )
    elif not subject_ids:
        courses = []
    else:
        module_ids = db.session.query(Subject.module_id).filter(Subject.id.in_(subject_ids))
        course_ids = db.session.query(Module.course_id).filter(Module.id.in_(module_ids))
        courses = (
            db.session.query(Course)
            .filter(Course.id.in_(course_ids))
            .order_by(Course.name.asc())
            .all()
        )

    log_view(user, "courses", metadata={"scope": "trainer", "count": len(courses)})
    return [_course_payload(course) for course in courses], 200


@bp.get("/me/students")
def get_my_students():
    user, error, status = require_permission("students.read")
    if error:
        return error, status

    trainer = _trainer_for_user(user.id)
    if not trainer:
        return {"error": "Trainer profile not found"}, 404

    students = (
        scope_students(db.session.query(Student), user)
        .order_by(Student.created_at.desc())
        .all()
    )

    log_view(user, "students", metadata={"scope": "trainer", "count": len(students)})
    return [_student_payload(student) for student in students], 200


@bp.put("/<trainer_id>")
def update_trainer(trainer_id: str):
    user, error, status = require_permission("trainers.update")
    if error:
        return error, status
    try:
        trainer_uuid = _parse_uuid(trainer_id, "trainer_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    trainer = _trainer_in_scope(user, trainer_uuid)
    if not trainer:
        return {"error": "Trainer not found"}, 404

    payload = request.get_json(silent=True) or {}

    specialization = payload.get("specialization")
    if specialization is not None:
        if not isinstance(specialization, str):
            return {"error": "'specialization' must be a string"}, 400
        trainer.specialization = specialization.strip() if specialization.strip() else None

    if "user_id" in payload:
        try:
            user_id = _parse_uuid(payload.get("user_id"), "user_id")
        except ValueError as exc:
            return {"error": str(exc)}, 400
        if not db.session.get(User, user_id):
            return {"error": "Invalid 'user_id'"}, 400
        trainer.user_id = user_id

    if "department_id" in payload:
        try:
            department_id = _parse_uuid(payload.get("department_id"), "department_id")
        except ValueError as exc:
            return {"error": str(exc)}, 400
        if not db.session.get(Department, department_id):
            return {"error": "Invalid 'department_id'"}, 400
        trainer.department_id = department_id

    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return {"error": "Trainer already exists"}, 409

    db.session.refresh(trainer)
    return _trainer_payload(trainer), 200


@bp.delete("/<trainer_id>")
def delete_trainer(trainer_id: str):
    user, error, status = require_permission("trainers.delete")
    if error:
        return error, status
    try:
        trainer_uuid = _parse_uuid(trainer_id, "trainer_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    trainer = _trainer_in_scope(user, trainer_uuid)
    if not trainer:
        return {"error": "Trainer not found"}, 404

    db.session.delete(trainer)
    db.session.commit()
    return {"status": "deleted"}, 200
