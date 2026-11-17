-- ==============================================================================
-- WESSAM Academy — Migration 28: Submission Integrity & Grading Audit Hardening
-- Migration: 20261118000028_harden_submission_grading_integrity.sql
--
-- Security Objective:
--   Eliminate direct authenticated table-level write privileges and permissive
--   write RLS policies on public.submissions and public.assignment_grading_history
--   so students, teachers, and Super Admins cannot bypass the server-authoritative
--   RPC workflows:
--     - public.submit_assignment(UUID, TEXT, JSONB, TEXT)
--     - public.grade_assignment_submission(UUID, NUMERIC, TEXT, TEXT, JSONB, BOOLEAN, TEXT)
--
-- Changes:
--  1. Table-Level Privilege Least-Privilege Hardening:
--     REVOKE ALL on public.submissions and public.assignment_grading_history
--     FROM PUBLIC, anon, authenticated; GRANT SELECT ONLY TO authenticated.
--  2. Defense-in-Depth RLS Hardening:
--     Replace permissive write/FOR ALL policies on public.submissions and
--     public.assignment_grading_history with strict SELECT-only policies for
--     authenticated users (students see own submissions; managing teachers and
--     active Super Admins view scoped submissions and grading history).
--  3. Harden submit_assignment & grade_assignment_submission RPCs:
--     - Preserve exact signatures, return contracts, SECURITY DEFINER,
--       OWNER TO postgres, SET search_path = '', SET row_security = off,
--       and EXECUTE privileges (authenticated only; revoked from PUBLIC/anon).
--     - Lock student+assignment attempt sequence via pg_advisory_xact_lock in
--       submit_assignment to prevent concurrent max_attempts bypasses.
--     - Validate active teacher/super_admin role, non-NULL/bounded p_score,
--       valid p_action_type, non-NULL p_release_grade, and lock submission row
--       FOR UPDATE in grade_assignment_submission so grading history captures
--       linearizable previous_score/previous_feedback snapshots and server-side
--       auth.uid() attribution.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. TABLE-LEVEL PRIVILEGE HARDENING (READ-ONLY FOR AUTHENTICATED)
-- ------------------------------------------------------------------------------
REVOKE ALL ON public.submissions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.submissions TO authenticated;

REVOKE ALL ON public.assignment_grading_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.assignment_grading_history TO authenticated;

-- ------------------------------------------------------------------------------
-- 2. DEFENSE-IN-DEPTH RLS HARDENING (SELECT-ONLY POLICIES)
-- ------------------------------------------------------------------------------

-- (A) public.submissions
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Teachers and admins manage submissions" ON public.submissions;
DROP POLICY IF EXISTS "Teachers and admins view submissions" ON public.submissions;
DROP POLICY IF EXISTS "Teachers view and grade all submissions" ON public.submissions;
DROP POLICY IF EXISTS "Students insert own submissions" ON public.submissions;
DROP POLICY IF EXISTS "Students create own initial submission" ON public.submissions;
DROP POLICY IF EXISTS "Students update own submission before grading" ON public.submissions;
DROP POLICY IF EXISTS "Students view own submissions" ON public.submissions;

CREATE POLICY "Teachers and admins view submissions" ON public.submissions
    FOR SELECT TO authenticated
    USING (
        public.is_super_admin()
        OR public.can_manage_assignment(assignment_id)
    );

CREATE POLICY "Students view own submissions" ON public.submissions
    FOR SELECT TO authenticated
    USING (
        public.is_active_student()
        AND student_id = auth.uid()
    );

-- (B) public.assignment_grading_history
ALTER TABLE public.assignment_grading_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Teachers and admins insert grading history" ON public.assignment_grading_history;
DROP POLICY IF EXISTS "Teachers and admins view grading history" ON public.assignment_grading_history;

CREATE POLICY "Teachers and admins view grading history" ON public.assignment_grading_history
    FOR SELECT TO authenticated
    USING (
        public.is_super_admin()
        OR public.can_manage_assignment(assignment_id)
    );

