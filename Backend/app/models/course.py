from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel


class Course(BaseModel):
    __tablename__ = "courses"

    department_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("departments.id"), nullable=False, index=True
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
    notifications = relationship("Notification", back_populates="course")
    analytics = relationship("CourseAnalytics", back_populates="course")
    competency_records = relationship("CompetencyRecord", back_populates="course")
    portfolio_evidence = relationship("PortfolioEvidence", back_populates="course")
    attendance = relationship("Attendance", back_populates="course")
    scores = relationship("Score", back_populates="course")
    alerts = relationship("Alert", back_populates="course")
    student_subjects = relationship("StudentSubject", back_populates="course")
    trainer_subjects = relationship("TrainerSubject", back_populates="course")
    course_analytics = relationship("CourseAnalytics", back_populates="course")
    course_announcements = relationship("Announcement", back_populates="course")
    course_notifications = relationship("Notification", back_populates="course")
    modules = relationship("Module", back_populates="course")



