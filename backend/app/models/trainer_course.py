from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel


class TrainerCourse(BaseModel):
    __tablename__ = "trainer_courses"
    __table_args__ = (
        UniqueConstraint("trainer_id", "course_id", name="uq_trainer_course"),
    )

    trainer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("trainers.id"), nullable=False, index=True
    )
    course_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("courses.id"), nullable=False, index=True
    )

    trainer = relationship("Trainer", back_populates="courses_taught")
    course = relationship("Course", back_populates="trainers")
