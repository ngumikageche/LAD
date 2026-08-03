"""Imports never overwrite an existing record until the uploader says so."""

import io

from werkzeug.security import generate_password_hash


def _login(client, email: str) -> dict:
    response = client.post("/auth/login", json={"email": email, "password": "S3cret!"})
    token = response.get_json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _csv(text: str, name: str):
    return (io.BytesIO(text.encode("utf-8")), name)


def _seed(app):
    """An importer account, a course with two modules, and one existing learner."""
    from app.extensions import db
    from app.models.course import Course
    from app.models.department import Department
    from app.models.institution import Institution
    from app.models.module import Module
    from app.models.role_permission import RolePermission
    from app.models.student import Student
    from app.models.subject import Subject
    from app.models.trainer import Trainer
    from app.models.user import User

    with app.app_context():
        admin_role = RolePermission(role_name="Admin", permissions={"*": True})
        student_role = RolePermission(role_name="Student", permissions={"scores.read": True})
        trainer_role = RolePermission(role_name="Trainer", permissions={"trainers.read": True})
        institution = Institution(name="LAD College", type="College", location="Nairobi")
        db.session.add_all([admin_role, student_role, trainer_role, institution])
        db.session.flush()

        department = Department(institution_id=institution.id, name="Engineering", code="ENG")
        db.session.add(department)
        db.session.flush()

        course = Course(department_id=department.id, name="Electrical", cbet_level="Level 6", code="EL6")
        db.session.add(course)
        db.session.flush()

        module_a = Module(course_id=course.id, name="Power Lines", code="MOD-A")
        module_b = Module(course_id=course.id, name="Machines", code="MOD-B")
        db.session.add_all([module_a, module_b])
        db.session.flush()

        db.session.add_all([
            Subject(module_id=module_a.id, name="Install Power Lines", code="SUB-A"),
            Subject(module_id=module_b.id, name="Rewind Motors", code="SUB-B"),
        ])
        db.session.flush()

        admin_user = User(
            name="Admin One",
            email="admin@example.com",
            password_hash=generate_password_hash("S3cret!"),
            role_id=admin_role.id,
            institution_id=institution.id,
        )
        existing_user = User(
            name="Old Name",
            email="alpha@example.com",
            phone="0700000000",
            password_hash=generate_password_hash("S3cret!"),
            role_id=student_role.id,
            institution_id=institution.id,
        )
        trainer_user = User(
            name="Old Trainer",
            email="assessor@example.com",
            password_hash=generate_password_hash("S3cret!"),
            role_id=trainer_role.id,
            institution_id=institution.id,
        )
        db.session.add_all([admin_user, existing_user, trainer_user])
        db.session.flush()

        student = Student(
            user_id=existing_user.id,
            registration_number="REG-001",
            course_id=course.id,
            enrollment_year=2024,
        )
        trainer = Trainer(
            user_id=trainer_user.id,
            department_id=department.id,
            code="TRN-001",
            specialization="Old spec",
        )
        db.session.add_all([student, trainer])
        db.session.commit()

        return {
            "existing_password_hash": existing_user.password_hash,
            "student_id": str(student.id),
            "trainer_id": str(trainer.id),
        }


LEARNER_HEADER = "Reg No,Name,Email,Mobile,Course Code,Module Code\n"
LEARNER_EXISTING = "REG-001,New Name,alpha@example.com,,EL6,MOD-B\n"
LEARNER_NEW = "REG-002,Beta Learner,beta@example.com,0711111111,EL6,MOD-A\n"


def _upload_learners(client, headers, body: str, on_conflict: str | None = None):
    data = {"file": _csv(LEARNER_HEADER + body, "learners.csv")}
    if on_conflict:
        data["on_conflict"] = on_conflict
    return client.post(
        "/students/bulk-upload",
        headers=headers,
        data=data,
        content_type="multipart/form-data",
    )


# ── Learners ─────────────────────────────────────────────────────────────────

def test_learner_import_asks_before_touching_an_existing_learner(client, app):
    seeded = _seed(app)
    headers = _login(client, "admin@example.com")

    response = _upload_learners(client, headers, LEARNER_EXISTING + LEARNER_NEW)

    assert response.status_code == 409, response.get_json()
    body = response.get_json()
    assert body["needs_conflict_decision"] is True
    assert body["conflict_count"] == 1
    assert body["new_count"] == 1
    assert body["conflicts"][0]["registration_number"] == "REG-001"
    assert body["conflicts"][0]["current_name"] == "Old Name"

    # Nothing was written — not even the new row.
    from app.extensions import db
    from app.models.student import Student
    with app.app_context():
        assert db.session.query(Student).count() == 1


