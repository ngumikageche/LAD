from sqlalchemy import String, Date, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import BaseModel
import uuid
from datetime import datetime

class Attendance(BaseModel):
    __tablename__ = 'attendance'
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False, index=True)
    module_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("modules.id"), nullable=False, index=True)
    date: Mapped[datetime] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    student = relationship("Student", back_populates="attendance")
    module = relationship("Module", back_populates="attendance")
