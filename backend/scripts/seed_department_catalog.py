import argparse
import random
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app import create_app
from app.extensions import db
from app.models.competency import Competency
from app.models.course import Course
from app.models.course_subject import CourseSubject
from app.models.department import Department
from app.models.institution import Institution
from app.models.module import Module
from app.models.subject import Subject


DEPARTMENT_NAMES = [
    "Applied Sciences",
    "Business Studies",
    "Hospitality and Tourism",
    "Information Technology",
    "Health Sciences",
    "Education and Training",
    "Creative Media",
    "Agribusiness",
    "Automotive Engineering",
    "Electrical Installation",
]

COURSE_TEMPLATES = {
    "Applied Sciences": ["Laboratory Technology", "Environmental Science", "Industrial Chemistry"],
    "Business Studies": ["Accounting Technician", "Human Resource Management", "Supply Chain Management"],
    "Hospitality and Tourism": ["Hotel Operations", "Food Production", "Tour Guiding"],
    "Information Technology": ["Software Development", "Network Administration", "Data Analytics"],
    "Health Sciences": ["Community Health", "Nutrition and Dietetics", "Health Records Management"],
    "Education and Training": ["Curriculum Support", "Assessment Practice", "TVET Instruction"],
    "Creative Media": ["Graphic Design", "Digital Content Production", "Animation Basics"],
    "Agribusiness": ["Crop Production", "Animal Health", "Agricultural Extension"],
    "Automotive Engineering": ["Motor Vehicle Mechanics", "Auto Electrical Systems", "Diagnostics and Repair"],
    "Electrical Installation": ["Domestic Wiring", "Industrial Installation", "Renewable Energy Systems"],
}

MODULE_TOPICS = [
    "Foundations",
    "Operations",
    "Practice Lab",
    "Workplace Skills",
]

SUBJECT_TOPICS = [
    "Theory",
    "Practical",
    "Workshop",
    "Project",
]


@dataclass
class Summary:
    departments: int = 0
    courses: int = 0
    modules: int = 0
    subjects: int = 0
    course_subject_links: int = 0
    competencies: int = 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Seed new departments linked to courses, modules, subjects, and competencies."
    )
    parser.add_argument("--institution-name", default="", help="Existing institution name to attach new departments to.")
    parser.add_argument("--institution-type", default="TVET", help="Institution type used when creating a new institution.")
    parser.add_argument("--institution-location", default="Nairobi", help="Institution location used when creating a new institution.")
    parser.add_argument("--create-institution", action="store_true", help="Create the institution if it does not already exist.")
    parser.add_argument("--department-count", type=int, default=3, help="How many new departments to create.")
    parser.add_argument("--courses-per-department", type=int, default=3, help="How many courses to create under each department.")
    parser.add_argument("--modules-per-course", type=int, default=4, help="How many modules to create under each course.")
    parser.add_argument("--subjects-per-module", type=int, default=2, help="How many subjects to create under each module.")
    parser.add_argument("--competencies-per-module", type=int, default=3, help="How many competencies to create under each module.")
    parser.add_argument("--seed", type=int, default=7, help="Random seed for reproducible catalog generation.")
    parser.add_argument("--prefix", default="Seeded", help="Prefix added to generated department names.")
    return parser.parse_args()


def pick_institution(args: argparse.Namespace) -> Institution:
    if args.institution_name:
        institution = (
            db.session.query(Institution)
            .filter(Institution.name == args.institution_name, Institution.deleted_at.is_(None))
            .first()
        )
        if institution:
            return institution
        if not args.create_institution:
            raise SystemExit(
                f"Institution '{args.institution_name}' was not found. Use --create-institution to create it."
            )
        institution = Institution(
            name=args.institution_name,
            type=args.institution_type,
            location=args.institution_location,
        )
        db.session.add(institution)
        db.session.flush()
        return institution

    institution = (
        db.session.query(Institution)
        .filter(Institution.deleted_at.is_(None))
        .order_by(Institution.created_at.asc())
        .first()
    )
    if institution:
        return institution

    if not args.create_institution:
        raise SystemExit("No institution found. Provide --institution-name with --create-institution, or create one first.")

    institution = Institution(
        name=f"{args.prefix} Institute",
        type=args.institution_type,
        location=args.institution_location,
    )
    db.session.add(institution)
    db.session.flush()
    return institution


def unique_name(base: str, suffix: int) -> str:
    return f"{base} {suffix}"


def create_department(institution: Institution, name: str) -> tuple[Department | None, bool]:
    existing = (
        db.session.query(Department)
        .filter(
            Department.institution_id == institution.id,
            Department.name == name,
            Department.deleted_at.is_(None),
        )
        .first()
    )
    if existing:
        return None, False
    department = Department(institution_id=institution.id, name=name)
    db.session.add(department)
    db.session.flush()
    return department, True


