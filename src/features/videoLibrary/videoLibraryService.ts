/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { supabase } from '../../lib/supabase/client';
import {
  VideoAssetRecord,
  VideoFilter,
  VideoProgressRecord,
  VideoStatsRecord,
  LearningResourceRecord,
} from './types';
import { filterVideos, isCompletionEligible } from './videoLibraryUtils';
import { parseVideoUrl } from '../courses/videoUtils';

export const STORAGE_BUCKET = 'learning-resources';

// -----------------------------------------------------------------------------
// Offline / Preview Demo Fixtures
// -----------------------------------------------------------------------------
const DEMO_VIDEOS: VideoAssetRecord[] = [
  {
    id: '77777777-1111-4111-8111-111111111111',
    title: 'Mastering IELTS Speaking: Part 1 & 2 Fluency',
    titleArabic: 'إتقان محادثة الآيلتس: طلاقة الجزء الأول والثاني',
    description: 'Practical strategies for opening statements, fluency markers, and discourse management for high band scores.',
    descriptionArabic: 'استراتيجيات عملية لافتتاحيات المحادثة واستخدام علامات الطلاقة لتحقيق درجات متميزة مع الأستاذ وسام.',
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    videoSource: 'youtube',
    courseId: 'cccccccc-1111-4111-8111-111111111111',
    courseTitle: 'IELTS Academic Writing & Speaking Mastery',
    courseTitleArabic: 'إتقان الكتابة والمحادثة الأكاديمية لاختبار الآيلتس',
    unitId: '44444444-1111-4111-8111-111111111111',
    unitTitle: 'Unit 1: Speaking Foundations',
    unitTitleArabic: 'الوحدة 1: أساسيات المحادثة',
    lessonId: '55555555-1111-4111-8111-111111111111',
    lessonTitle: 'Lesson 1.1 Speaking',
    lessonTitleArabic: 'الدرس 1: التحدث',
    durationSeconds: 1250,
    orderIndex: 1,
    status: 'published',
    publishedAt: '2026-10-01T10:00:00Z',
    createdBy: '11111111-1111-4111-8111-111111111111',
    createdAt: '2026-10-01T08:00:00Z',
    updatedAt: '2026-10-01T10:00:00Z',
    progress: {
      id: 'demo-prog-1',
      studentId: '22222222-2222-4222-8222-222222222222',
      videoId: '77777777-1111-4111-8111-111111111111',
      lastPositionSeconds: 620,
      maxPositionSeconds: 620,
      durationSeconds: 1250,
      isCompleted: false,
      lastWatchedAt: '2026-11-05T14:30:00Z',
    },
  },
  {
    id: '77777777-2222-4222-8222-222222222222',
    title: 'Academic Vocabulary & Lexical Resource Workshop',
    titleArabic: 'ورشة عمل المفردات الأكاديمية والمصادر المعجمية',
    description: 'High-frequency collocation sets and topic-specific vocabulary for Band 7+ essays.',
    descriptionArabic: 'مجموعات متلازمات لغوية متقدمة ومفردات أكاديمية متخصصة لكتابة مقالات متفوقة.',
    videoUrl: 'https://vimeo.com/76979871',
    videoSource: 'vimeo',
    courseId: 'cccccccc-1111-4111-8111-111111111111',
    courseTitle: 'IELTS Academic Writing & Speaking Mastery',
    courseTitleArabic: 'إتقان الكتابة والمحادثة الأكاديمية لاختبار الآيلتس',
    unitId: '44444444-1111-4111-8111-111111111111',
    unitTitle: 'Unit 1: Speaking Foundations',
    unitTitleArabic: 'الوحدة 1: أساسيات المحادثة',
    durationSeconds: 1800,
    orderIndex: 2,
    status: 'published',
    publishedAt: '2026-10-03T11:00:00Z',
    createdBy: '11111111-1111-4111-8111-111111111111',
    createdAt: '2026-10-03T09:00:00Z',
    updatedAt: '2026-10-03T11:00:00Z',
    progress: {
      id: 'demo-prog-2',
      studentId: '22222222-2222-4222-8222-222222222222',
      videoId: '77777777-2222-4222-8222-222222222222',
      lastPositionSeconds: 1650,
      maxPositionSeconds: 1650,
      durationSeconds: 1800,
      isCompleted: true,
      completedAt: '2026-11-06T18:00:00Z',
      lastWatchedAt: '2026-11-06T18:00:00Z',
    },
  },
  {
    id: '77777777-3333-4333-8333-333333333333',
    title: 'Grammar Accuracy: Complex Sentences & Conditionals',
    titleArabic: 'دقة القواعد: الجمل المركبة والقواعد الشرطية',
    description: 'In-depth guide to conditional clauses, inversion, and complex clause structures.',
    descriptionArabic: 'شرح تفصيلي لتراكيب الجمل الشرطية والقلب النحوي وصياغة جمل أكاديمية معقدة خالية من الأخطاء.',
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    videoSource: 'youtube',
    courseId: 'cccccccc-1111-4111-8111-111111111111',
    courseTitle: 'IELTS Academic Writing & Speaking Mastery',
    courseTitleArabic: 'إتقان الكتابة والمحادثة الأكاديمية لاختبار الآيلتس',
    durationSeconds: 950,
    orderIndex: 3,
    status: 'draft',
    createdBy: '11111111-1111-4111-8111-111111111111',
    createdAt: '2026-10-10T12:00:00Z',
    updatedAt: '2026-10-10T12:00:00Z',
    progress: null,
  },
];

