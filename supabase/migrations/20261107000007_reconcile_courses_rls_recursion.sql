-- ==============================================================================
-- WESSAM Academy - Migration 20261107000007: Reconcile Courses RLS Recursion
-- Forward-only reconciliation migration to eliminate cross-table RLS recursion
-- between public.courses, public.group_courses, and related curriculum relations
-- in existing production / persistent environments.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. HARDENED SECURITY DEFINER AUTH HELPERS
-- ------------------------------------------------------------------------------
-- These helpers provide narrowly scoped, recursion-free authorization predicates.
-- They run as SECURITY DEFINER with row_security = off to safely query cross-table
-- curriculum graphs without triggering secondary policy evaluations.
-- Caller identity is derived exclusively from auth.uid().
-- ------------------------------------------------------------------------------

-- Helper 1: Verify student course assignment without recursive RLS
CREATE OR REPLACE FUNCTION public.is_student_assigned_to_course(p_course_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
BEGIN
    -- Fast exit if inputs or session auth are invalid
    IF p_course_id IS NULL OR auth.uid() IS NULL THEN
        RETURN false;
    END IF;

    -- Fail safe if function context does not execute as a privileged database owner
    IF CURRENT_USER NOT IN ('postgres', 'supabase_admin')
       AND NOT pg_catalog.has_table_privilege(CURRENT_USER, 'public.courses', 'SELECT') THEN
        RETURN false;
    END IF;

    -- Verify caller is an active student
    IF NOT EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role = 'student'
          AND p.status = 'active'
    ) THEN
        RETURN false;
    END IF;

    -- Verify the course is published AND assigned to an active, unarchived group
    -- the student is enrolled in
    RETURN EXISTS (
        SELECT 1
        FROM public.courses c
        JOIN public.group_courses gc ON gc.course_id = c.id
        JOIN public.groups g ON g.id = gc.group_id
        JOIN public.group_students gs ON gs.group_id = g.id
        WHERE c.id = p_course_id
          AND c.is_published = true
          AND g.is_active = true
          AND g.archived_at IS NULL
          AND gs.student_id = auth.uid()
    );
END;
$$;

