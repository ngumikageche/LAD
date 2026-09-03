#!/usr/bin/env python3
"""
Generate the learning records that hang off the students and trainers already
in the database: terms, formative assessments, scores, practical assessment
reports, attendance (both the legacy register and QR sessions with check-ins),
competency records, portfolio evidence, alerts, notifications, learner reports,
trainer feedback, and module dashboard metrics.

Accounts are no longer matched on a `seed.` email prefix — every student in the
database is in scope, and the filters below narrow that down when only part of
it should be touched.

Run it with no arguments and it counts the students and trainers on record,
shows how many of them are missing each kind of data, and asks which of those
gaps to fill:

    python3 scripts/seed_linked_user_data.py            # menu
    python3 scripts/seed_linked_user_data.py --status   # the same report, then exit

Or name the work up front and it runs without prompting:

    python3 scripts/seed_linked_user_data.py --only scores --only practicals
    python3 scripts/seed_linked_user_data.py --department "Information Technology"
    python3 scripts/seed_linked_user_data.py --course CRS001 --limit 50
    python3 scripts/seed_linked_user_data.py --email-like 'seed.%' --dry-run

Every stage is idempotent. Rows that already exist are left untouched, so a
second run only fills in what was missing.
"""

from __future__ import annotations

import argparse
import random
import sys
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import func, or_

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app import create_app
from app.extensions import db
from app.models.alert import Alert
from app.models.assessment import Assessment
from app.models.attendance import Attendance
from app.models.attendance_session import AttendanceRecord, AttendanceSession
from app.models.competency import Competency
from app.models.competency_record import CompetencyRecord
from app.models.course import Course
from app.models.dashboard_metric import DashboardMetric
from app.models.department import Department
from app.models.enrollment import Enrollment
from app.models.module import Module
from app.models.notification import Notification
from app.models.portfolio_evidence import PortfolioEvidence
from app.models.practical_assessment_report import PracticalAssessmentReport
from app.models.score import Score
from app.models.student import Student
from app.models.student_report import StudentReport
from app.models.student_subject import StudentSubject
from app.models.subject import Subject
from app.models.term import Term
from app.models.trainer import Trainer
from app.models.trainer_course import TrainerCourse
from app.models.trainer_feedback import TrainerFeedback
from app.models.trainer_subject import TrainerSubject
from app.models.user import User
from app.services.trainer_portal import assessment_grade


# Weighted so a register reads like a real one instead of a coin flip. Nine in
# ten sittings count as attended ("present" or "late"), so the attendance tiles
# a demonstration is judged on sit clearly above the 65% mark stakeholders
# flagged, while every learner still has the odd absence to explain.
ATTENDANCE_STATUSES = ["present"] * 8 + ["late", "absent"]
ASSESSMENT_TYPES = ["quiz", "assignment", "test", "project", "exam"]

# Marks are drawn per learner from one of two bands. Most learners sit in the
# strong band, whose spread keeps the cohort's high-mastery share (cells at or
# above the 75% threshold) around 70%; the weak share keeps the at-risk
# watchlist, alerts, and support panels populated instead of empty.
WEAK_LEARNER_SHARE = 0.15
STRONG_MARK_RANGE = (70.0, 97.0)
WEAK_MARK_RANGE = (38.0, 72.0)
REPORT_TYPES = ["academic", "progress", "attendance", "support"]
FEEDBACK_CATEGORIES = ["general", "teaching", "materials", "communication", "support"]

# Campus-ish coordinates the QR attendance sessions are anchored to.
CAMPUS_LATITUDE = -1.0396
CAMPUS_LONGITUDE = 37.0834

# Practical assessment tasks are marked out of 25, oral questions out of 1 —
# the maximums PracticalAssessmentReport computes its competence bands from.
PRACTICAL_TASKS = [
    "Interpret the task brief and plan the {subject} activity",
    "Select and prepare the correct tools, materials, and PPE",
    "Carry out the {subject} practical task to specification",
    "Test, inspect, and hand the completed work over",
]
PRACTICAL_ORAL_QUESTIONS = [
    ("State the safety precautions you observed during this task.", "Names the hazards and the control for each."),
    ("Explain how you confirmed the work meets the required standard.", "Refers to the test or measurement carried out."),
    ("What would you do differently to improve quality or speed?", "Gives one concrete, workable improvement."),
]

STAGES = (
    "attendance",
    "sessions",
    "scores",
    "practicals",
    "competencies",
    "portfolio",
    "alerts",
    "reports",
    "feedback",
    "metrics",
)

# What each stage writes, for the menu and the --status report. The third
# entry explains gaps that are meant to stay: a learner who is not at risk
# never gets an alert, so those counts never reach zero.
STAGE_LABELS = {
    "attendance": ("Register attendance", "student", None),
    "sessions": ("QR attendance sessions and check-ins", "module", "needs a trainer on the module"),
    "scores": ("Formative assessments and marks", "student", None),
    "practicals": ("Practical assessment reports", "student", "needs a trainer sharing a subject"),
    "competencies": ("Competency records", "student", None),
    "portfolio": ("Portfolio evidence", "student", "a sample, set by --portfolio-rate"),
    "alerts": ("At-risk alerts", "student", "only learners below --risk-threshold"),
    "reports": ("Learner reports from trainers", "student", "needs a trainer sharing a subject"),
    "feedback": ("Trainer feedback from learners", "student", "a sample, set by --feedback-rate"),
    "metrics": ("Module dashboard metrics", "module", None),
}


@dataclass
class Summary:
    students_processed: int = 0
    modules_processed: int = 0
    terms_created: int = 0
    assessments_created: int = 0
    scores_created: int = 0
    attendance_created: int = 0
    sessions_created: int = 0
    check_ins_created: int = 0
    practicals_created: int = 0
    competency_records_created: int = 0
    portfolio_entries_created: int = 0
    alerts_created: int = 0
    notifications_created: int = 0
    reports_created: int = 0
    feedback_created: int = 0
    metrics_written: int = 0


