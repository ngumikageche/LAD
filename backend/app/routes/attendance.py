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


def _session_owned_by_current_trainer(session) -> bool:
    return not g.current_trainer or session.trainer_id == g.current_trainer.id


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
        duration = int(data.get("duration_minutes", 5))
        regen_interval = int(data.get("regeneration_interval", 25))
        
        if not subject_id and not course_id and not module_id:
            return {"error": "subject_id, course_id, or module_id required"}, 400
        
        if duration < 5 or duration > 480:
            return {"error": "Duration must be 5-480 minutes"}, 400
        
        if regen_interval < 10 or regen_interval > 300:
            return {"error": "Regeneration interval must be 10-300 seconds"}, 400
        
        if allowed_radius < 20 or allowed_radius > 100:
            return {"error": "Allowed radius must be 20-100 meters"}, 400
        
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


@bp.get("/sessions/my")
@trainer_or_admin_required("attendance.read")
def get_my_sessions():
    """Get all sessions for the current trainer (or all sessions for admin)."""
    trainer = g.current_trainer
    q = db.session.query(AttendanceSession)
    if trainer:
        q = q.filter_by(trainer_id=trainer.id)
    sessions = q.order_by(AttendanceSession.started_at.desc()).limit(100).all()
    return [_session_payload(s) for s in sessions], 200


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
        if not _session_owned_by_current_trainer(session):
            return {"error": "Unauthorized"}, 403
        
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
        if not _session_owned_by_current_trainer(session):
            return {"error": "Unauthorized"}, 403
        
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
        session = db.session.query(AttendanceSession).filter_by(id=uuid_lib.UUID(session_id)).first()
        if session and not _session_owned_by_current_trainer(session):
            return {"error": "Unauthorized"}, 403
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
        if not _session_owned_by_current_trainer(session):
            return {"error": "Unauthorized"}, 403
        
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
    session = AttendanceService.resolve_session_by_token(token)

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


@bp.get("/admin/analytics")
@admin_required()
def admin_attendance_analytics():
    """Aggregated analytics for admin charts."""
    from ..models.subject import Subject
    from sqlalchemy import func, cast, Date
    from datetime import datetime, timedelta

    # Daily check-ins for last 30 days
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    daily_rows = (
        db.session.query(
            cast(AttendanceRecord.checked_in_at, Date).label("day"),
            func.count(AttendanceRecord.id).label("total"),
            func.sum(
                db.case((AttendanceRecord.status == "success", 1), else_=0)
            ).label("successful"),
        )
        .filter(AttendanceRecord.checked_in_at >= thirty_days_ago)
        .group_by(cast(AttendanceRecord.checked_in_at, Date))
        .order_by(cast(AttendanceRecord.checked_in_at, Date))
        .all()
    )
    daily = [
        {"date": str(r.day), "total": r.total, "successful": int(r.successful or 0)}
        for r in daily_rows
    ]

    # Check-in status breakdown (all time)
    status_rows = (
        db.session.query(AttendanceRecord.status, func.count(AttendanceRecord.id))
        .group_by(AttendanceRecord.status)
        .all()
    )
    status_breakdown = [{"status": s, "count": c} for s, c in status_rows]

    # Top 10 subjects by check-ins
    subject_rows = (
        db.session.query(
            AttendanceSession.subject_id,
            func.count(AttendanceRecord.id).label("checkins"),
        )
        .join(AttendanceRecord, AttendanceRecord.attendance_session_id == AttendanceSession.id)
        .filter(AttendanceRecord.status == "success")
        .group_by(AttendanceSession.subject_id)
        .order_by(func.count(AttendanceRecord.id).desc())
        .limit(10)
        .all()
    )
    by_subject = []
    for sid, count in subject_rows:
        name = "Unknown"
        if sid:
            subj = db.session.get(Subject, sid)
            name = subj.name if subj else str(sid)[:8]
        by_subject.append({"subject": name, "checkins": count})

    # Top 10 trainers by sessions run
    trainer_rows = (
        db.session.query(
            AttendanceSession.trainer_id,
            func.count(AttendanceSession.id).label("sessions"),
            func.sum(
                db.case((AttendanceRecord.status == "success", 1), else_=0)
            ).label("checkins"),
        )
        .outerjoin(AttendanceRecord, AttendanceRecord.attendance_session_id == AttendanceSession.id)
        .group_by(AttendanceSession.trainer_id)
        .order_by(func.count(AttendanceSession.id).desc())
        .limit(10)
        .all()
    )
    by_trainer = []
    for tid, sessions_count, checkins in trainer_rows:
        name = "Unknown"
        if tid:
            t = db.session.get(Trainer, tid)
            name = t.user.name if t and t.user else str(tid)[:8]
        by_trainer.append({"trainer": name, "sessions": sessions_count, "checkins": int(checkins or 0)})

    # Overall summary
    total_sessions = db.session.query(func.count(AttendanceSession.id)).scalar() or 0
    total_checkins = db.session.query(func.count(AttendanceRecord.id)).filter(AttendanceRecord.status == "success").scalar() or 0
    active_sessions = db.session.query(func.count(AttendanceSession.id)).filter(AttendanceSession.status == "active").scalar() or 0
    manual_checkins = db.session.query(func.count(AttendanceRecord.id)).filter(AttendanceRecord.status == "manual").scalar() or 0

    return {
        "summary": {
            "total_sessions": total_sessions,
            "total_checkins": total_checkins,
            "active_sessions": active_sessions,
            "manual_checkins": manual_checkins,
        },
        "daily": daily,
        "status_breakdown": status_breakdown,
        "by_subject": by_subject,
        "by_trainer": by_trainer,
    }, 200


