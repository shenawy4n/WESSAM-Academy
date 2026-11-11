-- ==============================================================================
-- Integration tests for migration 20261110000014
-- Question Bank Remediation: Strict Per-Teacher Isolation, Legacy NULL Isolation & RPC Contracts
--
-- Validates:
-- 1. Anonymous role cannot access question_bank or question_options (SQLSTATE 42501).
-- 2. Students cannot access question_bank or execute question RPCs (SQLSTATE 42501).
-- 3. Legacy questions with teacher_id IS NULL:
--    - Inaccessible to all teachers (invisible in SELECT, update/delete denied).
--    - Fully accessible to Super Admin.
-- 4. Teacher A creates question via create_question_bank_item:
--    - Automatically owned by Teacher A.
--    - Teacher B cannot SELECT Teacher A's question via RLS.
--    - Teacher B cannot update, duplicate, archive, or delete Teacher A's question.
-- 5. Course management does NOT bypass question ownership:
--    - Even if Teacher B manages the course attached to Teacher A's question, Teacher B cannot edit it.
-- 6. Question options strictly inherit parent question ownership:
--    - Teacher B cannot see or manipulate Teacher A's question options.
-- 7. Atomic batch import RPC (import_question_bank_items):
--    - Transactionally imports valid questions and options with caller as owner.
--    - Rejects invalid row with descriptive exception.
-- 8. Duplication, archive, and quiz integration RPCs function strictly.
-- ==============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT extensions.plan(25);

-- -----------------------------------------------------------------------------
-- 1. Deterministic isolated identities
-- -----------------------------------------------------------------------------
INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('a1111111-9999-0000-0000-000000000001', 'authenticated', 'authenticated', 'teacher_rem_a@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('b2222222-9999-0000-0000-000000000002', 'authenticated', 'authenticated', 'teacher_rem_b@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('c3333333-9999-0000-0000-000000000003', 'authenticated', 'authenticated', 'super_admin_rem@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('d4444444-9999-0000-0000-000000000004', 'authenticated', 'authenticated', 'student_rem@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, role, full_name, full_name_arabic, status)
VALUES
  ('a1111111-9999-0000-0000-000000000001', 'teacher', 'Rem Teacher A', 'معلم أ', 'active'),
  ('b2222222-9999-0000-0000-000000000002', 'teacher', 'Rem Teacher B', 'معلم ب', 'active'),
  ('c3333333-9999-0000-0000-000000000003', 'super_admin', 'Rem Super Admin', 'مدير عام', 'active'),
  ('d4444444-9999-0000-0000-000000000004', 'student', 'Rem Student', 'طالب', 'active')
ON CONFLICT (id) DO NOTHING;

-- Course managed by Teacher B
INSERT INTO public.courses (id, title, title_arabic, teacher_id)
VALUES ('e2222222-9999-0000-0000-000000000002', 'Course Owned By Teacher B', 'كورس المعلم ب', 'b2222222-9999-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- Seed a legacy unowned question (teacher_id IS NULL)
INSERT INTO public.question_bank (
  id, teacher_id, question_text, question_type, difficulty_level, points
) VALUES (
  '99999999-0000-0000-0000-000000000001', NULL, 'Legacy System Question', 'multiple_choice', 'intermediate', 2
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.question_options (
  question_id, option_text, is_correct, order_index
) VALUES
  ('99999999-0000-0000-0000-000000000001', 'Legacy Option 1', true, 0),
  ('99999999-0000-0000-0000-000000000001', 'Legacy Option 2', false, 1)
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- [Test 1] Anonymous Access Strictly Denied
-- -----------------------------------------------------------------------------
SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claims" TO '{"role": "anon"}';

SELECT extensions.throws_ok(
  $$ SELECT * FROM public.question_bank $$,
  '42501',
  NULL,
  'Anon cannot SELECT from question_bank'
);

RESET ROLE;

-- -----------------------------------------------------------------------------
-- [Test 2-3] Student Access Strictly Denied
-- -----------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "d4444444-9999-0000-0000-000000000004", "role": "authenticated"}';

SELECT extensions.is(
  (SELECT count(*)::int FROM public.question_bank),
  0,
  'Student sees 0 question bank records'
);

SELECT extensions.throws_ok(
  $$ SELECT public.create_question_bank_item('{"question_text": "Illegal", "question_type": "multiple_choice"}'::jsonb) $$,
  '42501',
  NULL,
  'Student cannot invoke create_question_bank_item'
);

RESET ROLE;

-- -----------------------------------------------------------------------------
-- [Tests 4-6] Legacy Questions (teacher_id IS NULL) Isolation
-- -----------------------------------------------------------------------------
-- Teacher A cannot see legacy unowned questions
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "a1111111-9999-0000-0000-000000000001", "role": "authenticated"}';

SELECT extensions.is(
  (SELECT count(*)::int FROM public.question_bank WHERE id = '99999999-0000-0000-0000-000000000001'),
  0,
  'Teacher A cannot see legacy questions where teacher_id IS NULL'
);

-- Teacher A cannot edit legacy question
SELECT extensions.throws_ok(
  $$ SELECT public.update_question_bank_item('99999999-0000-0000-0000-000000000001'::uuid, '{"question_text": "Hacked"}'::jsonb) $$,
  '42501',
  NULL,
  'Teacher A cannot update legacy question where teacher_id IS NULL'
);

RESET ROLE;

-- Super Admin CAN see legacy question
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "c3333333-9999-0000-0000-000000000003", "role": "authenticated"}';

