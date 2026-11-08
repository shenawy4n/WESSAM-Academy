-- ==============================================================================
-- Integration tests for migration 20261108000010
-- Phase 4B Quizzes & Assessments Management Security & Functional Tests
-- Validates:
-- 1. Schema structure, constraints, and column additions
-- 2. Anonymous access restrictions & table-level privilege enforcement
-- 3. Teacher cross-data isolation and RLS policies on quizzes and questions
-- 4. Student eligibility checks, cohort isolation, and draft/archive protection
-- 5. Atomic RPC start_quiz_attempt: sanitized snapshots, timers, attempt limits
-- 6. Atomic RPC save_quiz_answers: autosave idempotency and ownership enforcement
-- 7. Atomic RPC submit_quiz_attempt: automatic scoring and status transitions
-- 8. Atomic RPC grade_student_attempt: teacher manual grading and score recalculation
-- 9. Atomic RPC get_quiz_attempt_review: answer protection and review release flags
-- 10. Student anti-tampering direct mutation protection
-- ==============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT extensions.plan(60);

-- -----------------------------------------------------------------------------
-- 1. Deterministic isolated identities
-- -----------------------------------------------------------------------------
INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('11111111-2222-4111-8111-111111111111', 'authenticated', 'authenticated', 'teacher_quiz_owner@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('88888888-2222-4888-8888-888888888888', 'authenticated', 'authenticated', 'teacher_quiz_other@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('99999999-2222-4999-8999-999999999999', 'authenticated', 'authenticated', 'super_admin_quiz@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('22222222-3333-4222-8222-222222222222', 'authenticated', 'authenticated', 'student_quiz1@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('33333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'student_quiz2@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('55555555-3333-4555-8555-555555555555', 'authenticated', 'authenticated', 'student_quiz_inactive@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, role, full_name, full_name_arabic, status)
VALUES
  ('11111111-2222-4111-8111-111111111111', 'teacher', 'Quiz Owner Teacher', 'معلم الاختبارات الرئيسي', 'active'),
  ('88888888-2222-4888-8888-888888888888', 'teacher', 'Other Quiz Teacher', 'معلم اختبارات آخر', 'active'),
  ('99999999-2222-4999-8999-999999999999', 'super_admin', 'Quiz Super Admin', 'مدير النظام للاختبارات', 'active'),
  ('22222222-3333-4222-8222-222222222222', 'student', 'Quiz Student One', 'طالب الاختبار الأول', 'active'),
  ('33333333-3333-4333-8333-333333333333', 'student', 'Quiz Student Two', 'طالب الاختبار الثاني', 'active'),
  ('55555555-3333-4555-8555-555555555555', 'student', 'Quiz Inactive Student', 'طالب غير نشط للاختبار', 'inactive')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. Cohort Groups & Enrollment
-- -----------------------------------------------------------------------------
INSERT INTO public.groups (id, name, name_arabic, max_students, is_active)
VALUES
  ('bbbbbbbb-1111-4111-8111-111111111111', 'Quiz Cohort A', 'دفعة الاختبار أ', 30, true),
  ('bbbbbbbb-2222-4222-8222-222222222222', 'Quiz Cohort B', 'دفعة الاختبار ب', 30, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.group_students (student_id, group_id)
VALUES
  ('22222222-3333-4222-8222-222222222222', 'bbbbbbbb-1111-4111-8111-111111111111'),
  ('55555555-3333-4555-8555-555555555555', 'bbbbbbbb-1111-4111-8111-111111111111'),
  ('33333333-3333-4333-8333-333333333333', 'bbbbbbbb-2222-4222-8222-222222222222')
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- 3. Test Fixture Quizzes and Questions
-- -----------------------------------------------------------------------------
-- Quiz 1: Published Cohort A assessment with objective questions (MCQ + T/F)
INSERT INTO public.quizzes (
  id, teacher_id, group_id, title, title_arabic, duration_minutes,
  passing_score, total_points, max_attempts, is_published, is_archived,
  show_results_immediately, show_correct_answers_after_submission
) VALUES (
  'cccccccc-1111-4111-8111-111111111111',
  '11111111-2222-4111-8111-111111111111',
  'bbbbbbbb-1111-4111-8111-111111111111',
  'Midterm Assessment',
  'اختبار منتصف الفصل',
  30, 60, 20, 2, true, false, true, true
) ON CONFLICT (id) DO NOTHING;

-- Quiz 2: Draft (unpublished) assessment
INSERT INTO public.quizzes (
  id, teacher_id, group_id, title, title_arabic, duration_minutes,
  passing_score, total_points, max_attempts, is_published, is_archived
) VALUES (
  'cccccccc-2222-4111-8111-111111111111',
  '11111111-2222-4111-8111-111111111111',
  'bbbbbbbb-1111-4111-8111-111111111111',
  'Draft Quiz',
  'مسودة اختبار',
  15, 50, 10, 1, false, false
) ON CONFLICT (id) DO NOTHING;

-- Quiz 3: Archived assessment
INSERT INTO public.quizzes (
  id, teacher_id, group_id, title, title_arabic, duration_minutes,
  passing_score, total_points, max_attempts, is_published, is_archived
) VALUES (
  'cccccccc-3333-4111-8111-111111111111',
  '11111111-2222-4111-8111-111111111111',
  'bbbbbbbb-1111-4111-8111-111111111111',
  'Archived Quiz',
  'اختبار مؤرشف',
  15, 50, 10, 1, true, true
) ON CONFLICT (id) DO NOTHING;

-- Quiz 4: Published assessment with Short Answer question requiring manual grading
INSERT INTO public.quizzes (
  id, teacher_id, group_id, title, title_arabic, duration_minutes,
  passing_score, total_points, max_attempts, is_published, is_archived,
  show_results_immediately, show_correct_answers_after_submission
) VALUES (
  'cccccccc-4444-4111-8111-111111111111',
  '11111111-2222-4111-8111-111111111111',
  'bbbbbbbb-1111-4111-8111-111111111111',
  'Essay and Short Answer Exam',
  'امتحان مقالي وقصير',
  45, 70, 25, 1, true, false, false, false
) ON CONFLICT (id) DO NOTHING;

-- Questions for Quiz 1:
-- Q1: Multiple Choice (10 points)
INSERT INTO public.question_bank (
  id, teacher_id, question_text, question_text_arabic, question_type,
  points, explanation, explanation_arabic
) VALUES (
  'dddddddd-1111-4111-8111-111111111111',
  '11111111-2222-4111-8111-111111111111',
  'What is the capital of France?',
  'ما هي عاصمة فرنسا؟',
  'multiple_choice',
  10,
  'Paris is the official capital city of France.',
  'باريس هي العاصمة الرسمية لفرنسا.'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.question_options (id, question_id, option_text, option_text_arabic, is_correct, order_index)
VALUES
  ('eeeeeeee-1111-4111-8111-111111111111', 'dddddddd-1111-4111-8111-111111111111', 'Paris', 'باريس', true, 1),
  ('eeeeeeee-2222-4111-8111-111111111111', 'dddddddd-1111-4111-8111-111111111111', 'London', 'لندن', false, 2),
  ('eeeeeeee-3333-4111-8111-111111111111', 'dddddddd-1111-4111-8111-111111111111', 'Berlin', 'برلين', false, 3)
ON CONFLICT (id) DO NOTHING;

-- Q2: True / False (10 points)
INSERT INTO public.question_bank (
  id, teacher_id, question_text, question_text_arabic, question_type,
  points, explanation, explanation_arabic
) VALUES (
  'dddddddd-2222-4111-8111-111111111111',
  '11111111-2222-4111-8111-111111111111',
  'PostgreSQL supports Row Level Security.',
  'يدعم نظام بوستجرس أمان الصفوف RLS.',
  'true_false',
  10,
  'PostgreSQL has comprehensive RLS support since version 9.5.',
  'يدعم بوستجرس أمان مستوى الصفوف منذ الإصدار 9.5.'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.question_options (id, question_id, option_text, option_text_arabic, is_correct, order_index)
VALUES
  ('eeeeeeee-4444-4111-8111-111111111111', 'dddddddd-2222-4111-8111-111111111111', 'True', 'صواب', true, 1),
  ('eeeeeeee-5555-4111-8111-111111111111', 'dddddddd-2222-4111-8111-111111111111', 'False', 'خطأ', false, 2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.quiz_questions (quiz_id, question_id, order_index, points, is_required)
VALUES
  ('cccccccc-1111-4111-8111-111111111111', 'dddddddd-1111-4111-8111-111111111111', 1, 10, true),
  ('cccccccc-1111-4111-8111-111111111111', 'dddddddd-2222-4111-8111-111111111111', 2, 10, true)
ON CONFLICT DO NOTHING;

-- Question for Quiz 4: Short Answer (25 points)
INSERT INTO public.question_bank (
  id, teacher_id, question_text, question_text_arabic, question_type,
  points, correct_answer_text, grading_guidelines
) VALUES (
  'dddddddd-3333-4111-8111-111111111111',
  '11111111-2222-4111-8111-111111111111',
  'Explain the purpose of database transactions.',
  'اشرح الغرض من المعاملات في قواعد البيانات.',
  'short_answer',
  25,
  'Transactions guarantee ACID properties to maintain data integrity.',
  'المعاملات تضمن خصائص ACID للحفاظ على سلامة البيانات.'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.quiz_questions (quiz_id, question_id, order_index, points, is_required)
VALUES
  ('cccccccc-4444-4111-8111-111111111111', 'dddddddd-3333-4111-8111-111111111111', 1, 25, true)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- PART 1: SCHEMA STRUCTURE & FUNCTION VERIFICATION (12 Assertions)
-- =============================================================================
SELECT extensions.has_column('public', 'quizzes', 'group_id', 'quizzes has group_id');
SELECT extensions.has_column('public', 'quizzes', 'lesson_id', 'quizzes has lesson_id');
SELECT extensions.has_column('public', 'quizzes', 'teacher_id', 'quizzes has teacher_id');
SELECT extensions.has_column('public', 'quizzes', 'total_points', 'quizzes has total_points');
SELECT extensions.has_column('public', 'quizzes', 'show_correct_answers_after_submission', 'quizzes has show_correct_answers_after_submission');
SELECT extensions.has_column('public', 'question_bank', 'teacher_id', 'question_bank has teacher_id');
SELECT extensions.has_column('public', 'question_bank', 'correct_answer_text', 'question_bank has correct_answer_text');
SELECT extensions.has_column('public', 'quiz_attempts', 'question_snapshot', 'quiz_attempts has question_snapshot');
SELECT extensions.has_column('public', 'quiz_attempts', 'expires_at', 'quiz_attempts has expires_at');
SELECT extensions.has_column('public', 'quiz_attempts', 'requires_manual_grading', 'quiz_attempts has requires_manual_grading');
SELECT extensions.has_function('public', 'start_quiz_attempt', ARRAY['uuid'], 'start_quiz_attempt RPC exists');
SELECT extensions.has_function('public', 'submit_quiz_attempt', ARRAY['uuid', 'jsonb'], 'submit_quiz_attempt RPC exists');

-- =============================================================================
-- PART 2: ANONYMOUS RESTRICTIONS & PRIVILEGES (6 Assertions)
-- =============================================================================
SELECT extensions.is(
  has_table_privilege('anon', 'public.quizzes', 'SELECT'),
  false,
  'Anon has NO SELECT privilege on public.quizzes'
);

SELECT extensions.is(
  has_table_privilege('anon', 'public.question_bank', 'SELECT'),
  false,
  'Anon has NO SELECT privilege on public.question_bank'
);

SELECT extensions.is(
  has_table_privilege('anon', 'public.question_options', 'SELECT'),
  false,
  'Anon has NO SELECT privilege on public.question_options'
);

SELECT extensions.is(
  has_table_privilege('anon', 'public.quiz_attempts', 'SELECT'),
  false,
  'Anon has NO SELECT privilege on public.quiz_attempts'
);

SELECT extensions.is(
  has_table_privilege('anon', 'public.student_answers', 'SELECT'),
  false,
  'Anon has NO SELECT privilege on public.student_answers'
);

-- Anon cannot execute start_quiz_attempt RPC
SET ROLE anon;
SELECT extensions.throws_ok(
  $$ SELECT public.start_quiz_attempt('cccccccc-1111-4111-8111-111111111111'::uuid) $$,
  '42501',
  NULL,
  'Anon cannot execute start_quiz_attempt RPC'
);
RESET ROLE;

-- =============================================================================
-- PART 3: TEACHER & STUDENT RLS ISOLATION (8 Assertions)
-- =============================================================================
-- 1. Teacher 1 can see own quiz
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '11111111-2222-4111-8111-111111111111';
SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.quizzes WHERE id = 'cccccccc-1111-4111-8111-111111111111' $$,
  ARRAY[1],
  'Teacher 1 can view own created assessment'
);

-- 2. Teacher 2 cannot view or update Teacher 1 private draft
SET LOCAL "request.jwt.claim.sub" = '88888888-2222-4888-8888-888888888888';
SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.quizzes WHERE teacher_id = '11111111-2222-4111-8111-111111111111' AND id = 'cccccccc-2222-4111-8111-111111111111' $$,
  ARRAY[0],
  'Teacher 2 cannot view Teacher 1 draft quiz'
);

-- 3. Super Admin can view all quizzes
SET LOCAL "request.jwt.claim.sub" = '99999999-2222-4999-8999-999999999999';
SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.quizzes WHERE id = 'cccccccc-1111-4111-8111-111111111111' $$,
  ARRAY[1],
  'Super Admin can view any quiz'
);

-- 4. Student 1 (Cohort A) can view published Quiz 1 (assigned to Cohort A)
SET LOCAL "request.jwt.claim.sub" = '22222222-3333-4222-8222-222222222222';
SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.quizzes WHERE id = 'cccccccc-1111-4111-8111-111111111111' $$,
  ARRAY[1],
  'Enrolled Student 1 can view published Quiz 1'
);

-- 5. Student 2 (Cohort B) cannot view Quiz 1 (assigned strictly to Cohort A)
SET LOCAL "request.jwt.claim.sub" = '33333333-3333-4333-8333-333333333333';
SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.quizzes WHERE id = 'cccccccc-1111-4111-8111-111111111111' $$,
  ARRAY[0],
  'Student 2 not in Cohort A cannot view Quiz 1'
);

-- 6. Student 1 cannot view draft (unpublished) Quiz 2
SET LOCAL "request.jwt.claim.sub" = '22222222-3333-4222-8222-222222222222';
SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.quizzes WHERE id = 'cccccccc-2222-4111-8111-111111111111' $$,
  ARRAY[0],
  'Student 1 cannot view draft quiz'
);

-- 7. Student 1 cannot view archived Quiz 3
SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.quizzes WHERE id = 'cccccccc-3333-4111-8111-111111111111' $$,
  ARRAY[0],
  'Student 1 cannot view archived quiz'
);

-- 8. Student 1 cannot view question_bank directly via SELECT (blocked by RLS)
SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.question_bank WHERE id = 'dddddddd-1111-4111-8111-111111111111' $$,
  ARRAY[0],
  'Student cannot select directly from question_bank'
);
RESET ROLE;

-- =============================================================================
-- PART 4: RPC START_QUIZ_ATTEMPT (8 Assertions)
-- =============================================================================
-- 1. Inactive student cannot start attempt
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '55555555-3333-4555-8555-555555555555';
SELECT extensions.throws_ok(
  $$ SELECT public.start_quiz_attempt('cccccccc-1111-4111-8111-111111111111'::uuid) $$,
  '42501',
  NULL,
  'Inactive student cannot start quiz attempt'
);

-- 2. Ineligible student (Student 2 from Cohort B) cannot start Cohort A quiz
SET LOCAL "request.jwt.claim.sub" = '33333333-3333-4333-8333-333333333333';
SELECT extensions.throws_ok(
  $$ SELECT public.start_quiz_attempt('cccccccc-1111-4111-8111-111111111111'::uuid) $$,
  '42501',
  NULL,
  'Student 2 cannot start attempt for unassigned cohort quiz'
);

-- 3. Student 1 starts attempt successfully
SET LOCAL "request.jwt.claim.sub" = '22222222-3333-4222-8222-222222222222';
SELECT extensions.is(
  (public.start_quiz_attempt('cccccccc-1111-4111-8111-111111111111'::uuid)->>'attempt_number')::int,
  1,
  'Student 1 starts attempt number 1'
);

-- 4. Question snapshot contains 2 questions
SELECT extensions.is(
  jsonb_array_length(public.start_quiz_attempt('cccccccc-1111-4111-8111-111111111111'::uuid)->'question_snapshot'),
  2,
  'Question snapshot contains exactly 2 questions'
);

-- 5. Sanitized snapshot does NOT reveal is_correct in options
SELECT extensions.is(
  (public.start_quiz_attempt('cccccccc-1111-4111-8111-111111111111'::uuid)->'question_snapshot'->0->'options'->0 ? 'is_correct'),
  false,
  'Sanitized question snapshot excludes is_correct key from options'
);

-- 6. Calling start again during active window seamlessly restores existing attempt
SELECT extensions.is(
  (public.start_quiz_attempt('cccccccc-1111-4111-8111-111111111111'::uuid)->>'is_restored')::boolean,
  true,
  'Subsequent start call restores active attempt seamlessly'
);

-- 7. Attempt record exists in public.quiz_attempts with status in_progress
SELECT extensions.results_eq(
  $$ SELECT status FROM public.quiz_attempts WHERE quiz_id = 'cccccccc-1111-4111-8111-111111111111' AND student_id = '22222222-3333-4222-8222-222222222222' LIMIT 1 $$,
  ARRAY['in_progress'],
  'Active attempt record status is in_progress'
);

-- 8. Unpublished quiz cannot be started
SELECT extensions.throws_ok(
  $$ SELECT public.start_quiz_attempt('cccccccc-2222-4111-8111-111111111111'::uuid) $$,
  '42501',
  NULL,
  'Cannot start attempt on draft unpublished quiz'
);
RESET ROLE;

-- =============================================================================
-- PART 5: RPC SAVE_QUIZ_ANSWERS (AUTOSAVE) (6 Assertions)
-- =============================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '22222222-3333-4222-8222-222222222222';

-- 1. Student 1 saves answer for Q1
DO $$
DECLARE
  v_att_id UUID;
  v_ans JSONB;
BEGIN
  SELECT id INTO v_att_id FROM public.quiz_attempts
  WHERE quiz_id = 'cccccccc-1111-4111-8111-111111111111' AND student_id = '22222222-3333-4222-8222-222222222222'
  LIMIT 1;

  v_ans := jsonb_build_array(
    jsonb_build_object(
      'question_id', 'dddddddd-1111-4111-8111-111111111111',
      'selected_option_id', 'eeeeeeee-1111-4111-8111-111111111111'
    )
  );

  PERFORM public.save_quiz_answers(v_att_id, v_ans);
END $$;

SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.student_answers WHERE selected_option_id = 'eeeeeeee-1111-4111-8111-111111111111' $$,
  ARRAY[1],
  'Student 1 answer was saved to student_answers'
);

