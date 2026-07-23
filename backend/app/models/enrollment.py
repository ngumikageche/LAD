from sqlalchemy import String, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import BaseModel
import uuid

class Enrollment(BaseModel):
    scores = relationship("Score", back_populates="enrollment")
    __tablename__ = 'enrollments'
    __table_args__ = (
        Index(
            "uq_enrollment_student_course_module_term",
            "student_id",
            "course_id",
            "module_id",
            "term_id",
            unique=True,
            postgresql_nulls_not_distinct=True,
        ),
    )
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=True, index=True)
    module_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("modules.id"), nullable=True, index=True)
    course_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("courses.id"), nullable=True, index=True)
    term_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("terms.id"), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    student = relationship("Student", back_populates="enrollments")
    module = relationship("Module", back_populates="enrollments")
    course = relationship("Course", back_populates="enrollments")
    term = relationship("Term", back_populates="enrollments")
