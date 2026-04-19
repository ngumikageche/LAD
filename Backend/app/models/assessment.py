from sqlalchemy import String, Float, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import BaseModel
import uuid
from datetime import datetime

class Assessment(BaseModel):
    __tablename__ = 'assessments'
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False, index=True)
    trainer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("trainers.id"), nullable=False, index=True)
    module_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("modules.id"), nullable=False, index=True)
    competency_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("competencies.id"), nullable=False, index=True)
    score: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(nullable=False, default=datetime.utcnow)
    performance_level: Mapped[int | None] = mapped_column(nullable=True)
    source: Mapped[str] = mapped_column(String(32), nullable=False)
    term: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    
    student = relationship("Student", back_populates="assessments")
    trainer = relationship("Trainer", back_populates="assessments")
    module = relationship("Module", back_populates="assessments")
    competency = relationship("Competency", back_populates="assessments")
