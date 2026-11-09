/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { parseVideoUrl } from '../courses/videoUtils';
import {
  VideoAssetRecord,
  VideoFilter,
  VideoSource,
  VideoStatus,
  ResourceType,
} from './types';

export const COMPLETION_THRESHOLD_RATIO = 0.85; // 85% completion requirement

/**
 * Validates whether video watch position qualifies for completion.
 * Fails if duration is 0 or position is merely an initial opening (< 85%).
 */
export function isCompletionEligible(
  maxPositionSeconds: number,
  durationSeconds: number
): boolean {
  if (!durationSeconds || durationSeconds <= 0) {
    return false;
  }
  const pos = Math.max(0, maxPositionSeconds);
  if (pos >= durationSeconds * COMPLETION_THRESHOLD_RATIO) {
    return true;
  }
  // For videos longer than 10 seconds, within 5 seconds of the end also counts
  if (durationSeconds >= 10 && pos >= durationSeconds - 5) {
    return true;
  }
  return false;
}

/**
 * Calculates watched percentage (0 - 100)
 */
export function calculateProgressPercentage(
  positionSeconds: number,
  durationSeconds: number
): number {
  if (!durationSeconds || durationSeconds <= 0) return 0;
  const pct = (Math.max(0, positionSeconds) / durationSeconds) * 100;
  return Math.min(100, Math.round(pct));
}

/**
 * Formats duration in seconds to MM:SS or HH:MM:SS
 */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0 || isNaN(seconds)) {
    return '00:00';
  }
  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hrs > 0) {
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Detects provider from URL using safe validation
 */
export function detectVideoProvider(url?: string | null): VideoSource {
  if (!url) return 'youtube';
  const parsed = parseVideoUrl(url);
  if (parsed.provider === 'youtube') return 'youtube';
  if (parsed.provider === 'vimeo') return 'vimeo';
  return 'custom';
}

/**
 * Validates video form inputs
 */
export function validateVideoInputs(params: {
  title: string;
  titleArabic?: string;
  videoUrl?: string;
  videoSource?: VideoSource;
  durationSeconds?: number;
}): { isValid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  if (!params.title || !params.title.trim()) {
    errors.title = 'English title is required';
  }

  if (!params.titleArabic || !params.titleArabic.trim()) {
    errors.titleArabic = 'Arabic title is required';
  }

  if (params.videoUrl) {
    const parsed = parseVideoUrl(params.videoUrl);
    // Only approved providers (YouTube or Vimeo) or storage assets are allowed for video library
    if (!parsed.isSafe || (parsed.provider !== 'youtube' && parsed.provider !== 'vimeo')) {
      errors.videoUrl = 'Please provide a valid, secure HTTPS YouTube or Vimeo URL';
    }
  }

  if (params.durationSeconds !== undefined && params.durationSeconds < 0) {
    errors.durationSeconds = 'Duration cannot be negative';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validates resource type and allowed file extensions
 */
export const ALLOWED_RESOURCE_EXTENSIONS: Record<ResourceType, string[]> = {
  pdf: ['pdf'],
  worksheet: ['pdf', 'docx', 'doc'],
  image: ['jpg', 'jpeg', 'png', 'webp'],
  document: ['pdf', 'docx', 'doc', 'txt'],
  slides: ['pptx', 'ppt', 'pdf'],
  link: [],
  other: ['zip', 'rar', 'pdf', 'docx'],
};

export function validateResourceType(type: string, fileExt?: string): boolean {
  const validTypes = new Set(['pdf', 'worksheet', 'image', 'document', 'slides', 'link', 'other']);
  if (!validTypes.has(type)) {
    return false;
  }
  if (!fileExt || type === 'link' || type === 'other') {
    return true;
  }
  const ext = fileExt.toLowerCase().replace(/^\./, '');
  const allowed = ALLOWED_RESOURCE_EXTENSIONS[type as ResourceType];
  return allowed ? allowed.includes(ext) : true;
}

export function getResourceTypeLabel(type: ResourceType, isRtl: boolean): string {
  switch (type) {
    case 'pdf':
      return isRtl ? 'ملف PDF' : 'PDF Document';
    case 'worksheet':
      return isRtl ? 'ورقة عمل وتدريب' : 'Study Worksheet';
    case 'image':
      return isRtl ? 'مخطط بياني / صورة' : 'Infographic / Image';
    case 'document':
      return isRtl ? 'مستند دراسي' : 'Study Document';
    case 'slides':
      return isRtl ? 'عرض تقديمي (شرائح)' : 'Slide Presentation';
    case 'link':
      return isRtl ? 'رابط خارجي معتمد' : 'External Link';
    case 'other':
    default:
      return isRtl ? 'مرفق تعليمي' : 'Learning Asset';
  }
}

/**
 * State machine check for video status transitions
 */
export function canTransitionStatus(from: VideoStatus, to: VideoStatus): boolean {
  if (from === to) return true;
  if (from === 'draft' && (to === 'published' || to === 'archived')) return true;
  if (from === 'published' && (to === 'draft' || to === 'archived')) return true;
  if (from === 'archived' && (to === 'draft' || to === 'published')) return true;
  return false;
}

/**
 * Pure filter for video collection
 */
export function filterVideos(
  videos: VideoAssetRecord[],
  filter: VideoFilter
): VideoAssetRecord[] {
  return videos.filter((video) => {
    // Search query matching English and Arabic titles and descriptions
    if (filter.searchQuery && filter.searchQuery.trim()) {
      const q = filter.searchQuery.trim().toLowerCase();
      const matchTitleEn = video.title.toLowerCase().includes(q);
      const matchTitleAr = (video.titleArabic || '').toLowerCase().includes(q);
      const matchDescEn = (video.description || '').toLowerCase().includes(q);
      const matchDescAr = (video.descriptionArabic || '').toLowerCase().includes(q);
      if (!matchTitleEn && !matchTitleAr && !matchDescEn && !matchDescAr) {
        return false;
      }
    }

    // Status filter
    if (filter.status && filter.status !== 'all') {
      if (video.status !== filter.status) {
        return false;
      }
    }

    // Provider filter
    if (filter.provider && filter.provider !== 'all') {
      if (video.videoSource !== filter.provider) {
        return false;
      }
    }

    // Course filter
    if (filter.courseId) {
      if (video.courseId !== filter.courseId) {
        return false;
      }
    }

    // Unit filter
    if (filter.unitId) {
      if (video.unitId !== filter.unitId) {
        return false;
      }
    }

    // Group filter
    if (filter.groupId) {
      if (video.groupId && video.groupId !== filter.groupId) {
        return false;
      }
    }

    // Student progress state filter
    if (filter.progressState && filter.progressState !== 'all') {
      const isCompleted = Boolean(video.progress?.isCompleted);
      const hasWatched = Boolean((video.progress?.lastPositionSeconds || 0) > 0);

      if (filter.progressState === 'completed' && !isCompleted) {
        return false;
      }
      if (filter.progressState === 'in_progress' && (!hasWatched || isCompleted)) {
        return false;
      }
      if (filter.progressState === 'unwatched' && hasWatched) {
        return false;
      }
    }

    return true;
  });
}
