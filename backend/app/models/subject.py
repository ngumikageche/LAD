from __future__ import annotations

import uuid
from sqlalchemy import ForeignKey, String, event
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import BaseModel

class Subject(BaseModel):
    __tablename__ = "subjects"

    code: Mapped[str | None] = mapped_column(String(16), unique=True, nullable=True, index=True)
    module_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("modules.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(String(1000), nullable=True)

    module = relationship("Module", back_populates="subjects")
    trainer_subjects = relationship("TrainerSubject", back_populates="subject")
    student_subjects = relationship("StudentSubject", back_populates="subject")
    course_subjects = relationship("CourseSubject", back_populates="subject")
    scores = relationship("Score", back_populates="subject")
    lesson_plans = relationship("LessonPlan", back_populates="subject")
    attendance_sessions = relationship("AttendanceSession", back_populates="subject")


@event.listens_for(Subject, "before_insert")
def _set_subject_code(mapper, connection, target):
    if not target.code:
        from ..utils.code_gen import generate_code
        target.code = generate_code("SUB", Subject)
