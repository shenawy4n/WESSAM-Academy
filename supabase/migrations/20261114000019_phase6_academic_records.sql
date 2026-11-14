-- ==============================================================================
-- WESSAM Academy - Migration 20261114000019: Phase 6A Academic Records & Results
-- Forward-only additive migration:
-- 1. Performance indexes for transcript, attendance, quiz & submission lookups
-- 2. Teacher/Super-Admin authorization helper for active & archived students
-- 3. Server-authoritative RPC: list_accessible_students_for_records()
-- 4. Server-authoritative RPC: get_student_academic_record(...)
--    - Enforces strict student self-isolation (auth.uid() only)
--    - Enforces teacher cohort/course scope vs super_admin universal access
--    - Respects quiz show_results_immediately and assignment is_grade_released
--    - Preserves NULL for ungraded/unreleased assessments (never fabricated as 0)
--    - Applies Asia/Riyadh date filters cleanly
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ADDITIVE PERFORMANCE INDEXES
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_attendance_student_recorded
    ON public.attendance(student_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_student_submitted
    ON public.quiz_attempts(student_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_submissions_student_submitted
    ON public.submissions(student_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_lesson_progress_student_completed
    ON public.lesson_progress(student_id, is_completed);

-- ------------------------------------------------------------------------------
-- 2. STAFF SCOPE AUTHORIZATION HELPER FOR ACADEMIC RECORDS
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_staff_view_student_record(
    p_staff_id UUID,
    p_student_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
BEGIN
    IF p_staff_id IS NULL OR p_student_id IS NULL THEN
        RETURN false;
    END IF;

    -- Verify target user is actually a student profile
    IF NOT EXISTS (
        SELECT 1
        FROM public.profiles st
        WHERE st.id = p_student_id
          AND st.role = 'student'
    ) THEN
        RETURN false;
    END IF;

    -- Super Admin has universal academic record access
    IF EXISTS (
        SELECT 1
        FROM public.profiles sp
        WHERE sp.id = p_staff_id
          AND sp.role = 'super_admin'
          AND sp.status = 'active'
    ) THEN
        RETURN true;
    END IF;

    -- Staff must be an active teacher
    IF NOT EXISTS (
        SELECT 1
        FROM public.profiles tp
        WHERE tp.id = p_staff_id
          AND tp.role = 'teacher'
          AND tp.status = 'active'
    ) THEN
        RETURN false;
    END IF;

    -- Teacher is authorized if student belongs to any group associated with
    -- the teacher's courses, live sessions, or quizzes (including inactive students
    -- whose historical academic record remains auditable by their teacher)
    RETURN EXISTS (
        SELECT 1
        FROM public.group_students gs
        WHERE gs.student_id = p_student_id
          AND public.is_teacher_authorized_for_group(p_staff_id, gs.group_id)
    )
    OR EXISTS (
        SELECT 1
        FROM public.quiz_attempts qa
        JOIN public.quizzes q ON q.id = qa.quiz_id
        WHERE qa.student_id = p_student_id
          AND q.teacher_id = p_staff_id
    )
    OR EXISTS (
        SELECT 1
        FROM public.submissions s
        JOIN public.assignments a ON a.id = s.assignment_id
        WHERE s.student_id = p_student_id
          AND a.teacher_id = p_staff_id
    );
END;
$$;

ALTER FUNCTION public.can_staff_view_student_record(UUID, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.can_staff_view_student_record(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_staff_view_student_record(UUID, UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 3. LIST ACCESSIBLE STUDENTS FOR ACADEMIC RECORDS (TEACHER / SUPER ADMIN)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_accessible_students_for_records()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
    v_caller_id UUID;
    v_is_super BOOLEAN;
    v_result JSONB;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Not authenticated' USING ERRCODE = '42501';
    END IF;

    v_is_super := public.is_super_admin();
    IF NOT v_is_super AND NOT public.is_teacher() THEN
        RAISE EXCEPTION 'Forbidden: Only teachers and super admins can list student records' USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(jsonb_agg(student_row ORDER BY student_row->>'full_name_arabic' ASC, student_row->>'full_name' ASC), '[]'::jsonb)
    INTO v_result
    FROM (
        SELECT jsonb_build_object(
            'id', p.id,
            'full_name', p.full_name,
            'full_name_arabic', COALESCE(p.full_name_arabic, p.full_name),
            'status', p.status,
            'student_number', sap.student_number,
            'username', sap.username,
            'enrolled_at', COALESCE(sap.enrolled_at, p.created_at),
            'groups', COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'id', g.id,
                    'name', g.name,
                    'name_arabic', g.name_arabic,
                    'academic_year', g.academic_year,
                    'is_primary', gs.is_primary,
                    'is_active', g.is_active,
                    'archived_at', g.archived_at
                ) ORDER BY gs.is_primary DESC, g.name ASC)
                FROM public.group_students gs
                JOIN public.groups g ON g.id = gs.group_id
                WHERE gs.student_id = p.id
                  AND (v_is_super OR public.is_teacher_authorized_for_group(v_caller_id, g.id))
            ), '[]'::jsonb)
        ) AS student_row
        FROM public.profiles p
        LEFT JOIN public.student_academic_profiles sap ON sap.profile_id = p.id
        WHERE p.role = 'student'
          AND (
            v_is_super
            OR public.can_staff_view_student_record(v_caller_id, p.id)
          )
    ) sub;

    RETURN v_result;
END;
$$;

ALTER FUNCTION public.list_accessible_students_for_records() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.list_accessible_students_for_records() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_accessible_students_for_records() TO authenticated;

-- ------------------------------------------------------------------------------
-- 4. GET UNIFIED STUDENT ACADEMIC RECORD (STUDENT SELF OR AUTHORIZED STAFF)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_student_academic_record(
    p_student_id UUID DEFAULT NULL,
    p_course_id UUID DEFAULT NULL,
    p_group_id UUID DEFAULT NULL,
    p_academic_year TEXT DEFAULT NULL,
    p_date_from DATE DEFAULT NULL,
    p_date_to DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role TEXT;
    v_is_super BOOLEAN := false;
    v_is_staff BOOLEAN := false;
    v_target_student_id UUID;
    v_student RECORD;
    v_groups_json JSONB;
    v_courses_json JSONB;
    v_quizzes_json JSONB;
    v_assignments_json JSONB;
    v_attendance_json JSONB;
    v_attendance_summary JSONB;
    v_summary_json JSONB;
    v_last_activity TIMESTAMPTZ;
    v_passing_threshold NUMERIC := 60;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Not authenticated' USING ERRCODE = '42501';
    END IF;

    SELECT role::text INTO v_caller_role
    FROM public.profiles
    WHERE id = v_caller_id AND status = 'active';

    IF v_caller_role IS NULL THEN
        RAISE EXCEPTION 'Forbidden: Active account required' USING ERRCODE = '42501';
    END IF;

    v_is_super := (v_caller_role = 'super_admin');
    v_is_staff := (v_caller_role IN ('super_admin', 'teacher'));

    IF v_caller_role = 'student' THEN
        -- Strict self-only isolation: students can never view another student's academic record
        IF p_student_id IS NOT NULL AND p_student_id <> v_caller_id THEN
            RAISE EXCEPTION 'Forbidden: Students can only access their own academic record' USING ERRCODE = '42501';
        END IF;
        v_target_student_id := v_caller_id;
    ELSIF v_is_staff THEN
        IF p_student_id IS NULL THEN
            RAISE EXCEPTION 'Student identifier is required for staff academic record lookup' USING ERRCODE = '22023';
        END IF;
        v_target_student_id := p_student_id;

        IF NOT v_is_super AND NOT public.can_staff_view_student_record(v_caller_id, v_target_student_id) THEN
            RAISE EXCEPTION 'Forbidden: You are not authorized to view this student record' USING ERRCODE = '42501';
        END IF;
    ELSE
        RAISE EXCEPTION 'Forbidden: Insufficient permissions' USING ERRCODE = '42501';
    END IF;

    -- Read configurable passing threshold if system_settings table exists
    IF to_regclass('public.system_settings') IS NOT NULL THEN
        SELECT COALESCE((value->>'default_passing_score')::numeric, 60)
        INTO v_passing_threshold
        FROM public.system_settings
        WHERE key = 'academic_settings';
    END IF;

    -- Student Profile Header
    SELECT
        p.id,
        p.full_name,
        COALESCE(p.full_name_arabic, p.full_name) AS full_name_arabic,
        p.status,
        p.created_at,
        sap.student_number,
        sap.username,
        COALESCE(sap.enrolled_at, p.created_at) AS enrolled_at,
        sap.notes
    INTO v_student
    FROM public.profiles p
    LEFT JOIN public.student_academic_profiles sap ON sap.profile_id = p.id
    WHERE p.id = v_target_student_id AND p.role = 'student';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Student academic record not found' USING ERRCODE = 'P0002';
    END IF;

    -- Student Groups (filtered to staff scope when teacher)
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', g.id,
        'name', g.name,
        'name_arabic', g.name_arabic,
        'academic_year', g.academic_year,
        'is_active', g.is_active,
        'archived_at', g.archived_at,
        'is_primary', gs.is_primary,
        'joined_at', gs.joined_at
    ) ORDER BY gs.is_primary DESC, gs.joined_at DESC), '[]'::jsonb)
    INTO v_groups_json
    FROM public.group_students gs
    JOIN public.groups g ON g.id = gs.group_id
    WHERE gs.student_id = v_target_student_id
      AND (
        v_caller_role = 'student'
        OR v_is_super
        OR public.is_teacher_authorized_for_group(v_caller_id, g.id)
      );

    -- Deduplicated Courses & Lesson Progress
    WITH scoped_group_courses AS (
        SELECT DISTINCT
            c.id AS course_id,
            c.title,
            c.title_arabic,
            c.level,
            c.is_published,
            g.id AS group_id,
            g.name AS group_name,
            g.name_arabic AS group_name_arabic,
            g.academic_year
        FROM public.group_students gs
        JOIN public.groups g ON g.id = gs.group_id
        JOIN public.group_courses gc ON gc.group_id = g.id
        JOIN public.courses c ON c.id = gc.course_id
        WHERE gs.student_id = v_target_student_id
          AND (p_group_id IS NULL OR g.id = p_group_id)
          AND (p_course_id IS NULL OR c.id = p_course_id)
          AND (p_academic_year IS NULL OR p_academic_year = 'all' OR g.academic_year = p_academic_year)
          AND (
            v_caller_role = 'student'
            OR v_is_super
            OR c.teacher_id = v_caller_id
            OR public.is_teacher_authorized_for_group(v_caller_id, g.id)
          )
    ),
    distinct_courses AS (
        SELECT
            course_id,
            MAX(title) AS title,
            MAX(title_arabic) AS title_arabic,
            MAX(level) AS level,
            BOOL_OR(is_published) AS is_published,
            jsonb_agg(DISTINCT jsonb_build_object(
                'id', group_id,
                'name', group_name,
                'name_arabic', group_name_arabic,
                'academic_year', academic_year
            )) AS groups
        FROM scoped_group_courses
        GROUP BY course_id
    ),
    course_lesson_stats AS (
        SELECT
            dc.course_id,
            dc.title,
            dc.title_arabic,
            dc.level,
            dc.is_published,
            dc.groups,
            COUNT(l.id) FILTER (WHERE l.is_published = true) AS total_lessons,
            COUNT(lp.lesson_id) FILTER (WHERE l.is_published = true AND lp.is_completed = true) AS completed_lessons,
            MAX(lp.last_accessed_at) AS last_accessed_at
        FROM distinct_courses dc
        LEFT JOIN public.lessons l ON l.course_id = dc.course_id
        LEFT JOIN public.lesson_progress lp ON lp.lesson_id = l.id AND lp.student_id = v_target_student_id
        GROUP BY dc.course_id, dc.title, dc.title_arabic, dc.level, dc.is_published, dc.groups
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'course_id', cls.course_id,
        'title', cls.title,
        'title_arabic', cls.title_arabic,
        'level', cls.level,
        'is_published', cls.is_published,
        'groups', cls.groups,
        'total_lessons', cls.total_lessons,
        'completed_lessons', cls.completed_lessons,
        'pending_lessons', GREATEST(cls.total_lessons - cls.completed_lessons, 0),
        'progress_percentage', CASE
            WHEN cls.total_lessons = 0 THEN NULL
            ELSE ROUND((cls.completed_lessons::numeric / cls.total_lessons::numeric) * 100, 1)
        END,
        'last_accessed_at', cls.last_accessed_at
    ) ORDER BY cls.title ASC), '[]'::jsonb)
    INTO v_courses_json
    FROM course_lesson_stats cls;

    -- Consolidated Quiz Attempts (Respecting student release & Asia/Riyadh date bounds)
    WITH scoped_quiz_attempts AS (
        SELECT
            qa.id,
            qa.quiz_id,
            q.title AS quiz_title,
            q.title_arabic AS quiz_title_arabic,
            q.course_id,
            c.title AS course_title,
            c.title_arabic AS course_title_arabic,
            q.group_id,
            g.name AS group_name,
            g.name_arabic AS group_name_arabic,
            g.academic_year,
            qa.attempt_number,
            qa.status,
            q.passing_score,
            q.show_results_immediately,
            qa.requires_manual_grading,
            qa.started_at,
            qa.completed_at,
            qa.submitted_at,
            qa.graded_at,
            COALESCE(qa.submitted_at, qa.completed_at, qa.started_at) AS event_at,
            CASE
                WHEN qa.status = 'in_progress' THEN false
                WHEN v_is_staff THEN true
                WHEN qa.status = 'graded' THEN true
                WHEN qa.status = 'submitted' AND q.show_results_immediately AND NOT qa.requires_manual_grading THEN true
                ELSE false
            END AS can_view_score,
            qa.points_scored,
            qa.total_points_possible,
            qa.percentage_score,
            qa.is_passed,
            qa.teacher_feedback
        FROM public.quiz_attempts qa
        JOIN public.quizzes q ON q.id = qa.quiz_id
        LEFT JOIN public.courses c ON c.id = q.course_id
        LEFT JOIN public.groups g ON g.id = q.group_id
        WHERE qa.student_id = v_target_student_id
          AND (p_course_id IS NULL OR q.course_id = p_course_id)
          AND (p_group_id IS NULL OR q.group_id = p_group_id OR EXISTS (
              SELECT 1 FROM public.group_courses gc
              WHERE gc.course_id = q.course_id AND gc.group_id = p_group_id
          ))
          AND (p_academic_year IS NULL OR p_academic_year = 'all' OR g.academic_year = p_academic_year OR EXISTS (
              SELECT 1 FROM public.group_students gs2
              JOIN public.groups g2 ON g2.id = gs2.group_id
              WHERE gs2.student_id = v_target_student_id AND g2.academic_year = p_academic_year
          ))
          AND (p_date_from IS NULL OR (COALESCE(qa.submitted_at, qa.completed_at, qa.started_at) AT TIME ZONE 'Asia/Riyadh')::date >= p_date_from)
          AND (p_date_to IS NULL OR (COALESCE(qa.submitted_at, qa.completed_at, qa.started_at) AT TIME ZONE 'Asia/Riyadh')::date <= p_date_to)
          AND (
            v_caller_role = 'student'
            OR v_is_super
            OR public.can_manage_quiz(q.id)
            OR (q.group_id IS NOT NULL AND public.is_teacher_authorized_for_group(v_caller_id, q.group_id))
          )
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', sqa.id,
        'quiz_id', sqa.quiz_id,
        'title', sqa.quiz_title,
        'title_arabic', sqa.quiz_title_arabic,
        'course_id', sqa.course_id,
        'course_title', sqa.course_title,
        'course_title_arabic', sqa.course_title_arabic,
        'group_id', sqa.group_id,
        'group_name', sqa.group_name,
        'group_name_arabic', sqa.group_name_arabic,
        'academic_year', sqa.academic_year,
        'attempt_number', sqa.attempt_number,
        'status', sqa.status,
        'passing_score', sqa.passing_score,
        'requires_manual_grading', sqa.requires_manual_grading,
        'is_result_released', sqa.can_view_score,
        'points_scored', CASE WHEN sqa.can_view_score AND sqa.status IN ('submitted', 'graded') THEN sqa.points_scored ELSE NULL END,
        'total_points_possible', CASE WHEN sqa.can_view_score AND sqa.status IN ('submitted', 'graded') THEN sqa.total_points_possible ELSE NULL END,
        'percentage_score', CASE WHEN sqa.can_view_score AND sqa.status IN ('submitted', 'graded') THEN sqa.percentage_score ELSE NULL END,
        'is_passed', CASE WHEN sqa.can_view_score AND sqa.status IN ('submitted', 'graded') THEN sqa.is_passed ELSE NULL END,
        'teacher_feedback', CASE WHEN sqa.can_view_score THEN sqa.teacher_feedback ELSE NULL END,
        'started_at', sqa.started_at,
        'submitted_at', sqa.submitted_at,
        'graded_at', sqa.graded_at,
        'event_at', sqa.event_at
    ) ORDER BY sqa.event_at DESC), '[]'::jsonb)
    INTO v_quizzes_json
    FROM scoped_quiz_attempts sqa;

    -- Consolidated Assignment Submissions (Respecting student release & Asia/Riyadh date bounds)
    WITH scoped_submissions AS (
        SELECT
            s.id,
            s.assignment_id,
            a.title AS assignment_title,
            a.title_arabic AS assignment_title_arabic,
            a.course_id,
            c.title AS course_title,
            c.title_arabic AS course_title_arabic,
            a.target_group_id AS group_id,
            g.name AS group_name,
            g.name_arabic AS group_name_arabic,
            g.academic_year,
            s.attempt_number,
            s.status,
            a.max_score,
            a.due_date,
            s.submitted_at,
            s.is_late,
            s.graded_at,
            s.is_grade_released,
            s.released_at,
            CASE
                WHEN v_is_staff THEN (s.score IS NOT NULL)
                ELSE (s.is_grade_released = true AND s.score IS NOT NULL)
            END AS can_view_grade,
            s.score,
            s.teacher_feedback
        FROM public.submissions s
        JOIN public.assignments a ON a.id = s.assignment_id
        LEFT JOIN public.courses c ON c.id = a.course_id
        LEFT JOIN public.groups g ON g.id = a.target_group_id
        WHERE s.student_id = v_target_student_id
          AND (p_course_id IS NULL OR a.course_id = p_course_id)
          AND (p_group_id IS NULL OR a.target_group_id = p_group_id OR EXISTS (
              SELECT 1 FROM public.assignment_targets at
              WHERE at.assignment_id = a.id AND at.group_id = p_group_id
          ) OR EXISTS (
              SELECT 1 FROM public.group_courses gc
              WHERE gc.course_id = a.course_id AND gc.group_id = p_group_id
          ))
          AND (p_academic_year IS NULL OR p_academic_year = 'all' OR g.academic_year = p_academic_year OR EXISTS (
              SELECT 1 FROM public.group_students gs2
              JOIN public.groups g2 ON g2.id = gs2.group_id
              WHERE gs2.student_id = v_target_student_id AND g2.academic_year = p_academic_year
          ))
          AND (p_date_from IS NULL OR (s.submitted_at AT TIME ZONE 'Asia/Riyadh')::date >= p_date_from)
          AND (p_date_to IS NULL OR (s.submitted_at AT TIME ZONE 'Asia/Riyadh')::date <= p_date_to)
          AND (
            v_caller_role = 'student'
            OR v_is_super
            OR public.can_manage_assignment(a.id)
            OR (a.target_group_id IS NOT NULL AND public.is_teacher_authorized_for_group(v_caller_id, a.target_group_id))
          )
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', ss.id,
        'assignment_id', ss.assignment_id,
        'title', ss.assignment_title,
        'title_arabic', ss.assignment_title_arabic,
        'course_id', ss.course_id,
        'course_title', ss.course_title,
        'course_title_arabic', ss.course_title_arabic,
        'group_id', ss.group_id,
        'group_name', ss.group_name,
        'group_name_arabic', ss.group_name_arabic,
        'academic_year', ss.academic_year,
        'attempt_number', ss.attempt_number,
        'status', ss.status,
        'max_score', ss.max_score,
        'due_date', ss.due_date,
        'submitted_at', ss.submitted_at,
        'is_late', ss.is_late,
        'graded_at', ss.graded_at,
        'is_grade_released', ss.is_grade_released,
        'released_at', ss.released_at,
        'score', CASE WHEN ss.can_view_grade THEN ss.score ELSE NULL END,
        'percentage_score', CASE
            WHEN ss.can_view_grade AND ss.max_score > 0
                THEN ROUND((ss.score::numeric / ss.max_score::numeric) * 100, 1)
            ELSE NULL
        END,
        'teacher_feedback', CASE WHEN ss.can_view_grade OR ss.status = 'returned_for_revision' THEN ss.teacher_feedback ELSE NULL END
    ) ORDER BY ss.submitted_at DESC), '[]'::jsonb)
    INTO v_assignments_json
    FROM scoped_submissions ss;

    -- Attendance History & Summary (Respecting Riyadh date bounds & group/course filter)
    WITH scoped_attendance AS (
        SELECT
            att.id,
            att.session_id,
            ls.title AS session_title,
            ls.title_arabic AS session_title_arabic,
            ls.course_id,
            c.title AS course_title,
            c.title_arabic AS course_title_arabic,
            ls.group_id,
            g.name AS group_name,
            g.name_arabic AS group_name_arabic,
            g.academic_year,
            ls.start_time,
            ls.end_time,
            ls.status AS session_status,
            att.status::text AS status,
            att.joined_at,
            att.recorded_at,
            att.notes
        FROM public.attendance att
        JOIN public.live_sessions ls ON ls.id = att.session_id
        LEFT JOIN public.courses c ON c.id = ls.course_id
        LEFT JOIN public.groups g ON g.id = ls.group_id
        WHERE att.student_id = v_target_student_id
          AND (p_course_id IS NULL OR ls.course_id = p_course_id)
          AND (p_group_id IS NULL OR ls.group_id = p_group_id)
          AND (p_academic_year IS NULL OR p_academic_year = 'all' OR g.academic_year = p_academic_year)
          AND (p_date_from IS NULL OR (ls.start_time AT TIME ZONE 'Asia/Riyadh')::date >= p_date_from)
          AND (p_date_to IS NULL OR (ls.start_time AT TIME ZONE 'Asia/Riyadh')::date <= p_date_to)
          AND (
            v_caller_role = 'student'
            OR v_is_super
            OR ls.teacher_id = v_caller_id
            OR (ls.group_id IS NOT NULL AND public.is_teacher_authorized_for_group(v_caller_id, ls.group_id))
          )
    )
    SELECT
        COALESCE(jsonb_agg(jsonb_build_object(
            'id', sa.id,
            'session_id', sa.session_id,
            'session_title', sa.session_title,
            'session_title_arabic', sa.session_title_arabic,
            'course_id', sa.course_id,
            'course_title', sa.course_title,
            'course_title_arabic', sa.course_title_arabic,
            'group_id', sa.group_id,
            'group_name', sa.group_name,
            'group_name_arabic', sa.group_name_arabic,
            'start_time', sa.start_time,
            'status', sa.status,
            'joined_at', sa.joined_at,
            'recorded_at', sa.recorded_at,
            'notes', sa.notes
        ) ORDER BY sa.start_time DESC), '[]'::jsonb),
        jsonb_build_object(
            'present', COUNT(*) FILTER (WHERE sa.status = 'present'),
            'late', COUNT(*) FILTER (WHERE sa.status = 'late'),
            'excused', COUNT(*) FILTER (WHERE sa.status = 'excused'),
            'absent', COUNT(*) FILTER (WHERE sa.status = 'absent'),
            'total', COUNT(*),
            'countable_total', COUNT(*) FILTER (WHERE sa.status IN ('present', 'late', 'absent')),
            'attendance_rate_pct', CASE
                WHEN COUNT(*) FILTER (WHERE sa.status IN ('present', 'late', 'absent')) = 0 THEN NULL
                ELSE ROUND(
                    (COUNT(*) FILTER (WHERE sa.status IN ('present', 'late'))::numeric /
                    COUNT(*) FILTER (WHERE sa.status IN ('present', 'late', 'absent'))::numeric) * 100,
                    1
                )
            END
        )
    INTO v_attendance_json, v_attendance_summary
    FROM scoped_attendance sa;

    -- Latest Learning Activity Timestamp across lessons, quizzes, submissions, attendance
    SELECT MAX(ts) INTO v_last_activity
    FROM (
        SELECT MAX(lp.last_accessed_at) AS ts FROM public.lesson_progress lp WHERE lp.student_id = v_target_student_id
        UNION ALL
        SELECT MAX(COALESCE(qa.submitted_at, qa.completed_at, qa.started_at)) FROM public.quiz_attempts qa WHERE qa.student_id = v_target_student_id
        UNION ALL
        SELECT MAX(s.submitted_at) FROM public.submissions s WHERE s.student_id = v_target_student_id
        UNION ALL
        SELECT MAX(att.recorded_at) FROM public.attendance att WHERE att.student_id = v_target_student_id
    ) activity_dates;

    -- Overall Summary Metrics (Strictly NULL when zero graded/countable items)
    WITH course_totals AS (
        SELECT
            COUNT(*)::int AS enrolled_courses,
            COALESCE(SUM((elem->>'total_lessons')::int), 0)::int AS total_lessons,
            COALESCE(SUM((elem->>'completed_lessons')::int), 0)::int AS completed_lessons
        FROM jsonb_array_elements(v_courses_json) AS elem
    ),
    quiz_totals AS (
        SELECT
            COUNT(*)::int AS total_attempts,
            COUNT(*) FILTER (WHERE elem->>'status' IN ('submitted', 'graded'))::int AS completed_attempts,
            COUNT(*) FILTER (WHERE (elem->>'percentage_score') IS NOT NULL)::int AS graded_attempts,
            ROUND(AVG((elem->>'percentage_score')::numeric), 1) AS avg_quiz_pct
        FROM jsonb_array_elements(v_quizzes_json) AS elem
    ),
    assign_totals AS (
        SELECT
            COUNT(*)::int AS total_submissions,
            COUNT(*) FILTER (WHERE (elem->>'percentage_score') IS NOT NULL)::int AS graded_submissions,
            ROUND(AVG((elem->>'percentage_score')::numeric), 1) AS avg_assign_pct
        FROM jsonb_array_elements(v_assignments_json) AS elem
    ),
    combined_scores AS (
        SELECT (elem->>'percentage_score')::numeric AS pct
        FROM jsonb_array_elements(v_quizzes_json) AS elem
        WHERE (elem->>'percentage_score') IS NOT NULL
        UNION ALL
        SELECT (elem->>'percentage_score')::numeric AS pct
        FROM jsonb_array_elements(v_assignments_json) AS elem
        WHERE (elem->>'percentage_score') IS NOT NULL
    )
    SELECT jsonb_build_object(
        'enrolled_courses', ct.enrolled_courses,
        'total_lessons', ct.total_lessons,
        'completed_lessons', ct.completed_lessons,
        'pending_lessons', GREATEST(ct.total_lessons - ct.completed_lessons, 0),
        'course_progress_pct', CASE
            WHEN ct.total_lessons = 0 THEN NULL
            ELSE ROUND((ct.completed_lessons::numeric / ct.total_lessons::numeric) * 100, 1)
        END,
        'quiz_attempts_count', qt.total_attempts,
        'completed_quizzes_count', qt.completed_attempts,
        'graded_quizzes_count', qt.graded_attempts,
        'avg_quiz_percentage', qt.avg_quiz_pct,
        'assignment_submissions_count', ast.total_submissions,
        'graded_assignments_count', ast.graded_submissions,
        'avg_assignment_percentage', ast.avg_assign_pct,
        'overall_academic_average_pct', (SELECT ROUND(AVG(pct), 1) FROM combined_scores),
        'passing_threshold', v_passing_threshold,
        'attendance_rate_pct', v_attendance_summary->'attendance_rate_pct',
        'last_learning_activity_at', v_last_activity
    )
    INTO v_summary_json
    FROM course_totals ct, quiz_totals qt, assign_totals ast;

    RETURN jsonb_build_object(
        'student', jsonb_build_object(
            'id', v_student.id,
            'full_name', v_student.full_name,
            'full_name_arabic', v_student.full_name_arabic,
            'status', v_student.status,
            'student_number', v_student.student_number,
            'username', v_student.username,
            'enrolled_at', v_student.enrolled_at,
            'notes', CASE WHEN v_is_staff THEN v_student.notes ELSE NULL END
        ),
        'groups', v_groups_json,
        'courses', v_courses_json,
        'quizzes', v_quizzes_json,
        'assignments', v_assignments_json,
        'attendance', v_attendance_json,
        'attendance_summary', v_attendance_summary,
        'summary', v_summary_json,
        'timezone', 'Asia/Riyadh'
    );
END;
$$;

ALTER FUNCTION public.get_student_academic_record(UUID, UUID, UUID, TEXT, DATE, DATE) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_student_academic_record(UUID, UUID, UUID, TEXT, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_academic_record(UUID, UUID, UUID, TEXT, DATE, DATE) TO authenticated;
