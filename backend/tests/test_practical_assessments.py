import uuid

import pytest

from app.models.institution import Institution
from app.models.practical_assessment_report import PracticalAssessmentReport
from app.models.student import Student
from app.models.trainer import Trainer
from app.models.user import User
from app.routes import practical_assessments


def test_report_payload_tolerates_malformed_nested_practical_data(monkeypatch):
    monkeypatch.setattr(practical_assessments, "_assessment_context", lambda student, trainer: {})

    student_user = User(
        id=uuid.uuid4(),
        name="Student Example",
        email="student@example.com",
        password_hash="hash",
        role_id=uuid.uuid4(),
    )
    trainer_user = User(
        id=uuid.uuid4(),
        name="Trainer Example",
        email="trainer@example.com",
        password_hash="hash",
        role_id=uuid.uuid4(),
    )
    student = Student(
        id=uuid.uuid4(),
        user_id=student_user.id,
        user=student_user,
        registration_number="REG-001",
        enrollment_year=2025,
    )
    trainer = Trainer(
        id=uuid.uuid4(),
        user_id=trainer_user.id,
        user=trainer_user,
    )
    report = PracticalAssessmentReport(
        id=uuid.uuid4(),
        student_id=student.id,
        trainer_id=trainer.id,
        student=student,
        trainer=trainer,
        status="draft",
        report_sections=["bad legacy blob"],
        task_items=["bad task"],
        oral_questions=["bad oral"],
    )

    payload = practical_assessments._report_payload(report)

    assert payload["student_name"] == "Student Example"
    assert payload["trainer_name"] == "Trainer Example"
    assert payload["report_sections"] == []
    assert payload["task_items"] == []
    assert payload["oral_questions"] == []


def test_practical_section_score_cannot_exceed_configured_maximum():
    with pytest.raises(ValueError, match="cannot exceed max_score"):
        practical_assessments._normalize_report_sections([
            {
                "title": "Session 1",
                "type": "session",
                "items": [{"prompt": "Complete task", "score": 3, "max_score": 2}],
            }
        ])


def test_practical_status_is_restricted_to_supported_workflow_values():
    with pytest.raises(ValueError, match="must be draft, complete, or released"):
        practical_assessments._validate_task_descriptions({"status": "published"})


def test_student_payload_hides_assessor_guidance_and_private_evidence(monkeypatch):
    monkeypatch.setattr(
        practical_assessments,
        "_report_payload",
        lambda report: {
            "report_sections": [
                {
                    "title": "Oral check",
                    "assessor_guide": "Private section guide",
                    "items": [
                        {
                            "prompt": "Explain the test",
                            "expected_response": "Private marking points",
                            "remark": "Clear explanation",
                        }
                    ],
                }
            ],
            "oral_questions": [
                {
                    "question": "Name the tool",
                    "answer_guidance": "Private answer",
                    "awarded_score": 1,
                }
            ],
            "media_attachments": [
                {"id": "private", "student_visible": False},
                {"id": "shared", "student_visible": True},
            ],
        },
    )

    payload = practical_assessments._student_report_payload(object())

    assert "assessor_guide" not in payload["report_sections"][0]
    assert "expected_response" not in payload["report_sections"][0]["items"][0]
    assert "answer_guidance" not in payload["oral_questions"][0]
    assert [item["id"] for item in payload["media_attachments"]] == ["shared"]


