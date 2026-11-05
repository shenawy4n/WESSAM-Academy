-- ==============================================================================
-- Integration tests for migration 20261104000006 (Courses & Curriculum)
-- Executed against the disposable Supabase database started by GitHub Actions.
-- ==============================================================================
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT extensions.plan(20);

-- 1. Deterministic isolated identities
INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'teacher_curric@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'student_curric1@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('33333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'student_curric2@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, role, full_name, full_name_arabic, status)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'teacher', 'Curriculum Teacher', 'معلم المناهج', 'active'),
  ('22222222-2222-4222-8222-222222222222', 'student', 'Enrolled Student', 'طالب ملتحق', 'active'),
  ('33333333-3333-4333-8333-333333333333', 'student', 'Unassigned Student', 'طالب غير ملتحق', 'active')
ON CONFLICT (id) DO NOTHING;

-- 2. Test Group & Archived Group
INSERT INTO public.groups (id, name, name_arabic, max_students, is_active, archived_at)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-cccccccccccc', 'Active Cohort', 'مجموعة نشطة', 30, true, NULL),
  ('aaaaaaaa-aaaa-4aaa-8aaa-dddddddddddd', 'Archived Cohort', 'مجموعة مؤرشفة', 30, false, now())
ON CONFLICT (id) DO NOTHING;

-- Enroll student 1 in active cohort
INSERT INTO public.group_students (student_id, group_id)
VALUES ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-cccccccccccc')
ON CONFLICT (group_id, student_id) DO NOTHING;

