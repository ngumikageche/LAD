-- =============================================================================
-- Remove all trainer users (LAD / PostgreSQL)
-- =============================================================================
-- Target set: every user whose role is 'trainer', plus their `trainers` row and
-- all dependent records.
--
-- READ THIS FIRST -- trainers are NOT symmetrical with students.
--
-- A student owns their own rows, so deleting a student deletes their data. A
-- trainer is referenced BY student data: scores they marked, reports they wrote,
-- attendance sessions they ran. Several of those foreign keys are NOT NULL, so
-- "just delete the trainer" would mean destroying learner records.
--
-- Each reference is therefore classified:
--   delete -- trainer-owned only (lesson plans, staff attendance, course links)
--   null   -- points at student data, FK is nullable -> detach, keep the row
--   guard  -- points at student data, FK is NOT NULL -> section 3 ABORTS
--
-- The guards are the point, not an obstacle. When one trips you have three
-- honest options:
--   1. Soft delete instead (section 2). Recommended -- history stays attributed.
--   2. Reassign to a successor trainer (section 3), then hard delete.
--   3. Decide deliberately to destroy those learner records, and write that
--      statement yourself. This file will not do it for you.
--
-- Sections:
--   0 preflight  read-only coverage audit against pg_constraint
--   1 preview    read-only row counts
--   2 soft       reversible, sets deleted_at
--   3 reassign   move student-facing rows to a successor (needs :successor_email)
--   4 hard       permanent, aborts if anything is still tied to student data
--
-- DO NOT run this file end to end -- sections 2, 3 and 4 each COMMIT. It is a
-- menu. Use the wrapper:
--   ./scripts/delete_student_users.sh --role trainer preflight
--   ./scripts/delete_student_users.sh --role trainer preview
--   ./scripts/delete_student_users.sh --role trainer reassign --successor a@b.edu
--   ./scripts/delete_student_users.sh --role trainer dry-run
--   ./scripts/delete_student_users.sh --role trainer hard
-- =============================================================================


-- @@SECTION preflight
-- =============================================================================
-- 0. PRE-FLIGHT: does the plan still cover every foreign key?
-- =============================================================================
-- Also reports each column's real nullability, because a 'null' disposition is
-- only valid while the column actually is nullable. If a migration makes one
-- NOT NULL, this shows `null` against `NOT NULL` and section 4 would fail.

WITH plan(tbl, col, disposition) AS (VALUES
    -- trainer-owned -> deleted with the account
    ('trainer_courses',              'trainer_id',          'delete'),
    ('trainer_subjects',             'trainer_id',          'delete'),
    ('lesson_plans',                 'trainer_id',          'delete'),
    ('staff_attendance',             'trainer_id',          'delete'),
    ('notifications',                'user_id',             'delete'),
    ('announcement_reads',           'user_id',             'delete'),
    ('system_logs',                  'user_id',             'delete'),
    ('surveys',                      'user_id',             'delete'),
    ('trainers',                     'user_id',             'delete'),
    -- points at student data, nullable -> detach and keep the row
    ('scores',                       'trainer_id',          'null'),
    ('score_evidence',               'trainer_id',          'null'),
    ('student_reports',              'trainer_id',          'null'),
    ('portfolio_evidence',           'verified_by',         'null'),
    ('online_exams',                 'trainer_id',          'null'),
    ('documents',                    'uploaded_by',         'null'),
    ('online_exam_submissions',      'graded_by',           'null'),
    ('practical_assessment_reports', 'released_by_user_id', 'null'),
    -- points at student data, NOT NULL -> abort unless reassigned first
    ('practical_assessment_reports', 'trainer_id',          'guard'),
    ('attendance_sessions',          'trainer_id',          'guard'),
    ('student_reports',              'author_user_id',      'guard'),
    ('score_evidence',               'uploaded_by',         'guard'),
    ('online_exams',                 'created_by',          'guard'),
    ('announcements',                'creator_id',          'guard'),
    -- role conflict: this account is also a learner -> always a human decision
    ('students',                     'user_id',             'guard')
),
actual AS (
    SELECT
        con.conrelid::regclass::text  AS tbl,
        att.attname::text             AS col,
        con.confrelid::regclass::text AS parent,
        att.attnotnull                AS notnull
    FROM pg_constraint con
    JOIN LATERAL unnest(con.conkey) AS k(attnum) ON TRUE
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = k.attnum
    WHERE con.contype = 'f'
      AND con.confrelid IN ('public.trainers'::regclass, 'public.users'::regclass)
)
SELECT
    coalesce(a.tbl, p.tbl) AS referencing_table,
    coalesce(a.col, p.col) AS referencing_column,
    a.parent               AS references_table,
    CASE WHEN a.notnull THEN 'NOT NULL' ELSE 'nullable' END AS column_is,
    CASE
        WHEN a.tbl IS NULL           THEN 'dead plan entry (absent - skipped)'
        WHEN p.tbl IS NULL           THEN '*** UNHANDLED - add to the plan before section 4 ***'
        WHEN p.disposition = 'null'
         AND a.notnull               THEN '*** BROKEN - planned as null but column is NOT NULL ***'
        ELSE 'covered: ' || p.disposition
    END AS status
