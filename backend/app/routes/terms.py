"""
Academic terms.

Terms already existed in the database and drove every dated report, but there
was no way to see or manage them — they surfaced only as a dropdown embedded in
one report's filter options. A trainer told "no marks were recorded for this
term" had nowhere to go to find out which term does hold their marks.

Uses the existing `terms` table; nothing new is stored.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime

from flask import Blueprint, request
from sqlalchemy import func

from ..extensions import db
from ..models.assessment import Assessment
from ..models.enrollment import Enrollment
from ..models.lesson_plan import LessonPlan
from ..models.score import Score
from ..models.staff_attendance import StaffAttendance
from ..models.term import Term
from ..services.scoping import (
    can_view_master_data,
    scope_scores,
    term_match_clause,
    trainer_subject_ids,
)
from .permissions import log_view, require_permission


bp = Blueprint("terms", __name__, url_prefix="/terms")


def _parse_uuid(value: str | None, field: str) -> uuid.UUID:
    if not value:
        raise ValueError(f"Missing '{field}'")
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError) as exc:
        raise ValueError(f"Invalid '{field}'") from exc


def _parse_date(value, field: str) -> datetime:
    """Accept a plain date or a full timestamp; the column stores a datetime."""
    if isinstance(value, datetime):
        return value
    if not value or not isinstance(value, str):
        raise ValueError(f"'{field}' is required")
    text = value.strip()
    try:
        if len(text) == 10:
            return datetime.combine(date.fromisoformat(text), datetime.min.time())
        return datetime.fromisoformat(text.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError as exc:
        raise ValueError(f"'{field}' must be a date like 2026-01-15") from exc


def _payload(term: Term, score_count: int | None = None) -> dict:
    data = {
        "id": str(term.id),
        "name": term.name,
        "start_date": term.start_date.isoformat() if term.start_date else None,
        "end_date": term.end_date.isoformat() if term.end_date else None,
        "is_active": bool(term.is_active),
        "created_at": term.created_at.isoformat() if term.created_at else None,
    }
    if score_count is not None:
        # The number that answers "which term should I be looking at?".
        data["scores_in_scope"] = score_count
    return data


def _score_counts_by_term(user, terms: list[Term]) -> dict[uuid.UUID, int]:
    """
    Marks visible to this caller that fall in each term.

    `Score.term` is a free-text label rather than a foreign key, so this counts
    per term with the same matching rule the reports use — a score with no term
    counts toward whichever term is being examined.
    """
    counts: dict[uuid.UUID, int] = {}
    for term in terms:
        counts[term.id] = int(
            scope_scores(db.session.query(func.count(Score.id)), user)
            .filter(Score.deleted_at.is_(None), term_match_clause(term))
            .scalar()
            or 0
        )
    return counts


def _unmatched_term_labels(user, terms: list[Term]) -> list[dict]:
    """
    Term labels on marks that match no term at all.

    `Score.term` is free text. A label that matches no term name is not counted
    in any term, so every term-scoped report — report cards, class performance,
    exam results — silently omits those marks while an unfiltered screen shows
    them. This is the single hardest failure in the system to diagnose from the
    UI, so it is reported rather than left to be discovered.
    """
    known = {(term.name or "").strip().lower() for term in terms}
    rows = (
        scope_scores(
            db.session.query(Score.term, func.count(Score.id).label("marks")),
            user,
        )
        .filter(Score.deleted_at.is_(None), Score.term.isnot(None))
        .group_by(Score.term)
        .all()
    )
    return sorted(
        (
            {"label": label, "marks": int(marks)}
            for label, marks in rows
            if (label or "").strip().lower() not in known
        ),
        key=lambda item: item["marks"],
        reverse=True,
    )


@bp.get("")
def list_terms():
    """
    Every term, newest first, each with the number of marks in the caller's
    scope. `?with_counts=0` skips the counting when only the names are needed.
    """
    user, error, status = require_permission("terms.read")
    if error:
        return error, status

    terms = (
        db.session.query(Term)
        .filter(Term.deleted_at.is_(None))
        .order_by(Term.start_date.desc())
        .all()
    )

    wants_counts = (request.args.get("with_counts") or "1").lower() not in {"0", "false", "no"}
    counts = _score_counts_by_term(user, terms) if wants_counts else {}

    # A trainer seeing zero everywhere needs to know whether that is because
    # nothing has been marked, or because no units are assigned to them.
    assigned = trainer_subject_ids(user)

    log_view(user, "terms", metadata={"scope": "list", "count": len(terms)})
    return {
        "terms": [_payload(term, counts.get(term.id) if wants_counts else None) for term in terms],
        "total": len(terms),
        "active_term_id": next((str(term.id) for term in terms if term.is_active), None),
        "scope": "all" if can_view_master_data(user) else "assigned",
        "assigned_subject_count": None if assigned is None else len(assigned),
        "unmatched_term_labels": _unmatched_term_labels(user, terms) if wants_counts else [],
    }, 200


@bp.post("")
def create_term():
    user, error, status = require_permission("terms.create")
    if error:
        return error, status

    payload = request.get_json(silent=True) or {}
    name = (payload.get("name") or "").strip()
    if not name:
        return {"error": "'name' is required"}, 400

    try:
        start_date = _parse_date(payload.get("start_date"), "start_date")
        end_date = _parse_date(payload.get("end_date"), "end_date")
    except ValueError as exc:
        return {"error": str(exc)}, 400
    if end_date < start_date:
        return {"error": "'end_date' cannot be before 'start_date'"}, 400

    duplicate = (
        db.session.query(Term.id)
        .filter(func.lower(func.trim(Term.name)) == name.lower(), Term.deleted_at.is_(None))
        .first()
    )
    if duplicate:
        return {"error": f"A term named '{name}' already exists"}, 409

    term = Term(name=name, start_date=start_date, end_date=end_date, is_active=False)
    db.session.add(term)
    db.session.flush()

    if bool(payload.get("is_active")):
        _make_active(term)

    db.session.commit()
    log_view(user, "terms", entity_id=str(term.id), metadata={"action": "created"})
    return _payload(term), 201


def _make_active(term: Term) -> None:
    """
    Exactly one term is active at a time.

    Reports resolve "the current term" by taking the first active row, so two
    active terms make that choice arbitrary and the report silently reads the
    wrong one.
    """
    db.session.query(Term).filter(Term.id != term.id, Term.is_active.is_(True)).update(
        {"is_active": False}, synchronize_session=False
    )
    term.is_active = True


@bp.put("/<term_id>")
def update_term(term_id: str):
    user, error, status = require_permission("terms.update")
    if error:
        return error, status

    try:
        term_uuid = _parse_uuid(term_id, "term_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    term = db.session.get(Term, term_uuid)
    if not term or term.deleted_at:
        return {"error": "Term not found"}, 404

    payload = request.get_json(silent=True) or {}

    if "name" in payload:
        name = (payload.get("name") or "").strip()
        if not name:
            return {"error": "'name' must be a non-empty string"}, 400
        clash = (
            db.session.query(Term.id)
            .filter(
                func.lower(func.trim(Term.name)) == name.lower(),
                Term.id != term.id,
                Term.deleted_at.is_(None),
            )
            .first()
        )
        if clash:
            return {"error": f"A term named '{name}' already exists"}, 409
        term.name = name

    try:
        if "start_date" in payload:
            term.start_date = _parse_date(payload.get("start_date"), "start_date")
        if "end_date" in payload:
            term.end_date = _parse_date(payload.get("end_date"), "end_date")
    except ValueError as exc:
        return {"error": str(exc)}, 400
    if term.end_date < term.start_date:
        return {"error": "'end_date' cannot be before 'start_date'"}, 400

    if "is_active" in payload:
        if bool(payload.get("is_active")):
            _make_active(term)
        else:
            term.is_active = False

    db.session.commit()
    log_view(user, "terms", entity_id=term_id, metadata={"action": "updated"})
    return _payload(term), 200


@bp.post("/<term_id>/activate")
def activate_term(term_id: str):
    """Make this the current term, standing every other one down."""
    user, error, status = require_permission("terms.update")
    if error:
        return error, status

    try:
        term_uuid = _parse_uuid(term_id, "term_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    term = db.session.get(Term, term_uuid)
    if not term or term.deleted_at:
        return {"error": "Term not found"}, 404

    _make_active(term)
    db.session.commit()
    log_view(user, "terms", entity_id=term_id, metadata={"action": "activated"})
    return _payload(term), 200


@bp.delete("/<term_id>")
def delete_term(term_id: str):
    user, error, status = require_permission("terms.delete")
    if error:
        return error, status

    try:
        term_uuid = _parse_uuid(term_id, "term_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    term = db.session.get(Term, term_uuid)
    if not term or term.deleted_at:
        return {"error": "Term not found"}, 404

    # A term that assessments or enrolments point at cannot go without orphaning
    # them, and the marks recorded against it would lose their period.
    dependents = {
        "assessments": db.session.query(func.count(Assessment.id)).filter(Assessment.term_id == term_uuid).scalar() or 0,
        "enrollments": db.session.query(func.count(Enrollment.id)).filter(Enrollment.term_id == term_uuid).scalar() or 0,
        "lesson_plans": db.session.query(func.count(LessonPlan.id)).filter(LessonPlan.term_id == term_uuid).scalar() or 0,
        "staff_attendance": db.session.query(func.count(StaffAttendance.id)).filter(StaffAttendance.term_id == term_uuid).scalar() or 0,
    }
    if any(dependents.values()):
        return {
            "error": "This term is in use and cannot be deleted",
            "dependents": dependents,
        }, 409

    term.deleted_at = datetime.utcnow()
    if term.is_active:
        term.is_active = False
    db.session.commit()
    log_view(user, "terms", entity_id=term_id, metadata={"action": "deleted"})
    return {"status": "deleted"}, 200