-- ------------------------------------------------------------------------------
-- 3. HARDEN SERVER-AUTHORITATIVE SUBMISSION & GRADING RPCs
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.submit_assignment(
    p_assignment_id UUID,
    p_content TEXT,
    p_attachments JSONB DEFAULT '[]'::jsonb,
    p_student_comment TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
    v_student_id UUID;
    v_assign RECORD;
    v_current_time TIMESTAMPTZ;
    v_grace_limit TIMESTAMPTZ;
    v_is_late BOOLEAN := false;
    v_prev_attempts INT := 0;
    v_new_attempt_number INT := 1;
    v_submission_id UUID;
    v_first_file_url TEXT;
BEGIN
    v_student_id := auth.uid();
    IF v_student_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
    END IF;

    IF NOT public.is_active_student() THEN
        RAISE EXCEPTION 'Forbidden: Only active students can submit assignments' USING ERRCODE = '42501';
    END IF;

    IF p_assignment_id IS NULL THEN
        RAISE EXCEPTION 'Assignment not found' USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO v_assign
    FROM public.assignments
    WHERE id = p_assignment_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Assignment not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_assign.status <> 'published' OR v_assign.is_published = false THEN
        RAISE EXCEPTION 'Assignment is not open for submissions' USING ERRCODE = '22000';
    END IF;

    -- Verify eligibility
    IF NOT public.is_student_targeted_for_assignment(p_assignment_id, v_student_id) THEN
        RAISE EXCEPTION 'Forbidden: You are not assigned to this assignment' USING ERRCODE = '42501';
    END IF;

    -- Serialize concurrent submission attempts for the same assignment and student
    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtext('wessam.submit_assignment:' || p_assignment_id::text || ':' || v_student_id::text)
    );

    v_current_time := now();

    -- Calculate grace period
    v_grace_limit := v_assign.due_date + (COALESCE(v_assign.grace_period_minutes, 0) * interval '1 minute');

    IF v_current_time > v_assign.due_date THEN
        IF v_current_time <= v_grace_limit THEN
            v_is_late := false;
        ELSE
            v_is_late := true;
            IF v_assign.allow_late_submissions = false THEN
                RAISE EXCEPTION 'Late submissions are not accepted for this assignment' USING ERRCODE = '22000';
            END IF;
            IF v_assign.cutoff_date IS NOT NULL AND v_current_time > v_assign.cutoff_date THEN
                RAISE EXCEPTION 'The final cutoff deadline for this assignment has passed' USING ERRCODE = '22000';
            END IF;
        END IF;
    END IF;

    -- Check attempts atomically under advisory lock
    SELECT COALESCE(MAX(attempt_number), 0)::int INTO v_prev_attempts
    FROM public.submissions
    WHERE assignment_id = p_assignment_id AND student_id = v_student_id;

    IF v_prev_attempts >= v_assign.max_attempts THEN
        RAISE EXCEPTION 'Maximum attempts limit of % reached', v_assign.max_attempts USING ERRCODE = '22000';
    END IF;

    v_new_attempt_number := v_prev_attempts + 1;

    -- Extract first file url for backward compatibility with baseline schema column
    IF p_attachments IS NOT NULL AND jsonb_typeof(p_attachments) = 'array' AND jsonb_array_length(p_attachments) > 0 THEN
        v_first_file_url := p_attachments->0->>'url';
    END IF;

    INSERT INTO public.submissions (
        assignment_id,
        student_id,
        attempt_number,
        content,
        file_url,
        attachments,
        student_comment,
        submitted_at,
        is_late,
        status
    ) VALUES (
        p_assignment_id,
        v_student_id,
        v_new_attempt_number,
        p_content,
        v_first_file_url,
        COALESCE(p_attachments, '[]'::jsonb),
        p_student_comment,
        v_current_time,
        v_is_late,
        'submitted'
    )
    RETURNING id INTO v_submission_id;

    RETURN jsonb_build_object(
        'submission_id', v_submission_id,
        'attempt_number', v_new_attempt_number,
        'is_late', v_is_late,
        'submitted_at', v_current_time
    );
