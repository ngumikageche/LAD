from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel


class Assessment(BaseModel):
    __tablename__ = "assessments"
    recorded_at: Mapped[str] = mapped_column(String(100), nullable=True)  # Timestamp or datetime string

    course_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("courses.id"), nullable=True, index=True
    )
    term_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("terms.id"), nullable=True, index=True
    )
    module_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("modules.id"), nullable=True, index=True
    )
    competency_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("competencies.id"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)  # e.g., "Midterm Exam", "Assignment 1"
    description: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    assessment_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="exam"
    )  # exam, assignment, quiz, project
    total_marks: Mapped[int] = mapped_column(Integer, nullable=False)
    pass_marks: Mapped[int | None] = mapped_column(Integer, nullable=True)
    weight: Mapped[int | None] = mapped_column(Integer, nullable=True)  # Percentage contribution to final grade

    course = relationship("Course", back_populates="assessments")
    term = relationship("Term", back_populates="assessments")
    module = relationship("Module", back_populates="assessments")
    competency = relationship("Competency", back_populates="assessments")
    scores = relationship("Score", back_populates="assessment")
