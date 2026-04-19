from sqlalchemy import String, Float, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import BaseModel
import uuid

class Competency(BaseModel):
    __tablename__ = 'competencies'
    module_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("modules.id"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(String(1000), nullable=True)
    expected_outcome: Mapped[str] = mapped_column(String(1000), nullable=True)
    mastery_threshold: Mapped[float] = mapped_column(Float, nullable=False, default=100.0)
    assessment_tasks: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    performance_levels: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    module = relationship("Module", back_populates="competencies")
    assessments = relationship("Assessment", back_populates="competency")
    competency_records = relationship("CompetencyRecord", back_populates="competency")
    portfolio_evidence = relationship("PortfolioEvidence", back_populates="competency")
    alerts = relationship("Alert", back_populates="competency")