-- 3. Test Course, Units, and Lessons
INSERT INTO public.courses (id, teacher_id, title, title_arabic, level, is_published)
VALUES
  ('cccccccc-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'English Mastery B1', 'إتقان الإنجليزية B1', 'intermediate', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.course_units (id, course_id, title, title_arabic, order_index)
VALUES
  ('uuuuuuuu-1111-4111-8111-111111111111', 'cccccccc-1111-4111-8111-111111111111', 'Unit 1: Grammar', 'الوحدة 1: القواعد', 1),
  ('uuuuuuuu-2222-4222-8222-222222222222', 'cccccccc-1111-4111-8111-111111111111', 'Unit 2: Vocabulary', 'الوحدة 2: المفردات', 2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.lessons (id, course_id, unit_id, title, title_arabic, order_index, is_published, video_url)
VALUES
  ('llllllll-1111-4111-8111-111111111111', 'cccccccc-1111-4111-8111-111111111111', 'uuuuuuuu-1111-4111-8111-111111111111', 'Lesson 1.1: Present Perfect', 'الدرس 1: المضارع التام', 1, true, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
  ('llllllll-2222-4222-8222-222222222222', 'cccccccc-1111-4111-8111-111111111111', 'uuuuuuuu-1111-4111-8111-111111111111', 'Lesson 1.2: Past Continuous', 'الدرس 2: الماضي المستمر', 2, false, 'https://vimeo.com/76979871')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- TEST SUITE: Teacher Operations
-- -----------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

-- Test 1: Teacher can reorder units
SELECT extensions.lives_ok(
  $$SELECT public.reorder_course_units(
    'cccccccc-1111-4111-8111-111111111111',
    ARRAY['uuuuuuuu-2222-4222-8222-222222222222'::uuid, 'uuuuuuuu-1111-4111-8111-111111111111'::uuid]
  )$$,
  'Teacher can reorder course units'
);

-- Test 2: Unit order was updated
SELECT extensions.is(
  (SELECT order_index FROM public.course_units WHERE id = 'uuuuuuuu-2222-4222-8222-222222222222'),
  1,
  'Unit 2 was moved to order index 1'
);

-- Test 3: Teacher can reorder lessons
SELECT extensions.lives_ok(
  $$SELECT public.reorder_course_lessons(
    'uuuuuuuu-1111-4111-8111-111111111111',
    ARRAY['llllllll-2222-4222-8222-222222222222'::uuid, 'llllllll-1111-4111-8111-111111111111'::uuid]
  )$$,
  'Teacher can reorder lessons within a unit'
);

-- Test 4: Lesson order was updated
SELECT extensions.is(
  (SELECT order_index FROM public.lessons WHERE id = 'llllllll-2222-4222-8222-222222222222'),
  1,
  'Lesson 2 was moved to order index 1'
);

-- Test 5: Teacher can assign course to active group
SELECT extensions.lives_ok(
  $$SELECT public.assign_course_to_group(
    'cccccccc-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-cccccccccccc'
  )$$,
  'Teacher can assign course to active group'
);

-- Test 6: Verify group_courses record exists
SELECT extensions.is(
  (SELECT count(*)::int FROM public.group_courses WHERE course_id = 'cccccccc-1111-4111-8111-111111111111' AND group_id = 'aaaaaaaa-aaaa-4aaa-8aaa-cccccccccccc'),
  1,
  'group_courses association created'
);

-- Test 7: Verify audit log recorded for course assignment
SELECT extensions.is(
  (SELECT count(*)::int FROM public.audit_logs WHERE action = 'ASSIGN_COURSE_TO_GROUP' AND entity_id = 'aaaaaaaa-aaaa-4aaa-8aaa-cccccccccccc:cccccccc-1111-4111-8111-111111111111'),
  1,
  'Audit log recorded for ASSIGN_COURSE_TO_GROUP'
);

-- Test 8: Cannot assign course to an archived group
SELECT extensions.throws_ok(
  $$SELECT public.assign_course_to_group(
    'cccccccc-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-dddddddddddd'
  )$$,
  '22000',
  'Cannot assign course to an archived group',
  'Assigning to archived group throws 22000'
);

-- -----------------------------------------------------------------------------
-- TEST SUITE: Student Access Controls
-- -----------------------------------------------------------------------------
-- Switch to Enrolled Student
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);

-- Test 9: Student cannot reorder units
SELECT extensions.throws_ok(
  $$SELECT public.reorder_course_units(
    'cccccccc-1111-4111-8111-111111111111',
    ARRAY['uuuuuuuu-1111-4111-8111-111111111111'::uuid]
  )$$,
  '42501',
  'Forbidden: Only teachers and super admins can reorder course units',
  'Student reordering units is blocked'
);

-- Test 10: Student cannot reorder lessons
SELECT extensions.throws_ok(
  $$SELECT public.reorder_course_lessons(
    'uuuuuuuu-1111-4111-8111-111111111111',
    ARRAY['llllllll-1111-4111-8111-111111111111'::uuid]
  )$$,
  '42501',
  'Forbidden: Only teachers and super admins can reorder lessons',
  'Student reordering lessons is blocked'
);

-- Test 11: Student cannot assign course to group
SELECT extensions.throws_ok(
  $$SELECT public.assign_course_to_group(
    'cccccccc-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-cccccccccccc'
  )$$,
  '42501',
  'Forbidden: Only teachers and super admins can assign courses',
  'Student assigning course is blocked'
);

-- Test 12: Student cannot remove course from group
SELECT extensions.throws_ok(
  $$SELECT public.remove_course_from_group(
    'cccccccc-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-cccccccccccc'
  )$$,
  '42501',
  'Forbidden: Only teachers and super admins can remove course assignments',
  'Student removing course is blocked'
);

-- Test 13: Enrolled student can record progress for published lesson
SELECT extensions.lives_ok(
  $$SELECT public.record_lesson_progress(
    'llllllll-1111-4111-8111-111111111111',
    true,
    180
  )$$,
  'Enrolled student records progress for published lesson'
);

-- Test 14: Progress is verified in lesson_progress table
SELECT extensions.is(
  (SELECT is_completed FROM public.lesson_progress WHERE student_id = '22222222-2222-4222-8222-222222222222' AND lesson_id = 'llllllll-1111-4111-8111-111111111111'),
  true,
  'Student lesson progress is_completed is true'
);

-- Test 15: Enrolled student cannot record progress for unpublished lesson
SELECT extensions.throws_ok(
  $$SELECT public.record_lesson_progress(
    'llllllll-2222-4222-8222-222222222222',
    true,
    60
  )$$,
  '42501',
  'Forbidden: Lesson is not accessible or not published',
  'Student blocked from recording progress on unpublished lesson'
);

-- -----------------------------------------------------------------------------
-- TEST SUITE: Unassigned Student Isolation
-- -----------------------------------------------------------------------------
-- Switch to Unassigned Student
SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);

-- Test 16: Unassigned student cannot record progress for course they are not enrolled in
SELECT extensions.throws_ok(
  $$SELECT public.record_lesson_progress(
    'llllllll-1111-4111-8111-111111111111',
    true,
    120
  )$$,
  '42501',
  'Forbidden: Lesson is not accessible or not published',
  'Unassigned student blocked from recording progress on unassigned course'
);

-- -----------------------------------------------------------------------------
-- TEST SUITE: Anonymous Caller Rejection
-- -----------------------------------------------------------------------------
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);

-- Test 17: Anon cannot record progress
SELECT extensions.throws_ok(
  $$SELECT public.record_lesson_progress('llllllll-1111-4111-8111-111111111111', true, 100)$$,
  '42501',
  NULL,
  'Anon is rejected from record_lesson_progress'
);

-- Test 18: Anon cannot reorder units
SELECT extensions.throws_ok(
  $$SELECT public.reorder_course_units('cccccccc-1111-4111-8111-111111111111', ARRAY['uuuuuuuu-1111-4111-8111-111111111111'::uuid])$$,
  '42501',
  NULL,
  'Anon is rejected from reorder_course_units'
);

-- -----------------------------------------------------------------------------
-- TEST SUITE: Teacher Removes Course Assignment
-- -----------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

-- Test 19: Teacher removes course assignment
SELECT extensions.lives_ok(
  $$SELECT public.remove_course_from_group(
    'cccccccc-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-cccccccccccc'
  )$$,
  'Teacher can remove course from group'
);

-- Test 20: Audit log recorded for removal
SELECT extensions.is(
  (SELECT count(*)::int FROM public.audit_logs WHERE action = 'REMOVE_COURSE_FROM_GROUP' AND entity_id = 'aaaaaaaa-aaaa-4aaa-8aaa-cccccccccccc:cccccccc-1111-4111-8111-111111111111'),
  1,
  'Audit log recorded for REMOVE_COURSE_FROM_GROUP'
);

SELECT * FROM extensions.finish();
ROLLBACK;
