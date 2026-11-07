-- ==============================================================================
-- WESSAM Academy - Migration 20261107000008: Live Sessions & Attendance Management
-- Phase 4A: Production Live Sessions Scheduling, Secure Meeting Link Access,
-- Cohort-Restricted Attendance Management, and Reporting Schema.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ENUMS & SCHEMA ADJUSTMENTS
-- ------------------------------------------------------------------------------

-- Ensure live_session_provider_enum includes 'teams'
DO $$
BEGIN
    ALTER TYPE public.live_session_provider_enum ADD VALUE IF NOT EXISTS 'teams';
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Enhance public.live_sessions schema
ALTER TABLE public.live_sessions
    ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS lesson_id UUID REFERENCES public.lessons(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS title_arabic TEXT,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS description_arabic TEXT,
    ADD COLUMN IF NOT EXISTS duration_minutes INT NOT NULL DEFAULT 60;

-- Indexes for performance on group, teacher, status, and scheduled time
CREATE INDEX IF NOT EXISTS idx_live_sessions_teacher_id ON public.live_sessions(teacher_id);
CREATE INDEX IF NOT EXISTS idx_live_sessions_lesson_id ON public.live_sessions(lesson_id);
CREATE INDEX IF NOT EXISTS idx_live_sessions_status_start ON public.live_sessions(status, start_time);

-- Enhance public.attendance schema
ALTER TABLE public.attendance
    ADD COLUMN IF NOT EXISTS marked_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_attendance_student_id ON public.attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_status ON public.attendance(status);

-- ------------------------------------------------------------------------------
-- 2. ATTENDANCE ENROLLMENT VALIDATION TRIGGER
-- ------------------------------------------------------------------------------
-- Guarantees that attendance can only be recorded for students who are actively
-- enrolled in the group assigned to the live session.
CREATE OR REPLACE FUNCTION public.validate_attendance_student_enrollment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_session_group_id UUID;
    v_is_enrolled BOOLEAN;
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

    -- Verify the student is actively enrolled in this session group
    SELECT EXISTS (
        SELECT 1
        FROM public.group_students gs
        JOIN public.profiles p ON p.id = gs.student_id
        WHERE gs.group_id = v_session_group_id
          AND gs.student_id = NEW.student_id
          AND p.role = 'student'
    ) INTO v_is_enrolled;

    IF NOT v_is_enrolled THEN
        RAISE EXCEPTION 'Student is not enrolled in the group assigned to this live session' USING ERRCODE = '22000';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_attendance_student_enrollment ON public.attendance;
CREATE TRIGGER trg_validate_attendance_student_enrollment
    BEFORE INSERT OR UPDATE ON public.attendance
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_attendance_student_enrollment();

-- ------------------------------------------------------------------------------
-- 3. RECURSION-FREE AUTHORIZATION HELPERS
-- ------------------------------------------------------------------------------

-- Helper: Verify teacher ownership or super_admin access for live sessions
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
          AND (s.teacher_id = auth.uid() OR s.teacher_id IS NULL)
    );
END;
$$;