// -----------------------------------------------------------------------------
// TEACHER API: Video Library Management
// -----------------------------------------------------------------------------

export async function fetchTeacherVideos(filters?: VideoFilter): Promise<VideoAssetRecord[]> {
  if (!supabase) {
    return filterVideos(DEMO_VIDEOS, filters || {});
  }

  let query = supabase
    .from('video_assets')
    .select(`
      *,
      course:courses(id, title, title_arabic),
      unit:course_units(id, title, title_arabic),
      lesson:lessons!video_assets_lesson_id_fkey(id, title, title_arabic),
      group:groups(id, name, name_arabic)
    `)
    .order('order_index', { ascending: true })
    .order('created_at', { ascending: false });

  if (filters?.courseId) query = query.eq('course_id', filters.courseId);
  if (filters?.unitId) query = query.eq('unit_id', filters.unitId);
  if (filters?.groupId) query = query.eq('group_id', filters.groupId);
  if (filters?.status && filters.status !== 'all') query = query.eq('status', filters.status);
  if (filters?.provider && filters.provider !== 'all') query = query.eq('video_source', filters.provider);

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message || 'Failed to fetch videos');
  }

  const mapped: VideoAssetRecord[] = (data || []).map((row: any) => ({
    id: row.id,
    title: row.title || '',
    titleArabic: row.title_arabic,
    description: row.description,
    descriptionArabic: row.description_arabic,
    videoUrl: row.video_url,
    storagePath: row.storage_path,
    videoSource: row.video_source || 'youtube',
    thumbnailUrl: row.thumbnail_url,
    courseId: row.course_id,
    unitId: row.unit_id,
    lessonId: row.lesson_id,
    groupId: row.group_id,
    durationSeconds: row.duration_seconds || 0,
    orderIndex: row.order_index || 1,
    status: row.status || 'draft',
    publishedAt: row.published_at,
    archivedAt: row.archived_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    courseTitle: row.course?.title,
    courseTitleArabic: row.course?.title_arabic,
    unitTitle: row.unit?.title,
    unitTitleArabic: row.unit?.title_arabic,
    lessonTitle: row.lesson?.title,
    lessonTitleArabic: row.lesson?.title_arabic,
    groupName: row.group?.name,
    groupNameArabic: row.group?.name_arabic,
  }));

  if (filters?.searchQuery) {
    return filterVideos(mapped, filters);
  }
  return mapped;
}

