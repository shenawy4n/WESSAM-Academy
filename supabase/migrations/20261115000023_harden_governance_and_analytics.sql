-- ==============================================================================
-- WESSAM Academy - Migration 20261115000023: Governance & Analytics Hardening
-- Forward-only remediation migration:
-- 1. Pin search_path = '' on public.jsonb_contains_forbidden_secret_key(JSONB)
-- 2. Serialize update_staff_account_access with transaction advisory lock to
--    prevent concurrent demotion/deactivation leaving 0 active Super Admins
-- 3. Harden get_phase6_analytics_dashboard filters (academic_year in courses &
--    attendance, course-wide quizzes in group filters, latest submission
--    deduplication, strict group attribution for avg_quiz_score_pct, is_archived)
-- 4. Decouple _process_due_scheduled_announcements() / _publish_announcement_internal()
--    from caller auth inside student notification polling RPCs while restricting
--    process_scheduled_announcements() to teachers & super admins
-- 5. Fix start_quiz_attempt numeric order_index sorting (INT instead of text)
-- 6. Align video_assets student SELECT policy with is_student_authorized_for_video
-- 7. Require teacher or super_admin role explicitly in get_question_bank_stats()
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. SECRET VALIDATOR SEARCH_PATH HARDENING
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.jsonb_contains_forbidden_secret_key(p_payload JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
    v_key TEXT;
    v_val JSONB;
    v_text TEXT;
BEGIN
    IF p_payload IS NULL THEN
        RETURN false;
    END IF;

    IF pg_catalog.jsonb_typeof(p_payload) = 'object' THEN
        FOR v_key, v_val IN SELECT key, value FROM pg_catalog.jsonb_each(p_payload)
        LOOP
            IF pg_catalog.lower(v_key) ~ '(secret|password|passphrase|private_key|api_key|apikey|service_role|anon_key|access_token|refresh_token|bearer)' THEN
                RETURN true;
            END IF;
            IF public.jsonb_contains_forbidden_secret_key(v_val) THEN
                RETURN true;
            END IF;
        END LOOP;
    ELSIF pg_catalog.jsonb_typeof(p_payload) = 'array' THEN
        FOR v_val IN SELECT value FROM pg_catalog.jsonb_array_elements(p_payload)
        LOOP
            IF public.jsonb_contains_forbidden_secret_key(v_val) THEN
                RETURN true;
            END IF;
        END LOOP;
    ELSIF pg_catalog.jsonb_typeof(p_payload) = 'string' THEN
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
-- 2. SUPER ADMIN CONCURRENCY LOCK IN update_staff_account_access
-- ------------------------------------------------------------------------------
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

    -- Serialize concurrent staff-role/super-admin governance updates before reading snapshots
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('wessam.super_admin_governance'));

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
        jsonb_build_object('role', p_new_role, 'status', p_new_status, 'reason', NULLIF(pg_catalog.btrim(COALESCE(p_reason, '')), '')),
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
-- 3. HARDENED ANALYTICS DASHBOARD RPC (SCOPING, RESUBMISSIONS & ARCHIVED FLAGS)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_phase6_analytics_dashboard(
    p_date_from DATE DEFAULT NULL,
    p_date_to DATE DEFAULT NULL,
    p_group_id UUID DEFAULT NULL,
    p_course_id UUID DEFAULT NULL,
    p_academic_year TEXT DEFAULT NULL,
    p_attention_threshold NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
    v_caller_id UUID;
    v_is_super BOOLEAN := false;
    v_start_ts TIMESTAMPTZ := NULL;
    v_end_ts TIMESTAMPTZ := NULL;
    v_attention_score_threshold NUMERIC := 60;
    v_attention_att_threshold NUMERIC := 75;
    v_active_teachers_count INT := NULL;
    v_kpis_json JSONB;
    v_student_analytics_json JSONB;
    v_group_analytics_json JSONB;
    v_course_analytics_json JSONB;
    v_attendance_analytics_json JSONB;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Not authenticated' USING ERRCODE = '42501';
    END IF;

    v_is_super := public.is_super_admin();
    IF NOT v_is_super AND NOT public.is_teacher() THEN
        RAISE EXCEPTION 'Forbidden: Analytics are restricted to teachers and super admins' USING ERRCODE = '42501';
    END IF;

    -- Explicit target scope checks for non-super-admin teachers
    IF p_group_id IS NOT NULL AND NOT v_is_super THEN
        IF NOT public.is_teacher_authorized_for_group(v_caller_id, p_group_id) THEN
            RAISE EXCEPTION 'Forbidden: You are not authorized to inspect analytics for this group' USING ERRCODE = '42501';
        END IF;
    END IF;

    IF p_course_id IS NOT NULL AND NOT v_is_super THEN
        IF NOT public.can_manage_course(p_course_id) THEN
            RAISE EXCEPTION 'Forbidden: You are not authorized to inspect analytics for this course' USING ERRCODE = '42501';
        END IF;
    END IF;

    -- Strict Asia/Riyadh day boundaries converted to UTC TIMESTAMPTZ half-open intervals
    IF p_date_from IS NOT NULL THEN
        v_start_ts := (p_date_from::timestamp AT TIME ZONE 'Asia/Riyadh');
    END IF;

    IF p_date_to IS NOT NULL THEN
        v_end_ts := ((p_date_to + 1)::timestamp AT TIME ZONE 'Asia/Riyadh');
    END IF;

    -- Resolve configurable attention thresholds (parameter > system_settings > safe default)
    IF to_regclass('public.system_settings') IS NOT NULL THEN
        SELECT
            COALESCE((value->>'attention_threshold_score')::numeric, 60),
            COALESCE((value->>'attention_attendance_threshold')::numeric, 75)
        INTO v_attention_score_threshold, v_attention_att_threshold
        FROM public.system_settings
        WHERE key = 'academic_settings';
    END IF;

    IF p_attention_threshold IS NOT NULL THEN
        v_attention_score_threshold := GREATEST(0, LEAST(100, p_attention_threshold));
    END IF;

    IF v_is_super THEN
        SELECT COUNT(*)::int INTO v_active_teachers_count
        FROM public.profiles
        WHERE role IN ('teacher', 'super_admin') AND status = 'active';
    END IF;

    WITH scoped_groups AS (
        SELECT g.id, g.name, g.name_arabic, g.academic_year, g.is_active, g.archived_at
        FROM public.groups g
        WHERE g.archived_at IS NULL
          AND (p_group_id IS NULL OR g.id = p_group_id)
          AND (p_academic_year IS NULL OR p_academic_year = 'all' OR g.academic_year = p_academic_year)
          AND (
            v_is_super
            OR public.is_teacher_authorized_for_group(v_caller_id, g.id)
          )
    ),
    scoped_courses AS (
        SELECT DISTINCT c.id, c.title, c.title_arabic, c.level, c.is_published, c.teacher_id
        FROM public.courses c
        WHERE (p_course_id IS NULL OR c.id = p_course_id)
          AND (
            v_is_super
            OR c.teacher_id = v_caller_id
          )
          AND (
            (p_group_id IS NULL AND (p_academic_year IS NULL OR p_academic_year = 'all'))
            OR EXISTS (
                SELECT 1
                FROM public.group_courses gc
                JOIN public.groups g ON g.id = gc.group_id
                WHERE gc.course_id = c.id
                  AND g.archived_at IS NULL
                  AND (p_group_id IS NULL OR g.id = p_group_id)
                  AND (p_academic_year IS NULL OR p_academic_year = 'all' OR g.academic_year = p_academic_year)
            )
          )
    ),
    scoped_students AS (
        SELECT DISTINCT p.id, p.full_name, COALESCE(p.full_name_arabic, p.full_name) AS full_name_arabic, p.status
        FROM public.profiles p
        LEFT JOIN public.group_students gs ON gs.student_id = p.id
        WHERE p.role = 'student'
          AND (
            (v_is_super AND p_group_id IS NULL AND p_course_id IS NULL AND (p_academic_year IS NULL OR p_academic_year = 'all'))
            OR (gs.group_id IN (SELECT id FROM scoped_groups))
          )
          AND (
            p_course_id IS NULL
            OR EXISTS (
                SELECT 1
                FROM public.group_students gs2
                JOIN public.group_courses gc2 ON gc2.group_id = gs2.group_id
                WHERE gs2.student_id = p.id AND gc2.course_id = p_course_id
                  AND gs2.group_id IN (SELECT id FROM scoped_groups)
            )
          )
    ),
    scoped_sessions AS (
        SELECT ls.id, ls.group_id, ls.course_id, ls.title, ls.title_arabic, ls.start_time, ls.status
        FROM public.live_sessions ls
        WHERE ls.status <> 'cancelled'
          AND (p_group_id IS NULL OR ls.group_id = p_group_id)
          AND (p_course_id IS NULL OR ls.course_id = p_course_id)
          AND (v_start_ts IS NULL OR ls.start_time >= v_start_ts)
          AND (v_end_ts IS NULL OR ls.start_time < v_end_ts)
          AND (
            p_academic_year IS NULL OR p_academic_year = 'all'
            OR EXISTS (SELECT 1 FROM scoped_groups sg WHERE sg.id = ls.group_id)
          )
          AND (
            v_is_super
            OR ls.teacher_id = v_caller_id
            OR (ls.group_id IS NOT NULL AND ls.group_id IN (SELECT id FROM scoped_groups))
          )
    ),
    scoped_attendance AS (
        SELECT
            att.id,
            att.session_id,
            att.student_id,
            att.status::text AS status,
            ss.group_id,
            ss.start_time
        FROM public.attendance att
        JOIN scoped_sessions ss ON ss.id = att.session_id
        WHERE att.student_id IN (SELECT id FROM scoped_students)
    ),
    scoped_quizzes AS (
        SELECT q.id, q.course_id, q.group_id, q.passing_score
        FROM public.quizzes q
        WHERE q.is_archived = false
          AND (p_course_id IS NULL OR q.course_id = p_course_id)
          AND (
            (p_group_id IS NULL AND (p_academic_year IS NULL OR p_academic_year = 'all'))
            OR (q.group_id IS NOT NULL AND q.group_id IN (SELECT id FROM scoped_groups))
            OR (
                q.group_id IS NULL
                AND q.course_id IS NOT NULL
                AND EXISTS (
                    SELECT 1
                    FROM public.group_courses gc
                    JOIN scoped_groups sg ON sg.id = gc.group_id
                    WHERE gc.course_id = q.course_id
                )
            )
          )
          AND (
            v_is_super
            OR q.teacher_id = v_caller_id
            OR (q.course_id IS NOT NULL AND q.course_id IN (SELECT id FROM scoped_courses))
          )
    ),
    scoped_quiz_attempts AS (
        SELECT
            qa.id,
            qa.quiz_id,
            qa.student_id,
            sq.course_id,
            sq.group_id,
            qa.percentage_score,
            qa.points_scored,
            qa.total_points_possible,
            qa.is_passed,
            qa.status,
            COALESCE(qa.submitted_at, qa.completed_at, qa.started_at) AS event_at
        FROM public.quiz_attempts qa
        JOIN scoped_quizzes sq ON sq.id = qa.quiz_id
        WHERE qa.student_id IN (SELECT id FROM scoped_students)
          AND qa.status IN ('submitted', 'graded')
          AND qa.percentage_score IS NOT NULL
          AND (v_start_ts IS NULL OR COALESCE(qa.submitted_at, qa.completed_at, qa.started_at) >= v_start_ts)
          AND (v_end_ts IS NULL OR COALESCE(qa.submitted_at, qa.completed_at, qa.started_at) < v_end_ts)
    ),
    scoped_assignments AS (
        SELECT a.id, a.course_id, a.target_group_id, a.max_score, a.is_published, a.created_at
        FROM public.assignments a
        WHERE a.is_published = true
          AND (p_course_id IS NULL OR a.course_id = p_course_id)
          AND (
            (p_group_id IS NULL AND (p_academic_year IS NULL OR p_academic_year = 'all'))
            OR a.target_group_id IN (SELECT id FROM scoped_groups)
            OR EXISTS (
                SELECT 1 FROM public.assignment_targets at
                WHERE at.assignment_id = a.id AND at.group_id IN (SELECT id FROM scoped_groups)
            )
            OR EXISTS (
                SELECT 1 FROM public.group_courses gc
                WHERE gc.course_id = a.course_id AND gc.group_id IN (SELECT id FROM scoped_groups)
            )
          )
          AND (
            v_is_super
            OR a.teacher_id = v_caller_id
            OR a.course_id IN (SELECT id FROM scoped_courses)
          )
    ),
    expected_assignment_pairs AS (
        SELECT DISTINCT sa.id AS assignment_id, st.id AS student_id, sa.course_id, sa.max_score
        FROM scoped_assignments sa
        JOIN scoped_students st ON st.status = 'active'
        WHERE (v_start_ts IS NULL OR sa.created_at >= v_start_ts)
          AND (v_end_ts IS NULL OR sa.created_at < v_end_ts)
          AND (
            EXISTS (
                SELECT 1 FROM public.group_students gs
                WHERE gs.student_id = st.id AND gs.group_id = sa.target_group_id
            )
            OR EXISTS (
                SELECT 1 FROM public.assignment_targets at
                WHERE at.assignment_id = sa.id
                  AND ((at.target_type = 'student' AND at.student_id = st.id)
                       OR (at.target_type = 'group' AND EXISTS (
                           SELECT 1 FROM public.group_students gs2
                           WHERE gs2.student_id = st.id AND gs2.group_id = at.group_id
                       )))
            )
            OR (
                sa.target_group_id IS NULL
                AND NOT EXISTS (SELECT 1 FROM public.assignment_targets at2 WHERE at2.assignment_id = sa.id)
                AND EXISTS (
                    SELECT 1 FROM public.group_courses gc
                    JOIN public.group_students gs3 ON gs3.group_id = gc.group_id
                    WHERE gc.course_id = sa.course_id AND gs3.student_id = st.id
                )
            )
          )
    ),
    scoped_submissions AS (
        SELECT
            s.id,
            s.assignment_id,
            s.student_id,
            sa.course_id,
            sa.max_score,
            s.score,
            s.submitted_at,
            s.status
        FROM public.submissions s
        JOIN scoped_assignments sa ON sa.id = s.assignment_id
        WHERE s.student_id IN (SELECT id FROM scoped_students)
          AND (v_start_ts IS NULL OR s.submitted_at >= v_start_ts)
          AND (v_end_ts IS NULL OR s.submitted_at < v_end_ts)
    ),
    expected_course_lessons AS (
        SELECT DISTINCT st.id AS student_id, l.course_id, l.id AS lesson_id
        FROM scoped_students st
        JOIN public.group_students gs ON gs.student_id = st.id
        JOIN scoped_groups sg ON sg.id = gs.group_id
        JOIN public.group_courses gc ON gc.group_id = sg.id
        JOIN scoped_courses sc ON sc.id = gc.course_id
        JOIN public.lessons l ON l.course_id = sc.id AND l.is_published = true
        WHERE st.status = 'active'
    ),
    completed_course_lessons AS (
        SELECT ecl.student_id, ecl.course_id, ecl.lesson_id
        FROM expected_course_lessons ecl
        JOIN public.lesson_progress lp ON lp.student_id = ecl.student_id AND lp.lesson_id = ecl.lesson_id
        WHERE lp.is_completed = true
    )
    SELECT jsonb_build_object(
        'active_students_count', (SELECT COUNT(*)::int FROM scoped_students WHERE status = 'active'),
        'total_students_count', (SELECT COUNT(*)::int FROM scoped_students),
        'active_groups_count', (SELECT COUNT(*)::int FROM scoped_groups WHERE is_active = true),
        'published_courses_count', (SELECT COUNT(*)::int FROM scoped_courses WHERE is_published = true),
        'active_teachers_count', v_active_teachers_count,
        'live_sessions_count', (SELECT COUNT(*)::int FROM scoped_sessions),
        'attendance_rate_pct', (
            SELECT CASE
                WHEN COUNT(*) FILTER (WHERE status IN ('present', 'late', 'absent')) = 0 THEN NULL
                ELSE ROUND(
                    (COUNT(*) FILTER (WHERE status IN ('present', 'late'))::numeric /
                    COUNT(*) FILTER (WHERE status IN ('present', 'late', 'absent'))::numeric) * 100,
                    1
                )
            END
            FROM scoped_attendance
        ),
        'attendance_records_count', (SELECT COUNT(*)::int FROM scoped_attendance),
        'avg_quiz_score_pct', (
            SELECT CASE
                WHEN COUNT(*) = 0 THEN NULL
                ELSE ROUND(AVG(percentage_score), 1)
            END
            FROM scoped_quiz_attempts
        ),
        'graded_quiz_attempts_count', (SELECT COUNT(*)::int FROM scoped_quiz_attempts),
        'assignment_completion_rate_pct', (
            SELECT CASE
                WHEN (SELECT COUNT(*) FROM expected_assignment_pairs) = 0 THEN NULL
                ELSE ROUND(
                    ((SELECT COUNT(DISTINCT (ss.assignment_id, ss.student_id))
                      FROM scoped_submissions ss
                      JOIN expected_assignment_pairs eap
                        ON eap.assignment_id = ss.assignment_id AND eap.student_id = ss.student_id)::numeric /
                    (SELECT COUNT(*) FROM expected_assignment_pairs)::numeric) * 100,
                    1
                )
            END
        ),
        'expected_assignment_pairs_count', (SELECT COUNT(*)::int FROM expected_assignment_pairs),
        'submitted_assignment_pairs_count', (
            SELECT COUNT(DISTINCT (ss.assignment_id, ss.student_id))::int
            FROM scoped_submissions ss
            JOIN expected_assignment_pairs eap
              ON eap.assignment_id = ss.assignment_id AND eap.student_id = ss.student_id
        ),
        'avg_course_progress_pct', (
            SELECT CASE
                WHEN (SELECT COUNT(*) FROM expected_course_lessons) = 0 THEN NULL
                ELSE ROUND(
                    ((SELECT COUNT(*) FROM completed_course_lessons)::numeric /
                     (SELECT COUNT(*) FROM expected_course_lessons)::numeric) * 100,
                    1
                )
            END
        ),
        'expected_lesson_completions_count', (SELECT COUNT(*)::int FROM expected_course_lessons),
        'completed_lesson_completions_count', (SELECT COUNT(*)::int FROM completed_course_lessons)
    ) INTO v_kpis_json;

    -- Student Analytics: Distribution, Top Performers & Attention Needed
    WITH scoped_groups AS (
        SELECT g.id FROM public.groups g
        WHERE g.archived_at IS NULL
          AND (p_group_id IS NULL OR g.id = p_group_id)
          AND (p_academic_year IS NULL OR p_academic_year = 'all' OR g.academic_year = p_academic_year)
          AND (v_is_super OR public.is_teacher_authorized_for_group(v_caller_id, g.id))
    ),
    scoped_courses AS (
        SELECT DISTINCT c.id FROM public.courses c
        WHERE (p_course_id IS NULL OR c.id = p_course_id)
          AND (v_is_super OR c.teacher_id = v_caller_id)
          AND (
            (p_group_id IS NULL AND (p_academic_year IS NULL OR p_academic_year = 'all'))
            OR EXISTS (
                SELECT 1
                FROM public.group_courses gc
                JOIN public.groups g ON g.id = gc.group_id
                WHERE gc.course_id = c.id
                  AND g.archived_at IS NULL
                  AND (p_group_id IS NULL OR g.id = p_group_id)
                  AND (p_academic_year IS NULL OR p_academic_year = 'all' OR g.academic_year = p_academic_year)
            )
          )
    ),
    scoped_students AS (
        SELECT DISTINCT p.id, p.full_name, COALESCE(p.full_name_arabic, p.full_name) AS full_name_arabic, p.status
        FROM public.profiles p
        LEFT JOIN public.group_students gs ON gs.student_id = p.id
        WHERE p.role = 'student' AND p.status = 'active'
          AND ((v_is_super AND p_group_id IS NULL AND p_course_id IS NULL AND (p_academic_year IS NULL OR p_academic_year = 'all'))
               OR gs.group_id IN (SELECT id FROM scoped_groups))
          AND (p_course_id IS NULL OR EXISTS (
              SELECT 1 FROM public.group_students gs2 JOIN public.group_courses gc2 ON gc2.group_id = gs2.group_id
              WHERE gs2.student_id = p.id AND gc2.course_id = p_course_id
                AND gs2.group_id IN (SELECT id FROM scoped_groups)
          ))
    ),
    student_quiz_agg AS (
        SELECT
            qa.student_id,
            ROUND(AVG(qa.percentage_score), 1) AS avg_quiz_pct,
            COUNT(*)::int AS quiz_count
        FROM public.quiz_attempts qa
        JOIN public.quizzes q ON q.id = qa.quiz_id
        WHERE qa.student_id IN (SELECT id FROM scoped_students)
          AND q.is_archived = false
          AND qa.status IN ('submitted', 'graded')
          AND qa.percentage_score IS NOT NULL
          AND (p_course_id IS NULL OR q.course_id = p_course_id)
          AND (
            (p_group_id IS NULL AND (p_academic_year IS NULL OR p_academic_year = 'all'))
            OR (q.group_id IS NOT NULL AND q.group_id IN (SELECT id FROM scoped_groups))
            OR (
                q.group_id IS NULL
                AND q.course_id IS NOT NULL
                AND EXISTS (
                    SELECT 1
                    FROM public.group_courses gc
                    JOIN scoped_groups sg ON sg.id = gc.group_id
                    WHERE gc.course_id = q.course_id
                )
            )
          )
          AND (v_start_ts IS NULL OR COALESCE(qa.submitted_at, qa.completed_at, qa.started_at) >= v_start_ts)
          AND (v_end_ts IS NULL OR COALESCE(qa.submitted_at, qa.completed_at, qa.started_at) < v_end_ts)
          AND (v_is_super OR q.teacher_id = v_caller_id OR q.course_id IN (SELECT id FROM scoped_courses))
        GROUP BY qa.student_id
    ),
    latest_graded_submissions AS (
        SELECT DISTINCT ON (s.assignment_id, s.student_id)
            s.assignment_id,
            s.student_id,
            s.score,
            a.max_score,
            s.submitted_at
        FROM public.submissions s
        JOIN public.assignments a ON a.id = s.assignment_id
        WHERE s.student_id IN (SELECT id FROM scoped_students)
          AND a.is_published = true
          AND s.score IS NOT NULL AND a.max_score > 0
          AND (p_course_id IS NULL OR a.course_id = p_course_id)
          AND (
            (p_group_id IS NULL AND (p_academic_year IS NULL OR p_academic_year = 'all'))
            OR a.target_group_id IN (SELECT id FROM scoped_groups)
            OR EXISTS (
                SELECT 1 FROM public.assignment_targets at
                WHERE at.assignment_id = a.id AND at.group_id IN (SELECT id FROM scoped_groups)
            )
            OR EXISTS (
                SELECT 1 FROM public.group_courses gc
                WHERE gc.course_id = a.course_id AND gc.group_id IN (SELECT id FROM scoped_groups)
            )
          )
          AND (v_start_ts IS NULL OR s.submitted_at >= v_start_ts)
          AND (v_end_ts IS NULL OR s.submitted_at < v_end_ts)
          AND (v_is_super OR a.teacher_id = v_caller_id OR a.course_id IN (SELECT id FROM scoped_courses))
        ORDER BY s.assignment_id, s.student_id, s.submitted_at DESC NULLS LAST, s.created_at DESC
    ),
    student_assign_agg AS (
        SELECT
            lgs.student_id,
            ROUND(AVG((lgs.score::numeric / NULLIF(lgs.max_score, 0)) * 100), 1) AS avg_assign_pct,
            COUNT(*)::int AS graded_assign_count
        FROM latest_graded_submissions lgs
        GROUP BY lgs.student_id
    ),
    student_att_agg AS (
        SELECT
            att.student_id,
            COUNT(*) FILTER (WHERE att.status::text IN ('present', 'late', 'absent'))::int AS countable_att,
            CASE
                WHEN COUNT(*) FILTER (WHERE att.status::text IN ('present', 'late', 'absent')) = 0 THEN NULL
                ELSE ROUND(
                    (COUNT(*) FILTER (WHERE att.status::text IN ('present', 'late'))::numeric /
                     COUNT(*) FILTER (WHERE att.status::text IN ('present', 'late', 'absent'))::numeric) * 100,
                    1
                )
            END AS attendance_rate_pct
        FROM public.attendance att
        JOIN public.live_sessions ls ON ls.id = att.session_id
        WHERE att.student_id IN (SELECT id FROM scoped_students)
          AND ls.status <> 'cancelled'
          AND (p_group_id IS NULL OR ls.group_id = p_group_id)
          AND (p_academic_year IS NULL OR p_academic_year = 'all' OR ls.group_id IN (SELECT id FROM scoped_groups))
          AND (p_course_id IS NULL OR ls.course_id = p_course_id)
          AND (v_start_ts IS NULL OR ls.start_time >= v_start_ts)
          AND (v_end_ts IS NULL OR ls.start_time < v_end_ts)
        GROUP BY att.student_id
    ),
    student_metrics AS (
        SELECT
            st.id AS student_id,
            st.full_name,
            st.full_name_arabic,
            sq.avg_quiz_pct,
            COALESCE(sq.quiz_count, 0) AS quiz_count,
            sa.avg_assign_pct,
            COALESCE(sa.graded_assign_count, 0) AS graded_assign_count,
            sat.attendance_rate_pct,
            COALESCE(sat.countable_att, 0) AS attendance_sessions_count,
            CASE
                WHEN sq.avg_quiz_pct IS NOT NULL AND sa.avg_assign_pct IS NOT NULL
                    THEN ROUND((sq.avg_quiz_pct + sa.avg_assign_pct) / 2.0, 1)
                ELSE COALESCE(sq.avg_quiz_pct, sa.avg_assign_pct)
            END AS combined_score_pct
        FROM scoped_students st
        LEFT JOIN student_quiz_agg sq ON sq.student_id = st.id
        LEFT JOIN student_assign_agg sa ON sa.student_id = st.id
        LEFT JOIN student_att_agg sat ON sat.student_id = st.id
    )
    SELECT jsonb_build_object(
        'score_distribution', jsonb_build_array(
            jsonb_build_object('band', '90_100', 'count', (SELECT COUNT(*)::int FROM student_metrics WHERE combined_score_pct >= 90)),
            jsonb_build_object('band', '75_89', 'count', (SELECT COUNT(*)::int FROM student_metrics WHERE combined_score_pct >= 75 AND combined_score_pct < 90)),
            jsonb_build_object('band', '60_74', 'count', (SELECT COUNT(*)::int FROM student_metrics WHERE combined_score_pct >= 60 AND combined_score_pct < 75)),
            jsonb_build_object('band', 'below_60', 'count', (SELECT COUNT(*)::int FROM student_metrics WHERE combined_score_pct IS NOT NULL AND combined_score_pct < 60)),
            jsonb_build_object('band', 'ungraded', 'count', (SELECT COUNT(*)::int FROM student_metrics WHERE combined_score_pct IS NULL))
        ),
        'top_performers', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'student_id', sm.student_id,
                'full_name', sm.full_name,
                'full_name_arabic', sm.full_name_arabic,
                'combined_score_pct', sm.combined_score_pct,
                'avg_quiz_pct', sm.avg_quiz_pct,
                'avg_assign_pct', sm.avg_assign_pct,
                'attendance_rate_pct', sm.attendance_rate_pct
            ) ORDER BY sm.combined_score_pct DESC, sm.attendance_rate_pct DESC NULLS LAST)
            FROM (
                SELECT * FROM student_metrics
                WHERE combined_score_pct IS NOT NULL
                ORDER BY combined_score_pct DESC
                LIMIT 10
            ) sm
        ), '[]'::jsonb),
        'attention_needed', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'student_id', sm.student_id,
                'full_name', sm.full_name,
                'full_name_arabic', sm.full_name_arabic,
                'combined_score_pct', sm.combined_score_pct,
                'avg_quiz_pct', sm.avg_quiz_pct,
                'avg_assign_pct', sm.avg_assign_pct,
                'attendance_rate_pct', sm.attendance_rate_pct,
                'low_academic', (sm.combined_score_pct IS NOT NULL AND sm.combined_score_pct < v_attention_score_threshold),
                'low_attendance', (sm.attendance_rate_pct IS NOT NULL AND sm.attendance_rate_pct < v_attention_att_threshold)
            ) ORDER BY COALESCE(sm.combined_score_pct, 100) ASC, COALESCE(sm.attendance_rate_pct, 100) ASC)
            FROM (
                SELECT * FROM student_metrics
                WHERE (combined_score_pct IS NOT NULL AND combined_score_pct < v_attention_score_threshold)
                   OR (attendance_rate_pct IS NOT NULL AND attendance_rate_pct < v_attention_att_threshold)
                ORDER BY COALESCE(combined_score_pct, 100) ASC
                LIMIT 20
            ) sm
        ), '[]'::jsonb)
    ) INTO v_student_analytics_json;

    -- Group Analytics Comparison (Teacher-scoped or Super Admin)
    WITH scoped_groups AS (
        SELECT g.id, g.name, g.name_arabic, g.academic_year, g.is_active
        FROM public.groups g
        WHERE g.archived_at IS NULL
          AND (p_group_id IS NULL OR g.id = p_group_id)
          AND (p_academic_year IS NULL OR p_academic_year = 'all' OR g.academic_year = p_academic_year)
          AND (v_is_super OR public.is_teacher_authorized_for_group(v_caller_id, g.id))
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'group_id', sg.id,
        'name', sg.name,
        'name_arabic', sg.name_arabic,
        'academic_year', sg.academic_year,
        'is_active', sg.is_active,
        'active_students_count', (
            SELECT COUNT(DISTINCT gs.student_id)::int
            FROM public.group_students gs
            JOIN public.profiles p ON p.id = gs.student_id AND p.status = 'active'
            WHERE gs.group_id = sg.id
        ),
        'attendance_rate_pct', (
            SELECT CASE
                WHEN COUNT(*) FILTER (WHERE att.status::text IN ('present', 'late', 'absent')) = 0 THEN NULL
                ELSE ROUND(
                    (COUNT(*) FILTER (WHERE att.status::text IN ('present', 'late'))::numeric /
                     COUNT(*) FILTER (WHERE att.status::text IN ('present', 'late', 'absent'))::numeric) * 100,
                    1
                )
            END
            FROM public.attendance att
            JOIN public.live_sessions ls ON ls.id = att.session_id
            WHERE ls.group_id = sg.id AND ls.status <> 'cancelled'
              AND (p_course_id IS NULL OR ls.course_id = p_course_id)
              AND (v_start_ts IS NULL OR ls.start_time >= v_start_ts)
              AND (v_end_ts IS NULL OR ls.start_time < v_end_ts)
        ),
        'avg_quiz_score_pct', (
            SELECT ROUND(AVG(qa.percentage_score), 1)
            FROM public.quiz_attempts qa
            JOIN public.quizzes q ON q.id = qa.quiz_id
            JOIN public.group_students gs ON gs.student_id = qa.student_id AND gs.group_id = sg.id
            JOIN public.profiles p ON p.id = gs.student_id AND p.status = 'active'
            WHERE q.is_archived = false
              AND qa.status IN ('submitted', 'graded')
              AND qa.percentage_score IS NOT NULL
              AND (
                q.group_id = sg.id
                OR (
                    q.group_id IS NULL
                    AND q.course_id IS NOT NULL
                    AND EXISTS (
                        SELECT 1 FROM public.group_courses gc
                        WHERE gc.group_id = sg.id AND gc.course_id = q.course_id
                    )
                )
              )
              AND (p_course_id IS NULL OR q.course_id = p_course_id)
              AND (v_start_ts IS NULL OR COALESCE(qa.submitted_at, qa.completed_at, qa.started_at) >= v_start_ts)
              AND (v_end_ts IS NULL OR COALESCE(qa.submitted_at, qa.completed_at, qa.started_at) < v_end_ts)
        ),
        'avg_course_progress_pct', (
            SELECT CASE
                WHEN COUNT(*) = 0 THEN NULL
                ELSE ROUND((COUNT(*) FILTER (WHERE lp.is_completed = true)::numeric / COUNT(*)::numeric) * 100, 1)
            END
            FROM public.group_students gs
            JOIN public.profiles p ON p.id = gs.student_id AND p.status = 'active'
            JOIN public.group_courses gc ON gc.group_id = gs.group_id
            JOIN public.lessons l ON l.course_id = gc.course_id AND l.is_published = true
            LEFT JOIN public.lesson_progress lp ON lp.student_id = gs.student_id AND lp.lesson_id = l.id
            WHERE gs.group_id = sg.id
              AND (p_course_id IS NULL OR gc.course_id = p_course_id)
        )
    ) ORDER BY sg.name ASC), '[]'::jsonb)
    INTO v_group_analytics_json
    FROM scoped_groups sg;

    -- Course Analytics
    WITH scoped_courses AS (
        SELECT DISTINCT c.id, c.title, c.title_arabic, c.level, c.is_published
        FROM public.courses c
        WHERE (p_course_id IS NULL OR c.id = p_course_id)
          AND (v_is_super OR c.teacher_id = v_caller_id)
          AND (
            (p_group_id IS NULL AND (p_academic_year IS NULL OR p_academic_year = 'all'))
            OR EXISTS (
                SELECT 1
                FROM public.group_courses gc
                JOIN public.groups g ON g.id = gc.group_id
                WHERE gc.course_id = c.id
                  AND g.archived_at IS NULL
                  AND (p_group_id IS NULL OR g.id = p_group_id)
                  AND (p_academic_year IS NULL OR p_academic_year = 'all' OR g.academic_year = p_academic_year)
            )
          )
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'course_id', sc.id,
        'title', sc.title,
        'title_arabic', sc.title_arabic,
        'level', sc.level,
        'is_published', sc.is_published,
        'published_lessons_count', (
            SELECT COUNT(*)::int FROM public.lessons l WHERE l.course_id = sc.id AND l.is_published = true
        ),
        'enrolled_students_count', (
            SELECT COUNT(DISTINCT gs.student_id)::int
            FROM public.group_courses gc
            JOIN public.groups g ON g.id = gc.group_id AND g.archived_at IS NULL
            JOIN public.group_students gs ON gs.group_id = g.id
            JOIN public.profiles p ON p.id = gs.student_id AND p.status = 'active'
            WHERE gc.course_id = sc.id
              AND (p_group_id IS NULL OR g.id = p_group_id)
              AND (p_academic_year IS NULL OR p_academic_year = 'all' OR g.academic_year = p_academic_year)
        ),
        'avg_completion_pct', (
            SELECT CASE
                WHEN COUNT(*) = 0 THEN NULL
                ELSE ROUND((COUNT(*) FILTER (WHERE lp.is_completed = true)::numeric / COUNT(*)::numeric) * 100, 1)
            END
            FROM public.group_courses gc
            JOIN public.groups g ON g.id = gc.group_id AND g.archived_at IS NULL
            JOIN public.group_students gs ON gs.group_id = g.id
            JOIN public.profiles p ON p.id = gs.student_id AND p.status = 'active'
            JOIN public.lessons l ON l.course_id = sc.id AND l.is_published = true
            LEFT JOIN public.lesson_progress lp ON lp.student_id = gs.student_id AND lp.lesson_id = l.id
            WHERE gc.course_id = sc.id
              AND (p_group_id IS NULL OR g.id = p_group_id)
              AND (p_academic_year IS NULL OR p_academic_year = 'all' OR g.academic_year = p_academic_year)
        ),
        'avg_quiz_score_pct', (
            SELECT ROUND(AVG(qa.percentage_score), 1)
            FROM public.quiz_attempts qa
            JOIN public.quizzes q ON q.id = qa.quiz_id
            WHERE q.course_id = sc.id
              AND q.is_archived = false
              AND qa.status IN ('submitted', 'graded')
              AND qa.percentage_score IS NOT NULL
              AND (
                (p_group_id IS NULL AND (p_academic_year IS NULL OR p_academic_year = 'all'))
                OR EXISTS (
                    SELECT 1
                    FROM public.group_students gs
                    JOIN public.groups g ON g.id = gs.group_id AND g.archived_at IS NULL
                    WHERE gs.student_id = qa.student_id
                      AND (p_group_id IS NULL OR g.id = p_group_id)
                      AND (p_academic_year IS NULL OR p_academic_year = 'all' OR g.academic_year = p_academic_year)
                      AND (q.group_id IS NULL OR q.group_id = g.id)
                )
              )
              AND (v_start_ts IS NULL OR COALESCE(qa.submitted_at, qa.completed_at, qa.started_at) >= v_start_ts)
              AND (v_end_ts IS NULL OR COALESCE(qa.submitted_at, qa.completed_at, qa.started_at) < v_end_ts)
        ),
        'published_assignments_count', (
            SELECT COUNT(*)::int FROM public.assignments a WHERE a.course_id = sc.id AND a.is_published = true
        )
    ) ORDER BY sc.title ASC), '[]'::jsonb)
    INTO v_course_analytics_json
    FROM scoped_courses sc;

    -- Attendance Analytics (Breakdown, Riyadh Daily Trend, Recent Sessions)
    WITH scoped_sessions AS (
        SELECT ls.id, ls.group_id, ls.course_id, ls.title, ls.title_arabic, ls.start_time, ls.status
        FROM public.live_sessions ls
        WHERE ls.status <> 'cancelled'
          AND (p_group_id IS NULL OR ls.group_id = p_group_id)
          AND (p_course_id IS NULL OR ls.course_id = p_course_id)
          AND (v_start_ts IS NULL OR ls.start_time >= v_start_ts)
          AND (v_end_ts IS NULL OR ls.start_time < v_end_ts)
          AND (
            p_academic_year IS NULL OR p_academic_year = 'all'
            OR EXISTS (
                SELECT 1 FROM public.groups g
                WHERE g.id = ls.group_id AND g.archived_at IS NULL AND g.academic_year = p_academic_year
            )
          )
          AND (v_is_super OR ls.teacher_id = v_caller_id OR (ls.group_id IS NOT NULL AND public.is_teacher_authorized_for_group(v_caller_id, ls.group_id)))
    ),
    att_rows AS (
        SELECT att.id, att.session_id, att.status::text AS status, ss.start_time
        FROM public.attendance att
        JOIN scoped_sessions ss ON ss.id = att.session_id
    )
    SELECT jsonb_build_object(
        'breakdown', jsonb_build_object(
            'present', (SELECT COUNT(*)::int FROM att_rows WHERE status = 'present'),
            'late', (SELECT COUNT(*)::int FROM att_rows WHERE status = 'late'),
            'excused', (SELECT COUNT(*)::int FROM att_rows WHERE status = 'excused'),
            'absent', (SELECT COUNT(*)::int FROM att_rows WHERE status = 'absent'),
            'total_records', (SELECT COUNT(*)::int FROM att_rows),
            'countable_records', (SELECT COUNT(*)::int FROM att_rows WHERE status IN ('present', 'late', 'absent'))
        ),
        'trend_series', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'riyadh_date', day_row.riyadh_date,
                'present', day_row.present,
                'late', day_row.late,
                'excused', day_row.excused,
                'absent', day_row.absent,
                'attendance_rate_pct', day_row.attendance_rate_pct
            ) ORDER BY day_row.riyadh_date ASC)
            FROM (
                SELECT
                    to_char(ar.start_time AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM-DD') AS riyadh_date,
                    COUNT(*) FILTER (WHERE ar.status = 'present')::int AS present,
                    COUNT(*) FILTER (WHERE ar.status = 'late')::int AS late,
                    COUNT(*) FILTER (WHERE ar.status = 'excused')::int AS excused,
                    COUNT(*) FILTER (WHERE ar.status = 'absent')::int AS absent,
                    CASE
                        WHEN COUNT(*) FILTER (WHERE ar.status IN ('present', 'late', 'absent')) = 0 THEN NULL
                        ELSE ROUND(
                            (COUNT(*) FILTER (WHERE ar.status IN ('present', 'late'))::numeric /
                             COUNT(*) FILTER (WHERE ar.status IN ('present', 'late', 'absent'))::numeric) * 100,
                            1
                        )
                    END AS attendance_rate_pct
                FROM att_rows ar
                GROUP BY 1
                ORDER BY 1 DESC
                LIMIT 31
            ) day_row
        ), '[]'::jsonb),
        'recent_sessions', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'session_id', ss.id,
                'title', ss.title,
                'title_arabic', ss.title_arabic,
                'start_time', ss.start_time,
                'present', (SELECT COUNT(*)::int FROM public.attendance a2 WHERE a2.session_id = ss.id AND a2.status::text = 'present'),
                'late', (SELECT COUNT(*)::int FROM public.attendance a2 WHERE a2.session_id = ss.id AND a2.status::text = 'late'),
                'excused', (SELECT COUNT(*)::int FROM public.attendance a2 WHERE a2.session_id = ss.id AND a2.status::text = 'excused'),
                'absent', (SELECT COUNT(*)::int FROM public.attendance a2 WHERE a2.session_id = ss.id AND a2.status::text = 'absent')
            ) ORDER BY ss.start_time DESC)
            FROM (
                SELECT * FROM scoped_sessions ORDER BY start_time DESC LIMIT 12
            ) ss
        ), '[]'::jsonb)
    ) INTO v_attendance_analytics_json;

    RETURN jsonb_build_object(
        'scope', jsonb_build_object(
            'is_super_admin', v_is_super,
            'date_from', p_date_from,
            'date_to', p_date_to,
            'attention_score_threshold', v_attention_score_threshold,
            'attention_attendance_threshold', v_attention_att_threshold,
            'timezone', 'Asia/Riyadh'
        ),
        'kpis', v_kpis_json,
        'student_analytics', v_student_analytics_json,
        'group_analytics', v_group_analytics_json,
        'course_analytics', v_course_analytics_json,
        'attendance_analytics', v_attendance_analytics_json
    );
