-- ==============================================================================
-- Integration tests for migration 20261109000012 (Video Library & Learning Resources)
-- Executed against the disposable Supabase database started by GitHub Actions.
-- ==============================================================================
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT extensions.plan(44);

-- ------------------------------------------------------------------------------
-- 1. Deterministic isolated identities
-- ------------------------------------------------------------------------------
INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'teacher_video1@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('88888888-8888-4888-8888-888888888888', 'authenticated', 'authenticated', 'teacher_video2@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('99999999-9999-4999-8999-999999999999', 'authenticated', 'authenticated', 'super_admin_video@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'student_video_enrolled@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('33333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'student_video_other@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, role, full_name, full_name_arabic, status)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'teacher', 'Teacher Wessam', 'الأستاذ وسام', 'active'),
  ('88888888-8888-4888-8888-888888888888', 'teacher', 'Other Teacher', 'معلم آخر', 'active'),
  ('99999999-9999-4999-8999-999999999999', 'super_admin', 'Academy Super Admin', 'مدير النظام العام', 'active'),
  ('22222222-2222-4222-8222-222222222222', 'student', 'Enrolled Student', 'طالب ملتحق', 'active'),
  ('33333333-3333-4333-8333-333333333333', 'student', 'Other Student', 'طالب بمجموعة أخرى', 'active')
ON CONFLICT (id) DO NOTHING;

-- 2. Test Groups
INSERT INTO public.groups (id, name, name_arabic, max_students, is_active, archived_at)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-cccccccccccc', 'Active Group A', 'المجموعة أ', 30, true, NULL),
  ('aaaaaaaa-aaaa-4aaa-8aaa-bbbbbbbbbbbb', 'Active Group B', 'المجموعة ب', 30, true, NULL)
ON CONFLICT (id) DO NOTHING;

-- Student 1 in Group A, Student 2 in Group B
INSERT INTO public.group_students (student_id, group_id)
VALUES
  ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-cccccccccccc'),
  ('33333333-3333-4333-8333-333333333333', 'aaaaaaaa-aaaa-4aaa-8aaa-bbbbbbbbbbbb')
ON CONFLICT (group_id, student_id) DO NOTHING;

-- 3. Test Course, Unit, Lesson
INSERT INTO public.courses (id, teacher_id, title, title_arabic, level, is_published)
VALUES
  ('cccccccc-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Video English Course', 'دورة الفيديو الإنجليزية', 'intermediate', true),
  ('cccccccc-8888-4888-8888-888888888888', '88888888-8888-4888-8888-888888888888', 'Other Teacher Course', 'دورة معلم آخر', 'beginner', true)
ON CONFLICT (id) DO NOTHING;

-- Assign Course 1 to Group A only
INSERT INTO public.group_courses (group_id, course_id)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-cccccccccccc', 'cccccccc-1111-4111-8111-111111111111')
ON CONFLICT (group_id, course_id) DO NOTHING;

