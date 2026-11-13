/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { useLocale } from '../../hooks/useLocale';
import { VideoAssetRecord, LearningResourceRecord } from './types';
import { parseVideoUrl } from '../courses/videoUtils';
import {
  formatDuration,
  calculateProgressPercentage,
  isCompletionEligible,
  getResourceTypeLabel,
} from './videoLibraryUtils';
import {
  recordVideoPlaybackProgress,
  fetchLessonResources,
  getSecureResourceUrl,
} from './videoLibraryService';
import { ErrorState } from '../../components/ui/ErrorState';
import {
  X,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  Clock,
  BookOpen,
  Download,
  Paperclip,
  ExternalLink,
  ShieldCheck,
  VideoOff,
  Sparkles,
  ArrowRight,
} from 'lucide-react';

interface VideoPlayerModalProps {
  video: VideoAssetRecord;
  isOpen: boolean;
  onClose: () => void;
  onNavigateToLesson?: (lessonId: string) => void;
  onProgressUpdated?: (videoId: string, isCompleted: boolean) => void;
  isStudent?: boolean;
}

export const VideoPlayerModal: React.FC<VideoPlayerModalProps> = ({
  video,
  isOpen,
  onClose,
  onNavigateToLesson,
  onProgressUpdated,
  isStudent = false,
}) => {
  const { t, isRtl } = useLocale();

  const [currentTime, setCurrentTime] = useState<number>(
    video.progress?.lastPositionSeconds || 0
  );
  const [duration, setDuration] = useState<number>(video.durationSeconds || 300);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isCompleted, setIsCompleted] = useState<boolean>(
    Boolean(video.progress?.isCompleted)
  );
  const [justCompletedToast, setJustCompletedToast] = useState<boolean>(false);
  const [resources, setResources] = useState<LearningResourceRecord[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [hasResumed, setHasResumed] = useState<boolean>(false);
  const [modalError, setModalError] = useState<unknown>(null);

  const parsed = parseVideoUrl(video.videoUrl);
  const lastSyncRef = useRef<number>(Date.now());
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Load lesson resources if video is attached to a lesson
  useEffect(() => {
    if (isOpen && video.lessonId) {
      fetchLessonResources(video.lessonId, !isStudent)
        .then((res) => setResources(res))
        .catch((err) => setModalError(err));
    }
  }, [isOpen, video.lessonId, isStudent]);

  // Reset states on open
  useEffect(() => {
    if (isOpen) {
      const initialPos = video.progress?.lastPositionSeconds || 0;
      setCurrentTime(initialPos);
      setDuration(video.durationSeconds || 300);
      setIsCompleted(Boolean(video.progress?.isCompleted));
      setHasResumed(false);
      setIsPlaying(false);
      setModalError(null);
    }
  }, [isOpen, video]);

  // Sync progress to server (debounced/throttled)
  const syncProgressToServer = async (pos: number, dur: number, surfaceError = true) => {
    if (!isStudent) return;
    try {
      const updated = await recordVideoPlaybackProgress(video.id, pos, dur);
      if (updated.isCompleted && !isCompleted) {
        setIsCompleted(true);
        setJustCompletedToast(true);
        setTimeout(() => setJustCompletedToast(false), 4000);
        if (onProgressUpdated) onProgressUpdated(video.id, true);
      }
    } catch (err) {
      if (surfaceError) {
        setModalError(err);
      }
    }
  };

  // Simulated playback time advancement for external iframe players
  useEffect(() => {
    if (isPlaying) {
      timerRef.current = setInterval(() => {
        setCurrentTime((prev) => {
          const next = Math.min(prev + 1, duration);
          // Auto sync to server every 10 seconds or at end
          const now = Date.now();
          if (now - lastSyncRef.current >= 10000 || next >= duration) {
            lastSyncRef.current = now;
            syncProgressToServer(next, duration);
          }
          if (next >= duration) {
            setIsPlaying(false);
          }
          return next;
        });
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, duration]);

  // Sync on unmount or close
  const handleModalClose = () => {
    if (isStudent && currentTime > 0) {
      void syncProgressToServer(currentTime, duration, false);
    }
    setIsPlaying(false);
    onClose();
  };

  const handleDownloadResource = async (res: LearningResourceRecord) => {
    try {
      setDownloadingId(res.id);
      setModalError(null);
      const url = await getSecureResourceUrl(res.id);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err: unknown) {
      setModalError(err);
    } finally {
      setDownloadingId(null);
    }
  };

  if (!isOpen) return null;

  const progressPct = calculateProgressPercentage(currentTime, duration);
  const eligibleForCompletion = isCompletionEligible(currentTime, duration);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl border border-slate-200 overflow-hidden my-auto flex flex-col max-h-[92vh]">
        {/* Modal Top Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-[#356AE6]/10 flex items-center justify-center text-[#356AE6] shrink-0">
              <Play className="w-4 h-4 fill-[#356AE6]" />
            </div>
            <div className="truncate">
              <h2 className="text-sm font-bold text-slate-900 truncate">
                {isRtl ? (video.titleArabic || video.title) : video.title}
              </h2>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                {video.courseTitle && (
                  <span className="truncate">
                    {isRtl ? (video.courseTitleArabic || video.courseTitle) : video.courseTitle}
                  </span>
                )}
                {video.unitTitle && <span>• {video.unitTitle}</span>}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isCompleted && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{isRtl ? 'مكتمل' : 'Completed'}</span>
              </span>
            )}
            <button
              onClick={handleModalClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {Boolean(modalError) && (
            <ErrorState
              variant="banner"
              error={modalError}
              isRtl={isRtl}
              onDismiss={() => setModalError(null)}
            />
          )}

          {/* Completion Celebration Alert */}
          {justCompletedToast && (
            <div className="p-3.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl text-xs font-medium flex items-center justify-between shadow-md animate-fade-in">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-300" />
                <span>
                  {isRtl
                    ? 'تهانينا! لقد أكملت مشاهدة هذا الفيديو التعليمي بنجاح وتم تسجيل تقدمك.'
                    : 'Congratulations! You completed this lecture and your academic progress has been recorded.'}
                </span>
              </div>
              <CheckCircle2 className="w-4 h-4" />
            </div>
          )}

          {/* Video Player Display */}
          <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden shadow-lg border border-slate-900">
            {parsed.embedUrl ? (
              <iframe
                src={`${parsed.embedUrl}&autoplay=1`}
                title={video.title}
                className="w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                sandbox="allow-scripts allow-same-origin allow-presentation"
              />
            ) : video.videoUrl ? (
              <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-gradient-to-br from-slate-950 to-[#14243A] text-slate-300">
                <Play className="w-12 h-12 text-[#356AE6] mb-3" />
                <h4 className="text-sm font-bold text-white mb-1">
                  {isRtl ? 'تشغيل المحاضرة من الرابط المعتمد' : 'External Lecture Stream'}
                </h4>
                <p className="text-xs text-slate-400 max-w-sm mb-4">
                  {isRtl
                    ? 'انقر على الزر بالأسفل لفتح المحاضرة في نافذة آمنة جديدة.'
                    : 'Click below to watch the stream in a verified educational window.'}
                </p>
                <a
                  href={video.videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#356AE6] hover:bg-[#2855BE] text-white text-xs font-semibold"
                >
                  <span>{isRtl ? 'فتح المحاضرة' : 'Open Lecture'}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-slate-500">
                <VideoOff className="w-10 h-10 mb-2" />
                <span className="text-xs">{isRtl ? 'لا يوجد ملف فيديو متاح' : 'No video available'}</span>
              </div>
            )}

            {/* Provider Badge */}
            <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-950/80 backdrop-blur-xs text-[10px] text-emerald-400 font-semibold pointer-events-none">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              <span className="capitalize">{video.videoSource || 'Secure Stream'}</span>
            </div>
          </div>

          {/* Interactive Playback & Progress Bar */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#356AE6] hover:bg-[#2855BE] text-white font-semibold cursor-pointer shadow-xs transition-colors"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="w-3.5 h-3.5" />
                      <span>{isRtl ? 'إيقاف مؤقت' : 'Pause'}</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-white" />
                      <span>{isRtl ? 'متابعة المشاهدة' : 'Play & Track'}</span>
                    </>
                  )}
                </button>

                {video.progress?.lastPositionSeconds && !hasResumed && (
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentTime(video.progress!.lastPositionSeconds);
                      setHasResumed(true);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 font-medium cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3 text-slate-500" />
                    <span>
                      {isRtl ? 'استئناف من' : 'Resume from'} {formatDuration(video.progress.lastPositionSeconds)}
                    </span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3 text-slate-600 font-medium">
                <div className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>
                    {formatDuration(currentTime)} / {formatDuration(duration)}
                  </span>
                </div>
                <span className="text-slate-400">•</span>
                <span className="font-bold text-[#356AE6]">{progressPct}%</span>
              </div>
            </div>

            {/* Progress Slider / Bar */}
            <div className="space-y-1">
              <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden relative">
                <div
                  className={`h-full transition-all duration-300 ${
                    isCompleted ? 'bg-emerald-500' : 'bg-[#356AE6]'
                  }`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>{isRtl ? 'بداية المحاضرة' : 'Start'}</span>
                <span className="text-slate-500">
                  {isRtl ? 'متطلب الإكمال: 85% من المدة' : 'Completion threshold: 85%'}
                </span>
                <span>{formatDuration(duration)}</span>
              </div>
            </div>
          </div>

          {/* Video Description & Notes */}
          {(video.description || video.descriptionArabic) && (
            <div className="p-4 rounded-xl bg-white border border-slate-200">
              <h4 className="text-xs font-bold text-slate-800 mb-1">
                {isRtl ? 'عن المحاضرة والأهداف الدراسية' : 'Lecture Overview & Objectives'}
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">
                {isRtl ? (video.descriptionArabic || video.description) : (video.description || video.descriptionArabic)}
              </p>
            </div>
          )}

          {/* Associated Lesson Resources */}
          {resources.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Paperclip className="w-3.5 h-3.5 text-[#356AE6]" />
                <span>{isRtl ? 'المذكرات والملفات المرفقة بالدرس' : 'Attached Lesson Resources'}</span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {resources.map((res) => (
                  <button
                    key={res.id}
                    type="button"
                    onClick={() => handleDownloadResource(res)}
                    disabled={downloadingId === res.id}
                    className="p-3 rounded-xl border border-slate-200 bg-white hover:border-[#356AE6] hover:bg-blue-50/20 transition-all flex items-center justify-between gap-3 text-start cursor-pointer disabled:opacity-60"
                  >
                    <div className="overflow-hidden">
                      <span className="block text-xs font-semibold text-slate-900 truncate">
                        {isRtl ? (res.titleArabic || res.title) : res.title}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {getResourceTypeLabel(res.resourceType, isRtl)}
                      </span>
                    </div>
                    <Download className="w-4 h-4 text-[#356AE6] shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Bottom Actions */}
        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          {video.lessonId && onNavigateToLesson ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                onNavigateToLesson(video.lessonId!);
              }}
              className="inline-flex items-center gap-2 text-xs font-semibold text-[#356AE6] hover:text-[#2855BE] cursor-pointer"
            >
              <BookOpen className="w-4 h-4" />
              <span>{isRtl ? 'الانتقال إلى الدرس الكامل' : 'Open Full Lesson'}</span>
            </button>
          ) : (
            <div />
          )}

          <button
            type="button"
            onClick={handleModalClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            {isRtl ? 'إغلاق المشغل' : 'Close Player'}
          </button>
        </div>
      </div>
    </div>
  );
};
