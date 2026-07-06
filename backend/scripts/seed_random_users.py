# python3 scripts/seed_random_users.py --password 'Password123!' --students-per-department 15 --trainers-per-department 4 --bootstrap-missing-catalog

import argparse
import random
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from werkzeug.security import generate_password_hash

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app import create_app
from app.extensions import db
from app.models.course import Course
from app.models.course_subject import CourseSubject
from app.models.department import Department
from app.models.enrollment import Enrollment
from app.models.module import Module
from app.models.role_permission import RolePermission
from app.models.student import Student
from app.models.student_subject import StudentSubject
from app.models.subject import Subject
from app.models.term import Term
from app.models.trainer import Trainer
from app.models.trainer_course import TrainerCourse
from app.models.trainer_subject import TrainerSubject
from app.models.user import User


FIRST_NAMES = [
    "Amina", "Brian", "Carla", "Daniel", "Esther", "Felix", "Grace", "Hassan",
    "Irene", "James", "Kevin", "Linda", "Moses", "Naomi", "Oscar", "Patricia",
    "Quincy", "Ruth", "Samuel", "Tina", "Umar", "Vera", "Wendy", "Yvonne", "Zane",
]
LAST_NAMES = [
    "Otieno", "Mwangi", "Njeri", "Kamau", "Achieng", "Kiptoo", "Mutiso", "Wanjiku",
    "Abdi", "Karanja", "Maina", "Odhiambo", "Chebet", "Mohamed", "Omondi", "Kendi",
]
TRAINER_SPECIALIZATIONS = [
    "Assessment Design", "CBET Delivery", "Data Literacy", "Learner Support",
    "STEM Instruction", "Portfolio Coaching", "Instructional Planning",
]
DEFAULT_MODULE_NAMES = ["Foundations", "Practice", "Applications"]
DEFAULT_SUBJECT_NAMES = ["Theory", "Practical"]


@dataclass
class SeedSummary:
    users: int = 0
    trainers: int = 0
    students: int = 0
    courses: int = 0
    modules: int = 0
    subjects: int = 0
    enrollments: int = 0
    trainer_subject_links: int = 0
    trainer_course_links: int = 0
    student_subject_links: int = 0
    course_subject_links: int = 0
    cohorts_used: int = 0
    terms_used: int = 0
    skipped_existing_trainers: int = 0
    skipped_existing_students: int = 0
    skipped_departments_without_courses: int = 0
    skipped_courses_without_modules_or_subjects: int = 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Seed random trainers and students across departments, cohorts, courses, modules, and subjects."
    )
    parser.add_argument("--password", default="Password123!", help="Password used for all generated accounts.")
    parser.add_argument("--students-per-department", type=int, default=12, help="How many students to create for each eligible department.")
    parser.add_argument("--trainers-per-department", type=int, default=3, help="How many trainers to create for each eligible department.")
    parser.add_argument("--department-limit", type=int, default=0, help="Optional cap on how many departments to seed.")
    parser.add_argument(
        "--department-names",
        default="",
        help="Comma-separated department names to target, e.g. 'Art,Engineering,Business Studies'.",
    )
    parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducible output.")
    parser.add_argument("--email-domain", default="larim.co.ke", help="Email domain for generated accounts.")
    parser.add_argument("--prefix", default="seed", help="Prefix used in generated email and registration values.")
    parser.add_argument(
        "--cohort-years",
        default="2022,2023,2024,2025,2026",
        help="Comma-separated enrollment years used to spread student cohorts.",
    )
    parser.add_argument(
        "--max-subjects-per-student",
        type=int,
        default=6,
        help="Upper bound for how many subjects a seeded student gets assigned.",
    )
    parser.add_argument(
        "--max-subjects-per-trainer",
        type=int,
        default=4,
        help="Upper bound for how many subjects a seeded trainer gets assigned.",
    )
    parser.add_argument(
        "--max-courses-per-trainer",
        type=int,
        default=2,
        help="Upper bound for how many courses a seeded trainer gets assigned.",
    )
    parser.add_argument(
        "--bootstrap-missing-catalog",
        action="store_true",
        help="Create basic courses, modules, and subjects inside targeted departments when they are missing.",
    )
    parser.add_argument("--bootstrap-courses", type=int, default=2, help="Courses to create per department when bootstrapping.")
    parser.add_argument("--bootstrap-modules", type=int, default=3, help="Modules to create per course when bootstrapping.")
    parser.add_argument("--bootstrap-subjects", type=int, default=2, help="Subjects to create per module when bootstrapping.")
    return parser.parse_args()


