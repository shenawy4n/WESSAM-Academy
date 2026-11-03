-- ==============================================================================
-- WESSAM Academy — Migration 6: Student & Group Transactional RPCs
-- Version: 20261103000006
--
-- Objective:
-- Add transactional, security-definer RPCs for student enrollment, group transfer,
-- removal, status updates, and profile updates with atomic audit logging and capacity checks.
--
-- Security Guarantees:
-- 1. All functions are SECURITY DEFINER with SET search_path = ''
-- 2. Authorization strictly requires public.is_teacher() (covers both teacher & super_admin)
-- 3. Enforces group capacity constraints (max_students) and active status
-- 4. Records atomic entries in public.audit_logs
-- 5. Preserves academic records and never cascades deletes to student accounts
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ENROLL STUDENT IN GROUP RPC
-- ------------------------------------------------------------------------------
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
    v_actor_id := (pg_catalog.auth.uid());

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

    -- 3. Verify target group exists and is active (Acquire row lock to serialize concurrent capacity checks)
    SELECT name, max_students INTO v_group_name, v_max_students
    FROM public.groups
    WHERE id = p_group_id AND is_active = true
    FOR UPDATE;

    IF v_group_name IS NULL THEN
        RAISE EXCEPTION 'Target academic group does not exist or is inactive' USING ERRCODE = 'P0002';
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