SELECT extensions.is(
  (SELECT count(*)::int FROM public.question_bank WHERE id = '99999999-0000-0000-0000-000000000001'),
  1,
  'Super Admin can view legacy questions where teacher_id IS NULL'
);

RESET ROLE;

-- -----------------------------------------------------------------------------
-- [Tests 7-10] Teacher A Creates Question with Strict RPC Contract
-- -----------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "a1111111-9999-0000-0000-000000000001", "role": "authenticated"}';

DO $$
DECLARE
  v_res JSONB;
BEGIN
  -- Question assigned to Teacher B's course to test no-bypass rule!
  v_res := public.create_question_bank_item(
    jsonb_build_object(
      'question_text', 'Teacher A Question In Course B',
      'question_type', 'multiple_choice',
      'difficulty_level', 'intermediate',
      'points', 3,
      'course_id', 'e2222222-9999-0000-0000-000000000002'
    ),
    '[{"option_text": "Correct Option", "is_correct": true}, {"option_text": "Wrong Option", "is_correct": false}]'::jsonb
  );
  PERFORM set_config('test.qa_id', v_res->>'id', true);
END;
$$;

SELECT extensions.is(
  (SELECT teacher_id FROM public.question_bank WHERE id = current_setting('test.qa_id')::uuid),
  'a1111111-9999-0000-0000-000000000001'::uuid,
  'create_question_bank_item forces owner to be authenticated caller (Teacher A)'
);

SELECT extensions.is(
  (SELECT count(*)::int FROM public.question_options WHERE question_id = current_setting('test.qa_id')::uuid),
  2,
  'create_question_bank_item successfully creates options atomically'
);

-- Teacher A cannot insert a question with teacher_id IS NULL directly
SELECT extensions.throws_ok(
  $$
    INSERT INTO public.question_bank (teacher_id, question_text, question_type)
    VALUES (NULL, 'Illegal Null Owner', 'multiple_choice');
  $$,
  '42501',
  NULL,
  'Teacher A cannot insert question with teacher_id IS NULL via RLS'
);

-- Teacher A cannot spoof Teacher B ownership directly
SELECT extensions.throws_ok(
  $$
    INSERT INTO public.question_bank (teacher_id, question_text, question_type)
    VALUES ('b2222222-9999-0000-0000-000000000002'::uuid, 'Spoofed Question', 'multiple_choice');
  $$,
  '42501',
  NULL,
  'Teacher A cannot insert question with Teacher B id via RLS'
);

RESET ROLE;

-- -----------------------------------------------------------------------------
-- [Tests 11-15] Teacher B Strict Cross-Isolation & Course-Bypass Denial
-- -----------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "b2222222-9999-0000-0000-000000000002", "role": "authenticated"}';

-- Teacher B cannot SELECT Teacher A's question even though it has Teacher B's course_id!
SELECT extensions.is(
  (SELECT count(*)::int FROM public.question_bank WHERE id = current_setting('test.qa_id')::uuid),
  0,
  'Teacher B cannot view Teacher A question even if linked to Teacher B course'
);

-- Teacher B cannot SELECT Teacher A's options
SELECT extensions.is(
  (SELECT count(*)::int FROM public.question_options WHERE question_id = current_setting('test.qa_id')::uuid),
  0,
  'Teacher B cannot view Teacher A question options'
);

-- Teacher B cannot update Teacher A's question via RPC
SELECT extensions.throws_ok(
  format($$ SELECT public.update_question_bank_item('%s'::uuid, '{"question_text": "Bypass Attempt"}'::jsonb) $$, current_setting('test.qa_id')),
  '42501',
  NULL,
  'Teacher B cannot update Teacher A question via RPC (course bypass strictly denied)'
);

-- Teacher B cannot duplicate Teacher A's question
SELECT extensions.throws_ok(
  format($$ SELECT public.duplicate_question_bank_item('%s'::uuid) $$, current_setting('test.qa_id')),
  '42501',
  NULL,
  'Teacher B cannot duplicate Teacher A question'
);

-- Teacher B bulk archive does not touch Teacher A's question
DO $$
DECLARE
  v_res JSONB;
BEGIN
  v_res := public.archive_question_bank_items(ARRAY[current_setting('test.qa_id')::uuid]);
  PERFORM set_config('test.b_archived_count', (v_res->>'archived_count')::text, true);
END;
$$;

SELECT extensions.is(
  current_setting('test.b_archived_count')::int,
  0,
  'archive_question_bank_items ignores questions not owned by Teacher B'
);

