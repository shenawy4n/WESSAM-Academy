-- ==============================================================================
-- WESSAM Academy - Migration 20261110000013
-- Phase 5B: Complete Question Bank
--
-- Features:
-- 1. Support all required question types (Multiple Choice, Multiple Select,
--    True/False, Short Answer, Essay, Fill in the Blank, Matching)
-- 2. Enhanced metadata: Unit, Lesson, Topic, Tags, Time Limit, Active/Archive status, Matching targets
-- 3. Strict teacher ownership RLS (no cross-teacher editing or access)
-- 4. Atomic RPCs for creation, updates, duplication, bulk archiving, restoration, and quiz linking
-- 5. Complete anon isolation (SQLSTATE 42501) and student answer protection
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. EXTEND QUESTION TYPE ENUM
-- ------------------------------------------------------------------------------
ALTER TYPE question_type_enum ADD VALUE IF NOT EXISTS 'multiple_select';
ALTER TYPE question_type_enum ADD VALUE IF NOT EXISTS 'essay';

-- ------------------------------------------------------------------------------
-- 2. ENHANCE public.question_bank SCHEMA
-- ------------------------------------------------------------------------------
ALTER TABLE public.question_bank
    ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES public.course_units(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS lesson_id UUID REFERENCES public.lessons(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS topic TEXT,
    ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS time_limit_seconds INT,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- ------------------------------------------------------------------------------
-- 3. ENHANCE public.question_options SCHEMA
-- ------------------------------------------------------------------------------
ALTER TABLE public.question_options
    ADD COLUMN IF NOT EXISTS target_match_text TEXT,
    ADD COLUMN IF NOT EXISTS target_match_arabic TEXT,
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- ------------------------------------------------------------------------------
-- 4. PERFORMANCE & SEARCH INDEXES
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_question_bank_teacher_active ON public.question_bank(teacher_id, is_active);
CREATE INDEX IF NOT EXISTS idx_question_bank_course_unit ON public.question_bank(course_id, unit_id);
CREATE INDEX IF NOT EXISTS idx_question_bank_type_diff ON public.question_bank(question_type, difficulty_level);
CREATE INDEX IF NOT EXISTS idx_question_bank_created_at ON public.question_bank(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_question_bank_topic ON public.question_bank(topic);

-- ------------------------------------------------------------------------------
-- 5. RECURSION-FREE AUTHORIZATION HELPERS
-- ------------------------------------------------------------------------------

-- Helper: Verify teacher ownership or super_admin management of a question
CREATE OR REPLACE FUNCTION public.can_manage_question(p_question_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
    v_owner_id UUID;
    v_course_id UUID;
BEGIN
    IF p_question_id IS NULL OR auth.uid() IS NULL THEN
        RETURN false;
    END IF;

    IF public.is_super_admin() THEN
        RETURN true;
    END IF;

    IF NOT public.is_teacher() THEN
        RETURN false;
    END IF;

    SELECT teacher_id, course_id INTO v_owner_id, v_course_id
    FROM public.question_bank
    WHERE id = p_question_id;

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    -- Directly owned by this teacher
    IF v_owner_id = auth.uid() THEN
        RETURN true;
    END IF;

    -- Assigned to a course managed by this teacher
    IF v_course_id IS NOT NULL AND public.can_manage_course(v_course_id) THEN
        RETURN true;
    END IF;

    RETURN false;
END;
$$;

ALTER FUNCTION public.can_manage_question(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.can_manage_question(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_question(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_manage_question(UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 6. STRICT ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------

-- (A) public.question_bank
ALTER TABLE public.question_bank ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Teachers and admins manage question bank" ON public.question_bank;
DROP POLICY IF EXISTS "Teachers manage question bank" ON public.question_bank;
DROP POLICY IF EXISTS "Teachers view authorized questions" ON public.question_bank;
DROP POLICY IF EXISTS "Teachers insert own questions" ON public.question_bank;
DROP POLICY IF EXISTS "Teachers update own questions" ON public.question_bank;
DROP POLICY IF EXISTS "Teachers delete own questions" ON public.question_bank;

CREATE POLICY "Teachers view authorized questions" ON public.question_bank
    FOR SELECT TO authenticated
    USING (
        public.is_super_admin()
        OR (
            public.is_teacher() AND (
                teacher_id = auth.uid()
                OR teacher_id IS NULL
                OR (course_id IS NOT NULL AND public.can_manage_course(course_id))
            )
        )
    );

CREATE POLICY "Teachers insert own questions" ON public.question_bank
    FOR INSERT TO authenticated
    WITH CHECK (
        public.is_super_admin()
        OR (
            public.is_teacher() AND (
                teacher_id = auth.uid()
                OR teacher_id IS NULL
            )
        )
    );

CREATE POLICY "Teachers update own questions" ON public.question_bank
    FOR UPDATE TO authenticated
    USING (
        public.is_super_admin()
        OR (
            public.is_teacher() AND (
                teacher_id = auth.uid()
                OR (course_id IS NOT NULL AND public.can_manage_course(course_id))
            )
        )
    )
    WITH CHECK (
        public.is_super_admin()
        OR (
            public.is_teacher() AND (
                teacher_id = auth.uid()
                OR (course_id IS NOT NULL AND public.can_manage_course(course_id))
            )
        )
    );

CREATE POLICY "Teachers delete own questions" ON public.question_bank
    FOR DELETE TO authenticated
    USING (
        public.is_super_admin()
        OR (
            public.is_teacher() AND (
                teacher_id = auth.uid()
                OR (course_id IS NOT NULL AND public.can_manage_course(course_id))
            )
        )
    );

-- (B) public.question_options
ALTER TABLE public.question_options ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Teachers manage question options" ON public.question_options;
DROP POLICY IF EXISTS "Teachers and admins manage question options" ON public.question_options;
DROP POLICY IF EXISTS "Teachers view question options" ON public.question_options;
DROP POLICY IF EXISTS "Teachers insert question options" ON public.question_options;
DROP POLICY IF EXISTS "Teachers update question options" ON public.question_options;
DROP POLICY IF EXISTS "Teachers delete question options" ON public.question_options;

CREATE POLICY "Teachers view question options" ON public.question_options
    FOR SELECT TO authenticated
    USING (
        public.is_super_admin()
        OR (
            public.is_teacher() AND EXISTS (
                SELECT 1 FROM public.question_bank q
                WHERE q.id = question_options.question_id
                  AND (
                      q.teacher_id = auth.uid()
                      OR q.teacher_id IS NULL
                      OR (q.course_id IS NOT NULL AND public.can_manage_course(q.course_id))
                  )
            )
        )
    );

CREATE POLICY "Teachers insert question options" ON public.question_options
    FOR INSERT TO authenticated
    WITH CHECK (
        public.is_super_admin()
        OR (
            public.is_teacher() AND EXISTS (
                SELECT 1 FROM public.question_bank q
                WHERE q.id = question_options.question_id
                  AND (
                      q.teacher_id = auth.uid()
                      OR q.teacher_id IS NULL
                      OR (q.course_id IS NOT NULL AND public.can_manage_course(q.course_id))
                  )
            )
        )
    );

CREATE POLICY "Teachers update question options" ON public.question_options
    FOR UPDATE TO authenticated
    USING (
        public.is_super_admin()
        OR (
            public.is_teacher() AND EXISTS (
                SELECT 1 FROM public.question_bank q
                WHERE q.id = question_options.question_id
                  AND (
                      q.teacher_id = auth.uid()
                      OR (q.course_id IS NOT NULL AND public.can_manage_course(q.course_id))
                  )
            )
        )
    )
    WITH CHECK (
        public.is_super_admin()
        OR (
            public.is_teacher() AND EXISTS (
                SELECT 1 FROM public.question_bank q
                WHERE q.id = question_options.question_id
                  AND (
                      q.teacher_id = auth.uid()
                      OR (q.course_id IS NOT NULL AND public.can_manage_course(q.course_id))
                  )
            )
        )
    );

CREATE POLICY "Teachers delete question options" ON public.question_options
    FOR DELETE TO authenticated
    USING (
        public.is_super_admin()
        OR (
            public.is_teacher() AND EXISTS (
                SELECT 1 FROM public.question_bank q
                WHERE q.id = question_options.question_id
                  AND (
                      q.teacher_id = auth.uid()
                      OR (q.course_id IS NOT NULL AND public.can_manage_course(q.course_id))
                  )
            )
        )
    );

-- ------------------------------------------------------------------------------
-- 7. ATOMIC BUSINESS RPCs FOR QUESTION BANK
-- ------------------------------------------------------------------------------

-- RPC 1: Create a question bank item with options atomically
CREATE OR REPLACE FUNCTION public.create_question_bank_item(
    p_question JSONB,
    p_options JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
    v_caller_id UUID;
    v_new_q_id UUID;
    v_type TEXT;
    v_correct_count INT := 0;
    v_opt RECORD;
    v_i INT := 1;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
    END IF;

    IF NOT (public.is_teacher() OR public.is_super_admin()) THEN
        RAISE EXCEPTION 'Forbidden: Only teachers and super admins can create questions' USING ERRCODE = '42501';
    END IF;

    v_type := p_question->>'question_type';
    IF v_type IS NULL THEN
        RAISE EXCEPTION 'Question type is required' USING ERRCODE = '22000';
    END IF;

    -- Validate single choice question must have exactly one correct answer
    IF v_type IN ('multiple_choice', 'true_false') AND p_options IS NOT NULL AND jsonb_array_length(p_options) > 0 THEN
        SELECT count(*) INTO v_correct_count
        FROM jsonb_to_recordset(p_options) AS o(is_correct BOOLEAN)
        WHERE o.is_correct = true;

        IF v_correct_count <> 1 THEN
            RAISE EXCEPTION '% questions must have exactly one correct option (received %)', v_type, v_correct_count USING ERRCODE = '22000';
        END IF;
    END IF;

    -- Validate multiple select must have at least one correct answer
    IF v_type = 'multiple_select' AND p_options IS NOT NULL AND jsonb_array_length(p_options) > 0 THEN
        SELECT count(*) INTO v_correct_count
        FROM jsonb_to_recordset(p_options) AS o(is_correct BOOLEAN)
        WHERE o.is_correct = true;

        IF v_correct_count < 1 THEN
            RAISE EXCEPTION 'Multiple select questions must have at least one correct option' USING ERRCODE = '22000';
        END IF;
    END IF;

    -- Insert question
    INSERT INTO public.question_bank (
        teacher_id,
        course_id,
        unit_id,
        lesson_id,
        question_text,
        question_text_arabic,
        question_type,
        skill_category,
        difficulty_level,
        topic,
        tags,
        explanation,
        explanation_arabic,
        correct_answer_text,
        grading_guidelines,
        points,
        time_limit_seconds,
        is_active,
        metadata
    ) VALUES (
        v_caller_id,
        (p_question->>'course_id')::UUID,
        (p_question->>'unit_id')::UUID,
        (p_question->>'lesson_id')::UUID,
        p_question->>'question_text',
        p_question->>'question_text_arabic',
        v_type::question_type_enum,
        COALESCE(p_question->>'skill_category', 'grammar'),
        COALESCE(p_question->>'difficulty_level', 'intermediate'),
        p_question->>'topic',
        ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_question->'tags', '[]'::jsonb))),
        p_question->>'explanation',
        p_question->>'explanation_arabic',
        p_question->>'correct_answer_text',
        p_question->>'grading_guidelines',
        COALESCE((p_question->>'points')::INT, 1),
        (p_question->>'time_limit_seconds')::INT,
        COALESCE((p_question->>'is_active')::BOOLEAN, true),
        COALESCE(p_question->'metadata', '{}'::jsonb)
    )
    RETURNING id INTO v_new_q_id;

    -- Insert options if provided
    IF p_options IS NOT NULL AND jsonb_array_length(p_options) > 0 THEN
        FOR v_opt IN SELECT * FROM jsonb_to_recordset(p_options) AS o(
            option_text TEXT,
            option_text_arabic TEXT,
            is_correct BOOLEAN,
            order_index INT,
            target_match_text TEXT,
            target_match_arabic TEXT
        )
        LOOP
            INSERT INTO public.question_options (
                question_id,
                option_text,
                option_text_arabic,
                is_correct,
                order_index,
                target_match_text,
                target_match_arabic
            ) VALUES (
                v_new_q_id,
                v_opt.option_text,
                v_opt.option_text_arabic,
                COALESCE(v_opt.is_correct, false),
                COALESCE(v_opt.order_index, v_i),
                v_opt.target_match_text,
                v_opt.target_match_arabic
            );
            v_i := v_i + 1;
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'id', v_new_q_id,
        'question_text', p_question->>'question_text',
        'question_type', v_type,
        'created_at', now()
    );
END;
$$;

ALTER FUNCTION public.create_question_bank_item(JSONB, JSONB) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_question_bank_item(JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_question_bank_item(JSONB, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_question_bank_item(JSONB, JSONB) TO authenticated;

-- RPC 2: Update question bank item and sync options atomically
CREATE OR REPLACE FUNCTION public.update_question_bank_item(
    p_question_id UUID,
    p_question JSONB,
    p_options JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
    v_type TEXT;
    v_correct_count INT := 0;
    v_opt RECORD;
    v_i INT := 1;
BEGIN
    IF NOT public.can_manage_question(p_question_id) THEN
        RAISE EXCEPTION 'Forbidden: You are not authorized to edit this question' USING ERRCODE = '42501';
    END IF;

    v_type := p_question->>'question_type';

    IF v_type IN ('multiple_choice', 'true_false') AND p_options IS NOT NULL AND jsonb_array_length(p_options) > 0 THEN
        SELECT count(*) INTO v_correct_count
        FROM jsonb_to_recordset(p_options) AS o(is_correct BOOLEAN)
        WHERE o.is_correct = true;

        IF v_correct_count <> 1 THEN
            RAISE EXCEPTION '% questions must have exactly one correct option (received %)', v_type, v_correct_count USING ERRCODE = '22000';
        END IF;
    END IF;

    IF v_type = 'multiple_select' AND p_options IS NOT NULL AND jsonb_array_length(p_options) > 0 THEN
        SELECT count(*) INTO v_correct_count
        FROM jsonb_to_recordset(p_options) AS o(is_correct BOOLEAN)
        WHERE o.is_correct = true;

        IF v_correct_count < 1 THEN
            RAISE EXCEPTION 'Multiple select questions must have at least one correct option' USING ERRCODE = '22000';
        END IF;
    END IF;

    UPDATE public.question_bank
    SET course_id = (p_question->>'course_id')::UUID,
        unit_id = (p_question->>'unit_id')::UUID,
        lesson_id = (p_question->>'lesson_id')::UUID,
        question_text = COALESCE(p_question->>'question_text', question_text),
        question_text_arabic = p_question->>'question_text_arabic',
        question_type = COALESCE(v_type::question_type_enum, question_type),
        skill_category = COALESCE(p_question->>'skill_category', skill_category),
        difficulty_level = COALESCE(p_question->>'difficulty_level', difficulty_level),
        topic = p_question->>'topic',
        tags = CASE
            WHEN p_question ? 'tags' THEN ARRAY(SELECT jsonb_array_elements_text(p_question->'tags'))
            ELSE tags
        END,
        explanation = p_question->>'explanation',
        explanation_arabic = p_question->>'explanation_arabic',
        correct_answer_text = p_question->>'correct_answer_text',
        grading_guidelines = p_question->>'grading_guidelines',
        points = COALESCE((p_question->>'points')::INT, points),
        time_limit_seconds = (p_question->>'time_limit_seconds')::INT,
        is_active = COALESCE((p_question->>'is_active')::BOOLEAN, is_active),
        metadata = COALESCE(p_question->'metadata', metadata),
        updated_at = now()
    WHERE id = p_question_id;

    -- Replace options if provided
    IF p_options IS NOT NULL THEN
        DELETE FROM public.question_options WHERE question_id = p_question_id;

        FOR v_opt IN SELECT * FROM jsonb_to_recordset(p_options) AS o(
            option_text TEXT,
            option_text_arabic TEXT,
            is_correct BOOLEAN,
            order_index INT,
            target_match_text TEXT,
            target_match_arabic TEXT
        )
        LOOP
            INSERT INTO public.question_options (
                question_id,
                option_text,
                option_text_arabic,
                is_correct,
                order_index,
                target_match_text,
                target_match_arabic
            ) VALUES (
                p_question_id,
                v_opt.option_text,
                v_opt.option_text_arabic,
                COALESCE(v_opt.is_correct, false),
                COALESCE(v_opt.order_index, v_i),
                v_opt.target_match_text,
                v_opt.target_match_arabic
            );
            v_i := v_i + 1;
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'id', p_question_id,
        'updated_at', now()
    );
END;
$$;

ALTER FUNCTION public.update_question_bank_item(UUID, JSONB, JSONB) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.update_question_bank_item(UUID, JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_question_bank_item(UUID, JSONB, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_question_bank_item(UUID, JSONB, JSONB) TO authenticated;

-- RPC 3: Duplicate a question bank item with its options
CREATE OR REPLACE FUNCTION public.duplicate_question_bank_item(p_question_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
    v_caller_id UUID;
    v_orig RECORD;
    v_new_q_id UUID;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
    END IF;

    IF NOT public.can_manage_question(p_question_id) THEN
        RAISE EXCEPTION 'Forbidden: You are not authorized to duplicate this question' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_orig FROM public.question_bank WHERE id = p_question_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Question not found' USING ERRCODE = 'P0002';
    END IF;

    -- Clone question row
    INSERT INTO public.question_bank (
        teacher_id,
        course_id,
        unit_id,
        lesson_id,
        question_text,
        question_text_arabic,
        question_type,
        skill_category,
        difficulty_level,
        topic,
        tags,
        explanation,
        explanation_arabic,
        correct_answer_text,
        grading_guidelines,
        points,
        time_limit_seconds,
        is_active,
        metadata
    ) VALUES (
        v_caller_id,
        v_orig.course_id,
        v_orig.unit_id,
        v_orig.lesson_id,
        v_orig.question_text || ' (Copy)',
        CASE WHEN v_orig.question_text_arabic IS NOT NULL THEN v_orig.question_text_arabic || ' (نسخة)' ELSE NULL END,
        v_orig.question_type,
        v_orig.skill_category,
        v_orig.difficulty_level,
        v_orig.topic,
        v_orig.tags,
        v_orig.explanation,
        v_orig.explanation_arabic,
        v_orig.correct_answer_text,
        v_orig.grading_guidelines,
        v_orig.points,
        v_orig.time_limit_seconds,
        true,
        v_orig.metadata
    )
    RETURNING id INTO v_new_q_id;

    -- Clone options
    INSERT INTO public.question_options (
        question_id,
        option_text,
        option_text_arabic,
        is_correct,
        order_index,
        target_match_text,
        target_match_arabic,
        metadata
    )
    SELECT
        v_new_q_id,
        option_text,
        option_text_arabic,
        is_correct,
        order_index,
        target_match_text,
        target_match_arabic,
        metadata
    FROM public.question_options
    WHERE question_id = p_question_id;

    RETURN jsonb_build_object(
        'new_question_id', v_new_q_id,
        'original_id', p_question_id,
        'created_at', now()
    );
END;
$$;

ALTER FUNCTION public.duplicate_question_bank_item(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.duplicate_question_bank_item(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.duplicate_question_bank_item(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.duplicate_question_bank_item(UUID) TO authenticated;

-- RPC 4: Bulk archive questions
CREATE OR REPLACE FUNCTION public.archive_question_bank_items(p_question_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
    v_caller_id UUID;
    v_archived_count INT := 0;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
    END IF;

    IF public.is_super_admin() THEN
        UPDATE public.question_bank
        SET is_active = false,
            archived_at = now(),
            updated_at = now()
        WHERE id = ANY(p_question_ids);
        GET DIAGNOSTICS v_archived_count = ROW_COUNT;
    ELSIF public.is_teacher() THEN
        UPDATE public.question_bank
        SET is_active = false,
            archived_at = now(),
            updated_at = now()
        WHERE id = ANY(p_question_ids)
          AND teacher_id = v_caller_id;
        GET DIAGNOSTICS v_archived_count = ROW_COUNT;
    ELSE
        RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
    END IF;

    RETURN jsonb_build_object('archived_count', v_archived_count);
END;
$$;

ALTER FUNCTION public.archive_question_bank_items(UUID[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.archive_question_bank_items(UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_question_bank_items(UUID[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.archive_question_bank_items(UUID[]) TO authenticated;

-- RPC 5: Bulk restore questions
CREATE OR REPLACE FUNCTION public.restore_question_bank_items(p_question_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
    v_caller_id UUID;
    v_restored_count INT := 0;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
    END IF;

    IF public.is_super_admin() THEN
        UPDATE public.question_bank
        SET is_active = true,
            archived_at = NULL,
            updated_at = now()
        WHERE id = ANY(p_question_ids);
        GET DIAGNOSTICS v_restored_count = ROW_COUNT;
    ELSIF public.is_teacher() THEN
        UPDATE public.question_bank
        SET is_active = true,
            archived_at = NULL,
            updated_at = now()
        WHERE id = ANY(p_question_ids)
          AND teacher_id = v_caller_id;
        GET DIAGNOSTICS v_restored_count = ROW_COUNT;
    ELSE
        RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
    END IF;

    RETURN jsonb_build_object('restored_count', v_restored_count);
END;
$$;

ALTER FUNCTION public.restore_question_bank_items(UUID[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.restore_question_bank_items(UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_question_bank_items(UUID[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.restore_question_bank_items(UUID[]) TO authenticated;

-- RPC 6: Get Question Bank Statistics
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
REVOKE ALL ON FUNCTION public.get_question_bank_stats() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_question_bank_stats() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_question_bank_stats() TO authenticated;

-- RPC 7: Add bank questions to a quiz securely with point recalibration
CREATE OR REPLACE FUNCTION public.add_bank_questions_to_quiz(
    p_quiz_id UUID,
    p_question_ids UUID[],
    p_default_points NUMERIC DEFAULT 5
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
    v_caller_id UUID;
    v_max_order INT := 0;
    v_qid UUID;
    v_added_count INT := 0;
    v_new_total NUMERIC := 0;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
    END IF;

    IF NOT public.can_manage_quiz(p_quiz_id) THEN
        RAISE EXCEPTION 'Forbidden: You cannot manage this quiz' USING ERRCODE = '42501';
    END IF;

    -- Get current max order index in quiz
    SELECT COALESCE(MAX(order_index), 0) INTO v_max_order
    FROM public.quiz_questions
    WHERE quiz_id = p_quiz_id;

    FOREACH v_qid IN ARRAY p_question_ids LOOP
        -- Verify teacher can manage this question or question belongs to the course
        IF NOT public.can_manage_question(v_qid) THEN
            RAISE EXCEPTION 'Forbidden: Question % does not belong to your authorized scope', v_qid USING ERRCODE = '42501';
        END IF;

        v_max_order := v_max_order + 1;

        INSERT INTO public.quiz_questions (
            quiz_id,
            question_id,
            order_index,
            points,
            is_required
        ) VALUES (
            p_quiz_id,
            v_qid,
            v_max_order,
            COALESCE(p_default_points, 5),
            true
        )
        ON CONFLICT (quiz_id, question_id) DO NOTHING;

        IF FOUND THEN
            v_added_count := v_added_count + 1;
        END IF;
    END LOOP;

    -- Recalculate quiz total_points
    SELECT COALESCE(SUM(points), 0) INTO v_new_total
    FROM public.quiz_questions
    WHERE quiz_id = p_quiz_id;

    UPDATE public.quizzes
    SET total_points = v_new_total,
        updated_at = now()
    WHERE id = p_quiz_id;

    RETURN jsonb_build_object(
        'quiz_id', p_quiz_id,
        'added_count', v_added_count,
        'new_total_points', v_new_total
    );
END;
$$;

ALTER FUNCTION public.add_bank_questions_to_quiz(UUID, UUID[], NUMERIC) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.add_bank_questions_to_quiz(UUID, UUID[], NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_bank_questions_to_quiz(UUID, UUID[], NUMERIC) FROM anon;
GRANT EXECUTE ON FUNCTION public.add_bank_questions_to_quiz(UUID, UUID[], NUMERIC) TO authenticated;

-- ------------------------------------------------------------------------------
-- 8. TABLE PRIVILEGES & ANON ISOLATION
-- ------------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_bank TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_options TO authenticated;

REVOKE ALL ON public.question_bank FROM anon;
REVOKE ALL ON public.question_options FROM anon;
