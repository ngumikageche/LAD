from sqlalchemy import String, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import BaseModel
import uuid
from datetime import datetime

class PortfolioEvidence(BaseModel):
    __tablename__ = 'portfolio_evidence'
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=True, index=True)
    competency_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("competencies.id"), nullable=True, index=True)
    file_url: Mapped[str] = mapped_column(String(1000), nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(nullable=False, default=datetime.utcnow)
    verified_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("trainers.id"), nullable=True)
    student = relationship("Student", back_populates="portfolio_evidence")
    competency = relationship("Competency", back_populates="portfolio_evidence")
    trainer = relationship("Trainer")