def slugify(value: str) -> str:
    return "".join(ch.lower() if ch.isalnum() else "-" for ch in value).strip("-")


def pick_name(rng: random.Random) -> tuple[str, str]:
    return rng.choice(FIRST_NAMES), rng.choice(LAST_NAMES)


def ensure_role(role_name: str, category: str, permissions: dict) -> RolePermission:
    role = db.session.query(RolePermission).filter(RolePermission.role_name == role_name).first()
    if role:
        return role

    role = RolePermission(role_name=role_name, category=category, permissions=permissions)
    db.session.add(role)
    db.session.flush()
    return role


def unique_email(prefix: str, role_label: str, department_slug: str, index: int, domain: str) -> str:
    return f"{prefix}.{role_label}.{department_slug}.{index}@{domain}".lower()


def unique_phone(role_label: str, department_index: int, person_index: int) -> str:
    role_digit = "7" if role_label == "trainer" else "1"
    return f"254{role_digit}{department_index:03d}{person_index:05d}"


def unique_registration(prefix: str, department_slug: str, cohort_year: int, index: int) -> str:
    return f"{prefix.upper()}-{department_slug[:6].upper()}-{cohort_year}-{index:04d}"


def parse_cohort_years(raw: str) -> list[int]:
    values = [part.strip() for part in raw.split(",") if part.strip()]
    years = [int(value) for value in values]
    if not years:
        raise ValueError("At least one cohort year is required.")
    return years


def parse_department_names(raw: str) -> list[str]:
    return [part.strip() for part in raw.split(",") if part.strip()]


def get_terms() -> list[Term]:
    return (
        db.session.query(Term)
        .filter(Term.deleted_at.is_(None))
        .order_by(Term.start_date.asc())
        .all()
    )


def get_department_courses(department: Department) -> list[Course]:
    return (
        db.session.query(Course)
        .filter(Course.department_id == department.id, Course.deleted_at.is_(None))
        .order_by(Course.name.asc())
        .all()
    )


def get_course_modules(course: Course) -> list[Module]:
    return (
        db.session.query(Module)
        .filter(Module.course_id == course.id, Module.deleted_at.is_(None))
        .order_by(Module.name.asc())
        .all()
    )


def get_course_subjects(course: Course) -> list[Subject]:
    linked = (
        db.session.query(Subject)
        .join(CourseSubject, CourseSubject.subject_id == Subject.id)
        .filter(CourseSubject.course_id == course.id, Subject.deleted_at.is_(None))
        .order_by(Subject.name.asc())
        .all()
    )
    if linked:
        return linked

    modules = get_course_modules(course)
    module_ids = [module.id for module in modules]
    if not module_ids:
        return []

    return (
        db.session.query(Subject)
        .filter(Subject.module_id.in_(module_ids), Subject.deleted_at.is_(None))
        .order_by(Subject.name.asc())
        .all()
    )


def ensure_bootstrap_catalog(
    department: Department,
    bootstrap_courses: int,
    bootstrap_modules: int,
    bootstrap_subjects: int,
    summary: SeedSummary,
) -> None:
    courses = get_department_courses(department)
    if courses:
        return

    department_slug = slugify(department.name).replace("-", " ").title() or department.name
    for course_index in range(1, bootstrap_courses + 1):
        course = Course(
            department_id=department.id,
            name=f"{department_slug} Course {course_index}",
            cbet_level="Level 5",
        )
        db.session.add(course)
        db.session.flush()

        for module_index in range(1, bootstrap_modules + 1):
            module_name = DEFAULT_MODULE_NAMES[(module_index - 1) % len(DEFAULT_MODULE_NAMES)]
            module = Module(
                course_id=course.id,
                name=f"{course.name} {module_name}",
                description=f"{module_name} module for {course.name}.",
            )
            db.session.add(module)
            db.session.flush()

            for subject_index in range(1, bootstrap_subjects + 1):
                subject_name = DEFAULT_SUBJECT_NAMES[(subject_index - 1) % len(DEFAULT_SUBJECT_NAMES)]
                subject = Subject(
                    module_id=module.id,
                    name=f"{course.name} {subject_name} {module_index}",
                    description=f"{subject_name} subject for {module.name}.",
                )
                db.session.add(subject)
                db.session.flush()
                db.session.add(CourseSubject(course_id=course.id, subject_id=subject.id))
                summary.subjects += 1
                summary.course_subject_links += 1

            summary.modules += 1

        summary.courses += 1


