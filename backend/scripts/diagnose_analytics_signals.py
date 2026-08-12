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

    venv/bin/python scripts/diagnose_analytics_signals.py --email trainer@example.edu
    venv/bin/python scripts/diagnose_analytics_signals.py --trainer-id <uuid>

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
from app.models.student_subject import StudentSubject  # noqa: E402
from app.models.subject import Subject  # noqa: E402
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


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--email", help="trainer's login email")
    parser.add_argument("--trainer-id", help="trainers.id UUID")
    args = parser.parse_args()

    if not args.email and not args.trainer_id:
        parser.error("give --email or --trainer-id")

    app = create_app()
    with app.app_context():
        return diagnose(args.email, args.trainer_id)


if __name__ == "__main__":
    raise SystemExit(main())
