"""
Learner validation of trainer-reported syllabus coverage.

Coverage was reported by the person who taught it and by nobody else, so a
trainer marking every topic covered produced a clean 100% that no part of the
system could contradict. These routes add the second opinion:

  * a learner confirms or denies each topic their trainer marked as covered;
  * an oversight report puts reported coverage next to the coverage the class
    recognises, and flags the trainers whose two figures disagree.

The variance is the point of the report — a trainer at 100% reported and 60%
recognised is the case a head of department needs to see.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from flask import Blueprint, request
from sqlalchemy import false, func, or_

from ..extensions import db
from ..models.lesson_plan import LessonPlan
from ..models.student_subject import StudentSubject
from ..models.subject import Subject
from ..models.syllabus_validation import SyllabusValidation
from ..models.term import Term
from ..models.trainer import Trainer
from ..models.trainer_subject import TrainerSubject
from ..services.scoping import oversight_scope
from .permissions import (
    _has_permission,
    _is_admin,
    _is_student,
    get_current_user,
    log_view,
)

bp = Blueprint("syllabus_validation", __name__, url_prefix="/api/v1/syllabus-coverage")

MAX_COMMENT_LENGTH = 1000

#: Granted from the Roles screen; the `.view` suffix matches how the other
#: report keys are stored.
SYLLABUS_PERMISSION = "reports.teacher.syllabus.view"

#: Percentage points of disagreement between what a trainer reported and what
#: the class recognises before the pairing is worth an administrator's time. A
#: couple of learners misremembering one topic is noise; a fifth of the syllabus
#: going unrecognised is not.
VARIANCE_FLAG_THRESHOLD = 20.0

#: Below this many responses the recognised figure is one or two voices rather
#: than a class, so it is reported but never flagged.
MIN_RESPONSES_TO_FLAG = 3


def _parse_uuid(value, field: str) -> uuid.UUID:
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Invalid '{field}'") from exc


def _active_term() -> Term | None:
    return (
        db.session.query(Term)
        .filter(Term.is_active.is_(True), Term.deleted_at.is_(None))
        .first()
    )


def _resolve_term(term_id: str | None) -> Term | None:
    if term_id:
        return db.session.get(Term, uuid.UUID(str(term_id)))
    return _active_term()


def _pct(part: int, whole: int) -> float:
    return round(part / whole * 100, 1) if whole else 0.0


def coverage_verdict(
    total_topics: int, covered_topics: int, confirmed: int, denied: int
) -> dict:
    """
    Turn one trainer/subject pairing's raw counts into the three figures the
    oversight report compares. Kept free of the database so the arithmetic can
    be reasoned about — and tested — on its own.

    `recognised_pct` is deliberately expressed against the whole syllabus, not
    against the trainer's claim: the useful question is how much of the course
    the class agrees was delivered, so that it lands on the same scale as
    `reported_pct` and the difference between them is readable as it stands.
    A trainer claiming all ten topics whose class recognises six is at 100%
    reported, 60% recognised, and a 40pp gap.
    """
    responses = confirmed + denied
    reported_pct = _pct(covered_topics, total_topics)
    recognised_pct = (
        round(reported_pct * confirmed / responses, 1) if responses else None
    )
    variance = (
        round(reported_pct - recognised_pct, 1) if recognised_pct is not None else None
    )
    return {
        "reported_pct": reported_pct,
        "recognised_pct": recognised_pct,
        "variance": variance,
        "responses": responses,
        # Unvalidated is not the same as disputed, so the two are separate
        # states: an administrator chasing a flag should not be sent after a
        # trainer whose class simply has not answered yet.
        "status": (
            "unvalidated" if responses < MIN_RESPONSES_TO_FLAG
            else "flagged" if variance is not None and variance >= VARIANCE_FLAG_THRESHOLD
            else "confirmed"
        ),
    }


# ─────────────────────────────────────────────────────────────
# Learner side — "was this actually taught?"
# ─────────────────────────────────────────────────────────────

@bp.get("/student")
def student_coverage_checklist():
    """
    The topics the learner's trainers have marked covered, with the learner's
    own answer against each.

    Only covered topics are listed. A topic the trainer has not claimed yet has
    nothing to validate, and asking a learner to rule on unplanned work would
    invite guesses into the comparison.
    """
    user, error, status = get_current_user()
    if error:
        return error, status
    if not _is_student(user) or not user.student:
        return {"error": "Only a learner can validate course coverage"}, 403

    student = user.student
    subject_id_str = request.args.get("subject_id")
    term = _resolve_term(request.args.get("term_id"))

    enrolled_subject_ids = [
        row[0]
        for row in db.session.query(StudentSubject.subject_id)
        .filter(StudentSubject.student_id == student.id)
        .all()
    ]
    if not enrolled_subject_ids:
        return {
            "term": {"id": str(term.id) if term else None, "name": term.name if term else None},
            "subjects": [],
            "topics": [],
            "summary": {"total": 0, "answered": 0, "confirmed": 0, "denied": 0, "recognised_pct": 0.0},
        }, 200

    if subject_id_str:
        try:
            chosen = _parse_uuid(subject_id_str, "subject_id")
        except ValueError as exc:
            return {"error": str(exc)}, 400
        if chosen not in enrolled_subject_ids:
            return {"error": "You are not enrolled in that subject"}, 403
        scoped_subject_ids = [chosen]
    else:
        scoped_subject_ids = enrolled_subject_ids

    plan_q = db.session.query(LessonPlan).filter(
        LessonPlan.subject_id.in_(scoped_subject_ids),
        LessonPlan.deleted_at.is_(None),
        LessonPlan.covered_date.isnot(None),
    )
    if term:
        # A plan written before the create paths stamped a term carries NULL,
        # and a strict equality check would hide it from every term view.
        plan_q = plan_q.filter(or_(LessonPlan.term_id.is_(None), LessonPlan.term_id == term.id))
    plans = plan_q.order_by(LessonPlan.covered_date.asc(), LessonPlan.created_at.asc()).all()

    answers = {
        v.lesson_plan_id: v
        for v in db.session.query(SyllabusValidation).filter(
            SyllabusValidation.student_id == student.id,
            SyllabusValidation.deleted_at.is_(None),
        )
    }

    topics = []
    for plan in plans:
        answer = answers.get(plan.id)
        topics.append({
            "lesson_plan_id": str(plan.id),
            "topic": plan.topic,
            "description": plan.description,
            "covered_date": plan.covered_date.isoformat() if plan.covered_date else None,
            "subject_id": str(plan.subject_id),
            "subject_name": plan.subject.name if plan.subject else None,
            "trainer_name": (
                plan.trainer.user.name if plan.trainer and plan.trainer.user else None
            ),
            "my_answer": None if answer is None else bool(answer.was_covered),
            "my_comment": answer.comment if answer else None,
            "answered_at": answer.updated_at.isoformat() if answer and answer.updated_at else None,
        })

    subjects = [
        {"id": str(s.id), "name": s.name, "code": s.code}
        for s in db.session.query(Subject)
        .filter(Subject.id.in_(enrolled_subject_ids), Subject.deleted_at.is_(None))
        .order_by(Subject.name)
        .all()
    ]

    answered = [t for t in topics if t["my_answer"] is not None]
    confirmed = [t for t in answered if t["my_answer"]]
    return {
        "term": {"id": str(term.id) if term else None, "name": term.name if term else None},
        "subjects": subjects,
        "topics": topics,
        "summary": {
            "total": len(topics),
            "answered": len(answered),
            "confirmed": len(confirmed),
            "denied": len(answered) - len(confirmed),
            # Of what the learner has ruled on, how much they recognise. Left
            # against answered rather than total so an unfinished checklist does
            # not read as the learner denying the rest.
            "recognised_pct": _pct(len(confirmed), len(answered)),
        },
    }, 200


@bp.post("/student")
def submit_student_validation():
    """Record or revise a learner's answers. Accepts one topic or a batch."""
    user, error, status = get_current_user()
    if error:
        return error, status
    if not _is_student(user) or not user.student:
        return {"error": "Only a learner can validate course coverage"}, 403

    data = request.get_json(silent=True) or {}
    raw = data.get("responses")
    if raw is None:
        raw = [data] if data.get("lesson_plan_id") else []
    if not isinstance(raw, list) or not raw:
        return {"error": "'responses' must be a non-empty list"}, 400

    student = user.student
    enrolled_subject_ids = {
        row[0]
        for row in db.session.query(StudentSubject.subject_id)
        .filter(StudentSubject.student_id == student.id)
        .all()
    }

    # Validated in full before anything is written. A batch that fails on its
    # last entry must not leave the earlier ones applied — the learner would be
    # told the submission failed while half of it had already been recorded.
    validated: list[tuple[uuid.UUID, bool, str | None]] = []
    for entry in raw:
        if not isinstance(entry, dict):
            return {"error": "Each response must be an object"}, 400
        try:
            plan_id = _parse_uuid(entry.get("lesson_plan_id"), "lesson_plan_id")
        except ValueError as exc:
            return {"error": str(exc)}, 400

        was_covered = entry.get("was_covered")
        if not isinstance(was_covered, bool):
            return {"error": "'was_covered' must be true or false"}, 400

        comment = (entry.get("comment") or "").strip() or None
        if comment and len(comment) > MAX_COMMENT_LENGTH:
            return {"error": f"'comment' must be {MAX_COMMENT_LENGTH} characters or fewer"}, 400

        plan = db.session.get(LessonPlan, plan_id)
        if not plan or plan.deleted_at is not None:
            return {"error": "Topic not found"}, 404
        # A learner may only rule on a subject they actually sit in, and only on
        # work the trainer has already claimed as delivered.
        if plan.subject_id not in enrolled_subject_ids:
            return {"error": "You are not enrolled in that subject"}, 403
        if plan.covered_date is None:
            return {"error": "That topic has not been reported as covered yet"}, 409

        validated.append((plan_id, was_covered, comment))

    # A batch naming the same topic twice keeps the last answer rather than
    # tripping the one-row-per-learner-per-topic constraint.
    answers = {plan_id: (was_covered, comment) for plan_id, was_covered, comment in validated}

    existing_rows = {
        row.lesson_plan_id: row
        for row in db.session.query(SyllabusValidation).filter(
            SyllabusValidation.student_id == student.id,
            SyllabusValidation.lesson_plan_id.in_(answers.keys()),
        )
    }

    for plan_id, (was_covered, comment) in answers.items():
        existing = existing_rows.get(plan_id)
        if existing:
            existing.was_covered = was_covered
            existing.comment = comment
            # A learner who withdrew an answer and is now giving one again
            # revives their own row rather than colliding with it.
            existing.deleted_at = None
        else:
            db.session.add(SyllabusValidation(
                lesson_plan_id=plan_id,
                student_id=student.id,
                was_covered=was_covered,
                comment=comment,
            ))
    saved = len(answers)

    db.session.commit()
    log_view(user, "syllabus.validation.submit", metadata={"count": saved})
    return {"status": "saved", "count": saved}, 200