-- ------------------------------------------------------------------------------
-- 2. REMOVE STUDENT FROM GROUP RPC
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.remove_student_from_group(
    p_student_id UUID,
    p_group_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor_id UUID;
    v_group_name TEXT;
    v_replacement_group_id UUID;
    v_student_name TEXT;
    v_removed_group_id UUID;
BEGIN
    v_actor_id := (pg_catalog.auth.uid());

    -- 1. Authorization check
    IF NOT public.is_teacher() THEN
        RAISE EXCEPTION 'Unauthorized: Only teachers and super admins can manage group enrollments' USING ERRCODE = '42501';
    END IF;

    -- 2. Verify the target profile is a student
    SELECT full_name INTO v_student_name
    FROM public.profiles
    WHERE id = p_student_id AND role = 'student';

    IF v_student_name IS NULL THEN
        RAISE EXCEPTION 'Student record not found or target user is not a student' USING ERRCODE = 'P0002';
    END IF;

    -- 3. Verify the group exists before changing membership
    SELECT name INTO v_group_name
    FROM public.groups
    WHERE id = p_group_id;

    IF v_group_name IS NULL THEN
        RAISE EXCEPTION 'Academic group not found' USING ERRCODE = 'P0002';
    END IF;

    -- 4. Delete exactly one existing membership; fail instead of reporting a false success
    DELETE FROM public.group_students
    WHERE group_id = p_group_id AND student_id = p_student_id
    RETURNING group_id INTO v_removed_group_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Student is not enrolled in the specified group' USING ERRCODE = 'P0002';
    END IF;

    -- 5. If primary group was removed, re-link to another remaining group or NULL
    IF EXISTS (
        SELECT 1 FROM public.student_academic_profiles
        WHERE profile_id = p_student_id AND group_id = p_group_id
    ) THEN
        SELECT group_id INTO v_replacement_group_id
        FROM public.group_students
        WHERE student_id = p_student_id
        ORDER BY joined_at ASC, group_id ASC
        LIMIT 1;

        UPDATE public.student_academic_profiles
        SET group_id = v_replacement_group_id, updated_at = pg_catalog.now()
        WHERE profile_id = p_student_id;
    END IF;

    -- 5. Audit Log
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, old_data, created_at)
    VALUES (
        v_actor_id,
        'REMOVE_STUDENT_GROUP',
        'group_membership',
        p_student_id::TEXT,
        pg_catalog.jsonb_build_object('group_id', p_group_id, 'group_name', v_group_name),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'message', 'Student removed from group'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.remove_student_from_group(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_student_from_group(UUID, UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 3. TRANSFER STUDENT BETWEEN GROUPS RPC
-- ------------------------------------------------------------------------------
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
    v_actor_id := (pg_catalog.auth.uid());

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

    -- 3. Lock both group rows in a deterministic order to serialize capacity
    -- checks and reduce deadlock risk between simultaneous transfers.
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

    SELECT name, max_students INTO v_to_name, v_to_max_students
    FROM public.groups
    WHERE id = p_to_group_id AND is_active = true;

    IF v_to_name IS NULL THEN
        RAISE EXCEPTION 'Destination group does not exist or is inactive' USING ERRCODE = 'P0002';
    END IF;

    -- 4. Require and lock the student's current source membership
    PERFORM 1
    FROM public.group_students
    WHERE group_id = p_from_group_id AND student_id = p_student_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Student is not enrolled in the source group' USING ERRCODE = 'P0002';
    END IF;

    -- Do not silently convert a transfer into a no-op when already enrolled
    -- in the destination group.
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
    VALUES (p_to_group_id, p_student_id, pg_catalog.now())
    ;

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

-- ------------------------------------------------------------------------------
-- 4. UPDATE STUDENT ACCOUNT STATUS RPC
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_student_status(
    p_student_id UUID,
    p_status TEXT,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor_id UUID;
    v_old_status TEXT;
    v_new_status public.account_status_enum;
BEGIN
    v_actor_id := (pg_catalog.auth.uid());

    -- 1. Authorization
    IF NOT public.is_teacher() THEN
        RAISE EXCEPTION 'Unauthorized: Only teachers and super admins can modify student status' USING ERRCODE = '42501';
    END IF;

    -- 2. Validate status argument
    IF p_status NOT IN ('active', 'inactive', 'suspended') THEN
        RAISE EXCEPTION 'Invalid status. Must be active, inactive, or suspended' USING ERRCODE = '22023';
    END IF;
    v_new_status := p_status::public.account_status_enum;

    -- 3. Verify target profile exists and has role 'student' (Strictly prevents touching teachers/admins)
    SELECT status::TEXT INTO v_old_status
    FROM public.profiles
    WHERE id = p_student_id AND role = 'student';

    IF v_old_status IS NULL THEN
        RAISE EXCEPTION 'Target student profile not found or user is not a student' USING ERRCODE = 'P0002';
    END IF;

    -- 4. Update profiles table
    UPDATE public.profiles
    SET status = v_new_status, updated_at = pg_catalog.now()
    WHERE id = p_student_id AND role = 'student';

    -- 5. Sync student_academic_profiles
    UPDATE public.student_academic_profiles
    SET status = v_new_status, updated_at = pg_catalog.now()
    WHERE profile_id = p_student_id;

    -- 6. Sync student_credentials is_active flag (disables login immediately)
    UPDATE public.student_credentials
    SET is_active = (p_status = 'active'), updated_at = pg_catalog.now()
    WHERE profile_id = p_student_id;

    -- 7. Audit Log
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, old_data, new_data, created_at)
    VALUES (
        v_actor_id,
        'UPDATE_STUDENT_STATUS',
        'student',
        p_student_id::TEXT,
        pg_catalog.jsonb_build_object('status', v_old_status),
        pg_catalog.jsonb_build_object('status', p_status, 'reason', p_reason),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'student_id', p_student_id,
        'status', p_status
    );
END;
$$;

REVOKE ALL ON FUNCTION public.update_student_status(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_student_status(UUID, TEXT, TEXT) TO authenticated;

-- ------------------------------------------------------------------------------
-- 5. UPDATE STUDENT DETAILS RPC
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_student_details(
    p_student_id UUID,
    p_full_name TEXT,
    p_full_name_arabic TEXT,
    p_phone TEXT,
    p_student_number TEXT,
    p_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor_id UUID;
BEGIN
    v_actor_id := (pg_catalog.auth.uid());

    IF NOT public.is_teacher() THEN
        RAISE EXCEPTION 'Unauthorized: Only teachers and super admins can update student records' USING ERRCODE = '42501';
    END IF;

    IF p_full_name IS NULL OR pg_catalog.btrim(p_full_name) = '' THEN
        RAISE EXCEPTION 'Student full name is required' USING ERRCODE = '23502';
    END IF;

    -- Update profiles (Strictly role = 'student')
    UPDATE public.profiles
    SET
        full_name = pg_catalog.btrim(p_full_name),
        full_name_arabic = COALESCE(pg_catalog.btrim(p_full_name_arabic), pg_catalog.btrim(p_full_name)),
        phone = NULLIF(pg_catalog.btrim(p_phone), ''),
        updated_at = pg_catalog.now()
    WHERE id = p_student_id AND role = 'student';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Student record not found' USING ERRCODE = 'P0002';
    END IF;

    -- Update academic profile
    UPDATE public.student_academic_profiles
    SET
        student_number = NULLIF(pg_catalog.btrim(p_student_number), ''),
        notes = NULLIF(pg_catalog.btrim(p_notes), ''),
        updated_at = pg_catalog.now()
    WHERE profile_id = p_student_id;

    -- Audit Log
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, new_data, created_at)
    VALUES (
        v_actor_id,
        'UPDATE_STUDENT_PROFILE',
        'student',
        p_student_id::TEXT,
        pg_catalog.jsonb_build_object(
            'full_name', p_full_name,
            'student_number', p_student_number
        ),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.update_student_details(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_student_details(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
