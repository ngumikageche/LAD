from __future__ import annotations

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel


class Department(BaseModel):
    __tablename__ = "departments"

    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)

    trainers = relationship("Trainer", back_populates="department")