# ─────────────────────────────────────────────────────────────
# Oversight side — reported coverage vs recognised coverage
# ─────────────────────────────────────────────────────────────

@bp.get("/oversight")
def coverage_oversight_report():
    """
    Every trainer/subject pairing the caller oversees, with reported coverage,
    the coverage learners recognise, and the gap between them.

    Scoped the same way the other cross-cohort reports are: a head of
    department sees their department, a college administrator their college,
    and only the group super admin sees every college.
    """
    user, error, status = get_current_user()
    if error:
        return error, status
    # The same key that opens the trainer's own syllabus screen. What changes
    # between a trainer and a principal holding it is not the key but the scope
    # resolved below, which is where the boundary actually lives.
    if _is_student(user) or not (
        _is_admin(user) or _has_permission(user, SYLLABUS_PERMISSION)
    ):
        return {"error": "Permission denied"}, 403

    scope = oversight_scope(user)
    term = _resolve_term(request.args.get("term_id"))

    pairs_q = (
        db.session.query(Trainer, Subject)
        .join(TrainerSubject, TrainerSubject.trainer_id == Trainer.id)
        .join(Subject, Subject.id == TrainerSubject.subject_id)
        .filter(Trainer.deleted_at.is_(None), Subject.deleted_at.is_(None))
    )
    if scope.trainer_ids is not None:
        pairs_q = pairs_q.filter(
            Trainer.id.in_(scope.trainer_ids) if scope.trainer_ids else false()
        )
    pairs = pairs_q.all()

    rows = []
    for trainer, subject in pairs:
        plan_q = db.session.query(LessonPlan).filter(
            LessonPlan.trainer_id == trainer.id,
            LessonPlan.subject_id == subject.id,
            LessonPlan.deleted_at.is_(None),
        )
        if term:
            plan_q = plan_q.filter(
                or_(LessonPlan.term_id.is_(None), LessonPlan.term_id == term.id)
            )
        plans = plan_q.all()
        if not plans:
            continue

        covered_plans = [p for p in plans if p.covered_date is not None]
        covered_ids = [p.id for p in covered_plans]

        # Learner answers against the topics this trainer claimed. Counted per
        # answer rather than per learner: one learner who sat through eight of
        # ten topics carries more weight on those eight than a learner who
        # answered once.
        confirmed = denied = respondents = 0
        if covered_ids:
            counts = dict(
                db.session.query(SyllabusValidation.was_covered, func.count(SyllabusValidation.id))
                .filter(
                    SyllabusValidation.lesson_plan_id.in_(covered_ids),
                    SyllabusValidation.deleted_at.is_(None),
                )
                .group_by(SyllabusValidation.was_covered)
                .all()
            )
            confirmed = int(counts.get(True, 0))
            denied = int(counts.get(False, 0))
            respondents = (
                db.session.query(func.count(func.distinct(SyllabusValidation.student_id)))
                .filter(
                    SyllabusValidation.lesson_plan_id.in_(covered_ids),
                    SyllabusValidation.deleted_at.is_(None),
                )
                .scalar()
            ) or 0

        verdict = coverage_verdict(len(plans), len(covered_plans), confirmed, denied)

        rows.append({
            "trainer_id": str(trainer.id),
            "trainer_name": trainer.user.name if trainer.user else "Unnamed trainer",
            "department_name": trainer.department.name if trainer.department else None,
            "subject_id": str(subject.id),
            "subject_name": subject.name,
            "subject_code": subject.code,
            "total_topics": len(plans),
            "covered_topics": len(covered_plans),
            "respondents": respondents,
            **verdict,
        })

    rows.sort(key=lambda r: (-(r["variance"] or 0), r["trainer_name"]))
    flagged = [r for r in rows if r["status"] == "flagged"]
    validated = [r for r in rows if r["recognised_pct"] is not None]

    log_view(user, "report.syllabus.oversight", metadata={"scope": scope.mode})

    return {
        "term": {"id": str(term.id) if term else None, "name": term.name if term else None},
        "scope": {"mode": scope.mode, "label": scope.label},
        "thresholds": {
            "variance_flag": VARIANCE_FLAG_THRESHOLD,
            "min_responses": MIN_RESPONSES_TO_FLAG,
        },
        "summary": {
            "pairings": len(rows),
            "flagged": len(flagged),
            "unvalidated": sum(1 for r in rows if r["status"] == "unvalidated"),
            "avg_reported_pct": (
                round(sum(r["reported_pct"] for r in rows) / len(rows), 1) if rows else 0.0
            ),
            "avg_recognised_pct": (
                round(sum(r["recognised_pct"] for r in validated) / len(validated), 1)
                if validated else None
            ),
        },
        "rows": rows,
        "generated_at": datetime.utcnow().isoformat(),
    }, 200
