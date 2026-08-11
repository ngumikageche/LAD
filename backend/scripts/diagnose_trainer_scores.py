#!/usr/bin/env python3
"""
Why a trainer sees no marks when an administrator sees plenty.

Marks attach to a subject by id, and a trainer sees a mark only when that exact
id is assigned to them. `subjects.name` has no uniqueness constraint, so two
subjects can read identically on screen while holding different ids — marks
uploaded against one are then invisible to a trainer assigned the other.

    venv/bin/python scripts/diagnose_trainer_scores.py --email trainer@example.edu
    venv/bin/python scripts/diagnose_trainer_scores.py --trainer-id <uuid>
    venv/bin/python scripts/diagnose_trainer_scores.py --list

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
from app.models.score import Score  # noqa: E402
from app.models.subject import Subject  # noqa: E402
from app.models.trainer import Trainer  # noqa: E402
from app.models.trainer_subject import TrainerSubject  # noqa: E402
from app.models.user import User  # noqa: E402


def _resolve_trainer(email: str | None, trainer_id: str | None) -> Trainer | None:
    query = db.session.query(Trainer).filter(Trainer.deleted_at.is_(None))
    if trainer_id:
        return query.filter(Trainer.id == trainer_id).first()
    if email:
        return query.join(User, User.id == Trainer.user_id).filter(
            func.lower(User.email) == email.strip().lower()
        ).first()
    return None


def _list_trainers() -> None:
    rows = (
        db.session.query(Trainer.id, User.name, User.email)
        .outerjoin(User, User.id == Trainer.user_id)
        .filter(Trainer.deleted_at.is_(None))
        .order_by(User.name.asc())
        .all()
    )
    print(f"{len(rows)} trainer(s):\n")
    for trainer_id, name, email in rows:
        print(f"  {trainer_id}  {name or '(unnamed)':30s} {email or ''}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--email", help="Trainer's login email")
    parser.add_argument("--trainer-id", help="Trainer UUID")
    parser.add_argument("--list", action="store_true", help="List trainers and exit")
    args = parser.parse_args()

    app = create_app()
    with app.app_context():
        if args.list:
            _list_trainers()
            return 0

        trainer = _resolve_trainer(args.email, args.trainer_id)
        if not trainer:
            print("Trainer not found. Use --list to see the options.", file=sys.stderr)
            return 1

        name = trainer.user.name if trainer.user else "(unnamed)"
        print(f"Trainer: {name}  <{trainer.user.email if trainer.user else '—'}>")
        print(f"  id            {trainer.id}")
        print(f"  institution   {trainer.user.institution_id if trainer.user else None}\n")

        assigned = {
            row[0] for row in db.session.query(TrainerSubject.subject_id)
            .filter(TrainerSubject.trainer_id == trainer.id).all()
        }
        print(f"Assigned subjects ({len(assigned)}):")
        for subject in db.session.query(Subject).filter(Subject.id.in_(assigned)).all() if assigned else []:
            marks = db.session.query(func.count(Score.id)).filter(
                Score.subject_id == subject.id, Score.deleted_at.is_(None)
            ).scalar() or 0
            print(f"  {subject.id}  {subject.name:40s} code={subject.code or '—':10s} marks={marks}")
        if not assigned:
            print("  (none — this alone explains an empty screen)")
        print()

        # Every subject that actually holds marks.
        rows = (
            db.session.query(Score.subject_id, func.count(Score.id))
            .filter(Score.deleted_at.is_(None))
            .group_by(Score.subject_id)
            .order_by(func.count(Score.id).desc())
            .all()
        )
        subjects = {
            subject.id: subject for subject in
            db.session.query(Subject).filter(
                Subject.id.in_([sid for sid, _ in rows if sid])
            ).all()
        }

        print("Subjects holding marks:")
        print(f"  {'subject_id':38s} {'name':34s} {'marks':>7s}  visible to this trainer?")
        hidden_total = 0
        for subject_id, marks in rows:
            subject = subjects.get(subject_id)
            label = subject.name if subject else "(no subject on the mark)"
            visible = subject_id in assigned
            if not visible:
                hidden_total += marks
            print(f"  {str(subject_id):38s} {label[:34]:34s} {marks:>7d}  {'YES' if visible else 'no'}")

        print(f"\n  {hidden_total} mark(s) are invisible to this trainer.\n")

        # Same name, different id — the case that makes two screens disagree.
        duplicates = (
            db.session.query(func.lower(func.trim(Subject.name)), func.count(Subject.id))
            .filter(Subject.deleted_at.is_(None))
            .group_by(func.lower(func.trim(Subject.name)))
            .having(func.count(Subject.id) > 1)
            .all()
        )
        if duplicates:
            print("Subjects sharing a name (marks on one are invisible to a trainer holding the other):")
            for lowered, count in duplicates:
                print(f"\n  '{lowered}' — {count} records:")
                for subject in db.session.query(Subject).filter(
                    func.lower(func.trim(Subject.name)) == lowered,
                    Subject.deleted_at.is_(None),
                ).all():
                    marks = db.session.query(func.count(Score.id)).filter(
                        Score.subject_id == subject.id, Score.deleted_at.is_(None)
                    ).scalar() or 0
                    holders = (
                        db.session.query(User.name)
                        .join(Trainer, Trainer.user_id == User.id)
                        .join(TrainerSubject, TrainerSubject.trainer_id == Trainer.id)
                        .filter(TrainerSubject.subject_id == subject.id)
                        .all()
                    )
                    mark = "<-- assigned to this trainer" if subject.id in assigned else ""
                    print(
                        f"    {subject.id}  module={subject.module_id}  marks={marks:<6d} "
                        f"held_by={[h[0] for h in holders] or 'nobody'} {mark}"
                    )
        else:
            print("No two subjects share a name.")

        print(
            "\nRemedy: assign the trainer the subject id that holds the marks "
            "(Trainers -> Assign Subjects), or move the marks onto the subject "
            "they already hold."
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
