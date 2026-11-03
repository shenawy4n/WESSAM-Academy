-- ==============================================================================
-- WESSAM Academy (أكاديمية الوسام التعليمية)
-- Initial Database Architecture & Security Schema (Hardened Edition)
-- Author: Mr. Wessam Ibrahim Draz Academic Infrastructure
-- Version: 20261103000001
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 1. ENUMS & CONSTANTS
-- ------------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE user_role_enum AS ENUM ('teacher', 'student', 'moderator');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE account_status_enum AS ENUM ('active', 'inactive', 'suspended');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE live_session_provider_enum AS ENUM ('zoom', 'google_meet', 'custom');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE attendance_status_enum AS ENUM ('present', 'absent', 'late', 'excused');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE question_type_enum AS ENUM (
      'multiple_choice',
      'true_false',
      'fill_in_the_blank',
      'sentence_ordering',
      'matching',
      'short_answer',
      'reading_comprehension'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ------------------------------------------------------------------------------
-- 2. IDENTITY & PROFILES
-- ------------------------------------------------------------------------------

-- Master Profiles Table (linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role user_role_enum NOT NULL DEFAULT 'student',
    full_name TEXT NOT NULL,
    full_name_arabic TEXT,
    email TEXT UNIQUE,
    phone TEXT,
    avatar_url TEXT,
    status account_status_enum NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Student Credentials (managed strictly server-side for username login mapping)
-- CRITICAL SECURITY: Never readable through ordinary client queries; no client RLS policy.
CREATE TABLE IF NOT EXISTS public.student_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    username TEXT UNIQUE NOT NULL,
    internal_auth_email TEXT UNIQUE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- 3. GROUPS & COHORTS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    name_arabic TEXT NOT NULL,
    description TEXT,
    academic_year TEXT NOT NULL DEFAULT '2026/2027',
    max_students INT DEFAULT 30,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Student Academic Profiles (links student to primary group and student number)
CREATE TABLE IF NOT EXISTS public.student_academic_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID UNIQUE NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    student_number TEXT UNIQUE,
    username TEXT UNIQUE NOT NULL,
    group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL,
    enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    status account_status_enum NOT NULL DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Secondary / Multi-group junction
CREATE TABLE IF NOT EXISTS public.group_students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(group_id, student_id)
);

-- ------------------------------------------------------------------------------
-- 4. COURSES, UNITS & LESSONS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID NOT NULL REFERENCES public.profiles(id),
    title TEXT NOT NULL,
    title_arabic TEXT NOT NULL,
    description TEXT,
    description_arabic TEXT,
    cover_image_url TEXT,
    level TEXT NOT NULL DEFAULT 'intermediate',
    is_published BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Course & Group Association
CREATE TABLE IF NOT EXISTS public.group_courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(group_id, course_id)
);

-- Course Units
CREATE TABLE IF NOT EXISTS public.course_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    title_arabic TEXT NOT NULL,
    order_index INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Video Assets (Provider abstraction, e.g., Mux / signed playback)
CREATE TABLE IF NOT EXISTS public.video_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL DEFAULT 'mux',
    provider_playback_id TEXT NOT NULL,
    provider_asset_id TEXT,
    duration_seconds INT,
    aspect_ratio TEXT,
    title TEXT,
    is_ready BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lessons
CREATE TABLE IF NOT EXISTS public.lessons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    unit_id UUID NOT NULL REFERENCES public.course_units(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    title_arabic TEXT NOT NULL,
    description TEXT,
    duration_minutes INT DEFAULT 45,
    order_index INT NOT NULL DEFAULT 1,
    video_asset_id UUID REFERENCES public.video_assets(id) ON DELETE SET NULL,
    is_published BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lesson Resources (Handouts, PDF worksheets)
CREATE TABLE IF NOT EXISTS public.lesson_resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    title_arabic TEXT,
    file_url TEXT NOT NULL,
    file_type TEXT,
    file_size_bytes BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lesson Progress per Student
CREATE TABLE IF NOT EXISTS public.lesson_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
    is_completed BOOLEAN NOT NULL DEFAULT false,
    watch_seconds INT DEFAULT 0,
    last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(student_id, lesson_id)
);

-- ------------------------------------------------------------------------------
-- 5. LIVE CLASSES & ATTENDANCE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.live_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
    group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    provider live_session_provider_enum NOT NULL DEFAULT 'zoom',
    meeting_url TEXT,
    status TEXT NOT NULL DEFAULT 'scheduled',
    teacher_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Attendance: ON DELETE RESTRICT on student_id to prevent accidental cascade purging of academic history
