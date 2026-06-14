"""add auto marking to online exams

Revision ID: a8c2e9f4b6d1
Revises: e7f8a9b0c1d2
Create Date: 2026-06-14 19:20:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "a8c2e9f4b6d1"
down_revision = "e7f8a9b0c1d2"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("online_exams", schema=None) as batch_op:
        batch_op.add_column(sa.Column("auto_marking", sa.Boolean(), nullable=False, server_default=sa.true()))
    with op.batch_alter_table("online_exams", schema=None) as batch_op:
        batch_op.alter_column("auto_marking", server_default=None)


def downgrade():
    with op.batch_alter_table("online_exams", schema=None) as batch_op:
        batch_op.drop_column("auto_marking")
