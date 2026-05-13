"""add subject_id to documents

Revision ID: b4e2f3a1c9d7
Revises: a3f1d2e4b5c6
Create Date: 2025-01-01 00:00:01.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'b4e2f3a1c9d7'
down_revision = 'a3f1d2e4b5c6'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'documents',
        sa.Column('subject_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('subjects.id'), nullable=True)
    )
    op.create_index('idx_documents_subject', 'documents', ['subject_id'])


def downgrade():
    op.drop_index('idx_documents_subject', table_name='documents')
    op.drop_column('documents', 'subject_id')
