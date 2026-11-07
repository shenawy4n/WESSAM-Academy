-- ==============================================================================
-- Integration tests for migration 20261104000006 (Courses & Curriculum Hardening)
-- Executed against the disposable Supabase database started by GitHub Actions.
-- ==============================================================================
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT extensions.plan(52);

-- 1. Deterministic isolated identities
INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'teacher_owner@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('88888888-8888-4888-8888-888888888888', 'authenticated', 'authenticated', 'teacher_other@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('99999999-9999-4999-8999-999999999999', 'authenticated', 'authenticated', 'super_admin_test@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'student_curric1@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('33333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'student_curric2@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, role, full_name, full_name_arabic, status)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'teacher', 'Course Owner Teacher', 'معلم المنهج الأصلي', 'active'),
  ('88888888-8888-4888-8888-888888888888', 'teacher', 'Other Teacher', 'معلم آخر', 'active'),
  ('99999999-9999-4999-8999-999999999999', 'super_admin', 'Academy Super Admin', 'مدير النظام العام', 'active'),
  ('22222222-2222-4222-8222-222222222222', 'student', 'Enrolled Student', 'طالب ملتحق', 'active'),
  ('33333333-3333-4333-8333-333333333333', 'student', 'Unassigned Student', 'طالب غير ملتحق', 'active')
ON CONFLICT (id) DO NOTHING;

-- 2. Test Groups: Active Cohort and Archived Cohort
INSERT INTO public.groups (id, name, name_arabic, max_students, is_active, archived_at)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-cccccccccccc', 'Active Cohort', 'مجموعة نشطة', 30, true, NULL),
  ('aaaaaaaa-aaaa-4aaa-8aaa-dddddddddddd', 'Archived Cohort', 'مجموعة مؤرشفة', 30, false, now())
ON CONFLICT (id) DO NOTHING;

-- Enroll student 1 in active cohort
INSERT INTO public.group_students (student_id, group_id)
VALUES ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-cccccccccccc')
ON CONFLICT (group_id, student_id) DO NOTHING;

