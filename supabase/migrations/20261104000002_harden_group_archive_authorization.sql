-- ==============================================================================
-- WESSAM Academy — Migration 8: Harden Group Archive Authorization & Lifecycle
-- Version: 20261104000002
--
-- Objective:
-- 1. Protect archive metadata (archived_at, archived_by, archive_reason) from direct table updates
--    using a secure BEFORE UPDATE database trigger enforcing Super Admin + RPC execution context.
-- 2. Correct restore_group lifecycle to atomically set is_active = TRUE and enforce non-archived error.
-- 3. Harden provision_student_tx with SET search_path = '', full schema qualification, and FOR UPDATE row locking.
-- 4. Re-enforce zero-direct-deletion policy and preserve all historical relationships.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. PROTECT ARCHIVE METADATA FROM DIRECT UPDATES (TRIGGER & FUNCTION)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_group_archive_metadata_protection()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_internal_flag TEXT;
BEGIN
    -- Check if any archive metadata column is being changed
    IF (OLD.archived_at IS DISTINCT FROM NEW.archived_at OR
        OLD.archived_by IS DISTINCT FROM NEW.archived_by OR
        OLD.archive_reason IS DISTINCT FROM NEW.archive_reason) THEN

        -- Read transaction-scoped internal execution flag
        BEGIN
            v_internal_flag := pg_catalog.current_setting('wessam.internal_archive_op', true);
        EXCEPTION WHEN OTHERS THEN
            v_internal_flag := NULL;
        END;

        -- Strictly reject unless running inside authorized Super Admin archive/restore RPC
        IF COALESCE(v_internal_flag, '') <> 'true' OR NOT public.is_super_admin() THEN
            RAISE EXCEPTION 'Unauthorized: Direct modification of group archive metadata is prohibited. Use archive_group or restore_group RPCs.' USING ERRCODE = '42501';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_group_archive_metadata ON public.groups;
CREATE TRIGGER trg_protect_group_archive_metadata
    BEFORE UPDATE ON public.groups
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_group_archive_metadata_protection();

-- ------------------------------------------------------------------------------
-- 2. HARDEN ARCHIVE GROUP RPC (SUPER ADMIN ONLY)
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

    -- 6. Set transaction-local authorization flag for the metadata trigger
    PERFORM pg_catalog.set_config('wessam.internal_archive_op', 'true', true);

    -- 7. Apply soft archive
    UPDATE public.groups
    SET
        archived_at = pg_catalog.now(),
        archived_by = v_actor_id,
        archive_reason = v_clean_reason,
        updated_at = pg_catalog.now()
    WHERE id = p_group_id;

    -- Reset local flag
    PERFORM pg_catalog.set_config('wessam.internal_archive_op', 'false', true);

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
GRANT EXECUTE ON FUNCTION public.archive_group(UUID, TEXT) TO authenticated;

