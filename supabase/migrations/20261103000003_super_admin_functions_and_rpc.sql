-- ==============================================================================
-- WESSAM Academy — Migration B: Super Admin Functions, RLS Hardening & Provisioning RPC
-- Version: 20261103000003
-- 
-- Depends on: 20261103000002_add_super_admin_role.sql (committed)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. UPDATED AUTHORIZATION FUNCTIONS
-- ------------------------------------------------------------------------------

-- Update is_teacher to recognize both active 'super_admin' and 'teacher'
CREATE OR REPLACE FUNCTION public.is_teacher()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('super_admin', 'teacher') AND status = 'active'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_teacher() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_teacher() TO authenticated;

-- Dedicated helper for Super Admin specific privileges
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'super_admin' AND status = 'active'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

-- ------------------------------------------------------------------------------
-- 2. HARDENED PROFILES POLICIES (PREVENTING PRIVILEGE ESCALATION)
-- ------------------------------------------------------------------------------

-- Drop previous broad teacher management policy
DROP POLICY IF EXISTS "Teachers insert or update profiles" ON public.profiles;

-- Super Admin can manage all profiles
CREATE POLICY "Super admins manage all profiles" ON public.profiles
    FOR ALL USING (public.is_super_admin());

-- Teachers can update student profiles only (cannot touch other teachers or super_admins)
CREATE POLICY "Teachers update student profiles" ON public.profiles
    FOR UPDATE USING (
      public.is_teacher() AND role = 'student'
    )
    WITH CHECK (
      role = 'student' AND status IN ('active', 'inactive', 'suspended')
    );

-- ------------------------------------------------------------------------------
-- 3. ATOMIC STUDENT PROVISIONING RPC
-- ------------------------------------------------------------------------------
-- Secure transactional database function called by create-student Edge Function.
-- Ensures that Profile, Credentials, Academic Profile, Group Membership, and Audit Logs
-- are created atomically in a single PostgreSQL transaction.

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

    -- 1. Validate Group if provided
    IF p_group_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.groups WHERE id = p_group_id AND is_active = true) THEN
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

    -- 6. Insert Group Student junction if cohort assigned
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

    -- 7. Insert Audit Log
    INSERT INTO public.audit_logs (
        actor_id,
        action,
        entity_type,
        entity_id,
        new_data,
        created_at
    ) VALUES (
        p_actor_id,
        'CREATE_STUDENT_ACCOUNT',
        'student',
        p_student_id,
        jsonb_build_object(
            'username', v_norm_username,
            'student_number', p_student_number,
            'group_id', p_group_id
        ),
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'student_id', p_student_id,
        'username', v_norm_username
    );
END;
$$;

-- Restrict execution solely to the privileged backend service role
REVOKE ALL ON FUNCTION public.provision_student_tx FROM PUBLIC;
REVOKE ALL ON FUNCTION public.provision_student_tx FROM authenticated;
REVOKE ALL ON FUNCTION public.provision_student_tx FROM anon;
GRANT EXECUTE ON FUNCTION public.provision_student_tx TO service_role;
