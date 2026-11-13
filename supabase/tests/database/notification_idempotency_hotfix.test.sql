-- ==============================================================================
-- Regression tests for migration 20261113000016
-- Hotfix: Quiz Creation & Notification ON CONFLICT (idempotency_key) Resolution
--
-- Sections Covered:
--   0. Index structure validation (full unique, non-partial index)
--   A. Published quiz creation (quiz, notification, active recipients, exclusions)
--   B. Announcement publishing (status update, notification, intended recipients)
--   C. Idempotency (re-publishing announcements & quizzes without duplicates)
--   D. Automated triggers (lesson, resource, live session, quiz, quiz result, rollback atomicity)
--   E. Negative & security tests (unauthorized publish/quiz ops, RLS isolation, unique violations, NULL keys)
-- ==============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT extensions.plan(51);

-- -----------------------------------------------------------------------------
-- Isolated Deterministic Test Fixtures
-- -----------------------------------------------------------------------------
INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('10101010-1111-4111-8111-000000000001', 'authenticated', 'authenticated', 'hotfix_teacher_owner@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('10101010-1111-4111-8111-000000000002', 'authenticated', 'authenticated', 'hotfix_teacher_other@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('10101010-1111-4111-8111-000000000003', 'authenticated', 'authenticated', 'hotfix_student_a1@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('10101010-1111-4111-8111-000000000004', 'authenticated', 'authenticated', 'hotfix_student_a2@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('10101010-1111-4111-8111-000000000005', 'authenticated', 'authenticated', 'hotfix_student_inactive@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('10101010-1111-4111-8111-000000000006', 'authenticated', 'authenticated', 'hotfix_student_b1@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, role, full_name, full_name_arabic, status)
VALUES
  ('10101010-1111-4111-8111-000000000001', 'teacher', 'Hotfix Owner Teacher', 'معلم الاختبارات', 'active'),
  ('10101010-1111-4111-8111-000000000002', 'teacher', 'Hotfix Other Teacher', 'معلم آخر', 'active'),
  ('10101010-1111-4111-8111-000000000003', 'student', 'Hotfix Active Student A1', 'طالب نشط أ1', 'active'),
  ('10101010-1111-4111-8111-000000000004', 'student', 'Hotfix Active Student A2', 'طالب نشط أ2', 'active'),
  ('10101010-1111-4111-8111-000000000005', 'student', 'Hotfix Inactive Student A3', 'طالب غير نشط أ3', 'inactive'),
  ('10101010-1111-4111-8111-000000000006', 'student', 'Hotfix Active Student B1', 'طالب نشط ب1', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.groups (id, name, name_arabic, max_students, is_active)
VALUES
  ('20202020-1111-4111-8111-000000000001', 'Hotfix Group A', 'مجموعة الاختبار أ', 30, true),
  ('20202020-1111-4111-8111-000000000002', 'Hotfix Group B', 'مجموعة الاختبار ب', 30, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.group_students (student_id, group_id)
VALUES
  ('10101010-1111-4111-8111-000000000003', '20202020-1111-4111-8111-000000000001'),
  ('10101010-1111-4111-8111-000000000004', '20202020-1111-4111-8111-000000000001'),
  ('10101010-1111-4111-8111-000000000005', '20202020-1111-4111-8111-000000000001'),
  ('10101010-1111-4111-8111-000000000006', '20202020-1111-4111-8111-000000000002')
ON CONFLICT DO NOTHING;

INSERT INTO public.courses (id, teacher_id, title, title_arabic, is_published)
VALUES
  ('30303030-1111-4111-8111-000000000001', '10101010-1111-4111-8111-000000000001', 'Hotfix Course A', 'مساق أ', true),
  ('30303030-1111-4111-8111-000000000002', '10101010-1111-4111-8111-000000000002', 'Hotfix Course B', 'مساق ب', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.group_courses (group_id, course_id)
VALUES
  ('20202020-1111-4111-8111-000000000001', '30303030-1111-4111-8111-000000000001'),
  ('20202020-1111-4111-8111-000000000002', '30303030-1111-4111-8111-000000000002')
ON CONFLICT DO NOTHING;

INSERT INTO public.course_units (id, course_id, title, title_arabic, order_index)
VALUES
  ('31313131-1111-4111-8111-000000000001', '30303030-1111-4111-8111-000000000001', 'Hotfix Unit 1', 'الوحدة 1', 1)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- SECTION 0: INDEX CONTRACT VERIFICATION (3 Assertions)
-- =============================================================================
-- 1. idx_notifications_idempotency_key exists and is unique
SELECT extensions.is(
  (
    SELECT i.indisunique
    FROM pg_index i
    JOIN pg_class idx ON idx.oid = i.indexrelid
    JOIN pg_class tbl ON tbl.oid = i.indrelid
    JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
    WHERE ns.nspname = 'public'
      AND tbl.relname = 'notifications'
      AND idx.relname = 'idx_notifications_idempotency_key'
  ),
  true,
  '0.1 idx_notifications_idempotency_key exists as a unique index'
);

-- 2. idx_notifications_idempotency_key is non-partial (indpred IS NULL)
SELECT extensions.is(
  (
    SELECT (i.indpred IS NULL)
    FROM pg_index i
    JOIN pg_class idx ON idx.oid = i.indexrelid
    JOIN pg_class tbl ON tbl.oid = i.indrelid
    JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
    WHERE ns.nspname = 'public'
      AND tbl.relname = 'notifications'
      AND idx.relname = 'idx_notifications_idempotency_key'
  ),
  true,
  '0.2 idx_notifications_idempotency_key is a full (non-partial) unique index'
);

-- 3. idx_notifications_idempotency_key targets (idempotency_key)
SELECT extensions.is(
  (
    SELECT pg_get_indexdef(idx.oid) ILIKE '%(idempotency_key)%'
    FROM pg_class idx
    JOIN pg_namespace ns ON ns.oid = idx.relnamespace
    WHERE ns.nspname = 'public'
      AND idx.relname = 'idx_notifications_idempotency_key'
  ),
  true,
  '0.3 idx_notifications_idempotency_key targets idempotency_key'
);

-- =============================================================================
-- SECTION A: PUBLISHED QUIZ CREATION (10 Assertions)
-- =============================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"10101010-1111-4111-8111-000000000001","role":"authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '10101010-1111-4111-8111-000000000001';

-- 4. Creating a published quiz succeeds without 42P10 ON CONFLICT failure
SELECT extensions.lives_ok(
  $$
    INSERT INTO public.quizzes (
      id, teacher_id, group_id, course_id, title, title_arabic,
      duration_minutes, passing_score, max_attempts, total_points, is_published, is_archived
    ) VALUES (
      '40404040-1111-4111-8111-000000000001',
      '10101010-1111-4111-8111-000000000001',
      '20202020-1111-4111-8111-000000000001',
      '30303030-1111-4111-8111-000000000001',
      'Published Quiz Direct',
      'اختبار منشور مباشرة',
      30, 60, 2, 100, true, false
    );
  $$,
  'A.1 Teacher can insert a published quiz cleanly'
);

-- 5. Quiz row exists and is published
SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.quizzes WHERE id = '40404040-1111-4111-8111-000000000001' AND is_published = true $$,
  ARRAY[1],
  'A.2 Published quiz row persisted in public.quizzes'
);

RESET ROLE;

-- 6. Exactly 1 notification created for the published quiz
SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.notifications WHERE idempotency_key = 'quiz_pub_40404040-1111-4111-8111-000000000001' $$,
  ARRAY[1],
  'A.3 Exactly 1 notification created for published quiz'
);

-- 7. Active eligible Student A1 receives recipient row
SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.notification_recipients nr
     JOIN public.notifications n ON n.id = nr.notification_id
     WHERE n.idempotency_key = 'quiz_pub_40404040-1111-4111-8111-000000000001'
       AND nr.recipient_id = '10101010-1111-4111-8111-000000000003' $$,
  ARRAY[1],
  'A.4 Active Student A1 receives quiz notification'
);

-- 8. Active eligible Student A2 receives recipient row
SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.notification_recipients nr
     JOIN public.notifications n ON n.id = nr.notification_id
     WHERE n.idempotency_key = 'quiz_pub_40404040-1111-4111-8111-000000000001'
       AND nr.recipient_id = '10101010-1111-4111-8111-000000000004' $$,
  ARRAY[1],
  'A.5 Active Student A2 receives quiz notification'
);

-- 9. Inactive student in Group A is excluded
SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.notification_recipients nr
     JOIN public.notifications n ON n.id = nr.notification_id
     WHERE n.idempotency_key = 'quiz_pub_40404040-1111-4111-8111-000000000001'
       AND nr.recipient_id = '10101010-1111-4111-8111-000000000005' $$,
  ARRAY[0],
  'A.6 Inactive student in target group does NOT receive quiz notification'
);

