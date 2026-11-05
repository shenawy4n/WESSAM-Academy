-- ==============================================================================
-- Integration tests for Group Soft Archiving & Unforgeable Authorization Hardening
-- Migrations: 20261104000001, 20261104000002, 20261104000003, 20261104000004 & 20261104000005
-- Executed against disposable Supabase database in CI / local test harness.
-- ==============================================================================
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT extensions.plan(70);

-- ------------------------------------------------------------------------------
-- 1. SETUP DETERMINISTIC IDENTITIES
-- ------------------------------------------------------------------------------
INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('00000000-0000-4000-8000-000000000000', 'authenticated', 'authenticated', 'superadmin@test.invalid', '', now(), '{"role":"super_admin"}'::jsonb, '{}'::jsonb, now(), now()),
  ('11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'teacher@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'student1@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('33333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'student2@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('44444444-4444-4444-8444-444444444444', 'authenticated', 'authenticated', 'provstudent1@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('55555555-5555-4555-8555-555555555555', 'authenticated', 'authenticated', 'provstudent2@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, role, full_name, full_name_arabic, status)
VALUES
  ('00000000-0000-4000-8000-000000000000', 'super_admin', 'Super Admin Auditor', 'مشرف عام النظام', 'active'),
  ('11111111-1111-4111-8111-111111111111', 'teacher', 'Teacher Auditor', 'مدرس التدقيق', 'active'),
  ('22222222-2222-4222-8222-222222222222', 'student', 'Student One', 'طالب أول', 'active'),
  ('33333333-3333-4333-8333-333333333333', 'student', 'Student Two', 'طالب ثان', 'active')
ON CONFLICT (id) DO NOTHING;

-- Test Groups:
-- Group A (active, will be archived)
-- Group B (active destination)
-- Group C (inactive, cannot be archived)
-- Group D (dedicated replay test group)
INSERT INTO public.groups (id, name, name_arabic, max_students, is_active)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Cohort Alpha', 'الفصل ألفا', 10, true),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'Cohort Beta', 'الفصل بيتا', 10, true),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc3', 'Cohort Inactive', 'فصل غير نشط', 10, false),
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'Cohort Delta Replay', 'فصل اختبار الإعادة', 10, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.student_academic_profiles (profile_id, username, student_number, group_id)
VALUES
  ('22222222-2222-4222-8222-222222222222', 'student_alpha_1', 'ARC-001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),
  ('33333333-3333-4333-8333-333333333333', 'student_alpha_2', 'ARC-002', NULL)
ON CONFLICT (profile_id) DO NOTHING;

INSERT INTO public.group_students (group_id, student_id, joined_at)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '22222222-2222-4222-8222-222222222222', now())
ON CONFLICT (group_id, student_id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 2. SECURITY TEST SCENARIOS
-- ------------------------------------------------------------------------------

-- Test 1: Teacher cannot archive group
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT extensions.throws_ok(
  $$SELECT public.archive_group('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Audit archive attempt')$$,
  '42501',
  'Unauthorized: Only super admins can archive groups',
  'Teacher is strictly forbidden from archiving groups'
);
RESET ROLE;

-- Test 2: Student cannot archive group
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
SELECT extensions.throws_ok(
  $$SELECT public.archive_group('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Student hack')$$,
  '42501',
  'Unauthorized: Only super admins can archive groups',
  'Student is strictly forbidden from archiving groups'
);
RESET ROLE;

-- Test 3: Anon cannot archive group (rejected at privilege layer)
SET LOCAL ROLE anon;
SELECT extensions.throws_ok(
  $$SELECT public.archive_group('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Anon attempt')$$,
  '42501',
  NULL,
  'Anon caller is rejected'
);
RESET ROLE;

-- Test 4: Super admin cannot archive with empty reason
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000000', true);
SELECT extensions.throws_ok(
  $$SELECT public.archive_group('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '   ')$$,
  '22023',
  'Archive reason is required',
  'Whitespace reason is rejected'
);

-- Test 5: Super admin cannot archive with NULL reason
SELECT extensions.throws_ok(
  $$SELECT public.archive_group('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', NULL)$$,
  '22023',
  'Archive reason is required',
  'NULL reason is rejected'
);

-- Test 6: Super admin cannot archive nonexistent group
SELECT extensions.throws_ok(
  $$SELECT public.archive_group('99999999-9999-4999-8999-999999999999', 'Reason')$$,
  'P0002',
  'Academic group not found',
  'Nonexistent group is rejected'
);

-- Test 7: Super admin cannot archive inactive group
SELECT extensions.throws_ok(
  $$SELECT public.archive_group('cccccccc-cccc-4ccc-8ccc-ccccccccccc3', 'Archive inactive')$$,
  '22023',
  'Cannot archive an inactive group. Group must be active before archiving',
  'Inactive group cannot be archived'
);

-- Test 8: Super admin successfully archives active group
SELECT extensions.lives_ok(
  $$SELECT public.archive_group('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Semester completed 2026')$$,
  'Super Admin can archive active group'
);
RESET ROLE;

-- Test 9: Verify archived_at is NOT NULL
SELECT extensions.isnt(
  (SELECT archived_at FROM public.groups WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),
  NULL,
  'Group archived_at timestamp is set'
);

-- Test 10: Verify archived_by is set to Super Admin UID
SELECT extensions.is(
  (SELECT archived_by FROM public.groups WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),
  '00000000-0000-4000-8000-000000000000'::uuid,
  'Group archived_by matches Super Admin ID'
);

-- Test 11: Verify archive_reason is recorded
SELECT extensions.is(
  (SELECT archive_reason FROM public.groups WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),
  'Semester completed 2026',
  'Group archive_reason matches input'
);

-- Test 12: Verify audit log entry exists
SELECT extensions.is(
  (SELECT count(*)::integer FROM public.audit_logs WHERE action = 'ARCHIVE_GROUP' AND entity_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),
  1,
  'Audit log entry created for ARCHIVE_GROUP'
);

-- Test 13: Idempotency of archive_group
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000000', true);
SELECT extensions.is(
  (SELECT (public.archive_group('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Duplicate call'))->>'message'),
  'Group is already archived',
  'Archiving an already archived group is idempotent'
);
RESET ROLE;

-- Test 14: Teacher cannot enroll student into archived group
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT extensions.throws_ok(
  $$SELECT public.enroll_student_in_group(
    '33333333-3333-4333-8333-333333333333',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    false
  )$$,
  '22023',
  'Cannot enroll student: Target academic group is archived',
  'Enrollment in archived group is rejected'
);

-- Test 15: Teacher cannot transfer student into archived group
SELECT extensions.throws_ok(
  $$SELECT public.transfer_student_group(
    '33333333-3333-4333-8333-333333333333',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  )$$,
  '22023',
  'Cannot transfer student: Destination group is archived',
  'Transfer into archived group is rejected'
);

-- Test 16: Teacher CAN transfer student OUT of archived group into active group
SELECT extensions.lives_ok(
  $$SELECT public.transfer_student_group(
    '22222222-2222-4222-8222-222222222222',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
  )$$,
  'Transfer out of archived group into active group succeeds'
);
RESET ROLE;

-- Test 17: Destination membership created
SELECT extensions.is(
  (SELECT count(*)::integer FROM public.group_students WHERE group_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2' AND student_id = '22222222-2222-4222-8222-222222222222'),
  1,
  'Student successfully transferred to active destination group'
);

-- Test 18: Direct hard delete blocked on public.groups for teacher
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
DELETE FROM public.groups WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
RESET ROLE;
SELECT extensions.is(
  (SELECT count(*)::integer FROM public.groups WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'),
  1,
  'Direct DELETE on public.groups fails to delete row for teacher (RLS protected)'
);

-- Test 19: Direct hard delete blocked on public.groups even for super_admin via RESTRICTIVE policy
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000000', true);
DELETE FROM public.groups WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
RESET ROLE;
SELECT extensions.is(
  (SELECT count(*)::integer FROM public.groups WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'),
  1,
  'Direct DELETE blocked by RESTRICTIVE policy for all authenticated users'
);

-- Test 20: Teacher cannot restore group
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT extensions.throws_ok(
  $$SELECT public.restore_group('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1')$$,
  '42501',
  'Unauthorized: Only super admins can restore archived groups',
  'Teacher cannot restore archived group'
);

-- Test 21: Student cannot restore group
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
SELECT extensions.throws_ok(
  $$SELECT public.restore_group('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1')$$,
  '42501',
  'Unauthorized: Only super admins can restore archived groups',
  'Student cannot restore archived group'
);

-- Test 22: Super admin can restore group
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000000', true);
SELECT extensions.lives_ok(
  $$SELECT public.restore_group('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1')$$,
  'Super Admin can restore archived group'
);
RESET ROLE;

-- Test 23: Verify archive metadata cleared
SELECT extensions.is(
  (SELECT archived_at FROM public.groups WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),
  NULL,
  'Group archived_at is reset to NULL'
);

-- Test 24: Verify audit log entry for RESTORE_GROUP
SELECT extensions.is(
  (SELECT count(*)::integer FROM public.audit_logs WHERE action = 'RESTORE_GROUP' AND entity_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),
  1,
  'Audit log entry created for RESTORE_GROUP'
);

-- Test 25: Restored group can accept enrollments again
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT extensions.lives_ok(
  $$SELECT public.enroll_student_in_group(
    '33333333-3333-4333-8333-333333333333',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    false
  )$$,
  'Restored group can accept new student enrollments'
);
RESET ROLE;

-- ------------------------------------------------------------------------------
-- 3. DIRECT ARCHIVE METADATA PROTECTION & RESTORE LIFECYCLE TESTS
-- ------------------------------------------------------------------------------

-- Test 26: Teacher cannot set archived_at directly via UPDATE
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT extensions.throws_ok(
  $$UPDATE public.groups SET archived_at = now() WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'$$,
  '42501',
  'Unauthorized: Direct modification of group archive metadata is prohibited. Use archive_group or restore_group RPCs.',
  'Teacher cannot directly update archived_at'
);

-- Test 27: Teacher cannot set archived_by directly via UPDATE
SELECT extensions.throws_ok(
  $$UPDATE public.groups SET archived_by = '11111111-1111-4111-8111-111111111111'::uuid WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'$$,
  '42501',
  'Unauthorized: Direct modification of group archive metadata is prohibited. Use archive_group or restore_group RPCs.',
  'Teacher cannot directly update archived_by'
);

-- Test 28: Teacher cannot modify archive_reason directly via UPDATE
SELECT extensions.throws_ok(
  $$UPDATE public.groups SET archive_reason = 'Unauthorized reason tampering' WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'$$,
  '42501',
  'Unauthorized: Direct modification of group archive metadata is prohibited. Use archive_group or restore_group RPCs.',
  'Teacher cannot directly update archive_reason'
);

-- Test 29: Teacher cannot clear archive metadata directly via UPDATE on archived group
-- First archive Group B via super admin
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000000', true);
SELECT public.archive_group('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'Valid super admin archive');

-- Now teacher tries to clear archived_at directly via UPDATE
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT extensions.throws_ok(
  $$UPDATE public.groups SET archived_at = NULL, archive_reason = NULL WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'$$,
  '42501',
  'Unauthorized: Direct modification of group archive metadata is prohibited. Use archive_group or restore_group RPCs.',
  'Teacher cannot directly clear archive metadata'
);

-- Test 30: Student cannot modify archive metadata directly
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
SELECT extensions.throws_ok(
  $$UPDATE public.groups SET archived_at = NULL WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'$$,
  '42501',
  'Unauthorized: Direct modification of group archive metadata is prohibited. Use archive_group or restore_group RPCs.',
  'Student cannot directly update archive metadata'
);

-- Test 31: Super admin cannot modify archive metadata directly via UPDATE (must use RPC)
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000000', true);
SELECT extensions.throws_ok(
  $$UPDATE public.groups SET archive_reason = 'Tampered without RPC' WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'$$,
  '42501',
  'Unauthorized: Direct modification of group archive metadata is prohibited. Use archive_group or restore_group RPCs.',
  'Super Admin cannot directly update archive metadata outside RPC'
);

-- Test 32: Normal authorized group updates by Teacher (updating name, description, max_students) succeed
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT extensions.lives_ok(
  $$UPDATE public.groups SET name = 'Cohort Alpha Updated', description = 'Updated by teacher' WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'$$,
  'Teacher can still update non-archive group fields'
);
RESET ROLE;

-- Test 33: Verify normal group update was persisted
SELECT extensions.is(
  (SELECT name FROM public.groups WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),
  'Cohort Alpha Updated',
  'Ordinary group fields update successfully persists'
);

-- Test 34: Super Admin restoring a non-archived group throws controlled error 22023
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000000', true);
SELECT extensions.throws_ok(
  $$SELECT public.restore_group('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1')$$,
  '22023',
  'Cannot restore group: Group is not currently archived',
  'Restoring non-archived group throws controlled error'
);

-- Test 35: Restore group B properly via restore_group
SELECT extensions.lives_ok(
  $$SELECT public.restore_group('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2')$$,
  'Restore group B succeeds via RPC'
);
RESET ROLE;

-- Test 36: Restored group explicitly has is_active = TRUE
SELECT extensions.is(
  (SELECT is_active FROM public.groups WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'),
  true,
  'Restored group has is_active = TRUE'
);

-- ------------------------------------------------------------------------------
-- 4. HARDENED provision_student_tx TESTS
-- ------------------------------------------------------------------------------

-- Archive Group A again to test provision_student_tx rejection on archived group
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000000', true);
SELECT public.archive_group('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Re-archive for provisioning test');
RESET ROLE;

-- Test 37: provision_student_tx rejects target group that is archived
SET LOCAL ROLE service_role;
SELECT extensions.throws_ok(
  $$SELECT public.provision_student_tx(
    '44444444-4444-4444-8444-444444444444'::uuid,
    'Archived Student Test',
    'طالب اختبار أرشفة',
    '0500000001',
    'archived_student_test',
    'archived_student_test@internal.invalid',
    'PROV-001',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid,
    'Provision into archived note',
    '00000000-0000-4000-8000-000000000000'::uuid
  )$$,
  '22023',
  'Cannot provision student: Target academic group is archived',
  'provision_student_tx rejects archived target group'
);

-- Test 38: provision_student_tx succeeds into active non-archived group (Group B)
SELECT extensions.lives_ok(
  $$SELECT public.provision_student_tx(
    '55555555-5555-4555-8555-555555555555'::uuid,
    'Active Student Test',
    'طالب اختبار نشط',
    '0500000002',
    'active_student_test',
    'active_student_test@internal.invalid',
    'PROV-002',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'::uuid,
    'Provision into active group note',
    '00000000-0000-4000-8000-000000000000'::uuid
  )$$,
  'provision_student_tx succeeds into active group'
);

-- Test 39: Verify student membership created by provision_student_tx
SELECT extensions.is(
  (SELECT count(*)::integer FROM public.group_students WHERE group_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2' AND student_id = '55555555-5555-4555-8555-555555555555'),
  1,
  'provision_student_tx creates junction group membership'
);
RESET ROLE;

-- Test 40: Non-service_role (teacher) cannot execute provision_student_tx directly
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT extensions.throws_ok(
  $$SELECT public.provision_student_tx(
    '66666666-6666-4666-8666-666666666666'::uuid,
    'Direct Teacher Attack',
    'محاولة معلم مباشرة',
    NULL,
    'direct_teacher_attack',
    'direct_teacher_attack@internal.invalid',
    NULL,
    NULL,
    NULL,
    '11111111-1111-4111-8111-111111111111'::uuid
  )$$,
  '42501',
  NULL,
  'Teacher cannot directly execute provision_student_tx'
);

-- Test 41: Non-service_role (student) cannot execute provision_student_tx directly
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
SELECT extensions.throws_ok(
  $$SELECT public.provision_student_tx(
    '77777777-7777-4777-8777-777777777777'::uuid,
    'Direct Student Attack',
    'محاولة طالب مباشرة',
    NULL,
    'direct_student_attack',
    'direct_student_attack@internal.invalid',
    NULL,
    NULL,
    NULL,
    '22222222-2222-4222-8222-222222222222'::uuid
  )$$,
  '42501',
  NULL,
  'Student cannot directly execute provision_student_tx'
);
RESET ROLE;

-- ------------------------------------------------------------------------------
-- 5. SEC-03 LEAST PRIVILEGE & UNFORGEABLE LEDGER TESTS
-- ------------------------------------------------------------------------------

-- Test 42: Adversarial Test A — Custom GUC forgery by Super Admin is strictly rejected
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000000', true);
SELECT set_config('wessam.internal_archive_op', 'true', true);
SELECT extensions.throws_ok(
  $$UPDATE public.groups SET archived_at = now() WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'$$,
  '42501',
  'Unauthorized: Direct modification of group archive metadata is prohibited. Use archive_group or restore_group RPCs.',
  'Super Admin cannot bypass archive trigger by setting wessam.internal_archive_op GUC'
);
RESET ROLE;

-- Test 43: Teacher cannot insert into internal authorization table
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT extensions.throws_ok(
  $$INSERT INTO public.group_archive_authorizations (group_id, operation) VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'ARCHIVE')$$,
  '42501',
  NULL,
  'Teacher cannot insert authorization records into internal table'
);

-- Test 44: Teacher cannot select from internal authorization table
SELECT extensions.throws_ok(
  $$SELECT count(*) FROM public.group_archive_authorizations$$,
  '42501',
  NULL,
  'Teacher cannot read from internal authorization table'
);

-- Test 45: Teacher cannot update internal authorization table
SELECT extensions.throws_ok(
  $$UPDATE public.group_archive_authorizations SET operation = 'RESTORE'$$,
  '42501',
  NULL,
  'Teacher cannot update internal authorization table'
);

-- Test 46: Teacher cannot delete from internal authorization table
SELECT extensions.throws_ok(
  $$DELETE FROM public.group_archive_authorizations$$,
  '42501',
  NULL,
  'Teacher cannot delete from internal authorization table'
);
RESET ROLE;

-- Test 47: Student cannot insert into internal authorization table
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
SELECT extensions.throws_ok(
  $$INSERT INTO public.group_archive_authorizations (group_id, operation) VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'ARCHIVE')$$,
  '42501',
  NULL,
  'Student cannot insert authorization records into internal table'
);

-- Test 48: Student cannot select from internal authorization table
SELECT extensions.throws_ok(
  $$SELECT count(*) FROM public.group_archive_authorizations$$,
  '42501',
  NULL,
  'Student cannot read from internal authorization table'
);

-- Test 49: Student cannot update internal authorization table
SELECT extensions.throws_ok(
  $$UPDATE public.group_archive_authorizations SET operation = 'RESTORE'$$,
  '42501',
  NULL,
  'Student cannot update internal authorization table'
);

-- Test 50: Student cannot delete from internal authorization table
SELECT extensions.throws_ok(
  $$DELETE FROM public.group_archive_authorizations$$,
  '42501',
  NULL,
  'Student cannot delete from internal authorization table'
);
RESET ROLE;

-- Test 51: Super Admin cannot insert into internal authorization table directly
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000000', true);
SELECT extensions.throws_ok(
  $$INSERT INTO public.group_archive_authorizations (group_id, operation) VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'ARCHIVE')$$,
  '42501',
  NULL,
  'Super Admin cannot directly insert authorization records into internal table'
);

-- Test 52: Super Admin cannot select from internal authorization table
SELECT extensions.throws_ok(
  $$SELECT count(*) FROM public.group_archive_authorizations$$,
  '42501',
  NULL,
  'Super Admin cannot directly read from internal authorization table'
);

-- Test 53: Super Admin cannot update internal authorization table
SELECT extensions.throws_ok(
  $$UPDATE public.group_archive_authorizations SET operation = 'RESTORE'$$,
  '42501',
  NULL,
  'Super Admin cannot directly update internal authorization table'
);

-- Test 54: Super Admin cannot delete from internal authorization table
SELECT extensions.throws_ok(
  $$DELETE FROM public.group_archive_authorizations$$,
  '42501',
  NULL,
  'Super Admin cannot directly delete from internal authorization table'
);
RESET ROLE;

-- Test 55: Fix A — service_role cannot insert into internal authorization table directly
SET LOCAL ROLE service_role;
SELECT extensions.throws_ok(
  $$INSERT INTO public.group_archive_authorizations (group_id, operation) VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'ARCHIVE')$$,
  '42501',
  NULL,
  'service_role cannot insert authorization records directly into table'
);

-- Test 56: Fix A — service_role cannot select from internal authorization table
SELECT extensions.throws_ok(
  $$SELECT count(*) FROM public.group_archive_authorizations$$,
  '42501',
  NULL,
  'service_role cannot select from internal authorization table'
);

-- Test 57: Fix A — service_role cannot update internal authorization table
SELECT extensions.throws_ok(
  $$UPDATE public.group_archive_authorizations SET operation = 'RESTORE'$$,
  '42501',
  NULL,
  'service_role cannot update internal authorization table'
);

-- Test 58: Fix A — service_role cannot delete from internal authorization table
SELECT extensions.throws_ok(
  $$DELETE FROM public.group_archive_authorizations$$,
  '42501',
  NULL,
  'service_role cannot delete from internal authorization table'
);
RESET ROLE;

-- Test 59: Super Admin direct restore update outside restore_group RPC is rejected
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000000', true);
SELECT extensions.throws_ok(
  $$UPDATE public.groups SET archived_at = NULL, archived_by = NULL, archive_reason = NULL WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'$$,
  '42501',
  'Unauthorized: Direct modification of group archive metadata is prohibited. Use archive_group or restore_group RPCs.',
  'Super Admin cannot directly clear archive metadata outside restore_group RPC'
);

-- Test 60: Super Admin direct update of archived_at without RPC is rejected
SELECT extensions.throws_ok(
  $$UPDATE public.groups SET archived_at = now() WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'$$,
  '42501',
  'Unauthorized: Direct modification of group archive metadata is prohibited. Use archive_group or restore_group RPCs.',
  'Super Admin cannot directly update archived_at outside RPC'
);

-- Test 61: Super Admin direct update of archived_by without RPC is rejected
SELECT extensions.throws_ok(
  $$UPDATE public.groups SET archived_by = '00000000-0000-4000-8000-000000000000'::uuid WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'$$,
  '42501',
  'Unauthorized: Direct modification of group archive metadata is prohibited. Use archive_group or restore_group RPCs.',
  'Super Admin cannot directly update archived_by outside RPC'
);
RESET ROLE;

-- Test 62: Internal authorization table has zero lingering rows after legitimate operations
SELECT extensions.is(
  (SELECT count(*)::integer FROM public.group_archive_authorizations),
  0,
  'No authorization tickets linger in table after operations'
);

-- Test 63: Cross-group authorization ticket cannot authorize another group
-- Setup an authorization ticket for Group A as database owner, then attempt to update Group B as Super Admin
INSERT INTO public.group_archive_authorizations (group_id, operation, txid)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'ARCHIVE', pg_catalog.txid_current());

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000000', true);
SELECT extensions.throws_ok(
  $$UPDATE public.groups SET archived_at = now(), archived_by = '00000000-0000-4000-8000-000000000000'::uuid, archive_reason = 'Cross-group attack' WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'$$,
  '42501',
  'Unauthorized: Direct modification of group archive metadata is prohibited. Use archive_group or restore_group RPCs.',
  'Cross-group authorization ticket reuse is rejected'
);
RESET ROLE;
DELETE FROM public.group_archive_authorizations WHERE group_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

-- Test 64: Cross-operation: ARCHIVE ticket cannot authorize RESTORE operation
INSERT INTO public.group_archive_authorizations (group_id, operation, txid)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'ARCHIVE', pg_catalog.txid_current());

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000000', true);
SELECT extensions.throws_ok(
  $$UPDATE public.groups SET archived_at = NULL, archived_by = NULL, archive_reason = NULL, is_active = true WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'$$,
  '42501',
  'Unauthorized: Direct modification of group archive metadata is prohibited. Use archive_group or restore_group RPCs.',
  'ARCHIVE ticket cannot authorize RESTORE operation'
);
RESET ROLE;
DELETE FROM public.group_archive_authorizations WHERE group_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

-- Test 65: Cross-operation: RESTORE ticket cannot authorize ARCHIVE operation
INSERT INTO public.group_archive_authorizations (group_id, operation, txid)
VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'RESTORE', pg_catalog.txid_current());

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000000', true);
SELECT extensions.throws_ok(
  $$UPDATE public.groups SET archived_at = now(), archived_by = '00000000-0000-4000-8000-000000000000'::uuid, archive_reason = 'Wrong operation attack' WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'$$,
  '42501',
  'Unauthorized: Direct modification of group archive metadata is prohibited. Use archive_group or restore_group RPCs.',
  'RESTORE ticket cannot authorize ARCHIVE operation'
);
RESET ROLE;
DELETE FROM public.group_archive_authorizations WHERE group_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';

-- Test 66: Transaction-scoped isolation: ticket with different txid cannot authorize current transaction
INSERT INTO public.group_archive_authorizations (group_id, operation, txid)
VALUES ('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'ARCHIVE', pg_catalog.txid_current() - 1);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000000', true);
SELECT extensions.throws_ok(
  $$UPDATE public.groups SET archived_at = now(), archived_by = '00000000-0000-4000-8000-000000000000'::uuid, archive_reason = 'Stale txid attack' WHERE id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd4'$$,
  '42501',
  'Unauthorized: Direct modification of group archive metadata is prohibited. Use archive_group or restore_group RPCs.',
  'Ticket from another transaction ID is rejected'
);
RESET ROLE;
DELETE FROM public.group_archive_authorizations WHERE group_id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd4';

-- ------------------------------------------------------------------------------
-- 6. FIX B: ISOLATED REPLAY TEST (PROVING CONSUMPTION INDEPENDENT OF TRANSITION)
-- ------------------------------------------------------------------------------

-- Step 1: Create a single-use authorization ticket for unarchived Group D
INSERT INTO public.group_archive_authorizations (group_id, operation, txid)
VALUES ('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'ARCHIVE', pg_catalog.txid_current());

-- Test 67: First ARCHIVE transition succeeds and consumes the ticket
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000000', true);
SELECT extensions.lives_ok(
  $$UPDATE public.groups
    SET archived_at = now(),
        archived_by = '00000000-0000-4000-8000-000000000000'::uuid,
        archive_reason = 'First legitimate consume'
    WHERE id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd4'$$,
  'First valid archive transition executes and consumes ticket'
);
RESET ROLE;

-- Test 68: Confirm that the ticket was deleted upon consumption
SELECT extensions.is(
  (SELECT count(*)::integer FROM public.group_archive_authorizations WHERE group_id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd4'),
  0,
  'Authorization ticket is atomically deleted from table upon consumption'
);

-- Step 2: Reset Group D back to unarchived state using isolated owner mechanism
ALTER TABLE public.groups DISABLE TRIGGER trg_protect_group_archive_metadata;
UPDATE public.groups
SET archived_at = NULL, archived_by = NULL, archive_reason = NULL
WHERE id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd4';
ALTER TABLE public.groups ENABLE TRIGGER trg_protect_group_archive_metadata;

-- Test 69: Second ARCHIVE attempt on the reset group (valid unarchived -> archived transition)
-- must be rejected with 42501 specifically because the ticket was already consumed!
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000000', true);
SELECT extensions.throws_ok(
  $$UPDATE public.groups
    SET archived_at = now(),
        archived_by = '00000000-0000-4000-8000-000000000000'::uuid,
        archive_reason = 'Replay attempt without ticket'
    WHERE id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd4'$$,
  '42501',
  'Unauthorized: Direct modification of group archive metadata is prohibited. Use archive_group or restore_group RPCs.',
  'Replay attack rejected: ticket was consumed and cannot be reused for second valid archive transition'
);
RESET ROLE;

-- Test 70: Confirm authorization table remains completely clean
SELECT extensions.is(
  (SELECT count(*)::integer FROM public.group_archive_authorizations),
  0,
  'Authorization table remains completely clean after all tests'
);

ROLLBACK;
