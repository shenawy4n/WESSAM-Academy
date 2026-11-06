-- ==============================================================================
-- WESSAM Academy — Migration 12: Courses & Curriculum Management Hardening
-- Version: 20261104000006
--
-- Objective:
-- Implement secure database-enforced RPCs for course management, curriculum
-- ordering (units & lessons), cohort group assignments, learning resource
-- storage authorization, and verified student lesson progress tracking
-- with strict ownership validation and audit logging.
-- ==============================================================================

-- 1. Schema Additions
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS video_url TEXT;
ALTER TABLE public.lesson_resources ADD COLUMN IF NOT EXISTS storage_path TEXT;

-- 2. Supabase Storage Configuration (learning-resources private bucket)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'storage' AND tablename = 'buckets') THEN
        INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
        VALUES (
            'learning-resources',
            'learning-resources',
            false,
            26214400, -- 25 MB file limit
            ARRAY[
                'application/pdf',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/msword',
                'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                'application/vnd.ms-powerpoint',
                'application/zip',
                'image/jpeg',
                'image/png'
            ]
        )
        ON CONFLICT (id) DO UPDATE SET
            public = false,
            file_size_limit = EXCLUDED.file_size_limit,
            allowed_mime_types = EXCLUDED.allowed_mime_types;
    END IF;
END;
$$;

-- Storage Objects RLS Policies
-- Note: storage.objects is owned by supabase_storage_admin with RLS enabled by default.
-- Supabase extensions (supautils) permit postgres to manage policies directly without ALTER TABLE.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'storage' AND tablename = 'objects') THEN
        DROP POLICY IF EXISTS "Teachers upload learning resources" ON storage.objects;
        CREATE POLICY "Teachers upload learning resources"
        ON storage.objects FOR INSERT
        TO authenticated
        WITH CHECK (
            bucket_id = 'learning-resources'
            AND (
                public.is_super_admin()
                OR (
                    public.is_teacher()
                    AND split_part(name, '/', 2) ~ '^[0-9a-fA-F-]{36}$'
                    AND EXISTS (
                        SELECT 1 FROM public.courses c
                        WHERE c.id = split_part(name, '/', 2)::uuid
                          AND c.teacher_id = auth.uid()
                    )
                )
            )
        );

        DROP POLICY IF EXISTS "Teachers delete learning resources" ON storage.objects;
        CREATE POLICY "Teachers delete learning resources"
        ON storage.objects FOR DELETE
        TO authenticated
        USING (
            bucket_id = 'learning-resources'
            AND (
                public.is_super_admin()
                OR (
                    public.is_teacher()
                    AND split_part(name, '/', 2) ~ '^[0-9a-fA-F-]{36}$'
                    AND EXISTS (
                        SELECT 1 FROM public.courses c
                        WHERE c.id = split_part(name, '/', 2)::uuid
                          AND c.teacher_id = auth.uid()
                    )
                )
            )
        );

        DROP POLICY IF EXISTS "Authorized users read learning resources storage" ON storage.objects;
        CREATE POLICY "Authorized users read learning resources storage"
        ON storage.objects FOR SELECT
        TO authenticated
        USING (
            bucket_id = 'learning-resources'
            AND (
                public.is_super_admin()
                OR (
                    public.is_teacher()
                    AND split_part(name, '/', 2) ~ '^[0-9a-fA-F-]{36}$'
                    AND EXISTS (
                        SELECT 1 FROM public.courses c
                        WHERE c.id = split_part(name, '/', 2)::uuid
                          AND c.teacher_id = auth.uid()
                    )
                )
                OR (
                    public.is_active_student()
                    AND split_part(name, '/', 4) ~ '^[0-9a-fA-F-]{36}$'
                    AND EXISTS (
                        SELECT 1
                        FROM public.lessons l
                        JOIN public.courses c ON c.id = l.course_id
                        JOIN public.group_courses gc ON gc.course_id = c.id
                        JOIN public.groups g ON g.id = gc.group_id
                        WHERE l.id = split_part(name, '/', 4)::uuid
                          AND l.is_published = true
                          AND c.is_published = true
                          AND g.is_active = true
                          AND g.archived_at IS NULL
                          AND public.is_student_in_group(gc.group_id)
                    )
                )
            )
        );
    END IF;
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. AUDIT & REPAIR RLS: COURSES & CURRICULUM
-- ------------------------------------------------------------------------------

