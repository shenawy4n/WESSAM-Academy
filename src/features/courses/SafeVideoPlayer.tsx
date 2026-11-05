/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useLocale } from '../../hooks/useLocale';
import { parseVideoUrl } from './videoUtils';
import { PlayCircle, ExternalLink, VideoOff, ShieldCheck } from 'lucide-react';

interface SafeVideoPlayerProps {
  videoUrl?: string | null;
  title?: string;
  className?: string;
}

export const SafeVideoPlayer: React.FC<SafeVideoPlayerProps> = ({
  videoUrl,
  title = 'Lesson Video',
  className = '',
}) => {
  const { t, isRtl } = useLocale();
  const parsed = parseVideoUrl(videoUrl);

  if (!videoUrl || parsed.provider === 'none') {
    return (
      <div className={`w-full aspect-video bg-slate-900 rounded-xl flex flex-col items-center justify-center p-6 text-center text-slate-400 border border-slate-800 ${className}`}>
        <VideoOff className="w-12 h-12 text-slate-500 mb-3" />
        <p className="text-sm font-medium text-slate-300">
          {isRtl ? 'لا يوجد فيديو مسجل لهذا الدرس بعد' : 'No recorded video lecture available for this lesson'}
        </p>
        <span className="text-xs text-slate-500 mt-1">
          {isRtl ? 'يمكنك مراجعة المذكرات والملفات المرفقة بالأسفل' : 'You can review attached worksheets and study guides below'}
        </span>
      </div>
    );
  }

  // Safe YouTube or Vimeo Embed
  if (parsed.embedUrl) {
    return (
      <div className={`relative w-full aspect-video bg-black rounded-xl overflow-hidden shadow-lg border border-slate-800 ${className}`}>
        <iframe
          src={parsed.embedUrl}
          title={title}
          className="w-full h-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          sandbox="allow-scripts allow-same-origin allow-presentation"
          loading="lazy"
        />
        <div className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-950/70 backdrop-blur-xs text-[10px] text-emerald-400 font-medium pointer-events-none">
          <ShieldCheck className="w-3 h-3 text-emerald-400" />
          <span>{parsed.provider === 'youtube' ? 'YouTube' : 'Vimeo'}</span>
        </div>
      </div>
    );
  }

  // Safe External HTTPS Link fallback
  return (
    <div className={`w-full aspect-video bg-gradient-to-br from-slate-900 to-[#14243A] rounded-xl flex flex-col items-center justify-center p-6 text-center text-slate-300 border border-slate-800 ${className}`}>
      <PlayCircle className="w-14 h-14 text-[#356AE6] mb-3" />
      <h4 className="text-base font-semibold text-white mb-1">
        {isRtl ? 'مشاهدة المحتوى التعليمي الخارجي' : 'Watch External Educational Lecture'}
      </h4>
      <p className="text-xs text-slate-400 max-w-md mb-4">
        {isRtl
          ? 'يتوفر رابط المحاضرة التعليمية عبر منصة خارجية موثوقة. انقر على الزر بالأسفل لفتح الرابط بشكل آمن.'
          : 'This lecture is hosted on an external platform. Click the button below to view in a secure browser tab.'}
      </p>
      {parsed.directUrl && (
        <a
          href={parsed.directUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#356AE6] hover:bg-[#2855BE] text-white text-xs font-semibold shadow-xs transition-colors"
        >
          <span>{t.courses.openInNewTab}</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
    </div>
  );
};
