-- ==============================================================================
-- WESSAM Academy — Fix Staff Account Status Enum Cast & Validation Mismatch
-- Migration: 20261116000027_fix_staff_account_status_enum.sql
--
-- Remediates GitHub Actions Job 133530685471 failure in super_admin_concurrency.sh:
--   ERROR: column "status" is of type public.account_status_enum
--   but expression is of type text
--   PL/pgSQL function public.update_staff_account_access(uuid,text,text,text)
--
-- Exact changes (preserving exact RPC signature & all governance/security locks):
--  1. Validate p_new_role and p_new_status against actual enum labels while
--     explicitly rejecting NULL, empty, whitespace-only, or unsupported values
--     with SQLSTATE 22023 (fixing NULL NOT IN (...) PL/pgSQL fallthrough).
--  2. Explicitly cast p_new_status::public.account_status_enum when updating
--     public.profiles.status (matching p_new_role::public.user_role_enum).
--  3. Preserve SECURITY DEFINER, OWNER TO postgres, SET search_path = '',
--     SET row_security = off, pg_advisory_xact_lock governance serialization,
--     FOR UPDATE target row lock, active Super Admin / last-Super-Admin guards,
--     audit logging, return contract, and REVOKE/GRANT privileges.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.update_staff_account_access(
    p_target_user_id UUID,
    p_new_role TEXT,
    p_new_status TEXT,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
    v_caller_id UUID;
    v_target RECORD;
    v_active_super_count INT;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Not authenticated' USING ERRCODE = '42501';
    END IF;

    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Forbidden: Only super admins can modify staff roles and access status' USING ERRCODE = '42501';
    END IF;

    IF p_new_role IS NULL OR p_new_role NOT IN ('super_admin', 'teacher') THEN
        RAISE EXCEPTION 'Role must be super_admin or teacher' USING ERRCODE = '22023';
    END IF;

    IF p_new_status IS NULL OR p_new_status NOT IN ('active', 'inactive', 'suspended') THEN
        RAISE EXCEPTION 'Status must be active, inactive, or suspended' USING ERRCODE = '22023';
    END IF;

    -- Serialize concurrent staff-role/super-admin governance updates before reading snapshots
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('wessam.super_admin_governance'));

    SELECT id, role::text AS role, status::text AS status, full_name
    INTO v_target
    FROM public.profiles
    WHERE id = p_target_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target account not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_target.role = 'student' THEN
        RAISE EXCEPTION 'Forbidden: Student accounts cannot be promoted directly via staff access governance' USING ERRCODE = '42501';
    END IF;

    -- Prevent demoting or deactivating the last active Super Admin
    IF v_target.role = 'super_admin' AND v_target.status = 'active'
       AND (p_new_role <> 'super_admin' OR p_new_status <> 'active') THEN
        SELECT COUNT(*)::int INTO v_active_super_count
        FROM public.profiles
        WHERE role = 'super_admin'::public.user_role_enum
          AND status = 'active'::public.account_status_enum
          AND id <> p_target_user_id;

        IF v_active_super_count < 1 THEN
            RAISE EXCEPTION 'Cannot demote or deactivate the last active Super Admin account' USING ERRCODE = 'P0001';
        END IF;
    END IF;

    UPDATE public.profiles
    SET role = p_new_role::public.user_role_enum,
        status = p_new_status::public.account_status_enum,
        updated_at = now()
    WHERE id = p_target_user_id;

    INSERT INTO public.audit_logs (
        actor_id,
        action,
        entity_type,
        entity_id,
        old_data,
        new_data,
        created_at
    ) VALUES (
        v_caller_id,
        'UPDATE_STAFF_ACCESS_POLICY',
        'access_policy',
        p_target_user_id::text,
        jsonb_build_object('role', v_target.role, 'status', v_target.status),
        jsonb_build_object('role', p_new_role, 'status', p_new_status, 'reason', NULLIF(pg_catalog.btrim(COALESCE(p_reason, '')), '')),
        now()
    );

    RETURN jsonb_build_object(
        'id', p_target_user_id,
        'role', p_new_role,
        'status', p_new_status
    );
END;
$$;

ALTER FUNCTION public.update_staff_account_access(UUID, TEXT, TEXT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.update_staff_account_access(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_staff_account_access(UUID, TEXT, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