CREATE TABLE IF NOT EXISTS public.attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    status attendance_status_enum NOT NULL DEFAULT 'present',
    joined_at TIMESTAMPTZ,
    notes TEXT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(session_id, student_id)
);

-- ------------------------------------------------------------------------------
-- 6. QUESTION BANK, QUIZZES & EXAMINATIONS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.question_bank (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
    question_text TEXT NOT NULL,
    question_type question_type_enum NOT NULL DEFAULT 'multiple_choice',
    skill_category TEXT NOT NULL DEFAULT 'grammar',
    difficulty_level TEXT NOT NULL DEFAULT 'intermediate',
    explanation TEXT,
    points INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.question_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID NOT NULL REFERENCES public.question_bank(id) ON DELETE CASCADE,
    option_text TEXT NOT NULL,
    is_correct BOOLEAN NOT NULL DEFAULT false,
    order_index INT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS public.quizzes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    title_arabic TEXT NOT NULL,
    description TEXT,
    duration_minutes INT NOT NULL DEFAULT 30,
    passing_score INT NOT NULL DEFAULT 60,
    max_attempts INT NOT NULL DEFAULT 1,
    is_randomized BOOLEAN NOT NULL DEFAULT false,
    is_published BOOLEAN NOT NULL DEFAULT false,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.quiz_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES public.question_bank(id) ON DELETE RESTRICT,
    order_index INT NOT NULL DEFAULT 1,
    UNIQUE(quiz_id, question_id)
);

