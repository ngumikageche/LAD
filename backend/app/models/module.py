from sqlalchemy import String, ForeignKey, event
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import BaseModel
import uuid

class Module(BaseModel):
    __tablename__ = 'modules'
    code: Mapped[str | None] = mapped_column(String(16), unique=True, nullable=True, index=True)
    course_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("courses.id"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(String(1000), nullable=True)
    course = relationship("Course", back_populates="modules")
    competencies = relationship("Competency", back_populates="module")
    enrollments = relationship("Enrollment", back_populates="module")
    assessments = relationship("Assessment", back_populates="module")
    attendance = relationship("Attendance", back_populates="module")
    dashboard_metrics = relationship("DashboardMetric", back_populates="module")
    subjects = relationship("Subject", back_populates="module")
    attendance_sessions = relationship("AttendanceSession", back_populates="module")


@event.listens_for(Module, "before_insert")
def _set_module_code(mapper, connection, target):
    if not target.code:
        from ..utils.code_gen import generate_code
        target.code = generate_code("MOD", Module)
