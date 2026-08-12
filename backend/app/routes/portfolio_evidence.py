"""
Portfolio evidence — the files a learner submits against a competency.

`get_portfolio_tracking` reports completion as evidence submitted over
competencies required, but nothing in the API could create a piece of evidence:
rows arrived only through `scripts/seed_linked_user_data.py`. Portfolio
Completion therefore read 0% on every real install, describing the missing
endpoint rather than the learner.

A learner submits their own evidence. A trainer or admin may submit on their
behalf — evidence is often captured on a workshop floor by the assessor rather
than the candidate — and may verify what has been submitted.
"""

from __future__ import annotations

import os
import uuid

from flask import Blueprint, request, send_from_directory
from werkzeug.utils import secure_filename

from ..extensions import db
from ..models.competency import Competency
from ..models.module import Module
from ..models.portfolio_evidence import PortfolioEvidence
from ..models.student import Student
from ..models.student_subject import StudentSubject
from ..models.subject import Subject
from ..services.scoping import trainer_subject_ids
from .permissions import _is_admin, _is_student, _is_trainer, get_current_user, log_view

bp = Blueprint("portfolio_evidence", __name__, url_prefix="/portfolio-evidence")

ALLOWED_EXTENSIONS = {
    "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
    "txt", "csv", "png", "jpg", "jpeg", "gif", "zip",
}
MAX_BYTES = 25 * 1024 * 1024

UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "portfolio")


def _allowed(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def _parse_uuid(value, field: str) -> uuid.UUID:
    if not value:
        raise ValueError(f"Missing '{field}'")
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError) as exc:
        raise ValueError(f"Invalid '{field}'") from exc


def _visible_student_ids(user) -> set[uuid.UUID] | None:
    """
    Learners whose evidence this caller may see, or None when unrestricted.

    A trainer is held to the learners taking the subjects assigned to them,
    which is the same rule `scope_scores` applies to marks.
    """
    if _is_admin(user):
        return None
    subject_ids = trainer_subject_ids(user)
    if subject_ids is None:
        return None
    if not subject_ids:
        return set()
    return {
        row[0]
        for row in db.session.query(StudentSubject.student_id)
        .filter(StudentSubject.subject_id.in_(subject_ids))
        .distinct()
        .all()
    }


def _can_reach_student(user, student_id: uuid.UUID) -> bool:
    if user.student and user.student.id == student_id:
        return True
    visible = _visible_student_ids(user)
    return visible is None or student_id in visible


def _competency_for_student(competency_uuid: uuid.UUID, student_id: uuid.UUID) -> Competency | None:
    """
    The competency, if it is one this learner is actually required to evidence.

    Portfolio completion counts evidence against the competencies on the
    modules behind the learner's subjects. Evidence filed against anything else
    would never be counted, so it is rejected rather than silently stored.
    """
    competency = db.session.get(Competency, competency_uuid)
    if not competency or competency.deleted_at:
        return None
    required = (
        db.session.query(Subject.module_id)
        .join(StudentSubject, StudentSubject.subject_id == Subject.id)
        .filter(
            StudentSubject.student_id == student_id,
            Subject.deleted_at.is_(None),
        )
        .distinct()
    )
    module_ids = {row[0] for row in required.all() if row[0]}
    return competency if competency.module_id in module_ids else None


def _payload(evidence: PortfolioEvidence) -> dict:
    competency = evidence.competency
    student = evidence.student
    return {
        "id": str(evidence.id),
        "student_id": str(evidence.student_id) if evidence.student_id else None,
        "student_name": student.user.name if student and student.user else None,
        "competency_id": str(evidence.competency_id) if evidence.competency_id else None,
        "competency_name": competency.name if competency else None,
        "module_id": str(competency.module_id) if competency and competency.module_id else None,
        "file_url": evidence.file_url,
        "file_name": os.path.basename(evidence.file_url or "") or None,
        "uploaded_at": evidence.uploaded_at.isoformat() if evidence.uploaded_at else None,
        "verified_by": str(evidence.verified_by) if evidence.verified_by else None,
        "verified": evidence.verified_by is not None,
    }


