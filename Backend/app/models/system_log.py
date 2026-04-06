from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel


class SystemLog(BaseModel):
    __tablename__ = "system_logs"

    action: Mapped[str] = mapped_column(String(100), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    meta_data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    user = relationship("User")
