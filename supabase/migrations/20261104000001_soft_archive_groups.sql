-- ==============================================================================
-- WESSAM Academy — Migration 7: Group Soft Archiving & Direct Deletion Hardening
-- Version: 20261104000001
--
-- Objective:
-- Implement safe, non-destructive soft archiving for academic groups.
-- Prevents hard deletions from orphaning student memberships, breaking live
-- session logs, or losing historical academic records.
--
-- Security Guarantees:
-- 1. All archive & restore RPCs are SECURITY DEFINER with SET search_path = ''
-- 2. Authorization strictly requires public.is_super_admin()
-- 3. Direct DELETE on public.groups is strictly blocked via RESTRICTIVE RLS policy
-- 4. Replaces overly permissive "Teachers manage groups" with granular policies
-- 5. Archived groups cannot be enrollment or transfer targets; transfer-out is preserved
-- 6. Inactive groups cannot be archived (must be active before archiving)
-- 7. Audit log entries are recorded for both ARCHIVE_GROUP and RESTORE_GROUP
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. SCHEMA EXTENSION FOR SOFT ARCHIVING
-- ------------------------------------------------------------------------------
ALTER TABLE public.groups
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES public.profiles(id) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS archive_reason TEXT DEFAULT NULL;

COMMENT ON COLUMN public.groups.archived_at IS 'Timestamp when the group was soft-archived. NULL if active.';
COMMENT ON COLUMN public.groups.archived_by IS 'Super Admin profile UUID who performed the soft archiving.';
COMMENT ON COLUMN public.groups.archive_reason IS 'Administrative rationale for archiving the group cohort.';

-- Optimized indexes for group status filtering and active capacity checking
CREATE INDEX IF NOT EXISTS idx_groups_archived_at
    ON public.groups (archived_at);

CREATE INDEX IF NOT EXISTS idx_groups_active_not_archived
    ON public.groups (id)
    WHERE is_active = true AND archived_at IS NULL;

-- ------------------------------------------------------------------------------
-- 2. RLS POLICY HARDENING: ELIMINATE DIRECT GROUP DELETION
-- ------------------------------------------------------------------------------
-- Drop the overly permissive "Teachers manage groups" policy which permitted FOR ALL (including DELETE)
DROP POLICY IF EXISTS "Teachers manage groups" ON public.groups;

-- Granular permissive policies for teachers & admins
CREATE POLICY "Teachers view all groups" ON public.groups
    FOR SELECT USING (public.is_teacher());

CREATE POLICY "Teachers create groups" ON public.groups
    FOR INSERT WITH CHECK (public.is_teacher());

CREATE POLICY "Teachers update groups" ON public.groups
    FOR UPDATE USING (public.is_teacher()) WITH CHECK (public.is_teacher());

-- Absolute prohibition on hard deletions from public.groups
CREATE POLICY "No direct group deletion" ON public.groups
    AS RESTRICTIVE FOR DELETE USING (false);