export async function createVideoAsset(payload: Partial<VideoAssetRecord>): Promise<VideoAssetRecord> {
  if (!supabase) {
    const newVideo: VideoAssetRecord = {
      id: `77777777-${Date.now().toString(16).padStart(4, '0')}-4000-8000-000000000000`,
      title: payload.title || 'New Video Lecture',
      titleArabic: payload.titleArabic || 'فيديو تعليمي جديد',
      description: payload.description || '',
      descriptionArabic: payload.descriptionArabic || '',
      videoUrl: payload.videoUrl,
      videoSource: payload.videoSource || 'youtube',
      durationSeconds: payload.durationSeconds || 0,
      orderIndex: payload.orderIndex || (DEMO_VIDEOS.length + 1),
      status: payload.status || 'draft',
      courseId: payload.courseId || null,
      unitId: payload.unitId || null,
      lessonId: payload.lessonId || null,
      groupId: payload.groupId || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    DEMO_VIDEOS.unshift(newVideo);
    return newVideo;
  }

  const { data: userAuth } = await supabase.auth.getUser();
  const userId = userAuth.user?.id;

  const { data, error } = await supabase
    .from('video_assets')
    .insert({
      title: payload.title,
      title_arabic: payload.titleArabic,
      description: payload.description,
      description_arabic: payload.descriptionArabic,
      video_url: payload.videoUrl,
      storage_path: payload.storagePath,
      video_source: payload.videoSource || 'youtube',
      thumbnail_url: payload.thumbnailUrl,
      course_id: payload.courseId || null,
      unit_id: payload.unitId || null,
      lesson_id: payload.lessonId || null,
      group_id: payload.groupId || null,
      duration_seconds: payload.durationSeconds || 0,
      order_index: payload.orderIndex || 1,
      status: payload.status || 'draft',
      created_by: userId,
    })
    .select(`
      *,
      course:courses(id, title, title_arabic),
      unit:course_units(id, title, title_arabic),
      lesson:lessons(id, title, title_arabic)
    `)
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to create video asset');
  }

  return {
    id: data.id,
    title: data.title,
    titleArabic: data.title_arabic,
    description: data.description,
    descriptionArabic: data.description_arabic,
    videoUrl: data.video_url,
    storagePath: data.storage_path,
    videoSource: data.video_source,
    thumbnailUrl: data.thumbnail_url,
    courseId: data.course_id,
    unitId: data.unit_id,
    lessonId: data.lesson_id,
    groupId: data.group_id,
    durationSeconds: data.duration_seconds || 0,
    orderIndex: data.order_index,
    status: data.status,
    publishedAt: data.published_at,
    archivedAt: data.archived_at,
    createdBy: data.created_by,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    courseTitle: data.course?.title,
    courseTitleArabic: data.course?.title_arabic,
    unitTitle: data.unit?.title,
    unitTitleArabic: data.unit?.title_arabic,
    lessonTitle: data.lesson?.title,
    lessonTitleArabic: data.lesson?.title_arabic,
  };
}

