-- ==============================================================================
-- WESSAM Academy - Migration 20261109000011: Notifications & Announcements
-- Phase 4C: In-App Notification Center & Announcement Management
-- 1. Announcements Table (Target Audience, Priority, Scheduling, Archival)
-- 2. Notifications Table Extensions (Categories, Priority, Idempotency, Deep Links)
-- 3. Notification Recipients Enhancements & Performance Indexes
-- 4. Scope Authorization Helpers (is_teacher_authorized_for_group/student)
-- 5. Server-Authoritative RPCs (publish, archive, scheduled delivery, read state)
-- 6. Automated Event Triggers (Lessons, Resources, Live Sessions, Quizzes, Grades)
-- 7. Least-Privilege RLS Policies & Anonymous Access Restrictions
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ANNOUNCEMENTS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    title_arabic TEXT NOT NULL,
    body TEXT NOT NULL,
    body_arabic TEXT NOT NULL,
    target_audience TEXT NOT NULL DEFAULT 'all_students'
        CHECK (target_audience IN ('all_students', 'group', 'student')),
    group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL,
    student_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    priority TEXT NOT NULL DEFAULT 'normal'
        CHECK (priority IN ('normal', 'important', 'urgent')),
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'scheduled', 'published', 'archived')),
    scheduled_for TIMESTAMPTZ,
    published_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ,
    action_url TEXT,
    related_resource_type TEXT,
    related_resource_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_announcement_target_group CHECK (
        target_audience <> 'group' OR group_id IS NOT NULL
    ),
    CONSTRAINT chk_announcement_target_student CHECK (
        target_audience <> 'student' OR student_id IS NOT NULL
    ),
    CONSTRAINT chk_announcement_scheduled CHECK (
        status <> 'scheduled' OR scheduled_for IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS idx_announcements_teacher_id ON public.announcements(teacher_id);
CREATE INDEX IF NOT EXISTS idx_announcements_status ON public.announcements(status);
CREATE INDEX IF NOT EXISTS idx_announcements_scheduled ON public.announcements(status, scheduled_for)
    WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_announcements_group_id ON public.announcements(group_id)
    WHERE group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_announcements_student_id ON public.announcements(student_id)
    WHERE student_id IS NOT NULL;

-- ------------------------------------------------------------------------------
-- 2. NOTIFICATIONS & NOTIFICATION RECIPIENTS EXTENSIONS
-- ------------------------------------------------------------------------------
ALTER TABLE public.notifications
    ADD COLUMN IF NOT EXISTS announcement_id UUID REFERENCES public.announcements(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'general',
    ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal'
        CHECK (priority IN ('normal', 'important', 'urgent')),
    ADD COLUMN IF NOT EXISTS action_url TEXT,
    ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'notifications' AND indexname = 'idx_notifications_idempotency_key'
    ) THEN
        CREATE UNIQUE INDEX idx_notifications_idempotency_key
        ON public.notifications(idempotency_key)
        WHERE idempotency_key IS NOT NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notifications_announcement_id ON public.notifications(announcement_id);
CREATE INDEX IF NOT EXISTS idx_notifications_sender_id ON public.notifications(sender_id);
CREATE INDEX IF NOT EXISTS idx_notifications_category ON public.notifications(category);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);

ALTER TABLE public.notification_recipients
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_notification_recipients_lookup
ON public.notification_recipients(recipient_id, is_read, created_at DESC);

-- ------------------------------------------------------------------------------
-- 3. SCOPE AUTHORIZATION HELPERS
-- ------------------------------------------------------------------------------

-- Helper: Verify if teacher is authorized to target a group
CREATE OR REPLACE FUNCTION public.is_teacher_authorized_for_group(p_teacher_id UUID, p_group_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
BEGIN
    IF p_teacher_id IS NULL OR p_group_id IS NULL THEN
        RETURN false;
    END IF;

    -- Super Admin has universal scope
    IF EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = p_teacher_id AND role = 'super_admin' AND status = 'active'
    ) THEN
        RETURN true;
    END IF;

    -- Verify teacher is active
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = p_teacher_id AND role = 'teacher' AND status = 'active'
    ) THEN
        RETURN false;
    END IF;

    -- Check course assignments to group
    IF EXISTS (
        SELECT 1
        FROM public.group_courses gc
        JOIN public.courses c ON c.id = gc.course_id
        WHERE gc.group_id = p_group_id
          AND c.teacher_id = p_teacher_id
    ) THEN
        RETURN true;
    END IF;

    -- Check live sessions in group
    IF EXISTS (
        SELECT 1
        FROM public.live_sessions ls
        WHERE ls.group_id = p_group_id
          AND ls.teacher_id = p_teacher_id
    ) THEN
        RETURN true;
    END IF;

    -- Check quizzes in group
    IF EXISTS (
        SELECT 1
        FROM public.quizzes q
        WHERE q.group_id = p_group_id
          AND q.teacher_id = p_teacher_id
    ) THEN
        RETURN true;
    END IF;

    RETURN false;
