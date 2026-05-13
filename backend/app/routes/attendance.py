"""
Attendance API Routes
Handles lecturer and student attendance endpoints
"""

from flask import Blueprint, request, g, current_app
from sqlalchemy import and_
from sqlalchemy.orm import joinedload
import uuid as uuid_lib

from ..extensions import db
from ..models.attendance_session import AttendanceSession, AttendanceRecord
from ..models.trainer import Trainer
from ..models.student import Student
from ..services.attendance_service import AttendanceService
from .permissions import trainer_or_admin_required, student_required, admin_required


bp = Blueprint("attendance", __name__, url_prefix="/api/v1/attendance")


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def _session_payload(session: AttendanceSession) -> dict:
    """Convert AttendanceSession to JSON-serializable dict."""
    return {
        "id": str(session.id),
        "trainer_id": str(session.trainer_id),
        "course_id": str(session.course_id) if session.course_id else None,
        "module_id": str(session.module_id) if session.module_id else None,
        "subject_id": str(session.subject_id) if session.subject_id else None,
        "session_code": session.session_code,
        "latitude": session.latitude,
        "longitude": session.longitude,
        "allowed_radius_meters": session.allowed_radius_meters,
        "started_at": session.started_at.isoformat(),
        "expires_at": session.expires_at.isoformat(),
        "status": session.status,
        "regeneration_interval": session.regeneration_interval,
        "seconds_until_expiry": session.seconds_until_expiry(),
        "is_active": session.is_active(),
        "created_at": session.created_at.isoformat(),
    }


def _record_payload(record: AttendanceRecord) -> dict:
    """Convert AttendanceRecord to JSON-serializable dict."""
    student_name = None
    registration_number = None
    if record.student:
        student_name = record.student.user.name if record.student.user else None
        registration_number = record.student.registration_number
    return {
        "id": str(record.id),
        "session_id": str(record.attendance_session_id),
        "student_id": str(record.student_id),
        "student_name": student_name,
        "registration_number": registration_number,
        "latitude": record.latitude,
        "longitude": record.longitude,
        "checked_in_at": record.checked_in_at.isoformat(),
        "status": record.status,
        "distance_from_trainer": record.distance_from_trainer,
        "created_at": record.created_at.isoformat(),
    }


# ============================================================================
# LECTURER ENDPOINTS
# ============================================================================

@bp.post("/sessions")
@trainer_or_admin_required("attendance.create")
def create_session():
    """
    Create new attendance session for a course.
    
    Request body:
    {
        "course_id": "uuid",
        "module_id": "uuid (optional)",
        "latitude": float,
        "longitude": float,
        "allowed_radius_meters": int (default 100),
        "duration_minutes": int (default 60),
        "regeneration_interval": int (default 25)
    }
    """
    try:
        data = request.get_json() or {}
        
        # Validate required fields
        if not data.get("latitude") or not data.get("longitude"):
            return {"error": "latitude and longitude required"}, 400
        
        # For admin acting without a trainer profile, require explicit trainer_id in body
        if g.current_trainer:
            trainer_id = str(g.current_trainer.id)
        else:
            trainer_id = data.get("trainer_id")
            if not trainer_id:
                return {"error": "trainer_id required when creating session as admin"}, 400
        subject_id = data.get("subject_id")
        course_id = data.get("course_id")
        module_id = data.get("module_id")
        latitude = float(data.get("latitude"))
        longitude = float(data.get("longitude"))
        allowed_radius = int(data.get("allowed_radius_meters", 100))
        duration = int(data.get("duration_minutes", 60))
        regen_interval = int(data.get("regeneration_interval", 25))
        
        if not subject_id and not course_id and not module_id:
            return {"error": "subject_id, course_id, or module_id required"}, 400
        
        if duration < 5 or duration > 480:
            return {"error": "Duration must be 5-480 minutes"}, 400
        
        if regen_interval < 10 or regen_interval > 300:
            return {"error": "Regeneration interval must be 10-300 seconds"}, 400
        
        if allowed_radius < 10 or allowed_radius > 1000:
            return {"error": "Allowed radius must be 10-1000 meters"}, 400
        
        # Create session
        secret_key = current_app.config.get("SECRET_KEY", "default-secret")
        session, token = AttendanceService.create_attendance_session(
            trainer_id=trainer_id,
            subject_id=subject_id,
            course_id=course_id,
            module_id=module_id,
            latitude=latitude,
            longitude=longitude,
            allowed_radius_meters=allowed_radius,
            duration_minutes=duration,
            regeneration_interval=regen_interval,
            secret_key=secret_key
        )
        
        return {
            "success": True,
            "session": _session_payload(session),
            "current_token": token,
        }, 201
    
    except ValueError as e:
        return {"error": str(e)}, 400
    except Exception as e:
        db.session.rollback()
        return {"error": f"Failed to create session: {str(e)}"}, 500


