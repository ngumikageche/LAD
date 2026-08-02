"""
Access tests for pages that used to be admin-only and are now permission-gated:
learner reports (`reports.student.write`) and the school-wide admin reports
(`reports.admin.*`).
"""

from datetime import datetime

from werkzeug.security import generate_password_hash


def _login(client, email: str) -> dict:
    response = client.post("/auth/login", json={"email": email, "password": "S3cret!"})
    token = response.get_json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _seed(app):
    from app.extensions import db
    from app.models.course import Course
    from app.models.department import Department
    from app.models.institution import Institution
    from app.models.role_permission import RolePermission
    from app.models.student import Student
    from app.models.term import Term
    from app.models.user import User

    with app.app_context():
        # A registrar: no trainer profile, but allowed to write learner reports.
        registrar_role = RolePermission(
            role_name="Registrar", permissions={"reports.student.write": True}
        )
        # A manager: school-wide reports, but no learner-report writing.
        manager_role = RolePermission(
            role_name="Manager",
            permissions={
                "reports.admin.pass_rate.view": True,
                "reports.admin.enrolment.view": True,
            },
        )
        clerk_role = RolePermission(role_name="Clerk", permissions={"students.read": True})
        student_role = RolePermission(
            role_name="Student", permissions={"reports.student.write": True}
        )
        institution = Institution(name="LAD College", type="College", location="Nairobi")
        db.session.add_all([registrar_role, manager_role, clerk_role, student_role, institution])
        db.session.flush()

        department = Department(institution_id=institution.id, name="Engineering")
        db.session.add(department)
        db.session.flush()

        course = Course(department_id=department.id, name="Electrical", cbet_level="Level 5")
        term = Term(
            name="Term 1 2026",
            start_date=datetime(2026, 1, 1),
            end_date=datetime(2026, 4, 1),
            is_active=True,
        )
        db.session.add_all([course, term])
        db.session.flush()

        registrar = User(
            name="Registrar",
            email="registrar@example.com",
            password_hash=generate_password_hash("S3cret!"),
            role_id=registrar_role.id,
            institution_id=institution.id,
        )
        manager = User(
            name="Manager",
            email="manager@example.com",
            password_hash=generate_password_hash("S3cret!"),
            role_id=manager_role.id,
            institution_id=institution.id,
        )
        clerk = User(
            name="Clerk",
            email="clerk@example.com",
            password_hash=generate_password_hash("S3cret!"),
            role_id=clerk_role.id,
            institution_id=institution.id,
        )
        student_user = User(
            name="Learner",
            email="learner@example.com",
            password_hash=generate_password_hash("S3cret!"),
            role_id=student_role.id,
            institution_id=institution.id,
        )
        db.session.add_all([registrar, manager, clerk, student_user])
        db.session.flush()

        student = Student(
            user_id=student_user.id,
            registration_number="REG-001",
            course_id=course.id,
            enrollment_year=2026,
        )
        db.session.add(student)
        db.session.commit()

        return {"student_id": str(student.id)}


def test_non_trainer_staff_with_the_permission_can_write_learner_reports(client, app):
    ids = _seed(app)
    headers = _login(client, "registrar@example.com")

    created = client.post(
        f"/trainers/students/{ids['student_id']}/reports",
        headers=headers,
        json={
            "title": "Term progress",
            "body": "Steady improvement across practicals.",
            "report_type": "progress",
            "delivery_channels": ["system"],
        },
    )

    assert created.status_code == 201
    assert created.get_json()["trainer_id"] is None

    listed = client.get(f"/trainers/students/{ids['student_id']}/reports", headers=headers)
    assert listed.status_code == 200
    assert [item["title"] for item in listed.get_json()] == ["Term progress"]


def test_staff_without_the_permission_cannot_write_learner_reports(client, app):
    ids = _seed(app)
    headers = _login(client, "clerk@example.com")

    response = client.get(f"/trainers/students/{ids['student_id']}/reports", headers=headers)

    assert response.status_code == 403


def test_learners_never_write_reports_about_learners(client, app):
    ids = _seed(app)
    headers = _login(client, "learner@example.com")

    response = client.post(
        f"/trainers/students/{ids['student_id']}/reports",
        headers=headers,
        json={"title": "Self report", "body": "All good."},
    )

    assert response.status_code == 403


def test_manager_permission_opens_school_wide_reports(client, app):
    _seed(app)
    headers = _login(client, "manager@example.com")

    assert client.get("/reports/admin/exam-results", headers=headers).status_code == 200
    assert client.get("/reports/admin/enrolment", headers=headers).status_code == 200


def test_school_wide_reports_still_deny_staff_without_the_permission(client, app):
    _seed(app)
    headers = _login(client, "clerk@example.com")

    assert client.get("/reports/admin/exam-results", headers=headers).status_code == 403
    assert client.get("/reports/admin/enrolment", headers=headers).status_code == 403


def test_manager_without_the_fees_permission_is_still_denied(client, app):
    _seed(app)
    headers = _login(client, "manager@example.com")

    assert client.get("/reports/admin/fees", headers=headers).status_code == 403
