from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, String, event
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel


class Course(BaseModel):
    __tablename__ = "courses"

    code: Mapped[str | None] = mapped_column(String(16), unique=True, nullable=True, index=True)
    department_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("departments.id"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    cbet_level: Mapped[str] = mapped_column(String(50), nullable=False)

    department = relationship("Department", back_populates="courses")
    students = relationship("Student", back_populates="course")
    enrollments = relationship("Enrollment", back_populates="course")
    assessments = relationship("Assessment", back_populates="course")
    announcements = relationship("Announcement", back_populates="course")
    trainers = relationship("TrainerCourse", back_populates="course")
    subjects = relationship("CourseSubject", back_populates="course")
    modules = relationship("Module", back_populates="course")
    attendance_sessions = relationship("AttendanceSession", back_populates="course")


@event.listens_for(Course, "before_insert")
def _set_course_code(mapper, connection, target):
    if not target.code:
        from ..utils.code_gen import generate_code
        target.code = generate_code("CRS", Course)
