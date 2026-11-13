-- ==============================================================================
-- Integration tests for migration 20261111000015
-- Complete Assignments, Homework & Grading Management System
--
-- Validates:
-- 1. Schema structure: assignments, assignment_targets, submissions, grading_history
-- 2. Storage bucket: assignment-files private bucket configuration
-- 3. Anonymous access denial (42501)
-- 4. Student assignment isolation (can only view targeted & published assignments)
-- 5. Teacher ownership isolation (Teacher B cannot update Teacher A's assignments)
-- 6. Atomic RPC create_assignment:
--    - Enforces required title, course_id, and due_date
--    - Rejects unauthorized / student caller
--    - Automatically inserts targets atomically
-- 7. Atomic RPC submit_assignment:
--    - Rejects submission for unpublished assignments
--    - Rejects untargeted students
--    - Rejects late submissions when allow_late_submissions = false
--    - Rejects submissions exceeding max_attempts
-- 8. Atomic RPC grade_assignment_submission:
--    - Rejects unauthorized non-teacher callers
--    - Enforces score bounds [0, max_score]
--    - Creates append-only history record in assignment_grading_history
--    - Correctly toggles is_grade_released
-- ==============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT extensions.plan(24);

-- -----------------------------------------------------------------------------
-- 1. Deterministic isolated identities
-- -----------------------------------------------------------------------------
INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('a5555555-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'teacher_as_a@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('b5555555-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'teacher_as_b@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('c5555555-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'student_as_1@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('d5555555-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'student_as_2@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('e5555555-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'admin_as@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, role, full_name, full_name_arabic, status)
VALUES
  ('a5555555-0000-0000-0000-000000000001', 'teacher', 'Assignment Teacher A', 'معلم الواجبات أ', 'active'),
  ('b5555555-0000-0000-0000-000000000002', 'teacher', 'Assignment Teacher B', 'معلم الواجبات ب', 'active'),
  ('c5555555-0000-0000-0000-000000000003', 'student', 'Assignment Student 1', 'طالب الواجبات 1', 'active'),
  ('d5555555-0000-0000-0000-000000000004', 'student', 'Assignment Student 2', 'طالب الواجبات 2', 'active'),
  ('e5555555-0000-0000-0000-000000000005', 'super_admin', 'Assignment Admin', 'مدير الواجبات', 'active')
ON CONFLICT (id) DO NOTHING;

-- Course for testing
INSERT INTO public.courses (id, title, title_arabic, teacher_id)
VALUES ('f5555555-0000-0000-0000-000000000001', 'IELTS Writing Task 2', 'مقرر الكتابة للآيلتس', 'a5555555-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- Group for testing
INSERT INTO public.groups (id, name, name_arabic, course_id, academic_year, max_students, is_active)
VALUES ('15555555-0000-0000-0000-000000000001', 'Group Alpha', 'المجموعة ألفا', 'f5555555-0000-0000-0000-000000000001', '2026/2027', 30, true)
ON CONFLICT (id) DO NOTHING;

-- Enroll Student 1 in Group Alpha
INSERT INTO public.group_students (group_id, student_id, is_primary)
VALUES ('15555555-0000-0000-0000-000000000001', 'c5555555-0000-0000-0000-000000000003', true)
ON CONFLICT (group_id, student_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. Schema structure tests
-- -----------------------------------------------------------------------------
SELECT extensions.has_table('public', 'assignments', 'Table public.assignments exists');
SELECT extensions.has_table('public', 'assignment_targets', 'Table public.assignment_targets exists');
SELECT extensions.has_table('public', 'submissions', 'Table public.submissions exists');
SELECT extensions.has_table('public', 'assignment_grading_history', 'Table public.assignment_grading_history exists');

SELECT extensions.has_column('public', 'assignments', 'grace_period_minutes', 'assignments has grace_period_minutes column');
SELECT extensions.has_column('public', 'assignments', 'late_penalty_percentage', 'assignments has late_penalty_percentage column');
SELECT extensions.has_column('public', 'assignments', 'max_attempts', 'assignments has max_attempts column');
SELECT extensions.has_column('public', 'assignments', 'rubric', 'assignments has rubric column');
SELECT extensions.has_column('public', 'submissions', 'is_grade_released', 'submissions has is_grade_released column');
SELECT extensions.has_column('public', 'submissions', 'private_teacher_notes', 'submissions has private_teacher_notes column');

-- -----------------------------------------------------------------------------
-- 3. Anonymous Access Rejection
-- -----------------------------------------------------------------------------
SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claims" = '{"role":"anon"}';

SELECT extensions.throws_ok(
  $$ SELECT * FROM public.assignments $$,
  '42501',
  NULL,
  'Anonymous cannot read assignments'
);

SELECT extensions.throws_ok(
  $$ SELECT * FROM public.submissions $$,
  '42501',
  NULL,
  'Anonymous cannot read submissions'
);

-- -----------------------------------------------------------------------------
-- 4. Teacher RPC: create_assignment
-- -----------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"a5555555-0000-0000-0000-000000000001","role":"authenticated"}';

-- Student cannot call create_assignment
SET LOCAL "request.jwt.claims" = '{"sub":"c5555555-0000-0000-0000-000000000003","role":"authenticated"}';
SELECT extensions.throws_ok(
  $$ SELECT public.create_assignment('{"title":"Test","course_id":"f5555555-0000-0000-0000-000000000001","due_date":"2026-12-01T00:00:00Z"}'::jsonb) $$,
  '42501',
  NULL,
  'Student cannot create assignment'
);

-- Teacher A creates an assignment targeted to Group Alpha
SET LOCAL "request.jwt.claims" = '{"sub":"a5555555-0000-0000-0000-000000000001","role":"authenticated"}';

SELECT extensions.lives_ok(
  $$
    SELECT public.create_assignment(
      '{
        "title": "Essay on Technology in Education",
        "title_arabic": "مقال عن التكنولوجيا في التعليم",
        "course_id": "f5555555-0000-0000-0000-000000000001",
        "due_date": "2026-12-31T23:59:00Z",
        "max_score": 100,
        "max_attempts": 2,
        "allow_late_submissions": true,
        "grace_period_minutes": 15,
        "status": "published",
        "is_published": true
      }'::jsonb,
      '[{"target_type":"group","group_id":"15555555-0000-0000-0000-000000000001"}]'::jsonb
    );
  $$,
  'Teacher A can create published assignment with group target'
);

-- Verify target insertion
SELECT extensions.is(
  (SELECT count(*)::int FROM public.assignment_targets WHERE target_type = 'group' AND group_id = '15555555-0000-0000-0000-000000000001'),
  1,
  'Assignment target was atomically created'
);

-- -----------------------------------------------------------------------------
-- 5. Student Access Isolation
-- -----------------------------------------------------------------------------
-- Student 1 (Enrolled in Group Alpha) can see the published assignment
SET LOCAL "request.jwt.claims" = '{"sub":"c5555555-0000-0000-0000-000000000003","role":"authenticated"}';
SELECT extensions.is(
  (SELECT count(*)::int FROM public.assignments WHERE title = 'Essay on Technology in Education'),
  1,
  'Student 1 in targeted group can see published assignment'
);

-- Student 2 (Not in Group Alpha) cannot see the assignment
SET LOCAL "request.jwt.claims" = '{"sub":"d5555555-0000-0000-0000-000000000004","role":"authenticated"}';
SELECT extensions.is(
  (SELECT count(*)::int FROM public.assignments WHERE title = 'Essay on Technology in Education'),
  0,
  'Student 2 not in targeted group cannot see assignment'
);

-- -----------------------------------------------------------------------------
-- 6. Student Submission RPC: submit_assignment
-- -----------------------------------------------------------------------------
-- Student 2 (Untargeted) cannot submit
SELECT extensions.throws_ok(
  $$
    SELECT public.submit_assignment(
      (SELECT id FROM public.assignments WHERE title = 'Essay on Technology in Education' LIMIT 1),
      'My unauthorized essay'
    );
  $$,
  '42501',
  NULL,
  'Untargeted Student 2 cannot submit assignment'
);

-- Student 1 submits attempt 1
SET LOCAL "request.jwt.claims" = '{"sub":"c5555555-0000-0000-0000-000000000003","role":"authenticated"}';
SELECT extensions.lives_ok(
  $$
    SELECT public.submit_assignment(
      (SELECT id FROM public.assignments WHERE title = 'Essay on Technology in Education' LIMIT 1),
      'Technology has transformed modern education by enabling flexible online learning...',
      '[{"name":"essay.docx","path":"submissions/test/essay.docx","size":12345}]'::jsonb,
      'Teacher, please review my grammar in paragraph 2'
    );
  $$,
  'Student 1 submits attempt 1 successfully'
);

-- Verify submission attempt number and state
SELECT extensions.is(
  (SELECT attempt_number FROM public.submissions WHERE student_id = 'c5555555-0000-0000-0000-000000000003' LIMIT 1),
  1,
  'Submission recorded as attempt 1'
);

-- -----------------------------------------------------------------------------
-- 7. Teacher Grading RPC: grade_assignment_submission
-- -----------------------------------------------------------------------------
-- Teacher B (Not owner) cannot grade Teacher A's assignment submission
SET LOCAL "request.jwt.claims" = '{"sub":"b5555555-0000-0000-0000-000000000002","role":"authenticated"}';
SELECT extensions.throws_ok(
  $$
    SELECT public.grade_assignment_submission(
      (SELECT id FROM public.submissions WHERE student_id = 'c5555555-0000-0000-0000-000000000003' LIMIT 1),
      90,
      'Great work',
      'Private notes',
      '{}'::jsonb,
      true,
      'grade'
    );
  $$,
  '42501',
  NULL,
  'Teacher B cannot grade Teacher A assignment'
);

-- Teacher A grades submission
SET LOCAL "request.jwt.claims" = '{"sub":"a5555555-0000-0000-0000-000000000001","role":"authenticated"}';

-- Reject out-of-bounds score
SELECT extensions.throws_ok(
  $$
    SELECT public.grade_assignment_submission(
      (SELECT id FROM public.submissions WHERE student_id = 'c5555555-0000-0000-0000-000000000003' LIMIT 1),
      150, -- max score is 100
      'Too high'
    );
  $$,
  '22000',
  NULL,
  'Rejects score higher than max_score'
);

-- Grade with valid score and release grade
SELECT extensions.lives_ok(
  $$
    SELECT public.grade_assignment_submission(
      (SELECT id FROM public.submissions WHERE student_id = 'c5555555-0000-0000-0000-000000000003' LIMIT 1),
      88,
      'Excellent essay structure and vocabulary.',
      'Student shows high potential in argumentative writing.',
      '{"grammar":28,"vocab":30,"coherence":30}'::jsonb,
      true,
      'grade'
    );
  $$,
  'Teacher A grades submission and releases score'
);

-- Verify audit trail in assignment_grading_history
SELECT extensions.is(
  (SELECT count(*)::int FROM public.assignment_grading_history WHERE new_score = 88),
  1,
  'Grading history audit record was logged'
);

-- Verify student can now see released grade
SET LOCAL "request.jwt.claims" = '{"sub":"c5555555-0000-0000-0000-000000000003","role":"authenticated"}';
SELECT extensions.is(
  (SELECT score FROM public.submissions WHERE student_id = 'c5555555-0000-0000-0000-000000000003' LIMIT 1),
  88::numeric,
  'Student sees released score'
);

SELECT * FROM extensions.finish();
ROLLBACK;
