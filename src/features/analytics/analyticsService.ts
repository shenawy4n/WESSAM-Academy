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
    attentionScoreThreshold: number;
    attentionAttendanceThreshold: number;
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

function toNumOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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

export function mapAnalyticsDashboard(raw: any): AnalyticsDashboardData {
  const scope = raw?.scope || {};
  const k = raw?.kpis || {};
  const sa = raw?.student_analytics || {};
  const aa = raw?.attendance_analytics || {};
  const br = aa?.breakdown || {};

  return {
    scope: {
      isSuperAdmin: Boolean(scope.is_super_admin),
      dateFrom: scope.date_from || null,
      dateTo: scope.date_to || null,
      attentionScoreThreshold: Number(scope.attention_score_threshold ?? 60),
      attentionAttendanceThreshold: Number(scope.attention_attendance_threshold ?? 75),
      timezone: scope.timezone || ACADEMIC_TIMEZONE,
    },
    kpis: {
      activeStudentsCount: Number(k.active_students_count ?? 0),
      totalStudentsCount: Number(k.total_students_count ?? 0),
      activeGroupsCount: Number(k.active_groups_count ?? 0),
      publishedCoursesCount: Number(k.published_courses_count ?? 0),
      activeTeachersCount: toNumOrNull(k.active_teachers_count),
      liveSessionsCount: Number(k.live_sessions_count ?? 0),
      attendanceRatePct: toNumOrNull(k.attendance_rate_pct),
      attendanceRecordsCount: Number(k.attendance_records_count ?? 0),
      avgQuizScorePct: toNumOrNull(k.avg_quiz_score_pct),
      gradedQuizAttemptsCount: Number(k.graded_quiz_attempts_count ?? 0),
      assignmentCompletionRatePct: toNumOrNull(k.assignment_completion_rate_pct),
      expectedAssignmentPairsCount: Number(k.expected_assignment_pairs_count ?? 0),
      submittedAssignmentPairsCount: Number(k.submitted_assignment_pairs_count ?? 0),
      avgCourseProgressPct: toNumOrNull(k.avg_course_progress_pct),
      expectedLessonCompletionsCount: Number(k.expected_lesson_completions_count ?? 0),
      completedLessonCompletionsCount: Number(k.completed_lesson_completions_count ?? 0),
    },
    studentAnalytics: {
      scoreDistribution: Array.isArray(sa.score_distribution)
        ? sa.score_distribution.map((b: any) => ({
            band: String(b.band),
            count: Number(b.count ?? 0),
          }))
        : [],
      topPerformers: Array.isArray(sa.top_performers)
        ? sa.top_performers.map((st: any) => ({
            studentId: st.student_id,
            fullName: st.full_name,
            fullNameArabic: st.full_name_arabic || st.full_name,
            combinedScorePct: toNumOrNull(st.combined_score_pct),
            avgQuizPct: toNumOrNull(st.avg_quiz_pct),
            avgAssignPct: toNumOrNull(st.avg_assign_pct),
            attendanceRatePct: toNumOrNull(st.attendance_rate_pct),
          }))
        : [],
      attentionNeeded: Array.isArray(sa.attention_needed)
        ? sa.attention_needed.map((st: any) => ({
            studentId: st.student_id,
            fullName: st.full_name,
            fullNameArabic: st.full_name_arabic || st.full_name,
            combinedScorePct: toNumOrNull(st.combined_score_pct),
            avgQuizPct: toNumOrNull(st.avg_quiz_pct),
            avgAssignPct: toNumOrNull(st.avg_assign_pct),
            attendanceRatePct: toNumOrNull(st.attendance_rate_pct),
            lowAcademic: Boolean(st.low_academic),
            lowAttendance: Boolean(st.low_attendance),
          }))
        : [],
    },
    groupAnalytics: Array.isArray(raw?.group_analytics)
      ? raw.group_analytics.map((g: any) => ({
          groupId: g.group_id,
          name: g.name,
          nameArabic: g.name_arabic || g.name,
          academicYear: g.academic_year || null,
          isActive: Boolean(g.is_active),
          activeStudentsCount: Number(g.active_students_count ?? 0),
          attendanceRatePct: toNumOrNull(g.attendance_rate_pct),
          avgQuizScorePct: toNumOrNull(g.avg_quiz_score_pct),
          avgCourseProgressPct: toNumOrNull(g.avg_course_progress_pct),
        }))
      : [],
    courseAnalytics: Array.isArray(raw?.course_analytics)
      ? raw.course_analytics.map((c: any) => ({
          courseId: c.course_id,
          title: c.title,
          titleArabic: c.title_arabic || c.title,
          level: c.level || null,
          isPublished: Boolean(c.is_published),
          publishedLessonsCount: Number(c.published_lessons_count ?? 0),
          enrolledStudentsCount: Number(c.enrolled_students_count ?? 0),
          avgCompletionPct: toNumOrNull(c.avg_completion_pct),
          avgQuizScorePct: toNumOrNull(c.avg_quiz_score_pct),
          publishedAssignmentsCount: Number(c.published_assignments_count ?? 0),
        }))
      : [],
    attendanceAnalytics: {
      breakdown: {
        present: Number(br.present ?? 0),
        late: Number(br.late ?? 0),
        excused: Number(br.excused ?? 0),
        absent: Number(br.absent ?? 0),
        totalRecords: Number(br.total_records ?? 0),
        countableRecords: Number(br.countable_records ?? 0),
      },
      trendSeries: Array.isArray(aa.trend_series)
        ? aa.trend_series.map((p: any) => ({
            riyadhDate: p.riyadh_date,
            present: Number(p.present ?? 0),
            late: Number(p.late ?? 0),
            excused: Number(p.excused ?? 0),
            absent: Number(p.absent ?? 0),
            attendanceRatePct: toNumOrNull(p.attendance_rate_pct),
          }))
        : [],
      recentSessions: Array.isArray(aa.recent_sessions)
        ? aa.recent_sessions.map((s: any) => ({
            sessionId: s.session_id,
            title: s.title,
            titleArabic: s.title_arabic || null,
            startTime: s.start_time,
            present: Number(s.present ?? 0),
            late: Number(s.late ?? 0),
            excused: Number(s.excused ?? 0),
            absent: Number(s.absent ?? 0),
          }))
        : [],
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
