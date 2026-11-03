-- ==============================================================================
-- WESSAM Academy — Migration 5: Comprehensive RLS Audit & Active-Student Enforcement
-- Version: 20261103000005
--
-- Objective:
-- Enforce strict active-student status ('active') and cohort-membership verification
-- across 100% of student-facing tables and policies.
-- Eliminates all remaining permissive bypasses (such as target_group_id IS NULL in assignments,
-- direct joins on group_students, and notification visibility for inactive/suspended accounts).
--
-- Safety Guarantees:
-- 1. Additive migration — does not drop tables, columns, or data.
-- 2. Fully idempotent via DROP POLICY IF EXISTS before CREATE POLICY.
-- 3. Avoids RLS recursion by leveraging SECURITY DEFINER helpers with SET search_path = ''.
-- 4. Preserves all teacher and super_admin management, creation, and grading permissions.
-- 5. Preserves unblocked read access to own profile row for AuthContext suspension detection.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. VERIFY / HARDEN SECURITY DEFINER HELPERS
-- ------------------------------------------------------------------------------

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
-- 2. AUDIT & REPAIR: GROUPS & GROUP MEMBERSHIPS
-- ------------------------------------------------------------------------------

-- (A) Groups
DROP POLICY IF EXISTS "Students view groups they belong to" ON public.groups;
CREATE POLICY "Students view groups they belong to" ON public.groups
    FOR SELECT USING (
      public.is_student_in_group(id)
    );

-- (B) Group Students (Junction)
-- Old 000001 policy only checked student_id = auth.uid() without verifying active status.
DROP POLICY IF EXISTS "Students view their own group memberships" ON public.group_students;
CREATE POLICY "Students view their own group memberships" ON public.group_students
    FOR SELECT USING (
      student_id = auth.uid() AND public.is_active_student()
    );

-- (C) Group Courses
DROP POLICY IF EXISTS "Students view assigned group courses" ON public.group_courses;
CREATE POLICY "Students view assigned group courses" ON public.group_courses
    FOR SELECT USING (
      public.is_student_in_group(group_id)
    );

-- ------------------------------------------------------------------------------
-- 3. AUDIT & REPAIR: ACADEMIC CURRICULUM (COURSES, UNITS, LESSONS, RESOURCES)
-- ------------------------------------------------------------------------------

-- (D) Courses
-- Replaces old 000001 direct join with is_student_in_group helper to ensure active status.
DROP POLICY IF EXISTS "Students view assigned or published courses" ON public.courses;
CREATE POLICY "Students view assigned or published courses" ON public.courses
    FOR SELECT USING (
      is_published = true AND EXISTS (
        SELECT 1 FROM public.group_courses gc
        WHERE gc.course_id = courses.id
          AND public.is_student_in_group(gc.group_id)
      )
    );

-- (E) Course Units
DROP POLICY IF EXISTS "Students view units of accessible courses" ON public.course_units;
CREATE POLICY "Students view units of accessible courses" ON public.course_units
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM public.courses c
        JOIN public.group_courses gc ON gc.course_id = c.id
        WHERE c.id = course_units.course_id
          AND c.is_published = true
          AND public.is_student_in_group(gc.group_id)
      )
    );

-- (F) Lessons
DROP POLICY IF EXISTS "Students view published lessons" ON public.lessons;
CREATE POLICY "Students view published lessons" ON public.lessons
    FOR SELECT USING (
      is_published = true AND EXISTS (
        SELECT 1 FROM public.courses c
        JOIN public.group_courses gc ON gc.course_id = c.id
        WHERE c.id = lessons.course_id
          AND c.is_published = true
          AND public.is_student_in_group(gc.group_id)
      )
    );

-- (G) Lesson Resources
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

-- (H) Lesson Progress
DROP POLICY IF EXISTS "Students view and record own lesson progress" ON public.lesson_progress;
CREATE POLICY "Students view and record own lesson progress" ON public.lesson_progress
    FOR ALL USING (
      student_id = auth.uid() AND public.is_active_student()
    )
    WITH CHECK (
      student_id = auth.uid() AND public.is_active_student()
    );

-- ------------------------------------------------------------------------------
-- 4. AUDIT & REPAIR: LIVE SESSIONS & ATTENDANCE
-- ------------------------------------------------------------------------------

-- (I) Live Sessions: Prohibit group_id IS NULL from leaking to unassigned or inactive students.
DROP POLICY IF EXISTS "Students view assigned live sessions" ON public.live_sessions;
CREATE POLICY "Students view assigned live sessions" ON public.live_sessions
    FOR SELECT USING (
      group_id IS NOT NULL AND public.is_student_in_group(group_id)
    );

-- (J) Attendance
DROP POLICY IF EXISTS "Students view own attendance" ON public.attendance;
CREATE POLICY "Students view own attendance" ON public.attendance
    FOR SELECT USING (
      student_id = auth.uid() AND public.is_active_student()
    );

-- ------------------------------------------------------------------------------
-- 5. AUDIT & REPAIR: ASSIGNMENTS & SUBMISSIONS
-- ------------------------------------------------------------------------------

-- (K) Assignments
-- Old 000001 had "target_group_id IS NULL OR public.is_student_in_group(target_group_id)".
-- If target_group_id is NULL (course-wide assignment), student MUST be an active student
-- enrolled in a group assigned to that course!
DROP POLICY IF EXISTS "Students view published assignments" ON public.assignments;
CREATE POLICY "Students view published assignments" ON public.assignments
    FOR SELECT USING (
      is_published = true AND public.is_active_student() AND (
        (target_group_id IS NOT NULL AND public.is_student_in_group(target_group_id))
        OR
        (target_group_id IS NULL AND EXISTS (
          SELECT 1 FROM public.group_courses gc
          WHERE gc.course_id = assignments.course_id
            AND public.is_student_in_group(gc.group_id)
        ))
      )
    );

