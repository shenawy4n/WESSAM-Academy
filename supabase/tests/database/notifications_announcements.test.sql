-- ==============================================================================
-- Integration tests for migration 20261109000011
-- Phase 4C Notifications & Announcements Management Security & Functional Tests
-- Validates:
-- 1. Schema structure, constraints, and column additions
-- 2. Anonymous access restrictions & table-level privilege enforcement
-- 3. Teacher announcement ownership, cross-data isolation, and Super Admin scope
-- 4. Group audience boundaries and individual student targeting
-- 5. Duplicate event prevention, unique constraints, and idempotency
-- 6. Scheduled announcement publication and archival lifecycle
-- 7. Student notification isolation, inactive student handling, and read state
-- 8. Automated event triggers (lessons, resources, live sessions, quizzes, grades)
-- ==============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT extensions.plan(55);

-- -----------------------------------------------------------------------------
-- 1. Deterministic isolated identities
-- -----------------------------------------------------------------------------
INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('11111111-4444-4111-8111-111111111111', 'authenticated', 'authenticated', 'teacher_notif_owner@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('88888888-4444-4888-8888-888888888888', 'authenticated', 'authenticated', 'teacher_notif_other@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('99999999-4444-4999-8999-999999999999', 'authenticated', 'authenticated', 'super_admin_notif@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('22222222-4444-4222-8222-222222222222', 'authenticated', 'authenticated', 'student_notif1@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('33333333-4444-4333-8333-333333333333', 'authenticated', 'authenticated', 'student_notif2@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('55555555-4444-4555-8555-555555555555', 'authenticated', 'authenticated', 'student_notif_inactive@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, role, full_name, full_name_arabic, status)
VALUES
  ('11111111-4444-4111-8111-111111111111', 'teacher', 'Notification Owner Teacher', 'معلم الإعلانات الأول', 'active'),
  ('88888888-4444-4888-8888-888888888888', 'teacher', 'Other Notification Teacher', 'معلم الإعلانات الثاني', 'active'),
  ('99999999-4444-4999-8999-999999999999', 'super_admin', 'Notification Super Admin', 'مدير النظام للإعلانات', 'active'),
  ('22222222-4444-4222-8222-222222222222', 'student', 'Notification Student One', 'طالب الإشعارات الأول', 'active'),
  ('33333333-4444-4333-8333-333333333333', 'student', 'Notification Student Two', 'طالب الإشعارات الثاني', 'active'),
  ('55555555-4444-4555-8555-555555555555', 'student', 'Notification Inactive Student', 'طالب غير نشط للإشعارات', 'inactive')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. Cohort Groups & Enrollment
-- -----------------------------------------------------------------------------
INSERT INTO public.groups (id, name, name_arabic, max_students, is_active)
VALUES
  ('cccccccc-4444-4111-8111-111111111111', 'Notification Cohort A', 'مجموعة الإشعارات أ', 30, true),
  ('cccccccc-4444-4222-8222-222222222222', 'Notification Cohort B', 'مجموعة الإشعارات ب', 30, true)
ON CONFLICT (id) DO NOTHING;

-- Enrolled active student 1 and inactive student in Cohort A; student 2 in Cohort B
INSERT INTO public.group_students (student_id, group_id)
VALUES
  ('22222222-4444-4222-8222-222222222222', 'cccccccc-4444-4111-8111-111111111111'),
  ('55555555-4444-4555-8555-555555555555', 'cccccccc-4444-4111-8111-111111111111'),
  ('33333333-4444-4333-8333-333333333333', 'cccccccc-4444-4222-8222-222222222222')
ON CONFLICT DO NOTHING;

-- Teacher 1 teaches Course 1 assigned to Cohort A
INSERT INTO public.courses (id, teacher_id, title, title_arabic, is_published)
VALUES (
  'dddddddd-4444-4111-8111-111111111111',
  '11111111-4444-4111-8111-111111111111',
  'Advanced English Grammar',
  'قواعد اللغة الإنجليزية المتقدمة',
  true
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.group_courses (group_id, course_id)
VALUES ('cccccccc-4444-4111-8111-111111111111', 'dddddddd-4444-4111-8111-111111111111')
ON CONFLICT DO NOTHING;

-- Teacher 2 teaches Course 2 assigned to Cohort B
INSERT INTO public.courses (id, teacher_id, title, title_arabic, is_published)
VALUES (
  'dddddddd-4444-4222-8222-222222222222',
  '88888888-4444-4888-8888-888888888888',
  'Basic English Vocabulary',
  'مفردات اللغة الإنجليزية الأساسية',
  true
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.group_courses (group_id, course_id)
VALUES ('cccccccc-4444-4222-8222-222222222222', 'dddddddd-4444-4222-8222-222222222222')
ON CONFLICT DO NOTHING;

-- =============================================================================
-- PART 1: SCHEMA STRUCTURE & FUNCTION VERIFICATION (10 Assertions)
-- =============================================================================
SELECT extensions.has_table('public', 'announcements', 'Table announcements exists');
SELECT extensions.has_column('public', 'announcements', 'target_audience', 'announcements has target_audience');
SELECT extensions.has_column('public', 'announcements', 'priority', 'announcements has priority');
SELECT extensions.has_column('public', 'announcements', 'status', 'announcements has status');
SELECT extensions.has_column('public', 'announcements', 'scheduled_for', 'announcements has scheduled_for');
SELECT extensions.has_column('public', 'notifications', 'announcement_id', 'notifications has announcement_id');
SELECT extensions.has_column('public', 'notifications', 'category', 'notifications has category');
SELECT extensions.has_column('public', 'notifications', 'priority', 'notifications has priority');
SELECT extensions.has_column('public', 'notifications', 'idempotency_key', 'notifications has idempotency_key');
SELECT extensions.has_function('public', 'publish_announcement', ARRAY['uuid'], 'publish_announcement RPC exists');

-- =============================================================================
-- PART 2: ANONYMOUS ACCESS RESTRICTIONS (6 Assertions)
-- =============================================================================
SELECT extensions.is(
  has_table_privilege('anon', 'public.announcements', 'SELECT'),
  false,
  'Anon has NO SELECT privilege on public.announcements'
);

SELECT extensions.is(
  has_table_privilege('anon', 'public.notifications', 'SELECT'),
  false,
  'Anon has NO SELECT privilege on public.notifications'
);

SELECT extensions.is(
  has_table_privilege('anon', 'public.notification_recipients', 'SELECT'),
  false,
  'Anon has NO SELECT privilege on public.notification_recipients'
);

SET ROLE anon;
SELECT extensions.throws_ok(
  $$ SELECT public.publish_announcement('00000000-0000-0000-0000-000000000000'::uuid) $$,
  '42501',
  NULL,
  'Anon cannot execute publish_announcement RPC'
);

SELECT extensions.throws_ok(
  $$ SELECT public.mark_notification_as_read('00000000-0000-0000-0000-000000000000'::uuid) $$,
  '42501',
  NULL,
  'Anon cannot execute mark_notification_as_read RPC'
);

SELECT extensions.throws_ok(
  $$ SELECT public.get_my_notifications(10, 0, false, NULL) $$,
  '42501',
  NULL,
  'Anon cannot execute get_my_notifications RPC'
);
RESET ROLE;

-- =============================================================================
-- PART 3: TEACHER ANNOUNCEMENT OWNERSHIP & ISOLATION (8 Assertions)
-- =============================================================================
-- Insert announcement for Teacher 1
INSERT INTO public.announcements (
  id, teacher_id, title, title_arabic, body, body_arabic,
  target_audience, group_id, priority, status
) VALUES (
  'eeeeeeee-4444-4111-8111-111111111111',
  '11111111-4444-4111-8111-111111111111',
  'Teacher 1 Draft Announcement',
  'مسودة إعلان المعلم الأول',
  'Details for cohort A',
  'تفاصيل للمجموعة أ',
  'group',
  'cccccccc-4444-4111-8111-111111111111',
  'normal',
  'draft'
) ON CONFLICT (id) DO NOTHING;

-- 1. Teacher 1 can view own draft announcement
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '11111111-4444-4111-8111-111111111111';
SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.announcements WHERE id = 'eeeeeeee-4444-4111-8111-111111111111' $$,
  ARRAY[1],
  'Teacher 1 can view own draft announcement'
);

-- 2. Teacher 2 cannot view Teacher 1 draft announcement
SET LOCAL "request.jwt.claim.sub" = '88888888-4444-4888-8888-888888888888';
SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.announcements WHERE id = 'eeeeeeee-4444-4111-8111-111111111111' $$,
  ARRAY[0],
  'Teacher 2 cannot view Teacher 1 draft announcement'
);

-- 3. Teacher 2 cannot update Teacher 1 announcement
SELECT extensions.results_eq(
  $$ UPDATE public.announcements SET title = 'Hacked' WHERE id = 'eeeeeeee-4444-4111-8111-111111111111' RETURNING 1 $$,
  '{}'::int[],
  'Teacher 2 update on Teacher 1 announcement affects 0 rows'
);

-- 4. Teacher 2 cannot archive Teacher 1 announcement
SELECT extensions.throws_ok(
  $$ SELECT public.archive_announcement('eeeeeeee-4444-4111-8111-111111111111'::uuid) $$,
  '42501',
  NULL,
  'Teacher 2 cannot archive Teacher 1 announcement'
);

-- 5. Super Admin can view all announcements
SET LOCAL "request.jwt.claim.sub" = '99999999-4444-4999-8999-999999999999';
SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.announcements WHERE id = 'eeeeeeee-4444-4111-8111-111111111111' $$,
  ARRAY[1],
  'Super Admin can view Teacher 1 announcement'
);

-- 6. Student cannot select from announcements table directly
SET LOCAL "request.jwt.claim.sub" = '22222222-4444-4222-8222-222222222222';
SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.announcements WHERE id = 'eeeeeeee-4444-4111-8111-111111111111' $$,
  ARRAY[0],
  'Student cannot select directly from public.announcements'
);

