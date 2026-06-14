"""add score evidence

Revision ID: d6e7f8a9b0c1
Revises: c4a8d1f5b6e2
Create Date: 2026-06-14 16:45:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "d6e7f8a9b0c1"
down_revision = "c4a8d1f5b6e2"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "score_evidence",
        sa.Column("score_id", sa.UUID(), nullable=True),
        sa.Column("batch_id", sa.String(length=64), nullable=True),
        sa.Column("assessment_id", sa.UUID(), nullable=True),
        sa.Column("subject_id", sa.UUID(), nullable=True),
        sa.Column("trainer_id", sa.UUID(), nullable=True),
        sa.Column("uploaded_by", sa.UUID(), nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("file_url", sa.String(length=1000), nullable=False),
        sa.Column("file_type", sa.String(length=32), nullable=True),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["assessment_id"], ["assessments.id"]),
        sa.ForeignKeyConstraint(["score_id"], ["scores.id"]),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"]),
        sa.ForeignKeyConstraint(["trainer_id"], ["trainers.id"]),
        sa.ForeignKeyConstraint(["uploaded_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("score_evidence", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_score_evidence_assessment_id"), ["assessment_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_score_evidence_batch_id"), ["batch_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_score_evidence_score_id"), ["score_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_score_evidence_subject_id"), ["subject_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_score_evidence_trainer_id"), ["trainer_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_score_evidence_uploaded_by"), ["uploaded_by"], unique=False)


def downgrade():
    with op.batch_alter_table("score_evidence", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_score_evidence_uploaded_by"))
        batch_op.drop_index(batch_op.f("ix_score_evidence_trainer_id"))
        batch_op.drop_index(batch_op.f("ix_score_evidence_subject_id"))
        batch_op.drop_index(batch_op.f("ix_score_evidence_score_id"))
        batch_op.drop_index(batch_op.f("ix_score_evidence_batch_id"))
        batch_op.drop_index(batch_op.f("ix_score_evidence_assessment_id"))
    op.drop_table("score_evidence")
