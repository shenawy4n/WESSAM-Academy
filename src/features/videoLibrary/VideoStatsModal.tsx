/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useLocale } from '../../hooks/useLocale';
import { VideoAssetRecord, VideoStatsRecord } from './types';
import { getVideoStats } from './videoLibraryService';
import { formatDuration } from './videoLibraryUtils';
import {
  X,
  BarChart3,
  Users,
  CheckCircle2,
  Clock,
  Sparkles,
  TrendingUp,
} from 'lucide-react';

interface VideoStatsModalProps {
  video: VideoAssetRecord;
  isOpen: boolean;
  onClose: () => void;
}

export const VideoStatsModal: React.FC<VideoStatsModalProps> = ({
  video,
  isOpen,
  onClose,
}) => {
  const { t, isRtl } = useLocale();
  const [stats, setStats] = useState<VideoStatsRecord | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setError(null);
      getVideoStats(video.id)
        .then((s) => setStats(s))
        .catch((err) => setError(err.message || 'Failed to load video statistics'))
        .finally(() => setLoading(false));
    }
  }, [isOpen, video]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl border border-slate-200 overflow-hidden my-auto">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-[#356AE6]/10 flex items-center justify-center text-[#356AE6] shrink-0">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div className="truncate">
              <h2 className="text-sm font-bold text-slate-900 truncate">
                {isRtl ? 'إحصائيات تفاعل الطلاب والمشاهدة' : 'Video Engagement & Analytics'}
              </h2>
              <span className="text-xs text-slate-500 truncate block">
                {isRtl ? (video.titleArabic || video.title) : video.title}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6 space-y-5">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
              <div className="w-6 h-6 border-2 border-[#356AE6] border-t-transparent rounded-full animate-spin" />
              <span className="text-xs">{isRtl ? 'جاري تحليل بيانات المشاهدة...' : 'Analyzing viewer statistics...'}</span>
            </div>
          ) : error ? (
            <div className="p-4 bg-rose-50 text-rose-700 rounded-xl text-xs">
              {error}
            </div>
          ) : stats ? (
            <>
              {/* Metrics Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-blue-50/50 border border-blue-100 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-blue-700 font-semibold">
                    <Users className="w-3.5 h-3.5" />
                    <span>{isRtl ? 'إجمالي المشاهدات' : 'Total Views'}</span>
                  </div>
                  <div className="text-xl font-bold text-slate-900">{stats.totalViews}</div>
                  <span className="text-[10px] text-slate-500 block">
                    {stats.assignedStudentsCount} {isRtl ? 'طالب مخصص لهم الفيديو' : 'students assigned'}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-emerald-50/50 border border-emerald-100 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{isRtl ? 'الإكمال الكامل' : 'Completed (>=85%)'}</span>
                  </div>
                  <div className="text-xl font-bold text-emerald-700">{stats.completedCount}</div>
                  <span className="text-[10px] text-slate-500 block">
                    {stats.completionRate}% {isRtl ? 'نسبة الإكمال الأكاديمي' : 'completion rate'}
                  </span>
                </div>
              </div>

              {/* Progress Bar Display */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700">
                    {isRtl ? 'معدل إكمال المحاضرة' : 'Lecture Completion Rate'}
                  </span>
                  <span className="font-bold text-[#356AE6]">{stats.completionRate}%</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full transition-all duration-500"
                    style={{ width: `${stats.completionRate}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>
                      {isRtl ? 'متوسط وقت المشاهدة:' : 'Avg watched time:'} {formatDuration(stats.avgWatchedSeconds)}
                    </span>
                  </div>
                  <span>{formatDuration(video.durationSeconds)}</span>
                </div>
              </div>

              {/* Academic Notes */}
              <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/80 text-[11px] text-amber-800 space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  <span>{isRtl ? 'معيار التحقق من الإكمال' : 'Server Completion Verification'}</span>
                </div>
                <p className="leading-relaxed">
                  {isRtl
                    ? 'يتم احتساب الفيديو كمكتمل في سجل الطالب الأكاديمي فقط عندما يتجاوز 85% من مدة الفيديو، لمنع الإكمال الشكلي.'
                    : 'A lecture is counted as complete in the student record only when verified watch time exceeds 85%.'}
                </p>
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            {isRtl ? 'إغلاق' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