-- 10. Active student in unrelated Group B is excluded
SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.notification_recipients nr
     JOIN public.notifications n ON n.id = nr.notification_id
     WHERE n.idempotency_key = 'quiz_pub_40404040-1111-4111-8111-000000000001'
       AND nr.recipient_id = '10101010-1111-4111-8111-000000000006' $$,
  ARRAY[0],
  'A.7 Student in unrelated Group B does NOT receive quiz notification'
);

-- 11. Draft quiz creates 0 notifications initially
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"10101010-1111-4111-8111-000000000001","role":"authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '10101010-1111-4111-8111-000000000001';

INSERT INTO public.quizzes (
  id, teacher_id, group_id, title, title_arabic,
  duration_minutes, passing_score, max_attempts, total_points, is_published, is_archived
) VALUES (
  '40404040-1111-4111-8111-000000000002',
  '10101010-1111-4111-8111-000000000001',
  '20202020-1111-4111-8111-000000000001',
  'Draft Quiz Then Published',
  'مسودة اختبار ثم نشر',
  20, 50, 1, 50, false, false
);
RESET ROLE;

SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.notifications WHERE idempotency_key = 'quiz_pub_40404040-1111-4111-8111-000000000002' $$,
  ARRAY[0],
  'A.8 Draft quiz creates zero notifications prior to publish'
);

