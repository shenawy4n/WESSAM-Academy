-- ==============================================================================
-- WESSAM Academy — Migration 9: Secure Group Archive RPC Authorization
-- Version: 20261104000003
--
-- Objective:
-- Neutralize the custom PostgreSQL configuration variable (GUC) vulnerability
-- ('wessam.internal_archive_op') by replacing it with a database-enforced,
-- unforgeable internal authorization table (public.group_archive_authorizations).
--
-- Threat Model & Trust Boundary:
-- 1. Threat:
--    PostgreSQL custom GUC settings (e.g. wessam.*) are user-settable. Any
--    authenticated user (student, teacher, or super admin) could issue:
--    SELECT set_config('wessam.internal_archive_op', 'true', false);
--    and attempt to bypass the archive_group/restore_group RPCs to tamper directly
--    with archive metadata via REST or SQL UPDATE statements.
-- 2. Trusted Authorization Mechanism:
--    - A dedicated internal table `public.group_archive_authorizations` records
--      authorized archive/restore operations.
--    - All privileges are REVOKED from PUBLIC, anon, and authenticated.
--    - Row Level Security (RLS) is ENABLED with zero access policies for users.
--    - Only SECURITY DEFINER functions owned by the database engine (archive_group,
--      restore_group, and the BEFORE UPDATE trigger) have access to insert/consume.
--    - Every authorization ticket is strictly scoped to:
--        a. Exact target group ID (group_id)
--        b. Exact operation ('ARCHIVE' or 'RESTORE')
--        c. Exact current transaction ID (txid_current())
--    - Consumption is ATOMIC and DESTRUCTIVE: the BEFORE UPDATE trigger executes
--      `DELETE ... RETURNING id` upon row transition. Once consumed, the ticket is
--      permanently deleted, preventing replay or multi-update attacks.
--    - If a transaction rolls back, MVCC rolls back the ticket creation.
--    - If a transaction commits, the ticket was already deleted upon consumption.
--    - No lingering or reusable authorization tokens exist in the database.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. INTERNAL PROTECTED AUTHORIZATION TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.group_archive_authorizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    operation TEXT NOT NULL CHECK (operation IN ('ARCHIVE', 'RESTORE')),
    txid BIGINT NOT NULL DEFAULT pg_catalog.txid_current(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp()
);

-- Index for high-performance lookup and locking during trigger execution
CREATE INDEX IF NOT EXISTS idx_group_archive_auth_lookup
    ON public.group_archive_authorizations (group_id, operation, txid);

-- Enforce strict default-deny privileges
REVOKE ALL ON TABLE public.group_archive_authorizations FROM PUBLIC;
REVOKE ALL ON TABLE public.group_archive_authorizations FROM anon;
REVOKE ALL ON TABLE public.group_archive_authorizations FROM authenticated;
GRANT ALL ON TABLE public.group_archive_authorizations TO postgres, service_role;

-- Enable RLS defense-in-depth (zero policies for authenticated / anon)
ALTER TABLE public.group_archive_authorizations ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 2. HARDEN TRIGGER FUNCTION (CONSUME UNFORGEABLE INTERNAL TICKET)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_group_archive_metadata_protection()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_operation TEXT;
    v_consumed_id UUID;
BEGIN
    -- Check if any archive metadata column is being changed
    IF (OLD.archived_at IS DISTINCT FROM NEW.archived_at OR
        OLD.archived_by IS DISTINCT FROM NEW.archived_by OR
        OLD.archive_reason IS DISTINCT FROM NEW.archive_reason) THEN

        -- 1. Caller MUST be authenticated and possess super_admin role
        IF NOT public.is_super_admin() THEN
            RAISE EXCEPTION 'Unauthorized: Direct modification of group archive metadata is prohibited. Use archive_group or restore_group RPCs.' USING ERRCODE = '42501';
        END IF;

        -- 2. Validate row transition and map to expected operation
        IF OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL THEN
            v_operation := 'ARCHIVE';
        ELSIF OLD.archived_at IS NOT NULL AND NEW.archived_at IS NULL THEN
            v_operation := 'RESTORE';
        ELSE
            -- Any partial metadata tampering without valid state transition is rejected
            RAISE EXCEPTION 'Unauthorized: Direct modification of group archive metadata is prohibited. Use archive_group or restore_group RPCs.' USING ERRCODE = '42501';
        END IF;

        -- 3. Atomically consume the single-use authorization ticket matching:
        --    - Exact target group (NEW.id)
        --    - Exact operation (v_operation)
        --    - Exact current transaction ID (txid_current())
        DELETE FROM public.group_archive_authorizations
        WHERE id = (
            SELECT id
            FROM public.group_archive_authorizations
            WHERE group_id = NEW.id
              AND operation = v_operation
              AND txid = pg_catalog.txid_current()
            LIMIT 1
            FOR UPDATE
        )
        RETURNING id INTO v_consumed_id;

        -- 4. If no valid, unconsumed authorization ticket exists, reject immediately
        IF v_consumed_id IS NULL THEN
            RAISE EXCEPTION 'Unauthorized: Direct modification of group archive metadata is prohibited. Use archive_group or restore_group RPCs.' USING ERRCODE = '42501';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_group_archive_metadata_protection() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_group_archive_metadata_protection() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_protect_group_archive_metadata ON public.groups;
CREATE TRIGGER trg_protect_group_archive_metadata
    BEFORE UPDATE ON public.groups
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_group_archive_metadata_protection();

