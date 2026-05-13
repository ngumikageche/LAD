from __future__ import annotations

import uuid
from datetime import datetime, timedelta

from sqlalchemy import ForeignKey, String, Float, Integer, DateTime, Index, UniqueConstraint, func, Enum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel


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
    
    # Status: success, failed_gps (outside radius), failed_duplicate, failed_not_enrolled
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
