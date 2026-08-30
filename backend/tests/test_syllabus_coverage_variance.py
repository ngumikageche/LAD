"""
Reported coverage against the coverage a class recognises.

Syllabus coverage is entered by the trainer who taught it, so the figure that
matters to an administrator is not either side on its own but the gap between
them. These exercise that arithmetic only, so they need no database and run
alongside the Postgres-backed suite rather than skipping with it.
"""

from app.routes.syllabus_validation import (
    MIN_RESPONSES_TO_FLAG,
    VARIANCE_FLAG_THRESHOLD,
    coverage_verdict,
)


def test_full_agreement_leaves_no_gap():
    """A trainer whose class recognises everything they claimed is not flagged."""
    verdict = coverage_verdict(total_topics=10, covered_topics=10, confirmed=20, denied=0)
    assert verdict["reported_pct"] == 100.0
    assert verdict["recognised_pct"] == 100.0
    assert verdict["variance"] == 0.0
    assert verdict["status"] == "confirmed"


def test_class_recognising_less_than_claimed_is_flagged():
    """The case the report exists for: 100% reported, well under that recognised."""
    verdict = coverage_verdict(total_topics=10, covered_topics=10, confirmed=12, denied=8)
    assert verdict["reported_pct"] == 100.0
    assert verdict["recognised_pct"] == 60.0
    assert verdict["variance"] == 40.0
    assert verdict["status"] == "flagged"


def test_recognised_is_measured_against_the_whole_syllabus():
    """
    A trainer half way through the syllabus whose class agrees with all of it
    reads as 50% recognised, not 100% — the figure answers "how much of the
    course was delivered", so it stays on the same scale as the reported one.
    """
    verdict = coverage_verdict(total_topics=10, covered_topics=5, confirmed=15, denied=0)
    assert verdict["reported_pct"] == 50.0
    assert verdict["recognised_pct"] == 50.0
    assert verdict["variance"] == 0.0


def test_partial_claim_partly_denied_compounds():
    """Half the syllabus claimed, half of that recognised, leaves a quarter."""
    verdict = coverage_verdict(total_topics=10, covered_topics=5, confirmed=5, denied=5)
    assert verdict["reported_pct"] == 50.0
    assert verdict["recognised_pct"] == 25.0
    assert verdict["variance"] == 25.0
    assert verdict["status"] == "flagged"


def test_no_responses_reports_nothing_rather_than_zero():
    """
    A class that has not answered is not a class denying coverage. Reporting 0%
    recognised there would flag every trainer the moment the feature shipped.
    """
    verdict = coverage_verdict(total_topics=8, covered_topics=8, confirmed=0, denied=0)
    assert verdict["recognised_pct"] is None
    assert verdict["variance"] is None
    assert verdict["status"] == "unvalidated"


def test_a_lone_dissenting_voice_does_not_flag_a_trainer():
    """Below the response floor the gap is reported but never flagged."""
    verdict = coverage_verdict(total_topics=10, covered_topics=10, confirmed=0, denied=1)
    assert verdict["responses"] < MIN_RESPONSES_TO_FLAG
    assert verdict["variance"] == 100.0
    assert verdict["status"] == "unvalidated"


def test_gap_exactly_on_the_threshold_flags():
    """The threshold is inclusive, so a pairing sitting on it is not let through."""
    verdict = coverage_verdict(total_topics=10, covered_topics=10, confirmed=8, denied=2)
    assert verdict["variance"] == VARIANCE_FLAG_THRESHOLD
    assert verdict["status"] == "flagged"


def test_a_trainer_with_no_syllabus_recorded_reports_zero_not_a_crash():
    verdict = coverage_verdict(total_topics=0, covered_topics=0, confirmed=0, denied=0)
    assert verdict["reported_pct"] == 0.0
    assert verdict["recognised_pct"] is None
    assert verdict["status"] == "unvalidated"
