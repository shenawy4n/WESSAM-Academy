/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  requireSupabaseClient,
  requireAuthenticatedUser,
  toServiceError,
  logServiceError,
  isMissingSchemaFeatureError,
  ServiceError,
} from '../../lib/errors/serviceError';
import { ACADEMIC_TIMEZONE, formatRiyadhDateTime, utcToRiyadhInputs } from '../../lib/dateUtils';

const SERVICE = 'academicRecordsService';

export interface AcademicGroupMembership {
  id: string;
  name: string;
  nameArabic: string;
  academicYear: string;
  isActive: boolean;
  archivedAt?: string | null;
  isPrimary: boolean;
  joinedAt?: string | null;
}

export interface AccessibleStudentOption {
  id: string;
  fullName: string;
  fullNameArabic: string;
  status: string;
  studentNumber: string | null;
  username: string | null;
  enrolledAt: string;
  groups: AcademicGroupMembership[];
}

export interface AcademicCourseProgressRow {
  courseId: string;
  title: string;
  titleArabic: string;
  level: string;
  isPublished: boolean;
  groups: { id: string; name: string; nameArabic: string; academicYear: string }[];
  totalLessons: number;
  completedLessons: number;
  pendingLessons: number;
  progressPercentage: number | null;
  lastAccessedAt: string | null;
}

export interface AcademicQuizRow {
  id: string;
  quizId: string;
  title: string;
  titleArabic: string;
  courseId: string | null;
  courseTitle: string | null;
  courseTitleArabic: string | null;
  groupId: string | null;
  groupName: string | null;
  groupNameArabic: string | null;
  academicYear: string | null;
  attemptNumber: number;
  status: string;
  passingScore: number;
  requiresManualGrading: boolean;
  isResultReleased: boolean;
  pointsScored: number | null;
  totalPointsPossible: number | null;
  percentageScore: number | null;
  isPassed: boolean | null;
  teacherFeedback: string | null;
  startedAt: string;
  submittedAt: string | null;
  gradedAt: string | null;
  eventAt: string;
}

export interface AcademicAssignmentRow {
  id: string;
  assignmentId: string;
  title: string;
  titleArabic: string;
  courseId: string | null;
  courseTitle: string | null;
  courseTitleArabic: string | null;
  groupId: string | null;
  groupName: string | null;
  groupNameArabic: string | null;
  academicYear: string | null;
  attemptNumber: number;
  status: string;
  maxScore: number;
  dueDate: string | null;
  submittedAt: string;
  isLate: boolean;
  gradedAt: string | null;
  isGradeReleased: boolean;
  releasedAt: string | null;
  score: number | null;
  percentageScore: number | null;
  teacherFeedback: string | null;
}

export interface AcademicAttendanceRow {
  id: string;
  sessionId: string;
  sessionTitle: string;
  sessionTitleArabic: string | null;
  courseId: string | null;
  courseTitle: string | null;
  courseTitleArabic: string | null;
  groupId: string | null;
  groupName: string | null;
  groupNameArabic: string | null;
  startTime: string;
  status: 'present' | 'late' | 'excused' | 'absent' | string;
  joinedAt: string | null;
  recordedAt: string;
  notes: string | null;
}

export interface AcademicAttendanceSummary {
  present: number;
  late: number;
  excused: number;
  absent: number;
  total: number;
  countableTotal: number;
  attendanceRatePct: number | null;
}

export interface AcademicSummaryMetrics {
  enrolledCourses: number;
  totalLessons: number;
  completedLessons: number;
  pendingLessons: number;
  courseProgressPct: number | null;
  quizAttemptsCount: number;
  completedQuizzesCount: number;
  gradedQuizzesCount: number;
  avgQuizPercentage: number | null;
  assignmentSubmissionsCount: number;
  gradedAssignmentsCount: number;
  avgAssignmentPercentage: number | null;
  overallAcademicAveragePct: number | null;
  passingThreshold: number;
  attendanceRatePct: number | null;
  lastLearningActivityAt: string | null;
}

export interface StudentAcademicRecord {
  student: {
    id: string;
    fullName: string;
    fullNameArabic: string;
    status: string;
    studentNumber: string | null;
    username: string | null;
    enrolledAt: string;
    notes: string | null;
  };
  groups: AcademicGroupMembership[];
  courses: AcademicCourseProgressRow[];
  quizzes: AcademicQuizRow[];
  assignments: AcademicAssignmentRow[];
  attendance: AcademicAttendanceRow[];
  attendanceSummary: AcademicAttendanceSummary;
  summary: AcademicSummaryMetrics;
  timezone: string;
}

export type TranscriptEntryType = 'quiz' | 'assignment' | 'attendance';

export interface UnifiedTranscriptEntry {
  id: string;
  entryType: TranscriptEntryType;
  title: string;
  titleArabic: string;
  courseId: string | null;
  courseTitle: string | null;
  courseTitleArabic: string | null;
  groupId: string | null;
  groupName: string | null;
  groupNameArabic: string | null;
  academicYear: string | null;
  eventAt: string;
  statusLabel: string;
  statusKey: string;
  rawScoreDisplay: string | null;
  percentageScore: number | null;
  passingThreshold: number | null;
  isPassed: boolean | null;
  isLate: boolean;
  isReleased: boolean;
  feedback: string | null;
  attemptNumber: number | null;
}

export interface TranscriptFilterOptions {
  search: string;
  assessmentType: 'all' | TranscriptEntryType;
  courseId: string;
  groupId: string;
  academicYear: string;
  dateFrom: string;
  dateTo: string;
  sortBy: 'date_desc' | 'date_asc' | 'score_desc' | 'score_asc';
}

export interface AcademicRecordQueryFilters {
  studentId?: string | null;
  courseId?: string | null;
  groupId?: string | null;
  academicYear?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
}

