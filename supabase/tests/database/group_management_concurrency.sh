#!/usr/bin/env bash
set -euo pipefail

: "${DB_URL:?DB_URL must point to the disposable local Supabase database}"

TEACHER_ID="11111111-1111-4111-8111-111111111111"
STUDENT_A_ID="55555555-5555-4555-8555-555555555555"
STUDENT_B_ID="66666666-6666-4666-8666-666666666666"
GROUP_ID="dddddddd-dddd-4ddd-8ddd-ddddddddddd4"

psql "$DB_URL" -X -v ON_ERROR_STOP=1 <<SQL
INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('$TEACHER_ID', 'authenticated', 'authenticated', 'concurrency-teacher@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('$STUDENT_A_ID', 'authenticated', 'authenticated', 'concurrency-a@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('$STUDENT_B_ID', 'authenticated', 'authenticated', 'concurrency-b@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

INSERT INTO public.profiles (id, role, full_name, full_name_arabic, status)
VALUES
  ('$TEACHER_ID', 'teacher', 'Concurrency Teacher', 'مدرس التزامن', 'active'),
  ('$STUDENT_A_ID', 'student', 'Concurrent Student A', 'طالب أ', 'active'),
  ('$STUDENT_B_ID', 'student', 'Concurrent Student B', 'طالب ب', 'active');

INSERT INTO public.groups (id, name, name_arabic, max_students, is_active)
VALUES ('$GROUP_ID', 'Concurrent Capacity One', 'اختبار السعة المتزامن', 1, true);

INSERT INTO public.student_academic_profiles (profile_id, username, student_number)
VALUES
  ('$STUDENT_A_ID', 'concurrent_student_a', 'CONC-001'),
  ('$STUDENT_B_ID', 'concurrent_student_b', 'CONC-002');
SQL

run_enrollment() {
  local student_id="$1"
  local output_file="$2"
  psql "$DB_URL" -X -v ON_ERROR_STOP=1 -c "
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claim.sub = '$TEACHER_ID';
    SELECT pg_catalog.pg_sleep(0.25);
    SELECT public.enroll_student_in_group('$student_id', '$GROUP_ID', true);
    COMMIT;
  " >"$output_file" 2>&1
}

set +e
run_enrollment "$STUDENT_A_ID" /tmp/wessam-enroll-a.log &
PID_A=$!
run_enrollment "$STUDENT_B_ID" /tmp/wessam-enroll-b.log &
PID_B=$!
wait "$PID_A"
STATUS_A=$?
wait "$PID_B"
STATUS_B=$?
set -e

if { [ "$STATUS_A" -eq 0 ] && [ "$STATUS_B" -eq 0 ]; } || { [ "$STATUS_A" -ne 0 ] && [ "$STATUS_B" -ne 0 ]; }; then
  echo "Expected exactly one concurrent enrollment to succeed."
  cat /tmp/wessam-enroll-a.log /tmp/wessam-enroll-b.log
  exit 1
fi

MEMBERSHIP_COUNT="$(psql "$DB_URL" -X -At -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM public.group_students WHERE group_id = '$GROUP_ID';")"
if [ "$MEMBERSHIP_COUNT" != "1" ]; then
  echo "Expected exactly one membership after concurrent enrollment; got $MEMBERSHIP_COUNT."
  cat /tmp/wessam-enroll-a.log /tmp/wessam-enroll-b.log
  exit 1
fi

echo "Concurrent capacity test passed: exactly one enrollment succeeded and group membership count is 1."