-- (L) Submissions
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
      teacher_feedback IS NULL AND
      EXISTS (
        SELECT 1 FROM public.assignments a
        WHERE a.id = submissions.assignment_id
          AND a.is_published = true
          AND (
            (a.target_group_id IS NOT NULL AND public.is_student_in_group(a.target_group_id))
            OR
            (a.target_group_id IS NULL AND EXISTS (
              SELECT 1 FROM public.group_courses gc
              WHERE gc.course_id = a.course_id
                AND public.is_student_in_group(gc.group_id)
            ))
          )
      )
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

-- ------------------------------------------------------------------------------
-- 6. AUDIT & REPAIR: QUIZZES, QUESTIONS, ATTEMPTS & STUDENT ANSWERS
-- ------------------------------------------------------------------------------

-- (M) Quizzes
DROP POLICY IF EXISTS "Students view published quizzes" ON public.quizzes;
CREATE POLICY "Students view published quizzes" ON public.quizzes
    FOR SELECT USING (
      is_published = true AND EXISTS (
        SELECT 1 FROM public.group_courses gc
        WHERE gc.course_id = quizzes.course_id
          AND public.is_student_in_group(gc.group_id)
      )
    );

-- (N) Quiz Questions
DROP POLICY IF EXISTS "Students view questions for accessible quizzes" ON public.quiz_questions;
CREATE POLICY "Students view questions for accessible quizzes" ON public.quiz_questions
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM public.quizzes q
        JOIN public.group_courses gc ON gc.course_id = q.course_id
        WHERE q.id = quiz_questions.quiz_id
          AND q.is_published = true
          AND public.is_student_in_group(gc.group_id)
      )
    );

-- Note: public.question_options remains TEACHER-ONLY to prevent student exposure of 'is_correct' column.

-- (O) Quiz Attempts
DROP POLICY IF EXISTS "Students view own quiz attempts" ON public.quiz_attempts;
CREATE POLICY "Students view own quiz attempts" ON public.quiz_attempts
    FOR SELECT USING (
      student_id = auth.uid() AND public.is_active_student()
    );

DROP POLICY IF EXISTS "Students start own quiz attempt" ON public.quiz_attempts;
CREATE POLICY "Students start own quiz attempt" ON public.quiz_attempts
    FOR INSERT WITH CHECK (
      student_id = auth.uid() AND
      public.is_active_student() AND
      EXISTS (
        SELECT 1 FROM public.quizzes q
        JOIN public.group_courses gc ON gc.course_id = q.course_id
        WHERE q.id = quiz_attempts.quiz_id
          AND q.is_published = true
          AND public.is_student_in_group(gc.group_id)
      )
    );

-- (P) Student Answers
DROP POLICY IF EXISTS "Students record answers on own attempt" ON public.student_answers;
CREATE POLICY "Students record answers on own attempt" ON public.student_answers
    FOR INSERT WITH CHECK (
      public.is_active_student() AND
      EXISTS (
        SELECT 1 FROM public.quiz_attempts qa
        WHERE qa.id = student_answers.attempt_id
          AND qa.student_id = auth.uid()
          AND qa.completed_at IS NULL
      )
    );

DROP POLICY IF EXISTS "Students view own submitted answers" ON public.student_answers;
CREATE POLICY "Students view own submitted answers" ON public.student_answers
    FOR SELECT USING (
      public.is_active_student() AND
      EXISTS (
        SELECT 1 FROM public.quiz_attempts qa
        WHERE qa.id = student_answers.attempt_id
          AND qa.student_id = auth.uid()
      )
    );

-- ------------------------------------------------------------------------------
-- 7. AUDIT & REPAIR: NOTIFICATIONS & ACADEMIC PROFILES
-- ------------------------------------------------------------------------------

-- (Q) Student Academic Profiles
DROP POLICY IF EXISTS "Students view own academic profile" ON public.student_academic_profiles;
CREATE POLICY "Students view own academic profile" ON public.student_academic_profiles
    FOR SELECT USING (
      profile_id = auth.uid() AND public.is_active_student()
    );

-- (R) Notifications: Inactive/suspended students cannot view notifications
DROP POLICY IF EXISTS "Users view notifications addressed to them" ON public.notifications;
CREATE POLICY "Users view notifications addressed to them" ON public.notifications
    FOR SELECT USING (
      (public.is_teacher() OR public.is_active_student()) AND
      EXISTS (
        SELECT 1 FROM public.notification_recipients nr
        WHERE nr.notification_id = notifications.id AND nr.recipient_id = auth.uid()
      )
    );

-- (S) Notification Recipients
DROP POLICY IF EXISTS "Users view and mark own notification recipients read" ON public.notification_recipients;
CREATE POLICY "Users view and mark own notification recipients read" ON public.notification_recipients
    FOR SELECT USING (
      recipient_id = auth.uid() AND (public.is_teacher() OR public.is_active_student())
    );

DROP POLICY IF EXISTS "Users update read status on own notifications" ON public.notification_recipients;
CREATE POLICY "Users update read status on own notifications" ON public.notification_recipients
    FOR UPDATE USING (
      recipient_id = auth.uid() AND (public.is_teacher() OR public.is_active_student())
    )
    WITH CHECK (
      recipient_id = auth.uid() AND (public.is_teacher() OR public.is_active_student())
    );

-- ------------------------------------------------------------------------------
-- End of Migration 5
-- ------------------------------------------------------------------------------