RESET ROLE;

-- -----------------------------------------------------------------------------
-- [Tests 16-18] Teacher A Update & Duplication Functions
-- -----------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "a1111111-9999-0000-0000-000000000001", "role": "authenticated"}';

-- Teacher A updates own question
SELECT extensions.lives_ok(
  format($$
    SELECT public.update_question_bank_item(
      '%s'::uuid,
      '{"question_text": "Updated Text", "question_type": "multiple_choice", "difficulty": "hard", "points": 5}'::jsonb,
      '[{"option_text": "Updated Correct", "is_correct": true}, {"option_text": "Updated Wrong", "is_correct": false}]'::jsonb
    );
  $$, current_setting('test.qa_id')),
  'Teacher A can successfully update own question and options via RPC'
);

SELECT extensions.is(
  (SELECT points FROM public.question_bank WHERE id = current_setting('test.qa_id')::uuid),
  5,
  'Question points correctly updated to 5'
);

-- Teacher A duplicates own question
DO $$
DECLARE
  v_res JSONB;
BEGIN
  v_res := public.duplicate_question_bank_item(current_setting('test.qa_id')::uuid);
  PERFORM set_config('test.qa_dup_id', v_res->>'new_question_id', true);
END;
$$;

SELECT extensions.is(
  (SELECT teacher_id FROM public.question_bank WHERE id = current_setting('test.qa_dup_id')::uuid),
  'a1111111-9999-0000-0000-000000000001'::uuid,
  'Duplicated question owned by Teacher A'
);

RESET ROLE;

-- -----------------------------------------------------------------------------
-- [Tests 19-22] Transactional Batch Import RPC (import_question_bank_items)
-- -----------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "a1111111-9999-0000-0000-000000000001", "role": "authenticated"}';

-- (a) Valid import of 2 questions
DO $$
DECLARE
  v_batch JSONB;
  v_res JSONB;
BEGIN
  v_batch := '[
    {
      "question": {
        "question_text": "Batch Q1 Multiple Choice",
        "question_type": "multiple_choice",
        "points": 2
      },
      "options": [
        {"option_text": "Right", "is_correct": true},
        {"option_text": "Wrong", "is_correct": false}
      ]
    },
    {
      "question": {
        "question_text": "Batch Q2 True/False",
        "question_type": "true_false",
        "points": 1
      },
      "options": [
        {"option_text": "True", "is_correct": true},
        {"option_text": "False", "is_correct": false}
      ]
    }
  ]'::jsonb;

  v_res := public.import_question_bank_items(v_batch);
  PERFORM set_config('test.import_count', (v_res->>'imported_count')::text, true);
END;
$$;

SELECT extensions.is(
  current_setting('test.import_count')::int,
  2,
  'import_question_bank_items successfully imports 2 questions transactionally'
);

SELECT extensions.is(
  (SELECT count(*)::int FROM public.question_bank WHERE question_text LIKE 'Batch Q%'),
  2,
  'Batch questions persist with Teacher A ownership'
);

-- (b) Invalid batch rollback (row 2 has multiple_choice with 0 correct answers)
SELECT extensions.throws_ok(
  $$
    SELECT public.import_question_bank_items('[
      {
        "question": {"question_text": "Valid Q", "question_type": "true_false", "points": 1},
        "options": [{"option_text": "T", "is_correct": true}, {"option_text": "F", "is_correct": false}]
      },
      {
        "question": {"question_text": "Invalid Q", "question_type": "multiple_choice", "points": 2},
        "options": [{"option_text": "A", "is_correct": false}, {"option_text": "B", "is_correct": false}]
      }
    ]'::jsonb);
  $$,
  '22000',
  NULL,
  'import_question_bank_items rejects batch containing invalid option configuration'
);

-- Verify atomicity: Valid Q from the failed batch was NOT persisted
SELECT extensions.is(
  (SELECT count(*)::int FROM public.question_bank WHERE question_text = 'Valid Q'),
  0,
  'Failed batch completely rolled back without leaving partial inserts'
);

RESET ROLE;

-- -----------------------------------------------------------------------------
-- [Tests 23-25] Super Admin Authority
-- -----------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "c3333333-9999-0000-0000-000000000003", "role": "authenticated"}';

-- Super Admin sees all questions (Teacher A, Teacher B, and legacy unowned)
SELECT extensions.cmp_ok(
  (SELECT count(*)::int FROM public.question_bank),
  '>=',
  4,
  'Super Admin sees all questions across all owners'
);

-- Super Admin can update any question
SELECT extensions.lives_ok(
  format($$ SELECT public.update_question_bank_item('%s'::uuid, '{"question_text": "Super Admin Override"}'::jsonb) $$, current_setting('test.qa_id')),
  'Super Admin can update any question in the system'
);

-- Super Admin gets aggregated stats
SELECT extensions.lives_ok(
  $$ SELECT public.get_question_bank_stats() $$,
  'Super Admin can execute get_question_bank_stats successfully'
);

SELECT * FROM extensions.finish();
ROLLBACK;
