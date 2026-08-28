"""
Who is confined to their own institution, and what lifts that.

These exercise the capability checks only, so they need no database and run
alongside the Postgres-backed suite rather than skipping with it.
"""

import uuid

from app.services.scoping import (
    can_view_master_data,
    is_admin,
    is_department_head,
    is_student,
    is_super_admin,
    is_trainer,
    oversight_mode,
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


class _Trainer:
    def __init__(self, department_id=None):
        self.id = uuid.uuid4()
        self.department_id = department_id


INSTITUTION = uuid.uuid4()
DEPARTMENT = uuid.uuid4()


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


# ── Oversight level: whose cohorts a cross-cohort report covers ───────────────
#
# `oversight_mode` takes the trainer profile as an argument precisely so these
# need no database, unlike the id lookups `oversight_scope` layers on top.


def test_super_admin_oversees_every_institution():
    super_admin = _User(_Role("Super Admin", {"*": True}))
    assert is_super_admin(super_admin)
    assert oversight_mode(super_admin, None) == "all"


def test_college_admin_is_held_to_their_own_college():
    # The distinction the whole level exists for: the wildcard says what this
    # role may do, and the institution on the account says whose data.
    college_admin = _User(_Role("Admin", {"*": True}), institution_id=INSTITUTION)
    assert is_admin(college_admin)
    assert not is_super_admin(college_admin)
    assert oversight_mode(college_admin, None) == "institution"


def test_master_data_key_still_lifts_a_college_admin_to_every_institution():
    auditor = _User(_Role("Admin", {"*": True, "data.master": True}), institution_id=INSTITUTION)
    assert oversight_mode(auditor, None) == "all"


def test_trainer_is_held_to_their_own_teaching_load():
    trainer = _User(_Role("Trainer", {"scores.read": True}), institution_id=INSTITUTION)
    assert oversight_mode(trainer, _Trainer(department_id=DEPARTMENT)) == "trainer"


def test_head_of_department_is_held_to_their_department():
    for role_name in ("HOD", "Head of Department", "Engineering Head of Department"):
        head = _User(_Role(role_name, {"scores.read": True}), institution_id=INSTITUTION)
        assert is_department_head(head), role_name
        assert oversight_mode(head, _Trainer(department_id=DEPARTMENT)) == "department"


def test_department_key_promotes_a_trainer_to_their_whole_department():
    head = _User(
        _Role("Programme Lead", {"scores.read": True, "data.department": True}),
        institution_id=INSTITUTION,
    )
    assert oversight_mode(head, _Trainer(department_id=DEPARTMENT)) == "department"


def test_head_of_department_without_a_department_falls_back_to_their_college():
    # No department to be held to, so the college is the honest answer — an
    # empty department scope would show them nothing at all.
    head = _User(_Role("HOD", {"scores.read": True}), institution_id=INSTITUTION)
    assert oversight_mode(head, _Trainer(department_id=None)) == "institution"
    assert oversight_mode(head, None) == "institution"


def test_admin_who_also_teaches_still_oversees_the_college():
    teaching_admin = _User(_Role("Admin", {"*": True}), institution_id=INSTITUTION)
    assert oversight_mode(teaching_admin, _Trainer(department_id=DEPARTMENT)) == "institution"


def test_unattached_account_oversees_everything():
    # Matches `visible_institution_id`, which returns None — no institution
    # recorded means no institution filter to apply.
    unattached = _User(_Role("Manager", {"students.read": True}))
    assert oversight_mode(unattached, None) == "all"
