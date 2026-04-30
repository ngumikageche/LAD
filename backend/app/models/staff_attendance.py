from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import Date, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel


class StaffAttendance(BaseModel):
    __tablename__ = "staff_attendance"

    trainer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("trainers.id"), nullable=False, index=True
    )
    term_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("terms.id"), nullable=True, index=True
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    # present | absent | leave | substituted
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="present")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    trainer = relationship("Trainer", back_populates="staff_attendance")
    term = relationship("Term", back_populates="staff_attendance")
