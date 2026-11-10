-- ==============================================================================
-- Integration tests for migration 20261110000013
-- Phase 5B Complete Question Bank Security, RLS & Functional Tests
--
-- Validates:
-- 1. Schema structure: Columns, types, and new enum values (multiple_select, essay)
-- 2. Anonymous access denial (SQLSTATE 42501)
-- 3. Strict Teacher Ownership RLS: Teacher A cannot select, update, or delete Teacher B's questions
-- 4. Super Admin override: Full management across all questions
-- 5. Atomic RPC create_question_bank_item:
--    - Enforces exactly one correct answer for multiple_choice / true_false
--    - Enforces at least one correct answer for multiple_select
--    - Rejects unauthorized caller
-- 6. Atomic RPC duplicate_question_bank_item:
--    - Clones question and options
--    - Appends (Copy) to title
--    - Assigns ownership to caller
-- 7. Atomic RPCs archive_question_bank_items & restore_question_bank_items:
--    - Soft archive / restore lifecycle
--    - Enforces ownership during bulk operations
-- 8. Atomic RPC add_bank_questions_to_quiz:
--    - Inserts question links into quiz_questions
--    - Recalibrates quiz total_points accurately
--    - Blocks unauthorized cross-teacher question inclusion
-- ==============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT extensions.plan(28);

