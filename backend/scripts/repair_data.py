#!/usr/bin/env python3
"""
One-off data repairs, run by hand instead of by Alembic.

These are data fixes, not schema changes the app needs to boot: the code works
with or without them, they only correct rows written before the fix. Deploys
here run `flask db upgrade`, and a data migration that trips over real
production data takes the whole release down with it — so they live here, where
a failure costs you a retry rather than an outage.

Every task is idempotent. Run them as often as you like; a second run reports
nothing left to do.

    python scripts/repair_data.py status     read-only — what would change
    python scripts/repair_data.py dry-run    run everything, then roll back
    python scripts/repair_data.py apply      run everything and commit

Options:
    --only TASK       one task by name (repeatable). Names from `status`.
    --database URL    connection to use. Defaults to DATABASE_URL / backend/.env.

Tasks:
    student-subjects     Attach learners to the subjects they already hold marks
                         for. Trainer rosters and every count built on them —
                         the dashboard "Total Students" tile, My Students, the
                         subject class lists — read `student_subjects`, but
                         uploading marks used to write only the score. Learners
                         marked before that was fixed are missing from the
                         rosters they belong to.

    report-institution   Stop practical assessment reports defaulting to a
                         hardcoded school. Drops the baked-in column defaults and
                         clears the sample values still stored, so the report
                         falls back to the institution on record for the
                         candidate or assessor.
"""

from __future__ import annotations

import argparse
import sys
import uuid
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.config import Config  # noqa: E402  (needs the path set above)


LEGACY_INSTITUTION_NAME = "Thika Technical Training Institute"


# ── Output ───────────────────────────────────────────────────────────────────

def info(message: str) -> None:
    # Flushed so the running order survives being piped into a deploy log,
    # where stdout is block-buffered but stderr is not.
    print(f"\033[36m==>\033[0m {message}", flush=True)


def warn(message: str) -> None:
    print(f"\033[33mwarn:\033[0m {message}", file=sys.stderr, flush=True)


def die(message: str) -> None:
    print(f"\033[31merror:\033[0m {message}", file=sys.stderr, flush=True)
    raise SystemExit(1)


def table_exists(connection: Connection, table: str) -> bool:
    return bool(
        connection.execute(
            text(
                """
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.tables
                    WHERE table_schema = current_schema() AND table_name = :table
                )
                """
            ),
            {"table": table},
        ).scalar()
    )


# ── Task: student-subjects ───────────────────────────────────────────────────

def _orphaned_subject_marks(connection: Connection) -> list[tuple]:
    """
    (student_id, subject_id, learner, subject) for every learner holding a mark
    in a subject they are not attached to.
    """
    return list(
        connection.execute(
            text(
                """
                SELECT DISTINCT
                    sc.student_id,
                    sc.subject_id,
                    coalesce(u.name, st.registration_number, 'Unnamed learner') AS learner,
                    sub.name AS subject
                FROM scores AS sc
                JOIN students AS st ON st.id = sc.student_id AND st.deleted_at IS NULL
                JOIN subjects AS sub ON sub.id = sc.subject_id AND sub.deleted_at IS NULL
                LEFT JOIN users AS u ON u.id = st.user_id
                WHERE sc.student_id IS NOT NULL
                  AND sc.subject_id IS NOT NULL
                  AND sc.deleted_at IS NULL
                  AND NOT EXISTS (
                      SELECT 1 FROM student_subjects AS ss
                      WHERE ss.student_id = sc.student_id
                        AND ss.subject_id = sc.subject_id
                  )
                ORDER BY subject, learner
                """
            )
        )
    )


def status_student_subjects(connection: Connection) -> int:
    for table in ("scores", "student_subjects", "subjects", "students"):
        if not table_exists(connection, table):
            warn(f"table '{table}' does not exist — skipping student-subjects")
            return 0

    rows = _orphaned_subject_marks(connection)
    if not rows:
        info("student-subjects: nothing to do — every marked learner is on the subject")
        return 0

    info(f"student-subjects: {len(rows)} learner/subject link(s) missing")
    for _, _, learner, subject in rows[:20]:
        print(f"    {subject} — {learner}")
    if len(rows) > 20:
        print(f"    … and {len(rows) - 20} more")
    return len(rows)


def apply_student_subjects(connection: Connection) -> int:
    for table in ("scores", "student_subjects", "subjects", "students"):
        if not table_exists(connection, table):
            warn(f"table '{table}' does not exist — skipping student-subjects")
            return 0

    rows = _orphaned_subject_marks(connection)
    if not rows:
        info("student-subjects: already attached, nothing written")
        return 0

    # UUIDs are generated here rather than by gen_random_uuid() so the script
    # does not depend on the server's Postgres version or pgcrypto being
    # installed. ON CONFLICT covers a concurrent writer getting there first.
    connection.execute(
        text(
            """
            INSERT INTO student_subjects (id, student_id, subject_id, created_at, updated_at)
            VALUES (:id, :student_id, :subject_id, now(), now())
            ON CONFLICT DO NOTHING
            """
        ),
        [
            {
                "id": uuid.uuid4(),
                "student_id": student_id,
                "subject_id": subject_id,
            }
            for student_id, subject_id, _, _ in rows
        ],
    )
    info(f"student-subjects: attached {len(rows)} learner(s) to their subject")
    return len(rows)


