from werkzeug.security import generate_password_hash


STUDENT_EMAIL = "notify-student@example.com"
STUDENT_PASSWORD = "S3cret!"


def _seed_student_with_notifications(app, count: int = 25, read_count: int = 3):
    from app.extensions import db
    from app.models.notification import Notification
    from app.models.role_permission import RolePermission
    from app.models.student import Student
    from app.models.user import User

    with app.app_context():
        role = RolePermission(role_name="Student", permissions={})
        db.session.add(role)
        db.session.flush()

        user = User(
            name="Notify Student",
            email=STUDENT_EMAIL,
            phone=None,
            password_hash=generate_password_hash(STUDENT_PASSWORD),
            role_id=role.id,
            institution_id=None,
        )
        db.session.add(user)
        db.session.flush()

        db.session.add(
            Student(user_id=user.id, registration_number="REG-NOTIFY-001", course_id=None, enrollment_year=2025)
        )
        db.session.add_all(
            Notification(
                user_id=user.id,
                title=f"Alert {index}",
                message=f"Body {index}",
                is_read=index < read_count,
            )
            for index in range(count)
        )
        db.session.commit()
        return str(user.id)


def _auth_headers(client):
    resp = client.post("/auth/login", json={"email": STUDENT_EMAIL, "password": STUDENT_PASSWORD})
    assert resp.status_code == 200
    return {"Authorization": f"Bearer {resp.get_json()['access_token']}"}


def test_student_notifications_default_to_ten(client, app):
    _seed_student_with_notifications(app, count=25, read_count=3)
    headers = _auth_headers(client)

    body = client.get("/api/v1/student/notifications", headers=headers).get_json()

    assert len(body["items"]) == 10
    assert body["pagination"]["per_page"] == 10
    assert body["pagination"]["total"] == 25
    assert body["pagination"]["total_pages"] == 3
    assert body["unread_count"] == 22
    assert body["page_size_options"] == [10, 25, 50, 100]


def test_student_notifications_respect_requested_page_size(client, app):
    _seed_student_with_notifications(app, count=25)
    headers = _auth_headers(client)

    body = client.get("/api/v1/student/notifications?per_page=25", headers=headers).get_json()
    assert len(body["items"]) == 25

    capped = client.get("/api/v1/student/notifications?per_page=500", headers=headers).get_json()
    assert capped["pagination"]["per_page"] == 100


def test_student_notifications_summary(client, app):
    _seed_student_with_notifications(app, count=25, read_count=3)
    headers = _auth_headers(client)

    body = client.get("/api/v1/student/notifications/summary", headers=headers).get_json()

    assert body["unread_count"] == 22
    assert body["total"] == 25
    assert body["latest_created_at"]
