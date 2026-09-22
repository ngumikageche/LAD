from __future__ import annotations

import uuid
from datetime import datetime, timedelta

from sqlalchemy import ForeignKey, String, Float, Integer, DateTime, Index, UniqueConstraint, and_, exists, func, or_, select, Enum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, aliased, mapped_column, relationship

from .base import BaseModel
from .student_subject import StudentSubject


# A check-in that puts the learner in the room: a scan inside the fence, or the
# trainer marking them present by hand. Every attendance figure reads this one
# set — the analytics used to accept "success" alone, so a learner the trainer
# marked present was counted absent on the dashboard while the session report
# listed them as there.
ATTENDED_CHECKIN_STATUSES = ("success", "manual")

# How much of the cohort a *lapsed* register has to have recorded before it is
# evidence that a class was held. A session the trainer closed is trusted at any
# turnout; one left to expire is not, because that is what opening the QR screen
# to try the feature leaves behind. See `counts_as_sitting`.
MIN_LAPSED_SITTING_SHARE = 0.5


class AttendanceSession(BaseModel):
    """
    Attendance session created by trainer for a course/module.
    Stores rotating QR tokens and session metadata.
    """
    __tablename__ = "attendance_sessions"

    trainer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("trainers.id"), nullable=False, index=True
    )
    course_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("courses.id"), nullable=True, index=True
    )
    module_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("modules.id"), nullable=True, index=True
    )
    subject_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("subjects.id"), nullable=True, index=True
    )
    
    # Current active QR token (rotating, unique per valid window)
    current_token: Mapped[str] = mapped_column(String(512), nullable=False, unique=True, index=True)
    
    # Manual fallback code (for typing instead of scanning)
    session_code: Mapped[str] = mapped_column(String(16), nullable=False, unique=True, index=True)
    
    # Base seed for token generation (used with timestamp)
    qr_seed: Mapped[str] = mapped_column(String(256), nullable=False)
    
    # Trainer GPS coordinates
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    
    # Allowed radius in meters (default 100m)
    allowed_radius_meters: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    
    # Session lifecycle
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    
    # Session status: active, ended
    status: Mapped[str] = mapped_column(String(32), default="active", nullable=False, index=True)
    
    # Token regeneration interval in seconds (20-30 typical)
    regeneration_interval: Mapped[int] = mapped_column(Integer, default=25, nullable=False)
    
    # Relationships
    trainer = relationship("Trainer", back_populates="attendance_sessions")
    course = relationship("Course", back_populates="attendance_sessions")
    module = relationship("Module", back_populates="attendance_sessions")
    subject = relationship("Subject", back_populates="attendance_sessions")
    records = relationship("AttendanceRecord", back_populates="session", cascade="all, delete-orphan")
    token_history = relationship("AttendanceTokenHistory", back_populates="session", cascade="all, delete-orphan")
    
    # Indexes for common queries
    __table_args__ = (
        Index("idx_attendance_sessions_trainer_status", "trainer_id", "status"),
        Index("idx_attendance_sessions_token", "current_token"),
        Index("idx_attendance_sessions_code", "session_code"),
    )
    
    def is_active(self) -> bool:
        """Check if session is still active and not expired."""
        return self.status == "active" and datetime.utcnow() <= self.expires_at
    
    def is_token_valid(self, token: str) -> bool:
        """Verify token matches current token and session is active."""
        return self.is_active() and self.current_token == token
    
    def seconds_until_expiry(self) -> int:
        """Return seconds until session expires."""
        delta = self.expires_at - datetime.utcnow()
        return max(0, int(delta.total_seconds()))

    @classmethod
    def counts_as_sitting(cls):
        """
        SQL condition for a session a learner can be marked absent from.

        Every session run for a learner's subject is a sitting they were
        expected at, but three kinds were being counted that should not be. A
        session still open is not yet an absence for anyone who has not scanned
        — the class is in progress. And one that closed with nobody recorded at
        all, not a single scan or hand-marked learner, is a register opened by
        mistake or to try the feature, not a class the whole cohort skipped.
        Counting either marked every learner absent from a class that never
        met, and a demonstration's test sessions pulled the whole cohort's
        attendance down with them.

        The third is the one those two guards let through. Opening the QR
        screen to try it out leaves behind a register that *does* have someone
        on it — whoever was standing there — and that expires on its own rather
        than being closed. One trainer's 23 of those, each holding 1 to 9 of 24
        learners, put 23 phantom classes in front of the whole cohort and read
        as a 16% attendance rate against a register that was actually at 92%,
        dragging the dashboard's Attendance Signal to 61.7%.

        So a lapsed register — left to expire instead of closed — now has to
        show MIN_LAPSED_SITTING_SHARE of the learners taking its subject before
        it counts as a class. A session the trainer deliberately ended is still
        trusted at any turnout: a badly attended lesson is exactly what this
        figure exists to show, and only the trainer can tell it apart from an
        abandoned register. Where a subject has no enrolments recorded at all
        the share is unmeasurable, and the old "at least one person" rule
        stands rather than discarding the session.
        """
        # Aliased so the subqueries keep their own FROM when the outer query is
        # itself reading attendance_records (the check-in count does).
        recorded = aliased(AttendanceRecord)
        enrolled = aliased(StudentSubject)
        recorded_learners = (
            select(func.count(func.distinct(recorded.student_id)))
            .where(recorded.attendance_session_id == cls.id, recorded.deleted_at.is_(None))
            .correlate(cls)
            .scalar_subquery()
        )
        cohort = (
            select(func.count(func.distinct(enrolled.student_id)))
            .where(enrolled.subject_id == cls.subject_id, enrolled.deleted_at.is_(None))
            .correlate(cls)
            .scalar_subquery()
        )
        return and_(
            cls.deleted_at.is_(None),
            or_(cls.status == "ended", cls.expires_at <= datetime.utcnow()),
            exists()
            .where(recorded.attendance_session_id == cls.id, recorded.deleted_at.is_(None))
            .correlate(cls),
            or_(
                cls.status == "ended",
                recorded_learners >= cohort * MIN_LAPSED_SITTING_SHARE,
            ),
        )


