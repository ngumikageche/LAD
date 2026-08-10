"""
Data-visibility scoping.

Two independent axes decide which rows a caller may see. A permission key says
*what kind* of record you may touch (`students.read`); this module says *which
of those records* are yours. Granting `students.read` to a trainer must not hand
them every learner in the country — it hands them the learners in their own
institution, and, for a trainer, only the ones in the subjects they teach.

Both axes are overridden by a single master key, `data.master`. A role holding
it reads across every institution and every trainer's teaching load, which is
what a group/registry-level auditor needs. Admins hold it implicitly through the
`*` wildcard.

Callers apply these as query filters, so the scope is enforced in SQL rather
than after the fact — a route that forgets to filter leaks, a route that calls
`scope_students` cannot.
"""

from __future__ import annotations

import uuid

from sqlalchemy import and_, false, or_

from ..extensions import db
from ..models.assessment import Assessment
from ..models.course import Course
from ..models.department import Department
from ..models.institution import Institution
from ..models.module import Module
from ..models.score import Score
from ..models.student import Student
from ..models.student_subject import StudentSubject
from ..models.subject import Subject
from ..models.trainer import Trainer
from ..models.trainer_subject import TrainerSubject
from ..models.user import User


MASTER_DATA_KEY = "data.master"


# ── Capability checks ────────────────────────────────────────────────────────

def _permissions(user: User | None) -> dict:
    if not user or not user.role:
        return {}
    return user.role.permissions or {}


def is_admin(user: User | None) -> bool:
    role_name = ((user.role.role_name if user and user.role else "") or "").lower()
    return role_name in {"admin", "super admin"} or _permissions(user).get("*") is True


def can_view_master_data(user: User | None) -> bool:
    """
    True when the caller reads across institutions and across other trainers'
    teaching loads. Admins qualify via the wildcard; anyone else needs the key
    granted explicitly from the Roles screen.
    """
    if is_admin(user):
        return True
    return _permissions(user).get(MASTER_DATA_KEY) is True


def is_trainer(user: User | None) -> bool:
    if not user:
        return False
    role_name = ((user.role.role_name if user.role else "") or "").lower()
    return role_name == "trainer" or user.trainer is not None


def is_student(user: User | None) -> bool:
    if not user:
        return False
    role_name = ((user.role.role_name if user.role else "") or "").lower()
    return role_name == "student" or user.student is not None


# ── Institution axis ─────────────────────────────────────────────────────────

def visible_institution_id(user: User | None) -> uuid.UUID | None:
    """
    The single institution the caller is confined to, or None when unconfined.

    None means "no institution filter" — either the caller holds master data
    rights, or they are an unattached account whose institution is unknown.
    Use `has_institution_scope` to tell those two apart.
    """
    if can_view_master_data(user):
        return None
    return user.institution_id if user else None


def has_institution_scope(user: User | None) -> bool:
    """True when an institution filter should actually be applied."""
    return visible_institution_id(user) is not None


def scope_institutions(query, user: User | None):
    institution_id = visible_institution_id(user)
    if institution_id is None:
        return query
    return query.filter(Institution.id == institution_id)


def scope_departments(query, user: User | None):
    institution_id = visible_institution_id(user)
    if institution_id is None:
        return query
    return query.filter(Department.institution_id == institution_id)


def scope_courses(query, user: User | None):
    institution_id = visible_institution_id(user)
    if institution_id is None:
        return query
    department_ids = db.session.query(Department.id).filter(
        Department.institution_id == institution_id
    )
    return query.filter(Course.department_id.in_(department_ids))


def scope_modules(query, user: User | None):
    """Institution scope, narrowed to the modules a trainer actually teaches in."""
    institution_id = visible_institution_id(user)
    if institution_id is not None:
        query = query.filter(Module.course_id.in_(institution_course_ids(institution_id)))

    subject_ids = trainer_subject_ids(user)
    if subject_ids is not None:
        if not subject_ids:
            return query.filter(false())
        taught_module_ids = db.session.query(Subject.module_id).filter(Subject.id.in_(subject_ids))
        query = query.filter(Module.id.in_(taught_module_ids))

    return query


