"""fix score and assignment integrity

Revision ID: 5d6e7f8a9b0c
Revises: 4c5d6e7f8a9b
Create Date: 2026-07-24 12:00:00.000000
"""

from alembic import op


revision = "5d6e7f8a9b0c"
down_revision = "4c5d6e7f8a9b"
branch_labels = None
depends_on = None


def upgrade():
    # Populate the direct score identity fields used by reports from legacy
    # enrollment/assessment-linked rows before adding the corrected indexes.
    op.execute(
        """
        UPDATE scores AS s
        SET student_id = e.student_id
        FROM enrollments AS e
        WHERE s.enrollment_id = e.id AND s.student_id IS NULL
        """
    )
    op.execute(
        """
        UPDATE scores AS s
        SET term = t.name
        FROM assessments AS a
        JOIN terms AS t ON t.id = a.term_id
        WHERE s.assessment_id = a.id AND (s.term IS NULL OR btrim(s.term) = '')
        """
    )
    op.drop_constraint("uq_scores_student_subject_term", "scores", type_="unique")
    op.create_index(
        "uq_scores_student_assessment",
        "scores",
        ["student_id", "assessment_id"],
        unique=True,
        postgresql_where="assessment_id IS NOT NULL AND deleted_at IS NULL",
    )
    op.create_index(
        "uq_scores_student_subject_term_unassessed",
        "scores",
        ["student_id", "subject_id", "term"],
        unique=True,
        postgresql_where="assessment_id IS NULL AND deleted_at IS NULL",
    )
    op.create_unique_constraint(
        "uq_trainer_course",
        "trainer_courses",
        ["trainer_id", "course_id"],
    )
    op.create_index(
        "uq_enrollment_student_course_module_term",
        "enrollments",
        ["student_id", "course_id", "module_id", "term_id"],
        unique=True,
        postgresql_nulls_not_distinct=True,
    )


def downgrade():
    op.drop_index("uq_enrollment_student_course_module_term", table_name="enrollments")
    op.drop_constraint("uq_trainer_course", "trainer_courses", type_="unique")
    op.drop_index("uq_scores_student_subject_term_unassessed", table_name="scores")
    op.drop_index("uq_scores_student_assessment", table_name="scores")
    op.create_unique_constraint(
        "uq_scores_student_subject_term",
        "scores",
        ["student_id", "subject_id", "term"],
    )
