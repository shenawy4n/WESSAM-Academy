-- ==============================================================================
-- WESSAM Academy — pgTAP Security & Integrity Tests for Migration 28
-- Submission Integrity & Grading Audit Hardening
--
-- Covers:
--  A. Anonymous caller: blocked from SELECT/INSERT/UPDATE/DELETE on submissions
--     and assignment_grading_history, and blocked from submission/grading RPCs
--  B. Authenticated Student: blocked from direct INSERT/UPDATE/DELETE on both
--     tables; preserves SELECT on own submissions only; submit_assignment RPC
--     succeeds for active targeted students and blocks untargeted/inactive
--  C. Authenticated Teacher: blocked from direct INSERT/UPDATE/DELETE on
--     submissions and assignment_grading_history; preserves SELECT on managed
--     assignments; grade_assignment_submission validates inputs, enforces
--     ownership, records auth.uid(), and appends grading history
--  D. Super Admin: blocked from direct table writes bypassing audit RPCs;
--     retains authorized grade_assignment_submission RPC and governance access
--  E. Regression & Academic Records: end-to-end submit -> grade -> academic
--     record visibility (NULL while unreleased, numeric score once released)
--  F. Effective PostgreSQL privilege assertions (has_table_privilege &
--     has_function_privilege) for anon and authenticated
-- ==============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT extensions.plan(63);

-- ------------------------------------------------------------------------------
-- Deterministic Isolated Test Fixtures (executed as table owner/postgres)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_super_admin      UUID := '77777777-0001-4000-8000-000000000001';
    v_teacher_a        UUID := '77777777-0001-4000-8000-000000000002';
    v_teacher_b        UUID := '77777777-0001-4000-8000-000000000003';
    v_student_1        UUID := '77777777-0001-4000-8000-000000000004';
    v_student_2        UUID := '77777777-0001-4000-8000-000000000005';
    v_student_inactive UUID := '77777777-0001-4000-8000-000000000006';

    v_group_a          UUID := '88888888-0001-4000-8000-000000000001';
    v_group_b          UUID := '88888888-0001-4000-8000-000000000002';

    v_course_a         UUID := '88888888-0002-4000-8000-000000000001';
    v_course_b         UUID := '88888888-0002-4000-8000-000000000002';

    v_assign_a         UUID := '88888888-0003-4000-8000-000000000001';
    v_assign_b         UUID := '88888888-0003-4000-8000-000000000002';

    v_sub_seed         UUID := '88888888-0004-4000-8000-000000000001';
    v_hist_seed        UUID := '88888888-0005-4000-8000-000000000001';
