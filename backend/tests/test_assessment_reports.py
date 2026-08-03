"""Summary and detailed reporting over practical assessments and exam results."""

from werkzeug.security import generate_password_hash


def _login(client, email: str) -> dict:
    response = client.post("/auth/login", json={"email": email, "password": "S3cret!"})
    token = response.get_json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _seed(app):
    """An admin, an assessor with one subject, and two learners carrying results."""
    from app.extensions import db
    from app.models.assessment import Assessment
    from app.models.course import Course
    from app.models.department import Department
    from app.models.institution import Institution
    from app.models.module import Module
    from app.models.practical_assessment_report import PracticalAssessmentReport
    from app.models.role_permission import RolePermission
    from app.models.score import Score
    from app.models.student import Student
    from app.models.student_subject import StudentSubject
    from app.models.subject import Subject
    from app.models.trainer import Trainer
    from app.models.trainer_subject import TrainerSubject
    from app.models.user import User

    with app.app_context():
        admin_role = RolePermission(role_name="Admin", permissions={"*": True})
        trainer_role = RolePermission(
            role_name="Trainer",
            permissions={
                "trainers.read": True,
                "reports.practical.assessment": True,
                "reports.admin.pass_rate": True,
            },
        )
        student_role = RolePermission(role_name="Student", permissions={"scores.read": True})
        plain_role = RolePermission(role_name="Clerk", permissions={"students.read": True})
        institution = Institution(name="LAD College", type="College", location="Nairobi")
        db.session.add_all([admin_role, trainer_role, student_role, plain_role, institution])
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

        subject = Subject(module_id=module.id, name="Install Power Lines")
        db.session.add(subject)
        db.session.flush()

        assessment = Assessment(
            course_id=course.id,
            module_id=module.id,
            name="End of Term Exam",
            assessment_type="exam",
            total_marks=100,
            pass_marks=50,
        )
        db.session.add(assessment)
        db.session.flush()

        def make_user(name, email, role_id):
            user = User(
                name=name,
                email=email,
                password_hash=generate_password_hash("S3cret!"),
                role_id=role_id,
                institution_id=institution.id,
            )
            db.session.add(user)
            db.session.flush()
            return user

        admin_user = make_user("Admin One", "admin@example.com", admin_role.id)
        trainer_user = make_user("Assessor One", "assessor@example.com", trainer_role.id)
        clerk_user = make_user("Clerk One", "clerk@example.com", plain_role.id)

        trainer = Trainer(user_id=trainer_user.id, department_id=department.id)
        db.session.add(trainer)
        db.session.flush()
        db.session.add(TrainerSubject(trainer_id=trainer.id, subject_id=subject.id))

        students = []
        for index, label in enumerate(("alpha", "beta"), start=1):
            student_user = make_user(f"Learner {label.title()}", f"{label}@example.com", student_role.id)
            student = Student(
                user_id=student_user.id,
                registration_number=f"REG-00{index}",
                course_id=course.id,
                enrollment_year=2026,
            )
            db.session.add(student)
            db.session.flush()
            db.session.add(StudentSubject(student_id=student.id, subject_id=subject.id))
            students.append(student)

        # One competent practical report, one not yet competent.
        for student, score in zip(students, (22.0, 8.0)):
            db.session.add(
                PracticalAssessmentReport(
                    student_id=student.id,
                    trainer_id=trainer.id,
                    status="complete",
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
            )

        # One pass, one fail.
        for student, marks in zip(students, (81.0, 34.0)):
            db.session.add(
                Score(
                    student_id=student.id,
                    subject_id=subject.id,
                    trainer_id=trainer.id,
                    assessment_id=assessment.id,
                    term="TERM1",
                    marks_obtained=marks,
                    is_passed=marks >= 50,
                )
            )

        db.session.commit()
        return {
            "course_id": str(course.id),
            "subject_id": str(subject.id),
            "trainer_id": str(trainer.id),
            "admin_email": admin_user.email,
            "clerk_email": clerk_user.email,
        }


def test_practical_summary_aggregates_competency_outcomes(client, app):
    _seed(app)
    headers = _login(client, "admin@example.com")

    response = client.get("/reports/assessments/practical/summary", headers=headers)

    assert response.status_code == 200, response.get_json()
    body = response.get_json()
    assert body["summary"]["total_reports"] == 2
    assert body["summary"]["learners_assessed"] == 2
    assert body["summary"]["competent"] == 1
    assert body["summary"]["not_yet_competent"] == 1
    assert body["summary"]["competency_rate"] == 50.0
    assert len(body["by_unit"]) == 1
    assert body["by_unit"][0]["reports"] == 2
    assert body["by_assessor"][0]["assessor_name"] == "Assessor One"
    assert body["by_course"][0]["course_name"] == "Electrical"


def test_practical_detailed_lists_learners_with_task_breakdown(client, app):
    _seed(app)
    headers = _login(client, "admin@example.com")

    response = client.get("/reports/assessments/practical/detailed", headers=headers)

    assert response.status_code == 200, response.get_json()
    body = response.get_json()
    assert body["row_count"] == 2
    assert body["truncated"] is False
    row = next(r for r in body["rows"] if r["registration_number"] == "REG-001")
    assert row["competency_outcome"] == "COMPETENT"
    assert row["total_score"] == 22.0
    assert row["tasks_total"] == 1
    assert row["tasks_scored"] == 1
    assert row["tasks"][0]["prompt"] == "String the two spans"
    assert row["tasks"][0]["max_score"] == 25


def test_practical_report_filters_by_outcome(client, app):
    _seed(app)
    headers = _login(client, "admin@example.com")

    response = client.get(
        "/reports/assessments/practical/detailed?outcome=NOT YET COMPETENT",
        headers=headers,
    )

    assert response.status_code == 200
    rows = response.get_json()["rows"]
    assert [row["registration_number"] for row in rows] == ["REG-002"]


def test_exam_summary_groups_by_assessment_subject_and_course(client, app):
    _seed(app)
    headers = _login(client, "admin@example.com")

    response = client.get("/reports/assessments/exams/summary", headers=headers)

    assert response.status_code == 200, response.get_json()
    body = response.get_json()
    assert body["summary"]["total_entries"] == 2
    assert body["summary"]["passed"] == 1
    assert body["summary"]["failed"] == 1
    assert body["summary"]["pass_rate"] == 50.0
    assert body["summary"]["average_mark"] == 57.5
    assert body["by_assessment"][0]["assessment_name"] == "End of Term Exam"
    assert body["by_assessment"][0]["total_marks"] == 100.0
    assert body["by_subject"][0]["subject_name"] == "Install Power Lines"
    assert {entry["grade"] for entry in body["grade_distribution"]} == {"A", "E"}


def test_exam_detailed_returns_one_row_per_score(client, app):
    _seed(app)
    headers = _login(client, "admin@example.com")

    response = client.get("/reports/assessments/exams/detailed", headers=headers)

    assert response.status_code == 200, response.get_json()
    rows = response.get_json()["rows"]
    assert len(rows) == 2
    passed = next(row for row in rows if row["registration_number"] == "REG-001")
    assert passed["marks_obtained"] == 81.0
    assert passed["percentage"] == 81.0
    assert passed["outcome"] == "Pass"
    assert passed["assessment_name"] == "End of Term Exam"
    assert passed["trainer_name"] == "Assessor One"


def test_trainer_reports_are_scoped_to_their_own_work(client, app):
    _seed(app)
    headers = _login(client, "assessor@example.com")

    practical = client.get("/reports/assessments/practical/summary", headers=headers)
    exams = client.get("/reports/assessments/exams/summary", headers=headers)

    assert practical.status_code == 200
    assert practical.get_json()["scope"] == "own"
    assert practical.get_json()["summary"]["total_reports"] == 2
    assert exams.status_code == 200
    assert exams.get_json()["scope"] == "own"


def test_students_are_blocked_from_assessment_reports(client, app):
    _seed(app)
    headers = _login(client, "alpha@example.com")

    for path in (
        "/reports/assessments/practical/summary",
        "/reports/assessments/practical/detailed",
        "/reports/assessments/exams/summary",
        "/reports/assessments/exams/detailed",
    ):
        assert client.get(path, headers=headers).status_code == 403, path


def test_staff_without_the_permission_are_denied(client, app):
    ids = _seed(app)
    headers = _login(client, ids["clerk_email"])

    assert client.get("/reports/assessments/practical/summary", headers=headers).status_code == 403
    assert client.get("/reports/assessments/exams/summary", headers=headers).status_code == 403
