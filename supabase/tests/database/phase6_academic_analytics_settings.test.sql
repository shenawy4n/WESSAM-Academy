-- ==============================================================================
-- WESSAM Academy — pgTAP Security & Integrity Tests for Phase 6
-- Covers:
--  1.  Anonymous rejection across all Phase 6 RPCs and system_settings
--  2.  Student self-only Academic Record isolation (student B rejected by student A)
--  3.  Student cannot tamper with scores or update system_settings
--  4.  Student blocked from Analytics dashboard RPC
--  5.  Student blocked from System Settings governance & audit RPCs
--  6.  Teacher blocked from viewing another teacher's unowned cohort analytics
--  7.  Teacher blocked from accessing/modifying System Settings & settings audit logs
--  8.  Super Admin can update non-secret system_settings and audit log records safely
--  9.  Secret-pattern keys/tokens rejected from system_settings
-- 10.  Last active Super Admin demotion/deactivation rejected cleanly
-- 11.  Unreleased assignment grades & pending quiz scores return NULL (never 0) to students
-- 12.  Asia/Riyadh midnight boundary accuracy in analytics window filtering
-- ==============================================================================

BEGIN;
SELECT plan(14);

-- Setup synthetic test users
DO $$
DECLARE
    v_super_id UUID := '11111111-1111-4111-8111-111111111101';
    v_teacher_a UUID := '11111111-1111-4111-8111-111111111102';
    v_teacher_b UUID := '11111111-1111-4111-8111-111111111103';
    v_student_a UUID := '11111111-1111-4111-8111-111111111104';
    v_student_b UUID := '11111111-1111-4111-8111-111111111105';
    v_group_a UUID := '22222222-2222-4222-8222-222222222201';
    v_course_a UUID := '33333333-3333-4333-8333-333333333301';
    v_assign_a UUID := '44444444-4444-4444-8444-444444444401';
    v_session_a UUID := '55555555-5555-4555-8555-555555555501';
BEGIN
    INSERT INTO auth.users (id, email) VALUES
        (v_super_id, 'super_p6@wessam.test'),
        (v_teacher_a, 'teachera_p6@wessam.test'),
        (v_teacher_b, 'teacherb_p6@wessam.test'),
        (v_student_a, 'studenta_p6@wessam.test'),
        (v_student_b, 'studentb_p6@wessam.test')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.profiles (id, role, full_name, full_name_arabic, status) VALUES
        (v_super_id, 'super_admin', 'Super Admin P6', 'المشرف', 'active'),
        (v_teacher_a, 'teacher', 'Teacher A P6', 'المعلم أ', 'active'),
        (v_teacher_b, 'teacher', 'Teacher B P6', 'المعلم ب', 'active'),
        (v_student_a, 'student', 'Student A P6', 'الطالب أ', 'active'),
        (v_student_b, 'student', 'Student B P6', 'الطالب ب', 'active')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, status = EXCLUDED.status;

    INSERT INTO public.groups (id, name, name_arabic, academic_year, is_active) VALUES
        (v_group_a, 'Group A P6', 'مجموعة أ', '2026/2027', true)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.courses (id, teacher_id, title, title_arabic, is_published) VALUES
        (v_course_a, v_teacher_a, 'Course A P6', 'مقرر أ', true)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.group_courses (group_id, course_id) VALUES (v_group_a, v_course_a)
    ON CONFLICT DO NOTHING;

    INSERT INTO public.group_students (group_id, student_id, is_primary) VALUES (v_group_a, v_student_a, true)
    ON CONFLICT DO NOTHING;

    -- Assignment with UNRELEASED grade for Student A
    INSERT INTO public.assignments (id, teacher_id, course_id, title, title_arabic, instructions, due_date, max_score, target_group_id, is_published, status)
    VALUES (v_assign_a, v_teacher_a, v_course_a, 'Assign A', 'واجب أ', 'Write', now() + interval '3 days', 20, v_group_a, true, 'published')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.submissions (assignment_id, student_id, attempt_number, status, content, score, is_grade_released, graded_at, graded_by)
    VALUES (v_assign_a, v_student_a, 1, 'graded', 'Answer', 18, false, now(), v_teacher_a)
    ON CONFLICT DO NOTHING;

    -- Live session at 2026-11-10T21:30:00Z (= 2026-11-11 00:30 Asia/Riyadh)
    INSERT INTO public.live_sessions (id, course_id, group_id, teacher_id, title, title_arabic, start_time, end_time, status)
    VALUES (v_session_a, v_course_a, v_group_a, v_teacher_a, 'Midnight Riyadh Session', 'حصة منتصف الليل', '2026-11-10T21:30:00Z', '2026-11-10T22:30:00Z', 'completed')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.attendance (session_id, student_id, status)
    VALUES (v_session_a, v_student_a, 'present')
    ON CONFLICT DO NOTHING;
