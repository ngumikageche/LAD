from __future__ import annotations

import uuid

from flask import Blueprint, request
from sqlalchemy.exc import IntegrityError

from ..extensions import db
from ..models.department import Department
from ..models.trainer import Trainer
from ..models.user import User
from .permissions import log_view, require_permission


bp = Blueprint("trainers", __name__, url_prefix="/trainers")


def _parse_uuid(value: str | None, field: str) -> uuid.UUID:
    if not value:
        raise ValueError(f"Missing '{field}'")
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError) as exc:
        raise ValueError(f"Invalid '{field}'") from exc


def _trainer_payload(trainer: Trainer) -> dict:
    return {
        "id": str(trainer.id),
        "user_id": str(trainer.user_id),
        "department_id": str(trainer.department_id),
        "specialization": trainer.specialization,
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

    query = db.session.query(Trainer).order_by(Trainer.created_at.desc())
    department_id = request.args.get("department_id")
    if department_id:
        try:
            department_uuid = _parse_uuid(department_id, "department_id")
        except ValueError as exc:
            return {"error": str(exc)}, 400
        query = query.filter(Trainer.department_id == department_uuid)

    trainers = query.all()
    log_view(user, "trainers", metadata={"scope": "list"})
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

    trainer = db.session.get(Trainer, trainer_uuid)
    if not trainer:
        return {"error": "Trainer not found"}, 404

    log_view(user, "trainers", entity_id=trainer_id, metadata={"scope": "detail"})
    return _trainer_payload(trainer), 200


@bp.put("/<trainer_id>")
def update_trainer(trainer_id: str):
    _, error, status = require_permission("trainers.update")
    if error:
        return error, status
    try:
        trainer_uuid = _parse_uuid(trainer_id, "trainer_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    trainer = db.session.get(Trainer, trainer_uuid)
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
    _, error, status = require_permission("trainers.delete")
    if error:
        return error, status
    try:
        trainer_uuid = _parse_uuid(trainer_id, "trainer_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    trainer = db.session.get(Trainer, trainer_uuid)
    if not trainer:
        return {"error": "Trainer not found"}, 404

    db.session.delete(trainer)
    db.session.commit()
    return {"status": "deleted"}, 200
