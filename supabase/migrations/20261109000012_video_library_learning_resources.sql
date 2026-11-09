-- ==============================================================================
-- WESSAM Academy - Migration 20261109000012
-- Phase 5A: Video Library & Learning Resources Completion
--
-- Features:
-- 1. Video Library abstraction (YouTube, Vimeo, storage/uploaded, Mux)
-- 2. Granular metadata (Bilingual Arabic/English, duration, order, course, unit, lesson, group)
-- 3. Video Progress tracking per student (server-validated completion >= 85%, resume position)
-- 4. Learning Resources extension (resource types, publishing status, display order)
-- 5. Storage policy hardening for private learning-resources bucket
-- 6. Strict least-privilege RLS, recursion-free security definer helpers, anon isolation
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. SCHEMA UPGRADES: public.video_assets
-- ------------------------------------------------------------------------------

-- Allow external/uploaded videos without requiring legacy Mux playback ID
ALTER TABLE public.video_assets ALTER COLUMN provider_playback_id DROP NOT NULL;
ALTER TABLE public.video_assets ALTER COLUMN provider SET DEFAULT 'youtube';

-- Add comprehensive video library metadata
ALTER TABLE public.video_assets ADD COLUMN IF NOT EXISTS title_arabic TEXT;
ALTER TABLE public.video_assets ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.video_assets ADD COLUMN IF NOT EXISTS description_arabic TEXT;
ALTER TABLE public.video_assets ADD COLUMN IF NOT EXISTS video_url TEXT;
ALTER TABLE public.video_assets ADD COLUMN IF NOT EXISTS storage_path TEXT;
ALTER TABLE public.video_assets ADD COLUMN IF NOT EXISTS video_source TEXT NOT NULL DEFAULT 'youtube'
    CHECK (video_source IN ('youtube', 'vimeo', 'storage', 'mux', 'custom'));
ALTER TABLE public.video_assets ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE public.video_assets ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL;
ALTER TABLE public.video_assets ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES public.course_units(id) ON DELETE SET NULL;
ALTER TABLE public.video_assets ADD COLUMN IF NOT EXISTS lesson_id UUID REFERENCES public.lessons(id) ON DELETE SET NULL;
ALTER TABLE public.video_assets ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL;
ALTER TABLE public.video_assets ADD COLUMN IF NOT EXISTS order_index INT NOT NULL DEFAULT 1;
ALTER TABLE public.video_assets ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived'));
ALTER TABLE public.video_assets ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE public.video_assets ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE public.video_assets ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.video_assets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Indexes for performant filtering and sorting
CREATE INDEX IF NOT EXISTS idx_video_assets_course_status ON public.video_assets (course_id, status);
CREATE INDEX IF NOT EXISTS idx_video_assets_unit_status ON public.video_assets (unit_id, status);
CREATE INDEX IF NOT EXISTS idx_video_assets_lesson_status ON public.video_assets (lesson_id, status);
CREATE INDEX IF NOT EXISTS idx_video_assets_group_status ON public.video_assets (group_id, status);
CREATE INDEX IF NOT EXISTS idx_video_assets_created_by ON public.video_assets (created_by);
CREATE INDEX IF NOT EXISTS idx_video_assets_status_order ON public.video_assets (status, order_index);

-- ------------------------------------------------------------------------------
-- 2. SCHEMA UPGRADES: public.lesson_resources
-- ------------------------------------------------------------------------------

ALTER TABLE public.lesson_resources ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE;
ALTER TABLE public.lesson_resources ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.lesson_resources ADD COLUMN IF NOT EXISTS description_arabic TEXT;
ALTER TABLE public.lesson_resources ADD COLUMN IF NOT EXISTS resource_type TEXT NOT NULL DEFAULT 'pdf'
    CHECK (resource_type IN ('pdf', 'worksheet', 'image', 'document', 'slides', 'link', 'other'));
