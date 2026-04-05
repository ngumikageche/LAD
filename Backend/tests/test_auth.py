import uuid

from werkzeug.security import generate_password_hash


def _seed_role_and_user(app, *, email: str = "auth@example.com", password: str = "S3cret!"):
    from app.extensions import db
    from app.models.role_permission import RolePermission
    from app.models.user import User

    with app.app_context():
        role = RolePermission(role_name="Admin", permissions={"*": True})
        db.session.add(role)
        db.session.flush()

        user = User(
            name="Auth User",
            email=email,
            phone=None,
            password_hash=generate_password_hash(password),
            role_id=role.id,
            institution_id=None,
        )
        db.session.add(user)
        db.session.commit()

        return str(user.id), str(role.id)


def test_login_success_returns_token_and_user(client, app):
    user_id, role_id = _seed_role_and_user(app)

    resp = client.post(
        "/auth/login",
        json={"email": "auth@example.com", "password": "S3cret!"},
    )

    assert resp.status_code == 200
    body = resp.get_json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert body["user"]["id"] == user_id
    assert body["user"]["role_id"] == role_id


def test_login_invalid_password_401(client, app):
    _seed_role_and_user(app)

    resp = client.post(
        "/auth/login",
        json={"email": "auth@example.com", "password": "wrong"},
    )

    assert resp.status_code == 401


def test_me_with_token_returns_user(client, app):
    user_id, role_id = _seed_role_and_user(app)

    login = client.post(
        "/auth/login",
        json={"email": "auth@example.com", "password": "S3cret!"},
    )
    token = login.get_json()["access_token"]

    me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    body = me.get_json()
    assert body["id"] == user_id
    assert body["role_id"] == role_id


def test_me_missing_token_401(client):
    resp = client.get("/auth/me")
    assert resp.status_code == 401


def test_me_invalid_token_401(client):
    resp = client.get("/auth/me", headers={"Authorization": f"Bearer {uuid.uuid4()}"})
    assert resp.status_code == 401
