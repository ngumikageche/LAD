from werkzeug.security import generate_password_hash


def _login(client, email: str) -> dict:
    response = client.post(
        "/auth/login",
        json={"email": email, "password": "S3cret!"},
    )
    token = response.get_json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _seed_scope_data(app):
    from app.extensions import db
    from app.models.institution import Institution
    from app.models.role_permission import RolePermission
    from app.models.user import User

    with app.app_context():
        scoped_role = RolePermission(
            role_name="Institution Viewer",
            permissions={"users.read": True},
        )
        admin_role = RolePermission(role_name="Admin", permissions={"*": True})
        first_institution = Institution(
            name="First College",
            type="College",
            location="Nairobi",
        )
        second_institution = Institution(
            name="Second College",
            type="College",
            location="Mombasa",
        )
        db.session.add_all(
            [scoped_role, admin_role, first_institution, second_institution]
        )
        db.session.flush()

        viewer = User(
            name="Institution Viewer",
            email="viewer@example.com",
            password_hash=generate_password_hash("S3cret!"),
            role_id=scoped_role.id,
            institution_id=first_institution.id,
        )
        same_institution_user = User(
            name="Same Institution",
            email="same@example.com",
            password_hash=generate_password_hash("S3cret!"),
            role_id=scoped_role.id,
            institution_id=first_institution.id,
        )
        other_institution_user = User(
            name="Other Institution",
            email="other@example.com",
            password_hash=generate_password_hash("S3cret!"),
            role_id=scoped_role.id,
            institution_id=second_institution.id,
        )
        admin = User(
            name="Admin",
            email="admin@example.com",
            password_hash=generate_password_hash("S3cret!"),
            role_id=admin_role.id,
        )
        db.session.add_all(
            [viewer, same_institution_user, other_institution_user, admin]
        )
        db.session.commit()

        return {
            "same_user_id": str(same_institution_user.id),
            "other_user_id": str(other_institution_user.id),
        }


def test_users_read_is_scoped_to_the_actors_institution(client, app):
    ids = _seed_scope_data(app)
    headers = _login(client, "viewer@example.com")

    response = client.get("/users", headers=headers)

    assert response.status_code == 200
    users = response.get_json()
    assert {user["email"] for user in users} == {
        "viewer@example.com",
        "same@example.com",
    }
    assert {user["institution_name"] for user in users} == {"First College"}

    same_response = client.get(f"/users/{ids['same_user_id']}", headers=headers)
    assert same_response.status_code == 200

    other_response = client.get(f"/users/{ids['other_user_id']}", headers=headers)
    assert other_response.status_code == 404


def test_admin_can_read_users_across_institutions(client, app):
    _seed_scope_data(app)
    headers = _login(client, "admin@example.com")

    response = client.get("/users", headers=headers)

    assert response.status_code == 200
    assert {user["email"] for user in response.get_json()} == {
        "viewer@example.com",
        "same@example.com",
        "other@example.com",
        "admin@example.com",
    }