@bp.get("/trainer/analytics")
@trainer_or_admin_required("attendance.read")
def trainer_attendance_analytics():
    """Aggregated analytics for trainer charts."""
    from sqlalchemy import func, cast, Date
    from datetime import datetime, timedelta

    trainer = g.current_trainer
    if not trainer:
        return {"error": "Trainer profile not found"}, 404

    # Per-session summary (last 20 sessions)
    sessions = (
        db.session.query(AttendanceSession)
        .filter_by(trainer_id=trainer.id)
        .order_by(AttendanceSession.started_at.desc())
        .limit(20)
        .all()
    )

    per_session = []
    for s in sessions:
        from ..models.subject import Subject
        subject_name = "Unknown"
        if s.subject_id:
            subj = db.session.get(Subject, s.subject_id)
            subject_name = subj.name[:20] if subj else "Unknown"
        successful = sum(1 for r in s.records if r.status in ("success", "manual"))
        failed = sum(1 for r in s.records if r.status not in ("success", "manual"))
        per_session.append({
            "label": f"{subject_name} ({s.started_at.strftime('%d/%m')})",
            "present": successful,
            "failed": failed,
            "date": s.started_at.strftime("%d %b"),
        })
    per_session.reverse()  # chronological order

    # Daily check-ins last 30 days for this trainer
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    daily_rows = (
        db.session.query(
            cast(AttendanceRecord.checked_in_at, Date).label("day"),
            func.count(AttendanceRecord.id).label("checkins"),
        )
        .join(AttendanceSession, AttendanceRecord.attendance_session_id == AttendanceSession.id)
        .filter(
            AttendanceSession.trainer_id == trainer.id,
            AttendanceRecord.checked_in_at >= thirty_days_ago,
            AttendanceRecord.status.in_(["success", "manual"]),
        )
        .group_by(cast(AttendanceRecord.checked_in_at, Date))
        .order_by(cast(AttendanceRecord.checked_in_at, Date))
        .all()
    )
    daily = [{"date": str(r.day), "checkins": r.checkins} for r in daily_rows]

    # Status breakdown for this trainer
    status_rows = (
        db.session.query(AttendanceRecord.status, func.count(AttendanceRecord.id))
        .join(AttendanceSession, AttendanceRecord.attendance_session_id == AttendanceSession.id)
        .filter(AttendanceSession.trainer_id == trainer.id)
        .group_by(AttendanceRecord.status)
        .all()
    )
    status_breakdown = [{"status": s, "count": c} for s, c in status_rows]

    total_sessions = len(sessions)
    total_checkins = sum(p["present"] for p in per_session)

    return {
        "summary": {
            "total_sessions": total_sessions,
            "total_checkins": total_checkins,
        },
        "per_session": per_session,
        "daily": daily,
        "status_breakdown": status_breakdown,
    }, 200
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
# MANUAL ATTENDANCE (trainer marks students without QR/GPS)
# ============================================================================