# ── CLI ───────────────────────────────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate linked learning records for the users already in the database.",
    )
    parser.add_argument(
        "--department",
        action="append",
        default=[],
        help="Only students whose course sits in this department. Repeatable or comma-separated.",
    )
    parser.add_argument(
        "--course",
        action="append",
        default=[],
        help="Only students on this course, by name or code (CRS001). Repeatable or comma-separated.",
    )
    parser.add_argument(
        "--email-like",
        default=None,
        help="Optional SQL LIKE pattern on the user email, e.g. 'seed.%%' or '%%@larim.co.ke'.",
    )
    parser.add_argument("--limit", type=int, default=0, help="Cap how many students are processed (0 = no cap).")
    parser.add_argument("--seed", type=int, default=99, help="Random seed, for reproducible output.")
    parser.add_argument("--attendance-days", type=int, default=12, help="Weekdays of register attendance per module.")
    parser.add_argument("--sessions-per-module", type=int, default=2, help="QR attendance sessions to create per module.")
    parser.add_argument(
        "--max-terms",
        type=int,
        default=3,
        help="How many terms to generate marks for, counting back from the active term (1 = current term only).",
    )
    parser.add_argument("--portfolio-rate", type=float, default=0.7, help="Share of competencies that get portfolio evidence.")
    parser.add_argument("--feedback-rate", type=float, default=0.5, help="Share of learners who rate a trainer.")
    parser.add_argument("--risk-threshold", type=float, default=50.0, help="Mastery percentage below which alerts fire.")
    parser.add_argument(
        "--only",
        action="append",
        default=[],
        choices=STAGES,
        help="Run only these stages. Repeatable.",
    )
    parser.add_argument(
        "--skip",
        action="append",
        default=[],
        choices=STAGES,
        help="Skip these stages. Repeatable.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Do all the work, then roll back instead of committing.")
    parser.add_argument(
        "--status",
        action="store_true",
        help="Print who is in the database and what data they are missing, then exit.",
    )
    parser.add_argument("--menu", action="store_true", help="Force the interactive menu.")
    parser.add_argument("--no-menu", action="store_true", help="Never prompt; run the stages given on the command line.")
    return parser.parse_args()


def wants_menu(args: argparse.Namespace) -> bool:
    """The menu is the default for a person at a terminal, never for a script."""
    if args.menu:
        return True
    if args.no_menu or args.status or args.only or args.skip:
        return False
    return sys.stdin.isatty() and sys.stdout.isatty()


def utcnow() -> datetime:
    """Naive UTC, matching the timestamp columns the models declare."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Streams:
    """
    Random numbers keyed by what they describe rather than by call order.

    A single shared generator would drift the moment a run skips work that a
    previous run did — the marks and subject picks after the skip would all
    shift, and the "existing row" checks would stop matching. Seeding off the
    row's own identity keeps every draw stable, so re-runs land on the same
    answers and add nothing.
    """

    def __init__(self, seed: int) -> None:
        self.seed = seed

    def for_(self, *parts) -> random.Random:
        return random.Random("|".join([str(self.seed), *(str(part) for part in parts)]))


def split_csv(values: list[str]) -> list[str]:
    """Accept both `--course A --course B` and `--course "A,B"`."""
    out: list[str] = []
    for value in values:
        out.extend(part.strip() for part in value.split(",") if part.strip())
    return out


def resolve_stages(only: list[str], skip: list[str]) -> set[str]:
    stages = set(only) if only else set(STAGES)
    return stages - set(skip)


def chunked(items: list, size: int = 500):
    for start in range(0, len(items), size):
        yield items[start:start + size]


# ── Selection ─────────────────────────────────────────────────────────────────

def select_students(args: argparse.Namespace) -> list[Student]:
    departments = split_csv(args.department)
    courses = split_csv(args.course)

    query = (
        db.session.query(Student)
        .join(User, User.id == Student.user_id)
        .filter(Student.deleted_at.is_(None), User.deleted_at.is_(None))
    )

    if departments or courses:
        query = query.join(Course, Course.id == Student.course_id).filter(Course.deleted_at.is_(None))
    if departments:
        query = query.join(Department, Department.id == Course.department_id).filter(
            Department.name.in_(departments)
        )
    if courses:
        query = query.filter(
            or_(
                Course.name.in_(courses),
                Course.code.in_([value.upper() for value in courses]),
            )
        )
    if args.email_like:
        query = query.filter(User.email.ilike(args.email_like))

    query = query.order_by(Student.created_at.asc(), Student.registration_number.asc())
    if args.limit > 0:
        query = query.limit(args.limit)
    return query.all()


def get_terms(max_terms: int, summary: Summary) -> list[Term]:
    """
    The terms marks may be generated for, creating a year's worth when there
    are none.

    Counts back from the active term, never past it: a mark filed under a term
    that has not been delivered yet reads as data from the future, and on a
    system deployed mid-year the stakeholders expect every generated record to
    sit in the term it went live in. `--max-terms 1` therefore means "the
    current term only".
    """
    terms = (
        db.session.query(Term)
        .filter(Term.deleted_at.is_(None))
        .order_by(Term.start_date.desc())
        .all()
    )
    if terms:
        active = next((term for term in terms if term.is_active), None)
        if active:
            terms = [term for term in terms if term.start_date <= active.start_date]
        terms = terms[: max(1, max_terms)]
        return sorted(terms, key=lambda term: term.start_date)

    year = utcnow().year
    specs = [
        ("Term 1", datetime(year, 1, 10), datetime(year, 4, 5), False),
        ("Term 2", datetime(year, 5, 6), datetime(year, 8, 20), True),
        ("Term 3", datetime(year, 9, 2), datetime(year, 12, 10), False),
    ]
    for name, start_dt, end_dt, is_active in specs:
        db.session.add(Term(name=f"{name} {year}", start_date=start_dt, end_date=end_dt, is_active=is_active))
        summary.terms_created += 1
    db.session.flush()
    return get_terms(max_terms, summary)


def build_trainer_maps() -> tuple[dict, dict]:
    """subject_id -> trainers, and course_id -> trainers, for every live trainer."""
    by_subject: dict[uuid.UUID, list[Trainer]] = {}
    by_course: dict[uuid.UUID, list[Trainer]] = {}

    subject_rows = (
        db.session.query(TrainerSubject, Trainer)
        .join(Trainer, Trainer.id == TrainerSubject.trainer_id)
        .filter(TrainerSubject.deleted_at.is_(None), Trainer.deleted_at.is_(None))
        .all()
    )
    for link, trainer in subject_rows:
        by_subject.setdefault(link.subject_id, []).append(trainer)

    course_rows = (
        db.session.query(TrainerCourse, Trainer)
        .join(Trainer, Trainer.id == TrainerCourse.trainer_id)
        .filter(TrainerCourse.deleted_at.is_(None), Trainer.deleted_at.is_(None))
        .all()
    )
    for link, trainer in course_rows:
        by_course.setdefault(link.course_id, []).append(trainer)

    return by_subject, by_course


def pick_trainer(subject_id, course_id, by_subject: dict, by_course: dict) -> Trainer | None:
    """The subject's trainer if there is one, otherwise anyone teaching the course."""
    candidates = by_subject.get(subject_id) or by_course.get(course_id) or []
    return sorted(candidates, key=lambda trainer: str(trainer.id))[0] if candidates else None


