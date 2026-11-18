-- ==============================================================================
-- WESSAM Academy — Migration 29: Harden Submission Attachments JSON Validation
-- Migration: 20261118000029_harden_submission_attachments_validation.sql
--
-- Security & Data Integrity Objective:
--   Harden public.submit_assignment(UUID, TEXT, JSONB, TEXT) introduced/updated
--   in Migration 28 so p_attachments is strictly validated as a JSON array:
--     - SQL NULL is normalized to '[]'::jsonb (matching assignmentService.ts).
--     - Non-array JSONB values (objects, strings, numbers, booleans, JSON null)
--       are explicitly rejected with SQLSTATE 22023.
--     - pg_catalog.jsonb_array_length(...) is never invoked inside a compound
--       boolean expression or on a non-array value.
--     - Preserves exact RPC signature, return contract, SECURITY DEFINER,
--       OWNER TO postgres, SET search_path = '', SET row_security = off,
--       advisory transaction lock, late/cutoff/max_attempts enforcement, and
--       authenticated-only EXECUTE privileges.
-- ==============================================================================

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
    v_attachments JSONB;
    v_attachment_count INT := 0;
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

    -- Validate and normalize p_attachments strictly before acquiring locks or writing
    IF p_attachments IS NULL THEN
        v_attachments := '[]'::jsonb;
    ELSE
        IF pg_catalog.jsonb_typeof(p_attachments) IS DISTINCT FROM 'array' THEN
            RAISE EXCEPTION 'Attachments must be a JSON array' USING ERRCODE = '22023';
        END IF;
        v_attachments := p_attachments;
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

    -- v_attachments is guaranteed to be a non-NULL JSON array here
    v_attachment_count := pg_catalog.jsonb_array_length(v_attachments);
    IF v_attachment_count > 0 THEN
        IF pg_catalog.jsonb_typeof(v_attachments->0) = 'object' THEN
            v_first_file_url := v_attachments->0->>'url';
        END IF;
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
        v_attachments,
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

NOTIFY pgrst, 'reload schema';