def scope_users(query, user: User | None):
    institution_id = visible_institution_id(user)
    if institution_id is None:
        return query
    return query.filter(User.institution_id == institution_id)


def institution_course_ids(institution_id: uuid.UUID):
    """Course ids belonging to an institution, as a subquery."""
    department_ids = db.session.query(Department.id).filter(
        Department.institution_id == institution_id
    )
    return db.session.query(Course.id).filter(Course.department_id.in_(department_ids))


def _institution_subject_ids(institution_id: uuid.UUID):
    module_ids = db.session.query(Module.id).filter(
        Module.course_id.in_(institution_course_ids(institution_id))
    )
    return db.session.query(Subject.id).filter(Subject.module_id.in_(module_ids))


# ── Trainer axis ─────────────────────────────────────────────────────────────

def _trainer_assignment_ids(trainer_id: uuid.UUID) -> set[uuid.UUID]:
    """The raw assignment lookup, kept separate so the rules above it are testable."""
    rows = db.session.query(TrainerSubject.subject_id).filter(
        TrainerSubject.trainer_id == trainer_id
    ).all()
    return {row[0] for row in rows}


def trainer_subject_ids(user: User | None) -> set[uuid.UUID] | None:
    """
    Subject ids a trainer is assigned to, or None when no trainer restriction
    applies (master-data holders, admins, and non-trainer accounts).

    An empty set is meaningful and distinct from None: a trainer with no
    assignments sees nothing rather than everything.
    """
    if can_view_master_data(user) or not is_trainer(user):
        return None
    trainer = user.trainer or db.session.query(Trainer).filter(Trainer.user_id == user.id).first()
    if not trainer:
        return set()
    return _trainer_assignment_ids(trainer.id)


def trainer_student_ids(user: User | None) -> set[uuid.UUID] | None:
    """Learners enrolled in any subject the trainer teaches, or None if unscoped."""
    subject_ids = trainer_subject_ids(user)
    if subject_ids is None:
        return None
    if not subject_ids:
        return set()
    rows = db.session.query(StudentSubject.student_id).filter(
        StudentSubject.subject_id.in_(subject_ids)
    ).distinct().all()
    return {row[0] for row in rows}


# ── Combined scopes ──────────────────────────────────────────────────────────

def scope_subjects(query, user: User | None):
    """Institution scope, narrowed further to a trainer's own subjects."""
    institution_id = visible_institution_id(user)
    if institution_id is not None:
        query = query.filter(Subject.id.in_(_institution_subject_ids(institution_id)))

    subject_ids = trainer_subject_ids(user)
    if subject_ids is not None:
        query = query.filter(Subject.id.in_(subject_ids)) if subject_ids else query.filter(false())

    if is_student(user) and user.student:
        enrolled = db.session.query(StudentSubject.subject_id).filter(
            StudentSubject.student_id == user.student.id
        )
        query = query.filter(Subject.id.in_(enrolled))

    return query


def scope_students(query, user: User | None):
    """Institution scope, narrowed to a trainer's own learners, or to self."""
    institution_id = visible_institution_id(user)
    if institution_id is not None:
        institution_user_ids = db.session.query(User.id).filter(
            User.institution_id == institution_id
        )
        query = query.filter(
            or_(
                Student.user_id.in_(institution_user_ids),
                Student.course_id.in_(institution_course_ids(institution_id)),
            )
        )

    student_ids = trainer_student_ids(user)
    if student_ids is not None:
        query = query.filter(Student.id.in_(student_ids)) if student_ids else query.filter(false())

    # A learner who was handed `students.read` still only sees themselves.
    if is_student(user) and not is_trainer(user) and not can_view_master_data(user):
        if not user.student:
            return query.filter(false())
        query = query.filter(Student.id == user.student.id)

    return query


def scope_trainers(query, user: User | None):
    """Institution scope for trainer records, via their department or user."""
    institution_id = visible_institution_id(user)
    if institution_id is None:
        return query
    department_ids = db.session.query(Department.id).filter(
        Department.institution_id == institution_id
    )
    institution_user_ids = db.session.query(User.id).filter(
        User.institution_id == institution_id
    )
    return query.filter(
        or_(
            Trainer.department_id.in_(department_ids),
            Trainer.user_id.in_(institution_user_ids),
        )
    )


