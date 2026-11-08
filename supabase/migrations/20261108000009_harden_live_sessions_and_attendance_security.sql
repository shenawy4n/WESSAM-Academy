-- ==============================================================================
-- WESSAM Academy - Migration 20261108000009: Harden Live Sessions & Attendance Security
-- Phase 4A Security Hardening:
-- 1. Meeting URL Column-Level Protection (Strict Column Privileges)
-- 2. Strict Teacher Session Ownership & Super Admin Unowned Session Boundaries
-- 3. Teacher Cross-Data Isolation for Sessions and Attendance
-- 4. Attendance Validation & Inactive Student Rejection
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. COLUMN-LEVEL SECURITY: MEETING URL PROTECTION
-- ------------------------------------------------------------------------------
-- Revoke entire-table SELECT privilege from authenticated and anon
REVOKE SELECT ON public.live_sessions FROM authenticated, anon, PUBLIC;

-- Explicitly grant SELECT on non-sensitive columns only to authenticated
GRANT SELECT (
    id,
    course_id,
    group_id,
    lesson_id,
    teacher_id,
    title,
    title_arabic,
    description,
    description_arabic,
    start_time,
    end_time,
    duration_minutes,
    provider,
    status,
    teacher_notes,
    created_at,
    updated_at
) ON public.live_sessions TO authenticated;

-- Ensure meeting_url column SELECT is completely inaccessible directly
REVOKE SELECT (meeting_url) ON public.live_sessions FROM authenticated, anon, PUBLIC;

-- Maintain write permissions for authenticated users (inserts/updates/deletes are governed by RLS)
GRANT INSERT, UPDATE, DELETE ON public.live_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance TO authenticated;

-- Ensure anon has zero permissions on live_sessions and attendance
REVOKE ALL ON public.live_sessions FROM anon;
REVOKE ALL ON public.attendance FROM anon;

-- ------------------------------------------------------------------------------
-- 2. REFINED RECURSION-FREE AUTHORIZATION HELPERS
-- ------------------------------------------------------------------------------

-- Helper: Verify teacher ownership or super_admin access for live sessions
-- Strict rule: Unowned sessions (teacher_id IS NULL) are reserved for super admin only
CREATE OR REPLACE FUNCTION public.can_manage_live_session(p_session_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
BEGIN
    IF p_session_id IS NULL OR auth.uid() IS NULL THEN
        RETURN false;
    END IF;

    IF public.is_super_admin() THEN
        RETURN true;
    END IF;

    IF NOT public.is_teacher() THEN
        RETURN false;
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM public.live_sessions s
        WHERE s.id = p_session_id
          AND s.teacher_id = auth.uid()
    );
END;
$$;

