from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, String, event
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel


class Department(BaseModel):
    __tablename__ = "departments"

    code: Mapped[str | None] = mapped_column(String(16), unique=True, nullable=True, index=True)
    institution_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("institutions.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    institution = relationship("Institution", back_populates="departments")
    courses = relationship("Course", back_populates="department")
    trainers = relationship("Trainer", back_populates="department")


@event.listens_for(Department, "before_insert")
def _set_department_code(mapper, connection, target):
    if not target.code:
        from ..utils.code_gen import generate_code
        target.code = generate_code("DEP", Department)
