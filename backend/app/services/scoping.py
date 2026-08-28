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

import re
import uuid
from dataclasses import dataclass

from sqlalchemy import Float, and_, case, cast, false, func, or_, true

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
DEPARTMENT_DATA_KEY = "data.department"


# ── Capability checks ────────────────────────────────────────────────────────

def _permissions(user: User | None) -> dict:
    if not user or not user.role:
        return {}
    return user.role.permissions or {}


def _role_name(user: User | None) -> str:
    return ((user.role.role_name if user and user.role else "") or "").strip().lower()


def is_admin(user: User | None) -> bool:
    role_name = _role_name(user)
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
    return _role_name(user) == "trainer" or user.trainer is not None


def is_student(user: User | None) -> bool:
    if not user:
        return False
    return _role_name(user) == "student" or user.student is not None


def is_super_admin(user: User | None) -> bool:
    """
    The group-level account that sits above every college.

    Distinct from `is_admin`, which is also true of a college's own
    administrator. The two are told apart by the institution on the account:
    a super admin is attached to none.
    """
    return _role_name(user) == "super admin"


def is_department_head(user: User | None) -> bool:
    """
    True when the caller oversees one department rather than a whole college.

    Recognised either from the role name — "HOD", "Head of Department" — or
    from the `data.department` key, which is what a differently named role gets
    granted from the Roles screen.
    """
    if not user:
        return False
    if _permissions(user).get(DEPARTMENT_DATA_KEY) is True:
        return True
    role_name = _role_name(user)
    return role_name in {"hod", "head of department", "head of dept"} or "head of department" in role_name


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
        # Three ways a mark belongs to an institution, because the first two
        # walk Institution → Department → Course → Module → Subject and every
        # link in that chain is nullable. A course with no department, or a
        # module with no course, empties both of those lists — and an `IN ()`
        # against an empty list matches nothing, so a single gap in the
        # hierarchy hid *every* mark from *every* non-master account while an
        # admin still saw them all.
        #
        # The learner's own account carries the institution directly, which no
        # amount of missing hierarchy can break, and it is exactly as narrow.
        institution_user_ids = db.session.query(User.id).filter(
            User.institution_id == institution_id
        )
        query = query.filter(
            or_(
                Score.subject_id.in_(_institution_subject_ids(institution_id)),
                Score.student.has(Student.course_id.in_(institution_course_ids(institution_id))),
                Score.student.has(Student.user_id.in_(institution_user_ids)),
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


# ── Oversight scope ──────────────────────────────────────────────────────────
#
# The cross-cohort reports — enrolment, attendance overview — answer "how is the
# organisation doing?" rather than "which records are mine?", so they need one
# more distinction than the axes above make. `can_view_master_data` treats every
# admin alike, but a college administrator and the group super admin are not
# alike: the first administers one college out of several and must not read the
# other two, while the second is attached to no college precisely so they can
# read them all. The institution on the account is what separates them.
#
# Four levels, narrowest first. Each is contained by the one below it:
#
#   trainer     — the subjects assigned to them, and the learners on those
#   department  — one department, for a head of department
#   institution — one college, for its administrator and its staff
#   all         — every college, for the group super admin and `data.master`
#
# `oversight_mode` decides which one a caller sits at; `oversight_scope` then
# resolves that level into the ids a query can filter on.


@dataclass(frozen=True)
class OversightScope:
    """What one caller may see in a cross-cohort report."""

    mode: str
    label: str
    institution_id: uuid.UUID | None = None
    department_id: uuid.UUID | None = None
    #: None means "no restriction"; an empty collection means "nothing matches".
    course_ids: list[uuid.UUID] | None = None
    student_ids: set[uuid.UUID] | None = None
    trainer_ids: list[uuid.UUID] | None = None

    @property
    def is_unrestricted(self) -> bool:
        return self.mode == "all"

    @property
    def cache_key(self) -> str:
        """
        A signature for caching. Two callers share a cached report only when
        they are held to exactly the same rows — without this, the first
        trainer to open a report would serve their view to everyone.

        In trainer mode the rows follow that individual's subject assignments,
        so the trainer is part of the signature; two trainers in one department
        must not collide. In the wider modes the department or the institution
        determines the rows on its own.
        """
        owner = self.trainer_ids[0] if self.mode == "trainer" and self.trainer_ids else None
        return f"{self.mode}:{self.institution_id}:{self.department_id}:{owner}"


def _resolve_trainer(user: User | None) -> Trainer | None:
    if not user:
        return None
    return user.trainer or db.session.query(Trainer).filter(Trainer.user_id == user.id).first()


def _course_ids_in_department(department_id: uuid.UUID) -> list[uuid.UUID]:
    return [
        row[0] for row in db.session.query(Course.id).filter(
            Course.department_id == department_id, Course.deleted_at.is_(None)
        ).all()
    ]


def _course_ids_in_institution(institution_id: uuid.UUID) -> list[uuid.UUID]:
    return [
        row[0] for row in db.session.query(Course.id)
        .join(Department, Department.id == Course.department_id)
        .filter(
            Department.institution_id == institution_id,
            Department.deleted_at.is_(None),
            Course.deleted_at.is_(None),
        ).all()
    ]


def _course_ids_for_subjects(subject_ids: set[uuid.UUID]) -> list[uuid.UUID]:
    """The courses a set of subjects sits under, walked Subject → Module → Course."""
    if not subject_ids:
        return []
    module_ids = db.session.query(Subject.module_id).filter(Subject.id.in_(subject_ids))
    return [
        row[0] for row in db.session.query(Module.course_id)
        .filter(Module.id.in_(module_ids), Module.course_id.isnot(None))
        .distinct().all()
    ]


def _trainer_ids_in_departments(department_ids: list[uuid.UUID]) -> list[uuid.UUID]:
    if not department_ids:
        return []
    return [
        row[0] for row in db.session.query(Trainer.id)
        .filter(Trainer.department_id.in_(department_ids), Trainer.deleted_at.is_(None))
        .all()
    ]


def _trainer_ids_in_institution(institution_id: uuid.UUID) -> list[uuid.UUID]:
    """
    Trainers belonging to a college, by their department or by their own login.

    Both links are followed because `Trainer.department_id` is nullable — a
    trainer created without one would otherwise drop out of their own college's
    reports entirely.
    """
    department_ids = db.session.query(Department.id).filter(
        Department.institution_id == institution_id
    )
    institution_user_ids = db.session.query(User.id).filter(
        User.institution_id == institution_id
    )
    return [
        row[0] for row in db.session.query(Trainer.id).filter(
            or_(
                Trainer.department_id.in_(department_ids),
                Trainer.user_id.in_(institution_user_ids),
            )
        ).all()
    ]


def oversight_mode(user: User | None, trainer: Trainer | None) -> str:
    """
    Which of the four levels a caller sits at. Decides nothing about *which*
    rows — that is `oversight_scope` below — so it stays a pure function of the
    role, the institution, and the trainer profile, and can be reasoned about
    (and tested) without a database.

    `trainer` is passed in rather than looked up because the two callers that
    need it already hold it, and because a department head with no trainer
    profile has no department to be held to: they fall through to their college
    rather than to an empty scope that would show them nothing.
    """
    if user is None:
        return "all"

    # `data.master` is granted deliberately, from the Roles screen, to the
    # registry-level auditor who genuinely reads every college; a super admin
    # qualifies by having no college of their own. An admin *with* a college
    # does not — that is the college administrator this scope exists to hold,
    # and the wildcard on their role says what they may do, not whose data.
    if _permissions(user).get(MASTER_DATA_KEY) is True or is_super_admin(user):
        return "all"

    if is_department_head(user) and trainer is not None and trainer.department_id:
        return "department"

    # An administrator who also happens to teach still administers the whole
    # college; only a plain trainer is held to their own teaching load.
    if is_trainer(user) and trainer is not None and not is_admin(user):
        return "trainer"

    if user.institution_id:
        return "institution"

    return "all"


def oversight_scope(user: User | None) -> OversightScope:
    """Resolve which cohorts a caller's organisation-wide reports may cover."""
    trainer = _resolve_trainer(user)
    mode = oversight_mode(user, trainer)

    if mode == "all":
        return OversightScope(mode="all", label="All institutions")

    if mode == "department":
        department = trainer.department
        return OversightScope(
            mode="department",
            label=f"{department.name if department else 'Your department'} only",
            institution_id=user.institution_id,
            department_id=trainer.department_id,
            course_ids=_course_ids_in_department(trainer.department_id),
            trainer_ids=_trainer_ids_in_departments([trainer.department_id]),
        )

    if mode == "trainer":
        # `trainer_subject_ids` returns None for a caller under no trainer
        # restriction, which `oversight_mode` has already ruled out here.
        subject_ids = trainer_subject_ids(user) or set()
        return OversightScope(
            mode="trainer",
            label="Your assigned subjects only",
            institution_id=user.institution_id,
            department_id=trainer.department_id,
            course_ids=_course_ids_for_subjects(subject_ids),
            student_ids=trainer_student_ids(user) or set(),
            trainer_ids=[trainer.id],
        )

    institution = user.institution
    return OversightScope(
        mode="institution",
        label=f"{institution.name if institution else 'Your institution'} only",
        institution_id=user.institution_id,
        course_ids=_course_ids_in_institution(user.institution_id),
        trainer_ids=_trainer_ids_in_institution(user.institution_id),
    )


def scope_attendance_sessions(query, scope: OversightScope):
    """Attendance sessions run by the trainers within an oversight scope."""
    if scope.trainer_ids is None:
        return query
    if not scope.trainer_ids:
        return query.filter(false())
    from ..models.attendance_session import AttendanceSession

    return query.filter(AttendanceSession.trainer_id.in_(scope.trainer_ids))


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


def loose_term_key(value: str | None) -> str:
    """
    A term label reduced to its comparable core.

    Lowercased, punctuation replaced by spaces, runs of whitespace collapsed —
    so "Term 2, 2026", "term 2 2026" and "TERM 2  2026" all reduce to the same
    key. Punctuation is the most common difference between what someone types
    and what the term is called.
    """
    return re.sub(r"[^a-z0-9]+", " ", (value or "").lower()).strip()


def resolve_term_label(label: str | None, terms) -> str | None:
    """
    The canonical name for a typed term label, or None when it is ambiguous.

    Three deterministic steps, each requiring exactly one candidate — a label
    that could mean two terms is left alone, because a mark filed under the
    wrong term is worse than one filed under none.

      1. exact match, ignoring case and surrounding space;
      2. loose match, ignoring punctuation too ("Term 2, 2026");
      3. a bare ordinal — "2" against a term whose name contains 2 as its own
         word, which is how a spreadsheet column of term numbers reads.
    """
    text = (label or "").strip()
    if not text:
        return None

    by_exact = {(term.name or "").strip().lower(): term.name for term in terms}
    if text.lower() in by_exact:
        return by_exact[text.lower()]

    key = loose_term_key(text)
    loose = [term.name for term in terms if loose_term_key(term.name) == key]
    if len(loose) == 1:
        return loose[0]

    if text.isdigit():
        ordinal = [
            term.name for term in terms
            if re.search(rf"(?<!\d){re.escape(text)}(?!\d)", term.name or "")
        ]
        if len(ordinal) == 1:
            return ordinal[0]

    return None


def term_match_clause(term):
    """
    Scores belonging to a term, as a SQL condition.

    `Score.term` is a free-text label, and a great many scores carry none at all
    — a bulk upload whose sheet had no term column, or a mark entered before
    terms were in use. Reports resolve the active term by default, so a strict
    `Score.term == term.name` silently emptied whole pages of marks that were
    plainly in the database.

    A score with no term is counted in whichever term is being viewed; one that
    names a different term is not. Matching is case- and whitespace-insensitive,
    because these labels are typed by hand.
    """
    if term is None:
        return true()
    name = (getattr(term, "name", None) or "").strip().lower()
    if not name:
        return true()
    return or_(
        Score.term.is_(None),
        func.lower(func.trim(Score.term)) == name,
    )


def score_percentage_expr():
    """
    `percentage()` as a SQL expression, for averaging in the database.

    Must stay in step with the Python version above: a recorded total gives
    `(x / y) * 100`, and a missing or zero total means the mark is already out
    of 100 and is used as-is. Anything that quietly drops the second case
    reports a different average from the rest of the application.
    """
    total = func.coalesce(cast(Assessment.total_marks, Float), 0.0)
    return case(
        (total > 0, Score.marks_obtained * 100.0 / total),
        else_=Score.marks_obtained,
    )


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
