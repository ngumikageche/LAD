from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel


class ScoreEvidence(BaseModel):
    __tablename__ = "score_evidence"

    score_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("scores.id"), nullable=True, index=True
    )
    batch_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    assessment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("assessments.id"), nullable=True, index=True
    )
    subject_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("subjects.id"), nullable=True, index=True
    )
    trainer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("trainers.id"), nullable=True, index=True
    )
    uploaded_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_url: Mapped[str] = mapped_column(String(1000), nullable=False)
    file_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    file_size: Mapped[int] = mapped_column(nullable=False)

    score = relationship("Score")
    assessment = relationship("Assessment")
    subject = relationship("Subject")
    trainer = relationship("Trainer")
    uploader = relationship("User", foreign_keys=[uploaded_by])
