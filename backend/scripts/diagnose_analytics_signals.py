#!/usr/bin/env python3
"""
Why the dashboard's Mastery Rate or Attendance Signal reads 0%.

Both tiles are averages over a list, and an empty list is reported as 0% —
indistinguishable on screen from a genuine zero. This says which of the two it
is, and when the list is empty, which link in the chain is missing.

Mastery needs Subject → Competency → Assessment → Score: a mark only counts if
it was recorded against an assessment naming a competency in the subject's
module. Attendance is kept in two registers — `attendance` (a manual roll call)
and `attendance_records` (a QR/GPS check-in against a session) — and a cohort
using only one of them still has attendance.

The learner side is the same question asked of one person, plus terms: their
analytics scope comes entirely from `student_subjects`, and a mark carrying no
term — or a term that exists nowhere — is visible on some screens and absent
from others.

    venv/bin/python scripts/diagnose_analytics_signals.py --email trainer@example.edu
    venv/bin/python scripts/diagnose_analytics_signals.py --trainer-id <uuid>
    venv/bin/python scripts/diagnose_analytics_signals.py --student --email learner@example.edu
    venv/bin/python scripts/diagnose_analytics_signals.py --student-id <uuid>

Read-only: it never writes.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import func  # noqa: E402

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402
from app.models.assessment import Assessment  # noqa: E402
from app.models.attendance import Attendance  # noqa: E402
from app.models.attendance_session import AttendanceRecord, AttendanceSession  # noqa: E402
from app.models.competency import Competency  # noqa: E402
from app.models.portfolio_evidence import PortfolioEvidence  # noqa: E402
from app.models.score import Score  # noqa: E402
from app.models.student import Student  # noqa: E402
from app.models.student_subject import StudentSubject  # noqa: E402
from app.models.subject import Subject  # noqa: E402
from app.models.term import Term  # noqa: E402
from app.models.trainer import Trainer  # noqa: E402
from app.models.trainer_subject import TrainerSubject  # noqa: E402
from app.models.user import User  # noqa: E402


def _count(query) -> int:
    return int(query.scalar() or 0)


def _resolve_trainer(email: str | None, trainer_id: str | None) -> Trainer | None:
    if trainer_id:
        return db.session.get(Trainer, trainer_id)
    if email:
        user = db.session.query(User).filter(func.lower(User.email) == email.lower()).first()
        if not user:
            print(f"No user with email {email!r}.")
            return None
        trainer = user.trainer or db.session.query(Trainer).filter(Trainer.user_id == user.id).first()
        if not trainer:
            print(f"{email} is not a trainer (no trainers row).")
        return trainer
    return None


def diagnose(email: str | None, trainer_id: str | None) -> int:
    trainer = _resolve_trainer(email, trainer_id)
    if not trainer:
        return 1

    subject_ids = [
        row[0]
        for row in db.session.query(TrainerSubject.subject_id)
        .filter(TrainerSubject.trainer_id == trainer.id)
        .all()
    ]
    who = trainer.user.name if trainer.user else str(trainer.id)
    print(f"Trainer: {who}")
    print(f"Assigned subjects: {len(subject_ids)}")
    if not subject_ids:
        print("  → Nothing is assigned, so every scoped tile is empty by definition.")
        return 0

    module_ids = [
        row[0]
        for row in db.session.query(Subject.module_id).filter(Subject.id.in_(subject_ids)).all()
        if row[0]
    ]
    students = _count(
        db.session.query(func.count(func.distinct(StudentSubject.student_id))).filter(
            StudentSubject.subject_id.in_(subject_ids)
        )
    )
    print(f"Learners in those subjects: {students}")

    print("\nMASTERY — needs Subject → Competency → Assessment → Score")
    competencies = _count(
        db.session.query(func.count(Competency.id)).filter(
            Competency.module_id.in_(module_ids),
            Competency.deleted_at.is_(None),
        )
    )
    linked_assessments = _count(
        db.session.query(func.count(Assessment.id)).filter(
            Assessment.module_id.in_(module_ids),
            Assessment.competency_id.isnot(None),
            Assessment.deleted_at.is_(None),
        )
    )
    scored = _count(
        db.session.query(func.count(Score.id))
        .join(Assessment, Assessment.id == Score.assessment_id)
        .filter(
            Assessment.competency_id.isnot(None),
            Assessment.module_id.in_(module_ids),
            Score.deleted_at.is_(None),
        )
    )
    print(f"  competencies on those modules      : {competencies}")
    print(f"  assessments naming a competency    : {linked_assessments}")
    print(f"  marks against those assessments    : {scored}")
    if competencies == 0:
        print("  → No competencies, so the heatmap has no rows and Mastery is 0%.")
        print("    Define competencies on the module before this tile can move.")
    elif linked_assessments == 0:
        print("  → Competencies exist but no assessment sets competency_id, so every")
        print("    cell scores NULL, is graded 'low', and the high-mastery share is 0%.")
    elif scored == 0:
        print("  → Assessments are linked but carry no marks yet.")
    else:
        print("  → The chain is intact; a 0% here is a real result, not a wiring fault.")

    print("\nATTENDANCE — two registers, either one counts")
    manual = _count(
        db.session.query(func.count(Attendance.id)).filter(
            Attendance.deleted_at.is_(None),
            Attendance.module_id.in_(module_ids),
        )
    )
    manual_unattributed = _count(
        db.session.query(func.count(Attendance.id)).filter(
            Attendance.deleted_at.is_(None),
            Attendance.module_id.is_(None),
        )
    )
    sessions = _count(
        db.session.query(func.count(AttendanceSession.id)).filter(
            AttendanceSession.subject_id.in_(subject_ids),
            AttendanceSession.deleted_at.is_(None),
        )
    )
    check_ins = _count(
        db.session.query(func.count(AttendanceRecord.id))
        .join(AttendanceSession, AttendanceSession.id == AttendanceRecord.attendance_session_id)
        .filter(
            AttendanceSession.subject_id.in_(subject_ids),
            AttendanceRecord.status == "success",
            AttendanceRecord.deleted_at.is_(None),
        )
    )
    print(f"  manual roll-call rows (in scope)   : {manual}")
    print(f"  manual rows naming no module       : {manual_unattributed}")
    print(f"  QR/GPS sessions run                : {sessions}")
    print(f"  successful check-ins               : {check_ins}")
    if manual == 0 and sessions == 0 and manual_unattributed == 0:
        print("  → Neither register holds anything for these subjects; 0% is honest.")
    else:
        print("  → Attendance exists and should now be counted. Before the fix this")
        print("    read 0% unless the same learners also had marks in these subjects.")

    print("\nPORTFOLIO — evidence submitted against competencies required")
    evidence = _count(
        db.session.query(func.count(PortfolioEvidence.id))
        .join(Competency, Competency.id == PortfolioEvidence.competency_id)
        .filter(
            Competency.module_id.in_(module_ids),
            PortfolioEvidence.deleted_at.is_(None),
        )
    )
    print(f"  competencies requiring evidence    : {competencies}")
    print(f"  evidence items submitted           : {evidence}")
    if competencies == 0:
        print("  → Nothing is required, so there is no completion to report. The")
        print("    dashboard now says so instead of showing 0%.")
    elif evidence == 0:
        print("  → A requirement exists but no evidence has been submitted. Note that")
        print("    no API endpoint creates portfolio evidence — it arrives only via")
        print("    scripts/seed_linked_user_data.py, so there is no way to submit any.")

    subjectless = _count(
        db.session.query(func.count(Score.id)).filter(
            Score.subject_id.is_(None),
            Score.deleted_at.is_(None),
        )
    )
    if subjectless:
        print(f"\nNote: {subjectless} marks carry no subject_id and reach a subject only")
        print("through their assessment's module. Anything matching on subject_id alone")
        print("silently drops them.")
    return 0


def _resolve_student(email: str | None, student_id: str | None) -> Student | None:
    if student_id:
        return db.session.get(Student, student_id)
    if email:
        user = db.session.query(User).filter(func.lower(User.email) == email.lower()).first()
        if not user:
            print(f"No user with email {email!r}.")
            return None
        student = user.student or db.session.query(Student).filter(Student.user_id == user.id).first()
        if not student:
            print(f"{email} is not a learner (no students row).")
        return student
    return None


def diagnose_student(email: str | None, student_id: str | None) -> int:
    """
    Why one learner's Mastery Rate tile is empty.

    Their whole analytics scope is resolved from `student_subjects`: the heatmap
    joins it, and the marks fallback filters on the subjects it returns. A
    learner with no rows there has an empty subject list, and an empty list
    matches nothing — so every mark they hold is filtered out and the tile
    reports nothing measured, however many marks were uploaded.
    """
    student = _resolve_student(email, student_id)
    if not student:
        return 1

    who = student.user.name if student.user else str(student.id)
    print(f"Learner: {who} ({student.registration_number})")

    subject_ids = [
        row[0]
        for row in db.session.query(StudentSubject.subject_id)
        .filter(StudentSubject.student_id == student.id)
        .all()
    ]
    module_ids = [
        row[0]
        for row in db.session.query(Subject.module_id).filter(Subject.id.in_(subject_ids)).all()
        if row[0]
    ] if subject_ids else []

    total_marks = _count(
        db.session.query(func.count(Score.id)).filter(
            Score.student_id == student.id, Score.deleted_at.is_(None)
        )
    )
    print(f"Subjects they are attached to : {len(subject_ids)}")
    print(f"Marks recorded for them       : {total_marks}")

    if total_marks == 0:
        print("  → No marks at all. Nothing downstream can show anything.")
        return 0

    if not subject_ids:
        print("  → THIS IS THE FAULT. They hold marks but are on no subject, so the")
        print("    analytics subject list is empty and every mark is filtered out.")
        print("    Mastery, the heatmap, and the progress chart all read as nothing")
        print("    measured. Attach them: Trainer → Learner Enrollment, or re-run the")
        print("    bulk upload, which links learners to the subject as it commits.")
        return 0

    print("\nMASTERY — competency chain first, marks as the fallback")
    competencies = _count(
        db.session.query(func.count(Competency.id)).filter(
            Competency.module_id.in_(module_ids), Competency.deleted_at.is_(None)
        )
    ) if module_ids else 0
    assessed_cells = _count(
        db.session.query(func.count(Score.id))
        .join(Assessment, Assessment.id == Score.assessment_id)
        .filter(
            Score.student_id == student.id,
            Score.deleted_at.is_(None),
            Assessment.competency_id.isnot(None),
            Assessment.deleted_at.is_(None),
        )
    )
    in_scope = _count(
        db.session.query(func.count(Score.id))
        .join(Assessment, Assessment.id == Score.assessment_id)
        .filter(
            Score.student_id == student.id,
            Score.deleted_at.is_(None),
            Score.subject_id.in_(subject_ids),
        )
    )
    print(f"  competencies on their modules     : {competencies}")
    print(f"  their marks naming a competency   : {assessed_cells}")
    print(f"  their marks inside those subjects : {in_scope} of {total_marks}")
    if competencies == 0 or assessed_cells == 0:
        print("  → No competency evidence, so the tile falls back to marks and reports")
        print("    the share of their subjects averaging 75%+. That is a real figure;")
        print("    'competency mastery' is simply not being measured.")
    if in_scope == 0:
        print("  → None of their marks sit in a subject they are attached to. Check")
        print("    whether the marks carry a subject_id at all (see the note below).")

    print("\nTERMS — what the trend can and cannot plot")
    known = {
        (row[0] or "").strip().lower()
        for row in db.session.query(Term.name).filter(Term.deleted_at.is_(None)).all()
    }
    rows = (
        db.session.query(Score.term, func.count(Score.id))
        .filter(Score.student_id == student.id, Score.deleted_at.is_(None))
        .group_by(Score.term)
        .all()
    )
    untermed = sum(count for label, count in rows if not (label or "").strip())
    unmatched = [
        (label, count)
        for label, count in rows
        if (label or "").strip() and (label or "").strip().lower() not in known
    ]
    matched = sum(
        count for label, count in rows
        if (label or "").strip() and (label or "").strip().lower() in known
    )
    print(f"  marks on a real term              : {matched}")
    print(f"  marks with no term at all         : {untermed}")
    print(f"  marks on a term that exists nowhere: {sum(c for _, c in unmatched)}")
    for label, count in unmatched:
        print(f"      {label!r}: {count}")
    if untermed:
        print("  → These cannot appear on the term trend, which is an axis of terms.")
        print("    They DO count in term-scoped reports, which treat a missing term as")
        print("    'belongs to whichever term you are viewing' — so the same marks are")
        print("    visible in Exam Results and absent from the trend. Set the term on")
        print("    the assessment so future uploads inherit it.")
    if unmatched:
        print("  → A label matching no term is invisible in EVERY term-scoped report.")
        print("    Create the term under Academic Terms, or re-upload: the importer")
        print("    snaps labels onto real terms and refuses to save an unknown one")
        print("    silently. scripts/repair_score_terms.py fixes what is already saved.")

    subjectless = _count(
        db.session.query(func.count(Score.id)).filter(
            Score.student_id == student.id,
            Score.subject_id.is_(None),
            Score.deleted_at.is_(None),
        )
    )
    if subjectless:
        print(f"\nNote: {subjectless} of their marks carry no subject_id and reach a subject")
        print("only through their assessment's module.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--email", help="trainer's or learner's login email")
    parser.add_argument("--trainer-id", help="trainers.id UUID")
    parser.add_argument("--student-id", help="students.id UUID")
    parser.add_argument(
        "--student",
        action="store_true",
        help="diagnose the learner-side tiles (mastery and terms) instead of the trainer's",
    )
    args = parser.parse_args()

    if not args.email and not args.trainer_id and not args.student_id:
        parser.error("give --email, --trainer-id, or --student-id")

    app = create_app()
    with app.app_context():
        if args.student or args.student_id:
            return diagnose_student(args.email, args.student_id)
        return diagnose(args.email, args.trainer_id)


if __name__ == "__main__":
    raise SystemExit(main())
