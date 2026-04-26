# Trainer User Stories Detailed Mapping

Date: April 26, 2026
Project: LAD
Scope: Trainer-facing features, current implementation reality, and delivery priorities

## Purpose

This document maps the latest trainer user stories to the actual LAD codebase. It replaces older trainer analysis that assumed some tables were missing and that several implemented fragments did not exist.

## Current Reality Snapshot

- Authentication is already in place through `users`, auth routes, and frontend auth context.
- Trainer-to-subject assignment already exists through `trainer_subjects`.
- Student-to-subject assignment already exists through `student_subjects`.
- Basic trainer profile and limited self-service endpoints exist in `Backend/app/routes/trainers.py`.
- Core score create/update/feedback routes exist in `Backend/app/routes/scores.py`.
- Several trainer frontend pages already exist, but many depend on API endpoints that are not implemented yet.

## Canonical Table Mapping

| Feature area | Primary tables | Supporting tables |
|---|---|---|
| Login / access | `users` | `roles`, `role_permissions` |
| Assigned subjects | `subjects`, `trainer_subjects` | `modules`, `course_subjects`, `courses`, `departments` |
| Students in trainer scope | `students`, `student_subjects` | `users`, `subjects`, `enrollments` |
| Score upload / editing | `scores` | `assessments`, `enrollments`, `subjects`, `terms` |
| Performance monitoring | `scores` | `assessments`, `students`, `subjects`, `terms` |
| Alerts / intervention | `notifications` | `scores`, `assessments`, `students` |
| Reporting | `scores` | `assessments`, `subjects`, `students`, `terms` |

## Existing Backend Coverage

### Implemented now

- `POST /auth/login`
- `GET /auth/me`
- `GET /trainers/me`
- `GET /trainers/me/courses`
- `GET /trainers/me/students`
- `POST /scores`
- `PUT /scores/{score_id}`
- `GET /scores`
- `GET /scores/{score_id}`
- `POST /scores/{score_id}/feedback`
- `POST /trainer-subjects`
- `POST /trainer-subjects/assign-multiple`
- `GET /trainer-subjects/{trainer_id}`

### Important limitations

- Subject-facing trainer APIs expected by the frontend do not exist under `/trainers/subjects`.
- Score bulk upload and validation APIs expected by the frontend do not exist.
- Current trainer access checks in `scores.py` rely on `trainer_course`, while the user stories are centered on `trainer_subjects`.
- `GET /trainers/me/students` is department-scoped through course lookup, not strictly subject-scoped.
- There is no dedicated trainer dashboard aggregation endpoint.
- There are no dedicated trainer analytics, reporting, export, at-risk, or search endpoints matching the frontend API contract.

## Existing Frontend Coverage

### Pages already present

- `dashboard/src/pages/TrainerDashboard.tsx`
- `dashboard/src/pages/MySubjectsPage.tsx`
- `dashboard/src/pages/MyStudentsPage.tsx`
- `dashboard/src/pages/ScoreUploadPage.tsx`
- `dashboard/src/pages/PerformanceAnalyticsPage.tsx`
- `dashboard/src/pages/AtRiskStudentsPage.tsx`
- `dashboard/src/pages/ProvideFeedbackPage.tsx`
- `dashboard/src/pages/TrainerReportsPage.tsx`
- `dashboard/src/pages/TrainerStudentProfilePage.tsx`

### Important frontend/backend mismatches

- `dashboard/src/api/trainer.ts` expects `/trainers/subjects`, `/trainers/students`, `/trainers/performance`, `/trainers/alerts`, `/trainers/reports`, and `/scores/bulk` APIs that are not implemented.
- `ProvideFeedbackPage.tsx` currently passes a student id into `trainerScoresAPI.provideFeedback`, but that API expects a score id.
- Several trainer pages are UI-complete but data-incomplete because the backend contract is missing.

## Story Coverage Matrix

| Category | Story summary | Status | Notes |
|---|---|---|---|
| 1. Authentication & access | Login, RBAC, logout | Partial | Auth exists; trainer-specific route gating and feature visibility are only partly aligned. |
| 2. Subject management | View assigned subjects, details, filtering | Partial | Data model exists; frontend contract and detailed subject endpoints are missing. |
| 3. Student management | View students, profiles, filter by subject | Partial | Some trainer student access exists, but scoping is too broad and subject filtering APIs are missing. |
| 4. Score upload | Upload, organize by subject/term, prevent duplicates, edit | Partial | Create/update exists; bulk upload, validation endpoint, and subject-based authorization are incomplete. |
| 5. Performance monitoring | Subject performance, low performers, comparisons | Missing | No trainer-specific analytics endpoints matching the stories. |
| 6. Alerts & intervention | Poor-performance alerts, trends, engagement | Partial | Student notifications exist on failed score creation; no trainer alert feed or trend APIs. |
| 7. Feedback to students | Feedback and academic guidance | Partial | Feedback persistence exists; guidance workflows and correct page wiring are missing. |
| 8. Reporting | Reports, exports, summary metrics | Missing | No trainer-specific export/report endpoints. |
| 9. Dashboard experience | Assigned subjects, total students, recent scores | Partial | Page exists; aggregation endpoint does not. |
| 10. Search & filtering | Search students, filter scores | Missing | Frontend expects these capabilities; backend does not provide them. |
| 11. Data integrity & permissions | Trainers limited to assigned subjects | Partial | Permission framework exists; subject-level enforcement is not consistently implemented. |
| High-value insights | At-risk detection, comparisons, class averages | Partial | Admin and student analytics patterns exist, but trainer-specific insight APIs are missing. |

