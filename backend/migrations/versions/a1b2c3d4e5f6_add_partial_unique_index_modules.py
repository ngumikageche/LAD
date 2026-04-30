"""
Add partial unique index for modules (name, course_id) where deleted_at IS NULL
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = '58055828d186'
branch_labels = None
depends_on = None

def upgrade():
    op.create_index(
        'uq_modules_name_course_id_not_deleted',
        'modules',
        ['name', 'course_id'],
        unique=True,
        postgresql_where=sa.text('deleted_at IS NULL')
    )

def downgrade():
    op.drop_index('uq_modules_name_course_id_not_deleted', table_name='modules')