-- Quiz Attempts (Stores question snapshot for academic integrity)
CREATE TABLE IF NOT EXISTS public.quiz_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE RESTRICT,
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    score NUMERIC(5,2),
    is_passed BOOLEAN,
    question_snapshot JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.student_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id UUID NOT NULL REFERENCES public.quiz_attempts(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES public.question_bank(id) ON DELETE RESTRICT,
    selected_option_id UUID,
    answer_text TEXT,
    is_correct BOOLEAN,
    points_awarded NUMERIC(5,2) DEFAULT 0,
    answered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- 7. ASSIGNMENTS & SUBMISSIONS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    unit_id UUID REFERENCES public.course_units(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    title_arabic TEXT NOT NULL,
    instructions TEXT NOT NULL,
    due_date TIMESTAMPTZ NOT NULL,
    max_score INT NOT NULL DEFAULT 100,
    target_group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL,
    is_published BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE RESTRICT,
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    content TEXT,
    file_url TEXT,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_late BOOLEAN NOT NULL DEFAULT false,
    score NUMERIC(5,2),
    teacher_feedback TEXT,
    graded_at TIMESTAMPTZ,
    graded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    UNIQUE(assignment_id, student_id)
);

-- ------------------------------------------------------------------------------
-- 8. NOTIFICATIONS & AUDIT LOGS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    title_arabic TEXT NOT NULL,
    body TEXT NOT NULL,
    body_arabic TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'general',
    related_resource_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notification_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    is_read BOOLEAN NOT NULL DEFAULT false,
    read_at TIMESTAMPTZ,
    UNIQUE(notification_id, recipient_id)
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    old_data JSONB,
    new_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- 9. PERFORMANCE & FOREIGN KEY INDEXES
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_group_students_student_id ON public.group_students(student_id);
CREATE INDEX IF NOT EXISTS idx_group_students_group_id ON public.group_students(group_id);
CREATE INDEX IF NOT EXISTS idx_group_courses_group_id ON public.group_courses(group_id);
CREATE INDEX IF NOT EXISTS idx_group_courses_course_id ON public.group_courses(course_id);
CREATE INDEX IF NOT EXISTS idx_course_units_course_id ON public.course_units(course_id);
CREATE INDEX IF NOT EXISTS idx_lessons_course_unit ON public.lessons(course_id, unit_id);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_student ON public.lesson_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_live_sessions_group ON public.live_sessions(group_id);
CREATE INDEX IF NOT EXISTS idx_attendance_session_student ON public.attendance(session_id, student_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_course_id ON public.quizzes(course_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz_student ON public.quiz_attempts(quiz_id, student_id);
CREATE INDEX IF NOT EXISTS idx_student_answers_attempt ON public.student_answers(attempt_id);
CREATE INDEX IF NOT EXISTS idx_assignments_course_group ON public.assignments(course_id, target_group_id);
CREATE INDEX IF NOT EXISTS idx_submissions_assignment_student ON public.submissions(assignment_id, student_id);
CREATE INDEX IF NOT EXISTS idx_notification_recipients_user ON public.notification_recipients(recipient_id, is_read);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created ON public.audit_logs(actor_id, created_at DESC);

-- ------------------------------------------------------------------------------
-- 10. ROW LEVEL SECURITY (RLS) ENABLING
-- ------------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_academic_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_bank ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 11. SECURITY DEFINER HELPER FUNCTIONS
-- ------------------------------------------------------------------------------
-- Hardened: Fixed search_path to prevent path hijacking; restricted EXECUTE grant.
CREATE OR REPLACE FUNCTION public.is_teacher()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'teacher' AND status = 'active'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_teacher() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_teacher() TO authenticated;

-- Helper: Check if student belongs to a specific cohort group
CREATE OR REPLACE FUNCTION public.is_student_in_group(target_group_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.group_students
    WHERE group_id = target_group_id AND student_id = auth.uid()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_student_in_group(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_student_in_group(UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 12. COMPREHENSIVE RLS POLICIES
-- ------------------------------------------------------------------------------

-- (A) Profiles
CREATE POLICY "Users read own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Teachers view all profiles" ON public.profiles
    FOR SELECT USING (public.is_teacher());

CREATE POLICY "Teachers insert or update profiles" ON public.profiles
    FOR ALL USING (public.is_teacher());

-- (B) Student Credentials: NO CLIENT POLICIES (Accessible solely by Edge Functions via service_role)

-- (C) Student Academic Profiles
CREATE POLICY "Students view own academic profile" ON public.student_academic_profiles
    FOR SELECT USING (profile_id = auth.uid());

CREATE POLICY "Teachers manage all academic profiles" ON public.student_academic_profiles
    FOR ALL USING (public.is_teacher());

-- (D) Groups
CREATE POLICY "Teachers manage groups" ON public.groups
    FOR ALL USING (public.is_teacher());

CREATE POLICY "Students view groups they belong to" ON public.groups
    FOR SELECT USING (public.is_student_in_group(id));

-- (E) Group Students
CREATE POLICY "Teachers manage group memberships" ON public.group_students
    FOR ALL USING (public.is_teacher());

CREATE POLICY "Students view their own group memberships" ON public.group_students
    FOR SELECT USING (student_id = auth.uid());

-- (F) Courses
CREATE POLICY "Teachers manage all courses" ON public.courses
    FOR ALL USING (public.is_teacher());

CREATE POLICY "Students view assigned or published courses" ON public.courses
    FOR SELECT USING (
      is_published = true AND (
        EXISTS (
          SELECT 1 FROM public.group_courses gc
          JOIN public.group_students gs ON gs.group_id = gc.group_id
          WHERE gc.course_id = courses.id AND gs.student_id = auth.uid()
        )
      )
    );

-- (G) Group Courses
CREATE POLICY "Teachers manage group courses" ON public.group_courses
    FOR ALL USING (public.is_teacher());

CREATE POLICY "Students view assigned group courses" ON public.group_courses
    FOR SELECT USING (public.is_student_in_group(group_id));

-- (H) Course Units
CREATE POLICY "Teachers manage course units" ON public.course_units
    FOR ALL USING (public.is_teacher());

CREATE POLICY "Students view units of accessible courses" ON public.course_units
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM public.courses c
        JOIN public.group_courses gc ON gc.course_id = c.id
        JOIN public.group_students gs ON gs.group_id = gc.group_id
        WHERE c.id = course_units.course_id AND c.is_published = true AND gs.student_id = auth.uid()
      )
    );

-- (I) Video Assets
CREATE POLICY "Teachers manage video assets" ON public.video_assets
    FOR ALL USING (public.is_teacher());

-- (J) Lessons
CREATE POLICY "Teachers manage lessons" ON public.lessons
    FOR ALL USING (public.is_teacher());

CREATE POLICY "Students view published lessons" ON public.lessons
    FOR SELECT USING (
      is_published = true AND EXISTS (
        SELECT 1 FROM public.courses c
        JOIN public.group_courses gc ON gc.course_id = c.id
        JOIN public.group_students gs ON gs.group_id = gc.group_id
        WHERE c.id = lessons.course_id AND c.is_published = true AND gs.student_id = auth.uid()
      )
    );

-- (K) Lesson Resources
CREATE POLICY "Teachers manage lesson resources" ON public.lesson_resources
    FOR ALL USING (public.is_teacher());

CREATE POLICY "Students view resources for accessible lessons" ON public.lesson_resources
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM public.lessons l
        WHERE l.id = lesson_resources.lesson_id AND l.is_published = true
      )
    );

-- (L) Lesson Progress
CREATE POLICY "Teachers view all student progress" ON public.lesson_progress
    FOR SELECT USING (public.is_teacher());

CREATE POLICY "Students view and record own lesson progress" ON public.lesson_progress
    FOR ALL USING (student_id = auth.uid())
    WITH CHECK (student_id = auth.uid());

-- (M) Live Sessions
CREATE POLICY "Teachers manage live sessions" ON public.live_sessions
    FOR ALL USING (public.is_teacher());

CREATE POLICY "Students view assigned live sessions" ON public.live_sessions
    FOR SELECT USING (
      group_id IS NULL OR public.is_student_in_group(group_id)
    );

-- (N) Attendance
CREATE POLICY "Teachers manage attendance" ON public.attendance
    FOR ALL USING (public.is_teacher());

CREATE POLICY "Students view own attendance" ON public.attendance
    FOR SELECT USING (student_id = auth.uid());

-- (O) Question Bank & Question Options (Teacher Only)
CREATE POLICY "Teachers manage question bank" ON public.question_bank
    FOR ALL USING (public.is_teacher());

CREATE POLICY "Teachers manage question options" ON public.question_options
    FOR ALL USING (public.is_teacher());

-- (P) Quizzes & Quiz Questions
CREATE POLICY "Teachers manage quizzes" ON public.quizzes
    FOR ALL USING (public.is_teacher());

CREATE POLICY "Students view published quizzes" ON public.quizzes
    FOR SELECT USING (is_published = true);

CREATE POLICY "Teachers manage quiz questions" ON public.quiz_questions
    FOR ALL USING (public.is_teacher());

-- (Q) Quiz Attempts & Student Answers
CREATE POLICY "Teachers view and grade quiz attempts" ON public.quiz_attempts
    FOR ALL USING (public.is_teacher());

CREATE POLICY "Students view own quiz attempts" ON public.quiz_attempts
    FOR SELECT USING (student_id = auth.uid());

CREATE POLICY "Students start own quiz attempt" ON public.quiz_attempts
    FOR INSERT WITH CHECK (student_id = auth.uid());

CREATE POLICY "Teachers view student answers" ON public.student_answers
    FOR ALL USING (public.is_teacher());

CREATE POLICY "Students record answers on own attempt" ON public.student_answers
    FOR INSERT WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.quiz_attempts qa
        WHERE qa.id = student_answers.attempt_id AND qa.student_id = auth.uid() AND qa.completed_at IS NULL
      )
    );

