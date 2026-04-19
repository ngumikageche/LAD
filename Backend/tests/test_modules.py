import pytest
from app.extensions import db
from app.models.module import Module
from app.models.course import Course
from app.models.department import Department
from app.models.institution import Institution
from datetime import datetime
import uuid

MODULE_NAME = "test_module"

@pytest.fixture
def course(app):
    with app.app_context():
        inst = Institution(id=str(uuid.uuid4()), name="Test Inst")
        db.session.add(inst)
        db.session.commit()
        dept = Department(id=str(uuid.uuid4()), name="Test Dept", institution_id=inst.id)
        db.session.add(dept)
        db.session.commit()
        course = Course(id="c05504f8-f6e0-4fcc-9f6b-37425c9eae4c", name="Test Course", department_id=dept.id)
        db.session.add(course)
        db.session.commit()
        return course

def create_module(name, course_id, deleted_at=None):
    module = Module(name=name, course_id=course_id)
    if deleted_at:
        module.deleted_at = deleted_at
    db.session.add(module)
    db.session.commit()
    return module

def test_create_module(client, course):
    resp = client.post("/modules", json={"name": MODULE_NAME, "course_id": course.id})
    assert resp.status_code == 201
    data = resp.get_json()
    assert data["name"] == MODULE_NAME
    assert data["course_id"] == course.id

def test_duplicate_module(client, course):
    create_module(MODULE_NAME, course.id)
    resp = client.post("/modules", json={"name": MODULE_NAME, "course_id": course.id})
    assert resp.status_code == 409
    assert "already exists" in resp.get_json()["error"].lower()

def test_undelete_module(client, course):
    # Create and soft-delete
    m = create_module(MODULE_NAME, course.id)
    m.deleted_at = datetime.utcnow()
    db.session.commit()
    # Should allow re-create
    resp = client.post("/modules", json={"name": MODULE_NAME, "course_id": course.id})
    assert resp.status_code == 201
    data = resp.get_json()
    assert data["name"] == MODULE_NAME
    assert data["course_id"] == course.id
