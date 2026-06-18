"""add practical assessment task descriptions

Revision ID: a1b2c3d4e5f6
Revises: f1a2b3c4d5e6
Create Date: 2026-06-18 00:00:01.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "a1b2c3d4e5f6"
down_revision = "f1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("practical_assessment_reports", sa.Column("task_1_description", sa.Text(), nullable=True))
    op.add_column("practical_assessment_reports", sa.Column("task_2_description", sa.Text(), nullable=True))
    op.add_column("practical_assessment_reports", sa.Column("task_3_description", sa.Text(), nullable=True))
    op.add_column("practical_assessment_reports", sa.Column("task_4_description", sa.Text(), nullable=True))


def downgrade():
    op.drop_column("practical_assessment_reports", "task_4_description")
    op.drop_column("practical_assessment_reports", "task_3_description")
    op.drop_column("practical_assessment_reports", "task_2_description")
    op.drop_column("practical_assessment_reports", "task_1_description")
