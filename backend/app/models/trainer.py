from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, String, event
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel


class Trainer(BaseModel):
    __tablename__ = "trainers"

    code: Mapped[str | None] = mapped_column(String(16), unique=True, nullable=True, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=True, index=True
    )
    department_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("departments.id"), nullable=True, index=True
    )
    specialization: Mapped[str | None] = mapped_column(String(255), nullable=True)

    user = relationship("User", back_populates="trainer")
    department = relationship("Department", back_populates="trainers")
    trainer_subjects = relationship("TrainerSubject", back_populates="trainer")
    courses_taught = relationship("TrainerCourse", back_populates="trainer")
    scores = relationship("Score", back_populates="trainer")
    lesson_plans = relationship("LessonPlan", back_populates="trainer")
    staff_attendance = relationship("StaffAttendance", back_populates="trainer")
    attendance_sessions = relationship("AttendanceSession", back_populates="trainer")
    practical_assessment_reports = relationship("PracticalAssessmentReport", back_populates="trainer")


@event.listens_for(Trainer, "before_insert")
def _set_trainer_code(mapper, connection, target):
    if not target.code:
        from ..extensions import db
        from ..utils.code_gen import generate_code
        target.code = generate_code("TRN", Trainer)