FROM actual a
FULL OUTER JOIN plan p ON p.tbl = a.tbl AND p.col = a.col
-- users.id is referenced by student-only tables too; they are none of our
-- business here, so only surface rows the trainer plan is actually about.
WHERE a.tbl IS NULL
   OR p.tbl IS NOT NULL
   OR a.parent = 'trainers'
   OR a.tbl IN ('notifications','announcement_reads','system_logs','documents',
                'announcements','online_exams','students','surveys')
ORDER BY (p.tbl IS NULL) DESC, (p.disposition = 'null' AND a.notnull) DESC, 1, 2;


-- @@SECTION preview
-- =============================================================================
-- 1. PREVIEW: how many rows are in scope
-- =============================================================================
-- Read-only. The transaction exists only so the temp tables drop themselves.

BEGIN;

CREATE TEMP TABLE _target_users ON COMMIT DROP AS
SELECT u.id
FROM users u
JOIN roles_permissions r ON r.id = u.role_id
WHERE lower(r.role_name) = 'trainer';

CREATE TEMP TABLE _target_trainers ON COMMIT DROP AS
SELECT t.id FROM trainers t WHERE t.user_id IN (SELECT id FROM _target_users);

SELECT count(*) AS trainer_role_users FROM _target_users;
SELECT count(*) AS trainer_records    FROM _target_trainers;

-- Trainer rows NOT in scope, because their user has some other role (or none).
-- permissions.py:49 treats anyone with a trainers row as a trainer, so these
-- accounts still act as trainers and will survive this script.
SELECT count(*) AS trainer_rows_outside_scope
FROM trainers t
WHERE t.id NOT IN (SELECT id FROM _target_trainers);