export async function updateVideoAsset(id: string, payload: Partial<VideoAssetRecord>): Promise<void> {
  if (!supabase) {
    const idx = DEMO_VIDEOS.findIndex((v) => v.id === id);
    if (idx !== -1) {
      DEMO_VIDEOS[idx] = { ...DEMO_VIDEOS[idx], ...payload, updatedAt: new Date().toISOString() };
    }
    return;
  }

  const { error } = await supabase
    .from('video_assets')
    .update({
      title: payload.title,
      title_arabic: payload.titleArabic,
      description: payload.description,
      description_arabic: payload.descriptionArabic,
      video_url: payload.videoUrl,
      storage_path: payload.storagePath,
      video_source: payload.videoSource,
      thumbnail_url: payload.thumbnailUrl,
      course_id: payload.courseId || null,
      unit_id: payload.unitId || null,
      lesson_id: payload.lessonId || null,
      group_id: payload.groupId || null,
      duration_seconds: payload.durationSeconds,
      order_index: payload.orderIndex,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    throw new Error(error.message || 'Failed to update video');
  }
}

export async function publishVideo(id: string): Promise<void> {
  if (!supabase) {
    const v = DEMO_VIDEOS.find((item) => item.id === id);
    if (v) {
      v.status = 'published';
      v.publishedAt = new Date().toISOString();
      v.updatedAt = new Date().toISOString();
    }
    return;
  }

  const { error } = await supabase.rpc('publish_video_asset', { p_video_id: id });
  if (error) {
    throw new Error(error.message || 'Failed to publish video');
  }
}

export async function unpublishVideo(id: string): Promise<void> {
  if (!supabase) {
    const v = DEMO_VIDEOS.find((item) => item.id === id);
    if (v) {
      v.status = 'draft';
      v.updatedAt = new Date().toISOString();
    }
    return;
  }

  const { error } = await supabase.rpc('unpublish_video_asset', { p_video_id: id });
  if (error) {
    throw new Error(error.message || 'Failed to unpublish video');
  }
}

export async function archiveVideo(id: string): Promise<void> {
  if (!supabase) {
    const v = DEMO_VIDEOS.find((item) => item.id === id);
    if (v) {
      v.status = 'archived';
      v.archivedAt = new Date().toISOString();
      v.updatedAt = new Date().toISOString();
    }
    return;
  }

  const { error } = await supabase.rpc('archive_video_asset', { p_video_id: id });
  if (error) {
    throw new Error(error.message || 'Failed to archive video');
  }
}

export async function reorderVideos(courseId: string, videoIds: string[]): Promise<void> {
  if (!supabase) {
    videoIds.forEach((vid, idx) => {
      const v = DEMO_VIDEOS.find((item) => item.id === vid);
      if (v) v.orderIndex = idx + 1;
    });
    return;
  }

  const { error } = await supabase.rpc('reorder_course_videos', {
    p_course_id: courseId,
    p_video_ids: videoIds,
  });

  if (error) {
    throw new Error(error.message || 'Failed to reorder videos');
  }
}

export async function getVideoStats(videoId: string): Promise<VideoStatsRecord> {
  if (!supabase) {
    return {
      videoId,
      totalViews: 24,
      completedCount: 19,
      completionRate: 79.2,
      avgWatchedSeconds: 1100,
      assignedStudentsCount: 28,
    };
  }

  const { data, error } = await supabase.rpc('get_video_stats', { p_video_id: videoId });
  if (error) {
    throw new Error(error.message || 'Failed to load video statistics');
  }

  return {
    videoId,
    totalViews: data.total_views || 0,
    completedCount: data.completed_count || 0,
    completionRate: data.completion_rate || 0,
    avgWatchedSeconds: data.avg_watched_seconds || 0,
    assignedStudentsCount: data.assigned_students_count || 0,
  };
}

// -----------------------------------------------------------------------------
// STUDENT API: Video Browsing & Playback Progress
// -----------------------------------------------------------------------------

export async function fetchStudentVideos(filters?: VideoFilter): Promise<VideoAssetRecord[]> {
  if (!supabase) {
    const publishedOnly = DEMO_VIDEOS.filter((v) => v.status === 'published');
    return filterVideos(publishedOnly, filters || {});
  }

  const { data: userAuth } = await supabase.auth.getUser();
  const studentId = userAuth.user?.id;

  let query = supabase
    .from('video_assets')
    .select(`
      *,
      course:courses(id, title, title_arabic),
      unit:course_units(id, title, title_arabic),
      lesson:lessons!video_assets_lesson_id_fkey(id, title, title_arabic),
      group:groups(id, name, name_arabic),
      progress:video_progress(*)
    `)
    .eq('status', 'published')
    .order('order_index', { ascending: true })
    .order('created_at', { ascending: false });

  if (filters?.courseId) query = query.eq('course_id', filters.courseId);
  if (filters?.unitId) query = query.eq('unit_id', filters.unitId);

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message || 'Failed to fetch student videos');
  }

  const mapped: VideoAssetRecord[] = (data || []).map((row: any) => {
    // Extract student's progress record
    const userProg = Array.isArray(row.progress)
      ? row.progress.find((p: any) => p.student_id === studentId)
      : row.progress;

    const progRecord: VideoProgressRecord | null = userProg
      ? {
          id: userProg.id,
          studentId: userProg.student_id,
          videoId: userProg.video_id,
          lastPositionSeconds: userProg.last_position_seconds || 0,
          maxPositionSeconds: userProg.max_position_seconds || 0,
          durationSeconds: userProg.duration_seconds || row.duration_seconds || 0,
          isCompleted: Boolean(userProg.is_completed),
          completedAt: userProg.completed_at,
          lastWatchedAt: userProg.last_watched_at,
        }
      : null;

    return {
      id: row.id,
      title: row.title || '',
      titleArabic: row.title_arabic,
      description: row.description,
      descriptionArabic: row.description_arabic,
      videoUrl: row.video_url,
      storagePath: row.storage_path,
      videoSource: row.video_source || 'youtube',
      thumbnailUrl: row.thumbnail_url,
      courseId: row.course_id,
      unitId: row.unit_id,
      lessonId: row.lesson_id,
      groupId: row.group_id,
      durationSeconds: row.duration_seconds || 0,
      orderIndex: row.order_index || 1,
      status: row.status,
      publishedAt: row.published_at,
      archivedAt: row.archived_at,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      courseTitle: row.course?.title,
      courseTitleArabic: row.course?.title_arabic,
      unitTitle: row.unit?.title,
      unitTitleArabic: row.unit?.title_arabic,
      lessonTitle: row.lesson?.title,
      lessonTitleArabic: row.lesson?.title_arabic,
      groupName: row.group?.name,
      groupNameArabic: row.group?.name_arabic,
      progress: progRecord,
    };
  });

  return filterVideos(mapped, filters || {});
}

