"""Reusing a practical assessment build must never issue it twice to a learner."""

from werkzeug.security import generate_password_hash


def _login(client, email: str) -> dict:
    response = client.post("/auth/login", json={"email": email, "password": "S3cret!"})
    token = response.get_json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _seed(app):
    """One assessor teaching SUB-A with three learners enrolled on it."""
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
        trainer_role = RolePermission(role_name="Trainer", permissions={"trainers.read": True})
        student_role = RolePermission(role_name="Student", permissions={"scores.read": True})
        institution = Institution(name="LAD College", type="College", location="Nairobi")
        db.session.add_all([trainer_role, student_role, institution])
        db.session.flush()

        department = Department(institution_id=institution.id, name="Engineering")
        db.session.add(department)
        db.session.flush()

        course = Course(department_id=department.id, name="Electrical", cbet_level="Level 6")
        db.session.add(course)
        db.session.flush()

        module = Module(course_id=course.id, name="Power Lines")
        db.session.add(module)
        db.session.flush()

        subject = Subject(module_id=module.id, name="Install Electrical Power Lines")
        db.session.add(subject)
        db.session.flush()

        trainer_user = User(
            name="Assessor One",
            email="assessor@example.com",
            password_hash=generate_password_hash("S3cret!"),
            role_id=trainer_role.id,
            institution_id=institution.id,
        )
        db.session.add(trainer_user)
        db.session.flush()

        trainer = Trainer(user_id=trainer_user.id, department_id=department.id)
        db.session.add(trainer)
        db.session.flush()
        db.session.add(TrainerSubject(trainer_id=trainer.id, subject_id=subject.id))

        students = {}
        for index, label in enumerate(("alpha", "beta", "gamma"), start=1):
            student_user = User(
                name=f"Learner {label.title()}",
                email=f"{label}@example.com",
                password_hash=generate_password_hash("S3cret!"),
                role_id=student_role.id,
                institution_id=institution.id,
            )
            db.session.add(student_user)
            db.session.flush()
            student = Student(
                user_id=student_user.id,
                registration_number=f"REG-00{index}",
                course_id=course.id,
                enrollment_year=2026,
            )
            db.session.add(student)
            db.session.flush()
            db.session.add(StudentSubject(student_id=student.id, subject_id=subject.id))
            students[label] = str(student.id)

        db.session.commit()
        return {"trainer_id": str(trainer.id), "students": students}


def _create_source_report(client, headers, trainer_id: str, student_id: str) -> str:
    response = client.post(
        "/practical-assessments",
        headers=headers,
        json={
            "student_id": student_id,
            "trainer_id": trainer_id,
            "practical_brief": "String two spans and earth the installation.",
            "report_sections": [
                {
                    "title": "Session 1",
                    "type": "session",
                    "description": "Practical checklist",
                    "items": [
                        {
                            "prompt": "String the two spans",
                            "expected_response": "Spans tensioned to specification",
                            "max_score": 25,
                        }
                    ],
                }
            ],
        },
    )
    assert response.status_code == 201, response.get_json()
    return response.get_json()["id"]


def test_reuse_hides_learners_who_already_hold_the_template(client, app):
    ids = _seed(app)
    headers = _login(client, "assessor@example.com")
    source_id = _create_source_report(client, headers, ids["trainer_id"], ids["students"]["alpha"])

    eligible = client.get(f"/practical-assessments/{source_id}/eligible-students", headers=headers)
    assert eligible.status_code == 200
    assert {row["id"] for row in eligible.get_json()} == {
        ids["students"]["beta"],
        ids["students"]["gamma"],
    }

    assigned = client.post(
        f"/practical-assessments/{source_id}/assign",
        headers=headers,
        json={"student_ids": [ids["students"]["beta"]]},
    )
    assert assigned.status_code == 201, assigned.get_json()
    assert assigned.get_json()["created_count"] == 1

    # Beta now holds the template, so only gamma remains offerable.
    eligible_after = client.get(f"/practical-assessments/{source_id}/eligible-students", headers=headers)
    assert [row["id"] for row in eligible_after.get_json()] == [ids["students"]["gamma"]]


def test_reuse_skips_duplicates_instead_of_creating_a_second_report(client, app):
    ids = _seed(app)
    headers = _login(client, "assessor@example.com")
    source_id = _create_source_report(client, headers, ids["trainer_id"], ids["students"]["alpha"])

    first = client.post(
        f"/practical-assessments/{source_id}/assign",
        headers=headers,
        json={"student_ids": [ids["students"]["beta"]]},
    )
    assert first.status_code == 201

    # Re-selecting beta alongside a fresh learner assigns gamma only.
    second = client.post(
        f"/practical-assessments/{source_id}/assign",
        headers=headers,
        json={"student_ids": [ids["students"]["beta"], ids["students"]["gamma"]]},
    )
    assert second.status_code == 201, second.get_json()
    body = second.get_json()
    assert body["created_count"] == 1
    assert [report["student_id"] for report in body["created"]] == [ids["students"]["gamma"]]
    assert body["skipped_student_ids"] == [ids["students"]["beta"]]

    reports = client.get("/practical-assessments", headers=headers).get_json()
    beta_reports = [row for row in reports if row["student_id"] == ids["students"]["beta"]]
    assert len(beta_reports) == 1


def test_reuse_rejects_a_selection_that_is_entirely_duplicates(client, app):
    ids = _seed(app)
    headers = _login(client, "assessor@example.com")
    source_id = _create_source_report(client, headers, ids["trainer_id"], ids["students"]["alpha"])

    client.post(
        f"/practical-assessments/{source_id}/assign",
        headers=headers,
        json={"student_ids": [ids["students"]["beta"]]},
    )
    repeat = client.post(
        f"/practical-assessments/{source_id}/assign",
        headers=headers,
        json={"student_ids": [ids["students"]["beta"], ids["students"]["alpha"]]},
    )

    assert repeat.status_code == 409
    assert "already has this report" in repeat.get_json()["error"]


def test_copies_share_one_template_root_so_reuse_from_a_copy_still_dedupes(client, app):
    ids = _seed(app)
    headers = _login(client, "assessor@example.com")
    source_id = _create_source_report(client, headers, ids["trainer_id"], ids["students"]["alpha"])

    assigned = client.post(
        f"/practical-assessments/{source_id}/assign",
        headers=headers,
        json={"student_ids": [ids["students"]["beta"]]},
    )
    copy = assigned.get_json()["created"][0]
    assert copy["source_report_id"] == source_id
    assert copy["template_root_id"] == source_id

    # Reusing the copy must respect the whole lineage, not just its own learner.
    eligible = client.get(f"/practical-assessments/{copy['id']}/eligible-students", headers=headers)
    assert [row["id"] for row in eligible.get_json()] == [ids["students"]["gamma"]]


def test_scored_reports_still_match_the_unscored_template_signature():
    import uuid

    from app.models.practical_assessment_report import PracticalAssessmentReport
    from app.routes import practical_assessments

    def build(score):
        return PracticalAssessmentReport(
            id=uuid.uuid4(),
            student_id=uuid.uuid4(),
            trainer_id=uuid.uuid4(),
            practical_brief="String two spans",
            report_sections=[
                {
                    "number": 1,
                    "title": "Session 1",
                    "type": "session",
                    "items": [
                        {
                            "number": 1,
                            "prompt": "String the two spans",
                            "score": score,
                            "max_score": 25,
                        }
                    ],
                }
            ],
        )

    assert practical_assessments._blueprint_signature(build(None)) == \
        practical_assessments._blueprint_signature(build(21))
