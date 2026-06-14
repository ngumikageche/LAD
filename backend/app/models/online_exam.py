from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel


class OnlineExam(BaseModel):
    __tablename__ = "online_exams"

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    subject_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("subjects.id"), nullable=False, index=True)
    trainer_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("trainers.id"), nullable=True, index=True)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft", index=True)
    duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    auto_marking: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    total_marks: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    questions: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    subject = relationship("Subject")
    trainer = relationship("Trainer")
    creator = relationship("User", foreign_keys=[created_by])
    submissions = relationship("OnlineExamSubmission", back_populates="exam")


class OnlineExamSubmission(BaseModel):
    __tablename__ = "online_exam_submissions"
    __table_args__ = (UniqueConstraint("exam_id", "student_id", name="uq_online_exam_student_submission"),)

    exam_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("online_exams.id"), nullable=False, index=True)
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False, index=True)
    answers: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_score: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="submitted")
    submitted_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    exam = relationship("OnlineExam", back_populates="submissions")
    student = relationship("Student")
