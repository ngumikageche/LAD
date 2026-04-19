from flask import Blueprint, request, jsonify
from app.models import (
    Module, Competency, Enrollment, Assessment, CompetencyRecord, Attendance,
    PortfolioEvidence, Alert, DashboardMetric, Survey
)
from app.extensions import db

bp = Blueprint('extra', __name__, url_prefix='/api/extra')

# Example: List all modules
def _module_payload(module: Module) -> dict:
    return {
        'id': str(module.id),
        'course_id': str(module.course_id),
        'name': module.name,
        'description': module.description,
        'created_at': module.created_at,
    }

@bp.get('/modules')
def list_modules():
    modules = Module.query.all()
    return jsonify([_module_payload(m) for m in modules])

# Add similar endpoints for other tables as needed
