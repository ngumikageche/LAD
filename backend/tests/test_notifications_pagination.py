from werkzeug.security import generate_password_hash


def _seed_admin_with_notifications(app, count: int = 25, read_count: int = 4):
    from app.extensions import db
    from app.models.notification import Notification
    from app.models.role_permission import RolePermission
    from app.models.user import User

    with app.app_context():
        role = RolePermission(role_name="Admin", permissions={"*": True})
        db.session.add(role)
        db.session.flush()

        user = User(
            name="Notify Admin",
            email="notify-admin@example.com",
            phone=None,
            password_hash=generate_password_hash("S3cret!"),
            role_id=role.id,
            institution_id=None,
        )
        db.session.add(user)
        db.session.flush()

        db.session.add_all(
            Notification(
                user_id=user.id,
                title=f"Notice {index}",
                message=f"Body {index}",
                is_read=index < read_count,
            )
            for index in range(count)
        )
        db.session.commit()
        return str(user.id)


def _auth_headers(client):
    resp = client.post("/auth/login", json={"email": "notify-admin@example.com", "password": "S3cret!"})
    assert resp.status_code == 200
    return {"Authorization": f"Bearer {resp.get_json()['access_token']}"}


def test_list_defaults_to_ten_per_page_when_paginated(client, app):
    _seed_admin_with_notifications(app, count=25, read_count=4)
    headers = _auth_headers(client)

    resp = client.get("/notifications?page=1", headers=headers)

    assert resp.status_code == 200
    body = resp.get_json()
    assert len(body["items"]) == 10
    assert body["pagination"] == {"page": 1, "per_page": 10, "total": 25, "total_pages": 3}
    assert body["unread_count"] == 21
    assert body["page_size_options"] == [10, 25, 50, 100]


def test_list_honours_requested_page_size_and_caps_it(client, app):
    _seed_admin_with_notifications(app, count=25)
    headers = _auth_headers(client)

    assert len(client.get("/notifications?per_page=25", headers=headers).get_json()["items"]) == 25

    capped = client.get("/notifications?per_page=5000", headers=headers).get_json()
    assert capped["pagination"]["per_page"] == 100


def test_list_second_page_returns_the_remainder(client, app):
    _seed_admin_with_notifications(app, count=25)
    headers = _auth_headers(client)

    body = client.get("/notifications?page=3&per_page=10", headers=headers).get_json()

    assert len(body["items"]) == 5
    assert body["pagination"]["page"] == 3


def test_list_filters_by_read_status(client, app):
    _seed_admin_with_notifications(app, count=25, read_count=4)
    headers = _auth_headers(client)

    unread = client.get("/notifications?per_page=100&status=unread", headers=headers).get_json()
    read = client.get("/notifications?per_page=100&status=read", headers=headers).get_json()

    assert unread["pagination"]["total"] == 21
    assert all(item["is_read"] is False for item in unread["items"])
    assert read["pagination"]["total"] == 4
    # unread_count always reflects the whole scope, not the filtered page.
    assert read["unread_count"] == 21

    assert client.get("/notifications?status=bogus", headers=headers).status_code == 400


def test_list_without_pagination_args_keeps_the_legacy_array(client, app):
    _seed_admin_with_notifications(app, count=25)
    headers = _auth_headers(client)

    body = client.get("/notifications", headers=headers).get_json()

    assert isinstance(body, list)
    assert len(body) == 25


def test_unread_count_endpoint(client, app):
    _seed_admin_with_notifications(app, count=25, read_count=4)
    headers = _auth_headers(client)

    body = client.get("/notifications/unread-count", headers=headers).get_json()

    assert body["unread_count"] == 21
    assert body["total"] == 25
    assert body["latest_created_at"]