def ensure_course_subject_links(course: Course, subjects: list[Subject], summary: SeedSummary) -> None:
    for subject in subjects:
        existing = (
            db.session.query(CourseSubject)
            .filter(CourseSubject.course_id == course.id, CourseSubject.subject_id == subject.id)
            .first()
        )
        if existing:
            continue
        db.session.add(CourseSubject(course_id=course.id, subject_id=subject.id))
        summary.course_subject_links += 1


def create_user(name: str, email: str, phone: str, password_hash: str, role_id, institution_id) -> User:
    existing = db.session.query(User).filter(User.email == email).first()
    if existing:
        return existing

    user = User(
        name=name,
        email=email,
        phone=phone,
        password_hash=password_hash,
        role_id=role_id,
        institution_id=institution_id,
    )
    db.session.add(user)
    db.session.flush()
    return user


def next_available_email(prefix: str, role_label: str, department_slug: str, start_index: int, domain: str) -> tuple[str, int]:
    probe = start_index
    while True:
        email = unique_email(prefix, role_label, department_slug, probe, domain)
        exists = db.session.query(User.id).filter(User.email == email).first()
        if not exists:
            return email, probe
        probe += 1


def next_available_phone(role_label: str, department_index: int, start_index: int) -> str:
    probe = start_index
    while True:
        phone = unique_phone(role_label, department_index, probe)
        exists = db.session.query(User.id).filter(User.phone == phone).first()
        if not exists:
            return phone
        probe += 1


def ensure_trainer_course(trainer_id, course_id, summary: SeedSummary) -> None:
    exists = (
        db.session.query(TrainerCourse)
        .filter(TrainerCourse.trainer_id == trainer_id, TrainerCourse.course_id == course_id)
        .first()
    )
    if exists:
        return
    db.session.add(TrainerCourse(trainer_id=trainer_id, course_id=course_id))
    summary.trainer_course_links += 1


def ensure_trainer_subject(trainer_id, subject_id, summary: SeedSummary) -> None:
    exists = (
        db.session.query(TrainerSubject)
        .filter(TrainerSubject.trainer_id == trainer_id, TrainerSubject.subject_id == subject_id)
        .first()
    )
    if exists:
        return
    db.session.add(TrainerSubject(trainer_id=trainer_id, subject_id=subject_id))
    summary.trainer_subject_links += 1


def ensure_student_subject(student_id, subject_id, summary: SeedSummary) -> None:
    exists = (
        db.session.query(StudentSubject)
        .filter(StudentSubject.student_id == student_id, StudentSubject.subject_id == subject_id)
        .first()
    )
    if exists:
        return
    db.session.add(StudentSubject(student_id=student_id, subject_id=subject_id))
    summary.student_subject_links += 1


