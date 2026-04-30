from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, Float, Index, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel


class Score(BaseModel):
    __tablename__ = "scores"
    __table_args__ = (
        UniqueConstraint("student_id", "subject_id", "term", name="uq_scores_student_subject_term"),
        Index("ix_scores_student_subject_term", "student_id", "subject_id", "term"),
    )

    enrollment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("enrollments.id"), nullable=True, index=True
    )
    assessment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("assessments.id"), nullable=True, index=True
    )
    student_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("students.id"), nullable=True, index=True
    )
    subject_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("subjects.id"), nullable=True, index=True
    )
    trainer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("trainers.id"), nullable=True, index=True
    )
    term: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    marks_obtained: Mapped[float] = mapped_column(Float, nullable=False)
    grade: Mapped[str | None] = mapped_column(
        String(5), nullable=True
    )  # A, B, C, D, F or numeric like A+, A-, etc
    feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_passed: Mapped[bool | None] = mapped_column(nullable=True)

    enrollment = relationship("Enrollment", back_populates="scores")
    assessment = relationship("Assessment", back_populates="scores")
    student = relationship("Student", back_populates="scores")
    subject = relationship("Subject", back_populates="scores")
    trainer = relationship("Trainer", back_populates="scores")
