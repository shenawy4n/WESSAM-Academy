-- ==============================================================================
-- Compatibility & Security Tests for Migration 20261114000018
-- Verifies that can_student_and_teacher_message() and messaging RPCs work
-- cleanly regardless of whether Phase 5C assignments.teacher_id and
-- public.assignment_targets have been applied.
-- ==============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT extensions.plan(5);

INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('11111111-8888-4111-8111-111111111111', 'authenticated', 'authenticated', 'compat_teacher@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('22222222-8888-4222-8222-222222222222', 'authenticated', 'authenticated', 'compat_student@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('33333333-8888-4333-8333-333333333333', 'authenticated', 'authenticated', 'compat_other_student@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, role, full_name, full_name_arabic, status)
VALUES
  ('11111111-8888-4111-8111-111111111111', 'teacher', 'Compat Teacher', 'معلم التوافق', 'active'),
  ('22222222-8888-4222-8222-222222222222', 'student', 'Compat Student', 'طالب التوافق', 'active'),
  ('33333333-8888-4333-8333-333333333333', 'student', 'Compat Unrelated Student', 'طالب غير مرتبط', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.groups (id, name, name_arabic, max_students, is_active)
VALUES ('cccccccc-8888-4111-8111-111111111111', 'Compat Cohort', 'مجموعة التوافق', 20, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.group_students (student_id, group_id)
VALUES ('22222222-8888-4222-8222-222222222222', 'cccccccc-8888-4111-8111-111111111111')
ON CONFLICT DO NOTHING;

INSERT INTO public.courses (id, teacher_id, title, title_arabic, is_published)
VALUES ('dddddddd-8888-4111-8111-111111111111', '11111111-8888-4111-8111-111111111111', 'Compat Course', 'مقرر التوافق', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.group_courses (group_id, course_id)
VALUES ('cccccccc-8888-4111-8111-111111111111', 'dddddddd-8888-4111-8111-111111111111')
ON CONFLICT DO NOTHING;

-- 1. Authorized student/teacher resolves true without error
SELECT extensions.is(
  public.can_student_and_teacher_message(
    '22222222-8888-4222-8222-222222222222'::uuid,
    '11111111-8888-4111-8111-111111111111'::uuid
  ),
  true,
  'can_student_and_teacher_message returns true for enrolled student and course teacher'
);

-- 2. Unrelated student resolves false cleanly (does not throw 42703/42P01 even when assignment_targets is absent)
SELECT extensions.is(
  public.can_student_and_teacher_message(
    '33333333-8888-4333-8333-333333333333'::uuid,
    '11111111-8888-4111-8111-111111111111'::uuid
  ),
  false,
  'can_student_and_teacher_message returns false cleanly for unrelated student without schema errors'
);

-- 3. Authenticated student with zero conversations gets [] from get_my_message_conversations without error
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '33333333-8888-4333-8333-333333333333';

SELECT extensions.is(
  public.get_my_message_conversations(),
  '[]'::jsonb,
  'Student with no conversations receives empty JSON array cleanly'
);

SELECT extensions.is(
  public.get_authorized_messaging_teachers(),
  '[]'::jsonb,
  'Unenrolled student receives empty authorized teachers array cleanly'
);

RESET ROLE;

-- 4. Private storage bucket remains non-public
SELECT extensions.is(
  (SELECT public FROM storage.buckets WHERE id = 'message-attachments'),
  false,
  'message-attachments bucket remains private'
);

SELECT * FROM extensions.finish();
ROLLBACK;
