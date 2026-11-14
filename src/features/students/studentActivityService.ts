/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  requireSupabaseClient,
  requireAuthenticatedUser,
  throwServiceError,
  isMissingSchemaFeatureError,
} from '../../lib/errors/serviceError';
import { AttendanceStats, calculateAttendanceMetrics } from '../../lib/dateUtils';

const SERVICE = 'studentActivityService';

export const DEFAULT_ACTIVITY_LIMIT = 20;

export interface StudentActivityLessonItem {
  id: string;
  courseId: string;
  unitId: string;
  unitTitle: string;
  unitTitleArabic: string;
  unitOrderIndex: number;
  title: string;
  titleArabic: string;
  orderIndex: number;
  durationMinutes: number;
  isCompleted: boolean;
  watchSeconds: number;
  lastAccessedAt: string | null;
}

export interface StudentCourseProgressItem {
  courseId: string;
  title: string;
  titleArabic: string;
  level: string;
  isPublished: boolean;
  groupNames: { id: string; name: string; nameArabic: string }[];
  totalPublishedLessons: number;
  completedLessonsCount: number;
  pendingLessonsCount: number;
  progressPercentage: number;
  lastAccessedAt: string | null;
  completedLessons: StudentActivityLessonItem[];
  pendingLessons: StudentActivityLessonItem[];
}

export interface StudentAttendanceActivityItem {
  id: string;
  sessionId: string;
  sessionTitle: string;
  sessionTitleArabic: string;
  sessionStartTime: string | null;
  sessionEndTime: string | null;
  sessionStatus: string | null;
  status: 'present' | 'absent' | 'late' | 'excused';
  joinedAt: string | null;
  recordedAt: string;
  notes: string | null;
}

export interface StudentQuizAttemptActivityItem {
  id: string;
  quizId: string;
  quizTitle: string;
  quizTitleArabic: string;
  courseTitle: string | null;
  courseTitleArabic: string | null;
  attemptNumber: number;
  status: string;
  pointsScored: number | null;
  totalPointsPossible: number | null;
  percentageScore: number | null;
  passingScore: number;
  isPassed: boolean | null;
  requiresManualGrading: boolean;
  teacherFeedback: string | null;
  startedAt: string;
  completedAt: string | null;
  submittedAt: string | null;
  gradedAt: string | null;
}

export interface StudentAssignmentActivityItem {
  id: string;
  assignmentId: string;
  assignmentTitle: string;
  assignmentTitleArabic: string;
  courseTitle: string | null;
  courseTitleArabic: string | null;
  dueDate: string | null;
  maxScore: number;
  attemptNumber: number;
  status: 'submitted' | 'graded' | 'returned_for_revision' | string;
  score: number | null;
  isLate: boolean;
  isGradeReleased: boolean;
  teacherFeedback: string | null;
  submittedAt: string;
  gradedAt: string | null;
}

export interface StudentActivitySummary {
  studentId: string;
  courses: StudentCourseProgressItem[];
  totalEnrolledCourses: number;
  totalPublishedLessons: number;
  totalCompletedLessons: number;
  totalPendingLessons: number;
  overallCourseProgressPercentage: number;
  attendance: StudentAttendanceActivityItem[];
  attendanceTotalCount: number;
  attendanceMetrics: AttendanceStats;
  quizAttempts: StudentQuizAttemptActivityItem[];
  quizAttemptsTotalCount: number;
  averageQuizPercentage: number | null;
  submissions: StudentAssignmentActivityItem[];
  submissionsTotalCount: number;
  gradedSubmissionsCount: number;
  pendingSubmissionsCount: number;
  lastLearningActivityAt: string | null;
}

export interface FetchStudentActivityParams {
  studentId: string;
  groupIds: string[];
  attendanceLimit?: number;
  quizLimit?: number;
  assignmentLimit?: number;
}

/**
 * Pure builder combining authorized group_courses, lessons, and lesson_progress
 * into per-course completion metrics and completed/pending lesson lists.
 */
