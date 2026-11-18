#!/usr/bin/env bash
set -euo pipefail

: "${DB_URL:?DB_URL must point to the disposable local Supabase database}"

TEACHER_ID="99999999-0001-4000-8000-000000000001"
STUDENT_1_ID="99999999-0001-4000-8000-000000000002"
STUDENT_2_ID="99999999-0001-4000-8000-000000000003"
GROUP_ID="99999999-0002-4000-8000-000000000001"
COURSE_ID="99999999-0003-4000-8000-000000000001"
ASSIGN_ONE="99999999-0004-4000-8000-000000000001"
ASSIGN_TWO="99999999-0004-4000-8000-000000000002"
ASSIGN_INDEP="99999999-0004-4000-8000-000000000003"
ASSIGN_OTHER="99999999-0004-4000-8000-000000000004"

cleanup() {
  psql "$DB_URL" -X -v ON_ERROR_STOP=1 <<SQL || true
    DELETE FROM public.submissions WHERE assignment_id IN ('$ASSIGN_ONE', '$ASSIGN_TWO', '$ASSIGN_INDEP', '$ASSIGN_OTHER');
    DELETE FROM public.assignment_targets WHERE assignment_id IN ('$ASSIGN_ONE', '$ASSIGN_TWO', '$ASSIGN_INDEP', '$ASSIGN_OTHER');
    DELETE FROM public.assignments WHERE id IN ('$ASSIGN_ONE', '$ASSIGN_TWO', '$ASSIGN_INDEP', '$ASSIGN_OTHER');
    DELETE FROM public.group_students WHERE group_id = '$GROUP_ID';
    DELETE FROM public.group_courses WHERE group_id = '$GROUP_ID';
    DELETE FROM public.student_academic_profiles WHERE profile_id IN ('$STUDENT_1_ID', '$STUDENT_2_ID');
    DELETE FROM public.courses WHERE id = '$COURSE_ID';
    DELETE FROM public.groups WHERE id = '$GROUP_ID';
    DELETE FROM public.profiles WHERE id IN ('$TEACHER_ID', '$STUDENT_1_ID', '$STUDENT_2_ID');
    DELETE FROM auth.users WHERE id IN ('$TEACHER_ID', '$STUDENT_1_ID', '$STUDENT_2_ID');
SQL
  rm -f /tmp/wessam-sub-*.log
}
trap cleanup EXIT

