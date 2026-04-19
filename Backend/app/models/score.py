from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, Float, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel


class Score(BaseModel):
    __tablename__ = "scores"

    enrollment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("enrollments.id"), nullable=False, index=True
    )
    assessment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("assessments.id"), nullable=False, index=True
    )
    marks_obtained: Mapped[float] = mapped_column(Float, nullable=False)
    grade: Mapped[str | None] = mapped_column(
        String(5), nullable=True
    )  # A, B, C, D, F or numeric like A+, A-, etc
    feedback: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    is_passed: Mapped[bool | None] = mapped_column(nullable=True)

    enrollment = relationship("Enrollment", back_populates="scores")
    assessment = relationship("Assessment", back_populates="scores")