INSERT INTO public.course_units (id, course_id, title, title_arabic, order_index)
VALUES
  ('44444444-1111-4111-8111-111111111111', 'cccccccc-1111-4111-8111-111111111111', 'Unit 1: Foundations', 'الوحدة 1: الأساسيات', 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.lessons (id, course_id, unit_id, title, title_arabic, order_index, is_published)
VALUES
  ('55555555-1111-4111-8111-111111111111', 'cccccccc-1111-4111-8111-111111111111', '44444444-1111-4111-8111-111111111111', 'Lesson 1.1 Speaking', 'الدرس 1: التحدث', 1, true)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- ASSERTION SET 1: Schema Integrity & Anon Privileges
-- ------------------------------------------------------------------------------

SELECT extensions.has_table('public', 'video_assets', 'video_assets table exists');
SELECT extensions.has_table('public', 'video_progress', 'video_progress table exists');
SELECT extensions.has_column('public', 'video_assets', 'video_url', 'video_assets has video_url');
SELECT extensions.has_column('public', 'video_assets', 'video_source', 'video_assets has video_source');
SELECT extensions.has_column('public', 'video_assets', 'status', 'video_assets has status');
SELECT extensions.has_column('public', 'video_assets', 'order_index', 'video_assets has order_index');
SELECT extensions.has_column('public', 'lesson_resources', 'resource_type', 'lesson_resources has resource_type');
SELECT extensions.has_column('public', 'lesson_resources', 'is_published', 'lesson_resources has is_published');

-- Verify anonymous role has no select or execute privileges
SELECT extensions.is(
  has_table_privilege('anon', 'public.video_assets', 'SELECT'),
  false,
  'anon has no SELECT privilege on video_assets'
);

SELECT extensions.is(
  has_table_privilege('anon', 'public.video_progress', 'SELECT'),
  false,
  'anon has no SELECT privilege on video_progress'
);

SELECT extensions.is(
  has_table_privilege('anon', 'public.lesson_resources', 'SELECT'),
  false,
  'anon has no SELECT privilege on lesson_resources'
);

-- Anon access throws 42501
SET LOCAL ROLE anon;

SELECT extensions.throws_ok(
  $$SELECT count(*) FROM public.video_assets$$,
  '42501',
  NULL,
  'anon is rejected with 42501 when selecting from video_assets'
);

SELECT extensions.throws_ok(
  $$SELECT public.record_video_progress('00000000-0000-0000-0000-000000000000'::uuid, 10, 100)$$,
  '42501',
  NULL,
  'anon is rejected with 42501 when calling record_video_progress'
);

-- ------------------------------------------------------------------------------
-- ASSERTION SET 2: Teacher Video Management & Ownership Scoping
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

-- Teacher 1 creates a video in their course
SELECT extensions.lives_ok(
  $$INSERT INTO public.video_assets (
      id, title, title_arabic, video_url, video_source, duration_seconds,
      course_id, unit_id, lesson_id, status, created_by, order_index
    ) VALUES (
      '77777777-1111-4111-8111-111111111111',
      'IELTS Speaking Fluency',
      'الطلاقة في محادثة الآيلتس',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'youtube',
      300,
      'cccccccc-1111-4111-8111-111111111111',
      '44444444-1111-4111-8111-111111111111',
      '55555555-1111-4111-8111-111111111111',
      'draft',
      '11111111-1111-4111-8111-111111111111',
      1
    )$$,
  'Teacher can create a video in their owned course'
);

-- Teacher 1 creates a second draft video
INSERT INTO public.video_assets (
  id, title, title_arabic, video_url, video_source, duration_seconds,
  course_id, status, created_by, order_index
) VALUES (
  '77777777-2222-4222-8222-222222222222',
  'Advanced Listening Exercise',
  'تدريب الاستماع المتقدم',
  'https://vimeo.com/76979871',
  'vimeo',
  400,
  'cccccccc-1111-4111-8111-111111111111',
  'draft',
  '11111111-1111-4111-8111-111111111111',
  2
);

-- Teacher 1 creates a group-restricted video for Group A
INSERT INTO public.video_assets (
  id, title, title_arabic, video_url, video_source, duration_seconds,
  course_id, group_id, status, created_by, order_index
) VALUES (
  '77777777-3333-4333-8333-333333333333',
  'Group A Private Workshop',
  'ورشة عمل خاصة للمجموعة أ',
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'youtube',
  600,
  'cccccccc-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-cccccccccccc',
  'published',
  '11111111-1111-4111-8111-111111111111',
  3
);

-- Teacher 1 creates a video restricted to Group B
INSERT INTO public.video_assets (
  id, title, title_arabic, video_url, video_source, duration_seconds,
  group_id, status, created_by, order_index
) VALUES (
  '77777777-4444-4444-8444-444444444444',
  'Group B Special Clinic',
  'عيادة خاصة للمجموعة ب',
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'youtube',
  500,
  'aaaaaaaa-aaaa-4aaa-8aaa-bbbbbbbbbbbb',
  'published',
  '11111111-1111-4111-8111-111111111111',
  4
);

-- Teacher 2 cannot insert video for Teacher 1's course
SELECT set_config('request.jwt.claim.sub', '88888888-8888-4888-8888-888888888888', true);
SELECT extensions.throws_ok(
  $$INSERT INTO public.video_assets (
      id, title, title_arabic, video_url, video_source, duration_seconds,
      course_id, status, created_by
    ) VALUES (
      '77777777-5555-4555-8555-555555555555',
      'Unauthorized Video',
      'فيديو غير مصرح',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'youtube',
      200,
      'cccccccc-1111-4111-8111-111111111111',
      'draft',
      '88888888-8888-4888-8888-888888888888'
    )$$,
  '42501',
  NULL,
  'Teacher cannot insert video into another teachers course'
);

-- Teacher 1 publishes Video 1 via RPC
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT extensions.lives_ok(
  $$SELECT public.publish_video_asset('77777777-1111-4111-8111-111111111111')$$,
  'Teacher can publish their own video asset'
);

SELECT extensions.is(
  (SELECT status FROM public.video_assets WHERE id = '77777777-1111-4111-8111-111111111111'),
  'published',
  'Video status is now published'
);

-- Teacher 1 archives Video 2 via RPC
SELECT extensions.lives_ok(
  $$SELECT public.archive_video_asset('77777777-2222-4222-8222-222222222222')$$,
  'Teacher can archive their own video asset'
);

SELECT extensions.is(
  (SELECT status FROM public.video_assets WHERE id = '77777777-2222-4222-8222-222222222222'),
  'archived',
  'Video status is now archived'
);

-- Teacher 2 cannot publish Teacher 1's video
SELECT set_config('request.jwt.claim.sub', '88888888-8888-4888-8888-888888888888', true);
SELECT extensions.throws_ok(
  $$SELECT public.publish_video_asset('77777777-2222-4222-8222-222222222222')$$,
  '42501',
  NULL,
  'Other teacher is forbidden from publishing someone elses video'
);

-- Super admin CAN manage any video
SELECT set_config('request.jwt.claim.sub', '99999999-9999-4999-8999-999999999999', true);
SELECT extensions.lives_ok(
  $$SELECT public.unpublish_video_asset('77777777-1111-4111-8111-111111111111')$$,
  'Super admin can unpublish any video'
);
-- Re-publish for student tests
SELECT public.publish_video_asset('77777777-1111-4111-8111-111111111111');

-- ------------------------------------------------------------------------------
-- ASSERTION SET 3: Student Video Visibility & Security
-- ------------------------------------------------------------------------------

-- Student 1 (enrolled in Course 1 and Group A)
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);

