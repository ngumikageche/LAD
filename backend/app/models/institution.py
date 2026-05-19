from __future__ import annotations

from sqlalchemy import String, event
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel


class Institution(BaseModel):
    __tablename__ = "institutions"

    code: Mapped[str | None] = mapped_column(String(16), unique=True, nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    location: Mapped[str] = mapped_column(String(255), nullable=False)

    users = relationship("User", back_populates="institution")
    departments = relationship("Department", back_populates="institution")


@event.listens_for(Institution, "before_insert")
def _set_institution_code(mapper, connection, target):
    if not target.code:
        from ..utils.code_gen import generate_code
        target.code = generate_code("INS", Institution)
