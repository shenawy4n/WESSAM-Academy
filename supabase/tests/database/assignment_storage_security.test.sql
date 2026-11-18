-- ==============================================================================
-- WESSAM Academy — pgTAP Security & Isolation Tests for Migration 30
-- Assignment Storage Privacy & RLS Hardening ('assignment-files' bucket)
--
-- Covers:
--  - Bucket privacy & helper EXECUTE privileges
--  A. Anonymous users: denied SELECT, INSERT, DELETE, and helper RPC
--  B. Student 1: own submissions only; eligible published attachments only;
--     rejects Student 2 files, /me/ paths, unrelated & unpublished assignments
--  C. Student 2: reciprocal cross-student & cross-assignment isolation
--  D. Teacher 1: managed assignment attachments & submissions only; own draft
--     folder only; rejects Teacher 2 files/paths, submissions upload, traversal
--  E. Teacher 2: reciprocal cross-teacher isolation
--  F. Super Admin: active Super Admin cross-teacher access; inactive denied
--  G. Inactive accounts (student/teacher) denied + published draft-attachment
--     linkage verified for targeted students only
-- ==============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT extensions.plan(50);

-- ------------------------------------------------------------------------------
-- Deterministic Isolated Test Fixtures (executed as postgres)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_super_active     UUID := '66666666-0001-4000-8000-000000000001';
    v_super_inactive   UUID := '66666666-0001-4000-8000-000000000002';
    v_teacher_1        UUID := '66666666-0001-4000-8000-000000000003';
    v_teacher_2        UUID := '66666666-0001-4000-8000-000000000004';
    v_teacher_inactive UUID := '66666666-0001-4000-8000-000000000005';
    v_student_1        UUID := '66666666-0001-4000-8000-000000000006';
    v_student_2        UUID := '66666666-0001-4000-8000-000000000007';
    v_student_inactive UUID := '66666666-0001-4000-8000-000000000008';

    v_group_1          UUID := '66666666-0002-4000-8000-000000000001';
    v_group_2          UUID := '66666666-0002-4000-8000-000000000002';

    v_course_1         UUID := '66666666-0003-4000-8000-000000000001';
    v_course_2         UUID := '66666666-0003-4000-8000-000000000002';

    v_assign_1_pub     UUID := '66666666-0004-4000-8000-000000000001';
    v_assign_1_draft   UUID := '66666666-0004-4000-8000-000000000002';
    v_assign_2_pub     UUID := '66666666-0004-4000-8000-000000000003';
