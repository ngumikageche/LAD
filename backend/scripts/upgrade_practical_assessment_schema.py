from __future__ import annotations

import sys
from pathlib import Path

from sqlalchemy import create_engine, text

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.config import Config


REQUIRED_COLUMNS: list[tuple[str, str]] = [
    ("task_1_description", "TEXT"),
    ("task_2_description", "TEXT"),
    ("task_3_description", "TEXT"),
    ("task_4_description", "TEXT"),
    ("assessment_venue", "VARCHAR(255)"),
    ("practical_brief", "TEXT"),
    ("general_remarks", "TEXT"),
    ("task_items", "JSONB NOT NULL DEFAULT '[]'::jsonb"),
    ("oral_questions", "JSONB NOT NULL DEFAULT '[]'::jsonb"),
    ("report_sections", "JSONB NOT NULL DEFAULT '[]'::jsonb"),
]


def main() -> int:
    engine = create_engine(Config.SQLALCHEMY_DATABASE_URI)

    with engine.begin() as connection:
        table_exists = connection.execute(
            text(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM information_schema.tables
                    WHERE table_schema = current_schema()
                      AND table_name = 'practical_assessment_reports'
                )
                """
            )
        ).scalar()

        if not table_exists:
            print("Table 'practical_assessment_reports' does not exist in the current database.")
            return 1

        existing_columns = {
            row[0]
            for row in connection.execute(
                text(
                    """
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_schema = current_schema()
                      AND table_name = 'practical_assessment_reports'
                    """
                )
            )
        }

        missing_columns = [
            (name, definition)
            for name, definition in REQUIRED_COLUMNS
            if name not in existing_columns
        ]

        if not missing_columns:
            print("Practical assessment schema is already up to date.")
            return 0

        alter_sql = "ALTER TABLE practical_assessment_reports\n" + ",\n".join(
            f"ADD COLUMN IF NOT EXISTS {name} {definition}"
            for name, definition in missing_columns
        )
        connection.execute(text(alter_sql))

        print("Added missing columns to practical_assessment_reports:")
        for name, _ in missing_columns:
            print(f"- {name}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
