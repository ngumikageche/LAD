#!/usr/bin/env python3
"""
List every live module and what data feeds it, flagging the gaps.

Everything the dashboards report hangs off a module — subjects to teach,
competencies to master, assessments to mark, enrolments to count, marks and a
register to average. A module missing one of those links is invisible to part
of the system: no subjects means nothing to assign or attend, no competencies
means no mastery, no assessments means no marks can ever arrive, and no
enrolments means the seeder and the dashboards alike skip it.

    venv/bin/python scripts/find_modules_without_data.py            # gaps only
    venv/bin/python scripts/find_modules_without_data.py --all      # every module

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
from app.models.competency import Competency  # noqa: E402
from app.models.course import Course  # noqa: E402
from app.models.enrollment import Enrollment  # noqa: E402
from app.models.module import Module  # noqa: E402
from app.models.score import Score  # noqa: E402
from app.models.subject import Subject  # noqa: E402

# Column key -> what its absence means, printed under the table for the gaps found.
GAP_MEANING = {
    "Subj": "no subjects — nothing can be taught, assigned, or attended under it",
    "Comp": "no competencies — Mastery Rate has nothing to measure",
    "Assm": "no assessments — no mark can ever be recorded against it",
    "Enrl": "no enrolments — no learner is on it, so seeds and dashboards skip it",
    "Marks": "no marks — assessments exist but nothing has been recorded",
    "Attnd": "no register attendance — the manual roll call is empty for it",
}


def _counts(query, key_col) -> dict:
    return dict(query.group_by(key_col).all())


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--all", action="store_true", help="List every module, not only the ones with gaps.")
    args = parser.parse_args()

    app = create_app()
    with app.app_context():
        modules = (
            db.session.query(Module, Course.name)
            .outerjoin(Course, Course.id == Module.course_id)
            .filter(Module.deleted_at.is_(None))
            .order_by(Module.name.asc())
            .all()
        )
        if not modules:
            print("No live modules exist.")
            return 0

        subjects = _counts(
            db.session.query(Subject.module_id, func.count(Subject.id))
            .filter(Subject.deleted_at.is_(None)),
            Subject.module_id,
        )
        competencies = _counts(
            db.session.query(Competency.module_id, func.count(Competency.id))
            .filter(Competency.deleted_at.is_(None)),
            Competency.module_id,
        )
        assessments = _counts(
            db.session.query(Assessment.module_id, func.count(Assessment.id))
            .filter(Assessment.deleted_at.is_(None)),
            Assessment.module_id,
        )
        enrollments = _counts(
            db.session.query(Enrollment.module_id, func.count(Enrollment.id))
            .filter(Enrollment.deleted_at.is_(None)),
            Enrollment.module_id,
        )
        marks = _counts(
            db.session.query(Assessment.module_id, func.count(Score.id))
            .join(Score, Score.assessment_id == Assessment.id)
            .filter(Score.deleted_at.is_(None), Assessment.deleted_at.is_(None)),
            Assessment.module_id,
        )
        attendance = _counts(
            db.session.query(Attendance.module_id, func.count(Attendance.id))
            .filter(Attendance.deleted_at.is_(None)),
            Attendance.module_id,
        )

        header = (
            f"{'Module':<44} {'Course':<28} "
            f"{'Subj':>4} {'Comp':>4} {'Assm':>4} {'Enrl':>4} {'Marks':>5} {'Attnd':>5}  Missing"
        )
        rows_printed = 0
        empty: list[str] = []
        gapped: list[str] = []
        seen_gap_keys: set[str] = set()
        print(header)
        print("-" * len(header))
        for module, course_name in modules:
            row = {
                "Subj": subjects.get(module.id, 0),
                "Comp": competencies.get(module.id, 0),
                "Assm": assessments.get(module.id, 0),
                "Enrl": enrollments.get(module.id, 0),
                "Marks": marks.get(module.id, 0),
                "Attnd": attendance.get(module.id, 0),
            }
            gaps = [key for key, value in row.items() if value == 0]
            if gaps:
                seen_gap_keys.update(gaps)
                (empty if len(gaps) == len(row) else gapped).append(module.name)
            if not gaps and not args.all:
                continue
            rows_printed += 1
            print(
                f"{module.name[:43]:<44} {(course_name or '(no course)')[:27]:<28} "
                f"{row['Subj']:>4} {row['Comp']:>4} {row['Assm']:>4} {row['Enrl']:>4} "
                f"{row['Marks']:>5} {row['Attnd']:>5}  {', '.join(gaps) or '-'}"
            )
        if rows_printed == 0:
            print("(every module has data in all six columns)")

        print()
        fully_fed = len(modules) - len(gapped) - len(empty)
        print(
            f"{len(modules)} live module(s): {fully_fed} fully fed, "
            f"{len(gapped)} with gaps, {len(empty)} with no data at all."
        )
        if empty:
            print("\nNo data at all — likely catalogue stubs nothing was ever attached to:")
            for name in empty:
                print(f"  - {name}")
        if seen_gap_keys:
            print("\nWhat each gap means:")
            for key in ("Subj", "Comp", "Assm", "Enrl", "Marks", "Attnd"):
                if key in seen_gap_keys:
                    print(f"  {key:<6} {GAP_MEANING[key]}")
            print(
                "\nTo fill a module that should carry demo data, enrol learners on it and run\n"
                "  venv/bin/python scripts/seed_linked_user_data.py --status\n"
                "to see which stages it is missing, then seed the ones you want."
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
