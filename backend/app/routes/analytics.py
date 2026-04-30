from __future__ import annotations

import uuid
from flask import Blueprint, request
from sqlalchemy import func, and_
from datetime import datetime

from ..extensions import db
from ..models.score import Score
from ..models.assessment import Assessment
from ..models.enrollment import Enrollment
from ..models.course import Course
from ..models.student import Student
from ..models.term import Term
from .permissions import require_permission

bp = Blueprint("analytics", __name__, url_prefix="/analytics")


def _parse_uuid(value: str | None, field: str) -> uuid.UUID:
    if not value:
        raise ValueError(f"Missing '{field}'")
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError) as exc:
        raise ValueError(f"Invalid '{field}'") from exc


@bp.get("/students/<student_id>/performance/summary")
def student_performance_summary(student_id: str):
    """Get student's performance summary (average score, stats)"""
    user, error, status = require_permission("analytics.read")
    if error:
        return error, status

    try:
        student_uuid = _parse_uuid(student_id, "student_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    student = db.session.get(Student, student_uuid)
    if not student:
        return {"error": "Student not found"}, 404

    # Get all scores for this student
    scores = db.session.query(Score).join(Enrollment).filter(
        Enrollment.student_id == student_uuid
    ).all()

    if not scores:
        return {
            "student_id": str(student_uuid),
            "overall_avg": 0,
            "total_assessments": 0,
            "passed_count": 0,
            "failed_count": 0,
            "avg_by_subject": [],
            "avg_by_term": [],
        }, 200

    # Calculate overall average
    total_marks = sum(s.marks_obtained for s in scores)
    max_possible = sum(s.assessment.total_marks for s in scores) if scores else 1
    overall_avg = (total_marks / max_possible * 100) if max_possible > 0 else 0

    # Count pass/fail
    passed_count = sum(1 for s in scores if s.is_passed)
    failed_count = sum(1 for s in scores if s.is_passed is False)

    # Average by subject
    subject_avg = {}
    for score in scores:
        course_id = str(score.enrollment.course_id)
        course_name = score.enrollment.course.name
        if course_id not in subject_avg:
            subject_avg[course_id] = {"name": course_name, "scores": [], "total_marks": []}
        subject_avg[course_id]["scores"].append(score.marks_obtained)
        subject_avg[course_id]["total_marks"].append(score.assessment.total_marks)

    avg_by_subject = []
    for course_id, data in subject_avg.items():
        total = sum(data["scores"])
        max_marks = sum(data["total_marks"])
        avg = (total / max_marks * 100) if max_marks > 0 else 0
        avg_by_subject.append({
            "course_id": course_id,
            "course_name": data["name"],
            "average": round(avg, 2),
            "score_count": len(data["scores"]),
        })

    # Average by term
    term_avg = {}
    for score in scores:
        term_id = str(score.assessment.term_id)
        term_name = score.assessment.term.name if score.assessment.term else "Unknown"
        if term_id not in term_avg:
            term_avg[term_id] = {"name": term_name, "scores": [], "total_marks": []}
        term_avg[term_id]["scores"].append(score.marks_obtained)
        term_avg[term_id]["total_marks"].append(score.assessment.total_marks)

    avg_by_term = []
    for term_id, data in term_avg.items():
        total = sum(data["scores"])
        max_marks = sum(data["total_marks"])
        avg = (total / max_marks * 100) if max_marks > 0 else 0
        avg_by_term.append({
            "term_id": term_id,
            "term_name": data["name"],
            "average": round(avg, 2),
            "score_count": len(data["scores"]),
        })

    return {
        "student_id": str(student_uuid),
        "overall_avg": round(overall_avg, 2),
        "total_assessments": len(scores),
        "passed_count": passed_count,
        "failed_count": failed_count,
        "avg_by_subject": sorted(avg_by_subject, key=lambda x: x["average"]),
        "avg_by_term": sorted(avg_by_term, key=lambda x: x["term_name"]),
    }, 200


@bp.get("/students/<student_id>/performance/trends")
def student_performance_trends(student_id: str):
    """Get student's performance trends over time"""
    user, error, status = require_permission("analytics.read")
    if error:
        return error, status

    try:
        student_uuid = _parse_uuid(student_id, "student_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    student = db.session.get(Student, student_uuid)
    if not student:
        return {"error": "Student not found"}, 404

    # Get scores ordered by term
    scores_by_term = db.session.query(Score).join(
        Enrollment
    ).join(
        Assessment
    ).filter(
        Enrollment.student_id == student_uuid
    ).order_by(
        Assessment.term_id
    ).all()

    # Group by term and calculate average per term
    term_trends = {}
    for score in scores_by_term:
        term_id = str(score.assessment.term_id)
        if term_id not in term_trends:
            term_trends[term_id] = {
                "term_name": score.assessment.term.name if score.assessment.term else "Unknown",
                "scores": [],
                "total_marks": [],
            }
        term_trends[term_id]["scores"].append(score.marks_obtained)
        term_trends[term_id]["total_marks"].append(score.assessment.total_marks)

    # Calculate trend per term
    trends = []
    previous_avg = None
    for term_id, data in sorted(term_trends.items()):
        total = sum(data["scores"])
        max_marks = sum(data["total_marks"])
        avg = (total / max_marks * 100) if max_marks > 0 else 0

        # Calculate trend indicator
        trend_indicator = None
        if previous_avg is not None:
            change = avg - previous_avg
            if change > 5:
                trend_indicator = "improved"
            elif change < -5:
                trend_indicator = "declined"
            else:
                trend_indicator = "stable"

        trends.append({
            "term_id": term_id,
            "term_name": data["term_name"],
            "average": round(avg, 2),
            "trend": trend_indicator,
            "score_count": len(data["scores"]),
        })

        previous_avg = avg

    return {
        "student_id": str(student_uuid),
        "trends": trends,
    }, 200


@bp.get("/students/<student_id>/performance/weak-subjects")
def student_weak_subjects(student_id: str):
    """Identify subjects where student performed poorly"""
    user, error, status = require_permission("analytics.read")
    if error:
        return error, status

    try:
        student_uuid = _parse_uuid(student_id, "student_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    student = db.session.get(Student, student_uuid)
    if not student:
        return {"error": "Student not found"}, 404

    # Get all scores by subject
    scores = db.session.query(Score).join(Enrollment).filter(
        Enrollment.student_id == student_uuid
    ).all()

    subject_stats = {}
    for score in scores:
        course_id = str(score.enrollment.course_id)
        course_name = score.enrollment.course.name
        if course_id not in subject_stats:
            subject_stats[course_id] = {
                "name": course_name,
                "scores": [],
                "total_marks": [],
                "pass_count": 0,
                "fail_count": 0,
            }
        subject_stats[course_id]["scores"].append(score.marks_obtained)
        subject_stats[course_id]["total_marks"].append(score.assessment.total_marks)
        if score.is_passed:
            subject_stats[course_id]["pass_count"] += 1
        elif score.is_passed is False:
            subject_stats[course_id]["fail_count"] += 1

    # Calculate statistics
    weak_subjects = []
    for course_id, stats in subject_stats.items():
        total = sum(stats["scores"])
        max_marks = sum(stats["total_marks"])
        avg = (total / max_marks * 100) if max_marks > 0 else 0

        # Determine status
        if stats["fail_count"] > 0:
            status_label = "needs_improvement"
        elif avg < 50:
            status_label = "poor"
        elif avg < 70:
            status_label = "fair"
        else:
            status_label = "good"

        if status_label in ["poor", "fair", "needs_improvement"]:
            weak_subjects.append({
                "course_id": course_id,
                "course_name": stats["name"],
                "average": round(avg, 2),
                "pass_count": stats["pass_count"],
                "fail_count": stats["fail_count"],
                "status": status_label,
            })

    # Sort by average (lowest first)
    weak_subjects.sort(key=lambda x: x["average"])

    return {
        "student_id": str(student_uuid),
        "weak_subjects": weak_subjects,
    }, 200


@bp.get("/students/<student_id>/dashboard")
def student_dashboard(student_id: str):
    """Get comprehensive dashboard data for student"""
    user, error, status = require_permission("analytics.read")
    if error:
        return error, status

    try:
        student_uuid = _parse_uuid(student_id, "student_id")
    except ValueError as exc:
        return {"error": str(exc)}, 400

    student = db.session.get(Student, student_uuid)
    if not student:
        return {"error": "Student not found"}, 404

    # Get performance summary
    summary_resp, _ = student_performance_summary(student_id)
    
    # Get recent scores (last 5)
    recent_scores = db.session.query(Score).join(
        Enrollment
    ).filter(
        Enrollment.student_id == student_uuid
    ).order_by(Score.created_at.desc()).limit(5).all()

    recent_results = []
    for score in recent_scores:
        recent_results.append({
            "id": str(score.id),
            "course_name": score.enrollment.course.name,
            "assessment_name": score.assessment.name,
            "marks": score.marks_obtained,
            "total_marks": score.assessment.total_marks,
            "grade": score.grade,
            "is_passed": score.is_passed,
            "date": score.created_at.isoformat() if score.created_at else None,
        })

    # Get enrolled courses
    enrollments = db.session.query(Enrollment).filter(
        Enrollment.student_id == student_uuid
    ).all()
    enrolled_courses = [
        {
            "id": str(e.course_id),
            "name": e.course.name,
            "term": e.term.name if e.term else None,
            "status": e.status,
        }
        for e in enrollments
    ]

    return {
        "student_id": str(student_uuid),
        "overall_avg": summary_resp.get("overall_avg"),
        "total_assessments": summary_resp.get("total_assessments"),
        "enrolled_courses_count": len(enrolled_courses),
        "enrolled_courses": enrolled_courses,
        "recent_results": recent_results,
        "weak_subjects": summary_resp.get("avg_by_subject", [])[:3],  # Top 3 weak subjects
    }, 200