export function buildCourseActivitySummaries(params: {
  groupCoursesRows: any[];
  lessonRows: any[];
  progressRows: any[];
}): StudentCourseProgressItem[] {
  const courseMap = new Map<
    string,
    {
      courseId: string;
      title: string;
      titleArabic: string;
      level: string;
      isPublished: boolean;
      groupsMap: Map<string, { id: string; name: string; nameArabic: string }>;
    }
  >();

  for (const row of params.groupCoursesRows || []) {
    const course = row.courses;
    if (!course?.id) continue;

    let entry = courseMap.get(course.id);
    if (!entry) {
      entry = {
        courseId: course.id,
        title: course.title || '',
        titleArabic: course.title_arabic || course.title || '',
        level: course.level || 'beginner',
        isPublished: Boolean(course.is_published),
        groupsMap: new Map(),
      };
      courseMap.set(course.id, entry);
    }

    if (row.groups?.id && !entry.groupsMap.has(row.groups.id)) {
      entry.groupsMap.set(row.groups.id, {
        id: row.groups.id,
        name: row.groups.name || '',
        nameArabic: row.groups.name_arabic || row.groups.name || '',
      });
    }
  }

  const progressByLesson = new Map<string, any>();
  for (const p of params.progressRows || []) {
    if (p?.lesson_id) {
      progressByLesson.set(p.lesson_id, p);
    }
  }

  const lessonsByCourse = new Map<string, StudentActivityLessonItem[]>();
  for (const lesson of params.lessonRows || []) {
    // Only published lessons count toward student completion & pending work
    if (!lesson?.id || !lesson.is_published || !courseMap.has(lesson.course_id)) {
      continue;
    }

    const prog = progressByLesson.get(lesson.id);
    const item: StudentActivityLessonItem = {
      id: lesson.id,
      courseId: lesson.course_id,
      unitId: lesson.unit_id,
      unitTitle: lesson.course_units?.title || '',
      unitTitleArabic: lesson.course_units?.title_arabic || lesson.course_units?.title || '',
      unitOrderIndex: Number(lesson.course_units?.order_index) || 0,
      title: lesson.title || '',
      titleArabic: lesson.title_arabic || lesson.title || '',
      orderIndex: Number(lesson.order_index) || 0,
      durationMinutes: Number(lesson.duration_minutes) || 0,
      isCompleted: Boolean(prog?.is_completed),
      watchSeconds: Number(prog?.watch_seconds) || 0,
      lastAccessedAt: prog?.last_accessed_at || null,
    };

    const list = lessonsByCourse.get(lesson.course_id) || [];
    list.push(item);
    lessonsByCourse.set(lesson.course_id, list);
  }

  const summaries: StudentCourseProgressItem[] = [];

  for (const entry of courseMap.values()) {
    const courseLessons = (lessonsByCourse.get(entry.courseId) || []).sort((a, b) => {
      if (a.unitOrderIndex !== b.unitOrderIndex) {
        return a.unitOrderIndex - b.unitOrderIndex;
      }
      return a.orderIndex - b.orderIndex;
    });

    const completedLessons = courseLessons.filter((l) => l.isCompleted);
    const pendingLessons = courseLessons.filter((l) => !l.isCompleted);
    const totalPublishedLessons = courseLessons.length;
    const progressPercentage =
      totalPublishedLessons > 0
        ? Math.round((completedLessons.length / totalPublishedLessons) * 100)
        : 0;

    let lastAccessedAt: string | null = null;
    let lastAccessedMs = -Infinity;
    for (const l of courseLessons) {
      if (l.lastAccessedAt) {
        const ms = new Date(l.lastAccessedAt).getTime();
        if (!Number.isNaN(ms) && ms > lastAccessedMs) {
          lastAccessedMs = ms;
          lastAccessedAt = l.lastAccessedAt;
        }
      }
    }

    summaries.push({
      courseId: entry.courseId,
      title: entry.title,
      titleArabic: entry.titleArabic,
      level: entry.level,
      isPublished: entry.isPublished,
      groupNames: Array.from(entry.groupsMap.values()),
      totalPublishedLessons,
      completedLessonsCount: completedLessons.length,
      pendingLessonsCount: pendingLessons.length,
      progressPercentage,
      lastAccessedAt,
      completedLessons,
      pendingLessons,
    });
  }

  return summaries;
}

