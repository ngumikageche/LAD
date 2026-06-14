"""add student reports

Revision ID: 9b7c4d2e1a90
Revises: 7979f9f41ee0
Create Date: 2026-06-14 15:55:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "9b7c4d2e1a90"
down_revision = "7979f9f41ee0"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "student_reports",
        sa.Column("student_id", sa.UUID(), nullable=False),
        sa.Column("trainer_id", sa.UUID(), nullable=False),
        sa.Column("subject_id", sa.UUID(), nullable=True),
        sa.Column("report_type", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("visibility", sa.String(length=32), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"]),
        sa.ForeignKeyConstraint(["trainer_id"], ["trainers.id"]),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("student_reports", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_student_reports_student_id"), ["student_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_student_reports_trainer_id"), ["trainer_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_student_reports_subject_id"), ["subject_id"], unique=False)


def downgrade():
    with op.batch_alter_table("student_reports", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_student_reports_subject_id"))
        batch_op.drop_index(batch_op.f("ix_student_reports_trainer_id"))
        batch_op.drop_index(batch_op.f("ix_student_reports_student_id"))
    op.drop_table("student_reports")
