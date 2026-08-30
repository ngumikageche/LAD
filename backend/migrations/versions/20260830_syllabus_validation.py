"""learner validation of trainer-reported syllabus coverage

Syllabus coverage was entered only by the trainer who taught it, which made it
a self-assessment with nothing to check it against. This table records the
class's own answer per topic so a report can put reported coverage beside
recognised coverage and flag the gap.

Revision ID: 20260830_syllabus_validation
Revises: 20260729_audit
Create Date: 2026-08-30 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260830_syllabus_validation"
down_revision = "20260729_audit"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "syllabus_validations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("lesson_plan_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("student_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("was_covered", sa.Boolean(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["lesson_plan_id"], ["lesson_plans.id"]),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "lesson_plan_id", "student_id", name="uq_syllabus_validation_plan_student"
        ),
    )
    op.create_index(
        "ix_syllabus_validations_lesson_plan_id", "syllabus_validations", ["lesson_plan_id"]
    )
    op.create_index(
        "ix_syllabus_validations_student_id", "syllabus_validations", ["student_id"]
    )


def downgrade():
    op.drop_index("ix_syllabus_validations_student_id", table_name="syllabus_validations")
    op.drop_index("ix_syllabus_validations_lesson_plan_id", table_name="syllabus_validations")
    op.drop_table("syllabus_validations")
