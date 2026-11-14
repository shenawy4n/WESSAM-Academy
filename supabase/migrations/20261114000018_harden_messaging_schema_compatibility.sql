-- ==============================================================================
-- WESSAM Academy - Migration 20261114000018: Harden Messaging Schema Compatibility
--
-- Scope:
-- 1. Fix schema compatibility defect in public.can_student_and_teacher_message():
--    In migration 20261113000017, static references to public.assignments.teacher_id
--    and public.assignment_targets caused runtime PostgreSQL errors (42703 / 42P01)
--    whenever Phase 5C migration 20261111000015 had not yet been applied.
--    This forward-only migration replaces can_student_and_teacher_message() so
--    baseline assignments/courses/groups checks run statically against 20261103000001
--    columns, while Phase 5C assignments.teacher_id & public.assignment_targets
--    checks execute dynamically ONLY if those objects exist.
-- 2. Idempotently ensure the private 'message-attachments' storage bucket exists
--    and qualify storage.objects.name in the uncommitted-upload cleanup policy.
-- 3. Notify PostgREST to reload its schema cache immediately after migration.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. SCHEMA-SAFE RELATIONSHIP AUTHORIZATION HELPER
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_student_and_teacher_message(
    p_student_id UUID,
    p_teacher_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
    v_teacher_role TEXT;
    v_authorized BOOLEAN := false;
    v_has_assignment_teacher_id BOOLEAN := false;
    v_has_assignment_targets BOOLEAN := false;
BEGIN
    IF p_student_id IS NULL OR p_teacher_id IS NULL OR p_student_id = p_teacher_id THEN
        RETURN false;
    END IF;

    -- Student must be active with student role
    IF NOT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE id = p_student_id
          AND role = 'student'
          AND status = 'active'
    ) THEN
        RETURN false;
    END IF;

    -- Teacher must be active with teacher or super_admin role
    SELECT role::text
    INTO v_teacher_role
    FROM public.profiles
    WHERE id = p_teacher_id
      AND role IN ('teacher', 'super_admin')
      AND status = 'active';

    IF v_teacher_role IS NULL THEN
        RETURN false;
    END IF;

    -- Active Super Admin supervises the academy per existing platform policy
    IF v_teacher_role = 'super_admin' THEN
        RETURN true;
    END IF;

    -- Baseline cohort/course authorization (guaranteed since initial schema)
    IF EXISTS (
        SELECT 1
        FROM public.group_students gs
        JOIN public.group_courses gc ON gc.group_id = gs.group_id
        JOIN public.courses c ON c.id = gc.course_id
        WHERE gs.student_id = p_student_id
          AND c.teacher_id = p_teacher_id
    ) THEN
        RETURN true;
    END IF;

    -- Baseline student primary academic profile group -> course teacher
    IF EXISTS (
        SELECT 1
        FROM public.student_academic_profiles sap
        JOIN public.group_courses gc ON gc.group_id = sap.group_id
        JOIN public.courses c ON c.id = gc.course_id
        WHERE sap.profile_id = p_student_id
          AND sap.group_id IS NOT NULL
          AND c.teacher_id = p_teacher_id
    ) THEN
        RETURN true;
    END IF;

    -- Phase 4C helper authorization (courses, live_sessions, quizzes) if present
    IF to_regprocedure('public.is_teacher_authorized_for_student(uuid,uuid)') IS NOT NULL THEN
        EXECUTE 'SELECT public.is_teacher_authorized_for_student($1, $2)'
        INTO v_authorized
        USING p_teacher_id, p_student_id;

        IF COALESCE(v_authorized, false) THEN
            RETURN true;
        END IF;
    END IF;

    IF to_regprocedure('public.is_teacher_authorized_for_group(uuid,uuid)') IS NOT NULL THEN
        EXECUTE $sql$
            SELECT EXISTS (
                SELECT 1
                FROM public.student_academic_profiles sap
                WHERE sap.profile_id = $2
                  AND sap.group_id IS NOT NULL
                  AND public.is_teacher_authorized_for_group($1, sap.group_id)
            )
        $sql$
        INTO v_authorized
        USING p_teacher_id, p_student_id;

        IF COALESCE(v_authorized, false) THEN
            RETURN true;
        END IF;
    END IF;

    -- Baseline assignments check via course ownership + target_group_id (20261103000001)
    IF EXISTS (
        SELECT 1
        FROM public.assignments a
        JOIN public.courses c ON c.id = a.course_id
        WHERE c.teacher_id = p_teacher_id
          AND a.target_group_id IS NOT NULL
          AND (
              EXISTS (
                  SELECT 1
                  FROM public.group_students gs
                  WHERE gs.group_id = a.target_group_id
                    AND gs.student_id = p_student_id
              )
              OR EXISTS (
                  SELECT 1
                  FROM public.student_academic_profiles sap
                  WHERE sap.profile_id = p_student_id
                    AND sap.group_id = a.target_group_id
              )
          )
    ) THEN
        RETURN true;
    END IF;

    -- Optional Phase 5C assignments.teacher_id + assignment_targets checks
    -- Executed dynamically only when Phase 5C schema objects are present
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'assignments'
          AND column_name = 'teacher_id'
    )
    INTO v_has_assignment_teacher_id;

    v_has_assignment_targets := to_regclass('public.assignment_targets') IS NOT NULL;

    IF v_has_assignment_teacher_id THEN
        EXECUTE $sql$
            SELECT EXISTS (
                SELECT 1
                FROM public.assignments a
                WHERE a.teacher_id = $1
                  AND a.target_group_id IS NOT NULL
                  AND (
                      EXISTS (
                          SELECT 1
                          FROM public.group_students gs
                          WHERE gs.group_id = a.target_group_id
                            AND gs.student_id = $2
                      )
                      OR EXISTS (
                          SELECT 1
                          FROM public.student_academic_profiles sap
                          WHERE sap.profile_id = $2
                            AND sap.group_id = a.target_group_id
                      )
                  )
            )
        $sql$
        INTO v_authorized
        USING p_teacher_id, p_student_id;

        IF COALESCE(v_authorized, false) THEN
            RETURN true;
        END IF;

        IF v_has_assignment_targets THEN
            EXECUTE $sql$
                SELECT EXISTS (
                    SELECT 1
                    FROM public.assignments a
                    JOIN public.assignment_targets at ON at.assignment_id = a.id
                    WHERE a.teacher_id = $1
                      AND (
                          (at.target_type = 'student' AND at.student_id = $2)
                          OR (
                              at.target_type = 'group'
                              AND (
                                  EXISTS (
                                      SELECT 1
                                      FROM public.group_students gs
                                      WHERE gs.group_id = at.group_id
                                        AND gs.student_id = $2
                                  )
                                  OR EXISTS (
                                      SELECT 1
                                      FROM public.student_academic_profiles sap
                                      WHERE sap.profile_id = $2
                                        AND sap.group_id = at.group_id
                                  )
                              )
                          )
                      )
                )
            $sql$
            INTO v_authorized
            USING p_teacher_id, p_student_id;

            IF COALESCE(v_authorized, false) THEN
                RETURN true;
            END IF;
        END IF;
    END IF;

    RETURN false;
END;
$$;

ALTER FUNCTION public.can_student_and_teacher_message(UUID, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.can_student_and_teacher_message(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_student_and_teacher_message(UUID, UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 2. IDEMPOTENT PRIVATE STORAGE BUCKET & QUALIFIED CLEANUP POLICY
-- ------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'message-attachments',
    'message-attachments',
    false,
    10485760,
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
        'audio/mp4',
        'text/plain'
    ]
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 10485760,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Message uploaders delete uncommitted attachments" ON storage.objects;
CREATE POLICY "Message uploaders delete uncommitted attachments" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'message-attachments'
        AND (
            public.is_super_admin()
            OR (
                public.can_access_message_storage_object(storage.objects.name, true)
                AND NOT EXISTS (
                    SELECT 1
                    FROM public.message_attachments ma
                    WHERE ma.storage_bucket = 'message-attachments'
                      AND ma.storage_path = storage.objects.name
                )
            )
        )
    );

-- ------------------------------------------------------------------------------
-- 3. REFRESH POSTGREST SCHEMA CACHE
-- ------------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
