#!/usr/bin/env python3
"""
Lift the Attendance Signal to what the seeded classes are meant to show.

Stakeholders expect a working class to read around 90% attendance; the live
showcase read in the low 80s. Two things held it there:

  1. Rows seeded under older weights. Earlier runs drew five roll-call
     sittings in six as attended and failed one QR scan in eight on GPS. The
     seeder never rewrites a row it has already written — that is what makes
     it safe to re-run — so raising its weights only ever reached new rows.
     This re-draws every generated row with the seeder's current draw
     (`register_status` and `draw_check_in` in seed_linked_user_data.py), so
     the data reads exactly as a fresh seed would, and a second run changes
     nothing.

  2. Sessions that were never sittings: ones still open, and ones that closed
     with nobody recorded — a register opened to try the feature, or by
     mistake — each of which marked the whole class absent. The app itself now
     ignores both (`AttendanceSession.counts_as_sitting`), and counts learners
     the trainer marked present by hand; this script only lists those
     sessions, so you can see what stopped counting.

Only generated rows are changed. The roll-call register (`attendance`) is
written by nothing but the seed scripts, and generated QR sessions are named
MODULE-NN where the app issues six characters with no dash — so no scan or
hand-marked learner from a real class is touched. Open attendance alerts in
scope are then re-read: an alert whose learner is now above the threshold is
resolved. Nothing new is raised and no one is notified; Evaluate on the Alerts
page does the full pass.

    # See what would change — writes nothing
    venv/bin/python scripts/repair_attendance_signal.py

    # Apply it
    venv/bin/python scripts/repair_attendance_signal.py --apply

    # Only one trainer's learners
    venv/bin/python scripts/repair_attendance_signal.py --email trainer@larim.co.ke --only-trainer --apply
"""

from __future__ import annotations

import argparse
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import func  # noqa: E402

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402
from app.models.alert import Alert  # noqa: E402
from app.models.attendance import Attendance  # noqa: E402
from app.models.attendance_session import AttendanceRecord, AttendanceSession  # noqa: E402
from app.models.subject import Subject  # noqa: E402
from app.models.trainer import Trainer  # noqa: E402
from app.models.trainer_subject import TrainerSubject  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services.alerts import ATTENDANCE, ATTENDANCE_THRESHOLD, attendance_rate  # noqa: E402
from app.services.learning_analytics import get_attendance_performance  # noqa: E402

import seed_linked_user_data as linked  # noqa: E402
import seed_trainer_showcase as showcase  # noqa: E402

# The only statuses the generator writes on a QR check-in. Anything else on a
# generated session was put there by a person and is left alone.
GENERATED_CHECK_IN_STATUSES = ("success", "failed_gps")
ATTENDED_REGISTER_STATUSES = {"present", "late"}


def resolve_trainer(email: str) -> Trainer | None:
    user = db.session.query(User).filter(func.lower(User.email) == email.strip().lower()).first()
    if not user:
        return None
    return db.session.query(Trainer).filter(Trainer.user_id == user.id, Trainer.deleted_at.is_(None)).first()


def attendance_signal(trainer: Trainer | None) -> tuple[float | None, int, int]:
    """
    The Attendance Signal tile, as `build_role_dashboard` averages it.

    For a trainer, the tile on their dashboard; for None, every learner on the
    system — the administrator's figure. Returns the average, how many learners
    it covers, and how many of them sit under the alert threshold. Read
    uncached: the dashboard memoizes this for a minute, which would report the
    same figure before and after the repair.
    """
    items = get_attendance_performance.uncached(trainer_id=str(trainer.id) if trainer else None)["items"]
    if not items:
        return None, 0, 0
    rates = [item["attendance_rate"] for item in items]
    below = sum(1 for rate in rates if rate < ATTENDANCE_THRESHOLD)
    return round(sum(rates) / len(rates), 1), len(rates), below


def describe_signal(label: str, signal: tuple[float | None, int, int]) -> str:
    average, learners, below = signal
    if average is None:
        return f"  {label:<34} no attendance recorded"
    return (
        f"  {label:<34} {average:5.1f}%  over {learners} learner(s), "
        f"{below} under {ATTENDANCE_THRESHOLD:.0f}%"
    )