-- -----------------------------------------------------------------------------
-- 1. Deterministic isolated identities
-- -----------------------------------------------------------------------------
INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('a1111111-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'teacher_qb_a@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('b2222222-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'teacher_qb_b@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('c3333333-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'super_admin_qb@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('d4444444-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'student_qb@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, role, full_name, full_name_arabic, status)
VALUES
  ('a1111111-0000-0000-0000-000000000001', 'teacher', 'QB Teacher A', 'معلم بنك أ', 'active'),
  ('b2222222-0000-0000-0000-000000000002', 'teacher', 'QB Teacher B', 'معلم بنك ب', 'active'),
  ('c3333333-0000-0000-0000-000000000003', 'super_admin', 'QB Super Admin', 'مدير بنك الأسئلة', 'active'),
  ('d4444444-0000-0000-0000-000000000004', 'student', 'QB Student', 'طالب بنك الأسئلة', 'active')
ON CONFLICT (id) DO NOTHING;

-- Course for testing
INSERT INTO public.courses (id, title, title_arabic, teacher_id)
VALUES ('e1111111-0000-0000-0000-000000000001', 'QB Course A', 'كورس بنك الأسئلة أ', 'a1111111-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- Quiz owned by Teacher A
INSERT INTO public.quizzes (id, course_id, created_by, title, title_arabic, total_points, passing_score_percentage, is_published)
VALUES ('f1111111-0000-0000-0000-000000000001', 'e1111111-0000-0000-0000-000000000001', 'a1111111-0000-0000-0000-000000000001', 'QB Test Quiz', 'اختبار تجريبي', 0, 60, false)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- [Tests 1-6] Schema Columns & Enum Values Verification
-- -----------------------------------------------------------------------------
SELECT extensions.has_column('public', 'question_bank', 'unit_id', 'question_bank has unit_id column');
SELECT extensions.has_column('public', 'question_bank', 'lesson_id', 'question_bank has lesson_id column');
SELECT extensions.has_column('public', 'question_bank', 'topic', 'question_bank has topic column');
SELECT extensions.has_column('public', 'question_bank', 'tags', 'question_bank has tags column');
SELECT extensions.has_column('public', 'question_bank', 'is_active', 'question_bank has is_active column');
SELECT extensions.has_column('public', 'question_options', 'target_match_text', 'question_options has target_match_text');

-- -----------------------------------------------------------------------------
-- [Test 7] Anonymous Access Denial
-- -----------------------------------------------------------------------------
SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claims" TO '{"role": "anon"}';

SELECT extensions.throws_ok(
  $$ SELECT * FROM public.question_bank $$,
  '42501',
  NULL,
  'Anonymous role is strictly denied SELECT on public.question_bank'
);

RESET ROLE;

-- -----------------------------------------------------------------------------
-- [Test 8] Student Access Denial to Question Bank
-- -----------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "d4444444-0000-0000-0000-000000000004", "role": "authenticated"}';

SELECT extensions.is(
  (SELECT count(*)::int FROM public.question_bank),
  0,
  'Student sees zero question bank items through RLS'
);

-- Student cannot call create_question_bank_item
SELECT extensions.throws_ok(
  $$ SELECT public.create_question_bank_item('{"question_text": "Illegal Q", "question_type": "multiple_choice"}'::jsonb) $$,
  '42501',
  NULL,
  'Student cannot execute create_question_bank_item RPC'
);

RESET ROLE;

-- -----------------------------------------------------------------------------
-- [Tests 9-13] Atomic RPC create_question_bank_item Validations (Teacher A)
-- -----------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "a1111111-0000-0000-0000-000000000001", "role": "authenticated"}';

-- (a) Rejects multiple choice with 0 correct options
SELECT extensions.throws_ok(
  $$
    SELECT public.create_question_bank_item(
      '{"question_text": "No correct option Q", "question_type": "multiple_choice", "points": 2}'::jsonb,
      '[{"option_text": "Opt 1", "is_correct": false}, {"option_text": "Opt 2", "is_correct": false}]'::jsonb
    );
  $$,
  '22000',
  NULL,
  'create_question_bank_item rejects multiple_choice with 0 correct answers'
);

-- (b) Rejects multiple choice with 2 correct options
SELECT extensions.throws_ok(
  $$
    SELECT public.create_question_bank_item(
      '{"question_text": "Two correct options Q", "question_type": "multiple_choice", "points": 2}'::jsonb,
      '[{"option_text": "Opt 1", "is_correct": true}, {"option_text": "Opt 2", "is_correct": true}]'::jsonb
    );
  $$,
  '22000',
  NULL,
  'create_question_bank_item rejects multiple_choice with more than one correct answer'
);

-- (c) Rejects multiple select with 0 correct options
SELECT extensions.throws_ok(
  $$
    SELECT public.create_question_bank_item(
      '{"question_text": "Zero correct multi-select", "question_type": "multiple_select", "points": 3}'::jsonb,
      '[{"option_text": "Opt 1", "is_correct": false}, {"option_text": "Opt 2", "is_correct": false}]'::jsonb
    );
  $$,
  '22000',
  NULL,
  'create_question_bank_item rejects multiple_select with 0 correct answers'
);

-- (d) Successfully creates valid multiple choice question
DO $$
DECLARE
  v_res JSONB;
BEGIN
  v_res := public.create_question_bank_item(
    '{"question_text": "Valid Single Choice Q", "question_text_arabic": "سؤال اختيار فردي صالح", "question_type": "multiple_choice", "points": 2, "topic": "Grammar"}'::jsonb,
    '[{"option_text": "Right Ans", "is_correct": true}, {"option_text": "Wrong Ans", "is_correct": false}]'::jsonb
  );
  PERFORM set_config('test.created_q1_id', v_res->>'id', true);
END;
$$;

SELECT extensions.is(
  (SELECT count(*)::int FROM public.question_bank WHERE id = current_setting('test.created_q1_id')::uuid),
  1,
  'Teacher A successfully creates a multiple choice question with options'
);

SELECT extensions.is(
  (SELECT count(*)::int FROM public.question_options WHERE question_id = current_setting('test.created_q1_id')::uuid AND is_correct = true),
  1,
  'Teacher A question options correctly persist with exactly one correct answer'
);

-- Successfully creates matching question
DO $$
DECLARE
  v_res JSONB;
BEGIN
  v_res := public.create_question_bank_item(
    '{"question_text": "Valid Matching Q", "question_type": "matching", "points": 4, "topic": "Vocabulary"}'::jsonb,
    '[{"option_text": "Item 1", "target_match_text": "Match 1", "is_correct": true}, {"option_text": "Item 2", "target_match_text": "Match 2", "is_correct": true}]'::jsonb
  );
  PERFORM set_config('test.created_matching_id', v_res->>'id', true);
END;
$$;

SELECT extensions.is(
  (SELECT count(*)::int FROM public.question_options WHERE question_id = current_setting('test.created_matching_id')::uuid),
  2,
  'Matching question persists both pairs with target match values'
);

-- -----------------------------------------------------------------------------
-- [Tests 14-16] Teacher Cross-Isolation (Teacher B cannot see or touch Teacher A's questions)
-- -----------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "b2222222-0000-0000-0000-000000000002", "role": "authenticated"}';

-- Teacher B cannot select Teacher A's question via RLS
SELECT extensions.is(
  (SELECT count(*)::int FROM public.question_bank WHERE id = current_setting('test.created_q1_id')::uuid),
  0,
  'Teacher B cannot view Teacher A question through RLS'
);

-- Teacher B cannot update Teacher A's question via RPC
SELECT extensions.throws_ok(
  format($$ SELECT public.update_question_bank_item('%s'::uuid, '{"question_text": "Hacked"}'::jsonb) $$, current_setting('test.created_q1_id')),
  '42501',
  NULL,
  'Teacher B cannot update Teacher A question (42501 Unauthorized)'
);

-- Teacher B cannot duplicate Teacher A's question
SELECT extensions.throws_ok(
  format($$ SELECT public.duplicate_question_bank_item('%s'::uuid) $$, current_setting('test.created_q1_id')),
  '42501',
  NULL,
  'Teacher B cannot duplicate Teacher A question (42501 Unauthorized)'
);

RESET ROLE;

-- -----------------------------------------------------------------------------
-- [Tests 17-19] Duplication RPC (Teacher A duplicates own question)
-- -----------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "a1111111-0000-0000-0000-000000000001", "role": "authenticated"}';

DO $$
DECLARE
  v_res JSONB;
BEGIN
  v_res := public.duplicate_question_bank_item(current_setting('test.created_q1_id')::uuid);
  PERFORM set_config('test.duplicated_q_id', v_res->>'new_question_id', true);
END;
$$;

SELECT extensions.is(
  (SELECT question_text FROM public.question_bank WHERE id = current_setting('test.duplicated_q_id')::uuid),
  'Valid Single Choice Q (Copy)',
  'Duplicated question text correctly appends (Copy)'
);

SELECT extensions.is(
  (SELECT teacher_id FROM public.question_bank WHERE id = current_setting('test.duplicated_q_id')::uuid),
  'a1111111-0000-0000-0000-000000000001'::uuid,
  'Duplicated question is assigned to the duplicating teacher'
);

SELECT extensions.is(
  (SELECT count(*)::int FROM public.question_options WHERE question_id = current_setting('test.duplicated_q_id')::uuid),
  2,
  'Duplicated question correctly copies all options'
);

-- -----------------------------------------------------------------------------
-- [Tests 20-22] Bulk Archive & Restore RPCs
-- -----------------------------------------------------------------------------
-- Archive q1
DO $$
DECLARE
  v_res JSONB;
BEGIN
  v_res := public.archive_question_bank_items(ARRAY[current_setting('test.created_q1_id')::uuid]);
END;
$$;

SELECT extensions.is(
  (SELECT is_active FROM public.question_bank WHERE id = current_setting('test.created_q1_id')::uuid),
  false,
  'archive_question_bank_items sets is_active to false'
);

SELECT extensions.isnt(
  (SELECT archived_at FROM public.question_bank WHERE id = current_setting('test.created_q1_id')::uuid),
  NULL,
  'archive_question_bank_items sets archived_at timestamp'
);

-- Restore q1
DO $$
DECLARE
  v_res JSONB;
BEGIN
  v_res := public.restore_question_bank_items(ARRAY[current_setting('test.created_q1_id')::uuid]);
END;
$$;

SELECT extensions.is(
  (SELECT is_active FROM public.question_bank WHERE id = current_setting('test.created_q1_id')::uuid),
  true,
  'restore_question_bank_items restores is_active to true'
);

-- -----------------------------------------------------------------------------
-- [Tests 23-25] Quiz Integration: add_bank_questions_to_quiz
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_res JSONB;
BEGIN
  v_res := public.add_bank_questions_to_quiz(
    'f1111111-0000-0000-0000-000000000001'::uuid,
    ARRAY[current_setting('test.created_q1_id')::uuid, current_setting('test.created_matching_id')::uuid],
    5
  );
END;
$$;

SELECT extensions.is(
  (SELECT count(*)::int FROM public.quiz_questions WHERE quiz_id = 'f1111111-0000-0000-0000-000000000001'::uuid),
  2,
  'add_bank_questions_to_quiz successfully linked both questions to quiz'
);

SELECT extensions.is(
  (SELECT total_points FROM public.quizzes WHERE id = 'f1111111-0000-0000-0000-000000000001'::uuid),
  10::numeric,
  'add_bank_questions_to_quiz accurately recalculated quiz total_points (2 questions * 5 points = 10)'
);

-- Teacher B cannot add Teacher A's questions to their quiz
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "b2222222-0000-0000-0000-000000000002", "role": "authenticated"}';

