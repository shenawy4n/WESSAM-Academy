-- ==============================================================================
-- WESSAM Academy - Migration 20261113000017: Student-Teacher Private Messaging
--
-- Scope:
-- 1. Idempotency Index Compatibility: Ensure idx_notifications_idempotency_key
--    supports ON CONFLICT (idempotency_key) cleanly (compatible both standalone
--    on main and alongside 20261113000016).
-- 2. Normalized Messaging Schema:
--    - public.message_conversations
--    - public.messages
--    - public.message_attachments
-- 3. Private Storage Bucket ('message-attachments') & Path/Ownership RLS
-- 4. Relationship Authorization Helper (can_student_and_teacher_message)
-- 5. Server-Authoritative Messaging RPCs (list, start, send, read, unread count)
--    with atomic in-app notification creation inside the same transaction.
-- 6. Strict Least-Privilege RLS Policies & Realtime Publication Setup
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. NOTIFICATION IDEMPOTENCY INDEX COMPATIBILITY GUARD
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_has_predicate BOOLEAN := false;
    v_duplicate_count INT := 0;
BEGIN
    SELECT (ix.indpred IS NOT NULL)
    INTO v_has_predicate
    FROM pg_class t
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_index ix ON ix.indrelid = t.oid
    JOIN pg_class i ON i.oid = ix.indexrelid
    WHERE n.nspname = 'public'
      AND t.relname = 'notifications'
      AND i.relname = 'idx_notifications_idempotency_key';

    IF COALESCE(v_has_predicate, false) THEN
        SELECT COUNT(*)::INT INTO v_duplicate_count
        FROM (
            SELECT idempotency_key
            FROM public.notifications
            WHERE idempotency_key IS NOT NULL
            GROUP BY idempotency_key
            HAVING COUNT(*) > 1
        ) duplicates;

        IF v_duplicate_count > 0 THEN
            RAISE EXCEPTION
                'Cannot normalize idx_notifications_idempotency_key: found % duplicate non-NULL idempotency_key group(s)',
                v_duplicate_count;
        END IF;

        DROP INDEX IF EXISTS public.idx_notifications_idempotency_key;
        CREATE UNIQUE INDEX idx_notifications_idempotency_key
            ON public.notifications (idempotency_key);
    ELSIF NOT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'notifications'
          AND indexname = 'idx_notifications_idempotency_key'
    ) THEN
        CREATE UNIQUE INDEX idx_notifications_idempotency_key
            ON public.notifications (idempotency_key);
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. AUTHORIZATION HELPER: VERIFY DIRECT MESSAGING RELATIONSHIP
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

    -- Teacher must be authorized for this student via an active group/course/live_session/quiz
    IF public.is_teacher_authorized_for_student(p_teacher_id, p_student_id) THEN
        RETURN true;
    END IF;

    -- Also check student's primary academic profile group if not mirrored in group_students
    IF EXISTS (
        SELECT 1
        FROM public.student_academic_profiles sap
        WHERE sap.profile_id = p_student_id
          AND sap.group_id IS NOT NULL
          AND public.is_teacher_authorized_for_group(p_teacher_id, sap.group_id)
    ) THEN
        RETURN true;
    END IF;

    -- Also check direct or group assignments created by this teacher for this student
    IF EXISTS (
        SELECT 1
        FROM public.assignments a
        WHERE a.teacher_id = p_teacher_id
          AND (
              (
                  a.target_group_id IS NOT NULL
                  AND EXISTS (
                      SELECT 1
                      FROM public.group_students gs
                      WHERE gs.group_id = a.target_group_id
                        AND gs.student_id = p_student_id
                  )
              )
              OR EXISTS (
                  SELECT 1
                  FROM public.assignment_targets at
                  WHERE at.assignment_id = a.id
                    AND (
                        (at.target_type = 'student' AND at.student_id = p_student_id)
                        OR (
                            at.target_type = 'group'
                            AND EXISTS (
                                SELECT 1
                                FROM public.group_students gs
                                WHERE gs.group_id = at.group_id
                                  AND gs.student_id = p_student_id
                            )
                        )
                    )
              )
          )
    ) THEN
        RETURN true;
    END IF;

    RETURN false;
END;
$$;

