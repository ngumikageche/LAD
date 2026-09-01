#!/usr/bin/env python3
"""
Fill in everything one named trainer needs for a live demonstration, and give
every trainer on the system course-coverage data to be reported on.

The system is already running, so this script repairs rather than rebuilds. It
looks at what the trainer already has — account, department, subjects, courses,
learners — and creates only the pieces that are missing, then hands the learner
records off to `seed_linked_user_data.py` so the marks, attendance, practical
assessments, competencies, portfolio, alerts, reports, and feedback it writes
are the same rows that script writes rather than a second, subtly different set.

    # Everything, for the default trainer
    python3 scripts/seed_trainer_showcase.py

    # See what it would do, touching nothing
    python3 scripts/seed_trainer_showcase.py --dry-run

    # A different trainer
    python3 scripts/seed_trainer_showcase.py \
        --email trainer@larim.co.ke --name "Jane Doe" --password 'secret'

    # Only the course-coverage report data, across every trainer
    python3 scripts/seed_trainer_showcase.py --only coverage

Every stage is idempotent: a second run adds only what is still missing, so it
is safe to re-run against the live database.

Stages
------
  account   the trainer's user, trainer profile, department, and permissions
  catalog   course, modules, subjects with syllabus topics, competencies, links
  students  learners on the trainer's course, enrolled and linked to subjects
  records   marks, attendance, practicals, competencies, portfolio, feedback…
  coverage  lesson plans and learner validations behind the coverage report
  staff     the trainer's own attendance register and an announcement
"""

from __future__ import annotations

import argparse
import random
import sys
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import func
from werkzeug.security import generate_password_hash

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app import create_app
from app.extensions import db
from app.models.announcement import Announcement
from app.models.competency import Competency
from app.models.course import Course
from app.models.course_subject import CourseSubject
from app.models.department import Department
from app.models.enrollment import Enrollment
from app.models.institution import Institution
from app.models.lesson_plan import LessonPlan
from app.models.module import Module
from app.models.role_permission import RolePermission
from app.models.staff_attendance import StaffAttendance
from app.models.student import Student
from app.models.student_subject import StudentSubject
from app.models.subject import Subject
from app.models.syllabus_validation import SyllabusValidation
from app.models.term import Term
from app.models.trainer import Trainer
from app.models.trainer_course import TrainerCourse
from app.models.trainer_subject import TrainerSubject
from app.models.user import User

import seed_linked_user_data as linked


STAGES = ("account", "catalog", "students", "records", "coverage", "staff")

DEFAULT_EMAIL = "mutethia100@larim.co.ke"
DEFAULT_NAME = "Elijah Mutethia"
DEFAULT_PASSWORD = "larim@26"
DEFAULT_DEPARTMENT = "Information Technology"
DEFAULT_COURSE = "Software Development"
DEFAULT_INSTITUTION = "Larim Technical Training Institute"

# Mirrors the flag thresholds in app/routes/syllabus_validation.py. A pairing
# needs at least MIN_RESPONSES answers before it can be judged at all, and is
# flagged once reported coverage runs VARIANCE_FLAG ahead of what the class
# recognises. The coverage stage aims at both sides of each line on purpose, so
# the report has every status on it to filter by.
COVERAGE_VARIANCE_FLAG = 20.0
COVERAGE_MIN_RESPONSES = 3

# Module and subject shapes used only where the trainer has none to teach.
MODULE_TEMPLATES = [
    ("Foundations", "Underpinning knowledge and safe working practice."),
    ("Practice Lab", "Supervised practical work against the unit standards."),
    ("Workplace Skills", "Applying the unit in a workplace-like setting."),
]
SUBJECT_TEMPLATES = ["Theory", "Practical", "Workshop Project"]

SYLLABUS_TOPICS = [
    "Scope, standards, and assessment plan for the unit",
    "Health, safety, and environmental requirements",
    "Tools, materials, and equipment selection",
    "Core principles and underpinning theory",
    "Planning and preparing the work",
    "Carrying out the task to specification",
    "Measurement, testing, and quality checks",
    "Fault finding and corrective action",
    "Documentation, handover, and record keeping",
    "Workplace application and review",
]

COMPETENCY_TEMPLATES = [
    ("Plan and prepare the work", "Interprets the brief and prepares tools, materials, and workspace."),
    ("Perform the task to standard", "Completes the practical task within tolerance and to specification."),
    ("Test, inspect, and verify", "Checks the completed work against the required standard."),
    ("Work safely and document", "Observes safety requirements and records the work carried out."),
]