BEGIN
    INSERT INTO auth.users (
        id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES
        (v_super_active,     'authenticated', 'authenticated', 'm30_super_active@wessam.test',     '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
        (v_super_inactive,   'authenticated', 'authenticated', 'm30_super_inactive@wessam.test',   '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
        (v_teacher_1,        'authenticated', 'authenticated', 'm30_teacher1@wessam.test',         '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
        (v_teacher_2,        'authenticated', 'authenticated', 'm30_teacher2@wessam.test',         '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
        (v_teacher_inactive, 'authenticated', 'authenticated', 'm30_teacher_inactive@wessam.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
        (v_student_1,        'authenticated', 'authenticated', 'm30_student1@wessam.test',         '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
        (v_student_2,        'authenticated', 'authenticated', 'm30_student2@wessam.test',         '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
        (v_student_inactive, 'authenticated', 'authenticated', 'm30_student_inactive@wessam.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.profiles (id, role, full_name, full_name_arabic, status) VALUES
        (v_super_active,     'super_admin', 'M30 Super Active',     'مشرف نشط',      'active'),
        (v_super_inactive,   'super_admin', 'M30 Super Inactive',   'مشرف معطل',     'inactive'),
        (v_teacher_1,        'teacher',     'M30 Teacher 1',        'معلم ١',        'active'),
        (v_teacher_2,        'teacher',     'M30 Teacher 2',        'معلم ٢',        'active'),
        (v_teacher_inactive, 'teacher',     'M30 Teacher Inactive', 'معلم معطل',     'inactive'),
        (v_student_1,        'student',     'M30 Student 1',        'طالب ١',        'active'),
        (v_student_2,        'student',     'M30 Student 2',        'طالب ٢',        'active'),
        (v_student_inactive, 'student',     'M30 Student Inactive', 'طالب معطل',     'inactive')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, status = EXCLUDED.status;

    INSERT INTO public.groups (id, name, name_arabic, academic_year, max_students, is_active) VALUES
        (v_group_1, 'M30 Group 1', 'مجموعة ١', '2026/2027', 30, true),
        (v_group_2, 'M30 Group 2', 'مجموعة ٢', '2026/2027', 30, true)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.courses (id, teacher_id, title, title_arabic, is_published) VALUES
        (v_course_1, v_teacher_1, 'M30 Course 1', 'مقرر ١', true),
        (v_course_2, v_teacher_2, 'M30 Course 2', 'مقرر ٢', true)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.group_courses (group_id, course_id) VALUES
        (v_group_1, v_course_1),
        (v_group_2, v_course_2)
    ON CONFLICT DO NOTHING;

    INSERT INTO public.group_students (group_id, student_id) VALUES
        (v_group_1, v_student_1),
        (v_group_1, v_student_inactive),
        (v_group_2, v_student_2)
    ON CONFLICT DO NOTHING;

    INSERT INTO public.student_academic_profiles (profile_id, student_number, username, group_id, status) VALUES
        (v_student_1,        'WES-M30-001', 'm30_student1',         v_group_1, 'active'),
        (v_student_2,        'WES-M30-002', 'm30_student2',         v_group_2, 'active'),
        (v_student_inactive, 'WES-M30-003', 'm30_student_inactive', v_group_1, 'inactive')
    ON CONFLICT (profile_id) DO UPDATE SET group_id = EXCLUDED.group_id, status = EXCLUDED.status;

    INSERT INTO public.assignments (
        id, teacher_id, course_id, title, title_arabic, instructions,
        due_date, max_score, max_attempts, target_group_id, is_published, status, publish_at
    ) VALUES
        (v_assign_1_pub,   v_teacher_1, v_course_1, 'M30 Assign 1 Pub',   'واجب ١ منشور',  'Task 1',   now() + interval '7 days', 100, 3, v_group_1, true,  'published', now() - interval '1 hour'),
        (v_assign_1_draft, v_teacher_1, v_course_1, 'M30 Assign 1 Draft', 'واجب ١ مسودة',  'Draft 1',  now() + interval '7 days', 100, 3, v_group_1, false, 'draft',     now() - interval '1 hour'),
        (v_assign_2_pub,   v_teacher_2, v_course_2, 'M30 Assign 2 Pub',   'واجب ٢ منشور',  'Task 2',   now() + interval '7 days', 100, 3, v_group_2, true,  'published', now() - interval '1 hour')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.assignment_targets (assignment_id, target_type, group_id) VALUES
        (v_assign_1_pub,   'group', v_group_1),
        (v_assign_1_draft, 'group', v_group_1),
        (v_assign_2_pub,   'group', v_group_2)
    ON CONFLICT DO NOTHING;

    -- Deterministically remove only previously seeded fixture objects before inserting
    DELETE FROM storage.objects
    WHERE bucket_id = 'assignment-files'
      AND name IN (
          'attachments/66666666-0004-4000-8000-000000000001/1000_guide1.pdf',
          'attachments/66666666-0004-4000-8000-000000000002/1000_draft1.pdf',
          'attachments/66666666-0004-4000-8000-000000000003/1000_guide2.pdf',
          'attachments/drafts/66666666-0001-4000-8000-000000000003/1000_t1_draft.pdf',
          'submissions/66666666-0004-4000-8000-000000000001/66666666-0001-4000-8000-000000000006/1000_s1_work.pdf',
          'submissions/66666666-0004-4000-8000-000000000003/66666666-0001-4000-8000-000000000007/1000_s2_work.pdf',
          'submissions/66666666-0004-4000-8000-000000000001/66666666-0001-4000-8000-000000000008/1000_inactive_work.pdf'
      );

    -- Seed storage objects across attachments, drafts, and submissions
    INSERT INTO storage.objects (bucket_id, name, owner) VALUES
        ('assignment-files', 'attachments/66666666-0004-4000-8000-000000000001/1000_guide1.pdf', v_teacher_1),
        ('assignment-files', 'attachments/66666666-0004-4000-8000-000000000002/1000_draft1.pdf', v_teacher_1),
        ('assignment-files', 'attachments/66666666-0004-4000-8000-000000000003/1000_guide2.pdf', v_teacher_2),
        ('assignment-files', 'attachments/drafts/66666666-0001-4000-8000-000000000003/1000_t1_draft.pdf', v_teacher_1),
        ('assignment-files', 'submissions/66666666-0004-4000-8000-000000000001/66666666-0001-4000-8000-000000000006/1000_s1_work.pdf', v_student_1),
        ('assignment-files', 'submissions/66666666-0004-4000-8000-000000000003/66666666-0001-4000-8000-000000000007/1000_s2_work.pdf', v_student_2),
        ('assignment-files', 'submissions/66666666-0004-4000-8000-000000000001/66666666-0001-4000-8000-000000000008/1000_inactive_work.pdf', v_student_inactive);
END $$;

-- ------------------------------------------------------------------------------
-- Bucket Privacy & Helper Function Grants
-- ------------------------------------------------------------------------------
SELECT extensions.is(
    (SELECT public FROM storage.buckets WHERE id = 'assignment-files'),
    false,
    'assignment-files bucket remains private'
);

SELECT extensions.is(
    pg_catalog.has_function_privilege('anon', 'public.can_access_assignment_storage_object(text, text)', 'EXECUTE'),
    false,
    'anon does not have EXECUTE privilege on can_access_assignment_storage_object'
);

SELECT extensions.is(
    pg_catalog.has_function_privilege('authenticated', 'public.can_access_assignment_storage_object(text, text)', 'EXECUTE'),
    true,
    'authenticated has EXECUTE privilege on can_access_assignment_storage_object'
);

-- ==============================================================================
-- A. ANONYMOUS USERS
-- ==============================================================================
RESET ROLE;
SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claims" = '{"role":"anon"}';

SELECT extensions.is(
    (SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'assignment-files'),
    0,
    'A1: anon cannot read any assignment-files objects'
);

SELECT extensions.throws_ok(
    $$ INSERT INTO storage.objects (bucket_id, name) VALUES ('assignment-files', 'submissions/66666666-0004-4000-8000-000000000001/66666666-0001-4000-8000-000000000006/anon.pdf') $$,
    '42501',
    NULL,
    'A2: anon cannot upload to assignment-files'
);

SELECT extensions.is(
    (
        WITH deleted AS (
            DELETE FROM storage.objects
            WHERE bucket_id = 'assignment-files'
            RETURNING id
        )
        SELECT count(*)::int FROM deleted
    ),
    0,
    'A3: anon cannot delete any assignment-files objects'
);

SELECT extensions.throws_ok(
    $$ SELECT public.can_access_assignment_storage_object('attachments/66666666-0004-4000-8000-000000000001/1000_guide1.pdf', 'select') $$,
    '42501',
    NULL,
    'A4: anon cannot invoke can_access_assignment_storage_object helper'
);

-- ==============================================================================
-- B. STUDENT 1 ISOLATION & LEGITIMATE ACCESS
-- ==============================================================================
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"66666666-0001-4000-8000-000000000006","role":"authenticated"}';
SELECT set_config('request.jwt.claim.sub', '66666666-0001-4000-8000-000000000006', true);

SELECT extensions.is(
    (SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'assignment-files' AND name = 'submissions/66666666-0004-4000-8000-000000000001/66666666-0001-4000-8000-000000000006/1000_s1_work.pdf'),
    1,
    'B1: Student 1 can read their own submission file'
);

SELECT extensions.is(
    (SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'assignment-files' AND name = 'submissions/66666666-0004-4000-8000-000000000003/66666666-0001-4000-8000-000000000007/1000_s2_work.pdf'),
    0,
    'B2: Student 1 cannot read Student 2 submission file'
);

SELECT extensions.is(
    (SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'assignment-files' AND name = 'submissions/66666666-0004-4000-8000-000000000001/66666666-0001-4000-8000-000000000008/1000_inactive_work.pdf'),
    0,
    'B3: Student 1 cannot read another student submission file in the same assignment'
);

SELECT extensions.throws_ok(
    $$ INSERT INTO storage.objects (bucket_id, name) VALUES ('assignment-files', 'submissions/66666666-0004-4000-8000-000000000001/66666666-0001-4000-8000-000000000007/hijack.pdf') $$,
    '42501',
    NULL,
    'B4: Student 1 cannot upload into Student 2 path'
);

SELECT extensions.throws_ok(
    $$ INSERT INTO storage.objects (bucket_id, name) VALUES ('assignment-files', 'submissions/66666666-0004-4000-8000-000000000001/me/legacy.pdf') $$,
    '42501',
    NULL,
    'B5: Student 1 cannot upload into non-UUID /me/ submission path'
);

SELECT extensions.throws_ok(
    $$ INSERT INTO storage.objects (bucket_id, name) VALUES ('assignment-files', 'submissions/66666666-0004-4000-8000-000000000003/66666666-0001-4000-8000-000000000006/unrelated.pdf') $$,
    '42501',
    NULL,
    'B6: Student 1 cannot upload to an unrelated assignment'
);

SELECT extensions.throws_ok(
    $$ INSERT INTO storage.objects (bucket_id, name) VALUES ('assignment-files', 'attachments/66666666-0004-4000-8000-000000000001/student_forged.pdf') $$,
    '42501',
    NULL,
    'B7: Student 1 cannot upload into teacher attachments folder'
);

SELECT extensions.lives_ok(
    $$ INSERT INTO storage.objects (bucket_id, name) VALUES ('assignment-files', 'submissions/66666666-0004-4000-8000-000000000001/66666666-0001-4000-8000-000000000006/2000_s1_upload.pdf') $$,
    'B8: Student 1 can upload into their own submission path for eligible published assignment'
);

SELECT extensions.is(
    (SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'assignment-files' AND name = 'attachments/66666666-0004-4000-8000-000000000001/1000_guide1.pdf'),
    1,
    'B9: Student 1 can read attachment for eligible published assignment'
);

SELECT extensions.is(
    (SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'assignment-files' AND name = 'attachments/66666666-0004-4000-8000-000000000002/1000_draft1.pdf'),
    0,
    'B10: Student 1 cannot read attachment for unpublished draft assignment'
);

SELECT extensions.is(
    (SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'assignment-files' AND name = 'attachments/66666666-0004-4000-8000-000000000003/1000_guide2.pdf'),
    0,
    'B11: Student 1 cannot read attachment for unauthorized assignment'
);

SELECT extensions.is(
    (SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'assignment-files' AND name = 'attachments/drafts/66666666-0001-4000-8000-000000000003/1000_t1_draft.pdf'),
    0,
    'B12: Student 1 cannot read unlinked teacher draft attachment'
);

-- ==============================================================================
-- C. STUDENT 2 RECIPROCAL ISOLATION
-- ==============================================================================
SET LOCAL "request.jwt.claims" = '{"sub":"66666666-0001-4000-8000-000000000007","role":"authenticated"}';
SELECT set_config('request.jwt.claim.sub', '66666666-0001-4000-8000-000000000007', true);

SELECT extensions.is(
    (SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'assignment-files' AND name = 'submissions/66666666-0004-4000-8000-000000000003/66666666-0001-4000-8000-000000000007/1000_s2_work.pdf'),
    1,
    'C1: Student 2 can read their own submission file'
);

SELECT extensions.is(
    (SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'assignment-files' AND name = 'submissions/66666666-0004-4000-8000-000000000001/66666666-0001-4000-8000-000000000006/1000_s1_work.pdf'),
    0,
    'C2: Student 2 cannot read Student 1 submission file'
);

SELECT extensions.throws_ok(
    $$ INSERT INTO storage.objects (bucket_id, name) VALUES ('assignment-files', 'submissions/66666666-0004-4000-8000-000000000001/66666666-0001-4000-8000-000000000006/hijack2.pdf') $$,
    '42501',
    NULL,
    'C3: Student 2 cannot upload into Student 1 submission path'
);

SELECT extensions.is(
    (SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'assignment-files' AND name = 'attachments/66666666-0004-4000-8000-000000000003/1000_guide2.pdf'),
    1,
    'C4: Student 2 can read attachment for eligible published assignment 2'
);

SELECT extensions.is(
    (SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'assignment-files' AND name = 'attachments/66666666-0004-4000-8000-000000000001/1000_guide1.pdf'),
    0,
    'C5: Student 2 cannot read attachment for unrelated assignment 1'
);

SELECT extensions.throws_ok(
    $$ INSERT INTO storage.objects (bucket_id, name) VALUES ('assignment-files', 'attachments/66666666-0004-4000-8000-000000000003/student2_forged.pdf') $$,
    '42501',
    NULL,
    'C6: Student 2 cannot upload into attachments folder'
);

-- ==============================================================================
-- D. TEACHER 1 ISOLATION & OWNERSHIP ACCESS
-- ==============================================================================
SET LOCAL "request.jwt.claims" = '{"sub":"66666666-0001-4000-8000-000000000003","role":"authenticated"}';
SELECT set_config('request.jwt.claim.sub', '66666666-0001-4000-8000-000000000003', true);

SELECT extensions.is(
    (
        SELECT count(*)::int
        FROM storage.objects
        WHERE bucket_id = 'assignment-files'
          AND name IN (
              'attachments/66666666-0004-4000-8000-000000000001/1000_guide1.pdf',
              'attachments/66666666-0004-4000-8000-000000000002/1000_draft1.pdf',
              'attachments/drafts/66666666-0001-4000-8000-000000000003/1000_t1_draft.pdf',
              'submissions/66666666-0004-4000-8000-000000000001/66666666-0001-4000-8000-000000000006/1000_s1_work.pdf'
          )
    ),
    4,
    'D1: Teacher 1 can read attachments, drafts, and submissions for assignments they manage'
);

SELECT extensions.is(
    (
        SELECT count(*)::int
        FROM storage.objects
        WHERE bucket_id = 'assignment-files'
          AND name IN (
              'attachments/66666666-0004-4000-8000-000000000003/1000_guide2.pdf',
              'submissions/66666666-0004-4000-8000-000000000003/66666666-0001-4000-8000-000000000007/1000_s2_work.pdf'
          )
    ),
    0,
    'D2: Teacher 1 cannot read files belonging to Teacher 2 assignments'
);

SELECT extensions.lives_ok(
    $$ INSERT INTO storage.objects (bucket_id, name) VALUES ('assignment-files', 'attachments/66666666-0004-4000-8000-000000000001/2000_t1_extra.pdf') $$,
    'D3: Teacher 1 can upload attachment for an assignment they manage'
);

SELECT extensions.lives_ok(
    $$ INSERT INTO storage.objects (bucket_id, name) VALUES ('assignment-files', 'attachments/drafts/66666666-0001-4000-8000-000000000003/2000_new_draft.pdf') $$,
    'D4: Teacher 1 can upload draft attachment into their own scoped draft directory'
);

SELECT extensions.throws_ok(
    $$ INSERT INTO storage.objects (bucket_id, name) VALUES ('assignment-files', 'attachments/66666666-0004-4000-8000-000000000003/t1_hijack.pdf') $$,
    '42501',
    NULL,
    'D5: Teacher 1 cannot upload attachment for Teacher 2 assignment'
);

SELECT extensions.throws_ok(
    $$ INSERT INTO storage.objects (bucket_id, name) VALUES ('assignment-files', 'attachments/drafts/66666666-0001-4000-8000-000000000004/t1_spoof_draft.pdf') $$,
    '42501',
    NULL,
    'D6: Teacher 1 cannot upload into Teacher 2 draft directory'
);

SELECT extensions.throws_ok(
    $$ INSERT INTO storage.objects (bucket_id, name) VALUES ('assignment-files', 'submissions/66666666-0004-4000-8000-000000000001/66666666-0001-4000-8000-000000000006/teacher_spoof.pdf') $$,
    '42501',
    NULL,
    'D7: Teacher 1 cannot upload forged student submission file'
);

SELECT extensions.is(
    (
        WITH deleted AS (
            DELETE FROM storage.objects
            WHERE bucket_id = 'assignment-files'
              AND name IN (
                  'attachments/66666666-0004-4000-8000-000000000003/1000_guide2.pdf',
                  'submissions/66666666-0004-4000-8000-000000000003/66666666-0001-4000-8000-000000000007/1000_s2_work.pdf'
              )
            RETURNING id
        )
        SELECT count(*)::int FROM deleted
    ),
    0,
    'D8: Teacher 1 cannot delete Teacher 2 assignment or submission files'
);

SELECT extensions.is(
    (
        WITH deleted AS (
            DELETE FROM storage.objects
            WHERE bucket_id = 'assignment-files'
              AND name = 'attachments/66666666-0004-4000-8000-000000000001/2000_t1_extra.pdf'
            RETURNING id
        )
        SELECT count(*)::int FROM deleted
    ),
    1,
    'D9: Teacher 1 can delete attachment belonging to an assignment they manage'
);

SELECT extensions.throws_ok(
    $$ INSERT INTO storage.objects (bucket_id, name) VALUES ('assignment-files', 'attachments/66666666-0004-4000-8000-000000000001/../escape.pdf') $$,
    '42501',
    NULL,
    'D10: path traversal keys are rejected'
);

-- ==============================================================================
-- E. TEACHER 2 RECIPROCAL ISOLATION
-- ==============================================================================
SET LOCAL "request.jwt.claims" = '{"sub":"66666666-0001-4000-8000-000000000004","role":"authenticated"}';
SELECT set_config('request.jwt.claim.sub', '66666666-0001-4000-8000-000000000004', true);

SELECT extensions.is(
    (
        SELECT count(*)::int
        FROM storage.objects
        WHERE bucket_id = 'assignment-files'
          AND name IN (
              'attachments/66666666-0004-4000-8000-000000000003/1000_guide2.pdf',
              'submissions/66666666-0004-4000-8000-000000000003/66666666-0001-4000-8000-000000000007/1000_s2_work.pdf'
          )
    ),
    2,
    'E1: Teacher 2 can read attachments and submissions for Teacher 2 assignment'
);

SELECT extensions.is(
    (
        SELECT count(*)::int
        FROM storage.objects
        WHERE bucket_id = 'assignment-files'
          AND name IN (
              'attachments/66666666-0004-4000-8000-000000000001/1000_guide1.pdf',
              'attachments/66666666-0004-4000-8000-000000000002/1000_draft1.pdf',
              'attachments/drafts/66666666-0001-4000-8000-000000000003/1000_t1_draft.pdf',
              'submissions/66666666-0004-4000-8000-000000000001/66666666-0001-4000-8000-000000000006/1000_s1_work.pdf'
          )
    ),
    0,
    'E2: Teacher 2 cannot read files belonging to Teacher 1 assignments or drafts'
);

SELECT extensions.throws_ok(
    $$ INSERT INTO storage.objects (bucket_id, name) VALUES ('assignment-files', 'attachments/66666666-0004-4000-8000-000000000001/t2_hijack.pdf') $$,
    '42501',
    NULL,
    'E3: Teacher 2 cannot upload attachment for Teacher 1 assignment'
);

SELECT extensions.is(
    (
        WITH deleted AS (
            DELETE FROM storage.objects
            WHERE bucket_id = 'assignment-files'
              AND name = 'submissions/66666666-0004-4000-8000-000000000001/66666666-0001-4000-8000-000000000006/1000_s1_work.pdf'
            RETURNING id
        )
        SELECT count(*)::int FROM deleted
    ),
    0,
    'E4: Teacher 2 cannot delete Teacher 1 student submission file'
);

SELECT extensions.lives_ok(
    $$ INSERT INTO storage.objects (bucket_id, name) VALUES ('assignment-files', 'attachments/66666666-0004-4000-8000-000000000003/2000_t2_extra.pdf') $$,
    'E5: Teacher 2 can upload attachment for own assignment'
);

-- ==============================================================================
-- F. SUPER ADMIN (ACTIVE vs INACTIVE)
-- ==============================================================================
SET LOCAL "request.jwt.claims" = '{"sub":"66666666-0001-4000-8000-000000000001","role":"authenticated"}';
SELECT set_config('request.jwt.claim.sub', '66666666-0001-4000-8000-000000000001', true);

SELECT extensions.is(
    (
        SELECT count(*)::int
        FROM storage.objects
        WHERE bucket_id = 'assignment-files'
          AND name IN (
              'attachments/66666666-0004-4000-8000-000000000002/1000_draft1.pdf',
              'attachments/66666666-0004-4000-8000-000000000003/1000_guide2.pdf',
              'submissions/66666666-0004-4000-8000-000000000001/66666666-0001-4000-8000-000000000006/1000_s1_work.pdf',
              'submissions/66666666-0004-4000-8000-000000000003/66666666-0001-4000-8000-000000000007/1000_s2_work.pdf'
          )
    ),
    4,
    'F1: active Super Admin can read assignment files across all teachers and students'
);

SELECT extensions.lives_ok(
    $$ INSERT INTO storage.objects (bucket_id, name) VALUES ('assignment-files', 'attachments/66666666-0004-4000-8000-000000000003/2000_admin_upload.pdf') $$,
    'F2: active Super Admin can upload assignment files'
);

-- Inactive Super Admin
SET LOCAL "request.jwt.claims" = '{"sub":"66666666-0001-4000-8000-000000000002","role":"authenticated"}';
SELECT set_config('request.jwt.claim.sub', '66666666-0001-4000-8000-000000000002', true);

SELECT extensions.is(
    (SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'assignment-files'),
    0,
    'F3: inactive Super Admin cannot read any assignment-files objects'
);

SELECT extensions.throws_ok(
    $$ INSERT INTO storage.objects (bucket_id, name) VALUES ('assignment-files', 'attachments/66666666-0004-4000-8000-000000000001/inactive_admin.pdf') $$,
    '42501',
    NULL,
    'F4: inactive Super Admin cannot upload assignment files'
);

-- ==============================================================================
-- G. INACTIVE ACCOUNTS & PUBLISHED DRAFT-ATTACHMENT LINKAGE
-- ==============================================================================
-- Inactive Student
SET LOCAL "request.jwt.claims" = '{"sub":"66666666-0001-4000-8000-000000000008","role":"authenticated"}';
SELECT set_config('request.jwt.claim.sub', '66666666-0001-4000-8000-000000000008', true);

SELECT extensions.is(
    (SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'assignment-files'),
    0,
    'G1: inactive student cannot read any assignment-files objects'
);

SELECT extensions.throws_ok(
    $$ INSERT INTO storage.objects (bucket_id, name) VALUES ('assignment-files', 'submissions/66666666-0004-4000-8000-000000000001/66666666-0001-4000-8000-000000000008/inactive_up.pdf') $$,
    '42501',
    NULL,
    'G2: inactive student cannot upload even into own submission path'
);

-- Inactive Teacher
SET LOCAL "request.jwt.claims" = '{"sub":"66666666-0001-4000-8000-000000000005","role":"authenticated"}';
SELECT set_config('request.jwt.claim.sub', '66666666-0001-4000-8000-000000000005', true);

SELECT extensions.is(
    (SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'assignment-files'),
    0,
    'G3: inactive teacher cannot read any assignment-files objects'
);

SELECT extensions.throws_ok(
    $$ INSERT INTO storage.objects (bucket_id, name) VALUES ('assignment-files', 'attachments/drafts/66666666-0001-4000-8000-000000000005/inactive_teacher.pdf') $$,
    '42501',
    NULL,
    'G4: inactive teacher cannot upload into own draft path'
);

-- Link Teacher 1 draft attachment to published Assign 1 Pub -> Student 1 gains read access; Student 2 stays blocked
RESET ROLE;
UPDATE public.assignments
SET attachments = '[{"name":"t1_draft.pdf","path":"attachments/drafts/66666666-0001-4000-8000-000000000003/1000_t1_draft.pdf"}]'::jsonb
WHERE id = '66666666-0004-4000-8000-000000000001'::uuid;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"66666666-0001-4000-8000-000000000006","role":"authenticated"}';
SELECT set_config('request.jwt.claim.sub', '66666666-0001-4000-8000-000000000006', true);

SELECT extensions.is(
    (SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'assignment-files' AND name = 'attachments/drafts/66666666-0001-4000-8000-000000000003/1000_t1_draft.pdf'),
    1,
    'G5: targeted Student 1 can read draft attachment once saved to published assignment'
);

SET LOCAL "request.jwt.claims" = '{"sub":"66666666-0001-4000-8000-000000000007","role":"authenticated"}';
SELECT set_config('request.jwt.claim.sub', '66666666-0001-4000-8000-000000000007', true);

SELECT extensions.is(
    (SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'assignment-files' AND name = 'attachments/drafts/66666666-0001-4000-8000-000000000003/1000_t1_draft.pdf'),
    0,
    'G6: untargeted Student 2 still cannot read Teacher 1 published draft attachment'
);

SELECT * FROM extensions.finish();
ROLLBACK;
