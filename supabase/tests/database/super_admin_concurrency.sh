#!/usr/bin/env bash
set -euo pipefail

: "${DB_URL:?DB_URL must point to the disposable local Supabase database}"

SUPER_A="11111111-1111-4111-8111-111111111191"
SUPER_B="11111111-1111-4111-8111-111111111192"

psql "$DB_URL" -X -v ON_ERROR_STOP=1 <<SQL
-- Ensure isolated fixture state: demote any pre-existing super_admins inside test db?
-- No — create a temporary backup table? Better: work inside a clean test setup or check exact delta.
-- Since disposable CI db has only seeded migrations (no extra active super_admins unless seeded),
-- record baseline active super_admins and temporarily deactivate any baseline super admins ONLY for this test,
-- then restore them on EXIT via trap.
CREATE TABLE IF NOT EXISTS pg_temp._baseline_supers (id UUID);
SQL

# Run inside an isolated setup/teardown wrapper using dedicated fixture IDs and restoring pre-existing super_admins on exit
BASELINE_FILE="/tmp/wessam-baseline-supers.txt"
psql "$DB_URL" -X -At -v ON_ERROR_STOP=1 -c "
  SELECT id FROM public.profiles WHERE role = 'super_admin' AND status = 'active';
" > "$BASELINE_FILE"

cleanup() {
  psql "$DB_URL" -X -v ON_ERROR_STOP=1 <<SQL || true
    DELETE FROM public.audit_logs WHERE entity_id IN ('$SUPER_A', '$SUPER_B');
    DELETE FROM public.profiles WHERE id IN ('$SUPER_A', '$SUPER_B');
    DELETE FROM auth.users WHERE id IN ('$SUPER_A', '$SUPER_B');
SQL
  while IFS= read -r uid; do
    [ -n "$uid" ] || continue
    psql "$DB_URL" -X -v ON_ERROR_STOP=1 -c "
      UPDATE public.profiles SET role = 'super_admin', status = 'active' WHERE id = '$uid';
    " >/dev/null || true
  done < "$BASELINE_FILE"
  rm -f "$BASELINE_FILE" /tmp/wessam-demote-a.log /tmp/wessam-demote-b.log
}
trap cleanup EXIT

psql "$DB_URL" -X -v ON_ERROR_STOP=1 <<SQL
UPDATE public.profiles
SET status = 'inactive'
WHERE role = 'super_admin' AND status = 'active' AND id NOT IN ('$SUPER_A', '$SUPER_B');

INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('$SUPER_A', 'authenticated', 'authenticated', 'conc-super-a@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('$SUPER_B', 'authenticated', 'authenticated', 'conc-super-b@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, role, full_name, full_name_arabic, status)
VALUES
  ('$SUPER_A', 'super_admin', 'Concurrent Super A', 'مشرف تزامن أ', 'active'),
  ('$SUPER_B', 'super_admin', 'Concurrent Super B', 'مشرف تزامن ب', 'active')
ON CONFLICT (id) DO UPDATE SET role = 'super_admin', status = 'active';
SQL

run_demotion() {
  local caller_id="$1"
  local target_id="$2"
  local output_file="$3"
  psql "$DB_URL" -X -v ON_ERROR_STOP=1 -c "
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL \"request.jwt.claim.sub\" = '$caller_id';
    SELECT pg_catalog.pg_sleep(0.25);
    SELECT public.update_staff_account_access('$target_id', 'teacher', 'active', 'concurrency test');
    COMMIT;
  " >"$output_file" 2>&1
}

set +e
run_demotion "$SUPER_A" "$SUPER_B" /tmp/wessam-demote-a.log &
PID_A=$!
run_demotion "$SUPER_B" "$SUPER_A" /tmp/wessam-demote-b.log &
PID_B=$!
wait "$PID_A"
STATUS_A=$?
wait "$PID_B"
STATUS_B=$?
set -e

if { [ "$STATUS_A" -eq 0 ] && [ "$STATUS_B" -eq 0 ]; } || { [ "$STATUS_A" -ne 0 ] && [ "$STATUS_B" -ne 0 ]; }; then
  echo "Expected exactly one concurrent Super Admin demotion to succeed and the second to fail."
  cat /tmp/wessam-demote-a.log /tmp/wessam-demote-b.log
  exit 1
fi

REMAINING_SUPERS="$(psql "$DB_URL" -X -At -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM public.profiles WHERE role = 'super_admin' AND status = 'active';")"
if [ "$REMAINING_SUPERS" -lt 1 ]; then
  echo "Expected at least one active Super Admin after concurrent demotions; got $REMAINING_SUPERS."
  cat /tmp/wessam-demote-a.log /tmp/wessam-demote-b.log
  exit 1
fi

echo "Concurrent Super Admin governance test passed: active Super Admins remaining = $REMAINING_SUPERS."