def pick_subject_trainer(
    subjects: list[Subject],
    course_id,
    by_subject: dict,
    by_course: dict,
) -> tuple[Subject | None, Trainer | None]:
    """
    A subject the learner takes together with the trainer who teaches it.

    Reports, feedback, and practical assessments are only reachable in the app
    when trainer and learner share a subject, so a shared one is preferred over
    the first subject on the list.
    """
    for subject in subjects:
        trainer = pick_trainer(subject.id, None, by_subject, {})
        if trainer:
            return subject, trainer
    subject = subjects[0] if subjects else None
    return subject, pick_trainer(subject.id if subject else None, course_id, by_subject, by_course)


# ── Small helpers ─────────────────────────────────────────────────────────────

def marks_band(streams: "Streams", student_id) -> tuple[float, float]:
    """
    Which of the two mark bands a learner draws from, stable per learner.

    Keyed on the learner alone so the same person is consistently strong or
    consistently struggling across modules and terms — a learner who flips
    band per subject averages out to the middle, which is exactly the flat
    profile the two bands exist to avoid.
    """
    weak = streams.for_("achiever", student_id).random() < WEAK_LEARNER_SHARE
    return WEAK_MARK_RANGE if weak else STRONG_MARK_RANGE


def competency_status(mastery: float, competency: Competency | None) -> str:
    threshold = competency.mastery_threshold if competency else 75.0
    if mastery >= threshold:
        return "mastered"
    if mastery >= threshold * 0.7:
        return "developing"
    return "needs_support"


def score_feedback(percentage: float, risk_threshold: float) -> str:
    if percentage >= 75:
        return "Excellent progress, keep building on this foundation."
    if percentage < risk_threshold:
        return "Needs focused revision and closer coaching on core skills."
    return "Steady progress with room to strengthen consistency."


def weekdays_ending_today(count: int) -> list[date]:
    """The last `count` weekdays, oldest first."""
    days: list[date] = []
    cursor = utcnow().date()
    while len(days) < count:
        if cursor.weekday() < 5:
            days.append(cursor)
        cursor -= timedelta(days=1)
    return sorted(days)


def student_display_name(student: Student) -> str:
    return student.user.name if student.user else student.registration_number


# ── Assessments and scores ────────────────────────────────────────────────────

def ensure_assessment(
    course_id,
    module: Module,
    subject: Subject,
    term: Term,
    competency: Competency | None,
    assessment_type: str,
    summary: Summary,
) -> Assessment:
    name = f"{subject.name} {assessment_type.title()} — {term.name}"
    assessment = (
        db.session.query(Assessment)
        .filter(
            Assessment.name == name,
            Assessment.course_id == course_id,
            Assessment.term_id == term.id,
            Assessment.module_id == module.id,
            Assessment.deleted_at.is_(None),
        )
        .first()
    )
    if assessment:
        return assessment

    assessment = Assessment(
        course_id=course_id,
        term_id=term.id,
        module_id=module.id,
        competency_id=competency.id if competency else None,
        name=name,
        description=f"Generated {assessment_type} for {subject.name} in {term.name}.",
        assessment_type=assessment_type,
        # Institution-managed marks are formative; the portals filter on this.
        assessment_scope="formative",
        total_marks=100,
        pass_marks=50,
        weight=40 if assessment_type == "exam" else 25,
        recorded_at=term.start_date.date().isoformat() if term.start_date else None,
    )
    db.session.add(assessment)
    db.session.flush()
    summary.assessments_created += 1
    return assessment


def ensure_score(
    student: Student,
    enrollment: Enrollment,
    assessment: Assessment,
    subject: Subject,
    trainer: Trainer | None,
    term: Term,
    marks: float,
    risk_threshold: float,
    known_marks: dict,
    summary: Summary,
) -> float:
    """Record a mark for this assessment, or return the one already on file."""
    # `uq_scores_student_assessment` allows one live mark per learner per
    # assessment, so the assessment is what we de-duplicate on.
    if assessment.id in known_marks:
        return known_marks[assessment.id]

    total_marks = assessment.total_marks or 100
    pass_marks = assessment.pass_marks if assessment.pass_marks is not None else total_marks * 0.5
    db.session.add(
        Score(
            enrollment_id=enrollment.id,
            assessment_id=assessment.id,
            student_id=student.id,
            subject_id=subject.id,
            trainer_id=trainer.id if trainer else None,
            term=term.name,
            marks_obtained=marks,
            grade=assessment_grade(marks, total_marks),
            feedback=score_feedback(marks / total_marks * 100 if total_marks else 0, risk_threshold),
            is_passed=marks >= pass_marks,
        )
    )
    known_marks[assessment.id] = marks
    summary.scores_created += 1
    return marks


# ── Notifications and alerts ──────────────────────────────────────────────────

def notification_keys_for(user_id, cache: dict) -> set[tuple[str, str]]:
    """Titles and messages a user already holds, read once per run."""
    if user_id in cache:
        return cache[user_id]
    if not user_id:
        keys: set[tuple[str, str]] = set()
    else:
        keys = {
            (title, message)
            for title, message in db.session.query(Notification.title, Notification.message).filter(
                Notification.user_id == user_id,
                Notification.deleted_at.is_(None),
            )
        }
    cache[user_id] = keys
    return keys


def ensure_notification(user_id, title: str, message: str, seen: set, summary: Summary) -> None:
    if not user_id or (title, message) in seen:
        return
    db.session.add(Notification(user_id=user_id, title=title, message=message, is_read=False))
    seen.add((title, message))
    summary.notifications_created += 1


def ensure_alert(student: Student, competency: Competency, message: str, seen: set, summary: Summary) -> None:
    key = (competency.id, "academic_risk")
    if key in seen:
        return
    db.session.add(
        Alert(
            student_id=student.id,
            competency_id=competency.id,
            alert_type="academic_risk",
            message=message,
            triggered_at=utcnow(),
            resolved=False,
        )
    )
    seen.add(key)
    summary.alerts_created += 1


# ── QR attendance sessions ────────────────────────────────────────────────────