-- 2. Idempotent autosave update: changing answer for same question maintains 1 row
DO $$
DECLARE
  v_att_id UUID;
  v_ans JSONB;
BEGIN
  SELECT id INTO v_att_id FROM public.quiz_attempts
  WHERE quiz_id = 'cccccccc-1111-4111-8111-111111111111' AND student_id = '22222222-3333-4222-8222-222222222222'
  LIMIT 1;

  v_ans := jsonb_build_array(
    jsonb_build_object(
      'question_id', 'dddddddd-1111-4111-8111-111111111111',
      'selected_option_id', 'eeeeeeee-1111-4111-8111-111111111111'
    ),
    jsonb_build_object(
      'question_id', 'dddddddd-2222-4111-8111-111111111111',
      'selected_option_id', 'eeeeeeee-4444-4111-8111-111111111111'
    )
  );

  PERFORM public.save_quiz_answers(v_att_id, v_ans);
END $$;

SELECT extensions.results_eq(
  $$ SELECT count(*)::int FROM public.student_answers WHERE attempt_id = (SELECT id FROM public.quiz_attempts WHERE quiz_id = 'cccccccc-1111-4111-8111-111111111111' LIMIT 1) $$,
  ARRAY[2],
  'Answers for both questions saved without duplicate rows'
);

