/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useLocale } from '../../hooks/useLocale';
import { VideoAssetRecord, VideoSource, VideoStatus } from './types';
import { validateVideoInputs, detectVideoProvider, formatDuration } from './videoLibraryUtils';
import { parseVideoUrl } from '../courses/videoUtils';
import { createVideoAsset, updateVideoAsset } from './videoLibraryService';
import { SafeVideoPlayer } from '../courses/SafeVideoPlayer';
import {
  X,
  Video,
  Play,
  Save,
  ShieldCheck,
  Eye,
  AlertCircle,
  Clock,
  Layers,
  BookOpen,
  Users,
} from 'lucide-react';

interface OptionItem {
  id: string;
  name: string;
  nameArabic?: string | null;
}

interface VideoModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoToEdit?: VideoAssetRecord | null;
  courses: OptionItem[];
  groups?: OptionItem[];
  onSaved: () => void;
}

export const VideoModal: React.FC<VideoModalProps> = ({
  isOpen,
  onClose,
  videoToEdit,
  courses,
  groups = [],
  onSaved,
}) => {
  const { t, isRtl } = useLocale();

  const [title, setTitle] = useState('');
  const [titleArabic, setTitleArabic] = useState('');
  const [description, setDescription] = useState('');
  const [descriptionArabic, setDescriptionArabic] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [durationMinutes, setDurationMinutes] = useState<number>(15);
  const [durationSeconds, setDurationSeconds] = useState<number>(0);
  const [courseId, setCourseId] = useState<string>('');
  const [groupId, setGroupId] = useState<string>('');
  const [status, setStatus] = useState<VideoStatus>('draft');
  const [showPreview, setShowPreview] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (videoToEdit) {
      setTitle(videoToEdit.title || '');
      setTitleArabic(videoToEdit.titleArabic || '');
      setDescription(videoToEdit.description || '');
      setDescriptionArabic(videoToEdit.descriptionArabic || '');
      setVideoUrl(videoToEdit.videoUrl || '');
      const totalSec = videoToEdit.durationSeconds || 0;
      setDurationMinutes(Math.floor(totalSec / 60));
      setDurationSeconds(totalSec % 60);
      setCourseId(videoToEdit.courseId || '');
      setGroupId(videoToEdit.groupId || '');
      setStatus(videoToEdit.status || 'draft');
      setShowPreview(false);
      setErrors({});
    } else {
      setTitle('');
      setTitleArabic('');
      setDescription('');
      setDescriptionArabic('');
      setVideoUrl('');
      setDurationMinutes(15);
      setDurationSeconds(0);
      setCourseId(courses[0]?.id || '');
      setGroupId('');
      setStatus('draft');
      setShowPreview(false);
      setErrors({});
    }
  }, [videoToEdit, isOpen, courses]);

  if (!isOpen) return null;

  const detectedProvider = detectVideoProvider(videoUrl);
  const parsed = parseVideoUrl(videoUrl);
  const totalDuration = durationMinutes * 60 + durationSeconds;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validation = validateVideoInputs({
      title,
      titleArabic,
      videoUrl,
      durationSeconds: totalDuration,
    });

    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    try {
      setIsSubmitting(true);
      setErrors({});

      const payload: Partial<VideoAssetRecord> = {
        title: title.trim(),
        titleArabic: titleArabic.trim(),
        description: description.trim() || null,
        descriptionArabic: descriptionArabic.trim() || null,
        videoUrl: videoUrl.trim() || null,
        videoSource: detectedProvider,
        durationSeconds: totalDuration,
        courseId: courseId || null,
        groupId: groupId || null,
        status,
      };

      if (videoToEdit) {
        await updateVideoAsset(videoToEdit.id, payload);
      } else {
        await createVideoAsset(payload);
      }

      onSaved();
      onClose();
    } catch (err: any) {
      setErrors({ form: err.message || 'Failed to save video' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#356AE6]/10 flex items-center justify-center text-[#356AE6]">
              <Video className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                {videoToEdit
                  ? (isRtl ? 'تعديل بيانات المحاضرة' : 'Edit Video Lecture')
                  : (isRtl ? 'إضافة فيديو جديد للمكتبة' : 'Add Video to Library')}
              </h2>
              <p className="text-xs text-slate-500">
                {isRtl ? 'إدارة ونشر المحتوى المرئي المسجل لطلاب أكاديمية الوسام' : 'Manage and publish recorded lectures for students'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {errors.form && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errors.form}</span>
            </div>
          )}

          {/* Titles Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isRtl ? 'عنوان الفيديو بالإنجليزية *' : 'Video Title (English) *'}
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. IELTS Speaking Part 1 Mastery"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#356AE6]/20 focus:border-[#356AE6]"
                dir="ltr"
              />
              {errors.title && <p className="text-[11px] text-rose-600 mt-1">{errors.title}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isRtl ? 'عنوان الفيديو بالعربية *' : 'Video Title (Arabic) *'}
              </label>
              <input
                type="text"
                value={titleArabic}
                onChange={(e) => setTitleArabic(e.target.value)}
                placeholder="مثال: إتقان محادثة الآيلتس الجزء الأول"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#356AE6]/20 focus:border-[#356AE6]"
                dir="rtl"
              />
              {errors.titleArabic && <p className="text-[11px] text-rose-600 mt-1">{errors.titleArabic}</p>}
            </div>
          </div>

          {/* Descriptions Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isRtl ? 'الوصف التعليمي (إنجليزي)' : 'Description (English)'}
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Key concepts, speaking prompts, and tips..."
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#356AE6]/20 focus:border-[#356AE6]"
                dir="ltr"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isRtl ? 'الوصف التعليمي (عربي)' : 'Description (Arabic)'}
              </label>
              <textarea
                value={descriptionArabic}
                onChange={(e) => setDescriptionArabic(e.target.value)}
                rows={2}
                placeholder="المحاور الرئيسية والتدريبات ونقاط التركيز..."
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#356AE6]/20 focus:border-[#356AE6]"
                dir="rtl"
              />
            </div>
          </div>

          {/* Video URL with Provider Tag & Preview Toggle */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700">
                {isRtl ? 'رابط الفيديو (YouTube أو Vimeo) *' : 'Video URL (YouTube or Vimeo) *'}
              </label>
              {videoUrl && parsed.isSafe && (
                <button
                  type="button"
                  onClick={() => setShowPreview(!showPreview)}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#356AE6] hover:underline cursor-pointer"
                >
                  <Eye className="w-3 h-3" />
                  <span>{showPreview ? (isRtl ? 'إخفاء المعاينة' : 'Hide Preview') : (isRtl ? 'معاينة الفيديو' : 'Preview Video')}</span>
                </button>
              )}
            </div>
            <div className="relative">
              <input
                type="url"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=... or https://vimeo.com/..."
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#356AE6]/20 focus:border-[#356AE6]"
                dir="ltr"
              />
              {parsed.isSafe && (
                <div className="absolute right-2 top-2 flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-semibold border border-emerald-200">
                  <ShieldCheck className="w-3 h-3" />
                  <span className="capitalize">{parsed.provider}</span>
                </div>
              )}
            </div>
            {errors.videoUrl && <p className="text-[11px] text-rose-600 mt-1">{errors.videoUrl}</p>}
            <p className="text-[10px] text-slate-400 mt-1">
              {isRtl
                ? 'يدعم روابط يوتيوب وفيميو المعتمدة لتضمينها بأمان للطلاب دون إعلانات أو روابط ضارة.'
                : 'Supports YouTube and Vimeo links for safe embedding without intrusive ads or external redirection.'}
            </p>
          </div>

          {/* Embedded Video Preview (if enabled) */}
          {showPreview && videoUrl && (
            <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 animate-fade-in">
              <div className="text-[10px] font-bold text-slate-400 mb-2 flex items-center justify-between">
                <span>{isRtl ? 'معاينة المشغل للطلاب' : 'Student Player Preview'}</span>
                <span>{formatDuration(totalDuration)}</span>
              </div>
              <SafeVideoPlayer videoUrl={videoUrl} title={title || 'Lecture Preview'} />
            </div>
          )}

          {/* Metadata Row: Course, Group Visibility, Duration & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
            {/* Course Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <BookOpen className="w-3 h-3 text-slate-400" />
                <span>{isRtl ? 'المنهج الدراسي' : 'Course'}</span>
              </label>
              <select
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#356AE6]/20 focus:border-[#356AE6]"
              >
                <option value="">{isRtl ? 'عام (بدون منهج)' : 'General (No Course)'}</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {isRtl ? (c.nameArabic || c.name) : c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Group Visibility */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <Users className="w-3 h-3 text-slate-400" />
                <span>{isRtl ? 'تخصيص لمجموعة محددة' : 'Group Access'}</span>
              </label>
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#356AE6]/20 focus:border-[#356AE6]"
              >
                <option value="">{isRtl ? 'جميع الطلاب الملتحقين' : 'All Enrolled Students'}</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {isRtl ? (g.nameArabic || g.name) : g.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Duration */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <Clock className="w-3 h-3 text-slate-400" />
                <span>{isRtl ? 'مدة الفيديو' : 'Duration'}</span>
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="number"
                  min="0"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                  placeholder="Min"
                  className="px-2.5 py-2 text-xs rounded-xl border border-slate-300 text-center"
                />
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={durationSeconds}
                  onChange={(e) => setDurationSeconds(Math.max(0, parseInt(e.target.value) || 0))}
                  placeholder="Sec"
                  className="px-2.5 py-2 text-xs rounded-xl border border-slate-300 text-center"
                />
              </div>
            </div>
          </div>

          {/* Publishing Status Toggle */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
            <div>
              <span className="block text-xs font-bold text-slate-900">
                {isRtl ? 'حالة النشر الأكاديمي' : 'Publication Status'}
              </span>
              <span className="text-[11px] text-slate-500">
                {status === 'published'
                  ? (isRtl ? 'الفيديو منشور وسيظهر فوراً للطلاب المصرح لهم' : 'Video is published and visible to assigned students')
                  : (isRtl ? 'الفيديو كمسودة ولن يظهر للطلاب حتى تقوم بنشره' : 'Draft video hidden from students until published')}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStatus('draft')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  status === 'draft'
                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                    : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                {isRtl ? 'مسودة' : 'Draft'}
              </button>
              <button
                type="button"
                onClick={() => setStatus('published')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  status === 'published'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                {isRtl ? 'منشور' : 'Published'}
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              {isRtl ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold text-white bg-[#356AE6] hover:bg-[#2855BE] shadow-xs transition-colors cursor-pointer disabled:opacity-60"
            >
              <Save className="w-4 h-4" />
              <span>{isSubmitting ? (isRtl ? 'جاري الحفظ...' : 'Saving...') : (isRtl ? 'حفظ الفيديو' : 'Save Video')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