def ensure_attendance_sessions(
    module: Module,
    subjects: list[Subject],
    trainer: Trainer | None,
    count: int,
    streams: Streams,
    summary: Summary,
) -> list[AttendanceSession]:
    """Past, closed QR sessions for a module — what the attendance pages read."""
    if not trainer or count <= 0:
        return []

    stem = (module.code or str(module.id).replace("-", "")[:8]).upper()
    sessions: list[AttendanceSession] = []
    for index in range(1, count + 1):
        session_code = f"{stem}-{index:02d}"[:16]
        existing = (
            db.session.query(AttendanceSession)
            .filter(AttendanceSession.session_code == session_code)
            .first()
        )
        if existing:
            sessions.append(existing)
            continue

        rng = streams.for_("session", module.id, index)
        started_at = utcnow() - timedelta(days=7 * index, hours=rng.randint(1, 6))
        subject = subjects[(index - 1) % len(subjects)] if subjects else None
        session = AttendanceSession(
            trainer_id=trainer.id,
            course_id=module.course_id,
            module_id=module.id,
            subject_id=subject.id if subject else None,
            current_token=uuid.uuid4().hex + uuid.uuid4().hex,
            session_code=session_code,
            qr_seed=uuid.uuid4().hex,
            latitude=round(CAMPUS_LATITUDE + rng.uniform(-0.002, 0.002), 6),
            longitude=round(CAMPUS_LONGITUDE + rng.uniform(-0.002, 0.002), 6),
            allowed_radius_meters=100,
            started_at=started_at,
            expires_at=started_at + timedelta(hours=2),
            status="ended",
            regeneration_interval=25,
        )
        db.session.add(session)
        db.session.flush()
        sessions.append(session)
        summary.sessions_created += 1

    return sessions


def ensure_check_ins(
    session: AttendanceSession,
    students: list[Student],
    streams: Streams,
    summary: Summary,
) -> None:
    already_checked_in = {
        student_id
        for (student_id,) in db.session.query(AttendanceRecord.student_id).filter(
            AttendanceRecord.attendance_session_id == session.id
        )
    }
    for student in students:
        if student.id in already_checked_in:
            continue
        rng = streams.for_("check-in", session.id, student.id)
        # A few learners scan from outside the fence; the portal shows them as failed.
        distance = round(rng.uniform(5, 90) if rng.random() > 0.08 else rng.uniform(120, 400), 1)
        status = "success" if distance <= session.allowed_radius_meters else "failed_gps"
        offset_degrees = distance / 111_000
        db.session.add(
            AttendanceRecord(
                attendance_session_id=session.id,
                student_id=student.id,
                latitude=round(session.latitude + offset_degrees * rng.uniform(-1, 1), 6),
                longitude=round(session.longitude + offset_degrees * rng.uniform(-1, 1), 6),
                checked_in_at=session.started_at + timedelta(minutes=rng.randint(1, 45)),
                device_hash=uuid.uuid4().hex,
                browser_info="Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36",
                ip_address=f"10.{rng.randint(0, 255)}.{rng.randint(0, 255)}.{rng.randint(2, 254)}",
                status=status,
                distance_from_trainer=distance,
            )
        )
        summary.check_ins_created += 1


# ── Dashboard metrics ─────────────────────────────────────────────────────────

def write_dashboard_metric(module: Module, risk_threshold: float, summary: Summary) -> None:
    average_score = (
        db.session.query(func.avg(Score.marks_obtained))
        .join(Enrollment, Enrollment.id == Score.enrollment_id)
        .filter(Enrollment.module_id == module.id, Score.deleted_at.is_(None))
        .scalar()
    )

    record_rows = (
        db.session.query(CompetencyRecord.status, CompetencyRecord.mastery_level, CompetencyRecord.student_id)
        .join(Competency, Competency.id == CompetencyRecord.competency_id)
        .filter(Competency.module_id == module.id, CompetencyRecord.deleted_at.is_(None))
        .all()
    )
    total_records = len(record_rows)
    mastered = sum(1 for status, _, _ in record_rows if status == "mastered")
    at_risk = {student_id for _, mastery, student_id in record_rows if mastery < risk_threshold}

    if average_score is None and not total_records:
        return

    metric = (
        db.session.query(DashboardMetric)
        .filter(DashboardMetric.module_id == module.id, DashboardMetric.deleted_at.is_(None))
        .first()
    )
    values = {
        "average_score": round(float(average_score or 0), 2),
        "mastery_rate": round(mastered / total_records * 100, 2) if total_records else 0.0,
        "at_risk_count": len(at_risk),
        "last_updated": utcnow(),
    }
    if metric:
        for field, value in values.items():
            setattr(metric, field, value)
    else:
        db.session.add(DashboardMetric(module_id=module.id, **values))
    summary.metrics_written += 1


# ── Per-module work ───────────────────────────────────────────────────────────