function toNumOrNull(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

function unwrapSingle<T>(val: T | T[] | null | undefined): T | null {
  if (!val) return null;
  return Array.isArray(val) ? val[0] ?? null : val;
}

function throwLoggedServiceError(
  err: unknown,
  context: { service: string; operation: string; fallbackMessage?: string }
): never {
  const serviceErr = toServiceError(err, context);
  logServiceError(serviceErr);
  throw serviceErr;
}

/**
 * Checks strictly whether a Phase 6A RPC failed because the RPC migration is not yet
 * deployed (PGRST202 / 42883) or because an unpatched 20261114000019 RPC hit the
 * known `gs.is_primary` / optional Phase 5C schema mismatch inside the RPC body.
 * Never returns true for RLS (42501), auth (401), not-found (P0002), or network errors.
 */
export function isAcademicRecordsRpcCompatibilityError(err: unknown): boolean {
  if (!err || !isMissingSchemaFeatureError(err)) {
    return false;
  }

  const record = typeof err === 'object' ? (err as Record<string, unknown>) : {};
  const code = String(record.code || '').toUpperCase();
  const message = `${String(record.message || '')} ${String(record.details || '')} ${String(record.hint || '')}`.toLowerCase();

  if (code === 'PGRST202' || code === '42883') {
    return true;
  }

  if (
    /could not find the function/i.test(message) ||
    /function .* does not exist/i.test(message)
  ) {
    return true;
  }

  if (
    (code === '42703' || code === '42P01') &&
    /(is_primary|assignment_targets|is_grade_released|attempt_number|can_manage_assignment|a\.teacher_id)/.test(
      message
    )
  ) {
    return true;
  }

  return false;
}

function matchesRiyadhDateBounds(
  iso: string | null | undefined,
  dateFrom?: string | null,
  dateTo?: string | null
): boolean {
  if (!dateFrom && !dateTo) return true;
  if (!iso) return false;
  const riyadhDate = utcToRiyadhInputs(iso).date;
  if (!riyadhDate) return false;
  if (dateFrom && riyadhDate < dateFrom) return false;
  if (dateTo && riyadhDate > dateTo) return false;
  return true;
}

/**
 * Pure transformer combining quiz attempts, assignment submissions, and attendance records
 * into a unified chronological academic transcript without fabricating missing grades as 0.
 */
export function buildUnifiedTranscript(record: StudentAcademicRecord): UnifiedTranscriptEntry[] {
  const entries: UnifiedTranscriptEntry[] = [];

  for (const q of record.quizzes) {
    const hasScore = q.percentageScore !== null && q.isResultReleased;
    const rawDisplay =
      hasScore && q.pointsScored !== null && q.totalPointsPossible !== null
        ? `${q.pointsScored} / ${q.totalPointsPossible}`
        : null;

    entries.push({
      id: `quiz-${q.id}`,
      entryType: 'quiz',
      title: q.title,
      titleArabic: q.titleArabic || q.title,
      courseId: q.courseId,
      courseTitle: q.courseTitle,
      courseTitleArabic: q.courseTitleArabic,
      groupId: q.groupId,
      groupName: q.groupName,
      groupNameArabic: q.groupNameArabic,
      academicYear: q.academicYear,
      eventAt: q.eventAt,
      statusLabel: q.status,
      statusKey: q.status,
      rawScoreDisplay: rawDisplay,
      percentageScore: hasScore ? q.percentageScore : null,
      passingThreshold: q.passingScore,
      isPassed: hasScore ? q.isPassed : null,
      isLate: false,
      isReleased: q.isResultReleased,
      feedback: q.teacherFeedback,
      attemptNumber: q.attemptNumber,
    });
  }

  for (const a of record.assignments) {
    const hasScore = a.score !== null && a.percentageScore !== null;
    const rawDisplay = hasScore ? `${a.score} / ${a.maxScore}` : null;

    entries.push({
      id: `assignment-${a.id}`,
      entryType: 'assignment',
      title: a.title,
      titleArabic: a.titleArabic || a.title,
      courseId: a.courseId,
      courseTitle: a.courseTitle,
      courseTitleArabic: a.courseTitleArabic,
      groupId: a.groupId,
      groupName: a.groupName,
      groupNameArabic: a.groupNameArabic,
      academicYear: a.academicYear,
      eventAt: a.submittedAt,
      statusLabel: a.status,
      statusKey: a.status,
      rawScoreDisplay: rawDisplay,
      percentageScore: hasScore ? a.percentageScore : null,
      passingThreshold: null,
      isPassed: null,
      isLate: a.isLate,
      isReleased: a.isGradeReleased,
      feedback: a.teacherFeedback,
      attemptNumber: a.attemptNumber,
    });
  }

  for (const att of record.attendance) {
    entries.push({
      id: `attendance-${att.id}`,
      entryType: 'attendance',
      title: att.sessionTitle,
      titleArabic: att.sessionTitleArabic || att.sessionTitle,
      courseId: att.courseId,
      courseTitle: att.courseTitle,
      courseTitleArabic: att.courseTitleArabic,
      groupId: att.groupId,
      groupName: att.groupName,
      groupNameArabic: att.groupNameArabic,
      academicYear: null,
      eventAt: att.startTime,
      statusLabel: att.status,
      statusKey: att.status,
      rawScoreDisplay: null,
      percentageScore: null,
      passingThreshold: null,
      isPassed: null,
      isLate: att.status === 'late',
      isReleased: true,
      feedback: att.notes,
      attemptNumber: null,
    });
  }

  return entries.sort((a, b) => new Date(b.eventAt).getTime() - new Date(a.eventAt).getTime());
}

/**
 * Pure client-side refinement filter + sort + pagination on an already-fetched student record.
 */
export function filterAndSortTranscript(
  entries: UnifiedTranscriptEntry[],
  filters: TranscriptFilterOptions
): UnifiedTranscriptEntry[] {
  const searchTerm = filters.search.trim().toLowerCase();

  const filtered = entries.filter((item) => {
    if (filters.assessmentType !== 'all' && item.entryType !== filters.assessmentType) {
      return false;
    }
    if (filters.courseId && filters.courseId !== 'all' && item.courseId !== filters.courseId) {
      return false;
    }
    if (filters.groupId && filters.groupId !== 'all' && item.groupId !== filters.groupId) {
      return false;
    }
    if (
      filters.academicYear &&
      filters.academicYear !== 'all' &&
      item.academicYear !== filters.academicYear
    ) {
      return false;
    }
    if (searchTerm) {
      const haystacks = [
        item.title,
        item.titleArabic,
        item.courseTitle || '',
        item.courseTitleArabic || '',
        item.feedback || '',
      ]
        .join(' ')
        .toLowerCase();
      if (!haystacks.includes(searchTerm)) return false;
    }
    return true;
  });

  return [...filtered].sort((a, b) => {
    if (filters.sortBy === 'date_asc') {
      return new Date(a.eventAt).getTime() - new Date(b.eventAt).getTime();
    }
    if (filters.sortBy === 'score_desc') {
      return (b.percentageScore ?? -1) - (a.percentageScore ?? -1);
    }
    if (filters.sortBy === 'score_asc') {
      return (a.percentageScore ?? 999) - (b.percentageScore ?? 999);
    }
    return new Date(b.eventAt).getTime() - new Date(a.eventAt).getTime();
  });
}

export function paginateArray<T>(
  items: T[],
  page: number,
  pageSize: number
): { items: T[]; totalPages: number; currentPage: number; totalCount: number } {
  const safeSize = Math.max(1, pageSize);
  const totalCount = items.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / safeSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * safeSize;
  return {
    items: items.slice(start, start + safeSize),
    totalPages,
    currentPage,
    totalCount,
  };
}

export function formatRecordTimestampRiyadh(iso: string | null | undefined, locale: 'ar' | 'en'): string {
  if (!iso) return '—';
  const formatted = formatRiyadhDateTime(iso, { locale, includeDate: true, includeTime: true });
  return formatted || '—';
}

export function mapRawAcademicRecord(raw: any): StudentAcademicRecord {
  const student = raw?.student || {};
  const attSum = raw?.attendance_summary || {};
  const sum = raw?.summary || {};

  return {
    student: {
      id: student.id,
      fullName: student.full_name || 'Student',
      fullNameArabic: student.full_name_arabic || student.full_name || 'طالب',
      status: student.status || 'active',
      studentNumber: student.student_number || null,
      username: student.username || null,
      enrolledAt: student.enrolled_at || new Date().toISOString(),
      notes: student.notes || null,
    },
    groups: Array.isArray(raw?.groups)
      ? raw.groups.map((g: any) => ({
          id: g.id,
          name: g.name,
          nameArabic: g.name_arabic || g.name,
          academicYear: g.academic_year || '2026/2027',
          isActive: Boolean(g.is_active),
          archivedAt: g.archived_at || null,
          isPrimary: Boolean(g.is_primary),
          joinedAt: g.joined_at || null,
        }))
      : [],
    courses: Array.isArray(raw?.courses)
      ? raw.courses.map((c: any) => ({
          courseId: c.course_id,
          title: c.title,
          titleArabic: c.title_arabic || c.title,
          level: c.level || 'beginner',
          isPublished: Boolean(c.is_published),
          groups: Array.isArray(c.groups)
            ? c.groups.map((cg: any) => ({
                id: cg.id,
                name: cg.name,
                nameArabic: cg.name_arabic || cg.name,
                academicYear: cg.academic_year || '2026/2027',
              }))
            : [],
          totalLessons: Number(c.total_lessons ?? 0),
          completedLessons: Number(c.completed_lessons ?? 0),
          pendingLessons: Number(c.pending_lessons ?? 0),
          progressPercentage: toNumOrNull(c.progress_percentage),
          lastAccessedAt: c.last_accessed_at || null,
        }))
      : [],
    quizzes: Array.isArray(raw?.quizzes)
      ? raw.quizzes.map((q: any) => ({
          id: q.id,
          quizId: q.quiz_id,
          title: q.title,
          titleArabic: q.title_arabic || q.title,
          courseId: q.course_id || null,
          courseTitle: q.course_title || null,
          courseTitleArabic: q.course_title_arabic || null,
          groupId: q.group_id || null,
          groupName: q.group_name || null,
          groupNameArabic: q.group_name_arabic || null,
          academicYear: q.academic_year || null,
          attemptNumber: Number(q.attempt_number ?? 1),
          status: q.status,
          passingScore: Number(q.passing_score ?? 60),
          requiresManualGrading: Boolean(q.requires_manual_grading),
          isResultReleased: Boolean(q.is_result_released),
          pointsScored: toNumOrNull(q.points_scored),
          totalPointsPossible: toNumOrNull(q.total_points_possible),
          percentageScore: toNumOrNull(q.percentage_score),
          isPassed: typeof q.is_passed === 'boolean' ? q.is_passed : null,
          teacherFeedback: q.teacher_feedback || null,
          startedAt: q.started_at,
          submittedAt: q.submitted_at || null,
          gradedAt: q.graded_at || null,
          eventAt: q.event_at || q.submitted_at || q.started_at,
        }))
      : [],
    assignments: Array.isArray(raw?.assignments)
      ? raw.assignments.map((a: any) => ({
          id: a.id,
          assignmentId: a.assignment_id,
          title: a.title,
          titleArabic: a.title_arabic || a.title,
          courseId: a.course_id || null,
          courseTitle: a.course_title || null,
          courseTitleArabic: a.course_title_arabic || null,
          groupId: a.group_id || null,
          groupName: a.group_name || null,
          groupNameArabic: a.group_name_arabic || null,
          academicYear: a.academic_year || null,
          attemptNumber: Number(a.attempt_number ?? 1),
          status: a.status || 'submitted',
          maxScore: Number(a.max_score ?? 100),
          dueDate: a.due_date || null,
          submittedAt: a.submitted_at,
          isLate: Boolean(a.is_late),
          gradedAt: a.graded_at || null,
          isGradeReleased: Boolean(a.is_grade_released),
          releasedAt: a.released_at || null,
          score: toNumOrNull(a.score),
          percentageScore: toNumOrNull(a.percentage_score),
          teacherFeedback: a.teacher_feedback || null,
        }))
      : [],
    attendance: Array.isArray(raw?.attendance)
      ? raw.attendance.map((att: any) => ({
          id: att.id,
          sessionId: att.session_id,
          sessionTitle: att.session_title,
          sessionTitleArabic: att.session_title_arabic || null,
          courseId: att.course_id || null,
          courseTitle: att.course_title || null,
          courseTitleArabic: att.course_title_arabic || null,
          groupId: att.group_id || null,
          groupName: att.group_name || null,
          groupNameArabic: att.group_name_arabic || null,
          startTime: att.start_time,
          status: att.status,
          joinedAt: att.joined_at || null,
          recordedAt: att.recorded_at,
          notes: att.notes || null,
        }))
      : [],
    attendanceSummary: {
      present: Number(attSum.present ?? 0),
      late: Number(attSum.late ?? 0),
      excused: Number(attSum.excused ?? 0),
      absent: Number(attSum.absent ?? 0),
      total: Number(attSum.total ?? 0),
      countableTotal: Number(attSum.countable_total ?? 0),
      attendanceRatePct: toNumOrNull(attSum.attendance_rate_pct),
    },
    summary: {
      enrolledCourses: Number(sum.enrolled_courses ?? 0),
      totalLessons: Number(sum.total_lessons ?? 0),
      completedLessons: Number(sum.completed_lessons ?? 0),
      pendingLessons: Number(sum.pending_lessons ?? 0),
      courseProgressPct: toNumOrNull(sum.course_progress_pct),
      quizAttemptsCount: Number(sum.quiz_attempts_count ?? 0),
      completedQuizzesCount: Number(sum.completed_quizzes_count ?? 0),
      gradedQuizzesCount: Number(sum.graded_quizzes_count ?? 0),
      avgQuizPercentage: toNumOrNull(sum.avg_quiz_percentage),
      assignmentSubmissionsCount: Number(sum.assignment_submissions_count ?? 0),
      gradedAssignmentsCount: Number(sum.graded_assignments_count ?? 0),
      avgAssignmentPercentage: toNumOrNull(sum.avg_assignment_percentage),
      overallAcademicAveragePct: toNumOrNull(sum.overall_academic_average_pct),
      passingThreshold: Number(sum.passing_threshold ?? 60),
      attendanceRatePct: toNumOrNull(sum.attendance_rate_pct),
      lastLearningActivityAt: sum.last_learning_activity_at || null,
    },
    timezone: raw?.timezone || ACADEMIC_TIMEZONE,
  };
}

// ============================================================================
// SCHEMA-SAFE DIRECT RLS QUERY IMPLEMENTATION (WHEN PHASE 6A RPC IS PENDING)
// ============================================================================

interface CallerContext {
  userId: string;
  role: 'super_admin' | 'teacher' | 'student';
  isSuperAdmin: boolean;
  isStaff: boolean;
}

interface TeacherScope {
  authorizedGroupIds: Set<string>;
  authorizedCourseIds: Set<string>;
  authorizedQuizIds: Set<string>;
  authorizedAssignmentIds: Set<string>;
}

const GROUP_MEMBERSHIPS_SELECT_WITH_ARCHIVE = `
  student_id,
  group_id,
  joined_at,
  groups:group_id (
    id,
    name,
    name_arabic,
    academic_year,
    is_active,
    archived_at
  )
`;

const GROUP_MEMBERSHIPS_SELECT_BASELINE = `
  student_id,
  group_id,
  joined_at,
  groups:group_id (
    id,
    name,
    name_arabic,
    academic_year,
    is_active
  )
`;

const PHASE5C_SUBMISSIONS_SELECT = `
  id,
  assignment_id,
  attempt_number,
  status,
  submitted_at,
  is_late,
  graded_at,
  is_grade_released,
  released_at,
  score,
  teacher_feedback,
  assignments:assignment_id (
    id,
    course_id,
    teacher_id,
    target_group_id,
    title,
    title_arabic,
    max_score,
    due_date,
    courses:course_id (
      id,
      title,
      title_arabic,
      teacher_id
    ),
    groups:target_group_id (
      id,
      name,
      name_arabic,
      academic_year
    )
  )
`;

const BASELINE_SUBMISSIONS_SELECT = `
  id,
  assignment_id,
  submitted_at,
  is_late,
  graded_at,
  score,
  teacher_feedback,
  assignments:assignment_id (
    id,
    course_id,
    target_group_id,
    title,
    title_arabic,
    max_score,
    due_date,
    courses:course_id (
      id,
      title,
      title_arabic,
      teacher_id
    ),
    groups:target_group_id (
      id,
      name,
      name_arabic,
      academic_year
    )
  )
`;

async function resolveCallerContext(
  client: SupabaseClient,
  userId: string,
  operation: string
): Promise<CallerContext> {
  let res;
  try {
    res = await client
      .from('profiles')
      .select('id, role, status')
      .eq('id', userId)
      .single();
  } catch (err) {
    throwLoggedServiceError(err, { service: SERVICE, operation });
  }

  if (res.error) {
    throwLoggedServiceError(res.error, {
      service: SERVICE,
      operation,
      fallbackMessage: 'Failed to verify active user role.',
    });
  }

  const profile = res.data as { id: string; role: string; status: string } | null;
  if (!profile || profile.status !== 'active') {
    throwLoggedServiceError(
      new ServiceError({
        category: 'AUTHORIZATION_ERROR',
        code: '42501',
        status: 403,
        message: 'Forbidden: Active account required',
        service: SERVICE,
        operation,
      }),
      { service: SERVICE, operation }
    );
  }

  if (profile.role !== 'super_admin' && profile.role !== 'teacher' && profile.role !== 'student') {
    throwLoggedServiceError(
      new ServiceError({
        category: 'AUTHORIZATION_ERROR',
        code: '42501',
        status: 403,
        message: 'Forbidden: Insufficient permissions',
        service: SERVICE,
        operation,
      }),
      { service: SERVICE, operation }
    );
  }

  return {
    userId: profile.id,
    role: profile.role,
    isSuperAdmin: profile.role === 'super_admin',
    isStaff: profile.role === 'super_admin' || profile.role === 'teacher',
  };
}

async function resolveTeacherScope(
  client: SupabaseClient,
  teacherId: string,
  operation: string
): Promise<TeacherScope> {
  const fetchTeacherAssignments = async () => {
    const primary = await client
      .from('assignments')
      .select('id, course_id, target_group_id')
      .eq('teacher_id', teacherId);

    if (primary.error && isMissingSchemaFeatureError(primary.error)) {
      return await client
        .from('assignments')
        .select('id, course_id, target_group_id, courses:course_id!inner(teacher_id)')
        .eq('courses.teacher_id', teacherId);
    }
    return primary;
  };

  let coursesRes: any;
  let sessionsRes: any;
  let quizzesRes: any;
  let assignmentsRes: any;

  try {
    [coursesRes, sessionsRes, quizzesRes, assignmentsRes] = await Promise.all([
      client.from('courses').select('id').eq('teacher_id', teacherId),
      client.from('live_sessions').select('group_id').eq('teacher_id', teacherId),
      client.from('quizzes').select('id, group_id').eq('teacher_id', teacherId),
      fetchTeacherAssignments(),
    ]);
  } catch (err) {
    throwLoggedServiceError(err, { service: SERVICE, operation: `${operation}.teacherScope` });
  }

  for (const r of [coursesRes, sessionsRes, quizzesRes, assignmentsRes]) {
    if (r.error) {
      throwLoggedServiceError(r.error, {
        service: SERVICE,
        operation: `${operation}.teacherScope`,
        fallbackMessage: 'Failed to verify teacher authorization scope.',
      });
    }
  }

  const authorizedCourseIds = new Set<string>(
    (coursesRes.data || []).map((c: any) => c.id).filter(Boolean)
  );
  const authorizedGroupIds = new Set<string>();
  const authorizedQuizIds = new Set<string>();
  const authorizedAssignmentIds = new Set<string>();

  for (const s of sessionsRes.data || []) {
    if (s.group_id) authorizedGroupIds.add(s.group_id);
  }
  for (const q of quizzesRes.data || []) {
    if (q.id) authorizedQuizIds.add(q.id);
    if (q.group_id) authorizedGroupIds.add(q.group_id);
  }
  for (const a of assignmentsRes.data || []) {
    if (a.id) authorizedAssignmentIds.add(a.id);
    if (a.target_group_id) authorizedGroupIds.add(a.target_group_id);
  }

  if (authorizedCourseIds.size > 0) {
    let gcRes: any;
    try {
      gcRes = await client
        .from('group_courses')
        .select('group_id')
        .in('course_id', Array.from(authorizedCourseIds));
    } catch (err) {
      throwLoggedServiceError(err, { service: SERVICE, operation: `${operation}.teacherGroups` });
    }
    if (gcRes.error) {
      throwLoggedServiceError(gcRes.error, {
        service: SERVICE,
        operation: `${operation}.teacherGroups`,
      });
    }
    for (const row of gcRes.data || []) {
      if (row.group_id) authorizedGroupIds.add(row.group_id);
    }
  }

  return {
    authorizedGroupIds,
    authorizedCourseIds,
    authorizedQuizIds,
    authorizedAssignmentIds,
  };
}

async function fetchGroupMembershipsWithSchemaFallback(
  client: SupabaseClient,
  filter: { studentIds?: string[]; studentId?: string }
): Promise<{ data: any[]; error: unknown }> {
  const buildQuery = (selectStr: string) => {
    let q = client.from('group_students').select(selectStr);
    if (filter.studentId) {
      q = q.eq('student_id', filter.studentId);
    } else if (filter.studentIds && filter.studentIds.length > 0) {
      q = q.in('student_id', filter.studentIds);
    }
    return q;
  };

  const primary = await buildQuery(GROUP_MEMBERSHIPS_SELECT_WITH_ARCHIVE);
  if (primary.error && isMissingSchemaFeatureError(primary.error)) {
    const fallback = await buildQuery(GROUP_MEMBERSHIPS_SELECT_BASELINE);
    return { data: fallback.data || [], error: fallback.error };
  }
  return { data: primary.data || [], error: primary.error };
}

async function fetchAccessibleStudentsDirect(
  client: SupabaseClient,
  caller: CallerContext
): Promise<AccessibleStudentOption[]> {
  const op = 'fetchAccessibleStudentsForRecords.direct';

  if (caller.role === 'student') {
    throwLoggedServiceError(
      new ServiceError({
        category: 'AUTHORIZATION_ERROR',
        code: '42501',
        status: 403,
        message: 'Forbidden: Only teachers and super admins can list student records',
        service: SERVICE,
        operation: op,
      }),
      { service: SERVICE, operation: op }
    );
  }

  let teacherScope: TeacherScope | null = null;
  let scopedStudentIds: string[] | null = null;

  if (caller.role === 'teacher') {
    teacherScope = await resolveTeacherScope(client, caller.userId, op);
    const idSet = new Set<string>();

    const groupIds = Array.from(teacherScope.authorizedGroupIds);
    const quizIds = Array.from(teacherScope.authorizedQuizIds);
    const assignmentIds = Array.from(teacherScope.authorizedAssignmentIds);

    let gsRes: any = { data: [], error: null };
    let qaRes: any = { data: [], error: null };
    let subRes: any = { data: [], error: null };

    try {
      [gsRes, qaRes, subRes] = await Promise.all([
        groupIds.length > 0
          ? client.from('group_students').select('student_id').in('group_id', groupIds)
          : Promise.resolve({ data: [], error: null }),
        quizIds.length > 0
          ? client.from('quiz_attempts').select('student_id').in('quiz_id', quizIds)
          : Promise.resolve({ data: [], error: null }),
        assignmentIds.length > 0
          ? client.from('submissions').select('student_id').in('assignment_id', assignmentIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
    } catch (err) {
      throwLoggedServiceError(err, { service: SERVICE, operation: op });
    }

    for (const r of [gsRes, qaRes, subRes]) {
      if (r.error) {
        throwLoggedServiceError(r.error, { service: SERVICE, operation: op });
      }
    }

    for (const row of gsRes.data || []) if (row.student_id) idSet.add(row.student_id);
    for (const row of qaRes.data || []) if (row.student_id) idSet.add(row.student_id);
    for (const row of subRes.data || []) if (row.student_id) idSet.add(row.student_id);

    scopedStudentIds = Array.from(idSet);
    if (scopedStudentIds.length === 0) {
      return [];
    }
  }

  let profilesQuery = client
    .from('profiles')
    .select('id, full_name, full_name_arabic, status, created_at')
    .eq('role', 'student');

  if (scopedStudentIds !== null) {
    profilesQuery = profilesQuery.in('id', scopedStudentIds);
  }

  let profilesRes: any;
  try {
    profilesRes = await profilesQuery;
  } catch (err) {
    throwLoggedServiceError(err, { service: SERVICE, operation: `${op}.profiles` });
  }
  if (profilesRes.error) {
    throwLoggedServiceError(profilesRes.error, { service: SERVICE, operation: `${op}.profiles` });
  }

  const profileRows = profilesRes.data || [];
  if (profileRows.length === 0) return [];

  const studentIds = profileRows.map((p: any) => p.id);

  let sapRes: any;
  let membershipsRes: { data: any[]; error: unknown };
  try {
    [sapRes, membershipsRes] = await Promise.all([
      client
        .from('student_academic_profiles')
        .select('profile_id, student_number, username, group_id, enrolled_at')
        .in('profile_id', studentIds),
      fetchGroupMembershipsWithSchemaFallback(client, { studentIds }),
    ]);
  } catch (err) {
    throwLoggedServiceError(err, { service: SERVICE, operation: `${op}.details` });
  }

  if (sapRes.error) {
    throwLoggedServiceError(sapRes.error, { service: SERVICE, operation: `${op}.academicProfiles` });
  }
  if (membershipsRes.error) {
    throwLoggedServiceError(membershipsRes.error, {
      service: SERVICE,
      operation: `${op}.groupMemberships`,
    });
  }

  const sapMap = new Map<string, any>();
  for (const s of sapRes.data || []) {
    sapMap.set(s.profile_id, s);
  }

  const groupsByStudent = new Map<string, AcademicGroupMembership[]>();
  for (const row of membershipsRes.data || []) {
    const g = unwrapSingle<any>(row.groups);
    if (!g?.id) continue;
    if (teacherScope && !teacherScope.authorizedGroupIds.has(g.id)) continue;

    const primaryGroupId = sapMap.get(row.student_id)?.group_id || null;
    const list = groupsByStudent.get(row.student_id) || [];
    list.push({
      id: g.id,
      name: g.name,
      nameArabic: g.name_arabic || g.name,
      academicYear: g.academic_year || '2026/2027',
      isActive: Boolean(g.is_active),
      archivedAt: g.archived_at ?? null,
      isPrimary: Boolean(primaryGroupId && g.id === primaryGroupId),
      joinedAt: row.joined_at ?? null,
    });
    groupsByStudent.set(row.student_id, list);
  }

  return profileRows
    .map((p: any) => {
      const sap = sapMap.get(p.id);
      const groups = (groupsByStudent.get(p.id) || []).sort((a, b) => {
        if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      return {
        id: p.id,
        fullName: p.full_name,
        fullNameArabic: p.full_name_arabic || p.full_name,
        status: p.status || 'active',
        studentNumber: sap?.student_number || null,
        username: sap?.username || null,
        enrolledAt: sap?.enrolled_at || p.created_at,
        groups,
      };
    })
    .sort((a: AccessibleStudentOption, b: AccessibleStudentOption) =>
      a.fullNameArabic.localeCompare(b.fullNameArabic, 'ar')
    );
}

/**
 * Pure builder computing a complete StudentAcademicRecord from real RLS-filtered table rows.
 * Enforces student privacy/release gating, NULL preservation for ungraded items, course
 * deduplication across groups, Asia/Riyadh date bounds, and teacher scope filtering.
 */
export function buildDirectStudentAcademicRecord(params: {
  callerRole: 'super_admin' | 'teacher' | 'student';
  callerId: string;
  studentProfile: any;
  academicProfile: any | null;
  membershipRows: any[];
  groupCoursesRows: any[];
  lessonRows: any[];
  lessonProgressRows: any[];
  quizAttemptRows: any[];
  submissionRows: any[];
  attendanceRows: any[];
  passingThreshold?: number;
  filters?: AcademicRecordQueryFilters;
  teacherScope?: TeacherScope | null;
  assignmentTargetGroupIdsByAssignment?: Map<string, Set<string>>;
}): StudentAcademicRecord {
  const {
    callerRole,
    callerId,
    studentProfile,
    academicProfile,
    membershipRows,
    groupCoursesRows,
    lessonRows,
    lessonProgressRows,
    quizAttemptRows,
    submissionRows,
    attendanceRows,
    passingThreshold = 60,
    filters = {},
    teacherScope = null,
    assignmentTargetGroupIdsByAssignment = new Map(),
  } = params;

  const isStaff = callerRole === 'super_admin' || callerRole === 'teacher';
  const isSuper = callerRole === 'super_admin';
  const primaryGroupId: string | null = academicProfile?.group_id || null;

  const courseFilter = filters.courseId && filters.courseId !== 'all' ? filters.courseId : null;
  const groupFilter = filters.groupId && filters.groupId !== 'all' ? filters.groupId : null;
  const yearFilter =
    filters.academicYear && filters.academicYear !== 'all' ? filters.academicYear : null;
  const dateFrom = filters.dateFrom || null;
  const dateTo = filters.dateTo || null;

  const studentGroupsMap = new Map<string, AcademicGroupMembership>();
  const studentAcademicYears = new Set<string>();
  for (const row of membershipRows || []) {
    const g = unwrapSingle<any>(row.groups);
    if (!g?.id) continue;
    if (g.academic_year) studentAcademicYears.add(g.academic_year);
    if (callerRole === 'teacher' && teacherScope && !teacherScope.authorizedGroupIds.has(g.id)) {
      continue;
    }
    studentGroupsMap.set(g.id, {
      id: g.id,
      name: g.name,
      nameArabic: g.name_arabic || g.name,
      academicYear: g.academic_year || '2026/2027',
      isActive: Boolean(g.is_active),
      archivedAt: g.archived_at ?? null,
      isPrimary: Boolean(primaryGroupId && g.id === primaryGroupId),
      joinedAt: row.joined_at ?? null,
    });
  }

  const groups = Array.from(studentGroupsMap.values()).sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    const bTime = b.joinedAt ? new Date(b.joinedAt).getTime() : 0;
    const aTime = a.joinedAt ? new Date(a.joinedAt).getTime() : 0;
    return bTime - aTime;
  });

  // Track course -> associated group IDs from group_courses
  const allCourseGroupIds = new Map<string, Set<string>>();
  const scopedCourseMap = new Map<
    string,
    {
      courseId: string;
      title: string;
      titleArabic: string;
      level: string;
      isPublished: boolean;
      groupsMap: Map<string, { id: string; name: string; nameArabic: string; academicYear: string }>;
    }
  >();

  for (const row of groupCoursesRows || []) {
    const c = unwrapSingle<any>(row.courses);
    const g = unwrapSingle<any>(row.groups);
    if (!c?.id || !g?.id) continue;

    if (!allCourseGroupIds.has(c.id)) {
      allCourseGroupIds.set(c.id, new Set<string>());
    }
    allCourseGroupIds.get(c.id)!.add(g.id);

    if (groupFilter && g.id !== groupFilter) continue;
    if (courseFilter && c.id !== courseFilter) continue;
    if (yearFilter && g.academic_year !== yearFilter) continue;
    if (
      callerRole === 'teacher' &&
      teacherScope &&
      c.teacher_id !== callerId &&
      !teacherScope.authorizedGroupIds.has(g.id)
    ) {
      continue;
    }

    let entry = scopedCourseMap.get(c.id);
    if (!entry) {
      entry = {
        courseId: c.id,
        title: c.title,
        titleArabic: c.title_arabic || c.title,
        level: c.level || 'beginner',
        isPublished: Boolean(c.is_published),
        groupsMap: new Map(),
      };
      scopedCourseMap.set(c.id, entry);
    }
    entry.groupsMap.set(g.id, {
      id: g.id,
      name: g.name,
      nameArabic: g.name_arabic || g.name,
      academicYear: g.academic_year || '2026/2027',
    });
  }

  const progressByLesson = new Map<string, any>();
  for (const lp of lessonProgressRows || []) {
    if (lp.lesson_id) progressByLesson.set(lp.lesson_id, lp);
  }

  const lessonStatsByCourse = new Map<
    string,
    { total: number; completed: number; lastAccessedAt: string | null }
  >();
  for (const l of lessonRows || []) {
    if (!l.is_published || !scopedCourseMap.has(l.course_id)) continue;
    const stats = lessonStatsByCourse.get(l.course_id) || {
      total: 0,
      completed: 0,
      lastAccessedAt: null,
    };
    stats.total += 1;
    const prog = progressByLesson.get(l.id);
    if (prog?.is_completed) stats.completed += 1;
    if (prog?.last_accessed_at) {
      if (
        !stats.lastAccessedAt ||
        new Date(prog.last_accessed_at).getTime() > new Date(stats.lastAccessedAt).getTime()
      ) {
        stats.lastAccessedAt = prog.last_accessed_at;
      }
    }
    lessonStatsByCourse.set(l.course_id, stats);
  }

  const courses: AcademicCourseProgressRow[] = Array.from(scopedCourseMap.values())
    .map((entry) => {
      const stats = lessonStatsByCourse.get(entry.courseId) || {
        total: 0,
        completed: 0,
        lastAccessedAt: null,
      };
      return {
        courseId: entry.courseId,
        title: entry.title,
        titleArabic: entry.titleArabic,
        level: entry.level,
        isPublished: entry.isPublished,
        groups: Array.from(entry.groupsMap.values()),
        totalLessons: stats.total,
        completedLessons: stats.completed,
        pendingLessons: Math.max(stats.total - stats.completed, 0),
        progressPercentage: stats.total === 0 ? null : round1((stats.completed / stats.total) * 100),
        lastAccessedAt: stats.lastAccessedAt,
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));

  // Deduplicated & Scoped Quiz Attempts
  const seenQuizAttemptIds = new Set<string>();
  const quizzes: AcademicQuizRow[] = [];
  for (const qa of quizAttemptRows || []) {
    if (!qa?.id || seenQuizAttemptIds.has(qa.id)) continue;
    const q = unwrapSingle<any>(qa.quizzes);
    if (!q?.id) continue;
    const c = unwrapSingle<any>(q.courses);
    const g = unwrapSingle<any>(q.groups);
    const eventAt = qa.submitted_at || qa.completed_at || qa.started_at;

    if (courseFilter && q.course_id !== courseFilter) continue;
    if (
      groupFilter &&
      q.group_id !== groupFilter &&
      !(q.course_id && allCourseGroupIds.get(q.course_id)?.has(groupFilter))
    ) {
      continue;
    }
    if (
      yearFilter &&
      g?.academic_year !== yearFilter &&
      !studentAcademicYears.has(yearFilter)
    ) {
      continue;
    }
    if (!matchesRiyadhDateBounds(eventAt, dateFrom, dateTo)) continue;

    if (callerRole === 'teacher' && teacherScope && !isSuper) {
      const canManageQuiz =
        q.teacher_id === callerId ||
        (!q.teacher_id && q.course_id && teacherScope.authorizedCourseIds.has(q.course_id)) ||
        (q.group_id && teacherScope.authorizedGroupIds.has(q.group_id));
      if (!canManageQuiz) continue;
    }

    seenQuizAttemptIds.add(qa.id);

    const canViewScore =
      qa.status === 'in_progress'
        ? false
        : isStaff
        ? true
        : qa.status === 'graded'
        ? true
        : qa.status === 'submitted' &&
          Boolean(q.show_results_immediately) &&
          !qa.requires_manual_grading;

    const isCompletedStatus = qa.status === 'submitted' || qa.status === 'graded';

    quizzes.push({
      id: qa.id,
      quizId: qa.quiz_id,
      title: q.title,
      titleArabic: q.title_arabic || q.title,
      courseId: q.course_id || null,
      courseTitle: c?.title || null,
      courseTitleArabic: c?.title_arabic || null,
      groupId: q.group_id || null,
      groupName: g?.name || null,
      groupNameArabic: g?.name_arabic || null,
      academicYear: g?.academic_year || null,
      attemptNumber: Number(qa.attempt_number ?? 1),
      status: qa.status,
      passingScore: Number(q.passing_score ?? 60),
      requiresManualGrading: Boolean(qa.requires_manual_grading),
      isResultReleased: canViewScore,
      pointsScored: canViewScore && isCompletedStatus ? toNumOrNull(qa.points_scored) : null,
      totalPointsPossible:
        canViewScore && isCompletedStatus ? toNumOrNull(qa.total_points_possible) : null,
      percentageScore: canViewScore && isCompletedStatus ? toNumOrNull(qa.percentage_score) : null,
      isPassed:
        canViewScore && isCompletedStatus && typeof qa.is_passed === 'boolean'
          ? qa.is_passed
          : null,
      teacherFeedback: canViewScore ? qa.teacher_feedback || null : null,
      startedAt: qa.started_at,
      submittedAt: qa.submitted_at || null,
      gradedAt: qa.graded_at || null,
      eventAt,
    });
  }
  quizzes.sort((a, b) => new Date(b.eventAt).getTime() - new Date(a.eventAt).getTime());

  // Deduplicated & Scoped Assignment Submissions (Baseline & Phase 5C safe)
  const seenSubmissionIds = new Set<string>();
  const assignments: AcademicAssignmentRow[] = [];
  for (const s of submissionRows || []) {
    if (!s?.id || seenSubmissionIds.has(s.id)) continue;
    const a = unwrapSingle<any>(s.assignments);
    if (!a?.id) continue;
    const c = unwrapSingle<any>(a.courses);
    const g = unwrapSingle<any>(a.groups);

    if (courseFilter && a.course_id !== courseFilter) continue;
    if (
      groupFilter &&
      a.target_group_id !== groupFilter &&
      !assignmentTargetGroupIdsByAssignment.get(a.id)?.has(groupFilter) &&
      !(a.course_id && allCourseGroupIds.get(a.course_id)?.has(groupFilter))
    ) {
      continue;
    }
    if (
      yearFilter &&
      g?.academic_year !== yearFilter &&
      !studentAcademicYears.has(yearFilter)
    ) {
      continue;
    }
    if (!matchesRiyadhDateBounds(s.submitted_at, dateFrom, dateTo)) continue;

    if (callerRole === 'teacher' && teacherScope && !isSuper) {
      const canManageAssignment =
        a.teacher_id === callerId ||
        (c?.teacher_id && c.teacher_id === callerId) ||
        (a.course_id && teacherScope.authorizedCourseIds.has(a.course_id)) ||
        (a.target_group_id && teacherScope.authorizedGroupIds.has(a.target_group_id));
      if (!canManageAssignment) continue;
    }

    seenSubmissionIds.add(s.id);

    const rawScore = toNumOrNull(s.score);
    const hasPhase5CReleaseFlag =
      s.is_grade_released !== undefined && s.is_grade_released !== null;
    const isGradeReleased = hasPhase5CReleaseFlag
      ? Boolean(s.is_grade_released)
      : rawScore !== null;
    const canViewGrade = isStaff ? rawScore !== null : isGradeReleased && rawScore !== null;
    const maxScore = Number(a.max_score ?? 100);
    const status =
      s.status || (rawScore !== null || s.graded_at ? 'graded' : 'submitted');

    assignments.push({
      id: s.id,
      assignmentId: s.assignment_id,
      title: a.title,
      titleArabic: a.title_arabic || a.title,
      courseId: a.course_id || null,
      courseTitle: c?.title || null,
      courseTitleArabic: c?.title_arabic || null,
      groupId: a.target_group_id || null,
      groupName: g?.name || null,
      groupNameArabic: g?.name_arabic || null,
      academicYear: g?.academic_year || null,
      attemptNumber: Number(s.attempt_number ?? 1),
      status,
      maxScore,
      dueDate: a.due_date || null,
      submittedAt: s.submitted_at,
      isLate: Boolean(s.is_late),
      gradedAt: s.graded_at || null,
      isGradeReleased,
      releasedAt: s.released_at ?? (isGradeReleased ? s.graded_at || null : null),
      score: canViewGrade ? rawScore : null,
      percentageScore:
        canViewGrade && rawScore !== null && maxScore > 0
          ? round1((rawScore / maxScore) * 100)
          : null,
      teacherFeedback:
        canViewGrade || status === 'returned_for_revision' ? s.teacher_feedback || null : null,
    });
  }
  assignments.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

  // Attendance History & Summary
  const seenAttendanceIds = new Set<string>();
  const attendance: AcademicAttendanceRow[] = [];
  for (const att of attendanceRows || []) {
    if (!att?.id || seenAttendanceIds.has(att.id)) continue;
    const ls = unwrapSingle<any>(att.live_sessions);
    if (!ls?.id) continue;
    const c = unwrapSingle<any>(ls.courses);
    const g = unwrapSingle<any>(ls.groups);

    if (courseFilter && ls.course_id !== courseFilter) continue;
    if (groupFilter && ls.group_id !== groupFilter) continue;
    if (yearFilter && g?.academic_year !== yearFilter) continue;
    if (!matchesRiyadhDateBounds(ls.start_time, dateFrom, dateTo)) continue;

    if (callerRole === 'teacher' && teacherScope && !isSuper) {
      const canViewSession =
        ls.teacher_id === callerId ||
        (ls.group_id && teacherScope.authorizedGroupIds.has(ls.group_id));
      if (!canViewSession) continue;
    }

    seenAttendanceIds.add(att.id);
    attendance.push({
      id: att.id,
      sessionId: att.session_id,
      sessionTitle: ls.title,
      sessionTitleArabic: ls.title_arabic || null,
      courseId: ls.course_id || null,
      courseTitle: c?.title || null,
      courseTitleArabic: c?.title_arabic || null,
      groupId: ls.group_id || null,
      groupName: g?.name || null,
      groupNameArabic: g?.name_arabic || null,
      startTime: ls.start_time,
      status: att.status,
      joinedAt: att.joined_at || null,
      recordedAt: att.recorded_at,
      notes: att.notes || null,
    });
  }
  attendance.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

  let present = 0;
  let late = 0;
  let excused = 0;
  let absent = 0;
  for (const att of attendance) {
    if (att.status === 'present') present += 1;
    else if (att.status === 'late') late += 1;
    else if (att.status === 'excused') excused += 1;
    else if (att.status === 'absent') absent += 1;
  }
  const countableTotal = present + late + absent;
  const attendanceSummary: AcademicAttendanceSummary = {
    present,
    late,
    excused,
    absent,
    total: attendance.length,
    countableTotal,
    attendanceRatePct: countableTotal === 0 ? null : round1(((present + late) / countableTotal) * 100),
  };

  // Last learning activity across unfiltered student timestamps
  const activityDates: string[] = [];
  for (const lp of lessonProgressRows || []) if (lp.last_accessed_at) activityDates.push(lp.last_accessed_at);
  for (const qa of quizAttemptRows || []) {
    const ts = qa.submitted_at || qa.completed_at || qa.started_at;
    if (ts) activityDates.push(ts);
  }
  for (const s of submissionRows || []) if (s.submitted_at) activityDates.push(s.submitted_at);
  for (const att of attendanceRows || []) if (att.recorded_at) activityDates.push(att.recorded_at);

  let lastLearningActivityAt: string | null = null;
  let latestMs = -Infinity;
  for (const iso of activityDates) {
    const ms = new Date(iso).getTime();
    if (!Number.isNaN(ms) && ms > latestMs) {
      latestMs = ms;
      lastLearningActivityAt = iso;
    }
  }

  const totalLessons = courses.reduce((acc, c) => acc + c.totalLessons, 0);
  const completedLessons = courses.reduce((acc, c) => acc + c.completedLessons, 0);
  const pendingLessons = Math.max(totalLessons - completedLessons, 0);

  const quizPercentages = quizzes
    .map((q) => q.percentageScore)
    .filter((v): v is number => v !== null);
  const assignmentPercentages = assignments
    .map((a) => a.percentageScore)
    .filter((v): v is number => v !== null);
  const combinedPercentages = [...quizPercentages, ...assignmentPercentages];

  const avgQuizPercentage =
    quizPercentages.length === 0
      ? null
      : round1(quizPercentages.reduce((sum, v) => sum + v, 0) / quizPercentages.length);
  const avgAssignmentPercentage =
    assignmentPercentages.length === 0
      ? null
      : round1(
          assignmentPercentages.reduce((sum, v) => sum + v, 0) / assignmentPercentages.length
        );
  const overallAcademicAveragePct =
    combinedPercentages.length === 0
      ? null
      : round1(combinedPercentages.reduce((sum, v) => sum + v, 0) / combinedPercentages.length);

  return {
    student: {
      id: studentProfile.id,
      fullName: studentProfile.full_name || 'Student',
      fullNameArabic: studentProfile.full_name_arabic || studentProfile.full_name || 'طالب',
      status: studentProfile.status || 'active',
      studentNumber: academicProfile?.student_number || null,
      username: academicProfile?.username || null,
      enrolledAt: academicProfile?.enrolled_at || studentProfile.created_at,
      notes: isStaff ? academicProfile?.notes || null : null,
    },
    groups,
    courses,
    quizzes,
    assignments,
    attendance,
    attendanceSummary,
    summary: {
      enrolledCourses: courses.length,
      totalLessons,
      completedLessons,
      pendingLessons,
      courseProgressPct: totalLessons === 0 ? null : round1((completedLessons / totalLessons) * 100),
      quizAttemptsCount: quizzes.length,
      completedQuizzesCount: quizzes.filter(
        (q) => q.status === 'submitted' || q.status === 'graded'
      ).length,
      gradedQuizzesCount: quizPercentages.length,
      avgQuizPercentage,
      assignmentSubmissionsCount: assignments.length,
      gradedAssignmentsCount: assignmentPercentages.length,
      avgAssignmentPercentage,
      overallAcademicAveragePct,
      passingThreshold,
      attendanceRatePct: attendanceSummary.attendanceRatePct,
      lastLearningActivityAt,
    },
    timezone: ACADEMIC_TIMEZONE,
  };
}

async function fetchStudentAcademicRecordDirect(
  client: SupabaseClient,
  caller: CallerContext,
  filters: AcademicRecordQueryFilters
): Promise<StudentAcademicRecord> {
  const op = 'fetchStudentAcademicRecord.direct';

  let targetStudentId: string;
  if (caller.role === 'student') {
    if (filters.studentId && filters.studentId !== caller.userId) {
      throwLoggedServiceError(
        new ServiceError({
          category: 'AUTHORIZATION_ERROR',
          code: '42501',
          status: 403,
          message: 'Forbidden: Students can only access their own academic record',
          service: SERVICE,
          operation: op,
        }),
        { service: SERVICE, operation: op }
      );
    }
    targetStudentId = caller.userId;
  } else {
    if (!filters.studentId) {
      throwLoggedServiceError(
        new ServiceError({
          category: 'VALIDATION_ERROR',
          code: '22023',
          status: 400,
          message: 'Student identifier is required for staff academic record lookup',
          service: SERVICE,
          operation: op,
        }),
        { service: SERVICE, operation: op }
      );
    }
    targetStudentId = filters.studentId;
  }

  let studentRes: any;
  let sapRes: any;
  let membershipsRes: { data: any[]; error: unknown };
  try {
    [studentRes, sapRes, membershipsRes] = await Promise.all([
      client
        .from('profiles')
        .select('id, role, status, full_name, full_name_arabic, created_at')
        .eq('id', targetStudentId)
        .eq('role', 'student')
        .maybeSingle(),
      client
        .from('student_academic_profiles')
        .select('profile_id, student_number, username, group_id, enrolled_at, notes')
        .eq('profile_id', targetStudentId)
        .maybeSingle(),
      fetchGroupMembershipsWithSchemaFallback(client, { studentId: targetStudentId }),
    ]);
  } catch (err) {
    throwLoggedServiceError(err, { service: SERVICE, operation: `${op}.studentProfile` });
  }

  if (studentRes.error) {
    throwLoggedServiceError(studentRes.error, {
      service: SERVICE,
      operation: `${op}.studentProfile`,
    });
  }
  if (!studentRes.data) {
    throwLoggedServiceError(
      new ServiceError({
        category: 'NOT_FOUND',
        code: 'P0002',
        status: 404,
        message: 'Student academic record not found',
        service: SERVICE,
        operation: op,
      }),
      { service: SERVICE, operation: op }
    );
  }
  if (sapRes.error) {
    throwLoggedServiceError(sapRes.error, {
      service: SERVICE,
      operation: `${op}.academicProfile`,
    });
  }
  if (membershipsRes.error) {
    throwLoggedServiceError(membershipsRes.error, {
      service: SERVICE,
      operation: `${op}.groupMemberships`,
    });
  }

  let teacherScope: TeacherScope | null = null;
  if (caller.role === 'teacher') {
    teacherScope = await resolveTeacherScope(client, caller.userId, op);
  }

  const studentGroupIds = Array.from(
    new Set(
      (membershipsRes.data || [])
        .map((m: any) => m.group_id)
        .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
    )
  );

  const fetchGroupCoursesPromise =
    studentGroupIds.length > 0
      ? client
          .from('group_courses')
          .select(
            `
            course_id,
            group_id,
            courses:course_id (
              id,
              title,
              title_arabic,
              level,
              is_published,
              teacher_id
            ),
            groups:group_id (
              id,
              name,
              name_arabic,
              academic_year
            )
          `
          )
          .in('group_id', studentGroupIds)
      : Promise.resolve({ data: [], error: null });

  const fetchAttendancePromise = client
    .from('attendance')
    .select(
      `
      id,
      session_id,
      status,
      joined_at,
      recorded_at,
      notes,
      live_sessions:session_id (
        id,
        course_id,
        group_id,
        teacher_id,
        title,
        title_arabic,
        start_time,
        end_time,
        status,
        courses:course_id (
          id,
          title,
          title_arabic
        ),
        groups:group_id (
          id,
          name,
          name_arabic,
          academic_year
        )
      )
    `
    )
    .eq('student_id', targetStudentId);

  const fetchQuizzesPromise = client
    .from('quiz_attempts')
    .select(
      `
      id,
      quiz_id,
      attempt_number,
      status,
      requires_manual_grading,
      started_at,
      completed_at,
      submitted_at,
      graded_at,
      points_scored,
      total_points_possible,
      percentage_score,
      is_passed,
      teacher_feedback,
      quizzes:quiz_id (
        id,
        course_id,
        group_id,
        teacher_id,
        title,
        title_arabic,
        passing_score,
        show_results_immediately,
        courses:course_id (
          id,
          title,
          title_arabic
        ),
        groups:group_id (
          id,
          name,
          name_arabic,
          academic_year
        )
      )
    `
    )
    .eq('student_id', targetStudentId);

  const fetchSubmissionsWithSchemaFallback = async () => {
    const primary = await client
      .from('submissions')
      .select(PHASE5C_SUBMISSIONS_SELECT)
      .eq('student_id', targetStudentId);

    if (primary.error && isMissingSchemaFeatureError(primary.error)) {
      return await client
        .from('submissions')
        .select(BASELINE_SUBMISSIONS_SELECT)
        .eq('student_id', targetStudentId);
    }

    return primary;
  };

  const fetchPassingThresholdPromise = async (): Promise<number> => {
    if (!caller.isStaff) return 60;
    try {
      const settingsRes = await client
        .from('system_settings')
        .select('value')
        .eq('key', 'academic_settings')
        .maybeSingle();

      if (settingsRes.error) {
        if (isMissingSchemaFeatureError(settingsRes.error)) {
          return 60;
        }
        const errCat = toServiceError(settingsRes.error, {
          service: SERVICE,
          operation: `${op}.settings`,
        });
        if (errCat.category === 'AUTHORIZATION_ERROR' || errCat.category === 'NOT_FOUND') {
          return 60;
        }
        throw errCat;
      }

      const rawVal = (settingsRes.data as any)?.value?.default_passing_score;
      const parsed = Number(rawVal);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 60;
    } catch (err) {
      if (err instanceof ServiceError && err.category === 'NETWORK_ERROR') {
        throw err;
      }
      return 60;
    }
  };

  let groupCoursesRes: any;
  let attendanceRes: any;
  let quizzesRes: any;
  let submissionsRes: any;
  let passingThreshold = 60;

  try {
    [groupCoursesRes, attendanceRes, quizzesRes, submissionsRes, passingThreshold] =
      await Promise.all([
        fetchGroupCoursesPromise,
        fetchAttendancePromise,
        fetchQuizzesPromise,
        fetchSubmissionsWithSchemaFallback(),
        fetchPassingThresholdPromise(),
      ]);
  } catch (err) {
    throwLoggedServiceError(err, { service: SERVICE, operation: op });
  }

  for (const r of [groupCoursesRes, attendanceRes, quizzesRes, submissionsRes]) {
    if (r.error) {
      throwLoggedServiceError(r.error, {
        service: SERVICE,
        operation: op,
        fallbackMessage: 'Failed to load student academic record components.',
      });
    }
  }

  // Verify teacher authorization against cohort OR quiz/assignment activity (mirrors can_staff_view_student_record)
  if (caller.role === 'teacher' && teacherScope) {
    const inAuthorizedGroup = studentGroupIds.some((gid) =>
      teacherScope!.authorizedGroupIds.has(gid)
    );
    const hasTeacherQuizAttempt = (quizzesRes.data || []).some((qa: any) =>
      teacherScope!.authorizedQuizIds.has(qa.quiz_id)
    );
    const hasTeacherSubmission = (submissionsRes.data || []).some((s: any) =>
      teacherScope!.authorizedAssignmentIds.has(s.assignment_id)
    );

    if (!inAuthorizedGroup && !hasTeacherQuizAttempt && !hasTeacherSubmission) {
      throwLoggedServiceError(
        new ServiceError({
          category: 'AUTHORIZATION_ERROR',
          code: '42501',
          status: 403,
          message: 'Forbidden: You are not authorized to view this student record',
          service: SERVICE,
          operation: op,
        }),
        { service: SERVICE, operation: op }
      );
    }
  }

  const courseIds = Array.from(
    new Set(
      (groupCoursesRes.data || [])
        .map((gc: any) => gc.course_id)
        .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
    )
  );

  let lessonRows: any[] = [];
  let lessonProgressRows: any[] = [];
  if (courseIds.length > 0) {
    let lessonsRes: any;
    let progressRes: any;
    try {
      [lessonsRes, progressRes] = await Promise.all([
        client.from('lessons').select('id, course_id, is_published').in('course_id', courseIds),
        client
          .from('lesson_progress')
          .select('lesson_id, is_completed, last_accessed_at')
          .eq('student_id', targetStudentId),
      ]);
    } catch (err) {
      throwLoggedServiceError(err, { service: SERVICE, operation: `${op}.lessons` });
    }
    if (lessonsRes.error) {
      throwLoggedServiceError(lessonsRes.error, { service: SERVICE, operation: `${op}.lessons` });
    }
    if (progressRes.error) {
      throwLoggedServiceError(progressRes.error, {
        service: SERVICE,
        operation: `${op}.lessonProgress`,
      });
    }
    lessonRows = lessonsRes.data || [];
    lessonProgressRows = progressRes.data || [];
  }

  // Optional multi-group assignment_targets resolution when groupId filter is active
  const assignmentTargetGroupIdsByAssignment = new Map<string, Set<string>>();
  const submissionAssignmentIds = Array.from(
    new Set(
      (submissionsRes.data || [])
        .map((s: any) => s.assignment_id)
        .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
    )
  );
  if (filters.groupId && filters.groupId !== 'all' && submissionAssignmentIds.length > 0) {
    try {
      const targetsRes = await client
        .from('assignment_targets')
        .select('assignment_id, group_id')
        .in('assignment_id', submissionAssignmentIds)
        .not('group_id', 'is', null);

      if (targetsRes.error) {
        if (!isMissingSchemaFeatureError(targetsRes.error)) {
          throwLoggedServiceError(targetsRes.error, {
            service: SERVICE,
            operation: `${op}.assignmentTargets`,
          });
        }
      } else {
        for (const t of targetsRes.data || []) {
          if (!t.assignment_id || !t.group_id) continue;
          if (!assignmentTargetGroupIdsByAssignment.has(t.assignment_id)) {
            assignmentTargetGroupIdsByAssignment.set(t.assignment_id, new Set<string>());
          }
          assignmentTargetGroupIdsByAssignment.get(t.assignment_id)!.add(t.group_id);
        }
      }
    } catch (err) {
      if (err instanceof ServiceError) throw err;
      throwLoggedServiceError(err, { service: SERVICE, operation: `${op}.assignmentTargets` });
    }
  }

  return buildDirectStudentAcademicRecord({
    callerRole: caller.role,
    callerId: caller.userId,
    studentProfile: studentRes.data,
    academicProfile: sapRes.data || null,
    membershipRows: membershipsRes.data || [],
    groupCoursesRows: groupCoursesRes.data || [],
    lessonRows,
    lessonProgressRows,
    quizAttemptRows: quizzesRes.data || [],
    submissionRows: submissionsRes.data || [],
    attendanceRows: attendanceRes.data || [],
    passingThreshold,
    filters,
    teacherScope,
    assignmentTargetGroupIdsByAssignment,
  });
}

// ============================================================================
// PUBLIC SERVICE ENTRYPOINTS
// ============================================================================

/**
 * Fetches authorized students list for staff academic record selection.
 * Uses server RPC when deployed, and executes RLS-enforced direct queries if
 * migration 20261114000019 / 20261114000022 is pending or hits gs.is_primary.
 */
export async function fetchAccessibleStudentsForRecords(): Promise<AccessibleStudentOption[]> {
  const client = requireSupabaseClient({
    service: SERVICE,
    operation: 'fetchAccessibleStudentsForRecords',
  });
  const user = await requireAuthenticatedUser(client, {
    service: SERVICE,
    operation: 'fetchAccessibleStudentsForRecords',
  });

  let res: { data: any; error: unknown };
  try {
    res = await client.rpc('list_accessible_students_for_records');
  } catch (err) {
    throwLoggedServiceError(err, {
      service: SERVICE,
      operation: 'fetchAccessibleStudentsForRecords',
    });
  }

  if (res.error) {
    if (isAcademicRecordsRpcCompatibilityError(res.error)) {
      const rpcErr = toServiceError(res.error, {
        service: SERVICE,
        operation: 'fetchAccessibleStudentsForRecords.rpc',
      });
      if (typeof console !== 'undefined' && typeof console.warn === 'function') {
        console.warn('[academicRecordsService] RPC unavailable or schema-outdated; using RLS-enforced direct queries.', {
          code: rpcErr.code,
          message: rpcErr.message,
        });
      }
      const caller = await resolveCallerContext(
        client,
        user.id,
        'fetchAccessibleStudentsForRecords.direct'
      );
      return fetchAccessibleStudentsDirect(client, caller);
    }

    throwLoggedServiceError(res.error, {
      service: SERVICE,
      operation: 'fetchAccessibleStudentsForRecords',
      fallbackMessage: 'Failed to load authorized students list.',
    });
  }

  const rows = Array.isArray(res.data) ? res.data : [];
  return rows.map((r: any) => ({
    id: r.id,
    fullName: r.full_name,
    fullNameArabic: r.full_name_arabic || r.full_name,
    status: r.status || 'active',
    studentNumber: r.student_number || null,
    username: r.username || null,
    enrolledAt: r.enrolled_at,
    groups: Array.isArray(r.groups)
      ? r.groups.map((g: any) => ({
          id: g.id,
          name: g.name,
          nameArabic: g.name_arabic || g.name,
          academicYear: g.academic_year || '2026/2027',
          isActive: Boolean(g.is_active),
          archivedAt: g.archived_at || null,
          isPrimary: Boolean(g.is_primary),
        }))
      : [],
  }));
}

/**
 * Fetches unified academic record for a student (or self when called by a student).
 * Uses server RPC when deployed, and executes RLS-enforced direct queries if
 * migration 20261114000019 / 20261114000022 is pending or hits gs.is_primary.
 */
export async function fetchStudentAcademicRecord(
  filters: AcademicRecordQueryFilters
): Promise<StudentAcademicRecord> {
  const client = requireSupabaseClient({
    service: SERVICE,
    operation: 'fetchStudentAcademicRecord',
  });
  const user = await requireAuthenticatedUser(client, {
    service: SERVICE,
    operation: 'fetchStudentAcademicRecord',
  });

  let res: { data: any; error: unknown };
  try {
    res = await client.rpc('get_student_academic_record', {
      p_student_id: filters.studentId ?? null,
      p_course_id: filters.courseId && filters.courseId !== 'all' ? filters.courseId : null,
      p_group_id: filters.groupId && filters.groupId !== 'all' ? filters.groupId : null,
      p_academic_year:
        filters.academicYear && filters.academicYear !== 'all' ? filters.academicYear : null,
      p_date_from: filters.dateFrom || null,
      p_date_to: filters.dateTo || null,
    });
  } catch (err) {
    throwLoggedServiceError(err, {
      service: SERVICE,
      operation: 'fetchStudentAcademicRecord',
    });
  }

  if (res.error) {
    if (isAcademicRecordsRpcCompatibilityError(res.error)) {
      const rpcErr = toServiceError(res.error, {
        service: SERVICE,
        operation: 'fetchStudentAcademicRecord.rpc',
      });
      if (typeof console !== 'undefined' && typeof console.warn === 'function') {
        console.warn('[academicRecordsService] RPC unavailable or schema-outdated; using RLS-enforced direct queries.', {
          code: rpcErr.code,
          message: rpcErr.message,
        });
      }
      const caller = await resolveCallerContext(
        client,
        user.id,
        'fetchStudentAcademicRecord.direct'
      );
      return fetchStudentAcademicRecordDirect(client, caller, filters);
    }

    throwLoggedServiceError(res.error, {
      service: SERVICE,
      operation: 'fetchStudentAcademicRecord',
      fallbackMessage: 'Failed to load academic record.',
    });
  }

  if (!res.data) {
    throwLoggedServiceError(
      new ServiceError({
        category: 'NOT_FOUND',
        message: 'Academic record could not be resolved.',
        service: SERVICE,
        operation: 'fetchStudentAcademicRecord',
      }),
      { service: SERVICE, operation: 'fetchStudentAcademicRecord' }
    );
  }

  return mapRawAcademicRecord(res.data);
}
