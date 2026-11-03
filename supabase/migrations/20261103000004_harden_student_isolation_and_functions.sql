-- ==============================================================================
-- WESSAM Academy — Migration 4: Harden Student Isolation, Status Verification & Function Security
-- Version: 20261103000004
--
-- Depends on:
--   20261103000001_initial_schema.sql
--   20261103000002_add_super_admin_role.sql
--   20261103000003_super_admin_functions_and_rpc.sql
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. HARDEN SECURITY DEFINER FUNCTIONS (Empty search_path to prevent hijacking)
-- ------------------------------------------------------------------------------

-- Update is_teacher to use SET search_path = '' and fully qualified names
CREATE OR REPLACE FUNCTION public.is_teacher()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('super_admin', 'teacher') AND status = 'active'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_teacher() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_teacher() TO authenticated;

-- Update is_super_admin to use SET search_path = ''
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'super_admin' AND status = 'active'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

-- Helper to verify that current user is an active student
CREATE OR REPLACE FUNCTION public.is_active_student()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'student' AND status = 'active'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_active_student() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_student() TO authenticated;

-- Harden is_student_in_group:
-- 1. Sets search_path = ''
-- 2. Verifies student is in the group AND has active profile status
CREATE OR REPLACE FUNCTION public.is_student_in_group(target_group_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF target_group_id IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.group_students gs
    JOIN public.profiles p ON p.id = gs.student_id
    WHERE gs.group_id = target_group_id
      AND gs.student_id = auth.uid()
      AND p.role = 'student'
      AND p.status = 'active'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_student_in_group(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_student_in_group(UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 2. HARDEN STUDENT ISOLATION POLICIES (ELIMINATING BROAD ACCESS)
-- ------------------------------------------------------------------------------

-- (A) Live Sessions: Eliminate 'group_id IS NULL' broad student access.
-- Students may ONLY view live sessions specifically scheduled for groups they belong to.
DROP POLICY IF EXISTS "Students view assigned live sessions" ON public.live_sessions;
CREATE POLICY "Students view assigned live sessions" ON public.live_sessions
    FOR SELECT USING (
      group_id IS NOT NULL AND public.is_student_in_group(group_id)
    );

-- (B) Quizzes: Restrict to published quizzes in courses assigned to the student's cohort.
DROP POLICY IF EXISTS "Students view published quizzes" ON public.quizzes;
CREATE POLICY "Students view published quizzes" ON public.quizzes
    FOR SELECT USING (
      is_published = true AND EXISTS (
        SELECT 1 FROM public.group_courses gc
        WHERE gc.course_id = quizzes.course_id
          AND public.is_student_in_group(gc.group_id)
      )
    );

-- (C) Lesson Resources: Restrict to resources of published lessons in courses assigned to student's cohort.
DROP POLICY IF EXISTS "Students view resources for accessible lessons" ON public.lesson_resources;
CREATE POLICY "Students view resources for accessible lessons" ON public.lesson_resources
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM public.lessons l
        JOIN public.courses c ON c.id = l.course_id
        JOIN public.group_courses gc ON gc.course_id = c.id
        WHERE l.id = lesson_resources.lesson_id
          AND l.is_published = true
          AND c.is_published = true
          AND public.is_student_in_group(gc.group_id)
      )
    );

-- ------------------------------------------------------------------------------
-- 3. HARDEN ACTIVE STATUS ENFORCEMENT ON STUDENT ACTIONS & RECORDS
-- ------------------------------------------------------------------------------

-- (D) Student Academic Profiles: Require active student status
DROP POLICY IF EXISTS "Students view own academic profile" ON public.student_academic_profiles;
CREATE POLICY "Students view own academic profile" ON public.student_academic_profiles
    FOR SELECT USING (
      profile_id = auth.uid() AND public.is_active_student()
    );

-- (E) Lesson Progress: Require active student status to view or record progress
DROP POLICY IF EXISTS "Students view and record own lesson progress" ON public.lesson_progress;
CREATE POLICY "Students view and record own lesson progress" ON public.lesson_progress
    FOR ALL USING (
      student_id = auth.uid() AND public.is_active_student()
    )
    WITH CHECK (
      student_id = auth.uid() AND public.is_active_student()
    );

-- (F) Attendance: Require active student status to view attendance records
DROP POLICY IF EXISTS "Students view own attendance" ON public.attendance;
CREATE POLICY "Students view own attendance" ON public.attendance
    FOR SELECT USING (
      student_id = auth.uid() AND public.is_active_student()
    );

-- (G) Quiz Attempts: Inactive or suspended students cannot view or start attempts
DROP POLICY IF EXISTS "Students view own quiz attempts" ON public.quiz_attempts;
CREATE POLICY "Students view own quiz attempts" ON public.quiz_attempts
    FOR SELECT USING (
      student_id = auth.uid() AND public.is_active_student()
    );

DROP POLICY IF EXISTS "Students start own quiz attempt" ON public.quiz_attempts;
CREATE POLICY "Students start own quiz attempt" ON public.quiz_attempts
    FOR INSERT WITH CHECK (
      student_id = auth.uid() AND public.is_active_student()
    );

-- (H) Submissions: Inactive or suspended students cannot view, create, or update submissions
DROP POLICY IF EXISTS "Students view own submissions" ON public.submissions;
CREATE POLICY "Students view own submissions" ON public.submissions
    FOR SELECT USING (
      student_id = auth.uid() AND public.is_active_student()
    );

DROP POLICY IF EXISTS "Students create own initial submission" ON public.submissions;
CREATE POLICY "Students create own initial submission" ON public.submissions
    FOR INSERT WITH CHECK (
      student_id = auth.uid() AND
      public.is_active_student() AND
      score IS NULL AND
      graded_at IS NULL AND
      graded_by IS NULL AND
      teacher_feedback IS NULL
    );

DROP POLICY IF EXISTS "Students update own submission before grading" ON public.submissions;
CREATE POLICY "Students update own submission before grading" ON public.submissions
    FOR UPDATE USING (
      student_id = auth.uid() AND
      public.is_active_student() AND
      graded_at IS NULL
    )
    WITH CHECK (
      student_id = auth.uid() AND
      public.is_active_student() AND
      score IS NULL AND
      graded_at IS NULL AND
      graded_by IS NULL AND
      teacher_feedback IS NULL
    );
