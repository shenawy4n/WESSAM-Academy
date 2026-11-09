/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useLocale } from '../../hooks/useLocale';
import { VideoAssetRecord, VideoFilter } from './types';
import { fetchStudentVideos } from './videoLibraryService';
import { formatDuration, calculateProgressPercentage } from './videoLibraryUtils';
import { VideoPlayerModal } from './VideoPlayerModal';
import { fetchStudentCourses } from '../courses/coursesService';
import {
  Video,
  Play,
  CheckCircle2,
  Clock,
  BookOpen,
  Search,
  Filter,
  Sparkles,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  CheckCircle,
} from 'lucide-react';

interface StudentVideoLibraryViewProps {
  onNavigateToLesson?: (lessonId: string) => void;
}

export const StudentVideoLibraryView: React.FC<StudentVideoLibraryViewProps> = ({
  onNavigateToLesson,
}) => {
  const { t, isRtl } = useLocale();

  const [videos, setVideos] = useState<VideoAssetRecord[]>([]);
  const [courses, setCourses] = useState<{ id: string; title: string; titleArabic: string }[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [courseFilter, setCourseFilter] = useState<string>('');
  const [progressTab, setProgressTab] = useState<'all' | 'in_progress' | 'completed' | 'unwatched'>('all');
  const [selectedVideo, setSelectedVideo] = useState<VideoAssetRecord | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [vids, crs] = await Promise.all([
        fetchStudentVideos({
          searchQuery,
          courseId: courseFilter || undefined,
          progressState: progressTab,
        }),
        fetchStudentCourses(),
      ]);
      setVideos(vids);
      setCourses(
        crs.map((c) => ({
          id: c.id,
          title: c.title,
          titleArabic: c.titleArabic,
        }))
      );
    } catch (err: any) {
      console.error('Failed to load student video library:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [searchQuery, courseFilter, progressTab]);

  const handleProgressUpdated = (videoId: string, isCompleted: boolean) => {
    setVideos((prev) =>
      prev.map((v) => {
        if (v.id === videoId && v.progress) {
          return {
            ...v,
            progress: {
              ...v.progress,
              isCompleted,
            },
          };
        }
        return v;
      })
    );
  };

  // Metrics
  const totalAvailable = videos.length;
  const completedCount = videos.filter((v) => v.progress?.isCompleted).length;
  const inProgressCount = videos.filter(
    (v) => (v.progress?.lastPositionSeconds || 0) > 0 && !v.progress?.isCompleted
  ).length;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-[#14243A] to-[#1E3A63] text-white rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2 max-w-xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-amber-300 text-xs font-semibold backdrop-blur-xs">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{isRtl ? 'المحاضرات والشروحات المسجلة' : 'Recorded Video Lectures'}</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold">
            {isRtl ? 'مكتبة الفيديوهات التعليمية' : 'Student Video Library'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            {isRtl
              ? 'شاهد واستأنف محاضرات مناهجك المسجلة مع الأستاذ وسام. يتم حفظ تقدمك تلقائياً وبدقة عالية.'
              : 'Stream and resume recorded course lectures with Teacher Wessam. Your progress is saved automatically.'}
          </p>
        </div>

        {/* Stats Counter */}
        <div className="flex items-center gap-3 sm:gap-4 shrink-0">
          <div className="p-4 rounded-2xl bg-white/10 backdrop-blur-xs text-center min-w-[90px]">
            <span className="text-[11px] text-slate-300 block">{isRtl ? 'مكتمل' : 'Completed'}</span>
            <span className="text-xl font-bold text-emerald-400">{completedCount}</span>
          </div>
          <div className="p-4 rounded-2xl bg-white/10 backdrop-blur-xs text-center min-w-[90px]">
            <span className="text-[11px] text-slate-300 block">{isRtl ? 'قيد المشاهدة' : 'In Progress'}</span>
            <span className="text-xl font-bold text-amber-300">{inProgressCount}</span>
          </div>
          <div className="p-4 rounded-2xl bg-white/10 backdrop-blur-xs text-center min-w-[90px]">
            <span className="text-[11px] text-slate-300 block">{isRtl ? 'المتاح' : 'Available'}</span>
            <span className="text-xl font-bold text-white">{totalAvailable}</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Search */}
          <div className="sm:col-span-2 relative">
            <Search className="w-4 h-4 absolute top-2.5 right-3 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isRtl ? 'بحث في المحاضرات والمواضيع...' : 'Search lectures and topics...'}
              className="w-full pr-9 pl-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#356AE6]/20 focus:border-[#356AE6]"
            />
          </div>

          {/* Course Filter */}
          <div>
            <select
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#356AE6]/20 focus:border-[#356AE6]"
            >
              <option value="">{isRtl ? 'جميع المناهج المسجلة' : 'All My Courses'}</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {isRtl ? c.titleArabic : c.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Progress State Filter Tabs */}
        <div className="flex items-center gap-2 pt-2 border-t border-slate-100 flex-wrap">
          {(
            [
              { id: 'all', label: isRtl ? 'جميع الفيديوهات' : 'All Lectures' },
              { id: 'in_progress', label: isRtl ? 'قيد المشاهدة' : 'In Progress' },
              { id: 'completed', label: isRtl ? 'المكتملة' : 'Completed' },
              { id: 'unwatched', label: isRtl ? 'غير المشاهدة' : 'Unwatched' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setProgressTab(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                progressTab === tab.id
                  ? 'bg-[#356AE6] text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Videos Grid */}
      {loading ? (
        <div className="p-12 text-center text-xs text-slate-400 bg-white rounded-2xl border border-slate-200">
          {isRtl ? 'جاري تحميل مكتبة الفيديوهات...' : 'Loading video library...'}
        </div>
      ) : videos.length === 0 ? (
        <div className="p-12 text-center text-slate-500 bg-white rounded-2xl border border-slate-200 space-y-3">
          <Video className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-sm font-bold text-slate-800">
            {isRtl ? 'لا توجد محاضرات مطابقة' : 'No matching lectures found'}
          </h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {isRtl
              ? 'تأكد من اختيار المنهج الدراسي الصحيح أو إزالة معايير البحث.'
              : 'Try clearing your filters or selecting a different enrolled course.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {videos.map((vid) => {
            const pos = vid.progress?.lastPositionSeconds || 0;
            const dur = vid.durationSeconds || 300;
            const pct = calculateProgressPercentage(pos, dur);
            const isCompleted = Boolean(vid.progress?.isCompleted);

            return (
              <div
                key={vid.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-xs hover:border-[#356AE6]/40 hover:shadow-md transition-all overflow-hidden flex flex-col"
              >
                {/* Thumbnail / Video Banner */}
                <div
                  onClick={() => setSelectedVideo(vid)}
                  className="relative aspect-video bg-slate-900 overflow-hidden cursor-pointer group"
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full bg-[#356AE6] text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                      <Play className="w-5 h-5 fill-white ml-0.5" />
                    </div>
                  </div>

                  {/* Duration Overlay */}
                  <div className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-xs text-[10px] font-bold text-white flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-300" />
                    <span>{formatDuration(vid.durationSeconds)}</span>
                  </div>

                  {/* Completion Ribbon */}
                  {isCompleted && (
                    <div className="absolute top-2.5 right-2.5 px-2.5 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center gap-1 shadow-xs">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>{isRtl ? 'مكتمل' : 'Completed'}</span>
                    </div>
                  )}

                  {/* Provider Tag */}
                  <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-black/70 text-slate-300 text-[10px] font-semibold flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-emerald-400" />
                    <span className="capitalize">{vid.videoSource}</span>
                  </div>
                </div>

                {/* Card Content */}
                <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                  <div className="space-y-1.5">
                    {/* Course & Unit Badges */}
                    <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-[#356AE6] font-semibold">
                      <span className="truncate max-w-[200px]">
                        {isRtl ? (vid.courseTitleArabic || vid.courseTitle) : vid.courseTitle}
                      </span>
                      {vid.unitTitle && (
                        <span className="text-slate-400">• {vid.unitTitle}</span>
                      )}
                    </div>

                    <h3
                      onClick={() => setSelectedVideo(vid)}
                      className="text-sm font-bold text-slate-900 hover:text-[#356AE6] transition-colors cursor-pointer line-clamp-1"
                    >
                      {isRtl ? (vid.titleArabic || vid.title) : vid.title}
                    </h3>

                    {(vid.description || vid.descriptionArabic) && (
                      <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                        {isRtl
                          ? (vid.descriptionArabic || vid.description)
                          : (vid.description || vid.descriptionArabic)}
                      </p>
                    )}
                  </div>

                  {/* Progress Indicator */}
                  <div className="space-y-1 pt-2 border-t border-slate-100">
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>{pct}% {isRtl ? 'المشاهدة' : 'watched'}</span>
                      {pos > 0 && (
                        <span>
                          {isRtl ? 'توقفت عند' : 'At'} {formatDuration(pos)}
                        </span>
                      )}
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          isCompleted ? 'bg-emerald-500' : 'bg-[#356AE6]'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  {/* Card Bottom Actions */}
                  <div className="pt-2 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedVideo(vid)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#356AE6] hover:bg-[#2855BE] text-white text-xs font-bold transition-colors cursor-pointer shadow-xs"
                    >
                      <Play className="w-3.5 h-3.5 fill-white" />
                      <span>
                        {pos > 0 && !isCompleted
                          ? (isRtl ? 'استئناف' : 'Resume')
                          : (isRtl ? 'مشاهدة' : 'Watch')}
                      </span>
                    </button>

                    {vid.lessonId && onNavigateToLesson && (
                      <button
                        type="button"
                        onClick={() => onNavigateToLesson(vid.lessonId!)}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-[#356AE6] transition-colors cursor-pointer"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>{isRtl ? 'الدرس الكامل' : 'Full Lesson'}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Video Playback Modal */}
      {selectedVideo && (
        <VideoPlayerModal
          video={selectedVideo}
          isOpen={Boolean(selectedVideo)}
          onClose={() => setSelectedVideo(null)}
          onNavigateToLesson={onNavigateToLesson}
          onProgressUpdated={handleProgressUpdated}
          isStudent={true}
        />
      )}
    </div>
  );
};