@bp.get("/sessions/<session_id>")
@trainer_or_admin_required("attendance.read")
def get_session(session_id: str):
    """Get attendance session details."""
    try:
        session = db.session.query(AttendanceSession).filter_by(
            id=uuid_lib.UUID(session_id)
        ).first()
        
        if not session:
            return {"error": "Session not found"}, 404
        
        # Verify ownership (optional - remove if admin should see all)
        # if str(session.trainer_id) != str(g.current_trainer.id):
        #     return {"error": "Unauthorized"}, 403
        
        return _session_payload(session), 200
    
    except ValueError:
        return {"error": "Invalid session ID"}, 400


@bp.get("/sessions/<session_id>/records")
@trainer_or_admin_required("attendance.read")
def get_session_records(session_id: str):
    """Get all attendance records for a session (live feed)."""
    try:
        session = db.session.query(AttendanceSession).filter_by(
            id=uuid_lib.UUID(session_id)
        ).first()
        
        if not session:
            return {"error": "Session not found"}, 404
        
        records = AttendanceService.get_session_records(session_id)
        
        return {
            "session_id": session_id,
            "records": [_record_payload(r) for r in records],
            "total": len(records),
        }, 200
    
    except ValueError:
        return {"error": "Invalid session ID"}, 400


@bp.get("/sessions/<session_id>/summary")
@trainer_or_admin_required("attendance.read")
def get_session_summary(session_id: str):
    """Get attendance summary for a session."""
    try:
        summary = AttendanceService.get_session_summary(session_id)
        
        if not summary:
            return {"error": "Session not found"}, 404
        
        return summary, 200
    
    except ValueError:
        return {"error": "Invalid session ID"}, 400


@bp.post("/sessions/<session_id>/end")
@trainer_or_admin_required("attendance.write")
def end_session(session_id: str):
    """End an active attendance session."""
    try:
        session = AttendanceService.end_session(session_id)
        return {
            "success": True,
            "session": _session_payload(session),
        }, 200
    
    except ValueError as e:
        return {"error": str(e)}, 404
    except Exception as e:
        db.session.rollback()
        return {"error": f"Failed to end session: {str(e)}"}, 500


@bp.post("/sessions/<session_id>/regenerate-token")
@trainer_or_admin_required("attendance.write")
def regenerate_token(session_id: str):
    """
    Manually trigger token regeneration (for testing).
    In production, this happens automatically on the frontend.
    """
    try:
        session = db.session.query(AttendanceSession).filter_by(
            id=uuid_lib.UUID(session_id)
        ).first()
        
        if not session:
            return {"error": "Session not found"}, 404
        
        secret_key = current_app.config.get("SECRET_KEY", "default-secret")
        new_token = AttendanceService.regenerate_token(session, secret_key)
        
        return {
            "success": True,
            "new_token": new_token,
            "session": _session_payload(session),
        }, 200
    
    except ValueError as e:
        return {"error": str(e)}, 400
    except Exception as e:
        db.session.rollback()
        return {"error": f"Token regeneration failed: {str(e)}"}, 500


# ============================================================================
# STUDENT ENDPOINTS
# ============================================================================

@bp.post("/checkin")
@student_required()
def submit_attendance():
    """
    Submit attendance check-in.
    
    Request body:
    {
        "session_id": "uuid",
        "token": "string",
        "latitude": float,
        "longitude": float
    }
    """
    try:
        data = request.get_json() or {}
        
        # Validate required fields
        required = ["session_id", "token", "latitude", "longitude"]
        missing = [f for f in required if f not in data]
        if missing:
            return {"error": f"Missing fields: {', '.join(missing)}"}, 400
        
        session_id = data.get("session_id")
        token = data.get("token")
        latitude = float(data.get("latitude"))
        longitude = float(data.get("longitude"))
        
        student_id = str(g.current_student.id)
        ip_address = request.remote_addr or ""
        browser_info = request.headers.get("User-Agent", "")
        
        # Submit attendance
        secret_key = current_app.config.get("SECRET_KEY", "default-secret")
        record, success, message = AttendanceService.submit_attendance(
            session_id=session_id,
            student_id=student_id,
            student_latitude=latitude,
            student_longitude=longitude,
            token=token,
            ip_address=ip_address,
            browser_info=browser_info,
            secret_key=secret_key
        )
        
        if success:
            return {
                "success": True,
                "message": message,
                "record": _record_payload(record) if record else None,
            }, 200
        else:
            status_code = 400 if record else 409
            return {
                "success": False,
                "message": message,
                "record": _record_payload(record) if record else None,
            }, status_code
    
    except ValueError as e:
        return {"error": f"Invalid data: {str(e)}"}, 400
    except Exception as e:
        db.session.rollback()
        return {"error": f"Check-in failed: {str(e)}"}, 500