-- 3. Student 2 cannot save answers to Student 1 attempt
SET LOCAL "request.jwt.claim.sub" = '33333333-3333-4333-8333-333333333333';
SELECT extensions.throws_ok(
  $$ SELECT public.save_quiz_answers((SELECT id FROM public.quiz_attempts WHERE quiz_id = 'cccccccc-1111-4111-8111-111111111111' LIMIT 1), '[]'::jsonb) $$,
  '42501',
  NULL,
  'Student 2 cannot save answers to Student 1 attempt'
);

-- 4. Saving answers with non-existent attempt throws error
SET LOCAL "request.jwt.claim.sub" = '22222222-3333-4222-8222-222222222222';
SELECT extensions.throws_ok(
  $$ SELECT public.save_quiz_answers('00000000-0000-0000-0000-000000000000'::uuid, '[]'::jsonb) $$,
  'P0002',
  NULL,
  'Saving answers with non-existent attempt throws P0002'
);

-- 5. Student cannot directly insert or update points_awarded in student_answers
SELECT extensions.results_eq(
  $$ UPDATE public.student_answers SET points_awarded = 100 WHERE attempt_id = (SELECT id FROM public.quiz_attempts WHERE quiz_id = 'cccccccc-1111-4111-8111-111111111111' LIMIT 1) RETURNING 1 $$,
  '{}'::int[],
  'Student direct update of points_awarded in student_answers affects 0 rows'
);

