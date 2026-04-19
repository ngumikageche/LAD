from sqlalchemy import String, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import BaseModel
import uuid
from datetime import datetime

class Alert(BaseModel):
    __tablename__ = 'alerts'
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=True, index=True)
    competency_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("competencies.id"), nullable=True, index=True)
    alert_type: Mapped[str] = mapped_column(String(32), nullable=False)
    message: Mapped[str] = mapped_column(String(1000), nullable=False)
    triggered_at: Mapped[datetime] = mapped_column(nullable=False, default=datetime.utcnow)
    resolved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    student = relationship("Student", back_populates="alerts")
    competency = relationship("Competency", back_populates="alerts")
