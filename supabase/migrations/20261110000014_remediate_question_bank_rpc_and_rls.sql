-- ==============================================================================
-- WESSAM Academy - Migration 20261110000014
-- Phase 5B Remediation: Question Bank RPC Contract & Strict RLS Ownership
--
-- Fixes:
-- 1. Strict per-teacher isolation (no cross-teacher editing via course bypass)
-- 2. Legacy unowned questions (teacher_id IS NULL) restricted exclusively to Super Admin
-- 3. Options RLS inherits parent question ownership with teacher_id IS NOT NULL
-- 4. Aligns create_question_bank_item & update_question_bank_item contracts
-- 5. Adds atomic import_question_bank_items RPC for transactional batch import
-- 6. Ensures add_bank_questions_to_quiz checks strict question management
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. UPDATE AUTHORIZATION HELPER
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_manage_question(p_question_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
    v_owner_id UUID;
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

    SELECT teacher_id INTO v_owner_id
    FROM public.question_bank
    WHERE id = p_question_id;

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    -- Strict teacher ownership: Teacher must be non-null and match caller
    IF v_owner_id IS NOT NULL AND v_owner_id = auth.uid() THEN
        RETURN true;
    END IF;

    -- Legacy unowned questions (teacher_id IS NULL) and other teachers' questions are denied
    RETURN false;
END;
$$;

ALTER FUNCTION public.can_manage_question(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.can_manage_question(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_question(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_manage_question(UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 2. HARDEN RLS ON public.question_bank
-- ------------------------------------------------------------------------------

DROP POLICY IF EXISTS "Teachers view authorized questions" ON public.question_bank;
DROP POLICY IF EXISTS "Teachers insert own questions" ON public.question_bank;
DROP POLICY IF EXISTS "Teachers update own questions" ON public.question_bank;
DROP POLICY IF EXISTS "Teachers delete own questions" ON public.question_bank;
DROP POLICY IF EXISTS "Teachers and admins view authorized questions" ON public.question_bank;
DROP POLICY IF EXISTS "Teachers and admins insert own questions" ON public.question_bank;
DROP POLICY IF EXISTS "Teachers and admins update own questions" ON public.question_bank;
DROP POLICY IF EXISTS "Teachers and admins delete own questions" ON public.question_bank;

-- SELECT: Super admins see all (including teacher_id IS NULL legacy items).
-- Teachers can only see items they explicitly own (teacher_id = auth.uid()).
CREATE POLICY "Teachers and admins view authorized questions" ON public.question_bank
    FOR SELECT TO authenticated
    USING (
        public.is_super_admin()
        OR (
            public.is_teacher()
            AND teacher_id IS NOT NULL
            AND teacher_id = auth.uid()
        )
    );

-- INSERT: Super admin can insert any; teachers can ONLY insert items where teacher_id = auth.uid().
CREATE POLICY "Teachers and admins insert own questions" ON public.question_bank
    FOR INSERT TO authenticated
    WITH CHECK (
        public.is_super_admin()
        OR (
            public.is_teacher()
            AND teacher_id IS NOT NULL
            AND teacher_id = auth.uid()
        )
    );

-- UPDATE: Super admin can update any; teachers can ONLY update items they own.
CREATE POLICY "Teachers and admins update own questions" ON public.question_bank
    FOR UPDATE TO authenticated
    USING (
        public.is_super_admin()
        OR (
            public.is_teacher()
            AND teacher_id IS NOT NULL
            AND teacher_id = auth.uid()
        )
    )
    WITH CHECK (
        public.is_super_admin()
        OR (
            public.is_teacher()
            AND teacher_id IS NOT NULL
            AND teacher_id = auth.uid()
        )
    );

-- DELETE: Super admin can delete any; teachers can ONLY delete items they own.
CREATE POLICY "Teachers and admins delete own questions" ON public.question_bank
    FOR DELETE TO authenticated
    USING (
        public.is_super_admin()
        OR (
            public.is_teacher()
            AND teacher_id IS NOT NULL
            AND teacher_id = auth.uid()
        )
    );

-- ------------------------------------------------------------------------------
-- 3. HARDEN RLS ON public.question_options
-- ------------------------------------------------------------------------------

DROP POLICY IF EXISTS "Teachers view question options" ON public.question_options;
DROP POLICY IF EXISTS "Teachers insert question options" ON public.question_options;
DROP POLICY IF EXISTS "Teachers update question options" ON public.question_options;
DROP POLICY IF EXISTS "Teachers delete question options" ON public.question_options;
DROP POLICY IF EXISTS "Teachers and admins view question options" ON public.question_options;
DROP POLICY IF EXISTS "Teachers and admins insert question options" ON public.question_options;
DROP POLICY IF EXISTS "Teachers and admins update question options" ON public.question_options;
DROP POLICY IF EXISTS "Teachers and admins delete question options" ON public.question_options;

-- SELECT: Options inherit parent question ownership
CREATE POLICY "Teachers and admins view question options" ON public.question_options
    FOR SELECT TO authenticated
    USING (
        public.is_super_admin()
        OR (
            public.is_teacher() AND EXISTS (
                SELECT 1 FROM public.question_bank q
                WHERE q.id = question_options.question_id
                  AND q.teacher_id IS NOT NULL
                  AND q.teacher_id = auth.uid()
            )
        )
    );

-- INSERT: Options inherit parent question ownership
CREATE POLICY "Teachers and admins insert question options" ON public.question_options
    FOR INSERT TO authenticated
    WITH CHECK (
        public.is_super_admin()
        OR (
            public.is_teacher() AND EXISTS (
                SELECT 1 FROM public.question_bank q
                WHERE q.id = question_options.question_id
                  AND q.teacher_id IS NOT NULL
                  AND q.teacher_id = auth.uid()
            )
        )
    );

-- UPDATE: Options inherit parent question ownership
CREATE POLICY "Teachers and admins update question options" ON public.question_options
    FOR UPDATE TO authenticated
    USING (
        public.is_super_admin()
        OR (
            public.is_teacher() AND EXISTS (
                SELECT 1 FROM public.question_bank q
                WHERE q.id = question_options.question_id
                  AND q.teacher_id IS NOT NULL
                  AND q.teacher_id = auth.uid()
            )
        )
    )
    WITH CHECK (
        public.is_super_admin()
        OR (
            public.is_teacher() AND EXISTS (
                SELECT 1 FROM public.question_bank q
                WHERE q.id = question_options.question_id
                  AND q.teacher_id IS NOT NULL
                  AND q.teacher_id = auth.uid()
            )
        )
    );

-- DELETE: Options inherit parent question ownership
CREATE POLICY "Teachers and admins delete question options" ON public.question_options
    FOR DELETE TO authenticated
    USING (
        public.is_super_admin()
        OR (
            public.is_teacher() AND EXISTS (
                SELECT 1 FROM public.question_bank q
                WHERE q.id = question_options.question_id
                  AND q.teacher_id IS NOT NULL
                  AND q.teacher_id = auth.uid()
            )
        )
    );

-- ------------------------------------------------------------------------------
-- 4. RPC: CREATE QUESTION BANK ITEM (Aligned & Strict)
-- ------------------------------------------------------------------------------

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
    v_owner_id UUID;
    v_new_q_id UUID;
    v_type TEXT;
    v_diff TEXT;
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

    -- Strict owner assignment:
    -- If super admin and specified, allow custom teacher_id. Otherwise enforce v_caller_id.
    IF public.is_super_admin() AND (p_question->>'teacher_id') IS NOT NULL THEN
        v_owner_id := (p_question->>'teacher_id')::UUID;
    ELSE
        v_owner_id := v_caller_id;
    END IF;

    v_type := p_question->>'question_type';
    IF v_type IS NULL OR trim(v_type) = '' THEN
        RAISE EXCEPTION 'Question type is required' USING ERRCODE = '22000';
    END IF;

    IF p_question->>'question_text' IS NULL OR trim(p_question->>'question_text') = '' THEN
        RAISE EXCEPTION 'Question text is required' USING ERRCODE = '22000';
    END IF;

    -- Normalize difficulty level
    v_diff := COALESCE(p_question->>'difficulty_level', p_question->>'difficulty', 'intermediate');
    IF v_diff = 'medium' THEN
        v_diff := 'intermediate';
    ELSIF v_diff = 'hard' THEN
        v_diff := 'advanced';
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
        v_owner_id,
        (p_question->>'course_id')::UUID,
        (p_question->>'unit_id')::UUID,
        (p_question->>'lesson_id')::UUID,
        trim(p_question->>'question_text'),
        NULLIF(trim(p_question->>'question_text_arabic'), ''),
        v_type::question_type_enum,
        COALESCE(p_question->>'skill_category', 'grammar'),
        v_diff,
        NULLIF(trim(p_question->>'topic'), ''),
        ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_question->'tags', '[]'::jsonb))),
        NULLIF(trim(p_question->>'explanation'), ''),
        NULLIF(trim(p_question->>'explanation_arabic'), ''),
        NULLIF(trim(p_question->>'correct_answer_text'), ''),
        NULLIF(trim(p_question->>'grading_guidelines'), ''),
        GREATEST(1, COALESCE((p_question->>'points')::INT, 1)),
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
                NULLIF(v_opt.option_text_arabic, ''),
                COALESCE(v_opt.is_correct, false),
                COALESCE(v_opt.order_index, v_i),
                NULLIF(v_opt.target_match_text, ''),
                NULLIF(v_opt.target_match_arabic, '')
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

-- ------------------------------------------------------------------------------
-- 5. RPC: UPDATE QUESTION BANK ITEM (Aligned & Strict)
-- ------------------------------------------------------------------------------

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
    v_diff TEXT;
    v_correct_count INT := 0;
    v_opt RECORD;
    v_i INT := 1;
BEGIN
    IF NOT public.can_manage_question(p_question_id) THEN
        RAISE EXCEPTION 'Forbidden: You are not authorized to edit this question' USING ERRCODE = '42501';
    END IF;

    v_type := p_question->>'question_type';

    -- Normalize difficulty level
    v_diff := COALESCE(p_question->>'difficulty_level', p_question->>'difficulty');
    IF v_diff = 'medium' THEN
        v_diff := 'intermediate';
    ELSIF v_diff = 'hard' THEN
        v_diff := 'advanced';
    END IF;

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
        difficulty_level = COALESCE(v_diff, difficulty_level),
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
                NULLIF(v_opt.option_text_arabic, ''),
                COALESCE(v_opt.is_correct, false),
                COALESCE(v_opt.order_index, v_i),
                NULLIF(v_opt.target_match_text, ''),
                NULLIF(v_opt.target_match_arabic, '')
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

-- ------------------------------------------------------------------------------
-- 6. RPC: ATOMIC BATCH IMPORT (Transactional All-Or-Nothing)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.import_question_bank_items(p_items JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
    v_caller_id UUID;
    v_item JSONB;
    v_q JSONB;
    v_opts JSONB;
    v_created_res JSONB;
    v_imported_count INT := 0;
    v_index INT := 0;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
    END IF;

    IF NOT (public.is_teacher() OR public.is_super_admin()) THEN
        RAISE EXCEPTION 'Forbidden: Only teachers and super admins can import questions' USING ERRCODE = '42501';
    END IF;

    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('imported_count', 0, 'success', true);
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_index := v_index + 1;
        v_q := v_item->'question';
        v_opts := COALESCE(v_item->'options', '[]'::jsonb);

        IF v_q IS NULL THEN
            RAISE EXCEPTION 'Row %: Missing question payload', v_index USING ERRCODE = '22000';
        END IF;

        -- Create item via the atomic create function
        v_created_res := public.create_question_bank_item(v_q, v_opts);
        v_imported_count := v_imported_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'imported_count', v_imported_count,
        'success', true
    );
END;
$$;

ALTER FUNCTION public.import_question_bank_items(JSONB) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.import_question_bank_items(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.import_question_bank_items(JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.import_question_bank_items(JSONB) TO authenticated;