export async function recordVideoPlaybackProgress(
  videoId: string,
  positionSeconds: number,
  durationSeconds: number
): Promise<VideoProgressRecord> {
  if (!supabase) {
    const v = DEMO_VIDEOS.find((item) => item.id === videoId);
    const completed = isCompletionEligible(positionSeconds, durationSeconds);
    const rec: VideoProgressRecord = {
      id: 'demo-prog-updated',
      studentId: 'demo-student',
      videoId,
      lastPositionSeconds: Math.floor(positionSeconds),
      maxPositionSeconds: Math.floor(positionSeconds),
      durationSeconds: Math.floor(durationSeconds),
      isCompleted: completed,
      completedAt: completed ? new Date().toISOString() : null,
      lastWatchedAt: new Date().toISOString(),
    };
    if (v) v.progress = rec;
    return rec;
  }

  const { data, error } = await supabase.rpc('record_video_progress', {
    p_video_id: videoId,
    p_position_seconds: Math.floor(positionSeconds),
    p_duration_seconds: Math.floor(durationSeconds),
  });

  if (error || !data) {
    throw new Error(error?.message || 'Failed to record video progress');
  }

  return {
    id: data.id,
    studentId: data.student_id,
    videoId: data.video_id,
    lastPositionSeconds: data.last_position_seconds || 0,
    maxPositionSeconds: data.max_position_seconds || 0,
    durationSeconds: data.duration_seconds || 0,
    isCompleted: Boolean(data.is_completed),
    completedAt: data.completed_at,
    lastWatchedAt: data.last_watched_at,
  };
}

// -----------------------------------------------------------------------------
// STUDY MATERIALS & LESSON RESOURCES API
// -----------------------------------------------------------------------------