-- 6. Student cannot directly update quiz_attempts points_scored
SELECT extensions.results_eq(
  $$ UPDATE public.quiz_attempts SET points_scored = 100 WHERE quiz_id = 'cccccccc-1111-4111-8111-111111111111' RETURNING 1 $$,
  '{}'::int[],
  'Student direct update of points_scored on quiz_attempts affects 0 rows'
);
RESET ROLE;

-- =============================================================================
-- PART 6: RPC SUBMIT_QUIZ_ATTEMPT & AUTO-GRADING (8 Assertions)
-- =============================================================================
-- 1. Student 2 cannot submit Student 1 attempt
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '33333333-3333-4333-8333-333333333333';
SELECT extensions.throws_ok(
  $$ SELECT public.submit_quiz_attempt((SELECT id FROM public.quiz_attempts WHERE quiz_id = 'cccccccc-1111-4111-8111-111111111111' LIMIT 1)) $$,
  '42501',
  NULL,
  'Student 2 cannot submit Student 1 attempt'
);

-- 2. Student 1 submits attempt (both answers are correct: 10 + 10 = 20 pts)
SET LOCAL "request.jwt.claim.sub" = '22222222-3333-4222-8222-222222222222';
SELECT extensions.is(
  (public.submit_quiz_attempt((SELECT id FROM public.quiz_attempts WHERE quiz_id = 'cccccccc-1111-4111-8111-111111111111' LIMIT 1))->>'status'),
  'graded',
  'Objective quiz attempt submitted and automatically marked as graded'
);