-- (A) Courses RLS: Restrict modifications to the course owner teacher or super_admin
DROP POLICY IF EXISTS "Teachers manage all courses" ON public.courses;
DROP POLICY IF EXISTS "Teachers view courses" ON public.courses;
DROP POLICY IF EXISTS "Teachers insert own courses" ON public.courses;
DROP POLICY IF EXISTS "Teachers update own courses" ON public.courses;
DROP POLICY IF EXISTS "Teachers delete own courses" ON public.courses;
DROP POLICY IF EXISTS "Students view assigned or published courses" ON public.courses;

CREATE POLICY "Teachers view courses" ON public.courses
    FOR SELECT TO authenticated
    USING (public.is_teacher());

CREATE POLICY "Teachers insert own courses" ON public.courses
    FOR INSERT TO authenticated
    WITH CHECK (
        (public.is_teacher() AND teacher_id = auth.uid())
        OR public.is_super_admin()
    );

CREATE POLICY "Teachers update own courses" ON public.courses
    FOR UPDATE TO authenticated
    USING (
        (public.is_teacher() AND teacher_id = auth.uid())
        OR public.is_super_admin()
    )
    WITH CHECK (
        (public.is_teacher() AND teacher_id = auth.uid())
        OR public.is_super_admin()
    );

CREATE POLICY "Teachers delete own courses" ON public.courses
    FOR DELETE TO authenticated
    USING (
        (public.is_teacher() AND teacher_id = auth.uid())
        OR public.is_super_admin()
    );

CREATE POLICY "Students view assigned or published courses" ON public.courses
    FOR SELECT TO authenticated
    USING (
        is_published = true AND EXISTS (
            SELECT 1 FROM public.group_courses gc
            JOIN public.groups g ON g.id = gc.group_id
            WHERE gc.course_id = courses.id
              AND g.is_active = true
              AND g.archived_at IS NULL
              AND public.is_student_in_group(gc.group_id)
        )
    );

-- (B) Course Units RLS
DROP POLICY IF EXISTS "Teachers manage course units" ON public.course_units;
DROP POLICY IF EXISTS "Teachers view course units" ON public.course_units;
DROP POLICY IF EXISTS "Teachers insert course units" ON public.course_units;
DROP POLICY IF EXISTS "Teachers update course units" ON public.course_units;
DROP POLICY IF EXISTS "Teachers delete course units" ON public.course_units;
DROP POLICY IF EXISTS "Students view units of accessible courses" ON public.course_units;

CREATE POLICY "Teachers view course units" ON public.course_units
    FOR SELECT TO authenticated
    USING (public.is_teacher());

CREATE POLICY "Teachers insert course units" ON public.course_units
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.courses c
            WHERE c.id = course_units.course_id
              AND (c.teacher_id = auth.uid() OR public.is_super_admin())
        )
    );

CREATE POLICY "Teachers update course units" ON public.course_units
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.courses c
            WHERE c.id = course_units.course_id
              AND (c.teacher_id = auth.uid() OR public.is_super_admin())
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.courses c
            WHERE c.id = course_units.course_id
              AND (c.teacher_id = auth.uid() OR public.is_super_admin())
        )
    );

CREATE POLICY "Teachers delete course units" ON public.course_units
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.courses c
            WHERE c.id = course_units.course_id
              AND (c.teacher_id = auth.uid() OR public.is_super_admin())
        )
    );

CREATE POLICY "Students view units of accessible courses" ON public.course_units
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.courses c
            JOIN public.group_courses gc ON gc.course_id = c.id
            JOIN public.groups g ON g.id = gc.group_id
            WHERE c.id = course_units.course_id
              AND c.is_published = true
              AND g.is_active = true
              AND g.archived_at IS NULL
              AND public.is_student_in_group(gc.group_id)
        )
    );

-- (C) Lessons RLS
DROP POLICY IF EXISTS "Teachers manage lessons" ON public.lessons;
DROP POLICY IF EXISTS "Teachers view lessons" ON public.lessons;
DROP POLICY IF EXISTS "Teachers insert lessons" ON public.lessons;
DROP POLICY IF EXISTS "Teachers update lessons" ON public.lessons;
DROP POLICY IF EXISTS "Teachers delete lessons" ON public.lessons;
DROP POLICY IF EXISTS "Students view published lessons" ON public.lessons;

CREATE POLICY "Teachers view lessons" ON public.lessons
    FOR SELECT TO authenticated
    USING (public.is_teacher());

CREATE POLICY "Teachers insert lessons" ON public.lessons
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.courses c
            JOIN public.course_units u ON u.course_id = c.id
            WHERE c.id = lessons.course_id
              AND u.id = lessons.unit_id
              AND (c.teacher_id = auth.uid() OR public.is_super_admin())
        )
    );