@bp.get("/history")
@student_required()
def get_attendance_history():
    """Get student's attendance history."""
    try:
        student_id = str(g.current_student.id)
        limit = int(request.args.get("limit", 50))
        
        if limit < 1 or limit > 500:
            limit = 50
        
        records = AttendanceService.get_student_attendance_history(student_id, limit)
        
        return {
            "student_id": student_id,
            "records": [_record_payload(r) for r in records],
            "total": len(records),
        }, 200
    
    except Exception as e:
        return {"error": f"Failed to fetch history: {str(e)}"}, 500


@bp.get("/sessions/<session_id>/public")
def get_session_public(session_id: str):
    """
    Public endpoint to get session info by UUID (no auth required).
    """
    try:
        session = db.session.query(AttendanceSession).filter_by(
            id=uuid_lib.UUID(session_id)
        ).first()

        if not session:
            return {"error": "Session not found"}, 404

        if not session.is_active():
            return {"error": "Session not active"}, 410

        return {
            "id": str(session.id),
            "session_code": session.session_code,
            "status": session.status,
            "seconds_until_expiry": session.seconds_until_expiry(),
            "allowed_radius_meters": session.allowed_radius_meters,
        }, 200

    except ValueError:
        return {"error": "Invalid session ID"}, 400


@bp.get("/sessions/by-code/<session_code>")
def get_session_by_code(session_code: str):
    """
    Public endpoint to look up a session by its 6-char session code.
    Used by students doing manual code entry.
    """
    session = db.session.query(AttendanceSession).filter_by(
        session_code=session_code.upper()
    ).first()

    if not session:
        return {"error": "Invalid session code"}, 404

    if not session.is_active():
        return {"error": "Session has ended or expired"}, 410

    return {
        "id": str(session.id),
        "session_code": session.session_code,
        "current_token": session.current_token,
        "status": session.status,
        "seconds_until_expiry": session.seconds_until_expiry(),
        "allowed_radius_meters": session.allowed_radius_meters,
    }, 200


@bp.get("/sessions/by-token/<token>")
def get_session_by_token(token: str):
    """
    Public endpoint to look up an active session by its current QR token.
    Used by students after scanning a QR code.
    """
    session = db.session.query(AttendanceSession).filter_by(
        current_token=token,
        status="active"
    ).first()

    if not session:
        return {"error": "Invalid or expired QR code"}, 404

    if not session.is_active():
        return {"error": "Session has ended or expired"}, 410

    return {
        "id": str(session.id),
        "session_code": session.session_code,
        "status": session.status,
        "seconds_until_expiry": session.seconds_until_expiry(),
        "allowed_radius_meters": session.allowed_radius_meters,
    }, 200


# ============================================================================
# ADMIN ENDPOINTS
# ============================================================================

@bp.get("/admin/overview")
@admin_required()
def admin_attendance_overview():
    """Admin view: all sessions across all trainers with student counts."""
    from ..models.subject import Subject
    from ..models.user import User as UserModel
    from sqlalchemy.orm import joinedload

    sessions = (
        db.session.query(AttendanceSession)
        .options(joinedload(AttendanceSession.trainer).joinedload(Trainer.user))
        .order_by(AttendanceSession.started_at.desc())
        .limit(200)
        .all()
    )
    result = []
    for s in sessions:
        subject_name = None
        if s.subject_id:
            subj = db.session.get(Subject, s.subject_id)
            subject_name = subj.name if subj else None
        trainer_name = s.trainer.user.name if s.trainer and s.trainer.user else None
        successful = sum(1 for r in s.records if r.status == "success")
        result.append({
            "id": str(s.id),
            "trainer_name": trainer_name,
            "subject_name": subject_name,
            "session_code": s.session_code,
            "status": s.status,
            "started_at": s.started_at.isoformat(),
            "expires_at": s.expires_at.isoformat(),
            "allowed_radius_meters": s.allowed_radius_meters,
            "total_checkins": successful,
            "total_submissions": len(s.records),
        })
    return result, 200


# ============================================================================
# ERROR HANDLERS
# ============================================================================

@bp.errorhandler(ValueError)
def handle_value_error(error):
    return {"error": str(error)}, 400


@bp.errorhandler(Exception)
def handle_generic_error(error):
    return {"error": "Internal server error"}, 500
