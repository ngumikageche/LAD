from __future__ import annotations

import uuid

from sqlalchemy import Boolean, ForeignKey, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel


class SyllabusValidation(BaseModel):
    """
    A learner's answer to "was this topic actually taught?".

    Syllabus coverage is entered by the trainer who taught it, so on its own it
    is a self-assessment: nothing in the system stopped a trainer reporting a
    topic as covered that the class never saw. This table is the second
    opinion. Each row is one learner confirming or denying one lesson plan
    topic, which lets a report put the trainer's reported coverage next to the
    coverage the class recognises and hand the difference to a head of
    department.

    One row per learner per topic — a learner revising their answer updates
    their own row rather than stacking votes.
    """

    __tablename__ = "syllabus_validations"
    __table_args__ = (
        UniqueConstraint("lesson_plan_id", "student_id", name="uq_syllabus_validation_plan_student"),
    )

    lesson_plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("lesson_plans.id"), nullable=False, index=True
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("students.id"), nullable=False, index=True
    )
    #: True = the learner recognises the topic as taught, False = they do not.
    was_covered: Mapped[bool] = mapped_column(Boolean, nullable=False)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)

    lesson_plan = relationship("LessonPlan", back_populates="validations")
    student = relationship("Student")