ALTER FUNCTION public.can_manage_live_session(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.can_manage_live_session(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_live_session(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_manage_live_session(uuid) TO authenticated;

-- Helper: Retrieve authorized meeting link with strict boundary enforcement
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

    -- Super Admin & Owning Teacher access
    IF public.is_super_admin() OR (public.is_teacher() AND (v_session.teacher_id = v_caller_id OR v_session.teacher_id IS NULL)) THEN
        RETURN v_session.meeting_url;
    END IF;

    -- Active Student access: must be in the assigned cohort group
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
REVOKE ALL ON FUNCTION public.get_session_meeting_link(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_session_meeting_link(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_session_meeting_link(uuid) TO authenticated;

-- ------------------------------------------------------------------------------
-- 4. ATOMIC ATTENDANCE BATCH RPC
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
    v_is_enrolled BOOLEAN;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Not authenticated' USING ERRCODE = '42501';
    END IF;

    IF NOT public.is_teacher() THEN
        RAISE EXCEPTION 'Forbidden: Only teachers and super admins can record attendance' USING ERRCODE = '42501';
    END IF;

    SELECT id, teacher_id, group_id, status
    INTO v_session
    FROM public.live_sessions
    WHERE id = p_session_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Live session not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_session.teacher_id IS NOT NULL AND v_session.teacher_id <> v_caller_id AND NOT public.is_super_admin() THEN
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

        -- Verify enrollment in session group
        SELECT EXISTS (
            SELECT 1
            FROM public.group_students gs
            WHERE gs.group_id = v_session.group_id
              AND gs.student_id = v_student_id
        ) INTO v_is_enrolled;

        IF NOT v_is_enrolled THEN
            RAISE EXCEPTION 'Student % is not enrolled in the session group', v_student_id USING ERRCODE = '22000';
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
REVOKE ALL ON FUNCTION public.record_session_attendance(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_session_attendance(UUID, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_session_attendance(UUID, JSONB) TO authenticated;

-- ------------------------------------------------------------------------------
-- 5. AUDIT & REPAIR RLS POLICIES: LIVE SESSIONS
-- ------------------------------------------------------------------------------

DROP POLICY IF EXISTS "Teachers manage live sessions" ON public.live_sessions;
DROP POLICY IF EXISTS "Teachers view live sessions" ON public.live_sessions;
DROP POLICY IF EXISTS "Teachers insert live sessions" ON public.live_sessions;
DROP POLICY IF EXISTS "Teachers update live sessions" ON public.live_sessions;
DROP POLICY IF EXISTS "Teachers delete live sessions" ON public.live_sessions;
DROP POLICY IF EXISTS "Students view assigned live sessions" ON public.live_sessions;

ALTER TABLE public.live_sessions ENABLE ROW LEVEL SECURITY;

-- Teachers view all sessions
CREATE POLICY "Teachers view live sessions" ON public.live_sessions
    FOR SELECT TO authenticated
    USING (public.is_teacher());

-- Teachers insert own sessions (or super admin any)
CREATE POLICY "Teachers insert live sessions" ON public.live_sessions
    FOR INSERT TO authenticated
    WITH CHECK (
        (public.is_teacher() AND (teacher_id = auth.uid() OR teacher_id IS NULL))
        OR public.is_super_admin()
    );

-- Teachers update own sessions (or super admin any)
CREATE POLICY "Teachers update live sessions" ON public.live_sessions
    FOR UPDATE TO authenticated
    USING (
        (public.is_teacher() AND (teacher_id = auth.uid() OR teacher_id IS NULL))
        OR public.is_super_admin()
    )
    WITH CHECK (
        (public.is_teacher() AND (teacher_id = auth.uid() OR teacher_id IS NULL))
        OR public.is_super_admin()
    );

-- Teachers delete own sessions (or super admin any)
CREATE POLICY "Teachers delete live sessions" ON public.live_sessions
    FOR DELETE TO authenticated
    USING (
        (public.is_teacher() AND (teacher_id = auth.uid() OR teacher_id IS NULL))
        OR public.is_super_admin()
    );

-- Active students can view sessions assigned to active groups they belong to
CREATE POLICY "Students view assigned live sessions" ON public.live_sessions
    FOR SELECT TO authenticated
    USING (
        public.is_active_student()
        AND group_id IS NOT NULL
        AND public.is_student_in_group(group_id)
    );

-- ------------------------------------------------------------------------------
-- 6. AUDIT & REPAIR RLS POLICIES: ATTENDANCE
-- ------------------------------------------------------------------------------

DROP POLICY IF EXISTS "Teachers manage attendance" ON public.attendance;
DROP POLICY IF EXISTS "Teachers view attendance" ON public.attendance;
DROP POLICY IF EXISTS "Teachers insert attendance" ON public.attendance;
DROP POLICY IF EXISTS "Teachers update attendance" ON public.attendance;
DROP POLICY IF EXISTS "Teachers delete attendance" ON public.attendance;
DROP POLICY IF EXISTS "Students view own attendance" ON public.attendance;

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers view attendance" ON public.attendance
    FOR SELECT TO authenticated
    USING (public.is_teacher());

CREATE POLICY "Teachers insert attendance" ON public.attendance
    FOR INSERT TO authenticated
    WITH CHECK (
        public.can_manage_live_session(attendance.session_id)
    );

CREATE POLICY "Teachers update attendance" ON public.attendance
    FOR UPDATE TO authenticated
    USING (
        public.can_manage_live_session(attendance.session_id)
    )
    WITH CHECK (
        public.can_manage_live_session(attendance.session_id)
    );

CREATE POLICY "Teachers delete attendance" ON public.attendance
    FOR DELETE TO authenticated
    USING (
        public.can_manage_live_session(attendance.session_id)
    );

CREATE POLICY "Students view own attendance" ON public.attendance
    FOR SELECT TO authenticated
    USING (
        student_id = auth.uid()
        AND public.is_active_student()
    );

-- ------------------------------------------------------------------------------
-- 7. TABLE PERMISSIONS & ANONYMOUS ACCESS RESTRICTIONS
-- ------------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON public.live_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance TO authenticated;

REVOKE ALL ON public.live_sessions FROM anon;
REVOKE ALL ON public.attendance FROM anon;