END;
$$;

ALTER FUNCTION public.is_teacher_authorized_for_group(UUID, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_teacher_authorized_for_group(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_teacher_authorized_for_group(UUID, UUID) TO authenticated;

-- Helper: Verify if teacher is authorized to target an individual student
CREATE OR REPLACE FUNCTION public.is_teacher_authorized_for_student(p_teacher_id UUID, p_student_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
BEGIN
    IF p_teacher_id IS NULL OR p_student_id IS NULL THEN
        RETURN false;
    END IF;

    -- Super Admin has universal scope
    IF EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = p_teacher_id AND role = 'super_admin' AND status = 'active'
    ) THEN
        RETURN true;
    END IF;

    -- Verify student is active
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = p_student_id AND role = 'student' AND status = 'active'
    ) THEN
        RETURN false;
    END IF;

    -- Verify student is enrolled in a group taught by this teacher
    RETURN EXISTS (
        SELECT 1
        FROM public.group_students gs
        WHERE gs.student_id = p_student_id
          AND public.is_teacher_authorized_for_group(p_teacher_id, gs.group_id)
    );
END;
$$;

ALTER FUNCTION public.is_teacher_authorized_for_student(UUID, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_teacher_authorized_for_student(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_teacher_authorized_for_student(UUID, UUID) TO authenticated;

-- Helper: Can manage announcement (Super admin or author teacher)
CREATE OR REPLACE FUNCTION public.can_manage_announcement(p_announcement_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
BEGIN
    IF p_announcement_id IS NULL OR auth.uid() IS NULL THEN
        RETURN false;
    END IF;

    IF public.is_super_admin() THEN
        RETURN true;
    END IF;

    IF NOT public.is_teacher() THEN
        RETURN false;
    END IF;

    RETURN EXISTS (
        SELECT 1 FROM public.announcements
        WHERE id = p_announcement_id
          AND teacher_id = auth.uid()
    );
END;
$$;

ALTER FUNCTION public.can_manage_announcement(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.can_manage_announcement(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_announcement(UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 4. SERVER-AUTHORITATIVE RPC: PUBLISH ANNOUNCEMENT & CREATE NOTIFICATIONS
-- ------------------------------------------------------------------------------
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
    v_notification_id UUID;
    v_delivered_count INT := 0;
    v_recipient_id UUID;
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

    -- Authorization check
    IF NOT v_is_super AND (v_announcement.teacher_id <> v_caller_id OR NOT public.is_teacher()) THEN
        RAISE EXCEPTION 'Forbidden: You cannot manage this announcement' USING ERRCODE = '42501';
    END IF;

    -- Target audience scope verification
    IF v_announcement.target_audience = 'all_students' THEN
        -- Only super admin can broadcast platform-wide without restriction.
        -- Teachers broadcasting all_students will reach only their authorized students.
    ELSIF v_announcement.target_audience = 'group' THEN
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

    -- Update announcement status
    UPDATE public.announcements
    SET status = 'published',
        published_at = now(),
        updated_at = now()
    WHERE id = p_announcement_id;

    -- Create corresponding notification record (idempotent on announcement_id)
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

    -- Resolve recipients and deliver notifications (excluding inactive/suspended accounts)
    IF v_announcement.target_audience = 'student' THEN
        -- Target individual active student
        INSERT INTO public.notification_recipients (notification_id, recipient_id, is_read, created_at)
        SELECT v_notification_id, p.id, false, now()
        FROM public.profiles p
        WHERE p.id = v_announcement.student_id
          AND p.role = 'student'
          AND p.status = 'active'
        ON CONFLICT (notification_id, recipient_id) DO NOTHING;

        GET DIAGNOSTICS v_delivered_count = ROW_COUNT;

    ELSIF v_announcement.target_audience = 'group' THEN
        -- Target active students in group
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
        IF v_is_super THEN
            -- Super Admin targets all active students platform-wide
            INSERT INTO public.notification_recipients (notification_id, recipient_id, is_read, created_at)
            SELECT DISTINCT v_notification_id, p.id, false, now()
            FROM public.profiles p
            WHERE p.role = 'student'
              AND p.status = 'active'
            ON CONFLICT (notification_id, recipient_id) DO NOTHING;

            GET DIAGNOSTICS v_delivered_count = ROW_COUNT;
        ELSE
            -- Teacher targets all active students within their authorized groups
            INSERT INTO public.notification_recipients (notification_id, recipient_id, is_read, created_at)
            SELECT DISTINCT v_notification_id, gs.student_id, false, now()
            FROM public.group_students gs
            JOIN public.profiles p ON p.id = gs.student_id
            WHERE p.role = 'student'
              AND p.status = 'active'
              AND public.is_teacher_authorized_for_group(v_caller_id, gs.group_id)
            ON CONFLICT (notification_id, recipient_id) DO NOTHING;

            GET DIAGNOSTICS v_delivered_count = ROW_COUNT;
        END IF;
    END IF;

    -- Audit log
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, new_data, created_at)
    VALUES (
        v_caller_id,
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

ALTER FUNCTION public.publish_announcement(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.publish_announcement(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_announcement(UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 5. SERVER-AUTHORITATIVE RPC: ARCHIVE ANNOUNCEMENT
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.archive_announcement(p_announcement_id UUID)
RETURNS JSONB
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

    IF NOT public.can_manage_announcement(p_announcement_id) THEN
        RAISE EXCEPTION 'Forbidden: You cannot archive this announcement' USING ERRCODE = '42501';
    END IF;

    UPDATE public.announcements
    SET status = 'archived',
        archived_at = now(),
        updated_at = now()
    WHERE id = p_announcement_id;

    RETURN jsonb_build_object(
        'success', true,
        'announcement_id', p_announcement_id,
        'status', 'archived'
    );
END;
$$;

ALTER FUNCTION public.archive_announcement(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.archive_announcement(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_announcement(UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 6. SCHEDULED ANNOUNCEMENTS PROCESSING RPC
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_scheduled_announcements()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_ann RECORD;
    v_count INT := 0;
BEGIN
    FOR v_ann IN
        SELECT id FROM public.announcements
        WHERE status = 'scheduled'
          AND scheduled_for <= now()
        ORDER BY scheduled_for ASC
    LOOP
        BEGIN
            -- Call publish_announcement as the system/author
            PERFORM public.publish_announcement(v_ann.id);
            v_count := v_count + 1;
        EXCEPTION WHEN OTHERS THEN
            -- Log failure and continue processing others
            RAISE WARNING 'Failed to publish scheduled announcement %: %', v_ann.id, SQLERRM;
        END;
    END LOOP;

    RETURN v_count;
END;
$$;

ALTER FUNCTION public.process_scheduled_announcements() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.process_scheduled_announcements() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_scheduled_announcements() TO authenticated;

-- ------------------------------------------------------------------------------
-- 7. NOTIFICATION READ STATE RPCs & COUNTERS
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_notification_as_read(p_notification_id UUID)
RETURNS BOOLEAN
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

    UPDATE public.notification_recipients
    SET is_read = true,
        read_at = now()
    WHERE notification_id = p_notification_id
      AND recipient_id = v_caller_id
      AND is_read = false;

    RETURN FOUND;
END;
$$;

ALTER FUNCTION public.mark_notification_as_read(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.mark_notification_as_read(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_notification_as_read(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_as_read()
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
        RAISE EXCEPTION 'Unauthorized: Not authenticated' USING ERRCODE = '42501';
    END IF;

    UPDATE public.notification_recipients
    SET is_read = true,
        read_at = now()
    WHERE recipient_id = v_caller_id
      AND is_read = false;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

ALTER FUNCTION public.mark_all_notifications_as_read() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.mark_all_notifications_as_read() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_as_read() TO authenticated;

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

    -- Process any scheduled announcements that are due
    PERFORM public.process_scheduled_announcements();

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

    -- Process any scheduled announcements that are due
    PERFORM public.process_scheduled_announcements();

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
-- 8. AUTOMATED NOTIFICATION TRIGGERS
-- ------------------------------------------------------------------------------

-- Trigger 1: New Lesson Published
CREATE OR REPLACE FUNCTION public.trg_notify_new_lesson_published()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_notif_id UUID;
    v_idempotency_key TEXT;
BEGIN
    -- Only trigger on transition to is_published = true
    IF NEW.is_published = true AND (TG_OP = 'INSERT' OR OLD.is_published IS DISTINCT FROM true) THEN
        v_idempotency_key := 'lesson_pub_' || NEW.id::text;

        INSERT INTO public.notifications (
            title,
            title_arabic,
            body,
            body_arabic,
            type,
            category,
            priority,
            action_url,
            related_resource_id,
            idempotency_key,
            created_at
        ) VALUES (
            'New Lesson Available: ' || NEW.title,
            'درس جديد متاح: ' || NEW.title_arabic,
            'A new lesson has been published in your course.',
            'تم نشر درس تعليمي جديد في مساقك الدراسي.',
            'lesson',
            'new_lesson',
            'normal',
            '/courses/' || NEW.course_id::text,
            NEW.id::text,
            v_idempotency_key,
            now()
        )
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING id INTO v_notif_id;

        IF v_notif_id IS NOT NULL THEN
            -- Deliver to active students enrolled in groups taking this course
            INSERT INTO public.notification_recipients (notification_id, recipient_id, is_read, created_at)
            SELECT DISTINCT v_notif_id, gs.student_id, false, now()
            FROM public.group_courses gc
            JOIN public.group_students gs ON gs.group_id = gc.group_id
            JOIN public.profiles p ON p.id = gs.student_id
            WHERE gc.course_id = NEW.course_id
              AND p.role = 'student'
              AND p.status = 'active'
            ON CONFLICT (notification_id, recipient_id) DO NOTHING;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_lesson_published ON public.lessons;
CREATE TRIGGER trg_notify_lesson_published
    AFTER INSERT OR UPDATE OF is_published ON public.lessons
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_notify_new_lesson_published();

-- Trigger 2: New Learning Resource Published
CREATE OR REPLACE FUNCTION public.trg_notify_new_resource_published()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_lesson RECORD;
    v_notif_id UUID;
    v_idempotency_key TEXT;
BEGIN
    SELECT id, course_id, title, title_arabic, is_published
    INTO v_lesson
    FROM public.lessons
    WHERE id = NEW.lesson_id;

    IF FOUND AND v_lesson.is_published = true THEN
        v_idempotency_key := 'res_pub_' || NEW.id::text;

        INSERT INTO public.notifications (
            title,
            title_arabic,
            body,
            body_arabic,
            type,
            category,
            priority,
            action_url,
            related_resource_id,
            idempotency_key,
            created_at
        ) VALUES (
            'New Study Material: ' || NEW.title,
            'مادة دراسية جديدة: ' || COALESCE(NEW.title_arabic, NEW.title),
            'New resource added to lesson "' || v_lesson.title || '".',
            'تمت إضافة مادة تعليمية جديدة لدرس "' || v_lesson.title_arabic || '".',
            'resource',
            'new_material',
            'normal',
            '/courses/' || v_lesson.course_id::text,
            NEW.id::text,
            v_idempotency_key,
            now()
        )
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING id INTO v_notif_id;

        IF v_notif_id IS NOT NULL THEN
            INSERT INTO public.notification_recipients (notification_id, recipient_id, is_read, created_at)
            SELECT DISTINCT v_notif_id, gs.student_id, false, now()
            FROM public.group_courses gc
            JOIN public.group_students gs ON gs.group_id = gc.group_id
            JOIN public.profiles p ON p.id = gs.student_id
            WHERE gc.course_id = v_lesson.course_id
              AND p.role = 'student'
              AND p.status = 'active'
            ON CONFLICT (notification_id, recipient_id) DO NOTHING;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_resource_published ON public.lesson_resources;
CREATE TRIGGER trg_notify_resource_published
    AFTER INSERT ON public.lesson_resources
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_notify_new_resource_published();

-- Trigger 3: Live Session Created or Rescheduled
CREATE OR REPLACE FUNCTION public.trg_notify_live_session_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_notif_id UUID;
    v_idempotency_key TEXT;
    v_is_rescheduled BOOLEAN := false;
BEGIN
    IF NEW.status = 'cancelled' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.start_time <> NEW.start_time THEN
        v_is_rescheduled := true;
    END IF;

    IF TG_OP = 'INSERT' OR v_is_rescheduled THEN
        v_idempotency_key := 'session_' || NEW.id::text || '_' || EXTRACT(EPOCH FROM NEW.start_time)::bigint::text;

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
            CASE WHEN v_is_rescheduled THEN 'Live Session Rescheduled: ' || NEW.title ELSE 'Upcoming Live Session: ' || NEW.title END,
            CASE WHEN v_is_rescheduled THEN 'تم تغيير موعد الحصة المباشرة: ' || NEW.title_arabic ELSE 'حصة تفاعلية مباشرة قادمة: ' || NEW.title_arabic END,
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

DROP TRIGGER IF EXISTS trg_notify_live_session ON public.live_sessions;
CREATE TRIGGER trg_notify_live_session
    AFTER INSERT OR UPDATE OF start_time, status ON public.live_sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_notify_live_session_event();

-- Trigger 4: Quiz Published
CREATE OR REPLACE FUNCTION public.trg_notify_quiz_published()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_notif_id UUID;
    v_idempotency_key TEXT;
BEGIN
    IF NEW.is_published = true AND (TG_OP = 'INSERT' OR OLD.is_published IS DISTINCT FROM true) AND NEW.is_archived IS NOT TRUE THEN
        v_idempotency_key := 'quiz_pub_' || NEW.id::text;

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
            'New Assessment Published: ' || NEW.title,
            'تقييم جديد متاح: ' || NEW.title_arabic,
            'A new quiz or assessment has been released for your class.',
            'تم نشر تقييم أو اختبار جديد متاح لدفعتك الدراسية.',
            'quiz',
            'quiz_published',
            'important',
            NEW.teacher_id,
            '/assessments',
            NEW.id::text,
            v_idempotency_key,
            now()
        )
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING id INTO v_notif_id;

        IF v_notif_id IS NOT NULL THEN
            IF NEW.group_id IS NOT NULL THEN
                INSERT INTO public.notification_recipients (notification_id, recipient_id, is_read, created_at)
                SELECT DISTINCT v_notif_id, gs.student_id, false, now()
                FROM public.group_students gs
                JOIN public.profiles p ON p.id = gs.student_id
                WHERE gs.group_id = NEW.group_id
                  AND p.role = 'student'
                  AND p.status = 'active'
                ON CONFLICT (notification_id, recipient_id) DO NOTHING;
            ELSIF NEW.course_id IS NOT NULL THEN
                INSERT INTO public.notification_recipients (notification_id, recipient_id, is_read, created_at)
                SELECT DISTINCT v_notif_id, gs.student_id, false, now()
                FROM public.group_courses gc
                JOIN public.group_students gs ON gs.group_id = gc.group_id
                JOIN public.profiles p ON p.id = gs.student_id
                WHERE gc.course_id = NEW.course_id
                  AND p.role = 'student'
                  AND p.status = 'active'
                ON CONFLICT (notification_id, recipient_id) DO NOTHING;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_quiz ON public.quizzes;
CREATE TRIGGER trg_notify_quiz
    AFTER INSERT OR UPDATE OF is_published, is_archived ON public.quizzes
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_notify_quiz_published();

-- Trigger 5: Quiz Result Released
CREATE OR REPLACE FUNCTION public.trg_notify_quiz_result_released()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_quiz RECORD;
    v_notif_id UUID;
    v_idempotency_key TEXT;
BEGIN
    IF NEW.status = 'graded' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'graded') THEN
        SELECT title, title_arabic, teacher_id INTO v_quiz
        FROM public.quizzes
        WHERE id = NEW.quiz_id;

        IF FOUND THEN
            v_idempotency_key := 'quiz_res_' || NEW.id::text;

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
                'Assessment Result Released: ' || v_quiz.title,
                'تم اعتماد نتيجة التقييم: ' || v_quiz.title_arabic,
                'Your score: ' || COALESCE(NEW.percentage_score::text, '0') || '%. Review your answers now.',
                'درجتك في الاختبار: ' || COALESCE(NEW.percentage_score::text, '0') || '%. يمكنك الآن مراجعة الإجابات والتقييم.',
                'grade',
                'quiz_result',
                'normal',
                v_quiz.teacher_id,
                '/assessments',
                NEW.id::text,
                v_idempotency_key,
                now()
            )
            ON CONFLICT (idempotency_key) DO NOTHING
            RETURNING id INTO v_notif_id;

            IF v_notif_id IS NOT NULL THEN
                INSERT INTO public.notification_recipients (notification_id, recipient_id, is_read, created_at)
                SELECT v_notif_id, p.id, false, now()
                FROM public.profiles p
                WHERE p.id = NEW.student_id
                  AND p.role = 'student'
                  AND p.status = 'active'
                ON CONFLICT (notification_id, recipient_id) DO NOTHING;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_quiz_result ON public.quiz_attempts;
CREATE TRIGGER trg_notify_quiz_result
    AFTER INSERT OR UPDATE OF status ON public.quiz_attempts
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_notify_quiz_result_released();

-- ------------------------------------------------------------------------------
-- 9. REVISED RLS POLICIES FOR ANNOUNCEMENTS & NOTIFICATIONS
-- ------------------------------------------------------------------------------

-- (A) Announcements RLS
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Teachers and admins manage announcements" ON public.announcements;
DROP POLICY IF EXISTS "Teachers view own announcements" ON public.announcements;
DROP POLICY IF EXISTS "Teachers insert own announcements" ON public.announcements;
DROP POLICY IF EXISTS "Teachers update own announcements" ON public.announcements;
DROP POLICY IF EXISTS "Teachers delete own announcements" ON public.announcements;

CREATE POLICY "Teachers view own announcements" ON public.announcements
    FOR SELECT TO authenticated
    USING (
        public.is_super_admin()
        OR (public.is_teacher() AND teacher_id = auth.uid())
    );

CREATE POLICY "Teachers insert own announcements" ON public.announcements
    FOR INSERT TO authenticated
    WITH CHECK (
        public.is_super_admin()
        OR (public.is_teacher() AND teacher_id = auth.uid())
    );

CREATE POLICY "Teachers update own announcements" ON public.announcements
    FOR UPDATE TO authenticated
    USING (
        public.is_super_admin()
        OR (public.is_teacher() AND teacher_id = auth.uid())
    )
    WITH CHECK (
        public.is_super_admin()
        OR (public.is_teacher() AND teacher_id = auth.uid())
    );

CREATE POLICY "Teachers delete own announcements" ON public.announcements
    FOR DELETE TO authenticated
    USING (
        public.is_super_admin()
        OR (public.is_teacher() AND teacher_id = auth.uid())
    );

-- (B) Notifications RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Teachers manage all notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users view notifications addressed to them" ON public.notifications;
DROP POLICY IF EXISTS "Teachers and admins view notifications" ON public.notifications;
DROP POLICY IF EXISTS "Students view addressed notifications" ON public.notifications;

CREATE POLICY "Teachers and admins view notifications" ON public.notifications
    FOR SELECT TO authenticated
    USING (
        public.is_super_admin()
        OR (public.is_teacher() AND (sender_id = auth.uid() OR sender_id IS NULL))
        OR EXISTS (
            SELECT 1 FROM public.notification_recipients nr
            WHERE nr.notification_id = notifications.id
              AND nr.recipient_id = auth.uid()
        )
    );

CREATE POLICY "Students view addressed notifications" ON public.notifications
    FOR SELECT TO authenticated
    USING (
        public.is_active_student()
        AND EXISTS (
            SELECT 1 FROM public.notification_recipients nr
            WHERE nr.notification_id = notifications.id
              AND nr.recipient_id = auth.uid()
        )
    );

-- (C) Notification Recipients RLS
ALTER TABLE public.notification_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Teachers manage notification recipients" ON public.notification_recipients;
DROP POLICY IF EXISTS "Users view and mark own notification recipients read" ON public.notification_recipients;
DROP POLICY IF EXISTS "Users update read status on own notifications" ON public.notification_recipients;

CREATE POLICY "Users view own notification recipients" ON public.notification_recipients
    FOR SELECT TO authenticated
    USING (
        recipient_id = auth.uid()
        AND (public.is_active_student() OR public.is_teacher() OR public.is_super_admin())
    );

CREATE POLICY "Users update own notification recipients read" ON public.notification_recipients
    FOR UPDATE TO authenticated
    USING (
        recipient_id = auth.uid()
        AND (public.is_active_student() OR public.is_teacher() OR public.is_super_admin())
    )
    WITH CHECK (
        recipient_id = auth.uid()
        AND (public.is_active_student() OR public.is_teacher() OR public.is_super_admin())
    );

-- ------------------------------------------------------------------------------
-- 10. GRANTS & ANONYMOUS PRIVILEGE RESTRICTIONS
-- ------------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO authenticated;
GRANT SELECT ON public.notifications TO authenticated;
GRANT SELECT, UPDATE ON public.notification_recipients TO authenticated;

REVOKE ALL ON public.announcements FROM anon;
REVOKE ALL ON public.notifications FROM anon;
REVOKE ALL ON public.notification_recipients FROM anon;
