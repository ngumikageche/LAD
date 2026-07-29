"""complete documented audit workflows

Revision ID: 20260729_audit
Revises: 5d6e7f8a9b0c
Create Date: 2026-07-29 10:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260729_audit"
down_revision = "5d6e7f8a9b0c"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("student_reports", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "attachments",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'[]'::jsonb"),
            )
        )
    with op.batch_alter_table("student_reports", schema=None) as batch_op:
        batch_op.alter_column("attachments", server_default=None)
    with op.batch_alter_table("subjects", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("syllabus_topics", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb"))
        )
    with op.batch_alter_table("assessments", schema=None) as batch_op:
        batch_op.add_column(sa.Column("assessment_scope", sa.String(length=32), nullable=False, server_default="formative"))
    with op.batch_alter_table("online_exams", schema=None) as batch_op:
        batch_op.add_column(sa.Column("available_from", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("available_until", sa.DateTime(), nullable=True))
        batch_op.add_column(
            sa.Column("resource_document_ids", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb"))
        )
    with op.batch_alter_table("online_exam_submissions", schema=None) as batch_op:
        batch_op.add_column(sa.Column("started_at", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("graded_at", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("graded_by", postgresql.UUID(as_uuid=True), nullable=True))
        batch_op.add_column(sa.Column("grader_feedback", sa.Text(), nullable=True))
        batch_op.create_foreign_key("fk_exam_submission_graded_by", "users", ["graded_by"], ["id"])


def downgrade():
    with op.batch_alter_table("online_exam_submissions", schema=None) as batch_op:
        batch_op.drop_constraint("fk_exam_submission_graded_by", type_="foreignkey")
        batch_op.drop_column("grader_feedback")
        batch_op.drop_column("graded_by")
        batch_op.drop_column("graded_at")
        batch_op.drop_column("started_at")
    with op.batch_alter_table("online_exams", schema=None) as batch_op:
        batch_op.drop_column("resource_document_ids")
        batch_op.drop_column("available_until")
        batch_op.drop_column("available_from")
    with op.batch_alter_table("assessments", schema=None) as batch_op:
        batch_op.drop_column("assessment_scope")
    with op.batch_alter_table("subjects", schema=None) as batch_op:
        batch_op.drop_column("syllabus_topics")
    with op.batch_alter_table("student_reports", schema=None) as batch_op:
        batch_op.drop_column("attachments")
