from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import ForeignKey, UniqueConstraint
from .base import BaseModel
import uuid

class TrainerSubject(BaseModel):
    __tablename__ = 'trainer_subjects'
    trainer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("trainers.id"), nullable=False, index=True)
    subject_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("subjects.id"), nullable=False, index=True)
    __table_args__ = (UniqueConstraint('trainer_id', 'subject_id', name='uq_trainer_subject'),)

    # Relationships
    trainer = relationship("Trainer", back_populates="trainer_subjects")
    subject = relationship("Subject", back_populates="trainer_subjects")
