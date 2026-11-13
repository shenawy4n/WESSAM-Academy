/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useLocale } from '../../hooks/useLocale';
import { StudentCourseSummary, fetchStudentCourses } from './coursesService';
import { StudentCourseDetailView } from './StudentCourseDetailView';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { ErrorState } from '../../components/ui/ErrorState';
import { BookOpen, PlayCircle, ArrowRight, ArrowLeft } from 'lucide-react';

export const StudentCoursesView: React.FC = () => {
  const { t, isRtl } = useLocale();

  const [courses, setCourses] = useState<StudentCourseSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);

  const loadCourses = async () => {
    try {
      setIsLoading(true);
      setLoadError(null);
      const data = await fetchStudentCourses();
      setCourses(data);
    } catch (err: unknown) {
      setLoadError(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCourses();
  }, []);

  if (selectedCourseId) {
    return (
      <StudentCourseDetailView
        courseId={selectedCourseId}
        onBack={() => {
          setSelectedCourseId(null);
          loadCourses();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-white rounded-2xl p-6 shadow-xs border border-slate-200">
        <div className="flex items-center gap-2">
          <span className="p-2 rounded-xl bg-[#356AE6]/10 text-[#356AE6]">
            <BookOpen className="w-5 h-5" />
          </span>
          <h1 className="text-xl font-bold text-slate-900">{t.courses.myCourses}</h1>
        </div>
        <p className="text-xs text-slate-500 mt-1 max-w-xl">
          {t.courses.myCoursesSubtitle}
        </p>
      </div>

      {isLoading ? (
        <div className="p-12 text-center">
          <LoadingSpinner size="lg" label={t.common.loading} />
        </div>
      ) : loadError ? (
        <ErrorState error={loadError} isRtl={isRtl} onRetry={loadCourses} />
      ) : courses.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200">
          <BookOpen className="w-12 h-12 text-slate-400 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-800 mb-1">
            {t.courses.noCoursesAssignedStudent}
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {t.courses.noCoursesAssignedStudentDesc}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.map((course) => (
            <div
              key={course.id}
              onClick={() => setSelectedCourseId(course.id)}
              className="group bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs hover:shadow-md hover:border-[#356AE6]/50 transition-all cursor-pointer flex flex-col"
            >
              {/* Cover Image */}
              <div className="relative h-44 w-full bg-slate-900 overflow-hidden">
                {course.coverImageUrl ? (
                  <img
                    src={course.coverImageUrl}
                    alt={course.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-[#14243A] to-[#25456E] flex items-center justify-center text-white/40">
                    <BookOpen className="w-12 h-12" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-black/20" />

                <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-xs text-white text-[10px] font-medium">
                    {course.level === 'beginner'
                      ? 'Beginner / A1-A2'
                      : course.level === 'advanced'
                      ? 'Advanced / C1-C2'
                      : 'Intermediate / B1-B2'}
                  </span>
                </div>

                <div className="absolute bottom-3 left-3 right-3 text-white">
                  <h3 className="text-sm font-bold line-clamp-1">
                    {isRtl ? course.titleArabic : course.title}
                  </h3>
                  <p className="text-[11px] text-slate-300 line-clamp-1">
                    {isRtl ? course.title : course.titleArabic}
                  </p>
                </div>
              </div>

              {/* Card Body */}
              <div className="p-4 flex-1 flex flex-col justify-between">
                <p className="text-xs text-slate-600 line-clamp-2 mb-4">
                  {isRtl
                    ? (course.descriptionArabic || course.description || 'منهج تعليمي شامل بإشراف الأستاذ وسام.')
                    : (course.description || course.descriptionArabic || 'Comprehensive curriculum by Mr. Wessam.')}
                </p>

                {/* Progress Bar */}
                <div className="space-y-1.5 mb-4">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-slate-500">{t.courses.courseProgress}</span>
                    <span className="text-[#356AE6]">{course.progressPercentage}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#356AE6] to-emerald-400 rounded-full transition-all duration-300"
                      style={{ width: `${course.progressPercentage}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 block text-end">
                    {course.completedLessons} / {course.totalLessons} {t.courses.lessons}
                  </span>
                </div>

                {/* Action Button */}
                <div className="pt-2 border-t border-slate-100">
                  <button className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[#356AE6] group-hover:bg-[#2855BE] text-white text-xs font-semibold shadow-xs transition-colors">
                    <PlayCircle className="w-4 h-4" />
                    <span>
                      {course.completedLessons > 0
                        ? t.courses.continueLearning
                        : t.courses.startLearning}
                    </span>
                    {isRtl ? (
                      <ArrowLeft className="w-3.5 h-3.5" />
                    ) : (
                      <ArrowRight className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