ALTER TABLE public.lesson_resources ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.lesson_resources ADD COLUMN IF NOT EXISTS order_index INT NOT NULL DEFAULT 1;
ALTER TABLE public.lesson_resources ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Backfill course_id on existing lesson_resources from lessons
UPDATE public.lesson_resources lr
SET course_id = l.course_id
FROM public.lessons l
WHERE lr.lesson_id = l.id
  AND lr.course_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_lesson_resources_course_pub ON public.lesson_resources (course_id, is_published);
CREATE INDEX IF NOT EXISTS idx_lesson_resources_lesson_pub ON public.lesson_resources (lesson_id, is_published, order_index);

-- ------------------------------------------------------------------------------
-- 3. NEW TABLE: public.video_progress
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.video_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    video_id UUID NOT NULL REFERENCES public.video_assets(id) ON DELETE CASCADE,
    last_position_seconds INT NOT NULL DEFAULT 0 CHECK (last_position_seconds >= 0),
    max_position_seconds INT NOT NULL DEFAULT 0 CHECK (max_position_seconds >= 0),
    duration_seconds INT NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
    is_completed BOOLEAN NOT NULL DEFAULT false,
    completed_at TIMESTAMPTZ,
    last_watched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (student_id, video_id)
);

CREATE INDEX IF NOT EXISTS idx_video_progress_student ON public.video_progress (student_id, last_watched_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_progress_video ON public.video_progress (video_id, is_completed);

-- ------------------------------------------------------------------------------
-- 4. STORAGE BUCKET CONFIGURATION
-- ------------------------------------------------------------------------------

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'storage' AND tablename = 'buckets') THEN
        INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
        VALUES (
            'learning-resources',
            'learning-resources',
            false,
            52428800, -- 50 MB
            ARRAY[
                'application/pdf',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/msword',
                'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                'application/vnd.ms-powerpoint',
                'application/zip',
                'image/jpeg',
                'image/png',
                'image/webp',
                'video/mp4',
                'video/webm',
                'audio/mpeg'
            ]
        )
        ON CONFLICT (id) DO UPDATE SET
            public = false,
            file_size_limit = 52428800,
            allowed_mime_types = EXCLUDED.allowed_mime_types;
    END IF;
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. RECURSION-FREE AUTHORIZATION HELPERS
-- ------------------------------------------------------------------------------