# ── Task: report-institution ─────────────────────────────────────────────────

def _column_default(connection: Connection, column: str) -> str | None:
    return connection.execute(
        text(
            """
            SELECT column_default
            FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'practical_assessment_reports'
              AND column_name = :column
            """
        ),
        {"column": column},
    ).scalar()


def _legacy_value_count(connection: Connection, column: str) -> int:
    return connection.execute(
        text(
            f"""
            SELECT count(*) FROM practical_assessment_reports
            WHERE {column} = :legacy
            """
        ),
        {"legacy": LEGACY_INSTITUTION_NAME},
    ).scalar() or 0


def status_report_institution(connection: Connection) -> int:
    if not table_exists(connection, "practical_assessment_reports"):
        warn("table 'practical_assessment_reports' does not exist — skipping report-institution")
        return 0

    pending = 0
    for column in ("institution_name", "awarding_body"):
        default = _column_default(connection, column)
        if default and LEGACY_INSTITUTION_NAME in default:
            info(f"report-institution: {column} still defaults to '{LEGACY_INSTITUTION_NAME}'")
            pending += 1
        stored = _legacy_value_count(connection, column)
        if stored:
            info(f"report-institution: {stored} report(s) store the sample value in {column}")
            pending += stored

    if not pending:
        info("report-institution: nothing to do — no hardcoded school left")
    return pending


def apply_report_institution(connection: Connection) -> int:
    if not table_exists(connection, "practical_assessment_reports"):
        warn("table 'practical_assessment_reports' does not exist — skipping report-institution")
        return 0

    changed = 0
    for column in ("institution_name", "awarding_body"):
        default = _column_default(connection, column)
        if default and LEGACY_INSTITUTION_NAME in default:
            connection.execute(
                text(
                    f"ALTER TABLE practical_assessment_reports "
                    f"ALTER COLUMN {column} SET DEFAULT ''"
                )
            )
            info(f"report-institution: cleared the hardcoded default on {column}")
            changed += 1

        result = connection.execute(
            text(
                f"""
                UPDATE practical_assessment_reports SET {column} = ''
                WHERE {column} = :legacy
                """
            ),
            {"legacy": LEGACY_INSTITUTION_NAME},
        )
        if result.rowcount:
            info(f"report-institution: cleared {result.rowcount} stored value(s) in {column}")
            changed += result.rowcount

    if not changed:
        info("report-institution: already clean, nothing written")
    return changed


# ── Runner ───────────────────────────────────────────────────────────────────

TASKS = {
    "student-subjects": (status_student_subjects, apply_student_subjects),
    "report-institution": (status_report_institution, apply_report_institution),
}


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("action", choices=["status", "dry-run", "apply"])
    parser.add_argument(
        "--only",
        action="append",
        choices=sorted(TASKS),
        help="run one task instead of all of them (repeatable)",
    )
    parser.add_argument(
        "--database",
        help="connection URL (defaults to DATABASE_URL, then backend/.env)",
    )
    args = parser.parse_args()

    url = args.database or Config.SQLALCHEMY_DATABASE_URI
    if not url:
        die("no database URL — set DATABASE_URL or pass --database")

    # Never print the password back at the operator.
    display = url.split("@")[-1] if "@" in url else url
    info(f"database: {display}")

    selected = args.only or sorted(TASKS)

    try:
        engine = create_engine(url)
        connection = engine.connect()
    except Exception as exc:  # noqa: BLE001 — the reason is what the operator needs
        die(f"cannot connect: {exc}")

    with connection:
        transaction = connection.begin()
        try:
            if args.action == "status":
                pending = sum(TASKS[name][0](connection) for name in selected)
                transaction.rollback()
                if pending:
                    info(f"{pending} change(s) pending — run: {Path(__file__).name} apply")
                return 0

            total = sum(TASKS[name][1](connection) for name in selected)

            if args.action == "dry-run":
                transaction.rollback()
                info(f"dry run: {total} change(s) rolled back, nothing was written")
                return 0

            transaction.commit()
            info(f"applied: {total} change(s) committed")
            return 0
        except Exception as exc:  # noqa: BLE001
            transaction.rollback()
            die(f"rolled back, nothing was written: {exc}")
            return 1


if __name__ == "__main__":
    raise SystemExit(main())