CREATE POLICY "Teachers update lessons" ON public.lessons
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.courses c
            JOIN public.course_units u ON u.course_id = c.id
            WHERE c.id = lessons.course_id
              AND u.id = lessons.unit_id
              AND (c.teacher_id = auth.uid() OR public.is_super_admin())
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.courses c
            JOIN public.course_units u ON u.course_id = c.id
            WHERE c.id = lessons.course_id
              AND u.id = lessons.unit_id
              AND (c.teacher_id = auth.uid() OR public.is_super_admin())
        )
    );

CREATE POLICY "Teachers delete lessons" ON public.lessons
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.courses c
            WHERE c.id = lessons.course_id
              AND (c.teacher_id = auth.uid() OR public.is_super_admin())
        )
    );

CREATE POLICY "Students view published lessons" ON public.lessons
    FOR SELECT TO authenticated
    USING (
        is_published = true AND EXISTS (
            SELECT 1 FROM public.courses c
            JOIN public.group_courses gc ON gc.course_id = c.id
            JOIN public.groups g ON g.id = gc.group_id
            WHERE c.id = lessons.course_id
              AND c.is_published = true
              AND g.is_active = true
              AND g.archived_at IS NULL
              AND public.is_student_in_group(gc.group_id)
        )
    );

-- (D) Lesson Resources RLS
DROP POLICY IF EXISTS "Teachers manage lesson resources" ON public.lesson_resources;
DROP POLICY IF EXISTS "Teachers view lesson resources" ON public.lesson_resources;
DROP POLICY IF EXISTS "Teachers insert lesson resources" ON public.lesson_resources;
DROP POLICY IF EXISTS "Teachers update lesson resources" ON public.lesson_resources;
DROP POLICY IF EXISTS "Teachers delete lesson resources" ON public.lesson_resources;
DROP POLICY IF EXISTS "Students view resources for accessible lessons" ON public.lesson_resources;

CREATE POLICY "Teachers view lesson resources" ON public.lesson_resources
    FOR SELECT TO authenticated
    USING (public.is_teacher());

CREATE POLICY "Teachers insert lesson resources" ON public.lesson_resources
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.lessons l
            JOIN public.courses c ON c.id = l.course_id
            WHERE l.id = lesson_resources.lesson_id
              AND (c.teacher_id = auth.uid() OR public.is_super_admin())
        )
    );

CREATE POLICY "Teachers update lesson resources" ON public.lesson_resources
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.lessons l
            JOIN public.courses c ON c.id = l.course_id
            WHERE l.id = lesson_resources.lesson_id
              AND (c.teacher_id = auth.uid() OR public.is_super_admin())
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.lessons l
            JOIN public.courses c ON c.id = l.course_id
            WHERE l.id = lesson_resources.lesson_id
              AND (c.teacher_id = auth.uid() OR public.is_super_admin())
        )
    );

CREATE POLICY "Teachers delete lesson resources" ON public.lesson_resources
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.lessons l
            JOIN public.courses c ON c.id = l.course_id
            WHERE l.id = lesson_resources.lesson_id
              AND (c.teacher_id = auth.uid() OR public.is_super_admin())
        )
    );

CREATE POLICY "Students view resources for accessible lessons" ON public.lesson_resources
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.lessons l
            JOIN public.courses c ON c.id = l.course_id
            JOIN public.group_courses gc ON gc.course_id = c.id
            JOIN public.groups g ON g.id = gc.group_id
            WHERE l.id = lesson_resources.lesson_id
              AND l.is_published = true
              AND c.is_published = true
              AND g.is_active = true
              AND g.archived_at IS NULL
              AND public.is_student_in_group(gc.group_id)
        )
    );

-- (E) Group Courses RLS
DROP POLICY IF EXISTS "Teachers manage group courses" ON public.group_courses;
DROP POLICY IF EXISTS "Students view assigned group courses" ON public.group_courses;

CREATE POLICY "Teachers manage group courses" ON public.group_courses
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.courses c
            WHERE c.id = group_courses.course_id
              AND (c.teacher_id = auth.uid() OR public.is_super_admin())
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.courses c
            WHERE c.id = group_courses.course_id
              AND (c.teacher_id = auth.uid() OR public.is_super_admin())
        )
    );

CREATE POLICY "Students view assigned group courses" ON public.group_courses
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.groups g
            WHERE g.id = group_courses.group_id
              AND g.is_active = true
              AND g.archived_at IS NULL
              AND public.is_student_in_group(g.id)
        )
    );

