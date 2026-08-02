from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel


class TrainerFeedback(BaseModel):
    """Feedback a learner submits about a trainer, optionally per subject."""

    __tablename__ = "trainer_feedback"

    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("students.id"), nullable=False, index=True
    )
    trainer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("trainers.id"), nullable=False, index=True
    )
    subject_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("subjects.id"), nullable=True, index=True
    )

    # 1–5 overall rating, plus optional per-dimension ratings
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    teaching_rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    communication_rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    support_rating: Mapped[int | None] = mapped_column(Integer, nullable=True)

    category: Mapped[str] = mapped_column(String(32), nullable=False, default="general")
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)

    # When anonymous, the learner's identity is withheld from the trainer but
    # still stored so staff with the moderation permission can audit abuse.
    is_anonymous: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    status: Mapped[str] = mapped_column(String(32), nullable=False, default="submitted")
    trainer_response: Mapped[str | None] = mapped_column(Text, nullable=True)
    responded_at: Mapped[datetime | None] = mapped_column(nullable=True)

    student = relationship("Student")
    trainer = relationship("Trainer")
    subject = relationship("Subject")
