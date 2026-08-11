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
from app.models.course import Course  # noqa: E402
from app.models.department import Department  # noqa: E402
from app.models.module import Module  # noqa: E402
from app.models.student import Student  # noqa: E402
from app.models.term import Term  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services.scoping import (  # noqa: E402
    institution_course_ids,
    scope_scores,
    term_match_clause,
    visible_institution_id,
)


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


def _funnel(trainer: Trainer, assigned: set) -> None:
    """
    Where the marks on the trainer's own subjects are lost.

    The per-subject table above ignores scoping; this runs the real filter one
    stage at a time, so a count that survives the subject check but vanishes
    from a report can be pinned to the stage that dropped it.
    """
    print("\n" + "=" * 72)
    print("Filter funnel for the subjects this trainer IS assigned")
    print("=" * 72)

    if not assigned:
        print("  No assigned subjects — nothing to trace.")
        return

    user = trainer.user
    raw = db.session.query(func.count(Score.id)).filter(
        Score.subject_id.in_(assigned), Score.deleted_at.is_(None)
    ).scalar() or 0
    print(f"  1. Marks on those subjects, unfiltered ......... {raw}")

    institution_id = visible_institution_id(user)
    print(f"  2. Institution the filter applies .............. {institution_id}")

    if institution_id is not None:
        by_subject_tree = db.session.query(func.count(Score.id)).filter(
            Score.subject_id.in_(assigned),
            Score.deleted_at.is_(None),
            Score.subject_id.in_(
                db.session.query(Subject.id).filter(
                    Subject.module_id.in_(
                        db.session.query(Module.id).filter(
                            Module.course_id.in_(institution_course_ids(institution_id))
                        )
                    )
                )
            ),
        ).scalar() or 0
        by_student_course = db.session.query(func.count(Score.id)).filter(
            Score.subject_id.in_(assigned),
            Score.deleted_at.is_(None),
            Score.student.has(Student.course_id.in_(institution_course_ids(institution_id))),
        ).scalar() or 0
        by_student_user = db.session.query(func.count(Score.id)).filter(
            Score.subject_id.in_(assigned),
            Score.deleted_at.is_(None),
            Score.student.has(
                Student.user_id.in_(
                    db.session.query(User.id).filter(User.institution_id == institution_id)
                )
            ),
        ).scalar() or 0
        print(f"       via subject's institution tree ........... {by_subject_tree}")
        print(f"       via student's course ..................... {by_student_course}")
        print(f"       via student's user account ............... {by_student_user}")

    scoped = scope_scores(db.session.query(func.count(Score.id)), user).filter(
        Score.subject_id.in_(assigned), Score.deleted_at.is_(None)
    ).scalar() or 0
    print(f"  3. After the full scope filter ................. {scoped}")

    for term in db.session.query(Term).filter(Term.deleted_at.is_(None)).order_by(Term.start_date.desc()).all():
        count = scope_scores(db.session.query(func.count(Score.id)), user).filter(
            Score.deleted_at.is_(None), term_match_clause(term)
        ).scalar() or 0
        print(f"  4. After scope + term '{term.name}' ... {count}")

    # Where each assigned subject actually sits, and where its learners sit.
    print("\n  Institution of each assigned subject:")
    for subject in db.session.query(Subject).filter(Subject.id.in_(assigned)).all():
        module = db.session.get(Module, subject.module_id) if subject.module_id else None
        course = db.session.get(Course, module.course_id) if module and module.course_id else None
        department = db.session.get(Department, course.department_id) if course and course.department_id else None
        print(
            f"    {subject.name[:34]:34s} module={'yes' if module else 'MISSING':7s} "
            f"course={'yes' if course else 'MISSING':7s} dept={'yes' if department else 'MISSING':7s} "
            f"institution={department.institution_id if department else 'UNRESOLVED'}"
        )

    print("\n  Learners holding those marks:")
    rows = (
        db.session.query(Student.id, Student.course_id, User.institution_id, func.count(Score.id))
        .join(Score, Score.student_id == Student.id)
        .outerjoin(User, User.id == Student.user_id)
        .filter(Score.subject_id.in_(assigned), Score.deleted_at.is_(None))
        .group_by(Student.id, Student.course_id, User.institution_id)
        .all()
    )
    if not rows:
        print("    (the marks have no student_id — nothing links them to a learner)")
    for student_id, course_id, user_institution, count in rows[:15]:
        course = db.session.get(Course, course_id) if course_id else None
        department = db.session.get(Department, course.department_id) if course and course.department_id else None
        print(
            f"    student={student_id} marks={count:<4d} user_institution={user_institution} "
            f"course_institution={department.institution_id if department else 'UNRESOLVED'}"
        )
    print(f"\n  Trainer's institution: {user.institution_id if user else None}")


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

        _funnel(trainer, assigned)

        print(
            "\nRemedy: assign the trainer the subject id that holds the marks "
            "(Trainers -> Assign Subjects), or move the marks onto the subject "
            "they already hold."
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