BEGIN
    INSERT INTO auth.users (
        id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES
        (v_super_admin,      'authenticated', 'authenticated', 'm28_super@wessam.test',            '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
        (v_teacher_a,        'authenticated', 'authenticated', 'm28_teachera@wessam.test',         '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
        (v_teacher_b,        'authenticated', 'authenticated', 'm28_teacherb@wessam.test',         '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
        (v_student_1,        'authenticated', 'authenticated', 'm28_student1@wessam.test',         '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
        (v_student_2,        'authenticated', 'authenticated', 'm28_student2@wessam.test',         '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
        (v_student_inactive, 'authenticated', 'authenticated', 'm28_student_inactive@wessam.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.profiles (id, role, full_name, full_name_arabic, status) VALUES
        (v_super_admin,      'super_admin', 'M28 Super Admin',      'مشرف عام ٢٨',      'active'),
        (v_teacher_a,        'teacher',     'M28 Teacher A',        'معلم أ ٢٨',        'active'),
        (v_teacher_b,        'teacher',     'M28 Teacher B',        'معلم ب ٢٨',        'active'),
        (v_student_1,        'student',     'M28 Student 1',        'طالب ١ ٢٨',        'active'),
        (v_student_2,        'student',     'M28 Student 2',        'طالب ٢ ٢٨',        'active'),
        (v_student_inactive, 'student',     'M28 Inactive Student', 'طالب غير نشط ٢٨',  'inactive')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, status = EXCLUDED.status;

    INSERT INTO public.groups (id, name, name_arabic, academic_year, max_students, is_active) VALUES
        (v_group_a, 'M28 Group A', 'مجموعة أ ٢٨', '2026/2027', 30, true),
        (v_group_b, 'M28 Group B', 'مجموعة ب ٢٨', '2026/2027', 30, true)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.courses (id, teacher_id, title, title_arabic, is_published) VALUES
        (v_course_a, v_teacher_a, 'M28 Course A', 'مقرر أ ٢٨', true),
        (v_course_b, v_teacher_a, 'M28 Course B', 'مقرر ب ٢٨', true)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.group_courses (group_id, course_id) VALUES
        (v_group_a, v_course_a),
        (v_group_b, v_course_b)
    ON CONFLICT DO NOTHING;

    INSERT INTO public.group_students (group_id, student_id) VALUES
        (v_group_a, v_student_1),
        (v_group_a, v_student_inactive),
        (v_group_b, v_student_2)
    ON CONFLICT DO NOTHING;

    INSERT INTO public.student_academic_profiles (profile_id, student_number, username, group_id, status) VALUES
        (v_student_1,        'WES-M28-001', 'm28_student1',         v_group_a, 'active'),
        (v_student_2,        'WES-M28-002', 'm28_student2',         v_group_b, 'active'),
        (v_student_inactive, 'WES-M28-003', 'm28_student_inactive', v_group_a, 'inactive')
    ON CONFLICT (profile_id) DO UPDATE SET group_id = EXCLUDED.group_id, status = EXCLUDED.status;

    INSERT INTO public.assignments (
        id, teacher_id, course_id, title, title_arabic, instructions,
        due_date, max_score, max_attempts, target_group_id, is_published, status
    ) VALUES
        (v_assign_a, v_teacher_a, v_course_a, 'M28 Assign A', 'واجب أ ٢٨', 'Essay A', now() + interval '7 days', 100, 2, v_group_a, true, 'published'),
        (v_assign_b, v_teacher_a, v_course_b, 'M28 Assign B', 'واجب ب ٢٨', 'Essay B', now() + interval '7 days', 100, 2, v_group_b, true, 'published')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.assignment_targets (assignment_id, target_type, group_id) VALUES
        (v_assign_a, 'group', v_group_a),
        (v_assign_b, 'group', v_group_b)
    ON CONFLICT DO NOTHING;

    -- Seed a pre-existing unreleased graded submission for Student 2 on Assign B
    INSERT INTO public.submissions (
        id, assignment_id, student_id, attempt_number, content, status,
        score, teacher_feedback, graded_at, graded_by, is_grade_released
    ) VALUES (
        v_sub_seed, v_assign_b, v_student_2, 1, 'Seeded answer from Student 2', 'graded',
        75, 'Initial teacher feedback', now(), v_teacher_a, false
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.assignment_grading_history (
        id, submission_id, assignment_id, student_id, graded_by,
        previous_score, new_score, previous_feedback, new_feedback,
        action_type, is_grade_released
    ) VALUES (
        v_hist_seed, v_sub_seed, v_assign_b, v_student_2, v_teacher_a,
        NULL, 75, NULL, 'Initial teacher feedback',
        'grade', false
    ) ON CONFLICT (id) DO NOTHING;
END $$;

-- ==============================================================================
-- A. ANONYMOUS CALLER DENIAL
-- ==============================================================================
RESET ROLE;
SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claims" = '{"role":"anon"}';

SELECT extensions.throws_ok(
    $$ SELECT * FROM public.submissions $$,
    '42501',
    NULL,
    'A1: anon cannot SELECT from public.submissions'
);

SELECT extensions.throws_ok(
    $$ INSERT INTO public.submissions (assignment_id, student_id, content) VALUES ('88888888-0003-4000-8000-000000000001'::uuid, '77777777-0001-4000-8000-000000000004'::uuid, 'forged') $$,
    '42501',
    NULL,
    'A2: anon cannot INSERT into public.submissions'
);

SELECT extensions.throws_ok(
    $$ UPDATE public.submissions SET score = 100 WHERE id = '88888888-0004-4000-8000-000000000001'::uuid $$,
    '42501',
    NULL,
    'A3: anon cannot UPDATE public.submissions'
);

SELECT extensions.throws_ok(
    $$ DELETE FROM public.submissions WHERE id = '88888888-0004-4000-8000-000000000001'::uuid $$,
    '42501',
    NULL,
    'A4: anon cannot DELETE from public.submissions'
);

SELECT extensions.throws_ok(
    $$ SELECT * FROM public.assignment_grading_history $$,
    '42501',
    NULL,
    'A5: anon cannot SELECT from public.assignment_grading_history'
);

SELECT extensions.throws_ok(
    $$ INSERT INTO public.assignment_grading_history (submission_id, assignment_id, student_id, graded_by, new_score) VALUES ('88888888-0004-4000-8000-000000000001'::uuid, '88888888-0003-4000-8000-000000000002'::uuid, '77777777-0001-4000-8000-000000000005'::uuid, '77777777-0001-4000-8000-000000000002'::uuid, 100) $$,
    '42501',
    NULL,
    'A6: anon cannot INSERT into public.assignment_grading_history'
);

SELECT extensions.throws_ok(
    $$ SELECT public.submit_assignment('88888888-0003-4000-8000-000000000001'::uuid, 'anon attempt') $$,
    '42501',
    NULL,
    'A7: anon cannot execute submit_assignment RPC'
);

SELECT extensions.throws_ok(
    $$ SELECT public.grade_assignment_submission('88888888-0004-4000-8000-000000000001'::uuid, 100) $$,
    '42501',
    NULL,
    'A8: anon cannot execute grade_assignment_submission RPC'
);

-- ==============================================================================
-- B. AUTHENTICATED STUDENT BEHAVIOUR
-- ==============================================================================
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"77777777-0001-4000-8000-000000000004","role":"authenticated"}';
SELECT set_config('request.jwt.claim.sub', '77777777-0001-4000-8000-000000000004', true);

SELECT extensions.throws_ok(
    $$ INSERT INTO public.submissions (assignment_id, student_id, attempt_number, content, score, is_grade_released, graded_by) VALUES ('88888888-0003-4000-8000-000000000001'::uuid, '77777777-0001-4000-8000-000000000004'::uuid, 1, 'forged', 100, true, '77777777-0001-4000-8000-000000000002'::uuid) $$,
    '42501',
    NULL,
    'B1: active student cannot directly INSERT into public.submissions'
);

SELECT extensions.throws_ok(
    $$ UPDATE public.submissions SET score = 100, is_grade_released = true WHERE student_id = '77777777-0001-4000-8000-000000000004'::uuid $$,
    '42501',
    NULL,
    'B2: active student cannot directly UPDATE public.submissions'
);

SELECT extensions.throws_ok(
    $$ DELETE FROM public.submissions WHERE student_id = '77777777-0001-4000-8000-000000000004'::uuid $$,
    '42501',
    NULL,
    'B3: active student cannot directly DELETE from public.submissions'
);

SELECT extensions.throws_ok(
    $$ INSERT INTO public.assignment_grading_history (submission_id, assignment_id, student_id, graded_by, new_score) VALUES ('88888888-0004-4000-8000-000000000001'::uuid, '88888888-0003-4000-8000-000000000002'::uuid, '77777777-0001-4000-8000-000000000004'::uuid, '77777777-0001-4000-8000-000000000004'::uuid, 100) $$,
    '42501',
    NULL,
    'B4: active student cannot directly INSERT into public.assignment_grading_history'
);

SELECT extensions.is(
    (SELECT count(*)::int FROM public.submissions WHERE id = '88888888-0004-4000-8000-000000000001'::uuid),
    0,
    'B5: Student 1 cannot SELECT Student 2 submissions'
);

SELECT extensions.lives_ok(
    $$
    SELECT set_config(
        'test.m28_sub1_id',
        (public.submit_assignment(
            '88888888-0003-4000-8000-000000000001'::uuid,
            'Student 1 legitimate submission via RPC',
            '[{"name":"work.pdf","path":"submissions/a1/s1/work.pdf","size":1024}]'::jsonb,
            'Submitted cleanly'
        )->>'submission_id'),
        true
    );
    $$,
    'B6: active targeted Student 1 succeeds via submit_assignment RPC'
);

SELECT extensions.is(
    (
        SELECT (
            student_id = '77777777-0001-4000-8000-000000000004'::uuid
            AND attempt_number = 1
            AND score IS NULL
            AND graded_by IS NULL
            AND is_grade_released = false
            AND status = 'submitted'
        )
        FROM public.submissions
        WHERE id = current_setting('test.m28_sub1_id')::uuid
    ),
    true,
    'B7: submit_assignment enforces auth.uid() ownership and clean ungraded defaults'
);

-- Student 2 (untargeted for Assign A)
SET LOCAL "request.jwt.claims" = '{"sub":"77777777-0001-4000-8000-000000000005","role":"authenticated"}';
SELECT set_config('request.jwt.claim.sub', '77777777-0001-4000-8000-000000000005', true);

SELECT extensions.is(
    (SELECT count(*)::int FROM public.submissions WHERE id = current_setting('test.m28_sub1_id')::uuid),
    0,
    'B8: Student 2 cannot SELECT Student 1 submission'
);

SELECT extensions.throws_ok(
    $$ SELECT public.submit_assignment('88888888-0003-4000-8000-000000000001'::uuid, 'untargeted submit') $$,
    '42501',
    NULL,
    'B9: untargeted Student 2 cannot submit to Assign A via RPC'
);

SELECT extensions.throws_ok(
    $$ SELECT public.grade_assignment_submission(current_setting('test.m28_sub1_id')::uuid, 100) $$,
    '42501',
    NULL,
    'B10: student cannot execute grade_assignment_submission RPC'
);

-- Inactive Student (even though in Group A)
SET LOCAL "request.jwt.claims" = '{"sub":"77777777-0001-4000-8000-000000000006","role":"authenticated"}';
SELECT set_config('request.jwt.claim.sub', '77777777-0001-4000-8000-000000000006', true);

SELECT extensions.throws_ok(
    $$ SELECT public.submit_assignment('88888888-0003-4000-8000-000000000001'::uuid, 'inactive student submit') $$,
    '42501',
    NULL,
    'B11: inactive student cannot submit assignment via RPC'
);

SELECT extensions.is(
    (SELECT count(*)::int FROM public.submissions),
    0,
    'B12: inactive student cannot SELECT any submissions'
);

-- ==============================================================================
-- C. AUTHENTICATED TEACHER BEHAVIOUR
-- ==============================================================================
SET LOCAL "request.jwt.claims" = '{"sub":"77777777-0001-4000-8000-000000000002","role":"authenticated"}';
SELECT set_config('request.jwt.claim.sub', '77777777-0001-4000-8000-000000000002', true);

SELECT extensions.throws_ok(
    $$ INSERT INTO public.submissions (assignment_id, student_id, attempt_number, content, score) VALUES ('88888888-0003-4000-8000-000000000001'::uuid, '77777777-0001-4000-8000-000000000004'::uuid, 2, 'forged by teacher', 95) $$,
    '42501',
    NULL,
    'C1: managing teacher cannot directly INSERT into public.submissions'
);

SELECT extensions.throws_ok(
    $$ UPDATE public.submissions SET score = 99, is_grade_released = true, graded_by = '77777777-0001-4000-8000-000000000003'::uuid WHERE id = current_setting('test.m28_sub1_id')::uuid $$,
    '42501',
    NULL,
    'C2: managing teacher cannot directly UPDATE score/release/graded_by on public.submissions'
);

SELECT extensions.throws_ok(
    $$ DELETE FROM public.submissions WHERE id = '88888888-0004-4000-8000-000000000001'::uuid $$,
    '42501',
    NULL,
    'C3: managing teacher cannot directly DELETE from public.submissions'
);

SELECT extensions.throws_ok(
    $$ INSERT INTO public.assignment_grading_history (submission_id, assignment_id, student_id, graded_by, new_score, action_type, is_grade_released) VALUES ('88888888-0004-4000-8000-000000000001'::uuid, '88888888-0003-4000-8000-000000000002'::uuid, '77777777-0001-4000-8000-000000000005'::uuid, '77777777-0001-4000-8000-000000000003'::uuid, 100, 'grade', true) $$,
    '42501',
    NULL,
    'C4: managing teacher cannot directly INSERT forged grading history rows'
);

SELECT extensions.throws_ok(
    $$ UPDATE public.assignment_grading_history SET new_score = 100 WHERE id = '88888888-0005-4000-8000-000000000001'::uuid $$,
    '42501',
    NULL,
    'C5: managing teacher cannot directly UPDATE public.assignment_grading_history'
);

SELECT extensions.throws_ok(
    $$ DELETE FROM public.assignment_grading_history WHERE id = '88888888-0005-4000-8000-000000000001'::uuid $$,
    '42501',
    NULL,
    'C6: managing teacher cannot directly DELETE from public.assignment_grading_history'
);

SELECT extensions.is(
    (SELECT count(*)::int FROM public.submissions WHERE id IN ('88888888-0004-4000-8000-000000000001'::uuid, current_setting('test.m28_sub1_id')::uuid)),
    2,
    'C7: managing Teacher A retains SELECT access on managed submissions'
);

SELECT extensions.is(
    (SELECT count(*)::int FROM public.assignment_grading_history WHERE id = '88888888-0005-4000-8000-000000000001'::uuid),
    1,
    'C8: managing Teacher A retains SELECT access on managed grading history'
);

SELECT extensions.throws_ok(
    $$ SELECT public.grade_assignment_submission(current_setting('test.m28_sub1_id')::uuid, NULL, 'Missing score') $$,
    '22000',
    NULL,
    'C9: grade_assignment_submission rejects NULL score with SQLSTATE 22000'
);

SELECT extensions.throws_ok(
    $$ SELECT public.grade_assignment_submission(current_setting('test.m28_sub1_id')::uuid, -5, 'Negative score') $$,
    '22000',
    NULL,
    'C10: grade_assignment_submission rejects negative score with SQLSTATE 22000'
);

SELECT extensions.throws_ok(
    $$ SELECT public.grade_assignment_submission(current_setting('test.m28_sub1_id')::uuid, 105, 'Over max score') $$,
    '22000',
    NULL,
    'C11: grade_assignment_submission rejects score above max_score with SQLSTATE 22000'
);

SELECT extensions.throws_ok(
    $$ SELECT public.grade_assignment_submission(current_setting('test.m28_sub1_id')::uuid, 80, 'Bad action', NULL, '{}'::jsonb, false, 'forged_action') $$,
    '22023',
    NULL,
    'C12: grade_assignment_submission rejects unsupported action_type with SQLSTATE 22023'
);

SELECT extensions.lives_ok(
    $$
    SELECT public.grade_assignment_submission(
        current_setting('test.m28_sub1_id')::uuid,
        84,
        'Solid thesis statement.',
        'Keep tracking paragraph cohesion.',
        '{}'::jsonb,
        false,
        'grade'
    );
    $$,
    'C13: managing Teacher A can grade submission via grade_assignment_submission RPC'
);

SELECT extensions.is(
    (
        SELECT (
            s.score = 84
            AND s.graded_by = '77777777-0001-4000-8000-000000000002'::uuid
            AND s.is_grade_released = false
            AND h.graded_by = '77777777-0001-4000-8000-000000000002'::uuid
            AND h.previous_score IS NULL
            AND h.new_score = 84
            AND h.action_type = 'grade'
            AND h.is_grade_released = false
        )
        FROM public.submissions s
        JOIN public.assignment_grading_history h ON h.submission_id = s.id
        WHERE s.id = current_setting('test.m28_sub1_id')::uuid
        LIMIT 1
    ),
    true,
    'C14: grading RPC records server auth.uid(), unreleased state, and append-only history'
);

-- Non-managing Teacher B
SET LOCAL "request.jwt.claims" = '{"sub":"77777777-0001-4000-8000-000000000003","role":"authenticated"}';
SELECT set_config('request.jwt.claim.sub', '77777777-0001-4000-8000-000000000003', true);

SELECT extensions.is(
    (SELECT count(*)::int FROM public.submissions WHERE id IN ('88888888-0004-4000-8000-000000000001'::uuid, current_setting('test.m28_sub1_id')::uuid)),
    0,
    'C15: non-managing Teacher B cannot SELECT Teacher A submissions'
);

SELECT extensions.throws_ok(
    $$ SELECT public.grade_assignment_submission(current_setting('test.m28_sub1_id')::uuid, 50, 'Unauthorized grade') $$,
    '42501',
    NULL,
    'C16: non-managing Teacher B cannot grade Teacher A submission via RPC'
);

-- ==============================================================================
-- D. SUPER ADMIN BEHAVIOUR
-- ==============================================================================
SET LOCAL "request.jwt.claims" = '{"sub":"77777777-0001-4000-8000-000000000001","role":"authenticated"}';
SELECT set_config('request.jwt.claim.sub', '77777777-0001-4000-8000-000000000001', true);

SELECT extensions.throws_ok(
    $$ INSERT INTO public.submissions (assignment_id, student_id, attempt_number, content, score) VALUES ('88888888-0003-4000-8000-000000000001'::uuid, '77777777-0001-4000-8000-000000000004'::uuid, 2, 'admin direct insert', 100) $$,
    '42501',
    NULL,
    'D1: super_admin cannot directly INSERT into public.submissions'
);

SELECT extensions.throws_ok(
    $$ UPDATE public.submissions SET score = 100 WHERE id = current_setting('test.m28_sub1_id')::uuid $$,
    '42501',
    NULL,
    'D2: super_admin cannot directly UPDATE public.submissions'
);

SELECT extensions.throws_ok(
    $$ DELETE FROM public.submissions WHERE id = '88888888-0004-4000-8000-000000000001'::uuid $$,
    '42501',
    NULL,
    'D3: super_admin cannot directly DELETE from public.submissions'
);

SELECT extensions.throws_ok(
    $$ INSERT INTO public.assignment_grading_history (submission_id, assignment_id, student_id, graded_by, new_score) VALUES ('88888888-0004-4000-8000-000000000001'::uuid, '88888888-0003-4000-8000-000000000002'::uuid, '77777777-0001-4000-8000-000000000005'::uuid, '77777777-0001-4000-8000-000000000001'::uuid, 100) $$,
    '42501',
    NULL,
    'D4: super_admin cannot directly INSERT into public.assignment_grading_history'
);

SELECT extensions.lives_ok(
    $$
    SELECT public.grade_assignment_submission(
        current_setting('test.m28_sub1_id')::uuid,
        92,
        'Moderated and released.',
        NULL,
        '{}'::jsonb,
        true,
        'regrade'
    );
    $$,
    'D5: super_admin can regrade and release via grade_assignment_submission RPC'
);

SELECT extensions.is(
    (
        SELECT (
            s.score = 92
            AND s.graded_by = '77777777-0001-4000-8000-000000000001'::uuid
            AND s.is_grade_released = true
            AND h.previous_score = 84
            AND h.new_score = 92
            AND h.graded_by = '77777777-0001-4000-8000-000000000001'::uuid
            AND h.action_type = 'regrade'
            AND h.is_grade_released = true
        )
        FROM public.submissions s
        JOIN public.assignment_grading_history h ON h.submission_id = s.id
        WHERE s.id = current_setting('test.m28_sub1_id')::uuid
          AND h.action_type = 'regrade'
        ORDER BY h.created_at DESC
        LIMIT 1
    ),
    true,
    'D6: super_admin regrade preserves previous_score snapshot and attributes graded_by to super_admin'
);

-- ==============================================================================
-- E. ACADEMIC RECORDS & GOVERNANCE REGRESSION CHECKS
-- ==============================================================================
-- Student 2 has unreleased grade (75, is_grade_released = false) on Assign B -> must return NULL
SET LOCAL "request.jwt.claims" = '{"sub":"77777777-0001-4000-8000-000000000005","role":"authenticated"}';
SELECT set_config('request.jwt.claim.sub', '77777777-0001-4000-8000-000000000005', true);

SELECT extensions.is(
    (public.get_student_academic_record(NULL, NULL, NULL, NULL, NULL, NULL)->'assignments'->0->>'score'),
    NULL,
    'E1: get_student_academic_record keeps unreleased assignment score NULL for Student 2'
);

-- Student 1 has released grade (92, is_grade_released = true) on Assign A -> must return 92
SET LOCAL "request.jwt.claims" = '{"sub":"77777777-0001-4000-8000-000000000004","role":"authenticated"}';
SELECT set_config('request.jwt.claim.sub', '77777777-0001-4000-8000-000000000004', true);

SELECT extensions.is(
    ((public.get_student_academic_record(NULL, NULL, NULL, NULL, NULL, NULL)->'assignments'->0->>'score')::numeric),
    92::numeric,
    'E2: get_student_academic_record returns released assignment score for Student 1'
);

-- Super Admin governance function compatibility check
SET LOCAL "request.jwt.claims" = '{"sub":"77777777-0001-4000-8000-000000000001","role":"authenticated"}';
SELECT set_config('request.jwt.claim.sub', '77777777-0001-4000-8000-000000000001', true);

SELECT extensions.lives_ok(
    $$ SELECT public.list_staff_and_access_accounts() $$,
    'E3: super_admin governance RPCs remain intact after Migration 28'
);

-- ==============================================================================
-- F. EFFECTIVE POSTGRESQL TABLE & FUNCTION PRIVILEGES
-- ==============================================================================
RESET ROLE;

SELECT extensions.is(pg_catalog.has_table_privilege('anon', 'public.submissions', 'SELECT'), false, 'F1: anon lacks SELECT on submissions');
SELECT extensions.is(pg_catalog.has_table_privilege('anon', 'public.submissions', 'INSERT'), false, 'F2: anon lacks INSERT on submissions');
SELECT extensions.is(pg_catalog.has_table_privilege('anon', 'public.submissions', 'UPDATE'), false, 'F3: anon lacks UPDATE on submissions');
SELECT extensions.is(pg_catalog.has_table_privilege('anon', 'public.submissions', 'DELETE'), false, 'F4: anon lacks DELETE on submissions');

SELECT extensions.is(pg_catalog.has_table_privilege('anon', 'public.assignment_grading_history', 'SELECT'), false, 'F5: anon lacks SELECT on assignment_grading_history');
SELECT extensions.is(pg_catalog.has_table_privilege('anon', 'public.assignment_grading_history', 'INSERT'), false, 'F6: anon lacks INSERT on assignment_grading_history');

SELECT extensions.is(pg_catalog.has_table_privilege('authenticated', 'public.submissions', 'SELECT'), true, 'F7: authenticated has SELECT on submissions');
SELECT extensions.is(pg_catalog.has_table_privilege('authenticated', 'public.submissions', 'INSERT'), false, 'F8: authenticated lacks INSERT on submissions');
SELECT extensions.is(pg_catalog.has_table_privilege('authenticated', 'public.submissions', 'UPDATE'), false, 'F9: authenticated lacks UPDATE on submissions');
SELECT extensions.is(pg_catalog.has_table_privilege('authenticated', 'public.submissions', 'DELETE'), false, 'F10: authenticated lacks DELETE on submissions');

SELECT extensions.is(pg_catalog.has_table_privilege('authenticated', 'public.assignment_grading_history', 'SELECT'), true, 'F11: authenticated has SELECT on assignment_grading_history');
SELECT extensions.is(pg_catalog.has_table_privilege('authenticated', 'public.assignment_grading_history', 'INSERT'), false, 'F12: authenticated lacks INSERT on assignment_grading_history');
SELECT extensions.is(pg_catalog.has_table_privilege('authenticated', 'public.assignment_grading_history', 'UPDATE'), false, 'F13: authenticated lacks UPDATE on assignment_grading_history');
SELECT extensions.is(pg_catalog.has_table_privilege('authenticated', 'public.assignment_grading_history', 'DELETE'), false, 'F14: authenticated lacks DELETE on assignment_grading_history');

SELECT extensions.is(pg_catalog.has_function_privilege('anon', 'public.submit_assignment(uuid, text, jsonb, text)', 'EXECUTE'), false, 'F15: anon lacks EXECUTE on submit_assignment');
SELECT extensions.is(pg_catalog.has_function_privilege('anon', 'public.grade_assignment_submission(uuid, numeric, text, text, jsonb, boolean, text)', 'EXECUTE'), false, 'F16: anon lacks EXECUTE on grade_assignment_submission');
SELECT extensions.is(pg_catalog.has_function_privilege('authenticated', 'public.submit_assignment(uuid, text, jsonb, text)', 'EXECUTE'), true, 'F17: authenticated has EXECUTE on submit_assignment');
SELECT extensions.is(pg_catalog.has_function_privilege('authenticated', 'public.grade_assignment_submission(uuid, numeric, text, text, jsonb, boolean, text)', 'EXECUTE'), true, 'F18: authenticated has EXECUTE on grade_assignment_submission');

SELECT * FROM extensions.finish();
ROLLBACK;
