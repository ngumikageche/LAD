"""
Competencies — the units mastery and portfolio evidence are measured against.

Both the Mastery Rate and Portfolio Completion tiles are computed per
competency: `get_heatmap` grades a learner against each competency on their
subject's module, and `get_portfolio_tracking` counts evidence submitted
against the competencies required. Until now nothing in the API could create
one — they arrived only through `scripts/seed_department_catalog.py` — so on
any institution that did not run that seeder both tiles read 0% with no way to
change it from the application.

Competencies hang off a module, and a module already carries the scoping rules
(institution, department, course), so access is decided by the module rather
than re-derived here.
"""

from __future__ import annotations

import uuid

from flask import Blueprint, request

from ..extensions import db
from ..models.assessment import Assessment
from ..models.competency import Competency
from ..models.module import Module
from ..models.portfolio_evidence import PortfolioEvidence
from ..services.scoping import scope_modules
from .permissions import log_view, require_permission

bp = Blueprint("competencies", __name__, url_prefix="/competencies")

MAX_NAME = 255
MAX_TEXT = 1000


def _parse_uuid(value, field: str) -> uuid.UUID:
    if not value:
        raise ValueError(f"Missing '{field}'")
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError) as exc:
        raise ValueError(f"Invalid '{field}'") from exc


def _module_in_scope(user, module_uuid: uuid.UUID) -> Module | None:
    return scope_modules(db.session.query(Module), user).filter(Module.id == module_uuid).first()


def _competency_in_scope(user, competency_uuid: uuid.UUID) -> Competency | None:
    """
    A competency the caller may act on.

    Reached through its module so the same institution and department limits
    apply; one outside the caller's scope is reported as missing rather than
    forbidden, so the endpoint cannot be used to discover which ids exist.
    """
    competency = db.session.get(Competency, competency_uuid)
    if not competency or competency.deleted_at:
        return None
    if competency.module_id is None:
        # Detached from any module, so no module can vouch for it. Only an
        # account that can see every module may touch it.
        return competency if scope_modules(db.session.query(Module), user).count() else None
    return competency if _module_in_scope(user, competency.module_id) else None


def _payload(competency: Competency, counts: dict | None = None) -> dict:
    data = {
        "id": str(competency.id),
        "module_id": str(competency.module_id) if competency.module_id else None,
        "module_name": competency.module.name if competency.module else None,
        "name": competency.name,
        "description": competency.description,
        "expected_outcome": competency.expected_outcome,
        "mastery_threshold": competency.mastery_threshold,
        "created_at": competency.created_at.isoformat() if competency.created_at else None,
    }
    if counts is not None:
        # What is actually hanging off it — the numbers that decide whether it
        # can be deleted, and whether it will ever show on the mastery heatmap.
        data.update(counts)
    return data


def _usage(competency_id: uuid.UUID) -> dict:
    return {
        "assessment_count": int(
            db.session.query(db.func.count(Assessment.id))
            .filter(Assessment.competency_id == competency_id, Assessment.deleted_at.is_(None))
            .scalar()
            or 0
        ),
        "evidence_count": int(
            db.session.query(db.func.count(PortfolioEvidence.id))
            .filter(
                PortfolioEvidence.competency_id == competency_id,
                PortfolioEvidence.deleted_at.is_(None),
            )
            .scalar()
            or 0
        ),
    }


def _read_fields(payload: dict, *, require_name: bool) -> tuple[dict, str | None]:
    """Validated field updates, or an error message."""
    fields: dict = {}

    if "name" in payload or require_name:
        name = str(payload.get("name") or "").strip()
        if not name:
            return {}, "'name' is required"
        if len(name) > MAX_NAME:
            return {}, f"'name' must be {MAX_NAME} characters or fewer"
        fields["name"] = name

    for key in ("description", "expected_outcome"):
        if key in payload:
            value = payload.get(key)
            text = str(value).strip() if value is not None else ""
            if len(text) > MAX_TEXT:
                return {}, f"'{key}' must be {MAX_TEXT} characters or fewer"
            fields[key] = text or None

    if "mastery_threshold" in payload:
        raw = payload.get("mastery_threshold")
        try:
            threshold = float(raw)
        except (TypeError, ValueError):
            return {}, "'mastery_threshold' must be a number"
        if not 0 < threshold <= 100:
            return {}, "'mastery_threshold' must be between 0 and 100"
        fields["mastery_threshold"] = threshold

    return fields, None


