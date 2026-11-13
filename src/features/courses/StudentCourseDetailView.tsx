/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useLocale } from '../../hooks/useLocale';
import {
  CourseRecord,
  CourseUnitRecord,
  LessonRecord,
  fetchStudentCourseDetails,
} from './coursesService';
import { StudentLessonView } from './StudentLessonView';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { ErrorState } from '../../components/ui/ErrorState';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle,
  PlayCircle,
  Clock,
  Paperclip,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface StudentCourseDetailViewProps {
  courseId: string;
  onBack: () => void;
}

export const StudentCourseDetailView: React.FC<StudentCourseDetailViewProps> = ({
  courseId,
  onBack,
}) => {
  const { t, isRtl } = useLocale();

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [course, setCourse] = useState<CourseRecord | null>(null);
  const [units, setUnits] = useState<CourseUnitRecord[]>([]);
  const [totalLessons, setTotalLessons] = useState(0);
  const [completedLessons, setCompletedLessons] = useState(0);
  const [progressPercentage, setProgressPercentage] = useState(0);

  const [expandedUnits, setExpandedUnits] = useState<Record<string, boolean>>({});
  const [activeLesson, setActiveLesson] = useState<LessonRecord | null>(null);

  const loadDetails = async () => {
    try {
      setIsLoading(true);
      setLoadError(null);
      const data = await fetchStudentCourseDetails(courseId);
      setCourse(data.course);
      setUnits(data.units);
      setTotalLessons(data.totalLessons);
      setCompletedLessons(data.completedLessons);
      setProgressPercentage(data.progressPercentage);

      // Expand all units initially
      const expMap: Record<string, boolean> = {};
      data.units.forEach((u) => {
        expMap[u.id] = true;
      });
      setExpandedUnits(expMap);
    } catch (err: unknown) {
      setLoadError(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDetails();
  }, [courseId]);

  const toggleUnit = (unitId: string) => {
    setExpandedUnits((prev) => ({ ...prev, [unitId]: !prev[unitId] }));
  };

  // Find all lessons sequentially across units
  const allLessons: LessonRecord[] = [];
  units.forEach((u) => {
    u.lessons.forEach((l) => allLessons.push(l));
  });

  const activeLessonIdx = activeLesson
    ? allLessons.findIndex((l) => l.id === activeLesson.id)
    : -1;
  const previousLesson = activeLessonIdx > 0 ? allLessons[activeLessonIdx - 1] : null;
  const nextLesson =
    activeLessonIdx >= 0 && activeLessonIdx < allLessons.length - 1
      ? allLessons[activeLessonIdx + 1]
      : null;

  const activeUnit = activeLesson
    ? units.find((u) => u.id === activeLesson.unitId)
    : null;
  const unitTitle = activeUnit
    ? isRtl
      ? activeUnit.titleArabic
      : activeUnit.title
    : '';

  if (activeLesson && course) {
    return (
      <StudentLessonView
        course={course}
        lesson={activeLesson}
        unitTitle={unitTitle}
        previousLesson={previousLesson}
        nextLesson={nextLesson}
        onNavigateLesson={(target) => setActiveLesson(target)}
        onBackToCourse={() => {
          setActiveLesson(null);
          loadDetails();
        }}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="p-12 text-center">
        <LoadingSpinner size="lg" label={t.common.loading} />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="space-y-4 max-w-5xl mx-auto">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
        >
          {isRtl ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
          <span>{t.courses.backToCourses}</span>
        </button>
        {loadError ? (
          <ErrorState error={loadError} isRtl={isRtl} onRetry={loadDetails} />
        ) : (
          <div className="p-8 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
            <p>{isRtl ? 'لم يتم العثور على المقرر أو غير مصرح به' : 'Course not accessible'}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top Navigation */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
      >
        {isRtl ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
        <span>{t.courses.backToCourses}</span>
      </button>

      {/* Hero Banner */}
      <div className="relative rounded-3xl overflow-hidden bg-slate-900 text-white p-6 sm:p-8 shadow-sm">
        {course.coverImageUrl && (
          <img
            src={course.coverImageUrl}
            alt={course.title}
            className="absolute inset-0 w-full h-full object-cover opacity-20"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-900/90 to-transparent" />

        <div className="relative z-10 space-y-4 max-w-2xl">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-1 rounded-full bg-[#356AE6] text-white text-xs font-bold uppercase tracking-wider">
              {course.level === 'beginner'
                ? 'Beginner / A1-A2'
                : course.level === 'advanced'
                ? 'Advanced / C1-C2'
                : 'Intermediate / B1-B2'}
            </span>
            <span className="text-xs text-slate-300">
              {units.length} {t.courses.units} • {totalLessons} {t.courses.lessons}
            </span>
          </div>

          <h1 className="text-xl sm:text-2xl font-black text-white">
            {isRtl ? course.titleArabic : course.title}
          </h1>

          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            {isRtl
              ? (course.descriptionArabic || course.description)
              : (course.description || course.descriptionArabic)}
          </p>

          {/* Progress Section */}
          <div className="pt-2">
            <div className="flex items-center justify-between text-xs mb-1.5 font-semibold">
              <span className="text-slate-300">{t.courses.courseProgress}</span>
              <span className="text-emerald-400">
                {progressPercentage}% ({completedLessons}/{totalLessons} {t.courses.lessons})
              </span>
            </div>
            <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
              <div
                className="h-full bg-gradient-to-r from-[#356AE6] to-emerald-400 transition-all duration-500 rounded-full"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Curriculum Units & Lessons Accordion */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-slate-900">{t.courses.manageCurriculum}</h3>

        {units.length === 0 ? (
          <div className="p-8 bg-white rounded-2xl text-center text-slate-400 text-xs border border-slate-200">
            {isRtl ? 'لا توجد دروس منشورة حالياً في هذا المقرر' : 'No published lessons in this course yet'}
          </div>
        ) : (
          units.map((unit) => {
            const isExpanded = Boolean(expandedUnits[unit.id]);
            return (
              <div
                key={unit.id}
                className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs"
              >
                {/* Unit Header */}
                <button
                  onClick={() => toggleUnit(unit.id)}
                  className="w-full p-4 bg-slate-50/70 hover:bg-slate-100/70 border-b border-slate-200/80 flex items-center justify-between gap-3 text-start transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-[#356AE6]/10 text-[#356AE6] font-bold text-xs flex items-center justify-center shrink-0">
                      {unit.orderIndex}
                    </div>
                    <div>
                      <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                        {isRtl ? unit.titleArabic : unit.title}
                      </h4>
                      <span className="text-[11px] text-slate-500">
                        {unit.lessons.length} {t.courses.lessons}
                      </span>
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  )}
                </button>

                {/* Lessons in Unit */}
                {isExpanded && (
                  <div className="p-3 divide-y divide-slate-100 space-y-1">
                    {unit.lessons.length === 0 ? (
                      <div className="p-4 text-center text-slate-400 text-xs">
                        {isRtl ? 'لا توجد دروس في هذه الوحدة' : 'No lessons in this unit'}
                      </div>
                    ) : (
                      unit.lessons.map((lesson) => {
                        const isDone = Boolean(lesson.progress?.isCompleted);
                        return (
                          <div
                            key={lesson.id}
                            onClick={() => setActiveLesson(lesson)}
                            className="p-3 rounded-xl hover:bg-slate-50 transition-colors flex items-center justify-between gap-3 cursor-pointer group"
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                                  isDone
                                    ? 'bg-emerald-100 text-emerald-600'
                                    : 'bg-slate-100 text-slate-400 group-hover:bg-[#356AE6]/10 group-hover:text-[#356AE6]'
                                }`}
                              >
                                {isDone ? (
                                  <CheckCircle className="w-4 h-4" />
                                ) : (
                                  <PlayCircle className="w-4 h-4" />
                                )}
                              </div>
                              <div>
                                <h5 className="text-xs font-bold text-slate-900 group-hover:text-[#356AE6] transition-colors">
                                  {isRtl ? lesson.titleArabic : lesson.title}
                                </h5>
                                <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5">
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3 text-slate-400" />
                                    <span>
                                      {lesson.durationMinutes} {isRtl ? 'دقيقة' : 'min'}
                                    </span>
                                  </span>
                                  {lesson.resources && lesson.resources.length > 0 && (
                                    <span className="flex items-center gap-1">
                                      <Paperclip className="w-3 h-3 text-slate-400" />
                                      <span>
                                        {lesson.resources.length} {t.courses.resources}
                                      </span>
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <span
                              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                                isDone
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-slate-100 text-slate-600 group-hover:bg-[#356AE6] group-hover:text-white transition-colors'
                              }`}
                            >
                              {isDone ? t.courses.completed : t.courses.startLearning}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
