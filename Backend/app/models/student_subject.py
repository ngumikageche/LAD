from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import ForeignKey, UniqueConstraint
from .base import BaseModel
import uuid

class StudentSubject(BaseModel):
    __tablename__ = 'student_subjects'
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=True, index=True)
    subject_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("subjects.id"), nullable=True, index=True)
    __table_args__ = (UniqueConstraint('student_id', 'subject_id', name='uq_student_subject'),)

    # Relationships
    student = relationship("Student", back_populates="student_subjects")
    subject = relationship("Subject", back_populates="student_subjects")
