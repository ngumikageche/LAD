from __future__ import annotations

from sqlalchemy import String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel


class RolePermission(BaseModel):
    __tablename__ = "roles_permissions"

    role_name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    permissions: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    users = relationship("User", back_populates="role")
