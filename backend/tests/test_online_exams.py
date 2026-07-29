from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from app.routes import online_exams


def test_exam_schedule_is_normalized_to_utc():
    parsed = online_exams._parse_datetime("2026-07-29T12:00:00+03:00", "available_from")

    assert parsed == datetime(2026, 7, 29, 9, 0, 0)
    assert parsed.tzinfo is None


def test_student_question_never_contains_correct_answer():
    payload = online_exams._student_question({
        "id": "q1",
        "text": "Choose one",
        "type": "multiple_choice",
        "marks": 2,
        "options": ["A", "B"],
        "correct_answer": "B",
    })

    assert payload["options"] == ["A", "B"]
    assert "correct_answer" not in payload


def test_multiple_choice_requires_a_valid_answer_option():
    with pytest.raises(ValueError, match="must match one option"):
        online_exams._normalize_questions([
            {
                "text": "Choose one",
                "type": "multiple_choice",
                "marks": 1,
                "options": ["A", "B"],
                "correct_answer": "C",
            }
        ])


def test_exam_availability_blocks_future_exam():
    exam = SimpleNamespace(
        available_from=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=1),
        available_until=None,
    )

    assert online_exams._availability_error(exam) == "This exam is not open yet"
