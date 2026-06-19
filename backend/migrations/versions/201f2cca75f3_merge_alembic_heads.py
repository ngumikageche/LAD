"""merge alembic heads

Revision ID: 201f2cca75f3
Revises: c2d3e4f5a6b7, d9e8f7a6b5c4
Create Date: 2026-06-19 11:20:03.570149

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '201f2cca75f3'
down_revision = ('c2d3e4f5a6b7', 'd9e8f7a6b5c4')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