class AttendanceRecord(BaseModel):
    """
    Individual student attendance check-in record.
    One per student per session.
    """
    __tablename__ = "attendance_records"

    attendance_session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("attendance_sessions.id"), nullable=False, index=True
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("students.id"), nullable=False, index=True
    )
    
    # Student GPS coordinates at time of check-in
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    
    # Timestamp when student checked in
    checked_in_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    
    # Device fingerprint (combination of user-agent, ip, etc)
    device_hash: Mapped[str | None] = mapped_column(String(256), nullable=True)
    
    # User-Agent string for analysis
    browser_info: Mapped[str | None] = mapped_column(String(512), nullable=True)
    
    # IP address of check-in
    ip_address: Mapped[str] = mapped_column(String(45), nullable=False)  # IPv6 max 45 chars
    
    # Status: success, manual (marked present by the trainer), failed_gps (outside radius),
    # failed_duplicate, failed_not_enrolled — see ATTENDED_CHECKIN_STATUSES
    status: Mapped[str] = mapped_column(String(32), default="success", nullable=False, index=True)
    
    # Distance from trainer in meters (for analytics)
    distance_from_trainer: Mapped[float | None] = mapped_column(Float, nullable=True)
    
    # Relationships
    session = relationship("AttendanceSession", back_populates="records")
    student = relationship("Student", back_populates="attendance_records")
    
    # Prevent duplicate attendance per student per session
    __table_args__ = (
        UniqueConstraint("attendance_session_id", "student_id", name="uq_session_student_attendance"),
        Index("idx_attendance_records_session", "attendance_session_id"),
        Index("idx_attendance_records_student", "student_id"),
        Index("idx_attendance_records_status", "status"),
    )


class AttendanceTokenHistory(BaseModel):
    """
    Tracks historical QR tokens for a session.
    Used to prevent token replay attacks.
    """
    __tablename__ = "attendance_token_history"

    attendance_session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("attendance_sessions.id"), nullable=False, index=True
    )
    
    # The actual token string
    token: Mapped[str] = mapped_column(String(512), nullable=False, index=True)
    
    # Hash of token for comparison (prevents plaintext exposure)
    token_hash: Mapped[str] = mapped_column(String(256), nullable=False, unique=True, index=True)
    
    # When this token expires (should be checked before accepting check-ins)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    
    # Relationships
    session = relationship("AttendanceSession", back_populates="token_history")
    
    __table_args__ = (
        Index("idx_token_history_session", "attendance_session_id"),
        Index("idx_token_history_hash", "token_hash"),
    )
