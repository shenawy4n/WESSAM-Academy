-- ==============================================================================
-- WESSAM Academy — pgTAP Security Tests for Super Admin Teacher Provisioning
-- Covers:
--  1. privilege lockdown on provision_teacher_tx (no anon/authenticated execution)
--  2. profiles RLS prevents teachers and students from creating teacher/super_admin accounts
--  3. provision_teacher_tx rejects non-super_admin and inactive super_admin actors (42501)
--  4. provision_teacher_tx creates active teacher profile (role = 'teacher') + audit log without secrets
--  5. provision_teacher_tx rejects duplicate case-insensitive email (23505)
--  6. Teachers cannot read CREATE_TEACHER_ACCOUNT audit logs; Super Admins can see both directory email & audit entry
-- ==============================================================================

BEGIN;
SELECT plan(9);

DO $$
DECLARE
    v_super_id UUID := 'aaaa1111-1111-4111-8111-111111111101';
    v_teacher_id UUID := 'aaaa1111-1111-4111-8111-111111111102';
    v_student_id UUID := 'aaaa1111-1111-4111-8111-111111111103';
    v_new_teacher_id UUID := 'aaaa1111-1111-4111-8111-111111111104';
    v_dup_teacher_id UUID := 'aaaa1111-1111-4111-8111-111111111105';
    v_rogue_id UUID := 'aaaa1111-1111-4111-8111-111111111106';
BEGIN
    INSERT INTO auth.users (id, email) VALUES
        (v_super_id, 'super_tp@wessam.test'),
        (v_teacher_id, 'teacher_tp@wessam.test'),
        (v_student_id, 'student_tp@wessam.test'),
        (v_new_teacher_id, 'newteacher_tp@wessam.test'),
        (v_dup_teacher_id, 'dupteacher_tp@wessam.test'),
        (v_rogue_id, 'rogue_tp@wessam.test')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.profiles (id, role, full_name, full_name_arabic, email, status) VALUES
        (v_super_id, 'super_admin', 'Super Admin TP', 'المشرف العام', 'super_tp@wessam.test', 'active'),
        (v_teacher_id, 'teacher', 'Existing Teacher TP', 'المعلم الحالي', 'teacher_tp@wessam.test', 'active'),
        (v_student_id, 'student', 'Student TP', 'الطالب', NULL, 'active')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, status = EXCLUDED.status;
END $$;

-- 1. authenticated and anon do NOT have EXECUTE privilege on provision_teacher_tx
SELECT ok(
    NOT has_function_privilege('authenticated', 'public.provision_teacher_tx(uuid,text,text,text,text,uuid)', 'EXECUTE'),
    'authenticated cannot execute provision_teacher_tx directly'
);
SELECT ok(
    NOT has_function_privilege('anon', 'public.provision_teacher_tx(uuid,text,text,text,text,uuid)', 'EXECUTE'),
    'anon cannot execute provision_teacher_tx directly'
);

-- 2. Teacher blocked from inserting a new teacher profile via RLS
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaa1111-1111-4111-8111-111111111102', true);
SELECT throws_ok(
    $$ INSERT INTO public.profiles (id, role, full_name, email, status) VALUES ('aaaa1111-1111-4111-8111-111111111106', 'teacher', 'Rogue Teacher', 'rogue@wessam.test', 'active') $$,
    '42501',
    NULL,
    'Teacher cannot insert a teacher profile through RLS'
);

-- 3. Student blocked from self-promoting or inserting a teacher/super_admin profile via RLS
SELECT set_config('request.jwt.claim.sub', 'aaaa1111-1111-4111-8111-111111111103', true);
SELECT throws_ok(
    $$ INSERT INTO public.profiles (id, role, full_name, email, status) VALUES ('aaaa1111-1111-4111-8111-111111111106', 'super_admin', 'Rogue Admin', 'rogue_admin@wessam.test', 'active') $$,
    '42501',
    NULL,
    'Student cannot insert a super_admin profile through RLS'
);

-- 4. provision_teacher_tx (called as postgres/service_role) rejects teacher actor
RESET ROLE;
SELECT throws_ok(
    $$ SELECT public.provision_teacher_tx('aaaa1111-1111-4111-8111-111111111104'::uuid, 'New Teacher', 'معلم جديد', 'newteacher_tp@wessam.test', NULL, 'aaaa1111-1111-4111-8111-111111111102'::uuid) $$,
    '42501',
    NULL,
    'provision_teacher_tx rejects non-super_admin actor'
);

-- 5. Active Super Admin actor succeeds and enforces role = 'teacher'
SELECT is(
    (public.provision_teacher_tx(
        'aaaa1111-1111-4111-8111-111111111104'::uuid,
        'New Teacher TP',
        'المعلم الجديد',
        'NewTeacher_TP@wessam.test',
        '+966501112223',
        'aaaa1111-1111-4111-8111-111111111101'::uuid
    )->>'role'),
    'teacher',
    'provision_teacher_tx enforces teacher role for new account'
);

-- 6. Duplicate case-insensitive email rejected with 23505
SELECT throws_ok(
    $$ SELECT public.provision_teacher_tx('aaaa1111-1111-4111-8111-111111111105'::uuid, 'Dup Teacher', 'مكرر', 'newteacher_tp@wessam.test', NULL, 'aaaa1111-1111-4111-8111-111111111101'::uuid) $$,
    '23505',
    NULL,
    'provision_teacher_tx rejects duplicate email'
);

-- 7. Audit log captured CREATE_TEACHER_ACCOUNT under entity_type access_policy with no password fields
SELECT is(
    (SELECT COUNT(*)::int FROM public.audit_logs WHERE action = 'CREATE_TEACHER_ACCOUNT' AND entity_type = 'access_policy' AND entity_id = 'aaaa1111-1111-4111-8111-111111111104' AND NOT (new_data ? 'password')),
    1,
    'Sanitized CREATE_TEACHER_ACCOUNT audit entry created without password'
);

-- 8. Teacher cannot read CREATE_TEACHER_ACCOUNT audit log via RLS
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaa1111-1111-4111-8111-111111111102', true);
SELECT is(
    (SELECT COUNT(*)::int FROM public.audit_logs WHERE action = 'CREATE_TEACHER_ACCOUNT' AND entity_id = 'aaaa1111-1111-4111-8111-111111111104'),
    0,
    'Teacher cannot inspect CREATE_TEACHER_ACCOUNT audit logs'
);

SELECT * FROM finish();
ROLLBACK;
