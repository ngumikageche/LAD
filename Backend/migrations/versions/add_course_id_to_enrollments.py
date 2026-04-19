"""
Add course_id foreign key to enrollments table

Revision ID: add_course_id_to_enrollments
Revises: abcc6606e5c5
Create Date: 2026-04-19
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'add_course_id_to_enrollments'
down_revision = 'abcc6606e5c5'
branch_labels = None
depends_on = None

def upgrade():
    with op.batch_alter_table('enrollments', schema=None) as batch_op:
        batch_op.add_column(sa.Column('course_id', sa.UUID(), nullable=True))
        batch_op.create_foreign_key('fk_enrollments_course_id_courses', 'courses', ['course_id'], ['id'])

    # Optionally, populate course_id for existing enrollments if possible
    # op.execute("UPDATE enrollments SET course_id = ... WHERE ...")

def downgrade():
    with op.batch_alter_table('enrollments', schema=None) as batch_op:
        batch_op.drop_constraint('fk_enrollments_course_id_courses', type_='foreignkey')
        batch_op.drop_column('course_id')