@bp.get("")
def list_competencies():
    """
    Competencies, newest module first. `?module_id=` narrows to one module,
    which is how the authoring screen and the assessment picker both load.
    """
    user, error, status = require_permission("competencies.read")
    if error:
        return error, status

    query = (
        db.session.query(Competency)
        .join(Module, Module.id == Competency.module_id)
        .filter(Competency.deleted_at.is_(None))
    )
    # Scoped through the module so a caller never sees competencies belonging
    # to an institution they cannot see.
    visible_module_ids = scope_modules(db.session.query(Module.id), user).subquery()
    query = query.filter(Competency.module_id.in_(db.session.query(visible_module_ids.c.id)))

    module_id = request.args.get("module_id")
    if module_id:
        try:
            query = query.filter(Competency.module_id == _parse_uuid(module_id, "module_id"))
        except ValueError as exc:
            return {"error": str(exc)}, 400

    competencies = query.order_by(Module.name.asc(), Competency.name.asc()).all()
    log_view(user, "competencies", metadata={"scope": "list", "count": len(competencies)})
    return {
        "competencies": [
            _payload(competency, _usage(competency.id)) for competency in competencies
        ],
        "total": len(competencies),
    }, 200


@bp.post("")
def create_competency():
    user, error, status = require_permission("competencies.create")
    if error:
        return error, status

    payload = request.get_json(silent=True) or {}
    try:
        module_uuid = _parse_uuid(payload.get("module_id"), "module_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    module = _module_in_scope(user, module_uuid)
    if not module:
        return {"error": "Module not found"}, 404

    fields, message = _read_fields(payload, require_name=True)
    if message:
        return {"error": message}, 400

    duplicate = (
        db.session.query(Competency.id)
        .filter(
            Competency.module_id == module_uuid,
            db.func.lower(db.func.trim(Competency.name)) == fields["name"].lower(),
            Competency.deleted_at.is_(None),
        )
        .first()
    )
    if duplicate:
        return {"error": f"'{fields['name']}' already exists on this module"}, 409

    competency = Competency(module_id=module_uuid, **fields)
    db.session.add(competency)
    db.session.commit()
    log_view(user, "competencies", entity_id=str(competency.id), metadata={"action": "created"})
    return _payload(competency, _usage(competency.id)), 201


@bp.put("/<competency_id>")
def update_competency(competency_id: str):
    user, error, status = require_permission("competencies.update")
    if error:
        return error, status

    try:
        competency_uuid = _parse_uuid(competency_id, "competency_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    competency = _competency_in_scope(user, competency_uuid)
    if not competency:
        return {"error": "Competency not found"}, 404

    payload = request.get_json(silent=True) or {}
    fields, message = _read_fields(payload, require_name=False)
    if message:
        return {"error": message}, 400

    if "name" in fields:
        clash = (
            db.session.query(Competency.id)
            .filter(
                Competency.module_id == competency.module_id,
                db.func.lower(db.func.trim(Competency.name)) == fields["name"].lower(),
                Competency.id != competency.id,
                Competency.deleted_at.is_(None),
            )
            .first()
        )
        if clash:
            return {"error": f"'{fields['name']}' already exists on this module"}, 409

    for key, value in fields.items():
        setattr(competency, key, value)
    db.session.commit()
    log_view(user, "competencies", entity_id=competency_id, metadata={"action": "updated"})
    return _payload(competency, _usage(competency.id)), 200


@bp.delete("/<competency_id>")
def delete_competency(competency_id: str):
    user, error, status = require_permission("competencies.delete")
    if error:
        return error, status

    try:
        competency_uuid = _parse_uuid(competency_id, "competency_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    competency = _competency_in_scope(user, competency_uuid)
    if not competency:
        return {"error": "Competency not found"}, 404

    # Assessments and evidence point at this row, and the marks recorded
    # against those assessments are what the mastery heatmap reads. Removing it
    # underneath them would strand both, so it is refused while either exists.
    usage = _usage(competency_uuid)
    if usage["assessment_count"] or usage["evidence_count"]:
        return {
            "error": "This competency is in use and cannot be deleted",
            "dependents": usage,
        }, 409

    competency.soft_delete()
    db.session.commit()
    log_view(user, "competencies", entity_id=competency_id, metadata={"action": "deleted"})
    return {"status": "deleted", "id": competency_id}, 200