-- Student 1 can see published Video 1
SELECT extensions.is(
  (SELECT count(*)::int FROM public.video_assets WHERE id = '77777777-1111-4111-8111-111111111111'),
  1,
  'Enrolled student can view published course video'
);

-- Student 1 CANNOT see archived Video 2
SELECT extensions.is(
  (SELECT count(*)::int FROM public.video_assets WHERE id = '77777777-2222-4222-8222-222222222222'),
  0,
  'Enrolled student cannot view archived video'
);

-- Student 1 can see Video 3 (Group A restricted)
SELECT extensions.is(
  (SELECT count(*)::int FROM public.video_assets WHERE id = '77777777-3333-4333-8333-333333333333'),
  1,
  'Student in Group A can view Group A video'
);

-- Student 1 CANNOT see Video 4 (Group B restricted)
SELECT extensions.is(
  (SELECT count(*)::int FROM public.video_assets WHERE id = '77777777-4444-4444-8444-444444444444'),
  0,
  'Student in Group A cannot view Group B private video'
);

-- Student 2 (in Group B, not assigned to Course 1)
SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);

-- Student 2 CANNOT see Video 1 (course not assigned to Group B)
SELECT extensions.is(
  (SELECT count(*)::int FROM public.video_assets WHERE id = '77777777-1111-4111-8111-111111111111'),
  0,
  'Student not assigned to course cannot view course video'
);

-- Student 2 CAN see Video 4 (Group B private video)
SELECT extensions.is(
  (SELECT count(*)::int FROM public.video_assets WHERE id = '77777777-4444-4444-8444-444444444444'),
  1,
  'Student in Group B can view Group B private video'
);

-- ------------------------------------------------------------------------------
-- ASSERTION SET 4: Video Progress Tracking & Server-Side Completion
-- ------------------------------------------------------------------------------

-- Student 1 records initial watch progress (50 seconds out of 300)
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);

SELECT extensions.lives_ok(
  $$SELECT public.record_video_progress('77777777-1111-4111-8111-111111111111', 50, 300)$$,
  'Student can record legitimate playback progress'
);

-- Verify progress is saved and NOT prematurely completed (50/300 = 16.7% < 85%)
SELECT extensions.is(
  (SELECT last_position_seconds FROM public.video_progress WHERE student_id = '22222222-2222-4222-8222-222222222222' AND video_id = '77777777-1111-4111-8111-111111111111'),
  50,
  'Last position saved as 50 seconds'
);

SELECT extensions.is(
  (SELECT is_completed FROM public.video_progress WHERE student_id = '22222222-2222-4222-8222-222222222222' AND video_id = '77777777-1111-4111-8111-111111111111'),
  false,
  'Video is NOT marked complete on preliminary viewing (prevents false completion)'
);

-- Student 1 watches to 260 seconds (260/300 = 86.7% >= 85%)
SELECT public.record_video_progress('77777777-1111-4111-8111-111111111111', 260, 300);

SELECT extensions.is(
  (SELECT is_completed FROM public.video_progress WHERE student_id = '22222222-2222-4222-8222-222222222222' AND video_id = '77777777-1111-4111-8111-111111111111'),
  true,
  'Video IS marked complete once student reaches >= 85% of duration'
);

-- Linked lesson_progress is also completed
SELECT extensions.is(
  (SELECT is_completed FROM public.lesson_progress WHERE student_id = '22222222-2222-4222-8222-222222222222' AND lesson_id = '55555555-1111-4111-8111-111111111111'),
  true,
  'Linked lesson_progress is synchronized as complete'
);

-- Cross-student progress isolation: Student 2 cannot read Student 1 progress
SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
SELECT extensions.is(
  (SELECT count(*)::int FROM public.video_progress WHERE student_id = '22222222-2222-4222-8222-222222222222'),
  0,
  'Student 2 cannot view Student 1 progress records'
);