-- 12. Updating draft quiz to published triggers 1 notification and 2 active recipients
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"10101010-1111-4111-8111-000000000001","role":"authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '10101010-1111-4111-8111-000000000001';

UPDATE public.quizzes
SET is_published = true
WHERE id = '40404040-1111-4111-8111-000000000002';
RESET ROLE;

SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.notification_recipients nr
     JOIN public.notifications n ON n.id = nr.notification_id
     WHERE n.idempotency_key = 'quiz_pub_40404040-1111-4111-8111-000000000002' $$,
  ARRAY[2],
  'A.9 Publishing draft quiz delivers notifications to 2 active eligible students only'
);

-- 13. Course-targeted published quiz (group_id IS NULL) delivers via group_courses
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"10101010-1111-4111-8111-000000000001","role":"authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '10101010-1111-4111-8111-000000000001';

INSERT INTO public.quizzes (
  id, teacher_id, group_id, course_id, title, title_arabic,
  duration_minutes, passing_score, max_attempts, total_points, is_published, is_archived
) VALUES (
  '40404040-1111-4111-8111-000000000003',
  '10101010-1111-4111-8111-000000000001',
  NULL,
  '30303030-1111-4111-8111-000000000001',
  'Course Scope Published Quiz',
  'اختبار على مستوى المساق',
  25, 60, 1, 50, true, false
);
RESET ROLE;

SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.notification_recipients nr
     JOIN public.notifications n ON n.id = nr.notification_id
     WHERE n.idempotency_key = 'quiz_pub_40404040-1111-4111-8111-000000000003' $$,
  ARRAY[2],
  'A.10 Course-level published quiz delivers to active course-enrolled students only'
);

-- =============================================================================
-- SECTION B: ANNOUNCEMENT PUBLISHING (7 Assertions)
-- =============================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"10101010-1111-4111-8111-000000000001","role":"authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '10101010-1111-4111-8111-000000000001';

