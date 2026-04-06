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