ALTER FUNCTION public.can_student_and_teacher_message(UUID, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.can_student_and_teacher_message(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_student_and_teacher_message(UUID, UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 3. NORMALIZED MESSAGING TABLES
-- ------------------------------------------------------------------------------

-- 3.1 Conversations between a single student and an authorized teacher
CREATE TABLE IF NOT EXISTS public.message_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL,
    course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
    last_message_id UUID,
    last_message_at TIMESTAMPTZ,
    last_message_preview TEXT,
    last_sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_message_conversations_pair UNIQUE (student_id, teacher_id),
    CONSTRAINT chk_message_conversations_distinct_users CHECK (student_id <> teacher_id)
);

CREATE INDEX IF NOT EXISTS idx_message_conversations_student
    ON public.message_conversations (student_id, last_message_at DESC NULLS LAST, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_conversations_teacher
    ON public.message_conversations (teacher_id, last_message_at DESC NULLS LAST, updated_at DESC);

-- 3.2 Direct messages
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.message_conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    body TEXT,
    has_attachments BOOLEAN NOT NULL DEFAULT false,
    client_message_id UUID,
    is_read BOOLEAN NOT NULL DEFAULT false,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_messages_distinct_parties CHECK (sender_id <> recipient_id),
    CONSTRAINT chk_messages_content_present CHECK (
        has_attachments = true OR (body IS NOT NULL AND length(btrim(body)) > 0)
    ),
    CONSTRAINT chk_messages_body_length CHECK (body IS NULL OR length(body) <= 5000)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_sender_client_id
    ON public.messages (sender_id, client_message_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
    ON public.messages (conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_messages_recipient_unread
    ON public.messages (recipient_id, is_read, created_at DESC);

-- 3.3 Message attachments metadata linked to private Supabase Storage
CREATE TABLE IF NOT EXISTS public.message_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES public.message_conversations(id) ON DELETE CASCADE,
    uploader_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    storage_bucket TEXT NOT NULL DEFAULT 'message-attachments'
        CHECK (storage_bucket = 'message-attachments'),
    storage_path TEXT NOT NULL,
    file_name TEXT NOT NULL CHECK (length(btrim(file_name)) > 0 AND length(file_name) <= 255),
    file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes > 0 AND file_size_bytes <= 10485760),
    mime_type TEXT NOT NULL CHECK (
        mime_type IN (
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
        )
    ),
    file_extension TEXT NOT NULL CHECK (
        file_extension IN (
            'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
            'zip', 'jpg', 'jpeg', 'png', 'webp', 'mp3', 'wav', 'm4a', 'txt'
        )
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_message_attachments_safe_path CHECK (
        storage_path NOT LIKE '%..%'
        AND storage_path NOT LIKE '/%'
        AND storage_path LIKE (conversation_id::text || '/' || uploader_id::text || '/%')
    )
);

CREATE INDEX IF NOT EXISTS idx_message_attachments_message_id
    ON public.message_attachments (message_id);
CREATE INDEX IF NOT EXISTS idx_message_attachments_conversation_id
    ON public.message_attachments (conversation_id);

-- ------------------------------------------------------------------------------
-- 4. PRIVATE STORAGE BUCKET & OBJECT RLS: 'message-attachments'
-- ------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'message-attachments',
    'message-attachments',
    false,
    10485760, -- 10 MB max per attachment
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

-- Helper: Validate whether auth.uid() can access or upload in a message storage path
-- Expected path format: <conversation_uuid>/<uploader_uuid>/<filename>
CREATE OR REPLACE FUNCTION public.can_access_message_storage_object(
    p_object_name TEXT,
    p_require_uploader_match BOOLEAN DEFAULT false
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
    v_caller_id UUID;
    v_parts TEXT[];
    v_conv_id UUID;
    v_uploader_id UUID;
    v_conv RECORD;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL OR p_object_name IS NULL THEN
        RETURN false;
    END IF;

    -- Prevent path traversal or malformed keys
    IF p_object_name LIKE '%..%' OR p_object_name LIKE '/%' THEN
        RETURN false;
    END IF;

    v_parts := string_to_array(p_object_name, '/');
    IF array_length(v_parts, 1) IS NULL OR array_length(v_parts, 1) < 3 THEN
        RETURN false;
    END IF;

    BEGIN
        v_conv_id := v_parts[1]::UUID;
        v_uploader_id := v_parts[2]::UUID;
    EXCEPTION WHEN OTHERS THEN
        RETURN false;
    END;

    IF v_parts[3] IS NULL OR btrim(v_parts[3]) = '' THEN
        RETURN false;
    END IF;

    IF p_require_uploader_match AND v_uploader_id <> v_caller_id THEN
        RETURN false;
    END IF;

    SELECT id, student_id, teacher_id
    INTO v_conv
    FROM public.message_conversations
    WHERE id = v_conv_id;

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    IF p_require_uploader_match THEN
        IF v_caller_id <> v_conv.student_id AND v_caller_id <> v_conv.teacher_id THEN
            RETURN false;
        END IF;
        RETURN public.can_student_and_teacher_message(v_conv.student_id, v_conv.teacher_id);
    END IF;

    -- Read access: participant in active relationship, or active Super Admin audit access
    IF public.is_super_admin() THEN
        RETURN true;
    END IF;

    IF v_caller_id <> v_conv.student_id AND v_caller_id <> v_conv.teacher_id THEN
        RETURN false;
    END IF;

    RETURN public.can_student_and_teacher_message(v_conv.student_id, v_conv.teacher_id);
END;
$$;

ALTER FUNCTION public.can_access_message_storage_object(TEXT, BOOLEAN) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.can_access_message_storage_object(TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_message_storage_object(TEXT, BOOLEAN) TO authenticated;

DROP POLICY IF EXISTS "Message participants upload own attachments" ON storage.objects;
DROP POLICY IF EXISTS "Message participants read conversation attachments" ON storage.objects;
DROP POLICY IF EXISTS "Message uploaders delete uncommitted attachments" ON storage.objects;

CREATE POLICY "Message participants upload own attachments" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'message-attachments'
        AND public.can_access_message_storage_object(name, true)
    );

CREATE POLICY "Message participants read conversation attachments" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'message-attachments'
        AND public.can_access_message_storage_object(name, false)
    );

-- Allow cleanup of uncommitted uploads by the original uploader if message persistence fails
CREATE POLICY "Message uploaders delete uncommitted attachments" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'message-attachments'
        AND (
            public.is_super_admin()
            OR (
                public.can_access_message_storage_object(name, true)
                AND NOT EXISTS (
                    SELECT 1
                    FROM public.message_attachments ma
                    WHERE ma.storage_bucket = 'message-attachments'
                      AND ma.storage_path = name
                )
            )
        )
    );

-- ------------------------------------------------------------------------------
-- 5. TABLE RLS POLICIES & LEAST-PRIVILEGE GRANTS
-- ------------------------------------------------------------------------------
ALTER TABLE public.message_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants and super admin view conversations" ON public.message_conversations;
DROP POLICY IF EXISTS "Authorized participants create conversations" ON public.message_conversations;
CREATE POLICY "Participants and super admin view conversations" ON public.message_conversations
    FOR SELECT TO authenticated
    USING (
        public.is_super_admin()
        OR (
            (
                (student_id = auth.uid() AND public.is_active_student())
                OR (teacher_id = auth.uid() AND public.is_teacher())
            )
            AND public.can_student_and_teacher_message(student_id, teacher_id)
        )
    );

CREATE POLICY "Authorized participants create conversations" ON public.message_conversations
    FOR INSERT TO authenticated
    WITH CHECK (
        (
            (student_id = auth.uid() AND public.is_active_student())
            OR (teacher_id = auth.uid() AND public.is_teacher())
        )
        AND public.can_student_and_teacher_message(student_id, teacher_id)
    );

DROP POLICY IF EXISTS "Participants and super admin view messages" ON public.messages;
DROP POLICY IF EXISTS "Participants insert own messages" ON public.messages;
DROP POLICY IF EXISTS "Recipients mark own messages read" ON public.messages;

CREATE POLICY "Participants and super admin view messages" ON public.messages
    FOR SELECT TO authenticated
    USING (
        public.is_super_admin()
        OR (
            (public.is_active_student() OR public.is_teacher())
            AND (sender_id = auth.uid() OR recipient_id = auth.uid())
            AND EXISTS (
                SELECT 1
                FROM public.message_conversations mc
                WHERE mc.id = messages.conversation_id
                  AND (mc.student_id = auth.uid() OR mc.teacher_id = auth.uid())
                  AND public.can_student_and_teacher_message(mc.student_id, mc.teacher_id)
            )
        )
    );

CREATE POLICY "Participants insert own messages" ON public.messages
    FOR INSERT TO authenticated
    WITH CHECK (
        sender_id = auth.uid()
        AND sender_id <> recipient_id
        AND (public.is_active_student() OR public.is_teacher())
        AND EXISTS (
            SELECT 1
            FROM public.message_conversations mc
            WHERE mc.id = messages.conversation_id
              AND (
                  (mc.student_id = auth.uid() AND mc.teacher_id = messages.recipient_id)
                  OR (mc.teacher_id = auth.uid() AND mc.student_id = messages.recipient_id)
              )
              AND public.can_student_and_teacher_message(mc.student_id, mc.teacher_id)
        )
    );

CREATE POLICY "Recipients mark own messages read" ON public.messages
    FOR UPDATE TO authenticated
    USING (
        recipient_id = auth.uid()
        AND (public.is_active_student() OR public.is_teacher())
    )
    WITH CHECK (
        recipient_id = auth.uid()
        AND (public.is_active_student() OR public.is_teacher())
    );

DROP POLICY IF EXISTS "Participants and super admin view attachments" ON public.message_attachments;
DROP POLICY IF EXISTS "Senders insert own message attachments" ON public.message_attachments;

CREATE POLICY "Participants and super admin view attachments" ON public.message_attachments
    FOR SELECT TO authenticated
    USING (
        public.is_super_admin()
        OR (
            (public.is_active_student() OR public.is_teacher())
            AND EXISTS (
                SELECT 1
                FROM public.message_conversations mc
                WHERE mc.id = message_attachments.conversation_id
                  AND (mc.student_id = auth.uid() OR mc.teacher_id = auth.uid())
                  AND public.can_student_and_teacher_message(mc.student_id, mc.teacher_id)
            )
        )
    );

CREATE POLICY "Senders insert own message attachments" ON public.message_attachments
    FOR INSERT TO authenticated
    WITH CHECK (
        uploader_id = auth.uid()
        AND EXISTS (
            SELECT 1
            FROM public.messages m
            JOIN public.message_conversations mc ON mc.id = m.conversation_id
            WHERE m.id = message_attachments.message_id
              AND m.conversation_id = message_attachments.conversation_id
              AND m.sender_id = auth.uid()
              AND (mc.student_id = auth.uid() OR mc.teacher_id = auth.uid())
              AND public.can_student_and_teacher_message(mc.student_id, mc.teacher_id)
        )
    );

REVOKE ALL ON public.message_conversations FROM PUBLIC, anon;
REVOKE ALL ON public.messages FROM PUBLIC, anon;
REVOKE ALL ON public.message_attachments FROM PUBLIC, anon;

GRANT SELECT, INSERT ON public.message_conversations TO authenticated;
GRANT SELECT, INSERT ON public.messages TO authenticated;
GRANT UPDATE (is_read, read_at) ON public.messages TO authenticated;
GRANT SELECT, INSERT ON public.message_attachments TO authenticated;

-- ------------------------------------------------------------------------------
-- 6. SERVER-AUTHORITATIVE MESSAGING RPCs
-- ------------------------------------------------------------------------------

-- 6.1 List teachers a student is authorized to message
CREATE OR REPLACE FUNCTION public.get_authorized_messaging_teachers()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
    v_caller_id UUID;
    v_results JSONB;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Not authenticated' USING ERRCODE = '42501';
    END IF;

    IF NOT public.is_active_student() THEN
        RAISE EXCEPTION 'Forbidden: Only active students can list authorized teachers' USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(jsonb_agg(row_data ORDER BY teacher_name ASC), '[]'::jsonb)
    INTO v_results
    FROM (
        SELECT
            COALESCE(p.full_name_arabic, p.full_name) AS teacher_name,
            jsonb_build_object(
                'teacher_id', p.id,
                'full_name', p.full_name,
                'full_name_arabic', COALESCE(p.full_name_arabic, p.full_name),
                'role', p.role::text,
                'group_id', ctx.group_id,
                'group_name', ctx.group_name,
                'group_name_arabic', ctx.group_name_arabic,
                'course_id', ctx.course_id,
                'course_title', ctx.course_title,
                'course_title_arabic', ctx.course_title_arabic,
                'conversation_id', mc.id
            ) AS row_data
        FROM public.profiles p
        LEFT JOIN public.message_conversations mc
            ON mc.student_id = v_caller_id AND mc.teacher_id = p.id
        LEFT JOIN LATERAL (
            SELECT
                g.id AS group_id,
                g.name AS group_name,
                g.name_arabic AS group_name_arabic,
                c.id AS course_id,
                c.title AS course_title,
                c.title_arabic AS course_title_arabic
            FROM public.group_students gs
            JOIN public.groups g ON g.id = gs.group_id
            LEFT JOIN public.group_courses gc ON gc.group_id = g.id
            LEFT JOIN public.courses c ON c.id = gc.course_id AND c.teacher_id = p.id
            WHERE gs.student_id = v_caller_id
              AND (c.id IS NOT NULL OR p.role = 'super_admin' OR public.is_teacher_authorized_for_group(p.id, g.id))
            ORDER BY (c.id IS NOT NULL) DESC, gs.joined_at DESC
            LIMIT 1
        ) ctx ON true
        WHERE p.role IN ('teacher', 'super_admin')
          AND p.status = 'active'
          AND p.id <> v_caller_id
          AND public.can_student_and_teacher_message(v_caller_id, p.id)
    ) sub;

    RETURN v_results;
END;
$$;

ALTER FUNCTION public.get_authorized_messaging_teachers() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_authorized_messaging_teachers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_authorized_messaging_teachers() TO authenticated;

-- 6.2 Get or create a direct conversation between an authorized student and teacher
CREATE OR REPLACE FUNCTION public.get_or_create_student_teacher_conversation(
    p_teacher_id UUID DEFAULT NULL,
    p_student_id UUID DEFAULT NULL
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
    v_student_id UUID;
    v_teacher_id UUID;
    v_group_id UUID;
    v_course_id UUID;
    v_conv_id UUID;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Not authenticated' USING ERRCODE = '42501';
    END IF;

    SELECT role::text
    INTO v_caller_role
    FROM public.profiles
    WHERE id = v_caller_id
      AND status = 'active';

    IF v_caller_role IS NULL THEN
        RAISE EXCEPTION 'Forbidden: Active profile required' USING ERRCODE = '42501';
    END IF;

    IF v_caller_role = 'student' THEN
        IF p_teacher_id IS NULL THEN
            RAISE EXCEPTION 'Teacher ID is required' USING ERRCODE = '22000';
        END IF;
        v_student_id := v_caller_id;
        v_teacher_id := p_teacher_id;
    ELSIF v_caller_role IN ('teacher', 'super_admin') THEN
        IF p_student_id IS NULL THEN
            RAISE EXCEPTION 'Student ID is required' USING ERRCODE = '22000';
        END IF;
        v_teacher_id := v_caller_id;
        v_student_id := p_student_id;
    ELSE
        RAISE EXCEPTION 'Forbidden: Invalid role for messaging' USING ERRCODE = '42501';
    END IF;

    IF NOT public.can_student_and_teacher_message(v_student_id, v_teacher_id) THEN
        RAISE EXCEPTION 'Forbidden: You are not authorized to message this user' USING ERRCODE = '42501';
    END IF;

    -- Resolve academic context (group & course)
    SELECT g.id, c.id
    INTO v_group_id, v_course_id
    FROM public.group_students gs
    JOIN public.groups g ON g.id = gs.group_id
    LEFT JOIN public.group_courses gc ON gc.group_id = g.id
    LEFT JOIN public.courses c ON c.id = gc.course_id AND c.teacher_id = v_teacher_id
    WHERE gs.student_id = v_student_id
    ORDER BY (c.id IS NOT NULL) DESC, gs.joined_at DESC
    LIMIT 1;

    IF v_group_id IS NULL THEN
        SELECT sap.group_id
        INTO v_group_id
        FROM public.student_academic_profiles sap
        WHERE sap.profile_id = v_student_id;
    END IF;

    INSERT INTO public.message_conversations (
        student_id,
        teacher_id,
        group_id,
        course_id,
        created_at,
        updated_at
    ) VALUES (
        v_student_id,
        v_teacher_id,
        v_group_id,
        v_course_id,
        now(),
        now()
    )
    ON CONFLICT (student_id, teacher_id) DO UPDATE SET
        group_id = COALESCE(public.message_conversations.group_id, EXCLUDED.group_id),
        course_id = COALESCE(public.message_conversations.course_id, EXCLUDED.course_id),
        updated_at = now()
    RETURNING id INTO v_conv_id;

    RETURN (
        SELECT jsonb_build_object(
            'id', mc.id,
            'student_id', mc.student_id,
            'teacher_id', mc.teacher_id,
            'group_id', mc.group_id,
            'course_id', mc.course_id,
            'last_message_at', mc.last_message_at,
            'last_message_preview', mc.last_message_preview,
            'last_sender_id', mc.last_sender_id,
            'created_at', mc.created_at,
            'updated_at', mc.updated_at,
            'student_name', sp.full_name,
            'student_name_arabic', COALESCE(sp.full_name_arabic, sp.full_name),
            'teacher_name', tp.full_name,
            'teacher_name_arabic', COALESCE(tp.full_name_arabic, tp.full_name),
            'group_name', g.name,
            'group_name_arabic', g.name_arabic,
            'course_title', c.title,
            'course_title_arabic', c.title_arabic,
            'unread_count', (
                SELECT count(*)::int
                FROM public.messages m
                WHERE m.conversation_id = mc.id
                  AND m.recipient_id = v_caller_id
                  AND m.is_read = false
            )
        )
        FROM public.message_conversations mc
        JOIN public.profiles sp ON sp.id = mc.student_id
        JOIN public.profiles tp ON tp.id = mc.teacher_id
        LEFT JOIN public.groups g ON g.id = mc.group_id
        LEFT JOIN public.courses c ON c.id = mc.course_id
        WHERE mc.id = v_conv_id
    );
END;
$$;

ALTER FUNCTION public.get_or_create_student_teacher_conversation(UUID, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_or_create_student_teacher_conversation(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_student_teacher_conversation(UUID, UUID) TO authenticated;

-- 6.3 List current user's conversations with metadata and unread counts
CREATE OR REPLACE FUNCTION public.get_my_message_conversations()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
    v_caller_id UUID;
    v_results JSONB;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Not authenticated' USING ERRCODE = '42501';
    END IF;

    IF NOT (public.is_active_student() OR public.is_teacher() OR public.is_super_admin()) THEN
        RAISE EXCEPTION 'Forbidden: Active account required' USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(jsonb_agg(row_data ORDER BY sort_ts DESC), '[]'::jsonb)
    INTO v_results
    FROM (
        SELECT
            COALESCE(mc.last_message_at, mc.updated_at, mc.created_at) AS sort_ts,
            jsonb_build_object(
                'id', mc.id,
                'student_id', mc.student_id,
                'teacher_id', mc.teacher_id,
                'group_id', mc.group_id,
                'course_id', mc.course_id,
                'last_message_at', mc.last_message_at,
                'last_message_preview', mc.last_message_preview,
                'last_sender_id', mc.last_sender_id,
                'created_at', mc.created_at,
                'updated_at', mc.updated_at,
                'student_name', sp.full_name,
                'student_name_arabic', COALESCE(sp.full_name_arabic, sp.full_name),
                'teacher_name', tp.full_name,
                'teacher_name_arabic', COALESCE(tp.full_name_arabic, tp.full_name),
                'group_name', g.name,
                'group_name_arabic', g.name_arabic,
                'course_title', c.title,
                'course_title_arabic', c.title_arabic,
                'unread_count', (
                    SELECT count(*)::int
                    FROM public.messages m
                    WHERE m.conversation_id = mc.id
                      AND m.recipient_id = v_caller_id
                      AND m.is_read = false
                )
            ) AS row_data
        FROM public.message_conversations mc
        JOIN public.profiles sp ON sp.id = mc.student_id
        JOIN public.profiles tp ON tp.id = mc.teacher_id
        LEFT JOIN public.groups g ON g.id = mc.group_id
        LEFT JOIN public.courses c ON c.id = mc.course_id
        WHERE (mc.student_id = v_caller_id OR mc.teacher_id = v_caller_id)
          AND public.can_student_and_teacher_message(mc.student_id, mc.teacher_id)
    ) sub;

    RETURN v_results;
END;
$$;

ALTER FUNCTION public.get_my_message_conversations() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_my_message_conversations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_message_conversations() TO authenticated;

-- 6.4 Fetch messages & attachments for an authorized conversation
CREATE OR REPLACE FUNCTION public.get_conversation_messages(
    p_conversation_id UUID,
    p_limit INT DEFAULT 100,
    p_offset INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
    v_caller_id UUID;
    v_conv RECORD;
    v_results JSONB;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Not authenticated' USING ERRCODE = '42501';
    END IF;

    SELECT *
    INTO v_conv
    FROM public.message_conversations
    WHERE id = p_conversation_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Conversation not found' USING ERRCODE = 'P0002';
    END IF;

    IF NOT public.is_super_admin() THEN
        IF v_caller_id <> v_conv.student_id AND v_caller_id <> v_conv.teacher_id THEN
            RAISE EXCEPTION 'Forbidden: You are not a participant in this conversation' USING ERRCODE = '42501';
        END IF;

        IF NOT public.can_student_and_teacher_message(v_conv.student_id, v_conv.teacher_id) THEN
            RAISE EXCEPTION 'Forbidden: Messaging relationship is no longer authorized' USING ERRCODE = '42501';
        END IF;
    END IF;

    SELECT COALESCE(jsonb_agg(row_data ORDER BY msg_created_at ASC), '[]'::jsonb)
    INTO v_results
    FROM (
        SELECT
            m.created_at AS msg_created_at,
            jsonb_build_object(
                'id', m.id,
                'conversation_id', m.conversation_id,
                'sender_id', m.sender_id,
                'recipient_id', m.recipient_id,
                'body', m.body,
                'has_attachments', m.has_attachments,
                'client_message_id', m.client_message_id,
                'is_read', m.is_read,
                'read_at', m.read_at,
                'created_at', m.created_at,
                'sender_name', sp.full_name,
                'sender_name_arabic', COALESCE(sp.full_name_arabic, sp.full_name),
                'attachments', COALESCE(
                    (
                        SELECT jsonb_agg(
                            jsonb_build_object(
                                'id', ma.id,
                                'message_id', ma.message_id,
                                'conversation_id', ma.conversation_id,
                                'uploader_id', ma.uploader_id,
                                'storage_bucket', ma.storage_bucket,
                                'storage_path', ma.storage_path,
                                'file_name', ma.file_name,
                                'file_size_bytes', ma.file_size_bytes,
                                'mime_type', ma.mime_type,
                                'file_extension', ma.file_extension,
                                'created_at', ma.created_at
                            )
                            ORDER BY ma.created_at ASC
                        )
                        FROM public.message_attachments ma
                        WHERE ma.message_id = m.id
                    ),
                    '[]'::jsonb
                )
            ) AS row_data
        FROM public.messages m
        JOIN public.profiles sp ON sp.id = m.sender_id
        WHERE m.conversation_id = p_conversation_id
        ORDER BY m.created_at DESC
        LIMIT LEAST(GREATEST(p_limit, 1), 200)
        OFFSET GREATEST(p_offset, 0)
    ) sub;

    RETURN v_results;
END;
$$;

ALTER FUNCTION public.get_conversation_messages(UUID, INT, INT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_conversation_messages(UUID, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_conversation_messages(UUID, INT, INT) TO authenticated;

-- 6.5 Send a direct message (text and/or attachments) + atomic in-app notification
CREATE OR REPLACE FUNCTION public.send_direct_message(
    p_conversation_id UUID,
    p_body TEXT DEFAULT NULL,
    p_attachments JSONB DEFAULT '[]'::jsonb,
    p_client_message_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
    v_caller_id UUID;
    v_conv RECORD;
    v_recipient_id UUID;
    v_sender_profile RECORD;
    v_clean_body TEXT;
    v_attachments_count INT := 0;
    v_has_attachments BOOLEAN := false;
    v_existing_message_id UUID;
    v_message_id UUID;
    v_att JSONB;
    v_att_path TEXT;
    v_att_name TEXT;
    v_att_size BIGINT;
    v_att_mime TEXT;
    v_att_ext TEXT;
    v_expected_prefix TEXT;
    v_preview TEXT;
    v_notif_id UUID;
    v_notif_category TEXT;
    v_notif_type TEXT;
    v_notif_title_en TEXT;
    v_notif_title_ar TEXT;
    v_notif_body_en TEXT;
    v_notif_body_ar TEXT;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Not authenticated' USING ERRCODE = '42501';
    END IF;

    SELECT *
    INTO v_conv
    FROM public.message_conversations
    WHERE id = p_conversation_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Conversation not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_caller_id <> v_conv.student_id AND v_caller_id <> v_conv.teacher_id THEN
        RAISE EXCEPTION 'Forbidden: Only conversation participants can send messages' USING ERRCODE = '42501';
    END IF;

    IF NOT public.can_student_and_teacher_message(v_conv.student_id, v_conv.teacher_id) THEN
        RAISE EXCEPTION 'Forbidden: Messaging relationship is not authorized' USING ERRCODE = '42501';
    END IF;

    v_recipient_id := CASE
        WHEN v_caller_id = v_conv.student_id THEN v_conv.teacher_id
        ELSE v_conv.student_id
    END;

    SELECT id, role::text, full_name, full_name_arabic, status
    INTO v_sender_profile
    FROM public.profiles
    WHERE id = v_caller_id;

    IF v_sender_profile.status <> 'active' THEN
        RAISE EXCEPTION 'Forbidden: Inactive accounts cannot send messages' USING ERRCODE = '42501';
    END IF;

    -- Idempotent duplicate protection via client_message_id
    IF p_client_message_id IS NOT NULL THEN
        SELECT id
        INTO v_existing_message_id
        FROM public.messages
        WHERE sender_id = v_caller_id
          AND client_message_id = p_client_message_id
          AND conversation_id = p_conversation_id;

        IF v_existing_message_id IS NOT NULL THEN
            RETURN (
                SELECT jsonb_build_object(
                    'id', m.id,
                    'conversation_id', m.conversation_id,
                    'sender_id', m.sender_id,
                    'recipient_id', m.recipient_id,
                    'body', m.body,
                    'has_attachments', m.has_attachments,
                    'client_message_id', m.client_message_id,
                    'is_read', m.is_read,
                    'read_at', m.read_at,
                    'created_at', m.created_at,
                    'sender_name', v_sender_profile.full_name,
                    'sender_name_arabic', COALESCE(v_sender_profile.full_name_arabic, v_sender_profile.full_name),
                    'attachments', COALESCE(
                        (
                            SELECT jsonb_agg(
                                jsonb_build_object(
                                    'id', ma.id,
                                    'message_id', ma.message_id,
                                    'conversation_id', ma.conversation_id,
                                    'uploader_id', ma.uploader_id,
                                    'storage_bucket', ma.storage_bucket,
                                    'storage_path', ma.storage_path,
                                    'file_name', ma.file_name,
                                    'file_size_bytes', ma.file_size_bytes,
                                    'mime_type', ma.mime_type,
                                    'file_extension', ma.file_extension,
                                    'created_at', ma.created_at
                                )
                                ORDER BY ma.created_at ASC
                            )
                            FROM public.message_attachments ma
                            WHERE ma.message_id = m.id
                        ),
                        '[]'::jsonb
                    ),
                    'deduplicated', true
                )
                FROM public.messages m
                WHERE m.id = v_existing_message_id
            );
        END IF;
    END IF;

    -- Normalize body & validate attachment payload
    v_clean_body := NULLIF(btrim(COALESCE(p_body, '')), '');
    IF v_clean_body IS NOT NULL AND length(v_clean_body) > 5000 THEN
        RAISE EXCEPTION 'Message body exceeds maximum length of 5000 characters' USING ERRCODE = '22000';
    END IF;

    IF p_attachments IS NOT NULL AND jsonb_typeof(p_attachments) <> 'array' THEN
        RAISE EXCEPTION 'Attachments payload must be a JSON array' USING ERRCODE = '22000';
    END IF;

    v_attachments_count := COALESCE(jsonb_array_length(p_attachments), 0);
    IF v_attachments_count > 5 THEN
        RAISE EXCEPTION 'Maximum 5 attachments allowed per message' USING ERRCODE = '22000';
    END IF;

    v_has_attachments := v_attachments_count > 0;
    IF v_clean_body IS NULL AND NOT v_has_attachments THEN
        RAISE EXCEPTION 'Message cannot be empty: provide text or at least one valid attachment' USING ERRCODE = '22000';
    END IF;

    INSERT INTO public.messages (
        conversation_id,
        sender_id,
        recipient_id,
        body,
        has_attachments,
        client_message_id,
        is_read,
        created_at
    ) VALUES (
        p_conversation_id,
        v_caller_id,
        v_recipient_id,
        v_clean_body,
        v_has_attachments,
        p_client_message_id,
        false,
        now()
    )
    RETURNING id INTO v_message_id;

    -- Validate and persist every attachment metadata row
    IF v_has_attachments THEN
        v_expected_prefix := p_conversation_id::text || '/' || v_caller_id::text || '/';

        FOR v_att IN SELECT value FROM jsonb_array_elements(p_attachments)
        LOOP
            v_att_path := btrim(COALESCE(v_att->>'storage_path', ''));
            v_att_name := btrim(COALESCE(v_att->>'file_name', ''));
            v_att_size := COALESCE((v_att->>'file_size_bytes')::BIGINT, 0);
            v_att_mime := lower(btrim(COALESCE(v_att->>'mime_type', '')));
            v_att_ext := lower(btrim(COALESCE(v_att->>'file_extension', '')));

            IF v_att_path = '' OR v_att_path LIKE '%..%' OR v_att_path LIKE '/%' OR left(v_att_path, length(v_expected_prefix)) <> v_expected_prefix THEN
                RAISE EXCEPTION 'Forbidden: Invalid attachment storage path' USING ERRCODE = '42501';
            END IF;

            IF v_att_name = '' OR length(v_att_name) > 255 THEN
                RAISE EXCEPTION 'Invalid attachment file name' USING ERRCODE = '22000';
            END IF;

            IF v_att_size <= 0 OR v_att_size > 10485760 THEN
                RAISE EXCEPTION 'Attachment exceeds maximum allowed size of 10 MB' USING ERRCODE = '22000';
            END IF;

            IF v_att_ext NOT IN ('pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'jpg', 'jpeg', 'png', 'webp', 'mp3', 'wav', 'm4a', 'txt') THEN
                RAISE EXCEPTION 'Unsupported or dangerous file extension: %', v_att_ext USING ERRCODE = '22000';
            END IF;

            IF v_att_mime NOT IN (
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
            ) THEN
                RAISE EXCEPTION 'Unsupported or dangerous MIME type: %', v_att_mime USING ERRCODE = '22000';
            END IF;

            INSERT INTO public.message_attachments (
                message_id,
                conversation_id,
                uploader_id,
                storage_bucket,
                storage_path,
                file_name,
                file_size_bytes,
                mime_type,
                file_extension
            ) VALUES (
                v_message_id,
                p_conversation_id,
                v_caller_id,
                'message-attachments',
                v_att_path,
                v_att_name,
                v_att_size,
                v_att_mime,
                v_att_ext
            );
        END LOOP;
    END IF;

    v_preview := COALESCE(
        left(v_clean_body, 140),
        CASE WHEN v_attachments_count > 0 THEN 'مرفق (' || v_attachments_count || ')' ELSE '' END
    );

    UPDATE public.message_conversations
    SET last_message_id = v_message_id,
        last_message_at = now(),
        last_message_preview = v_preview,
        last_sender_id = v_caller_id,
        updated_at = now()
    WHERE id = p_conversation_id;

    -- Create in-app notification atomically in the same transaction
    IF v_caller_id = v_conv.student_id THEN
        v_notif_category := 'student_message';
        v_notif_type := 'student_message';
        v_notif_title_en := 'New message from student: ' || COALESCE(v_sender_profile.full_name, 'Student');
        v_notif_title_ar := 'رسالة جديدة من الطالب: ' || COALESCE(v_sender_profile.full_name_arabic, v_sender_profile.full_name, 'طالب');
    ELSE
        v_notif_category := 'teacher_message';
        v_notif_type := 'teacher_message';
        v_notif_title_en := 'New message from teacher: ' || COALESCE(v_sender_profile.full_name, 'Teacher');
        v_notif_title_ar := 'رسالة جديدة من المعلم: ' || COALESCE(v_sender_profile.full_name_arabic, v_sender_profile.full_name, 'المعلم');
    END IF;

    v_notif_body_en := COALESCE(
        left(v_clean_body, 160),
        'Sent ' || v_attachments_count || ' attachment(s).'
    );
    v_notif_body_ar := COALESCE(
        left(v_clean_body, 160),
        'أرسل ' || v_attachments_count || ' مرفق.'
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
        v_notif_title_en,
        v_notif_title_ar,
        v_notif_body_en,
        v_notif_body_ar,
        v_notif_type,
        v_notif_category,
        'normal',
        v_caller_id,
        '/messages/' || p_conversation_id::text,
        p_conversation_id::text,
        'msg_' || v_message_id::text,
        now()
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO v_notif_id;

    IF v_notif_id IS NOT NULL THEN
        INSERT INTO public.notification_recipients (
            notification_id,
            recipient_id,
            is_read,
            created_at
        )
        SELECT v_notif_id, p.id, false, now()
        FROM public.profiles p
        WHERE p.id = v_recipient_id
          AND p.status = 'active'
        ON CONFLICT (notification_id, recipient_id) DO NOTHING;
    END IF;

    RETURN (
        SELECT jsonb_build_object(
            'id', m.id,
            'conversation_id', m.conversation_id,
            'sender_id', m.sender_id,
            'recipient_id', m.recipient_id,
            'body', m.body,
            'has_attachments', m.has_attachments,
            'client_message_id', m.client_message_id,
            'is_read', m.is_read,
            'read_at', m.read_at,
            'created_at', m.created_at,
            'sender_name', v_sender_profile.full_name,
            'sender_name_arabic', COALESCE(v_sender_profile.full_name_arabic, v_sender_profile.full_name),
            'attachments', COALESCE(
                (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'id', ma.id,
                            'message_id', ma.message_id,
                            'conversation_id', ma.conversation_id,
                            'uploader_id', ma.uploader_id,
                            'storage_bucket', ma.storage_bucket,
                            'storage_path', ma.storage_path,
                            'file_name', ma.file_name,
                            'file_size_bytes', ma.file_size_bytes,
                            'mime_type', ma.mime_type,
                            'file_extension', ma.file_extension,
                            'created_at', ma.created_at
                        )
                        ORDER BY ma.created_at ASC
                    )
                    FROM public.message_attachments ma
                    WHERE ma.message_id = m.id
                ),
                '[]'::jsonb
            )
        )
        FROM public.messages m
        WHERE m.id = v_message_id
    );
END;
$$;

ALTER FUNCTION public.send_direct_message(UUID, TEXT, JSONB, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.send_direct_message(UUID, TEXT, JSONB, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_direct_message(UUID, TEXT, JSONB, UUID) TO authenticated;

-- 6.6 Mark all unread messages in a conversation as read for the recipient
CREATE OR REPLACE FUNCTION public.mark_conversation_messages_read(p_conversation_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
    v_caller_id UUID;
    v_conv RECORD;
    v_updated_count INT := 0;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Not authenticated' USING ERRCODE = '42501';
    END IF;

    SELECT id, student_id, teacher_id
    INTO v_conv
    FROM public.message_conversations
    WHERE id = p_conversation_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Conversation not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_caller_id <> v_conv.student_id AND v_caller_id <> v_conv.teacher_id THEN
        RAISE EXCEPTION 'Forbidden: Only conversation participants can mark messages read' USING ERRCODE = '42501';
    END IF;

    UPDATE public.messages
    SET is_read = true,
        read_at = now()
    WHERE conversation_id = p_conversation_id
      AND recipient_id = v_caller_id
      AND is_read = false;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    -- Keep corresponding message notifications synchronized as read
    UPDATE public.notification_recipients nr
    SET is_read = true,
        read_at = COALESCE(nr.read_at, now())
    FROM public.notifications n
    WHERE nr.notification_id = n.id
      AND nr.recipient_id = v_caller_id
      AND nr.is_read = false
      AND n.action_url = ('/messages/' || p_conversation_id::text);

    RETURN v_updated_count;
END;
$$;

ALTER FUNCTION public.mark_conversation_messages_read(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.mark_conversation_messages_read(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_conversation_messages_read(UUID) TO authenticated;

-- 6.7 Get unread direct messages count for the authenticated user
CREATE OR REPLACE FUNCTION public.get_unread_messages_count()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
    v_caller_id UUID;
    v_count INT := 0;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RETURN 0;
    END IF;

    SELECT count(*)::INT
    INTO v_count
    FROM public.messages m
    JOIN public.message_conversations mc ON mc.id = m.conversation_id
    JOIN public.profiles p ON p.id = v_caller_id
    WHERE m.recipient_id = v_caller_id
      AND m.is_read = false
      AND p.status = 'active'
      AND (mc.student_id = v_caller_id OR mc.teacher_id = v_caller_id);

    RETURN v_count;
END;
$$;

ALTER FUNCTION public.get_unread_messages_count() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_unread_messages_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_unread_messages_count() TO authenticated;

-- ------------------------------------------------------------------------------
-- 7. SUPABASE REALTIME PUBLICATION REGISTRATION (GUARDED)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime'
              AND schemaname = 'public'
              AND tablename = 'notification_recipients'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_recipients;
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime'
              AND schemaname = 'public'
              AND tablename = 'messages'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime'
              AND schemaname = 'public'
              AND tablename = 'message_conversations'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.message_conversations;
        END IF;
    END IF;
END $$;
