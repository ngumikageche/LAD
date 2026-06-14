"""add online exams

Revision ID: e7f8a9b0c1d2
Revises: d6e7f8a9b0c1
Create Date: 2026-06-14 17:10:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "e7f8a9b0c1d2"
down_revision = "d6e7f8a9b0c1"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "online_exams",
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("subject_id", sa.UUID(), nullable=False),
        sa.Column("trainer_id", sa.UUID(), nullable=True),
        sa.Column("created_by", sa.UUID(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=True),
        sa.Column("total_marks", sa.Float(), nullable=False),
        sa.Column("questions", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("published_at", sa.DateTime(), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"]),
        sa.ForeignKeyConstraint(["trainer_id"], ["trainers.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "online_exam_submissions",
        sa.Column("exam_id", sa.UUID(), nullable=False),
        sa.Column("student_id", sa.UUID(), nullable=False),
        sa.Column("answers", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("score", sa.Float(), nullable=True),
        sa.Column("max_score", sa.Float(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("submitted_at", sa.DateTime(), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["exam_id"], ["online_exams.id"]),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("exam_id", "student_id", name="uq_online_exam_student_submission"),
    )
    with op.batch_alter_table("online_exams", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_online_exams_created_by"), ["created_by"], unique=False)
        batch_op.create_index(batch_op.f("ix_online_exams_status"), ["status"], unique=False)
        batch_op.create_index(batch_op.f("ix_online_exams_subject_id"), ["subject_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_online_exams_trainer_id"), ["trainer_id"], unique=False)
    with op.batch_alter_table("online_exam_submissions", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_online_exam_submissions_exam_id"), ["exam_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_online_exam_submissions_student_id"), ["student_id"], unique=False)


def downgrade():
    with op.batch_alter_table("online_exam_submissions", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_online_exam_submissions_student_id"))
        batch_op.drop_index(batch_op.f("ix_online_exam_submissions_exam_id"))
    with op.batch_alter_table("online_exams", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_online_exams_trainer_id"))
        batch_op.drop_index(batch_op.f("ix_online_exams_subject_id"))
        batch_op.drop_index(batch_op.f("ix_online_exams_status"))
        batch_op.drop_index(batch_op.f("ix_online_exams_created_by"))
    op.drop_table("online_exam_submissions")
    op.drop_table("online_exams")