/**
 * Maps attendance rows joined with safe live_sessions fields (excluding meeting_url).
 */
export function mapAttendanceActivityRows(rows: any[]): StudentAttendanceActivityItem[] {
  return (rows || []).map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    sessionTitle: row.live_sessions?.title || '',
    sessionTitleArabic: row.live_sessions?.title_arabic || row.live_sessions?.title || '',
    sessionStartTime: row.live_sessions?.start_time || null,
    sessionEndTime: row.live_sessions?.end_time || null,
    sessionStatus: row.live_sessions?.status || null,
    status: row.status,
    joinedAt: row.joined_at || null,
    recordedAt: row.recorded_at,
    notes: row.notes || null,
  }));
}

/**
 * Maps quiz_attempts rows joined with quizzes and courses.
 */
export function mapQuizAttemptActivityRows(rows: any[]): StudentQuizAttemptActivityItem[] {
  return (rows || []).map((row) => {
    const rawPct =
      row.percentage_score !== null && row.percentage_score !== undefined
        ? Number(row.percentage_score)
        : row.score !== null && row.score !== undefined
        ? Number(row.score)
        : null;

    const pointsScored =
      row.points_scored !== null && row.points_scored !== undefined
        ? Number(row.points_scored)
        : null;

    const totalPointsPossible =
      row.total_points_possible !== null && row.total_points_possible !== undefined
        ? Number(row.total_points_possible)
        : row.quizzes?.total_points !== null && row.quizzes?.total_points !== undefined
        ? Number(row.quizzes.total_points)
        : null;

    return {
      id: row.id,
      quizId: row.quiz_id,
      quizTitle: row.quizzes?.title || '',
      quizTitleArabic: row.quizzes?.title_arabic || row.quizzes?.title || '',
      courseTitle: row.quizzes?.courses?.title || null,
      courseTitleArabic:
        row.quizzes?.courses?.title_arabic || row.quizzes?.courses?.title || null,
      attemptNumber: Number(row.attempt_number) || 1,
      status: row.status || (row.completed_at ? 'graded' : 'in_progress'),
      pointsScored,
      totalPointsPossible,
      percentageScore: rawPct !== null && !Number.isNaN(rawPct) ? rawPct : null,
      passingScore: Number(row.quizzes?.passing_score) || 60,
      isPassed:
        row.is_passed !== null && row.is_passed !== undefined ? Boolean(row.is_passed) : null,
      requiresManualGrading: Boolean(row.requires_manual_grading),
      teacherFeedback: row.teacher_feedback || null,
      startedAt: row.started_at,
      completedAt: row.completed_at || null,
      submittedAt: row.submitted_at || null,
      gradedAt: row.graded_at || null,
    };
  });
}

/**
 * Maps submissions rows across both Phase 5C schema and baseline schema.
 */
export function mapAssignmentSubmissionActivityRows(rows: any[]): StudentAssignmentActivityItem[] {
  return (rows || []).map((row) => {
    const hasScore = row.score !== null && row.score !== undefined;
    const derivedStatus =
      row.status || (hasScore || row.graded_at ? 'graded' : 'submitted');

    return {
      id: row.id,
      assignmentId: row.assignment_id,
      assignmentTitle: row.assignments?.title || '',
      assignmentTitleArabic:
        row.assignments?.title_arabic || row.assignments?.title || '',
      courseTitle: row.assignments?.courses?.title || null,
      courseTitleArabic:
        row.assignments?.courses?.title_arabic || row.assignments?.courses?.title || null,
      dueDate: row.assignments?.due_date || null,
      maxScore: Number(row.assignments?.max_score) || 100,
      attemptNumber: Number(row.attempt_number) || 1,
      status: derivedStatus,
      score: hasScore ? Number(row.score) : null,
      isLate: Boolean(row.is_late),
      isGradeReleased:
        row.is_grade_released !== undefined && row.is_grade_released !== null
          ? Boolean(row.is_grade_released)
          : hasScore,
      teacherFeedback: row.teacher_feedback || null,
      submittedAt: row.submitted_at,
      gradedAt: row.graded_at || null,
    };
  });
}

