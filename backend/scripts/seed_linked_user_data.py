import argparse
import random
import sys
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app import create_app
from app.extensions import db
from app.models.alert import Alert
from app.models.assessment import Assessment
from app.models.attendance import Attendance
from app.models.competency import Competency
from app.models.competency_record import CompetencyRecord
from app.models.enrollment import Enrollment
from app.models.module import Module
from app.models.notification import Notification
from app.models.portfolio_evidence import PortfolioEvidence
from app.models.score import Score
from app.models.student import Student
from app.models.subject import Subject
from app.models.term import Term
from app.models.trainer import Trainer
from app.models.trainer_subject import TrainerSubject
from app.models.user import User


ATTENDANCE_STATUSES = ["present", "present", "present", "late", "absent"]
ASSESSMENT_TYPES = ["quiz", "assignment", "exam", "project"]


@dataclass
class Summary:
    terms_created: int = 0
    assessments_created: int = 0
    scores_created: int = 0
    attendance_created: int = 0
    competency_records_created: int = 0
    portfolio_entries_created: int = 0
    alerts_created: int = 0
    notifications_created: int = 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Bulk seed linked records for previously generated users."
    )
    parser.add_argument("--prefix", default="seed", help="Match generated users by email prefix, e.g. seed.")
    parser.add_argument("--seed", type=int, default=99, help="Random seed for reproducible linked data.")
    parser.add_argument("--attendance-days", type=int, default=12, help="Attendance days to generate per enrollment.")
    parser.add_argument("--portfolio-rate", type=float, default=0.7, help="Share of competencies that receive portfolio evidence.")
    parser.add_argument("--risk-threshold", type=float, default=50.0, help="Score threshold used to create risk alerts.")
    return parser.parse_args()


def ensure_terms(summary: Summary) -> list[Term]:
    terms = db.session.query(Term).filter(Term.deleted_at.is_(None)).order_by(Term.start_date.asc()).all()
    if terms:
        return terms

    year = datetime.utcnow().year
    term_specs = [
        ("Term 1", datetime(year, 1, 10), datetime(year, 4, 5), False),
        ("Term 2", datetime(year, 5, 6), datetime(year, 8, 20), True),
        ("Term 3", datetime(year, 9, 2), datetime(year, 12, 10), False),
    ]
    for name, start_dt, end_dt, active in term_specs:
        db.session.add(
            Term(name=f"{name} {year}", start_date=start_dt, end_date=end_dt, is_active=active)
        )
        summary.terms_created += 1
    db.session.flush()
    return db.session.query(Term).filter(Term.deleted_at.is_(None)).order_by(Term.start_date.asc()).all()


def grade_for_score(score: float) -> str:
    if score >= 80:
        return "A"
    if score >= 70:
        return "B"
    if score >= 60:
        return "C"
    if score >= 50:
        return "D"
    return "F"


def competency_status(score: float, competency: Competency | None) -> str:
    threshold = competency.mastery_threshold if competency else 75.0
    if score >= threshold:
        return "mastered"
    if score >= threshold * 0.7:
        return "developing"
    return "needs_support"


def get_seeded_students(prefix: str) -> list[Student]:
    pattern = f"{prefix}.student.%"
    return (
        db.session.query(Student)
        .join(User, User.id == Student.user_id)
        .filter(User.email.like(pattern), Student.deleted_at.is_(None))
        .order_by(Student.created_at.asc())
        .all()
    )


def get_seeded_trainers(prefix: str) -> list[Trainer]:
    pattern = f"{prefix}.trainer.%"
    return (
        db.session.query(Trainer)
        .join(User, User.id == Trainer.user_id)
        .filter(User.email.like(pattern), Trainer.deleted_at.is_(None))
        .order_by(Trainer.created_at.asc())
        .all()
    )


def pick_trainer_for_subject(subject_id, trainer_subject_map: dict) -> Trainer | None:
    trainers = trainer_subject_map.get(subject_id, [])
    return trainers[0] if trainers else None


