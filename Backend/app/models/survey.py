from sqlalchemy import String, Float, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import BaseModel
import uuid
from datetime import datetime

class Survey(BaseModel):
    __tablename__ = 'surveys'
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    perceived_usefulness_score: Mapped[float] = mapped_column(Float, nullable=False)
    perceived_ease_of_use_score: Mapped[float] = mapped_column(Float, nullable=False)
    behavioral_intention_score: Mapped[float] = mapped_column(Float, nullable=False)
    submitted_at: Mapped[datetime] = mapped_column(nullable=False, default=datetime.utcnow)
    user = relationship("User")