# The permission sets the Roles screen ships as its Trainer and Student presets.
# Applied additively — an existing role keeps every key it already has, so a
# role a college has customised is widened, never rewritten.
TRAINER_PERMISSIONS = {
    "trainers.read": True, "trainers.update": True, "students.read": True,
    "subjects.read": True, "courses.read": True, "scores.read": True,
    "scores.create": True, "scores.update": True, "modules.read": True,
    "competencies.read": True, "announcements.read": True, "announcements.create": True,
    "notifications.read": True, "notifications.create": True, "documents.read": True,
    "documents.create": True, "documents.delete": True, "attendance.create": True,
    "attendance.read": True, "attendance.write": True, "attendance.report.view": True,
    "analytics.read": True, "trainer_subjects.read": True, "terms.read": True,
    "alerts.read": True, "alerts.manage": True,
    "reports.class.performance.view": True, "reports.class.performance.print": True,
    "reports.class.performance.export": True,
    "reports.teacher.syllabus.view": True, "reports.teacher.syllabus.print": True,
    "reports.teacher.syllabus.export": True,
    "reports.teacher.attendance.view": True,
    "reports.student.discipline.view": True, "reports.student.discipline.print": True,
    "reports.student.discipline.export": True, "reports.student.write": True,
    "practical.assessments.manage": True, "online_exams.manage": True,
    "reports.practical.assessment": True, "reports.practical.assessment.view": True,
    "reports.practical.assessment.print": True, "reports.practical.assessment.export": True,
    "feedback.trainer.view": True,
}
STUDENT_PERMISSIONS = {
    "student.portal": True, "students.read": True, "students_view_own_subjects": True,
    "student_subjects.read": True, "scores.read": True, "announcements.read": True,
    "notifications.read": True, "documents.read": True, "attendance.read": True,
    "analytics.read": True, "reports.student.term.view": True,
    "reports.student.attendance.view": True, "feedback.trainer.submit": True,
}

FIRST_NAMES = [
    "Amina", "Brian", "Cynthia", "Dennis", "Esther", "Felix", "Gladys", "Hassan",
    "Irene", "Joseph", "Kelvin", "Lydia", "Moses", "Nancy", "Oscar", "Purity",
    "Rashid", "Sharon", "Tabitha", "Victor", "Wanjiru", "Yusuf", "Zipporah",
    "Collins", "Mercy", "Peter", "Faith", "Alex",
]
LAST_NAMES = [
    "Otieno", "Mwangi", "Njeri", "Kamau", "Achieng", "Kiptoo", "Mutiso", "Wanjiku",
    "Abdi", "Karanja", "Maina", "Odhiambo", "Chebet", "Mohamed", "Omondi", "Kendi",
    "Barasa", "Cheruiyot", "Wekesa", "Nyaga",
]


@dataclass
class Summary:
    created: dict[str, int] = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)

    def add(self, key: str, count: int = 1) -> None:
        if count:
            self.created[key] = self.created.get(key, 0) + count

    def note(self, message: str) -> None:
        self.notes.append(message)


