from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import Date, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel


class LessonPlan(BaseModel):
    __tablename__ = "lesson_plans"

    trainer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("trainers.id"), nullable=False, index=True
    )
    subject_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("subjects.id"), nullable=False, index=True
    )
    term_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("terms.id"), nullable=True, index=True
    )
    topic: Mapped[str] = mapped_column(String(512), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    planned_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    covered_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    trainer = relationship("Trainer", back_populates="lesson_plans")
    subject = relationship("Subject", back_populates="lesson_plans")
    term = relationship("Term", back_populates="lesson_plans")
    validations = relationship(
        "SyllabusValidation", back_populates="lesson_plan", cascade="all, delete-orphan"
    )