def ensure_assessment(
    subject: Subject,
    module: Module | None,
    course_id,
    term: Term,
    competency: Competency | None,
    assessment_type: str,
    summary: Summary,
) -> Assessment:
    name = f"{subject.name} {assessment_type.title()} {term.name}"
    assessment = (
        db.session.query(Assessment)
        .filter(
            Assessment.course_id == course_id,
            Assessment.term_id == term.id,
            Assessment.module_id == (module.id if module else None),
            Assessment.competency_id == (competency.id if competency else None),
            Assessment.name == name,
        )
        .first()
    )
    if assessment:
        return assessment

    assessment = Assessment(
        course_id=course_id,
        term_id=term.id,
        module_id=module.id if module else None,
        competency_id=competency.id if competency else None,
        name=name,
        description=f"Auto-generated {assessment_type} for {subject.name} in {term.name}.",
        assessment_type=assessment_type,
        total_marks=100,
        pass_marks=50,
        weight=25 if assessment_type != "exam" else 40,
        recorded_at=term.start_date.date().isoformat(),
    )
    db.session.add(assessment)
    db.session.flush()
    summary.assessments_created += 1
    return assessment


def ensure_notification(user_id, title: str, message: str, is_read: bool, summary: Summary) -> None:
    existing = (
        db.session.query(Notification)
        .filter(Notification.user_id == user_id, Notification.title == title, Notification.message == message)
        .first()
    )
    if existing:
        return
    db.session.add(Notification(user_id=user_id, title=title, message=message, is_read=is_read))
    summary.notifications_created += 1


def ensure_alert(student_id, competency_id, alert_type: str, message: str, resolved: bool, summary: Summary) -> None:
    existing = (
        db.session.query(Alert)
        .filter(
            Alert.student_id == student_id,
            Alert.competency_id == competency_id,
            Alert.alert_type == alert_type,
            Alert.message == message,
        )
        .first()
    )
    if existing:
        return
    db.session.add(
        Alert(
            student_id=student_id,
            competency_id=competency_id,
            alert_type=alert_type,
            message=message,
            resolved=resolved,
        )
    )
    summary.alerts_created += 1


