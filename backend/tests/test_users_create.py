import uuid

from werkzeug.security import generate_password_hash


def _seed_role(app, role_name: str = "Admin") -> uuid.UUID:
    from app.extensions import db
    from app.models.role_permission import RolePermission

    with app.app_context():
        role = RolePermission(role_name=role_name, permissions={"*": True})
        db.session.add(role)
        db.session.commit()
        return role.id


def _admin_auth_header(client, app, role_id: uuid.UUID) -> dict:
    from app.extensions import db
    from app.models.user import User

    with app.app_context():
        admin = (
            db.session.query(User)
            .filter(User.email == "admin@lad.com")
            .first()
        )
        if not admin:
            admin = User(
                name="Admin User",
                email="admin@lad.com",
                phone="+15550000001",
                password_hash=generate_password_hash("S3cret!"),
                role_id=role_id,
                institution_id=None,
            )
            db.session.add(admin)
            db.session.commit()

    login_resp = client.post(
        "/auth/login",
        json={"email": "admin@lad.com", "password": "S3cret!"},
    )
    token = login_resp.get_json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_create_user_success(client, app):
    role_id = _seed_role(app)
    headers = _admin_auth_header(client, app, role_id)

    resp = client.post(
        "/users",
        headers=headers,
        json={
            "name": "Jane Doe",
            "email": "jane@example.com",
            "phone": "+15551231234",
            "password": "S3cret!",
            "role_id": str(role_id),
        },
    )

    assert resp.status_code == 201
    body = resp.get_json()
    assert body["id"]
    assert body["name"] == "Jane Doe"
    assert body["email"] == "jane@example.com"
    assert body["phone"] == "+15551231234"
    assert body["role_id"] == str(role_id)
    assert body["institution_id"] is None
    assert body["created_at"]


def test_create_user_missing_email(client, app):
    role_id = _seed_role(app)
    headers = _admin_auth_header(client, app, role_id)

    resp = client.post(
        "/users",
        headers=headers,
        json={
            "name": "Jane Doe",
            "password": "S3cret!",
            "role_id": str(role_id),
        },
    )

    assert resp.status_code == 400


def test_create_user_duplicate_email_returns_409(client, app):
    role_id = _seed_role(app)
    headers = _admin_auth_header(client, app, role_id)

    payload = {
        "name": "Jane Doe",
        "email": "dup@example.com",
        "password": "S3cret!",
        "role_id": str(role_id),
    }

    r1 = client.post("/users", json=payload, headers=headers)
    assert r1.status_code == 201

    r2 = client.post("/users", json=payload, headers=headers)
    assert r2.status_code == 409


def test_create_user_invalid_role_id_returns_400(client, app):
    role_id = _seed_role(app)
    headers = _admin_auth_header(client, app, role_id)
    resp = client.post(
        "/users",
        headers=headers,
        json={
            "name": "Jane Doe",
            "email": "badrole@example.com",
            "password": "S3cret!",
            "role_id": str(uuid.uuid4()),
        },
    )

    assert resp.status_code == 400
    body = resp.get_json()
    assert "role_id" in body.get("error", "")
