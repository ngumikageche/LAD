# Development journey

The professor asked (13 Aug 2026) that the code be preserved at each stage so
the evolution of the dashboard — from the raw prototype to the reviewed system
— can be shown rather than asserted. This file is the index of those stages.

## How a stage is preserved

Each stage is an **annotated git tag**. A tag is a verifiable snapshot: it names
a commit, records who made it and when, and cannot be moved without leaving a
trace. Anything else — a zipped folder, a copied directory — can be edited after
the fact and proves nothing about when it was made.

To read the code exactly as it stood at a stage:

```bash
git checkout v1.0-prototype-baseline    # browse that stage
git checkout main                       # return
```

To hand someone a downloadable copy of a stage:

```bash
git archive --format=tar.gz \
  --prefix=lad-v1.0-prototype-baseline/ \
  -o versions/lad-v1.0-prototype-baseline.tar.gz \
  v1.0-prototype-baseline
```

The `versions/` archives are generated from the tags, so they are not committed —
the tag is the record, and the archive is a convenience regenerated from it.

To see exactly what one stage changed:

```bash
git diff v1.0-prototype-baseline..main --stat
```

## Stages

### v1.0-prototype-baseline — the state reviewed on 13 Aug 2026

The prototype as the stakeholders saw it. Preserved before any review change was
applied, so the review has a clear "before".

What it looked like at this point:

- The trainer menu carried **Provide Feedback**, **Data Import**, and
  **My Courses**. Provide Feedback and Student Reports rendered the same
  component under two paths; Data Import repeated the import panel already on
  the Students and Trainers screens; My Courses listed whole programmes to a
  trainer who is assigned subjects.
- Module tables labelled the module column **Name**.
- The score upload screens printed the CSV column list on screen, duplicating
  the header row of the template they had just told the user to download.
- Syllabus coverage was **self-reported by the trainer with nothing to check it
  against**. A trainer could report 100% and no part of the system could
  disagree.
- Two cross-cohort reports — pass rate and enrolment — queried every row in the
  database regardless of who asked, so a trainer saw figures spanning all three
  colleges.

### v1.1-review-refinements — the stakeholder review applied

Changes made in response to the 13 Aug 2026 review. Grouped by the concern
each answers.

**Cognitive load — removing what was redundant**

| Change | Why |
| --- | --- |
| Removed **Provide Feedback** from the trainer menu | It and Student Reports were literally the same page; the old path now forwards, keeping its query string so the dashboard's "Send targeted feedback" deep link still lands on the right learner |
| Removed **Data Import** from every menu, and deleted the page | The panel it hosted already sits on the Students and Trainers screens |
| Removed **My Courses** from the trainer menu | A trainer is assigned subjects, so a whole-course listing showed them programmes they do not teach |
| Removed the **Suggested Focus Areas** block from the student report screen | Canned phrases the trainer had to read past on the way to the field they wanted |
| Removed the **CSV column reference** from both score upload screens | The mandatory columns already ship in the downloadable template |

**Naming — saying what the number is**

| Change | Why |
| --- | --- |
| Module column **Name → Module Name** | "Name" beside a course and a description does not say whose name it is |
| Exam results: dropped **School-Wide**, **School Average → Score Average**, **Pass Rate → Average Pass Rate** | The figures are an average across independent courses, and the old names claimed more than that |
| `data.import` permission relabelled **Bulk Import People** | The screen it used to open no longer exists; the key now gates the import panels |

**Data integrity — who may see what**

| Change | Why |
| --- | --- |
| Pass rate report scoped by oversight level | It queried every score in the database. A trainer now sees their own learners, a head of department their department, a college administrator their college; only the group super admin sees every college |
| Enrolment report scoped the same way | It listed every course in every institution to whoever opened it |

Both now return a `scope` block naming whose cohorts the numbers cover, so the
figure can never be read as institution-wide when it is not.

**Syllabus accountability — the second opinion**

The gap the review identified was that coverage had one source: the person whose
work it measured. The answer is a learner-side validation of the same topics.

- Learners get **Academics → Course Coverage**, listing the topics their
  trainers have marked as taught, and mark each *Covered* or *Not covered*.
- Staff get **Reports → Course Coverage** (**Coverage Validation** in the
  trainer menu), which puts reported coverage beside recognised coverage per
  trainer/subject pairing and sorts by the largest gap.
- A pairing is **flagged** at a gap of 20 percentage points or more, once at
  least 3 learner responses are in.

Two decisions in that report are worth stating, because they are what keep it
fair:

1. **Recognised coverage is measured against the whole syllabus**, not against
   the trainer's claim, so it lands on the same scale as the reported figure and
   the difference reads directly. A trainer claiming all ten topics whose class
   recognises six shows 100% reported, 60% recognised, a 40pp gap.
2. **No responses is a separate state from disagreement.** A class that has not
   answered reports `—`, not 0%, and is never flagged. Without this every
   trainer would have been flagged the day the feature shipped.

The arithmetic is a pure function, `coverage_verdict`, covered by
`backend/tests/test_syllabus_coverage_variance.py`.

## Still open

Carried forward deliberately, not overlooked:

- **Learner dashboard** — the review moved to it next (13 Aug, 23:12); subject-wise
  attendance-vs-performance and the consolidated trainer rating categories belong
  to that round.
- **System freeze** — once the learner dashboard round lands, tag the frozen build
  and stop adding features so the evaluation period measures one stable system.
