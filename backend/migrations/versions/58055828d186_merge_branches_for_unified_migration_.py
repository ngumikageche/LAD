"""merge branches for unified migration head

Revision ID: 58055828d186
Revises: 20260410_add_extra_tables, 43f4a3ba12b2
Create Date: 2026-04-10 22:40:05.275377

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '58055828d186'
down_revision = ('20260410_add_extra_tables', '43f4a3ba12b2')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
