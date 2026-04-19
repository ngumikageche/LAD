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
    modules = relationship("Module", back_populates="course")
