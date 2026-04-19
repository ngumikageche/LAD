from sqlalchemy import String, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import BaseModel
import uuid

class Module(BaseModel):
    __tablename__ = 'modules'
    course_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("courses.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(String(1000), nullable=True)
    course = relationship("Course", back_populates="modules")
    competencies = relationship("Competency", back_populates="module")
    enrollments = relationship("Enrollment", back_populates="module")
    assessments = relationship("Assessment", back_populates="module")
    attendance = relationship("Attendance", back_populates="module")
    dashboard_metrics = relationship("DashboardMetric", back_populates="module")
    subjects = relationship("Subject", back_populates="module")