ALTER FUNCTION public.is_student_assigned_to_course(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_student_assigned_to_course(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_student_assigned_to_course(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_student_assigned_to_course(uuid) TO authenticated;

-- Helper 2: Verify teacher course ownership or super_admin access without recursive RLS
CREATE OR REPLACE FUNCTION public.can_manage_course(p_course_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
BEGIN
    -- Fast exit if inputs or session auth are invalid
    IF p_course_id IS NULL OR auth.uid() IS NULL THEN
        RETURN false;
    END IF;

    -- Fail safe if function context does not execute as a privileged database owner
    IF CURRENT_USER NOT IN ('postgres', 'supabase_admin')
       AND NOT pg_catalog.has_table_privilege(CURRENT_USER, 'public.courses', 'SELECT') THEN
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
        FROM public.courses c
        WHERE c.id = p_course_id
          AND c.teacher_id = auth.uid()
    );
END;
$$;

ALTER FUNCTION public.can_manage_course(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.can_manage_course(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_course(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_manage_course(uuid) TO authenticated;

-- ------------------------------------------------------------------------------
-- 2. RECONCILE COURSES RLS POLICIES (ELIMINATE CIRCULAR DEPENDENCY)
-- ------------------------------------------------------------------------------

DROP POLICY IF EXISTS "Teachers manage all courses" ON public.courses;
DROP POLICY IF EXISTS "Teachers view courses" ON public.courses;
DROP POLICY IF EXISTS "Teachers insert own courses" ON public.courses;
DROP POLICY IF EXISTS "Teachers update own courses" ON public.courses;
DROP POLICY IF EXISTS "Teachers delete own courses" ON public.courses;
DROP POLICY IF EXISTS "Students view assigned or published courses" ON public.courses;

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

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

-- Uses recursion-free SECURITY DEFINER helper; students cannot mutate courses
CREATE POLICY "Students view assigned or published courses" ON public.courses
    FOR SELECT TO authenticated
    USING (
        public.is_student_assigned_to_course(courses.id)
    );

-- ------------------------------------------------------------------------------
-- 3. RECONCILE GROUP COURSES RLS POLICIES
-- ------------------------------------------------------------------------------

DROP POLICY IF EXISTS "Teachers manage group courses" ON public.group_courses;
DROP POLICY IF EXISTS "Students view assigned group courses" ON public.group_courses;

ALTER TABLE public.group_courses ENABLE ROW LEVEL SECURITY;

-- Uses recursion-free can_manage_course helper
CREATE POLICY "Teachers manage group courses" ON public.group_courses
    FOR ALL TO authenticated
    USING (
        public.can_manage_course(group_courses.course_id)
    )
    WITH CHECK (
        public.can_manage_course(group_courses.course_id)
    );

CREATE POLICY "Students view assigned group courses" ON public.group_courses
    FOR SELECT TO authenticated
    USING (
        public.is_student_in_group(group_courses.group_id)
    );

-- ------------------------------------------------------------------------------
-- 4. RECONCILE COURSE UNITS RLS POLICIES
-- ------------------------------------------------------------------------------

DROP POLICY IF EXISTS "Teachers manage course units" ON public.course_units;
DROP POLICY IF EXISTS "Teachers view course units" ON public.course_units;
DROP POLICY IF EXISTS "Teachers insert course units" ON public.course_units;
DROP POLICY IF EXISTS "Teachers update course units" ON public.course_units;
DROP POLICY IF EXISTS "Teachers delete course units" ON public.course_units;
DROP POLICY IF EXISTS "Students view units of accessible courses" ON public.course_units;

ALTER TABLE public.course_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers view course units" ON public.course_units
    FOR SELECT TO authenticated
    USING (public.is_teacher());

CREATE POLICY "Teachers insert course units" ON public.course_units
    FOR INSERT TO authenticated
    WITH CHECK (
        public.can_manage_course(course_units.course_id)
    );

CREATE POLICY "Teachers update course units" ON public.course_units
    FOR UPDATE TO authenticated
    USING (
        public.can_manage_course(course_units.course_id)
    )
    WITH CHECK (
        public.can_manage_course(course_units.course_id)
    );

CREATE POLICY "Teachers delete course units" ON public.course_units
    FOR DELETE TO authenticated
    USING (
        public.can_manage_course(course_units.course_id)
    );

CREATE POLICY "Students view units of accessible courses" ON public.course_units
    FOR SELECT TO authenticated
    USING (
        public.is_student_assigned_to_course(course_units.course_id)
    );

-- ------------------------------------------------------------------------------
-- 5. RECONCILE LESSONS RLS POLICIES
-- ------------------------------------------------------------------------------

DROP POLICY IF EXISTS "Teachers manage lessons" ON public.lessons;
DROP POLICY IF EXISTS "Teachers view lessons" ON public.lessons;
DROP POLICY IF EXISTS "Teachers insert lessons" ON public.lessons;
DROP POLICY IF EXISTS "Teachers update lessons" ON public.lessons;
DROP POLICY IF EXISTS "Teachers delete lessons" ON public.lessons;
DROP POLICY IF EXISTS "Students view published lessons" ON public.lessons;

ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers view lessons" ON public.lessons
    FOR SELECT TO authenticated
    USING (public.is_teacher());

CREATE POLICY "Teachers insert lessons" ON public.lessons
    FOR INSERT TO authenticated
    WITH CHECK (
        public.can_manage_course(lessons.course_id)
    );

CREATE POLICY "Teachers update lessons" ON public.lessons
    FOR UPDATE TO authenticated
    USING (
        public.can_manage_course(lessons.course_id)
    )
    WITH CHECK (
        public.can_manage_course(lessons.course_id)
    );

CREATE POLICY "Teachers delete lessons" ON public.lessons
    FOR DELETE TO authenticated
    USING (
        public.can_manage_course(lessons.course_id)
    );

CREATE POLICY "Students view published lessons" ON public.lessons
    FOR SELECT TO authenticated
    USING (
        lessons.is_published = true
        AND public.is_student_assigned_to_course(lessons.course_id)
    );

-- ------------------------------------------------------------------------------
-- 6. RECONCILE LESSON RESOURCES RLS POLICIES
-- ------------------------------------------------------------------------------

DROP POLICY IF EXISTS "Teachers manage lesson resources" ON public.lesson_resources;
DROP POLICY IF EXISTS "Teachers view lesson resources" ON public.lesson_resources;
DROP POLICY IF EXISTS "Teachers insert lesson resources" ON public.lesson_resources;
DROP POLICY IF EXISTS "Teachers update lesson resources" ON public.lesson_resources;
DROP POLICY IF EXISTS "Teachers delete lesson resources" ON public.lesson_resources;
DROP POLICY IF EXISTS "Students view resources for accessible lessons" ON public.lesson_resources;

ALTER TABLE public.lesson_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers view lesson resources" ON public.lesson_resources
    FOR SELECT TO authenticated
    USING (public.is_teacher());

CREATE POLICY "Teachers insert lesson resources" ON public.lesson_resources
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.lessons l
            WHERE l.id = lesson_resources.lesson_id
              AND public.can_manage_course(l.course_id)
        )
    );

CREATE POLICY "Teachers update lesson resources" ON public.lesson_resources
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.lessons l
            WHERE l.id = lesson_resources.lesson_id
              AND public.can_manage_course(l.course_id)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.lessons l
            WHERE l.id = lesson_resources.lesson_id
              AND public.can_manage_course(l.course_id)
        )
    );

CREATE POLICY "Teachers delete lesson resources" ON public.lesson_resources
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.lessons l
            WHERE l.id = lesson_resources.lesson_id
              AND public.can_manage_course(l.course_id)
        )
    );