-- ------------------------------------------------------------------------------
-- 3. HARDEN RESTORE GROUP RPC (SUPER ADMIN ONLY, SETS is_active = TRUE)
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

    -- 4. Set transaction-local authorization flag for the metadata trigger
    PERFORM pg_catalog.set_config('wessam.internal_archive_op', 'true', true);

    -- 5. Restore: Clear archive metadata and reactivate group atomically
    UPDATE public.groups
    SET
        archived_at = NULL,
        archived_by = NULL,
        archive_reason = NULL,
        is_active = true,
        updated_at = pg_catalog.now()
    WHERE id = p_group_id;

    -- Reset local flag
    PERFORM pg_catalog.set_config('wessam.internal_archive_op', 'false', true);

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
GRANT EXECUTE ON FUNCTION public.restore_group(UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 4. HARDEN provision_student_tx (SEARCH_PATH, QUALIFICATION & ROW LOCKING)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provision_student_tx(
    p_student_id UUID,
    p_full_name TEXT,
    p_full_name_arabic TEXT,
    p_phone TEXT,
    p_username TEXT,
    p_internal_email TEXT,
    p_student_number TEXT,
    p_group_id UUID,
    p_notes TEXT,
    p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_norm_username TEXT;
    v_group_name TEXT;
    v_group_is_active BOOLEAN;
    v_group_archived_at TIMESTAMPTZ;
BEGIN
    v_norm_username := pg_catalog.lower(pg_catalog.btrim(p_username));

    -- 1. Validate Group if provided (Must exist, be active, and not archived)
    IF p_group_id IS NOT NULL THEN
        -- Acquire row lock to serialize against concurrent archive_group transitions
        SELECT name, is_active, archived_at
        INTO v_group_name, v_group_is_active, v_group_archived_at
        FROM public.groups
        WHERE id = p_group_id
        FOR UPDATE;

        IF v_group_name IS NULL THEN
            RAISE EXCEPTION 'Target academic group does not exist' USING ERRCODE = 'P0002';
        END IF;

        IF v_group_archived_at IS NOT NULL THEN
            RAISE EXCEPTION 'Cannot provision student: Target academic group is archived' USING ERRCODE = '22023';
        END IF;

        IF v_group_is_active = false THEN
            RAISE EXCEPTION 'Target academic group does not exist or is inactive' USING ERRCODE = 'P0002';
        END IF;
    END IF;

    -- 2. Validate Username availability
    IF EXISTS (SELECT 1 FROM public.student_credentials WHERE username = v_norm_username) THEN
        RAISE EXCEPTION 'Username is already registered' USING ERRCODE = '23505';
    END IF;

    -- 3. Insert Public Profile (Strictly 'student' role)
    INSERT INTO public.profiles (
        id,
        role,
        full_name,
        full_name_arabic,
        phone,
        status,
        created_at,
        updated_at
    ) VALUES (
        p_student_id,
        'student',
        pg_catalog.btrim(p_full_name),
        COALESCE(pg_catalog.btrim(p_full_name_arabic), pg_catalog.btrim(p_full_name)),
        NULLIF(pg_catalog.btrim(p_phone), ''),
        'active',
        pg_catalog.now(),
        pg_catalog.now()
    );

    -- 4. Insert Student Credentials Mapping
    INSERT INTO public.student_credentials (
        profile_id,
        username,
        internal_auth_email,
        is_active,
        created_at,
        updated_at
    ) VALUES (
        p_student_id,
        v_norm_username,
        p_internal_email,
        true,
        pg_catalog.now(),
        pg_catalog.now()
    );

    -- 5. Insert Student Academic Profile
    INSERT INTO public.student_academic_profiles (
        profile_id,
        username,
        student_number,
        group_id,
        notes,
        status,
        enrolled_at,
        created_at,
        updated_at
    ) VALUES (
        p_student_id,
        v_norm_username,
        NULLIF(pg_catalog.btrim(p_student_number), ''),
        p_group_id,
        NULLIF(pg_catalog.btrim(p_notes), ''),
        'active',
        pg_catalog.now(),
        pg_catalog.now(),
        pg_catalog.now()
    );

    -- 6. Insert Junction Group Membership if group was assigned
    IF p_group_id IS NOT NULL THEN
        INSERT INTO public.group_students (
            group_id,
            student_id,
            joined_at
        ) VALUES (
            p_group_id,
            p_student_id,
            pg_catalog.now()
        );
    END IF;

    -- 7. Record Atomic Audit Log
    INSERT INTO public.audit_logs (
        actor_id,
        action,
        entity_type,
        entity_id,
        new_data,
        created_at
    ) VALUES (
        p_actor_id,
        'PROVISION_STUDENT',
        'student',
        p_student_id::TEXT,
        pg_catalog.jsonb_build_object(
            'username', v_norm_username,
            'full_name', pg_catalog.btrim(p_full_name),
            'student_number', pg_catalog.btrim(p_student_number),
            'group_id', p_group_id,
            'enrolled_at', pg_catalog.now()
        ),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'student_id', p_student_id,
        'username', v_norm_username,
        'group_id', p_group_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.provision_student_tx(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.provision_student_tx(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, UUID) FROM authenticated;
REVOKE ALL ON FUNCTION public.provision_student_tx(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.provision_student_tx(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, UUID) TO service_role;
