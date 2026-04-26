from __future__ import annotations

from flask import Blueprint, g, request

from ..services.student_portal import student_announcements
from .permissions import student_required


bp = Blueprint("announcements_v1", __name__, url_prefix="/api/v1/announcements")


@bp.get("")
@student_required()
def list_student_announcements():
    page = max(int(request.args.get("page", 1)), 1)
    per_page = min(max(int(request.args.get("per_page", 20)), 1), 100)
    return student_announcements(g.current_student, page, per_page), 200