-- 3. Score awarded matches total points (20 / 20)
SELECT extensions.results_eq(
  $$ SELECT points_scored FROM public.quiz_attempts WHERE quiz_id = 'cccccccc-1111-4111-8111-111111111111' LIMIT 1 $$,
  ARRAY[20.00::numeric],
  'Points scored is 20.00'
);

-- 4. Percentage score is 100%
SELECT extensions.results_eq(
  $$ SELECT percentage_score FROM public.quiz_attempts WHERE quiz_id = 'cccccccc-1111-4111-8111-111111111111' LIMIT 1 $$,
  ARRAY[100.00::numeric],
  'Percentage score is 100.00%'
);

-- 5. is_passed is true (since percentage 100 >= passing_score 60)
SELECT extensions.results_eq(
  $$ SELECT is_passed FROM public.quiz_attempts WHERE quiz_id = 'cccccccc-1111-4111-8111-111111111111' LIMIT 1 $$,
  ARRAY[true],
  'Assessment is marked as passed'
);

-- 6. requires_manual_grading is false for pure objective quiz
SELECT extensions.results_eq(
  $$ SELECT requires_manual_grading FROM public.quiz_attempts WHERE quiz_id = 'cccccccc-1111-4111-8111-111111111111' LIMIT 1 $$,
  ARRAY[false],
  'requires_manual_grading is false for pure objective quiz'
);