def create_course(department: Department, name: str, level: str) -> tuple[Course, bool]:
    existing = (
        db.session.query(Course)
        .filter(
            Course.department_id == department.id,
            Course.name == name,
            Course.deleted_at.is_(None),
        )
        .first()
    )
    if existing:
        return existing, False
    course = Course(department_id=department.id, name=name, cbet_level=level)
    db.session.add(course)
    db.session.flush()
    return course, True


def create_module(course: Course, name: str) -> tuple[Module, bool]:
    existing = (
        db.session.query(Module)
        .filter(Module.course_id == course.id, Module.name == name, Module.deleted_at.is_(None))
        .first()
    )
    if existing:
        return existing, False
    module = Module(course_id=course.id, name=name, description=f"{name} module for {course.name}.")
    db.session.add(module)
    db.session.flush()
    return module, True


def create_subject(module: Module, name: str) -> tuple[Subject, bool]:
    existing = (
        db.session.query(Subject)
        .filter(Subject.module_id == module.id, Subject.name == name, Subject.deleted_at.is_(None))
        .first()
    )
    if existing:
        return existing, False
    subject = Subject(module_id=module.id, name=name, description=f"{name} subject under {module.name}.")
    db.session.add(subject)
    db.session.flush()
    return subject, True


def ensure_course_subject(course: Course, subject: Subject) -> bool:
    existing = (
        db.session.query(CourseSubject)
        .filter(CourseSubject.course_id == course.id, CourseSubject.subject_id == subject.id)
        .first()
    )
    if existing:
        return False
    db.session.add(CourseSubject(course_id=course.id, subject_id=subject.id))
    return True


def create_competency(module: Module, name: str) -> tuple[Competency, bool]:
    existing = (
        db.session.query(Competency)
        .filter(Competency.module_id == module.id, Competency.name == name, Competency.deleted_at.is_(None))
        .first()
    )
    if existing:
        return existing, False
    competency = Competency(
        module_id=module.id,
        name=name,
        description=f"Competency for {module.name}.",
        expected_outcome=f"Learner demonstrates {name.lower()} in applied settings.",
        mastery_threshold=75.0,
        assessment_tasks={"tasks": ["Observation", "Practical", "Portfolio"]},
        performance_levels={"low": "<50", "medium": "50-74", "high": "75+"},
    )
    db.session.add(competency)
    db.session.flush()
    return competency, True


def main() -> None:
    args = parse_args()
    rng = random.Random(args.seed)
    app = create_app()

    with app.app_context():
        institution = pick_institution(args)
        summary = Summary()

        used_department_names = {
            dept.name for dept in db.session.query(Department).filter(Department.deleted_at.is_(None)).all()
        }

        department_bases = DEPARTMENT_NAMES[:]
        rng.shuffle(department_bases)

        created_departments: list[Department] = []
        dept_counter = 0
        base_index = 0
        while len(created_departments) < args.department_count:
            base = department_bases[base_index % len(department_bases)]
            dept_counter += 1
            base_index += 1
            department_name = f"{args.prefix} {base}" if args.prefix else base
            if department_name in used_department_names:
                department_name = unique_name(department_name, dept_counter)
            department, department_created = create_department(institution, department_name)
            if department is None:
                continue
            used_department_names.add(department_name)
            created_departments.append(department)
            if department_created:
                summary.departments += 1

            course_templates = COURSE_TEMPLATES.get(base, [f"{base} Course {i}" for i in range(1, args.courses_per_department + 1)])
            for course_index in range(args.courses_per_department):
                template = course_templates[course_index % len(course_templates)]
                course_name = f"{department_name} {template}"
                course, course_created = create_course(
                    department,
                    course_name,
                    level=rng.choice(["Level 4", "Level 5", "Level 6"]),
                )
                if course_created:
                    summary.courses += 1

                for module_index in range(args.modules_per_course):
                    module_name = f"{template} {MODULE_TOPICS[module_index % len(MODULE_TOPICS)]}"
                    module, module_created = create_module(course, module_name)
                    if module_created:
                        summary.modules += 1

                    for competency_index in range(args.competencies_per_module):
                        competency_name = f"{module_name} Competency {competency_index + 1}"
                        competency, competency_created = create_competency(module, competency_name)
                        if competency_created:
                            summary.competencies += 1

                    for subject_index in range(args.subjects_per_module):
                        subject_name = f"{template} {SUBJECT_TOPICS[subject_index % len(SUBJECT_TOPICS)]}"
                        subject, subject_created = create_subject(module, subject_name)
                        if subject_created:
                            summary.subjects += 1
                        if ensure_course_subject(course, subject):
                            summary.course_subject_links += 1

        db.session.commit()

        print("Department catalog seed complete")
        print(f"Institution: {institution.name}")
        print(f"Departments created: {summary.departments}")
        print(f"Courses created: {summary.courses}")
        print(f"Modules created: {summary.modules}")
        print(f"Subjects created: {summary.subjects}")
        print(f"Course-subject links created: {summary.course_subject_links}")
        print(f"Competencies created: {summary.competencies}")


if __name__ == "__main__":
    main()