@bp.get("")
def list_evidence():
    """Evidence for one learner, or for everyone in the caller's scope."""
    user, error, status = get_current_user()
    if error:
        return error, status

    query = (
        db.session.query(PortfolioEvidence)
        .filter(PortfolioEvidence.deleted_at.is_(None))
        .order_by(PortfolioEvidence.uploaded_at.desc())
    )

    student_ref = request.args.get("student_id")
    if student_ref:
        try:
            student_uuid = _parse_uuid(student_ref, "student_id")
        except ValueError as exc:
            return {"error": str(exc)}, 400
        if not _can_reach_student(user, student_uuid):
            return {"error": "Permission denied"}, 403
        query = query.filter(PortfolioEvidence.student_id == student_uuid)
    elif user.student:
        # A learner with no filter means "mine", never everyone's.
        query = query.filter(PortfolioEvidence.student_id == user.student.id)
    else:
        visible = _visible_student_ids(user)
        if visible is not None:
            if not visible:
                return {"evidence": [], "total": 0}, 200
            query = query.filter(PortfolioEvidence.student_id.in_(visible))

    competency_ref = request.args.get("competency_id")
    if competency_ref:
        try:
            query = query.filter(
                PortfolioEvidence.competency_id == _parse_uuid(competency_ref, "competency_id")
            )
        except ValueError as exc:
            return {"error": str(exc)}, 400

    rows = query.all()
    log_view(user, "portfolio_evidence", metadata={"scope": "list", "count": len(rows)})
    return {"evidence": [_payload(row) for row in rows], "total": len(rows)}, 200


@bp.get("/requirements")
def evidence_requirements():
    """
    What a learner still owes: every competency on the modules behind their
    subjects, with whether evidence has been filed. This is what the upload
    screen lists, and it mirrors how `get_portfolio_tracking` counts.
    """
    user, error, status = get_current_user()
    if error:
        return error, status

    student_ref = request.args.get("student_id")
    if student_ref:
        try:
            student_uuid = _parse_uuid(student_ref, "student_id")
        except ValueError as exc:
            return {"error": str(exc)}, 400
        if not _can_reach_student(user, student_uuid):
            return {"error": "Permission denied"}, 403
    elif user.student:
        student_uuid = user.student.id
    else:
        return {"error": "'student_id' is required"}, 400

    if not db.session.get(Student, student_uuid):
        return {"error": "Student not found"}, 404

    rows = (
        db.session.query(Competency, Module.name.label("module_name"))
        .join(Module, Module.id == Competency.module_id)
        .join(Subject, Subject.module_id == Module.id)
        .join(StudentSubject, StudentSubject.subject_id == Subject.id)
        .filter(
            StudentSubject.student_id == student_uuid,
            Competency.deleted_at.is_(None),
            Subject.deleted_at.is_(None),
        )
        .distinct()
        .order_by(Module.name.asc(), Competency.name.asc())
        .all()
    )
    submitted = {
        row[0]
        for row in db.session.query(PortfolioEvidence.competency_id)
        .filter(
            PortfolioEvidence.student_id == student_uuid,
            PortfolioEvidence.deleted_at.is_(None),
        )
        .all()
    }

    items = [
        {
            "competency_id": str(competency.id),
            "competency_name": competency.name,
            "module_name": module_name,
            "expected_outcome": competency.expected_outcome,
            "submitted": competency.id in submitted,
        }
        for competency, module_name in rows
    ]
    return {
        "student_id": str(student_uuid),
        "items": items,
        "required_count": len(items),
        "submitted_count": sum(1 for item in items if item["submitted"]),
    }, 200