@bp.post("/sessions/<session_id>/manual-checkin")
@trainer_or_admin_required("attendance.create")
def manual_checkin(session_id: str):
    """
    Trainer manually marks one or more students as present.
    Accepts: { "students": ["STU001", "STU002", ...] }  (codes or reg numbers)
    or:      { "student_id": "STU001" }  (single)
    """
    try:
        session = db.session.query(AttendanceSession).filter_by(
            id=uuid_lib.UUID(session_id)
        ).first()
        if not session:
            return {"error": "Session not found"}, 404
        if session.status == "ended":
            return {"error": "Session has ended"}, 409
        if not _session_owned_by_current_trainer(session):
            return {"error": "Unauthorized"}, 403
    except ValueError:
        return {"error": "Invalid session ID"}, 400

    data = request.get_json(silent=True) or {}
    # Accept single or list
    raw = data.get("students") or ([data["student_id"]] if data.get("student_id") else [])
    if not raw:
        return {"error": "Provide 'students' list or 'student_id'"}, 400

    results = []
    for key in raw:
        key = str(key).strip()
        student = (
            db.session.query(Student).filter_by(code=key).first()
            or db.session.query(Student).filter_by(registration_number=key).first()
        )
        if not student:
            results.append({"key": key, "status": "error", "message": "Student not found"})
            continue

        existing = db.session.query(AttendanceRecord).filter_by(
            attendance_session_id=session.id, student_id=student.id
        ).first()
        if existing:
            results.append({"key": key, "status": "duplicate", "message": "Already marked"})
            continue

        record = AttendanceRecord(
            attendance_session_id=session.id,
            student_id=student.id,
            latitude=session.latitude,
            longitude=session.longitude,
            ip_address="manual",
            status="manual",
            distance_from_trainer=0.0,
        )
        db.session.add(record)
        results.append({"key": key, "status": "ok", "student_name": student.user.name if student.user else key})

    db.session.commit()
    ok = sum(1 for r in results if r["status"] == "ok")
    return {"marked": ok, "results": results}, 200


@bp.post("/sessions/<session_id>/manual-remove")
@trainer_or_admin_required("attendance.create")
def manual_remove(session_id: str):
    """Remove a manual attendance record (undo)."""
    try:
        session_uuid = uuid_lib.UUID(session_id)
    except ValueError:
        return {"error": "Invalid session ID"}, 400

    data = request.get_json(silent=True) or {}
    key = str(data.get("student_id", "")).strip()
    if not key:
        return {"error": "student_id required"}, 400

    student = (
        db.session.query(Student).filter_by(code=key).first()
        or db.session.query(Student).filter_by(registration_number=key).first()
    )
    if not student:
        return {"error": "Student not found"}, 404

    session = db.session.query(AttendanceSession).filter_by(id=session_uuid).first()
    if not session:
        return {"error": "Session not found"}, 404
    if not _session_owned_by_current_trainer(session):
        return {"error": "Unauthorized"}, 403
    record = db.session.query(AttendanceRecord).filter_by(
        attendance_session_id=session_uuid, student_id=student.id
    ).first()
    if not record:
        return {"error": "No attendance record found"}, 404

    db.session.delete(record)
    db.session.commit()
    return {"status": "removed"}, 200


@bp.post("/manual-session")
@trainer_or_admin_required("attendance.create")
def create_manual_session():
    """
    Create a lightweight manual-only attendance session (no GPS/QR required).
    Body: { "subject_id": "...", "course_id": "...", "module_id": "...", "date": "2026-06-01" }
    """
    data = request.get_json(silent=True) or {}
    subject_id = data.get("subject_id")
    course_id = data.get("course_id")
    module_id = data.get("module_id")

    if not any([subject_id, course_id, module_id]):
        return {"error": "subject_id, course_id, or module_id required"}, 400

    if g.current_trainer:
        trainer_id = g.current_trainer.id
    else:
        tid = data.get("trainer_id")
        if not tid:
            return {"error": "trainer_id required"}, 400
        try:
            trainer_id = uuid_lib.UUID(tid)
        except ValueError:
            return {"error": "Invalid trainer_id"}, 400

    import secrets
    from datetime import datetime, timedelta
    secret_key = current_app.config.get("SECRET_KEY", "default-secret")
    session_code = secrets.token_hex(3).upper()
    token = secrets.token_urlsafe(32)
    now = datetime.utcnow()

    session = AttendanceSession(
        trainer_id=trainer_id,
        subject_id=uuid_lib.UUID(subject_id) if subject_id else None,
        course_id=uuid_lib.UUID(course_id) if course_id else None,
        module_id=uuid_lib.UUID(module_id) if module_id else None,
        current_token=token,
        session_code=session_code,
        qr_seed=token,
        latitude=0.0,
        longitude=0.0,
        allowed_radius_meters=0,
        started_at=now,
        expires_at=now + timedelta(hours=24),
        status="active",
        regeneration_interval=86400,
    )
    db.session.add(session)
    db.session.commit()
    return {"session": _session_payload(session)}, 201


# ============================================================================
# ERROR HANDLERS
# ============================================================================

@bp.errorhandler(ValueError)
def handle_value_error(error):
    return {"error": str(error)}, 400


@bp.errorhandler(Exception)
def handle_generic_error(error):
    return {"error": "Internal server error"}, 500