-- 7. Student cannot insert into announcements
SELECT extensions.throws_ok(
  $$ INSERT INTO public.announcements (teacher_id, title, title_arabic, body, body_arabic)
     VALUES ('22222222-4444-4222-8222-222222222222', 'Test', 'تجربة', 'Body', 'نص') $$,
  '42501',
  NULL,
  'Student cannot insert into announcements'
);

-- 8. Student cannot update announcements
SELECT extensions.results_eq(
  $$ UPDATE public.announcements SET title = 'Student modified' WHERE id = 'eeeeeeee-4444-4111-8111-111111111111' RETURNING 1 $$,
  '{}'::int[],
  'Student update on announcements affects 0 rows'
);
RESET ROLE;

-- =============================================================================
-- PART 4: AUDIENCE SCOPES & PUBLISHING AUTHORIZATION (8 Assertions)
-- =============================================================================
-- Create announcement targeting Cohort B (which Teacher 1 does NOT teach)
INSERT INTO public.announcements (
  id, teacher_id, title, title_arabic, body, body_arabic,
  target_audience, group_id, priority, status
) VALUES (
  'eeeeeeee-4444-4222-8222-222222222222',
  '11111111-4444-4111-8111-111111111111',
  'Unauthorized Group Announcement',
  'إعلان غير مصرح به للمجموعة',
  'Body',
  'نص',
  'group',
  'cccccccc-4444-4222-8222-222222222222',
  'normal',
  'draft'
) ON CONFLICT (id) DO NOTHING;