-- ------------------------------------------------------------------------------
-- 3. HARDEN ARCHIVE GROUP RPC (SUPER ADMIN ONLY)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.archive_group(
    p_group_id UUID,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor_id UUID;
    v_name TEXT;
    v_is_active BOOLEAN;
    v_archived_at TIMESTAMPTZ;
    v_clean_reason TEXT;
    v_enrolled_count INT;
BEGIN
    v_actor_id := (auth.uid());

    -- 1. Strict Authentication & Super Admin Check
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Not authenticated' USING ERRCODE = '42501';
    END IF;

    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only super admins can archive groups' USING ERRCODE = '42501';
    END IF;

    -- 2. Validate reason
    v_clean_reason := pg_catalog.btrim(p_reason);
    IF v_clean_reason IS NULL OR v_clean_reason = '' THEN
        RAISE EXCEPTION 'Archive reason is required' USING ERRCODE = '22023';
    END IF;

    -- 3. Lock group row for update to serialize state transitions
    SELECT name, is_active, archived_at INTO v_name, v_is_active, v_archived_at
    FROM public.groups
    WHERE id = p_group_id
    FOR UPDATE;

    IF v_name IS NULL THEN
        RAISE EXCEPTION 'Academic group not found' USING ERRCODE = 'P0002';
    END IF;

    -- 4. Idempotency check: if already archived, return immediately
    IF v_archived_at IS NOT NULL THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', true,
            'message', 'Group is already archived',
            'group_id', p_group_id,
            'archived_at', v_archived_at
        );
    END IF;

    -- 5. Business rule: Cannot archive an inactive group (must be active before archiving)
    IF v_is_active = false THEN
        RAISE EXCEPTION 'Cannot archive an inactive group. Group must be active before archiving' USING ERRCODE = '22023';
    END IF;

    -- Count enrolled students for audit metadata
    SELECT count(*) INTO v_enrolled_count
    FROM public.group_students
    WHERE group_id = p_group_id;

    -- 6. Insert single-use, transaction-bound authorization ticket
    INSERT INTO public.group_archive_authorizations (
        group_id,
        operation,
        txid
    ) VALUES (
        p_group_id,
        'ARCHIVE',
        pg_catalog.txid_current()
    );

    -- 7. Apply soft archive (trigger will atomically consume the authorization ticket)
    UPDATE public.groups
    SET
        archived_at = pg_catalog.now(),
        archived_by = v_actor_id,
        archive_reason = v_clean_reason,
        updated_at = pg_catalog.now()
    WHERE id = p_group_id;

    -- 8. Record atomic audit trail
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, new_data, created_at)
    VALUES (
        v_actor_id,
        'ARCHIVE_GROUP',
        'group',
        p_group_id::TEXT,
        pg_catalog.jsonb_build_object(
            'group_name', v_name,
            'reason', v_clean_reason,
            'enrolled_students_preserved', v_enrolled_count,
            'archived_at', pg_catalog.now()
        ),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'message', 'Group successfully archived',
        'group_id', p_group_id,
        'group_name', v_name,
        'enrolled_students_preserved', v_enrolled_count
    );
END;
$$;

REVOKE ALL ON FUNCTION public.archive_group(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_group(UUID, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 4. HARDEN RESTORE GROUP RPC (SUPER ADMIN ONLY, SETS is_active = TRUE)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restore_group(
    p_group_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor_id UUID;
    v_name TEXT;
    v_archived_at TIMESTAMPTZ;
BEGIN
    v_actor_id := (auth.uid());

    -- 1. Strict Authentication & Super Admin Check
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Not authenticated' USING ERRCODE = '42501';
    END IF;

    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only super admins can restore archived groups' USING ERRCODE = '42501';
    END IF;

    -- 2. Lock group row for update
    SELECT name, archived_at INTO v_name, v_archived_at
    FROM public.groups
    WHERE id = p_group_id
    FOR UPDATE;

    IF v_name IS NULL THEN
        RAISE EXCEPTION 'Academic group not found' USING ERRCODE = 'P0002';
    END IF;

    -- 3. Enforce that group must currently be archived to restore
    IF v_archived_at IS NULL THEN
        RAISE EXCEPTION 'Cannot restore group: Group is not currently archived' USING ERRCODE = '22023';
    END IF;

    -- 4. Insert single-use, transaction-bound authorization ticket
    INSERT INTO public.group_archive_authorizations (
        group_id,
        operation,
        txid
    ) VALUES (
        p_group_id,
        'RESTORE',
        pg_catalog.txid_current()
    );

    -- 5. Restore: Clear archive metadata and reactivate group atomically
    UPDATE public.groups
    SET
        archived_at = NULL,
        archived_by = NULL,
        archive_reason = NULL,
        is_active = true,
        updated_at = pg_catalog.now()
    WHERE id = p_group_id;

    -- 6. Record atomic audit trail
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, new_data, created_at)
    VALUES (
        v_actor_id,
        'RESTORE_GROUP',
        'group',
        p_group_id::TEXT,
        pg_catalog.jsonb_build_object(
            'group_name', v_name,
            'restored_at', pg_catalog.now(),
            'is_active', true
        ),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'message', 'Group successfully restored and reactivated',
        'group_id', p_group_id,
        'group_name', v_name,
        'is_active', true
    );
END;
$$;

REVOKE ALL ON FUNCTION public.restore_group(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_group(UUID) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 5. RE-VERIFY RESTRICTED ACCESS & PRIVILEGES
-- ------------------------------------------------------------------------------
-- Confirm provision_student_tx remains restricted to service_role only
REVOKE ALL ON FUNCTION public.provision_student_tx(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.provision_student_tx(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, UUID) FROM authenticated;
REVOKE ALL ON FUNCTION public.provision_student_tx(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.provision_student_tx(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, UUID) TO service_role;
