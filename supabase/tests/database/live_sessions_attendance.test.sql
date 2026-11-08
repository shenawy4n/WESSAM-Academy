-- ==============================================================================
-- Integration tests for migration 20261107000008 (Live Sessions & Attendance)
-- Validates schema extensions, RLS isolation, secure meeting links,
-- atomic attendance batching, and cohort enrollment integrity triggers.
-- ==============================================================================
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT extensions.plan(47);

-- -----------------------------------------------------------------------------
-- 1. Deterministic isolated identities
-- -----------------------------------------------------------------------------
INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'teacher_live_owner@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('88888888-8888-4888-8888-888888888888', 'authenticated', 'authenticated', 'teacher_live_other@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('99999999-9999-4999-8999-999999999999', 'authenticated', 'authenticated', 'super_admin_live@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'student_live1@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('33333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'student_live2@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('44444444-4444-4444-8444-444444444444', 'authenticated', 'authenticated', 'student_live_unassigned@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, role, full_name, full_name_arabic, status)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'teacher', 'Live Owner Teacher', 'معلم الحصة الأصلي', 'active'),
  ('88888888-8888-4888-8888-888888888888', 'teacher', 'Other Live Teacher', 'معلم آخر', 'active'),
  ('99999999-9999-4999-8999-999999999999', 'super_admin', 'Live Super Admin', 'مدير النظام العام', 'active'),
  ('22222222-2222-4222-8222-222222222222', 'student', 'Live Student One', 'طالب الحصة الأول', 'active'),
  ('33333333-3333-4333-8333-333333333333', 'student', 'Live Student Two', 'طالب الحصة الثاني', 'active'),
  ('44444444-4444-4444-8444-444444444444', 'student', 'Unassigned Student', 'طالب غير مسجل بالمجموعة', 'active')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. Cohort Groups & Enrollment
-- -----------------------------------------------------------------------------
INSERT INTO public.groups (id, name, name_arabic, max_students, is_active)
VALUES
  ('aaaaaaaa-1111-4111-8111-111111111111', 'Live Cohort A', 'مجموعة البث أ', 30, true),
  ('aaaaaaaa-2222-4222-8222-222222222222', 'Live Cohort B', 'مجموعة البث ب', 30, true)
ON CONFLICT (id) DO NOTHING;

-- Enroll student 1 and student 2 in Cohort A; student 3 in Cohort B
INSERT INTO public.group_students (student_id, group_id)
VALUES
  ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-1111-4111-8111-111111111111'),
  ('33333333-3333-4333-8333-333333333333', 'aaaaaaaa-1111-4111-8111-111111111111'),
  ('44444444-4444-4444-8444-444444444444', 'aaaaaaaa-2222-4222-8222-222222222222')
ON CONFLICT (group_id, student_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 3. Initial Test Live Sessions
-- -----------------------------------------------------------------------------
INSERT INTO public.live_sessions (
  id, group_id, teacher_id, title, title_arabic, start_time, duration_minutes, provider, meeting_url, status
) VALUES
  ('bbbbbbbb-1111-4111-8111-111111111111', 'aaaaaaaa-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Unit 1 Live Grammar Class', 'حصة القواعد المباشرة 1', now() + interval '1 day', 60, 'zoom', 'https://zoom.us/j/1234567890', 'scheduled'),
  ('bbbbbbbb-2222-4222-8222-222222222222', 'aaaaaaaa-2222-4222-8222-222222222222', '88888888-8888-4888-8888-888888888888', 'Cohort B Speaking Session', 'حصة المحادثة للمجموعة ب', now() + interval '2 days', 45, 'google_meet', 'https://meet.google.com/abc-defg-hij', 'scheduled'),
  ('bbbbbbbb-3333-4333-8333-333333333333', 'aaaaaaaa-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Cancelled Review Session', 'حصة المراجعة الملغاة', now() - interval '1 day', 60, 'zoom', 'https://zoom.us/j/9999999999', 'cancelled')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- SECTION 1: Schema Structure & Security Assertions
-- -----------------------------------------------------------------------------
-- Tests 1-7: Tables and enhanced columns
SELECT extensions.has_table('public', 'live_sessions', 'live_sessions table exists');
SELECT extensions.has_table('public', 'attendance', 'attendance table exists');
SELECT extensions.has_column('public', 'live_sessions', 'teacher_id', 'live_sessions has teacher_id column');
SELECT extensions.has_column('public', 'live_sessions', 'lesson_id', 'live_sessions has lesson_id column');
SELECT extensions.has_column('public', 'live_sessions', 'duration_minutes', 'live_sessions has duration_minutes column');
SELECT extensions.has_column('public', 'attendance', 'marked_by', 'attendance has marked_by column');
SELECT extensions.has_column('public', 'attendance', 'updated_at', 'attendance has updated_at column');

-- Tests 8-10: Functions exist
SELECT extensions.has_function('public', 'can_manage_live_session', ARRAY['uuid'], 'can_manage_live_session function exists');
SELECT extensions.has_function('public', 'get_session_meeting_link', ARRAY['uuid'], 'get_session_meeting_link function exists');
SELECT extensions.has_function('public', 'record_session_attendance', ARRAY['uuid', 'jsonb'], 'record_session_attendance function exists');

-- Tests 11-13: SECURITY DEFINER enforcement
SELECT extensions.is_definer('public', 'can_manage_live_session', ARRAY['uuid'], 'can_manage_live_session is SECURITY DEFINER');
SELECT extensions.is_definer('public', 'get_session_meeting_link', ARRAY['uuid'], 'get_session_meeting_link is SECURITY DEFINER');
SELECT extensions.is_definer('public', 'record_session_attendance', ARRAY['uuid', 'jsonb'], 'record_session_attendance is SECURITY DEFINER');

-- -----------------------------------------------------------------------------
-- SECTION 2: Anonymous Restrictions
-- -----------------------------------------------------------------------------
-- Tests 14-15: Anonymous table privileges revoked
SELECT extensions.is(
  has_table_privilege('anon', 'public.live_sessions', 'SELECT'),
  false,
  'anon does not have SELECT privilege on public.live_sessions'
);

SELECT extensions.is(
  has_table_privilege('anon', 'public.attendance', 'SELECT'),
  false,
  'anon does not have SELECT privilege on public.attendance'
);

-- Tests 16-19: Statements executed by anon are rejected with SQLSTATE 42501
SET LOCAL ROLE anon;
SELECT extensions.throws_ok(
  $$SELECT count(*) FROM public.live_sessions$$,
  '42501',
  NULL,
  'Anon cannot SELECT from public.live_sessions'
);

SELECT extensions.throws_ok(
  $$SELECT count(*) FROM public.attendance$$,
  '42501',
  NULL,
  'Anon cannot SELECT from public.attendance'
);

SELECT extensions.throws_ok(
  $$SELECT public.get_session_meeting_link('bbbbbbbb-1111-4111-8111-111111111111')$$,
  '42501',
  NULL,
  'Anon cannot execute get_session_meeting_link'
);

SELECT extensions.throws_ok(
  $$SELECT public.record_session_attendance('bbbbbbbb-1111-4111-8111-111111111111', '[]'::jsonb)$$,
  '42501',
  NULL,
  'Anon cannot execute record_session_attendance'
);

-- -----------------------------------------------------------------------------
-- SECTION 3: Teacher Live Sessions RLS & Isolation
-- -----------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

-- Test 20: Teacher owner can insert live session
SELECT extensions.lives_ok(
  $$INSERT INTO public.live_sessions (
      id, group_id, teacher_id, title, start_time, duration_minutes, provider, meeting_url, status
    ) VALUES (
      'bbbbbbbb-4444-4444-8444-111111111111',
      'aaaaaaaa-1111-4111-8111-111111111111',
      '11111111-1111-4111-8111-111111111111',
      'Teacher Inserted Session',
      now() + interval '3 days',
      60,
      'teams',
      'https://teams.microsoft.com/l/meetup-join/1234',
      'scheduled'
    )$$,
  'Teacher owner can insert a live session for their group'
);

-- Test 21: Teacher owner can update live session
SELECT extensions.lives_ok(
  $$UPDATE public.live_sessions
    SET title = 'Updated Title by Owner'
    WHERE id = 'bbbbbbbb-1111-4111-8111-111111111111'$$,
  'Teacher owner can update their live session'
);

-- Switch to other teacher
SELECT set_config('request.jwt.claim.sub', '88888888-8888-4888-8888-888888888888', true);

-- Test 22: Other teacher cannot update owner's session (0 rows modified)
WITH upd AS (
  UPDATE public.live_sessions
  SET title = 'Malicious Hijack'
  WHERE id = 'bbbbbbbb-1111-4111-8111-111111111111'
  RETURNING id
)
SELECT extensions.is(
  (SELECT count(*)::int FROM upd),
  0,
  'Other teacher cannot update sessions belonging to owner teacher'
);

-- Test 23: Other teacher cannot delete owner's session (0 rows deleted)
WITH del AS (
  DELETE FROM public.live_sessions
  WHERE id = 'bbbbbbbb-1111-4111-8111-111111111111'
  RETURNING id
)
SELECT extensions.is(
  (SELECT count(*)::int FROM del),
  0,
  'Other teacher cannot delete sessions belonging to owner teacher'
);

-- Switch to super admin
SELECT set_config('request.jwt.claim.sub', '99999999-9999-4999-8999-999999999999', true);

-- Test 24: Super admin can update any session
SELECT extensions.lives_ok(
  $$UPDATE public.live_sessions
    SET title = 'Super Admin Supervised Title'
    WHERE id = 'bbbbbbbb-1111-4111-8111-111111111111'$$,
  'Super admin can update any live session'
);

-- -----------------------------------------------------------------------------
-- SECTION 4: Student Live Sessions RLS & Read Isolation
-- -----------------------------------------------------------------------------
-- Switch to enrolled student 1 (in Cohort A)
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);

-- Test 25: Enrolled student can view sessions for their assigned cohort A
SELECT extensions.is(
  (SELECT count(*)::int FROM public.live_sessions WHERE id = 'bbbbbbbb-1111-4111-8111-111111111111'),
  1,
  'Enrolled student can SELECT live session belonging to their assigned group'
);

-- Test 26: Enrolled student cannot view sessions for cohort B
SELECT extensions.is(
  (SELECT count(*)::int FROM public.live_sessions WHERE id = 'bbbbbbbb-2222-4222-8222-222222222222'),
  0,
  'Student in Cohort A cannot view sessions belonging to Cohort B'
);

-- Switch to student in cohort B (unassigned to cohort A)
SELECT set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', true);

-- Test 27: Student not in cohort A cannot view session 1
SELECT extensions.is(
  (SELECT count(*)::int FROM public.live_sessions WHERE id = 'bbbbbbbb-1111-4111-8111-111111111111'),
  0,
  'Student outside Cohort A cannot view session 1'
);

-- Switch back to student 1 to test mutations
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);

-- Test 28: Student cannot insert live session
SELECT extensions.throws_ok(
  $$INSERT INTO public.live_sessions (
      group_id, teacher_id, title, start_time, duration_minutes, provider, meeting_url, status
    ) VALUES (
      'aaaaaaaa-1111-4111-8111-111111111111',
      '11111111-1111-4111-8111-111111111111',
      'Student Created Session',
      now(),
      60,
      'zoom',
      'https://zoom.us/test',
      'scheduled'
    )$$,
  '42501',
  NULL,
  'Student cannot insert live session'
);

-- Test 29: Student cannot update live session (0 rows affected)
WITH upd AS (
  UPDATE public.live_sessions
  SET title = 'Hacked by student'
  WHERE id = 'bbbbbbbb-1111-4111-8111-111111111111'
  RETURNING id
)
SELECT extensions.is(
  (SELECT count(*)::int FROM upd),
  0,
  'Student cannot update live session'
);

-- Test 30: Student cannot delete live session (0 rows affected)
WITH del AS (
  DELETE FROM public.live_sessions
  WHERE id = 'bbbbbbbb-1111-4111-8111-111111111111'
  RETURNING id
)
SELECT extensions.is(
  (SELECT count(*)::int FROM del),
  0,
  'Student cannot delete live session'
);

-- -----------------------------------------------------------------------------
-- SECTION 5: Secure Meeting Link Retrieval via RPC
-- -----------------------------------------------------------------------------
-- Test 31: Teacher owner retrieves meeting link
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT extensions.is(
  public.get_session_meeting_link('bbbbbbbb-1111-4111-8111-111111111111'),
  'https://zoom.us/j/1234567890',
  'Teacher owner retrieves meeting link for their session'
);

-- Test 32: Super admin retrieves meeting link
SELECT set_config('request.jwt.claim.sub', '99999999-9999-4999-8999-999999999999', true);
SELECT extensions.is(
  public.get_session_meeting_link('bbbbbbbb-1111-4111-8111-111111111111'),
  'https://zoom.us/j/1234567890',
  'Super admin retrieves meeting link for any session'
);

-- Test 33: Enrolled student retrieves meeting link
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
SELECT extensions.is(
  public.get_session_meeting_link('bbbbbbbb-1111-4111-8111-111111111111'),
  'https://zoom.us/j/1234567890',
  'Enrolled student retrieves meeting link for their cohort session'
);

-- Test 34: Unassigned student throws 42501
SELECT set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', true);
SELECT extensions.throws_ok(
  $$SELECT public.get_session_meeting_link('bbbbbbbb-1111-4111-8111-111111111111')$$,
  '42501',
  'Forbidden: You are not authorized to access this meeting link',
  'Unassigned student is rejected from retrieving meeting link'
);

-- Test 35: Cancelled session returns null for student
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
SELECT extensions.is(
  public.get_session_meeting_link('bbbbbbbb-3333-4333-8333-333333333333'),
  NULL,
  'Student receives NULL meeting link for cancelled session'
);

-- -----------------------------------------------------------------------------
-- SECTION 6: Atomic Attendance Batch RPC & Trigger Validation
-- -----------------------------------------------------------------------------
-- Switch to Teacher Owner
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

-- Test 36: Teacher records attendance for enrolled students
SELECT extensions.lives_ok(
  $$SELECT public.record_session_attendance(
      'bbbbbbbb-1111-4111-8111-111111111111',
      jsonb_build_array(
        jsonb_build_object('student_id', '22222222-2222-4222-8222-222222222222', 'status', 'present', 'notes', 'On time and engaged'),
        jsonb_build_object('student_id', '33333333-3333-4333-8333-333333333333', 'status', 'late', 'notes', 'Joined 10 mins late')
      )
    )$$,
  'Teacher owner can atomically record attendance for enrolled cohort students'
);

-- Test 37-38: Verification that records exist
SELECT extensions.is(
  (SELECT status::text FROM public.attendance WHERE session_id = 'bbbbbbbb-1111-4111-8111-111111111111' AND student_id = '22222222-2222-4222-8222-222222222222'),
  'present',
  'Student 1 status is present'
);

SELECT extensions.is(
  (SELECT status::text FROM public.attendance WHERE session_id = 'bbbbbbbb-1111-4111-8111-111111111111' AND student_id = '33333333-3333-4333-8333-333333333333'),
  'late',
  'Student 2 status is late'
);

-- Test 39-40: Idempotent duplicate update
SELECT extensions.lives_ok(
  $$SELECT public.record_session_attendance(
      'bbbbbbbb-1111-4111-8111-111111111111',
      jsonb_build_array(
        jsonb_build_object('student_id', '22222222-2222-4222-8222-222222222222', 'status', 'excused', 'notes', 'Medical excuse submitted')
      )
    )$$,
  'Teacher owner can idempotently update attendance record via ON CONFLICT'
);

SELECT extensions.is(
  (SELECT status::text FROM public.attendance WHERE session_id = 'bbbbbbbb-1111-4111-8111-111111111111' AND student_id = '22222222-2222-4222-8222-222222222222'),
  'excused',
  'Student 1 status updated to excused'
);

-- Test 41: Other teacher cannot record attendance for owner session
SELECT set_config('request.jwt.claim.sub', '88888888-8888-4888-8888-888888888888', true);
SELECT extensions.throws_ok(
  $$SELECT public.record_session_attendance(
      'bbbbbbbb-1111-4111-8111-111111111111',
      jsonb_build_array(
        jsonb_build_object('student_id', '22222222-2222-4222-8222-222222222222', 'status', 'absent')
      )
    )$$,
  '42501',
  'Forbidden: You do not have permission to manage this session',
  'Other teacher is forbidden from recording attendance on owner session'
);

-- Test 42: Student cannot record attendance via RPC
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
SELECT extensions.throws_ok(
  $$SELECT public.record_session_attendance(
      'bbbbbbbb-1111-4111-8111-111111111111',
      jsonb_build_array(
        jsonb_build_object('student_id', '22222222-2222-4222-8222-222222222222', 'status', 'present')
      )
    )$$,
  '42501',
  'Forbidden: Only teachers and super admins can record attendance',
  'Student cannot execute record_session_attendance'
);

-- Test 43: Trigger rejects non-enrolled student attendance
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT extensions.throws_ok(
  $$INSERT INTO public.attendance (session_id, student_id, status)
    VALUES ('bbbbbbbb-1111-4111-8111-111111111111', '44444444-4444-4444-8444-444444444444', 'present')$$,
  '22000',
  'Student is not enrolled in the group assigned to this live session',
  'Trigger prevents recording attendance for a student not in the session cohort'
);

-- -----------------------------------------------------------------------------
-- SECTION 7: Student Attendance Visibility & Mutation Prevention
-- -----------------------------------------------------------------------------
-- Switch to Student 1
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);

-- Test 44: Student 1 can view their own attendance record
SELECT extensions.is(
  (SELECT count(*)::int FROM public.attendance WHERE student_id = '22222222-2222-4222-8222-222222222222'),
  1,
  'Student 1 can view their own attendance record'
);

-- Test 45: Student 1 cannot view Student 2's attendance record
SELECT extensions.is(
  (SELECT count(*)::int FROM public.attendance WHERE student_id = '33333333-3333-4333-8333-333333333333'),
  0,
  'Student 1 cannot view Student 2 attendance records'
);

-- Test 46: Student cannot directly insert attendance (throws 42501 or 0 rows)
SELECT extensions.throws_ok(
  $$INSERT INTO public.attendance (session_id, student_id, status)
    VALUES ('bbbbbbbb-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'present')$$,
  '42501',
  NULL,
  'Student cannot directly insert attendance'
);

-- Test 47: Student cannot directly update attendance (0 rows affected)
WITH upd AS (
  UPDATE public.attendance
  SET status = 'present'
  WHERE session_id = 'bbbbbbbb-1111-4111-8111-111111111111' AND student_id = '22222222-2222-4222-8222-222222222222'
  RETURNING id
)
SELECT extensions.is(
  (SELECT count(*)::int FROM upd),
  0,
  'Student cannot directly update attendance'
);

-- Finish test transaction
ROLLBACK;
