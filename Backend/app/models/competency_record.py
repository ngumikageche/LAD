from sqlalchemy import String, Float, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import BaseModel
import uuid
from datetime import datetime

class CompetencyRecord(BaseModel):
    __tablename__ = 'competency_records'
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False, index=True)
    competency_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("competencies.id"), nullable=False, index=True)
    mastery_level: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    last_updated: Mapped[datetime] = mapped_column(nullable=False, default=datetime.utcnow)
    student = relationship("Student", back_populates="competency_records")
    competency = relationship("Competency", back_populates="competency_records")