SELECT extensions.throws_ok(
  format($$ SELECT public.add_bank_questions_to_quiz('f1111111-0000-0000-0000-000000000001'::uuid, ARRAY['%s'::uuid]) $$, current_setting('test.created_q1_id')),
  '42501',
  NULL,
  'Teacher B cannot add questions to Teacher A quiz'
);

RESET ROLE;

-- -----------------------------------------------------------------------------
-- [Tests 26-28] Super Admin Override & Statistics RPC
-- -----------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "c3333333-0000-0000-0000-000000000003", "role": "authenticated"}';

SELECT extensions.cmp_ok(
  (SELECT count(*)::int FROM public.question_bank),
  '>=',
  3,
  'Super Admin can view all questions across all teachers'
);

-- Super admin can call get_question_bank_stats
DO $$
DECLARE
  v_stats JSONB;
BEGIN
  v_stats := public.get_question_bank_stats();
  PERFORM set_config('test.stats_total', (v_stats->>'total_questions')::text, true);
END;
$$;

SELECT extensions.cmp_ok(
  current_setting('test.stats_total')::int,
  '>=',
  3,
  'get_question_bank_stats returns accurate system totals for Super Admin'
);

-- Super Admin can update any teacher question
SELECT extensions.lives_ok(
  format($$ SELECT public.update_question_bank_item('%s'::uuid, '{"question_text": "Updated by Super Admin"}'::jsonb) $$, current_setting('test.created_q1_id')),
  'Super Admin can update any question in the system'
);

SELECT * FROM extensions.finish();
ROLLBACK;