def test_reused_report_blueprint_keeps_design_and_clears_learner_results():
    report = PracticalAssessmentReport(
        id=uuid.uuid4(),
        student_id=uuid.uuid4(),
        trainer_id=uuid.uuid4(),
        report_sections=[
            {
                "number": 1,
                "title": "Session 1",
                "type": "session",
                "description": "Practical checklist",
                "items": [
                    {
                        "number": 1,
                        "prompt": "Wire the control circuit",
                        "expected_response": "Circuit follows the approved diagram",
                        "remark": "Completed correctly",
                        "sub_items": ["Isolate supply", "Test continuity"],
                        "score": 18,
                        "max_score": 20,
                    }
                ],
            }
        ],
        task_items=[
            {
                "number": 1,
                "description": "Wire the control circuit",
                "score": 18,
                "remark": "Completed correctly",
                "max_score": 20,
            }
        ],
        oral_questions=[
            {
                "number": 1,
                "question": "Why isolate the supply?",
                "answer_guidance": "Prevent electrical injury",
                "awarded_score": 1,
                "max_score": 1,
            }
        ],
    )

    sections = practical_assessments._report_blueprint_sections(report)
    tasks = practical_assessments._report_blueprint_tasks(report)
    oral = practical_assessments._report_blueprint_oral_questions(report)

    assert sections[0]["items"][0]["prompt"] == "Wire the control circuit"
    assert sections[0]["items"][0]["expected_response"] == "Circuit follows the approved diagram"
    assert sections[0]["items"][0]["score"] is None
    assert sections[0]["items"][0]["remark"] is None
    assert tasks[0]["description"] == "Wire the control circuit"
    assert tasks[0]["score"] is None
    assert tasks[0]["remark"] is None
    assert oral[0]["answer_guidance"] == "Prevent electrical injury"
    assert oral[0]["awarded_score"] is None


@pytest.mark.parametrize(
    ("percentage", "rating"),
    [
        (100.0, "ATTAINED MASTERY"),
        (80.0, "ATTAINED MASTERY"),
        (79.9, "PROFICIENT"),
        (65.0, "PROFICIENT"),
        (64.9, "COMPETENT"),
        (50.0, "COMPETENT"),
        (49.9, "NOT YET COMPETENT"),
        (0.0, "NOT YET COMPETENT"),
        (None, "INCOMPLETE"),
    ],
)
def test_competence_rating_bands(percentage, rating):
    assert PracticalAssessmentReport.rating_for(percentage) == rating


def test_only_ratings_at_or_above_the_pass_mark_count_as_competent():
    assert PracticalAssessmentReport.is_competent("ATTAINED MASTERY") is True
    assert PracticalAssessmentReport.is_competent("PROFICIENT") is True
    assert PracticalAssessmentReport.is_competent("COMPETENT") is True
    assert PracticalAssessmentReport.is_competent("NOT YET COMPETENT") is False
    assert PracticalAssessmentReport.is_competent("INCOMPLETE") is False
    assert PracticalAssessmentReport.is_competent(None) is False


def test_compute_rates_marked_sections_against_the_competence_bands():
    report = PracticalAssessmentReport(
        id=uuid.uuid4(),
        student_id=uuid.uuid4(),
        trainer_id=uuid.uuid4(),
        report_sections=[
            {
                "number": 1,
                "title": "Session 1",
                "type": "session",
                "items": [
                    {"number": 1, "prompt": "Wire the control circuit", "score": 13, "max_score": 20}
                ],
            }
        ],
    )

    report.compute()

    assert report.total_score == 13
    assert report.competency_outcome == "PROFICIENT"  # 65%


def _candidate_and_assessor():
    student_user = User(
        id=uuid.uuid4(),
        name="Student Example",
        email="student@example.com",
        password_hash="hash",
        role_id=uuid.uuid4(),
    )
    trainer_user = User(
        id=uuid.uuid4(),
        name="Trainer Example",
        email="trainer@example.com",
        password_hash="hash",
        role_id=uuid.uuid4(),
    )
    student = Student(
        id=uuid.uuid4(),
        user_id=student_user.id,
        user=student_user,
        registration_number="REG-001",
        enrollment_year=2025,
    )
    trainer = Trainer(id=uuid.uuid4(), user_id=trainer_user.id, user=trainer_user)
    return student, trainer


def test_institution_is_read_from_the_linked_database_record():
    student, trainer = _candidate_and_assessor()
    institution = Institution(
        id=uuid.uuid4(),
        name="Riverside Technical College",
        type="TVET",
        location="Nairobi",
    )
    student.user.institution = institution

    assert practical_assessments._resolve_institution(student, trainer) is institution


def test_legacy_sample_institution_name_is_never_displayed():
    report = PracticalAssessmentReport(
        id=uuid.uuid4(),
        student_id=uuid.uuid4(),
        trainer_id=uuid.uuid4(),
        institution_name="Thika Technical Training Institute",
    )

    assert practical_assessments._display_context_value(report, "institution_name", {}) is None
    assert practical_assessments._display_context_value(
        report, "institution_name", {"institution_name": "Riverside Technical College"}
    ) == "Riverside Technical College"