-- Helper 1: Verify teacher or super_admin can manage a video
CREATE OR REPLACE FUNCTION public.can_manage_video(p_video_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
    v_video RECORD;
BEGIN
    IF p_video_id IS NULL OR auth.uid() IS NULL THEN
        RETURN false;
    END IF;

    IF public.is_super_admin() THEN
        RETURN true;
    END IF;

    IF NOT public.is_teacher() THEN
        RETURN false;
    END IF;

    SELECT id, course_id, created_by
    INTO v_video
    FROM public.video_assets
    WHERE id = p_video_id;

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    -- Directly created by this teacher
    IF v_video.created_by = auth.uid() THEN
        RETURN true;
    END IF;

    -- Associated with a course managed by this teacher
    IF v_video.course_id IS NOT NULL AND public.can_manage_course(v_video.course_id) THEN
        RETURN true;
    END IF;

    RETURN false;
END;
$$;

ALTER FUNCTION public.can_manage_video(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.can_manage_video(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_video(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_manage_video(UUID) TO authenticated;

-- Helper 2: Verify active student is authorized to view a video
CREATE OR REPLACE FUNCTION public.is_student_authorized_for_video(p_video_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
    v_video RECORD;
    v_is_eligible BOOLEAN := false;
BEGIN
    IF p_video_id IS NULL OR auth.uid() IS NULL THEN
        RETURN false;
    END IF;

    IF NOT public.is_active_student() THEN
        RETURN false;
    END IF;

    SELECT id, course_id, group_id, status
    INTO v_video
    FROM public.video_assets
    WHERE id = p_video_id;

    IF NOT FOUND OR v_video.status != 'published' THEN
        RETURN false;
    END IF;

    -- If group-restricted, student MUST be in that specific active group
    IF v_video.group_id IS NOT NULL THEN
        IF NOT public.is_student_in_group(v_video.group_id) THEN
            RETURN false;
        END IF;
    END IF;

    -- If course-restricted, student MUST be assigned to that course
    IF v_video.course_id IS NOT NULL THEN
        IF NOT public.is_student_assigned_to_course(v_video.course_id) THEN
            RETURN false;
        END IF;
    END IF;

    -- If neither is set, but video is published, verify student is in at least one active group
    IF v_video.group_id IS NULL AND v_video.course_id IS NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.group_students gs
            JOIN public.groups g ON g.id = gs.group_id
            WHERE gs.student_id = auth.uid()
              AND g.is_active = true
              AND g.archived_at IS NULL
        ) INTO v_is_eligible;
        RETURN v_is_eligible;
    END IF;

    RETURN true;
END;
$$;

ALTER FUNCTION public.is_student_authorized_for_video(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_student_authorized_for_video(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_student_authorized_for_video(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_student_authorized_for_video(UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------

-- (A) public.video_assets
ALTER TABLE public.video_assets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Teachers manage video assets" ON public.video_assets;
DROP POLICY IF EXISTS "Teachers and super admins view all video assets" ON public.video_assets;
DROP POLICY IF EXISTS "Students view authorized published videos" ON public.video_assets;
DROP POLICY IF EXISTS "Teachers insert video assets" ON public.video_assets;
DROP POLICY IF EXISTS "Teachers update authorized video assets" ON public.video_assets;
DROP POLICY IF EXISTS "Teachers delete authorized video assets" ON public.video_assets;

CREATE POLICY "Teachers and super admins view all video assets" ON public.video_assets
    FOR SELECT TO authenticated
    USING (
        public.is_super_admin()
        OR (
            public.is_teacher() AND (
                created_by = auth.uid()
                OR course_id IS NULL
                OR public.can_manage_course(course_id)
            )
        )
    );

CREATE POLICY "Students view authorized published videos" ON public.video_assets
    FOR SELECT TO authenticated
    USING (
        public.is_active_student()
        AND status = 'published'
        AND (
            (group_id IS NOT NULL AND public.is_student_in_group(group_id))
            OR (group_id IS NULL AND course_id IS NOT NULL AND public.is_student_assigned_to_course(course_id))
            OR (group_id IS NULL AND course_id IS NULL)
        )
    );

CREATE POLICY "Teachers insert video assets" ON public.video_assets
    FOR INSERT TO authenticated
    WITH CHECK (
        public.is_super_admin()
        OR (
            public.is_teacher() AND (
                course_id IS NULL
                OR public.can_manage_course(course_id)
            )
        )
    );

CREATE POLICY "Teachers update authorized video assets" ON public.video_assets
    FOR UPDATE TO authenticated
    USING (
        public.is_super_admin()
        OR (
            public.is_teacher() AND (
                created_by = auth.uid()
                OR (course_id IS NOT NULL AND public.can_manage_course(course_id))
            )
        )
    )
    WITH CHECK (
        public.is_super_admin()
        OR (
            public.is_teacher() AND (
                created_by = auth.uid()
                OR (course_id IS NULL OR public.can_manage_course(course_id))
            )
        )
    );

CREATE POLICY "Teachers delete authorized video assets" ON public.video_assets
    FOR DELETE TO authenticated
    USING (
        public.is_super_admin()
        OR (
            public.is_teacher() AND (
                created_by = auth.uid()
                OR (course_id IS NOT NULL AND public.can_manage_course(course_id))
            )
        )
    );

-- (B) public.video_progress
ALTER TABLE public.video_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Teachers and super admins view video progress" ON public.video_progress;
DROP POLICY IF EXISTS "Students view own video progress" ON public.video_progress;
DROP POLICY IF EXISTS "Students insert own video progress" ON public.video_progress;
DROP POLICY IF EXISTS "Students update own video progress" ON public.video_progress;

CREATE POLICY "Teachers and super admins view video progress" ON public.video_progress
    FOR SELECT TO authenticated
    USING (
        public.is_super_admin()
        OR (
            public.is_teacher()
            AND public.can_manage_video(video_id)
        )
    );

CREATE POLICY "Students view own video progress" ON public.video_progress
    FOR SELECT TO authenticated
    USING (
        student_id = auth.uid()
        AND public.is_active_student()
    );

CREATE POLICY "Students insert own video progress" ON public.video_progress
    FOR INSERT TO authenticated
    WITH CHECK (
        student_id = auth.uid()
        AND public.is_active_student()
        AND public.is_student_authorized_for_video(video_id)
    );

CREATE POLICY "Students update own video progress" ON public.video_progress
    FOR UPDATE TO authenticated
    USING (
        student_id = auth.uid()
        AND public.is_active_student()
    )
    WITH CHECK (
        student_id = auth.uid()
        AND public.is_active_student()
    );

-- (C) public.lesson_resources (Hardened student policy to require is_published = true)
DROP POLICY IF EXISTS "Students view resources for accessible lessons" ON public.lesson_resources;
CREATE POLICY "Students view resources for accessible lessons" ON public.lesson_resources
    FOR SELECT TO authenticated
    USING (
        is_published = true
        AND EXISTS (
            SELECT 1 FROM public.lessons l
            WHERE l.id = lesson_resources.lesson_id
              AND l.is_published = true
              AND public.is_student_assigned_to_course(l.course_id)
        )
    );

-- (D) Storage Objects Hardening for learning-resources bucket
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
            AND (
                public.is_super_admin()
                OR (
                    public.is_teacher()
                    AND split_part(name, '/', 2) ~ '^[0-9a-fA-F-]{36}$'
                    AND public.can_manage_course(split_part(name, '/', 2)::uuid)
                )
            )
        );

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
                    AND public.can_manage_course(split_part(name, '/', 2)::uuid)
                )
            )
        );

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
                    AND public.can_manage_course(split_part(name, '/', 2)::uuid)
                )
                OR (
                    public.is_active_student()
                    AND (
                        -- Lesson resource path: courses/<course_id>/lessons/<lesson_id>/<file>
                        (
                            split_part(name, '/', 4) ~ '^[0-9a-fA-F-]{36}$'
                            AND EXISTS (
                                SELECT 1 FROM public.lessons l
                                JOIN public.lesson_resources lr ON lr.lesson_id = l.id
                                WHERE l.id = split_part(name, '/', 4)::uuid
                                  AND l.is_published = true
                                  AND lr.is_published = true
                                  AND lr.storage_path = storage.objects.name
                                  AND public.is_student_assigned_to_course(l.course_id)
                            )
                        )
                        OR
                        -- Course resource / video path: courses/<course_id>/videos/<video_id>/<file>
                        (
                            split_part(name, '/', 4) ~ '^[0-9a-fA-F-]{36}$'
                            AND EXISTS (
                                SELECT 1 FROM public.video_assets va
                                WHERE va.id = split_part(name, '/', 4)::uuid
                                  AND va.status = 'published'
                                  AND va.storage_path = storage.objects.name
                                  AND public.is_student_authorized_for_video(va.id)
                            )
                        )
                    )
                )
            )
        );
    END IF;
END;
$$;

-- ------------------------------------------------------------------------------
-- 7. ATOMIC BUSINESS RPCs
-- ------------------------------------------------------------------------------

-- RPC 1: Record video playback progress with server-authoritative completion
CREATE OR REPLACE FUNCTION public.record_video_progress(
    p_video_id UUID,
    p_position_seconds INT,
    p_duration_seconds INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
    v_caller_id UUID;
    v_video RECORD;
    v_pos INT;
    v_dur INT;
    v_max_pos INT;
    v_is_completed BOOLEAN := false;
    v_existing RECORD;
    v_result RECORD;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Caller not authenticated' USING ERRCODE = '42501';
    END IF;

    IF NOT public.is_active_student() THEN
        RAISE EXCEPTION 'Forbidden: Only active students can record video progress' USING ERRCODE = '42501';
    END IF;

    -- Verify video exists and is accessible to student
    SELECT id, course_id, lesson_id, duration_seconds, status
    INTO v_video
    FROM public.video_assets
    WHERE id = p_video_id;

    IF NOT FOUND OR v_video.status != 'published' THEN
        RAISE EXCEPTION 'Forbidden: Video not found or not published' USING ERRCODE = '42501';
    END IF;

    IF NOT public.is_student_authorized_for_video(p_video_id) THEN
        RAISE EXCEPTION 'Forbidden: Student not authorized to view this video' USING ERRCODE = '42501';
    END IF;

    v_pos := GREATEST(COALESCE(p_position_seconds, 0), 0);
    v_dur := GREATEST(COALESCE(p_duration_seconds, v_video.duration_seconds, 0), 0);

    -- Fetch existing progress if any
    SELECT * INTO v_existing
    FROM public.video_progress
    WHERE student_id = v_caller_id AND video_id = p_video_id;

    IF FOUND THEN
        v_max_pos := GREATEST(COALESCE(v_existing.max_position_seconds, 0), v_pos);
        v_is_completed := v_existing.is_completed;
    ELSE
        v_max_pos := v_pos;
        v_is_completed := false;
    END IF;

    -- Server-side completion validation:
    -- Cannot be marked complete if student only opened the video (must reach >= 85% of duration, or pos >= dur - 5s if dur > 0)
    IF v_dur > 0 AND NOT v_is_completed THEN
        IF v_max_pos >= (v_dur * 0.85) OR (v_dur >= 10 AND v_max_pos >= (v_dur - 5)) THEN
            v_is_completed := true;
        END IF;
    END IF;

    INSERT INTO public.video_progress (
        student_id,
        video_id,
        last_position_seconds,
        max_position_seconds,
        duration_seconds,
        is_completed,
        completed_at,
        last_watched_at
    ) VALUES (
        v_caller_id,
        p_video_id,
        v_pos,
        v_max_pos,
        v_dur,
        v_is_completed,
        CASE WHEN v_is_completed THEN now() ELSE NULL END,
        now()
    )
    ON CONFLICT (student_id, video_id)
    DO UPDATE SET
        last_position_seconds = EXCLUDED.last_position_seconds,
        max_position_seconds = GREATEST(public.video_progress.max_position_seconds, EXCLUDED.last_position_seconds),
        duration_seconds = GREATEST(public.video_progress.duration_seconds, EXCLUDED.duration_seconds),
        is_completed = CASE
            WHEN public.video_progress.is_completed THEN true
            ELSE EXCLUDED.is_completed
        END,
        completed_at = CASE
            WHEN public.video_progress.is_completed THEN public.video_progress.completed_at
            WHEN EXCLUDED.is_completed THEN now()
            ELSE NULL
        END,
        last_watched_at = now()
    RETURNING id, student_id, video_id, last_position_seconds, max_position_seconds, duration_seconds, is_completed, completed_at, last_watched_at
    INTO v_result;

    -- If this video is linked to a lesson, synchronize lesson_progress if completed
    IF v_video.lesson_id IS NOT NULL AND v_is_completed THEN
        INSERT INTO public.lesson_progress (
            student_id,
            lesson_id,
            is_completed,
            watch_seconds,
            last_accessed_at
        ) VALUES (
            v_caller_id,
            v_video.lesson_id,
            true,
            v_max_pos,
            now()
        )
        ON CONFLICT (student_id, lesson_id)
        DO UPDATE SET
            is_completed = true,
            watch_seconds = GREATEST(public.lesson_progress.watch_seconds, EXCLUDED.watch_seconds),
            last_accessed_at = now();
    END IF;

    RETURN jsonb_build_object(
        'id', v_result.id,
        'student_id', v_result.student_id,
        'video_id', v_result.video_id,
        'last_position_seconds', v_result.last_position_seconds,
        'max_position_seconds', v_result.max_position_seconds,
        'duration_seconds', v_result.duration_seconds,
        'is_completed', v_result.is_completed,
        'completed_at', v_result.completed_at,
        'last_watched_at', v_result.last_watched_at
    );
END;
$$;

ALTER FUNCTION public.record_video_progress(UUID, INT, INT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.record_video_progress(UUID, INT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_video_progress(UUID, INT, INT) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_video_progress(UUID, INT, INT) TO authenticated;

-- RPC 2: Publish video asset
CREATE OR REPLACE FUNCTION public.publish_video_asset(p_video_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
    v_result RECORD;
BEGIN
    IF NOT public.can_manage_video(p_video_id) THEN
        RAISE EXCEPTION 'Forbidden: You do not have permission to publish this video' USING ERRCODE = '42501';
    END IF;

    UPDATE public.video_assets
    SET status = 'published',
        published_at = COALESCE(published_at, now()),
        updated_at = now()
    WHERE id = p_video_id
    RETURNING * INTO v_result;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Video not found' USING ERRCODE = 'P0002';
    END IF;

    RETURN jsonb_build_object(
        'id', v_result.id,
        'status', v_result.status,
        'published_at', v_result.published_at,
        'title', v_result.title
    );
END;
$$;

ALTER FUNCTION public.publish_video_asset(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.publish_video_asset(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.publish_video_asset(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.publish_video_asset(UUID) TO authenticated;

-- RPC 3: Unpublish video asset
CREATE OR REPLACE FUNCTION public.unpublish_video_asset(p_video_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
    v_result RECORD;
BEGIN
    IF NOT public.can_manage_video(p_video_id) THEN
        RAISE EXCEPTION 'Forbidden: You do not have permission to unpublish this video' USING ERRCODE = '42501';
    END IF;

    UPDATE public.video_assets
    SET status = 'draft',
        updated_at = now()
    WHERE id = p_video_id
    RETURNING * INTO v_result;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Video not found' USING ERRCODE = 'P0002';
    END IF;

    RETURN jsonb_build_object(
        'id', v_result.id,
        'status', v_result.status,
        'title', v_result.title
    );
END;
$$;

ALTER FUNCTION public.unpublish_video_asset(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.unpublish_video_asset(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unpublish_video_asset(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.unpublish_video_asset(UUID) TO authenticated;

-- RPC 4: Soft-archive video asset
CREATE OR REPLACE FUNCTION public.archive_video_asset(p_video_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
    v_result RECORD;
BEGIN
    IF NOT public.can_manage_video(p_video_id) THEN
        RAISE EXCEPTION 'Forbidden: You do not have permission to archive this video' USING ERRCODE = '42501';
    END IF;

    UPDATE public.video_assets
    SET status = 'archived',
        archived_at = now(),
        updated_at = now()
    WHERE id = p_video_id
    RETURNING * INTO v_result;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Video not found' USING ERRCODE = 'P0002';
    END IF;

    RETURN jsonb_build_object(
        'id', v_result.id,
        'status', v_result.status,
        'archived_at', v_result.archived_at,
        'title', v_result.title
    );
END;
$$;

ALTER FUNCTION public.archive_video_asset(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.archive_video_asset(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_video_asset(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.archive_video_asset(UUID) TO authenticated;

-- RPC 5: Reorder course videos
CREATE OR REPLACE FUNCTION public.reorder_course_videos(
    p_course_id UUID,
    p_video_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
    v_caller_id UUID;
    v_count INT;
    v_i INT;
    v_vid UUID;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
    END IF;

    IF NOT public.can_manage_course(p_course_id) THEN
        RAISE EXCEPTION 'Forbidden: Not authorized to manage this course' USING ERRCODE = '42501';
    END IF;

    IF p_video_ids IS NULL OR array_length(p_video_ids, 1) = 0 THEN
        RETURN jsonb_build_object('success', true, 'updated_count', 0);
    END IF;

    FOR v_i IN 1 .. array_length(p_video_ids, 1) LOOP
        v_vid := p_video_ids[v_i];
        UPDATE public.video_assets
        SET order_index = v_i,
            updated_at = now()
        WHERE id = v_vid AND course_id = p_course_id;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'updated_count', array_length(p_video_ids, 1)
    );
END;
$$;

ALTER FUNCTION public.reorder_course_videos(UUID, UUID[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reorder_course_videos(UUID, UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reorder_course_videos(UUID, UUID[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.reorder_course_videos(UUID, UUID[]) TO authenticated;

-- RPC 6: Get Video Usage and Student Engagement Analytics
CREATE OR REPLACE FUNCTION public.get_video_stats(p_video_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
    v_total_views INT := 0;
    v_completed_count INT := 0;
    v_avg_seconds NUMERIC := 0;
    v_video RECORD;
    v_assigned_students INT := 0;
BEGIN
    IF NOT public.can_manage_video(p_video_id) THEN
        RAISE EXCEPTION 'Forbidden: Not authorized to view video statistics' USING ERRCODE = '42501';
    END IF;

    SELECT id, course_id, group_id, duration_seconds INTO v_video
    FROM public.video_assets
    WHERE id = p_video_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Video not found' USING ERRCODE = 'P0002';
    END IF;

    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE is_completed = true),
        COALESCE(AVG(max_position_seconds), 0)
    INTO v_total_views, v_completed_count, v_avg_seconds
    FROM public.video_progress
    WHERE video_id = p_video_id;

    -- Count total assigned students
    IF v_video.group_id IS NOT NULL THEN
        SELECT COUNT(DISTINCT gs.student_id) INTO v_assigned_students
        FROM public.group_students gs
        JOIN public.profiles p ON p.id = gs.student_id
        WHERE gs.group_id = v_video.group_id AND p.status = 'active';
    ELSIF v_video.course_id IS NOT NULL THEN
        SELECT COUNT(DISTINCT gs.student_id) INTO v_assigned_students
        FROM public.group_courses gc
        JOIN public.group_students gs ON gs.group_id = gc.group_id
        JOIN public.groups g ON g.id = gc.group_id
        JOIN public.profiles p ON p.id = gs.student_id
        WHERE gc.course_id = v_video.course_id
          AND g.is_active = true
          AND g.archived_at IS NULL
          AND p.status = 'active';
    ELSE
        SELECT COUNT(*) INTO v_assigned_students
        FROM public.profiles
        WHERE role = 'student' AND status = 'active';
    END IF;

    RETURN jsonb_build_object(
        'video_id', p_video_id,
        'total_views', v_total_views,
        'completed_count', v_completed_count,
        'completion_rate', CASE WHEN v_total_views > 0 THEN ROUND((v_completed_count::numeric / v_total_views::numeric) * 100, 1) ELSE 0 END,
        'avg_watched_seconds', ROUND(v_avg_seconds, 0),
        'assigned_students_count', v_assigned_students
    );
END;
$$;

ALTER FUNCTION public.get_video_stats(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_video_stats(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_video_stats(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_video_stats(UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 8. TABLE PRIVILEGES & ANON ISOLATION
-- ------------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_assets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_progress TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lesson_resources TO authenticated;

REVOKE ALL ON public.video_assets FROM anon;
REVOKE ALL ON public.video_progress FROM anon;
REVOKE ALL ON public.lesson_resources FROM anon;