END;
$$;

ALTER FUNCTION public.get_phase6_analytics_dashboard(DATE, DATE, UUID, UUID, TEXT, NUMERIC) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_phase6_analytics_dashboard(DATE, DATE, UUID, UUID, TEXT, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_phase6_analytics_dashboard(DATE, DATE, UUID, UUID, TEXT, NUMERIC) TO authenticated;

-- ------------------------------------------------------------------------------
-- 4. SCHEDULED ANNOUNCEMENT INTERNAL HELPER SEPARATION (AVOIDS 42501 POLLING FAIL)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._publish_announcement_internal(
    p_announcement_id UUID,
    p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
    v_announcement RECORD;
    v_actor_id UUID;
    v_actor_is_super BOOLEAN := false;
    v_notification_id UUID;
    v_delivered_count INT := 0;
BEGIN
    SELECT * INTO v_announcement
    FROM public.announcements
    WHERE id = p_announcement_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Announcement not found' USING ERRCODE = 'P0002';
    END IF;

    v_actor_id := COALESCE(p_actor_id, v_announcement.teacher_id);

    IF v_actor_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = v_actor_id
              AND role = 'super_admin'
              AND status = 'active'
        ) INTO v_actor_is_super;
    END IF;

    UPDATE public.announcements
    SET status = 'published',
        published_at = now(),
        updated_at = now()
    WHERE id = p_announcement_id;

    INSERT INTO public.notifications (
        title,
        title_arabic,
        body,
        body_arabic,
        type,
        category,
        priority,
        announcement_id,
        sender_id,
        action_url,
        related_resource_id,
        idempotency_key,
        created_at
    ) VALUES (
        v_announcement.title,
        v_announcement.title_arabic,
        v_announcement.body,
        v_announcement.body_arabic,
        'announcement',
        'general',
        v_announcement.priority,
        p_announcement_id,
        v_announcement.teacher_id,
        v_announcement.action_url,
        v_announcement.related_resource_id::text,
        'announcement_pub_' || p_announcement_id::text,
        now()
    )
    ON CONFLICT (idempotency_key) DO UPDATE SET
        title = EXCLUDED.title,
        title_arabic = EXCLUDED.title_arabic,
        body = EXCLUDED.body,
        body_arabic = EXCLUDED.body_arabic,
        priority = EXCLUDED.priority,
        action_url = EXCLUDED.action_url
    RETURNING id INTO v_notification_id;

    IF v_announcement.target_audience = 'student' THEN
        INSERT INTO public.notification_recipients (notification_id, recipient_id, is_read, created_at)
        SELECT v_notification_id, p.id, false, now()
        FROM public.profiles p
        WHERE p.id = v_announcement.student_id
          AND p.role = 'student'
          AND p.status = 'active'
        ON CONFLICT (notification_id, recipient_id) DO NOTHING;

        GET DIAGNOSTICS v_delivered_count = ROW_COUNT;

    ELSIF v_announcement.target_audience = 'group' THEN
        INSERT INTO public.notification_recipients (notification_id, recipient_id, is_read, created_at)
        SELECT DISTINCT v_notification_id, gs.student_id, false, now()
        FROM public.group_students gs
        JOIN public.profiles p ON p.id = gs.student_id
        WHERE gs.group_id = v_announcement.group_id
          AND p.role = 'student'
          AND p.status = 'active'
        ON CONFLICT (notification_id, recipient_id) DO NOTHING;

        GET DIAGNOSTICS v_delivered_count = ROW_COUNT;

    ELSIF v_announcement.target_audience = 'all_students' THEN
        IF v_actor_is_super THEN
            INSERT INTO public.notification_recipients (notification_id, recipient_id, is_read, created_at)
            SELECT DISTINCT v_notification_id, p.id, false, now()
            FROM public.profiles p
            WHERE p.role = 'student'
              AND p.status = 'active'
            ON CONFLICT (notification_id, recipient_id) DO NOTHING;

            GET DIAGNOSTICS v_delivered_count = ROW_COUNT;
        ELSE
            INSERT INTO public.notification_recipients (notification_id, recipient_id, is_read, created_at)
            SELECT DISTINCT v_notification_id, gs.student_id, false, now()
            FROM public.group_students gs
            JOIN public.profiles p ON p.id = gs.student_id
            WHERE p.role = 'student'
              AND p.status = 'active'
              AND public.is_teacher_authorized_for_group(v_actor_id, gs.group_id)
            ON CONFLICT (notification_id, recipient_id) DO NOTHING;

            GET DIAGNOSTICS v_delivered_count = ROW_COUNT;
        END IF;
    END IF;

    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, new_data, created_at)
    VALUES (
        v_actor_id,
        'PUBLISH_ANNOUNCEMENT',
        'announcement',
        p_announcement_id::text,
        jsonb_build_object(
            'target_audience', v_announcement.target_audience,
            'recipients_delivered', v_delivered_count
        ),
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'announcement_id', p_announcement_id,
        'notification_id', v_notification_id,
        'status', 'published',
        'delivered_recipients', v_delivered_count
    );