-- ------------------------------------------------------------------------------
-- 3. ARCHIVE GROUP RPC (SUPER ADMIN ONLY)
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

    -- 1. Strict Authorization: Super Admin Only
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only super admins can archive groups' USING ERRCODE = '42501';
    END IF;

    -- 2. Validate reason
    v_clean_reason := pg_catalog.btrim(p_reason);
    IF v_clean_reason IS NULL OR v_clean_reason = '' THEN
        RAISE EXCEPTION 'Archive reason is required' USING ERRCODE = '22023';
    END IF;

    -- 3. Lock group row for update to serialize state changes
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

    -- 6. Apply soft archive
    UPDATE public.groups
    SET
        archived_at = pg_catalog.now(),
        archived_by = v_actor_id,
        archive_reason = v_clean_reason,
        updated_at = pg_catalog.now()
    WHERE id = p_group_id;

    -- 7. Record atomic audit trail
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
-- 4. RESTORE GROUP RPC (SUPER ADMIN ONLY)
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

    -- 1. Strict Authorization: Super Admin Only
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only super admins can restore archived groups' USING ERRCODE = '42501';
    END IF;

    -- 2. Lock group row
    SELECT name, archived_at INTO v_name, v_archived_at
    FROM public.groups
    WHERE id = p_group_id
    FOR UPDATE;

    IF v_name IS NULL THEN
        RAISE EXCEPTION 'Academic group not found' USING ERRCODE = 'P0002';
    END IF;

    -- 3. Idempotency check: if not archived, return immediately
    IF v_archived_at IS NULL THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', true,
            'message', 'Group is not archived',
            'group_id', p_group_id
        );
    END IF;

    -- 4. Clear archive metadata
    UPDATE public.groups
    SET
        archived_at = NULL,
        archived_by = NULL,
        archive_reason = NULL,
        updated_at = pg_catalog.now()
    WHERE id = p_group_id;

    -- 5. Record atomic audit trail
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, new_data, created_at)
    VALUES (
        v_actor_id,
        'RESTORE_GROUP',
        'group',
        p_group_id::TEXT,
        pg_catalog.jsonb_build_object(
            'group_name', v_name,
            'restored_at', pg_catalog.now()
        ),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'message', 'Group successfully restored',
        'group_id', p_group_id,
        'group_name', v_name
    );
END;
$$;