def process_module(
    module: Module,
    module_students: list[tuple[Student, Enrollment]],
    terms: list[Term],
    by_subject: dict,
    by_course: dict,
    notification_cache: dict,
    stages: set[str],
    args: argparse.Namespace,
    streams: Streams,
    summary: Summary,
) -> None:
    students = [student for student, _ in module_students]
    student_ids = [student.id for student in students]

    # Ordering is part of the contract: the keyed random streams below only stay
    # stable across runs if the lists they choose from come back in one order.
    module_subjects = (
        db.session.query(Subject)
        .filter(Subject.module_id == module.id, Subject.deleted_at.is_(None))
        .order_by(Subject.name.asc(), Subject.id.asc())
        .all()
    )
    competencies = (
        db.session.query(Competency)
        .filter(Competency.module_id == module.id, Competency.deleted_at.is_(None))
        .order_by(Competency.name.asc(), Competency.id.asc())
        .all()
    )

    # Which of this module's subjects each learner is actually taking.
    subjects_by_student: dict[uuid.UUID, list[Subject]] = {}
    subject_ids = [subject.id for subject in module_subjects]
    if subject_ids:
        subject_lookup = {subject.id: subject for subject in module_subjects}
        for id_batch in chunked(student_ids):
            rows = (
                db.session.query(StudentSubject.student_id, StudentSubject.subject_id)
                .filter(
                    StudentSubject.student_id.in_(id_batch),
                    StudentSubject.subject_id.in_(subject_ids),
                    StudentSubject.deleted_at.is_(None),
                )
                .all()
            )
            for student_id, subject_id in rows:
                subjects_by_student.setdefault(student_id, []).append(subject_lookup[subject_id])
        for taken in subjects_by_student.values():
            taken.sort(key=lambda subject: (subject.name, str(subject.id)))

    attendance_days = weekdays_ending_today(args.attendance_days) if args.attendance_days > 0 else []
    assessment_cache: dict[tuple, Assessment] = {}

    if "sessions" in stages:
        session_trainer = pick_trainer(
            module_subjects[0].id if module_subjects else None,
            module.course_id,
            by_subject,
            by_course,
        )
        for session in ensure_attendance_sessions(
            module=module,
            subjects=module_subjects,
            trainer=session_trainer,
            count=args.sessions_per_module,
            streams=streams,
            summary=summary,
        ):
            ensure_check_ins(session, students, streams, summary)

    for student, enrollment in module_students:
        notification_keys = notification_keys_for(student.user_id, notification_cache)
        student_subjects = subjects_by_student.get(student.id) or module_subjects
        course_id = enrollment.course_id or module.course_id or student.course_id

        if "attendance" in stages and attendance_days:
            existing_dates = {
                row_date
                for (row_date,) in db.session.query(Attendance.date).filter(
                    Attendance.student_id == student.id,
                    Attendance.module_id == module.id,
                    Attendance.deleted_at.is_(None),
                )
            }
            for day in attendance_days:
                if day in existing_dates:
                    continue
                db.session.add(
                    Attendance(
                        student_id=student.id,
                        module_id=module.id,
                        date=day,
                        status=streams.for_("attendance", student.id, module.id, day).choice(
                            ATTENDANCE_STATUSES
                        ),
                    )
                )
                summary.attendance_created += 1

        band = marks_band(streams, student.id)
        competency_percentages: dict[uuid.UUID, float] = {}
        if "scores" in stages and student_subjects:
            known_marks = {
                assessment_id: float(marks)
                for assessment_id, marks in db.session.query(
                    Score.assessment_id, Score.marks_obtained
                ).filter(
                    Score.student_id == student.id,
                    Score.assessment_id.isnot(None),
                    Score.deleted_at.is_(None),
                )
            }
            for term in terms:
                # One assessment per competency per term, laid out over the
                # module's subjects. A single random sitting per term left most
                # competencies with no linked assessment — the Competencies page
                # called them out as "none linked" and their heatmap columns
                # stayed unassessed, holding the Mastery Rate tile to whatever
                # fraction of the module the draw happened to cover.
                if competencies:
                    sittings = [
                        (
                            module_subjects[index % len(module_subjects)],
                            ASSESSMENT_TYPES[(index // len(module_subjects)) % len(ASSESSMENT_TYPES)],
                            competency,
                        )
                        for index, competency in enumerate(competencies)
                    ]
                else:
                    picker = streams.for_("sitting", student.id, module.id, term.id)
                    sittings = [(picker.choice(student_subjects), None, None)]

                notified_subject: Subject | None = None
                for subject, assessment_type, competency in sittings:
                    # A learner only sits papers for the subjects they take.
                    if subject not in student_subjects:
                        continue

                    if competency is not None:
                        cache_key = (module.id, term.id, subject.id, assessment_type, competency.id)
                        if cache_key not in assessment_cache:
                            assessment_cache[cache_key] = ensure_assessment(
                                course_id=course_id,
                                module=module,
                                subject=subject,
                                term=term,
                                competency=competency,
                                assessment_type=assessment_type,
                                summary=summary,
                            )
                        marker = streams.for_("marks", student.id, module.id, term.id, subject.id, assessment_type)
                    else:
                        cache_key = (module.id, term.id, subject.id)
                        if cache_key not in assessment_cache:
                            # Keyed on the assessment itself, so every learner
                            # sitting it agrees on what it is called.
                            shape = streams.for_("assessment", module.id, term.id, subject.id)
                            assessment_cache[cache_key] = ensure_assessment(
                                course_id=course_id,
                                module=module,
                                subject=subject,
                                term=term,
                                competency=None,
                                assessment_type=shape.choice(ASSESSMENT_TYPES),
                                summary=summary,
                            )
                        marker = streams.for_("marks", student.id, module.id, term.id, subject.id)
                    assessment = assessment_cache[cache_key]

                    marks = round(max(20.0, min(98.0, marker.uniform(*band))), 2)
                    if assessment.competency and assessment.competency.mastery_threshold > 80:
                        marks = round(max(20.0, marks - marker.uniform(0, 10)), 2)

                    marks = ensure_score(
                        student=student,
                        enrollment=enrollment,
                        assessment=assessment,
                        subject=subject,
                        trainer=pick_trainer(subject.id, course_id, by_subject, by_course),
                        term=term,
                        marks=marks,
                        risk_threshold=args.risk_threshold,
                        known_marks=known_marks,
                        summary=summary,
                    )
                    if assessment.competency_id:
                        competency_percentages[assessment.competency_id] = marks
                    notified_subject = notified_subject or subject

                if notified_subject is not None:
                    ensure_notification(
                        user_id=student.user_id,
                        title="Assessment Data Uploaded",
                        message=f"New {notified_subject.name} performance data was uploaded for {term.name}.",
                        seen=notification_keys,
                        summary=summary,
                    )

        if competencies and {"competencies", "portfolio", "alerts"} & stages:
            existing_records = {
                competency_id
                for (competency_id,) in db.session.query(CompetencyRecord.competency_id).filter(
                    CompetencyRecord.student_id == student.id,
                    CompetencyRecord.deleted_at.is_(None),
                )
            }
            existing_evidence = {
                competency_id
                for (competency_id,) in db.session.query(PortfolioEvidence.competency_id).filter(
                    PortfolioEvidence.student_id == student.id,
                    PortfolioEvidence.deleted_at.is_(None),
                )
            }
            existing_alerts = {
                (competency_id, alert_type)
                for competency_id, alert_type in db.session.query(
                    Alert.competency_id, Alert.alert_type
                ).filter(Alert.student_id == student.id, Alert.deleted_at.is_(None))
            }

            for competency in competencies:
                grader = streams.for_("mastery", student.id, competency.id)
                # Where no mark reached this competency, the fallback draws from
                # the learner's own band so records and marks tell one story.
                mastery = competency_percentages.get(competency.id, round(grader.uniform(*band), 2))

                if "competencies" in stages and competency.id not in existing_records:
                    db.session.add(
                        CompetencyRecord(
                            student_id=student.id,
                            competency_id=competency.id,
                            mastery_level=mastery,
                            status=competency_status(mastery, competency),
                            last_updated=utcnow(),
                        )
                    )
                    existing_records.add(competency.id)
                    summary.competency_records_created += 1

                filer = streams.for_("portfolio", student.id, competency.id)
                if (
                    "portfolio" in stages
                    and competency.id not in existing_evidence
                    and filer.random() <= args.portfolio_rate
                ):
                    verifier = pick_trainer(
                        student_subjects[0].id if student_subjects else None,
                        course_id,
                        by_subject,
                        by_course,
                    )
                    db.session.add(
                        PortfolioEvidence(
                            student_id=student.id,
                            competency_id=competency.id,
                            file_url=f"/uploads/portfolio/{student.registration_number}/{competency.id}.pdf",
                            uploaded_at=utcnow() - timedelta(days=filer.randint(1, 60)),
                            verified_by=verifier.id if verifier else None,
                        )
                    )
                    existing_evidence.add(competency.id)
                    summary.portfolio_entries_created += 1

                if "alerts" in stages and mastery < args.risk_threshold:
                    ensure_alert(
                        student=student,
                        competency=competency,
                        message=f"{student_display_name(student)} is below threshold in {competency.name}.",
                        seen=existing_alerts,
                        summary=summary,
                    )
                    ensure_notification(
                        user_id=student.user_id,
                        title="Early Warning Alert",
                        message=f"You have been flagged for additional support in {competency.name}.",
                        seen=notification_keys,
                        summary=summary,
                    )

        shared_subject, report_trainer = pick_subject_trainer(
            student_subjects,
            course_id,
            by_subject,
            by_course,
        )

        if "reports" in stages and report_trainer and report_trainer.user_id:
            ensure_student_report(
                student=student,
                trainer=report_trainer,
                module=module,
                subject=shared_subject,
                notification_keys=notification_keys,
                streams=streams,
                summary=summary,
            )

        if "practicals" in stages and report_trainer and shared_subject:
            ensure_practical_report(
                student=student,
                trainer=report_trainer,
                module=module,
                subject=shared_subject,
                term=terms[-1] if terms else None,
                streams=streams,
                summary=summary,
            )

        rater = streams.for_("feedback", student.id, module.id)
        if (
            "feedback" in stages
            and report_trainer
            and student_subjects
            and rater.random() <= args.feedback_rate
        ):
            ensure_trainer_feedback(
                student=student,
                trainer=report_trainer,
                subject=rater.choice(student_subjects),
                rng=rater,
                summary=summary,
            )

    if "metrics" in stages:
        db.session.flush()
        write_dashboard_metric(module, args.risk_threshold, summary)


def ensure_student_report(
    student: Student,
    trainer: Trainer,
    module: Module,
    subject: Subject | None,
    notification_keys: set,
    streams: Streams,
    summary: Summary,
) -> None:
    title = f"{module.name} progress review"
    existing = (
        db.session.query(StudentReport.id)
        .filter(
            StudentReport.student_id == student.id,
            StudentReport.title == title,
            StudentReport.deleted_at.is_(None),
        )
        .first()
    )
    if existing:
        return

    report_type = streams.for_("report", student.id, module.id).choice(REPORT_TYPES)
    db.session.add(
        StudentReport(
            student_id=student.id,
            trainer_id=trainer.id,
            author_user_id=trainer.user_id,
            subject_id=subject.id if subject else None,
            report_type=report_type,
            title=title,
            body=(
                f"{student_display_name(student)} is working through {module.name}. "
                "Coursework is being submitted on time and practical tasks are improving; "
                "the focus for the next block is consistency across assessments."
            ),
            visibility="student",
            attachments=[],
        )
    )
    summary.reports_created += 1
    ensure_notification(
        user_id=student.user_id,
        title=f"New report: {title}",
        message=f"{trainer.user.name if trainer.user else 'Your trainer'} wrote a new {report_type} report for you.",
        seen=notification_keys,
        summary=summary,
    )


def resolve_institution_name(student: Student, trainer: Trainer) -> str:
    """Same order the practical assessment routes read the institution in."""
    if student.user and student.user.institution:
        return student.user.institution.name
    if student.course and student.course.department and student.course.department.institution:
        return student.course.department.institution.name
    if trainer.user and trainer.user.institution:
        return trainer.user.institution.name
    if trainer.department and trainer.department.institution:
        return trainer.department.institution.name
    return ""


def ensure_practical_report(
    student: Student,
    trainer: Trainer,
    module: Module,
    subject: Subject,
    term: Term | None,
    streams: Streams,
    summary: Summary,
) -> None:
    """
    One practical assessment per learner per unit of competency.

    Marks land in `report_sections`; the model's before_insert hook totals them
    and picks the competence band, so nothing here sets total_score directly.
    The legacy task_N_* columns are filled alongside for the older exports.
    """
    unit_of_competency = subject.name
    unit_code = subject.code or module.code or ""
    # Subject names repeat across the modules of a course, so the unit is
    # identified by its code where there is one — a learner still never gets
    # the same unit assessed twice.
    existing = db.session.query(PracticalAssessmentReport.id).filter(
        PracticalAssessmentReport.student_id == student.id,
        PracticalAssessmentReport.deleted_at.is_(None),
        PracticalAssessmentReport.unit_code == unit_code
        if unit_code
        else PracticalAssessmentReport.unit_of_competency == unit_of_competency,
    )
    if existing.first():
        return

    rng = streams.for_("practical", student.id, subject.id)
    task_scores = [round(rng.uniform(11, 25), 1) for _ in PRACTICAL_TASKS]
    task_items = [
        {
            "number": index,
            "prompt": prompt.format(subject=subject.name),
            "expected_response": None,
            "remark": PracticalAssessmentReport.auto_remark(score),
            "sub_items": [],
            "score": score,
            "max_score": float(PracticalAssessmentReport.MAX_TASK_SCORE),
        }
        for index, (prompt, score) in enumerate(zip(PRACTICAL_TASKS, task_scores), start=1)
    ]
    oral_items = [
        {
            "number": index,
            "prompt": question,
            "expected_response": guidance,
            "remark": None,
            "sub_items": [],
            "score": float(rng.choice([0, 1, 1, 1])),
            "max_score": float(PracticalAssessmentReport.DEFAULT_ORAL_MAX_SCORE),
        }
        for index, (question, guidance) in enumerate(PRACTICAL_ORAL_QUESTIONS, start=1)
    ]

    percentage = sum(task_scores) / (PracticalAssessmentReport.MAX_TASK_SCORE * len(task_scores)) * 100
    assessment_date = utcnow() - timedelta(days=rng.randint(7, 90))
    venue = f"{module.name} workshop"

    report = PracticalAssessmentReport(
        student_id=student.id,
        trainer_id=trainer.id,
        institution_name=resolve_institution_name(student, trainer),
        department_name=(
            student.course.department.name
            if student.course and student.course.department
            else (trainer.department.name if trainer.department else "")
        ),
        qualification=student.course.name if student.course else module.name,
        unit_of_competency=unit_of_competency,
        unit_code=unit_code,
        period=term.name if term else "",
        assessment_date=assessment_date,
        assessment_venue=venue,
        practical_brief=(
            f"The candidate is required to carry out a supervised {subject.name} task, "
            "working to the standard set out in the unit of competency."
        ),
        general_remarks=(
            "Candidate worked safely and to standard throughout."
            if percentage >= 65
            else "Candidate completed the task with support; further practice recommended."
        ),
        report_sections=[
            {
                "number": 1,
                "title": "Practical brief",
                "type": "narrative",
                "description": None,
                "content": (
                    f"Assessed on {assessment_date.date().isoformat()} at {venue}. "
                    f"The candidate completed the {subject.name} task under observation."
                ),
                "duration_hours": 3.0,
                "assessment_date": assessment_date.date().isoformat(),
                "assessment_venue": venue,
                "note": None,
                "items": [],
            },
            {
                "number": 2,
                "title": "Practical tasks",
                "type": "checklist",
                "description": "Each task is marked out of 25.",
                "content": None,
                "duration_hours": None,
                "assessment_date": None,
                "assessment_venue": None,
                "note": None,
                "items": task_items,
            },
            {
                "number": 3,
                "title": "Oral questions",
                "type": "oral",
                "description": "Each question is marked out of 1.",
                "content": None,
                "duration_hours": None,
                "assessment_date": None,
                "assessment_venue": None,
                "note": None,
                "items": oral_items,
            },
        ],
        media_attachments=[],
        task_items=[],
        oral_questions=[],
        status="released",
        released_at=assessment_date + timedelta(days=1),
        released_by_user_id=trainer.user_id,
    )

    # Legacy columns the older report exports still read.
    for index, (prompt, score) in enumerate(zip(PRACTICAL_TASKS, task_scores), start=1):
        setattr(report, f"task_{index}_description", prompt.format(subject=subject.name))
        setattr(report, f"task_{index}_score", score)
        setattr(report, f"task_{index}_remark", PracticalAssessmentReport.auto_remark(score))

    db.session.add(report)
    summary.practicals_created += 1


def ensure_trainer_feedback(
    student: Student,
    trainer: Trainer,
    subject: Subject,
    rng: random.Random,
    summary: Summary,
) -> None:
    existing = (
        db.session.query(TrainerFeedback.id)
        .filter(
            TrainerFeedback.student_id == student.id,
            TrainerFeedback.trainer_id == trainer.id,
            TrainerFeedback.subject_id == subject.id,
            TrainerFeedback.deleted_at.is_(None),
        )
        .first()
    )
    if existing:
        return

    rating = rng.randint(3, 5)
    answered = rng.random() < 0.4
    db.session.add(
        TrainerFeedback(
            student_id=student.id,
            trainer_id=trainer.id,
            subject_id=subject.id,
            rating=rating,
            teaching_rating=min(5, max(1, rating + rng.choice([-1, 0, 0, 1]))),
            communication_rating=min(5, max(1, rating + rng.choice([-1, 0, 0, 1]))),
            support_rating=min(5, max(1, rating + rng.choice([-1, 0, 0, 1]))),
            category=rng.choice(FEEDBACK_CATEGORIES),
            comment=(
                f"Sessions on {subject.name} are clear and well paced."
                if rating >= 4
                else f"More worked examples in {subject.name} would help."
            ),
            is_anonymous=rng.random() < 0.6,
            status="answered" if answered else "submitted",
            trainer_response="Thank you for the feedback — noted for the next block." if answered else None,
            responded_at=utcnow() - timedelta(days=rng.randint(1, 20)) if answered else None,
        )
    )
    summary.feedback_created += 1


# ── Coverage report and menu ──────────────────────────────────────────────────

@dataclass
class Coverage:
    students: int = 0
    students_enrolled: int = 0
    students_without_course: int = 0
    trainers: int = 0
    trainers_with_subjects: int = 0
    modules: int = 0
    terms: int = 0
    # stage -> (missing, total)
    gaps: dict = None


def ids_with_rows(model, owner_column, owner_ids: list) -> set:
    """The subset of `owner_ids` that already have at least one live row."""
    found: set = set()
    for id_batch in chunked(owner_ids):
        found.update(
            owner_id
            for (owner_id,) in db.session.query(owner_column)
            .filter(owner_column.in_(id_batch), model.deleted_at.is_(None))
            .distinct()
        )
    return found


def gather_coverage(students: list[Student], module_ids: list, terms: list[Term]) -> Coverage:
    student_ids = [student.id for student in students]
    enrolled_ids = ids_with_rows(Enrollment, Enrollment.student_id, student_ids)

    trainers = db.session.query(Trainer).filter(Trainer.deleted_at.is_(None)).all()
    trainer_ids = [trainer.id for trainer in trainers]
    linked_trainer_ids = ids_with_rows(TrainerSubject, TrainerSubject.trainer_id, trainer_ids)

    by_student = {
        "attendance": Attendance,
        "scores": Score,
        "practicals": PracticalAssessmentReport,
        "competencies": CompetencyRecord,
        "portfolio": PortfolioEvidence,
        "alerts": Alert,
        "reports": StudentReport,
        "feedback": TrainerFeedback,
    }
    gaps: dict[str, tuple[int, int]] = {}
    for stage, model in by_student.items():
        covered = ids_with_rows(model, model.student_id, student_ids)
        gaps[stage] = (len(student_ids) - len(covered), len(student_ids))

    for stage, model in (("sessions", AttendanceSession), ("metrics", DashboardMetric)):
        covered = ids_with_rows(model, model.module_id, module_ids)
        gaps[stage] = (len(module_ids) - len(covered), len(module_ids))

    return Coverage(
        students=len(students),
        students_enrolled=len(enrolled_ids),
        students_without_course=sum(1 for student in students if not student.course_id),
        trainers=len(trainers),
        trainers_with_subjects=len(linked_trainer_ids),
        modules=len(module_ids),
        terms=len(terms),
        gaps=gaps,
    )


def print_coverage(coverage: Coverage, database: str) -> list[str]:
    """Show who is in scope and what they are missing. Returns the stage order."""
    print()
    print(f"Database: {database}")
    print()
    print("In scope")
    print(f"  Students {coverage.students:>6}   enrolled in a module {coverage.students_enrolled}"
          + (f", no course set {coverage.students_without_course}" if coverage.students_without_course else ""))
    print(f"  Trainers {coverage.trainers:>6}   assigned to a subject {coverage.trainers_with_subjects}")
    print(f"  Modules  {coverage.modules:>6}   Terms {coverage.terms}")
    print()
    print("Missing data")
    order = [stage for stage in STAGES]
    for index, stage in enumerate(order, start=1):
        missing, total = coverage.gaps.get(stage, (0, 0))
        label, unit, note = STAGE_LABELS[stage]
        state = "all covered" if not missing else f"{missing} of {total} {unit}s"
        suffix = f"   ({note})" if missing and note else ""
        print(f"  {index:>2}. {stage:<13} {label:<38} {state}{suffix}")
    print()
    return order


def prompt_menu(order: list[str], coverage: Coverage, dry_run: bool) -> tuple[set[str], bool] | None:
    """Ask which stages to apply. Returns None when the operator backs out."""
    gaps_first = [stage for stage in order if coverage.gaps.get(stage, (0, 0))[0]]
    default = "gaps" if gaps_first else "all"
    print("Choose what to apply. Existing rows are never touched — only gaps are filled.")
    print("  numbers, e.g. 1,3,4   ·   'gaps' for everything still missing   ·   'all'   ·   'q' to quit")
    try:
        raw = input(f"Stages [{default}]: ").strip().lower()
    except (EOFError, KeyboardInterrupt):
        print()
        return None

    if raw in {"q", "quit", "exit"}:
        return None
    if not raw:
        raw = default

    if raw == "all":
        chosen = set(order)
    elif raw == "gaps":
        chosen = set(gaps_first)
    else:
        chosen = set()
        for token in raw.replace(" ", ",").split(","):
            if not token:
                continue
            if token.isdigit() and 1 <= int(token) <= len(order):
                chosen.add(order[int(token) - 1])
            elif token in STAGES:
                chosen.add(token)
            else:
                print(f"  ignoring '{token}' — not a stage number or name")

    if not chosen:
        print("Nothing selected.")
        return None

    try:
        answer = input(f"Dry run (write nothing, just report)? [{'Y/n' if dry_run else 'y/N'}]: ").strip().lower()
    except (EOFError, KeyboardInterrupt):
        print()
        return None
    if answer:
        dry_run = answer.startswith("y")

    print()
    print(f"Applying: {', '.join(sorted(chosen))}{' (dry run)' if dry_run else ''}")
    print()
    return chosen, dry_run


def database_label() -> str:
    """The connection string with any password removed."""
    uri = str(db.engine.url.render_as_string(hide_password=True))
    return uri


# ── Entry point ───────────────────────────────────────────────────────────────

def group_students_by_module(
    students: list[Student],
) -> dict[uuid.UUID, list[tuple[Student, Enrollment]]]:
    """
    The learners to work on, keyed by module.

    Assessments, QR sessions, and dashboard metrics belong to a module rather
    than to one learner, so the generation is driven module by module.
    """
    student_lookup = {student.id: student for student in students}
    enrollments_by_module: dict[uuid.UUID, list[tuple[Student, Enrollment]]] = {}
    seen_enrollments: set[tuple] = set()
    for id_batch in chunked(list(student_lookup.keys())):
        rows = (
            db.session.query(Enrollment)
            .filter(
                Enrollment.student_id.in_(id_batch),
                Enrollment.module_id.isnot(None),
                Enrollment.deleted_at.is_(None),
            )
            .order_by(Enrollment.created_at.asc())
            .all()
        )
        for enrollment in rows:
            # A learner can be enrolled in the same module for several
            # terms; the oldest row carries the whole module's work.
            key = (enrollment.module_id, enrollment.student_id)
            if key in seen_enrollments:
                continue
            seen_enrollments.add(key)
            enrollments_by_module.setdefault(enrollment.module_id, []).append(
                (student_lookup[enrollment.student_id], enrollment)
            )
    return enrollments_by_module


def modules_for(module_ids: list[uuid.UUID]) -> list[Module]:
    return (
        db.session.query(Module)
        .filter(Module.id.in_(module_ids), Module.deleted_at.is_(None))
        .order_by(Module.name.asc())
        .all()
    )


def generate_linked_data(
    modules: list[Module],
    enrollments_by_module: dict[uuid.UUID, list[tuple[Student, Enrollment]]],
    stages: set[str],
    args: argparse.Namespace,
    streams: Streams,
    summary: Summary,
) -> None:
    """
    Run the requested stages over the grouped learners.

    Split out from `main` so other seeding scripts can select their own learners
    — a single trainer's cohort, say — and still produce records that match the
    ones this script writes, rather than a second, subtly different set.
    """
    by_subject, by_course = build_trainer_maps()
    notification_cache: dict = {}
    terms = get_terms(args.max_terms, summary)

    for module in modules:
        process_module(
            module=module,
            module_students=enrollments_by_module[module.id],
            terms=terms,
            by_subject=by_subject,
            by_course=by_course,
            notification_cache=notification_cache,
            stages=stages,
            args=args,
            streams=streams,
            summary=summary,
        )
        summary.modules_processed += 1

    summary.students_processed = len(
        {student.id for bucket in enrollments_by_module.values() for student, _ in bucket}
    )


def main() -> None:
    args = parse_args()
    stages = resolve_stages(args.only, args.skip)
    dry_run = args.dry_run
    if not stages:
        raise SystemExit("Every stage was skipped — nothing to do.")

    streams = Streams(args.seed)
    app = create_app()

    with app.app_context():
        summary = Summary()
        students = select_students(args)
        if not students:
            raise SystemExit(
                "No students matched. Check the --department / --course / --email-like filters, "
                "or create accounts first with scripts/seed_random_users.py."
            )

        enrollments_by_module = group_students_by_module(students)
        if not enrollments_by_module:
            raise SystemExit(
                f"{len(students)} student(s) matched but none are enrolled in a module. "
                "Enrol them first, then re-run."
            )

        modules = modules_for(list(enrollments_by_module.keys()))

        if args.status or wants_menu(args):
            existing_terms = (
                db.session.query(Term).filter(Term.deleted_at.is_(None)).all()
            )
            coverage = gather_coverage(students, [module.id for module in modules], existing_terms)
            order = print_coverage(coverage, database_label())
            if args.status:
                return
            choice = prompt_menu(order, coverage, dry_run)
            if choice is None:
                print("Nothing applied.")
                return
            stages, dry_run = choice

        generate_linked_data(modules, enrollments_by_module, stages, args, streams, summary)
        terms = get_terms(args.max_terms, summary)

        if dry_run:
            db.session.flush()
            db.session.rollback()
        else:
            db.session.commit()

        print("Dry run complete — nothing was written." if dry_run else "Linked data generation complete")
        print(f"Stages run: {', '.join(sorted(stages))}")
        print(f"Students processed: {summary.students_processed}")
        print(f"Modules processed: {summary.modules_processed}")
        print(f"Terms used: {len(terms)} (created {summary.terms_created})")
        print(f"Assessments created: {summary.assessments_created}")
        print(f"Scores created: {summary.scores_created}")
        print(f"Practical assessment reports created: {summary.practicals_created}")
        print(f"Register attendance rows created: {summary.attendance_created}")
        print(f"QR attendance sessions created: {summary.sessions_created}")
        print(f"QR check-ins created: {summary.check_ins_created}")
        print(f"Competency records created: {summary.competency_records_created}")
        print(f"Portfolio evidence rows created: {summary.portfolio_entries_created}")
        print(f"Alerts created: {summary.alerts_created}")
        print(f"Learner reports created: {summary.reports_created}")
        print(f"Trainer feedback rows created: {summary.feedback_created}")
        print(f"Dashboard metrics written: {summary.metrics_written}")
        print(f"Notifications created: {summary.notifications_created}")


if __name__ == "__main__":
    main()