ALTER FUNCTION public.can_manage_live_session(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.can_manage_live_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_live_session(uuid) TO authenticated;

-- Helper: Retrieve authorized meeting link with strict boundary enforcement
-- Super Admin can retrieve any meeting link.
-- Teachers can only retrieve links for sessions they own (teacher_id = caller).
-- Active students can retrieve links for non-cancelled sessions of groups they belong to.
CREATE OR REPLACE FUNCTION public.get_session_meeting_link(p_session_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
    v_caller_id uuid;
    v_session record;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Not authenticated' USING ERRCODE = '42501';
    END IF;

    SELECT id, teacher_id, group_id, meeting_url, status
    INTO v_session
    FROM public.live_sessions
    WHERE id = p_session_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Live session not found' USING ERRCODE = 'P0002';
    END IF;

    -- 1. Super Admin access
    IF public.is_super_admin() THEN
        RETURN v_session.meeting_url;
    END IF;

    -- 2. Owning Teacher access: strictly teacher_id = v_caller_id (unowned sessions require super admin)
    IF public.is_teacher() AND v_session.teacher_id IS NOT NULL AND v_session.teacher_id = v_caller_id THEN
        RETURN v_session.meeting_url;
    END IF;

    -- 3. Active Student access: must have role=student AND status=active AND belong to group
    IF public.is_active_student() THEN
        IF v_session.group_id IS NOT NULL AND public.is_student_in_group(v_session.group_id) THEN
            IF v_session.status = 'cancelled' THEN
                RETURN NULL;
            END IF;
            RETURN v_session.meeting_url;
        END IF;
    END IF;

    RAISE EXCEPTION 'Forbidden: You are not authorized to access this meeting link' USING ERRCODE = '42501';
END;
$$;

ALTER FUNCTION public.get_session_meeting_link(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_session_meeting_link(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_session_meeting_link(uuid) TO authenticated;

-- ------------------------------------------------------------------------------
-- 3. ATTENDANCE ENROLLMENT & ACTIVE STATUS VALIDATION TRIGGER
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_attendance_student_enrollment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_session_group_id UUID;
    v_is_enrolled_and_active BOOLEAN;
BEGIN
    -- Retrieve the assigned group for this session
    SELECT group_id INTO v_session_group_id
    FROM public.live_sessions
    WHERE id = NEW.session_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Live session not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_session_group_id IS NULL THEN
        RAISE EXCEPTION 'Cannot record attendance for a session without an assigned group' USING ERRCODE = '22000';
    END IF;

    -- Verify the student exists in profiles, role = 'student', status = 'active', and is enrolled in the session's group
    SELECT EXISTS (
        SELECT 1
        FROM public.group_students gs
        JOIN public.profiles p ON p.id = gs.student_id
        WHERE gs.group_id = v_session_group_id
          AND gs.student_id = NEW.student_id
          AND p.role = 'student'
          AND p.status = 'active'
    ) INTO v_is_enrolled_and_active;

    IF NOT v_is_enrolled_and_active THEN
        RAISE EXCEPTION 'Student is not enrolled or active in the group assigned to this live session' USING ERRCODE = '22000';
    END IF;

    RETURN NEW;
END;
$$;

ALTER FUNCTION public.validate_attendance_student_enrollment() OWNER TO postgres;

-- ------------------------------------------------------------------------------
-- 4. ATOMIC ATTENDANCE BATCH RPC HARDENING
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_session_attendance(
    p_session_id UUID,
    p_records JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID;
    v_session RECORD;
    v_item JSONB;
    v_student_id UUID;
    v_status TEXT;
    v_notes TEXT;
    v_recorded_count INT := 0;
    v_is_valid_student BOOLEAN;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Not authenticated' USING ERRCODE = '42501';
    END IF;

    IF NOT (public.is_teacher() OR public.is_super_admin()) THEN
        RAISE EXCEPTION 'Forbidden: Only teachers and super admins can record attendance' USING ERRCODE = '42501';
    END IF;

    SELECT id, teacher_id, group_id, status
    INTO v_session
    FROM public.live_sessions
    WHERE id = p_session_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Live session not found' USING ERRCODE = 'P0002';
    END IF;

    -- Strict ownership: if unowned (teacher_id IS NULL), only super admin can manage
    IF v_session.teacher_id IS NULL THEN
        IF NOT public.is_super_admin() THEN
            RAISE EXCEPTION 'Forbidden: Only super admin can manage unowned sessions' USING ERRCODE = '42501';
        END IF;
    ELSIF v_session.teacher_id <> v_caller_id AND NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Forbidden: You do not have permission to manage this session' USING ERRCODE = '42501';
    END IF;

    IF v_session.group_id IS NULL THEN
        RAISE EXCEPTION 'Cannot record attendance for a session without an assigned group' USING ERRCODE = '22000';
    END IF;

    IF p_records IS NULL OR jsonb_typeof(p_records) <> 'array' THEN
        RAISE EXCEPTION 'Invalid attendance records: expected a JSON array' USING ERRCODE = '22000';
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_records)
    LOOP
        v_student_id := (v_item->>'student_id')::UUID;
        v_status := v_item->>'status';
        v_notes := NULLIF(trim(COALESCE(v_item->>'notes', '')), '');

        IF v_student_id IS NULL THEN
            RAISE EXCEPTION 'Each record must provide a valid student_id' USING ERRCODE = '22000';
        END IF;

        IF v_status NOT IN ('present', 'absent', 'late', 'excused') THEN
            RAISE EXCEPTION 'Invalid attendance status "%" for student %', v_status, v_student_id USING ERRCODE = '22000';
        END IF;

        -- Verify student is active and enrolled in the session group
        SELECT EXISTS (
            SELECT 1
            FROM public.group_students gs
            JOIN public.profiles p ON p.id = gs.student_id
            WHERE gs.group_id = v_session.group_id
              AND gs.student_id = v_student_id
              AND p.role = 'student'
              AND p.status = 'active'
        ) INTO v_is_valid_student;

        IF NOT v_is_valid_student THEN
            RAISE EXCEPTION 'Student % is not actively enrolled in the session group', v_student_id USING ERRCODE = '22000';
        END IF;

        INSERT INTO public.attendance (
            session_id,
            student_id,
            status,
            notes,
            marked_by,
            recorded_at,
            updated_at
        ) VALUES (
            p_session_id,
            v_student_id,
            v_status::public.attendance_status_enum,
            v_notes,
            v_caller_id,
            now(),
            now()
        )
        ON CONFLICT (session_id, student_id)
        DO UPDATE SET
            status = EXCLUDED.status,
            notes = EXCLUDED.notes,
            marked_by = v_caller_id,
            updated_at = now();

        v_recorded_count := v_recorded_count + 1;
    END LOOP;

    -- Audit log entry
    INSERT INTO public.audit_logs (
        actor_id,
        action,
        entity_type,
        entity_id,
        new_data,
        created_at
    ) VALUES (
        v_caller_id,
        'RECORD_SESSION_ATTENDANCE',
        'attendance',
        p_session_id::text,
        jsonb_build_object(
            'session_id', p_session_id,
            'records_count', v_recorded_count
        ),
        now()
    );

    RETURN jsonb_build_object(
        'session_id', p_session_id,
        'records_recorded', v_recorded_count
    );
END;
$$;

ALTER FUNCTION public.record_session_attendance(UUID, JSONB) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.record_session_attendance(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_session_attendance(UUID, JSONB) TO authenticated;

-- ------------------------------------------------------------------------------
-- 5. RLS POLICIES HARDENING: LIVE SESSIONS
-- ------------------------------------------------------------------------------
-- Teachers view only their own sessions; super admin views all
DROP POLICY IF EXISTS "Teachers view live sessions" ON public.live_sessions;
CREATE POLICY "Teachers view live sessions" ON public.live_sessions
    FOR SELECT TO authenticated
    USING (
        (public.is_teacher() AND teacher_id = auth.uid())
        OR public.is_super_admin()
    );

-- Teachers insert only sessions where teacher_id = auth.uid(); super admin any
DROP POLICY IF EXISTS "Teachers insert live sessions" ON public.live_sessions;
CREATE POLICY "Teachers insert live sessions" ON public.live_sessions
    FOR INSERT TO authenticated
    WITH CHECK (
        (public.is_teacher() AND teacher_id = auth.uid())
        OR public.is_super_admin()
    );

-- Teachers update only their own sessions; super admin any
DROP POLICY IF EXISTS "Teachers update live sessions" ON public.live_sessions;
CREATE POLICY "Teachers update live sessions" ON public.live_sessions
    FOR UPDATE TO authenticated
    USING (
        (public.is_teacher() AND teacher_id = auth.uid())
        OR public.is_super_admin()
    )
    WITH CHECK (
        (public.is_teacher() AND teacher_id = auth.uid())
        OR public.is_super_admin()
    );

-- Teachers delete only their own sessions; super admin any
DROP POLICY IF EXISTS "Teachers delete live sessions" ON public.live_sessions;
CREATE POLICY "Teachers delete live sessions" ON public.live_sessions
    FOR DELETE TO authenticated
    USING (
        (public.is_teacher() AND teacher_id = auth.uid())
        OR public.is_super_admin()
    );

-- ------------------------------------------------------------------------------
-- 6. RLS POLICIES HARDENING: ATTENDANCE
-- ------------------------------------------------------------------------------
-- Teachers view only attendance for sessions they manage; super admin views all
DROP POLICY IF EXISTS "Teachers view attendance" ON public.attendance;
CREATE POLICY "Teachers view attendance" ON public.attendance
    FOR SELECT TO authenticated
    USING (
        public.can_manage_live_session(attendance.session_id)
    );

DROP POLICY IF EXISTS "Teachers insert attendance" ON public.attendance;
CREATE POLICY "Teachers insert attendance" ON public.attendance
    FOR INSERT TO authenticated
    WITH CHECK (
        public.can_manage_live_session(attendance.session_id)
    );

DROP POLICY IF EXISTS "Teachers update attendance" ON public.attendance;
CREATE POLICY "Teachers update attendance" ON public.attendance
    FOR UPDATE TO authenticated
    USING (
        public.can_manage_live_session(attendance.session_id)
    )
    WITH CHECK (
        public.can_manage_live_session(attendance.session_id)
    );

DROP POLICY IF EXISTS "Teachers delete attendance" ON public.attendance;
CREATE POLICY "Teachers delete attendance" ON public.attendance
    FOR DELETE TO authenticated
    USING (
        public.can_manage_live_session(attendance.session_id)
    );
