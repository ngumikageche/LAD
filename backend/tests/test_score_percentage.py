"""
Marks arithmetic, covering the two scenarios a mark can be recorded under.

These need no database, so they run even when the Postgres-backed suite skips.
"""

from app.services.scoping import average_percentage, percentage


class _Assessment:
    def __init__(self, total_marks):
        self.total_marks = total_marks


class _Score:
    def __init__(self, marks_obtained, total_marks=None):
        self.marks_obtained = marks_obtained
        self.assessment = _Assessment(total_marks) if total_marks is not None else None


def test_percentage_uses_total_when_recorded():
    # (x / y) * 100
    assert percentage(40, 50) == 80.0
    assert percentage(30, 40) == 75.0
    assert percentage(0, 50) == 0.0


def test_percentage_treats_missing_total_as_out_of_100():
    # (x / 100) * 100 — the mark is already a percentage
    assert percentage(72, None) == 72.0
    assert percentage(72, 0) == 72.0


def test_percentage_handles_absent_and_non_numeric_marks():
    assert percentage(None, 50) is None
    assert percentage("not a number", 50) is None
    assert percentage(45, "not a number") == 45.0


def test_average_mixes_assessed_and_out_of_100_marks():
    # 40/50 = 80%, and a bare 60 counts as 60%, so the mean is 70%.
    assert average_percentage([_Score(40, 50), _Score(60)]) == 70.0


def test_average_of_no_scores_is_zero_not_an_error():
    assert average_percentage([]) == 0.0


def test_average_ignores_scores_with_no_mark():
    assert average_percentage([_Score(80, 100), _Score(None)]) == 80.0
