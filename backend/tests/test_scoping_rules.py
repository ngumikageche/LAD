"""
Who is confined to their own institution, and what lifts that.

These exercise the capability checks only, so they need no database and run
alongside the Postgres-backed suite rather than skipping with it.
"""

import uuid

from app.services.scoping import (
    can_view_master_data,
    is_admin,
    is_student,
    is_trainer,
    visible_institution_id,
)


class _Role:
    def __init__(self, role_name, permissions=None):
        self.role_name = role_name
        self.permissions = permissions or {}


class _User:
    def __init__(self, role, institution_id=None, trainer=None, student=None):
        self.id = uuid.uuid4()
        self.role = role
        self.institution_id = institution_id
        self.trainer = trainer
        self.student = student


INSTITUTION = uuid.uuid4()


def test_admin_wildcard_reads_master_data():
    admin = _User(_Role("Admin", {"*": True}), institution_id=INSTITUTION)
    assert is_admin(admin)
    assert can_view_master_data(admin)
    assert visible_institution_id(admin) is None


def test_super_admin_by_role_name_reads_master_data():
    assert can_view_master_data(_User(_Role("Super Admin"), institution_id=INSTITUTION))


def test_trainer_is_confined_to_their_institution():
    trainer = _User(_Role("Trainer", {"subjects.read": True}), institution_id=INSTITUTION)
    assert is_trainer(trainer)
    assert not can_view_master_data(trainer)
    assert visible_institution_id(trainer) == INSTITUTION


def test_master_data_key_lifts_the_institution_confinement():
    trainer = _User(
        _Role("Trainer", {"subjects.read": True, "data.master": True}),
        institution_id=INSTITUTION,
    )
    assert can_view_master_data(trainer)
    assert visible_institution_id(trainer) is None


def test_broad_read_keys_alone_do_not_grant_master_data():
    # The point of the split: `students.read` says what screens open, not whose
    # records they show.
    manager = _User(
        _Role("Manager", {"students.read": True, "trainers.read": True, "institutions.read": True}),
        institution_id=INSTITUTION,
    )
    assert not can_view_master_data(manager)
    assert visible_institution_id(manager) == INSTITUTION


def test_master_data_must_be_exactly_true():
    for value in (False, None, "yes", 1):
        role = _Role("Manager", {"data.master": value})
        assert not can_view_master_data(_User(role, institution_id=INSTITUTION))


def test_student_role_is_recognised_without_a_profile():
    assert is_student(_User(_Role("Student")))


def test_user_with_no_role_reads_nothing_special():
    stateless = _User(None, institution_id=INSTITUTION)
    assert not is_admin(stateless)
    assert not can_view_master_data(stateless)
    assert visible_institution_id(stateless) == INSTITUTION
