-- Integration tests for migration 20261103000006.
-- Executed only against the disposable Supabase database started by GitHub Actions.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT extensions.plan(22);

-- Deterministic, isolated identities for the test transaction.
INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'teacher@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'student1@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('33333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'student2@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, role, full_name, full_name_arabic, status)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'teacher', 'Integration Teacher', 'مدرس اختبار', 'active'),
  ('22222222-2222-4222-8222-222222222222', 'student', 'Student One', 'الطالب الأول', 'active'),
  ('33333333-3333-4333-8333-333333333333', 'student', 'Student Two', 'الطالب الثاني', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.groups (id, name, name_arabic, max_students, is_active)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Capacity One', 'مجموعة سعة 1', 1, true),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'Group B', 'المجموعة ب', 3, true),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc3', 'Group C', 'المجموعة ج', 3, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.student_academic_profiles (profile_id, username, student_number, group_id)
VALUES
  ('22222222-2222-4222-8222-222222222222', 'student_one_test', 'TEST-001', NULL),
  ('33333333-3333-4333-8333-333333333333', 'student_two_test', 'TEST-002', NULL)
ON CONFLICT (profile_id) DO NOTHING;

INSERT INTO public.student_credentials (profile_id, username, internal_auth_email, is_active)
VALUES
  ('22222222-2222-4222-8222-222222222222', 'student_one_test', 'student_one_test@internal.invalid', true),
  ('33333333-3333-4333-8333-333333333333', 'student_two_test', 'student_two_test@internal.invalid', true)
ON CONFLICT (profile_id) DO NOTHING;

-- Exercise the RPCs as an authenticated teacher, not as the database owner.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

SELECT extensions.lives_ok(
  $$SELECT public.enroll_student_in_group(
    '22222222-2222-4222-8222-222222222222',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    true
  )$$,
  'teacher can enroll a student in a group'
);
RESET ROLE;
SELECT extensions.is(
  (SELECT count(*)::integer FROM public.group_students WHERE group_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),
  1,
  'successful enrollment creates exactly one membership'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT extensions.throws_ok(
  $$SELECT public.enroll_student_in_group(
    '33333333-3333-4333-8333-333333333333',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    false
  )$$,
  'P0003',
  'enrollment rejects a full group'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT extensions.lives_ok(
  $$SELECT public.transfer_student_group(
    '22222222-2222-4222-8222-222222222222',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
  )$$,
  'teacher can transfer a student between groups'
);
RESET ROLE;
SELECT extensions.is(
  (SELECT group_id FROM public.student_academic_profiles WHERE profile_id = '22222222-2222-4222-8222-222222222222'),
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'::uuid,
  'transfer updates the primary group'
);
SELECT extensions.is(
  (SELECT count(*)::integer FROM public.group_students WHERE student_id = '22222222-2222-4222-8222-222222222222' AND group_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'),
  1,
  'transfer creates destination membership'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT extensions.throws_ok(
  $$SELECT public.transfer_student_group(
    '22222222-2222-4222-8222-222222222222',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc3'
  )$$,
  'P0002',
  'transfer rejects a student absent from the source group'
);
SELECT extensions.lives_ok(
  $$SELECT public.remove_student_from_group(
    '22222222-2222-4222-8222-222222222222',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
  )$$,
  'teacher can remove an existing group membership'
);
RESET ROLE;
SELECT extensions.is(
  (SELECT group_id FROM public.student_academic_profiles WHERE profile_id = '22222222-2222-4222-8222-222222222222'),
  NULL::uuid,
  'removing the last group clears the primary group'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT extensions.throws_ok(
  $$SELECT public.remove_student_from_group(
    '22222222-2222-4222-8222-222222222222',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
  )$$,
  'P0002',
  'removal rejects a membership that does not exist'
);
SELECT extensions.lives_ok(
  $$SELECT public.enroll_student_in_group(
    '33333333-3333-4333-8333-333333333333',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    false
  )$$,
  'enrollment sets a primary group when none exists'
);
SELECT extensions.lives_ok(
  $$SELECT public.enroll_student_in_group(
    '33333333-3333-4333-8333-333333333333',
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc3',
    false
  )$$,
  'student can belong to more than one group'
);
RESET ROLE;
SELECT extensions.is(
  (SELECT group_id FROM public.student_academic_profiles WHERE profile_id = '33333333-3333-4333-8333-333333333333'),
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'::uuid,
  'adding a secondary group preserves the existing primary group'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT extensions.lives_ok(
  $$SELECT public.remove_student_from_group(
    '33333333-3333-4333-8333-333333333333',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
  )$$,
  'teacher can remove a primary membership when another group remains'
);
RESET ROLE;
SELECT extensions.is(
  (SELECT group_id FROM public.student_academic_profiles WHERE profile_id = '33333333-3333-4333-8333-333333333333'),
  'cccccccc-cccc-4ccc-8ccc-ccccccccccc3'::uuid,
  'removing the primary group selects a remaining membership'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT extensions.lives_ok(
  $$SELECT public.update_student_status(
    '33333333-3333-4333-8333-333333333333',
    'suspended',
    'integration test'
  )$$,
  'teacher can update student status'
);
RESET ROLE;
SELECT extensions.is(
  (SELECT status::text FROM public.profiles WHERE id = '33333333-3333-4333-8333-333333333333'),
  'suspended',
  'status change updates the master profile'
);
SELECT extensions.is(
  (SELECT is_active FROM public.student_credentials WHERE profile_id = '33333333-3333-4333-8333-333333333333'),
  false,
  'suspension disables the student credential'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT extensions.lives_ok(
  $$SELECT public.update_student_details(
    '33333333-3333-4333-8333-333333333333',
    'Updated Student',
    'طالب محدث',
    '01000000000',
    'TEST-UPDATED',
    'Updated by integration test'
  )$$,
  'teacher can update student details'
);
RESET ROLE;
SELECT extensions.is(
  (SELECT full_name FROM public.profiles WHERE id = '33333333-3333-4333-8333-333333333333'),
  'Updated Student',
  'student details are persisted'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
SELECT extensions.throws_ok(
  $$SELECT public.enroll_student_in_group(
    '22222222-2222-4222-8222-222222222222',
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc3',
    false
  )$$,
  '42501',
  'student role cannot call teacher-only group RPCs'
);
RESET ROLE;

SELECT extensions.is(
  (SELECT count(*)::integer FROM public.audit_logs WHERE entity_type IN ('group_membership', 'student')),
  8,
  'successful RPC operations write the expected audit records'
);

SELECT * FROM extensions.finish();
ROLLBACK;