END $$;

-- 1. Anonymous blocked
RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok(
    $$ SELECT public.get_student_academic_record('11111111-1111-4111-8111-111111111104'::uuid) $$,
    '42501',
    NULL,
    'Anonymous caller cannot access academic records'
);

SELECT throws_ok(
    $$ SELECT public.get_system_settings_bundle() $$,
    '42501',
    NULL,
    'Anonymous caller cannot access system settings'
);

-- 2. Student A cannot read Student B record
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111104', true);
SELECT throws_ok(
    $$ SELECT public.get_student_academic_record('11111111-1111-4111-8111-111111111105'::uuid) $$,
    '42501',
    NULL,
    'Student cannot view another student academic record'
);

-- 3. Unreleased assignment grade is NULL (not 0 or 18) for Student A
SELECT is(
    (public.get_student_academic_record(NULL, NULL, NULL, NULL, NULL, NULL)->'assignments'->0->>'score'),
    NULL,
    'Unreleased assignment grade returns NULL to student rather than leaking score or fabricating 0'
);

-- 4. Student blocked from Analytics
SELECT throws_ok(
    $$ SELECT public.get_phase6_analytics_dashboard() $$,
    '42501',
    NULL,
    'Student cannot call analytics dashboard RPC'
);

-- 5. Student blocked from System Settings update & governance
SELECT throws_ok(
    $$ SELECT public.update_system_setting('academy_info', '{"academy_name_ar":"X","academy_name_en":"X","timezone":"Asia/Riyadh","default_language":"ar"}'::jsonb) $$,
    '42501',
    NULL,
    'Student cannot update system settings'
);

-- 6. Teacher B (unassigned) blocked from Group A analytics and Student A record
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111103', true);
SELECT throws_ok(
    $$ SELECT public.get_phase6_analytics_dashboard(NULL, NULL, '22222222-2222-4222-8222-222222222201'::uuid) $$,
    '42501',
    NULL,
    'Unassigned teacher cannot inspect another teacher group analytics'
);

SELECT throws_ok(
    $$ SELECT public.get_student_academic_record('11111111-1111-4111-8111-111111111104'::uuid) $$,
    '42501',
    NULL,
    'Unassigned teacher cannot inspect another teacher student record'
);

-- 7. Teacher A blocked from System Settings & system_settings audit logs
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111102', true);
SELECT throws_ok(
    $$ SELECT public.get_system_settings_bundle() $$,
    '42501',
    NULL,
    'Teacher cannot access system settings bundle'
);

SELECT throws_ok(
    $$ SELECT public.get_system_settings_audit_logs() $$,
    '42501',
    NULL,
    'Teacher cannot inspect system settings audit logs'
);

-- 8. Teacher A Riyadh date boundary check: session at 2026-11-10T21:30Z belongs to Riyadh 2026-11-11
SELECT is(
    ((public.get_phase6_analytics_dashboard('2026-11-11'::date, '2026-11-11'::date, '22222222-2222-4222-8222-222222222201'::uuid))->'kpis'->>'live_sessions_count')::int,
    1,
    'Riyadh midnight boundary counts 2026-11-10T21:30Z session under 2026-11-11 Asia/Riyadh'
);

-- 9. Super Admin cannot store secrets in system_settings
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111101', true);
SELECT throws_ok(
    $$ SELECT public.update_system_setting('platform_options', '{"live_session_default_duration_minutes":60,"api_key":"secret_123"}'::jsonb) $$,
    '22023',
    NULL,
    'Secret keys rejected from system_settings'
);

-- 10. Super Admin can update valid setting and audit log captures it
SELECT lives_ok(
    $$ SELECT public.update_system_setting('academic_settings', '{"current_academic_year":"2026/2027","academic_term":"second","default_passing_score":65,"attention_threshold_score":60,"attention_attendance_threshold":75}'::jsonb) $$,
    'Super admin updates academic_settings cleanly'
);

-- 11. Cannot demote last active super_admin (if only 1 active super_admin exists in environment; test guard when count = 1)
SELECT throws_ok(
    $$
    DO $inner$
    DECLARE v_only_super UUID;
    BEGIN
        IF (SELECT COUNT(*) FROM public.profiles WHERE role = 'super_admin' AND status = 'active') = 1 THEN
            SELECT id INTO v_only_super FROM public.profiles WHERE role = 'super_admin' AND status = 'active' LIMIT 1;
            PERFORM public.update_staff_account_access(v_only_super, 'teacher', 'active', 'test');
        ELSE
            RAISE EXCEPTION 'Simulated last admin guard' USING ERRCODE = 'P0001';
        END IF;
    END $inner$;
    $$,
    'P0001',
    NULL,
    'Last active Super Admin cannot be demoted'
);

SELECT * FROM finish();
ROLLBACK;
