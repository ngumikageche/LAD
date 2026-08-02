-- =============================================================================
-- Remove all student users (LAD / PostgreSQL)
-- =============================================================================
-- Target set: every user whose role is 'student', plus their `students` row and
-- all dependent records.
--
-- Why this file is long: no foreign key in this schema declares ON DELETE
-- CASCADE, so a bare `DELETE FROM users` aborts on the first referencing row.
-- Children must be removed in dependency order, inside one transaction.
--
-- DO NOT run this file end to end. Sections 2 and 3 each end in their own
-- COMMIT, so `psql -f` would soft-delete AND THEN hard-delete. It is a menu.
--
-- Use the wrapper, which reads .env, backs up, and runs one section at a time:
--   ./scripts/delete_student_users.sh preflight   -- read-only FK audit
--   ./scripts/delete_student_users.sh preview     -- read-only row counts
--   ./scripts/delete_student_users.sh dry-run     -- hard delete + ROLLBACK
--   ./scripts/delete_student_users.sh soft        -- reversible
--   ./scripts/delete_student_users.sh hard        -- permanent
--
-- The `-- @@SECTION <name>` markers below are how the wrapper slices this file.
-- Keep them; a section runs from its marker to the next one.
-- =============================================================================


-- @@SECTION preflight
-- =============================================================================
-- 0. PRE-FLIGHT: confirm nothing new references students/users
-- =============================================================================
-- This script was derived from app/models/*.py. If a migration added a table
-- since then, it will show up here and NOT in the deletes below. Run this first
-- and reconcile any row that is missing from section 3.

SELECT
    con.conrelid::regclass::text AS referencing_table,
    att.attname                 AS referencing_column,
    con.confrelid::regclass::text AS references_table,
    con.confdeltype             AS on_delete  -- 'a'=NO ACTION, 'c'=CASCADE, 'n'=SET NULL
FROM pg_constraint con
JOIN LATERAL unnest(con.conkey) AS k(attnum) ON TRUE
JOIN pg_attribute att
  ON att.attrelid = con.conrelid AND att.attnum = k.attnum
WHERE con.contype = 'f'
  AND con.confrelid IN ('public.students'::regclass, 'public.users'::regclass)
ORDER BY references_table, referencing_table, referencing_column;


-- @@SECTION preview
-- =============================================================================
-- 1. PREVIEW: how many rows are in scope
-- =============================================================================

WITH target_users AS (
    SELECT u.id
    FROM users u
    JOIN roles_permissions r ON r.id = u.role_id
    WHERE lower(r.role_name) = 'student'
),
target_students AS (
    SELECT s.id FROM students s WHERE s.user_id IN (SELECT id FROM target_users)
)
SELECT 'users (student role)'         AS entity, count(*) FROM target_users
UNION ALL SELECT 'students',            count(*) FROM target_students
UNION ALL SELECT 'scores',              count(*) FROM scores                       WHERE student_id IN (SELECT id FROM target_students)
UNION ALL SELECT 'score_evidence',      count(*) FROM score_evidence               WHERE score_id IN (SELECT id FROM scores WHERE student_id IN (SELECT id FROM target_students))
                                                                                      OR uploaded_by IN (SELECT id FROM target_users)
UNION ALL SELECT 'enrollments',         count(*) FROM enrollments                  WHERE student_id IN (SELECT id FROM target_students)
UNION ALL SELECT 'student_subjects',    count(*) FROM student_subjects             WHERE student_id IN (SELECT id FROM target_students)
UNION ALL SELECT 'attendance',          count(*) FROM attendance                   WHERE student_id IN (SELECT id FROM target_students)
UNION ALL SELECT 'attendance_records',  count(*) FROM attendance_records           WHERE student_id IN (SELECT id FROM target_students)
UNION ALL SELECT 'alerts',              count(*) FROM alerts                       WHERE student_id IN (SELECT id FROM target_students)
UNION ALL SELECT 'competency_records',  count(*) FROM competency_records           WHERE student_id IN (SELECT id FROM target_students)
UNION ALL SELECT 'portfolio_evidence',  count(*) FROM portfolio_evidence           WHERE student_id IN (SELECT id FROM target_students)
UNION ALL SELECT 'online_exam_submissions', count(*) FROM online_exam_submissions  WHERE student_id IN (SELECT id FROM target_students)
UNION ALL SELECT 'practical_assessment_reports', count(*) FROM practical_assessment_reports WHERE student_id IN (SELECT id FROM target_students)
UNION ALL SELECT 'student_reports',     count(*) FROM student_reports              WHERE student_id IN (SELECT id FROM target_students)
UNION ALL SELECT 'notifications',       count(*) FROM notifications                WHERE user_id IN (SELECT id FROM target_users)
UNION ALL SELECT 'surveys',             count(*) FROM surveys                      WHERE user_id IN (SELECT id FROM target_users)
UNION ALL SELECT 'system_logs',         count(*) FROM system_logs                  WHERE user_id IN (SELECT id FROM target_users)
UNION ALL SELECT 'announcement_reads',  count(*) FROM announcement_reads           WHERE user_id IN (SELECT id FROM target_users)
-- The rows below are NOT owned by students. If any count is non-zero, a student
-- account authored shared content; decide what to do with it before section 3.
UNION ALL SELECT '!! announcements authored',  count(*) FROM announcements  WHERE creator_id      IN (SELECT id FROM target_users)
UNION ALL SELECT '!! online_exams authored',   count(*) FROM online_exams   WHERE created_by      IN (SELECT id FROM target_users)
UNION ALL SELECT '!! student_reports authored',count(*) FROM student_reports WHERE author_user_id IN (SELECT id FROM target_users)
                                                                              AND student_id NOT IN (SELECT id FROM target_students)
UNION ALL SELECT '~~ documents uploaded',      count(*) FROM documents      WHERE uploaded_by     IN (SELECT id FROM target_users)
UNION ALL SELECT '~~ submissions graded',      count(*) FROM online_exam_submissions WHERE graded_by IN (SELECT id FROM target_users)
UNION ALL SELECT '~~ reports released',        count(*) FROM practical_assessment_reports WHERE released_by_user_id IN (SELECT id FROM target_users)
ORDER BY 1;

-- Sanity check: list the accounts about to go, so you can eyeball them.
SELECT u.id, u.email, u.name, s.registration_number, s.enrollment_year, u.deleted_at
FROM users u
JOIN roles_permissions r ON r.id = u.role_id
LEFT JOIN students s ON s.user_id = u.id
WHERE lower(r.role_name) = 'student'
ORDER BY u.created_at;


-- @@SECTION soft
-- =============================================================================
-- 2. SOFT DELETE  (recommended — reversible, matches BaseModel.deleted_at)
-- =============================================================================
-- Marks the accounts as deleted. Login is refused (app/routes/auth.py:66) and
-- admin listings filter on deleted_at. Historical scores/attendance stay intact
-- for reporting. Reverse by setting deleted_at back to NULL.

BEGIN;

-- `deleted_at IS NULL` on each side so an account soft-deleted earlier keeps its
-- original timestamp.
WITH target_users AS (
    SELECT u.id
    FROM users u
    JOIN roles_permissions r ON r.id = u.role_id
    WHERE lower(r.role_name) = 'student'
),
marked_students AS (
    UPDATE students
       SET deleted_at = now()
     WHERE user_id IN (SELECT id FROM target_users)
       AND deleted_at IS NULL
    RETURNING id
)
UPDATE users
   SET deleted_at = now()
 WHERE id IN (SELECT id FROM target_users)
   AND deleted_at IS NULL;

-- Inspect the row counts, then:
COMMIT;
-- ROLLBACK;

-- Undo:
--   UPDATE students SET deleted_at = NULL WHERE deleted_at IS NOT NULL;
--   UPDATE users u SET deleted_at = NULL
--     FROM roles_permissions r WHERE r.id = u.role_id AND lower(r.role_name) = 'student';


-- @@SECTION hard
-- =============================================================================
-- 3. HARD DELETE  (permanent — rows are gone)
-- =============================================================================
-- Only run this after section 0 shows no unexpected referencing table and
-- section 1 shows zeroes on the '!!' rows. Everything is one transaction: if any
-- statement fails, nothing is removed.

BEGIN;

-- Lock the target set once so concurrent writes cannot add a student mid-run.
CREATE TEMP TABLE _target_users ON COMMIT DROP AS
SELECT u.id
FROM users u
JOIN roles_permissions r ON r.id = u.role_id
WHERE lower(r.role_name) = 'student'
FOR UPDATE OF u;

CREATE TEMP TABLE _target_students ON COMMIT DROP AS
SELECT s.id FROM students s WHERE s.user_id IN (SELECT id FROM _target_users);

-- Guard: abort if a student account owns content that belongs to the institution
-- rather than to the learner. Remove or reassign those rows deliberately first.
DO $$
DECLARE
    orphaned int;
BEGIN
    SELECT (SELECT count(*) FROM announcements  WHERE creator_id IN (SELECT id FROM _target_users))
         + (SELECT count(*) FROM online_exams   WHERE created_by IN (SELECT id FROM _target_users))
         + (SELECT count(*) FROM student_reports
             WHERE author_user_id IN (SELECT id FROM _target_users)
               AND student_id NOT IN (SELECT id FROM _target_students))
      INTO orphaned;
    IF orphaned > 0 THEN
        RAISE EXCEPTION
            'Aborting: % row(s) of shared content are authored by student accounts. See the ''!!'' rows in section 1.',
            orphaned;
    END IF;
END $$;

-- 3a. Detach references that should survive the user (nullable FKs).
UPDATE documents                     SET uploaded_by          = NULL WHERE uploaded_by          IN (SELECT id FROM _target_users);
UPDATE online_exam_submissions       SET graded_by            = NULL WHERE graded_by            IN (SELECT id FROM _target_users);
UPDATE practical_assessment_reports  SET released_by_user_id  = NULL WHERE released_by_user_id  IN (SELECT id FROM _target_users);

-- 3b. Grandchildren first.
DELETE FROM score_evidence
 WHERE score_id IN (SELECT id FROM scores WHERE student_id IN (SELECT id FROM _target_students))
    OR uploaded_by IN (SELECT id FROM _target_users);

-- 3c. Student-owned records. scores must precede enrollments (scores.enrollment_id).
DELETE FROM scores                       WHERE student_id IN (SELECT id FROM _target_students)
                                            OR enrollment_id IN (SELECT id FROM enrollments WHERE student_id IN (SELECT id FROM _target_students));
DELETE FROM student_reports              WHERE student_id IN (SELECT id FROM _target_students);
DELETE FROM practical_assessment_reports WHERE student_id IN (SELECT id FROM _target_students);
DELETE FROM online_exam_submissions      WHERE student_id IN (SELECT id FROM _target_students);
DELETE FROM portfolio_evidence           WHERE student_id IN (SELECT id FROM _target_students);
DELETE FROM competency_records           WHERE student_id IN (SELECT id FROM _target_students);
DELETE FROM alerts                       WHERE student_id IN (SELECT id FROM _target_students);
DELETE FROM attendance_records           WHERE student_id IN (SELECT id FROM _target_students);
DELETE FROM attendance                   WHERE student_id IN (SELECT id FROM _target_students);
DELETE FROM student_subjects             WHERE student_id IN (SELECT id FROM _target_students);
DELETE FROM enrollments                  WHERE student_id IN (SELECT id FROM _target_students);

-- 3d. User-owned records (NOT NULL FKs — the rows go with the account).
DELETE FROM announcement_reads WHERE user_id IN (SELECT id FROM _target_users);
DELETE FROM notifications      WHERE user_id IN (SELECT id FROM _target_users);
DELETE FROM surveys            WHERE user_id IN (SELECT id FROM _target_users);
DELETE FROM system_logs        WHERE user_id IN (SELECT id FROM _target_users);

-- 3e. The accounts themselves.
DELETE FROM students WHERE id IN (SELECT id FROM _target_students);
DELETE FROM users    WHERE id IN (SELECT id FROM _target_users);

-- Verify inside the transaction before committing: both must return 0.
SELECT count(*) AS remaining_students FROM students s
  JOIN users u ON u.id = s.user_id
  JOIN roles_permissions r ON r.id = u.role_id
 WHERE lower(r.role_name) = 'student';
SELECT count(*) AS remaining_users FROM users u
  JOIN roles_permissions r ON r.id = u.role_id
 WHERE lower(r.role_name) = 'student';

COMMIT;
-- ROLLBACK;


-- @@SECTION notes
-- =============================================================================
-- Variants
-- =============================================================================
-- Scope to one institution — add to every target_users CTE / temp table:
--     AND u.institution_id = '<institution-uuid>'::uuid
--
-- Scope to one intake year — add to the target_students definition:
--     AND s.enrollment_year = 2023
--
-- Students with no linked user row (students.user_id IS NULL) are not covered by
-- any section above. List them with:
--     SELECT id, registration_number FROM students WHERE user_id IS NULL;