def seed_trainers_for_department(
    department: Department,
    trainer_role: RolePermission,
    trainer_count: int,
    department_index: int,
    rng: random.Random,
    password_hash: str,
    prefix: str,
    email_domain: str,
    max_courses_per_trainer: int,
    max_subjects_per_trainer: int,
    summary: SeedSummary,
) -> None:
    courses = get_department_courses(department)
    if not courses:
        summary.skipped_departments_without_courses += 1
        return

    course_subject_map = {course.id: get_course_subjects(course) for course in courses}
    for course, subjects in ((course, course_subject_map[course.id]) for course in courses):
        ensure_course_subject_links(course, subjects, summary)

    for person_index in range(1, trainer_count + 1):
        first_name, last_name = pick_name(rng)
        name = f"{first_name} {last_name}"
        department_slug = slugify(department.name)
        unique_index = department_index * 1000 + person_index
        email, resolved_index = next_available_email(prefix, "trainer", department_slug, unique_index, email_domain)
        phone = next_available_phone("trainer", department_index, resolved_index)
        user = create_user(
            name=name,
            email=email,
            phone=phone,
            password_hash=password_hash,
            role_id=trainer_role.id,
            institution_id=department.institution_id,
        )
        if user.trainer:
            summary.skipped_existing_trainers += 1
            continue

        trainer = Trainer(
            user_id=user.id,
            department_id=department.id,
            specialization=rng.choice(TRAINER_SPECIALIZATIONS),
        )
        db.session.add(trainer)
        db.session.flush()

        summary.users += 1
        summary.trainers += 1

        course_sample_size = min(len(courses), max(1, min(max_courses_per_trainer, len(courses))))
        assigned_courses = rng.sample(courses, k=course_sample_size)
        for course in assigned_courses:
            ensure_trainer_course(trainer.id, course.id, summary)

        trainer_subject_pool = []
        for course in assigned_courses:
            trainer_subject_pool.extend(course_subject_map.get(course.id, []))
        deduped_subjects = list({subject.id: subject for subject in trainer_subject_pool}.values())
        if deduped_subjects:
            subject_sample_size = min(len(deduped_subjects), max(1, min(max_subjects_per_trainer, len(deduped_subjects))))
            assigned_subjects = rng.sample(deduped_subjects, k=subject_sample_size)
            for subject in assigned_subjects:
                ensure_trainer_subject(trainer.id, subject.id, summary)


def seed_students_for_department(
    department: Department,
    student_role: RolePermission,
    student_count: int,
    department_index: int,
    cohort_years: list[int],
    terms: list[Term],
    rng: random.Random,
    password_hash: str,
    prefix: str,
    email_domain: str,
    max_subjects_per_student: int,
    summary: SeedSummary,
) -> None:
    courses = get_department_courses(department)
    if not courses:
        summary.skipped_departments_without_courses += 1
        return

    department_slug = slugify(department.name)
    for person_index in range(1, student_count + 1):
        course = rng.choice(courses)
        modules = get_course_modules(course)
        subjects = get_course_subjects(course)
        if not modules or not subjects:
            summary.skipped_courses_without_modules_or_subjects += 1
            continue

        ensure_course_subject_links(course, subjects, summary)

        first_name, last_name = pick_name(rng)
        name = f"{first_name} {last_name}"
        cohort_year = rng.choice(cohort_years)
        unique_index = department_index * 10000 + person_index
        email, resolved_index = next_available_email(prefix, "student", department_slug, unique_index, email_domain)
        phone = next_available_phone("student", department_index, resolved_index)
        registration_number = unique_registration(prefix, department_slug, cohort_year, resolved_index)

        user = create_user(
            name=name,
            email=email,
            phone=phone,
            password_hash=password_hash,
            role_id=student_role.id,
            institution_id=department.institution_id,
        )
        if user.student:
            summary.skipped_existing_students += 1
            continue

        student = Student(
            user_id=user.id,
            registration_number=registration_number,
            course_id=course.id,
            enrollment_year=cohort_year,
        )
        db.session.add(student)
        db.session.flush()

        summary.users += 1
        summary.students += 1

        term = rng.choice(terms) if terms else None
        if term:
            summary.terms_used = len({term.id for term in terms})

        for module in modules:
            db.session.add(
                Enrollment(
                    student_id=student.id,
                    module_id=module.id,
                    course_id=course.id,
                    term_id=term.id if term else None,
                    status="active",
                )
            )
            summary.enrollments += 1

        subject_sample_size = min(len(subjects), max(1, min(max_subjects_per_student, len(subjects))))
        assigned_subjects = rng.sample(subjects, k=subject_sample_size)
        for subject in assigned_subjects:
            ensure_student_subject(student.id, subject.id, summary)