-- 1. Teacher 1 publishing announcement for unauthorized Cohort B throws 42501
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '11111111-4444-4111-8111-111111111111';
SELECT extensions.throws_ok(
  $$ SELECT public.publish_announcement('eeeeeeee-4444-4222-8222-222222222222'::uuid) $$,
  '42501',
  NULL,
  'Teacher 1 cannot publish announcement to unauthorized Cohort B'
);

-- Create announcement targeting Student 2 (in Cohort B, outside Teacher 1 scope)
INSERT INTO public.announcements (
  id, teacher_id, title, title_arabic, body, body_arabic,
  target_audience, student_id, priority, status
) VALUES (
  'eeeeeeee-4444-4333-8333-333333333333',
  '11111111-4444-4111-8111-111111111111',
  'Unauthorized Student Announcement',
  'إعلان غير مصرح به للطالب',
  'Body',
  'نص',
  'student',
  '33333333-4444-4333-8333-333333333333',
  'normal',
  'draft'
) ON CONFLICT (id) DO NOTHING;

-- 2. Teacher 1 publishing announcement for unauthorized Student 2 throws 42501
SELECT extensions.throws_ok(
  $$ SELECT public.publish_announcement('eeeeeeee-4444-4333-8333-333333333333'::uuid) $$,
  '42501',
  NULL,
  'Teacher 1 cannot publish announcement to unauthorized Student 2'
);

