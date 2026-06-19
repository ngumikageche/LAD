"""add dynamic practical assessment content

Revision ID: b1c2d3e4f5a6
Revises: a1b2c3d4e5f6
Create Date: 2026-06-19 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
import sqlalchemy.dialects.postgresql as psql


revision = "b1c2d3e4f5a6"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("practical_assessment_reports", sa.Column("assessment_venue", sa.String(length=255), nullable=True))
    op.add_column("practical_assessment_reports", sa.Column("practical_brief", sa.Text(), nullable=True))
    op.add_column("practical_assessment_reports", sa.Column("general_remarks", sa.Text(), nullable=True))
    op.add_column(
        "practical_assessment_reports",
        sa.Column("task_items", psql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
    )
    op.add_column(
        "practical_assessment_reports",
        sa.Column("oral_questions", psql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
    )


def downgrade():
    op.drop_column("practical_assessment_reports", "oral_questions")
    op.drop_column("practical_assessment_reports", "task_items")
    op.drop_column("practical_assessment_reports", "general_remarks")
    op.drop_column("practical_assessment_reports", "practical_brief")
    op.drop_column("practical_assessment_reports", "assessment_venue")
