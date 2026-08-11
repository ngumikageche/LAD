#!/usr/bin/env python3
"""
Repair marks whose term label matches no term.

`Score.term` is free text and every report filters by it, so a mark labelled
"TERM1" when the term is called "Term 1 2026" is saved successfully and then
appears on no report at all. This finds those marks and relabels them.

    # See what would change — writes nothing
    venv/bin/python scripts/repair_score_terms.py

    # Apply it
    venv/bin/python scripts/repair_score_terms.py --apply

    # Decide a specific label yourself
    venv/bin/python scripts/repair_score_terms.py --map "TERM1=Term 1 2026" --apply

Marks are matched to a term in this order:

  1. an explicit `--map` you supply;
  2. an exact match, ignoring case and surrounding space;
  3. a loose match, ignoring punctuation too — "Term 2, 2026";
  4. a bare ordinal — "2" against the one term with 2 as its own word, which is
     how a spreadsheet column of term numbers reads;
  5. the term recorded on the mark's own assessment;
  6. with --by-date, the term whose dates contain the mark's creation date.

Steps 3 and 4 require exactly one candidate. Anything still unresolved is
listed and left untouched — a mark under the wrong term is worse than one under
no term, so the script never guesses beyond these rules.
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
from app.models.score import Score  # noqa: E402
from app.models.term import Term  # noqa: E402
from app.services.scoping import resolve_term_label  # noqa: E402


def _parse_map(pairs: list[str]) -> dict[str, str]:
    mapping = {}
    for pair in pairs or []:
        if "=" not in pair:
            raise SystemExit(f"--map expects OLD=NEW, got {pair!r}")
        old, new = pair.split("=", 1)
        mapping[old.strip().lower()] = new.strip()
    return mapping


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--apply", action="store_true", help="Write the changes (default is a dry run)")
    parser.add_argument(
        "--map",
        action="append",
        default=[],
        metavar="OLD=NEW",
        help="Force a label onto a term, e.g. --map \"TERM1=Term 1 2026\". Repeatable.",
    )
    parser.add_argument(
        "--by-date",
        action="store_true",
        help="Also match a mark to the term whose dates contain its creation date",
    )
    args = parser.parse_args()

    overrides = _parse_map(args.map)

    app = create_app()
    with app.app_context():
        terms = (
            db.session.query(Term)
            .filter(Term.deleted_at.is_(None))
            .order_by(Term.start_date.asc())
            .all()
        )
        if not terms:
            print("No terms exist. Create one under Academic Terms first.", file=sys.stderr)
            return 1

        canonical = {(term.name or "").strip().lower(): term.name for term in terms}
        print("Terms on the system:")
        for term in terms:
            print(f"  {term.name}  ({term.start_date.date()} to {term.end_date.date()})"
                  f"{'  [current]' if term.is_active else ''}")

        for target in overrides.values():
            if target.strip().lower() not in canonical:
                print(f"\n--map target {target!r} is not a term name.", file=sys.stderr)
                return 1

        # Every distinct label in use, and how many marks carry it.
        labels = (
            db.session.query(Score.term, func.count(Score.id))
            .filter(Score.deleted_at.is_(None), Score.term.isnot(None))
            .group_by(Score.term)
            .all()
        )
        stray = [
            (label, count) for label, count in labels
            if (label or "").strip().lower() not in canonical
        ]

        if not stray:
            print("\nEvery mark's term label matches a real term. Nothing to repair.")
            return 0

        print(f"\n{len(stray)} label(s) match no term, covering "
              f"{sum(count for _, count in stray)} mark(s):")
        for label, count in sorted(stray, key=lambda item: -item[1]):
            print(f"  {label!r:30s} {count} mark(s)")

        planned: dict[tuple[str, str], int] = defaultdict(int)
        unresolved: dict[str, int] = defaultdict(int)
        to_update = []

        for label, _ in stray:
            scores = (
                db.session.query(Score)
                .filter(Score.deleted_at.is_(None), Score.term == label)
                .all()
            )
            for score in scores:
                resolved = overrides.get((label or "").strip().lower())

                # Exact, punctuation-insensitive, then bare-ordinal — each
                # requiring a single candidate. Shared with the upload path so
                # both agree on what a label means.
                if not resolved:
                    resolved = resolve_term_label(label, terms)

                if not resolved and score.assessment and score.assessment.term:
                    resolved = score.assessment.term.name

                if not resolved and args.by_date and score.created_at:
                    for term in terms:
                        if term.start_date <= score.created_at <= term.end_date:
                            resolved = term.name
                            break

                if resolved:
                    planned[(label, resolved)] += 1
                    to_update.append((score, resolved))
                else:
                    unresolved[label] += 1

        print("\nPlanned changes:")
        if not planned:
            print("  (none — no rule resolved these labels)")
        for (old, new), count in sorted(planned.items(), key=lambda item: -item[1]):
            print(f"  {old!r:30s} -> {new!r:20s} {count} mark(s)")

        if unresolved:
            print("\nLeft untouched — no rule could resolve these:")
            for label, count in sorted(unresolved.items(), key=lambda item: -item[1]):
                print(f"  {label!r:30s} {count} mark(s)")
            print("  Re-run with --by-date, or name the term yourself:")
            example = next(iter(unresolved))
            suggestion = next((t.name for t in terms if t.is_active), terms[0].name)
            print(f'    --map "{example}={suggestion}"')

        if not args.apply:
            print("\nDry run — nothing was written. Re-run with --apply to make these changes.")
            return 0

        if not to_update:
            print("\nNothing to update — no label was resolved, so no mark was changed.")
            return 0

        for score, resolved in to_update:
            score.term = resolved
        db.session.commit()
        print(f"\nUpdated {len(to_update)} mark(s).")
        print("Those marks now appear on term-scoped reports. No other field was touched.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
