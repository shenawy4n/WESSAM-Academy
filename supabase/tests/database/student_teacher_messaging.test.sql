-- ==============================================================================
-- Integration & Security Tests for Migration 20261113000017
-- Student-Teacher Private Messaging, Storage RLS, Notifications & Idempotency
--
-- Covers:
-- 1. Schema structure, bucket privacy, non-partial idempotency index & RPCs
-- 2. Anonymous access restrictions across tables & RPCs
-- 3. Relationship authorization: student->authorized teacher allowed;
--    student->unrelated teacher, student->student, inactive student blocked
-- 4. Conversation & message isolation across unrelated teachers/students
-- 5. Sender spoofing prevention & column-level update enforcement
-- 6. Storage path traversal blocking, size/extension/MIME checks, & atomic
--    rollback preventing orphan notifications on failed sends
-- 7. Atomic notification creation, deep-link action_url, read-state sync, &
--    idempotent client_message_id deduplication
-- 8. Regression verification for ON CONFLICT (idempotency_key), announcements,
--    and quiz publication triggers
-- ==============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT extensions.plan(44);

-- -----------------------------------------------------------------------------
-- 1. Isolated Test Users, Groups & Courses
-- -----------------------------------------------------------------------------
INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('11111111-7777-4111-8111-111111111111', 'authenticated', 'authenticated', 'msg_teacher1@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('88888888-7777-4888-8888-888888888888', 'authenticated', 'authenticated', 'msg_teacher2@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('99999999-7777-4999-8999-999999999999', 'authenticated', 'authenticated', 'msg_super_admin@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('22222222-7777-4222-8222-222222222222', 'authenticated', 'authenticated', 'msg_student1@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('33333333-7777-4333-8333-333333333333', 'authenticated', 'authenticated', 'msg_student2@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('55555555-7777-4555-8555-555555555555', 'authenticated', 'authenticated', 'msg_student_inactive@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, role, full_name, full_name_arabic, status)
VALUES
  ('11111111-7777-4111-8111-111111111111', 'teacher', 'Messaging Teacher One', 'المعلم الأول للرسائل', 'active'),
  ('88888888-7777-4888-8888-888888888888', 'teacher', 'Messaging Teacher Two', 'المعلم الثاني للرسائل', 'active'),
  ('99999999-7777-4999-8999-999999999999', 'super_admin', 'Messaging Super Admin', 'المدير العام للرسائل', 'active'),
  ('22222222-7777-4222-8222-222222222222', 'student', 'Messaging Student One', 'الطالب الأول للرسائل', 'active'),
  ('33333333-7777-4333-8333-333333333333', 'student', 'Messaging Student Two', 'الطالب الثاني للرسائل', 'active'),
  ('55555555-7777-4555-8555-555555555555', 'student', 'Messaging Inactive Student', 'طالب غير نشط للرسائل', 'inactive')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.groups (id, name, name_arabic, max_students, is_active)
VALUES
  ('cccccccc-7777-4111-8111-111111111111', 'Messaging Cohort A', 'مجموعة الرسائل أ', 25, true),
  ('cccccccc-7777-4222-8222-222222222222', 'Messaging Cohort B', 'مجموعة الرسائل ب', 25, true)
ON CONFLICT (id) DO NOTHING;

-- Student 1 + Inactive student belong to Cohort A; Student 2 belongs to Cohort B
INSERT INTO public.group_students (student_id, group_id)
VALUES
  ('22222222-7777-4222-8222-222222222222', 'cccccccc-7777-4111-8111-111111111111'),
  ('55555555-7777-4555-8555-555555555555', 'cccccccc-7777-4111-8111-111111111111'),
  ('33333333-7777-4333-8333-333333333333', 'cccccccc-7777-4222-8222-222222222222')
ON CONFLICT DO NOTHING;

-- Teacher 1 owns Course A assigned to Cohort A
INSERT INTO public.courses (id, teacher_id, title, title_arabic, is_published)
VALUES (
  'dddddddd-7777-4111-8111-111111111111',
  '11111111-7777-4111-8111-111111111111',
  'Messaging Course A',
  'مقرر الرسائل أ',
  true
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.group_courses (group_id, course_id)
VALUES ('cccccccc-7777-4111-8111-111111111111', 'dddddddd-7777-4111-8111-111111111111')
ON CONFLICT DO NOTHING;

-- Teacher 2 owns Course B assigned to Cohort B
INSERT INTO public.courses (id, teacher_id, title, title_arabic, is_published)
VALUES (
  'dddddddd-7777-4222-8222-222222222222',
  '88888888-7777-4888-8888-888888888888',
  'Messaging Course B',
  'مقرر الرسائل ب',
  true
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.group_courses (group_id, course_id)
VALUES ('cccccccc-7777-4222-8222-222222222222', 'dddddddd-7777-4222-8222-222222222222')
ON CONFLICT DO NOTHING;

-- =============================================================================
-- PART 1: SCHEMA, BUCKET, INDEX & FUNCTION VERIFICATION (8 Assertions)
-- =============================================================================
SELECT extensions.has_table('public', 'message_conversations', 'Table message_conversations exists'); -- 1
SELECT extensions.has_table('public', 'messages', 'Table messages exists'); -- 2
SELECT extensions.has_table('public', 'message_attachments', 'Table message_attachments exists'); -- 3

SELECT extensions.results_eq(
  $$ SELECT ARRAY[public, file_size_limit]::text[] FROM storage.buckets WHERE id = 'message-attachments' $$,
  ARRAY[ARRAY['false', '10485760']::text[]],
  'Private bucket message-attachments exists with 10MB file limit and public=false'
); -- 4

SELECT extensions.is(
  (
    SELECT ix.indpred IS NULL AND ix.indisunique
    FROM pg_class t
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_index ix ON ix.indrelid = t.oid
    JOIN pg_class i ON i.oid = ix.indexrelid
    WHERE n.nspname = 'public'
      AND t.relname = 'notifications'
      AND i.relname = 'idx_notifications_idempotency_key'
  ),
  true,
  'idx_notifications_idempotency_key is a non-partial unique index compatible with ON CONFLICT (idempotency_key)'
); -- 5

SELECT extensions.has_function('public', 'can_student_and_teacher_message', ARRAY['uuid', 'uuid'], 'can_student_and_teacher_message exists'); -- 6
SELECT extensions.has_function('public', 'send_direct_message', ARRAY['uuid', 'text', 'jsonb', 'uuid'], 'send_direct_message RPC exists'); -- 7
SELECT extensions.has_function('public', 'mark_conversation_messages_read', ARRAY['uuid'], 'mark_conversation_messages_read RPC exists'); -- 8

-- =============================================================================
-- PART 2: ANONYMOUS ACCESS RESTRICTIONS (6 Assertions)
-- =============================================================================
SELECT extensions.is(
  has_table_privilege('anon', 'public.message_conversations', 'SELECT'),
  false,
  'Anon has NO SELECT privilege on public.message_conversations'
); -- 9

SELECT extensions.is(
  has_table_privilege('anon', 'public.messages', 'SELECT'),
  false,
  'Anon has NO SELECT privilege on public.messages'
); -- 10

SELECT extensions.is(
  has_table_privilege('anon', 'public.message_attachments', 'SELECT'),
  false,
  'Anon has NO SELECT privilege on public.message_attachments'
); -- 11

SET LOCAL ROLE anon;
SELECT extensions.throws_ok(
  $$ SELECT public.get_authorized_messaging_teachers() $$,
  '42501',
  NULL,
  'Anon cannot execute get_authorized_messaging_teachers'
); -- 12

SELECT extensions.throws_ok(
  $$ SELECT public.get_or_create_student_teacher_conversation('11111111-7777-4111-8111-111111111111'::uuid, NULL) $$,
  '42501',
  NULL,
  'Anon cannot execute get_or_create_student_teacher_conversation'
); -- 13

SELECT extensions.throws_ok(
  $$ SELECT public.send_direct_message('00000000-0000-0000-0000-000000000000'::uuid, 'hi', '[]'::jsonb, NULL) $$,
  '42501',
  NULL,
  'Anon cannot execute send_direct_message'
); -- 14
RESET ROLE;

-- =============================================================================
-- PART 3: RELATIONSHIP AUTHORIZATION & ISOLATION (8 Assertions)
-- =============================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '22222222-7777-4222-8222-222222222222'; -- Student 1

SELECT extensions.is(
  (SELECT count(*)::int >= 1 FROM jsonb_array_elements(public.get_authorized_messaging_teachers()) t WHERE t->>'teacher_id' = '11111111-7777-4111-8111-111111111111'),
  true,
  'Student 1 sees authorized Teacher 1 in messaging teachers list'
); -- 15

SELECT extensions.is(
  (SELECT count(*)::int FROM jsonb_array_elements(public.get_authorized_messaging_teachers()) t WHERE t->>'teacher_id' = '88888888-7777-4888-8888-888888888888'),
  0,
  'Student 1 does NOT see unrelated Teacher 2 in messaging teachers list'
); -- 16

SELECT extensions.throws_ok(
  $$ SELECT public.get_or_create_student_teacher_conversation('88888888-7777-4888-8888-888888888888'::uuid, NULL) $$,
  '42501',
  NULL,
  'Student 1 CANNOT start conversation with unrelated Teacher 2'
); -- 17

SELECT extensions.throws_ok(
  $$ SELECT public.get_or_create_student_teacher_conversation('33333333-7777-4333-8333-333333333333'::uuid, NULL) $$,
  '42501',
  NULL,
  'Student 1 CANNOT start student-to-student conversation'
); -- 18

SELECT extensions.throws_ok(
  $$ SELECT public.get_or_create_student_teacher_conversation('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, NULL) $$,
  '42501',
  NULL,
  'Student 1 CANNOT start conversation with non-existent user'
); -- 19

-- Inactive student cannot message Teacher 1
SET LOCAL "request.jwt.claim.sub" = '55555555-7777-4555-8555-555555555555';
SELECT extensions.throws_ok(
  $$ SELECT public.get_or_create_student_teacher_conversation('11111111-7777-4111-8111-111111111111'::uuid, NULL) $$,
  '42501',
  NULL,
  'Inactive student CANNOT start conversation with Teacher 1'
); -- 20

-- Student 1 creates valid conversation with Teacher 1 and sends text + PDF attachment
SET LOCAL "request.jwt.claim.sub" = '22222222-7777-4222-8222-222222222222';
DO $$
DECLARE
  v_conv JSONB;
  v_conv_id UUID;
  v_msg JSONB;
  v_msg_dup JSONB;
  v_client_id UUID := '12345678-1234-4123-8123-123456789012';
BEGIN
  v_conv := public.get_or_create_student_teacher_conversation('11111111-7777-4111-8111-111111111111'::uuid, NULL);
  v_conv_id := (v_conv->>'id')::uuid;

  v_msg := public.send_direct_message(
    v_conv_id,
    'Hello teacher, attached is my question.',
    jsonb_build_array(
      jsonb_build_object(
        'storage_path', v_conv_id::text || '/22222222-7777-4222-8222-222222222222/question.pdf',
        'file_name', 'question.pdf',
        'file_size_bytes', 2048,
        'mime_type', 'application/pdf',
        'file_extension', 'pdf'
      )
    ),
    v_client_id
  );

  PERFORM set_config('test.conv_id', v_conv_id::text, true);
  PERFORM set_config('test.msg_id', (v_msg->>'id'), true);

  -- Retry same client_message_id (idempotent return with full payload)
  v_msg_dup := public.send_direct_message(v_conv_id, 'Duplicate attempt', '[]'::jsonb, v_client_id);
  PERFORM set_config('test.dup_flag', COALESCE(v_msg_dup->>'deduplicated', 'false'), true);
  PERFORM set_config('test.dup_att_count', jsonb_array_length(COALESCE(v_msg_dup->'attachments', '[]'::jsonb))::text, true);
END $$;

SELECT extensions.is(
  current_setting('test.dup_flag', true),
  'true',
  'Idempotent retry with same client_message_id returns deduplicated=true'
); -- 21

SELECT extensions.is(
  current_setting('test.dup_att_count', true),
  '1',
  'Idempotent retry preserves full attachments array in returned JSONB'
); -- 22

-- =============================================================================
-- PART 4: CROSS-USER ISOLATION, SPOOFING & STORAGE SECURITY (12 Assertions)
-- =============================================================================
-- Unrelated Teacher 2 cannot read conversation messages via RPC or table RLS
SET LOCAL "request.jwt.claim.sub" = '88888888-7777-4888-8888-888888888888';
SELECT extensions.throws_ok(
  $$ SELECT public.get_conversation_messages(current_setting('test.conv_id')::uuid, 50, 0) $$,
  '42501',
  NULL,
  'Unrelated Teacher 2 CANNOT fetch messages of Teacher 1 conversation via RPC'
); -- 23

SELECT extensions.throws_ok(
  $$ SELECT public.send_direct_message(current_setting('test.conv_id')::uuid, 'Intrusion', '[]'::jsonb, NULL) $$,
  '42501',
  NULL,
  'Unrelated Teacher 2 CANNOT send messages into Teacher 1 conversation'
); -- 24

SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.messages WHERE conversation_id = current_setting('test.conv_id')::uuid $$,
  ARRAY[0],
  'Unrelated Teacher 2 sees 0 rows in public.messages under RLS'
); -- 25

-- Unrelated Student 2 sees 0 attachments in Student 1 conversation
SET LOCAL "request.jwt.claim.sub" = '33333333-7777-4333-8333-333333333333';
SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.message_attachments WHERE conversation_id = current_setting('test.conv_id')::uuid $$,
  ARRAY[0],
  'Unrelated Student 2 sees 0 rows in public.message_attachments under RLS'
); -- 26

-- Student 1 cannot spoof sender_id = Teacher 1 via direct INSERT
SET LOCAL "request.jwt.claim.sub" = '22222222-7777-4222-8222-222222222222';
SELECT extensions.throws_ok(
  $$ INSERT INTO public.messages (conversation_id, sender_id, recipient_id, body)
     VALUES (
       current_setting('test.conv_id')::uuid,
       '11111111-7777-4111-8111-111111111111',
       '22222222-7777-4222-8222-222222222222',
       'Spoofed sender'
     ) $$,
  '42501',
  NULL,
  'Student 1 CANNOT spoof sender_id on direct INSERT'
); -- 27

-- Column-level privileges block recipient (Teacher 1) from altering message body
SET LOCAL "request.jwt.claim.sub" = '11111111-7777-4111-8111-111111111111';
SELECT extensions.throws_ok(
  $$ UPDATE public.messages SET body = 'Tampered body' WHERE id = current_setting('test.msg_id')::uuid $$,
  '42501',
  NULL,
  'Column-level GRANT blocks recipient from tampering with message body'
); -- 28

-- Storage security checks: path traversal, wrong uploader prefix, non-participant read
SELECT extensions.is(
  public.can_access_message_storage_object('../etc/passwd', false),
  false,
  'can_access_message_storage_object blocks path traversal'
); -- 29

SELECT extensions.is(
  public.can_access_message_storage_object(
    current_setting('test.conv_id') || '/22222222-7777-4222-8222-222222222222/spoof.pdf',
    true
  ),
  false,
  'Teacher 1 CANNOT upload into Student 1 uploader prefix'
); -- 30

SELECT extensions.is(
  public.can_access_message_storage_object(
    current_setting('test.conv_id') || '/22222222-7777-4222-8222-222222222222/question.pdf',
    false
  ),
  true,
  'Authorized Teacher 1 CAN read conversation attachment in storage'
); -- 31

SET LOCAL "request.jwt.claim.sub" = '88888888-7777-4888-8888-888888888888';
SELECT extensions.is(
  public.can_access_message_storage_object(
    current_setting('test.conv_id') || '/22222222-7777-4222-8222-222222222222/question.pdf',
    false
  ),
  false,
  'Unrelated Teacher 2 CANNOT read conversation attachment in storage'
); -- 32

-- Invalid attachment (oversized >10MB & blocked .exe extension) fails transactionally with ZERO orphan notifications
SET LOCAL "request.jwt.claim.sub" = '22222222-7777-4222-8222-222222222222';
SELECT extensions.throws_ok(
  $$ SELECT public.send_direct_message(
       current_setting('test.conv_id')::uuid,
       'Should rollback completely',
       jsonb_build_array(
         jsonb_build_object(
           'storage_path', current_setting('test.conv_id') || '/22222222-7777-4222-8222-222222222222/malware.exe',
           'file_name', 'malware.exe',
           'file_size_bytes', 20971520,
           'mime_type', 'application/x-msdownload',
           'file_extension', 'exe'
         )
       ),
       NULL
     ) $$,
  '22000',
  NULL,
  'Dangerous/oversized attachment rejected cleanly inside send_direct_message'
); -- 33

SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.messages WHERE conversation_id = current_setting('test.conv_id')::uuid $$,
  ARRAY[1],
  'Failed send_direct_message rolled back cleanly: message count remains 1'
); -- 34

-- =============================================================================
-- PART 5: ATOMIC NOTIFICATIONS, DEEP LINKS, READ SYNC & REGRESSION (10 Assertions)
-- =============================================================================
-- Teacher 1 verifies notification exists atomically with category = 'student_message' & /messages/<convId>
SET LOCAL "request.jwt.claim.sub" = '11111111-7777-4111-8111-111111111111';
SELECT extensions.is(
  (
    SELECT count(*)::int
    FROM public.notification_recipients nr
    JOIN public.notifications n ON n.id = nr.notification_id
    WHERE nr.recipient_id = '11111111-7777-4111-8111-111111111111'
      AND n.category = 'student_message'
      AND n.action_url = ('/messages/' || current_setting('test.conv_id'))
      AND nr.is_read = false
  ),
  1,
  'Unread in-app student_message notification created atomically with deep-link action_url'
); -- 35

SELECT extensions.is(
  public.get_unread_messages_count(),
  1,
  'Teacher 1 sees unread messages count = 1 before reading'
); -- 36

-- Marking conversation read marks both message AND matching notification read
SELECT extensions.is(
  public.mark_conversation_messages_read(current_setting('test.conv_id')::uuid),
  1,
  'mark_conversation_messages_read returns updated count = 1'
); -- 37

SELECT extensions.is(
  public.get_unread_messages_count(),
  0,
  'Teacher 1 unread messages count drops to 0 after mark_conversation_messages_read'
); -- 38

SELECT extensions.is(
  (
    SELECT nr.is_read
    FROM public.notification_recipients nr
    JOIN public.notifications n ON n.id = nr.notification_id
    WHERE nr.recipient_id = '11111111-7777-4111-8111-111111111111'
      AND n.action_url = ('/messages/' || current_setting('test.conv_id'))
    LIMIT 1
  ),
  true,
  'Corresponding message notification is automatically marked read when conversation is read'
); -- 39

-- Teacher replies to student -> Student gets unread teacher_message notification
SELECT extensions.is(
  (public.send_direct_message(current_setting('test.conv_id')::uuid, 'Great question! Keep going.', '[]'::jsonb, NULL)->>'sender_id'),
  '11111111-7777-4111-8111-111111111111',
  'Teacher 1 sends reply message successfully'
); -- 40

SET LOCAL "request.jwt.claim.sub" = '22222222-7777-4222-8222-222222222222';
SELECT extensions.is(
  (
    SELECT count(*)::int
    FROM public.notification_recipients nr
    JOIN public.notifications n ON n.id = nr.notification_id
    WHERE nr.recipient_id = '22222222-7777-4222-8222-222222222222'
      AND n.category = 'teacher_message'
      AND n.action_url = ('/messages/' || current_setting('test.conv_id'))
      AND nr.is_read = false
  ),
  1,
  'Student 1 receives unread teacher_message notification for reply'
); -- 41

-- Regression checks for ON CONFLICT (idempotency_key) across announcements & quiz publishing
RESET ROLE;
INSERT INTO public.notifications (title, title_arabic, body, body_arabic, type, category, priority, idempotency_key)
VALUES ('Reg Key', 'مفتاح', 'Body', 'نص', 'general', 'general', 'normal', 'reg_msg_idem_key_1')
ON CONFLICT (idempotency_key) DO NOTHING;

INSERT INTO public.notifications (title, title_arabic, body, body_arabic, type, category, priority, idempotency_key)
VALUES ('Reg Key Dup', 'مفتاح مكرر', 'Body 2', 'نص 2', 'general', 'general', 'normal', 'reg_msg_idem_key_1')
ON CONFLICT (idempotency_key) DO NOTHING;

SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.notifications WHERE idempotency_key = 'reg_msg_idem_key_1' $$,
  ARRAY[1],
  'ON CONFLICT (idempotency_key) DO NOTHING deduplicates cleanly without SQLSTATE 42P10'
); -- 42

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '11111111-7777-4111-8111-111111111111';
INSERT INTO public.announcements (
  id, teacher_id, title, title_arabic, body, body_arabic,
  target_audience, group_id, priority, status
) VALUES (
  'eeeeeeee-7777-4111-8111-111111111111',
  '11111111-7777-4111-8111-111111111111',
  'Messaging Regression Announcement',
  'إعلان تحقق التوافق',
  'Body',
  'نص',
  'group',
  'cccccccc-7777-4111-8111-111111111111',
  'normal',
  'draft'
) ON CONFLICT (id) DO NOTHING;

SELECT extensions.is(
  (public.publish_announcement('eeeeeeee-7777-4111-8111-111111111111'::uuid)->>'status'),
  'published',
  'publish_announcement succeeds without ON CONFLICT error'
); -- 43
RESET ROLE;

INSERT INTO public.quizzes (
  id, group_id, teacher_id, title, title_arabic, is_published, passing_score
) VALUES (
  'ffffffff-7777-4111-8111-111111111111',
  'cccccccc-7777-4111-8111-111111111111',
  '11111111-7777-4111-8111-111111111111',
  'Messaging Regression Quiz',
  'اختبار تحقق التوافق',
  true,
  70
) ON CONFLICT (id) DO NOTHING;

SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.notifications WHERE idempotency_key = 'quiz_pub_ffffffff-7777-4111-8111-111111111111' $$,
  ARRAY[1],
  'Published quiz trigger succeeds without ON CONFLICT error'
); -- 44

SELECT * FROM extensions.finish();
ROLLBACK;