END;
$$;

ALTER FUNCTION public._publish_announcement_internal(UUID, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public._publish_announcement_internal(UUID, UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.publish_announcement(p_announcement_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID;
    v_announcement RECORD;
    v_is_super BOOLEAN;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Not authenticated' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_announcement
    FROM public.announcements
    WHERE id = p_announcement_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Announcement not found' USING ERRCODE = 'P0002';
    END IF;

    v_is_super := public.is_super_admin();

    IF NOT v_is_super AND (v_announcement.teacher_id <> v_caller_id OR NOT public.is_teacher()) THEN
        RAISE EXCEPTION 'Forbidden: You cannot manage this announcement' USING ERRCODE = '42501';
    END IF;

    IF v_announcement.target_audience = 'group' THEN
        IF v_announcement.group_id IS NULL THEN
            RAISE EXCEPTION 'Target group must be specified' USING ERRCODE = '22000';
        END IF;

        IF NOT v_is_super AND NOT public.is_teacher_authorized_for_group(v_caller_id, v_announcement.group_id) THEN
            RAISE EXCEPTION 'Forbidden: You are not authorized to target this cohort group' USING ERRCODE = '42501';
        END IF;
    ELSIF v_announcement.target_audience = 'student' THEN
        IF v_announcement.student_id IS NULL THEN
            RAISE EXCEPTION 'Target student must be specified' USING ERRCODE = '22000';
        END IF;

        IF NOT v_is_super AND NOT public.is_teacher_authorized_for_student(v_caller_id, v_announcement.student_id) THEN
            RAISE EXCEPTION 'Forbidden: You are not authorized to target this student' USING ERRCODE = '42501';
        END IF;
    END IF;

    RETURN public._publish_announcement_internal(p_announcement_id, v_caller_id);
END;
$$;

ALTER FUNCTION public.publish_announcement(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.publish_announcement(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_announcement(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public._process_due_scheduled_announcements()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
    v_ann RECORD;
    v_count INT := 0;
BEGIN
    FOR v_ann IN
        SELECT id, teacher_id
        FROM public.announcements
        WHERE status = 'scheduled'
          AND scheduled_for <= now()
        ORDER BY scheduled_for ASC
    LOOP
        BEGIN
            PERFORM public._publish_announcement_internal(v_ann.id, v_ann.teacher_id);
            v_count := v_count + 1;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Failed to publish scheduled announcement %: %', v_ann.id, SQLERRM;
        END;
    END LOOP;

    RETURN v_count;
END;
$$;

ALTER FUNCTION public._process_due_scheduled_announcements() OWNER TO postgres;
REVOKE ALL ON FUNCTION public._process_due_scheduled_announcements() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.process_scheduled_announcements()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Not authenticated' USING ERRCODE = '42501';
    END IF;

    IF NOT (public.is_super_admin() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'Forbidden: Only teachers and super admins can process scheduled announcements' USING ERRCODE = '42501';
    END IF;

    RETURN public._process_due_scheduled_announcements();
END;
$$;

ALTER FUNCTION public.process_scheduled_announcements() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.process_scheduled_announcements() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_scheduled_announcements() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_unread_notifications_count()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID;
    v_count INT := 0;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RETURN 0;
    END IF;

    PERFORM public._process_due_scheduled_announcements();

    SELECT count(*)::INT INTO v_count
    FROM public.notification_recipients nr
    JOIN public.profiles p ON p.id = nr.recipient_id
    WHERE nr.recipient_id = v_caller_id
      AND nr.is_read = false
      AND p.status = 'active';

    RETURN v_count;
END;
$$;

ALTER FUNCTION public.get_unread_notifications_count() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_unread_notifications_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_unread_notifications_count() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_notifications(
    p_limit INT DEFAULT 20,
    p_offset INT DEFAULT 0,
    p_unread_only BOOLEAN DEFAULT false,
    p_category TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID;
    v_results JSONB;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Not authenticated' USING ERRCODE = '42501';
    END IF;

    PERFORM public._process_due_scheduled_announcements();

    SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb)
    INTO v_results
    FROM (
        SELECT jsonb_build_object(
            'id', n.id,
            'title', n.title,
            'title_arabic', n.title_arabic,
            'body', n.body,
            'body_arabic', n.body_arabic,
            'type', n.type,
            'category', n.category,
            'priority', n.priority,
            'action_url', n.action_url,
            'related_resource_id', n.related_resource_id,
            'sender_id', n.sender_id,
            'announcement_id', n.announcement_id,
            'created_at', n.created_at,
            'is_read', nr.is_read,
            'read_at', nr.read_at
        ) AS row_data
        FROM public.notifications n
        JOIN public.notification_recipients nr ON nr.notification_id = n.id
        WHERE nr.recipient_id = v_caller_id
          AND (NOT p_unread_only OR nr.is_read = false)
          AND (p_category IS NULL OR n.category = p_category)
        ORDER BY n.created_at DESC
        LIMIT LEAST(GREATEST(p_limit, 1), 100)
        OFFSET GREATEST(p_offset, 0)
    ) sub;

    RETURN v_results;
END;
$$;

ALTER FUNCTION public.get_my_notifications(INT, INT, BOOLEAN, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_my_notifications(INT, INT, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_notifications(INT, INT, BOOLEAN, TEXT) TO authenticated;

-- ------------------------------------------------------------------------------
-- 5. START QUIZ ATTEMPT NUMERIC ORDERING FIX
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_quiz_attempt(p_quiz_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID;
    v_quiz RECORD;
    v_existing_attempt RECORD;
    v_prev_attempts_count INT := 0;
    v_new_attempt_number INT := 1;
    v_expires_at TIMESTAMPTZ;
    v_time_limit_sec INT;
    v_questions_json JSONB;
    v_new_attempt_id UUID;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Not authenticated' USING ERRCODE = '42501';
    END IF;

    IF NOT public.is_active_student() THEN
        RAISE EXCEPTION 'Forbidden: Only active students can take quizzes' USING ERRCODE = '42501';
    END IF;

    SELECT id, course_id, group_id, title, title_arabic, duration_minutes, max_attempts,
           passing_score, total_points, is_published, is_archived, start_date, end_date
    INTO v_quiz
    FROM public.quizzes
    WHERE id = p_quiz_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Assessment not found' USING ERRCODE = 'P0002';
    END IF;

    IF NOT v_quiz.is_published OR v_quiz.is_archived THEN
        RAISE EXCEPTION 'Assessment is not available' USING ERRCODE = '42501';
    END IF;

    IF v_quiz.start_date IS NOT NULL AND now() < v_quiz.start_date THEN
        RAISE EXCEPTION 'Assessment is not yet available' USING ERRCODE = '42501';
    END IF;

    IF v_quiz.end_date IS NOT NULL AND now() > v_quiz.end_date THEN
        RAISE EXCEPTION 'Assessment deadline has passed' USING ERRCODE = '42501';
    END IF;

    IF NOT public.is_student_eligible_for_quiz(p_quiz_id) THEN
        RAISE EXCEPTION 'Forbidden: You are not enrolled in the cohort assigned to this assessment' USING ERRCODE = '42501';
    END IF;

    SELECT id, attempt_number, started_at, expires_at, time_limit_seconds, question_snapshot
    INTO v_existing_attempt
    FROM public.quiz_attempts
    WHERE quiz_id = p_quiz_id
      AND student_id = v_caller_id
      AND status = 'in_progress'
    ORDER BY started_at DESC
    LIMIT 1;

    IF FOUND THEN
        IF now() < v_existing_attempt.expires_at THEN
            RETURN jsonb_build_object(
                'attempt_id', v_existing_attempt.id,
                'quiz_id', p_quiz_id,
                'attempt_number', v_existing_attempt.attempt_number,
                'started_at', v_existing_attempt.started_at,
                'expires_at', v_existing_attempt.expires_at,
                'time_limit_seconds', v_existing_attempt.time_limit_seconds,
                'question_snapshot', v_existing_attempt.question_snapshot,
                'is_restored', true
            );
        ELSE
            UPDATE public.quiz_attempts
            SET status = 'timed_out',
                completed_at = v_existing_attempt.expires_at
            WHERE id = v_existing_attempt.id;
        END IF;
    END IF;

    SELECT count(*)::int INTO v_prev_attempts_count
    FROM public.quiz_attempts
    WHERE quiz_id = p_quiz_id
      AND student_id = v_caller_id
      AND status IN ('submitted', 'graded', 'timed_out');

    IF v_prev_attempts_count >= v_quiz.max_attempts THEN
        RAISE EXCEPTION 'Maximum attempts limit of % exceeded for this assessment', v_quiz.max_attempts USING ERRCODE = '42501';
    END IF;

    v_new_attempt_number := v_prev_attempts_count + 1;
    v_time_limit_sec := COALESCE(v_quiz.duration_minutes, 30) * 60;
    v_expires_at := now() + (v_time_limit_sec * interval '1 second');

    SELECT jsonb_agg(q_item ORDER BY COALESCE((q_item->>'order_index')::INT, 0) ASC)
    INTO v_questions_json
    FROM (
        SELECT jsonb_build_object(
            'question_id', qb.id,
            'question_text', qb.question_text,
            'question_text_arabic', qb.question_text_arabic,
            'question_type', qb.question_type::text,
            'points', COALESCE(qq.points, qb.points, 1),
            'order_index', qq.order_index,
            'is_required', qq.is_required,
            'options', (
                SELECT COALESCE(jsonb_agg(
                    jsonb_build_object(
                        'id', qo.id,
                        'option_text', qo.option_text,
                        'option_text_arabic', qo.option_text_arabic,
                        'order_index', qo.order_index
                    ) ORDER BY qo.order_index ASC
                ), '[]'::jsonb)
                FROM public.question_options qo
                WHERE qo.question_id = qb.id
            )
        ) AS q_item
        FROM public.quiz_questions qq
        JOIN public.question_bank qb ON qb.id = qq.question_id
        WHERE qq.quiz_id = p_quiz_id
    ) sub;

    IF v_questions_json IS NULL OR jsonb_array_length(v_questions_json) = 0 THEN
        RAISE EXCEPTION 'Cannot start assessment: this quiz does not have any questions assigned' USING ERRCODE = '22000';
    END IF;

    INSERT INTO public.quiz_attempts (
        quiz_id,
        student_id,
        attempt_number,
        started_at,
        expires_at,
        time_limit_seconds,
        question_snapshot,
        status,
        created_at
    ) VALUES (
        p_quiz_id,
        v_caller_id,
        v_new_attempt_number,
        now(),
        v_expires_at,
        v_time_limit_sec,
        v_questions_json,
        'in_progress',
        now()
    )
    RETURNING id INTO v_new_attempt_id;

    INSERT INTO public.audit_logs (
        actor_id, action, entity_type, entity_id, new_data, created_at
    ) VALUES (
        v_caller_id,
        'START_QUIZ_ATTEMPT',
        'quiz_attempt',
        v_new_attempt_id::text,
        jsonb_build_object('quiz_id', p_quiz_id, 'attempt_number', v_new_attempt_number),
        now()
    );

    RETURN jsonb_build_object(
        'attempt_id', v_new_attempt_id,
        'quiz_id', p_quiz_id,
        'attempt_number', v_new_attempt_number,
        'started_at', now(),
        'expires_at', v_expires_at,
        'time_limit_seconds', v_time_limit_sec,
        'question_snapshot', v_questions_json,
        'is_restored', false
    );
END;
$$;

ALTER FUNCTION public.start_quiz_attempt(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.start_quiz_attempt(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_quiz_attempt(UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 6. ALIGN video_assets STUDENT RLS WITH is_student_authorized_for_video LOGIC
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Students view authorized published videos" ON public.video_assets;

CREATE POLICY "Students view authorized published videos" ON public.video_assets
    FOR SELECT TO authenticated
    USING (
        public.is_active_student()
        AND status = 'published'
        AND (group_id IS NULL OR public.is_student_in_group(group_id))
        AND (course_id IS NULL OR public.is_student_assigned_to_course(course_id))
        AND (
            group_id IS NOT NULL
            OR course_id IS NOT NULL
            OR EXISTS (
                SELECT 1
                FROM public.group_students gs
                JOIN public.groups g ON g.id = gs.group_id
                WHERE gs.student_id = auth.uid()
                  AND g.is_active = true
                  AND g.archived_at IS NULL
            )
        )
    );

-- ------------------------------------------------------------------------------
-- 7. EXPLICIT TEACHER / SUPER ADMIN ROLE ENFORCEMENT IN get_question_bank_stats
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_question_bank_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
    v_caller_id UUID;
    v_is_super BOOLEAN;
    v_total INT;
    v_active INT;
    v_archived INT;
    v_by_type JSONB;
    v_by_diff JSONB;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
    END IF;

    v_is_super := public.is_super_admin();
    IF NOT v_is_super AND NOT public.is_teacher() THEN
        RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
    END IF;

    IF v_is_super THEN
        SELECT count(*), count(*) FILTER (WHERE is_active = true), count(*) FILTER (WHERE is_active = false)
        INTO v_total, v_active, v_archived
        FROM public.question_bank;

        SELECT COALESCE(jsonb_object_agg(question_type, cnt), '{}'::jsonb) INTO v_by_type
        FROM (SELECT question_type::text, count(*) as cnt FROM public.question_bank GROUP BY question_type) sub;

        SELECT COALESCE(jsonb_object_agg(difficulty_level, cnt), '{}'::jsonb) INTO v_by_diff
        FROM (SELECT difficulty_level, count(*) as cnt FROM public.question_bank GROUP BY difficulty_level) sub;
    ELSE
        SELECT count(*), count(*) FILTER (WHERE is_active = true), count(*) FILTER (WHERE is_active = false)
        INTO v_total, v_active, v_archived
        FROM public.question_bank
        WHERE teacher_id = v_caller_id;

        SELECT COALESCE(jsonb_object_agg(question_type, cnt), '{}'::jsonb) INTO v_by_type
        FROM (SELECT question_type::text, count(*) as cnt FROM public.question_bank WHERE teacher_id = v_caller_id GROUP BY question_type) sub;

        SELECT COALESCE(jsonb_object_agg(difficulty_level, cnt), '{}'::jsonb) INTO v_by_diff
        FROM (SELECT difficulty_level, count(*) as cnt FROM public.question_bank WHERE teacher_id = v_caller_id GROUP BY difficulty_level) sub;
    END IF;

    RETURN jsonb_build_object(
        'total_questions', v_total,
        'active_questions', v_active,
        'archived_questions', v_archived,
        'by_type', v_by_type,
        'by_difficulty', v_by_diff
    );
END;
$$;

ALTER FUNCTION public.get_question_bank_stats() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_question_bank_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_question_bank_stats() TO authenticated;
