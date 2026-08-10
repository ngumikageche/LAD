"""
Score visibility, checked at the level that needs no database.

`scope_scores` builds a query filter, so its SQL cannot be asserted without a
live database — but the decisions that drive it can be, and those are where the
"a trainer can see another trainer's marks" bug lived.
"""

import uuid

import pytest

from app.services import scoping


class _Role:
    def __init__(self, role_name, permissions=None):
        self.role_name = role_name
        self.permissions = permissions or {}


class _Trainer:
    def __init__(self):
        self.id = uuid.uuid4()


class _Student:
    def __init__(self):
        self.id = uuid.uuid4()


class _User:
    def __init__(self, role, institution_id=None, trainer=None, student=None):
        self.id = uuid.uuid4()
        self.role = role
        self.institution_id = institution_id
        self.trainer = trainer
        self.student = student


INSTITUTION = uuid.uuid4()
SUBJECT_A = uuid.uuid4()
SUBJECT_B = uuid.uuid4()


@pytest.fixture
def assigned_subjects(monkeypatch):
    """Pin the trainer's assignments without touching the database."""
    def _apply(subject_ids):
        monkeypatch.setattr(
            scoping,
            "_trainer_assignment_ids",
            lambda trainer_id: set(subject_ids),
        )
    return _apply


def test_trainer_is_restricted_to_their_own_assignments(assigned_subjects):
    assigned_subjects([SUBJECT_A])
    trainer = _User(_Role("Trainer", {"admin.scores.read": True}), INSTITUTION, trainer=_Trainer())

    visible = scoping.trainer_subject_ids(trainer)

    assert visible == {SUBJECT_A}
    assert SUBJECT_B not in visible


def test_trainer_with_no_assignments_sees_nothing_not_everything(assigned_subjects):
    assigned_subjects([])
    trainer = _User(_Role("Trainer", {"admin.scores.read": True}), INSTITUTION, trainer=_Trainer())

    # An empty set is the restriction; None would mean "unrestricted".
    assert scoping.trainer_subject_ids(trainer) == set()
    assert scoping.trainer_subject_ids(trainer) is not None


def test_master_data_lifts_the_trainer_restriction(assigned_subjects):
    assigned_subjects([SUBJECT_A])
    trainer = _User(
        _Role("Trainer", {"admin.scores.read": True, "data.master": True}),
        INSTITUTION,
        trainer=_Trainer(),
    )

    assert scoping.trainer_subject_ids(trainer) is None


def test_admin_is_never_restricted_by_assignment(assigned_subjects):
    assigned_subjects([SUBJECT_A])
    admin = _User(_Role("Admin", {"*": True}), INSTITUTION, trainer=_Trainer())

    assert scoping.trainer_subject_ids(admin) is None


def test_non_trainer_staff_carry_no_subject_restriction():
    manager = _User(_Role("Manager", {"admin.scores.read": True}), INSTITUTION)

    # A manager is bounded by institution, not by teaching load.
    assert scoping.trainer_subject_ids(manager) is None
    assert scoping.visible_institution_id(manager) == INSTITUTION
