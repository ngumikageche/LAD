"""add subject_id to attendance_sessions

Revision ID: a3f1d2e4b5c6
Revises: 303e5e331d7e
Create Date: 2025-01-01 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'a3f1d2e4b5c6'
down_revision = '303e5e331d7e'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'attendance_sessions',
        sa.Column('subject_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('subjects.id'), nullable=True, index=True)
    )
    op.create_index('idx_attendance_sessions_subject', 'attendance_sessions', ['subject_id'])


def downgrade():
    op.drop_index('idx_attendance_sessions_subject', table_name='attendance_sessions')
    op.drop_column('attendance_sessions', 'subject_id')
