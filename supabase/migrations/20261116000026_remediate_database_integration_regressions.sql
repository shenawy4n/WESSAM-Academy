-- ==============================================================================
-- WESSAM Academy — Remediate Database Integration Regressions (Job 133516338200)
-- Migration: 20261116000026_remediate_database_integration_regressions.sql
--
-- Remediates verified schema, privilege, trigger, and RPC defects without
-- modifying historical migrations 1-25:
--  1. Assignments & Submissions Anonymous Access:
--     Revokes Supabase default PUBLIC/anon table privileges on assignments,
--     assignment_targets, submissions, and assignment_grading_history while
--     preserving explicit least-privilege authenticated grants.
--  2. Messaging Table-Level vs Column-Level Privilege Hardening:
--     Revokes authenticated's inherited default table-level ALL privileges on
--     message_conversations, messages, and message_attachments before granting
--     strictly SELECT/INSERT and column-level UPDATE (is_read, read_at) on
--     public.messages so recipients cannot tamper with body/sender_id/recipient_id.
--  3. Live Sessions Notification Trigger Arabic Fallback:
--     Hardens trg_notify_live_session_event() so NULL or blank title_arabic
--     safely falls back to NEW.title (or 'حصة تفاعلية مباشرة') instead of
--     producing NULL in notifications.title_arabic (NOT NULL), while preserving
--     Arabic titles and existing rescheduled/delivery semantics.
--  4. Phase 6 Analytics Dashboard RPC (submissions.created_at Fix):
--     Replaces ORDER BY ... s.created_at DESC in latest_graded_submissions
--     within get_phase6_analytics_dashboard() with s.id DESC because
--     public.submissions has submitted_at/graded_at/released_at/updated_at
--     and no created_at column.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. REVOKE ANON/PUBLIC PRIVILEGES ON ASSIGNMENTS & SUBMISSIONS TABLES
-- ------------------------------------------------------------------------------
REVOKE ALL ON public.assignments FROM PUBLIC, anon;
REVOKE ALL ON public.assignment_targets FROM PUBLIC, anon;
REVOKE ALL ON public.submissions FROM PUBLIC, anon;
REVOKE ALL ON public.assignment_grading_history FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assignment_targets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.submissions TO authenticated;
GRANT SELECT, INSERT ON public.assignment_grading_history TO authenticated;

-- ------------------------------------------------------------------------------
-- 2. HARDEN MESSAGING TABLE & COLUMN-LEVEL PRIVILEGES FOR AUTHENTICATED
-- ------------------------------------------------------------------------------
-- Migration 20261113000017 revoked from PUBLIC and anon only, leaving Supabase's
-- default table-level ALL privileges intact for authenticated. Explicitly
-- revoke from authenticated as well before applying minimal grants.
REVOKE ALL ON public.message_conversations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.messages FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.message_attachments FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT ON public.message_conversations TO authenticated;
GRANT SELECT, INSERT ON public.messages TO authenticated;
GRANT UPDATE (is_read, read_at) ON public.messages TO authenticated;
GRANT SELECT, INSERT ON public.message_attachments TO authenticated;

-- ------------------------------------------------------------------------------
-- 3. HARDEN LIVE SESSION NOTIFICATION TRIGGER WITH ARABIC TITLE FALLBACK
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_notify_live_session_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
    v_notif_id UUID;
    v_idempotency_key TEXT;
    v_is_rescheduled BOOLEAN := false;
    v_safe_title_en TEXT;
    v_safe_title_ar TEXT;
BEGIN
    IF NEW.status = 'cancelled' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.start_time <> NEW.start_time THEN
        v_is_rescheduled := true;
    END IF;

    IF TG_OP = 'INSERT' OR v_is_rescheduled THEN
        v_idempotency_key := 'session_' || NEW.id::text || '_' || EXTRACT(EPOCH FROM NEW.start_time)::bigint::text;

        v_safe_title_en := COALESCE(
            NULLIF(pg_catalog.btrim(NEW.title), ''),
            NULLIF(pg_catalog.btrim(NEW.title_arabic), ''),
            'Live Session'
        );

        v_safe_title_ar := COALESCE(
            NULLIF(pg_catalog.btrim(NEW.title_arabic), ''),
            NULLIF(pg_catalog.btrim(NEW.title), ''),
            'حصة تفاعلية مباشرة'
        );

        INSERT INTO public.notifications (
            title,
            title_arabic,
            body,
            body_arabic,
            type,
            category,
            priority,
            sender_id,
            action_url,
            related_resource_id,
            idempotency_key,
            created_at
        ) VALUES (
            CASE WHEN v_is_rescheduled THEN 'Live Session Rescheduled: ' || v_safe_title_en ELSE 'Upcoming Live Session: ' || v_safe_title_en END,
            CASE WHEN v_is_rescheduled THEN 'تم تغيير موعد الحصة المباشرة: ' || v_safe_title_ar ELSE 'حصة تفاعلية مباشرة قادمة: ' || v_safe_title_ar END,
            'A live interactive session is scheduled at ' || to_char(NEW.start_time AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI') || ' (Riyadh Time).',
            'موعد حصة تفاعلية مباشرة في ' || to_char(NEW.start_time AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI') || ' بتوقيت مكة المكرمة.',
            'live_session',
            'live_session',
            'important',
            NEW.teacher_id,
            '/live-sessions',
            NEW.id::text,
            v_idempotency_key,
            now()
        )
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING id INTO v_notif_id;

        IF v_notif_id IS NOT NULL AND NEW.group_id IS NOT NULL THEN
            INSERT INTO public.notification_recipients (notification_id, recipient_id, is_read, created_at)
            SELECT DISTINCT v_notif_id, gs.student_id, false, now()
            FROM public.group_students gs
            JOIN public.profiles p ON p.id = gs.student_id
            WHERE gs.group_id = NEW.group_id
              AND p.role = 'student'
              AND p.status = 'active'
            ON CONFLICT (notification_id, recipient_id) DO NOTHING;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

ALTER FUNCTION public.trg_notify_live_session_event() OWNER TO postgres;

-- ------------------------------------------------------------------------------
-- 4. FIX NON-EXISTENT s.created_at IN get_phase6_analytics_dashboard()
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
        ORDER BY s.assignment_id, s.student_id, s.submitted_at DESC NULLS LAST, s.id DESC
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

-- Reload PostgREST schema cache cleanly
NOTIFY pgrst, 'reload schema';