psql "$DB_URL" -X -v ON_ERROR_STOP=1 <<SQL
INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('$TEACHER_ID',   'authenticated', 'authenticated', 'conc-sub-teacher@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('$STUDENT_1_ID', 'authenticated', 'authenticated', 'conc-sub-s1@test.invalid',      '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('$STUDENT_2_ID', 'authenticated', 'authenticated', 'conc-sub-s2@test.invalid',      '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, role, full_name, full_name_arabic, status)
VALUES
  ('$TEACHER_ID',   'teacher', 'Concurrency Sub Teacher', 'معلم التزامن', 'active'),
  ('$STUDENT_1_ID', 'student', 'Concurrency Sub Student 1', 'طالب تزامن ١', 'active'),
  ('$STUDENT_2_ID', 'student', 'Concurrency Sub Student 2', 'طالب تزامن ٢', 'active')
ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, status = 'active';

INSERT INTO public.groups (id, name, name_arabic, academic_year, max_students, is_active)
VALUES ('$GROUP_ID', 'Submission Concurrency Group', 'مجموعة تزامن التسليمات', '2026/2027', 30, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.courses (id, teacher_id, title, title_arabic, is_published)
VALUES ('$COURSE_ID', '$TEACHER_ID', 'Submission Concurrency Course', 'مقرر تزامن التسليمات', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.group_courses (group_id, course_id)
VALUES ('$GROUP_ID', '$COURSE_ID')
ON CONFLICT DO NOTHING;

INSERT INTO public.group_students (group_id, student_id)
VALUES
  ('$GROUP_ID', '$STUDENT_1_ID'),
  ('$GROUP_ID', '$STUDENT_2_ID')
ON CONFLICT DO NOTHING;

INSERT INTO public.student_academic_profiles (profile_id, student_number, username, group_id, status)
VALUES
  ('$STUDENT_1_ID', 'CONC-SUB-001', 'conc_sub_s1', '$GROUP_ID', 'active'),
  ('$STUDENT_2_ID', 'CONC-SUB-002', 'conc_sub_s2', '$GROUP_ID', 'active')
ON CONFLICT (profile_id) DO UPDATE SET group_id = EXCLUDED.group_id, status = 'active';

INSERT INTO public.assignments (
  id, teacher_id, course_id, title, title_arabic, instructions,
  due_date, max_score, max_attempts, target_group_id, is_published, status
) VALUES
  ('$ASSIGN_ONE',   '$TEACHER_ID', '$COURSE_ID', 'Max 1 Assignment', 'واجب محاولة واحدة', 'Write', now() + interval '7 days', 100, 1, '$GROUP_ID', true, 'published'),
  ('$ASSIGN_TWO',   '$TEACHER_ID', '$COURSE_ID', 'Max 2 Assignment', 'واجب محاولتين',    'Write', now() + interval '7 days', 100, 2, '$GROUP_ID', true, 'published'),
  ('$ASSIGN_INDEP', '$TEACHER_ID', '$COURSE_ID', 'Indep Assignment', 'واجب مستقل',       'Write', now() + interval '7 days', 100, 1, '$GROUP_ID', true, 'published'),
  ('$ASSIGN_OTHER', '$TEACHER_ID', '$COURSE_ID', 'Other Assignment', 'واجب آخر',         'Write', now() + interval '7 days', 100, 1, '$GROUP_ID', true, 'published')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.assignment_targets (assignment_id, target_type, group_id)
VALUES
  ('$ASSIGN_ONE',   'group', '$GROUP_ID'),
  ('$ASSIGN_TWO',   'group', '$GROUP_ID'),
  ('$ASSIGN_INDEP', 'group', '$GROUP_ID'),
  ('$ASSIGN_OTHER', 'group', '$GROUP_ID')
ON CONFLICT DO NOTHING;
SQL

run_submit() {
  local student_id="$1"
  local assign_id="$2"
  local content="$3"
  local output_file="$4"
  psql "$DB_URL" -X -v ON_ERROR_STOP=1 -c "
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL \"request.jwt.claims\" = '{\"sub\":\"$student_id\",\"role\":\"authenticated\"}';
    SET LOCAL \"request.jwt.claim.sub\" = '$student_id';
    SELECT pg_catalog.pg_sleep(0.25);
    SELECT public.submit_assignment('$assign_id'::uuid, '$content', '[]'::jsonb, NULL);
    COMMIT;
  " >"$output_file" 2>&1
}

# 1. Two concurrent submissions for the same student and max_attempts=1 assignment
set +e
run_submit "$STUDENT_1_ID" "$ASSIGN_ONE" "attempt A" /tmp/wessam-sub-one-a.log &
PID_1=$!
run_submit "$STUDENT_1_ID" "$ASSIGN_ONE" "attempt B" /tmp/wessam-sub-one-b.log &
PID_2=$!
wait "$PID_1"; ST_1=$?
wait "$PID_2"; ST_2=$?
set -e

SUCCESS_ONE=0
[ "$ST_1" -eq 0 ] && SUCCESS_ONE=$((SUCCESS_ONE + 1))
[ "$ST_2" -eq 0 ] && SUCCESS_ONE=$((SUCCESS_ONE + 1))
if [ "$SUCCESS_ONE" -ne 1 ]; then
  echo "Expected exactly 1 concurrent submission to succeed for max_attempts=1; got $SUCCESS_ONE."
  cat /tmp/wessam-sub-one-a.log /tmp/wessam-sub-one-b.log
  exit 1
fi

COUNT_ONE="$(psql "$DB_URL" -X -At -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM public.submissions WHERE assignment_id = '$ASSIGN_ONE' AND student_id = '$STUDENT_1_ID';")"
if [ "$COUNT_ONE" != "1" ]; then
  echo "Expected 1 stored submission for ASSIGN_ONE; got $COUNT_ONE."
  exit 1
fi

# 2. Three concurrent submissions for the same student and max_attempts=2 assignment
set +e
run_submit "$STUDENT_1_ID" "$ASSIGN_TWO" "multi A" /tmp/wessam-sub-two-a.log &
PID_A=$!
run_submit "$STUDENT_1_ID" "$ASSIGN_TWO" "multi B" /tmp/wessam-sub-two-b.log &
PID_B=$!
run_submit "$STUDENT_1_ID" "$ASSIGN_TWO" "multi C" /tmp/wessam-sub-two-c.log &
PID_C=$!
wait "$PID_A"; ST_A=$?
wait "$PID_B"; ST_B=$?
wait "$PID_C"; ST_C=$?
set -e

SUCCESS_TWO=0
[ "$ST_A" -eq 0 ] && SUCCESS_TWO=$((SUCCESS_TWO + 1))
[ "$ST_B" -eq 0 ] && SUCCESS_TWO=$((SUCCESS_TWO + 1))
[ "$ST_C" -eq 0 ] && SUCCESS_TWO=$((SUCCESS_TWO + 1))
if [ "$SUCCESS_TWO" -ne 2 ]; then
  echo "Expected exactly 2 of 3 concurrent submissions to succeed for max_attempts=2; got $SUCCESS_TWO."
  cat /tmp/wessam-sub-two-a.log /tmp/wessam-sub-two-b.log /tmp/wessam-sub-two-c.log
  exit 1
fi

ATTEMPTS_SEQ="$(psql "$DB_URL" -X -At -v ON_ERROR_STOP=1 -c "SELECT string_agg(attempt_number::text, ',' ORDER BY attempt_number) FROM public.submissions WHERE assignment_id = '$ASSIGN_TWO' AND student_id = '$STUDENT_1_ID';")"
if [ "$ATTEMPTS_SEQ" != "1,2" ]; then
  echo "Expected sequential attempt numbers '1,2' for ASSIGN_TWO; got '$ATTEMPTS_SEQ'."
  exit 1
fi

# 3. Different students submit independently to the same assignment without blocking
set +e
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -c "
  BEGIN;
  SET LOCAL ROLE authenticated;
  SET LOCAL \"request.jwt.claims\" = '{\"sub\":\"$STUDENT_1_ID\",\"role\":\"authenticated\"}';
  SET LOCAL \"request.jwt.claim.sub\" = '$STUDENT_1_ID';
  SELECT public.submit_assignment('$ASSIGN_INDEP'::uuid, 'student 1 holds lock', '[]'::jsonb, NULL);
  SELECT pg_catalog.pg_sleep(2.0);
  COMMIT;
" >/tmp/wessam-sub-indep-s1.log 2>&1 &
PID_S1=$!

sleep 0.4
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -c "
  BEGIN;
  SET LOCAL ROLE authenticated;
  SET LOCAL \"request.jwt.claims\" = '{\"sub\":\"$STUDENT_2_ID\",\"role\":\"authenticated\"}';
  SET LOCAL \"request.jwt.claim.sub\" = '$STUDENT_2_ID';
  SET LOCAL statement_timeout = '1200ms';
  SELECT public.submit_assignment('$ASSIGN_INDEP'::uuid, 'student 2 non-blocking', '[]'::jsonb, NULL);
  COMMIT;
" >/tmp/wessam-sub-indep-s2.log 2>&1
ST_S2=$?

wait "$PID_S1"
ST_S1=$?
set -e

if [ "$ST_S1" -ne 0 ] || [ "$ST_S2" -ne 0 ]; then
  echo "Expected different students to submit concurrently without blocking (S1=$ST_S1, S2=$ST_S2)."
  cat /tmp/wessam-sub-indep-s1.log /tmp/wessam-sub-indep-s2.log
  exit 1
fi

# 4. Different assignments for the same student do not block one another
set +e
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -c "
  BEGIN;
  SET LOCAL ROLE authenticated;
  SET LOCAL \"request.jwt.claims\" = '{\"sub\":\"$STUDENT_2_ID\",\"role\":\"authenticated\"}';
  SET LOCAL \"request.jwt.claim.sub\" = '$STUDENT_2_ID';
  SELECT public.submit_assignment('$ASSIGN_ONE'::uuid, 'student 2 on assign one', '[]'::jsonb, NULL);
  SELECT pg_catalog.pg_sleep(2.0);
  COMMIT;
" >/tmp/wessam-sub-assign-a.log 2>&1 &
PID_AA=$!

sleep 0.4
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -c "
  BEGIN;
  SET LOCAL ROLE authenticated;
  SET LOCAL \"request.jwt.claims\" = '{\"sub\":\"$STUDENT_2_ID\",\"role\":\"authenticated\"}';
  SET LOCAL \"request.jwt.claim.sub\" = '$STUDENT_2_ID';
  SET LOCAL statement_timeout = '1200ms';
  SELECT public.submit_assignment('$ASSIGN_OTHER'::uuid, 'student 2 on assign other', '[]'::jsonb, NULL);
  COMMIT;
" >/tmp/wessam-sub-assign-b.log 2>&1
ST_AB=$?

wait "$PID_AA"
ST_AA=$?
set -e

if [ "$ST_AA" -ne 0 ] || [ "$ST_AB" -ne 0 ]; then
  echo "Expected different assignments for the same student not to block one another (AA=$ST_AA, AB=$ST_AB)."
  cat /tmp/wessam-sub-assign-a.log /tmp/wessam-sub-assign-b.log
  exit 1
fi

echo "Submission concurrency tests passed: max_attempts enforced, attempts sequential (1,2), and cross-student/cross-assignment requests non-blocking."