def utcnow() -> datetime:
    """Naive UTC, matching the timestamp columns the models declare."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Seed a full working data set for one trainer, plus course coverage for all trainers.",
    )
    parser.add_argument("--email", default=DEFAULT_EMAIL, help="The trainer's login email.")
    parser.add_argument("--name", default=DEFAULT_NAME, help="Display name, used only when the account is created.")
    parser.add_argument(
        "--password",
        default=DEFAULT_PASSWORD,
        help="Password to set on the trainer's account. Pass --keep-password to leave an existing one alone.",
    )
    parser.add_argument(
        "--keep-password",
        action="store_true",
        help="Never touch the password of an account that already exists.",
    )
    parser.add_argument("--student-password", default=None, help="Password for the trainer's learners (default: --password).")
    parser.add_argument("--department", default=DEFAULT_DEPARTMENT, help="Department to use when the trainer has none.")
    parser.add_argument("--course", default=DEFAULT_COURSE, help="Course to use when the department has none.")
    parser.add_argument("--institution", default=DEFAULT_INSTITUTION, help="Institution to use when none exists.")
    parser.add_argument("--students", type=int, default=24, help="How many learners the trainer should end up with.")
    parser.add_argument("--subjects", type=int, default=3, help="How many subjects the trainer should end up teaching.")
    parser.add_argument("--seed", type=int, default=2026, help="Random seed, for reproducible output.")
    parser.add_argument(
        "--coverage-scope",
        choices=("trainer", "all"),
        default="all",
        help="Whose course coverage to simulate: just this trainer, or every trainer (default).",
    )
    parser.add_argument("--staff-attendance-days", type=int, default=20, help="Weekdays of the trainer's own attendance.")
    parser.add_argument("--only", action="append", default=[], choices=STAGES, help="Run only these stages. Repeatable.")
    parser.add_argument("--skip", action="append", default=[], choices=STAGES, help="Skip these stages. Repeatable.")
    parser.add_argument("--no-permissions", action="store_true", help="Do not widen the trainer or student role permissions.")
    parser.add_argument("--dry-run", action="store_true", help="Do all the work, then roll back instead of committing.")
    parser.add_argument("--yes", action="store_true", help="Skip the confirmation prompt.")
    return parser.parse_args()


def resolve_stages(only: list[str], skip: list[str]) -> set[str]:
    return (set(only) if only else set(STAGES)) - set(skip)


def database_label() -> str:
    url = db.engine.url
    return f"{url.database} on {url.host or 'localhost'} as {url.username}"


def weekdays_ending_today(count: int) -> list[date]:
    """The last `count` weekdays, oldest first."""
    days: list[date] = []
    cursor = utcnow().date()
    while len(days) < count:
        if cursor.weekday() < 5:
            days.append(cursor)
        cursor -= timedelta(days=1)
    return sorted(days)


def rng_for(seed: int, *parts) -> random.Random:
    """
    Random numbers keyed by what they describe rather than by call order.

    Seeding off the row's own identity keeps a re-run landing on the same
    answers, so the "does this already exist" checks keep matching and a second
    run adds nothing.
    """
    return random.Random("|".join([str(seed), *(str(part) for part in parts)]))


# ── Account, department, institution ──────────────────────────────────────────

def ensure_institution(name: str, summary: Summary) -> Institution:
    institution = (
        db.session.query(Institution)
        .filter(Institution.deleted_at.is_(None))
        .order_by(Institution.created_at.asc())
        .first()
    )
    if institution:
        return institution
    institution = Institution(name=name, type="TVET", location="Nairobi")
    db.session.add(institution)
    db.session.flush()
    summary.add("institutions")
    summary.note(f"Created institution {name}")
    return institution


def ensure_department(name: str, institution: Institution, summary: Summary) -> Department:
    department = (
        db.session.query(Department)
        .filter(Department.name == name, Department.deleted_at.is_(None))
        .first()
    )
    if department:
        return department
    department = Department(name=name, institution_id=institution.id)
    db.session.add(department)
    db.session.flush()
    summary.add("departments")
    summary.note(f"Created department {name}")
    return department


def widen_role(role: RolePermission, grants: dict, summary: Summary) -> None:
    """
    Add any missing permission keys to a role, keeping everything already on it.

    Roles are shared, so this never removes a key: a college that has trimmed
    its Trainer role keeps its trimming, and only gains what the demonstration
    needs to be reachable.
    """
    permissions = dict(role.permissions or {})
    missing = {key: value for key, value in grants.items() if permissions.get(key) is not True}
    if not missing:
        return
    permissions.update(missing)
    role.permissions = permissions
    # JSONB reassignment needs the flag when the dict identity is reused
    # elsewhere; setting a fresh dict above is enough, but be explicit.
    db.session.add(role)
    summary.add("permissions_granted", len(missing))
    summary.note(f"Granted {len(missing)} permission(s) to role '{role.role_name}': {', '.join(sorted(missing))}")


def ensure_role(name: str, category: str, grants: dict, summary: Summary) -> RolePermission:
    role = db.session.query(RolePermission).filter(RolePermission.role_name == name).first()
    if role:
        return role
    role = RolePermission(role_name=name, category=category, permissions=dict(grants))
    db.session.add(role)
    db.session.flush()
    summary.add("roles")
    summary.note(f"Created role {name}")
    return role


def ensure_trainer_account(args: argparse.Namespace, stages: set[str], summary: Summary) -> Trainer:
    """
    The trainer's user row, trainer profile, department, and password.

    The profile is ensured whatever stages were asked for, because nothing
    else can be attached without it. The password and the role permissions are
    only touched by the `account` stage — those are the two changes that reach
    beyond this trainer's own data.
    """
    manage_account = "account" in stages
    email = args.email.strip().lower()
    # Logins are not case sensitive, so neither is finding the account.
    user = db.session.query(User).filter(func.lower(User.email) == email).first()

    trainer_role = ensure_role("Trainer", "Academic", TRAINER_PERMISSIONS, summary)

    if user is None:
        institution = ensure_institution(args.institution, summary)
        department = ensure_department(args.department, institution, summary)
        user = User(
            name=args.name,
            email=email,
            password_hash=generate_password_hash(args.password),
            role_id=trainer_role.id,
            institution_id=institution.id,
        )
        db.session.add(user)
        db.session.flush()
        summary.add("users")
        summary.note(f"Created trainer account {email}")
    else:
        department = None
        if user.deleted_at is not None:
            user.deleted_at = None
            summary.note(f"Restored soft-deleted account {email}")
        if manage_account and not args.keep_password:
            user.password_hash = generate_password_hash(args.password)
            summary.note(f"Reset the password on {email}")
        if user.institution_id is None:
            user.institution_id = ensure_institution(args.institution, summary).id

    if manage_account and not args.no_permissions:
        widen_role(user.role, TRAINER_PERMISSIONS, summary)

    trainer = db.session.query(Trainer).filter(Trainer.user_id == user.id).first()
    if trainer is None:
        institution = user.institution or ensure_institution(args.institution, summary)
        department = department or ensure_department(args.department, institution, summary)
        trainer = Trainer(
            user_id=user.id,
            department_id=department.id,
            specialization="CBET Delivery",
        )
        db.session.add(trainer)
        db.session.flush()
        summary.add("trainers")
        summary.note(f"Created trainer profile for {email}")
    else:
        if trainer.deleted_at is not None:
            trainer.deleted_at = None
            summary.note("Restored soft-deleted trainer profile")
        if trainer.department_id is None:
            institution = user.institution or ensure_institution(args.institution, summary)
            trainer.department_id = ensure_department(args.department, institution, summary).id
            summary.note("Attached the trainer to a department")

    return trainer


# ── Catalog: course, modules, subjects, competencies ───────────────────────────

def ensure_course(department: Department, name: str, summary: Summary) -> Course:
    course = (
        db.session.query(Course)
        .filter(Course.department_id == department.id, Course.deleted_at.is_(None))
        .order_by(Course.created_at.asc())
        .first()
    )
    if course:
        return course
    course = Course(name=name, department_id=department.id, cbet_level="Level 5")
    db.session.add(course)
    db.session.flush()
    summary.add("courses")
    summary.note(f"Created course {name} in {department.name}")
    return course


def ensure_modules(course: Course, summary: Summary) -> list[Module]:
    modules = (
        db.session.query(Module)
        .filter(Module.course_id == course.id, Module.deleted_at.is_(None))
        .order_by(Module.name.asc())
        .all()
    )
    if modules:
        return modules
    for name, description in MODULE_TEMPLATES:
        db.session.add(Module(course_id=course.id, name=f"{course.name} {name}", description=description))
        summary.add("modules")
    db.session.flush()
    summary.note(f"Created {len(MODULE_TEMPLATES)} modules for {course.name}")
    return ensure_modules(course, summary)


def ensure_syllabus_topics(subject: Subject, summary: Summary) -> list[str]:
    """
    A subject with no topic template has nothing for coverage to be measured
    against, which is how a trainer/subject pairing goes missing from the
    oversight report entirely rather than showing as uncovered.
    """
    topics = subject.syllabus_topics if isinstance(subject.syllabus_topics, list) else []
    topics = [str(topic).strip() for topic in topics if str(topic).strip()]
    if topics:
        return topics
    subject.syllabus_topics = list(SYLLABUS_TOPICS)
    db.session.add(subject)
    summary.add("syllabus_templates")
    return list(SYLLABUS_TOPICS)


def ensure_subjects(modules: list[Module], wanted: int, summary: Summary) -> list[Subject]:
    module_ids = [module.id for module in modules]
    subjects = (
        db.session.query(Subject)
        .filter(Subject.module_id.in_(module_ids), Subject.deleted_at.is_(None))
        .order_by(Subject.name.asc())
        .all()
    )
    index = 0
    while len(subjects) < wanted and index < len(modules) * len(SUBJECT_TEMPLATES):
        module = modules[index % len(modules)]
        label = SUBJECT_TEMPLATES[index // len(modules) % len(SUBJECT_TEMPLATES)]
        name = f"{module.name} {label}"
        if not any(subject.name == name for subject in subjects):
            subject = Subject(
                module_id=module.id,
                name=name,
                description=f"{label} component of {module.name}.",
                syllabus_topics=list(SYLLABUS_TOPICS),
            )
            db.session.add(subject)
            db.session.flush()
            subjects.append(subject)
            summary.add("subjects")
        index += 1

    for subject in subjects:
        ensure_syllabus_topics(subject, summary)
    return subjects


def ensure_competencies(modules: list[Module], summary: Summary) -> None:
    for module in modules:
        existing = {
            name
            for (name,) in db.session.query(Competency.name).filter(
                Competency.module_id == module.id, Competency.deleted_at.is_(None)
            )
        }
        for name, description in COMPETENCY_TEMPLATES:
            if name in existing:
                continue
            db.session.add(
                Competency(
                    module_id=module.id,
                    name=name,
                    description=description,
                    expected_outcome=description,
                    mastery_threshold=75.0,
                )
            )
            summary.add("competencies")


def link_trainer(trainer: Trainer, course: Course, subjects: list[Subject], summary: Summary) -> None:
    if not db.session.query(TrainerCourse).filter(
        TrainerCourse.trainer_id == trainer.id,
        TrainerCourse.course_id == course.id,
        TrainerCourse.deleted_at.is_(None),
    ).first():
        db.session.add(TrainerCourse(trainer_id=trainer.id, course_id=course.id))
        summary.add("trainer_course_links")

    for subject in subjects:
        if db.session.query(TrainerSubject).filter(
            TrainerSubject.trainer_id == trainer.id,
            TrainerSubject.subject_id == subject.id,
            TrainerSubject.deleted_at.is_(None),
        ).first():
            continue
        db.session.add(TrainerSubject(trainer_id=trainer.id, subject_id=subject.id))
        summary.add("trainer_subject_links")

    for subject in subjects:
        if db.session.query(CourseSubject).filter(
            CourseSubject.course_id == course.id,
            CourseSubject.subject_id == subject.id,
        ).first():
            continue
        db.session.add(CourseSubject(course_id=course.id, subject_id=subject.id))
        summary.add("course_subject_links")


def trainer_subjects(trainer: Trainer) -> list[Subject]:
    return (
        db.session.query(Subject)
        .join(TrainerSubject, TrainerSubject.subject_id == Subject.id)
        .filter(
            TrainerSubject.trainer_id == trainer.id,
            TrainerSubject.deleted_at.is_(None),
            Subject.deleted_at.is_(None),
        )
        .order_by(Subject.name.asc())
        .all()
    )


def subjects_taught_by_others(subject_ids: list, trainer: Trainer) -> set:
    """Subject ids another trainer is already assigned to."""
    if not subject_ids:
        return set()
    return {
        subject_id
        for (subject_id,) in db.session.query(TrainerSubject.subject_id).filter(
            TrainerSubject.subject_id.in_(subject_ids),
            TrainerSubject.trainer_id != trainer.id,
            TrainerSubject.deleted_at.is_(None),
        )
    }


def select_teaching_subjects(
    trainer: Trainer,
    assigned: list[Subject],
    pool: list[Subject],
    wanted: int,
) -> list[Subject]:
    """
    What this trainer should end up teaching: everything already assigned to
    them, topped up from subjects nobody else teaches.

    Never takes a subject off another trainer. On a live system the modules a
    trainer works in are shared, so treating every subject in them as free would
    quietly reassign a colleague's class to this one.
    """
    chosen = list(assigned)
    chosen_ids = {subject.id for subject in chosen}
    taken = subjects_taught_by_others([subject.id for subject in pool], trainer)

    for subject in pool:
        if len(chosen) >= wanted:
            break
        if subject.id in chosen_ids or subject.id in taken:
            continue
        chosen.append(subject)
        chosen_ids.add(subject.id)
    return chosen


def build_catalog(
    trainer: Trainer, args: argparse.Namespace, summary: Summary
) -> tuple[Course, list[Module], list[Subject]]:
    """
    The trainer's teaching load, reusing whatever is already assigned to them.

    Bootstrapping only happens where there is nothing: a trainer who already
    teaches two subjects keeps those two and gains a third, rather than being
    handed a parallel set of invented ones.
    """
    institution = trainer.user.institution if trainer.user else None
    if institution is None:
        institution = ensure_institution(args.institution, summary)
    department = trainer.department or ensure_department(args.department, institution, summary)
    trainer.department_id = department.id

    assigned = trainer_subjects(trainer)
    if assigned:
        module_ids = {subject.module_id for subject in assigned}
        modules = (
            db.session.query(Module)
            .filter(Module.id.in_(module_ids), Module.deleted_at.is_(None))
            .order_by(Module.name.asc())
            .all()
        )
        course_ids = {module.course_id for module in modules if module.course_id}
        course = (
            db.session.query(Course).filter(Course.id.in_(course_ids), Course.deleted_at.is_(None)).first()
            if course_ids else None
        ) or ensure_course(department, args.course, summary)
        modules = modules or ensure_modules(course, summary)
    else:
        course = ensure_course(department, args.course, summary)
        modules = ensure_modules(course, summary)

    wanted = max(args.subjects, len(assigned))
    pool = ensure_subjects(modules, wanted, summary)
    subjects = select_teaching_subjects(trainer, assigned, pool, wanted)

    ensure_competencies(modules, summary)
    link_trainer(trainer, course, subjects, summary)
    for subject in subjects:
        ensure_syllabus_topics(subject, summary)
    return course, modules, subjects


# ── Learners ──────────────────────────────────────────────────────────────────

def students_of(trainer: Trainer) -> list[Student]:
    """Every learner sharing at least one subject with the trainer."""
    return (
        db.session.query(Student)
        .join(StudentSubject, StudentSubject.student_id == Student.id)
        .join(TrainerSubject, TrainerSubject.subject_id == StudentSubject.subject_id)
        .filter(
            TrainerSubject.trainer_id == trainer.id,
            TrainerSubject.deleted_at.is_(None),
            StudentSubject.deleted_at.is_(None),
            Student.deleted_at.is_(None),
        )
        .distinct()
        .order_by(Student.registration_number.asc())
        .all()
    )


def next_registration_number(prefix: str, year: int) -> str:
    """A registration number that is free, counting up from what is on record."""
    base = f"{prefix}/{year}/"
    taken = {
        number
        for (number,) in db.session.query(Student.registration_number).filter(
            Student.registration_number.like(f"{base}%")
        )
    }
    index = 1
    while f"{base}{index:04d}" in taken:
        index += 1
    return f"{base}{index:04d}"


def ensure_students(
    trainer: Trainer,
    course: Course,
    modules: list[Module],
    subjects: list[Subject],
    term: Term | None,
    args: argparse.Namespace,
    summary: Summary,
) -> list[Student]:
    existing = students_of(trainer)
    student_role = ensure_role("Student", "Academic", STUDENT_PERMISSIONS, summary)
    if not args.no_permissions:
        widen_role(student_role, STUDENT_PERMISSIONS, summary)

    institution_id = trainer.user.institution_id if trainer.user else None
    password_hash = generate_password_hash(args.student_password or args.password)
    year = utcnow().year
    prefix = (course.code or "LAD").replace("-", "")

    created: list[Student] = []
    shortfall = max(0, args.students - len(existing))
    for index in range(shortfall):
        rng = rng_for(args.seed, "student", trainer.id, index)
        name = f"{rng.choice(FIRST_NAMES)} {rng.choice(LAST_NAMES)}"
        registration = next_registration_number(prefix, year)
        email = f"{registration.replace('/', '.').lower()}@larim.co.ke"
        if db.session.query(User).filter(User.email == email).first():
            continue
        user = User(
            name=name,
            email=email,
            password_hash=password_hash,
            role_id=student_role.id,
            institution_id=institution_id,
        )
        db.session.add(user)
        db.session.flush()
        student = Student(
            user_id=user.id,
            registration_number=registration,
            course_id=course.id,
            enrollment_year=year - rng.choice([0, 0, 1]),
        )
        db.session.add(student)
        db.session.flush()
        created.append(student)
        summary.add("users")
        summary.add("students")

    roster = existing + created

    # Enrolments drive every module-shaped record — assessments, QR sessions,
    # dashboard metrics — so a learner without one is invisible to the generator.
    for student in roster:
        for module in modules:
            if db.session.query(Enrollment).filter(
                Enrollment.student_id == student.id,
                Enrollment.module_id == module.id,
                Enrollment.deleted_at.is_(None),
            ).first():
                continue
            db.session.add(
                Enrollment(
                    student_id=student.id,
                    module_id=module.id,
                    course_id=course.id,
                    term_id=term.id if term else None,
                    status="active",
                )
            )
            summary.add("enrollments")

        for subject in subjects:
            if db.session.query(StudentSubject).filter(
                StudentSubject.student_id == student.id,
                StudentSubject.subject_id == subject.id,
                StudentSubject.deleted_at.is_(None),
            ).first():
                continue
            db.session.add(StudentSubject(student_id=student.id, subject_id=subject.id))
            summary.add("student_subject_links")

    if created:
        summary.note(f"Created {len(created)} learner account(s) on {course.name}")
    return roster


# ── Course coverage ───────────────────────────────────────────────────────────

def active_term() -> Term | None:
    return (
        db.session.query(Term).filter(Term.is_active.is_(True), Term.deleted_at.is_(None)).first()
        or db.session.query(Term)
        .filter(Term.deleted_at.is_(None))
        .order_by(Term.start_date.desc())
        .first()
    )


def coverage_students(subject: Subject) -> list[Student]:
    """
    Learners who can answer for a subject: the ones assigned to it, falling back
    to the cohort on its course where nobody has been assigned yet.
    """
    assigned = (
        db.session.query(Student)
        .join(StudentSubject, StudentSubject.student_id == Student.id)
        .filter(
            StudentSubject.subject_id == subject.id,
            StudentSubject.deleted_at.is_(None),
            Student.deleted_at.is_(None),
        )
        .order_by(Student.registration_number.asc())
        .all()
    )
    if assigned:
        return assigned

    module = db.session.get(Module, subject.module_id)
    if module is None or module.course_id is None:
        return []
    return (
        db.session.query(Student)
        .filter(Student.course_id == module.course_id, Student.deleted_at.is_(None))
        .order_by(Student.registration_number.asc())
        .limit(12)
        .all()
    )


def assign_coverage_profiles(pairings: list[tuple[Trainer, Subject]], seed: int) -> dict[tuple, str]:
    """
    Which of the report's three statuses each trainer/subject pairing lands on.

    Allocated by rank rather than by an independent draw per pairing. Drawing
    independently is what leaves a small college with, say, no flagged pairing
    at all — and a filter with an empty option behind it is indistinguishable
    from a broken filter. Ranking by a per-pairing key keeps each pairing's
    answer stable across re-runs while guaranteeing every status is represented
    as soon as there are three pairings to spread over.
    """
    ordered = sorted(
        pairings,
        key=lambda pair: rng_for(seed, "profile", pair[0].id, pair[1].id).random(),
    )
    total = len(ordered)
    if total == 0:
        return {}
    if total == 1:
        counts = {"flagged": 0, "unvalidated": 0}
    elif total == 2:
        counts = {"flagged": 1, "unvalidated": 0}
    else:
        counts = {
            "flagged": max(1, round(total * 0.22)),
            "unvalidated": max(1, round(total * 0.20)),
        }

    profiles: dict[tuple, str] = {}
    for index, (trainer, subject) in enumerate(ordered):
        if index < counts["flagged"]:
            profile = "flagged"
        elif index >= total - counts["unvalidated"]:
            profile = "unvalidated"
        else:
            profile = "confirmed"
        profiles[(trainer.id, subject.id)] = profile
    return profiles


def seed_coverage_for_pairing(
    trainer: Trainer,
    subject: Subject,
    term: Term | None,
    profile: str,
    seed: int,
    summary: Summary,
) -> None:
    topics = ensure_syllabus_topics(subject, summary)
    rng = rng_for(seed, "coverage", trainer.id, subject.id)

    plans_by_topic = {
        plan.topic: plan
        for plan in db.session.query(LessonPlan).filter(
            LessonPlan.trainer_id == trainer.id,
            LessonPlan.subject_id == subject.id,
            LessonPlan.deleted_at.is_(None),
        )
    }
    for position, topic in enumerate(topics):
        if topic in plans_by_topic:
            continue
        plan = LessonPlan(
            trainer_id=trainer.id,
            subject_id=subject.id,
            term_id=term.id if term else None,
            topic=topic,
            description=f"Delivery of '{topic}' for {subject.name}.",
            planned_date=utcnow().date() - timedelta(days=(len(topics) - position) * 6),
        )
        db.session.add(plan)
        plans_by_topic[topic] = plan
        summary.add("lesson_plans")
    db.session.flush()

    plans = [plans_by_topic[topic] for topic in topics if topic in plans_by_topic]
    if not plans:
        return

    # How much of the syllabus the trainer reports as delivered. A flagged
    # pairing claims more, which is what makes the gap to the class visible.
    claim_rate = 0.9 if profile == "flagged" else rng.uniform(0.6, 0.9)
    claimed = max(1, round(len(plans) * claim_rate))
    for position, plan in enumerate(plans):
        should_cover = position < claimed
        if should_cover and plan.covered_date is None:
            plan.covered_date = (plan.planned_date or utcnow().date()) + timedelta(days=rng.randint(0, 3))
            db.session.add(plan)
            summary.add("topics_marked_covered")

    covered = [plan for plan in plans if plan.covered_date is not None]
    if not covered:
        return

    learners = coverage_students(subject)
    if not learners:
        summary.add("pairings_without_learners")
        return

    # Answers, not learners, are what the report counts — one learner answering
    # eight topics carries more weight on those eight than a learner who
    # answered once, which is the rule the oversight query applies.
    if profile == "unvalidated":
        # Deliberately under the response floor, so the pairing reports as
        # awaiting learner responses rather than as agreed.
        responders = learners[:1]
        topics_each = min(2, len(covered))
        deny_rate = 0.0
    elif profile == "flagged":
        responders = learners[: max(4, min(len(learners), 8))]
        topics_each = len(covered)
        deny_rate = rng.uniform(0.35, 0.6)
    else:
        responders = learners[: max(4, min(len(learners), 10))]
        topics_each = len(covered)
        deny_rate = rng.uniform(0.0, 0.12)

    existing_keys = {
        (row.lesson_plan_id, row.student_id)
        for row in db.session.query(SyllabusValidation).filter(
            SyllabusValidation.lesson_plan_id.in_([plan.id for plan in covered]),
            SyllabusValidation.deleted_at.is_(None),
        )
    }

    for student in responders:
        for plan in covered[:topics_each]:
            if (plan.id, student.id) in existing_keys:
                continue
            answer_rng = rng_for(seed, "answer", plan.id, student.id)
            was_covered = answer_rng.random() >= deny_rate
            db.session.add(
                SyllabusValidation(
                    lesson_plan_id=plan.id,
                    student_id=student.id,
                    was_covered=was_covered,
                    comment=None if was_covered else "I do not recall this topic being taught.",
                )
            )
            summary.add("coverage_responses")

    summary.add(f"pairings_{profile}")


def report_coverage_statuses(term: Term | None) -> dict[str, int]:
    """
    The status each pairing will show as on the oversight report.

    Read back through the report's own `coverage_verdict` rather than through
    the intentions this script seeded with, so what is printed is what an
    administrator will actually see on the screen.
    """
    from app.routes.syllabus_validation import coverage_verdict

    counts: dict[str, int] = {"flagged": 0, "confirmed": 0, "unvalidated": 0}
    pairings = (
        db.session.query(Trainer.id, Subject.id)
        .join(TrainerSubject, TrainerSubject.trainer_id == Trainer.id)
        .join(Subject, Subject.id == TrainerSubject.subject_id)
        .filter(
            Trainer.deleted_at.is_(None),
            Subject.deleted_at.is_(None),
            TrainerSubject.deleted_at.is_(None),
        )
        .all()
    )
    for trainer_id, subject_id in pairings:
        plan_query = db.session.query(LessonPlan).filter(
            LessonPlan.trainer_id == trainer_id,
            LessonPlan.subject_id == subject_id,
            LessonPlan.deleted_at.is_(None),
        )
        if term:
            plan_query = plan_query.filter(
                (LessonPlan.term_id.is_(None)) | (LessonPlan.term_id == term.id)
            )
        plans = plan_query.all()
        if not plans:
            continue
        covered_ids = [plan.id for plan in plans if plan.covered_date is not None]
        confirmed = denied = 0
        if covered_ids:
            rows = (
                db.session.query(SyllabusValidation.was_covered, func.count(SyllabusValidation.id))
                .filter(
                    SyllabusValidation.lesson_plan_id.in_(covered_ids),
                    SyllabusValidation.deleted_at.is_(None),
                )
                .group_by(SyllabusValidation.was_covered)
                .all()
            )
            tally = dict(rows)
            confirmed = int(tally.get(True, 0))
            denied = int(tally.get(False, 0))
        verdict = coverage_verdict(len(plans), len(covered_ids), confirmed, denied)
        counts[verdict["status"]] += 1
    return counts


def seed_coverage(trainer: Trainer, scope: str, term: Term | None, seed: int, summary: Summary) -> None:
    query = (
        db.session.query(Trainer, Subject)
        .join(TrainerSubject, TrainerSubject.trainer_id == Trainer.id)
        .join(Subject, Subject.id == TrainerSubject.subject_id)
        .filter(
            Trainer.deleted_at.is_(None),
            Subject.deleted_at.is_(None),
            TrainerSubject.deleted_at.is_(None),
        )
    )
    if scope == "trainer":
        query = query.filter(Trainer.id == trainer.id)
    pairings = query.order_by(Subject.name.asc()).all()

    profiles = assign_coverage_profiles(pairings, seed)
    for pairing_trainer, subject in pairings:
        seed_coverage_for_pairing(
            pairing_trainer,
            subject,
            term,
            profiles[(pairing_trainer.id, subject.id)],
            seed,
            summary,
        )
    summary.note(f"Course coverage simulated over {len(pairings)} trainer/subject pairing(s)")


# ── The trainer's own records ─────────────────────────────────────────────────

def seed_staff_records(
    trainer: Trainer,
    course: Course,
    term: Term | None,
    args: argparse.Namespace,
    summary: Summary,
) -> None:
    """The trainer's own attendance register, and a class announcement."""
    existing_dates = {
        row_date
        for (row_date,) in db.session.query(StaffAttendance.date).filter(
            StaffAttendance.trainer_id == trainer.id,
            StaffAttendance.deleted_at.is_(None),
        )
    }
    for day in weekdays_ending_today(max(0, args.staff_attendance_days)):
        if day in existing_dates:
            continue
        rng = rng_for(args.seed, "staff", trainer.id, day)
        status = rng.choices(["present", "present", "present", "present", "leave", "absent"], k=1)[0]
        db.session.add(
            StaffAttendance(
                trainer_id=trainer.id,
                term_id=term.id if term else None,
                date=day,
                status=status,
                notes=None if status == "present" else f"Recorded as {status}.",
            )
        )
        summary.add("staff_attendance")

    title = f"Practical assessment schedule — {course.name}"
    if not db.session.query(Announcement).filter(
        Announcement.title == title, Announcement.deleted_at.is_(None)
    ).first():
        db.session.add(
            Announcement(
                creator_id=trainer.user_id,
                institution_id=trainer.user.institution_id if trainer.user else None,
                department_id=trainer.department_id,
                course_id=course.id,
                title=title,
                content=(
                    "Practical assessments for this unit run over the next two weeks. "
                    "Bring your PPE, check the task brief on the portal beforehand, and "
                    "confirm the topics covered on your Course Coverage page."
                ),
                is_important=True,
                is_published=True,
            )
        )
        summary.add("announcements")


