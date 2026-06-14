"""add student report authors

Revision ID: c4a8d1f5b6e2
Revises: 9b7c4d2e1a90
Create Date: 2026-06-14 16:20:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "c4a8d1f5b6e2"
down_revision = "9b7c4d2e1a90"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("student_reports", schema=None) as batch_op:
        batch_op.add_column(sa.Column("author_user_id", sa.UUID(), nullable=True))
        batch_op.alter_column("trainer_id", existing_type=sa.UUID(), nullable=True)
        batch_op.create_foreign_key(
            batch_op.f("fk_student_reports_author_user_id_users"),
            "users",
            ["author_user_id"],
            ["id"],
        )
        batch_op.create_index(batch_op.f("ix_student_reports_author_user_id"), ["author_user_id"], unique=False)

    op.execute(
        """
        UPDATE student_reports
        SET author_user_id = trainers.user_id
        FROM trainers
        WHERE student_reports.trainer_id = trainers.id
          AND student_reports.author_user_id IS NULL
        """
    )

    with op.batch_alter_table("student_reports", schema=None) as batch_op:
        batch_op.alter_column("author_user_id", existing_type=sa.UUID(), nullable=False)


def downgrade():
    with op.batch_alter_table("student_reports", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_student_reports_author_user_id"))
        batch_op.drop_constraint(batch_op.f("fk_student_reports_author_user_id_users"), type_="foreignkey")
        batch_op.alter_column("trainer_id", existing_type=sa.UUID(), nullable=False)
        batch_op.drop_column("author_user_id")
