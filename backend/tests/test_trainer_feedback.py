from werkzeug.security import generate_password_hash


def _login(client, email: str) -> dict:
    response = client.post("/auth/login", json={"email": email, "password": "S3cret!"})
    token = response.get_json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _seed(app):
    """One trainer teaching SUB-A, one learner taking it, plus an unrelated trainer."""
    from app.extensions import db
    from app.models.course import Course
    from app.models.department import Department
    from app.models.institution import Institution
    from app.models.module import Module
    from app.models.role_permission import RolePermission
    from app.models.student import Student
    from app.models.student_subject import StudentSubject
    from app.models.subject import Subject
    from app.models.trainer import Trainer
    from app.models.trainer_subject import TrainerSubject
    from app.models.user import User

    with app.app_context():
        admin_role = RolePermission(role_name="Admin", permissions={"*": True})
        trainer_role = RolePermission(role_name="Trainer", permissions={"trainers.read": True})
        student_role = RolePermission(
            role_name="Student", permissions={"feedback.trainer.submit": True}
        )
        manager_role = RolePermission(
            role_name="Manager", permissions={"feedback.trainer.view": True}
        )
        institution = Institution(name="LAD College", type="College", location="Nairobi")
        db.session.add_all([admin_role, trainer_role, student_role, manager_role, institution])
        db.session.flush()

        department = Department(institution_id=institution.id, name="Engineering")
        db.session.add(department)
        db.session.flush()

        course = Course(department_id=department.id, name="Electrical", cbet_level="Level 5")
        db.session.add(course)
        db.session.flush()

        module = Module(course_id=course.id, name="Circuits")
        db.session.add(module)
        db.session.flush()

        taught_subject = Subject(module_id=module.id, name="Circuit Analysis")
        other_subject = Subject(module_id=module.id, name="Thermodynamics")
        db.session.add_all([taught_subject, other_subject])
        db.session.flush()

        trainer_user = User(
            name="Trainer One",
            email="trainer@example.com",
            password_hash=generate_password_hash("S3cret!"),
            role_id=trainer_role.id,
            institution_id=institution.id,
        )
        other_trainer_user = User(
            name="Trainer Two",
            email="trainer2@example.com",
            password_hash=generate_password_hash("S3cret!"),
            role_id=trainer_role.id,
            institution_id=institution.id,
        )
        student_user = User(
            name="Learner One",
            email="learner@example.com",
            password_hash=generate_password_hash("S3cret!"),
            role_id=student_role.id,
            institution_id=institution.id,
        )
        manager_user = User(
            name="Quality Manager",
            email="manager@example.com",
            password_hash=generate_password_hash("S3cret!"),
            role_id=manager_role.id,
            institution_id=institution.id,
        )
        db.session.add_all([trainer_user, other_trainer_user, student_user, manager_user])
        db.session.flush()

        trainer = Trainer(user_id=trainer_user.id, department_id=department.id)
        other_trainer = Trainer(user_id=other_trainer_user.id, department_id=department.id)
        student = Student(
            user_id=student_user.id,
            registration_number="REG-001",
            course_id=course.id,
            enrollment_year=2026,
        )
        db.session.add_all([trainer, other_trainer, student])
        db.session.flush()

        db.session.add_all([
            TrainerSubject(trainer_id=trainer.id, subject_id=taught_subject.id),
            TrainerSubject(trainer_id=other_trainer.id, subject_id=other_subject.id),
            StudentSubject(student_id=student.id, subject_id=taught_subject.id),
        ])
        db.session.commit()

        return {
            "trainer_id": str(trainer.id),
            "other_trainer_id": str(other_trainer.id),
            "taught_subject_id": str(taught_subject.id),
            "other_subject_id": str(other_subject.id),
        }


def test_learner_sees_only_trainers_who_teach_them(client, app):
    ids = _seed(app)
    headers = _login(client, "learner@example.com")

    response = client.get("/trainer-feedback/targets", headers=headers)

    assert response.status_code == 200
    targets = response.get_json()["targets"]
    assert [target["trainer_id"] for target in targets] == [ids["trainer_id"]]
    assert targets[0]["subject_id"] == ids["taught_subject_id"]
    assert targets[0]["already_submitted"] is False


def test_learner_submits_feedback_and_trainer_reads_it_anonymously(client, app):
    ids = _seed(app)
    learner = _login(client, "learner@example.com")

    created = client.post(
        "/trainer-feedback",
        headers=learner,
        json={
            "trainer_id": ids["trainer_id"],
            "subject_id": ids["taught_subject_id"],
            "rating": 4,
            "teaching_rating": 5,
            "category": "teaching",
            "comment": "Clear worked examples.",
            "is_anonymous": True,
        },
    )
    assert created.status_code == 201

    trainer = _login(client, "trainer@example.com")
    received = client.get("/trainer-feedback/received", headers=trainer)
    assert received.status_code == 200
    body = received.get_json()
    assert body["total"] == 1
    assert body["can_see_identities"] is False

    item = body["feedback"][0]
    assert item["rating"] == 4
    assert item["comment"] == "Clear worked examples."
    # The trainer must not learn who wrote it.
    assert item["student_id"] is None
    assert item["student_name"] == "Anonymous learner"

    summary = client.get("/trainer-feedback/summary", headers=trainer).get_json()
    assert summary["total"] == 1
    assert summary["average_rating"] == 4.0
    assert summary["awaiting_response"] == 1


