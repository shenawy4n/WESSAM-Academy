-- ==============================================================================
-- WESSAM Academy - Migration 20261113000016: Fix Notification Idempotency Index
-- Hotfix: Replace partial unique index on public.notifications(idempotency_key)
-- with a full unique index so ON CONFLICT (idempotency_key) targets succeed.
--
-- Root Cause:
-- Migration 20261109000011 created idx_notifications_idempotency_key as a
-- partial unique index (WHERE idempotency_key IS NOT NULL), while
-- publish_announcement and automated notification triggers use
-- ON CONFLICT (idempotency_key) without the partial-index predicate, raising:
--   42P10: there is no unique or exclusion constraint matching the ON CONFLICT specification
--
-- Safety:
-- - Read-only pre-flight check aborts if duplicate non-NULL keys unexpectedly exist
--   (never mutates or deletes existing notification records).
-- - Standard PostgreSQL unique index treats NULLs as distinct, permitting multiple
--   rows with idempotency_key IS NULL while enforcing uniqueness on non-NULL keys.
-- ==============================================================================

DO $$
DECLARE
    v_duplicate_count INT;
BEGIN
    SELECT COUNT(*)::INT INTO v_duplicate_count
    FROM (
        SELECT idempotency_key
        FROM public.notifications
        WHERE idempotency_key IS NOT NULL
        GROUP BY idempotency_key
        HAVING COUNT(*) > 1
    ) duplicates;

    IF v_duplicate_count > 0 THEN
        RAISE EXCEPTION
            'Cannot create full unique index idx_notifications_idempotency_key: found % duplicate non-NULL idempotency_key group(s) in public.notifications',
            v_duplicate_count;
    END IF;
END $$;

DROP INDEX IF EXISTS public.idx_notifications_idempotency_key;

CREATE UNIQUE INDEX idx_notifications_idempotency_key
    ON public.notifications (idempotency_key);

COMMENT ON INDEX public.idx_notifications_idempotency_key IS
    'Full unique index supporting ON CONFLICT (idempotency_key) across notification triggers and publish_announcement while allowing multiple NULL keys.';
