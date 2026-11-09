/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type VideoSource = 'youtube' | 'vimeo' | 'storage' | 'mux' | 'custom';
export type VideoStatus = 'draft' | 'published' | 'archived';
export type ResourceType = 'pdf' | 'worksheet' | 'image' | 'document' | 'slides' | 'link' | 'other';

export interface VideoProgressRecord {
  id: string;
  studentId: string;
  videoId: string;
  lastPositionSeconds: number;
  maxPositionSeconds: number;
  durationSeconds: number;
  isCompleted: boolean;
  completedAt?: string | null;
  lastWatchedAt: string;
}

export interface VideoAssetRecord {
  id: string;
  title: string;
  titleArabic?: string | null;
  description?: string | null;
  descriptionArabic?: string | null;
  videoUrl?: string | null;
  storagePath?: string | null;
  videoSource: VideoSource;
  thumbnailUrl?: string | null;
  courseId?: string | null;
  unitId?: string | null;
  lessonId?: string | null;
  groupId?: string | null;
  durationSeconds: number;
  orderIndex: number;
  status: VideoStatus;
  publishedAt?: string | null;
  archivedAt?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;

  // Joined metadata for UI display
  courseTitle?: string | null;
  courseTitleArabic?: string | null;
  unitTitle?: string | null;
  unitTitleArabic?: string | null;
  lessonTitle?: string | null;
  lessonTitleArabic?: string | null;
  groupName?: string | null;
  groupNameArabic?: string | null;

  // Student specific progress
  progress?: VideoProgressRecord | null;
}

export interface LearningResourceRecord {
  id: string;
  lessonId: string;
  courseId?: string | null;
  title: string;
  titleArabic?: string | null;
  description?: string | null;
  descriptionArabic?: string | null;
  fileUrl: string;
  storagePath?: string | null;
  fileType?: string | null;
  fileSizeBytes?: number | null;
  resourceType: ResourceType;
  isPublished: boolean;
  orderIndex: number;
  createdAt: string;
  updatedAt?: string;
}

export interface VideoStatsRecord {
  videoId: string;
  totalViews: number;
  completedCount: number;
  completionRate: number;
  avgWatchedSeconds: number;
  assignedStudentsCount: number;
}

export interface VideoFilter {
  searchQuery?: string;
  courseId?: string;
  unitId?: string;
  groupId?: string;
  status?: VideoStatus | 'all';
  provider?: VideoSource | 'all';
  progressState?: 'all' | 'in_progress' | 'completed' | 'unwatched';
}