def main() -> None:
    args = parse_args()
    rng = random.Random(args.seed)
    cohort_years = parse_cohort_years(args.cohort_years)
    department_names = parse_department_names(args.department_names)
    app = create_app()

    with app.app_context():
        student_role = ensure_role("Student", "student", {"student.portal": True})
        trainer_role = ensure_role(
            "Trainer",
            "trainer",
            {"scores.read": True, "scores.create": True, "students.read": True, "subjects.read": True},
        )
        terms = get_terms()

        departments_query = (
            db.session.query(Department)
            .filter(Department.deleted_at.is_(None))
            .order_by(Department.name.asc())
        )
        if department_names:
            departments_query = departments_query.filter(Department.name.in_(department_names))
        departments = departments_query.limit(args.department_limit).all() if args.department_limit > 0 else departments_query.all()

        if not departments:
            raise SystemExit("No departments found. Create institutions, departments, and courses first.")
        if department_names:
            found_names = {department.name for department in departments}
            missing = [name for name in department_names if name not in found_names]
            if missing:
                raise SystemExit(f"Departments not found: {', '.join(missing)}")

        password_hash = generate_password_hash(args.password)
        summary = SeedSummary(cohorts_used=len(set(cohort_years)), terms_used=len(terms))

        for department_index, department in enumerate(departments, start=1):
            if args.bootstrap_missing_catalog:
                ensure_bootstrap_catalog(
                    department=department,
                    bootstrap_courses=args.bootstrap_courses,
                    bootstrap_modules=args.bootstrap_modules,
                    bootstrap_subjects=args.bootstrap_subjects,
                    summary=summary,
                )
                db.session.flush()

            pre_courses = get_department_courses(department)
            pre_modules = sum(len(get_course_modules(course)) for course in pre_courses)
            pre_subjects = sum(len(get_course_subjects(course)) for course in pre_courses)
            print(
                f"[{department.name}] courses={len(pre_courses)} modules={pre_modules} subjects={pre_subjects}"
            )

            seed_trainers_for_department(
                department=department,
                trainer_role=trainer_role,
                trainer_count=args.trainers_per_department,
                department_index=department_index,
                rng=rng,
                password_hash=password_hash,
                prefix=args.prefix,
                email_domain=args.email_domain,
                max_courses_per_trainer=args.max_courses_per_trainer,
                max_subjects_per_trainer=args.max_subjects_per_trainer,
                summary=summary,
            )
            seed_students_for_department(
                department=department,
                student_role=student_role,
                student_count=args.students_per_department,
                department_index=department_index,
                cohort_years=cohort_years,
                terms=terms,
                rng=rng,
                password_hash=password_hash,
                prefix=args.prefix,
                email_domain=args.email_domain,
                max_subjects_per_student=args.max_subjects_per_student,
                summary=summary,
            )

        db.session.commit()

        print("Seed complete")
        print(f"Departments processed: {len(departments)}")
        print(f"Cohorts used: {summary.cohorts_used}")
        print(f"Terms available for enrollment spread: {summary.terms_used}")
        print(f"Users created: {summary.users}")
        print(f"Trainers created: {summary.trainers}")
        print(f"Students created: {summary.students}")
        print(f"Enrollments created: {summary.enrollments}")
        print(f"Trainer-course links created: {summary.trainer_course_links}")
        print(f"Trainer-subject links created: {summary.trainer_subject_links}")
        print(f"Student-subject links created: {summary.student_subject_links}")
        print(f"Course-subject links created: {summary.course_subject_links}")
        print(f"Skipped existing trainers: {summary.skipped_existing_trainers}")
        print(f"Skipped existing students: {summary.skipped_existing_students}")
        print(f"Skipped departments without courses: {summary.skipped_departments_without_courses}")
        print(f"Skipped course picks without modules/subjects: {summary.skipped_courses_without_modules_or_subjects}")
        print(f"Default password for generated accounts: {args.password}")
        if (
            summary.users == 0
            and not args.bootstrap_missing_catalog
            and summary.skipped_departments_without_courses > 0
        ):
            print("Hint: no users were created because the targeted departments do not have courses yet.")
            print("Re-run with --bootstrap-missing-catalog to auto-create starter courses, modules, and subjects.")


if __name__ == "__main__":
    main()
