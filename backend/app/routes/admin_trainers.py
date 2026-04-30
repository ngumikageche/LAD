from __future__ import annotations

from flask import Blueprint, request
from ..extensions import db
from ..models.trainer import Trainer
from ..models.user import User
from ..models.department import Department
from .permissions import require_permission


bp = Blueprint("admin_trainers", __name__, url_prefix="/api/v1/admin/trainers")


@bp.post("")
def create_trainer():
    user, error, status = require_permission("admin.trainers.create")
    if error:
        return error, status

    payload = request.get_json(silent=True) or {}
    user_id = payload.get("user_id")
    department_id = payload.get("department_id")
    specialization = payload.get("specialization")

    if not user_id:
        return {"error": "user_id is required"}, 400

    u = db.session.get(User, user_id)
    if not u:
        return {"error": "User not found"}, 404

    t = Trainer(user_id=u.id, department_id=department_id, specialization=specialization)
    db.session.add(t)
    db.session.commit()
    return {"id": str(t.id), "user_id": str(t.user_id)}, 201


@bp.get("")
def list_trainers():
    user, error, status = require_permission("admin.trainers.read")
    if error:
        return error, status

    q = db.session.query(Trainer).filter(Trainer.deleted_at.is_(None))
    items = [{"id": str(t.id), "user_id": str(t.user_id), "department_id": str(t.department_id) if t.department_id else None} for t in q.all()]
    return {"total": len(items), "items": items}, 200


@bp.put("/<trainer_id>")
def update_trainer(trainer_id: str):
    user, error, status = require_permission("admin.trainers.update")
    if error:
        return error, status

    t = db.session.get(Trainer, trainer_id)
    if not t or t.deleted_at:
        return {"error": "Trainer not found"}, 404

    payload = request.get_json(silent=True) or {}
    for key in ("department_id", "specialization"):
        if key in payload:
            setattr(t, key, payload.get(key))

    db.session.commit()
    return {"id": str(t.id)}, 200


@bp.delete("/<trainer_id>")
def delete_trainer(trainer_id: str):
    user, error, status = require_permission("admin.trainers.delete")
    if error:
        return error, status

    t = db.session.get(Trainer, trainer_id)
    if not t or t.deleted_at:
        return {"error": "Trainer not found"}, 404

    t.deleted_at = db.func.now()
    db.session.commit()
    return {"message": "Trainer deleted"}, 200
