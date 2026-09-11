"""
What the Attendance Signal counts as a sitting, and as attended.

A learner the trainer marked present by hand was counted absent, and every
session still open — or opened and closed with nobody recorded — marked the
whole class absent. Both held the signal well under what the register showed.
"""

import uuid
from datetime import datetime, timedelta

from werkzeug.security import generate_password_hash


def _seed(app):
    """
    One trainer, one subject, two learners, and five QR sessions:

      held      both recorded — one scanned, one marked present by hand
      held      only the scanner recorded
      empty     closed with nobody recorded           → not a sitting
      open      still running, the scanner is in       → not a sitting yet
      lapsed    left "active" past its expiry, scanner recorded
    """
    from app.extensions import db
    from app.models.attendance_session import AttendanceRecord, AttendanceSession
    from app.models.course import Course
    from app.models.department import Department
    from app.models.institution import Institution
    from app.models.module import Module
    from app.models.role_permission import RolePermission
    from app.models.student import Student
    from app.models.student_subject import StudentSubject
    from app.models.subject import Subject
    from app.models.trainer import Trainer
    from app.models.trainer_subject import TrainerSubject
    from app.models.user import User

    with app.app_context():
        role = RolePermission(role_name="Trainer", permissions={"analytics.read": True})
        institution = Institution(name="LAD College", type="College", location="Nairobi")
        db.session.add_all([role, institution])
        db.session.flush()
        department = Department(institution_id=institution.id, name="Engineering")
        db.session.add(department)
        db.session.flush()
        course = Course(department_id=department.id, name="Electrical", cbet_level="Level 5")
        db.session.add(course)
        db.session.flush()
        module = Module(course_id=course.id, name="Circuits")
        db.session.add(module)
        db.session.flush()
        subject = Subject(module_id=module.id, name="Circuit Analysis")
        db.session.add(subject)
        db.session.flush()

        def person(name, email):
            user = User(
                name=name,
                email=email,
                password_hash=generate_password_hash("S3cret!"),
                role_id=role.id,
                institution_id=institution.id,
            )
            db.session.add(user)
            db.session.flush()
            return user

        trainer = Trainer(user_id=person("Trainer", "trainer@example.com").id, department_id=department.id)
        scanner = Student(
            user_id=person("Scanner", "scanner@example.com").id,
            registration_number="REG-001",
            course_id=course.id,
            enrollment_year=2026,
        )
        hand_marked = Student(
            user_id=person("Hand Marked", "hand@example.com").id,
            registration_number="REG-002",
            course_id=course.id,
            enrollment_year=2026,
        )
        db.session.add_all([trainer, scanner, hand_marked])
        db.session.flush()
        db.session.add_all([
            TrainerSubject(trainer_id=trainer.id, subject_id=subject.id),
            StudentSubject(student_id=scanner.id, subject_id=subject.id),
            StudentSubject(student_id=hand_marked.id, subject_id=subject.id),
        ])

        now = datetime.utcnow()
        yesterday = now - timedelta(days=1)

        def session(code, status, started_at, expires_at):
            row = AttendanceSession(
                trainer_id=trainer.id,
                subject_id=subject.id,
                current_token=f"token-{code}",
                session_code=code,
                qr_seed=f"seed-{code}",
                latitude=0.0,
                longitude=0.0,
                started_at=started_at,
                expires_at=expires_at,
                status=status,
            )
            db.session.add(row)
            db.session.flush()
            return row

        def check_in(row, student, status="success"):
            db.session.add(AttendanceRecord(
                attendance_session_id=row.id,
                student_id=student.id,
                latitude=0.0,
                longitude=0.0,
                ip_address="manual" if status == "manual" else "10.0.0.1",
                status=status,
            ))

        held = session("HELD01", "ended", yesterday, yesterday + timedelta(hours=1))
        check_in(held, scanner)
        check_in(held, hand_marked, status="manual")

        held_again = session("HELD02", "ended", yesterday, yesterday + timedelta(hours=1))
        check_in(held_again, scanner)

        session("EMPTY1", "ended", yesterday, yesterday + timedelta(hours=1))

        running = session("OPEN01", "active", now - timedelta(minutes=5), now + timedelta(minutes=55))
        check_in(running, scanner)

        lapsed = session("LAPSE1", "active", yesterday, yesterday + timedelta(hours=1))
        check_in(lapsed, scanner)

        db.session.commit()
        return {
            "trainer_id": str(trainer.id),
            "scanner_id": str(scanner.id),
            "hand_marked_id": str(hand_marked.id),
        }


def test_signal_counts_hand_marked_learners_and_skips_open_or_empty_sessions(app):
    ids = _seed(app)
    from app.services.learning_analytics import get_attendance_performance

    with app.app_context():
        items = get_attendance_performance.uncached(trainer_id=ids["trainer_id"])["items"]
    rates = {item["student_id"]: item["attendance_rate"] for item in items}

    # Three sittings each: the two held sessions and the lapsed one.
    assert rates[ids["scanner_id"]] == 100.0
    # Present at the first by hand, absent from the other two.
    assert rates[ids["hand_marked_id"]] == 33.33


def test_alerts_read_the_same_sittings_as_the_signal(app):
    ids = _seed(app)
    from app.services.alerts import attendance_rate

    with app.app_context():
        scanner_rate, scanner_sittings = attendance_rate(uuid.UUID(ids["scanner_id"]))
        marked_rate, marked_sittings = attendance_rate(uuid.UUID(ids["hand_marked_id"]))

    assert (scanner_rate, scanner_sittings) == (100.0, 3)
    assert (marked_rate, marked_sittings) == (33.3, 3)
