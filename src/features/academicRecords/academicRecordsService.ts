/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  requireSupabaseClient,
  requireAuthenticatedUser,
  throwServiceError,
  ServiceError,
} from '../../lib/errors/serviceError';
import { ACADEMIC_TIMEZONE, formatRiyadhDateTime } from '../../lib/dateUtils';

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
      passingThreshold: null, // Assignments do not fabricate pass/fail unless quiz passing threshold applies
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

/**
 * Fetches authorized students list for staff academic record selection.
 */
export async function fetchAccessibleStudentsForRecords(): Promise<AccessibleStudentOption[]> {
  const client = requireSupabaseClient({
    service: SERVICE,
    operation: 'fetchAccessibleStudentsForRecords',
  });
  await requireAuthenticatedUser(client, {
    service: SERVICE,
    operation: 'fetchAccessibleStudentsForRecords',
  });

  let res;
  try {
    res = await client.rpc('list_accessible_students_for_records');
  } catch (err) {
    throwServiceError(err, {
      service: SERVICE,
      operation: 'fetchAccessibleStudentsForRecords',
    });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'fetchAccessibleStudentsForRecords',
      fallbackMessage: 'Failed to load authorized students list. Ensure migration 20261114000019 is applied.',
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
 */
export async function fetchStudentAcademicRecord(
  filters: AcademicRecordQueryFilters
): Promise<StudentAcademicRecord> {
  const client = requireSupabaseClient({
    service: SERVICE,
    operation: 'fetchStudentAcademicRecord',
  });
  await requireAuthenticatedUser(client, {
    service: SERVICE,
    operation: 'fetchStudentAcademicRecord',
  });

  let res;
  try {
    res = await client.rpc('get_student_academic_record', {
      p_student_id: filters.studentId ?? null,
      p_course_id: filters.courseId && filters.courseId !== 'all' ? filters.courseId : null,
      p_group_id: filters.groupId && filters.groupId !== 'all' ? filters.groupId : null,
      p_academic_year: filters.academicYear && filters.academicYear !== 'all' ? filters.academicYear : null,
      p_date_from: filters.dateFrom || null,
      p_date_to: filters.dateTo || null,
    });
  } catch (err) {
    throwServiceError(err, {
      service: SERVICE,
      operation: 'fetchStudentAcademicRecord',
    });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'fetchStudentAcademicRecord',
      fallbackMessage: 'Failed to load academic record. Ensure migration 20261114000019 is applied.',
    });
  }

  if (!res.data) {
    throw new ServiceError({
      category: 'NOT_FOUND',
      message: 'Academic record could not be resolved.',
      service: SERVICE,
      operation: 'fetchStudentAcademicRecord',
    });
  }

  return mapRawAcademicRecord(res.data);
}
