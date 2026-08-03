"""Bulk marks never overwrite a recorded score without an explicit decision."""

import json

from werkzeug.security import generate_password_hash


def _login(client, email: str) -> dict:
    response = client.post("/auth/login", json={"email": email, "password": "S3cret!"})
    token = response.get_json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _seed(app):
    """An admin uploader, one enrolled learner, and one formative assessment."""
    from app.extensions import db
    from app.models.assessment import Assessment
    from app.models.course import Course
    from app.models.department import Department
    from app.models.enrollment import Enrollment
    from app.models.institution import Institution
    from app.models.module import Module
    from app.models.role_permission import RolePermission
    from app.models.student import Student
    from app.models.student_subject import StudentSubject
    from app.models.subject import Subject
    from app.models.user import User

    with app.app_context():
        admin_role = RolePermission(role_name="Admin", permissions={"*": True})
        student_role = RolePermission(role_name="Student", permissions={"scores.read": True})
        institution = Institution(name="LAD College", type="College", location="Nairobi")
        db.session.add_all([admin_role, student_role, institution])
        db.session.flush()

        department = Department(institution_id=institution.id, name="Engineering", code="ENG")
        db.session.add(department)
        db.session.flush()

        course = Course(department_id=department.id, name="Electrical", cbet_level="Level 6", code="EL6")
        db.session.add(course)
        db.session.flush()

        module = Module(course_id=course.id, name="Power Lines", code="MOD-A")
        db.session.add(module)
        db.session.flush()

        subject = Subject(module_id=module.id, name="Install Power Lines", code="SUB-A")
        db.session.add(subject)
        db.session.flush()

        assessment = Assessment(
            course_id=course.id,
            module_id=module.id,
            name="CAT 1",
            assessment_type="exam",
            assessment_scope="formative",
            total_marks=100,
            pass_marks=50,
        )
        db.session.add(assessment)
        db.session.flush()

        admin_user = User(
            name="Admin One",
            email="admin@example.com",
            password_hash=generate_password_hash("S3cret!"),
            role_id=admin_role.id,
            institution_id=institution.id,
        )
        learner_user = User(
            name="Alpha Learner",
            email="alpha@example.com",
            password_hash=generate_password_hash("S3cret!"),
            role_id=student_role.id,
            institution_id=institution.id,
        )
        db.session.add_all([admin_user, learner_user])
        db.session.flush()

        student = Student(
            user_id=learner_user.id,
            registration_number="REG-001",
            course_id=course.id,
            enrollment_year=2026,
        )
        db.session.add(student)
        db.session.flush()
        db.session.add_all([
            Enrollment(
                student_id=student.id,
                course_id=course.id,
                module_id=module.id,
                status="active",
            ),
            StudentSubject(student_id=student.id, subject_id=subject.id),
        ])
        db.session.commit()

        return {
            "student_id": str(student.id),
            "assessment_id": str(assessment.id),
            "subject_code": subject.code,
            "module_code": module.code,
        }


def _commit(client, headers, ids, marks: float, on_conflict: str | None = None):
    rows = [{
        "row": 2,
        "student_id": "REG-001",
        "assessment_id": ids["assessment_id"],
        "module_id": ids["module_code"],
        "subject_id": ids["subject_code"],
        "marks_obtained": marks,
        "term": "TERM1",
        "valid": True,
    }]
    data = {
        "rows": json.dumps(rows),
        "subject_code": ids["subject_code"],
    }
    if on_conflict:
        data["on_conflict"] = on_conflict
    return client.post(
        "/scores/bulk-marks/commit",
        headers=headers,
        data=data,
        content_type="multipart/form-data",
    )


def test_first_commit_inserts_without_asking(client, app):
    ids = _seed(app)
    headers = _login(client, "admin@example.com")

    response = _commit(client, headers, ids, 70)

    assert response.status_code == 200, response.get_json()
    assert response.get_json()["inserted"] == 1


def test_recommitting_the_same_learner_asks_before_overwriting(client, app):
    ids = _seed(app)
    headers = _login(client, "admin@example.com")
    _commit(client, headers, ids, 70)

    response = _commit(client, headers, ids, 85)

    assert response.status_code == 409, response.get_json()
    body = response.get_json()
    assert body["needs_conflict_decision"] is True
    assert body["conflict_count"] == 1
    conflict = body["conflicts"][0]
    assert conflict["registration_number"] == "REG-001"
    assert conflict["current_marks"] == 70
    assert conflict["new_marks"] == 85

    # The stored mark is untouched while the question is outstanding.
    from app.extensions import db
    from app.models.score import Score
    with app.app_context():
        assert db.session.query(Score).one().marks_obtained == 70


def test_skip_keeps_the_recorded_mark(client, app):
    ids = _seed(app)
    headers = _login(client, "admin@example.com")
    _commit(client, headers, ids, 70)

    response = _commit(client, headers, ids, 85, on_conflict="skip")

    assert response.status_code == 200, response.get_json()
    body = response.get_json()
    assert body["updated"] == 0
    assert body["skipped"] == 1

    from app.extensions import db
    from app.models.score import Score
    with app.app_context():
        assert db.session.query(Score).one().marks_obtained == 70


def test_update_overwrites_the_recorded_mark(client, app):
    ids = _seed(app)
    headers = _login(client, "admin@example.com")
    _commit(client, headers, ids, 70)

    response = _commit(client, headers, ids, 85, on_conflict="update")

    assert response.status_code == 200, response.get_json()
    assert response.get_json()["updated"] == 1

    from app.extensions import db
    from app.models.score import Score
    with app.app_context():
        score = db.session.query(Score).one()
        assert score.marks_obtained == 85
        assert score.grade == "A"


def test_preview_flags_rows_that_would_overwrite(client, app):
    ids = _seed(app)
    headers = _login(client, "admin@example.com")
    _commit(client, headers, ids, 70)

    csv_body = (
        "student_id,marks_obtained,assessment_code,module_code,subject_code,term\n"
        f"REG-001,85,{ids['assessment_id']},{ids['module_code']},{ids['subject_code']},TERM1\n"
    )
    response = client.post(
        "/scores/bulk-marks/preview",
        headers=headers,
        data={
            "file": (__import__("io").BytesIO(csv_body.encode()), "marks.csv"),
            "subject_code": ids["subject_code"],
        },
        content_type="multipart/form-data",
    )

    assert response.status_code == 200, response.get_json()
    body = response.get_json()
    assert body["existing"] == 1
    row = body["rows"][0]
    assert row["has_existing_score"] is True
    assert row["existing_marks"] == 70