-- 7. Calling submit again is idempotent and returns already_submitted = true
SELECT extensions.is(
  (public.submit_quiz_attempt((SELECT id FROM public.quiz_attempts WHERE quiz_id = 'cccccccc-1111-4111-8111-111111111111' LIMIT 1))->>'already_submitted')::boolean,
  true,
  'Calling submit again is idempotent'
);

-- 8. Saving answers on submitted attempt is rejected
SELECT extensions.throws_ok(
  $$ SELECT public.save_quiz_answers((SELECT id FROM public.quiz_attempts WHERE quiz_id = 'cccccccc-1111-4111-8111-111111111111' LIMIT 1), '[]'::jsonb) $$,
  '42501',
  NULL,
  'Saving answers on a submitted attempt is rejected'
);
RESET ROLE;

-- =============================================================================
-- PART 7: SHORT ANSWER MANUAL GRADING RPC (7 Assertions)
-- =============================================================================
-- 1. Student 1 starts and submits Quiz 4 (Essay/Short Answer)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '22222222-3333-4222-8222-222222222222';

DO $$
DECLARE
  v_att_id UUID;
  v_res JSONB;
BEGIN
  v_res := public.start_quiz_attempt('cccccccc-4444-4111-8111-111111111111'::uuid);
  v_att_id := (v_res->>'attempt_id')::UUID;

  PERFORM public.save_quiz_answers(v_att_id, jsonb_build_array(
    jsonb_build_object(
      'question_id', 'dddddddd-3333-4111-8111-111111111111',
      'answer_text', 'ACID transactions guarantee atomicity and consistency.'
    )
  ));

  PERFORM public.submit_quiz_attempt(v_att_id);