def redraw_register(student_ids: list | None, streams: linked.Streams) -> dict[str, int]:
    """Re-draw every roll-call row with the generator's current weights."""
    query = db.session.query(
        Attendance.id, Attendance.student_id, Attendance.module_id, Attendance.date, Attendance.status
    ).filter(
        Attendance.deleted_at.is_(None),
        # The generator always names both; a row without them cannot be re-drawn.
        Attendance.student_id.isnot(None),
        Attendance.module_id.isnot(None),
    )
    if student_ids is not None:
        query = query.filter(Attendance.student_id.in_(student_ids))

    to_status: dict[str, list] = defaultdict(list)
    counts = {"rows": 0, "attended_before": 0, "attended_after": 0, "changed": 0}
    for row_id, student_id, module_id, day, status in query.all():
        wanted = linked.register_status(streams, student_id, module_id, day)
        counts["rows"] += 1
        counts["attended_before"] += (status or "").lower() in ATTENDED_REGISTER_STATUSES
        counts["attended_after"] += wanted in ATTENDED_REGISTER_STATUSES
        if status != wanted:
            to_status[wanted].append(row_id)
            counts["changed"] += 1

    for status, row_ids in to_status.items():
        for batch in linked.chunked(row_ids, 1000):
            db.session.query(Attendance).filter(Attendance.id.in_(batch)).update(
                {Attendance.status: status}, synchronize_session=False
            )
    return counts


def redraw_check_ins(student_ids: list | None, streams: linked.Streams) -> dict[str, int]:
    """Re-draw the outcome of every check-in on a generated QR session."""
    sessions = {
        session.id: session
        for session in db.session.query(AttendanceSession).filter(AttendanceSession.deleted_at.is_(None)).all()
        if linked.is_generated_session_code(session.session_code)
    }
    counts = {"sessions": len(sessions), "rows": 0, "attended_before": 0, "attended_after": 0, "changed": 0}
    for batch in linked.chunked(list(sessions), 500):
        query = db.session.query(AttendanceRecord).filter(
            AttendanceRecord.attendance_session_id.in_(batch),
            AttendanceRecord.deleted_at.is_(None),
            AttendanceRecord.status.in_(GENERATED_CHECK_IN_STATUSES),
        )
        if student_ids is not None:
            query = query.filter(AttendanceRecord.student_id.in_(student_ids))
        for record in query.all():
            drawn = linked.draw_check_in(sessions[record.attendance_session_id], record.student_id, streams)
            counts["rows"] += 1
            counts["attended_before"] += record.status == "success"
            counts["attended_after"] += drawn["status"] == "success"
            if record.status == drawn["status"]:
                continue
            for field, value in drawn.items():
                setattr(record, field, value)
            counts["changed"] += 1
    return counts


def sessions_not_counted(subject_ids: list | None) -> list[tuple[AttendanceSession, str, int]]:
    """Sessions the app no longer counts as a sitting, and why."""
    query = (
        db.session.query(AttendanceSession)
        .filter(AttendanceSession.deleted_at.is_(None), ~AttendanceSession.counts_as_sitting())
        .order_by(AttendanceSession.started_at.desc())
    )
    if subject_ids is not None:
        query = query.filter(AttendanceSession.subject_id.in_(subject_ids))
    now = linked.utcnow()
    found = []
    for session in query.all():
        recorded = (
            db.session.query(func.count(AttendanceRecord.id))
            .filter(AttendanceRecord.attendance_session_id == session.id, AttendanceRecord.deleted_at.is_(None))
            .scalar()
        ) or 0
        still_open = session.status != "ended" and session.expires_at > now
        found.append((session, "still open" if still_open else "nobody recorded", recorded))
    return found


def resolve_recovered_alerts(student_ids: list | None) -> tuple[int, int]:
    """Resolve open attendance alerts whose learner is back above the threshold."""
    query = db.session.query(Alert).filter(
        Alert.alert_type == ATTENDANCE,
        Alert.resolved.is_(False),
        Alert.deleted_at.is_(None),
    )
    if student_ids is not None:
        query = query.filter(Alert.student_id.in_(student_ids))
    resolved = still_below = 0
    for alert in query.all():
        rate, _ = attendance_rate(alert.student_id)
        if rate is None:
            continue
        if rate >= ATTENDANCE_THRESHOLD:
            alert.resolved = True
            resolved += 1
        else:
            still_below += 1
    return resolved, still_below