## Detailed Story Mapping

### 1. Authentication & Access

- Implemented:
  - Secure login
  - Logout/session clearing
  - General permission enforcement
- Still needed:
  - Ensure trainer navigation only exposes trainer-relevant pages
  - Ensure all trainer pages and APIs consistently use trainer-scoped permission rules

### 2. Subject Management

- Implemented:
  - `trainer_subjects` table
  - Trainer-subject assignment endpoints under `/trainer-subjects`
- Still needed:
  - `GET /trainers/subjects`
  - `GET /trainers/subjects/{subject_id}`
  - Filtering by department, course, and term
  - Subject payload including department, course, term, student count, assessment count, and class average

### 3. Student Management

- Implemented:
  - Basic trainer self student listing via `/trainers/me/students`
- Still needed:
  - Restrict student list to assigned subjects, not broad department/course assumptions
  - `GET /trainers/students`
  - `GET /trainers/students/{student_id}`
  - `GET /trainers/students/search`
  - `GET /trainers/students?subject_id=...`

### 4. Score Upload

- Implemented:
  - Single score creation
  - Score editing
  - Duplicate handling through `IntegrityError` path
  - Feedback field persistence
- Still needed:
  - Explicit unique constraint for `(enrollment_id, assessment_id)` if not already enforced in schema
  - `POST /scores/validate`
  - `POST /scores/bulk`
  - `POST /scores/bulk-upload`
  - Trainer authorization based on assigned subjects
  - Cleaner subject/term-aware upload workflow

### 5. Performance Monitoring

- Still needed:
  - `GET /trainers/performance?subject_id=...`
  - `GET /trainers/performance/low-performers`
  - `GET /trainers/performance/comparison`
  - `GET /trainers/performance/class-average`

### 6. Alerts & Intervention

- Implemented:
  - Student notification when a score is uploaded
  - Student alert when a failing score is created
- Still needed:
  - Trainer-facing at-risk list
  - Trend detection endpoints
  - Engagement/risk heuristics per student and per subject

### 7. Feedback to Students

- Implemented:
  - `POST /scores/{score_id}/feedback`
  - Student notification when feedback is added
- Still needed:
  - Fix UI wiring to use score ids
  - Feedback history endpoints if the page should show historical comments
  - Guidance templates or weak-area suggestions

### 8. Reporting

- Still needed:
  - `GET /trainers/reports/subject/{subject_id}`
  - CSV/PDF export
  - Summary metrics payloads for average score and pass rate

### 9. Dashboard Experience

- Implemented:
  - Rich trainer dashboard UI
- Still needed:
  - Dashboard aggregation endpoint returning:
    - assigned subjects
    - total students
    - recent scores
    - at-risk count
    - average class performance

### 10. Search & Filtering

- Still needed:
  - Student search within trainer scope
  - Score filtering by subject and term
  - Search/filter APIs aligned with `dashboard/src/api/trainer.ts`

### 11. Data Integrity & Permissions

- Implemented:
  - Base permission checks
  - Some trainer access checks during score creation and score update
- Still needed:
  - Subject-based enforcement as the primary rule
  - Consistent denial of access outside assigned subjects
  - Audit logging for rejected access attempts where appropriate

## Recommended Delivery Priority

### P0: Make existing trainer pages actually work

1. Align backend endpoints to `dashboard/src/api/trainer.ts`
2. Implement `GET /trainers/subjects`
3. Implement `GET /trainers/students` with subject scoping
4. Add `GET /trainers/dashboard`
5. Add `POST /scores/validate` and `POST /scores/bulk`
6. Switch score authorization from broad course assumptions to assigned-subject checks

### P1: Add decision-making features

1. Trainer performance analytics endpoints
2. At-risk student endpoint
3. Subject and term filtering for scores
4. Student profile endpoint limited to trainer scope
5. Fix feedback page wiring

### P2: Add reporting and masters-level value

1. CSV/PDF export
2. Performance comparison across subjects
3. Trend analytics
4. Smart insight heuristics for at-risk detection

## Suggested Canonical Trainer API Surface

To match the existing dashboard code and these user stories, the backend should standardize around:

- `GET /trainers/dashboard`
- `GET /trainers/subjects`
- `GET /trainers/subjects/{subject_id}`
- `GET /trainers/students`
- `GET /trainers/students/{student_id}`
- `GET /trainers/students/search?q=...`
- `GET /trainers/performance`
- `GET /trainers/performance/low-performers`
- `GET /trainers/performance/comparison`
- `GET /trainers/performance/class-average`
- `GET /trainers/alerts/at-risk`
- `GET /trainers/alerts/trends`
- `GET /trainers/reports/subject/{subject_id}`
- `POST /scores/validate`
- `POST /scores/bulk`
- `POST /scores/bulk-upload`

## Bottom Line

The trainer module is not starting from zero. The data model foundation is largely present, the frontend shell is extensive, and core score operations already exist. The main gap is contract alignment: the frontend expects a trainer API surface that the backend only partially implements, and current authorization logic does not yet enforce the exact subject-level boundaries described in these user stories.
