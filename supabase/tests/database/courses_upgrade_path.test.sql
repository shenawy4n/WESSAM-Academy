-- ==============================================================================
-- WESSAM Academy - Regression Tests: Upgrade Path & Production Schema Drift
-- Tests both:
-- 1. Clean disposable installation (migration 000007 applied after 000006)
-- 2. Upgrade reconciliation over existing database schema
-- ==============================================================================
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT extensions.plan(43);

-- ------------------------------------------------------------------------------
-- 1. SETUP DETERMINISTIC IDENTITIES
-- ------------------------------------------------------------------------------
INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1', 'authenticated', 'authenticated', 'teacher_upgr1@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('a2a2a2a2-a2a2-42a2-82a2-a2a2a2a2a2a2', 'authenticated', 'authenticated', 'teacher_upgr2@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('a9a9a9a9-a9a9-49a9-89a9-a9a9a9a9a9a9', 'authenticated', 'authenticated', 'super_admin_upgr@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('b1b1b1b1-b1b1-41b1-81b1-b1b1b1b1b1b1', 'authenticated', 'authenticated', 'student_upgr1@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('b2b2b2b2-b2b2-42b2-82b2-b2b2b2b2b2b2', 'authenticated', 'authenticated', 'student_upgr2@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, role, full_name, full_name_arabic, status)
VALUES
  ('a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1', 'teacher', 'Upgrade Teacher Owner', 'معلم المنهج الترقية', 'active'),
  ('a2a2a2a2-a2a2-42a2-82a2-a2a2a2a2a2a2', 'teacher', 'Upgrade Other Teacher', 'معلم آخر ترقية', 'active'),
  ('a9a9a9a9-a9a9-49a9-89a9-a9a9a9a9a9a9', 'super_admin', 'Upgrade Super Admin', 'مدير النظام ترقية', 'active'),
  ('b1b1b1b1-b1b1-41b1-81b1-b1b1b1b1b1b1', 'student', 'Upgrade Enrolled Student', 'طالب ملتحق ترقية', 'active'),
  ('b2b2b2b2-b2b2-42b2-82b2-b2b2b2b2b2b2', 'student', 'Upgrade Unassigned Student', 'طالب غير ملتحق ترقية', 'active')
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 2. SETUP GROUPS & COHORTS
-- ------------------------------------------------------------------------------
INSERT INTO public.groups (id, name, name_arabic, max_students, is_active, archived_at)
VALUES
  ('c1c1c1c1-c1c1-41c1-81c1-c1c1c1c1c1c1', 'Active Upgrade Cohort', 'مجموعة ترقية نشطة', 25, true, NULL),
  ('c2c2c2c2-c2c2-42c2-82c2-c2c2c2c2c2c2', 'Archived Upgrade Cohort', 'مجموعة ترقية مؤرشفة', 25, false, now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.group_students (student_id, group_id)
VALUES ('b1b1b1b1-b1b1-41b1-81b1-b1b1b1b1b1b1', 'c1c1c1c1-c1c1-41c1-81c1-c1c1c1c1c1c1')
ON CONFLICT (group_id, student_id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 3. SETUP COURSES & CURRICULUM
-- ------------------------------------------------------------------------------
INSERT INTO public.courses (id, teacher_id, title, title_arabic, level, is_published)
VALUES
  ('d1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1', 'a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1', 'Upgrade Course B2', 'منهج الترقية B2', 'intermediate', true),
  ('d2d2d2d2-d2d2-42d2-82d2-d2d2d2d2d2d2', 'a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1', 'Draft Upgrade Course', 'مسودة منهج الترقية', 'beginner', false)
ON CONFLICT (id) DO NOTHING;

-- Assign course d1 to active group c1
INSERT INTO public.group_courses (course_id, group_id, assigned_at)
VALUES ('d1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1', 'c1c1c1c1-c1c1-41c1-81c1-c1c1c1c1c1c1', now())
ON CONFLICT (group_id, course_id) DO NOTHING;

INSERT INTO public.course_units (id, course_id, title, title_arabic, order_index)
VALUES
  ('e1e1e1e1-e1e1-41e1-81e1-e1e1e1e1e1e1', 'd1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1', 'Upgrade Unit 1', 'وحدة الترقية 1', 1),
  ('e2e2e2e2-e2e2-42e2-82e2-e2e2e2e2e2e2', 'd1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1', 'Upgrade Unit 2', 'وحدة الترقية 2', 2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.lessons (id, course_id, unit_id, title, title_arabic, order_index, is_published, video_url)
VALUES
  ('f1f1f1f1-f1f1-41f1-81f1-f1f1f1f1f1f1', 'd1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1', 'e1e1e1e1-e1e1-41e1-81e1-e1e1e1e1e1e1', 'Lesson 1', 'الدرس 1', 1, true, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
  ('f2f2f2f2-f2f2-42f2-82f2-f2f2f2f2f2f2', 'd1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1', 'e1e1e1e1-e1e1-41e1-81e1-e1e1e1e1e1e1', 'Lesson 2 (Draft)', 'الدرس 2 (مسودة)', 2, false, 'https://vimeo.com/76979871')
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 4. SIMULATE EXISTING DATABASE RECONCILIATION
-- ------------------------------------------------------------------------------
-- Test 1: Re-running reconciliation DDL on an existing database is completely idempotent
SELECT extensions.lives_ok(
  $$
  -- Re-invoke migration 000007 logic to simulate upgrade on an active database
  ALTER FUNCTION public.is_student_assigned_to_course(uuid) OWNER TO postgres;
  ALTER FUNCTION public.can_manage_course(uuid) OWNER TO postgres;
  $$,
  'Reconciliation logic executes cleanly on existing database'
);

-- ------------------------------------------------------------------------------
-- 5. TEACHER OPERATIONS & NO RECURSION
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1', true);

-- Test 2: Teacher can select courses with zero infinite recursion
SELECT extensions.lives_ok(
  $$SELECT count(*) FROM public.courses WHERE id = 'd1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1'$$,
  'Teacher can select courses with zero infinite recursion error'
);

-- Test 3: Teacher sees their course
SELECT extensions.is(
  (SELECT count(*)::int FROM public.courses WHERE id = 'd1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1'),
  1,
  'Teacher sees their course in SELECT'
);

-- Test 4: Teacher can insert a new course
SELECT extensions.lives_ok(
  $$INSERT INTO public.courses (id, teacher_id, title, title_arabic, level, is_published)
    VALUES ('d3d3d3d3-d3d3-43d3-83d3-d3d3d3d3d3d3', 'a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1', 'New Course', 'منهج جديد', 'beginner', true)$$,
  'Teacher can insert own course'
);

-- Test 5: Inserted course exists
SELECT extensions.is(
  (SELECT count(*)::int FROM public.courses WHERE id = 'd3d3d3d3-d3d3-43d3-83d3-d3d3d3d3d3d3'),
  1,
  'Inserted course exists in public.courses'
);

-- Test 6: Teacher can update their own course
WITH updated_course AS (
  UPDATE public.courses
  SET title = 'Updated Course Title'
  WHERE id = 'd3d3d3d3-d3d3-43d3-83d3-d3d3d3d3d3d3'
  RETURNING id
)
SELECT extensions.is(
  (SELECT count(*)::int FROM updated_course),
  1,
  'Teacher UPDATE on own course affects 1 row'
);

-- Test 7: Updated title verified
SELECT extensions.is(
  (SELECT title FROM public.courses WHERE id = 'd3d3d3d3-d3d3-43d3-83d3-d3d3d3d3d3d3'),
  'Updated Course Title',
  'Course title successfully updated by owner teacher'
);

-- ------------------------------------------------------------------------------
-- 6. MULTI-TENANT ISOLATION: OTHER TEACHER CANNOT MUTATE
-- ------------------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', 'a2a2a2a2-a2a2-42a2-82a2-a2a2a2a2a2a2', true);

-- Test 8: Other teacher UPDATE affects 0 rows
WITH unauthorized_update AS (
  UPDATE public.courses
  SET title = 'Hacked by Other Teacher'
  WHERE id = 'd1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1'
  RETURNING id
)
SELECT extensions.is(
  (SELECT count(*)::int FROM unauthorized_update),
  0,
  'Other teacher UPDATE affects 0 rows under RLS'
);

-- Test 9: Title remains untouched
SELECT extensions.is(
  (SELECT title FROM public.courses WHERE id = 'd1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1'),
  'Upgrade Course B2',
  'Course title unchanged after unauthorized teacher update attempt'
);

-- Test 10: Other teacher DELETE affects 0 rows
WITH unauthorized_delete AS (
  DELETE FROM public.courses
  WHERE id = 'd1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1'
  RETURNING id
)
SELECT extensions.is(
  (SELECT count(*)::int FROM unauthorized_delete),
  0,
  'Other teacher DELETE affects 0 rows under RLS'
);

-- Test 11: Course still exists
SELECT extensions.is(
  (SELECT count(*)::int FROM public.courses WHERE id = 'd1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1'),
  1,
  'Course still exists after unauthorized delete attempt'
);

-- ------------------------------------------------------------------------------
-- 7. SUPER ADMIN PERMISSIONS
-- ------------------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', 'a9a9a9a9-a9a9-49a9-89a9-a9a9a9a9a9a9', true);

-- Test 12: Super admin can read courses
SELECT extensions.is(
  (SELECT count(*)::int FROM public.courses WHERE id IN ('d1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1', 'd2d2d2d2-d2d2-42d2-82d2-d2d2d2d2d2d2')),
  2,
  'Super admin can read all courses'
);

-- Test 13: Super admin can update any course
WITH admin_update AS (
  UPDATE public.courses
  SET description = 'Admin Verified Description'
  WHERE id = 'd1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1'
  RETURNING id
)
SELECT extensions.is(
  (SELECT count(*)::int FROM admin_update),
  1,
  'Super admin UPDATE on course affects 1 row'
);

-- ------------------------------------------------------------------------------
-- 8. ENROLLED STUDENT ACCESS & MUTATION BLOCKING
-- ------------------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', 'b1b1b1b1-b1b1-41b1-81b1-b1b1b1b1b1b1', true);

-- Test 14: Enrolled student can read assigned published course
SELECT extensions.is(
  (SELECT count(*)::int FROM public.courses WHERE id = 'd1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1'),
  1,
  'Enrolled student can read assigned published course'
);

-- Test 15: Enrolled student cannot read draft course
SELECT extensions.is(
  (SELECT count(*)::int FROM public.courses WHERE id = 'd2d2d2d2-d2d2-42d2-82d2-d2d2d2d2d2d2'),
  0,
  'Enrolled student cannot read unpublished draft course'
);

-- Test 16: Enrolled student UPDATE affects 0 rows
WITH student_update AS (
  UPDATE public.courses
  SET title = 'Student Defacement'
  WHERE id = 'd1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1'
  RETURNING id
)
SELECT extensions.is(
  (SELECT count(*)::int FROM student_update),
  0,
  'Student UPDATE affects 0 rows under RLS'
);

-- Test 17: Course title unchanged after student update
SELECT extensions.is(
  (SELECT title FROM public.courses WHERE id = 'd1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1'),
  'Upgrade Course B2',
  'Course title unchanged after student update attempt'
);

-- Test 18: Enrolled student DELETE affects 0 rows
WITH student_delete AS (
  DELETE FROM public.courses
  WHERE id = 'd1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1'
  RETURNING id
)
SELECT extensions.is(
  (SELECT count(*)::int FROM student_delete),
  0,
  'Student DELETE affects 0 rows under RLS'
);

-- Test 19: Course still exists after student delete attempt
SELECT extensions.is(
  (SELECT count(*)::int FROM public.courses WHERE id = 'd1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1'),
  1,
  'Course still exists after student delete attempt'
);

-- ------------------------------------------------------------------------------
-- 9. UNASSIGNED STUDENT ACCESS
-- ------------------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', 'b2b2b2b2-b2b2-42b2-82b2-b2b2b2b2b2b2', true);

-- Test 20: Unassigned student cannot read course
SELECT extensions.is(
  (SELECT count(*)::int FROM public.courses WHERE id = 'd1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1'),
  0,
  'Unassigned student cannot read course d1'
);

-- ------------------------------------------------------------------------------
-- 10. HELPER FUNCTION EVALUATION
-- ------------------------------------------------------------------------------
-- Test 21: is_student_assigned_to_course returns true for enrolled student
SELECT extensions.is(
  public.is_student_assigned_to_course('d1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1'),
  false,
  'is_student_assigned_to_course returns false for student b2'
);

-- Switch to student b1
SELECT set_config('request.jwt.claim.sub', 'b1b1b1b1-b1b1-41b1-81b1-b1b1b1b1b1b1', true);

-- Test 22: is_student_assigned_to_course returns true for enrolled student b1
SELECT extensions.is(
  public.is_student_assigned_to_course('d1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1'),
  true,
  'is_student_assigned_to_course returns true for enrolled student b1'
);

-- Switch to Teacher 1
SELECT set_config('request.jwt.claim.sub', 'a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1', true);

-- Test 23: can_manage_course returns true for course owner
SELECT extensions.is(
  public.can_manage_course('d1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1'),
  true,
  'can_manage_course returns true for course owner teacher'
);

-- Switch to Other Teacher
SELECT set_config('request.jwt.claim.sub', 'a2a2a2a2-a2a2-42a2-82a2-a2a2a2a2a2a2', true);

-- Test 24: can_manage_course returns false for other teacher
SELECT extensions.is(
  public.can_manage_course('d1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1'),
  false,
  'can_manage_course returns false for other teacher'
);

-- Switch to Super Admin
SELECT set_config('request.jwt.claim.sub', 'a9a9a9a9-a9a9-49a9-89a9-a9a9a9a9a9a9', true);

-- Test 25: can_manage_course returns true for super admin
SELECT extensions.is(
  public.can_manage_course('d1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1'),
  true,
  'can_manage_course returns true for super admin'
);

-- Switch to Student
SELECT set_config('request.jwt.claim.sub', 'b1b1b1b1-b1b1-41b1-81b1-b1b1b1b1b1b1', true);

-- Test 26: can_manage_course returns false for student
SELECT extensions.is(
  public.can_manage_course('d1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1'),
  false,
  'can_manage_course returns false for student'
);

-- ------------------------------------------------------------------------------
-- 11. PRIVILEGE & ACL REGRESSION ASSERTIONS
-- ------------------------------------------------------------------------------
-- Test 27: Authenticated role HAS execute privilege on is_student_assigned_to_course
SELECT extensions.is(
  has_function_privilege('authenticated', 'public.is_student_assigned_to_course(uuid)', 'EXECUTE'),
  true,
  'authenticated role has EXECUTE on is_student_assigned_to_course'
);

-- Test 28: Authenticated role HAS execute privilege on can_manage_course
SELECT extensions.is(
  has_function_privilege('authenticated', 'public.can_manage_course(uuid)', 'EXECUTE'),
  true,
  'authenticated role has EXECUTE on can_manage_course'
);

-- Test 29: anon role DOES NOT have execute privilege on is_student_assigned_to_course
SELECT extensions.is(
  has_function_privilege('anon', 'public.is_student_assigned_to_course(uuid)', 'EXECUTE'),
  false,
  'anon role does NOT have EXECUTE on is_student_assigned_to_course'
);

-- Test 30: anon role DOES NOT have execute privilege on can_manage_course
SELECT extensions.is(
  has_function_privilege('anon', 'public.can_manage_course(uuid)', 'EXECUTE'),
  false,
  'anon role does NOT have EXECUTE on can_manage_course'
);

-- ------------------------------------------------------------------------------
-- 12. ANON ROLE ACCESS IS BLOCKED
-- ------------------------------------------------------------------------------
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);

-- Test 31: Anon SELECT on courses is rejected with 42501 due to revoked table privileges
SELECT extensions.throws_ok(
  $$SELECT count(*) FROM public.courses$$,
  '42501',
  NULL,
  'Anon cannot select from courses table'
);

-- Test 32: anon role DOES NOT have SELECT table privilege on public.courses
SELECT extensions.is(
  has_table_privilege('anon', 'public.courses', 'SELECT'),
  false,
  'anon role does NOT have SELECT privilege on public.courses'
);

-- Test 33: Anon execution of is_student_assigned_to_course throws 42501
SELECT extensions.throws_ok(
  $$SELECT public.is_student_assigned_to_course('d1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1')$$,
  '42501',
  NULL,
  'Anon cannot execute is_student_assigned_to_course'
);

-- Test 34: Anon execution of can_manage_course throws 42501
SELECT extensions.throws_ok(
  $$SELECT public.can_manage_course('d1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1')$$,
  '42501',
  NULL,
  'Anon cannot execute can_manage_course'
);

-- ------------------------------------------------------------------------------
-- 13. CURRICULUM ORDERING & GROUP ASSIGNMENT RPCS
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1', true);

-- Test 35: Course owner can reorder course units
SELECT extensions.lives_ok(
  $$SELECT public.reorder_course_units(
    'd1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1',
    ARRAY['e2e2e2e2-e2e2-42e2-82e2-e2e2e2e2e2e2'::uuid, 'e1e1e1e1-e1e1-41e1-81e1-e1e1e1e1e1e1'::uuid]
  )$$,
  'Course owner teacher can reorder units'
);

-- Test 36: Unit order updated
SELECT extensions.is(
  (SELECT order_index FROM public.course_units WHERE id = 'e2e2e2e2-e2e2-42e2-82e2-e2e2e2e2e2e2'),
  1,
  'Unit e2 order_index is now 1'
);

-- Test 37: Course owner can reorder lessons
SELECT extensions.lives_ok(
  $$SELECT public.reorder_course_lessons(
    'e1e1e1e1-e1e1-41e1-81e1-e1e1e1e1e1e1',
    ARRAY['f2f2f2f2-f2f2-42f2-82f2-f2f2f2f2f2f2'::uuid, 'f1f1f1f1-f1f1-41f1-81f1-f1f1f1f1f1f1'::uuid]
  )$$,
  'Course owner teacher can reorder lessons'
);

-- Test 38: Lesson order updated
SELECT extensions.is(
  (SELECT order_index FROM public.lessons WHERE id = 'f2f2f2f2-f2f2-42f2-82f2-f2f2f2f2f2f2'),
  1,
  'Lesson f2 order_index is now 1'
);

-- Test 39: Course owner can assign course to active cohort
SELECT extensions.lives_ok(
  $$SELECT public.assign_course_to_group(
    'd3d3d3d3-d3d3-43d3-83d3-d3d3d3d3d3d3',
    'c1c1c1c1-c1c1-41c1-81c1-c1c1c1c1c1c1'
  )$$,
  'Course owner can assign course to active group'
);

-- Test 40: Course owner can remove course from group
SELECT extensions.lives_ok(
  $$SELECT public.remove_course_from_group(
    'd3d3d3d3-d3d3-43d3-83d3-d3d3d3d3d3d3',
    'c1c1c1c1-c1c1-41c1-81c1-c1c1c1c1c1c1'
  )$$,
  'Course owner can remove course assignment'
);

-- ------------------------------------------------------------------------------
-- 14. CURRICULUM ACCESS FOR ENROLLED STUDENTS
-- ------------------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', 'b1b1b1b1-b1b1-41b1-81b1-b1b1b1b1b1b1', true);

-- Test 41: Enrolled student can read published lesson
SELECT extensions.is(
  (SELECT count(*)::int FROM public.lessons WHERE id = 'f1f1f1f1-f1f1-41f1-81f1-f1f1f1f1f1f1'),
  1,
  'Enrolled student can view published lesson'
);

-- Test 42: Enrolled student cannot read unpublished draft lesson
SELECT extensions.is(
  (SELECT count(*)::int FROM public.lessons WHERE id = 'f2f2f2f2-f2f2-42f2-82f2-f2f2f2f2f2f2'),
  0,
  'Enrolled student cannot view unpublished lesson'
);

-- Test 43: Enrolled student can record lesson progress
SELECT extensions.lives_ok(
  $$SELECT public.record_lesson_progress(
    'f1f1f1f1-f1f1-41f1-81f1-f1f1f1f1f1f1',
    true,
    1800
  )$$,
  'Enrolled student can record lesson progress'
);

SELECT * FROM extensions.finish();
ROLLBACK;
