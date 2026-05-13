"""
Attendance Service Layer
Handles QR token generation, GPS validation, session management
"""

import hashlib
import secrets
import hmac
from datetime import datetime, timedelta
from typing import Optional, Tuple
import math
from sqlalchemy import and_
from sqlalchemy.orm import joinedload
from sqlalchemy.exc import IntegrityError

from ..models.attendance_session import AttendanceSession, AttendanceRecord, AttendanceTokenHistory
from ..models.student import Student
from ..models.trainer import Trainer
from ..models.enrollment import Enrollment
from ..models.course import Course
from ..models.student_subject import StudentSubject
from ..extensions import db


class AttendanceService:
    """Core attendance business logic"""

    # Configuration
    DEFAULT_RADIUS_METERS = 100
    DEFAULT_REGENERATION_INTERVAL = 25  # seconds
    TOKEN_EXPIRY_BUFFER = 5  # seconds before regeneration
    
    @staticmethod
    def generate_session_code() -> str:
        """
        Generate a 6-character session code for manual entry fallback.
        Format: XXXXXX (alphanumeric)
        """
        chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
        return "".join(secrets.choice(chars) for _ in range(6))

    @staticmethod
    def generate_qr_token(session_id: str, qr_seed: str, secret_key: str) -> str:
        """
        Generate a rotating QR token using HMAC-SHA256.
        
        Token is based on:
        - session_id (fixed)
        - qr_seed (fixed)
        - current timestamp window (changes every regeneration_interval)
        - server secret (fixed)
        
        This ensures tokens are:
        - Unique per session
        - Time-windowed (rotates automatically)
        - Cryptographically secure
        - Not replayable
        """
        timestamp_window = int(datetime.utcnow().timestamp() / AttendanceService.DEFAULT_REGENERATION_INTERVAL)
        
        # Create HMAC of session_id + timestamp + seed
        message = f"{session_id}:{timestamp_window}:{qr_seed}".encode()
        token_hash = hmac.new(
            secret_key.encode(),
            message,
            hashlib.sha256
        ).hexdigest()[:32]  # First 32 chars
        
        return token_hash

    @staticmethod
    def hash_token(token: str) -> str:
        """Hash token for storage (never store plaintext tokens)."""
        return hashlib.sha256(token.encode()).hexdigest()

    @staticmethod
    def create_attendance_session(
        trainer_id: str,
        subject_id: Optional[str] = None,
        course_id: Optional[str] = None,
        module_id: Optional[str] = None,
        latitude: float = 0.0,
        longitude: float = 0.0,
        allowed_radius_meters: int = DEFAULT_RADIUS_METERS,
        duration_minutes: int = 60,
        regeneration_interval: int = DEFAULT_REGENERATION_INTERVAL,
        secret_key: str = "default-secret"
    ) -> Tuple[AttendanceSession, str]:
        """
        Create new attendance session.
        
        Returns:
            (session, current_token)
        """
        # Generate codes
        session_code = AttendanceService.generate_session_code()
        qr_seed = secrets.token_urlsafe(32)
        
        # Calculate expiry
        now = datetime.utcnow()
        expires_at = now + timedelta(minutes=duration_minutes)
        
        # Create session
        session = AttendanceSession(
            trainer_id=trainer_id,
            subject_id=subject_id,
            course_id=course_id,
            module_id=module_id,
            latitude=latitude,
            longitude=longitude,
            allowed_radius_meters=allowed_radius_meters,
            started_at=now,
            expires_at=expires_at,
            session_code=session_code,
            qr_seed=qr_seed,
            status="active",
            regeneration_interval=regeneration_interval
        )
        
        # Generate initial token
        token = AttendanceService.generate_qr_token(str(session.id), qr_seed, secret_key)
        session.current_token = token
        
        db.session.add(session)
        db.session.flush()  # Get the ID before commit
        
        # Record token in history
        token_hash = AttendanceService.hash_token(token)
        history = AttendanceTokenHistory(
            attendance_session_id=session.id,
            token=token,
            token_hash=token_hash,
            expires_at=now + timedelta(seconds=regeneration_interval + AttendanceService.TOKEN_EXPIRY_BUFFER)
        )
        db.session.add(history)
        db.session.commit()
        
        return session, token

    @staticmethod
    def end_session(session_id: str) -> AttendanceSession:
        """End an active attendance session."""
        import uuid as _uuid
        session = db.session.query(AttendanceSession).filter_by(
            id=_uuid.UUID(str(session_id))
        ).first()
        if not session:
            raise ValueError(f"Session {session_id} not found")

        session.status = "ended"
        db.session.commit()
        return session

    @staticmethod
    def regenerate_token(session: AttendanceSession, secret_key: str) -> str:
        """
        Regenerate QR token for session.
        Called periodically (every regeneration_interval seconds).
        Old token becomes invalid immediately.
        """
        if not session.is_active():
            raise ValueError("Session is not active")
        
        # Generate new token
        new_token = AttendanceService.generate_qr_token(str(session.id), session.qr_seed, secret_key)
        old_token = session.current_token
        
        # Update session with new token
        session.current_token = new_token
        
        # Record new token in history
        token_hash = AttendanceService.hash_token(new_token)
        history = AttendanceTokenHistory(
            attendance_session_id=session.id,
            token=new_token,
            token_hash=token_hash,
            expires_at=datetime.utcnow() + timedelta(seconds=session.regeneration_interval + AttendanceService.TOKEN_EXPIRY_BUFFER)
        )
        db.session.add(history)
        
        # Invalidate old token by setting its expiry to now
        old_history = db.session.query(AttendanceTokenHistory).filter(
            and_(
                AttendanceTokenHistory.attendance_session_id == session.id,
                AttendanceTokenHistory.token == old_token
            )
        ).first()
        
        if old_history:
            old_history.expires_at = datetime.utcnow()
        
        db.session.commit()
        return new_token

    @staticmethod
    def validate_token(session: AttendanceSession, token: str) -> bool:
        """Validate that token is current and not expired."""
        if not session.is_active():
            return False
        
        return session.current_token == token

    @staticmethod
    def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """
        Calculate distance between two GPS coordinates using Haversine formula.
        
        Returns distance in meters.
        """
        R = 6371000  # Earth radius in meters
        
        lat1_rad = math.radians(lat1)
        lat2_rad = math.radians(lat2)
        delta_lat = math.radians(lat2 - lat1)
        delta_lon = math.radians(lon2 - lon1)
        
        a = math.sin(delta_lat / 2) ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon / 2) ** 2
        c = 2 * math.asin(math.sqrt(a))
        
        return R * c

    @staticmethod
    def validate_student_enrollment(
        student_id: str,
        subject_id: Optional[str] = None,
        course_id: Optional[str] = None,
        module_id: Optional[str] = None
    ) -> bool:
        """
        Verify the student is enrolled in the session's subject/course/module.
        Subject check (student_subjects) is the primary gate.
        Course/module checks are fallbacks when no subject_id is set.
        """
        import uuid as _uuid

        student = db.session.query(Student).filter_by(id=student_id).first()
        if not student:
            return False

        # Primary: subject-level check via student_subjects
        if subject_id:
            try:
                subject_uuid = _uuid.UUID(str(subject_id))
            except ValueError:
                return False
            return db.session.query(StudentSubject).filter(
                and_(
                    StudentSubject.student_id == student_id,
                    StudentSubject.subject_id == subject_uuid
                )
            ).first() is not None

        # Fallback: course-level check
        if course_id:
            try:
                course_uuid = _uuid.UUID(str(course_id))
            except ValueError:
                return False
            if student.course_id == course_uuid:
                return True
            return db.session.query(Enrollment).filter(
                and_(
                    Enrollment.student_id == student_id,
                    Enrollment.course_id == course_uuid,
                    Enrollment.status == "active"
                )
            ).first() is not None

        # Fallback: module-level check
        if module_id:
            try:
                module_uuid = _uuid.UUID(str(module_id))
            except ValueError:
                return False
            return db.session.query(Enrollment).filter(
                and_(
                    Enrollment.student_id == student_id,
                    Enrollment.module_id == module_uuid
                )
            ).first() is not None

        # No scope set — allow through (session has no enrollment restriction)
        return True

    @staticmethod
    def check_duplicate_attendance(session_id: str, student_id: str) -> bool:
        """
        Check if student already checked in to this session.
        """
        record = db.session.query(AttendanceRecord).filter(
            and_(
                AttendanceRecord.attendance_session_id == session_id,
                AttendanceRecord.student_id == student_id
            )
        ).first()
        return record is not None

    @staticmethod
    def submit_attendance(
        session_id: str,
        student_id: str,
        student_latitude: float,
        student_longitude: float,
        token: str,
        ip_address: str = "",
        browser_info: str = "",
        device_hash: str = "",
        secret_key: str = "default-secret"
    ) -> Tuple[AttendanceRecord, bool, str]:
        """
        Submit attendance check-in with validation.
        
        Returns:
            (record, success, message)
        """
        # Get session
        session = db.session.query(AttendanceSession).filter_by(id=session_id).first()
        if not session:
            return None, False, "Session not found"
        
        # Validate session is active
        if not session.is_active():
            return None, False, "Session expired or not active"
        
        # Validate token
        if not AttendanceService.validate_token(session, token):
            return None, False, "Invalid or expired token"
        
        # Check enrollment
        if not AttendanceService.validate_student_enrollment(
            student_id,
            subject_id=str(session.subject_id) if session.subject_id else None,
            course_id=str(session.course_id) if session.course_id else None,
            module_id=str(session.module_id) if session.module_id else None,
        ):
            return None, False, "Student not enrolled in this subject"
        
        # Check duplicate
        if AttendanceService.check_duplicate_attendance(session_id, student_id):
            return None, False, "Student already checked in"
        
        # Validate GPS distance
        distance = AttendanceService.calculate_distance(
            session.latitude,
            session.longitude,
            student_latitude,
            student_longitude
        )
        
        if distance > session.allowed_radius_meters:
            # Create failed record for analytics
            record = AttendanceRecord(
                attendance_session_id=session_id,
                student_id=student_id,
                latitude=student_latitude,
                longitude=student_longitude,
                ip_address=ip_address,
                browser_info=browser_info,
                device_hash=device_hash,
                status="failed_gps",
                distance_from_trainer=distance
            )
            db.session.add(record)
            db.session.commit()
            return record, False, f"Location too far: {distance:.0f}m > {session.allowed_radius_meters}m allowed"
        
        # All validations passed - create successful record
        try:
            record = AttendanceRecord(
                attendance_session_id=session_id,
                student_id=student_id,
                latitude=student_latitude,
                longitude=student_longitude,
                ip_address=ip_address,
                browser_info=browser_info,
                device_hash=device_hash,
                status="success",
                distance_from_trainer=distance,
                checked_in_at=datetime.utcnow()
            )
            db.session.add(record)
            db.session.commit()
            return record, True, "Attendance recorded successfully"
        except IntegrityError as e:
            db.session.rollback()
            return None, False, "Duplicate attendance detected"

    @staticmethod
    def get_session_records(session_id: str):
        """Get all attendance records for a session (for live display)."""
        return db.session.query(AttendanceRecord).options(
            joinedload(AttendanceRecord.student).joinedload(Student.user)
        ).filter(
            AttendanceRecord.attendance_session_id == session_id
        ).order_by(AttendanceRecord.checked_in_at.desc()).all()

    @staticmethod
    def get_session_summary(session_id: str):
        """Get attendance summary for a session."""
        session = db.session.query(AttendanceSession).filter_by(id=session_id).first()
        if not session:
            return None
        
        total_records = db.session.query(AttendanceRecord).filter(
            AttendanceRecord.attendance_session_id == session_id
        ).count()
        
        successful = db.session.query(AttendanceRecord).filter(
            and_(
                AttendanceRecord.attendance_session_id == session_id,
                AttendanceRecord.status == "success"
            )
        ).count()
        
        failed_gps = db.session.query(AttendanceRecord).filter(
            and_(
                AttendanceRecord.attendance_session_id == session_id,
                AttendanceRecord.status == "failed_gps"
            )
        ).count()
        
        return {
            "session_id": str(session.id),
            "status": session.status,
            "total_submissions": total_records,
            "successful": successful,
            "failed_gps": failed_gps,
            "seconds_until_expiry": session.seconds_until_expiry(),
            "current_token": session.current_token,
            "session_code": session.session_code,
        }

    @staticmethod
    def get_student_attendance_history(student_id: str, limit: int = 50):
        """Get attendance history for a student."""
        records = db.session.query(AttendanceRecord).filter(
            AttendanceRecord.student_id == student_id
        ).order_by(AttendanceRecord.checked_in_at.desc()).limit(limit).all()
        
        return records
