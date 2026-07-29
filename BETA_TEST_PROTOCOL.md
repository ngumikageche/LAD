# LAD Independent Beta Test Protocol

## Purpose

This beta test must be completed by people who did not build the system. It is not a developer dry run. Use a separate tester for each role: Administrator, Trainer, and Learner.

## Entry criteria

- Production-like database migration completed.
- Test institution, department, course, module, subject, trainer, and learners created.
- Email test inbox and optional SMS sandbox configured.
- No real external examination scripts or personal production data used.

## Role scripts

### Administrator

1. Create Department → Course → Module → Subject.
2. Add 7–10 official syllabus topics to the subject.
3. Assign a trainer to the subject and deactivate a spare test user.
4. Filter the dashboard down to the subject and trainer.
5. Review attendance/score irregularities and the Compliance report.
6. Confirm trainer attendance, marked-script, practical, and oral evidence counts.

### Trainer

1. Select one assigned subject on the dashboard and confirm every metric changes scope.
2. Enroll one learner by registration number and import a CSV roster.
3. Import the official syllabus checklist and mark topics covered.
4. Start a five-minute, 20–100m QR attendance session and complete a manual fallback.
5. Record a phased practical assessment, attach evidence to a session, and record oral audio.
6. Save a draft and confirm the learner cannot access it; release it and confirm the safe learner view.
7. Send typed and photographed handwritten feedback through Portal + Email.
8. Create a timed online exam with MCQ and short-answer questions, link a study document, publish it, and manually grade the response.

### Learner

1. Attempt QR check-in outside and inside the permitted radius.
2. Confirm draft practical rubrics and expected answers are never visible.
3. Review a released practical assessment and trainer feedback photo.
4. Open linked study resources, start the timed exam, submit it, and review released grading feedback.
5. Confirm only subjects and exams for the learner’s enrollment are visible.

## Constraint and negative tests

- Expired QR token, duplicate attendance, GPS permission denied, and location outside the radius.
- Duplicate learner enrollment and roster rows with unknown registration numbers.
- Summative/external assessment upload attempt.
- Email/SMS provider missing or failing.
- Exam before opening, after closing, after duration expiry, and duplicate submission.
- Student request for another learner’s report, draft report, rubric, or feedback image.

## Tester issue log

Record every issue with:

| Field | Required value |
|---|---|
| Tester role | Admin / Trainer / Learner |
| Date and build | Date plus commit/version |
| Starting page | URL or navigation label |
| Intended task | What the tester tried to achieve |
| Steps | Exact clicks and entered values |
| Expected | What should have happened |
| Actual | What happened |
| Severity | Blocker / High / Medium / Low |
| Evidence | Screenshot or screen recording |
| Status | Open / Fixed / Retested / Closed |

## Exit criteria

- All three role scripts completed independently.
- Zero open blocker or high-severity defects.
- All access-control and assessment-integrity tests pass.
- Email delivery verified; SMS either verified in sandbox or explicitly disabled.
- Every fixed issue independently retested before the institutional pilot.
