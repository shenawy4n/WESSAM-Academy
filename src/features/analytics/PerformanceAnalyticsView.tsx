/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../../hooks/useLocale';
import {
  AnalyticsDashboardData,
  AnalyticsDatePreset,
  KPI_FORMULA_NOTES,
  fetchAnalyticsDashboard,
  resolveRiyadhDateRange,
} from './analyticsService';
import {
  AttendanceTrendChart,
  GroupComparisonChart,
  ScoreDistributionChart,
} from './AnalyticsCharts';
import { fetchGroups, GroupRecord } from '../groups/groupService';
import { fetchTeacherCourses, CourseRecord } from '../courses/coursesService';
import { formatRecordTimestampRiyadh } from '../academicRecords/academicRecordsService';
import { Card, CardContent, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import {
  AlertTriangle,
  Award,
  BarChart3,
  BookOpen,
  Calendar,
  CheckCircle2,
  FolderGit2,
  Info,
  Radio,
  RefreshCw,
  TrendingUp,
  UserCheck,
  Users,
} from 'lucide-react';

interface PerformanceAnalyticsViewProps {
  onInspectStudentRecord?: (studentId: string) => void;
}

type AnalyticsTab = 'overview' | 'students' | 'groups' | 'courses' | 'attendance';

export const PerformanceAnalyticsView: React.FC<PerformanceAnalyticsViewProps> = ({
  onInspectStudentRecord,
}) => {
  const { isRtl, lang } = useLocale();
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('overview');
  const [preset, setPreset] = useState<AnalyticsDatePreset>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [groupId, setGroupId] = useState('all');
  const [courseId, setCourseId] = useState('all');
  const [academicYear, setAcademicYear] = useState('all');
  const [showFormulas, setShowFormulas] = useState(false);

  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [courses, setCourses] = useState<CourseRecord[]>([]);
  const [data, setData] = useState<AnalyticsDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    Promise.all([
      fetchGroups('all').catch(() => [] as GroupRecord[]),
      fetchTeacherCourses().catch(() => [] as CourseRecord[]),
    ]).then(([gList, cList]) => {
      setGroups(gList);
      setCourses(cList);
    });
  }, []);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAnalyticsDashboard({
        preset,
        dateFrom: customFrom || undefined,
        dateTo: customTo || undefined,
        groupId,
        courseId,
        academicYear,
      });
      setData(result);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [preset, customFrom, customTo, groupId, courseId, academicYear]);

  useEffect(() => {
    if (preset === 'custom' && (!customFrom || !customTo)) {
      return;
    }
    loadAnalytics();
  }, [loadAnalytics, preset, customFrom, customTo]);

  const resolvedBounds = resolveRiyadhDateRange(preset, customFrom, customTo);

  const presetOptions: { id: AnalyticsDatePreset; label: string }[] = [
    { id: 'today', label: isRtl ? 'اليوم' : 'Today' },
    { id: '7d', label: isRtl ? '7 أيام' : '7 Days' },
    { id: '30d', label: isRtl ? '30 يوماً' : '30 Days' },
    { id: '90d', label: isRtl ? '90 يوماً' : '90 Days' },
    { id: 'all', label: isRtl ? 'كل الفترات' : 'All Time' },
    { id: 'custom', label: isRtl ? 'مخصص' : 'Custom' },
  ];

  const academicYears = Array.from(new Set(groups.map((g) => g.academicYear))).sort().reverse();

  const formatMetricPct = (value: number | null | undefined, denominator: number, unitHintAr: string, unitHintEn: string) => {
    if (value === null || value === undefined || denominator === 0) {
      return {
        primary: isRtl ? 'غير متاح' : 'N/A',
        sub: isRtl ? `لا توجد بيانات (${unitHintAr})` : `No ${unitHintEn} yet`,
        isUnavailable: true,
      };
    }
    return {
      primary: `${value}%`,
      sub: '',
      isUnavailable: false,
    };
  };

  if (loading && !data) {
    return (
      <div className="py-16 flex justify-center">
        <LoadingSpinner size="lg" label={isRtl ? 'جاري احتساب مؤشرات الأداء...' : 'Computing performance analytics...'} />
      </div>
    );
  }

  if (error && !data) {
    return <ErrorState error={error} isRtl={isRtl} onRetry={loadAnalytics} />;
  }

  if (!data) return null;

  const attDisplay = formatMetricPct(
    data.kpis.attendanceRatePct,
    data.attendanceAnalytics.breakdown.countableRecords,
    'حصص مسجلة',
    'countable attendance'
  );
  const quizDisplay = formatMetricPct(
    data.kpis.avgQuizScorePct,
    data.kpis.gradedQuizAttemptsCount,
    'محاولات مقيمة',
    'graded quizzes'
  );
  const assignDisplay = formatMetricPct(
    data.kpis.assignmentCompletionRatePct,
    data.kpis.expectedAssignmentPairsCount,
    'واجبات مطلوبة',
    'expected assignments'
  );
  const progressDisplay = formatMetricPct(
    data.kpis.avgCourseProgressPct,
    data.kpis.expectedLessonCompletionsCount,
    'دروس مسندة',
    'assigned lessons'
  );

  const tabs: { id: AnalyticsTab; label: string }[] = [
    { id: 'overview', label: isRtl ? 'نظرة عامة' : 'Overview' },
    { id: 'students', label: isRtl ? 'تحليلات الطلاب' : 'Student Analytics' },
    { id: 'groups', label: isRtl ? 'المجموعات' : 'Group Analytics' },
    { id: 'courses', label: isRtl ? 'المقررات' : 'Course Analytics' },
    { id: 'attendance', label: isRtl ? 'الحضور' : 'Attendance' },
  ];

  return (
    <div className="space-y-5" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Filter & Timezone Toolbar */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {presetOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setPreset(opt.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer border ${
                    preset === opt.id
                      ? 'bg-[#14243A] text-white border-[#14243A]'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg whitespace-nowrap">
                {isRtl ? 'توقيت مكة المكرمة (Asia/Riyadh)' : 'Makkah Time (Asia/Riyadh)'}
                {resolvedBounds.dateFrom || resolvedBounds.dateTo
                  ? ` · ${resolvedBounds.dateFrom || '…'} → ${resolvedBounds.dateTo || '…'}`
                  : ''}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFormulas((v) => !v)}
                icon={<Info className="w-3.5 h-3.5" />}
                className="whitespace-nowrap"
              >
                {isRtl ? 'منهجية الاحتساب' : 'KPI Formulas'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={loadAnalytics}
                isLoading={loading}
                icon={<RefreshCw className="w-3.5 h-3.5" />}
                className="whitespace-nowrap"
              >
                {isRtl ? 'تحديث' : 'Refresh'}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              aria-label={isRtl ? 'تصفية بالمجموعة' : 'Filter by group'}
              className="py-2 px-3 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
            >
              <option value="all">{isRtl ? 'كل المجموعات المصرح بها' : 'All Authorized Groups'}</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {isRtl ? g.nameArabic : g.name}
                </option>
              ))}
            </select>

            <select
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              aria-label={isRtl ? 'تصفية بالمقرر' : 'Filter by course'}
              className="py-2 px-3 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
            >
              <option value="all">{isRtl ? 'كل المقررات المصرح بها' : 'All Authorized Courses'}</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {isRtl ? c.titleArabic : c.title}
                </option>
              ))}
            </select>

            <select
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              aria-label={isRtl ? 'العام الدراسي' : 'Academic Year'}
              className="py-2 px-3 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
            >
              <option value="all">{isRtl ? 'كل الأعوام الدراسية' : 'All Academic Years'}</option>
              {academicYears.map((yr) => (
                <option key={yr} value={yr}>
                  {yr}
                </option>
              ))}
            </select>

            {preset === 'custom' && (
              <>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="py-2 px-3 text-xs border border-slate-200 rounded-lg bg-white tabular-nums"
                />
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="py-2 px-3 text-xs border border-slate-200 rounded-lg bg-white tabular-nums"
                />
              </>
            )}
          </div>

          {showFormulas && (
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-700">
              <div>
                <span className="font-bold text-[#14243A] block">
                  {isRtl ? 'نسبة الحضور:' : 'Attendance Rate:'}
                </span>
                <span>{isRtl ? KPI_FORMULA_NOTES.attendanceRate.ar : KPI_FORMULA_NOTES.attendanceRate.en}</span>
              </div>
              <div>
                <span className="font-bold text-[#14243A] block">
                  {isRtl ? 'متوسط درجات الاختبارات:' : 'Quiz Score Average:'}
                </span>
                <span>{isRtl ? KPI_FORMULA_NOTES.avgQuizScore.ar : KPI_FORMULA_NOTES.avgQuizScore.en}</span>
              </div>
              <div>
                <span className="font-bold text-[#14243A] block">
                  {isRtl ? 'إنجاز الواجبات:' : 'Assignment Completion:'}
                </span>
                <span>
                  {isRtl ? KPI_FORMULA_NOTES.assignmentCompletion.ar : KPI_FORMULA_NOTES.assignmentCompletion.en}
                </span>
              </div>
              <div>
                <span className="font-bold text-[#14243A] block">
                  {isRtl ? 'تقدم المقررات:' : 'Course Progress:'}
                </span>
                <span>{isRtl ? KPI_FORMULA_NOTES.courseProgress.ar : KPI_FORMULA_NOTES.courseProgress.en}</span>
              </div>
            </div>
          )}

          {Boolean(error) && <ErrorState error={error} isRtl={isRtl} variant="banner" onRetry={loadAnalytics} />}
        </CardContent>
      </Card>

      {/* Main KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{isRtl ? 'الطلاب النشطون' : 'Active Students'}</span>
            <Users className="w-4 h-4 text-[#356AE6]" />
          </div>
          <div className="text-2xl font-bold text-[#14243A] mt-2 tabular-nums">
            {data.kpis.activeStudentsCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 tabular-nums">
            {isRtl
              ? `إجمالي المسجلين في النطاق: ${data.kpis.totalStudentsCount}`
              : `Total in scope: ${data.kpis.totalStudentsCount}`}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{isRtl ? 'المجموعات والمقررات' : 'Groups & Courses'}</span>
            <FolderGit2 className="w-4 h-4 text-[#D8B96C]" />
          </div>
          <div className="text-2xl font-bold text-[#14243A] mt-2 tabular-nums">
            {data.kpis.activeGroupsCount} · {data.kpis.publishedCoursesCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 tabular-nums">
            {data.kpis.activeTeachersCount !== null
              ? isRtl
                ? `مجموعات نشطة · مقررات · ${data.kpis.activeTeachersCount} معلم/مشرف`
                : `Active groups · courses · ${data.kpis.activeTeachersCount} staff`
              : isRtl
              ? 'مجموعات نشطة · مقررات منشورة'
              : 'Active groups · published courses'}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{isRtl ? 'الحصص المباشرة ونسبة الحضور' : 'Sessions & Attendance'}</span>
            <UserCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-[#14243A] mt-2 tabular-nums">{attDisplay.primary}</div>
          <div className="text-[11px] text-slate-500 mt-1 tabular-nums">
            {attDisplay.isUnavailable
              ? attDisplay.sub
              : isRtl
              ? `${data.kpis.liveSessionsCount} حصة · ${data.kpis.attendanceRecordsCount} سجل حضور`
              : `${data.kpis.liveSessionsCount} sessions · ${data.kpis.attendanceRecordsCount} records`}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{isRtl ? 'متوسط الاختبارات' : 'Avg Quiz Score'}</span>
            <Award className="w-4 h-4 text-[#356AE6]" />
          </div>
          <div className="text-2xl font-bold text-[#14243A] mt-2 tabular-nums">{quizDisplay.primary}</div>
          <div className="text-[11px] text-slate-500 mt-1 tabular-nums">
            {quizDisplay.isUnavailable
              ? quizDisplay.sub
              : isRtl
              ? `بناءً على ${data.kpis.gradedQuizAttemptsCount} محاولة مقيمة`
              : `From ${data.kpis.gradedQuizAttemptsCount} graded attempts`}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{isRtl ? 'نسبة تسليم الواجبات' : 'Assignment Completion'}</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-[#14243A] mt-2 tabular-nums">{assignDisplay.primary}</div>
          <div className="text-[11px] text-slate-500 mt-1 tabular-nums">
            {assignDisplay.isUnavailable
              ? assignDisplay.sub
              : isRtl
              ? `${data.kpis.submittedAssignmentPairsCount} / ${data.kpis.expectedAssignmentPairsCount} تسليم مستهدف`
              : `${data.kpis.submittedAssignmentPairsCount} / ${data.kpis.expectedAssignmentPairsCount} expected`}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{isRtl ? 'تقدم المقررات' : 'Avg Course Progress'}</span>
            <BookOpen className="w-4 h-4 text-[#14243A]" />
          </div>
          <div className="text-2xl font-bold text-[#14243A] mt-2 tabular-nums">{progressDisplay.primary}</div>
          <div className="text-[11px] text-slate-500 mt-1 tabular-nums">
            {progressDisplay.isUnavailable
              ? progressDisplay.sub
              : isRtl
              ? `${data.kpis.completedLessonCompletionsCount} / ${data.kpis.expectedLessonCompletionsCount} إكمال درس`
              : `${data.kpis.completedLessonCompletionsCount} / ${data.kpis.expectedLessonCompletionsCount} completions`}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 col-span-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{isRtl ? 'مؤشر التنبيه المبكر' : 'Attention Threshold Monitor'}</span>
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-[#14243A] mt-2 tabular-nums">
            {data.studentAnalytics.attentionNeeded.length} {isRtl ? 'طالب بحاجة لمتابعة' : 'students flagged'}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 tabular-nums">
            {isRtl
              ? `الحد المعتمد من إعدادات النظام: الأداء < ${data.scope.attentionScoreThreshold}% أو الحضور < ${data.scope.attentionAttendanceThreshold}%`
              : `Configured threshold: score < ${data.scope.attentionScoreThreshold}% or attendance < ${data.scope.attentionAttendanceThreshold}%`}
          </div>
        </div>
      </div>

      {/* Section Navigation */}
      <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-xl w-fit border border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === t.id
                ? 'bg-white text-[#14243A] shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card>
            <CardHeader
              title={isRtl ? 'توزيع مستويات أداء الطلاب' : 'Student Score Distribution'}
              subtitle={isRtl ? 'بناءً على الاختبارات والواجبات المصححة' : 'Derived from graded quizzes and assignments'}
            />
            <CardContent>
              <ScoreDistributionChart bands={data.studentAnalytics.scoreDistribution} isRtl={isRtl} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader
              title={isRtl ? 'اتجاه الحضور اليومي' : 'Daily Attendance Trend'}
              subtitle={isRtl ? 'توقيت مكة المكرمة (Asia/Riyadh)' : 'Makkah Time (Asia/Riyadh)'}
            />
            <CardContent>
              <AttendanceTrendChart series={data.attendanceAnalytics.trendSeries} isRtl={isRtl} />
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader
              title={isRtl ? 'مقارنة المجموعات الدراسية' : 'Cohort Comparison'}
              subtitle={isRtl ? 'الحضور، متوسط الاختبارات، وتقدم المقررات لكل مجموعة' : 'Attendance, quiz average, and curriculum progress'}
            />
            <CardContent>
              <GroupComparisonChart groups={data.groupAnalytics} isRtl={isRtl} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB: STUDENT ANALYTICS */}
      {activeTab === 'students' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card>
            <CardHeader
              title={isRtl ? 'الطلاب الأعلى أداءً' : 'Top Performing Students'}
              subtitle={isRtl ? 'أعلى 10 طلاب لديهم تقييمات مرصودة' : 'Top 10 students with graded assessments'}
            />
            <CardContent>
              {data.studentAnalytics.topPerformers.length === 0 ? (
                <EmptyState
                  icon={<TrendingUp className="w-5 h-5" />}
                  title={isRtl ? 'لا توجد درجات مقيمة بعد' : 'No graded student scores yet'}
                  description={isRtl ? 'ستظهر القائمة بعد تصحيح الاختبارات أو الواجبات.' : 'Appears once quizzes or assignments are graded.'}
                />
              ) : (
                <div className="divide-y divide-slate-100 text-xs">
                  {data.studentAnalytics.topPerformers.map((st, idx) => (
                    <div key={st.studentId} className="py-2.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-[#14243A] truncate">
                          <span className="text-slate-400 tabular-nums mx-1">#{idx + 1}</span>
                          {isRtl ? st.fullNameArabic : st.fullName}
                        </div>
                        <div className="text-[11px] text-slate-500 tabular-nums">
                          {isRtl ? 'اختبارات:' : 'Quizzes:'} {st.avgQuizPct ?? '—'}% ·{' '}
                          {isRtl ? 'واجبات:' : 'Assign:'} {st.avgAssignPct ?? '—'}% ·{' '}
                          {isRtl ? 'حضور:' : 'Att:'} {st.attendanceRatePct ?? '—'}%
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-bold text-emerald-700 tabular-nums">
                          {st.combinedScorePct}%
                        </span>
                        {onInspectStudentRecord && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onInspectStudentRecord(st.studentId)}
                          >
                            {isRtl ? 'السجل' : 'Record'}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader
              title={isRtl ? 'طلاب يحتاجون إلى متابعة أكاديمية' : 'Students Needing Academic Attention'}
              subtitle={
                isRtl
                  ? `وفق الحدود المعتمدة (< ${data.scope.attentionScoreThreshold}% أداء أو < ${data.scope.attentionAttendanceThreshold}% حضور)`
                  : `Configured threshold (< ${data.scope.attentionScoreThreshold}% score or < ${data.scope.attentionAttendanceThreshold}% attendance)`
              }
            />
            <CardContent>
              {data.studentAnalytics.attentionNeeded.length === 0 ? (
                <EmptyState
                  icon={<CheckCircle2 className="w-5 h-5" />}
                  title={isRtl ? 'لا توجد حالات تعثر مرصودة' : 'No students flagged for attention'}
                  description={isRtl ? 'جميع الطلاب ذوي السجلات المرصودة ضمن النطاق المقبول.' : 'All evaluated students are above configured thresholds.'}
                />
              ) : (
                <div className="divide-y divide-slate-100 text-xs">
                  {data.studentAnalytics.attentionNeeded.map((st) => (
                    <div key={st.studentId} className="py-2.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-[#14243A] truncate">
                          {isRtl ? st.fullNameArabic : st.fullName}
                        </div>
                        <div className="text-[11px] text-rose-700 mt-0.5 tabular-nums">
                          {st.lowAcademic && (
                            <span>
                              {isRtl ? 'معدل منخفض:' : 'Low score:'} {st.combinedScorePct}%
                            </span>
                          )}
                          {st.lowAcademic && st.lowAttendance && ' · '}
                          {st.lowAttendance && (
                            <span>
                              {isRtl ? 'حضور منخفض:' : 'Low attendance:'} {st.attendanceRatePct}%
                            </span>
                          )}
                        </div>
                      </div>
                      {onInspectStudentRecord && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onInspectStudentRecord(st.studentId)}
                        >
                          {isRtl ? 'فتح السجل' : 'Inspect'}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB: GROUP ANALYTICS */}
      {activeTab === 'groups' && (
        <Card>
          <CardHeader
            title={isRtl ? 'مؤشرات أداء المجموعات' : 'Cohort Performance Breakdown'}
            subtitle={isRtl ? 'جميع النسب محسوبة من السجلات الفعلية للمجموعة' : 'Calculated from actual student enrollment & assessment data'}
          />
          <CardContent className="p-0">
            {data.groupAnalytics.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={<FolderGit2 className="w-5 h-5" />}
                  title={isRtl ? 'لا توجد مجموعات' : 'No groups found'}
                  description={isRtl ? 'لا توجد مجموعات مطابقة للفلاتر الحالية.' : 'No cohorts match current filters.'}
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-start">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-3 px-4 text-start">{isRtl ? 'المجموعة' : 'Group'}</th>
                      <th className="py-3 px-4 text-start">{isRtl ? 'العام الدراسي' : 'Academic Year'}</th>
                      <th className="py-3 px-4 text-start">{isRtl ? 'الطلاب النشطون' : 'Active Students'}</th>
                      <th className="py-3 px-4 text-start">{isRtl ? 'نسبة الحضور' : 'Attendance Rate'}</th>
                      <th className="py-3 px-4 text-start">{isRtl ? 'متوسط الاختبارات' : 'Avg Quiz Score'}</th>
                      <th className="py-3 px-4 text-start">{isRtl ? 'تقدم المقررات' : 'Course Progress'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.groupAnalytics.map((g) => (
                      <tr key={g.groupId} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 font-semibold text-[#14243A]">
                          {isRtl ? g.nameArabic : g.name}
                        </td>
                        <td className="py-3 px-4 tabular-nums text-slate-600">{g.academicYear}</td>
                        <td className="py-3 px-4 tabular-nums">{g.activeStudentsCount}</td>
                        <td className="py-3 px-4 tabular-nums font-semibold">
                          {g.attendanceRatePct !== null ? `${g.attendanceRatePct}%` : '—'}
                        </td>
                        <td className="py-3 px-4 tabular-nums font-semibold">
                          {g.avgQuizScorePct !== null ? `${g.avgQuizScorePct}%` : '—'}
                        </td>
                        <td className="py-3 px-4 tabular-nums font-semibold">
                          {g.avgCourseProgressPct !== null ? `${g.avgCourseProgressPct}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* TAB: COURSE ANALYTICS */}
      {activeTab === 'courses' && (
        <Card>
          <CardHeader
            title={isRtl ? 'مؤشرات أداء المقررات' : 'Course Engagement & Outcomes'}
            subtitle={isRtl ? 'نسب الإكمال ونتائج الاختبارات عبر المقررات المصرح بها' : 'Lesson completion and quiz scores across authorized courses'}
          />
          <CardContent className="p-0">
            {data.courseAnalytics.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={<BookOpen className="w-5 h-5" />}
                  title={isRtl ? 'لا توجد مقررات' : 'No courses found'}
                  description={isRtl ? 'لا توجد مقررات مطابقة للفلاتر الحالية.' : 'No courses match current filters.'}
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-start">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-3 px-4 text-start">{isRtl ? 'المقرر' : 'Course'}</th>
                      <th className="py-3 px-4 text-start">{isRtl ? 'الطلاب المسجلون' : 'Enrolled'}</th>
                      <th className="py-3 px-4 text-start">{isRtl ? 'الدروس المنشورة' : 'Lessons'}</th>
                      <th className="py-3 px-4 text-start">{isRtl ? 'الواجبات' : 'Assignments'}</th>
                      <th className="py-3 px-4 text-start">{isRtl ? 'نسبة الإكمال' : 'Avg Completion'}</th>
                      <th className="py-3 px-4 text-start">{isRtl ? 'متوسط الاختبارات' : 'Avg Quiz'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.courseAnalytics.map((c) => (
                      <tr key={c.courseId} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 font-semibold text-[#14243A]">
                          {isRtl ? c.titleArabic : c.title}
                        </td>
                        <td className="py-3 px-4 tabular-nums">{c.enrolledStudentsCount}</td>
                        <td className="py-3 px-4 tabular-nums">{c.publishedLessonsCount}</td>
                        <td className="py-3 px-4 tabular-nums">{c.publishedAssignmentsCount}</td>
                        <td className="py-3 px-4 tabular-nums font-semibold">
                          {c.avgCompletionPct !== null ? `${c.avgCompletionPct}%` : '—'}
                        </td>
                        <td className="py-3 px-4 tabular-nums font-semibold">
                          {c.avgQuizScorePct !== null ? `${c.avgQuizScorePct}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* TAB: ATTENDANCE ANALYTICS */}
      {activeTab === 'attendance' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">{isRtl ? 'حاضر' : 'Present'}</div>
              <div className="text-2xl font-bold text-emerald-700 mt-1 tabular-nums">
                {data.attendanceAnalytics.breakdown.present}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">{isRtl ? 'متأخر' : 'Late'}</div>
              <div className="text-2xl font-bold text-amber-700 mt-1 tabular-nums">
                {data.attendanceAnalytics.breakdown.late}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">{isRtl ? 'غائب بعذر' : 'Excused'}</div>
              <div className="text-2xl font-bold text-[#356AE6] mt-1 tabular-nums">
                {data.attendanceAnalytics.breakdown.excused}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">{isRtl ? 'غائب' : 'Absent'}</div>
              <div className="text-2xl font-bold text-rose-700 mt-1 tabular-nums">
                {data.attendanceAnalytics.breakdown.absent}
              </div>
            </div>
          </div>

          <Card>
            <CardHeader
              title={isRtl ? 'تفاصيل حضور الحصص المباشرة الأخيرة' : 'Recent Live Session Attendance'}
              subtitle={isRtl ? 'توقيت مكة المكرمة (Asia/Riyadh)' : 'Makkah Time (Asia/Riyadh)'}
            />
            <CardContent className="p-0">
              {data.attendanceAnalytics.recentSessions.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    icon={<Radio className="w-5 h-5" />}
                    title={isRtl ? 'لا توجد حصص مباشرة في الفترة المحددة' : 'No live sessions in period'}
                    description={isRtl ? 'جرّب توسيع النطاق الزمني لعرض بيانات الحضور.' : 'Expand the date range to inspect session attendance.'}
                  />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-start">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                      <tr>
                        <th className="py-3 px-4 text-start">{isRtl ? 'الحصة' : 'Session'}</th>
                        <th className="py-3 px-4 text-start">{isRtl ? 'الموعد (الرياض)' : 'Time (Riyadh)'}</th>
                        <th className="py-3 px-4 text-start">{isRtl ? 'حاضر' : 'Present'}</th>
                        <th className="py-3 px-4 text-start">{isRtl ? 'متأخر' : 'Late'}</th>
                        <th className="py-3 px-4 text-start">{isRtl ? 'بعذر' : 'Excused'}</th>
                        <th className="py-3 px-4 text-start">{isRtl ? 'غائب' : 'Absent'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.attendanceAnalytics.recentSessions.map((s) => (
                        <tr key={s.sessionId} className="hover:bg-slate-50/70">
                          <td className="py-3 px-4 font-semibold text-[#14243A]">
                            {isRtl ? s.titleArabic || s.title : s.title}
                          </td>
                          <td className="py-3 px-4 tabular-nums text-slate-500 whitespace-nowrap">
                            {formatRecordTimestampRiyadh(s.startTime, lang)}
                          </td>
                          <td className="py-3 px-4 tabular-nums text-emerald-700 font-semibold">{s.present}</td>
                          <td className="py-3 px-4 tabular-nums text-amber-700 font-semibold">{s.late}</td>
                          <td className="py-3 px-4 tabular-nums text-[#356AE6] font-semibold">{s.excused}</td>
                          <td className="py-3 px-4 tabular-nums text-rose-700 font-semibold">{s.absent}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};
