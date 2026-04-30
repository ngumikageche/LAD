from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel


class Term(BaseModel):
    __tablename__ = "terms"

    name: Mapped[str] = mapped_column(String(255), nullable=False)  # e.g., "Term 1 2024", "Semester 1"
    start_date: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    end_date: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    is_active: Mapped[bool] = mapped_column(nullable=False, default=False, index=True)

    assessments = relationship("Assessment", back_populates="term")
    lesson_plans = relationship("LessonPlan", back_populates="term")
    staff_attendance = relationship("StaffAttendance", back_populates="term")
