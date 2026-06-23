"""add company name to practical assessments

Revision ID: e3f4a5b6c7d8
Revises: 201f2cca75f3
Create Date: 2026-06-19 00:20:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "e3f4a5b6c7d8"
down_revision = "201f2cca75f3"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("practical_assessment_reports", sa.Column("company_name", sa.String(length=255), nullable=True))


def downgrade():
    op.drop_column("practical_assessment_reports", "company_name")