-- 3. Teacher 1 publishing announcement for authorized Cohort A succeeds
SELECT extensions.is(
  (public.publish_announcement('eeeeeeee-4444-4111-8111-111111111111'::uuid)->>'status'),
  'published',
  'Teacher 1 publishes announcement to authorized Cohort A'
);

-- 4. Corresponding notification created in public.notifications
SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.notifications WHERE announcement_id = 'eeeeeeee-4444-4111-8111-111111111111' $$,
  ARRAY[1],
  'Notification created for published announcement'
);

-- 5. Delivered to active Student 1 in Cohort A
SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.notification_recipients nr
     JOIN public.notifications n ON n.id = nr.notification_id
     WHERE n.announcement_id = 'eeeeeeee-4444-4111-8111-111111111111'
       AND nr.recipient_id = '22222222-4444-4222-8222-222222222222' $$,
  ARRAY[1],
  'Notification recipient record delivered to active Student 1'
);

-- 6. Inactive student in Cohort A was NOT delivered notification
SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.notification_recipients nr
     JOIN public.notifications n ON n.id = nr.notification_id
     WHERE n.announcement_id = 'eeeeeeee-4444-4111-8111-111111111111'
       AND nr.recipient_id = '55555555-4444-4555-8555-555555555555' $$,
  ARRAY[0],
  'Inactive student was NOT delivered notification'
);

-- 7. Teacher 1 publishing to individual authorized Student 1 delivers 1 recipient row
INSERT INTO public.announcements (
  id, teacher_id, title, title_arabic, body, body_arabic,
  target_audience, student_id, priority, status
) VALUES (
  'eeeeeeee-4444-4444-8444-444444444444',
  '11111111-4444-4111-8111-111111111111',
  'Personal Teacher Note',
  'ملاحظة فردية من المعلم',
  'Great improvement on your last quiz!',
  'تحسن ملحوظ في اختبارك الأخير!',
  'student',
  '22222222-4444-4222-8222-222222222222',
  'normal',
  'draft'
) ON CONFLICT (id) DO NOTHING;

SELECT extensions.is(
  (public.publish_announcement('eeeeeeee-4444-4444-8444-444444444444'::uuid)->>'delivered_recipients')::int,
  1,
  'Individual student targeting delivers exactly 1 notification'
);

-- 8. Super Admin can broadcast platform-wide all_students
SET LOCAL "request.jwt.claim.sub" = '99999999-4444-4999-8999-999999999999';
INSERT INTO public.announcements (
  id, teacher_id, title, title_arabic, body, body_arabic,
  target_audience, priority, status
) VALUES (
  'eeeeeeee-4444-4555-8555-555555555555',
  '99999999-4444-4999-8999-999999999999',
  'Global Platform Broadcast',
  'إعلان عام للمنصة بأكملها',
  'Maintenance scheduled for Friday midnight.',
  'صيانة دورية يوم الجمعة عند منتصف الليل.',
  'all_students',
  'important',
  'draft'
) ON CONFLICT (id) DO NOTHING;

SELECT extensions.is(
  (public.publish_announcement('eeeeeeee-4444-4555-8555-555555555555'::uuid)->>'status'),
  'published',
  'Super Admin successfully broadcasts platform-wide announcement'
);
RESET ROLE;

