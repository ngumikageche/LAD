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

    # Align every mark (and the generated assessments) to one term — for a
    # system deployed mid-year whose back-filled records must all read as the
    # term it went live in
    venv/bin/python scripts/repair_score_terms.py --force-term "Term 2 2026" --apply

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
from app.models.assessment import Assessment  # noqa: E402
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


def _force_all_to_term(target: Term, terms: list[Term], apply: bool) -> int:
    """
    Relabel every live mark — and retag the generated assessments — to one term.

    For a system deployed part-way through the year: the seeded history spread
    marks over several terms, but everything on it actually belongs to the term
    it went live in, so reports and score tables should read one term all
    through. Marks get the term's name (including marks carrying none, so the
    tables stop showing a blank); assessments referencing another term get
    their `term_id` moved and the other term's name rewritten out of their
    name and description.
    """
    target_name = (target.name or "").strip()
    other_names = [
        (term.name or "").strip()
        for term in terms
        if term.id != target.id and (term.name or "").strip()
    ]

    scores = (
        db.session.query(Score)
        .filter(Score.deleted_at.is_(None))
        .all()
    )
    scores_to_change = [
        score for score in scores
        if (score.term or "").strip().lower() != target_name.lower()
    ]

    assessments = db.session.query(Assessment).filter(Assessment.deleted_at.is_(None)).all()
    taken_names = {
        (assessment.name or "", str(assessment.course_id), str(assessment.module_id), str(assessment.term_id))
        for assessment in assessments
    }
    assessment_changes: list[tuple[Assessment, str, str, bool]] = []
    for assessment in assessments:
        new_name = assessment.name or ""
        new_description = assessment.description or ""
        for other in other_names:
            new_name = new_name.replace(other, target_name)
            new_description = new_description.replace(other, target_name)
        retag = assessment.term_id is not None and assessment.term_id != target.id
        if new_name == (assessment.name or "") and new_description == (assessment.description or "") and not retag:
            continue
        # Renaming can land on a name another assessment already holds for the
        # same course/module/term — the key the seeder deduplicates on — which
        # would merge two real papers on every report. Suffix instead.
        if new_name != (assessment.name or ""):
            candidate = new_name
            suffix = 2
            while (candidate, str(assessment.course_id), str(assessment.module_id), str(target.id)) in taken_names:
                candidate = f"{new_name} ({suffix})"
                suffix += 1
            new_name = candidate
            taken_names.add((new_name, str(assessment.course_id), str(assessment.module_id), str(target.id)))
        assessment_changes.append((assessment, new_name, new_description, retag))

    print(f"\nForcing every record to {target_name!r}:")
    print(f"  marks to relabel:        {len(scores_to_change)} of {len(scores)}")
    print(f"  assessments to retag:    {len(assessment_changes)} of {len(assessments)}")

    if not apply:
        print("\nDry run — nothing was written. Re-run with --apply to make these changes.")
        return 0

    for score in scores_to_change:
        score.term = target_name
    for assessment, new_name, new_description, retag in assessment_changes:
        assessment.name = new_name
        assessment.description = new_description or assessment.description
        if retag:
            assessment.term_id = target.id
    db.session.commit()
    print(f"\nUpdated {len(scores_to_change)} mark(s) and {len(assessment_changes)} assessment(s).")
    print(f"Every mark now reads {target_name!r} on term-scoped reports and score tables.")
    return 0


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
    parser.add_argument(
        "--force-term",
        metavar="TERM",
        help=(
            "Relabel EVERY live mark to this term and retag the generated assessments — "
            "for aligning a mid-year deployment to its go-live term. Runs instead of the "
            "stray-label repair."
        ),
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

        if args.force_term:
            resolved = resolve_term_label(args.force_term, terms)
            if not resolved:
                print(f"\n--force-term {args.force_term!r} matches no term on the system.", file=sys.stderr)
                return 1
            target_term = next(term for term in terms if term.name == resolved)
            return _force_all_to_term(target_term, terms, args.apply)

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
