"""add trainer score fields

Revision ID: 3d9c2f4b7a11
Revises: 7abf317afe03
Create Date: 2026-04-26 14:30:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = '3d9c2f4b7a11'
down_revision = '7abf317afe03'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('scores', schema=None) as batch_op:
        batch_op.add_column(sa.Column('student_id', sa.UUID(), nullable=True))
        batch_op.add_column(sa.Column('subject_id', sa.UUID(), nullable=True))
        batch_op.add_column(sa.Column('trainer_id', sa.UUID(), nullable=True))
        batch_op.add_column(sa.Column('term', sa.String(length=64), nullable=True))
        batch_op.alter_column('feedback', existing_type=sa.String(length=1000), type_=sa.Text(), existing_nullable=True)
        batch_op.create_index(batch_op.f('ix_scores_student_id'), ['student_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_scores_subject_id'), ['subject_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_scores_trainer_id'), ['trainer_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_scores_term'), ['term'], unique=False)
        batch_op.create_foreign_key('fk_scores_student_id_students', 'students', ['student_id'], ['id'])
        batch_op.create_foreign_key('fk_scores_subject_id_subjects', 'subjects', ['subject_id'], ['id'])
        batch_op.create_foreign_key('fk_scores_trainer_id_trainers', 'trainers', ['trainer_id'], ['id'])

    op.create_index('ix_scores_student_subject_term', 'scores', ['student_id', 'subject_id', 'term'], unique=False)
    op.create_unique_constraint('uq_scores_student_subject_term', 'scores', ['student_id', 'subject_id', 'term'])


def downgrade():
    op.drop_constraint('uq_scores_student_subject_term', 'scores', type_='unique')
    op.drop_index('ix_scores_student_subject_term', table_name='scores')

    with op.batch_alter_table('scores', schema=None) as batch_op:
        batch_op.drop_constraint('fk_scores_trainer_id_trainers', type_='foreignkey')
        batch_op.drop_constraint('fk_scores_subject_id_subjects', type_='foreignkey')
        batch_op.drop_constraint('fk_scores_student_id_students', type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_scores_term'))
        batch_op.drop_index(batch_op.f('ix_scores_trainer_id'))
        batch_op.drop_index(batch_op.f('ix_scores_subject_id'))
        batch_op.drop_index(batch_op.f('ix_scores_student_id'))
        batch_op.alter_column('feedback', existing_type=sa.Text(), type_=sa.String(length=1000), existing_nullable=True)
        batch_op.drop_column('term')
        batch_op.drop_column('trainer_id')
        batch_op.drop_column('subject_id')
        batch_op.drop_column('student_id')