REVOKE ALL ON FUNCTION public.restore_group(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_group(UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 5. UPDATE EXISTING RPCS TO REJECT ARCHIVED GROUPS AS TARGETS
-- ------------------------------------------------------------------------------

-- (A) Update enroll_student_in_group
CREATE OR REPLACE FUNCTION public.enroll_student_in_group(
    p_student_id UUID,
    p_group_id UUID,
    p_set_as_primary BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor_id UUID;
    v_group_name TEXT;
    v_max_students INT;
    v_current_count INT;
    v_student_name TEXT;
    v_has_primary BOOLEAN;
BEGIN
    v_actor_id := (auth.uid());

    -- 1. Verify caller authorization
    IF NOT public.is_teacher() THEN
        RAISE EXCEPTION 'Unauthorized: Only teachers and super admins can manage group enrollments' USING ERRCODE = '42501';
    END IF;

    -- 2. Verify target student exists and has 'student' role
    SELECT full_name INTO v_student_name
    FROM public.profiles
    WHERE id = p_student_id AND role = 'student';

    IF v_student_name IS NULL THEN
        RAISE EXCEPTION 'Student record not found or target user is not a student' USING ERRCODE = 'P0002';
    END IF;

    -- 3. Verify target group exists, is active, AND is not archived
    SELECT name, max_students INTO v_group_name, v_max_students
    FROM public.groups
    WHERE id = p_group_id AND is_active = true AND archived_at IS NULL
    FOR UPDATE;

    IF v_group_name IS NULL THEN
        IF EXISTS (SELECT 1 FROM public.groups WHERE id = p_group_id AND archived_at IS NOT NULL) THEN
            RAISE EXCEPTION 'Cannot enroll student: Target academic group is archived' USING ERRCODE = '22023';
        ELSE
            RAISE EXCEPTION 'Target academic group does not exist or is inactive' USING ERRCODE = 'P0002';
        END IF;
    END IF;

    -- 4. Check if student is already enrolled in this group
    IF EXISTS (
        SELECT 1 FROM public.group_students
        WHERE group_id = p_group_id AND student_id = p_student_id
    ) THEN
        RAISE EXCEPTION 'Student is already enrolled in this group' USING ERRCODE = '23505';
    END IF;

    -- 5. Enforce group capacity
    IF v_max_students IS NOT NULL THEN
        SELECT count(*) INTO v_current_count
        FROM public.group_students
        WHERE group_id = p_group_id;

        IF v_current_count >= v_max_students THEN
            RAISE EXCEPTION 'Group capacity limit reached (% of % students)', v_current_count, v_max_students USING ERRCODE = 'P0003';
        END IF;
    END IF;

    -- 6. Insert membership record
    INSERT INTO public.group_students (group_id, student_id, joined_at)
    VALUES (p_group_id, p_student_id, pg_catalog.now());

    -- 7. Sync primary group in student_academic_profiles if requested or if none set
    SELECT (group_id IS NOT NULL) INTO v_has_primary
    FROM public.student_academic_profiles
    WHERE profile_id = p_student_id;

    IF p_set_as_primary OR COALESCE(v_has_primary, false) = false THEN
        UPDATE public.student_academic_profiles
        SET group_id = p_group_id, updated_at = pg_catalog.now()
        WHERE profile_id = p_student_id;
    END IF;

    -- 8. Audit Log
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, new_data, created_at)
    VALUES (
        v_actor_id,
        'ENROLL_STUDENT_GROUP',
        'group_membership',
        p_student_id::TEXT,
        pg_catalog.jsonb_build_object(
            'group_id', p_group_id,
            'group_name', v_group_name,
            'is_primary', (p_set_as_primary OR COALESCE(v_has_primary, false) = false)
        ),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'message', 'Student successfully enrolled in group',
        'student_id', p_student_id,
        'group_id', p_group_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.enroll_student_in_group(UUID, UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enroll_student_in_group(UUID, UUID, BOOLEAN) TO authenticated;

-- (B) Update transfer_student_group
CREATE OR REPLACE FUNCTION public.transfer_student_group(
    p_student_id UUID,
    p_from_group_id UUID,
    p_to_group_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor_id UUID;
    v_to_max_students INT;
    v_to_current_count INT;
    v_from_name TEXT;
    v_to_name TEXT;
    v_student_name TEXT;
BEGIN
    v_actor_id := (auth.uid());

    -- 1. Authorization
    IF NOT public.is_teacher() THEN
        RAISE EXCEPTION 'Unauthorized: Only teachers and super admins can transfer students' USING ERRCODE = '42501';
    END IF;

    IF p_student_id IS NULL OR p_from_group_id IS NULL OR p_to_group_id IS NULL THEN
        RAISE EXCEPTION 'Student, source group, and destination group are required' USING ERRCODE = '22023';
    END IF;

    IF p_from_group_id = p_to_group_id THEN
        RAISE EXCEPTION 'Source and target groups must be different' USING ERRCODE = 'P0001';
    END IF;

    -- 2. Verify the target profile is a student
    SELECT full_name INTO v_student_name
    FROM public.profiles
    WHERE id = p_student_id AND role = 'student';

    IF v_student_name IS NULL THEN
        RAISE EXCEPTION 'Student record not found or target user is not a student' USING ERRCODE = 'P0002';
    END IF;

    -- 3. Lock both group rows in a deterministic order
    PERFORM id
    FROM public.groups
    WHERE id IN (p_from_group_id, p_to_group_id)
    ORDER BY id
    FOR UPDATE;

    SELECT name INTO v_from_name
    FROM public.groups
    WHERE id = p_from_group_id;

    IF v_from_name IS NULL THEN
        RAISE EXCEPTION 'Source group does not exist' USING ERRCODE = 'P0002';
    END IF;

    -- Destination group must be active AND not archived
    SELECT name, max_students INTO v_to_name, v_to_max_students
    FROM public.groups
    WHERE id = p_to_group_id AND is_active = true AND archived_at IS NULL;

    IF v_to_name IS NULL THEN
        IF EXISTS (SELECT 1 FROM public.groups WHERE id = p_to_group_id AND archived_at IS NOT NULL) THEN
            RAISE EXCEPTION 'Cannot transfer student: Destination group is archived' USING ERRCODE = '22023';
        ELSE
            RAISE EXCEPTION 'Destination group does not exist or is inactive' USING ERRCODE = 'P0002';
        END IF;
    END IF;

    -- 4. Require and lock the student's current source membership
    PERFORM 1
    FROM public.group_students
    WHERE group_id = p_from_group_id AND student_id = p_student_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Student is not enrolled in the source group' USING ERRCODE = 'P0002';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.group_students
        WHERE group_id = p_to_group_id AND student_id = p_student_id
    ) THEN
        RAISE EXCEPTION 'Student is already enrolled in the destination group' USING ERRCODE = '23505';
    END IF;

    -- 5. Check capacity in destination group
    IF v_to_max_students IS NOT NULL THEN
        SELECT count(*) INTO v_to_current_count
        FROM public.group_students
        WHERE group_id = p_to_group_id;

        IF v_to_current_count >= v_to_max_students THEN
            RAISE EXCEPTION 'Destination group capacity limit reached' USING ERRCODE = 'P0003';
        END IF;
    END IF;

    -- 6. Delete source membership
    DELETE FROM public.group_students
    WHERE group_id = p_from_group_id AND student_id = p_student_id;

    -- 7. Insert destination membership
    INSERT INTO public.group_students (group_id, student_id, joined_at)
    VALUES (p_to_group_id, p_student_id, pg_catalog.now());

    -- 8. Update primary group if source was primary
    UPDATE public.student_academic_profiles
    SET group_id = p_to_group_id, updated_at = pg_catalog.now()
    WHERE profile_id = p_student_id AND (group_id = p_from_group_id OR group_id IS NULL);

    -- 9. Audit Log
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, old_data, new_data, created_at)
    VALUES (
        v_actor_id,
        'TRANSFER_STUDENT_GROUP',
        'group_membership',
        p_student_id::TEXT,
        pg_catalog.jsonb_build_object('from_group_id', p_from_group_id, 'from_name', v_from_name),
        pg_catalog.jsonb_build_object('to_group_id', p_to_group_id, 'to_name', v_to_name),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'message', 'Student transferred successfully'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_student_group(UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_student_group(UUID, UUID, UUID) TO authenticated;

-- (C) Update provision_student_tx to reject archived target groups
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
SET search_path = public, pg_temp
AS $$
DECLARE
    v_norm_username TEXT;
BEGIN
    v_norm_username := lower(trim(p_username));

    -- 1. Validate Group if provided (Must be active and not archived)
    IF p_group_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.groups WHERE id = p_group_id AND is_active = true AND archived_at IS NULL) THEN
            IF EXISTS (SELECT 1 FROM public.groups WHERE id = p_group_id AND archived_at IS NOT NULL) THEN
                RAISE EXCEPTION 'Cannot provision student: Target academic group is archived' USING ERRCODE = '22023';
            ELSE
                RAISE EXCEPTION 'Target academic group does not exist or is inactive' USING ERRCODE = 'P0002';
            END IF;
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
        trim(p_full_name),
        COALESCE(trim(p_full_name_arabic), trim(p_full_name)),
        NULLIF(trim(p_phone), ''),
        'active',
        now(),
        now()
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
        now(),
        now()
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
        NULLIF(trim(p_student_number), ''),
        p_group_id,
        NULLIF(trim(p_notes), ''),
        'active',
        now(),
        now(),
        now()
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
            now()
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
        jsonb_build_object(
            'username', v_norm_username,
            'full_name', trim(p_full_name),
            'student_number', trim(p_student_number),
            'group_id', p_group_id,
            'enrolled_at', now()
        ),
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'student_id', p_student_id,
        'username', v_norm_username,
        'group_id', p_group_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.provision_student_tx FROM PUBLIC;
REVOKE ALL ON FUNCTION public.provision_student_tx FROM authenticated;
REVOKE ALL ON FUNCTION public.provision_student_tx FROM anon;
GRANT EXECUTE ON FUNCTION public.provision_student_tx TO service_role;
