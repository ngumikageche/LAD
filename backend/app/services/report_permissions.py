from __future__ import annotations

from dataclasses import dataclass
from typing import Any
import uuid

from sqlalchemy import exists

from ..extensions import db
from ..models.module import Module
from ..models.student import Student
from ..models.student_subject import StudentSubject
from ..models.subject import Subject
from ..models.trainer_subject import TrainerSubject
from ..models.user import User


@dataclass(frozen=True)
class ReportAccess:
    canView: bool
    canPrint: bool
    canExport: bool
    reason: str


REPORT_PERMISSION_KEYS: dict[str, str] = {
    "student_term": "reports.student.term",
    "student_transcript": "reports.student.transcript",
    "student_attendance": "reports.student.attendance",
    "student_discipline": "reports.student.discipline",
    "student_fees": "reports.student.fees",
    "class_performance": "reports.class.performance",
    "class_at_risk": "reports.class.at_risk",
    "teacher_attendance": "reports.teacher.attendance",
    "teacher_appraisal": "reports.teacher.appraisal",
    "admin_pass_rate": "reports.admin.pass_rate",
    "admin_enrolment": "reports.admin.enrolment",
    "admin_fees": "reports.admin.fees",
    "admin_safeguarding": "reports.admin.safeguarding",
    "admin_compliance": "reports.admin.compliance",
}


STUDENT_REPORTS = {
    "student_term",
    "student_transcript",
    "student_attendance",
    "student_discipline",
    "student_fees",
}

CLASS_REPORTS = {"class_performance", "class_at_risk"}
TEACHER_REPORTS = {"teacher_attendance", "teacher_appraisal"}
ADMIN_REPORTS = {
    "admin_pass_rate",
    "admin_enrolment",
    "admin_fees",
    "admin_safeguarding",
    "admin_compliance",
}


def is_admin_user(user: User) -> bool:
    role_name = ((user.role.role_name if user.role else "") or "").lower()
    permissions = user.role.permissions if user.role else {}
    return role_name in {"admin", "super admin"} or permissions.get("*") is True


def _has_permission(user: User, key: str, action: str) -> bool:
    if is_admin_user(user):
        return True
    permissions = user.role.permissions if user.role else {}
    if permissions.get(key) is True:
        return True
    return permissions.get(f"{key}.{action}") is True


def _is_student_owner(user: User, student_id: uuid.UUID) -> bool:
    return bool(user.student and user.student.id == student_id)


def _trainer_has_student(user: User, student_id: uuid.UUID) -> bool:
    if not user.trainer:
        return False
    return db.session.query(
        exists().where(
            (TrainerSubject.trainer_id == user.trainer.id)
            & (StudentSubject.student_id == student_id)
            & (TrainerSubject.subject_id == StudentSubject.subject_id)
        )
    ).scalar()


def _trainer_has_course(user: User, course_id: uuid.UUID) -> bool:
    if not user.trainer:
        return False
    return db.session.query(
        exists().where(
            (TrainerSubject.trainer_id == user.trainer.id)
            & (Subject.id == TrainerSubject.subject_id)
            & (Subject.module_id == Module.id)
            & (Module.course_id == course_id)
        )
    ).scalar()


def _trainer_is_self(user: User, trainer_id: uuid.UUID) -> bool:
    return bool(user.trainer and user.trainer.id == trainer_id)


def _ownership_allowed(user: User, report_type: str, target_entity_id: str | uuid.UUID | None) -> tuple[bool, str]:
    if is_admin_user(user):
        return True, "Admin access granted"

    target_uuid: uuid.UUID | None = None
    if target_entity_id:
        try:
            target_uuid = uuid.UUID(str(target_entity_id))
        except (TypeError, ValueError):
            return False, "Invalid target entity id"

    if report_type in STUDENT_REPORTS:
        if not target_uuid:
            return False, "Student target is required"
        if _is_student_owner(user, target_uuid):
            return True, "Own student report"
        if user.trainer and report_type != "student_fees" and _trainer_has_student(user, target_uuid):
            return True, "Trainer owns at least one subject for this student"
        return False, "Report is outside this user's ownership scope"

    if report_type in CLASS_REPORTS:
        if not target_uuid:
            return False, "Class/course target is required"
        if user.trainer and _trainer_has_course(user, target_uuid):
            return True, "Trainer owns this class/course through scored learners"
        return False, "Class/course report is outside this user's ownership scope"

    if report_type in TEACHER_REPORTS:
        if not target_uuid:
            return False, "Teacher target is required"
        if _trainer_is_self(user, target_uuid):
            return True, "Own teacher report"
        return False, "Teacher report is outside this user's ownership scope"

    if report_type in ADMIN_REPORTS:
        return False, "Admin report permission requires an admin role"

    return False, "Unknown report type"


def check_report_permission(
    current_user: User,
    report_type: str,
    target_entity_id: str | uuid.UUID | None = None,
) -> ReportAccess:
    key = REPORT_PERMISSION_KEYS.get(report_type)
    if not key:
        return ReportAccess(False, False, False, "Unknown report type")

    if is_admin_user(current_user):
        return ReportAccess(True, True, True, "Admin access granted")

    owns, reason = _ownership_allowed(current_user, report_type, target_entity_id)
    can_view = owns and _has_permission(current_user, key, "view")
    can_print = owns and _has_permission(current_user, key, "print")
    can_export = owns and _has_permission(current_user, key, "export")

    if not owns:
        return ReportAccess(False, False, False, reason)
    if not can_view:
        return ReportAccess(False, False, False, f"Missing permission: {key}")
    return ReportAccess(can_view, can_print, can_export, reason)


def report_access_payload(access: ReportAccess) -> dict[str, Any]:
    return {
        "canView": access.canView,
        "canPrint": access.canPrint,
        "canExport": access.canExport,
        "reason": access.reason,
    }
