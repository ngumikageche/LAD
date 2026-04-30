from __future__ import annotations

import uuid
from flask import Blueprint, request
from werkzeug.security import generate_password_hash

from ..extensions import db
from ..models.user import User
from ..models.student import Student
from ..models.trainer import Trainer
from ..models.role_permission import RolePermission
from .permissions import admin_required, require_permission


bp = Blueprint("admin_users", __name__, url_prefix="/api/v1/admin/users")


@bp.post("")
def create_user():
    user, error, status = require_permission("admin.users.create")
    if error:
        return error, status

    payload = request.get_json(silent=True) or {}
    name = payload.get("name")
    email = payload.get("email")
    password = payload.get("password")
    role_id = payload.get("role_id")
    phone = payload.get("phone")
    institution_id = payload.get("institution_id")
    user_type = payload.get("user_type")

    if not name or not email or not password:
        return {"error": "name, email and password are required"}, 400

    # ensure role exists
    role = db.session.get(RolePermission, role_id) if role_id else None
    if role_id and not role:
        return {"error": "Invalid role_id"}, 400

    u = User(name=name.strip(), email=email.strip().lower(), phone=phone, password_hash=generate_password_hash(password), role_id=role.id if role else None, institution_id=institution_id)
    db.session.add(u)
    db.session.commit()

    # optionally create student or trainer profile
    if user_type == "student":
        s = Student(user_id=u.id, registration_number=payload.get("registration_number", ""), course_id=payload.get("course_id"), enrollment_year=payload.get("enrollment_year", 0))
        db.session.add(s)
    elif user_type == "trainer":
        t = Trainer(user_id=u.id, department_id=payload.get("department_id"), specialization=payload.get("specialization"))
        db.session.add(t)

    db.session.commit()

    return {"id": str(u.id), "email": u.email, "name": u.name}, 201


@bp.get("")
def list_users():
    user, error, status = require_permission("admin.users.read")
    if error:
        return error, status

    args = request.args
    page = int(args.get("page", 1))
    per_page = min(int(args.get("per_page", 20)), 100)
    q = db.session.query(User).filter(User.deleted_at.is_(None))

    role_id = args.get("role_id")
    institution_id = args.get("institution_id")
    if role_id:
        q = q.filter(User.role_id == uuid.UUID(role_id))
    if institution_id:
        q = q.filter(User.institution_id == uuid.UUID(institution_id))

    total = q.count()
    users = q.offset((page - 1) * per_page).limit(per_page).all()
    items = [{"id": str(u.id), "name": u.name, "email": u.email, "role_id": str(u.role_id) if u.role_id else None} for u in users]
    return {"total": total, "page": page, "per_page": per_page, "items": items}, 200


@bp.put("/<user_id>")
def update_user(user_id: str):
    user, error, status = require_permission("admin.users.update")
    if error:
        return error, status

    u = db.session.get(User, user_id)
    if not u or u.deleted_at:
        return {"error": "User not found"}, 404

    payload = request.get_json(silent=True) or {}
    for key in ("name", "email", "phone", "institution_id"):
        if key in payload:
            setattr(u, key, payload.get(key))

    if "role_id" in payload:
        role = db.session.get(RolePermission, payload.get("role_id"))
        if not role:
            return {"error": "Invalid role_id"}, 400
        u.role_id = role.id

    db.session.commit()
    return {"id": str(u.id), "name": u.name, "email": u.email}, 200


@bp.delete("/<user_id>")
def deactivate_user(user_id: str):
    user, error, status = require_permission("admin.users.delete")
    if error:
        return error, status

    u = db.session.get(User, user_id)
    if not u or u.deleted_at:
        return {"error": "User not found"}, 404

    u.deleted_at = db.func.now()
    db.session.commit()
    return {"message": "User deactivated"}, 200