WITH plan(ord, label, tbl, cond) AS (VALUES
    ( 1, 'trainer_courses',            'trainer_courses',              'trainer_id IN (SELECT id FROM _target_trainers)'),
    ( 2, 'trainer_subjects',           'trainer_subjects',             'trainer_id IN (SELECT id FROM _target_trainers)'),
    ( 3, 'lesson_plans',               'lesson_plans',                 'trainer_id IN (SELECT id FROM _target_trainers)'),
    ( 4, 'staff_attendance',           'staff_attendance',             'trainer_id IN (SELECT id FROM _target_trainers)'),
    ( 5, 'notifications',              'notifications',                'user_id IN (SELECT id FROM _target_users)'),
    ( 6, 'announcement_reads',         'announcement_reads',           'user_id IN (SELECT id FROM _target_users)'),
    ( 7, 'system_logs',                'system_logs',                  'user_id IN (SELECT id FROM _target_users)'),
    ( 8, 'surveys',                    'surveys',                      'user_id IN (SELECT id FROM _target_users)'),
    -- ~~ detached, row survives
    ( 9, '~~ scores marked',           'scores',                       'trainer_id IN (SELECT id FROM _target_trainers)'),
    (10, '~~ score_evidence linked',   'score_evidence',               'trainer_id IN (SELECT id FROM _target_trainers)'),
    (11, '~~ student_reports linked',  'student_reports',              'trainer_id IN (SELECT id FROM _target_trainers)'),
    (12, '~~ portfolio verified',      'portfolio_evidence',           'verified_by IN (SELECT id FROM _target_trainers)'),
    (13, '~~ online_exams owned',      'online_exams',                 'trainer_id IN (SELECT id FROM _target_trainers)'),
    (14, '~~ documents uploaded',      'documents',                    'uploaded_by IN (SELECT id FROM _target_users)'),
    (15, '~~ submissions graded',      'online_exam_submissions',      'graded_by IN (SELECT id FROM _target_users)'),
    (16, '~~ reports released',        'practical_assessment_reports', 'released_by_user_id IN (SELECT id FROM _target_users)'),
    -- !! MUST be 0 before section 4; reassign (section 3) clears these
    (17, '!! practical reports owned', 'practical_assessment_reports', 'trainer_id IN (SELECT id FROM _target_trainers)'),
    (18, '!! attendance sessions run', 'attendance_sessions',          'trainer_id IN (SELECT id FROM _target_trainers)'),
    (19, '!! student_reports authored','student_reports',              'author_user_id IN (SELECT id FROM _target_users)'),
    (20, '!! score_evidence uploaded', 'score_evidence',               'uploaded_by IN (SELECT id FROM _target_users)'),
    (21, '!! online_exams created',    'online_exams',                 'created_by IN (SELECT id FROM _target_users)'),
    (22, '!! announcements authored',  'announcements',                'creator_id IN (SELECT id FROM _target_users)'),
    (23, '!! also a student',          'students',                     'user_id IN (SELECT id FROM _target_users)')
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

-- Student attendance riding on those sessions. Deleting the sessions would take
-- these with them, which is why attendance_sessions is a guard and not a delete.
SELECT count(*) AS student_attendance_on_those_sessions
FROM attendance_records ar
WHERE ar.session_id IN (
    SELECT id FROM attendance_sessions WHERE trainer_id IN (SELECT id FROM _target_trainers)
);

SELECT u.id, u.email, u.name, t.id AS trainer_id, u.deleted_at
FROM users u
JOIN roles_permissions r ON r.id = u.role_id
LEFT JOIN trainers t ON t.user_id = u.id
WHERE lower(r.role_name) = 'trainer'
ORDER BY u.created_at
LIMIT 50;

COMMIT;


-- @@SECTION soft
-- =============================================================================
-- 2. SOFT DELETE  (recommended -- reversible, and keeps history attributed)
-- =============================================================================
-- For trainers this is not merely the safe option, it is usually the correct
-- one: every score, report and session stays attached to the person who did it.
-- Login is refused at app/routes/auth.py:66.

BEGIN;

WITH target_users AS (
    SELECT u.id
    FROM users u
    JOIN roles_permissions r ON r.id = u.role_id
    WHERE lower(r.role_name) = 'trainer'
),
marked_trainers AS (
    UPDATE trainers
       SET deleted_at = now()
     WHERE user_id IN (SELECT id FROM target_users)
       AND deleted_at IS NULL
    RETURNING id
)
UPDATE users
   SET deleted_at = now()
 WHERE id IN (SELECT id FROM target_users)
   AND deleted_at IS NULL;

COMMIT;

-- Undo:
--   UPDATE trainers SET deleted_at = NULL WHERE deleted_at IS NOT NULL;
--   UPDATE users u SET deleted_at = NULL
--     FROM roles_permissions r WHERE r.id = u.role_id AND lower(r.role_name) = 'trainer';


-- @@SECTION reassign
-- =============================================================================
-- 3. REASSIGN to a successor trainer  (run before section 4, if you must)
-- =============================================================================
-- Moves every student-facing reference from the outgoing trainers to one
-- successor, so section 4 has nothing left to guard against. Learner records are
-- preserved and stay attributed to a real person.
--
-- Requires :successor_email -- an existing user with a trainers row who is NOT
-- themselves in the target set. The wrapper passes it via --successor.

BEGIN;

CREATE TEMP TABLE _target_users ON COMMIT DROP AS
SELECT u.id
FROM users u
JOIN roles_permissions r ON r.id = u.role_id
WHERE lower(r.role_name) = 'trainer';

CREATE TEMP TABLE _target_trainers ON COMMIT DROP AS
SELECT t.id FROM trainers t WHERE t.user_id IN (SELECT id FROM _target_users);

CREATE TEMP TABLE _successor ON COMMIT DROP AS
SELECT u.id AS user_id, t.id AS trainer_id
FROM users u
JOIN trainers t ON t.user_id = u.id
WHERE lower(u.email) = lower(:'successor_email');

-- Transaction-local, so the DO block below can name it in its error message.
SELECT set_config('lad.successor_email', :'successor_email', true);

DO $$
DECLARE
    n int;
BEGIN
    SELECT count(*) INTO n FROM _successor;
    IF n <> 1 THEN
        RAISE EXCEPTION 'Successor % did not resolve to exactly one user with a trainers row (got %).',
            coalesce(current_setting('lad.successor_email', true), '?'), n;
    END IF;
    IF EXISTS (SELECT 1 FROM _successor WHERE user_id IN (SELECT id FROM _target_users)) THEN
        RAISE EXCEPTION 'The successor is themselves a trainer-role user, so section 4 would delete them and everything just reassigned to them.'
            USING HINT =
                'Removing EVERY trainer leaves nobody with the trainer role to inherit. Either '
                '(a) point --successor at a non-trainer-role account that has a trainers row, '
                'typically an admin who also teaches, or (b) change the successor''s role off '
                '''trainer'' first so they fall outside the target set, or (c) soft delete '
                '(section 2) instead, which keeps every attribution intact.';
    END IF;
END $$;

DO $$
DECLARE
    r record;
    n bigint;
BEGIN
    FOR r IN SELECT * FROM (VALUES
        -- (table, column, source temp table, successor column)
        ('practical_assessment_reports', 'trainer_id',          '_target_trainers', 'trainer_id'),
        ('attendance_sessions',          'trainer_id',          '_target_trainers', 'trainer_id'),
        ('scores',                       'trainer_id',          '_target_trainers', 'trainer_id'),
        ('score_evidence',               'trainer_id',          '_target_trainers', 'trainer_id'),
        ('student_reports',              'trainer_id',          '_target_trainers', 'trainer_id'),
        ('portfolio_evidence',           'verified_by',         '_target_trainers', 'trainer_id'),
        ('online_exams',                 'trainer_id',          '_target_trainers', 'trainer_id'),
        ('student_reports',              'author_user_id',      '_target_users',    'user_id'),
        ('score_evidence',               'uploaded_by',         '_target_users',    'user_id'),
        ('online_exams',                 'created_by',          '_target_users',    'user_id'),
        ('announcements',                'creator_id',          '_target_users',    'user_id'),
        ('documents',                    'uploaded_by',         '_target_users',    'user_id'),
        ('online_exam_submissions',      'graded_by',           '_target_users',    'user_id'),
        ('practical_assessment_reports', 'released_by_user_id', '_target_users',    'user_id')
    ) v(tbl, col, src, succ_col)
    LOOP
        CONTINUE WHEN to_regclass('public.' || r.tbl) IS NULL;
        EXECUTE format(
            'UPDATE %I SET %I = (SELECT %I FROM _successor) WHERE %I IN (SELECT id FROM %I)',
            r.tbl, r.col, r.succ_col, r.col, r.src);
        GET DIAGNOSTICS n = ROW_COUNT;
        IF n > 0 THEN
            RAISE NOTICE 'reassign % % -> % row(s)', rpad(r.tbl, 30), rpad(r.col, 20), n;
        END IF;
    END LOOP;
END $$;

COMMIT;


-- @@SECTION hard
-- =============================================================================
-- 4. HARD DELETE  (permanent -- rows are gone)
-- =============================================================================
-- Aborts if anything still ties a trainer to student data. Run section 0 first;
-- if a guard trips, either soft delete instead or reassign (section 3).

BEGIN;

CREATE TEMP TABLE _target_users ON COMMIT DROP AS
SELECT u.id
FROM users u
JOIN roles_permissions r ON r.id = u.role_id
WHERE lower(r.role_name) = 'trainer'
FOR UPDATE OF u;

CREATE TEMP TABLE _target_trainers ON COMMIT DROP AS
SELECT t.id FROM trainers t WHERE t.user_id IN (SELECT id FROM _target_users);

-- 4a. GUARD. Every one of these is a NOT NULL reference from student data.
DO $$
DECLARE
    r     record;
    n     bigint;
    total bigint := 0;
BEGIN
    FOR r IN SELECT * FROM (VALUES
        ('practical_assessment_reports', 'trainer_id IN (SELECT id FROM _target_trainers)'),
        ('attendance_sessions',          'trainer_id IN (SELECT id FROM _target_trainers)'),
        ('student_reports',              'author_user_id IN (SELECT id FROM _target_users)'),
        ('score_evidence',               'uploaded_by IN (SELECT id FROM _target_users)'),
        ('online_exams',                 'created_by IN (SELECT id FROM _target_users)'),
        ('announcements',                'creator_id IN (SELECT id FROM _target_users)'),
        ('students',                     'user_id IN (SELECT id FROM _target_users)')
    ) v(tbl, cond)
    LOOP
        CONTINUE WHEN to_regclass('public.' || r.tbl) IS NULL;
        EXECUTE format('SELECT count(*) FROM %I WHERE %s', r.tbl, r.cond) INTO n;
        IF n > 0 THEN
            RAISE WARNING 'guard: % has % row(s) that student data depends on', r.tbl, n;
            total := total + n;
        END IF;
    END LOOP;

    IF total > 0 THEN
        RAISE EXCEPTION 'Aborting: % row(s) of learner data still point at these trainers. Soft delete (section 2), or reassign (section 3) first.', total;
    END IF;
END $$;

-- 4b. Detach nullable student-facing references; the learner rows survive.
DO $$
DECLARE
    r record;
    n bigint;
BEGIN
    FOR r IN SELECT * FROM (VALUES
        ('scores',                       'trainer_id',          '_target_trainers'),
        ('score_evidence',               'trainer_id',          '_target_trainers'),
        ('student_reports',              'trainer_id',          '_target_trainers'),
        ('portfolio_evidence',           'verified_by',         '_target_trainers'),
        ('online_exams',                 'trainer_id',          '_target_trainers'),
        ('documents',                    'uploaded_by',         '_target_users'),
        ('online_exam_submissions',      'graded_by',           '_target_users'),
        ('practical_assessment_reports', 'released_by_user_id', '_target_users')
    ) v(tbl, col, src)
    LOOP
        CONTINUE WHEN to_regclass('public.' || r.tbl) IS NULL;
        EXECUTE format('UPDATE %I SET %I = NULL WHERE %I IN (SELECT id FROM %I)',
                       r.tbl, r.col, r.col, r.src);
        GET DIAGNOSTICS n = ROW_COUNT;
        RAISE NOTICE 'detach % % -> % row(s)', rpad(r.tbl, 30), rpad(r.col, 20), n;
    END LOOP;
END $$;

-- 4c. Delete trainer-owned rows, then the trainer record, then the account.
DO $$
DECLARE
    r     record;
    n     bigint;
    total bigint := 0;
BEGIN
    FOR r IN SELECT * FROM (VALUES
        ( 1, 'trainer_courses',    'trainer_id IN (SELECT id FROM _target_trainers)'),
        ( 2, 'trainer_subjects',   'trainer_id IN (SELECT id FROM _target_trainers)'),
        ( 3, 'lesson_plans',       'trainer_id IN (SELECT id FROM _target_trainers)'),
        ( 4, 'staff_attendance',   'trainer_id IN (SELECT id FROM _target_trainers)'),
        ( 5, 'announcement_reads', 'user_id IN (SELECT id FROM _target_users)'),
        ( 6, 'notifications',      'user_id IN (SELECT id FROM _target_users)'),
        ( 7, 'surveys',            'user_id IN (SELECT id FROM _target_users)'),
        ( 8, 'system_logs',        'user_id IN (SELECT id FROM _target_users)'),
        ( 9, 'trainers',           'id IN (SELECT id FROM _target_trainers)'),
        (10, 'users',              'id IN (SELECT id FROM _target_users)')
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

SELECT count(*) AS remaining_trainers FROM trainers t
  JOIN users u ON u.id = t.user_id
  JOIN roles_permissions r ON r.id = u.role_id
 WHERE lower(r.role_name) = 'trainer';
SELECT count(*) AS remaining_users FROM users u
  JOIN roles_permissions r ON r.id = u.role_id
 WHERE lower(r.role_name) = 'trainer';

COMMIT;


-- @@SECTION notes
-- =============================================================================
-- Variants
-- =============================================================================
-- Scope to one department -- add to the _target_trainers definition:
--     AND t.department_id = '<department-uuid>'::uuid
--
-- One trainer only -- replace the _target_users definition with:
--     SELECT id FROM users WHERE lower(email) = 'leaver@example.edu'
--
-- Trainer rows whose user has another role are never in scope, yet still grant
-- trainer access (permissions.py:49). List them with:
--     SELECT t.id, u.email, r.role_name
--     FROM trainers t JOIN users u ON u.id = t.user_id
--     JOIN roles_permissions r ON r.id = u.role_id
--     WHERE lower(r.role_name) <> 'trainer';
