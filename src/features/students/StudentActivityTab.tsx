/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale } from '../../hooks/useLocale';
import { StudentRecord } from './studentService';
import {
  DEFAULT_ACTIVITY_LIMIT,
  StudentActivitySummary,
  fetchStudentActivitySummary,
  isStudentActivityEmpty,
} from './studentActivityService';
import { formatRiyadhDateTime } from '../../lib/dateUtils';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { ErrorState } from '../../components/ui/ErrorState';
import { Button } from '../../components/ui/Button';
import {
  Award,
  BookOpen,
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  ClipboardList,
  Clock,
  FileCheck2,
  HelpCircle,
  MessageSquare,
  RefreshCw,
} from 'lucide-react';

interface StudentActivityTabProps {
  student: StudentRecord;
  isActive: boolean;
}

type ActivitySectionFilter = 'all' | 'courses' | 'attendance' | 'quizzes' | 'assignments';

interface SectionLimits {
  attendanceLimit: number;
  quizLimit: number;
  assignmentLimit: number;
}

export const StudentActivityTab: React.FC<StudentActivityTabProps> = ({
  student,
  isActive,
}) => {
  const { t, isRtl } = useLocale();
  const locale: 'ar' | 'en' = isRtl ? 'ar' : 'en';

  const [summary, setSummary] = useState<StudentActivitySummary | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<unknown>(null);
  const [sectionFilter, setSectionFilter] = useState<ActivitySectionFilter>('all');
  const [expandedCourses, setExpandedCourses] = useState<Record<string, boolean>>({});
  const [limits, setLimits] = useState<SectionLimits>({
    attendanceLimit: DEFAULT_ACTIVITY_LIMIT,
    quizLimit: DEFAULT_ACTIVITY_LIMIT,
    assignmentLimit: DEFAULT_ACTIVITY_LIMIT,
  });

  // In-memory cache per studentId + limits signature to avoid repeated requests
  const cacheRef = useRef<Map<string, StudentActivitySummary>>(new Map());
  const requestSeqRef = useRef<number>(0);

  const groupIds = useMemo(() => student.groups.map((g) => g.id), [student.groups]);
  const groupIdsKey = useMemo(() => groupIds.slice().sort().join(','), [groupIds]);

  const buildCacheKey = useCallback(
    (studentId: string, secLimits: SectionLimits) =>
      `${studentId}|${groupIdsKey}|${secLimits.attendanceLimit}|${secLimits.quizLimit}|${secLimits.assignmentLimit}`,
    [groupIdsKey]
  );

  // Reset expanded courses & limits when student changes
  useEffect(() => {
    setSectionFilter('all');
    setExpandedCourses({});
    setLimits({
      attendanceLimit: DEFAULT_ACTIVITY_LIMIT,
      quizLimit: DEFAULT_ACTIVITY_LIMIT,
      assignmentLimit: DEFAULT_ACTIVITY_LIMIT,
    });
    setError(null);
    const defaultKey = buildCacheKey(student.id, {
      attendanceLimit: DEFAULT_ACTIVITY_LIMIT,
      quizLimit: DEFAULT_ACTIVITY_LIMIT,
      assignmentLimit: DEFAULT_ACTIVITY_LIMIT,
    });
    setSummary(cacheRef.current.get(defaultKey) || null);
  }, [student.id, buildCacheKey]);

  const loadActivity = useCallback(
    async (forceRefresh = false, overrideLimits?: SectionLimits) => {
      const targetLimits = overrideLimits || limits;
      const cacheKey = buildCacheKey(student.id, targetLimits);

      if (!forceRefresh) {
        const cached = cacheRef.current.get(cacheKey);
        if (cached) {
          setSummary(cached);
          setError(null);
          return;
        }
      }

      const seq = ++requestSeqRef.current;
      setLoading(true);
      setError(null);

      try {
        const data = await fetchStudentActivitySummary({
          studentId: student.id,
          groupIds,
          attendanceLimit: targetLimits.attendanceLimit,
          quizLimit: targetLimits.quizLimit,
          assignmentLimit: targetLimits.assignmentLimit,
        });

        if (seq !== requestSeqRef.current) return;
        cacheRef.current.set(cacheKey, data);
        setSummary(data);
      } catch (err) {
        if (seq !== requestSeqRef.current) return;
        setError(err);
      } finally {
        if (seq === requestSeqRef.current) {
          setLoading(false);
        }
      }
    },
    [student.id, groupIds, limits, buildCacheKey]
  );

  useEffect(() => {
    if (!isActive) return;
    loadActivity(false);
  }, [isActive, loadActivity]);

  const handleLoadMore = (section: 'attendance' | 'quizzes' | 'assignments') => {
    const nextLimits: SectionLimits = {
      attendanceLimit:
        section === 'attendance'
          ? limits.attendanceLimit + DEFAULT_ACTIVITY_LIMIT
          : limits.attendanceLimit,
      quizLimit:
        section === 'quizzes' ? limits.quizLimit + DEFAULT_ACTIVITY_LIMIT : limits.quizLimit,
      assignmentLimit:
        section === 'assignments'
          ? limits.assignmentLimit + DEFAULT_ACTIVITY_LIMIT
          : limits.assignmentLimit,
    };
    setLimits(nextLimits);
    loadActivity(true, nextLimits);
  };

  const toggleCourseExpanded = (courseId: string) => {
    setExpandedCourses((prev) => ({ ...prev, [courseId]: !prev[courseId] }));
  };

  if (loading && !summary) {
    return (
      <div className="py-10 flex items-center justify-center">
        <LoadingSpinner size="md" label={t.common.loading} />
      </div>
    );
  }

  if (error && !summary) {
    return (
      <ErrorState
        error={error}
        isRtl={isRtl}
        onRetry={() => loadActivity(true)}
      />
    );
  }

  if (!summary) {
    return null;
  }

  const isEmpty = isStudentActivityEmpty(summary);

  const renderAttendanceBadge = (status: string) => {
    switch (status) {
      case 'present':
        return (
          <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">
            {t.students.activityAttendancePresent}
          </span>
        );
      case 'late':
        return (
          <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-bold">
            {t.students.activityAttendanceLate}
          </span>
        );
      case 'excused':
        return (
          <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-bold">
            {t.students.activityAttendanceExcused}
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-bold">
            {t.students.activityAttendanceAbsent}
          </span>
        );
    }
  };

  const renderSubmissionStatusBadge = (status: string) => {
    if (status === 'graded') {
      return (
        <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">
          {t.students.activityGraded}
        </span>
      );
    }
    if (status === 'returned_for_revision') {
      return (
        <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-bold">
          {t.students.activityRevisionRequested}
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-bold">
        {t.students.activitySubmitted}
      </span>
    );
  };

  const showCourses = sectionFilter === 'all' || sectionFilter === 'courses';
  const showAttendance = sectionFilter === 'all' || sectionFilter === 'attendance';
  const showQuizzes = sectionFilter === 'all' || sectionFilter === 'quizzes';
  const showAssignments = sectionFilter === 'all' || sectionFilter === 'assignments';

  return (
    <div className="space-y-4">
      {Boolean(error) && (
        <ErrorState
          variant="banner"
          error={error}
          isRtl={isRtl}
          onRetry={() => loadActivity(true)}
          onDismiss={() => setError(null)}
        />
      )}

      {/* Header bar: Last learning activity + Riyadh timezone + Refresh */}
      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <Clock className="w-4 h-4 text-[#356AE6] shrink-0" />
          <span className="font-bold text-slate-700">{t.students.activityLastLearning}:</span>
          <span className="text-slate-900 font-semibold">
            {summary.lastLearningActivityAt
              ? formatRiyadhDateTime(summary.lastLearningActivityAt, { locale })
              : t.students.activityNoLearningYet}
          </span>
          <span className="text-[11px] text-slate-500">
            • {t.students.activityTimezoneNote}
          </span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={loading}
          onClick={() => loadActivity(true)}
          icon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
        >
          {t.students.activityRefresh}
        </Button>
      </div>

      {isEmpty ? (
        <div className="p-8 text-center bg-slate-50/60 rounded-xl border border-dashed border-slate-200">
          <ClipboardList className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <h4 className="text-sm font-bold text-slate-700">{t.students.activityEmptyTitle}</h4>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 leading-relaxed">
            {t.students.activityEmptyDesc}
          </p>
        </div>
      ) : (
        <>
          {/* Summary KPI Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            <div className="p-3 rounded-xl bg-white border border-slate-200">
              <span className="text-[11px] text-slate-500 block">
                {t.students.activityEnrolledCourses}
              </span>
              <div className="text-base font-bold text-slate-900 mt-0.5">
                {summary.totalEnrolledCourses}
              </div>
              <span className="text-[11px] text-[#356AE6] font-semibold">
                {summary.overallCourseProgressPercentage}% {t.students.activityOverallProgress}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-white border border-slate-200">
              <span className="text-[11px] text-slate-500 block">
                {t.students.activityCompletedLessons}
              </span>
              <div className="text-base font-bold text-emerald-700 mt-0.5">
                {summary.totalCompletedLessons} / {summary.totalPublishedLessons}
              </div>
              <span className="text-[11px] text-slate-500">
                {summary.totalPendingLessons} {t.students.activityPendingLessons}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-white border border-slate-200">
              <span className="text-[11px] text-slate-500 block">
                {t.students.activityAttendanceRate}
              </span>
              <div className="text-base font-bold text-slate-900 mt-0.5">
                {summary.attendanceTotalCount > 0
                  ? `${summary.attendanceMetrics.percentage}%`
                  : '—'}
              </div>
              <span className="text-[11px] text-slate-500">
                {summary.attendanceTotalCount} {isRtl ? 'جلسات' : 'sessions'}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-white border border-slate-200">
              <span className="text-[11px] text-slate-500 block">
                {t.students.activityQuizAttempts}
              </span>
              <div className="text-base font-bold text-slate-900 mt-0.5">
                {summary.quizAttemptsTotalCount}
              </div>
              <span className="text-[11px] text-slate-500">
                {summary.averageQuizPercentage !== null
                  ? `${summary.averageQuizPercentage}% ${isRtl ? 'متوسط' : 'avg'}`
                  : '—'}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-white border border-slate-200 col-span-2 sm:col-span-1">
              <span className="text-[11px] text-slate-500 block">
                {t.students.activityAssignmentsSubmitted}
              </span>
              <div className="text-base font-bold text-slate-900 mt-0.5">
                {summary.submissionsTotalCount}
              </div>
              <span className="text-[11px] text-slate-500">
                {summary.gradedSubmissionsCount} {t.students.activityGraded}
              </span>
            </div>
          </div>

          {/* Sub-section filter bar */}
          <div className="flex flex-wrap items-center gap-1.5 pb-1 border-b border-slate-100">
            {(
              [
                { id: 'all', label: t.students.activitySectionAll },
                {
                  id: 'courses',
                  label: `${t.students.activitySectionCourses} (${summary.courses.length})`,
                },
                {
                  id: 'attendance',
                  label: `${t.students.activitySectionAttendance} (${summary.attendanceTotalCount})`,
                },
                {
                  id: 'quizzes',
                  label: `${t.students.activitySectionQuizzes} (${summary.quizAttemptsTotalCount})`,
                },
                {
                  id: 'assignments',
                  label: `${t.students.activitySectionAssignments} (${summary.submissionsTotalCount})`,
                },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSectionFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  sectionFilter === tab.id
                    ? 'bg-[#356AE6] text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* 1. Course Enrollments & Lesson Progress */}
          {showCourses && (
            <section className="space-y-2.5">
              <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-[#356AE6]" />
                <span>{t.students.activitySectionCourses}</span>
              </h4>

              {summary.courses.length === 0 ? (
                <p className="text-xs text-slate-500 p-4 bg-slate-50 rounded-xl border border-slate-200">
                  {t.students.activityNoCourses}
                </p>
              ) : (
                <div className="space-y-2.5">
                  {summary.courses.map((course) => {
                    const isExpanded = Boolean(expandedCourses[course.courseId]);
                    return (
                      <div
                        key={course.courseId}
                        className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-2.5"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-slate-900">
                                {isRtl ? course.titleArabic : course.title}
                              </span>
                              {course.groupNames.map((g) => (
                                <span
                                  key={g.id}
                                  className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-semibold"
                                >
                                  {isRtl ? g.nameArabic : g.name}
                                </span>
                              ))}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-3">
                              <span>
                                {course.completedLessonsCount} / {course.totalPublishedLessons}{' '}
                                {t.students.activityCompletedLessons}
                              </span>
                              <span>
                                • {course.pendingLessonsCount}{' '}
                                {t.students.activityPendingLessons}
                              </span>
                              {course.lastAccessedAt && (
                                <span>
                                  • {formatRiyadhDateTime(course.lastAccessedAt, { locale })}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-xs font-bold text-[#356AE6]">
                              {course.progressPercentage}%
                            </span>
                            {course.totalPublishedLessons > 0 && (
                              <button
                                type="button"
                                onClick={() => toggleCourseExpanded(course.courseId)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold cursor-pointer"
                              >
                                <span>
                                  {isExpanded
                                    ? t.students.activityHideLessons
                                    : t.students.activityViewLessons}
                                </span>
                                {isExpanded ? (
                                  <ChevronUp className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                )}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#356AE6] rounded-full transition-all"
                            style={{ width: `${course.progressPercentage}%` }}
                          />
                        </div>

                        {course.totalPublishedLessons === 0 && (
                          <p className="text-[11px] text-slate-400">
                            {t.students.activityNoPublishedLessons}
                          </p>
                        )}

                        {/* Expanded Completed vs Pending Lessons */}
                        {isExpanded && course.totalPublishedLessons > 0 && (
                          <div className="pt-2 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                            <div className="space-y-1.5">
                              <div className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>
                                  {t.students.activityCompletedLessons} (
                                  {course.completedLessonsCount})
                                </span>
                              </div>
                              {course.completedLessons.length === 0 ? (
                                <p className="text-[11px] text-slate-400 ps-4">—</p>
                              ) : (
                                <ul className="space-y-1 max-h-48 overflow-y-auto pe-1">
                                  {course.completedLessons.map((lesson) => (
                                    <li
                                      key={lesson.id}
                                      className="p-2 rounded-lg bg-emerald-50/50 border border-emerald-100 flex items-center justify-between gap-2"
                                    >
                                      <div className="min-w-0">
                                        <span className="block font-semibold text-slate-800 truncate">
                                          {isRtl ? lesson.titleArabic : lesson.title}
                                        </span>
                                        <span className="block text-[10px] text-slate-500 truncate">
                                          {isRtl ? lesson.unitTitleArabic : lesson.unitTitle}
                                        </span>
                                      </div>
                                      {lesson.lastAccessedAt && (
                                        <span className="text-[10px] text-slate-500 shrink-0">
                                          {formatRiyadhDateTime(lesson.lastAccessedAt, {
                                            locale,
                                            includeTime: false,
                                          })}
                                        </span>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>

                            <div className="space-y-1.5">
                              <div className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                                <Circle className="w-3.5 h-3.5" />
                                <span>
                                  {t.students.activityPendingLessons} (
                                  {course.pendingLessonsCount})
                                </span>
                              </div>
                              {course.pendingLessons.length === 0 ? (
                                <p className="text-[11px] text-emerald-600 ps-4">
                                  {isRtl ? 'تم إكمال جميع الدروس!' : 'All published lessons completed!'}
                                </p>
                              ) : (
                                <ul className="space-y-1 max-h-48 overflow-y-auto pe-1">
                                  {course.pendingLessons.map((lesson) => (
                                    <li
                                      key={lesson.id}
                                      className="p-2 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between gap-2"
                                    >
                                      <div className="min-w-0">
                                        <span className="block font-medium text-slate-700 truncate">
                                          {isRtl ? lesson.titleArabic : lesson.title}
                                        </span>
                                        <span className="block text-[10px] text-slate-400 truncate">
                                          {isRtl ? lesson.unitTitleArabic : lesson.unitTitle}
                                        </span>
                                      </div>
                                      {lesson.durationMinutes > 0 && (
                                        <span className="text-[10px] text-slate-400 shrink-0">
                                          {lesson.durationMinutes} {isRtl ? 'د' : 'm'}
                                        </span>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* 2. Live Session Attendance */}
          {showAttendance && (
            <section className="space-y-2.5">
              <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <CalendarCheck className="w-4 h-4 text-emerald-600" />
                <span>{t.students.activitySectionAttendance}</span>
              </h4>

              {summary.attendance.length === 0 ? (
                <p className="text-xs text-slate-500 p-4 bg-slate-50 rounded-xl border border-slate-200">
                  {t.students.activityNoAttendance}
                </p>
              ) : (
                <div className="space-y-2">
                  {summary.attendance.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-xl border border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 truncate">
                          {isRtl
                            ? item.sessionTitleArabic || item.sessionTitle
                            : item.sessionTitle || item.sessionTitleArabic}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {formatRiyadhDateTime(
                            item.sessionStartTime || item.joinedAt || item.recordedAt,
                            { locale }
                          )}
                        </div>
                        {item.notes && (
                          <p className="text-[11px] text-slate-600 mt-1">{item.notes}</p>
                        )}
                      </div>
                      <div className="shrink-0">{renderAttendanceBadge(item.status)}</div>
                    </div>
                  ))}

                  {summary.attendanceTotalCount > summary.attendance.length && (
                    <div className="flex justify-center pt-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={loading}
                        onClick={() => handleLoadMore('attendance')}
                      >
                        {t.students.activityLoadMore}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* 3. Quiz Attempts & Results */}
          {showQuizzes && (
            <section className="space-y-2.5">
              <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <HelpCircle className="w-4 h-4 text-purple-600" />
                <span>{t.students.activitySectionQuizzes}</span>
              </h4>

              {summary.quizAttempts.length === 0 ? (
                <p className="text-xs text-slate-500 p-4 bg-slate-50 rounded-xl border border-slate-200">
                  {t.students.activityNoQuizzes}
                </p>
              ) : (
                <div className="space-y-2">
                  {summary.quizAttempts.map((attempt) => (
                    <div
                      key={attempt.id}
                      className="p-3 rounded-xl border border-slate-200 bg-white space-y-1.5 text-xs"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-900">
                              {isRtl ? attempt.quizTitleArabic : attempt.quizTitle}
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-semibold">
                              {t.students.activityAttemptLabel} #{attempt.attemptNumber}
                            </span>
                          </div>
                          {(attempt.courseTitle || attempt.courseTitleArabic) && (
                            <span className="text-[11px] text-slate-500 block mt-0.5">
                              {isRtl ? attempt.courseTitleArabic : attempt.courseTitle}
                            </span>
                          )}
                          <span className="text-[11px] text-slate-400 block mt-0.5">
                            {formatRiyadhDateTime(
                              attempt.submittedAt || attempt.completedAt || attempt.startedAt,
                              { locale }
                            )}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                          {attempt.percentageScore !== null && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 font-bold text-[11px]">
                              <Award className="w-3.5 h-3.5 text-[#356AE6]" />
                              <span>{Math.round(attempt.percentageScore)}%</span>
                              {attempt.pointsScored !== null &&
                                attempt.totalPointsPossible !== null && (
                                  <span className="text-slate-500 font-normal">
                                    ({attempt.pointsScored}/{attempt.totalPointsPossible})
                                  </span>
                                )}
                            </span>
                          )}

                          {attempt.status === 'in_progress' ? (
                            <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-bold">
                              {t.students.activityInProgress}
                            </span>
                          ) : attempt.requiresManualGrading && attempt.status !== 'graded' ? (
                            <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-bold">
                              {t.students.activityPendingGrading}
                            </span>
                          ) : attempt.isPassed === true ? (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">
                              {t.students.activityPassed}
                            </span>
                          ) : attempt.isPassed === false ? (
                            <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-bold">
                              {t.students.activityFailed}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {attempt.teacherFeedback && (
                        <div className="p-2.5 rounded-lg bg-blue-50/50 border border-blue-100 text-[11px] text-slate-700 flex items-start gap-2">
                          <MessageSquare className="w-3.5 h-3.5 text-[#356AE6] shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold text-slate-800">
                              {t.students.activityTeacherFeedback}:{' '}
                            </span>
                            <span>{attempt.teacherFeedback}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {summary.quizAttemptsTotalCount > summary.quizAttempts.length && (
                    <div className="flex justify-center pt-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={loading}
                        onClick={() => handleLoadMore('quizzes')}
                      >
                        {t.students.activityLoadMore}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* 4. Assignment Submissions & Teacher Feedback */}
          {showAssignments && (
            <section className="space-y-2.5">
              <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <FileCheck2 className="w-4 h-4 text-amber-600" />
                <span>{t.students.activitySectionAssignments}</span>
              </h4>

              {summary.submissions.length === 0 ? (
                <p className="text-xs text-slate-500 p-4 bg-slate-50 rounded-xl border border-slate-200">
                  {t.students.activityNoAssignments}
                </p>
              ) : (
                <div className="space-y-2">
                  {summary.submissions.map((sub) => (
                    <div
                      key={sub.id}
                      className="p-3 rounded-xl border border-slate-200 bg-white space-y-1.5 text-xs"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-900">
                              {isRtl ? sub.assignmentTitleArabic : sub.assignmentTitle}
                            </span>
                            {sub.isLate && (
                              <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold">
                                {t.students.activityLateBadge}
                              </span>
                            )}
                          </div>
                          {(sub.courseTitle || sub.courseTitleArabic) && (
                            <span className="text-[11px] text-slate-500 block mt-0.5">
                              {isRtl ? sub.courseTitleArabic : sub.courseTitle}
                            </span>
                          )}
                          <span className="text-[11px] text-slate-400 block mt-0.5">
                            {formatRiyadhDateTime(sub.submittedAt, { locale })}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                          {sub.score !== null && (
                            <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 font-bold text-[11px]">
                              {sub.score} / {sub.maxScore}
                            </span>
                          )}
                          {renderSubmissionStatusBadge(sub.status)}
                        </div>
                      </div>

                      {sub.teacherFeedback && (
                        <div className="p-2.5 rounded-lg bg-blue-50/50 border border-blue-100 text-[11px] text-slate-700 flex items-start gap-2">
                          <MessageSquare className="w-3.5 h-3.5 text-[#356AE6] shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold text-slate-800">
                              {t.students.activityTeacherFeedback}:{' '}
                            </span>
                            <span>{sub.teacherFeedback}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {summary.submissionsTotalCount > summary.submissions.length && (
                    <div className="flex justify-center pt-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={loading}
                        onClick={() => handleLoadMore('assignments')}
                      >
                        {t.students.activityLoadMore}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
};
