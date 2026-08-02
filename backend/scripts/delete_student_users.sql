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
-- The live schema has drifted from app/models/*.py -- `surveys` has a model but
-- no table. So the plan below is a single table `_plan`, checked against
-- pg_constraint by section 0 and applied with a to_regclass guard so a table
-- that does not exist is skipped rather than aborting the run.
--
-- DO NOT run this file end to end. Sections 2 and 3 each end in their own
-- COMMIT, so `psql -f` would soft-delete AND THEN hard-delete. It is a menu.
--
-- Use the wrapper, which reads .env, backs up, and runs one section at a time:
--   ./scripts/delete_student_users.sh preflight   -- read-only coverage audit
--   ./scripts/delete_student_users.sh preview     -- read-only row counts
--   ./scripts/delete_student_users.sh dry-run     -- hard delete + ROLLBACK
--   ./scripts/delete_student_users.sh soft        -- reversible
--   ./scripts/delete_student_users.sh hard        -- permanent
--
-- The `-- @@SECTION <name>` markers below are how the wrapper slices this file.
-- Keep them; a section runs from its marker to the next one.
--
-- Adding a table: add one row to _plan in BOTH section 0 and section 3 (they
-- are separate psql invocations, so the list cannot be shared). Section 0 fails
-- loudly if the two ever disagree with the catalog.
--
-- Limitation: the to_regclass guard covers a missing TABLE, not a renamed
-- COLUMN. Section 0 reports that case as a dead plan entry; if you run section 3
-- anyway it aborts on the bad statement and the transaction rolls back.
-- =============================================================================


-- @@SECTION preflight
-- =============================================================================
-- 0. PRE-FLIGHT: does the plan still cover every foreign key?
-- =============================================================================
-- Compares the plan against pg_constraint in both directions:
--   UNHANDLED -- a FK exists that no section deletes, nulls, or guards. The hard
--                delete WILL fail on it. Add it to _plan before continuing.
--   dead entry -- planned table/column no longer exists; harmless, skipped.
-- Read-only.

WITH plan(tbl, col, disposition) AS (VALUES
    -- rows owned by the learner -> deleted with them
    ('scores',                       'student_id',          'delete'),
    ('score_evidence',               'uploaded_by',         'delete'),
    ('student_reports',              'student_id',          'delete'),
    ('practical_assessment_reports', 'student_id',          'delete'),
    ('online_exam_submissions',      'student_id',          'delete'),
    ('portfolio_evidence',           'student_id',          'delete'),
    ('competency_records',           'student_id',          'delete'),
    ('alerts',                       'student_id',          'delete'),
    ('attendance_records',           'student_id',          'delete'),
    ('attendance',                   'student_id',          'delete'),
    ('student_subjects',             'student_id',          'delete'),
    ('enrollments',                  'student_id',          'delete'),
    ('announcement_reads',           'user_id',             'delete'),
    ('notifications',                'user_id',             'delete'),
    ('surveys',                      'user_id',             'delete'),
    ('system_logs',                  'user_id',             'delete'),
    ('students',                     'user_id',             'delete'),
    -- institution data that outlives the account -> FK set to NULL
    ('documents',                    'uploaded_by',         'null'),
    ('online_exam_submissions',      'graded_by',           'null'),
    ('practical_assessment_reports', 'released_by_user_id', 'null'),
    -- shared content / role conflicts -> section 3 aborts if any row matches
    ('announcements',                'creator_id',          'guard'),
    ('online_exams',                 'created_by',          'guard'),
    ('student_reports',              'author_user_id',      'guard'),
    ('trainers',                     'user_id',             'guard')
),
actual AS (
    SELECT
        con.conrelid::regclass::text  AS tbl,
        att.attname::text             AS col,
        con.confrelid::regclass::text AS parent
    FROM pg_constraint con
    JOIN LATERAL unnest(con.conkey) AS k(attnum) ON TRUE
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = k.attnum
    WHERE con.contype = 'f'
      AND con.confrelid IN ('public.students'::regclass, 'public.users'::regclass)
)
SELECT
    coalesce(a.tbl, p.tbl)  AS referencing_table,
    coalesce(a.col, p.col)  AS referencing_column,
    a.parent                AS references_table,
    CASE
        WHEN a.tbl IS NULL THEN 'dead plan entry (table/column absent - skipped)'
        WHEN p.tbl IS NULL THEN '*** UNHANDLED - add to _plan before section 3 ***'
        ELSE 'covered: ' || p.disposition
    END AS status
FROM actual a
FULL OUTER JOIN plan p ON p.tbl = a.tbl AND p.col = a.col
ORDER BY (p.tbl IS NULL) DESC, (a.tbl IS NULL) DESC, 1, 2;


-- @@SECTION preview
-- =============================================================================
-- 1. PREVIEW: how many rows are in scope
-- =============================================================================
-- Read-only. Wrapped in a transaction only so the temp tables clean themselves
-- up; nothing is written. Counts are gathered through query_to_xml so a missing
-- table is skipped instead of failing the whole statement.

BEGIN;

CREATE TEMP TABLE _target_users ON COMMIT DROP AS
SELECT u.id
FROM users u
JOIN roles_permissions r ON r.id = u.role_id
WHERE lower(r.role_name) = 'student';

CREATE TEMP TABLE _target_students ON COMMIT DROP AS
SELECT s.id FROM students s WHERE s.user_id IN (SELECT id FROM _target_users);

SELECT count(*) AS student_role_users FROM _target_users;
SELECT count(*) AS student_records     FROM _target_students;

WITH plan(ord, label, tbl, cond) AS (VALUES
    ( 1, 'scores',                       'scores',                       'student_id IN (SELECT id FROM _target_students)'),
    ( 2, 'score_evidence',               'score_evidence',               'score_id IN (SELECT id FROM scores WHERE student_id IN (SELECT id FROM _target_students)) OR uploaded_by IN (SELECT id FROM _target_users)'),
    ( 3, 'student_reports',              'student_reports',              'student_id IN (SELECT id FROM _target_students)'),
    ( 4, 'practical_assessment_reports', 'practical_assessment_reports', 'student_id IN (SELECT id FROM _target_students)'),
    ( 5, 'online_exam_submissions',      'online_exam_submissions',      'student_id IN (SELECT id FROM _target_students)'),
    ( 6, 'portfolio_evidence',           'portfolio_evidence',           'student_id IN (SELECT id FROM _target_students)'),
    ( 7, 'competency_records',           'competency_records',           'student_id IN (SELECT id FROM _target_students)'),
    ( 8, 'alerts',                       'alerts',                       'student_id IN (SELECT id FROM _target_students)'),
    ( 9, 'attendance_records',           'attendance_records',           'student_id IN (SELECT id FROM _target_students)'),
    (10, 'attendance',                   'attendance',                   'student_id IN (SELECT id FROM _target_students)'),
    (11, 'student_subjects',             'student_subjects',             'student_id IN (SELECT id FROM _target_students)'),
    (12, 'enrollments',                  'enrollments',                  'student_id IN (SELECT id FROM _target_students)'),
    (13, 'announcement_reads',           'announcement_reads',           'user_id IN (SELECT id FROM _target_users)'),
    (14, 'notifications',                'notifications',                'user_id IN (SELECT id FROM _target_users)'),
    (15, 'surveys',                      'surveys',                      'user_id IN (SELECT id FROM _target_users)'),
    (16, 'system_logs',                  'system_logs',                  'user_id IN (SELECT id FROM _target_users)'),
    -- ~~ detached, not deleted (FK set to NULL)
    (17, '~~ documents uploaded',        'documents',                    'uploaded_by IN (SELECT id FROM _target_users)'),
    (18, '~~ submissions graded',        'online_exam_submissions',      'graded_by IN (SELECT id FROM _target_users)'),
    (19, '~~ reports released',          'practical_assessment_reports', 'released_by_user_id IN (SELECT id FROM _target_users)'),
    -- !! MUST be 0 -- section 3 aborts otherwise
    (20, '!! announcements authored',    'announcements',                'creator_id IN (SELECT id FROM _target_users)'),
    (21, '!! online_exams authored',     'online_exams',                 'created_by IN (SELECT id FROM _target_users)'),
    (22, '!! reports authored',          'student_reports',              'author_user_id IN (SELECT id FROM _target_users) AND student_id NOT IN (SELECT id FROM _target_students)'),
    (23, '!! also a trainer',            'trainers',                     'user_id IN (SELECT id FROM _target_users)')
)
SELECT
    label AS entity,
    (xpath(
        '/row/c/text()',
        query_to_xml(format('SELECT count(*) AS c FROM %I WHERE %s', tbl, cond), false, true, '')
    ))[1]::text::bigint AS rows
FROM plan
WHERE to_regclass('public.' || tbl) IS NOT NULL
ORDER BY ord;

-- The accounts themselves, to eyeball before committing to anything.
SELECT u.id, u.email, u.name, s.registration_number, s.enrollment_year, u.deleted_at
FROM users u
JOIN roles_permissions r ON r.id = u.role_id
LEFT JOIN students s ON s.user_id = u.id
WHERE lower(r.role_name) = 'student'
ORDER BY u.created_at
LIMIT 50;

COMMIT;


-- @@SECTION soft
-- =============================================================================
-- 2. SOFT DELETE  (recommended -- reversible, matches BaseModel.deleted_at)
-- =============================================================================
-- Marks the accounts as deleted. Login is refused (app/routes/auth.py:66) and
-- admin listings filter on deleted_at. Historical scores/attendance stay intact
-- for reporting. Reverse by setting deleted_at back to NULL.

BEGIN;

-- `deleted_at IS NULL` on each side so an account soft-deleted earlier keeps its
-- original timestamp.
CREATE TEMP TABLE _target_users ON COMMIT DROP AS
SELECT u.id
FROM users u
JOIN roles_permissions r ON r.id = u.role_id
WHERE lower(r.role_name) = 'student';

-- State BEFORE the update, so "0 marked" is never ambiguous: it distinguishes
-- "nothing matched" from "everything already carried a deleted_at".
SELECT
    count(*)                                       AS targeted,
    count(*) FILTER (WHERE deleted_at IS NOT NULL) AS already_soft_deleted,
    count(*) FILTER (WHERE deleted_at IS NULL)     AS to_mark_now
FROM users WHERE id IN (SELECT id FROM _target_users);

WITH marked_students AS (
    UPDATE students
       SET deleted_at = now()
     WHERE user_id IN (SELECT id FROM _target_users)
       AND deleted_at IS NULL
    RETURNING 1
),
marked_users AS (
    UPDATE users
       SET deleted_at = now()
     WHERE id IN (SELECT id FROM _target_users)
       AND deleted_at IS NULL
    RETURNING 1
)
SELECT (SELECT count(*) FROM marked_students) AS student_rows_newly_marked,
       (SELECT count(*) FROM marked_users)    AS user_rows_newly_marked;

COMMIT;

-- Undo:
--   UPDATE students SET deleted_at = NULL WHERE deleted_at IS NOT NULL;
--   UPDATE users u SET deleted_at = NULL
--     FROM roles_permissions r WHERE r.id = u.role_id AND lower(r.role_name) = 'student';


-- @@SECTION hard
-- =============================================================================
-- 3. HARD DELETE  (permanent -- rows are gone)
-- =============================================================================
-- Run section 0 first: any row marked UNHANDLED there will abort this one.
-- Everything below is a single transaction -- on any error, nothing is removed.

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

-- 3a. GUARD. Abort if a student account owns institution content, or is also a
-- trainer. Either means the data needs a human decision, not a bulk delete.
DO $$
DECLARE
    r     record;
    n     bigint;
    total bigint := 0;
BEGIN
    FOR r IN SELECT * FROM (VALUES
        ('announcements',   'creator_id IN (SELECT id FROM _target_users)'),
        ('online_exams',    'created_by IN (SELECT id FROM _target_users)'),
        ('student_reports', 'author_user_id IN (SELECT id FROM _target_users) AND student_id NOT IN (SELECT id FROM _target_students)'),
        ('trainers',        'user_id IN (SELECT id FROM _target_users)')
    ) v(tbl, cond)
    LOOP
        CONTINUE WHEN to_regclass('public.' || r.tbl) IS NULL;
        EXECUTE format('SELECT count(*) FROM %I WHERE %s', r.tbl, r.cond) INTO n;
        IF n > 0 THEN
            RAISE WARNING 'guard: % has % row(s) tied to a student account', r.tbl, n;
            total := total + n;
        END IF;
    END LOOP;

    IF total > 0 THEN
        RAISE EXCEPTION 'Aborting: % row(s) need a decision first (see the ''!!'' rows in the preview).', total;
    END IF;
END $$;

-- 3b. Detach references that should survive the account (nullable FKs).
DO $$
DECLARE
    r record;
    n bigint;
BEGIN
    FOR r IN SELECT * FROM (VALUES
        ('documents',                    'uploaded_by'),
        ('online_exam_submissions',      'graded_by'),
        ('practical_assessment_reports', 'released_by_user_id')
    ) v(tbl, col)
    LOOP
        CONTINUE WHEN to_regclass('public.' || r.tbl) IS NULL;
        EXECUTE format(
            'UPDATE %I SET %I = NULL WHERE %I IN (SELECT id FROM _target_users)',
            r.tbl, r.col, r.col);
        GET DIAGNOSTICS n = ROW_COUNT;
        RAISE NOTICE 'detach % % -> % row(s)', rpad(r.tbl, 30), rpad(r.col, 20), n;
    END LOOP;
END $$;

-- 3c. Delete in dependency order. score_evidence precedes scores; scores
-- precedes enrollments (scores.enrollment_id); students precedes users.
-- A planned table that does not exist in this database is skipped, not fatal.
DO $$
DECLARE
    r     record;
    n     bigint;
    total bigint := 0;
BEGIN
    FOR r IN SELECT * FROM (VALUES
        ( 1, 'score_evidence',               'score_id IN (SELECT id FROM scores WHERE student_id IN (SELECT id FROM _target_students)) OR uploaded_by IN (SELECT id FROM _target_users)'),
        ( 2, 'scores',                       'student_id IN (SELECT id FROM _target_students) OR enrollment_id IN (SELECT id FROM enrollments WHERE student_id IN (SELECT id FROM _target_students))'),
        ( 3, 'student_reports',              'student_id IN (SELECT id FROM _target_students)'),
        ( 4, 'practical_assessment_reports', 'student_id IN (SELECT id FROM _target_students)'),
        ( 5, 'online_exam_submissions',      'student_id IN (SELECT id FROM _target_students)'),
        ( 6, 'portfolio_evidence',           'student_id IN (SELECT id FROM _target_students)'),
        ( 7, 'competency_records',           'student_id IN (SELECT id FROM _target_students)'),
        ( 8, 'alerts',                       'student_id IN (SELECT id FROM _target_students)'),
        ( 9, 'attendance_records',           'student_id IN (SELECT id FROM _target_students)'),
        (10, 'attendance',                   'student_id IN (SELECT id FROM _target_students)'),
        (11, 'student_subjects',             'student_id IN (SELECT id FROM _target_students)'),
        (12, 'enrollments',                  'student_id IN (SELECT id FROM _target_students)'),
        (13, 'announcement_reads',           'user_id IN (SELECT id FROM _target_users)'),
        (14, 'notifications',                'user_id IN (SELECT id FROM _target_users)'),
        (15, 'surveys',                      'user_id IN (SELECT id FROM _target_users)'),
        (16, 'system_logs',                  'user_id IN (SELECT id FROM _target_users)'),
        (17, 'students',                     'id IN (SELECT id FROM _target_students)'),
        (18, 'users',                        'id IN (SELECT id FROM _target_users)')
    ) v(ord, tbl, cond)
    ORDER BY ord
    LOOP
        IF to_regclass('public.' || r.tbl) IS NULL THEN
            RAISE NOTICE 'skip   % (no such table in this database)', r.tbl;
            CONTINUE;
        END IF;
        EXECUTE format('DELETE FROM %I WHERE %s', r.tbl, r.cond);
        GET DIAGNOSTICS n = ROW_COUNT;
        total := total + n;
        RAISE NOTICE 'delete % -> % row(s)', rpad(r.tbl, 30), n;
    END LOOP;
    RAISE NOTICE '---- % row(s) deleted in total ----', total;
END $$;

-- Verify inside the transaction, before the COMMIT below takes effect.
SELECT count(*) AS remaining_students FROM students s
  JOIN users u ON u.id = s.user_id
  JOIN roles_permissions r ON r.id = u.role_id
 WHERE lower(r.role_name) = 'student';
SELECT count(*) AS remaining_users FROM users u
  JOIN roles_permissions r ON r.id = u.role_id
 WHERE lower(r.role_name) = 'student';

COMMIT;


-- @@SECTION notes
-- =============================================================================
-- Variants
-- =============================================================================
-- Scope to one institution -- add to the _target_users definition in each section:
--     AND u.institution_id = '<institution-uuid>'::uuid
--
-- Scope to one intake year -- add to the _target_students definition:
--     AND s.enrollment_year = 2023
--
-- Students with no linked user row (students.user_id IS NULL) are not covered by
-- any section above. List them with:
--     SELECT id, registration_number FROM students WHERE user_id IS NULL;
