from __future__ import annotations

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel


class Institution(BaseModel):
    __tablename__ = "institutions"

    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    location: Mapped[str] = mapped_column(String(255), nullable=False)

    users = relationship("User", back_populates="institution")
    departments = relationship("Department", back_populates="institution")