/**
 * Computes the most recent timestamp across all authorized student learning records.
 */
export function computeLastLearningActivityAt(params: {
  courses: StudentCourseProgressItem[];
  attendance: StudentAttendanceActivityItem[];
  quizAttempts: StudentQuizAttemptActivityItem[];
  submissions: StudentAssignmentActivityItem[];
}): string | null {
  const candidates: (string | null | undefined)[] = [];

  for (const c of params.courses) {
    candidates.push(c.lastAccessedAt);
  }
  for (const a of params.attendance) {
    candidates.push(a.joinedAt, a.recordedAt);
  }
  for (const q of params.quizAttempts) {
    candidates.push(q.gradedAt, q.submittedAt, q.completedAt, q.startedAt);
  }
  for (const s of params.submissions) {
    candidates.push(s.gradedAt, s.submittedAt);
  }

  let latestIso: string | null = null;
  let latestMs = -Infinity;

  for (const iso of candidates) {
    if (!iso) continue;
    const ms = new Date(iso).getTime();
    if (!Number.isNaN(ms) && ms > latestMs) {
      latestMs = ms;
      latestIso = iso;
    }
  }

  return latestIso;
}

export function isStudentActivityEmpty(summary: StudentActivitySummary): boolean {
  return (
    summary.courses.length === 0 &&
    summary.attendance.length === 0 &&
    summary.quizAttempts.length === 0 &&
    summary.submissions.length === 0
  );
}

const PHASE5C_SUBMISSIONS_SELECT = `
  id,
  assignment_id,
  attempt_number,
  submitted_at,
  is_late,
  status,
  score,
  teacher_feedback,
  graded_at,
  is_grade_released,
  assignments:assignment_id (
    id,
    course_id,
    title,
    title_arabic,
    due_date,
    max_score,
    courses:course_id (
      id,
      title,
      title_arabic
    )
  )
`;

const BASELINE_SUBMISSIONS_SELECT = `
  id,
  assignment_id,
  submitted_at,
  is_late,
  score,
  teacher_feedback,
  graded_at,
  assignments:assignment_id (
    id,
    course_id,
    title,
    title_arabic,
    due_date,
    max_score,
    courses:course_id (
      id,
      title,
      title_arabic
    )
  )
`;

/**
 * Fetches an RLS-respecting, batched summary of a student's academic activity:
 * - Course enrollments & published lesson progress (completed vs pending)
 * - Live session attendance (explicitly omitting live_sessions.meeting_url)
 * - Quiz attempts, scores, grading state, and teacher feedback
 * - Assignment submissions, grading status, and teacher feedback (baseline + Phase 5C safe)
 */