-- 3. Test Course, Units, and Lessons with Valid Hex Deterministic UUIDs
INSERT INTO public.courses (id, teacher_id, title, title_arabic, level, is_published)
VALUES
  ('cccccccc-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'English Mastery B1', 'إتقان الإنجليزية B1', 'intermediate', true),
  ('cccccccc-2222-4222-8222-222222222222', '88888888-8888-4888-8888-888888888888', 'Advanced Grammar C1', 'قواعد متقدمة C1', 'advanced', true),
  ('cccccccc-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 'Draft Course', 'منهج مسودة', 'beginner', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.course_units (id, course_id, title, title_arabic, order_index)
VALUES
  ('44444444-1111-4111-8111-111111111111', 'cccccccc-1111-4111-8111-111111111111', 'Unit 1: Grammar', 'الوحدة 1: القواعد', 1),
  ('44444444-2222-4222-8222-222222222222', 'cccccccc-1111-4111-8111-111111111111', 'Unit 2: Vocabulary', 'الوحدة 2: المفردات', 2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.lessons (id, course_id, unit_id, title, title_arabic, order_index, is_published, video_url)
VALUES
  ('55555555-1111-4111-8111-111111111111', 'cccccccc-1111-4111-8111-111111111111', '44444444-1111-4111-8111-111111111111', 'Lesson 1.1: Present Perfect', 'الدرس 1: المضارع التام', 1, true, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
  ('55555555-2222-4222-8222-222222222222', 'cccccccc-1111-4111-8111-111111111111', '44444444-1111-4111-8111-111111111111', 'Lesson 1.2: Past Continuous', 'الدرس 2: الماضي المستمر', 2, false, 'https://vimeo.com/76979871')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- TEST SUITE: Teacher Operations & Hardened Ordering
-- -----------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

-- Test 1: Course owner can reorder units with complete, valid list
SELECT extensions.lives_ok(
  $$SELECT public.reorder_course_units(
    'cccccccc-1111-4111-8111-111111111111',
    ARRAY['44444444-2222-4222-8222-222222222222'::uuid, '44444444-1111-4111-8111-111111111111'::uuid]
  )$$,
  'Course owner teacher can reorder course units'
);

-- Test 2: Unit order was updated
SELECT extensions.is(
  (SELECT order_index FROM public.course_units WHERE id = '44444444-2222-4222-8222-222222222222'),
  1,
  'Unit 2 was moved to order index 1'
);

-- Test 3: Course owner can reorder lessons with complete, valid list
SELECT extensions.lives_ok(
  $$SELECT public.reorder_course_lessons(
    '44444444-1111-4111-8111-111111111111',
    ARRAY['55555555-2222-4222-8222-222222222222'::uuid, '55555555-1111-4111-8111-111111111111'::uuid]
  )$$,
  'Course owner teacher can reorder lessons within a unit'
);

-- Test 4: Lesson order was updated
SELECT extensions.is(
  (SELECT order_index FROM public.lessons WHERE id = '55555555-2222-4222-8222-222222222222'),
  1,
  'Lesson 2 was moved to order index 1'
);

-- Test 5: Duplicate IDs in unit ordering array are rejected
SELECT extensions.throws_ok(
  $$SELECT public.reorder_course_units(
    'cccccccc-1111-4111-8111-111111111111',
    ARRAY['44444444-1111-4111-8111-111111111111'::uuid, '44444444-1111-4111-8111-111111111111'::uuid]
  )$$,
  '22000',
  'Duplicate unit IDs provided in ordering request',
  'Duplicate unit IDs are rejected'
);

-- Test 6: Incomplete list in unit ordering array is rejected
SELECT extensions.throws_ok(
  $$SELECT public.reorder_course_units(
    'cccccccc-1111-4111-8111-111111111111',
    ARRAY['44444444-1111-4111-8111-111111111111'::uuid]
  )$$,
  '22000',
  'Incomplete or mismatched unit ordering list',
  'Incomplete unit list is rejected'
);

-- Test 7: Duplicate IDs in lesson ordering array are rejected
SELECT extensions.throws_ok(
  $$SELECT public.reorder_course_lessons(
    '44444444-1111-4111-8111-111111111111',
    ARRAY['55555555-1111-4111-8111-111111111111'::uuid, '55555555-1111-4111-8111-111111111111'::uuid]
  )$$,
  '22000',
  'Duplicate lesson IDs provided in ordering request',
  'Duplicate lesson IDs are rejected'
);

-- Test 8: Foreign / unknown lesson ID in unit ordering is rejected
SELECT extensions.throws_ok(
  $$SELECT public.reorder_course_lessons(
    '44444444-1111-4111-8111-111111111111',
    ARRAY['55555555-1111-4111-8111-111111111111'::uuid, '55555555-9999-4999-8999-999999999999'::uuid]
  )$$,
  '22000',
  'One or more lesson IDs do not belong to the specified unit',
  'Foreign lesson ID is rejected'
);

-- -----------------------------------------------------------------------------
-- TEST SUITE: Cross-Teacher Course Modification Attempts
-- -----------------------------------------------------------------------------
-- Switch to Other Teacher (not the course owner)
SELECT set_config('request.jwt.claim.sub', '88888888-8888-4888-8888-888888888888', true);

-- Test 9: Other teacher cannot reorder units on course they do not own
SELECT extensions.throws_ok(
  $$SELECT public.reorder_course_units(
    'cccccccc-1111-4111-8111-111111111111',
    ARRAY['44444444-1111-4111-8111-111111111111'::uuid, '44444444-2222-4222-8222-222222222222'::uuid]
  )$$,
  '42501',
  'Forbidden: You do not have permission to manage this course',
  'Cross-teacher unit reordering is rejected'
);

-- Test 10: Other teacher cannot reorder lessons on course they do not own
SELECT extensions.throws_ok(
  $$SELECT public.reorder_course_lessons(
    '44444444-1111-4111-8111-111111111111',
    ARRAY['55555555-1111-4111-8111-111111111111'::uuid, '55555555-2222-4222-8222-222222222222'::uuid]
  )$$,
  '42501',
  'Forbidden: You do not have permission to manage lessons in this course',
  'Cross-teacher lesson reordering is rejected'
);

-- Test 11: Other teacher cannot assign course they do not own
SELECT extensions.throws_ok(
  $$SELECT public.assign_course_to_group(
    'cccccccc-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-cccccccccccc'
  )$$,
  '42501',
  'Forbidden: You do not have permission to assign this course',
  'Cross-teacher course assignment is rejected'
);

-- -----------------------------------------------------------------------------
-- TEST SUITE: Super Admin Management Privileges
-- -----------------------------------------------------------------------------
-- Switch to Super Admin
SELECT set_config('request.jwt.claim.sub', '99999999-9999-4999-8999-999999999999', true);

-- Test 12: Super Admin CAN reorder units on any teacher course
SELECT extensions.lives_ok(
  $$SELECT public.reorder_course_units(
    'cccccccc-1111-4111-8111-111111111111',
    ARRAY['44444444-1111-4111-8111-111111111111'::uuid, '44444444-2222-4222-8222-222222222222'::uuid]
  )$$,
  'Super Admin can reorder units on any course'
);

-- Test 13: Super Admin can assign course to active group
SELECT extensions.lives_ok(
  $$SELECT public.assign_course_to_group(
    'cccccccc-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-cccccccccccc'
  )$$,
  'Super Admin can assign course to group'
);

-- Test 14: Verify group_courses record exists
SELECT extensions.is(
  (SELECT count(*)::int FROM public.group_courses WHERE course_id = 'cccccccc-1111-4111-8111-111111111111' AND group_id = 'aaaaaaaa-aaaa-4aaa-8aaa-cccccccccccc'),
  1,
  'group_courses association created'
);

-- Test 15: Verify audit log recorded for course assignment
SELECT extensions.is(
  (SELECT count(*)::int FROM public.audit_logs WHERE action = 'ASSIGN_COURSE_TO_GROUP' AND entity_id = 'aaaaaaaa-aaaa-4aaa-8aaa-cccccccccccc:cccccccc-1111-4111-8111-111111111111'),
  1,
  'Audit log recorded for ASSIGN_COURSE_TO_GROUP'
);

-- Test 16: Cannot assign course to an archived group
SELECT extensions.throws_ok(
  $$SELECT public.assign_course_to_group(
    'cccccccc-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-dddddddddddd'
  )$$,
  '22000',
  'Cannot assign course to an archived or inactive group',
  'Assigning to archived group throws 22000'
);

-- -----------------------------------------------------------------------------
-- TEST SUITE: Student Mutation Rejection & RLS Protection
-- -----------------------------------------------------------------------------
-- Switch to Enrolled Student
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);

-- Test 17: Student cannot reorder units
SELECT extensions.throws_ok(
  $$SELECT public.reorder_course_units(
    'cccccccc-1111-4111-8111-111111111111',
    ARRAY['44444444-1111-4111-8111-111111111111'::uuid, '44444444-2222-4222-8222-222222222222'::uuid]
  )$$,
  '42501',
  'Forbidden: Only teachers and super admins can reorder course units',
  'Student reordering units is blocked'
);

-- Test 18: Student cannot reorder lessons
SELECT extensions.throws_ok(
  $$SELECT public.reorder_course_lessons(
    '44444444-1111-4111-8111-111111111111',
    ARRAY['55555555-1111-4111-8111-111111111111'::uuid, '55555555-2222-4222-8222-222222222222'::uuid]
  )$$,
  '42501',
  'Forbidden: Only teachers and super admins can reorder lessons',
  'Student reordering lessons is blocked'
);

-- Test 19: Student cannot assign course to group
SELECT extensions.throws_ok(
  $$SELECT public.assign_course_to_group(
    'cccccccc-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-cccccccccccc'
  )$$,
  '42501',
  'Forbidden: Only teachers and super admins can assign courses',
  'Student assigning course is blocked'
);

-- Test 20: Student cannot remove course from group
SELECT extensions.throws_ok(
  $$SELECT public.remove_course_from_group(
    'cccccccc-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-cccccccccccc'
  )$$,
  '42501',
  'Forbidden: Only teachers and super admins can remove course assignments',
  'Student removing course is blocked'
);

-- Test 21: Direct course creation by student is rejected by RLS
SELECT extensions.throws_ok(
  $$INSERT INTO public.courses (teacher_id, title, title_arabic) VALUES ('22222222-2222-4222-8222-222222222222', 'Rogue Course', 'دورة احتيالية')$$,
  '42501',
  NULL,
  'Student direct course creation blocked by RLS'
);

-- Test 22: Enrolled student can record progress for published lesson
SELECT extensions.lives_ok(
  $$SELECT public.record_lesson_progress(
    '55555555-1111-4111-8111-111111111111',
    true,
    180
  )$$,
  'Enrolled student records progress for published lesson'
);

-- Test 23: Progress is verified in lesson_progress table
SELECT extensions.is(
  (SELECT is_completed FROM public.lesson_progress WHERE student_id = '22222222-2222-4222-8222-222222222222' AND lesson_id = '55555555-1111-4111-8111-111111111111'),
  true,
  'Student lesson progress is_completed is true'
);

-- Test 24: Enrolled student cannot record progress for unpublished lesson
SELECT extensions.throws_ok(
  $$SELECT public.record_lesson_progress(
    '55555555-2222-4222-8222-222222222222',
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

-- Test 25: Unassigned student cannot record progress for course they are not enrolled in
SELECT extensions.throws_ok(
  $$SELECT public.record_lesson_progress(
    '55555555-1111-4111-8111-111111111111',
    true,
    120
  )$$,
  '42501',
  'Forbidden: Lesson is not accessible or not published',
  'Unassigned student blocked from recording progress on unassigned course'
);

-- Test 26: Unassigned student cannot direct insert progress for unassigned lesson via RLS
SELECT extensions.throws_ok(
  $$INSERT INTO public.lesson_progress (student_id, lesson_id, is_completed) VALUES ('33333333-3333-4333-8333-333333333333', '55555555-1111-4111-8111-111111111111', true)$$,
  '42501',
  NULL,
  'Unassigned student direct progress insert blocked by RLS'
);

-- -----------------------------------------------------------------------------
-- TEST SUITE: Anonymous Caller Rejection
-- -----------------------------------------------------------------------------
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);

-- Test 27: Anon cannot record progress
SELECT extensions.throws_ok(
  $$SELECT public.record_lesson_progress('55555555-1111-4111-8111-111111111111', true, 100)$$,
  '42501',
  NULL,
  'Anon is rejected from record_lesson_progress'
);

-- Test 28: Anon cannot reorder units
SELECT extensions.throws_ok(
  $$SELECT public.reorder_course_units('cccccccc-1111-4111-8111-111111111111', ARRAY['44444444-1111-4111-8111-111111111111'::uuid])$$,
  '42501',
  NULL,
  'Anon is rejected from reorder_course_units'
);

-- -----------------------------------------------------------------------------
-- TEST SUITE: Teacher Removes Course Assignment
-- -----------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

-- Test 29: Course owner teacher can remove course from group
SELECT extensions.lives_ok(
  $$SELECT public.remove_course_from_group(
    'cccccccc-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-cccccccccccc'
  )$$,
  'Teacher can remove course from group'
);

-- Test 30: Audit log recorded for removal
SELECT extensions.is(
  (SELECT count(*)::int FROM public.audit_logs WHERE action = 'REMOVE_COURSE_FROM_GROUP' AND entity_id = 'aaaaaaaa-aaaa-4aaa-8aaa-cccccccccccc:cccccccc-1111-4111-8111-111111111111'),
  1,
  'Audit log recorded for REMOVE_COURSE_FROM_GROUP'
);

-- Test 31: Enrolled student can no longer record progress after course is removed from their group
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
SELECT extensions.throws_ok(
  $$SELECT public.record_lesson_progress(
    '55555555-1111-4111-8111-111111111111',
    true,
    200
  )$$,
  '42501',
  'Forbidden: Lesson is not accessible or not published',
  'Student blocked from recording progress after course group unassignment'
);

-- -----------------------------------------------------------------------------
-- TEST SUITE: RLS Non-Recursion & Helper Function Regression Suite
-- -----------------------------------------------------------------------------

-- Re-assign course 1 to active cohort for RLS tests
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT public.assign_course_to_group('cccccccc-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-cccccccccccc');

-- Test 32: Teacher owner can read their own courses
SELECT extensions.is(
  (SELECT count(*)::int FROM public.courses WHERE id = 'cccccccc-1111-4111-8111-111111111111'),
  1,
  'Teacher owner can read their own course'
);

-- Test 33: Teacher can query both courses and group_courses in a single query without recursion
SELECT extensions.lives_ok(
  $$SELECT c.id, c.title, gc.group_id
    FROM public.courses c
    LEFT JOIN public.group_courses gc ON gc.course_id = c.id
    WHERE c.id = 'cccccccc-1111-4111-8111-111111111111'$$,
  'Cross-table query between courses and group_courses succeeds without recursion'
);

-- Test 34: Teacher cannot manage another teacher course assignment in group_courses
SELECT extensions.throws_ok(
  $$INSERT INTO public.group_courses (course_id, group_id)
    VALUES ('cccccccc-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-cccccccccccc')$$,
  '42501',
  NULL,
  'Teacher cannot insert group_courses assignment for another teacher course'
);

-- Switch to Other Teacher
SELECT set_config('request.jwt.claim.sub', '88888888-8888-4888-8888-888888888888', true);

-- Test 35: Other teacher cannot manage course 1 in group_courses
SELECT extensions.is(
  (SELECT count(*)::int FROM public.group_courses WHERE course_id = 'cccccccc-1111-4111-8111-111111111111'),
  0,
  'Other teacher cannot see group_courses assignment for course they do not own'
);

-- Switch to Super Admin
SELECT set_config('request.jwt.claim.sub', '99999999-9999-4999-8999-999999999999', true);

-- Test 36: Super Admin can read all courses and manage group courses
SELECT extensions.is(
  (SELECT count(*)::int FROM public.courses WHERE id IN ('cccccccc-1111-4111-8111-111111111111', 'cccccccc-2222-4222-8222-222222222222', 'cccccccc-3333-4333-8333-333333333333')),
  3,
  'Super Admin can read all courses across teachers'
);

-- Switch to Enrolled Active Student (student 1 in active cohort)
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);

-- Test 37: Enrolled student can read their assigned published course
SELECT extensions.is(
  (SELECT count(*)::int FROM public.courses WHERE id = 'cccccccc-1111-4111-8111-111111111111'),
  1,
  'Enrolled student can read assigned published course'
);

-- Test 38: Enrolled student cannot read unpublished draft course
SELECT extensions.is(
  (SELECT count(*)::int FROM public.courses WHERE id = 'cccccccc-3333-4333-8333-333333333333'),
  0,
  'Student cannot read unpublished draft course'
);

-- Test 39: Enrolled student UPDATE affects 0 rows due to RLS filter
WITH attempted_update AS (
  UPDATE public.courses
  SET title = 'Hacked Title'
  WHERE id = 'cccccccc-1111-4111-8111-111111111111'
  RETURNING id
)
SELECT extensions.is(
  (SELECT count(*)::int FROM attempted_update),
  0,
  'Student UPDATE on courses affects 0 rows under RLS'
);

-- Test 40: Course title remains unchanged after student UPDATE attempt
SELECT extensions.is(
  (SELECT title FROM public.courses WHERE id = 'cccccccc-1111-4111-8111-111111111111'),
  'English Mastery B1',
  'Course title remains unchanged after student update attempt'
);

-- Test 41: Enrolled student DELETE affects 0 rows due to RLS filter
WITH attempted_delete AS (
  DELETE FROM public.courses
  WHERE id = 'cccccccc-1111-4111-8111-111111111111'
  RETURNING id
)
SELECT extensions.is(
  (SELECT count(*)::int FROM attempted_delete),
  0,
  'Student DELETE on courses affects 0 rows under RLS'
);

-- Test 42: Course still exists after student DELETE attempt
SELECT extensions.is(
  (SELECT count(*)::int FROM public.courses WHERE id = 'cccccccc-1111-4111-8111-111111111111'),
  1,
  'Course still exists after student delete attempt'
);

-- Switch to Unassigned Student
SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);

-- Test 43: Unassigned student cannot read course 1
SELECT extensions.is(
  (SELECT count(*)::int FROM public.courses WHERE id = 'cccccccc-1111-4111-8111-111111111111'),
  0,
  'Unassigned student cannot read course 1'
);

-- Test 44: Helper is_student_assigned_to_course returns false for unassigned student
SELECT extensions.is(
  public.is_student_assigned_to_course('cccccccc-1111-4111-8111-111111111111'),
  false,
  'is_student_assigned_to_course returns false for unassigned student'
);

-- Test 45: Helper can_manage_course returns false for student
SELECT extensions.is(
  public.can_manage_course('cccccccc-1111-4111-8111-111111111111'),
  false,
  'can_manage_course returns false for student'
);

-- Test 46: Authenticated role HAS execute privilege on is_student_assigned_to_course
SELECT extensions.is(
  has_function_privilege('authenticated', 'public.is_student_assigned_to_course(uuid)', 'EXECUTE'),
  true,
  'authenticated role has EXECUTE on is_student_assigned_to_course'
);

-- Test 47: Authenticated role HAS execute privilege on can_manage_course
SELECT extensions.is(
  has_function_privilege('authenticated', 'public.can_manage_course(uuid)', 'EXECUTE'),
  true,
  'authenticated role has EXECUTE on can_manage_course'
);

-- Test 48: anon role DOES NOT have execute privilege on is_student_assigned_to_course
SELECT extensions.is(
  has_function_privilege('anon', 'public.is_student_assigned_to_course(uuid)', 'EXECUTE'),
  false,
  'anon role does NOT have EXECUTE on is_student_assigned_to_course'
);

-- Test 49: anon role DOES NOT have execute privilege on can_manage_course
SELECT extensions.is(
  has_function_privilege('anon', 'public.can_manage_course(uuid)', 'EXECUTE'),
  false,
  'anon role does NOT have EXECUTE on can_manage_course'
);

-- Switch to Anon Role
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);

-- Test 50: Anon cannot read any courses
SELECT extensions.is(
  (SELECT count(*)::int FROM public.courses),
  0,
  'Anon cannot read any courses'
);

-- Test 51: Anon execution of is_student_assigned_to_course is rejected with 42501
SELECT extensions.throws_ok(
  $$SELECT public.is_student_assigned_to_course('cccccccc-1111-4111-8111-111111111111')$$,
  '42501',
  NULL,
  'Anon cannot execute is_student_assigned_to_course helper'
);

-- Test 52: Anon execution of can_manage_course is rejected with 42501
SELECT extensions.throws_ok(
  $$SELECT public.can_manage_course('cccccccc-1111-4111-8111-111111111111')$$,
  '42501',
  NULL,
  'Anon cannot execute can_manage_course helper'
);

SELECT * FROM extensions.finish();
ROLLBACK;