def main() -> None:
    args = parse_args()
    rng = random.Random(args.seed)
    app = create_app()

    with app.app_context():
        summary = Summary()
        terms = ensure_terms(summary)
        seeded_students = get_seeded_students(args.prefix)
        seeded_trainers = get_seeded_trainers(args.prefix)

        if not seeded_students:
            raise SystemExit(f"No seeded students found for prefix '{args.prefix}'. Run seed_random_users.py first.")

        trainer_subject_rows = (
            db.session.query(TrainerSubject)
            .join(Trainer, Trainer.id == TrainerSubject.trainer_id)
            .join(User, User.id == Trainer.user_id)
            .filter(User.email.like(f"{args.prefix}.trainer.%"))
            .all()
        )
        trainer_map_by_subject: dict = {}
        trainer_lookup = {trainer.id: trainer for trainer in seeded_trainers}
        for row in trainer_subject_rows:
            trainer = trainer_lookup.get(row.trainer_id)
            if trainer:
                trainer_map_by_subject.setdefault(row.subject_id, []).append(trainer)

        for student in seeded_students:
            enrollments = (
                db.session.query(Enrollment)
                .filter(Enrollment.student_id == student.id, Enrollment.deleted_at.is_(None))
                .all()
            )
            if not enrollments:
                continue

            subjects = [link.subject for link in student.student_subjects if link.subject and not link.subject.deleted_at]
            subjects_by_module = {}
            for subject in subjects:
                subjects_by_module.setdefault(subject.module_id, []).append(subject)

            student_competency_scores: dict = {}
            for enrollment in enrollments:
                module = enrollment.module
                if not module:
                    continue

                module_subjects = subjects_by_module.get(module.id, [])
                competencies = (
                    db.session.query(Competency)
                    .filter(Competency.module_id == module.id, Competency.deleted_at.is_(None))
                    .all()
                )

                start_day = datetime.utcnow().date() - timedelta(days=args.attendance_days + 2)
                for day_index in range(args.attendance_days):
                    att_date = start_day + timedelta(days=day_index)
                    existing_att = (
                        db.session.query(Attendance)
                        .filter(
                            Attendance.student_id == student.id,
                            Attendance.module_id == module.id,
                            Attendance.date == att_date,
                        )
                        .first()
                    )
                    if existing_att:
                        continue
                    db.session.add(
                        Attendance(
                            student_id=student.id,
                            module_id=module.id,
                            date=att_date,
                            status=rng.choice(ATTENDANCE_STATUSES),
                        )
                    )
                    summary.attendance_created += 1

                for term in terms:
                    if not module_subjects:
                        continue
                    subject = rng.choice(module_subjects)
                    competency = rng.choice(competencies) if competencies else None
                    trainer = pick_trainer_for_subject(subject.id, trainer_map_by_subject)
                    assessment = ensure_assessment(
                        subject=subject,
                        module=module,
                        course_id=enrollment.course_id or student.course_id,
                        term=term,
                        competency=competency,
                        assessment_type=rng.choice(ASSESSMENT_TYPES),
                        summary=summary,
                    )

                    existing_score = (
                        db.session.query(Score)
                        .filter(
                            Score.student_id == student.id,
                            Score.subject_id == subject.id,
                            Score.term == term.name,
                        )
                        .first()
                    )
                    if existing_score:
                        score_value = float(existing_score.marks_obtained)
                    else:
                        base_score = rng.uniform(35, 92)
                        if competency and competency.mastery_threshold > 80:
                            base_score -= rng.uniform(0, 10)
                        score_value = max(20.0, min(98.0, round(base_score, 2)))
                        db.session.add(
                            Score(
                                enrollment_id=enrollment.id,
                                assessment_id=assessment.id,
                                student_id=student.id,
                                subject_id=subject.id,
                                trainer_id=trainer.id if trainer else None,
                                term=term.name,
                                marks_obtained=score_value,
                                grade=grade_for_score(score_value),
                                feedback=(
                                    "Excellent progress, keep building on this foundation."
                                    if score_value >= 75
                                    else "Needs focused revision and closer coaching on core skills."
                                    if score_value < args.risk_threshold
                                    else "Steady progress with room to strengthen consistency."
                                ),
                                is_passed=score_value >= 50,
                            )
                        )
                        summary.scores_created += 1

                    if competency:
                        student_competency_scores[competency.id] = score_value

                    ensure_notification(
                        user_id=student.user_id,
                        title="Assessment Data Uploaded",
                        message=f"New {subject.name} performance data was uploaded for {term.name}.",
                        is_read=False,
                        summary=summary,
                    )

                for competency in competencies:
                    mastery_score = student_competency_scores.get(competency.id, round(rng.uniform(40, 95), 2))
                    existing_record = (
                        db.session.query(CompetencyRecord)
                        .filter(
                            CompetencyRecord.student_id == student.id,
                            CompetencyRecord.competency_id == competency.id,
                        )
                        .first()
                    )
                    if not existing_record:
                        db.session.add(
                            CompetencyRecord(
                                student_id=student.id,
                                competency_id=competency.id,
                                mastery_level=mastery_score,
                                status=competency_status(mastery_score, competency),
                                last_updated=datetime.utcnow(),
                            )
                        )
                        summary.competency_records_created += 1

                    if rng.random() <= args.portfolio_rate:
                        existing_evidence = (
                            db.session.query(PortfolioEvidence)
                            .filter(
                                PortfolioEvidence.student_id == student.id,
                                PortfolioEvidence.competency_id == competency.id,
                            )
                            .first()
                        )
                        if not existing_evidence:
                            trainer_for_comp = None
                            if module_subjects:
                                trainer_for_comp = pick_trainer_for_subject(module_subjects[0].id, trainer_map_by_subject)
                            db.session.add(
                                PortfolioEvidence(
                                    student_id=student.id,
                                    competency_id=competency.id,
                                    file_url=f"https://files.seed.lad.local/{student.registration_number}/{competency.id}.pdf",
                                    verified_by=trainer_for_comp.id if trainer_for_comp else None,
                                )
                            )
                            summary.portfolio_entries_created += 1

                    if mastery_score < args.risk_threshold:
                        ensure_alert(
                            student_id=student.id,
                            competency_id=competency.id,
                            alert_type="academic_risk",
                            message=f"{student.user.name if student.user else student.registration_number} is below threshold in {competency.name}.",
                            resolved=False,
                            summary=summary,
                        )
                        ensure_notification(
                            user_id=student.user_id,
                            title="Early Warning Alert",
                            message=f"You have been flagged for additional support in {competency.name}.",
                            is_read=False,
                            summary=summary,
                        )

        db.session.commit()

        print("Linked data seed complete")
        print(f"Terms created: {summary.terms_created}")
        print(f"Assessments created: {summary.assessments_created}")
        print(f"Scores created: {summary.scores_created}")
        print(f"Attendance rows created: {summary.attendance_created}")
        print(f"Competency records created: {summary.competency_records_created}")
        print(f"Portfolio evidence rows created: {summary.portfolio_entries_created}")
        print(f"Alerts created: {summary.alerts_created}")
        print(f"Notifications created: {summary.notifications_created}")


if __name__ == "__main__":
    main()