END;
$$;

ALTER FUNCTION public.submit_assignment(UUID, TEXT, JSONB, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.submit_assignment(UUID, TEXT, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_assignment(UUID, TEXT, JSONB, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.grade_assignment_submission(
    p_submission_id UUID,
    p_score NUMERIC,
    p_feedback TEXT DEFAULT NULL,
    p_private_notes TEXT DEFAULT NULL,
    p_rubric_scores JSONB DEFAULT '{}'::jsonb,
    p_release_grade BOOLEAN DEFAULT false,
    p_action_type TEXT DEFAULT 'grade'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
    v_caller_id UUID;
    v_sub RECORD;
    v_assign RECORD;
    v_new_status TEXT;
    v_release_grade BOOLEAN := COALESCE(p_release_grade, false);
    v_graded_at TIMESTAMPTZ := now();
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
    END IF;

    IF NOT (public.is_super_admin() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'Forbidden: Only active teachers and super admins can grade submissions' USING ERRCODE = '42501';
    END IF;

    IF p_submission_id IS NULL THEN
        RAISE EXCEPTION 'Submission not found' USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO v_sub
    FROM public.submissions
    WHERE id = p_submission_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Submission not found' USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO v_assign
    FROM public.assignments
    WHERE id = v_sub.assignment_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Assignment not found' USING ERRCODE = 'P0002';
    END IF;

    IF NOT public.can_manage_assignment(v_assign.id) THEN
        RAISE EXCEPTION 'Forbidden: You cannot grade this submission' USING ERRCODE = '42501';
    END IF;

    IF p_action_type IS NULL OR p_action_type NOT IN ('grade', 'regrade', 'return_for_revision', 'release_grade') THEN
        RAISE EXCEPTION 'Invalid grading action type' USING ERRCODE = '22023';
    END IF;

    -- Validate score bounds (reject NULL, negative, or > max_score)
    IF p_score IS NULL OR p_score < 0 OR p_score > v_assign.max_score THEN
        RAISE EXCEPTION 'Score must be between 0 and %', v_assign.max_score USING ERRCODE = '22000';
    END IF;

    IF p_action_type = 'return_for_revision' THEN
        v_new_status := 'returned_for_revision';
    ELSE
        v_new_status := 'graded';
    END IF;

    UPDATE public.submissions
    SET score = p_score,
        teacher_feedback = p_feedback,
        private_teacher_notes = p_private_notes,
        rubric_scores = COALESCE(p_rubric_scores, rubric_scores),
        status = v_new_status,
        graded_at = v_graded_at,
        graded_by = v_caller_id,
        is_grade_released = v_release_grade,
        released_at = CASE WHEN v_release_grade THEN v_graded_at ELSE released_at END,
        updated_at = v_graded_at
    WHERE id = p_submission_id;

    -- Record append-only grading history strictly attributed to auth.uid()
    INSERT INTO public.assignment_grading_history (
        submission_id,
        assignment_id,
        student_id,
        graded_by,
        previous_score,
        new_score,
        previous_feedback,
        new_feedback,
        action_type,
        is_grade_released
    ) VALUES (
        p_submission_id,
        v_assign.id,
        v_sub.student_id,
        v_caller_id,
        v_sub.score,
        p_score,
        v_sub.teacher_feedback,
        p_feedback,
        p_action_type,
        v_release_grade
    );

    RETURN jsonb_build_object(
        'submission_id', p_submission_id,
        'score', p_score,
        'status', v_new_status,
        'is_grade_released', v_release_grade,
        'graded_at', v_graded_at
    );
END;
$$;

ALTER FUNCTION public.grade_assignment_submission(UUID, NUMERIC, TEXT, TEXT, JSONB, BOOLEAN, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.grade_assignment_submission(UUID, NUMERIC, TEXT, TEXT, JSONB, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grade_assignment_submission(UUID, NUMERIC, TEXT, TEXT, JSONB, BOOLEAN, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
