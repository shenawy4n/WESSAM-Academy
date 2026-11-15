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
import { ACADEMIC_TIMEZONE } from '../../lib/dateUtils';

const SERVICE = 'analyticsService';

export type AnalyticsDatePreset = 'today' | '7d' | '30d' | '90d' | 'all' | 'custom';

export interface AnalyticsFilterParams {
  preset: AnalyticsDatePreset;
  dateFrom?: string;
  dateTo?: string;
  groupId?: string;
  courseId?: string;
  academicYear?: string;
}

export interface AnalyticsKPIs {
  activeStudentsCount: number;
  totalStudentsCount: number;
  activeGroupsCount: number;
  publishedCoursesCount: number;
  activeTeachersCount: number | null;
  liveSessionsCount: number;
  attendanceRatePct: number | null;
  attendanceRecordsCount: number;
  avgQuizScorePct: number | null;
  gradedQuizAttemptsCount: number;
  assignmentCompletionRatePct: number | null;
  expectedAssignmentPairsCount: number;
  submittedAssignmentPairsCount: number;
  avgCourseProgressPct: number | null;
  expectedLessonCompletionsCount: number;
  completedLessonCompletionsCount: number;
}

export interface ScoreDistributionBand {
  band: '90_100' | '75_89' | '60_74' | 'below_60' | 'ungraded' | string;
  count: number;
}

export interface StudentAnalyticsRow {
  studentId: string;
  fullName: string;
  fullNameArabic: string;
  combinedScorePct: number | null;
  avgQuizPct: number | null;
  avgAssignPct: number | null;
  attendanceRatePct: number | null;
  lowAcademic?: boolean;
  lowAttendance?: boolean;
}

export interface GroupAnalyticsRow {
  groupId: string;
  name: string;
  nameArabic: string;
  academicYear: string | null;
  isActive: boolean;
  activeStudentsCount: number;
  attendanceRatePct: number | null;
  avgQuizScorePct: number | null;
  avgCourseProgressPct: number | null;
}

export interface CourseAnalyticsRow {
  courseId: string;
  title: string;
  titleArabic: string;
  level: string | null;
  isPublished: boolean;
  publishedLessonsCount: number;
  enrolledStudentsCount: number;
  avgCompletionPct: number | null;
  avgQuizScorePct: number | null;
  publishedAssignmentsCount: number;
}

export interface AttendanceTrendPoint {
  riyadhDate: string;
  present: number;
  late: number;
  excused: number;
  absent: number;
  attendanceRatePct: number | null;
}

export interface SessionAttendanceRow {
  sessionId: string;
  title: string;
  titleArabic: string | null;
  startTime: string;
  present: number;
  late: number;
  excused: number;
  absent: number;
}

export interface AnalyticsDashboardData {
  scope: {
    isSuperAdmin: boolean;
    dateFrom: string | null;
    dateTo: string | null;
    attentionScoreThreshold: number | null;
    attentionAttendanceThreshold: number | null;
    timezone: string;
  };
  kpis: AnalyticsKPIs;
  studentAnalytics: {
    scoreDistribution: ScoreDistributionBand[];
    topPerformers: StudentAnalyticsRow[];
    attentionNeeded: StudentAnalyticsRow[];
  };
  groupAnalytics: GroupAnalyticsRow[];
  courseAnalytics: CourseAnalyticsRow[];
  attendanceAnalytics: {
    breakdown: {
      present: number;
      late: number;
      excused: number;
      absent: number;
      totalRecords: number;
      countableRecords: number;
    };
    trendSeries: AttendanceTrendPoint[];
    recentSessions: SessionAttendanceRow[];
  };
}

const CONTRACT_OPERATION = 'mapAnalyticsDashboard';

function contractError(path: string, reason: string): ServiceError {
  return new ServiceError({
    category: 'DATABASE_ERROR',
    code: 'INVALID_ANALYTICS_CONTRACT',
    message: `Invalid analytics response at "${path}": ${reason}`,
    service: SERVICE,
    operation: CONTRACT_OPERATION,
  });
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v && typeof v === 'object' && !Array.isArray(v));
}

