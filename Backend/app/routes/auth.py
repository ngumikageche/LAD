from __future__ import annotations

from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from flask import Blueprint, current_app, request
from werkzeug.security import check_password_hash

from ..extensions import db
from ..models.user import User


def _user_payload(user: User) -> dict:
    return {
        "id": str(user.id),
        "name": user.name,
        "email": user.email,
        "phone": user.phone,
        "role_id": str(user.role_id),
        "role_name": user.role.role_name if user.role else None,
        "permissions": user.role.permissions if user.role else {},
        "institution_id": str(user.institution_id) if user.institution_id else None,
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

    return db.session.get(User, user_id)


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
        .filter(User.email == email.strip().lower())
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
