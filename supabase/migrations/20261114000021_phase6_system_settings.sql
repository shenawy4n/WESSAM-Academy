-- ==============================================================================
-- WESSAM Academy - Migration 20261114000021: Phase 6C System Settings & Governance
-- Forward-only additive migration:
-- 1. public.system_settings table with tiered visibility & non-secret defaults
-- 2. Strict RLS policies: super_admin-only writes, scoped reads
-- 3. Secret-pattern validator & atomic update_system_setting RPC with audit trail
-- 4. Safe staff & role governance RPCs protecting the last active super_admin
-- 5. Hardened audit_logs visibility so teachers cannot view super_admin settings/access logs
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. SYSTEM SETTINGS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.system_settings (
    key TEXT PRIMARY KEY,
    category TEXT NOT NULL CHECK (category IN (
        'academy_info',
        'academic_settings',
        'notification_settings',
        'access_policies',
        'appearance_language',
        'platform_options'
    )),
    visibility TEXT NOT NULL DEFAULT 'super_admin' CHECK (visibility IN (
        'public_authenticated',
        'staff_authenticated',
        'super_admin'
    )),
    value JSONB NOT NULL,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_settings_category ON public.system_settings(category);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.system_settings FROM PUBLIC, anon;
-- Authenticated users can only SELECT according to visibility RLS policies.
-- All mutations MUST go through super_admin-verified SECURITY DEFINER RPCs.
GRANT SELECT ON public.system_settings TO authenticated;

DROP POLICY IF EXISTS "Super admins read all system settings" ON public.system_settings;
CREATE POLICY "Super admins read all system settings"
    ON public.system_settings
    FOR SELECT
    USING (public.is_super_admin());

DROP POLICY IF EXISTS "Teachers read non-restricted system settings" ON public.system_settings;
CREATE POLICY "Teachers read non-restricted system settings"
    ON public.system_settings
    FOR SELECT
    USING (
        public.is_teacher()
        AND visibility IN ('public_authenticated', 'staff_authenticated')
    );

DROP POLICY IF EXISTS "Students read public academy settings" ON public.system_settings;
CREATE POLICY "Students read public academy settings"
    ON public.system_settings
    FOR SELECT
    USING (
        public.is_active_student()
        AND visibility = 'public_authenticated'
    );

-- ------------------------------------------------------------------------------
-- 2. SEED NON-SECRET DEFAULT SETTINGS
-- ------------------------------------------------------------------------------
INSERT INTO public.system_settings (key, category, visibility, value)
VALUES
    (
        'academy_info',
        'academy_info',
        'public_authenticated',
        jsonb_build_object(
            'academy_name_ar', 'أكاديمية الوسام التعليمية',
            'academy_name_en', 'WESSAM Academy',
            'description_ar', 'منصة متكاملة لتعليم اللغة الإنجليزية للطلاب في المملكة العربية السعودية',
            'description_en', 'Comprehensive online English-learning platform for Saudi students',
            'owner_name_ar', 'أ. وسام إبراهيم دراز',
            'owner_name_en', 'Mr. Wessam Ibrahim Draz',
            'contact_email', '',
            'contact_phone', '',
            'logo_url', '',
            'timezone', 'Asia/Riyadh',
            'default_language', 'ar'
        )
    ),
    (
        'academic_settings',
        'academic_settings',
        'staff_authenticated',
        jsonb_build_object(
            'current_academic_year', '2026/2027',
            'academic_term', 'first',
            'default_passing_score', 60,
            'attention_threshold_score', 60,
            'attention_attendance_threshold', 75,
            'default_quiz_max_attempts', 1,
            'default_allow_late_submissions', true,
            'grading_scale', jsonb_build_array(
                jsonb_build_object('label_ar', 'ممتاز', 'label_en', 'Excellent', 'min_pct', 90),
                jsonb_build_object('label_ar', 'جيد جداً', 'label_en', 'Very Good', 'min_pct', 75),
                jsonb_build_object('label_ar', 'جيد', 'label_en', 'Good', 'min_pct', 60),
                jsonb_build_object('label_ar', 'يحتاج متابعة', 'label_en', 'Needs Attention', 'min_pct', 0)
            )
        )
    ),
    (
        'notification_settings',
        'notification_settings',
        'staff_authenticated',
        jsonb_build_object(
            'in_app_notifications_enabled', true,
            'allow_teacher_announcements', true,
            'allow_scheduled_announcements', true,
            'default_announcement_priority', 'normal',
            'notify_on_grade_release', true
        )
    ),
    (
        'access_policies',
        'access_policies',
        'super_admin',
        jsonb_build_object(
            'enforce_active_student_isolation', true,
            'allow_teacher_student_registration', true,
            'require_super_admin_for_settings', true,
            'session_review_audit_enabled', true
        )
    ),
    (
        'appearance_language',
        'appearance_language',
        'public_authenticated',
        jsonb_build_object(
            'default_language', 'ar',
            'force_rtl_for_arabic', true,
            'primary_brand_color', '#14243A',
            'accent_brand_color', '#356AE6',
            'compact_tables', false
        )
    ),
    (
        'platform_options',
        'platform_options',
        'staff_authenticated',
        jsonb_build_object(
            'live_session_default_provider', 'zoom',
            'live_session_default_duration_minutes', 60,
            'max_upload_size_mb', 50,
            'maintenance_banner_enabled', false,
            'maintenance_banner_ar', '',
            'maintenance_banner_en', ''
        )
    )
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 3. SECRET REJECTION HELPER
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.jsonb_contains_forbidden_secret_key(p_payload JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_key TEXT;
    v_val JSONB;
    v_text TEXT;
BEGIN
    IF p_payload IS NULL THEN
        RETURN false;
    END IF;

    IF jsonb_typeof(p_payload) = 'object' THEN
        FOR v_key, v_val IN SELECT key, value FROM jsonb_each(p_payload)
        LOOP
            IF lower(v_key) ~ '(secret|password|passphrase|private_key|api_key|apikey|service_role|anon_key|access_token|refresh_token|bearer)' THEN
                RETURN true;
            END IF;
            IF public.jsonb_contains_forbidden_secret_key(v_val) THEN
                RETURN true;
            END IF;
        END LOOP;
    ELSIF jsonb_typeof(p_payload) = 'array' THEN
        FOR v_val IN SELECT value FROM jsonb_array_elements(p_payload)
        LOOP
            IF public.jsonb_contains_forbidden_secret_key(v_val) THEN
                RETURN true;
            END IF;
        END LOOP;
    ELSIF jsonb_typeof(p_payload) = 'string' THEN
        v_text := p_payload #>> '{}';
        IF v_text ~* '(sk_live_|sk_test_|eyJhbGciOiJIUz|-----BEGIN (RSA |EC |)PRIVATE KEY)' THEN
            RETURN true;
        END IF;
    END IF;

    RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.jsonb_contains_forbidden_secret_key(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jsonb_contains_forbidden_secret_key(JSONB) TO authenticated;

-- ------------------------------------------------------------------------------
-- 4. SUPER-ADMIN ONLY SYSTEM SETTINGS RPCs
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_system_settings_bundle()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
    v_caller_id UUID;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Not authenticated' USING ERRCODE = '42501';
    END IF;

    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Forbidden: Only super admins can access system settings management' USING ERRCODE = '42501';
    END IF;

    RETURN COALESCE((
        SELECT jsonb_object_agg(
            s.key,
            jsonb_build_object(
                'key', s.key,
                'category', s.category,
                'visibility', s.visibility,
                'value', s.value,
                'updated_at', s.updated_at,
                'updated_by', s.updated_by
            )
        )
        FROM public.system_settings s
    ), '{}'::jsonb);
END;
$$;

ALTER FUNCTION public.get_system_settings_bundle() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_system_settings_bundle() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_system_settings_bundle() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_academy_public_config()
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

    RETURN COALESCE((
        SELECT jsonb_object_agg(s.key, s.value)
        FROM public.system_settings s
        WHERE s.visibility = 'public_authenticated'
           OR (public.is_teacher() AND s.visibility = 'staff_authenticated')
           OR public.is_super_admin()
    ), '{}'::jsonb);
END;
$$;

ALTER FUNCTION public.get_academy_public_config() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_academy_public_config() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_academy_public_config() TO authenticated;

CREATE OR REPLACE FUNCTION public.update_system_setting(
    p_key TEXT,
    p_value JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
    v_caller_id UUID;
    v_existing RECORD;
    v_passing NUMERIC;
    v_att_score NUMERIC;
    v_att_attendance NUMERIC;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Not authenticated' USING ERRCODE = '42501';
    END IF;

    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Forbidden: Only super admins can update system settings' USING ERRCODE = '42501';
    END IF;

    IF p_value IS NULL OR jsonb_typeof(p_value) <> 'object' THEN
        RAISE EXCEPTION 'Settings value must be a JSON object' USING ERRCODE = '22023';
    END IF;

    IF public.jsonb_contains_forbidden_secret_key(p_value) THEN
        RAISE EXCEPTION 'Security policy violation: Secret keys, tokens, or passwords cannot be stored in system settings' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_existing
    FROM public.system_settings
    WHERE key = p_key
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unknown system setting key: %', p_key USING ERRCODE = 'P0002';
    END IF;

    -- Domain-specific validations
    IF p_key = 'academy_info' THEN
        IF COALESCE(trim(p_value->>'academy_name_ar'), '') = '' OR COALESCE(trim(p_value->>'academy_name_en'), '') = '' THEN
            RAISE EXCEPTION 'Academy Arabic and English names are required' USING ERRCODE = '22023';
        END IF;
        IF COALESCE(p_value->>'timezone', 'Asia/Riyadh') <> 'Asia/Riyadh' THEN
            RAISE EXCEPTION 'Platform academic timezone must remain Asia/Riyadh' USING ERRCODE = '22023';
        END IF;
        IF COALESCE(p_value->>'default_language', 'ar') NOT IN ('ar', 'en') THEN
            RAISE EXCEPTION 'Default language must be ar or en' USING ERRCODE = '22023';
        END IF;
    ELSIF p_key = 'academic_settings' THEN
        v_passing := COALESCE((p_value->>'default_passing_score')::numeric, 60);
        v_att_score := COALESCE((p_value->>'attention_threshold_score')::numeric, 60);
        v_att_attendance := COALESCE((p_value->>'attention_attendance_threshold')::numeric, 75);
        IF v_passing < 0 OR v_passing > 100 OR v_att_score < 0 OR v_att_score > 100 OR v_att_attendance < 0 OR v_att_attendance > 100 THEN
            RAISE EXCEPTION 'Percentage thresholds must be between 0 and 100' USING ERRCODE = '22023';
        END IF;
        IF COALESCE(trim(p_value->>'current_academic_year'), '') = '' THEN
            RAISE EXCEPTION 'Current academic year is required' USING ERRCODE = '22023';
        END IF;
    ELSIF p_key = 'appearance_language' THEN
        IF COALESCE(p_value->>'default_language', 'ar') NOT IN ('ar', 'en') THEN
            RAISE EXCEPTION 'Default language must be ar or en' USING ERRCODE = '22023';
        END IF;
    ELSIF p_key = 'platform_options' THEN
        IF COALESCE((p_value->>'live_session_default_duration_minutes')::int, 60) < 10
           OR COALESCE((p_value->>'live_session_default_duration_minutes')::int, 60) > 480 THEN
            RAISE EXCEPTION 'Default live session duration must be between 10 and 480 minutes' USING ERRCODE = '22023';
        END IF;
    END IF;

    UPDATE public.system_settings
    SET value = p_value,
        updated_by = v_caller_id,
        updated_at = now()
    WHERE key = p_key;

    -- Append-only sanitized audit log
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
        'UPDATE_SYSTEM_SETTING',
        'system_settings',
        p_key,
        v_existing.value,
        p_value,
        now()
    );

    RETURN jsonb_build_object(
        'key', p_key,
        'category', v_existing.category,
        'visibility', v_existing.visibility,
        'value', p_value,
        'updated_by', v_caller_id,
        'updated_at', now()
    );
END;
$$;

ALTER FUNCTION public.update_system_setting(TEXT, JSONB) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.update_system_setting(TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_system_setting(TEXT, JSONB) TO authenticated;

-- ------------------------------------------------------------------------------
-- 5. STAFF & ACCESS GOVERNANCE (PROTECTING LAST ACTIVE SUPER ADMIN)
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

    IF p_new_role NOT IN ('super_admin', 'teacher') THEN
        RAISE EXCEPTION 'Role must be super_admin or teacher' USING ERRCODE = '22023';
    END IF;

    IF p_new_status NOT IN ('active', 'inactive', 'suspended') THEN
        RAISE EXCEPTION 'Status must be active, inactive, or suspended' USING ERRCODE = '22023';
    END IF;

    SELECT id, role::text AS role, status, full_name
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
        WHERE role = 'super_admin' AND status = 'active' AND id <> p_target_user_id;

        IF v_active_super_count < 1 THEN
            RAISE EXCEPTION 'Cannot demote or deactivate the last active Super Admin account' USING ERRCODE = 'P0001';
        END IF;
    END IF;

    UPDATE public.profiles
    SET role = p_new_role::public.user_role_enum,
        status = p_new_status,
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
        jsonb_build_object('role', p_new_role, 'status', p_new_status, 'reason', NULLIF(trim(COALESCE(p_reason, '')), '')),
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

-- ------------------------------------------------------------------------------
-- 6. HARDEN AUDIT LOGS ACCESS & PROVIDE SUPER-ADMIN SETTINGS AUDIT RPC
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Teachers view audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Super admins view all audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Teachers view non-system audit logs" ON public.audit_logs;

CREATE POLICY "Super admins view all audit logs"
    ON public.audit_logs
    FOR SELECT
    USING (public.is_super_admin());

CREATE POLICY "Teachers view non-system audit logs"
    ON public.audit_logs
    FOR SELECT
    USING (
        public.is_teacher()
        AND entity_type NOT IN ('system_settings', 'access_policy')
    );

CREATE OR REPLACE FUNCTION public.get_system_settings_audit_logs(
    p_limit INT DEFAULT 50,
    p_offset INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
    v_safe_limit INT;
    v_safe_offset INT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Not authenticated' USING ERRCODE = '42501';
    END IF;

    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Forbidden: System settings audit logs require super admin access' USING ERRCODE = '42501';
    END IF;

    v_safe_limit := GREATEST(1, LEAST(COALESCE(p_limit, 50), 100));
    v_safe_offset := GREATEST(0, COALESCE(p_offset, 0));

    RETURN COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
            'id', al.id,
            'actor_id', al.actor_id,
            'actor_name', COALESCE(p.full_name, 'System'),
            'actor_name_arabic', COALESCE(p.full_name_arabic, p.full_name, 'النظام'),
            'actor_role', COALESCE(p.role::text, 'system'),
            'action', al.action,
            'entity_type', al.entity_type,
            'entity_id', al.entity_id,
            'old_data', al.old_data,
            'new_data', al.new_data,
            'created_at', al.created_at
        ) ORDER BY al.created_at DESC)
        FROM (
            SELECT *
            FROM public.audit_logs
            WHERE entity_type IN ('system_settings', 'access_policy')
            ORDER BY created_at DESC
            LIMIT v_safe_limit OFFSET v_safe_offset
        ) al
        LEFT JOIN public.profiles p ON p.id = al.actor_id
    ), '[]'::jsonb);
END;
$$;

ALTER FUNCTION public.get_system_settings_audit_logs(INT, INT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_system_settings_audit_logs(INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_system_settings_audit_logs(INT, INT) TO authenticated;