function hasOwn(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function readRequiredObject(
  parent: Record<string, unknown>,
  key: string,
  path: string
): Record<string, unknown> {
  if (!hasOwn(parent, key) || !isPlainObject(parent[key])) {
    throw contractError(path, 'expected non-null object');
  }
  return parent[key] as Record<string, unknown>;
}

function readRequiredArray(
  parent: Record<string, unknown>,
  key: string,
  path: string
): unknown[] {
  if (!hasOwn(parent, key) || !Array.isArray(parent[key])) {
    throw contractError(path, 'expected array');
  }
  return parent[key] as unknown[];
}

function parseFiniteNumberValue(val: unknown, path: string): number {
  if (typeof val === 'boolean' || (typeof val === 'string' && val.trim() === '')) {
    throw contractError(path, 'expected finite number');
  }
  if (typeof val !== 'number' && typeof val !== 'string') {
    throw contractError(path, 'expected finite number');
  }
  const n = Number(val);
  if (!Number.isFinite(n)) {
    throw contractError(path, 'expected finite number');
  }
  return n;
}

function readRequiredFiniteNumber(
  obj: Record<string, unknown>,
  key: string,
  path: string
): number {
  if (!hasOwn(obj, key) || obj[key] === undefined) {
    throw contractError(path, 'missing required numeric field');
  }
  if (obj[key] === null) {
    throw contractError(path, 'required numeric field cannot be null');
  }
  return parseFiniteNumberValue(obj[key], path);
}

function readNullableFiniteNumber(
  obj: Record<string, unknown>,
  key: string,
  path: string,
  options: { allowOmitted?: boolean } = {}
): number | null {
  if (!hasOwn(obj, key) || obj[key] === undefined) {
    if (options.allowOmitted) return null;
    throw contractError(path, 'missing nullable numeric field');
  }
  if (obj[key] === null) {
    return null;
  }
  return parseFiniteNumberValue(obj[key], path);
}

function readRequiredBoolean(
  obj: Record<string, unknown>,
  key: string,
  path: string
): boolean {
  if (!hasOwn(obj, key) || typeof obj[key] !== 'boolean') {
    throw contractError(path, 'expected boolean');
  }
  return obj[key] as boolean;
}

function readRequiredString(
  obj: Record<string, unknown>,
  key: string,
  path: string
): string {
  if (!hasOwn(obj, key) || typeof obj[key] !== 'string' || obj[key].trim() === '') {
    throw contractError(path, 'expected non-empty string');
  }
  return obj[key] as string;
}

function readNullableString(
  obj: Record<string, unknown>,
  key: string,
  path: string,
  options: { allowOmitted?: boolean } = {}
): string | null {
  if (!hasOwn(obj, key) || obj[key] === undefined) {
    if (options.allowOmitted) return null;
    throw contractError(path, 'missing nullable string field');
  }
  if (obj[key] === null) {
    return null;
  }
  if (typeof obj[key] !== 'string') {
    throw contractError(path, 'expected string or null');
  }
  const str = obj[key] as string;
  return str.trim() === '' ? null : str;
}

/**
 * Formats an instant as YYYY-MM-DD in Asia/Riyadh (fixed UTC+3).
 */
export function getRiyadhDateString(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: ACADEMIC_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

/**
 * Shifts a YYYY-MM-DD calendar date by `deltaDays` days cleanly without local TZ drift.
 */
export function shiftIsoDate(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const utcMs = Date.UTC(y, m - 1, d + deltaDays);
  const shifted = new Date(utcMs);
  const yy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(shifted.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * Computes Riyadh YYYY-MM-DD bounds for a filter preset.
 */
export function resolveRiyadhDateRange(
  preset: AnalyticsDatePreset,
  customFrom?: string,
  customTo?: string,
  referenceNow: Date = new Date()
): { dateFrom: string | null; dateTo: string | null } {
  const todayRiyadh = getRiyadhDateString(referenceNow);

  switch (preset) {
    case 'today':
      return { dateFrom: todayRiyadh, dateTo: todayRiyadh };
    case '7d':
      return { dateFrom: shiftIsoDate(todayRiyadh, -6), dateTo: todayRiyadh };
    case '30d':
      return { dateFrom: shiftIsoDate(todayRiyadh, -29), dateTo: todayRiyadh };
    case '90d':
      return { dateFrom: shiftIsoDate(todayRiyadh, -89), dateTo: todayRiyadh };
    case 'custom':
      return {
        dateFrom: customFrom || null,
        dateTo: customTo || null,
      };
    case 'all':
    default:
      return { dateFrom: null, dateTo: null };
  }
}

export function mapAnalyticsDashboard(raw: unknown): AnalyticsDashboardData {
  if (!isPlainObject(raw)) {
    throw contractError('root', 'expected non-null analytics payload object');
  }

  const scope = readRequiredObject(raw, 'scope', 'scope');
  const k = readRequiredObject(raw, 'kpis', 'kpis');
  const sa = readRequiredObject(raw, 'student_analytics', 'student_analytics');
  const groupAnalyticsRaw = readRequiredArray(raw, 'group_analytics', 'group_analytics');
  const courseAnalyticsRaw = readRequiredArray(raw, 'course_analytics', 'course_analytics');
  const aa = readRequiredObject(raw, 'attendance_analytics', 'attendance_analytics');
  const br = readRequiredObject(aa, 'breakdown', 'attendance_analytics.breakdown');

  const scoreDistRaw = readRequiredArray(sa, 'score_distribution', 'student_analytics.score_distribution');
  const topPerformersRaw = readRequiredArray(sa, 'top_performers', 'student_analytics.top_performers');
  const attentionNeededRaw = readRequiredArray(sa, 'attention_needed', 'student_analytics.attention_needed');
  const trendSeriesRaw = readRequiredArray(aa, 'trend_series', 'attendance_analytics.trend_series');
  const recentSessionsRaw = readRequiredArray(aa, 'recent_sessions', 'attendance_analytics.recent_sessions');

  return {
    scope: {
      isSuperAdmin: readRequiredBoolean(scope, 'is_super_admin', 'scope.is_super_admin'),
      dateFrom: readNullableString(scope, 'date_from', 'scope.date_from', { allowOmitted: true }),
      dateTo: readNullableString(scope, 'date_to', 'scope.date_to', { allowOmitted: true }),
      attentionScoreThreshold: readNullableFiniteNumber(
        scope,
        'attention_score_threshold',
        'scope.attention_score_threshold'
      ),
      attentionAttendanceThreshold: readNullableFiniteNumber(
        scope,
        'attention_attendance_threshold',
        'scope.attention_attendance_threshold'
      ),
      timezone: readRequiredString(scope, 'timezone', 'scope.timezone'),
    },
    kpis: {
      activeStudentsCount: readRequiredFiniteNumber(k, 'active_students_count', 'kpis.active_students_count'),
      totalStudentsCount: readRequiredFiniteNumber(k, 'total_students_count', 'kpis.total_students_count'),
      activeGroupsCount: readRequiredFiniteNumber(k, 'active_groups_count', 'kpis.active_groups_count'),
      publishedCoursesCount: readRequiredFiniteNumber(k, 'published_courses_count', 'kpis.published_courses_count'),
      activeTeachersCount: readNullableFiniteNumber(k, 'active_teachers_count', 'kpis.active_teachers_count'),
      liveSessionsCount: readRequiredFiniteNumber(k, 'live_sessions_count', 'kpis.live_sessions_count'),
      attendanceRatePct: readNullableFiniteNumber(k, 'attendance_rate_pct', 'kpis.attendance_rate_pct'),
      attendanceRecordsCount: readRequiredFiniteNumber(
        k,
        'attendance_records_count',
        'kpis.attendance_records_count'
      ),
      avgQuizScorePct: readNullableFiniteNumber(k, 'avg_quiz_score_pct', 'kpis.avg_quiz_score_pct'),
      gradedQuizAttemptsCount: readRequiredFiniteNumber(
        k,
        'graded_quiz_attempts_count',
        'kpis.graded_quiz_attempts_count'
      ),
      assignmentCompletionRatePct: readNullableFiniteNumber(
        k,
        'assignment_completion_rate_pct',
        'kpis.assignment_completion_rate_pct'
      ),
      expectedAssignmentPairsCount: readRequiredFiniteNumber(
        k,
        'expected_assignment_pairs_count',
        'kpis.expected_assignment_pairs_count'
      ),
      submittedAssignmentPairsCount: readRequiredFiniteNumber(
        k,
        'submitted_assignment_pairs_count',
        'kpis.submitted_assignment_pairs_count'
      ),
      avgCourseProgressPct: readNullableFiniteNumber(k, 'avg_course_progress_pct', 'kpis.avg_course_progress_pct'),
      expectedLessonCompletionsCount: readRequiredFiniteNumber(
        k,
        'expected_lesson_completions_count',
        'kpis.expected_lesson_completions_count'
      ),
      completedLessonCompletionsCount: readRequiredFiniteNumber(
        k,
        'completed_lesson_completions_count',
        'kpis.completed_lesson_completions_count'
      ),
    },
    studentAnalytics: {
      scoreDistribution: scoreDistRaw.map((b, idx) => {
        if (!isPlainObject(b)) {
          throw contractError(`student_analytics.score_distribution[${idx}]`, 'expected object');
        }
        return {
          band: readRequiredString(b, 'band', `student_analytics.score_distribution[${idx}].band`),
          count: readRequiredFiniteNumber(b, 'count', `student_analytics.score_distribution[${idx}].count`),
        };
      }),
      topPerformers: topPerformersRaw.map((st, idx) => {
        if (!isPlainObject(st)) {
          throw contractError(`student_analytics.top_performers[${idx}]`, 'expected object');
        }
        const path = `student_analytics.top_performers[${idx}]`;
        const fullName = readRequiredString(st, 'full_name', `${path}.full_name`);
        const fullNameArabic = readNullableString(st, 'full_name_arabic', `${path}.full_name_arabic`, {
          allowOmitted: true,
        });
        return {
          studentId: readRequiredString(st, 'student_id', `${path}.student_id`),
          fullName,
          fullNameArabic: fullNameArabic || fullName,
          combinedScorePct: readNullableFiniteNumber(st, 'combined_score_pct', `${path}.combined_score_pct`),
          avgQuizPct: readNullableFiniteNumber(st, 'avg_quiz_pct', `${path}.avg_quiz_pct`),
          avgAssignPct: readNullableFiniteNumber(st, 'avg_assign_pct', `${path}.avg_assign_pct`),
          attendanceRatePct: readNullableFiniteNumber(st, 'attendance_rate_pct', `${path}.attendance_rate_pct`),
        };
      }),
      attentionNeeded: attentionNeededRaw.map((st, idx) => {
        if (!isPlainObject(st)) {
          throw contractError(`student_analytics.attention_needed[${idx}]`, 'expected object');
        }
        const path = `student_analytics.attention_needed[${idx}]`;
        const fullName = readRequiredString(st, 'full_name', `${path}.full_name`);
        const fullNameArabic = readNullableString(st, 'full_name_arabic', `${path}.full_name_arabic`, {
          allowOmitted: true,
        });
        return {
          studentId: readRequiredString(st, 'student_id', `${path}.student_id`),
          fullName,
          fullNameArabic: fullNameArabic || fullName,
          combinedScorePct: readNullableFiniteNumber(st, 'combined_score_pct', `${path}.combined_score_pct`),
          avgQuizPct: readNullableFiniteNumber(st, 'avg_quiz_pct', `${path}.avg_quiz_pct`),
          avgAssignPct: readNullableFiniteNumber(st, 'avg_assign_pct', `${path}.avg_assign_pct`),
          attendanceRatePct: readNullableFiniteNumber(st, 'attendance_rate_pct', `${path}.attendance_rate_pct`),
          lowAcademic: readRequiredBoolean(st, 'low_academic', `${path}.low_academic`),
          lowAttendance: readRequiredBoolean(st, 'low_attendance', `${path}.low_attendance`),
        };
      }),
    },
    groupAnalytics: groupAnalyticsRaw.map((g, idx) => {
      if (!isPlainObject(g)) {
        throw contractError(`group_analytics[${idx}]`, 'expected object');
      }
      const path = `group_analytics[${idx}]`;
      const name = readRequiredString(g, 'name', `${path}.name`);
      const nameArabic = readNullableString(g, 'name_arabic', `${path}.name_arabic`, {
        allowOmitted: true,
      });
      return {
        groupId: readRequiredString(g, 'group_id', `${path}.group_id`),
        name,
        nameArabic: nameArabic || name,
        academicYear: readNullableString(g, 'academic_year', `${path}.academic_year`, { allowOmitted: true }),
        isActive: readRequiredBoolean(g, 'is_active', `${path}.is_active`),
        activeStudentsCount: readRequiredFiniteNumber(
          g,
          'active_students_count',
          `${path}.active_students_count`
        ),
        attendanceRatePct: readNullableFiniteNumber(g, 'attendance_rate_pct', `${path}.attendance_rate_pct`),
        avgQuizScorePct: readNullableFiniteNumber(g, 'avg_quiz_score_pct', `${path}.avg_quiz_score_pct`),
        avgCourseProgressPct: readNullableFiniteNumber(
          g,
          'avg_course_progress_pct',
          `${path}.avg_course_progress_pct`
        ),
      };
    }),
    courseAnalytics: courseAnalyticsRaw.map((c, idx) => {
      if (!isPlainObject(c)) {
        throw contractError(`course_analytics[${idx}]`, 'expected object');
      }
      const path = `course_analytics[${idx}]`;
      const title = readRequiredString(c, 'title', `${path}.title`);
      const titleArabic = readNullableString(c, 'title_arabic', `${path}.title_arabic`, {
        allowOmitted: true,
      });
      return {
        courseId: readRequiredString(c, 'course_id', `${path}.course_id`),
        title,
        titleArabic: titleArabic || title,
        level: readNullableString(c, 'level', `${path}.level`, { allowOmitted: true }),
        isPublished: readRequiredBoolean(c, 'is_published', `${path}.is_published`),
        publishedLessonsCount: readRequiredFiniteNumber(
          c,
          'published_lessons_count',
          `${path}.published_lessons_count`
        ),
        enrolledStudentsCount: readRequiredFiniteNumber(
          c,
          'enrolled_students_count',
          `${path}.enrolled_students_count`
        ),
        avgCompletionPct: readNullableFiniteNumber(c, 'avg_completion_pct', `${path}.avg_completion_pct`),
        avgQuizScorePct: readNullableFiniteNumber(c, 'avg_quiz_score_pct', `${path}.avg_quiz_score_pct`),
        publishedAssignmentsCount: readRequiredFiniteNumber(
          c,
          'published_assignments_count',
          `${path}.published_assignments_count`
        ),
      };
    }),
    attendanceAnalytics: {
      breakdown: {
        present: readRequiredFiniteNumber(br, 'present', 'attendance_analytics.breakdown.present'),
        late: readRequiredFiniteNumber(br, 'late', 'attendance_analytics.breakdown.late'),
        excused: readRequiredFiniteNumber(br, 'excused', 'attendance_analytics.breakdown.excused'),
        absent: readRequiredFiniteNumber(br, 'absent', 'attendance_analytics.breakdown.absent'),
        totalRecords: readRequiredFiniteNumber(
          br,
          'total_records',
          'attendance_analytics.breakdown.total_records'
        ),
        countableRecords: readRequiredFiniteNumber(
          br,
          'countable_records',
          'attendance_analytics.breakdown.countable_records'
        ),
      },
      trendSeries: trendSeriesRaw.map((p, idx) => {
        if (!isPlainObject(p)) {
          throw contractError(`attendance_analytics.trend_series[${idx}]`, 'expected object');
        }
        const path = `attendance_analytics.trend_series[${idx}]`;
        return {
          riyadhDate: readRequiredString(p, 'riyadh_date', `${path}.riyadh_date`),
          present: readRequiredFiniteNumber(p, 'present', `${path}.present`),
          late: readRequiredFiniteNumber(p, 'late', `${path}.late`),
          excused: readRequiredFiniteNumber(p, 'excused', `${path}.excused`),
          absent: readRequiredFiniteNumber(p, 'absent', `${path}.absent`),
          attendanceRatePct: readNullableFiniteNumber(p, 'attendance_rate_pct', `${path}.attendance_rate_pct`),
        };
      }),
      recentSessions: recentSessionsRaw.map((s, idx) => {
        if (!isPlainObject(s)) {
          throw contractError(`attendance_analytics.recent_sessions[${idx}]`, 'expected object');
        }
        const path = `attendance_analytics.recent_sessions[${idx}]`;
        return {
          sessionId: readRequiredString(s, 'session_id', `${path}.session_id`),
          title: readRequiredString(s, 'title', `${path}.title`),
          titleArabic: readNullableString(s, 'title_arabic', `${path}.title_arabic`, { allowOmitted: true }),
          startTime: readRequiredString(s, 'start_time', `${path}.start_time`),
          present: readRequiredFiniteNumber(s, 'present', `${path}.present`),
          late: readRequiredFiniteNumber(s, 'late', `${path}.late`),
          excused: readRequiredFiniteNumber(s, 'excused', `${path}.excused`),
          absent: readRequiredFiniteNumber(s, 'absent', `${path}.absent`),
        };
      }),
    },
  };
}

/**
 * KPI calculation methodology documentation strings (bilingual).
 */
export const KPI_FORMULA_NOTES = {
  attendanceRate: {
    ar: '(حاضر + متأخر) ÷ (حاضر + متأخر + غائب) × 100 — تُستبعد حالات الغياب بعذر والحصص الملغاة.',
    en: '(Present + Late) ÷ (Present + Late + Absent) × 100 — excused absences and cancelled sessions excluded.',
  },
  avgQuizScore: {
    ar: 'متوسط النسب المئوية الفعلية لجميع محاولات الاختبارات المُسلَّمة والمصححة ضمن النطاق.',
    en: 'Mean percentage score across actual submitted/graded quiz attempts in the selected scope.',
  },
  assignmentCompletion: {
    ar: 'عدد الأزواج الفريدة (طالب × واجب منشور مُستهدف) التي تم تسليمها ÷ إجمالي التسليمات المطلوبة × 100.',
    en: 'Distinct targeted (student, published assignment) pairs submitted ÷ total expected pairs × 100.',
  },
  courseProgress: {
    ar: 'الدروس المنشورة المكتملة عبر المجموعات النشطة ÷ إجمالي أزواج (طالب نشط × درس منشور) × 100.',
    en: 'Completed published lessons across active enrollments ÷ total expected (active student × published lesson) pairs × 100.',
  },
};

export async function fetchAnalyticsDashboard(
  params: AnalyticsFilterParams
): Promise<AnalyticsDashboardData> {
  const client = requireSupabaseClient({
    service: SERVICE,
    operation: 'fetchAnalyticsDashboard',
  });
  await requireAuthenticatedUser(client, {
    service: SERVICE,
    operation: 'fetchAnalyticsDashboard',
  });

  const { dateFrom, dateTo } = resolveRiyadhDateRange(
    params.preset,
    params.dateFrom,
    params.dateTo
  );

  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw new ServiceError({
      category: 'VALIDATION_ERROR',
      message: 'Start date cannot be after end date.',
      service: SERVICE,
      operation: 'fetchAnalyticsDashboard',
    });
  }

  let res;
  try {
    res = await client.rpc('get_phase6_analytics_dashboard', {
      p_date_from: dateFrom,
      p_date_to: dateTo,
      p_group_id: params.groupId && params.groupId !== 'all' ? params.groupId : null,
      p_course_id: params.courseId && params.courseId !== 'all' ? params.courseId : null,
      p_academic_year: params.academicYear && params.academicYear !== 'all' ? params.academicYear : null,
      p_attention_threshold: null,
    });
  } catch (err) {
    throwServiceError(err, {
      service: SERVICE,
      operation: 'fetchAnalyticsDashboard',
    });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'fetchAnalyticsDashboard',
      fallbackMessage: 'Failed to load analytics metrics. Ensure migration 20261114000020 is applied.',
    });
  }

  if (!res.data) {
    throw new ServiceError({
      category: 'NOT_FOUND',
      message: 'No analytics payload returned.',
      service: SERVICE,
      operation: 'fetchAnalyticsDashboard',
    });
  }

  return mapAnalyticsDashboard(res.data);
}