def test_learner_import_skip_leaves_the_existing_learner_alone(client, app):
    _seed(app)
    headers = _login(client, "admin@example.com")

    response = _upload_learners(client, headers, LEARNER_EXISTING + LEARNER_NEW, on_conflict="skip")

    assert response.status_code == 200, response.get_json()
    body = response.get_json()
    assert body["created"] == 1
    assert body["updated"] == 0
    assert body["duplicates"] == 1

    from app.extensions import db
    from app.models.user import User
    with app.app_context():
        assert db.session.query(User).filter_by(email="alpha@example.com").one().name == "Old Name"


def test_learner_import_update_writes_only_the_filled_cells(client, app):
    seeded = _seed(app)
    headers = _login(client, "admin@example.com")

    response = _upload_learners(client, headers, LEARNER_EXISTING, on_conflict="update")

    assert response.status_code == 200, response.get_json()
    assert response.get_json()["updated"] == 1

    from app.extensions import db
    from app.models.enrollment import Enrollment
    from app.models.user import User
    with app.app_context():
        user = db.session.query(User).filter_by(email="alpha@example.com").one()
        assert user.name == "New Name"          # filled cell overwrote
        assert user.phone == "0700000000"       # blank Mobile kept the stored value
        assert user.password_hash == seeded["existing_password_hash"]  # never reset
        # The named module was linked without disturbing anything else.
        assert db.session.query(Enrollment).filter_by(student_id=seeded["student_id"]).count() == 1


def test_learner_import_with_no_conflicts_needs_no_decision(client, app):
    _seed(app)
    headers = _login(client, "admin@example.com")

    response = _upload_learners(client, headers, LEARNER_NEW)

    assert response.status_code == 200, response.get_json()
    assert response.get_json()["created"] == 1


# ── Trainers ─────────────────────────────────────────────────────────────────

TRAINER_HEADER = "Staff No,Name,Email,Mobile,Department,Specialization,Subjects\n"


def _upload_trainers(client, headers, body: str, on_conflict: str | None = None):
    data = {"file": _csv(TRAINER_HEADER + body, "trainers.csv")}
    if on_conflict:
        data["on_conflict"] = on_conflict
    return client.post(
        "/trainers/bulk-upload",
        headers=headers,
        data=data,
        content_type="multipart/form-data",
    )


def test_trainer_import_asks_before_touching_an_existing_trainer(client, app):
    _seed(app)
    headers = _login(client, "admin@example.com")

    response = _upload_trainers(
        client, headers, "TRN-001,New Trainer,assessor@example.com,,ENG,,\n"
    )

    assert response.status_code == 409, response.get_json()
    body = response.get_json()
    assert body["conflict_count"] == 1
    assert body["conflicts"][0]["staff_number"] == "TRN-001"


def test_trainer_import_update_keeps_values_the_sheet_left_blank(client, app):
    _seed(app)
    headers = _login(client, "admin@example.com")

    response = _upload_trainers(
        client,
        headers,
        "TRN-001,New Trainer,assessor@example.com,,ENG,,SUB-A\n",
        on_conflict="update",
    )

    assert response.status_code == 200, response.get_json()
    assert response.get_json()["updated"] == 1

    from app.extensions import db
    from app.models.trainer import Trainer
    from app.models.trainer_subject import TrainerSubject
    with app.app_context():
        trainer = db.session.query(Trainer).filter_by(code="TRN-001").one()
        assert trainer.user.name == "New Trainer"     # filled cell overwrote
        assert trainer.specialization == "Old spec"   # blank cell kept the value
        assert db.session.query(TrainerSubject).filter_by(trainer_id=trainer.id).count() == 1


def test_trainer_import_skip_reports_the_row_as_a_duplicate(client, app):
    _seed(app)
    headers = _login(client, "admin@example.com")

    response = _upload_trainers(
        client,
        headers,
        "TRN-001,New Trainer,assessor@example.com,,ENG,,\n",
        on_conflict="skip",
    )

    assert response.status_code == 200
    body = response.get_json()
    assert body["duplicates"] == 1
    assert body["updated"] == 0

    from app.extensions import db
    from app.models.trainer import Trainer
    with app.app_context():
        assert db.session.query(Trainer).filter_by(code="TRN-001").one().user.name == "Old Trainer"


def test_an_unrecognised_conflict_mode_is_treated_as_undecided(client, app):
    _seed(app)
    headers = _login(client, "admin@example.com")

    response = _upload_learners(client, headers, LEARNER_EXISTING, on_conflict="overwrite-everything")

    assert response.status_code == 409
