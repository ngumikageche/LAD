from sqlalchemy import Float, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import BaseModel
import uuid
from datetime import datetime

class DashboardMetric(BaseModel):
    __tablename__ = 'dashboard_metrics'
    module_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("modules.id"), nullable=False, index=True)
    average_score: Mapped[float] = mapped_column(Float, nullable=False)
    mastery_rate: Mapped[float] = mapped_column(Float, nullable=False)
    at_risk_count: Mapped[int] = mapped_column(Integer, nullable=False)
    last_updated: Mapped[datetime] = mapped_column(nullable=False, default=datetime.utcnow)
    module = relationship("Module", back_populates="dashboard_metrics")