def share(attended: int, rows: int) -> str:
    return f"{attended / rows * 100:5.1f}%" if rows else "   —  "


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="Write the changes (default is a dry run)")
    parser.add_argument(
        "--email",
        default=showcase.DEFAULT_EMAIL,
        help=f"Trainer whose Attendance Signal is reported before and after (default: {showcase.DEFAULT_EMAIL})",
    )
    parser.add_argument(
        "--only-trainer",
        action="store_true",
        help="Repair only that trainer's learners, instead of every generated row on the system",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=2026,
        help="Random seed for the re-draw (default 2026, the one seed_trainer_showcase.py uses)",
    )
    args = parser.parse_args()

    app = create_app()
    with app.app_context():
        print(f"Database: {showcase.database_label()}")
        trainer = resolve_trainer(args.email)
        if trainer is None:
            print(f"Trainer:  {args.email} not found — reporting the system-wide figure only.")
            if args.only_trainer:
                print("--only-trainer needs a trainer that exists.", file=sys.stderr)
                return 1
        else:
            print(f"Trainer:  {args.email}")

        student_ids = subject_ids = None
        if args.only_trainer:
            student_ids = [student.id for student in showcase.students_of(trainer)]
            subject_ids = [
                row[0]
                for row in db.session.query(TrainerSubject.subject_id).filter(
                    TrainerSubject.trainer_id == trainer.id, TrainerSubject.deleted_at.is_(None)
                )
            ]
            print(f"Scope:    {len(student_ids)} learner(s) on that trainer's subjects")
        else:
            print("Scope:    every generated attendance row on the system")

        before = {"system": attendance_signal(None)}
        if trainer:
            before["trainer"] = attendance_signal(trainer)

        streams = linked.Streams(args.seed)
        register = redraw_register(student_ids, streams)
        check_ins = redraw_check_ins(student_ids, streams)
        db.session.flush()

        after = {"system": attendance_signal(None)}
        if trainer:
            after["trainer"] = attendance_signal(trainer)
        resolved, still_below = resolve_recovered_alerts(student_ids)

        print("\nRoll-call register (generated by the seeders):")
        print(f"  rows re-drawn:                    {register['changed']} of {register['rows']}")
        print(f"  attended share:                   {share(register['attended_before'], register['rows'])} -> "
              f"{share(register['attended_after'], register['rows'])}")
        print(f"\nQR check-ins on {check_ins['sessions']} generated session(s):")
        print(f"  check-ins re-drawn:               {check_ins['changed']} of {check_ins['rows']}")
        print(f"  successful share:                 {share(check_ins['attended_before'], check_ins['rows'])} -> "
              f"{share(check_ins['attended_after'], check_ins['rows'])}")

        skipped = sessions_not_counted(subject_ids)
        print(f"\nSessions the app no longer counts as a sitting: {len(skipped)}")
        subject_names = {
            subject.id: subject.name
            for subject in db.session.query(Subject).filter(
                Subject.id.in_([session.subject_id for session, _, _ in skipped if session.subject_id])
            )
        } if skipped else {}
        for session, reason, recorded in skipped[:20]:
            print(
                f"  {session.session_code:<16} {session.started_at:%Y-%m-%d %H:%M}  "
                f"{subject_names.get(session.subject_id, 'no subject')[:28]:<28} {reason}"
                f"{f' ({recorded} scanned so far)' if reason == 'still open' else ''}"
            )
        if len(skipped) > 20:
            print(f"  … and {len(skipped) - 20} more")
        if skipped:
            print("  (Left as they are. An open session starts counting once it ends or expires.)")

        print("\nAttendance Signal:")
        for key, label in (("trainer", f"{args.email}"), ("system", "all learners (admin view)")):
            if key in before:
                print(describe_signal(f"{label} — before", before[key]))
                print(describe_signal(f"{label} — after", after[key]))

        print(f"\nOpen attendance alerts resolved (learner now at or above {ATTENDANCE_THRESHOLD:.0f}%): {resolved}")
        if still_below:
            print(f"Open attendance alerts still below the threshold, left open: {still_below}")

        if not args.apply:
            db.session.rollback()
            print("\nDry run — nothing was written. Re-run with --apply to make these changes.")
            return 0

        db.session.commit()
        print(f"\nUpdated {register['changed']} register row(s) and {check_ins['changed']} check-in(s).")
        print("Dashboards pick the new figures up within a minute (the analytics cache).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
