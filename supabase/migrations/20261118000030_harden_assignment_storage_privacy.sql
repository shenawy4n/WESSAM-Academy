-- ==============================================================================
-- WESSAM Academy — Migration 30: Assignment Storage Privacy & RLS Hardening
-- Migration: 20261118000030_harden_assignment_storage_privacy.sql
--
-- Security Objective:
--   Remediate cross-student and cross-teacher privacy vulnerabilities on
--   storage.objects for the private 'assignment-files' bucket introduced in
--   Migration 20261111000015 (which allowed any active student to read all
--   attachments/ and submissions/ and upload anywhere in submissions/, and
--   allowed any active teacher to read/upload/delete across all teachers).
--
-- Supported Verified Path Conventions:
--   1. Assignment-scoped attachments:
--      attachments/<assignment_uuid>/<filename>
--   2. Teacher/Admin draft attachments (new unsaved assignment uploads):
--      attachments/drafts/<uploader_uuid>/<filename>
--   3. Student submission attachments:
--      submissions/<assignment_uuid>/<student_uuid>/<filename>
--
-- Changes:
--   1. Creates SECURITY DEFINER helper
--      public.can_access_assignment_storage_object(TEXT, TEXT) owned by postgres
--      with SET search_path = '' and SET row_security = off, enforcing:
--        - Active account status (super_admin, teacher, or student)
--        - Path traversal and malformed-key rejection
--        - Strict UUID segment validation
--        - Assignment ownership (can_manage_assignment) for teachers
--        - Published + targeted assignment verification for students
--        - Own-directory isolation for student submission reads and uploads
--   2. Replaces the three 'assignment-files' storage.objects policies
--      (INSERT, SELECT, DELETE) without altering bucket privacy, file size
--      limits, MIME allowlists, or unrelated bucket policies.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. STORAGE AUTHORIZATION HELPER
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_access_assignment_storage_object(
    p_object_name TEXT,
    p_action TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
    v_caller_id UUID;
    v_is_super BOOLEAN := false;
    v_is_teacher BOOLEAN := false;
    v_is_student BOOLEAN := false;
    v_parts TEXT[];
    v_part_count INT;
    v_assignment_id UUID;
    v_student_id UUID;
    v_uploader_id UUID;
    v_assign RECORD;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RETURN false;
    END IF;

    IF p_object_name IS NULL OR pg_catalog.btrim(p_object_name) = '' THEN
        RETURN false;
    END IF;

    IF p_action IS NULL OR p_action NOT IN ('select', 'insert', 'delete') THEN
        RETURN false;
    END IF;

    -- Reject path traversal, leading/trailing/double slashes, and backslashes
    IF p_object_name LIKE '%..%'
       OR p_object_name LIKE '/%'
       OR p_object_name LIKE '%/'
       OR p_object_name LIKE '%//%'
       OR p_object_name LIKE '%\%' THEN
        RETURN false;
    END IF;

    v_is_super := public.is_super_admin();
    v_is_teacher := public.is_teacher();
    v_is_student := public.is_active_student();

    -- Deny all inactive, suspended, or unrecognized accounts
    IF NOT (v_is_super OR v_is_teacher OR v_is_student) THEN
        RETURN false;
    END IF;

    v_parts := pg_catalog.string_to_array(p_object_name, '/');
    v_part_count := pg_catalog.array_length(v_parts, 1);

    IF v_part_count IS NULL OR v_part_count < 3 THEN
        RETURN false;
    END IF;

    -- --------------------------------------------------------------------------
    -- A. ASSIGNMENT ATTACHMENTS
    -- --------------------------------------------------------------------------
    IF v_parts[1] = 'attachments' THEN
        -- Subcase A1: Teacher/Admin draft attachment -> attachments/drafts/<uploader_uuid>/<filename>
        IF v_part_count = 4 AND v_parts[2] = 'drafts' THEN
            IF v_parts[3] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
                RETURN false;
            END IF;
            IF pg_catalog.btrim(COALESCE(v_parts[4], '')) = '' THEN
                RETURN false;
            END IF;

            v_uploader_id := v_parts[3]::UUID;

            IF v_is_super THEN
                RETURN true;
            END IF;

            IF p_action = 'insert' THEN
                RETURN v_is_teacher AND v_uploader_id = v_caller_id;
            END IF;

            IF p_action = 'delete' THEN
                RETURN v_is_teacher
                   AND v_uploader_id = v_caller_id
                   AND NOT EXISTS (
                       SELECT 1
                       FROM public.assignments a
                       WHERE a.teacher_id <> v_caller_id
                         AND pg_catalog.jsonb_typeof(a.attachments) = 'array'
                         AND a.attachments @> pg_catalog.jsonb_build_array(
                             pg_catalog.jsonb_build_object('path', p_object_name)
                         )
                   );
            END IF;

            -- p_action = 'select'
            IF v_is_teacher THEN
                IF v_uploader_id = v_caller_id THEN
                    RETURN true;
                END IF;
                RETURN EXISTS (
                    SELECT 1
                    FROM public.assignments a
                    WHERE pg_catalog.jsonb_typeof(a.attachments) = 'array'
                      AND a.attachments @> pg_catalog.jsonb_build_array(
                          pg_catalog.jsonb_build_object('path', p_object_name)
                      )
                      AND public.can_manage_assignment(a.id)
                );
            END IF;

            IF v_is_student THEN
                RETURN EXISTS (
                    SELECT 1
                    FROM public.assignments a
                    WHERE a.is_published = true
                      AND a.status = 'published'
                      AND COALESCE(a.publish_at, now()) <= now()
                      AND pg_catalog.jsonb_typeof(a.attachments) = 'array'
                      AND a.attachments @> pg_catalog.jsonb_build_array(
                          pg_catalog.jsonb_build_object('path', p_object_name)
                      )
                      AND public.is_student_targeted_for_assignment(a.id, v_caller_id)
                );
            END IF;

            RETURN false;
        END IF;

        -- Subcase A2: Assignment-scoped attachment -> attachments/<assignment_uuid>/<filename>
        IF v_part_count = 3 THEN
            IF v_parts[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
                RETURN false;
            END IF;
            IF pg_catalog.btrim(COALESCE(v_parts[3], '')) = '' THEN
                RETURN false;
            END IF;

            v_assignment_id := v_parts[2]::UUID;

            IF v_is_super THEN
                RETURN true;
            END IF;

            SELECT id, teacher_id, is_published, status, publish_at
            INTO v_assign
            FROM public.assignments
            WHERE id = v_assignment_id;

            IF p_action IN ('insert', 'delete') THEN
                IF NOT FOUND THEN
                    RETURN false;
                END IF;
                RETURN v_is_teacher AND public.can_manage_assignment(v_assignment_id);
            END IF;

            -- p_action = 'select'
            IF v_is_teacher THEN
                IF FOUND AND public.can_manage_assignment(v_assignment_id) THEN
                    RETURN true;
                END IF;
                RETURN EXISTS (
                    SELECT 1
                    FROM public.assignments a
                    WHERE pg_catalog.jsonb_typeof(a.attachments) = 'array'
                      AND a.attachments @> pg_catalog.jsonb_build_array(
                          pg_catalog.jsonb_build_object('path', p_object_name)
                      )
                      AND public.can_manage_assignment(a.id)
                );
            END IF;

            IF v_is_student THEN
                IF FOUND
                   AND v_assign.is_published = true
                   AND v_assign.status = 'published'
                   AND COALESCE(v_assign.publish_at, now()) <= now()
                   AND public.is_student_targeted_for_assignment(v_assignment_id, v_caller_id) THEN
                    RETURN true;
                END IF;
                RETURN EXISTS (
                    SELECT 1
                    FROM public.assignments a
                    WHERE a.is_published = true
                      AND a.status = 'published'
                      AND COALESCE(a.publish_at, now()) <= now()
                      AND pg_catalog.jsonb_typeof(a.attachments) = 'array'
                      AND a.attachments @> pg_catalog.jsonb_build_array(
                          pg_catalog.jsonb_build_object('path', p_object_name)
                      )
                      AND public.is_student_targeted_for_assignment(a.id, v_caller_id)
                );
            END IF;

            RETURN false;
        END IF;

        RETURN false;
    END IF;

    -- --------------------------------------------------------------------------
    -- B. STUDENT SUBMISSIONS -> submissions/<assignment_uuid>/<student_uuid>/<filename>
    -- --------------------------------------------------------------------------
    IF v_parts[1] = 'submissions' THEN
        IF v_part_count <> 4 THEN
            RETURN false;
        END IF;

        IF v_parts[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           OR v_parts[3] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            RETURN false;
        END IF;

        IF pg_catalog.btrim(COALESCE(v_parts[4], '')) = '' THEN
            RETURN false;
        END IF;

        v_assignment_id := v_parts[2]::UUID;
        v_student_id := v_parts[3]::UUID;

        IF v_is_super THEN
            RETURN true;
        END IF;

        SELECT id, teacher_id, is_published, status, publish_at
        INTO v_assign
        FROM public.assignments
        WHERE id = v_assignment_id;

        IF NOT FOUND THEN
            RETURN false;
        END IF;

        IF p_action = 'insert' THEN
            -- Only an active targeted student may upload into their own submission path
            RETURN v_is_student
               AND v_student_id = v_caller_id
               AND v_assign.is_published = true
               AND v_assign.status = 'published'
               AND COALESCE(v_assign.publish_at, now()) <= now()
               AND public.is_student_targeted_for_assignment(v_assignment_id, v_caller_id);
        END IF;

        IF p_action = 'select' THEN
            IF v_is_teacher THEN
                RETURN public.can_manage_assignment(v_assignment_id);
            END IF;

            IF v_is_student THEN
                RETURN v_student_id = v_caller_id
                   AND (
                       public.is_student_targeted_for_assignment(v_assignment_id, v_caller_id)
                       OR EXISTS (
                           SELECT 1
                           FROM public.submissions s
                           WHERE s.assignment_id = v_assignment_id
                             AND s.student_id = v_caller_id
                       )
                   );
            END IF;

            RETURN false;
        END IF;

        IF p_action = 'delete' THEN
            RETURN v_is_teacher AND public.can_manage_assignment(v_assignment_id);
        END IF;

        RETURN false;
    END IF;

    RETURN false;
END;
$$;

ALTER FUNCTION public.can_access_assignment_storage_object(TEXT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.can_access_assignment_storage_object(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_assignment_storage_object(TEXT, TEXT) TO authenticated;

-- ------------------------------------------------------------------------------
-- 2. REPLACE 'assignment-files' STORAGE OBJECT POLICIES (LEAST PRIVILEGE)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'storage' AND tablename = 'objects') THEN
        DROP POLICY IF EXISTS "Authorized users upload assignment files" ON storage.objects;
        DROP POLICY IF EXISTS "Authorized users read assignment files" ON storage.objects;
        DROP POLICY IF EXISTS "Authorized users delete assignment files" ON storage.objects;

        CREATE POLICY "Authorized users upload assignment files" ON storage.objects
            FOR INSERT TO authenticated
            WITH CHECK (
                bucket_id = 'assignment-files'
                AND public.can_access_assignment_storage_object(storage.objects.name, 'insert')
            );

        CREATE POLICY "Authorized users read assignment files" ON storage.objects
            FOR SELECT TO authenticated
            USING (
                bucket_id = 'assignment-files'
                AND public.can_access_assignment_storage_object(storage.objects.name, 'select')
            );

        CREATE POLICY "Authorized users delete assignment files" ON storage.objects
            FOR DELETE TO authenticated
            USING (
                bucket_id = 'assignment-files'
                AND public.can_access_assignment_storage_object(storage.objects.name, 'delete')
            );
    END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
