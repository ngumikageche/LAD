import uuid

import pytest

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
