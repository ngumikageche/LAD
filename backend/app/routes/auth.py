from __future__ import annotations

from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from flask import Blueprint, current_app, request
from werkzeug.security import check_password_hash, generate_password_hash

from ..extensions import db
from ..models.user import User


def _user_payload(user: User) -> dict:
    user_type = "admin"
    student_id = None
    trainer_id = None
    if user.student:
        user_type = "student"
        student_id = str(user.student.id)
    elif user.trainer:
        user_type = "trainer"
        trainer_id = str(user.trainer.id)
    
    return {
        "id": str(user.id),
        "name": user.name,
        "email": user.email,
        "phone": user.phone,
        "role_id": str(user.role_id),
        "role_name": user.role.role_name if user.role else None,
        "permissions": user.role.permissions if user.role else {},
        "institution_id": str(user.institution_id) if user.institution_id else None,
        "user_type": user_type,
        "student_id": student_id,
        "trainer_id": trainer_id,
    }



bp = Blueprint("auth", __name__, url_prefix="/auth")


def _serializer() -> URLSafeTimedSerializer:
    secret_key = current_app.config.get("SECRET_KEY")
    if not secret_key:
        raise RuntimeError("SECRET_KEY is not configured")
    return URLSafeTimedSerializer(secret_key, salt="auth-token")


def _issue_token(user: User) -> str:
    return _serializer().dumps({"user_id": str(user.id)})


def _verify_token(token: str) -> User | None:
    max_age = int(current_app.config.get("AUTH_TOKEN_MAX_AGE_SECONDS", 60 * 60 * 24))
    try:
        data = _serializer().loads(token, max_age=max_age)
    except SignatureExpired:
        return None
    except BadSignature:
        return None

    user_id = data.get("user_id") if isinstance(data, dict) else None
    if not user_id:
        return None

    user = db.session.get(User, user_id)
    if not user or user.deleted_at is not None:
        return None
    return user


def _get_bearer_token() -> str | None:
    header = request.headers.get("Authorization", "")
    if not header:
        return None
    if not header.lower().startswith("bearer "):
        return None
    return header.split(" ", 1)[1].strip() or None


@bp.post("/login")
def login():
    payload = request.get_json(silent=True) or {}
    email = payload.get("email")
    password = payload.get("password")

    if not email or not isinstance(email, str):
        return {"error": "'email' is required"}, 400
    if not password or not isinstance(password, str):
        return {"error": "'password' is required"}, 400

    user = (
        db.session.query(User)
        .filter(
            User.email == email.strip().lower(),
            User.deleted_at.is_(None),
        )
        .first()
    )

    if not user or not check_password_hash(user.password_hash, password):
        return {"error": "Invalid credentials"}, 401

    token = _issue_token(user)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": _user_payload(user),
    }, 200


@bp.get("/me")
def me():
    token = _get_bearer_token()
    if not token:
        return {"error": "Missing bearer token"}, 401

    user = _verify_token(token)
    if not user:
        return {"error": "Invalid or expired token"}, 401

    return _user_payload(user), 200


@bp.put("/password")
def change_password():
    """Change password for the authenticated user"""
    token = _get_bearer_token()
    if not token:
        return {"error": "Missing bearer token"}, 401

    user = _verify_token(token)
    if not user:
        return {"error": "Invalid or expired token"}, 401

    payload = request.get_json(silent=True) or {}
    current_password = payload.get("current_password")
    new_password = payload.get("new_password")
    confirm_password = payload.get("confirm_password")

    # Validate required fields
    if not current_password or not isinstance(current_password, str):
        return {"error": "'current_password' is required"}, 400
    if not new_password or not isinstance(new_password, str):
        return {"error": "'new_password' is required"}, 400
    if not confirm_password or not isinstance(confirm_password, str):
        return {"error": "'confirm_password' is required"}, 400

    # Validate password length
    if len(new_password) < 8:
        return {"error": "New password must be at least 8 characters long"}, 400

    # Verify current password
    if not check_password_hash(user.password_hash, current_password):
        return {"error": "Current password is incorrect"}, 401

    # Verify passwords match
    if new_password != confirm_password:
        return {"error": "New password and confirm password do not match"}, 400

    # Verify new password is different from current
    if current_password == new_password:
        return {"error": "New password must be different from current password"}, 400

    # Update password
    user.password_hash = generate_password_hash(new_password)
    db.session.commit()

    return {"message": "Password changed successfully"}, 200