@bp.post("")
def upload_evidence():
    user, error, status = get_current_user()
    if error:
        return error, status

    if not (_is_student(user) or _is_trainer(user) or _is_admin(user)):
        return {"error": "Permission denied"}, 403

    student_ref = request.form.get("student_id")
    if student_ref:
        try:
            student_uuid = _parse_uuid(student_ref, "student_id")
        except ValueError as exc:
            return {"error": str(exc)}, 400
        if not _can_reach_student(user, student_uuid):
            return {"error": "Permission denied"}, 403
    elif user.student:
        student_uuid = user.student.id
    else:
        return {"error": "'student_id' is required"}, 400

    try:
        competency_uuid = _parse_uuid(request.form.get("competency_id"), "competency_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    competency = _competency_for_student(competency_uuid, student_uuid)
    if not competency:
        return {
            "error": "That competency is not one of this learner's — evidence "
                     "filed against it would never count toward their portfolio"
        }, 404

    file = request.files.get("file")
    if not file or not file.filename:
        return {"error": "No file provided"}, 400
    if not _allowed(file.filename):
        return {"error": f"File type not allowed. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}"}, 400

    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    safe_name = secure_filename(file.filename)
    unique_name = f"{uuid.uuid4().hex}_{safe_name}"
    save_path = os.path.join(UPLOAD_FOLDER, unique_name)
    file.save(save_path)

    if os.path.getsize(save_path) > MAX_BYTES:
        # Checked after writing because the stream length is not known before,
        # so the oversized file is removed rather than left on disk.
        os.remove(save_path)
        return {"error": f"File is larger than {MAX_BYTES // (1024 * 1024)}MB"}, 413

    evidence = PortfolioEvidence(
        student_id=student_uuid,
        competency_id=competency_uuid,
        file_url=f"/portfolio-evidence/files/{unique_name}",
        # An assessor filing on a learner's behalf has by definition seen the
        # work, so their submission is verified; a learner's own is not.
        verified_by=user.trainer.id if (user.trainer and not user.student) else None,
    )
    db.session.add(evidence)
    db.session.commit()
    log_view(user, "portfolio_evidence", entity_id=str(evidence.id), metadata={"action": "uploaded"})
    return _payload(evidence), 201


@bp.get("/files/<path:filename>")
def serve_evidence_file(filename: str):
    user, error, status = get_current_user()
    if error:
        return error, status

    evidence = (
        db.session.query(PortfolioEvidence)
        .filter(
            PortfolioEvidence.file_url == f"/portfolio-evidence/files/{filename}",
            PortfolioEvidence.deleted_at.is_(None),
        )
        .first()
    )
    if not evidence or not evidence.student_id or not _can_reach_student(user, evidence.student_id):
        # Reported as missing rather than forbidden, so the URL space cannot be
        # probed for other learners' submissions.
        return {"error": "File not found"}, 404

    return send_from_directory(os.path.abspath(UPLOAD_FOLDER), filename, as_attachment=False)


@bp.delete("/<evidence_id>")
def delete_evidence(evidence_id: str):
    user, error, status = get_current_user()
    if error:
        return error, status

    try:
        evidence_uuid = _parse_uuid(evidence_id, "evidence_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    evidence = db.session.get(PortfolioEvidence, evidence_uuid)
    if not evidence or evidence.deleted_at:
        return {"error": "Evidence not found"}, 404
    if not evidence.student_id or not _can_reach_student(user, evidence.student_id):
        return {"error": "Evidence not found"}, 404
    # A learner may withdraw their own submission, but not one an assessor
    # verified — that is the assessor's record, not theirs.
    if user.student and user.student.id == evidence.student_id and evidence.verified_by:
        return {"error": "Verified evidence can only be removed by your assessor"}, 403

    evidence.soft_delete()
    db.session.commit()
    log_view(user, "portfolio_evidence", entity_id=evidence_id, metadata={"action": "deleted"})
    return {"status": "deleted", "id": evidence_id}, 200