def linked_args(args: argparse.Namespace) -> argparse.Namespace:
    """The knobs `seed_linked_user_data` expects, at this script's settings."""
    return argparse.Namespace(
        department=[], course=[], email_like=None, limit=0,
        seed=args.seed,
        attendance_days=14,
        sessions_per_module=3,
        max_terms=3,
        portfolio_rate=0.8,
        feedback_rate=0.75,
        risk_threshold=50.0,
        only=[], skip=[], dry_run=False, status=False, menu=False, no_menu=True,
    )


def seed_learner_records(students: list[Student], args: argparse.Namespace, summary: Summary) -> None:
    """
    Hand the learner records to `seed_linked_user_data`.

    Reusing it rather than reimplementing keeps one definition of what a seeded
    mark, register entry, or practical report looks like — the alternative is
    two generators that drift apart and disagree about the same learner.
    """
    sub_args = linked_args(args)
    sub_summary = linked.Summary()
    streams = linked.Streams(args.seed)

    enrollments_by_module = linked.group_students_by_module(students)
    if not enrollments_by_module:
        summary.note("No module enrolments for these learners — learner records skipped.")
        return
    modules = linked.modules_for(list(enrollments_by_module.keys()))

    linked.generate_linked_data(
        modules=modules,
        enrollments_by_module=enrollments_by_module,
        stages=set(linked.STAGES),
        args=sub_args,
        streams=streams,
        summary=sub_summary,
    )

    for label, value in [
        ("assessments", sub_summary.assessments_created),
        ("scores", sub_summary.scores_created),
        ("register_attendance", sub_summary.attendance_created),
        ("qr_sessions", sub_summary.sessions_created),
        ("qr_check_ins", sub_summary.check_ins_created),
        ("practical_reports", sub_summary.practicals_created),
        ("competency_records", sub_summary.competency_records_created),
        ("portfolio_evidence", sub_summary.portfolio_entries_created),
        ("alerts", sub_summary.alerts_created),
        ("learner_reports", sub_summary.reports_created),
        ("trainer_feedback", sub_summary.feedback_created),
        ("dashboard_metrics", sub_summary.metrics_written),
        ("notifications", sub_summary.notifications_created),
        ("terms", sub_summary.terms_created),
    ]:
        summary.add(label, value)
    summary.note(
        f"Learner records generated over {sub_summary.modules_processed} module(s) "
        f"for {sub_summary.students_processed} learner(s)"
    )


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    args = parse_args()
    stages = resolve_stages(args.only, args.skip)
    if not stages:
        raise SystemExit("Every stage was skipped — nothing to do.")

    app = create_app()
    with app.app_context():
        summary = Summary()
        print(f"Database: {database_label()}")
        print(f"Trainer:  {args.email}")
        print(f"Stages:   {', '.join(sorted(stages))}")
        if args.dry_run:
            print("Mode:     dry run, nothing will be committed")
        elif not args.yes and sys.stdin.isatty():
            if input("Write to this database? [y/N] ").strip().lower() not in {"y", "yes"}:
                raise SystemExit("Nothing applied.")

        trainer = ensure_trainer_account(args, stages, summary)
        term = active_term()

        course = modules = subjects = None
        if "catalog" in stages or "students" in stages or "staff" in stages:
            course, modules, subjects = build_catalog(trainer, args, summary)

        roster: list[Student] = []
        if "students" in stages and course is not None:
            roster = ensure_students(trainer, course, modules, subjects, term, args, summary)
            db.session.flush()
        elif "records" in stages:
            roster = students_of(trainer)

        if "records" in stages:
            if roster:
                seed_learner_records(roster, args, summary)
            else:
                summary.note("No learners are linked to this trainer — learner records skipped.")

        coverage_statuses: dict[str, int] | None = None
        if "coverage" in stages:
            coverage_term = term or active_term()
            seed_coverage(trainer, args.coverage_scope, coverage_term, args.seed, summary)
            db.session.flush()
            coverage_statuses = report_coverage_statuses(coverage_term)

        if "staff" in stages and course is not None:
            seed_staff_records(trainer, course, term, args, summary)

        if args.dry_run:
            db.session.flush()
            db.session.rollback()
        else:
            db.session.commit()

        print()
        print("Dry run complete — nothing was written." if args.dry_run else "Seeding complete.")
        for note in summary.notes:
            print(f"  · {note}")
        if summary.created:
            print()
            print("Rows created:")
            for key in sorted(summary.created):
                print(f"  {key:.<32} {summary.created[key]}")
        else:
            print("  Nothing was missing.")
        if coverage_statuses:
            print()
            print("Course coverage report will show:")
            for status in ("flagged", "confirmed", "unvalidated"):
                print(f"  {status:.<32} {coverage_statuses.get(status, 0)} pairing(s)")
            missing = [s for s in ("flagged", "confirmed", "unvalidated") if not coverage_statuses.get(s)]
            if missing:
                print(f"  NOTE: no pairing lands on {', '.join(missing)} — too few pairings to spread over.")

        if not args.dry_run and not args.keep_password:
            print()
            print(f"Trainer login: {args.email} / {args.password}")


if __name__ == "__main__":
    main()