END $$;

SELECT extensions.results_eq(
  $$ SELECT status FROM public.quiz_attempts WHERE quiz_id = 'cccccccc-4444-4111-8111-111111111111' LIMIT 1 $$,
  ARRAY['submitted'],
  'Short answer quiz attempt status is submitted pending review'
);

SELECT extensions.results_eq(
  $$ SELECT requires_manual_grading FROM public.quiz_attempts WHERE quiz_id = 'cccccccc-4444-4111-8111-111111111111' LIMIT 1 $$,
  ARRAY[true],
  'requires_manual_grading is true for short answer quiz'
);

-- 2. Student cannot invoke grade_student_attempt
SELECT extensions.throws_ok(
  $$ SELECT public.grade_student_attempt(
       (SELECT id FROM public.quiz_attempts WHERE quiz_id = 'cccccccc-4444-4111-8111-111111111111' LIMIT 1),
       '[]'::jsonb,
       'Self grade'
     ) $$,
  '42501',
  NULL,
  'Student cannot grade quiz attempt'
);

-- 3. Other Teacher (Teacher 2) cannot grade Teacher 1 attempt
SET LOCAL "request.jwt.claim.sub" = '88888888-2222-4888-8888-888888888888';
SELECT extensions.throws_ok(
  $$ SELECT public.grade_student_attempt(
       (SELECT id FROM public.quiz_attempts WHERE quiz_id = 'cccccccc-4444-4111-8111-111111111111' LIMIT 1),
       '[]'::jsonb,
       'Unauthorized grade'
     ) $$,
  '42501',
  NULL,
  'Teacher 2 cannot grade Teacher 1 assessment attempt'
);

-- 4. Teacher 1 (owner) successfully grades short answer
SET LOCAL "request.jwt.claim.sub" = '11111111-2222-4111-8111-111111111111';
DO $$
DECLARE
  v_att_id UUID;
  v_grades JSONB;
