/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useLocale } from '../../hooks/useLocale';
import {
  LessonRecord,
  CourseRecord,
  recordLessonProgress,
  getLessonResourceDownloadUrl,
} from './coursesService';
import { SafeVideoPlayer } from './SafeVideoPlayer';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  Circle,
  Clock,
  Download,
  Paperclip,
  ChevronLeft,
  ChevronRight,
  BookOpen,
} from 'lucide-react';

interface StudentLessonViewProps {
  course: CourseRecord;
  lesson: LessonRecord;
  unitTitle: string;
  previousLesson: LessonRecord | null;
  nextLesson: LessonRecord | null;
  onNavigateLesson: (targetLesson: LessonRecord) => void;
  onBackToCourse: () => void;
}

export const StudentLessonView: React.FC<StudentLessonViewProps> = ({
  course,
  lesson,
  unitTitle,
  previousLesson,
  nextLesson,
  onNavigateLesson,
  onBackToCourse,
}) => {
  const { t, isRtl } = useLocale();

  const [isCompleted, setIsCompleted] = useState<boolean>(
    Boolean(lesson.progress?.isCompleted)
  );
  const [isSaving, setIsSaving] = useState(false);
  const [successToast, setSuccessToast] = useState(false);
  const [downloadingResourceId, setDownloadingResourceId] = useState<string | null>(null);

  const handleDownloadResource = async (resourceId: string, fallbackUrl: string) => {
    try {
      setDownloadingResourceId(resourceId);
      const url = await getLessonResourceDownloadUrl(resourceId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.warn('Failed to obtain signed URL, using fallback', err);
      window.open(fallbackUrl, '_blank', 'noopener,noreferrer');
    } finally {
      setDownloadingResourceId(null);
    }
  };

  const handleToggleComplete = async () => {
    try {
      setIsSaving(true);
      const nextState = !isCompleted;
      await recordLessonProgress(lesson.id, nextState);
      setIsCompleted(nextState);
      if (nextState) {
        setSuccessToast(true);
        setTimeout(() => setSuccessToast(false), 3000);
      }
    } catch (err: any) {
      console.error('Failed to update lesson progress', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top Breadcrumb Header */}
      <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <button
          onClick={onBackToCourse}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
        >
          {isRtl ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
          <span>{t.courses.backToCourse}</span>
        </button>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 truncate max-w-xs">
            {isRtl ? course.titleArabic : course.title} • {unitTitle}
          </span>
        </div>
      </div>

      {/* Main Video Lecture Container */}
      <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-xs border border-slate-200 space-y-5">
        <SafeVideoPlayer
          videoUrl={lesson.videoUrl}
          title={lesson.title}
        />

        {/* Lesson Title & Completion Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-2 border-t border-slate-100">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold text-slate-900">
                {isRtl ? lesson.titleArabic : lesson.title}
              </h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs">
                <Clock className="w-3 h-3 text-slate-400" />
                <span>
                  {lesson.durationMinutes} {isRtl ? 'دقيقة' : 'min'}
                </span>
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {isRtl ? lesson.title : lesson.titleArabic}
            </p>
          </div>

          <button
            onClick={handleToggleComplete}
            disabled={isSaving}
            className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer ${
              isCompleted
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100'
                : 'bg-[#356AE6] hover:bg-[#2855BE] text-white'
            }`}
          >
            {isCompleted ? (
              <>
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span>{t.courses.completed}</span>
              </>
            ) : (
              <>
                <Circle className="w-4 h-4 text-white/80" />
                <span>{t.courses.markCompleted}</span>
              </>
            )}
          </button>
        </div>

        {/* Success Toast */}
        {successToast && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2 animate-fade-in">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{t.courses.lessonCompletedSuccess}</span>
          </div>
        )}

        {/* Outline / Description */}
        {lesson.description && (
          <div className="p-4 rounded-xl bg-slate-50/70 border border-slate-100">
            <h4 className="text-xs font-bold text-slate-700 mb-1">
              {isRtl ? 'محتوى الدرس والشرح الأكاديمي' : 'Lesson Summary & Academic Objectives'}
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">
              {lesson.description}
            </p>
          </div>
        )}

        {/* Handouts & Downloadable Resources */}
        {lesson.resources && lesson.resources.length > 0 && (
          <div className="pt-2">
            <h3 className="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5">
              <Paperclip className="w-3.5 h-3.5 text-[#356AE6]" />
              <span>{t.courses.resources}</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {lesson.resources.map((res) => (
                <button
                  type="button"
                  key={res.id}
                  onClick={() => handleDownloadResource(res.id, res.fileUrl)}
                  disabled={downloadingResourceId === res.id}
                  className="p-3 rounded-xl border border-slate-200 bg-white hover:border-[#356AE6] hover:bg-blue-50/30 transition-all flex items-center justify-between gap-3 text-start cursor-pointer disabled:opacity-60"
                >
                  <div className="overflow-hidden">
                    <span className="block text-xs font-semibold text-slate-900 truncate">
                      {isRtl ? (res.titleArabic || res.title) : res.title}
                    </span>
                    <span className="text-[10px] text-slate-400 uppercase">
                      {res.fileType || 'PDF'}
                    </span>
                  </div>
                  <Download className="w-4 h-4 text-[#356AE6] shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Sequential Navigation Buttons */}
        <div className="pt-6 border-t border-slate-100 flex items-center justify-between gap-3">
          {previousLesson ? (
            <button
              onClick={() => onNavigateLesson(previousLesson)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
            >
              {isRtl ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
              <span>{t.courses.previousLesson}</span>
            </button>
          ) : (
            <div />
          )}

          {nextLesson ? (
            <button
              onClick={() => onNavigateLesson(nextLesson)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#356AE6] hover:bg-[#2855BE] transition-colors shadow-xs"
            >
              <span>{t.courses.nextLesson}</span>
              {isRtl ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          ) : (
            <button
              onClick={onBackToCourse}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
            >
              <BookOpen className="w-4 h-4" />
              <span>{t.courses.backToCourse}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
