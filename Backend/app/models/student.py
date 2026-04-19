from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel


class Student(BaseModel):
    __tablename__ = "students"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False, index=True
    )
    registration_number: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    course_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("courses.id"), nullable=False, index=True
    )
    enrollment_year: Mapped[int] = mapped_column(Integer, nullable=False)

    user = relationship("User", back_populates="student")
    course = relationship("Course", back_populates="students")
    enrollments = relationship("Enrollment", back_populates="student")
    alerts = relationship("Alert", back_populates="student")
    competency_records = relationship("CompetencyRecord", back_populates="student")
    portfolio_evidence = relationship("PortfolioEvidence", back_populates="student")
    attendance = relationship("Attendance", back_populates="student")
    assessments = relationship("Assessment", back_populates="student")
    student_subjects = relationship("StudentSubject", back_populates="student")
