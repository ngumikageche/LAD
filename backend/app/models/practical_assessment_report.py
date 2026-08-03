from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, String, Text, event
from sqlalchemy.dialects.postgresql import JSONB, UUID
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

    # ── Template lineage ─────────────────────────────────────────────────────
    # Set on every copy produced by reusing an existing report build. Points at
    # the lineage root (the first report the design was authored on), so a whole
    # family of copies shares one id and a learner can never be issued the same
    # template twice.
    source_report_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("practical_assessment_reports.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
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
    company_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    assessment_venue: Mapped[str | None] = mapped_column(String(255), nullable=True)
    practical_brief: Mapped[str | None] = mapped_column(Text, nullable=True)
    general_remarks: Mapped[str | None] = mapped_column(Text, nullable=True)
    report_sections: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    media_attachments: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    # ── Task scores (0–25 each) ───────────────────────────────────────────────
    task_items: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    oral_questions: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
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
    DEFAULT_ORAL_MAX_SCORE = 1
    TASK_LABELS = [
        "String the two spans",
        "Earth the installation at the correct point",
        "Support end post with stay wire",
        "Perform tests on installed system for functionality",
    ]

    def compute(self) -> None:
        """Recompute total and competency outcome from task scores."""
        sections = self.report_sections if isinstance(self.report_sections, list) else []
        if sections:
            section_scores: list[float] = []
            total_max_score = 0.0
            total_items = 0
            for section in sections:
                if not isinstance(section, dict):
                    continue
                for item in section.get("items") or []:
                    if not isinstance(item, dict):
                        continue
                    total_items += 1
                    total_max_score += float(item.get("max_score") or self.MAX_TASK_SCORE)
                    if item.get("score") is not None:
                        section_scores.append(float(item.get("score")))

            if not section_scores:
                self.total_score = None
                self.competency_outcome = "INCOMPLETE"
                return

            self.total_score = sum(section_scores)
            if len(section_scores) < total_items or total_max_score <= 0:
                self.competency_outcome = "INCOMPLETE"
                return

            percentage = (self.total_score / total_max_score) * 100
            if percentage >= 70:
                self.competency_outcome = "COMPETENT"
            elif percentage >= 50:
                self.competency_outcome = "BORDERLINE"
            else:
                self.competency_outcome = "NOT YET COMPETENT"
            return

        items = self.task_items if isinstance(self.task_items, list) else []
        if items:
            filled_scores = [float(item.get("score")) for item in items if item.get("score") is not None]
            total_max_score = sum(
                float(item.get("max_score") or self.MAX_TASK_SCORE)
                for item in items
            )
            if not filled_scores:
                self.total_score = None
                self.competency_outcome = "INCOMPLETE"
                return

            self.total_score = sum(filled_scores)
            if len(filled_scores) < len(items) or total_max_score <= 0:
                self.competency_outcome = "INCOMPLETE"
                return

            percentage = (self.total_score / total_max_score) * 100
            if percentage >= 70:
                self.competency_outcome = "COMPETENT"
            elif percentage >= 50:
                self.competency_outcome = "BORDERLINE"
            else:
                self.competency_outcome = "NOT YET COMPETENT"
            return

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