INSERT INTO public.announcements (
  id, teacher_id, title, title_arabic, body, body_arabic,
  target_audience, group_id, priority, status
) VALUES (
  '50505050-1111-4111-8111-000000000001',
  '10101010-1111-4111-8111-000000000001',
  'Group A Schedule Update',
  'تحديث جدول المجموعة أ',
  'Class starts 15 minutes earlier tomorrow.',
  'تبدأ الحصة أبكر بـ 15 دقيقة غداً.',
  'group',
  '20202020-1111-4111-8111-000000000001',
  'important',
  'draft'
);

-- 14. publish_announcement succeeds for authorized group announcement
SELECT extensions.is(
  (public.publish_announcement('50505050-1111-4111-8111-000000000001'::uuid)->>'status'),
  'published',
  'B.1 publish_announcement succeeds and returns published status'
);

-- 15. Announcement row status updated to published with published_at timestamp
SELECT extensions.is(
  (SELECT status = 'published' AND published_at IS NOT NULL FROM public.announcements WHERE id = '50505050-1111-4111-8111-000000000001'),
  true,
  'B.2 Announcement record status is published and published_at is set'
);

RESET ROLE;

-- 16. Exactly 1 notification created for published announcement
SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.notifications WHERE idempotency_key = 'announcement_pub_50505050-1111-4111-8111-000000000001' $$,
  ARRAY[1],
  'B.3 Exactly 1 notification created for published announcement'
);

-- 17. Intended active Group A students (A1 and A2) received recipient rows
SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.notification_recipients nr
     JOIN public.notifications n ON n.id = nr.notification_id
     WHERE n.idempotency_key = 'announcement_pub_50505050-1111-4111-8111-000000000001'
       AND nr.recipient_id IN ('10101010-1111-4111-8111-000000000003', '10101010-1111-4111-8111-000000000004') $$,
  ARRAY[2],
  'B.4 Active Group A recipients received announcement notification'
);

-- 18. Inactive and out-of-group students did NOT receive announcement notification
SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.notification_recipients nr
     JOIN public.notifications n ON n.id = nr.notification_id
     WHERE n.idempotency_key = 'announcement_pub_50505050-1111-4111-8111-000000000001'
       AND nr.recipient_id IN ('10101010-1111-4111-8111-000000000005', '10101010-1111-4111-8111-000000000006') $$,
  ARRAY[0],
  'B.5 Inactive and Group B students excluded from Group A announcement'
);

-- 19. Individual student announcement delivers to exactly 1 intended active student
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"10101010-1111-4111-8111-000000000001","role":"authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '10101010-1111-4111-8111-000000000001';

INSERT INTO public.announcements (
  id, teacher_id, title, title_arabic, body, body_arabic,
  target_audience, student_id, priority, status
) VALUES (
  '50505050-1111-4111-8111-000000000002',
  '10101010-1111-4111-8111-000000000001',
  'Personal Feedback',
  'ملاحظة شخصية',
  'Keep up the strong work.',
  'استمر في الأداء المتميز.',
  'student',
  '10101010-1111-4111-8111-000000000003',
  'normal',
  'draft'
);

SELECT extensions.is(
  (public.publish_announcement('50505050-1111-4111-8111-000000000002'::uuid)->>'delivered_recipients')::int,
  1,
  'B.6 Individual student announcement delivers to exactly 1 student'
);

RESET ROLE;

-- 20. Verify only Student A1 received personal announcement
SELECT extensions.results_eq(
  $$ SELECT nr.recipient_id::text FROM public.notification_recipients nr
     JOIN public.notifications n ON n.id = nr.notification_id
     WHERE n.idempotency_key = 'announcement_pub_50505050-1111-4111-8111-000000000002' $$,
  ARRAY['10101010-1111-4111-8111-000000000003'],
  'B.7 Personal announcement recipient matches target student only'
);

-- =============================================================================
-- SECTION C: IDEMPOTENCY (6 Assertions)
-- =============================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"10101010-1111-4111-8111-000000000001","role":"authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '10101010-1111-4111-8111-000000000001';

-- Update announcement title and re-publish same announcement
UPDATE public.announcements
SET title = 'Group A Schedule Update (Revised)'
WHERE id = '50505050-1111-4111-8111-000000000001';