CREATE POLICY "Students view resources for accessible lessons" ON public.lesson_resources
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.lessons l
            WHERE l.id = lesson_resources.lesson_id
              AND l.is_published = true
              AND public.is_student_assigned_to_course(l.course_id)
        )
    );

-- ------------------------------------------------------------------------------
-- 7. RECONCILE LESSON PROGRESS RLS POLICIES
-- ------------------------------------------------------------------------------

DROP POLICY IF EXISTS "Students view and record own lesson progress" ON public.lesson_progress;
DROP POLICY IF EXISTS "Students view own lesson progress" ON public.lesson_progress;
DROP POLICY IF EXISTS "Teachers view lesson progress" ON public.lesson_progress;
DROP POLICY IF EXISTS "Students record verified lesson progress" ON public.lesson_progress;
DROP POLICY IF EXISTS "Students update verified lesson progress" ON public.lesson_progress;

ALTER TABLE public.lesson_progress ENABLE ROW LEVEL SECURITY;

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
        student_id = auth.uid()
        AND public.is_active_student()
        AND EXISTS (
            SELECT 1 FROM public.lessons l
            WHERE l.id = lesson_progress.lesson_id
              AND l.is_published = true
              AND public.is_student_assigned_to_course(l.course_id)
        )
    );

CREATE POLICY "Students update verified lesson progress" ON public.lesson_progress
    FOR UPDATE TO authenticated
    USING (
        student_id = auth.uid() AND public.is_active_student()
    )
    WITH CHECK (
        student_id = auth.uid()
        AND public.is_active_student()
        AND EXISTS (
            SELECT 1 FROM public.lessons l
            WHERE l.id = lesson_progress.lesson_id
              AND l.is_published = true
              AND public.is_student_assigned_to_course(l.course_id)
        )
    );

-- ------------------------------------------------------------------------------
-- 8. RECONCILE STORAGE OBJECTS RLS POLICIES
-- ------------------------------------------------------------------------------

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'storage' AND tablename = 'objects') THEN
        DROP POLICY IF EXISTS "Teachers upload learning resources" ON storage.objects;
        DROP POLICY IF EXISTS "Teachers delete learning resources" ON storage.objects;
        DROP POLICY IF EXISTS "Authorized users read learning resources storage" ON storage.objects;

        CREATE POLICY "Teachers upload learning resources"
        ON storage.objects FOR INSERT
        TO authenticated
        WITH CHECK (
            bucket_id = 'learning-resources'
            AND split_part(name, '/', 2) ~ '^[0-9a-fA-F-]{36}$'
            AND public.can_manage_course(split_part(name, '/', 2)::uuid)
        );

        CREATE POLICY "Teachers delete learning resources"
        ON storage.objects FOR DELETE
        TO authenticated
        USING (
            bucket_id = 'learning-resources'
            AND split_part(name, '/', 2) ~ '^[0-9a-fA-F-]{36}$'
            AND public.can_manage_course(split_part(name, '/', 2)::uuid)
        );

        CREATE POLICY "Authorized users read learning resources storage"
        ON storage.objects FOR SELECT
        TO authenticated
        USING (
            bucket_id = 'learning-resources'
            AND (
                (
                    split_part(name, '/', 2) ~ '^[0-9a-fA-F-]{36}$'
                    AND public.can_manage_course(split_part(name, '/', 2)::uuid)
                )
                OR (
                    split_part(name, '/', 4) ~ '^[0-9a-fA-F-]{36}$'
                    AND EXISTS (
                        SELECT 1
                        FROM public.lessons l
                        WHERE l.id = split_part(name, '/', 4)::uuid
                          AND l.is_published = true
                          AND public.is_student_assigned_to_course(l.course_id)
                    )
                )
            )
        );
    END IF;
END;
$$;

-- ------------------------------------------------------------------------------
-- 9. TABLE PRIVILEGES & ANON ACL INTEGRITY
-- ------------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON public.courses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_units TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lessons TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lesson_resources TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_courses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lesson_progress TO authenticated;

REVOKE ALL ON public.courses FROM anon;
REVOKE ALL ON public.course_units FROM anon;
REVOKE ALL ON public.lessons FROM anon;
REVOKE ALL ON public.lesson_resources FROM anon;
REVOKE ALL ON public.group_courses FROM anon;
REVOKE ALL ON public.lesson_progress FROM anon;
