-- ==============================================================================
-- WESSAM Academy - Migration 20261108000010: Quizzes & Assessments Management
-- Phase 4B: Production Quizzes & Assessment System
-- 1. Quizzes Schema Extensions (Groups, Lessons, Teachers, Review Policies)
-- 2. Question Bank Enhancements (Bilingual, Short Answer, Grading Guidelines)
-- 3. Quiz Attempts & Student Answers Schema Hardening (Snapshots, Server Timers)
-- 4. Server-Authoritative RPCs (start_quiz_attempt, save_quiz_answers, submit_quiz_attempt, grade_student_attempt, get_quiz_attempt_review)
-- 5. Anti-Tampering RLS Policies & Column Privilege Protection
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. QUIZZES TABLE ENHANCEMENTS
-- ------------------------------------------------------------------------------
ALTER TABLE public.quizzes
    ALTER COLUMN course_id DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS lesson_id UUID REFERENCES public.lessons(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS description_arabic TEXT,
    ADD COLUMN IF NOT EXISTS total_points NUMERIC(5,2) NOT NULL DEFAULT 100,
    ADD COLUMN IF NOT EXISTS show_results_immediately BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS show_correct_answers_after_submission BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_quizzes_teacher_id ON public.quizzes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_group_id ON public.quizzes(group_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_lesson_id ON public.quizzes(lesson_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_status ON public.quizzes(is_published, is_archived);

-- ------------------------------------------------------------------------------
-- 2. QUESTION BANK & OPTIONS ENHANCEMENTS
-- ------------------------------------------------------------------------------
ALTER TABLE public.question_bank
    ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS question_text_arabic TEXT,
    ADD COLUMN IF NOT EXISTS explanation_arabic TEXT,
    ADD COLUMN IF NOT EXISTS correct_answer_text TEXT,
    ADD COLUMN IF NOT EXISTS grading_guidelines TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_question_bank_teacher_id ON public.question_bank(teacher_id);

ALTER TABLE public.question_options
    ADD COLUMN IF NOT EXISTS option_text_arabic TEXT;

CREATE INDEX IF NOT EXISTS idx_question_options_q_order ON public.question_options(question_id, order_index);

ALTER TABLE public.quiz_questions
    ADD COLUMN IF NOT EXISTS points NUMERIC(5,2),
    ADD COLUMN IF NOT EXISTS is_required BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz_order ON public.quiz_questions(quiz_id, order_index);

-- ------------------------------------------------------------------------------
-- 3. QUIZ ATTEMPTS & STUDENT ANSWERS ENHANCEMENTS
-- ------------------------------------------------------------------------------
ALTER TABLE public.quiz_attempts
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'in_progress',
    ADD COLUMN IF NOT EXISTS attempt_number INT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS time_limit_seconds INT NOT NULL DEFAULT 1800,
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS total_points_possible NUMERIC(5,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS points_scored NUMERIC(5,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS percentage_score NUMERIC(5,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS requires_manual_grading BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS graded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS graded_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS teacher_feedback TEXT,
    ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_status ON public.quiz_attempts(status);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_lookup ON public.quiz_attempts(quiz_id, student_id, status);

ALTER TABLE public.student_answers
    ADD COLUMN IF NOT EXISTS teacher_feedback TEXT,
    ADD COLUMN IF NOT EXISTS graded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS graded_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_student_answers_attempt_question'
    ) THEN
        ALTER TABLE public.student_answers ADD CONSTRAINT uq_student_answers_attempt_question UNIQUE(attempt_id, question_id);
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 4. AUTHORIZATION HELPERS
-- ------------------------------------------------------------------------------

-- Helper: Verify teacher ownership or super_admin access for quizzes
CREATE OR REPLACE FUNCTION public.can_manage_quiz(p_quiz_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
BEGIN
    IF p_quiz_id IS NULL OR auth.uid() IS NULL THEN
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
        FROM public.quizzes q
        WHERE q.id = p_quiz_id
          AND (
            q.teacher_id = auth.uid()
            OR (q.teacher_id IS NULL AND q.course_id IS NOT NULL AND public.can_manage_course(q.course_id))
          )
    );
END;
$$;

ALTER FUNCTION public.can_manage_quiz(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.can_manage_quiz(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_quiz(uuid) TO authenticated;

-- Helper: Verify student eligibility for a quiz (active student + assigned to group or course)
CREATE OR REPLACE FUNCTION public.is_student_eligible_for_quiz(p_quiz_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
    v_quiz record;
BEGIN
    IF p_quiz_id IS NULL OR auth.uid() IS NULL THEN
        RETURN false;
    END IF;

    IF NOT public.is_active_student() THEN
        RETURN false;
    END IF;

    SELECT id, course_id, group_id, is_published, is_archived
    INTO v_quiz
    FROM public.quizzes
    WHERE id = p_quiz_id;

    IF NOT FOUND OR NOT v_quiz.is_published OR v_quiz.is_archived THEN
        RETURN false;
    END IF;

    -- If assigned to a specific group, student must be in that group
    IF v_quiz.group_id IS NOT NULL THEN
        RETURN public.is_student_in_group(v_quiz.group_id);
    END IF;

    -- If assigned to a course without group, student must be in a group assigned to that course
    IF v_quiz.course_id IS NOT NULL THEN
        RETURN public.is_student_assigned_to_course(v_quiz.course_id);
    END IF;

    -- General published quiz
    RETURN true;
END;
$$;

ALTER FUNCTION public.is_student_eligible_for_quiz(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_student_eligible_for_quiz(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_student_eligible_for_quiz(uuid) TO authenticated;

-- ------------------------------------------------------------------------------
-- 5. ATOMIC SERVER-AUTHORITATIVE RPC: START QUIZ ATTEMPT
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_quiz_attempt(p_quiz_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID;
    v_quiz RECORD;
    v_existing_attempt RECORD;
    v_prev_attempts_count INT := 0;
    v_new_attempt_number INT := 1;
    v_expires_at TIMESTAMPTZ;
    v_time_limit_sec INT;
    v_questions_json JSONB;
    v_new_attempt_id UUID;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Not authenticated' USING ERRCODE = '42501';
    END IF;

    IF NOT public.is_active_student() THEN
        RAISE EXCEPTION 'Forbidden: Only active students can take quizzes' USING ERRCODE = '42501';
    END IF;

    SELECT id, course_id, group_id, title, title_arabic, duration_minutes, max_attempts,
           passing_score, total_points, is_published, is_archived, start_date, end_date
    INTO v_quiz
    FROM public.quizzes
    WHERE id = p_quiz_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Assessment not found' USING ERRCODE = 'P0002';
    END IF;

    IF NOT v_quiz.is_published OR v_quiz.is_archived THEN
        RAISE EXCEPTION 'Assessment is not available' USING ERRCODE = '42501';
    END IF;

    -- Availability window verification
    IF v_quiz.start_date IS NOT NULL AND now() < v_quiz.start_date THEN
        RAISE EXCEPTION 'Assessment is not yet available' USING ERRCODE = '42501';
    END IF;

    IF v_quiz.end_date IS NOT NULL AND now() > v_quiz.end_date THEN
        RAISE EXCEPTION 'Assessment deadline has passed' USING ERRCODE = '42501';
    END IF;

    -- Cohort & course eligibility check
    IF NOT public.is_student_eligible_for_quiz(p_quiz_id) THEN
        RAISE EXCEPTION 'Forbidden: You are not enrolled in the cohort assigned to this assessment' USING ERRCODE = '42501';
    END IF;

    -- Check if student already has an active in_progress attempt
    SELECT id, attempt_number, started_at, expires_at, time_limit_seconds, question_snapshot
    INTO v_existing_attempt
    FROM public.quiz_attempts
    WHERE quiz_id = p_quiz_id
      AND student_id = v_caller_id
      AND status = 'in_progress'
    ORDER BY started_at DESC
    LIMIT 1;

    IF FOUND THEN
        -- If still within expiration time, restore active attempt seamlessly
        IF now() < v_existing_attempt.expires_at THEN
            RETURN jsonb_build_object(
                'attempt_id', v_existing_attempt.id,
                'quiz_id', p_quiz_id,
                'attempt_number', v_existing_attempt.attempt_number,
                'started_at', v_existing_attempt.started_at,
                'expires_at', v_existing_attempt.expires_at,
                'time_limit_seconds', v_existing_attempt.time_limit_seconds,
                'question_snapshot', v_existing_attempt.question_snapshot,
                'is_restored', true
            );
        ELSE
            -- Active attempt expired: auto-finalize as timed_out
            UPDATE public.quiz_attempts
            SET status = 'timed_out',
                completed_at = v_existing_attempt.expires_at
            WHERE id = v_existing_attempt.id;
        END IF;
    END IF;

    -- Check maximum attempts limit
    SELECT count(*)::int INTO v_prev_attempts_count
    FROM public.quiz_attempts
    WHERE quiz_id = p_quiz_id
      AND student_id = v_caller_id
      AND status IN ('submitted', 'graded', 'timed_out');

    IF v_prev_attempts_count >= v_quiz.max_attempts THEN
        RAISE EXCEPTION 'Maximum attempts limit of % exceeded for this assessment', v_quiz.max_attempts USING ERRCODE = '42501';
    END IF;

    v_new_attempt_number := v_prev_attempts_count + 1;
    v_time_limit_sec := COALESCE(v_quiz.duration_minutes, 30) * 60;
    v_expires_at := now() + (v_time_limit_sec * interval '1 second');

    -- Build sanitized question snapshot (NO is_correct, NO correct_answer_text)
    SELECT jsonb_agg(q_item ORDER BY q_item->>'order_index' ASC)
    INTO v_questions_json
    FROM (
        SELECT jsonb_build_object(
            'question_id', qb.id,
            'question_text', qb.question_text,
            'question_text_arabic', qb.question_text_arabic,
            'question_type', qb.question_type::text,
            'points', COALESCE(qq.points, qb.points, 1),
            'order_index', qq.order_index,
            'is_required', qq.is_required,
            'options', (
                SELECT COALESCE(jsonb_agg(
                    jsonb_build_object(
                        'id', qo.id,
                        'option_text', qo.option_text,
                        'option_text_arabic', qo.option_text_arabic,
                        'order_index', qo.order_index
                    ) ORDER BY qo.order_index ASC
                ), '[]'::jsonb)
                FROM public.question_options qo
                WHERE qo.question_id = qb.id
            )
        ) AS q_item
        FROM public.quiz_questions qq
        JOIN public.question_bank qb ON qb.id = qq.question_id
        WHERE qq.quiz_id = p_quiz_id
    ) sub;

    IF v_questions_json IS NULL OR jsonb_array_length(v_questions_json) = 0 THEN
        RAISE EXCEPTION 'Cannot start assessment: this quiz does not have any questions assigned' USING ERRCODE = '22000';
    END IF;

    -- Insert new attempt
    INSERT INTO public.quiz_attempts (
        quiz_id,
        student_id,
        attempt_number,
        started_at,
        expires_at,
        time_limit_seconds,
        question_snapshot,
        status,
        created_at
    ) VALUES (
        p_quiz_id,
        v_caller_id,
        v_new_attempt_number,
        now(),
        v_expires_at,
        v_time_limit_sec,
        v_questions_json,
        'in_progress',
        now()
    )
    RETURNING id INTO v_new_attempt_id;

    -- Audit log
    INSERT INTO public.audit_logs (
        actor_id, action, entity_type, entity_id, new_data, created_at
    ) VALUES (
        v_caller_id,
        'START_QUIZ_ATTEMPT',
        'quiz_attempt',
        v_new_attempt_id::text,
        jsonb_build_object('quiz_id', p_quiz_id, 'attempt_number', v_new_attempt_number),
        now()
    );

    RETURN jsonb_build_object(
        'attempt_id', v_new_attempt_id,
        'quiz_id', p_quiz_id,
        'attempt_number', v_new_attempt_number,
        'started_at', now(),
        'expires_at', v_expires_at,
        'time_limit_seconds', v_time_limit_sec,
        'question_snapshot', v_questions_json,
        'is_restored', false
    );
END;
$$;

ALTER FUNCTION public.start_quiz_attempt(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.start_quiz_attempt(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_quiz_attempt(UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 6. ATOMIC SERVER-AUTHORITATIVE RPC: SAVE QUIZ ANSWERS (AUTOSAVE)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_quiz_answers(
    p_attempt_id UUID,
    p_answers JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID;
    v_attempt RECORD;
    v_ans JSONB;
    v_q_id UUID;
    v_opt_id UUID;
    v_text TEXT;
    v_count INT := 0;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Not authenticated' USING ERRCODE = '42501';
    END IF;

    SELECT id, student_id, status, expires_at
    INTO v_attempt
    FROM public.quiz_attempts
    WHERE id = p_attempt_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Quiz attempt not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_attempt.student_id <> v_caller_id THEN
        RAISE EXCEPTION 'Forbidden: You do not own this attempt' USING ERRCODE = '42501';
    END IF;

    IF v_attempt.status <> 'in_progress' THEN
        RAISE EXCEPTION 'Cannot save answers on a completed or expired attempt' USING ERRCODE = '42501';
    END IF;

    -- 30-second network latency buffer on expires_at
    IF now() > v_attempt.expires_at + interval '30 seconds' THEN
        RAISE EXCEPTION 'Time limit for this assessment has expired' USING ERRCODE = '42501';
    END IF;

    IF p_answers IS NOT NULL AND jsonb_typeof(p_answers) = 'array' THEN
        FOR v_ans IN SELECT * FROM jsonb_array_elements(p_answers)
        LOOP
            v_q_id := (v_ans->>'question_id')::UUID;
            v_opt_id := NULLIF(v_ans->>'selected_option_id', '')::UUID;
            v_text := NULLIF(trim(COALESCE(v_ans->>'answer_text', '')), '');

            IF v_q_id IS NOT NULL THEN
                INSERT INTO public.student_answers (
                    attempt_id,
                    question_id,
                    selected_option_id,
                    answer_text,
                    answered_at
                ) VALUES (
                    p_attempt_id,
                    v_q_id,
                    v_opt_id,
                    v_text,
                    now()
                )
                ON CONFLICT (attempt_id, question_id)
                DO UPDATE SET
                    selected_option_id = EXCLUDED.selected_option_id,
                    answer_text = EXCLUDED.answer_text,
                    answered_at = now();

                v_count := v_count + 1;
            END IF;
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'saved_count', v_count,
        'attempt_id', p_attempt_id
    );
END;
$$;

ALTER FUNCTION public.save_quiz_answers(UUID, JSONB) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.save_quiz_answers(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_quiz_answers(UUID, JSONB) TO authenticated;

-- ------------------------------------------------------------------------------
-- 7. ATOMIC SERVER-AUTHORITATIVE RPC: SUBMIT & AUTO-GRADE ATTEMPT
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_quiz_attempt(
    p_attempt_id UUID,
    p_answers JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID;
    v_attempt RECORD;
    v_quiz RECORD;
    v_q_snapshot RECORD;
    v_ans RECORD;
    v_is_correct BOOLEAN;
    v_points_awarded NUMERIC(5,2);
    v_question_points NUMERIC(5,2);
    v_total_possible NUMERIC(5,2) := 0;
    v_total_scored NUMERIC(5,2) := 0;
    v_percentage NUMERIC(5,2) := 0;
    v_has_pending_manual BOOLEAN := false;
    v_final_status TEXT;
    v_is_passed BOOLEAN := false;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Not authenticated' USING ERRCODE = '42501';
    END IF;

    SELECT id, quiz_id, student_id, status, expires_at, question_snapshot
    INTO v_attempt
    FROM public.quiz_attempts
    WHERE id = p_attempt_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Quiz attempt not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_attempt.student_id <> v_caller_id THEN
        RAISE EXCEPTION 'Forbidden: You do not own this attempt' USING ERRCODE = '42501';
    END IF;

    -- Idempotent duplicate submission handling
    IF v_attempt.status IN ('submitted', 'graded') THEN
        RETURN jsonb_build_object(
            'attempt_id', p_attempt_id,
            'status', v_attempt.status,
            'already_submitted', true
        );
    END IF;

    IF v_attempt.status <> 'in_progress' THEN
        RAISE EXCEPTION 'Attempt is not in an active progress state' USING ERRCODE = '42501';
    END IF;

    -- 60-second grace buffer for final submission packet delivery
    IF now() > v_attempt.expires_at + interval '60 seconds' THEN
        -- Mark as timed_out
        UPDATE public.quiz_attempts
        SET status = 'timed_out',
            completed_at = v_attempt.expires_at
        WHERE id = p_attempt_id;

        RAISE EXCEPTION 'Submission deadline has passed' USING ERRCODE = '42501';
    END IF;

    SELECT id, passing_score, total_points, show_results_immediately, show_correct_answers_after_submission
    INTO v_quiz
    FROM public.quizzes
    WHERE id = v_attempt.quiz_id;

    -- If fresh answers were passed in final submit call, save them first
    IF p_answers IS NOT NULL AND jsonb_typeof(p_answers) = 'array' THEN
        PERFORM public.save_quiz_answers(p_attempt_id, p_answers);
    END IF;

    -- Auto-grade questions from snapshot against server ground-truth
    FOR v_q_snapshot IN SELECT * FROM jsonb_to_recordset(v_attempt.question_snapshot) AS x(
        question_id UUID,
        question_type TEXT,
        points NUMERIC(5,2)
    )
    LOOP
        v_question_points := COALESCE(v_q_snapshot.points, 1);
        v_total_possible := v_total_possible + v_question_points;

        SELECT selected_option_id, answer_text
        INTO v_ans
        FROM public.student_answers
        WHERE attempt_id = p_attempt_id
          AND question_id = v_q_snapshot.question_id;

        IF v_q_snapshot.question_type IN ('multiple_choice', 'true_false') THEN
            IF v_ans.selected_option_id IS NOT NULL THEN
                -- Compare with server question_options table
                SELECT is_correct INTO v_is_correct
                FROM public.question_options
                WHERE id = v_ans.selected_option_id
                  AND question_id = v_q_snapshot.question_id;

                IF v_is_correct IS TRUE THEN
                    v_points_awarded := v_question_points;
                    v_total_scored := v_total_scored + v_points_awarded;
                ELSE
                    v_is_correct := false;
                    v_points_awarded := 0;
                END IF;
            ELSE
                v_is_correct := false;
                v_points_awarded := 0;
            END IF;

            UPDATE public.student_answers
            SET is_correct = v_is_correct,
                points_awarded = v_points_awarded,
                needs_review = false
            WHERE attempt_id = p_attempt_id
              AND question_id = v_q_snapshot.question_id;

        ELSIF v_q_snapshot.question_type = 'short_answer' THEN
            -- Short answer requires manual teacher review
            v_has_pending_manual := true;
            UPDATE public.student_answers
            SET is_correct = NULL,
                points_awarded = 0,
                needs_review = true
            WHERE attempt_id = p_attempt_id
              AND question_id = v_q_snapshot.question_id;
        END IF;
    END LOOP;

    IF v_total_possible > 0 THEN
        v_percentage := round((v_total_scored / v_total_possible) * 100, 2);
    ELSE
        v_percentage := 100;
    END IF;

    IF v_has_pending_manual THEN
        v_final_status := 'submitted';
        v_is_passed := NULL;
    ELSE
        v_final_status := 'graded';
        v_is_passed := (v_percentage >= v_quiz.passing_score);
    END IF;

    UPDATE public.quiz_attempts
    SET status = v_final_status,
        submitted_at = now(),
        completed_at = now(),
        score = v_total_scored,
        points_scored = v_total_scored,
        total_points_possible = v_total_possible,
        percentage_score = v_percentage,
        is_passed = v_is_passed,
        requires_manual_grading = v_has_pending_manual
    WHERE id = p_attempt_id;

    -- Audit log
    INSERT INTO public.audit_logs (
        actor_id, action, entity_type, entity_id, new_data, created_at
    ) VALUES (
        v_caller_id,
        'SUBMIT_QUIZ_ATTEMPT',
        'quiz_attempt',
        p_attempt_id::text,
        jsonb_build_object(
            'status', v_final_status,
            'score', v_total_scored,
            'percentage', v_percentage,
            'has_pending_manual', v_has_pending_manual
        ),
        now()
    );

    RETURN jsonb_build_object(
        'attempt_id', p_attempt_id,
        'status', v_final_status,
        'score', CASE WHEN v_quiz.show_results_immediately THEN v_total_scored ELSE NULL END,
        'percentage_score', CASE WHEN v_quiz.show_results_immediately THEN v_percentage ELSE NULL END,
        'total_possible', v_total_possible,
        'is_passed', CASE WHEN v_quiz.show_results_immediately THEN v_is_passed ELSE NULL END,
        'requires_manual_grading', v_has_pending_manual,
        'submitted_at', now()
    );
END;
$$;

ALTER FUNCTION public.submit_quiz_attempt(UUID, JSONB) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.submit_quiz_attempt(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_quiz_attempt(UUID, JSONB) TO authenticated;

-- ------------------------------------------------------------------------------
-- 8. ATOMIC SERVER-AUTHORITATIVE RPC: MANUAL GRADING OF SHORT ANSWERS
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.grade_student_attempt(
    p_attempt_id UUID,
    p_grades JSONB,
    p_teacher_feedback TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID;
    v_attempt RECORD;
    v_quiz RECORD;
    v_grade_item JSONB;
    v_q_id UUID;
    v_awarded NUMERIC(5,2);
    v_item_feedback TEXT;
    v_new_total_scored NUMERIC(5,2) := 0;
    v_new_total_possible NUMERIC(5,2) := 0;
    v_new_percentage NUMERIC(5,2) := 0;
    v_is_passed BOOLEAN;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Not authenticated' USING ERRCODE = '42501';
    END IF;

    SELECT id, quiz_id, student_id, status, question_snapshot
    INTO v_attempt
    FROM public.quiz_attempts
    WHERE id = p_attempt_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Quiz attempt not found' USING ERRCODE = 'P0002';
    END IF;

    SELECT id, teacher_id, passing_score
    INTO v_quiz
    FROM public.quizzes
    WHERE id = v_attempt.quiz_id;

    IF NOT public.can_manage_quiz(v_quiz.id) THEN
        RAISE EXCEPTION 'Forbidden: You do not have permission to grade this assessment' USING ERRCODE = '42501';
    END IF;

    IF v_attempt.status NOT IN ('submitted', 'graded') THEN
        RAISE EXCEPTION 'Cannot grade an attempt with status "%"', v_attempt.status USING ERRCODE = '22000';
    END IF;

    -- Apply manual grades per question
    IF p_grades IS NOT NULL AND jsonb_typeof(p_grades) = 'array' THEN
        FOR v_grade_item IN SELECT * FROM jsonb_array_elements(p_grades)
        LOOP
            v_q_id := (v_grade_item->>'question_id')::UUID;
            v_awarded := (v_grade_item->>'points_awarded')::NUMERIC(5,2);
            v_item_feedback := NULLIF(trim(COALESCE(v_grade_item->>'feedback', '')), '');

            IF v_q_id IS NOT NULL AND v_awarded IS NOT NULL THEN
                UPDATE public.student_answers
                SET points_awarded = v_awarded,
                    teacher_feedback = v_item_feedback,
                    is_correct = (v_awarded > 0),
                    needs_review = false,
                    graded_by = v_caller_id,
                    graded_at = now()
                WHERE attempt_id = p_attempt_id
                  AND question_id = v_q_id;
            END IF;
        END LOOP;
    END IF;

    -- Recalculate total points scored from student_answers
    SELECT COALESCE(sum(points_awarded), 0)
    INTO v_new_total_scored
    FROM public.student_answers
    WHERE attempt_id = p_attempt_id;

    -- Calculate total possible points from question_snapshot
    SELECT COALESCE(sum((x->>'points')::NUMERIC(5,2)), 0)
    INTO v_new_total_possible
    FROM jsonb_array_elements(v_attempt.question_snapshot) AS x;

    IF v_new_total_possible > 0 THEN
        v_new_percentage := round((v_new_total_scored / v_new_total_possible) * 100, 2);
    ELSE
        v_new_percentage := 100;
    END IF;

    v_is_passed := (v_new_percentage >= v_quiz.passing_score);

    UPDATE public.quiz_attempts
    SET status = 'graded',
        score = v_new_total_scored,
        points_scored = v_new_total_scored,
        total_points_possible = v_new_total_possible,
        percentage_score = v_new_percentage,
        is_passed = v_is_passed,
        requires_manual_grading = false,
        graded_by = v_caller_id,
        graded_at = now(),
        teacher_feedback = NULLIF(trim(COALESCE(p_teacher_feedback, '')), '')
    WHERE id = p_attempt_id;

    -- Audit log
    INSERT INTO public.audit_logs (
        actor_id, action, entity_type, entity_id, new_data, created_at
    ) VALUES (
        v_caller_id,
        'GRADE_QUIZ_ATTEMPT',
        'quiz_attempt',
        p_attempt_id::text,
        jsonb_build_object(
            'score', v_new_total_scored,
            'percentage', v_new_percentage,
            'is_passed', v_is_passed
        ),
        now()
    );

    RETURN jsonb_build_object(
        'attempt_id', p_attempt_id,
        'status', 'graded',
        'points_scored', v_new_total_scored,
        'total_possible', v_new_total_possible,
        'percentage_score', v_new_percentage,
        'is_passed', v_is_passed
    );
END;
$$;

ALTER FUNCTION public.grade_student_attempt(UUID, JSONB, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.grade_student_attempt(UUID, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grade_student_attempt(UUID, JSONB, TEXT) TO authenticated;

-- ------------------------------------------------------------------------------
-- 9. ATOMIC SERVER-AUTHORITATIVE RPC: ATTEMPT REVIEW WITH ANSWER PROTECTION
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_quiz_attempt_review(p_attempt_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID;
    v_attempt RECORD;
    v_quiz RECORD;
    v_is_teacher_or_admin BOOLEAN;
    v_allow_correct_answers BOOLEAN;
    v_allow_scores BOOLEAN;
    v_questions_review JSONB;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Not authenticated' USING ERRCODE = '42501';
    END IF;

    SELECT id, quiz_id, student_id, status, started_at, completed_at, score,
           points_scored, total_points_possible, percentage_score, is_passed,
           requires_manual_grading, teacher_feedback, question_snapshot
    INTO v_attempt
    FROM public.quiz_attempts
    WHERE id = p_attempt_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Quiz attempt not found' USING ERRCODE = 'P0002';
    END IF;

    SELECT id, teacher_id, title, title_arabic, passing_score, total_points,
           show_results_immediately, show_correct_answers_after_submission
    INTO v_quiz
    FROM public.quizzes
    WHERE id = v_attempt.quiz_id;

    v_is_teacher_or_admin := public.is_super_admin() OR (public.is_teacher() AND public.can_manage_quiz(v_quiz.id));

    IF NOT v_is_teacher_or_admin THEN
        IF v_attempt.student_id <> v_caller_id THEN
            RAISE EXCEPTION 'Forbidden: You are not authorized to view this attempt review' USING ERRCODE = '42501';
        END IF;

        IF v_attempt.status = 'in_progress' THEN
            RAISE EXCEPTION 'Cannot review an active in-progress assessment' USING ERRCODE = '42501';
        END IF;
    END IF;

    v_allow_correct_answers := v_is_teacher_or_admin OR v_quiz.show_correct_answers_after_submission;
    v_allow_scores := v_is_teacher_or_admin OR v_quiz.show_results_immediately OR v_attempt.status = 'graded';

    -- Build reviewed questions
    SELECT jsonb_agg(q_item ORDER BY (q_item->>'order_index')::int ASC)
    INTO v_questions_review
    FROM (
        SELECT jsonb_build_object(
            'question_id', qb.id,
            'question_text', qb.question_text,
            'question_text_arabic', qb.question_text_arabic,
            'question_type', qb.question_type::text,
            'points', (x->>'points')::NUMERIC(5,2),
            'order_index', (x->>'order_index')::int,
            'student_selected_option_id', sa.selected_option_id,
            'student_answer_text', sa.answer_text,
            'points_awarded', CASE WHEN v_allow_scores THEN sa.points_awarded ELSE NULL END,
            'is_correct', CASE WHEN v_allow_correct_answers THEN sa.is_correct ELSE NULL END,
            'teacher_feedback', sa.teacher_feedback,
            'needs_review', sa.needs_review,
            'explanation', CASE WHEN v_allow_correct_answers THEN qb.explanation ELSE NULL END,
            'explanation_arabic', CASE WHEN v_allow_correct_answers THEN qb.explanation_arabic ELSE NULL END,
            'correct_answer_text', CASE WHEN v_allow_correct_answers THEN qb.correct_answer_text ELSE NULL END,
            'options', (
                SELECT COALESCE(jsonb_agg(
                    jsonb_build_object(
                        'id', qo.id,
                        'option_text', qo.option_text,
                        'option_text_arabic', qo.option_text_arabic,
                        'order_index', qo.order_index,
                        'is_correct', CASE WHEN v_allow_correct_answers THEN qo.is_correct ELSE NULL END
                    ) ORDER BY qo.order_index ASC
                ), '[]'::jsonb)
                FROM public.question_options qo
                WHERE qo.question_id = qb.id
            )
        ) AS q_item
        FROM jsonb_array_elements(v_attempt.question_snapshot) AS x
        JOIN public.question_bank qb ON qb.id = (x->>'question_id')::UUID
        LEFT JOIN public.student_answers sa ON sa.attempt_id = p_attempt_id AND sa.question_id = qb.id
    ) sub;

    RETURN jsonb_build_object(
        'attempt_id', v_attempt.id,
        'quiz_id', v_quiz.id,
        'quiz_title', v_quiz.title,
        'quiz_title_arabic', v_quiz.title_arabic,
        'status', v_attempt.status,
        'started_at', v_attempt.started_at,
        'completed_at', v_attempt.completed_at,
        'score', CASE WHEN v_allow_scores THEN v_attempt.points_scored ELSE NULL END,
        'total_possible', v_attempt.total_points_possible,
        'percentage_score', CASE WHEN v_allow_scores THEN v_attempt.percentage_score ELSE NULL END,
        'is_passed', CASE WHEN v_allow_scores THEN v_attempt.is_passed ELSE NULL END,
        'requires_manual_grading', v_attempt.requires_manual_grading,
        'teacher_feedback', v_attempt.teacher_feedback,
        'allow_correct_answers', v_allow_correct_answers,
        'allow_scores', v_allow_scores,
        'questions', v_questions_review
    );
END;
$$;

ALTER FUNCTION public.get_quiz_attempt_review(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_quiz_attempt_review(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_quiz_attempt_review(UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 10. REVISED RLS POLICIES FOR QUIZZES & ATTEMPTS
-- ------------------------------------------------------------------------------

-- Quizzes RLS
DROP POLICY IF EXISTS "Teachers manage quizzes" ON public.quizzes;
DROP POLICY IF EXISTS "Students view published quizzes" ON public.quizzes;

ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers and admins manage quizzes" ON public.quizzes
    FOR ALL TO authenticated
    USING (
        public.is_super_admin()
        OR (public.is_teacher() AND (teacher_id = auth.uid() OR teacher_id IS NULL))
    )
    WITH CHECK (
        public.is_super_admin()
        OR (public.is_teacher() AND (teacher_id = auth.uid() OR teacher_id IS NULL))
    );

CREATE POLICY "Students view assigned published quizzes" ON public.quizzes
    FOR SELECT TO authenticated
    USING (
        public.is_student_eligible_for_quiz(id)
    );

-- Question Bank RLS
DROP POLICY IF EXISTS "Teachers manage question bank" ON public.question_bank;
ALTER TABLE public.question_bank ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers and admins manage question bank" ON public.question_bank
    FOR ALL TO authenticated
    USING (public.is_teacher() OR public.is_super_admin())
    WITH CHECK (public.is_teacher() OR public.is_super_admin());

-- Question Options RLS
DROP POLICY IF EXISTS "Teachers manage question options" ON public.question_options;
ALTER TABLE public.question_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers and admins manage question options" ON public.question_options
    FOR ALL TO authenticated
    USING (public.is_teacher() OR public.is_super_admin())
    WITH CHECK (public.is_teacher() OR public.is_super_admin());

-- Quiz Questions RLS
DROP POLICY IF EXISTS "Teachers manage quiz questions" ON public.quiz_questions;
DROP POLICY IF EXISTS "Students view questions for accessible quizzes" ON public.quiz_questions;
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers and admins manage quiz questions" ON public.quiz_questions
    FOR ALL TO authenticated
    USING (public.is_teacher() OR public.is_super_admin())
    WITH CHECK (public.is_teacher() OR public.is_super_admin());

-- Quiz Attempts RLS
DROP POLICY IF EXISTS "Teachers view and grade quiz attempts" ON public.quiz_attempts;
DROP POLICY IF EXISTS "Students view own quiz attempts" ON public.quiz_attempts;
DROP POLICY IF EXISTS "Students start own quiz attempt" ON public.quiz_attempts;

ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers view quiz attempts" ON public.quiz_attempts
    FOR SELECT TO authenticated
    USING (
        public.is_super_admin()
        OR (public.is_teacher() AND public.can_manage_quiz(quiz_id))
    );

CREATE POLICY "Teachers update quiz attempts" ON public.quiz_attempts
    FOR UPDATE TO authenticated
    USING (
        public.is_super_admin()
        OR (public.is_teacher() AND public.can_manage_quiz(quiz_id))
    )
    WITH CHECK (
        public.is_super_admin()
        OR (public.is_teacher() AND public.can_manage_quiz(quiz_id))
    );

CREATE POLICY "Students view own quiz attempts" ON public.quiz_attempts
    FOR SELECT TO authenticated
    USING (
        student_id = auth.uid() AND public.is_active_student()
    );

-- Student Answers RLS
DROP POLICY IF EXISTS "Students record answers on own attempt" ON public.student_answers;
DROP POLICY IF EXISTS "Students view own submitted answers" ON public.student_answers;

ALTER TABLE public.student_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers view and grade student answers" ON public.student_answers
    FOR ALL TO authenticated
    USING (
        public.is_super_admin()
        OR (
            public.is_teacher()
            AND EXISTS (
                SELECT 1 FROM public.quiz_attempts qa
                WHERE qa.id = student_answers.attempt_id
                  AND public.can_manage_quiz(qa.quiz_id)
            )
        )
    );

CREATE POLICY "Students view own student answers" ON public.student_answers
    FOR SELECT TO authenticated
    USING (
        public.is_active_student()
        AND EXISTS (
            SELECT 1 FROM public.quiz_attempts qa
            WHERE qa.id = student_answers.attempt_id
              AND qa.student_id = auth.uid()
        )
    );

-- ------------------------------------------------------------------------------
-- 11. TABLE GRANTS & ANONYMOUS ACCESS RESTRICTIONS
-- ------------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quizzes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_bank TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_options TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_questions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_attempts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_answers TO authenticated;

REVOKE ALL ON public.quizzes FROM anon;
REVOKE ALL ON public.question_bank FROM anon;
REVOKE ALL ON public.question_options FROM anon;
REVOKE ALL ON public.quiz_questions FROM anon;
REVOKE ALL ON public.quiz_attempts FROM anon;
REVOKE ALL ON public.student_answers FROM anon;