-- (F) Lesson Progress RLS
DROP POLICY IF EXISTS "Students view and record own lesson progress" ON public.lesson_progress;
DROP POLICY IF EXISTS "Students view own lesson progress" ON public.lesson_progress;
DROP POLICY IF EXISTS "Teachers view lesson progress" ON public.lesson_progress;
DROP POLICY IF EXISTS "Students record verified lesson progress" ON public.lesson_progress;
DROP POLICY IF EXISTS "Students update verified lesson progress" ON public.lesson_progress;

CREATE POLICY "Students view own lesson progress" ON public.lesson_progress
    FOR SELECT TO authenticated
    USING (
        student_id = auth.uid() AND public.is_active_student()
    );

CREATE POLICY "Teachers view lesson progress" ON public.lesson_progress
    FOR SELECT TO authenticated
    USING (
        public.is_teacher()
    );

CREATE POLICY "Students record verified lesson progress" ON public.lesson_progress
    FOR INSERT TO authenticated
    WITH CHECK (
        student_id = auth.uid() AND public.is_active_student() AND EXISTS (
            SELECT 1
            FROM public.lessons l
            JOIN public.courses c ON c.id = l.course_id
            JOIN public.group_courses gc ON gc.course_id = c.id
            JOIN public.groups g ON g.id = gc.group_id
            WHERE l.id = lesson_progress.lesson_id
              AND l.is_published = true
              AND c.is_published = true
              AND g.is_active = true
              AND g.archived_at IS NULL
              AND public.is_student_in_group(gc.group_id)
        )
    );

CREATE POLICY "Students update verified lesson progress" ON public.lesson_progress
    FOR UPDATE TO authenticated
    USING (
        student_id = auth.uid() AND public.is_active_student()
    )
    WITH CHECK (
        student_id = auth.uid() AND public.is_active_student() AND EXISTS (
            SELECT 1
            FROM public.lessons l
            JOIN public.courses c ON c.id = l.course_id
            JOIN public.group_courses gc ON gc.course_id = c.id
            JOIN public.groups g ON g.id = gc.group_id
            WHERE l.id = lesson_progress.lesson_id
              AND l.is_published = true
              AND c.is_published = true
              AND g.is_active = true
              AND g.archived_at IS NULL
              AND public.is_student_in_group(gc.group_id)
        )
    );

-- ------------------------------------------------------------------------------
-- 4. HARDENED CURRICULUM ORDERING & MANAGEMENT RPCS
-- ------------------------------------------------------------------------------

