"""
Keeping the learner↔subject roster in step with the marks that are recorded.

A learner can be enrolled in a course and module without ever being attached to
the individual subjects taught from it. Every trainer-facing roster — the
dashboard student count, My Students, subject class lists — is built from
`student_subjects`, so those learners are invisible even after their marks are
uploaded. Recording a mark for a subject is an unambiguous statement that the
learner takes it, so the link is created at that point instead.
"""

from __future__ import annotations

import uuid

from sqlalchemy.exc import IntegrityError

from ..extensions import db
from ..models.student_subject import StudentSubject


def student_subject_link_exists(
    student_id: uuid.UUID,
    subject_id: uuid.UUID,
) -> bool:
    """True when the learner is already attached to the subject."""
    return (
        db.session.query(StudentSubject.id)
        .filter(
            StudentSubject.student_id == student_id,
            StudentSubject.subject_id == subject_id,
        )
        .first()
    ) is not None


def link_student_to_subject(
    student_id: uuid.UUID | None,
    subject_id: uuid.UUID | None,
) -> bool:
    """
    Attach a learner to a subject unless they are already on it.

    Returns True only when a link was created, so callers can report how many
    learners an upload pulled onto the subject. Idempotent, and safe to call
    once per uploaded row: the write is wrapped in a savepoint so losing a race
    to a concurrent upload cannot poison the caller's transaction.
    """
    if not student_id or not subject_id:
        return False
    if student_subject_link_exists(student_id, subject_id):
        return False

    try:
        with db.session.begin_nested():
            db.session.add(
                StudentSubject(student_id=student_id, subject_id=subject_id)
            )
    except IntegrityError:
        # Another writer attached the same learner first — the desired state.
        return False
    return True
