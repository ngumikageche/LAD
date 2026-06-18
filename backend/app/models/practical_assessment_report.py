from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, String, Text, event
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel


class PracticalAssessmentReport(BaseModel):
    """
    TVET CDACC Candidate Practical Tool — Practical Assessment record.
    One record per student per unit of competency assessment.
    """
    __tablename__ = "practical_assessment_reports"

    # ── Candidate ────────────────────────────────────────────────────────────
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("students.id"), nullable=False, index=True
    )
    trainer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("trainers.id"), nullable=False, index=True
    )

    # ── Assessment context (pre-filled / configurable per report) ────────────
    institution_name: Mapped[str] = mapped_column(String(255), nullable=False,
        default="Thika Technical Training Institute")
    department_name: Mapped[str] = mapped_column(String(255), nullable=False,
        default="Electrical and Electronics Engineering Department")
    awarding_body: Mapped[str] = mapped_column(String(255), nullable=False,
        default="TVET Curriculum Development, Assessment and Certification Council (TVET CDACC)")
    qualification: Mapped[str] = mapped_column(String(255), nullable=False,
        default="Electrical Engineering Level 6")
    unit_of_competency: Mapped[str] = mapped_column(String(255), nullable=False,
        default="Install Electrical Power Lines")
    unit_code: Mapped[str] = mapped_column(String(64), nullable=False,
        default="ENG/OS/PO/CR/01/6")
    period: Mapped[str] = mapped_column(String(64), nullable=False,
        default="January – April 2025")

    # ── Assessment date ───────────────────────────────────────────────────────
    assessment_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # ── Task scores (0–25 each) ───────────────────────────────────────────────
    task_1_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    task_2_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    task_3_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    task_4_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    task_1_score: Mapped[float | None] = mapped_column(Float, nullable=True)  # String the two spans
    task_2_score: Mapped[float | None] = mapped_column(Float, nullable=True)  # Earth the installation
    task_3_score: Mapped[float | None] = mapped_column(Float, nullable=True)  # Support end post with stay wire
    task_4_score: Mapped[float | None] = mapped_column(Float, nullable=True)  # Perform tests

    # ── Assessor remarks per task ─────────────────────────────────────────────
    task_1_remark: Mapped[str | None] = mapped_column(Text, nullable=True)
    task_2_remark: Mapped[str | None] = mapped_column(Text, nullable=True)
    task_3_remark: Mapped[str | None] = mapped_column(Text, nullable=True)
    task_4_remark: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ── Computed fields ───────────────────────────────────────────────────────
    total_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    # "COMPETENT" | "NOT YET COMPETENT" | "BORDERLINE" | "INCOMPLETE"
    competency_outcome: Mapped[str | None] = mapped_column(String(32), nullable=True)

    # ── Visibility / release ──────────────────────────────────────────────────
    # When set, the report becomes visible to the student on their portal
    released_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    released_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )

    # ── Status ────────────────────────────────────────────────────────────────
    # draft | complete | released
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="draft")

    # ── Relationships ─────────────────────────────────────────────────────────
    student = relationship("Student", back_populates="practical_assessment_reports")
    trainer = relationship("Trainer", back_populates="practical_assessment_reports")
    released_by = relationship("User", foreign_keys=[released_by_user_id])

    # ── Helpers ───────────────────────────────────────────────────────────────
    MAX_TASK_SCORE = 25
    TASK_LABELS = [
        "String the two spans",
        "Earth the installation at the correct point",
        "Support end post with stay wire",
        "Perform tests on installed system for functionality",
    ]

    def compute(self) -> None:
        """Recompute total and competency outcome from task scores."""
        scores = [self.task_1_score, self.task_2_score, self.task_3_score, self.task_4_score]
        filled_scores = [s for s in scores if s is not None]
        if not filled_scores:
            self.total_score = None
            self.competency_outcome = "INCOMPLETE"
            return

        self.total_score = sum(filled_scores)
        if len(filled_scores) < len(scores):
            self.competency_outcome = "INCOMPLETE"
            return

        if self.total_score >= 70:
            self.competency_outcome = "COMPETENT"
        elif self.total_score >= 50:
            self.competency_outcome = "BORDERLINE"
        else:
            self.competency_outcome = "NOT YET COMPETENT"

    @staticmethod
    def auto_remark(score: float | None) -> str:
        if score is None:
            return "Score not recorded."
        if score >= 20:
            return "Excellent — task completed to industry standard."
        if score >= 15:
            return "Good — completed with minor corrections required."
        if score >= 10:
            return "Fair — significant errors observed; remediation recommended."
        return "Unsatisfactory — task not adequately completed."


@event.listens_for(PracticalAssessmentReport, "before_insert")
@event.listens_for(PracticalAssessmentReport, "before_update")
def _sync_practical_assessment_report(mapper, connection, target: PracticalAssessmentReport) -> None:
    target.compute()
