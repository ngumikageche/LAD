"""add media attachments to practical assessments

Revision ID: 4c5d6e7f8a9b
Revises: e3f4a5b6c7d8
Create Date: 2026-06-29 10:30:00.000000
"""

from alembic import op
import sqlalchemy as sa
import sqlalchemy.dialects.postgresql as psql


revision = "4c5d6e7f8a9b"
down_revision = "e3f4a5b6c7d8"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "practical_assessment_reports",
        sa.Column("media_attachments", psql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
    )


def downgrade():
    op.drop_column("practical_assessment_reports", "media_attachments")
