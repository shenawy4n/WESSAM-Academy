-- ==============================================================================
-- WESSAM Academy - Migration 20261111000015
-- Phase 5C: Complete Assignments, Homework & Grading Management
--
-- Features:
-- 1. Enhances public.assignments with teacher ownership, lesson_id, type,
--    late policies, attempts, attachments, rubrics, and statuses.
-- 2. Creates public.assignment_targets for multi-group and individual student distribution.
-- 3. Enhances public.submissions with attempts, multi-file attachments,
--    private teacher notes, grading release controls, and revision statuses.
-- 4. Creates public.assignment_grading_history for append-only audit trail.
-- 5. Provisions private storage bucket 'assignment-files' with strict RLS.
-- 6. Implements atomic RPCs: create_assignment, update_assignment, duplicate_assignment,
--    submit_assignment (server-side late detection & attempts enforcement),
--    and grade_assignment_submission (validation & history recording).
-- 7. Strict RLS for Super Admin, Teacher, and Student isolation.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. EXTEND public.assignments SCHEMA
-- ------------------------------------------------------------------------------
ALTER TABLE public.assignments
    ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS lesson_id UUID REFERENCES public.lessons(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS instructions_arabic TEXT,
    ADD COLUMN IF NOT EXISTS assignment_type TEXT NOT NULL DEFAULT 'written',
    ADD COLUMN IF NOT EXISTS publish_at TIMESTAMPTZ DEFAULT now(),
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft',
    ADD COLUMN IF NOT EXISTS allow_late_submissions BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS late_penalty_percentage INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS grace_period_minutes INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS cutoff_date TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS max_attempts INT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS rubric JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Ensure default status matches is_published
UPDATE public.assignments
SET status = CASE WHEN is_published = true THEN 'published' ELSE 'draft' END
WHERE status = 'draft' AND is_published = true;

-- ------------------------------------------------------------------------------
-- 2. CREATE public.assignment_targets TABLE (Distribution)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.assignment_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL CHECK (target_type IN ('group', 'student')),
    group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
    student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_target_consistency CHECK (
        (target_type = 'group' AND group_id IS NOT NULL AND student_id IS NULL) OR
        (target_type = 'student' AND student_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_assignment_targets_assignment ON public.assignment_targets(assignment_id);
CREATE INDEX IF NOT EXISTS idx_assignment_targets_group ON public.assignment_targets(group_id);
CREATE INDEX IF NOT EXISTS idx_assignment_targets_student ON public.assignment_targets(student_id);

-- ------------------------------------------------------------------------------
-- 3. EXTEND public.submissions SCHEMA
-- ------------------------------------------------------------------------------
ALTER TABLE public.submissions
    ADD COLUMN IF NOT EXISTS attempt_number INT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'submitted',
    ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS student_comment TEXT,
    ADD COLUMN IF NOT EXISTS private_teacher_notes TEXT,
    ADD COLUMN IF NOT EXISTS rubric_scores JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS is_grade_released BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Drop old 1:1 unique constraint if present, allowing revision attempts
ALTER TABLE public.submissions DROP CONSTRAINT IF EXISTS submissions_assignment_id_student_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_assignment_student_attempt
    ON public.submissions(assignment_id, student_id, attempt_number);

-- ------------------------------------------------------------------------------
-- 4. CREATE public.assignment_grading_history (Audit Trail)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.assignment_grading_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
    assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    graded_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    previous_score NUMERIC(5,2),
    new_score NUMERIC(5,2) NOT NULL,
    previous_feedback TEXT,
    new_feedback TEXT,
    action_type TEXT NOT NULL DEFAULT 'grade' CHECK (action_type IN ('grade', 'regrade', 'return_for_revision', 'release_grade')),
    is_grade_released BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_grading_history_submission ON public.assignment_grading_history(submission_id);
CREATE INDEX IF NOT EXISTS idx_grading_history_assignment ON public.assignment_grading_history(assignment_id);

-- ------------------------------------------------------------------------------
-- 5. PRIVATE STORAGE BUCKET: 'assignment-files'
-- ------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'assignment-files',
    'assignment-files',
    false,
    52428800, -- 50MB
    ARRAY[
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/zip',
        'application/x-zip-compressed',
        'image/jpeg',
        'image/png',
        'image/webp',
        'audio/mpeg',
        'audio/mp3',
        'audio/wav',
        'audio/x-m4a',
        'text/plain'
    ]
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 52428800;

-- ------------------------------------------------------------------------------
-- 6. SECURITY DEFINER AUTHORIZATION HELPERS
-- ------------------------------------------------------------------------------

-- Helper: Verify teacher ownership or super admin management of an assignment
CREATE OR REPLACE FUNCTION public.can_manage_assignment(p_assignment_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
    v_owner_id UUID;
BEGIN
    IF p_assignment_id IS NULL OR auth.uid() IS NULL THEN
        RETURN false;
    END IF;

    IF public.is_super_admin() THEN
        RETURN true;
    END IF;

    IF NOT public.is_teacher() THEN
        RETURN false;
    END IF;

    SELECT teacher_id INTO v_owner_id
    FROM public.assignments
    WHERE id = p_assignment_id;

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    RETURN v_owner_id IS NOT NULL AND v_owner_id = auth.uid();
END;
$$;

ALTER FUNCTION public.can_manage_assignment(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.can_manage_assignment(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_assignment(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_manage_assignment(UUID) TO authenticated;

-- Helper: Verify if a student is assigned/targeted for an assignment
CREATE OR REPLACE FUNCTION public.is_student_targeted_for_assignment(p_assignment_id UUID, p_student_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
    v_target_group UUID;
BEGIN
    IF p_assignment_id IS NULL OR p_student_id IS NULL THEN
        RETURN false;
    END IF;

    -- 1. Check legacy target_group_id on assignments
    SELECT target_group_id INTO v_target_group
    FROM public.assignments
    WHERE id = p_assignment_id;

    IF v_target_group IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM public.group_students gs
            WHERE gs.group_id = v_target_group AND gs.student_id = p_student_id
        ) THEN
            RETURN true;
        END IF;
    END IF;

    -- 2. Check direct student targeting in assignment_targets
    IF EXISTS (
        SELECT 1 FROM public.assignment_targets at
        WHERE at.assignment_id = p_assignment_id
          AND at.target_type = 'student'
          AND at.student_id = p_student_id
    ) THEN
        RETURN true;
    END IF;

    -- 3. Check group targeting in assignment_targets
    IF EXISTS (
        SELECT 1 FROM public.assignment_targets at
        JOIN public.group_students gs ON gs.group_id = at.group_id
        WHERE at.assignment_id = p_assignment_id
          AND at.target_type = 'group'
          AND gs.student_id = p_student_id
    ) THEN
        RETURN true;
    END IF;

    -- 4. If no explicit targets exist and assignment has course_id, check if student is in any group taking this course
    IF NOT EXISTS (SELECT 1 FROM public.assignment_targets WHERE assignment_id = p_assignment_id) AND v_target_group IS NULL THEN
        IF EXISTS (
            SELECT 1 FROM public.assignments a
            JOIN public.group_courses gc ON gc.course_id = a.course_id
            JOIN public.group_students gs ON gs.group_id = gc.group_id
            WHERE a.id = p_assignment_id AND gs.student_id = p_student_id
        ) THEN
            RETURN true;
        END IF;
    END IF;

    RETURN false;
END;
$$;

ALTER FUNCTION public.is_student_targeted_for_assignment(UUID, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_student_targeted_for_assignment(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_student_targeted_for_assignment(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_student_targeted_for_assignment(UUID, UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY POLICIES
-- ------------------------------------------------------------------------------

-- (A) public.assignments
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Teachers manage assignments" ON public.assignments;
DROP POLICY IF EXISTS "Students view published assignments" ON public.assignments;
DROP POLICY IF EXISTS "Teachers and admins view assignments" ON public.assignments;
DROP POLICY IF EXISTS "Teachers and admins insert assignments" ON public.assignments;
DROP POLICY IF EXISTS "Teachers and admins update assignments" ON public.assignments;
DROP POLICY IF EXISTS "Teachers and admins delete assignments" ON public.assignments;

CREATE POLICY "Teachers and admins view assignments" ON public.assignments
    FOR SELECT TO authenticated
    USING (
        public.is_super_admin()
        OR (public.is_teacher() AND teacher_id = auth.uid())
        OR (
            public.is_active_student()
            AND is_published = true
            AND status = 'published'
            AND publish_at <= now()
            AND public.is_student_targeted_for_assignment(id, auth.uid())
        )
    );

CREATE POLICY "Teachers and admins insert assignments" ON public.assignments
    FOR INSERT TO authenticated
    WITH CHECK (
        public.is_super_admin()
        OR (public.is_teacher() AND teacher_id = auth.uid())
    );

CREATE POLICY "Teachers and admins update assignments" ON public.assignments
    FOR UPDATE TO authenticated
    USING (
        public.is_super_admin()
        OR (public.is_teacher() AND teacher_id = auth.uid())
    )
    WITH CHECK (
        public.is_super_admin()
        OR (public.is_teacher() AND teacher_id = auth.uid())
    );

CREATE POLICY "Teachers and admins delete assignments" ON public.assignments
    FOR DELETE TO authenticated
    USING (
        public.is_super_admin()
        OR (public.is_teacher() AND teacher_id = auth.uid())
    );

-- (B) public.assignment_targets
ALTER TABLE public.assignment_targets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Teachers and admins manage targets" ON public.assignment_targets;
DROP POLICY IF EXISTS "Students view own targets" ON public.assignment_targets;

CREATE POLICY "Teachers and admins manage targets" ON public.assignment_targets
    FOR ALL TO authenticated
    USING (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.assignments a
            WHERE a.id = assignment_targets.assignment_id AND a.teacher_id = auth.uid()
        )
    )
    WITH CHECK (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.assignments a
            WHERE a.id = assignment_targets.assignment_id AND a.teacher_id = auth.uid()
        )
    );

CREATE POLICY "Students view own targets" ON public.assignment_targets
    FOR SELECT TO authenticated
    USING (
        public.is_active_student() AND (
            (target_type = 'student' AND student_id = auth.uid())
            OR (
                target_type = 'group' AND EXISTS (
                    SELECT 1 FROM public.group_students gs
                    WHERE gs.group_id = assignment_targets.group_id AND gs.student_id = auth.uid()
                )
            )
        )
    );

-- (C) public.submissions
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Teachers view and grade all submissions" ON public.submissions;
DROP POLICY IF EXISTS "Students view own submissions" ON public.submissions;
DROP POLICY IF EXISTS "Students create own initial submission" ON public.submissions;
DROP POLICY IF EXISTS "Students update own submission before grading" ON public.submissions;

CREATE POLICY "Teachers and admins manage submissions" ON public.submissions
    FOR ALL TO authenticated
    USING (
        public.is_super_admin()
        OR public.can_manage_assignment(assignment_id)
    )
    WITH CHECK (
        public.is_super_admin()
        OR public.can_manage_assignment(assignment_id)
    );

CREATE POLICY "Students view own submissions" ON public.submissions
    FOR SELECT TO authenticated
    USING (
        public.is_active_student() AND student_id = auth.uid()
    );

CREATE POLICY "Students insert own submissions" ON public.submissions
    FOR INSERT TO authenticated
    WITH CHECK (
        public.is_active_student()
        AND student_id = auth.uid()
        AND public.is_student_targeted_for_assignment(assignment_id, auth.uid())
    );

-- (D) public.assignment_grading_history
ALTER TABLE public.assignment_grading_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers and admins view grading history" ON public.assignment_grading_history
    FOR SELECT TO authenticated
    USING (
        public.is_super_admin()
        OR public.can_manage_assignment(assignment_id)
    );

CREATE POLICY "Teachers and admins insert grading history" ON public.assignment_grading_history
    FOR INSERT TO authenticated
    WITH CHECK (
        public.is_super_admin()
        OR public.can_manage_assignment(assignment_id)
    );

-- ------------------------------------------------------------------------------
-- 8. STORAGE RLS: 'assignment-files'
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authorized users upload assignment files" ON storage.objects;
DROP POLICY IF EXISTS "Authorized users read assignment files" ON storage.objects;
DROP POLICY IF EXISTS "Authorized users delete assignment files" ON storage.objects;

CREATE POLICY "Authorized users upload assignment files" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'assignment-files'
        AND (
            public.is_super_admin()
            OR public.is_teacher()
            OR (public.is_active_student() AND (storage.foldername(name))[1] = 'submissions')
        )
    );

CREATE POLICY "Authorized users read assignment files" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'assignment-files'
        AND (
            public.is_super_admin()
            OR public.is_teacher()
            OR (
                public.is_active_student()
                AND (
                    (storage.foldername(name))[1] = 'attachments'
                    OR (storage.foldername(name))[1] = 'submissions'
                )
            )
        )
    );

CREATE POLICY "Authorized users delete assignment files" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'assignment-files'
        AND (public.is_super_admin() OR public.is_teacher())
    );

-- ------------------------------------------------------------------------------
-- 9. ATOMIC BUSINESS RPCs FOR ASSIGNMENTS
-- ------------------------------------------------------------------------------

-- RPC 1: Create an assignment with targets atomically
CREATE OR REPLACE FUNCTION public.create_assignment(
    p_assignment JSONB,
    p_targets JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
    v_caller_id UUID;
    v_owner_id UUID;
    v_new_id UUID;
    v_target RECORD;
    v_target_group_id UUID;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
    END IF;

    IF NOT (public.is_teacher() OR public.is_super_admin()) THEN
        RAISE EXCEPTION 'Forbidden: Only teachers and super admins can create assignments' USING ERRCODE = '42501';
    END IF;

    IF public.is_super_admin() AND (p_assignment->>'teacher_id') IS NOT NULL THEN
        v_owner_id := (p_assignment->>'teacher_id')::UUID;
    ELSE
        v_owner_id := v_caller_id;
    END IF;

    IF p_assignment->>'title' IS NULL OR trim(p_assignment->>'title') = '' THEN
        RAISE EXCEPTION 'English title is required' USING ERRCODE = '22000';
    END IF;

    IF p_assignment->>'course_id' IS NULL THEN
        RAISE EXCEPTION 'Course is required' USING ERRCODE = '22000';
    END IF;

    IF p_assignment->>'due_date' IS NULL THEN
        RAISE EXCEPTION 'Due date is required' USING ERRCODE = '22000';
    END IF;

    v_target_group_id := (p_assignment->>'target_group_id')::UUID;

    INSERT INTO public.assignments (
        teacher_id,
        course_id,
        unit_id,
        lesson_id,
        title,
        title_arabic,
        instructions,
        instructions_arabic,
        assignment_type,
        due_date,
        publish_at,
        cutoff_date,
        max_score,
        target_group_id,
        is_published,
        status,
        allow_late_submissions,
        late_penalty_percentage,
        grace_period_minutes,
        max_attempts,
        attachments,
        rubric
    ) VALUES (
        v_owner_id,
        (p_assignment->>'course_id')::UUID,
        (p_assignment->>'unit_id')::UUID,
        (p_assignment->>'lesson_id')::UUID,
        trim(p_assignment->>'title'),
        COALESCE(NULLIF(trim(p_assignment->>'title_arabic'), ''), trim(p_assignment->>'title')),
        COALESCE(trim(p_assignment->>'instructions'), ''),
        NULLIF(trim(p_assignment->>'instructions_arabic'), ''),
        COALESCE(p_assignment->>'assignment_type', 'written'),
        (p_assignment->>'due_date')::TIMESTAMPTZ,
        COALESCE((p_assignment->>'publish_at')::TIMESTAMPTZ, now()),
        (p_assignment->>'cutoff_date')::TIMESTAMPTZ,
        GREATEST(1, COALESCE((p_assignment->>'max_score')::INT, 100)),
        v_target_group_id,
        COALESCE((p_assignment->>'is_published')::BOOLEAN, false),
        COALESCE(p_assignment->>'status', 'draft'),
        COALESCE((p_assignment->>'allow_late_submissions')::BOOLEAN, true),
        COALESCE((p_assignment->>'late_penalty_percentage')::INT, 0),
        COALESCE((p_assignment->>'grace_period_minutes')::INT, 0),
        GREATEST(1, COALESCE((p_assignment->>'max_attempts')::INT, 1)),
        COALESCE(p_assignment->'attachments', '[]'::jsonb),
        COALESCE(p_assignment->'rubric', '[]'::jsonb)
    )
    RETURNING id INTO v_new_id;

    -- Insert targets
    IF p_targets IS NOT NULL AND jsonb_array_length(p_targets) > 0 THEN
        FOR v_target IN SELECT * FROM jsonb_to_recordset(p_targets) AS t(
            target_type TEXT,
            group_id UUID,
            student_id UUID
        )
        LOOP
            INSERT INTO public.assignment_targets (
                assignment_id,
                target_type,
                group_id,
                student_id
            ) VALUES (
                v_new_id,
                v_target.target_type,
                v_target.group_id,
                v_target.student_id
            );
        END LOOP;
    ELSIF v_target_group_id IS NOT NULL THEN
        INSERT INTO public.assignment_targets (
            assignment_id,
            target_type,
            group_id
        ) VALUES (
            v_new_id,
            'group',
            v_target_group_id
        );
    END IF;

    RETURN jsonb_build_object(
        'id', v_new_id,
        'title', p_assignment->>'title',
        'status', COALESCE(p_assignment->>'status', 'draft'),
        'created_at', now()
    );
END;
$$;

ALTER FUNCTION public.create_assignment(JSONB, JSONB) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_assignment(JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_assignment(JSONB, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_assignment(JSONB, JSONB) TO authenticated;

-- RPC 2: Update an assignment and targets atomically
CREATE OR REPLACE FUNCTION public.update_assignment(
    p_assignment_id UUID,
    p_assignment JSONB,
    p_targets JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
    v_target RECORD;
    v_target_group_id UUID;
BEGIN
    IF NOT public.can_manage_assignment(p_assignment_id) THEN
        RAISE EXCEPTION 'Forbidden: You are not authorized to update this assignment' USING ERRCODE = '42501';
    END IF;

    v_target_group_id := (p_assignment->>'target_group_id')::UUID;

    UPDATE public.assignments
    SET course_id = COALESCE((p_assignment->>'course_id')::UUID, course_id),
        unit_id = (p_assignment->>'unit_id')::UUID,
        lesson_id = (p_assignment->>'lesson_id')::UUID,
        title = COALESCE(trim(p_assignment->>'title'), title),
        title_arabic = COALESCE(NULLIF(trim(p_assignment->>'title_arabic'), ''), title_arabic),
        instructions = COALESCE(trim(p_assignment->>'instructions'), instructions),
        instructions_arabic = p_assignment->>'instructions_arabic',
        assignment_type = COALESCE(p_assignment->>'assignment_type', assignment_type),
        due_date = COALESCE((p_assignment->>'due_date')::TIMESTAMPTZ, due_date),
        publish_at = COALESCE((p_assignment->>'publish_at')::TIMESTAMPTZ, publish_at),
        cutoff_date = (p_assignment->>'cutoff_date')::TIMESTAMPTZ,
        max_score = COALESCE((p_assignment->>'max_score')::INT, max_score),
        target_group_id = v_target_group_id,
        is_published = COALESCE((p_assignment->>'is_published')::BOOLEAN, is_published),
        status = COALESCE(p_assignment->>'status', status),
        allow_late_submissions = COALESCE((p_assignment->>'allow_late_submissions')::BOOLEAN, allow_late_submissions),
        late_penalty_percentage = COALESCE((p_assignment->>'late_penalty_percentage')::INT, late_penalty_percentage),
        grace_period_minutes = COALESCE((p_assignment->>'grace_period_minutes')::INT, grace_period_minutes),
        max_attempts = COALESCE((p_assignment->>'max_attempts')::INT, max_attempts),
        attachments = COALESCE(p_assignment->'attachments', attachments),
        rubric = COALESCE(p_assignment->'rubric', rubric),
        updated_at = now()
    WHERE id = p_assignment_id;

    IF p_targets IS NOT NULL THEN
        DELETE FROM public.assignment_targets WHERE assignment_id = p_assignment_id;

        FOR v_target IN SELECT * FROM jsonb_to_recordset(p_targets) AS t(
            target_type TEXT,
            group_id UUID,
            student_id UUID
        )
        LOOP
            INSERT INTO public.assignment_targets (
                assignment_id,
                target_type,
                group_id,
                student_id
            ) VALUES (
                p_assignment_id,
                v_target.target_type,
                v_target.group_id,
                v_target.student_id
            );
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'id', p_assignment_id,
        'updated_at', now()
    );
END;
$$;

ALTER FUNCTION public.update_assignment(UUID, JSONB, JSONB) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.update_assignment(UUID, JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_assignment(UUID, JSONB, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_assignment(UUID, JSONB, JSONB) TO authenticated;

-- RPC 3: Submit assignment with strict server-side late & attempts validation
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

    -- Check attempts
    SELECT count(*)::int INTO v_prev_attempts
    FROM public.submissions
    WHERE assignment_id = p_assignment_id AND student_id = v_student_id;

    IF v_prev_attempts >= v_assign.max_attempts THEN
        RAISE EXCEPTION 'Maximum attempts limit of % reached', v_assign.max_attempts USING ERRCODE = '22000';
    END IF;

    v_new_attempt_number := v_prev_attempts + 1;

    -- Extract first file url for backward compatibility with baseline schema column
    IF p_attachments IS NOT NULL AND jsonb_array_length(p_attachments) > 0 THEN
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
REVOKE ALL ON FUNCTION public.submit_assignment(UUID, TEXT, JSONB, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_assignment(UUID, TEXT, JSONB, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_assignment(UUID, TEXT, JSONB, TEXT) TO authenticated;

-- RPC 4: Grade submission with history record and release controls
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
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_sub FROM public.submissions WHERE id = p_submission_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Submission not found' USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO v_assign FROM public.assignments WHERE id = v_sub.assignment_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Assignment not found' USING ERRCODE = 'P0002';
    END IF;

    IF NOT public.can_manage_assignment(v_assign.id) THEN
        RAISE EXCEPTION 'Forbidden: You cannot grade this submission' USING ERRCODE = '42501';
    END IF;

    -- Validate score bounds
    IF p_score < 0 OR p_score > v_assign.max_score THEN
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
        graded_at = now(),
        graded_by = v_caller_id,
        is_grade_released = p_release_grade,
        released_at = CASE WHEN p_release_grade THEN now() ELSE released_at END,
        updated_at = now()
    WHERE id = p_submission_id;

    -- Record grading history
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
        p_release_grade
    );

    RETURN jsonb_build_object(
        'submission_id', p_submission_id,
        'score', p_score,
        'status', v_new_status,
        'is_grade_released', p_release_grade,
        'graded_at', now()
    );
END;
$$;

ALTER FUNCTION public.grade_assignment_submission(UUID, NUMERIC, TEXT, TEXT, JSONB, BOOLEAN, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.grade_assignment_submission(UUID, NUMERIC, TEXT, TEXT, JSONB, BOOLEAN, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grade_assignment_submission(UUID, NUMERIC, TEXT, TEXT, JSONB, BOOLEAN, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.grade_assignment_submission(UUID, NUMERIC, TEXT, TEXT, JSONB, BOOLEAN, TEXT) TO authenticated;