-- (A) RPC: Reorder Course Units with Strict Authorization & Validation
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
    v_course_teacher_id UUID;
    v_distinct_count INT;
    v_total_count INT;
    v_actual_units_count INT;
    v_matched_count INT;
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

    -- Verify course existence and ownership
    SELECT teacher_id INTO v_course_teacher_id
    FROM public.courses
    WHERE id = p_course_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Course not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_caller_id <> v_course_teacher_id AND NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Forbidden: You do not have permission to manage this course' USING ERRCODE = '42501';
    END IF;

    -- Input array validation
    IF p_unit_ids IS NULL OR array_length(p_unit_ids, 1) IS NULL OR array_length(p_unit_ids, 1) = 0 THEN
        RAISE EXCEPTION 'Unit IDs array cannot be empty' USING ERRCODE = '22000';
    END IF;

    -- Detect duplicates
    SELECT count(DISTINCT u_id), count(u_id)
    INTO v_distinct_count, v_total_count
    FROM unnest(p_unit_ids) AS u_id;

    IF v_distinct_count <> v_total_count THEN
        RAISE EXCEPTION 'Duplicate unit IDs provided in ordering request' USING ERRCODE = '22000';
    END IF;

    -- Check total count against actual units in this course
    SELECT count(*) INTO v_actual_units_count
    FROM public.course_units
    WHERE course_id = p_course_id;

    IF v_total_count <> v_actual_units_count THEN
        RAISE EXCEPTION 'Incomplete or mismatched unit ordering list' USING ERRCODE = '22000';
    END IF;

    -- Verify all IDs belong to this course
    SELECT count(*) INTO v_matched_count
    FROM public.course_units
    WHERE course_id = p_course_id
      AND id = ANY(p_unit_ids);

    IF v_matched_count <> v_total_count THEN
        RAISE EXCEPTION 'One or more unit IDs do not belong to the specified course' USING ERRCODE = '22000';
    END IF;

    -- Atomic sequential update
    FOR v_idx IN 1 .. array_length(p_unit_ids, 1) LOOP
        v_unit_id := p_unit_ids[v_idx];
        UPDATE public.course_units
        SET order_index = v_idx
        WHERE id = v_unit_id
          AND course_id = p_course_id;
    END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_course_units(UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reorder_course_units(UUID, UUID[]) TO authenticated;

-- (B) RPC: Reorder Course Lessons with Strict Authorization & Validation
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
    v_course_id UUID;
    v_course_teacher_id UUID;
    v_distinct_count INT;
    v_total_count INT;
    v_actual_lessons_count INT;
    v_matched_count INT;
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

    -- Verify unit and parent course existence
    SELECT course_id INTO v_course_id
    FROM public.course_units
    WHERE id = p_unit_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unit not found' USING ERRCODE = 'P0002';
    END IF;

    SELECT teacher_id INTO v_course_teacher_id
    FROM public.courses
    WHERE id = v_course_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Course not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_caller_id <> v_course_teacher_id AND NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Forbidden: You do not have permission to manage lessons in this course' USING ERRCODE = '42501';
    END IF;

    -- Input array validation
    IF p_lesson_ids IS NULL OR array_length(p_lesson_ids, 1) IS NULL OR array_length(p_lesson_ids, 1) = 0 THEN
        RAISE EXCEPTION 'Lesson IDs array cannot be empty' USING ERRCODE = '22000';
    END IF;

    -- Detect duplicates
    SELECT count(DISTINCT l_id), count(l_id)
    INTO v_distinct_count, v_total_count
    FROM unnest(p_lesson_ids) AS l_id;

    IF v_distinct_count <> v_total_count THEN
        RAISE EXCEPTION 'Duplicate lesson IDs provided in ordering request' USING ERRCODE = '22000';
    END IF;

    -- Check total count against actual lessons in unit
    SELECT count(*) INTO v_actual_lessons_count
    FROM public.lessons
    WHERE unit_id = p_unit_id;

    IF v_total_count <> v_actual_lessons_count THEN
        RAISE EXCEPTION 'Incomplete or mismatched lesson ordering list' USING ERRCODE = '22000';
    END IF;

    -- Verify all lesson IDs belong to this unit
    SELECT count(*) INTO v_matched_count
    FROM public.lessons
    WHERE unit_id = p_unit_id
      AND id = ANY(p_lesson_ids);

    IF v_matched_count <> v_total_count THEN
        RAISE EXCEPTION 'One or more lesson IDs do not belong to the specified unit' USING ERRCODE = '22000';
    END IF;

    -- Atomic sequential update
    FOR v_idx IN 1 .. array_length(p_lesson_ids, 1) LOOP
        v_lesson_id := p_lesson_ids[v_idx];
        UPDATE public.lessons
        SET order_index = v_idx,
            updated_at = now()
        WHERE id = v_lesson_id
          AND unit_id = p_unit_id;
    END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_course_lessons(UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reorder_course_lessons(UUID, UUID[]) TO authenticated;

-- (C) RPC: Assign Course to Group
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

    SELECT id, title, title_arabic, teacher_id INTO v_course
    FROM public.courses
    WHERE id = p_course_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Course not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_caller_id <> v_course.teacher_id AND NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Forbidden: You do not have permission to assign this course' USING ERRCODE = '42501';
    END IF;

    SELECT id, name, name_arabic, is_active, archived_at INTO v_group
    FROM public.groups
    WHERE id = p_group_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Group not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_group.archived_at IS NOT NULL OR NOT v_group.is_active THEN
        RAISE EXCEPTION 'Cannot assign course to an archived or inactive group' USING ERRCODE = '22000';
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

REVOKE ALL ON FUNCTION public.assign_course_to_group(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_course_to_group(UUID, UUID) TO authenticated;

-- (D) RPC: Remove Course from Group
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
    v_course RECORD;
    v_deleted_count INT;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Not authenticated' USING ERRCODE = '42501';
    END IF;

    IF NOT public.is_teacher() THEN
        RAISE EXCEPTION 'Forbidden: Only teachers and super admins can remove course assignments' USING ERRCODE = '42501';
    END IF;

    SELECT id, teacher_id INTO v_course
    FROM public.courses
    WHERE id = p_course_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Course not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_caller_id <> v_course.teacher_id AND NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Forbidden: You do not have permission to remove assignments for this course' USING ERRCODE = '42501';
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

-- (E) RPC: Record Student Lesson Progress
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
    -- and that the course is assigned to at least one active, non-archived group the student belongs to.
    SELECT EXISTS (
        SELECT 1
        FROM public.lessons l
        JOIN public.courses c ON c.id = l.course_id
        JOIN public.group_courses gc ON gc.course_id = c.id
        JOIN public.groups g ON g.id = gc.group_id
        WHERE l.id = p_lesson_id
          AND l.is_published = true
          AND c.is_published = true
          AND g.is_active = true
          AND g.archived_at IS NULL
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