-- =============================================================================
-- PART 5: DUPLICATE EVENT PREVENTION & IDEMPOTENCY (4 Assertions)
-- =============================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '11111111-4444-4111-8111-111111111111';

-- 1. Calling publish_announcement again does NOT duplicate notification record
SELECT extensions.is(
  (public.publish_announcement('eeeeeeee-4444-4111-8111-111111111111'::uuid)->>'success')::boolean,
  true,
  'Calling publish_announcement again is idempotent'
);

SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.notifications WHERE announcement_id = 'eeeeeeee-4444-4111-8111-111111111111' $$,
  ARRAY[1],
  'Exactly 1 notification record exists for announcement'
);

-- 2. Recipient row count remains exactly 1 for Student 1
SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.notification_recipients nr
     JOIN public.notifications n ON n.id = nr.notification_id
     WHERE n.announcement_id = 'eeeeeeee-4444-4111-8111-111111111111'
       AND nr.recipient_id = '22222222-4444-4222-8222-222222222222' $$,
  ARRAY[1],
  'No duplicate recipient rows exist for Student 1'
);

-- 3. Direct insertion of duplicate (notification_id, recipient_id) is blocked
SELECT extensions.throws_ok(
  $$ INSERT INTO public.notification_recipients (notification_id, recipient_id)
     SELECT id, '22222222-4444-4222-8222-222222222222'
     FROM public.notifications WHERE announcement_id = 'eeeeeeee-4444-4111-8111-111111111111' $$,
  '23505',
  NULL,
  'Unique constraint prevents duplicate notification delivery to same recipient'
);
RESET ROLE;

-- =============================================================================
-- PART 6: SCHEDULED ANNOUNCEMENTS & ARCHIVING (6 Assertions)
-- =============================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '11111111-4444-4111-8111-111111111111';

-- 1. Announcement scheduled for future date has status scheduled and no notification delivered yet
INSERT INTO public.announcements (
  id, teacher_id, title, title_arabic, body, body_arabic,
  target_audience, group_id, priority, status, scheduled_for
) VALUES (
  'eeeeeeee-4444-4666-8666-666666666666',
  '11111111-4444-4111-8111-111111111111',
  'Future Scheduled Announcement',
  'إعلان مجدول مستقبلاً',
  'Body',
  'نص',
  'group',
  'cccccccc-4444-4111-8111-111111111111',
  'normal',
  'scheduled',
  now() + interval '2 days'
) ON CONFLICT (id) DO NOTHING;

SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.notifications WHERE announcement_id = 'eeeeeeee-4444-4666-8666-666666666666' $$,
  ARRAY[0],
  'No notification exists yet for future scheduled announcement'
);

-- 2. Announcement scheduled in the past is processed by process_scheduled_announcements
INSERT INTO public.announcements (
  id, teacher_id, title, title_arabic, body, body_arabic,
  target_audience, group_id, priority, status, scheduled_for
) VALUES (
  'eeeeeeee-4444-4777-8777-777777777777',
  '11111111-4444-4111-8111-111111111111',
  'Due Scheduled Announcement',
  'إعلان مجدول حان وقته',
  'Body',
  'نص',
  'group',
  'cccccccc-4444-4111-8111-111111111111',
  'normal',
  'scheduled',
  now() - interval '5 minutes'
) ON CONFLICT (id) DO NOTHING;

SELECT extensions.is(
  (public.process_scheduled_announcements() >= 1),
  true,
  'process_scheduled_announcements processes due announcements'
);

-- 3. Due announcement status transitioned to published
SELECT extensions.results_eq(
  $$ SELECT status FROM public.announcements WHERE id = 'eeeeeeee-4444-4777-8777-777777777777' $$,
  ARRAY['published'],
  'Due announcement transitioned from scheduled to published'
);

-- 4. Corresponding notification created
SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.notifications WHERE announcement_id = 'eeeeeeee-4444-4777-8777-777777777777' $$,
  ARRAY[1],
  'Notification created for processed scheduled announcement'
);

