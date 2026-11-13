/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useLocale } from '../../hooks/useLocale';
import { VideoAssetRecord, VideoFilter, VideoStatus, VideoSource } from './types';
import {
  fetchTeacherVideos,
  publishVideo,
  unpublishVideo,
  archiveVideo,
  reorderVideos,
} from './videoLibraryService';
import { formatDuration } from './videoLibraryUtils';
import { VideoModal } from './VideoModal';
import { VideoPlayerModal } from './VideoPlayerModal';
import { VideoStatsModal } from './VideoStatsModal';
import { ResourceManagementModal } from './ResourceManagementModal';
import { fetchTeacherCourses } from '../courses/coursesService';
import { ErrorState } from '../../components/ui/ErrorState';
import {
  Video,
  Plus,
  Search,
  Filter,
  Play,
  BarChart3,
  Edit2,
  Archive,
  Eye,
  EyeOff,
  Clock,
  BookOpen,
  Users,
  ShieldCheck,
  ChevronUp,
  ChevronDown,
  Layers,
  Sparkles,
  Paperclip,
  CheckCircle2,
  FolderGit2,
} from 'lucide-react';

export const TeacherVideoLibraryView: React.FC = () => {
  const { t, isRtl } = useLocale();

  const [videos, setVideos] = useState<VideoAssetRecord[]>([]);
  const [courses, setCourses] = useState<{ id: string; name: string; nameArabic?: string }[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<VideoStatus | 'all'>('all');
  const [courseFilter, setCourseFilter] = useState<string>('');
  const [providerFilter, setProviderFilter] = useState<VideoSource | 'all'>('all');

  // Modals
  const [videoModalOpen, setVideoModalOpen] = useState<boolean>(false);
  const [editingVideo, setEditingVideo] = useState<VideoAssetRecord | null>(null);
  const [previewVideo, setPreviewVideo] = useState<VideoAssetRecord | null>(null);
  const [statsVideo, setStatsVideo] = useState<VideoAssetRecord | null>(null);
  const [resourceModalData, setResourceModalData] = useState<{
    courseId: string;
    lessonId: string;
    lessonTitle: string;
  } | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const [vids, crs] = await Promise.all([
        fetchTeacherVideos({
          searchQuery,
          status: statusFilter,
          courseId: courseFilter || undefined,
          provider: providerFilter,
        }),
        fetchTeacherCourses(),
      ]);
      setVideos(vids);
      setCourses(
        crs.map((c) => ({
          id: c.id,
          name: c.title,
          nameArabic: c.titleArabic,
        }))
      );
    } catch (err: unknown) {
      setLoadError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [searchQuery, statusFilter, courseFilter, providerFilter]);

  const handleTogglePublish = async (vid: VideoAssetRecord) => {
    try {
      setActionError(null);
      if (vid.status === 'published') {
        await unpublishVideo(vid.id);
      } else {
        await publishVideo(vid.id);
      }
      await loadData();
    } catch (err: unknown) {
      setActionError(err);
    }
  };

  const handleArchive = async (vid: VideoAssetRecord) => {
    if (
      !confirm(
        isRtl
          ? 'هل أنت متأكد من أرشفة هذا الفيديو؟ سيتم إخفاؤه من الطلاب دون حذفه نهائياً.'
          : 'Are you sure you want to archive this video? It will be hidden from students without deletion.'
      )
    ) {
      return;
    }
    try {
      setActionError(null);
      await archiveVideo(vid.id);
      await loadData();
    } catch (err: unknown) {
      setActionError(err);
    }
  };

  const handleMoveOrder = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= videos.length) return;

    const previousVideos = videos;
    const reordered = [...videos];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);
    setVideos(reordered);

    const activeCourseId = moved.courseId || courseFilter;
    if (activeCourseId) {
      try {
        setActionError(null);
        await reorderVideos(activeCourseId, reordered.map((v) => v.id));
      } catch (err: unknown) {
        setVideos(previousVideos);
        setActionError(err);
      }
    }
  };

  // Metrics summary
  const totalCount = videos.length;
  const publishedCount = videos.filter((v) => v.status === 'published').length;
  const draftCount = videos.filter((v) => v.status === 'draft').length;
  const totalDurationMinutes = Math.round(
    videos.reduce((acc, v) => acc + (v.durationSeconds || 0), 0) / 60
  );

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Video className="w-5 h-5 text-[#356AE6]" />
            <span>{isRtl ? 'مكتبة الفيديوهات والمحاضرات المسجلة' : 'Video Library & Recorded Lectures'}</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {isRtl
              ? 'إدارة ونشر المحاضرات المرئية المعتمدة، تتبع إكمال الطلاب، وربط المذكرات التعليمية.'
              : 'Publish verified video lectures, monitor student completion metrics, and attach study resources.'}
          </p>
        </div>

        <button
          onClick={() => {
            setEditingVideo(null);
            setVideoModalOpen(true);
          }}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#356AE6] hover:bg-[#2855BE] text-white text-xs font-bold shadow-xs cursor-pointer transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>{isRtl ? 'إضافة فيديو جديد' : 'Add New Video'}</span>
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
          <span className="text-xs text-slate-500 font-medium block">
            {isRtl ? 'إجمالي الفيديوهات' : 'Total Videos'}
          </span>
          <div className="text-2xl font-bold text-slate-900">{totalCount}</div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
          <span className="text-xs text-emerald-600 font-medium block">
            {isRtl ? 'فيديوهات منشورة' : 'Published Lectures'}
          </span>
          <div className="text-2xl font-bold text-emerald-700">{publishedCount}</div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
          <span className="text-xs text-amber-600 font-medium block">
            {isRtl ? 'مسودات قيد الإعداد' : 'Drafts'}
          </span>
          <div className="text-2xl font-bold text-amber-700">{draftCount}</div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
          <span className="text-xs text-blue-600 font-medium block">
            {isRtl ? 'إجمالي وقت المشاهدة' : 'Total Library Time'}
          </span>
          <div className="text-2xl font-bold text-blue-700">
            {totalDurationMinutes} {isRtl ? 'دقيقة' : 'min'}
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {/* Search */}
          <div className="sm:col-span-2 relative">
            <Search className="w-4 h-4 absolute top-2.5 right-3 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isRtl ? 'بحث بالعنوان أو الوصف (عربي / English)...' : 'Search by title or description...'}
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
              <option value="">{isRtl ? 'جميع المناهج' : 'All Courses'}</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {isRtl ? (c.nameArabic || c.name) : c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Provider Filter */}
          <div>
            <select
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value as any)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#356AE6]/20 focus:border-[#356AE6]"
            >
              <option value="all">{isRtl ? 'جميع المزودين' : 'All Providers'}</option>
              <option value="youtube">YouTube</option>
              <option value="vimeo">Vimeo</option>
              <option value="custom">Direct / Custom</option>
            </select>
          </div>
        </div>

        {/* Status Tabs */}
        <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
          <span className="text-xs font-semibold text-slate-500 mr-1">
            {isRtl ? 'الحالة:' : 'Status:'}
          </span>
          {(['all', 'published', 'draft', 'archived'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer capitalize ${
                statusFilter === s
                  ? 'bg-[#356AE6] text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {s === 'all'
                ? (isRtl ? 'الكل' : 'All')
                : s === 'published'
                ? (isRtl ? 'منشور' : 'Published')
                : s === 'draft'
                ? (isRtl ? 'مسودة' : 'Draft')
                : (isRtl ? 'مؤرشف' : 'Archived')}
            </button>
          ))}
        </div>
      </div>

      {/* Action Error Banner */}
      {Boolean(actionError) && (
        <ErrorState
          variant="banner"
          error={actionError}
          isRtl={isRtl}
          onDismiss={() => setActionError(null)}
        />
      )}

      {/* Videos List Container */}
      <div className="space-y-3">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400 bg-white rounded-2xl border border-slate-200">
            {isRtl ? 'جاري تحميل الفيديوهات...' : 'Loading video library...'}
          </div>
        ) : loadError ? (
          <ErrorState error={loadError} isRtl={isRtl} onRetry={loadData} />
        ) : videos.length === 0 ? (
          <div className="p-12 text-center text-slate-500 bg-white rounded-2xl border border-slate-200 space-y-3">
            <Video className="w-12 h-12 text-slate-300 mx-auto" />
            <h3 className="text-sm font-bold text-slate-800">
              {isRtl ? 'لم يتم العثور على فيديوهات' : 'No videos found'}
            </h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {isRtl
                ? 'ابدأ بإضافة أول محاضرة مرئية إلى مكتبتك التعليمية لتظهر للطلاب المصرح لهم.'
                : 'Get started by creating your first video lecture to share with authorized students.'}
            </p>
            <button
              onClick={() => {
                setEditingVideo(null);
                setVideoModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#356AE6] text-white text-xs font-bold"
            >
              <Plus className="w-4 h-4" />
              <span>{isRtl ? 'إضافة فيديو جديد' : 'Add New Video'}</span>
            </button>
          </div>
        ) : (
          videos.map((vid, index) => (
            <div
              key={vid.id}
              className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-xs hover:border-slate-300 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              {/* Left Details */}
              <div className="flex items-start gap-3.5 overflow-hidden">
                {/* Order Index & Reorder Controls */}
                <div className="flex flex-col items-center justify-center shrink-0 pr-1">
                  <button
                    type="button"
                    onClick={() => handleMoveOrder(index, 'up')}
                    disabled={index === 0}
                    className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20 cursor-pointer"
                    title="Move Up"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[11px] font-bold text-slate-500">#{vid.orderIndex}</span>
                  <button
                    type="button"
                    onClick={() => handleMoveOrder(index, 'down')}
                    disabled={index === videos.length - 1}
                    className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20 cursor-pointer"
                    title="Move Down"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Play Preview Icon */}
                <button
                  type="button"
                  onClick={() => setPreviewVideo(vid)}
                  className="w-12 h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0 relative group hover:bg-[#356AE6] transition-colors cursor-pointer shadow-xs"
                  title={isRtl ? 'معاينة وتشغيل' : 'Play Preview'}
                >
                  <Play className="w-5 h-5 fill-white" />
                  <span className="absolute bottom-0.5 right-1 text-[9px] text-slate-300 font-semibold group-hover:text-white">
                    {formatDuration(vid.durationSeconds)}
                  </span>
                </button>

                {/* Video Info */}
                <div className="space-y-1 truncate">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-bold text-slate-900 truncate">
                      {isRtl ? (vid.titleArabic || vid.title) : vid.title}
                    </h3>

                    {/* Status Badge */}
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                        vid.status === 'published'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : vid.status === 'draft'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-slate-100 text-slate-600 border-slate-300'
                      }`}
                    >
                      {vid.status === 'published'
                        ? (isRtl ? 'منشور' : 'Published')
                        : vid.status === 'draft'
                        ? (isRtl ? 'مسودة' : 'Draft')
                        : (isRtl ? 'مؤرشف' : 'Archived')}
                    </span>

                    {/* Provider Tag */}
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-semibold">
                      <ShieldCheck className="w-3 h-3 text-slate-400" />
                      <span className="capitalize">{vid.videoSource}</span>
                    </span>
                  </div>

                  {/* Subtitle / Arabic Alternate */}
                  <p className="text-xs text-slate-500 truncate">
                    {isRtl ? vid.title : (vid.titleArabic || '')}
                  </p>

                  {/* Course & Group Tags */}
                  <div className="flex items-center gap-3 text-xs text-slate-400 pt-1 flex-wrap">
                    {vid.courseTitle && (
                      <span className="inline-flex items-center gap-1 text-slate-600">
                        <BookOpen className="w-3 h-3 text-[#356AE6]" />
                        <span>{isRtl ? (vid.courseTitleArabic || vid.courseTitle) : vid.courseTitle}</span>
                      </span>
                    )}
                    {vid.groupName && (
                      <span className="inline-flex items-center gap-1 text-slate-600">
                        <Users className="w-3 h-3 text-amber-600" />
                        <span>{isRtl ? (vid.groupNameArabic || vid.groupName) : vid.groupName}</span>
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>{formatDuration(vid.durationSeconds)}</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1.5 shrink-0 self-end md:self-center">
                {/* Preview */}
                <button
                  type="button"
                  onClick={() => setPreviewVideo(vid)}
                  className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                  title={isRtl ? 'تشغيل ومعاينة' : 'Play / Preview'}
                >
                  <Play className="w-4 h-4" />
                </button>

                {/* Stats */}
                <button
                  type="button"
                  onClick={() => setStatsVideo(vid)}
                  className="p-2 rounded-xl text-slate-600 hover:text-[#356AE6] hover:bg-blue-50 transition-colors cursor-pointer"
                  title={isRtl ? 'تحليلات المشاهدة' : 'View Analytics'}
                >
                  <BarChart3 className="w-4 h-4" />
                </button>

                {/* Manage Resources (if linked to a lesson) */}
                {vid.lessonId && (
                  <button
                    type="button"
                    onClick={() =>
                      setResourceModalData({
                        courseId: vid.courseId || '',
                        lessonId: vid.lessonId!,
                        lessonTitle: isRtl ? (vid.lessonTitleArabic || vid.lessonTitle || vid.title) : (vid.lessonTitle || vid.title),
                      })
                    }
                    className="p-2 rounded-xl text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer"
                    title={isRtl ? 'المذكرات والموارد المرفقة' : 'Lesson Resources'}
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>
                )}

                {/* Edit */}
                <button
                  type="button"
                  onClick={() => {
                    setEditingVideo(vid);
                    setVideoModalOpen(true);
                  }}
                  className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                  title={isRtl ? 'تعديل البيانات' : 'Edit Video'}
                >
                  <Edit2 className="w-4 h-4" />
                </button>

                {/* Publish / Unpublish Toggle */}
                {vid.status !== 'archived' && (
                  <button
                    type="button"
                    onClick={() => handleTogglePublish(vid)}
                    className={`p-2 rounded-xl transition-colors cursor-pointer ${
                      vid.status === 'published'
                        ? 'text-emerald-700 hover:bg-emerald-50'
                        : 'text-amber-700 hover:bg-amber-50'
                    }`}
                    title={
                      vid.status === 'published'
                        ? (isRtl ? 'إلغاء النشر (تحويل لمسودة)' : 'Unpublish (Move to Draft)')
                        : (isRtl ? 'نشر للطلاب' : 'Publish to Students')
                    }
                  >
                    {vid.status === 'published' ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                )}

                {/* Archive */}
                {vid.status !== 'archived' && (
                  <button
                    type="button"
                    onClick={() => handleArchive(vid)}
                    className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                    title={isRtl ? 'أرشفة الفيديو' : 'Archive Video'}
                  >
                    <Archive className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modals */}
      {videoModalOpen && (
        <VideoModal
          isOpen={videoModalOpen}
          onClose={() => setVideoModalOpen(false)}
          videoToEdit={editingVideo}
          courses={courses}
          onSaved={loadData}
        />
      )}

      {previewVideo && (
        <VideoPlayerModal
          video={previewVideo}
          isOpen={Boolean(previewVideo)}
          onClose={() => setPreviewVideo(null)}
          isStudent={false}
        />
      )}

      {statsVideo && (
        <VideoStatsModal
          video={statsVideo}
          isOpen={Boolean(statsVideo)}
          onClose={() => setStatsVideo(null)}
        />
      )}

      {resourceModalData && (
        <ResourceManagementModal
          courseId={resourceModalData.courseId}
          lessonId={resourceModalData.lessonId}
          lessonTitle={resourceModalData.lessonTitle}
          isOpen={Boolean(resourceModalData)}
          onClose={() => setResourceModalData(null)}
        />
      )}
    </div>
  );
};
