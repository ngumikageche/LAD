"""add practical assessment reports

Revision ID: f1a2b3c4d5e6
Revises: a8c2e9f4b6d1
Create Date: 2026-06-18 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
import sqlalchemy.dialects.postgresql as psql
from sqlalchemy.sql import func


revision = "f1a2b3c4d5e6"
down_revision = "a8c2e9f4b6d1"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "practical_assessment_reports",
        sa.Column("id", psql.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(), server_default=func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.Column("student_id", psql.UUID(as_uuid=True), sa.ForeignKey("students.id"), nullable=False),
        sa.Column("trainer_id", psql.UUID(as_uuid=True), sa.ForeignKey("trainers.id"), nullable=False),
        sa.Column("institution_name", sa.String(length=255), nullable=False, server_default="Thika Technical Training Institute"),
        sa.Column("department_name", sa.String(length=255), nullable=False, server_default="Electrical and Electronics Engineering Department"),
        sa.Column("awarding_body", sa.String(length=255), nullable=False, server_default="TVET Curriculum Development, Assessment and Certification Council (TVET CDACC)"),
        sa.Column("qualification", sa.String(length=255), nullable=False, server_default="Electrical Engineering Level 6"),
        sa.Column("unit_of_competency", sa.String(length=255), nullable=False, server_default="Install Electrical Power Lines"),
        sa.Column("unit_code", sa.String(length=64), nullable=False, server_default="ENG/OS/PO/CR/01/6"),
        sa.Column("period", sa.String(length=64), nullable=False, server_default="January - April 2025"),
        sa.Column("assessment_date", sa.DateTime(), nullable=True),
        sa.Column("task_1_score", sa.Float(), nullable=True),
        sa.Column("task_2_score", sa.Float(), nullable=True),
        sa.Column("task_3_score", sa.Float(), nullable=True),
        sa.Column("task_4_score", sa.Float(), nullable=True),
        sa.Column("task_1_remark", sa.Text(), nullable=True),
        sa.Column("task_2_remark", sa.Text(), nullable=True),
        sa.Column("task_3_remark", sa.Text(), nullable=True),
        sa.Column("task_4_remark", sa.Text(), nullable=True),
        sa.Column("total_score", sa.Float(), nullable=True),
        sa.Column("competency_outcome", sa.String(length=32), nullable=True),
        sa.Column("released_at", sa.DateTime(), nullable=True),
        sa.Column("released_by_user_id", psql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="draft"),
    )
    op.create_index(
        op.f("ix_practical_assessment_reports_student_id"),
        "practical_assessment_reports",
        ["student_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_practical_assessment_reports_trainer_id"),
        "practical_assessment_reports",
        ["trainer_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_practical_assessment_reports_released_by_user_id"),
        "practical_assessment_reports",
        ["released_by_user_id"],
        unique=False,
    )


def downgrade():
    op.drop_index(op.f("ix_practical_assessment_reports_released_by_user_id"), table_name="practical_assessment_reports")
    op.drop_index(op.f("ix_practical_assessment_reports_trainer_id"), table_name="practical_assessment_reports")
    op.drop_index(op.f("ix_practical_assessment_reports_student_id"), table_name="practical_assessment_reports")
    op.drop_table("practical_assessment_reports")
