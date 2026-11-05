-- ==============================================================================
-- WESSAM Academy — Migration 12: Courses & Curriculum Management RPCs
-- Version: 20261104000006
--
-- Objective:
-- Implement secure database-enforced RPCs for course management, curriculum
-- ordering (units & lessons), cohort group assignments, and verified student
-- lesson progress tracking with strict audit logging.
-- ==============================================================================

-- 1. Add optional video_url to public.lessons for direct external video embedding (YouTube/Vimeo)
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS video_url TEXT;

-- 2. RPC: Reorder Course Units
CREATE OR REPLACE FUNCTION public.reorder_course_units(
    p_course_id UUID,
    p_unit_ids UUID[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
    v_caller_id UUID;
    v_idx INT;
    v_unit_id UUID;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Not authenticated' USING ERRCODE = '42501';
    END IF;

    IF NOT public.is_teacher() THEN
        RAISE EXCEPTION 'Forbidden: Only teachers and super admins can reorder course units' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.courses WHERE id = p_course_id) THEN
        RAISE EXCEPTION 'Course not found' USING ERRCODE = 'P0002';
    END IF;

    IF p_unit_ids IS NOT NULL AND array_length(p_unit_ids, 1) > 0 THEN
        FOR v_idx IN 1 .. array_length(p_unit_ids, 1) LOOP
            v_unit_id := p_unit_ids[v_idx];
            UPDATE public.course_units
            SET order_index = v_idx
            WHERE id = v_unit_id
              AND course_id = p_course_id;
        END LOOP;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_course_units(UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reorder_course_units(UUID, UUID[]) TO authenticated;

-- 3. RPC: Reorder Course Lessons within a Unit
CREATE OR REPLACE FUNCTION public.reorder_course_lessons(
    p_unit_id UUID,
    p_lesson_ids UUID[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
    v_caller_id UUID;
    v_idx INT;
    v_lesson_id UUID;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Not authenticated' USING ERRCODE = '42501';
    END IF;

    IF NOT public.is_teacher() THEN
        RAISE EXCEPTION 'Forbidden: Only teachers and super admins can reorder lessons' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.course_units WHERE id = p_unit_id) THEN
        RAISE EXCEPTION 'Unit not found' USING ERRCODE = 'P0002';
    END IF;

    IF p_lesson_ids IS NOT NULL AND array_length(p_lesson_ids, 1) > 0 THEN
        FOR v_idx IN 1 .. array_length(p_lesson_ids, 1) LOOP
            v_lesson_id := p_lesson_ids[v_idx];
            UPDATE public.lessons
            SET order_index = v_idx,
                updated_at = now()
            WHERE id = v_lesson_id
              AND unit_id = p_unit_id;
        END LOOP;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_course_lessons(UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reorder_course_lessons(UUID, UUID[]) TO authenticated;

-- 4. RPC: Assign Course to Group
CREATE OR REPLACE FUNCTION public.assign_course_to_group(
    p_course_id UUID,
    p_group_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
    v_caller_id UUID;
    v_course RECORD;
    v_group RECORD;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Not authenticated' USING ERRCODE = '42501';
    END IF;

    IF NOT public.is_teacher() THEN
        RAISE EXCEPTION 'Forbidden: Only teachers and super admins can assign courses' USING ERRCODE = '42501';
    END IF;

    SELECT id, title, title_arabic INTO v_course
    FROM public.courses
    WHERE id = p_course_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Course not found' USING ERRCODE = 'P0002';
    END IF;

    SELECT id, name, name_arabic, archived_at INTO v_group
    FROM public.groups
    WHERE id = p_group_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Group not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_group.archived_at IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot assign course to an archived group' USING ERRCODE = '22000';
    END IF;

    INSERT INTO public.group_courses (course_id, group_id, assigned_at)
    VALUES (p_course_id, p_group_id, now())
    ON CONFLICT (group_id, course_id) DO NOTHING;

    INSERT INTO public.audit_logs (
        actor_id,
        action,
        entity_type,
        entity_id,
        new_data,
        created_at
    ) VALUES (
        v_caller_id,
        'ASSIGN_COURSE_TO_GROUP',
        'group_course',
        p_group_id::text || ':' || p_course_id::text,
        jsonb_build_object(
            'group_id', p_group_id,
            'group_name', v_group.name,
            'course_id', p_course_id,
            'course_title', v_course.title
        ),
        now()
    );
END;
$$;

REVOKE ALL ON FUNCTION public.assign_course_to_group(UUID, UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_course_to_group(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_course_to_group(UUID, UUID) TO authenticated;

-- 5. RPC: Remove Course from Group
CREATE OR REPLACE FUNCTION public.remove_course_from_group(
    p_course_id UUID,
    p_group_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
    v_caller_id UUID;
    v_deleted_count INT;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Not authenticated' USING ERRCODE = '42501';
    END IF;

    IF NOT public.is_teacher() THEN
        RAISE EXCEPTION 'Forbidden: Only teachers and super admins can remove course assignments' USING ERRCODE = '42501';
    END IF;

    DELETE FROM public.group_courses
    WHERE course_id = p_course_id
      AND group_id = p_group_id;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    IF v_deleted_count > 0 THEN
        INSERT INTO public.audit_logs (
            actor_id,
            action,
            entity_type,
            entity_id,
            old_data,
            created_at
        ) VALUES (
            v_caller_id,
            'REMOVE_COURSE_FROM_GROUP',
            'group_course',
            p_group_id::text || ':' || p_course_id::text,
            jsonb_build_object(
                'group_id', p_group_id,
                'course_id', p_course_id
            ),
            now()
        );
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.remove_course_from_group(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_course_from_group(UUID, UUID) TO authenticated;

-- 6. RPC: Record Student Lesson Progress (Secure & Verified)
CREATE OR REPLACE FUNCTION public.record_lesson_progress(
    p_lesson_id UUID,
    p_is_completed BOOLEAN DEFAULT true,
    p_watch_seconds INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
    v_caller_id UUID;
    v_is_accessible BOOLEAN;
    v_result RECORD;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Not authenticated' USING ERRCODE = '42501';
    END IF;

    IF NOT public.is_active_student() THEN
        RAISE EXCEPTION 'Forbidden: Only active students can record lesson progress' USING ERRCODE = '42501';
    END IF;

    -- Verify that the lesson exists, is published, belongs to a published course,
    -- and that the course is assigned to at least one active group the student belongs to.
    SELECT EXISTS (
        SELECT 1
        FROM public.lessons l
        JOIN public.courses c ON c.id = l.course_id
        JOIN public.group_courses gc ON gc.course_id = c.id
        WHERE l.id = p_lesson_id
          AND l.is_published = true
          AND c.is_published = true
          AND public.is_student_in_group(gc.group_id)
    ) INTO v_is_accessible;

    IF NOT v_is_accessible THEN
        RAISE EXCEPTION 'Forbidden: Lesson is not accessible or not published' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.lesson_progress (
        student_id,
        lesson_id,
        is_completed,
        watch_seconds,
        last_accessed_at
    ) VALUES (
        v_caller_id,
        p_lesson_id,
        COALESCE(p_is_completed, false),
        GREATEST(COALESCE(p_watch_seconds, 0), 0),
        now()
    )
    ON CONFLICT (student_id, lesson_id)
    DO UPDATE SET
        is_completed = CASE
            WHEN EXCLUDED.is_completed = true THEN true
            ELSE public.lesson_progress.is_completed
        END,
        watch_seconds = GREATEST(public.lesson_progress.watch_seconds, EXCLUDED.watch_seconds),
        last_accessed_at = now()
    RETURNING id, student_id, lesson_id, is_completed, watch_seconds, last_accessed_at
    INTO v_result;

    RETURN jsonb_build_object(
        'id', v_result.id,
        'student_id', v_result.student_id,
        'lesson_id', v_result.lesson_id,
        'is_completed', v_result.is_completed,
        'watch_seconds', v_result.watch_seconds,
        'last_accessed_at', v_result.last_accessed_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.record_lesson_progress(UUID, BOOLEAN, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_lesson_progress(UUID, BOOLEAN, INT) TO authenticated;
