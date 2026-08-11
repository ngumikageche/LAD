"""
An uploaded term label must land on a real term.

`Score.term` is free text and every report filters by it, so a label matching
no term puts the marks in the database and in none of the reports — the failure
that hid a trainer's whole class. These need no database.
"""

from app.routes.bulk_marks import _normalise_term


class _Term:
    def __init__(self, name):
        self.name = name


class _Assessment:
    def __init__(self, term_name):
        self.term = _Term(term_name) if term_name else None


LOOKUP = {"term 1 2026": "Term 1 2026", "term 2 2026": "Term 2 2026"}


def test_exact_label_is_kept():
    errors = []
    assert _normalise_term("Term 1 2026", _Assessment("Term 2 2026"), LOOKUP, 2, errors) == "Term 1 2026"
    assert errors == []


def test_case_and_whitespace_are_snapped_to_the_terms_own_spelling():
    errors = []
    assert _normalise_term("  TERM 1 2026 ", _Assessment("Term 2 2026"), LOOKUP, 2, errors) == "Term 1 2026"
    assert errors == []


def test_blank_falls_back_to_the_assessments_term_without_complaint():
    errors = []
    assert _normalise_term("", _Assessment("Term 2 2026"), LOOKUP, 2, errors) == "Term 2 2026"
    assert _normalise_term(None, _Assessment("Term 2 2026"), LOOKUP, 2, errors) == "Term 2 2026"
    assert errors == []


def test_unknown_label_is_replaced_and_reported():
    # "TERM1" is exactly the shape of label that hid 18 marks from every report.
    errors = []
    assert _normalise_term("TERM1", _Assessment("Term 2 2026"), LOOKUP, 7, errors) == "Term 2 2026"
    assert len(errors) == 1
    assert "TERM1" in errors[0] and "Term 2 2026" in errors[0]


def test_unknown_label_with_no_assessment_term_is_kept_but_flagged():
    # Nothing better to fall back to, so the mark keeps its label rather than
    # losing it — but the uploader is told it will not show on reports.
    errors = []
    assert _normalise_term("TERM1", _Assessment(None), LOOKUP, 3, errors) == "TERM1"
    assert len(errors) == 1
    assert "Academic Terms" in errors[0]


def test_no_terms_configured_at_all_still_returns_something_usable():
    errors = []
    assert _normalise_term("Term 1 2026", _Assessment("Term 1 2026"), {}, 4, errors) == "Term 1 2026"
