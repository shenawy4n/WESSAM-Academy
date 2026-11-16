-- ==============================================================================
-- WESSAM Academy — Migration 20261116000024: Super Admin Only Teacher Provisioning
-- Forward-only migration:
-- 1. Adds atomic transactional RPC public.provision_teacher_tx restricted to service_role.
--    - Verifies p_actor_id belongs to an active super_admin in public.profiles.
--    - Enforces hardcoded role = 'teacher' and status = 'active' (cannot provision super_admin).
--    - Enforces case-insensitive email uniqueness with transaction advisory lock.
--    - Inserts public.profiles row and sanitized public.audit_logs record (never logging passwords).
-- 2. Updates public.list_staff_and_access_accounts() to surface p.email to Super Admins.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ATOMIC TEACHER PROVISIONING RPC (SERVICE_ROLE ONLY)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provision_teacher_tx(
    p_teacher_id UUID,
    p_full_name TEXT,
    p_full_name_arabic TEXT,
    p_email TEXT,
    p_phone TEXT,
    p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
    v_actor_role TEXT;
    v_actor_status TEXT;
    v_norm_email TEXT;
    v_norm_full_name TEXT;
    v_resolved_arabic_name TEXT;
    v_norm_phone TEXT;
BEGIN
    IF p_actor_id IS NULL THEN
        RAISE EXCEPTION 'Forbidden: Super Admin actor identity is required' USING ERRCODE = '42501';
    END IF;

    -- Defense-in-depth: strictly verify actor is an active super_admin
    SELECT role::text, status::text
    INTO v_actor_role, v_actor_status
    FROM public.profiles
    WHERE id = p_actor_id;

    IF v_actor_role IS DISTINCT FROM 'super_admin' OR v_actor_status IS DISTINCT FROM 'active' THEN
        RAISE EXCEPTION 'Forbidden: Only verified active super admins can provision teacher accounts' USING ERRCODE = '42501';
    END IF;

    IF p_teacher_id IS NULL THEN
        RAISE EXCEPTION 'Target teacher user ID is required' USING ERRCODE = '22023';
    END IF;

    v_norm_full_name := pg_catalog.btrim(COALESCE(p_full_name, ''));
    IF pg_catalog.char_length(v_norm_full_name) < 2 OR pg_catalog.char_length(v_norm_full_name) > 150 THEN
        RAISE EXCEPTION 'Valid teacher full name (2-150 characters) is required' USING ERRCODE = '22023';
    END IF;

    v_resolved_arabic_name := COALESCE(
        NULLIF(pg_catalog.btrim(COALESCE(p_full_name_arabic, '')), ''),
        v_norm_full_name
    );
    v_norm_phone := NULLIF(pg_catalog.btrim(COALESCE(p_phone, '')), '');

    v_norm_email := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_email, '')));
    IF v_norm_email = '' OR v_norm_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$' THEN
        RAISE EXCEPTION 'A valid email address is required for teacher provisioning' USING ERRCODE = '22023';
    END IF;

    IF v_norm_email LIKE '%@student.wessam-academy.internal' THEN
        RAISE EXCEPTION 'Student internal domain emails cannot be used for teacher accounts' USING ERRCODE = '22023';
    END IF;

    -- Serialize concurrent registrations for the same normalized email
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('wessam.teacher_email:' || v_norm_email));

    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_teacher_id) THEN
        RAISE EXCEPTION 'A profile already exists for this user ID' USING ERRCODE = '23505';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE email IS NOT NULL AND pg_catalog.lower(email) = v_norm_email
    ) THEN
        RAISE EXCEPTION 'An account with this email already exists' USING ERRCODE = '23505';
    END IF;

    -- Insert strictly with hardcoded role = 'teacher' and status = 'active'
    INSERT INTO public.profiles (
        id,
        role,
        full_name,
        full_name_arabic,
        email,
        phone,
        status,
        created_at,
        updated_at
    ) VALUES (
        p_teacher_id,
        'teacher'::public.user_role_enum,
        v_norm_full_name,
        v_resolved_arabic_name,
        v_norm_email,
        v_norm_phone,
        'active'::public.account_status_enum,
        now(),
        now()
    );

    -- Append-only sanitized audit record under entity_type = 'access_policy'
    -- Never store passwords, tokens, or secrets in audit_logs.
    INSERT INTO public.audit_logs (
        actor_id,
        action,
        entity_type,
        entity_id,
        old_data,
        new_data,
        created_at
    ) VALUES (
        p_actor_id,
        'CREATE_TEACHER_ACCOUNT',
        'access_policy',
        p_teacher_id::text,
        NULL,
        jsonb_build_object(
            'role', 'teacher',
            'status', 'active',
            'email', v_norm_email,
            'full_name', v_norm_full_name,
            'full_name_arabic', v_resolved_arabic_name,
            'phone', v_norm_phone
        ),
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'teacher_id', p_teacher_id,
        'email', v_norm_email,
        'full_name', v_norm_full_name,
        'full_name_arabic', v_resolved_arabic_name,
        'role', 'teacher',
        'status', 'active'
    );
END;
$$;

ALTER FUNCTION public.provision_teacher_tx(UUID, TEXT, TEXT, TEXT, TEXT, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.provision_teacher_tx(UUID, TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.provision_teacher_tx(UUID, TEXT, TEXT, TEXT, TEXT, UUID) TO service_role;

-- ------------------------------------------------------------------------------
-- 2. INCLUDE STAFF EMAIL IN SUPER-ADMIN STAFF GOVERNANCE DIRECTORY
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_staff_and_access_accounts()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Not authenticated' USING ERRCODE = '42501';
    END IF;

    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Forbidden: Only super admins can view staff access governance' USING ERRCODE = '42501';
    END IF;

    RETURN jsonb_build_object(
        'staff_accounts', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', p.id,
                'full_name', p.full_name,
                'full_name_arabic', COALESCE(p.full_name_arabic, p.full_name),
                'email', p.email,
                'role', p.role::text,
                'status', p.status,
                'phone', p.phone,
                'created_at', p.created_at,
                'updated_at', p.updated_at
            ) ORDER BY CASE WHEN p.role = 'super_admin' THEN 0 ELSE 1 END, p.full_name ASC)
            FROM public.profiles p
            WHERE p.role IN ('super_admin', 'teacher')
        ), '[]'::jsonb),
        'role_counts', jsonb_build_object(
            'active_super_admins', (SELECT COUNT(*)::int FROM public.profiles WHERE role = 'super_admin' AND status = 'active'),
            'active_teachers', (SELECT COUNT(*)::int FROM public.profiles WHERE role = 'teacher' AND status = 'active'),
            'active_students', (SELECT COUNT(*)::int FROM public.profiles WHERE role = 'student' AND status = 'active'),
            'inactive_or_suspended_students', (SELECT COUNT(*)::int FROM public.profiles WHERE role = 'student' AND status <> 'active')
        )
    );
END;
$$;

ALTER FUNCTION public.list_staff_and_access_accounts() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.list_staff_and_access_accounts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_staff_and_access_accounts() TO authenticated;