-- Student 2 cannot record progress on unauthorized Video 1
SELECT extensions.throws_ok(
  $$SELECT public.record_video_progress('77777777-1111-4111-8111-111111111111', 50, 300)$$,
  '42501',
  NULL,
  'Student cannot record progress for a video in an unassigned course'
);

-- ------------------------------------------------------------------------------
-- ASSERTION SET 5: Study Materials & Lesson Resources Hardening
-- ------------------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

-- Teacher 1 adds a published PDF worksheet
INSERT INTO public.lesson_resources (
  id, lesson_id, course_id, title, title_arabic, file_url, storage_path,
  file_type, resource_type, is_published, order_index
) VALUES (
  '66666666-1111-4111-8111-111111111111',
  '55555555-1111-4111-8111-111111111111',
  'cccccccc-1111-4111-8111-111111111111',
  'Speaking Worksheet Task 1',
  'ورقة عمل المحادثة 1',
  'courses/cccccccc-1111-4111-8111-111111111111/lessons/55555555-1111-4111-8111-111111111111/worksheet.pdf',
  'courses/cccccccc-1111-4111-8111-111111111111/lessons/55555555-1111-4111-8111-111111111111/worksheet.pdf',
  'pdf',
  'worksheet',
  true,
  1
);

-- Teacher 1 adds an UNPUBLISHED draft resource
INSERT INTO public.lesson_resources (
  id, lesson_id, course_id, title, title_arabic, file_url,
  file_type, resource_type, is_published, order_index
) VALUES (
  '66666666-2222-4222-8222-222222222222',
  '55555555-1111-4111-8111-111111111111',
  'cccccccc-1111-4111-8111-111111111111',
  'Draft Teacher Solution Guide',
  'دليل حلول المعلم المسودة',
  'https://example.com/solutions.pdf',
  'pdf',
  'document',
  false,
  2
);

-- Student 1 views resources: can see published resource
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
SELECT extensions.is(
  (SELECT count(*)::int FROM public.lesson_resources WHERE id = '66666666-1111-4111-8111-111111111111'),
  1,
  'Student can view published resource in assigned course lesson'
);

-- Student 1 CANNOT see unpublished draft resource
SELECT extensions.is(
  (SELECT count(*)::int FROM public.lesson_resources WHERE id = '66666666-2222-4222-8222-222222222222'),
  0,
  'Student CANNOT view unpublished draft resource'
);

-- Student 2 (unassigned) CANNOT see published resource
SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
SELECT extensions.is(
  (SELECT count(*)::int FROM public.lesson_resources WHERE id = '66666666-1111-4111-8111-111111111111'),
  0,
  'Unassigned student CANNOT view resource in another course'
);

-- ------------------------------------------------------------------------------
-- ASSERTION SET 6: Reordering & Analytics RPCs
-- ------------------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

-- Reorder course videos
SELECT extensions.lives_ok(
  $$SELECT public.reorder_course_videos(
      'cccccccc-1111-4111-8111-111111111111',
      ARRAY['77777777-3333-4333-8333-333333333333'::uuid, '77777777-1111-4111-8111-111111111111'::uuid]
    )$$,
  'Teacher can reorder videos in their course'
);

SELECT extensions.is(
  (SELECT order_index FROM public.video_assets WHERE id = '77777777-3333-4333-8333-333333333333'),
  1,
  'First video in array assigned order_index = 1'
);

SELECT extensions.is(
  (SELECT order_index FROM public.video_assets WHERE id = '77777777-1111-4111-8111-111111111111'),
  2,
  'Second video in array assigned order_index = 2'
);

-- Query video analytics for Video 1
SELECT extensions.lives_ok(
  $$SELECT public.get_video_stats('77777777-1111-4111-8111-111111111111')$$,
  'Teacher can query video engagement stats'
);

SELECT extensions.is(
  (SELECT (public.get_video_stats('77777777-1111-4111-8111-111111111111')->>'completed_count')::int),
  1,
  'Analytics returns 1 completed view from Student 1'
);

-- Teacher 2 cannot view stats of Video 1
SELECT set_config('request.jwt.claim.sub', '88888888-8888-4888-8888-888888888888', true);
SELECT extensions.throws_ok(
  $$SELECT public.get_video_stats('77777777-1111-4111-8111-111111111111')$$,
  '42501',
  NULL,
  'Unassociated teacher cannot view stats for another teachers video'
);

-- Super admin CAN view stats of Video 1
SELECT set_config('request.jwt.claim.sub', '99999999-9999-4999-8999-999999999999', true);
SELECT extensions.lives_ok(
  $$SELECT public.get_video_stats('77777777-1111-4111-8111-111111111111')$$,
  'Super admin can query video stats for any video'
);

SELECT * FROM extensions.finish();
ROLLBACK;