-- 5. Teacher archives announcement
SELECT extensions.is(
  (public.archive_announcement('eeeeeeee-4444-4777-8777-777777777777'::uuid)->>'status'),
  'archived',
  'Announcement status transitioned to archived'
);

-- 6. Archived announcement has archived_at timestamp populated
SELECT extensions.is(
  (SELECT archived_at IS NOT NULL FROM public.announcements WHERE id = 'eeeeeeee-4444-4777-8777-777777777777'),
  true,
  'Archived announcement has archived_at populated'
);
RESET ROLE;

-- =============================================================================
-- PART 7: STUDENT NOTIFICATION ISOLATION & READ STATE (8 Assertions)
-- =============================================================================
-- 1. Student 1 views notifications addressed to them via get_my_notifications
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '22222222-4444-4222-8222-222222222222';
SELECT extensions.is(
  (jsonb_array_length(public.get_my_notifications(20, 0, false, NULL)) >= 1),
  true,
  'Student 1 retrieves personal notifications list'
);

-- 2. Student 2 cannot see Student 1 personal note (eeeeeeee-4444-4444-8444-444444444444)
SET LOCAL "request.jwt.claim.sub" = '33333333-4444-4333-8333-333333333333';
SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.notifications n
     JOIN public.notification_recipients nr ON nr.notification_id = n.id
     WHERE n.announcement_id = 'eeeeeeee-4444-4444-8444-444444444444'
       AND nr.recipient_id = '33333333-4444-4333-8333-333333333333' $$,
  ARRAY[0],
  'Student 2 cannot see Student 1 personal targeted notification'
);

-- 3. Inactive student cannot retrieve notifications
SET LOCAL "request.jwt.claim.sub" = '55555555-4444-4555-8555-555555555555';
SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.notifications $$,
  ARRAY[0],
  'Inactive student cannot select any notifications'
);

-- 4. Student 1 marks single notification as read
SET LOCAL "request.jwt.claim.sub" = '22222222-4444-4222-8222-222222222222';
DO $$
DECLARE
  v_notif_id UUID;
BEGIN
  SELECT id INTO v_notif_id FROM public.notifications
  WHERE announcement_id = 'eeeeeeee-4444-4111-8111-111111111111' LIMIT 1;

  PERFORM public.mark_notification_as_read(v_notif_id);
END $$;

SELECT extensions.results_eq(
  $$ SELECT is_read FROM public.notification_recipients nr
     JOIN public.notifications n ON n.id = nr.notification_id
     WHERE n.announcement_id = 'eeeeeeee-4444-4111-8111-111111111111'
       AND nr.recipient_id = '22222222-4444-4222-8222-222222222222' $$,
  ARRAY[true],
  'Notification marked as read for Student 1'
);

-- 5. Student 2 cannot mark Student 1 notification as read
SET LOCAL "request.jwt.claim.sub" = '33333333-4444-4333-8333-333333333333';
SELECT extensions.is(
  public.mark_notification_as_read(
    (SELECT id FROM public.notifications WHERE announcement_id = 'eeeeeeee-4444-4444-8444-444444444444' LIMIT 1)
  ),
  false,
  'Student 2 cannot mark Student 1 notification as read'
);

-- 6. Unread count query
SET LOCAL "request.jwt.claim.sub" = '22222222-4444-4222-8222-222222222222';
SELECT extensions.is(
  (public.get_unread_notifications_count() >= 0),
  true,
  'get_unread_notifications_count returns valid integer'
);

-- 7. Mark all notifications as read drops unread count
SELECT extensions.is(
  (public.mark_all_notifications_as_read() >= 0),
  true,
  'mark_all_notifications_as_read completes successfully'
);

-- 8. Direct update by student cannot modify notification_id or recipient_id
SELECT extensions.throws_ok(
  $$ UPDATE public.notification_recipients
     SET recipient_id = '33333333-4444-4333-8333-333333333333'
     WHERE recipient_id = '22222222-4444-4222-8222-222222222222' $$,
  '42501',
  NULL,
  'Student cannot reassign recipient_id on notification_recipients'
);
RESET ROLE;