-- 21. Re-publishing announcement succeeds and inserts 0 duplicate recipients
SELECT extensions.is(
  (public.publish_announcement('50505050-1111-4111-8111-000000000001'::uuid)->>'delivered_recipients')::int,
  0,
  'C.1 Re-publishing announcement is idempotent with 0 duplicate recipient inserts'
);

RESET ROLE;

-- 22. Notification count remains exactly 1
SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.notifications WHERE idempotency_key = 'announcement_pub_50505050-1111-4111-8111-000000000001' $$,
  ARRAY[1],
  'C.2 Re-publishing announcement keeps exactly 1 notification row'
);

-- 23. Existing notification row was updated in-place on conflict
SELECT extensions.results_eq(
  $$ SELECT title FROM public.notifications WHERE idempotency_key = 'announcement_pub_50505050-1111-4111-8111-000000000001' $$,
  ARRAY['Group A Schedule Update (Revised)'],
  'C.3 Re-publishing announcement updates existing notification via ON CONFLICT DO UPDATE'
);

-- 24. Recipient row count for announcement remains exactly 2
SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.notification_recipients nr
     JOIN public.notifications n ON n.id = nr.notification_id
     WHERE n.idempotency_key = 'announcement_pub_50505050-1111-4111-8111-000000000001' $$,
  ARRAY[2],
  'C.4 Recipient count remains unchanged after re-publishing announcement'
);

-- 25. Unpublishing and re-publishing a quiz stays idempotent (1 notification, 2 recipients)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"10101010-1111-4111-8111-000000000001","role":"authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '10101010-1111-4111-8111-000000000001';

UPDATE public.quizzes SET is_published = false WHERE id = '40404040-1111-4111-8111-000000000001';
UPDATE public.quizzes SET is_published = true WHERE id = '40404040-1111-4111-8111-000000000001';
RESET ROLE;

SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.notifications WHERE idempotency_key = 'quiz_pub_40404040-1111-4111-8111-000000000001' $$,
  ARRAY[1],
  'C.5 Re-publishing quiz creates no duplicate notification row'
);

-- 26. Recipient count for re-published quiz remains 2
SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.notification_recipients nr
     JOIN public.notifications n ON n.id = nr.notification_id
     WHERE n.idempotency_key = 'quiz_pub_40404040-1111-4111-8111-000000000001' $$,
  ARRAY[2],
  'C.6 Re-publishing quiz creates no duplicate recipient rows'
);

-- =============================================================================
-- SECTION D: AUTOMATED TRIGGERS & ATOMIC ROLLBACK (12 Assertions)
-- =============================================================================
-- 27. Lesson published trigger creates notification & delivers to active course students
INSERT INTO public.lessons (
  id, course_id, unit_id, title, title_arabic, is_published, order_index
) VALUES (
  '60606060-1111-4111-8111-000000000001',
  '30303030-1111-4111-8111-000000000001',
  '31313131-1111-4111-8111-000000000001',
  'Hotfix Lesson 1',
  'درس تجريبي 1',
  true,
  1
);

SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.notifications WHERE idempotency_key = 'lesson_pub_60606060-1111-4111-8111-000000000001' $$,
  ARRAY[1],
  'D.1 Lesson trigger creates 1 notification'
);

-- 28. Lesson notification delivered to 2 active Group A students only
SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.notification_recipients nr
     JOIN public.notifications n ON n.id = nr.notification_id
     WHERE n.idempotency_key = 'lesson_pub_60606060-1111-4111-8111-000000000001' $$,
  ARRAY[2],
  'D.2 Lesson notification delivered to 2 active eligible students'
);

-- 29. Re-publishing lesson stays idempotent
UPDATE public.lessons SET is_published = false WHERE id = '60606060-1111-4111-8111-000000000001';
UPDATE public.lessons SET is_published = true WHERE id = '60606060-1111-4111-8111-000000000001';

SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.notifications WHERE idempotency_key = 'lesson_pub_60606060-1111-4111-8111-000000000001' $$,
  ARRAY[1],
  'D.3 Re-publishing lesson remains idempotent'
);

-- 30. Resource published trigger creates 1 notification and 2 recipients
INSERT INTO public.lesson_resources (
  id, lesson_id, title, title_arabic, file_url
) VALUES (
  '60606060-1111-4111-8111-000000000002',
  '60606060-1111-4111-8111-000000000001',
  'Hotfix Resource PDF',
  'ملف تدريبي',
  'https://example.invalid/hotfix-guide.pdf'
);

SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.notifications WHERE idempotency_key = 'res_pub_60606060-1111-4111-8111-000000000002' $$,
  ARRAY[1],
  'D.4 Resource trigger creates 1 notification'
);

-- 31. Resource notification delivered to 2 active eligible students
SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.notification_recipients nr
     JOIN public.notifications n ON n.id = nr.notification_id
     WHERE n.idempotency_key = 'res_pub_60606060-1111-4111-8111-000000000002' $$,
  ARRAY[2],
  'D.5 Resource notification delivered to 2 active eligible students'
);

-- 32. Live session trigger creates notification on INSERT with expected idempotency_key
INSERT INTO public.live_sessions (
  id, course_id, group_id, teacher_id, title, title_arabic,
  start_time, end_time, status, meeting_url
) VALUES (
  '60606060-1111-4111-8111-000000000003',
  '30303030-1111-4111-8111-000000000001',
  '20202020-1111-4111-8111-000000000001',
  '10101010-1111-4111-8111-000000000001',
  'Hotfix Live Session',
  'حصة مباشرة',
  '2026-11-20 17:00:00+03'::timestamptz,
  '2026-11-20 18:00:00+03'::timestamptz,
  'scheduled',
  'https://meet.example.invalid/hotfix'
);

SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.notifications
     WHERE idempotency_key = 'session_60606060-1111-4111-8111-000000000003_' || EXTRACT(EPOCH FROM '2026-11-20 17:00:00+03'::timestamptz)::bigint::text $$,
  ARRAY[1],
  'D.6 Live session trigger creates 1 notification on INSERT'
);

-- 33. Live session reschedule creates notification for new time and reverts idempotently
UPDATE public.live_sessions
SET start_time = '2026-11-20 19:00:00+03'::timestamptz,
    end_time = '2026-11-20 20:00:00+03'::timestamptz
WHERE id = '60606060-1111-4111-8111-000000000003';

UPDATE public.live_sessions
SET start_time = '2026-11-20 17:00:00+03'::timestamptz,
    end_time = '2026-11-20 18:00:00+03'::timestamptz
WHERE id = '60606060-1111-4111-8111-000000000003';

SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.notifications
     WHERE related_resource_id = '60606060-1111-4111-8111-000000000003' AND category = 'live_session' $$,
  ARRAY[2],
  'D.7 Live session reschedule & revert produces exactly 2 distinct notifications idempotently'
);

-- 34. Quiz result trigger creates notification when attempt is graded
INSERT INTO public.quiz_attempts (
  id, quiz_id, student_id, status, points_scored, total_points_possible,
  percentage_score, question_snapshot, created_at
) VALUES (
  '60606060-1111-4111-8111-000000000004',
  '40404040-1111-4111-8111-000000000001',
  '10101010-1111-4111-8111-000000000003',
  'submitted',
  80, 100, 80, '[]'::jsonb, now()
);

UPDATE public.quiz_attempts
SET status = 'graded', percentage_score = 85
WHERE id = '60606060-1111-4111-8111-000000000004';

SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.notifications WHERE idempotency_key = 'quiz_res_60606060-1111-4111-8111-000000000004' $$,
  ARRAY[1],
  'D.8 Quiz result trigger creates 1 notification when attempt transitions to graded'
);

-- 35. Re-transitioning quiz attempt status to graded remains idempotent
UPDATE public.quiz_attempts SET status = 'submitted' WHERE id = '60606060-1111-4111-8111-000000000004';
UPDATE public.quiz_attempts SET status = 'graded' WHERE id = '60606060-1111-4111-8111-000000000004';

SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.notifications WHERE idempotency_key = 'quiz_res_60606060-1111-4111-8111-000000000004' $$,
  ARRAY[1],
  'D.9 Re-grading quiz attempt remains idempotent'
);

