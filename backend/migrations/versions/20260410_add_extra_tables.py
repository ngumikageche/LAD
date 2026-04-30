"""
Alembic migration for new/updated tables and relationships.
"""
# revision identifiers, used by Alembic.
revision = '20260410_add_extra_tables'
down_revision = None  # Set to previous revision id if needed
branch_labels = None
depends_on = None
from alembic import op
import sqlalchemy as sa
import sqlalchemy.dialects.postgresql as psql
from sqlalchemy.sql import func

def upgrade():
    # --- Modules ---
    op.create_table(
        'modules',
        sa.Column('id', psql.UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(), server_default=func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('course_id', psql.UUID(as_uuid=True), sa.ForeignKey('courses.id'), nullable=False, index=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.String(1000)),
    )
    # --- Competencies ---
    op.create_table(
        'competencies',
        sa.Column('id', psql.UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(), server_default=func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('module_id', psql.UUID(as_uuid=True), sa.ForeignKey('modules.id'), nullable=False, index=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.String(1000)),
        sa.Column('expected_outcome', sa.String(1000)),
        sa.Column('mastery_threshold', sa.Float(), nullable=False, server_default='100'),
    )
    # --- Enrollments ---
    op.create_table(
        'enrollments',
        sa.Column('id', psql.UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(), server_default=func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('student_id', psql.UUID(as_uuid=True), sa.ForeignKey('students.id'), nullable=False, index=True),
        sa.Column('module_id', psql.UUID(as_uuid=True), sa.ForeignKey('modules.id'), nullable=False, index=True),
        sa.Column('status', sa.String(32), nullable=False, server_default='active'),
    )
    # --- Assessments ---
    op.create_table(
        'assessments',
        sa.Column('id', psql.UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(), server_default=func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('student_id', psql.UUID(as_uuid=True), sa.ForeignKey('students.id'), nullable=False, index=True),
        sa.Column('trainer_id', psql.UUID(as_uuid=True), sa.ForeignKey('trainers.id'), nullable=False, index=True),
        sa.Column('module_id', psql.UUID(as_uuid=True), sa.ForeignKey('modules.id'), nullable=False, index=True),
        sa.Column('competency_id', psql.UUID(as_uuid=True), sa.ForeignKey('competencies.id'), nullable=False, index=True),
        sa.Column('score', sa.Float(), nullable=False),
        sa.Column('status', sa.String(32), nullable=False),
        sa.Column('recorded_at', sa.DateTime(), nullable=False, server_default=func.now()),
        sa.Column('source', sa.String(32), nullable=False),
    )
    # --- Competency Records ---
    op.create_table(
        'competency_records',
        sa.Column('id', psql.UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(), server_default=func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('student_id', psql.UUID(as_uuid=True), sa.ForeignKey('students.id'), nullable=False, index=True),
        sa.Column('competency_id', psql.UUID(as_uuid=True), sa.ForeignKey('competencies.id'), nullable=False, index=True),
        sa.Column('mastery_level', sa.Float(), nullable=False),
        sa.Column('status', sa.String(16), nullable=False),
        sa.Column('last_updated', sa.DateTime(), nullable=False, server_default=func.now()),
    )
    # --- Attendance ---
    op.create_table(
        'attendance',
        sa.Column('id', psql.UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(), server_default=func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('student_id', psql.UUID(as_uuid=True), sa.ForeignKey('students.id'), nullable=False, index=True),
        sa.Column('module_id', psql.UUID(as_uuid=True), sa.ForeignKey('modules.id'), nullable=False, index=True),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('status', sa.String(16), nullable=False),
    )
    # --- Portfolio Evidence ---
    op.create_table(
        'portfolio_evidence',
        sa.Column('id', psql.UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(), server_default=func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('student_id', psql.UUID(as_uuid=True), sa.ForeignKey('students.id'), nullable=False, index=True),
        sa.Column('competency_id', psql.UUID(as_uuid=True), sa.ForeignKey('competencies.id'), nullable=False, index=True),
        sa.Column('file_url', sa.String(1000), nullable=False),
        sa.Column('uploaded_at', sa.DateTime(), nullable=False, server_default=func.now()),
        sa.Column('verified_by', psql.UUID(as_uuid=True), sa.ForeignKey('trainers.id'), nullable=True),
    )
    # --- Alerts ---
    op.create_table(
        'alerts',
        sa.Column('id', psql.UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(), server_default=func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('student_id', psql.UUID(as_uuid=True), sa.ForeignKey('students.id'), nullable=False, index=True),
        sa.Column('competency_id', psql.UUID(as_uuid=True), sa.ForeignKey('competencies.id'), nullable=False, index=True),
        sa.Column('alert_type', sa.String(32), nullable=False),
        sa.Column('message', sa.String(1000), nullable=False),
        sa.Column('triggered_at', sa.DateTime(), nullable=False, server_default=func.now()),
        sa.Column('resolved', sa.Boolean(), nullable=False, server_default=sa.text('false')),
    )
    # --- Dashboard Metrics ---
    op.create_table(
        'dashboard_metrics',
        sa.Column('id', psql.UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(), server_default=func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('module_id', psql.UUID(as_uuid=True), sa.ForeignKey('modules.id'), nullable=False, index=True),
        sa.Column('average_score', sa.Float(), nullable=False),
        sa.Column('mastery_rate', sa.Float(), nullable=False),
        sa.Column('at_risk_count', sa.Integer(), nullable=False),
        sa.Column('last_updated', sa.DateTime(), nullable=False, server_default=func.now()),
    )
    # --- Surveys ---
    op.create_table(
        'surveys',
        sa.Column('id', psql.UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(), server_default=func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('user_id', psql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False, index=True),
        sa.Column('role', sa.String(32), nullable=False),
        sa.Column('perceived_usefulness_score', sa.Float(), nullable=False),
        sa.Column('perceived_ease_of_use_score', sa.Float(), nullable=False),
        sa.Column('behavioral_intention_score', sa.Float(), nullable=False),
        sa.Column('submitted_at', sa.DateTime(), nullable=False, server_default=func.now()),
    )

def downgrade():
    op.drop_table('surveys')
    op.drop_table('dashboard_metrics')
    op.drop_table('alerts')
    op.drop_table('portfolio_evidence')
    op.drop_table('attendance')
    op.drop_table('competency_records')
    op.drop_table('assessments')
    op.drop_table('enrollments')
    op.drop_table('competencies')
    op.drop_table('modules')