BEGIN
  SELECT id INTO v_att_id FROM public.quiz_attempts
  WHERE quiz_id = 'cccccccc-4444-4111-8111-111111111111' LIMIT 1;

  v_grades := jsonb_build_array(
    jsonb_build_object(
      'question_id', 'dddddddd-3333-4111-8111-111111111111',
      'points_awarded', 22.50,
      'feedback', 'Good clear explanation of ACID properties.'
    )
  );

  PERFORM public.grade_student_attempt(v_att_id, v_grades, 'Well done!');
END $$;

SELECT extensions.results_eq(
  $$ SELECT status FROM public.quiz_attempts WHERE quiz_id = 'cccccccc-4444-4111-8111-111111111111' LIMIT 1 $$,
  ARRAY['graded'],
  'Attempt status transitions to graded after teacher grading'
);

SELECT extensions.results_eq(
  $$ SELECT points_scored FROM public.quiz_attempts WHERE quiz_id = 'cccccccc-4444-4111-8111-111111111111' LIMIT 1 $$,
  ARRAY[22.50::numeric],
  'Points scored updated to 22.50'
);

SELECT extensions.results_eq(
  $$ SELECT teacher_feedback FROM public.student_answers WHERE question_id = 'dddddddd-3333-4111-8111-111111111111' LIMIT 1 $$,
  ARRAY['Good clear explanation of ACID properties.'],
  'Teacher feedback recorded on student answer'
);
RESET ROLE;

-- =============================================================================
-- PART 8: ATTEMPT REVIEW SECURITY & VISIBILITY (5 Assertions)
-- =============================================================================
-- 1. Student 2 cannot review Student 1 attempt
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '33333333-3333-4333-8333-333333333333';
SELECT extensions.throws_ok(
  $$ SELECT public.get_quiz_attempt_review((SELECT id FROM public.quiz_attempts WHERE quiz_id = 'cccccccc-1111-4111-8111-111111111111' LIMIT 1)) $$,
  '42501',
  NULL,
  'Student 2 cannot review Student 1 attempt'
);

-- 2. Student 1 can review completed Quiz 1 attempt
SET LOCAL "request.jwt.claim.sub" = '22222222-3333-4222-8222-222222222222';
SELECT extensions.is(
  (public.get_quiz_attempt_review((SELECT id FROM public.quiz_attempts WHERE quiz_id = 'cccccccc-1111-4111-8111-111111111111' LIMIT 1))->>'status'),
  'graded',
  'Student 1 can review own completed attempt'
);

-- 3. For Quiz 1 (show_correct_answers_after_submission = true), explanations are visible
SELECT extensions.is(
  (public.get_quiz_attempt_review((SELECT id FROM public.quiz_attempts WHERE quiz_id = 'cccccccc-1111-4111-8111-111111111111' LIMIT 1))->'questions'->0->>'explanation'),
  'Paris is the official capital city of France.',
  'Explanation is visible when show_correct_answers_after_submission is true'
);

-- 4. For Quiz 4 (show_correct_answers_after_submission = false), correct_answer_text is hidden (null)
SELECT extensions.is(
  (public.get_quiz_attempt_review((SELECT id FROM public.quiz_attempts WHERE quiz_id = 'cccccccc-4444-4111-8111-111111111111' LIMIT 1))->'questions'->0->>'correct_answer_text'),
  NULL,
  'Correct answer text is hidden when show_correct_answers_after_submission is false'
);

-- 5. Teacher can view complete review including explanations regardless of flag
SET LOCAL "request.jwt.claim.sub" = '11111111-2222-4111-8111-111111111111';
SELECT extensions.is(
  (public.get_quiz_attempt_review((SELECT id FROM public.quiz_attempts WHERE quiz_id = 'cccccccc-4444-4111-8111-111111111111' LIMIT 1))->'questions'->0->>'correct_answer_text'),
  'Transactions guarantee ACID properties to maintain data integrity.',
  'Teacher can view correct answer text on review'
);
RESET ROLE;

-- -----------------------------------------------------------------------------
-- Finish pgTAP Test Suite
-- -----------------------------------------------------------------------------
SELECT * FROM extensions.finish();
ROLLBACK;