def scope_scores(query, user: User | None):
    """
    Marks the caller may see.

    A trainer is held to the subjects assigned to them — not to the marks they
    personally entered, because a co-trainer's or an admin's upload on their
    subject is still their class. Scores predating the `subject_id` column are
    matched through their assessment's module so they are not silently dropped.
    """
    institution_id = visible_institution_id(user)
    if institution_id is not None:
        institution_subject_ids = _institution_subject_ids(institution_id)
        course_ids = institution_course_ids(institution_id)
        query = query.filter(
            or_(
                Score.subject_id.in_(institution_subject_ids),
                Score.student.has(Student.course_id.in_(course_ids)),
            )
        )

    subject_ids = trainer_subject_ids(user)
    if subject_ids is not None:
        if not subject_ids:
            return query.filter(false())
        taught_module_ids = db.session.query(Subject.module_id).filter(Subject.id.in_(subject_ids))
        query = query.filter(
            or_(
                Score.subject_id.in_(subject_ids),
                and_(
                    Score.subject_id.is_(None),
                    Score.assessment.has(Assessment.module_id.in_(taught_module_ids)),
                ),
            )
        )

    if is_student(user) and not is_trainer(user) and not can_view_master_data(user):
        # A student-role account with no learner profile matches nothing rather
        # than every score whose `student_id` happens to be null.
        if not user.student:
            return query.filter(false())
        query = query.filter(Score.student_id == user.student.id)

    return query


def can_access_score(user: User | None, score_id: uuid.UUID | None) -> bool:
    if score_id is None:
        return True
    return db.session.query(
        scope_scores(db.session.query(Score.id), user).filter(Score.id == score_id).exists()
    ).scalar()


# ── Single-record guards ─────────────────────────────────────────────────────

def can_access_subject(user: User | None, subject_id: uuid.UUID | None) -> bool:
    if subject_id is None:
        return True
    return db.session.query(
        scope_subjects(db.session.query(Subject.id), user)
        .filter(Subject.id == subject_id)
        .exists()
    ).scalar()


def can_access_student(user: User | None, student_id: uuid.UUID | None) -> bool:
    if student_id is None:
        return True
    return db.session.query(
        scope_students(db.session.query(Student.id), user)
        .filter(Student.id == student_id)
        .exists()
    ).scalar()


def can_access_institution(user: User | None, institution_id: uuid.UUID | None) -> bool:
    if institution_id is None:
        return True
    scoped = visible_institution_id(user)
    return scoped is None or scoped == institution_id


# ── Marks arithmetic ─────────────────────────────────────────────────────────

def percentage(marks_obtained: float | int | None, total_marks: float | int | None) -> float | None:
    """
    Percentage for a score, covering both marking scenarios.

    When a total is recorded the score is `(x / y) * 100`. When it is missing or
    zero the mark is already expressed out of 100, so `(x / 100) * 100` — the
    mark itself. Returning the raw mark instead of None keeps unassessed scores
    in averages rather than silently dropping them.
    """
    if marks_obtained is None:
        return None
    try:
        marks = float(marks_obtained)
    except (TypeError, ValueError):
        return None
    try:
        total = float(total_marks) if total_marks is not None else 0.0
    except (TypeError, ValueError):
        total = 0.0
    if total > 0:
        return round(marks / total * 100, 1)
    return round(marks, 1)


def score_percentage(score) -> float | None:
    """Percentage for a Score row, reading the total off its assessment."""
    assessment = getattr(score, "assessment", None)
    total = getattr(assessment, "total_marks", None) if assessment else None
    return percentage(getattr(score, "marks_obtained", None), total)


def average_percentage(scores) -> float:
    """Mean percentage across scores, mixing assessed and out-of-100 marks."""
    values = [value for value in (score_percentage(score) for score in scores) if value is not None]
    if not values:
        return 0.0
    return round(sum(values) / len(values), 1)
