"""add practical assessment report sections

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
Create Date: 2026-06-19 00:10:00.000000
"""

from alembic import op
import sqlalchemy as sa
import sqlalchemy.dialects.postgresql as psql


revision = "c2d3e4f5a6b7"
down_revision = "b1c2d3e4f5a6"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "practical_assessment_reports",
        sa.Column("report_sections", psql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
    )


def downgrade():
    op.drop_column("practical_assessment_reports", "report_sections")