export async function fetchLessonResources(
  lessonId: string,
  isTeacher: boolean = false
): Promise<LearningResourceRecord[]> {
  if (!supabase) {
    return [
      {
        id: '66666666-1111-4111-8111-111111111111',
        lessonId,
        title: 'IELTS Speaking Diagnostic Criteria',
        titleArabic: 'معايير تقييم محادثة الآيلتس الرسمية',
        fileUrl: 'https://example.com/speaking-criteria.pdf',
        fileType: 'pdf',
        resourceType: 'pdf',
        fileSizeBytes: 1048576,
        isPublished: true,
        orderIndex: 1,
        createdAt: '2026-10-01T00:00:00Z',
      },
      {
        id: '66666666-2222-4222-8222-222222222222',
        lessonId,
        title: 'Interactive Practice Worksheet & Audio Script',
        titleArabic: 'ورقة تدريبات تفاعلية والنص الصوتي المرفق',
        fileUrl: 'https://example.com/worksheet.pdf',
        fileType: 'pdf',
        resourceType: 'worksheet',
        fileSizeBytes: 2097152,
        isPublished: true,
        orderIndex: 2,
        createdAt: '2026-10-02T00:00:00Z',
      },
    ];
  }

  let query = supabase
    .from('lesson_resources')
    .select('*')
    .eq('lesson_id', lessonId)
    .order('order_index', { ascending: true })
    .order('created_at', { ascending: true });

  if (!isTeacher) {
    query = query.eq('is_published', true);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message || 'Failed to fetch lesson resources');
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    lessonId: row.lesson_id,
    courseId: row.course_id,
    title: row.title,
    titleArabic: row.title_arabic,
    description: row.description,
    descriptionArabic: row.description_arabic,
    fileUrl: row.file_url,
    storagePath: row.storage_path,
    fileType: row.file_type,
    fileSizeBytes: row.file_size_bytes,
    resourceType: row.resource_type || 'pdf',
    isPublished: Boolean(row.is_published),
    orderIndex: row.order_index || 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function uploadLearningResource(params: {
  courseId: string;
  lessonId: string;
  file: File;
  title: string;
  titleArabic?: string;
  description?: string;
  descriptionArabic?: string;
  resourceType: string;
  isPublished?: boolean;
}): Promise<LearningResourceRecord> {
  const safeFileName = params.file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `courses/${params.courseId}/lessons/${params.lessonId}/${Date.now()}-${safeFileName}`;
  const ext = safeFileName.split('.').pop()?.toLowerCase() || 'pdf';

  if (!supabase) {
    return {
      id: `66666666-${Date.now().toString(16).padStart(4, '0')}-4000-8000-000000000000`,
      lessonId: params.lessonId,
      courseId: params.courseId,
      title: params.title,
      titleArabic: params.titleArabic,
      description: params.description,
      descriptionArabic: params.descriptionArabic,
      fileUrl: storagePath,
      storagePath,
      fileType: ext,
      fileSizeBytes: params.file.size,
      resourceType: (params.resourceType as any) || 'pdf',
      isPublished: params.isPublished ?? true,
      orderIndex: 1,
      createdAt: new Date().toISOString(),
    };
  }

  // 1. Upload to private Storage bucket
  const { error: uploadErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, params.file, {
      contentType: params.file.type || 'application/octet-stream',
      upsert: false,
    });

  if (uploadErr) {
    throw new Error(`Failed to upload file to storage: ${uploadErr.message}`);
  }

  // 2. Insert row in public.lesson_resources
  const { data, error: dbErr } = await supabase
    .from('lesson_resources')
    .insert({
      lesson_id: params.lessonId,
      course_id: params.courseId,
      title: params.title.trim(),
      title_arabic: params.titleArabic?.trim() || null,
      description: params.description?.trim() || null,
      description_arabic: params.descriptionArabic?.trim() || null,
      file_url: storagePath,
      storage_path: storagePath,
      file_type: ext,
      file_size_bytes: params.file.size,
      resource_type: params.resourceType,
      is_published: params.isPublished ?? true,
    })
    .select('*')
    .single();

  if (dbErr || !data) {
    await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
    throw new Error(`Failed to save resource record: ${dbErr?.message}`);
  }

  return {
    id: data.id,
    lessonId: data.lesson_id,
    courseId: data.course_id,
    title: data.title,
    titleArabic: data.title_arabic,
    description: data.description,
    descriptionArabic: data.description_arabic,
    fileUrl: data.file_url,
    storagePath: data.storage_path,
    fileType: data.file_type,
    fileSizeBytes: data.file_size_bytes,
    resourceType: data.resource_type,
    isPublished: data.is_published,
    orderIndex: data.order_index,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function addExternalResourceLink(params: {
  courseId: string;
  lessonId: string;
  title: string;
  titleArabic?: string;
  externalUrl: string;
  description?: string;
  resourceType?: string;
  isPublished?: boolean;
}): Promise<LearningResourceRecord> {
  const parsed = parseVideoUrl(params.externalUrl);
  if (!params.externalUrl.startsWith('https://')) {
    throw new Error('Only secure HTTPS links are allowed');
  }

  if (!supabase) {
    return {
      id: `66666666-${Date.now().toString(16).padStart(4, '0')}-4000-8000-000000000000`,
      lessonId: params.lessonId,
      courseId: params.courseId,
      title: params.title,
      titleArabic: params.titleArabic,
      fileUrl: params.externalUrl,
      fileType: 'link',
      resourceType: 'link',
      isPublished: params.isPublished ?? true,
      orderIndex: 1,
      createdAt: new Date().toISOString(),
    };
  }

  const { data, error } = await supabase
    .from('lesson_resources')
    .insert({
      lesson_id: params.lessonId,
      course_id: params.courseId,
      title: params.title.trim(),
      title_arabic: params.titleArabic?.trim() || null,
      description: params.description?.trim() || null,
      file_url: params.externalUrl.trim(),
      storage_path: null,
      file_type: 'link',
      resource_type: params.resourceType || 'link',
      is_published: params.isPublished ?? true,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to save external resource');
  }

  return {
    id: data.id,
    lessonId: data.lesson_id,
    courseId: data.course_id,
    title: data.title,
    titleArabic: data.title_arabic,
    description: data.description,
    descriptionArabic: data.description_arabic,
    fileUrl: data.file_url,
    storagePath: data.storage_path,
    fileType: data.file_type,
    fileSizeBytes: data.file_size_bytes,
    resourceType: data.resource_type,
    isPublished: data.is_published,
    orderIndex: data.order_index,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function getSecureResourceUrl(resourceId: string): Promise<string> {
  if (!supabase) {
    return 'https://example.com/resources/sample-handout.pdf';
  }

  const { data: res, error } = await supabase
    .from('lesson_resources')
    .select('id, file_url, storage_path')
    .eq('id', resourceId)
    .single();

  if (error || !res) {
    throw new Error('Resource not accessible or unauthorized');
  }

  const path = res.storage_path || res.file_url;
  if (path.startsWith('https://')) {
    return path;
  }

  // Generate 5-minute signed URL
  const { data: signedData, error: signErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, 300);

  if (signErr || !signedData?.signedUrl) {
    throw new Error(signErr?.message || 'Access denied');
  }

  return signedData.signedUrl;
}

export async function deleteResource(resourceId: string): Promise<void> {
  if (!supabase) {
    return;
  }

  const { data: res } = await supabase
    .from('lesson_resources')
    .select('id, storage_path, file_url')
    .eq('id', resourceId)
    .single();

  const { error: dbErr } = await supabase
    .from('lesson_resources')
    .delete()
    .eq('id', resourceId);

  if (dbErr) {
    throw new Error(`Failed to delete resource: ${dbErr.message}`);
  }

  const path = res?.storage_path || (res?.file_url && !res.file_url.startsWith('https://') ? res.file_url : null);
  if (path) {
    await supabase.storage.from(STORAGE_BUCKET).remove([path]);
  }
}