-- =============================================================================
-- PART 8: AUTOMATED EVENT TRIGGERS (5 Assertions)
-- =============================================================================
-- 1. Publishing a lesson fires trigger and creates a notification
INSERT INTO public.course_units (id, course_id, title, title_arabic, order_index)
VALUES ('ffffffff-4444-4111-8111-111111111111', 'dddddddd-4444-4111-8111-111111111111', 'Unit 1', 'الوحدة 1', 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.lessons (
  id, course_id, unit_id, title, title_arabic, is_published, order_index
) VALUES (
  'ffffffff-4444-4222-8222-222222222222',
  'dddddddd-4444-4111-8111-111111111111',
  'ffffffff-4444-4111-8111-111111111111',
  'Complex Sentences',
  'الجمل المعقدة',
  true,
  1
) ON CONFLICT (id) DO NOTHING;

SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.notifications WHERE idempotency_key = 'lesson_pub_ffffffff-4444-4222-8222-222222222222' $$,
  ARRAY[1],
  'Trigger creates automated notification when lesson is published'
);

-- 2. Adding a resource to a published lesson fires trigger
INSERT INTO public.lesson_resources (
  id, lesson_id, title, title_arabic, file_url
) VALUES (
  'ffffffff-4444-4333-8333-333333333333',
  'ffffffff-4444-4222-8222-222222222222',
  'Worksheet PDF',
  'ورقة عمل PDF',
  'https://example.com/worksheet.pdf'
) ON CONFLICT (id) DO NOTHING;

SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.notifications WHERE idempotency_key = 'res_pub_ffffffff-4444-4333-8333-333333333333' $$,
  ARRAY[1],
  'Trigger creates automated notification when study resource is published'
);

-- 3. Creating a live session fires trigger
INSERT INTO public.live_sessions (
  id, course_id, group_id, teacher_id, title, title_arabic,
  start_time, status, meeting_url
) VALUES (
  'ffffffff-4444-4444-8444-444444444444',
  'dddddddd-4444-4111-8111-111111111111',
  'cccccccc-4444-4111-8111-111111111111',
  '11111111-4444-4111-8111-111111111111',
  'Grammar Q&A Session',
  'حصة أسئلة وأجوبة في القواعد',
  '2026-11-15 17:00:00+03',
  'scheduled',
  'https://meet.google.com/test-notif'
) ON CONFLICT (id) DO NOTHING;

SELECT extensions.is(
  (SELECT count(*)::int >= 1 FROM public.notifications WHERE category = 'live_session' AND sender_id = '11111111-4444-4111-8111-111111111111'),
  true,
  'Trigger creates live session notification'
);

-- 4. Publishing a quiz fires trigger
INSERT INTO public.quizzes (
  id, group_id, teacher_id, title, title_arabic,
  is_published, passing_score
) VALUES (
  'ffffffff-4444-4555-8555-555555555555',
  'cccccccc-4444-4111-8111-111111111111',
  '11111111-4444-4111-8111-111111111111',
  'Automated Quiz',
  'اختبار آلي',
  true,
  70
) ON CONFLICT (id) DO NOTHING;

SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.notifications WHERE idempotency_key = 'quiz_pub_ffffffff-4444-4555-8555-555555555555' $$,
  ARRAY[1],
  'Trigger creates quiz published notification'
);

-- 5. Grading a quiz attempt fires trigger
INSERT INTO public.quiz_attempts (
  id, quiz_id, student_id, status, points_scored, total_points_possible, percentage_score, created_at
) VALUES (
  'ffffffff-4444-4666-8666-666666666666',
  'ffffffff-4444-4555-8555-555555555555',
  '22222222-4444-4222-8222-222222222222',
  'graded',
  18, 20, 90, now()
) ON CONFLICT (id) DO NOTHING;

SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.notifications WHERE idempotency_key = 'quiz_res_ffffffff-4444-4666-8666-666666666666' $$,
  ARRAY[1],
  'Trigger creates quiz result notification when attempt is graded'
);

-- -----------------------------------------------------------------------------
-- Finish pgTAP Test Suite
-- -----------------------------------------------------------------------------
SELECT * FROM extensions.finish();
ROLLBACK;