def test_resubmitting_updates_instead_of_duplicating(client, app):
    ids = _seed(app)
    learner = _login(client, "learner@example.com")
    payload = {
        "trainer_id": ids["trainer_id"],
        "subject_id": ids["taught_subject_id"],
        "rating": 2,
        "category": "general",
    }

    first = client.post("/trainer-feedback", headers=learner, json=payload)
    assert first.status_code == 201

    revised = client.post("/trainer-feedback", headers=learner, json={**payload, "rating": 5})
    assert revised.status_code == 200

    mine = client.get("/trainer-feedback/mine", headers=learner).get_json()
    assert mine["total"] == 1
    assert mine["feedback"][0]["rating"] == 5


def test_learner_cannot_review_a_trainer_who_does_not_teach_them(client, app):
    ids = _seed(app)
    learner = _login(client, "learner@example.com")

    response = client.post(
        "/trainer-feedback",
        headers=learner,
        json={
            "trainer_id": ids["other_trainer_id"],
            "subject_id": ids["other_subject_id"],
            "rating": 1,
        },
    )

    assert response.status_code == 403


def test_rating_outside_one_to_five_is_rejected(client, app):
    ids = _seed(app)
    learner = _login(client, "learner@example.com")

    response = client.post(
        "/trainer-feedback",
        headers=learner,
        json={
            "trainer_id": ids["trainer_id"],
            "subject_id": ids["taught_subject_id"],
            "rating": 9,
        },
    )

    assert response.status_code == 400


def test_trainer_only_sees_their_own_feedback(client, app):
    ids = _seed(app)
    learner = _login(client, "learner@example.com")
    client.post(
        "/trainer-feedback",
        headers=learner,
        json={
            "trainer_id": ids["trainer_id"],
            "subject_id": ids["taught_subject_id"],
            "rating": 3,
        },
    )

    other_trainer = _login(client, "trainer2@example.com")
    body = client.get("/trainer-feedback/received", headers=other_trainer).get_json()
    assert body["total"] == 0

    # ...and cannot widen the scope by asking for someone else's trainer_id.
    filtered = client.get(
        f"/trainer-feedback/received?trainer_id={ids['trainer_id']}",
        headers=other_trainer,
    ).get_json()
    assert filtered["total"] == 0


def test_trainer_reply_reaches_the_learner(client, app):
    ids = _seed(app)
    learner = _login(client, "learner@example.com")
    created = client.post(
        "/trainer-feedback",
        headers=learner,
        json={
            "trainer_id": ids["trainer_id"],
            "subject_id": ids["taught_subject_id"],
            "rating": 3,
            "comment": "More practice time please.",
        },
    ).get_json()

    trainer = _login(client, "trainer@example.com")
    replied = client.post(
        f"/trainer-feedback/{created['id']}/respond",
        headers=trainer,
        json={"response": "Adding a lab session next week."},
    )
    assert replied.status_code == 200
    assert replied.get_json()["status"] == "answered"

    mine = client.get("/trainer-feedback/mine", headers=learner).get_json()
    assert mine["feedback"][0]["trainer_response"] == "Adding a lab session next week."


def test_staff_with_view_permission_see_all_trainers_but_not_identities(client, app):
    ids = _seed(app)
    learner = _login(client, "learner@example.com")
    client.post(
        "/trainer-feedback",
        headers=learner,
        json={
            "trainer_id": ids["trainer_id"],
            "subject_id": ids["taught_subject_id"],
            "rating": 4,
            "is_anonymous": True,
        },
    )

    manager = _login(client, "manager@example.com")
    body = client.get("/trainer-feedback/received", headers=manager).get_json()
    assert body["total"] == 1
    # `feedback.trainer.view` alone does not unmask anonymous learners.
    assert body["can_see_identities"] is False
    assert body["feedback"][0]["student_id"] is None

    directory = client.get("/trainer-feedback/trainers", headers=manager)
    assert directory.status_code == 200
    assert len(directory.get_json()["trainers"]) == 2


def test_learner_withdraws_their_feedback(client, app):
    ids = _seed(app)
    learner = _login(client, "learner@example.com")
    created = client.post(
        "/trainer-feedback",
        headers=learner,
        json={
            "trainer_id": ids["trainer_id"],
            "subject_id": ids["taught_subject_id"],
            "rating": 1,
        },
    ).get_json()

    removed = client.delete(f"/trainer-feedback/{created['id']}", headers=learner)
    assert removed.status_code == 200

    trainer = _login(client, "trainer@example.com")
    assert client.get("/trainer-feedback/received", headers=trainer).get_json()["total"] == 0