export async function fetchStudentActivitySummary(
  params: FetchStudentActivityParams
): Promise<StudentActivitySummary> {
  const client = requireSupabaseClient({
    service: SERVICE,
    operation: 'fetchStudentActivitySummary',
  });

  await requireAuthenticatedUser(client, {
    service: SERVICE,
    operation: 'fetchStudentActivitySummary',
  });

  const attendanceLimit = Math.max(1, params.attendanceLimit ?? DEFAULT_ACTIVITY_LIMIT);
  const quizLimit = Math.max(1, params.quizLimit ?? DEFAULT_ACTIVITY_LIMIT);
  const assignmentLimit = Math.max(1, params.assignmentLimit ?? DEFAULT_ACTIVITY_LIMIT);
  const uniqueGroupIds = Array.from(new Set((params.groupIds || []).filter(Boolean)));

  const fetchGroupCoursesPromise =
    uniqueGroupIds.length > 0
      ? client
          .from('group_courses')
          .select(
            `
            course_id,
            group_id,
            assigned_at,
            courses:course_id (
              id,
              title,
              title_arabic,
              level,
              is_published
            ),
            groups:group_id (
              id,
              name,
              name_arabic
            )
          `
          )
          .in('group_id', uniqueGroupIds)
      : Promise.resolve({ data: [], error: null });

  const fetchAttendancePromise = client
    .from('attendance')
    .select(
      `
      id,
      session_id,
      status,
      joined_at,
      notes,
      recorded_at,
      live_sessions:session_id (
        id,
        course_id,
        group_id,
        title,
        title_arabic,
        start_time,
        end_time,
        status
      )
    `,
      { count: 'exact' }
    )
    .eq('student_id', params.studentId)
    .order('recorded_at', { ascending: false })
    .limit(attendanceLimit);

  const fetchQuizzesPromise = client
    .from('quiz_attempts')
    .select(
      `
      id,
      quiz_id,
      status,
      attempt_number,
      started_at,
      completed_at,
      submitted_at,
      graded_at,
      score,
      points_scored,
      total_points_possible,
      percentage_score,
      is_passed,
      requires_manual_grading,
      teacher_feedback,
      quizzes:quiz_id (
        id,
        course_id,
        title,
        title_arabic,
        passing_score,
        total_points,
        courses:course_id (
          id,
          title,
          title_arabic
        )
      )
    `,
      { count: 'exact' }
    )
    .eq('student_id', params.studentId)
    .order('started_at', { ascending: false })
    .limit(quizLimit);

  const fetchSubmissionsWithSchemaFallback = async () => {
    const primary = await client
      .from('submissions')
      .select(PHASE5C_SUBMISSIONS_SELECT, { count: 'exact' })
      .eq('student_id', params.studentId)
      .order('submitted_at', { ascending: false })
      .limit(assignmentLimit);

    if (primary.error && isMissingSchemaFeatureError(primary.error)) {
      return await client
        .from('submissions')
        .select(BASELINE_SUBMISSIONS_SELECT, { count: 'exact' })
        .eq('student_id', params.studentId)
        .order('submitted_at', { ascending: false })
        .limit(assignmentLimit);
    }

    return primary;
  };

  let groupCoursesRes: any;
  let attendanceRes: any;
  let quizzesRes: any;
  let submissionsRes: any;

  try {
    [groupCoursesRes, attendanceRes, quizzesRes, submissionsRes] = await Promise.all([
      fetchGroupCoursesPromise,
      fetchAttendancePromise,
      fetchQuizzesPromise,
      fetchSubmissionsWithSchemaFallback(),
    ]);
  } catch (err) {
    throwServiceError(err, {
      service: SERVICE,
      operation: 'fetchStudentActivitySummary',
      fallbackMessage: 'Failed to load student academic activity',
    });
  }

  if (groupCoursesRes.error) {
    throwServiceError(groupCoursesRes.error, {
      service: SERVICE,
      operation: 'fetchStudentActivitySummary.courses',
      fallbackMessage: 'Failed to load enrolled courses',
    });
  }
  if (attendanceRes.error) {
    throwServiceError(attendanceRes.error, {
      service: SERVICE,
      operation: 'fetchStudentActivitySummary.attendance',
      fallbackMessage: 'Failed to load live session attendance',
    });
  }
  if (quizzesRes.error) {
    throwServiceError(quizzesRes.error, {
      service: SERVICE,
      operation: 'fetchStudentActivitySummary.quizzes',
      fallbackMessage: 'Failed to load quiz attempts',
    });
  }
  if (submissionsRes.error) {
    throwServiceError(submissionsRes.error, {
      service: SERVICE,
      operation: 'fetchStudentActivitySummary.submissions',
      fallbackMessage: 'Failed to load assignment submissions',
    });
  }

  const groupCoursesRows = groupCoursesRes.data || [];
  const authorizedCourseIds = Array.from(
    new Set(groupCoursesRows.map((row: any) => row.course_id).filter(Boolean))
  ) as string[];

  let lessonRows: any[] = [];
  let progressRows: any[] = [];

  if (authorizedCourseIds.length > 0) {
    let lessonsRes: any;
    let progressRes: any;
    try {
      [lessonsRes, progressRes] = await Promise.all([
        client
          .from('lessons')
          .select(
            `
            id,
            course_id,
            unit_id,
            title,
            title_arabic,
            duration_minutes,
            order_index,
            is_published,
            course_units:unit_id (
              id,
              title,
              title_arabic,
              order_index
            )
          `
          )
          .in('course_id', authorizedCourseIds)
          .order('order_index', { ascending: true }),
        client
          .from('lesson_progress')
          .select('lesson_id, is_completed, watch_seconds, last_accessed_at')
          .eq('student_id', params.studentId),
      ]);
    } catch (err) {
      throwServiceError(err, {
        service: SERVICE,
        operation: 'fetchStudentActivitySummary.lessons',
        fallbackMessage: 'Failed to load lesson progress',
      });
    }

    if (lessonsRes.error) {
      throwServiceError(lessonsRes.error, {
        service: SERVICE,
        operation: 'fetchStudentActivitySummary.lessons',
        fallbackMessage: 'Failed to load course lessons',
      });
    }
    if (progressRes.error) {
      throwServiceError(progressRes.error, {
        service: SERVICE,
        operation: 'fetchStudentActivitySummary.lessonProgress',
        fallbackMessage: 'Failed to load student lesson progress',
      });
    }

    lessonRows = lessonsRes.data || [];
    progressRows = progressRes.data || [];
  }

  const courses = buildCourseActivitySummaries({
    groupCoursesRows,
    lessonRows,
    progressRows,
  });

  const attendance = mapAttendanceActivityRows(attendanceRes.data || []);
  const quizAttempts = mapQuizAttemptActivityRows(quizzesRes.data || []);
  const submissions = mapAssignmentSubmissionActivityRows(submissionsRes.data || []);

  const totalPublishedLessons = courses.reduce((sum, c) => sum + c.totalPublishedLessons, 0);
  const totalCompletedLessons = courses.reduce((sum, c) => sum + c.completedLessonsCount, 0);
  const totalPendingLessons = courses.reduce((sum, c) => sum + c.pendingLessonsCount, 0);
  const overallCourseProgressPercentage =
    totalPublishedLessons > 0
      ? Math.round((totalCompletedLessons / totalPublishedLessons) * 100)
      : 0;

  const attendanceMetrics = calculateAttendanceMetrics(attendance);

  const gradedQuizScores = quizAttempts
    .filter((q) => q.status === 'graded' && q.percentageScore !== null)
    .map((q) => q.percentageScore as number);
  const averageQuizPercentage =
    gradedQuizScores.length > 0
      ? Math.round(
          gradedQuizScores.reduce((sum, val) => sum + val, 0) / gradedQuizScores.length
        )
      : null;

  const gradedSubmissionsCount = submissions.filter(
    (s) => s.status === 'graded' || s.score !== null
  ).length;
  const pendingSubmissionsCount = submissions.filter(
    (s) => s.status !== 'graded' && s.score === null
  ).length;

  const lastLearningActivityAt = computeLastLearningActivityAt({
    courses,
    attendance,
    quizAttempts,
    submissions,
  });

  return {
    studentId: params.studentId,
    courses,
    totalEnrolledCourses: courses.length,
    totalPublishedLessons,
    totalCompletedLessons,
    totalPendingLessons,
    overallCourseProgressPercentage,
    attendance,
    attendanceTotalCount: attendanceRes.count ?? attendance.length,
    attendanceMetrics,
    quizAttempts,
    quizAttemptsTotalCount: quizzesRes.count ?? quizAttempts.length,
    averageQuizPercentage,
    submissions,
    submissionsTotalCount: submissionsRes.count ?? submissions.length,
    gradedSubmissionsCount,
    pendingSubmissionsCount,
    lastLearningActivityAt,
  };
}