-- (R) Assignments
CREATE POLICY "Teachers manage assignments" ON public.assignments
    FOR ALL USING (public.is_teacher());

CREATE POLICY "Students view published assignments" ON public.assignments
    FOR SELECT USING (
      is_published = true AND (
        target_group_id IS NULL OR public.is_student_in_group(target_group_id)
      )
    );

-- (S) Submissions (Enforcing strict segregation of student submission vs teacher grading)
CREATE POLICY "Teachers view and grade all submissions" ON public.submissions
    FOR ALL USING (public.is_teacher());

CREATE POLICY "Students view own submissions" ON public.submissions
    FOR SELECT USING (student_id = auth.uid());

CREATE POLICY "Students create own initial submission" ON public.submissions
    FOR INSERT WITH CHECK (
      student_id = auth.uid() AND
      score IS NULL AND
      graded_at IS NULL AND
      graded_by IS NULL AND
      teacher_feedback IS NULL
    );

CREATE POLICY "Students update own submission before grading" ON public.submissions
    FOR UPDATE USING (
      student_id = auth.uid() AND graded_at IS NULL
    )
    WITH CHECK (
      student_id = auth.uid() AND
      score IS NULL AND
      graded_at IS NULL AND
      graded_by IS NULL
    );

-- (T) Notifications & Recipients
CREATE POLICY "Teachers manage all notifications" ON public.notifications
    FOR ALL USING (public.is_teacher());

CREATE POLICY "Users view notifications addressed to them" ON public.notifications
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM public.notification_recipients nr
        WHERE nr.notification_id = notifications.id AND nr.recipient_id = auth.uid()
      )
    );

CREATE POLICY "Teachers manage notification recipients" ON public.notification_recipients
    FOR ALL USING (public.is_teacher());

CREATE POLICY "Users view and mark own notification recipients read" ON public.notification_recipients
    FOR SELECT USING (recipient_id = auth.uid());

CREATE POLICY "Users update read status on own notifications" ON public.notification_recipients
    FOR UPDATE USING (recipient_id = auth.uid())
    WITH CHECK (recipient_id = auth.uid());

-- (U) Audit Logs (Immutable, append-only; Teachers can view)
CREATE POLICY "Teachers view audit logs" ON public.audit_logs
    FOR SELECT USING (public.is_teacher());

-- ==============================================================================
-- End of Schema Migration
-- ==============================================================================