-- 36-37. Transactional atomicity: failure inside same subtransaction rolls back BOTH quiz AND notification
DO $$
BEGIN
  BEGIN
    INSERT INTO public.quizzes (
      id, teacher_id, group_id, title, title_arabic,
      duration_minutes, passing_score, max_attempts, total_points, is_published, is_archived
    ) VALUES (
      '40404040-1111-4111-8111-000000000099',
      '10101010-1111-4111-8111-000000000001',
      '20202020-1111-4111-8111-000000000001',
      'Rollback Quiz',
      'اختبار متراجع عنه',
      15, 50, 1, 20, true, false
    );

    RAISE EXCEPTION 'Simulated downstream transaction failure';
  EXCEPTION
    WHEN raise_exception THEN
      NULL;
  END;
END $$;

SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.quizzes WHERE id = '40404040-1111-4111-8111-000000000099' $$,
  ARRAY[0],
  'D.10 Subtransaction rollback leaves no orphan quiz record'
);

SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.notifications WHERE idempotency_key = 'quiz_pub_40404040-1111-4111-8111-000000000099' $$,
  ARRAY[0],
  'D.11 Subtransaction rollback leaves no orphan notification record'
);

-- 38. Failing constraint on quiz creation rolls back cleanly with no notification
SELECT extensions.throws_ok(
  $$
    INSERT INTO public.quizzes (
      id, teacher_id, group_id, title, title_arabic, is_published
    ) VALUES (
      '40404040-1111-4111-8111-000000000098',
      '10101010-1111-4111-8111-000000000001',
      '99999999-9999-4999-8999-999999999999',
      'Invalid Group FK Quiz',
      'اختبار بمجموعة غير موجودة',
      true
    )
  $$,
  '23503',
  NULL,
  'D.12 Invalid FK on published quiz fails cleanly without creating notification'
);

-- =============================================================================
-- SECTION E: NEGATIVE & SECURITY TESTS (13 Assertions)
-- =============================================================================

-- 39. Anon cannot publish announcement
SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claims" = '{"role":"anon"}';

SELECT extensions.throws_ok(
  $$ SELECT public.publish_announcement('50505050-1111-4111-8111-000000000001'::uuid) $$,
  '42501',
  NULL,
  'E.1 Anon cannot execute publish_announcement'
);

-- 40. Anon has no INSERT privilege on quizzes
SELECT extensions.is(
  has_table_privilege('anon', 'public.quizzes', 'INSERT'),
  false,
  'E.2 Anon has NO INSERT privilege on public.quizzes'
);
RESET ROLE;

-- 41. Student cannot execute publish_announcement
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"10101010-1111-4111-8111-000000000003","role":"authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '10101010-1111-4111-8111-000000000003';

SELECT extensions.throws_ok(
  $$ SELECT public.publish_announcement('50505050-1111-4111-8111-000000000001'::uuid) $$,
  '42501',
  NULL,
  'E.3 Student cannot execute publish_announcement'
);

-- 42. Student cannot insert a published quiz
SELECT extensions.throws_ok(
  $$
    INSERT INTO public.quizzes (
      teacher_id, group_id, title, title_arabic, is_published
    ) VALUES (
      '10101010-1111-4111-8111-000000000003',
      '20202020-1111-4111-8111-000000000001',
      'Student Unauthorized Quiz',
      'اختبار غير مصرح من طالب',
      true
    )
  $$,
  '42501',
  NULL,
  'E.4 Student cannot insert into public.quizzes'
);

-- 43. Student B1 (Group B) cannot read Group A notifications via RLS
SET LOCAL "request.jwt.claims" = '{"sub":"10101010-1111-4111-8111-000000000006","role":"authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '10101010-1111-4111-8111-000000000006';

SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.notifications
     WHERE idempotency_key IN (
       'quiz_pub_40404040-1111-4111-8111-000000000001',
       'announcement_pub_50505050-1111-4111-8111-000000000001',
       'announcement_pub_50505050-1111-4111-8111-000000000002'
     ) $$,
  ARRAY[0],
  'E.5 Out-of-group student cannot see Group A or personal notifications via RLS'
);

-- 44. Inactive student cannot see any notifications via RLS
SET LOCAL "request.jwt.claims" = '{"sub":"10101010-1111-4111-8111-000000000005","role":"authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '10101010-1111-4111-8111-000000000005';

SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.notifications $$,
  ARRAY[0],
  'E.6 Inactive student cannot view any notifications via RLS'
);

-- 45. Active Student A1 can read own addressed notifications via get_my_notifications
SET LOCAL "request.jwt.claims" = '{"sub":"10101010-1111-4111-8111-000000000003","role":"authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '10101010-1111-4111-8111-000000000003';

SELECT extensions.is(
  (jsonb_array_length(public.get_my_notifications(20, 0, false, NULL)) >= 6),
  true,
  'E.7 Active Student A1 retrieves addressed notifications via get_my_notifications'
);

-- 46. Other Teacher B cannot publish Teacher A's announcement
SET LOCAL "request.jwt.claims" = '{"sub":"10101010-1111-4111-8111-000000000002","role":"authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '10101010-1111-4111-8111-000000000002';

SELECT extensions.throws_ok(
  $$ SELECT public.publish_announcement('50505050-1111-4111-8111-000000000001'::uuid) $$,
  '42501',
  NULL,
  'E.8 Other teacher cannot publish Teacher A announcement'
);

-- 47. Other Teacher B cannot update Teacher A's quiz
SELECT extensions.results_eq(
  $$ UPDATE public.quizzes SET title = 'Tampered' WHERE id = '40404040-1111-4111-8111-000000000001' RETURNING 1 $$,
  '{}'::int[],
  'E.9 Other teacher cannot update Teacher A quiz via RLS'
);

-- 48. Other Teacher B cannot delete Teacher A's quiz
SELECT extensions.results_eq(
  $$ DELETE FROM public.quizzes WHERE id = '40404040-1111-4111-8111-000000000001' RETURNING 1 $$,
  '{}'::int[],
  'E.10 Other teacher cannot delete Teacher A quiz via RLS'
);

-- 49. Author Teacher A cannot publish announcement targeting Group B (unauthorized cohort)
SET LOCAL "request.jwt.claims" = '{"sub":"10101010-1111-4111-8111-000000000001","role":"authenticated"}';
SET LOCAL "request.jwt.claim.sub" = '10101010-1111-4111-8111-000000000001';

INSERT INTO public.announcements (
  id, teacher_id, title, title_arabic, body, body_arabic,
  target_audience, group_id, priority, status
) VALUES (
  '50505050-1111-4111-8111-000000000003',
  '10101010-1111-4111-8111-000000000001',
  'Unauthorized Cohort B Broadcast',
  'إعلان غير مصرح للمجموعة ب',
  'Should fail scope verification.',
  'يجب أن يفشل التحقق من الصلاحية.',
  'group',
  '20202020-1111-4111-8111-000000000002',
  'normal',
  'draft'
);

SELECT extensions.throws_ok(
  $$ SELECT public.publish_announcement('50505050-1111-4111-8111-000000000003'::uuid) $$,
  '42501',
  NULL,
  'E.11 Teacher cannot publish announcement targeting unauthorized cohort group'
);

RESET ROLE;

-- 50. Duplicate non-NULL idempotency_key direct insert is rejected with 23505
SELECT extensions.throws_ok(
  $$
    INSERT INTO public.notifications (
      title, title_arabic, body, body_arabic, idempotency_key
    ) VALUES (
      'Duplicate Key', 'مفتاح مكرر', 'Body', 'نص',
      'quiz_pub_40404040-1111-4111-8111-000000000001'
    )
  $$,
  '23505',
  NULL,
  'E.12 Duplicate non-NULL idempotency_key is rejected by full unique index'
);

-- 51. Multiple NULL idempotency_key rows remain permitted under standard unique index
SELECT extensions.lives_ok(
  $$
    INSERT INTO public.notifications (title, title_arabic, body, body_arabic, idempotency_key)
    VALUES
      ('Null Key 1', 'بدون مفتاح 1', 'Body 1', 'نص 1', NULL),
      ('Null Key 2', 'بدون مفتاح 2', 'Body 2', 'نص 2', NULL);
  $$,
  'E.13 Multiple notifications with NULL idempotency_key remain allowed'
);

SELECT * FROM extensions.finish();
ROLLBACK;
