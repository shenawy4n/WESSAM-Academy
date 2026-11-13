/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  requireSupabaseClient,
  requireAuthenticatedUser,
  throwServiceError,
  ServiceError,
} from '../../lib/errors/serviceError';
import {
  VideoAssetRecord,
  VideoFilter,
  VideoProgressRecord,
  VideoStatsRecord,
  LearningResourceRecord,
} from './types';
import { filterVideos } from './videoLibraryUtils';

export const STORAGE_BUCKET = 'learning-resources';
const SERVICE = 'videoLibraryService';

// -----------------------------------------------------------------------------
// TEACHER API: Video Library Management
// -----------------------------------------------------------------------------

export async function fetchTeacherVideos(filters?: VideoFilter): Promise<VideoAssetRecord[]> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'fetchTeacherVideos' });

  let query = client
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

  let res;
  try {
    res = await query;
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'fetchTeacherVideos' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'fetchTeacherVideos',
      fallbackMessage: 'Failed to fetch videos',
    });
  }

  const mapped: VideoAssetRecord[] = (res.data || []).map((row: any) => ({
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
  const client = requireSupabaseClient({ service: SERVICE, operation: 'createVideoAsset' });
  const user = await requireAuthenticatedUser(client, {
    service: SERVICE,
    operation: 'createVideoAsset',
  });

  let res;
  try {
    res = await client
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
        created_by: user.id,
      })
      .select(`
        *,
        course:courses(id, title, title_arabic),
        unit:course_units(id, title, title_arabic),
        lesson:lessons!video_assets_lesson_id_fkey(id, title, title_arabic)
      `)
      .single();
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'createVideoAsset' });
  }

  if (res.error || !res.data) {
    throwServiceError(res.error || new Error('Failed to create video asset'), {
      service: SERVICE,
      operation: 'createVideoAsset',
      fallbackMessage: 'Failed to create video asset',
    });
  }

  const data = res.data;
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
  const client = requireSupabaseClient({ service: SERVICE, operation: 'updateVideoAsset' });

  let res;
  try {
    res = await client
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
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'updateVideoAsset' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'updateVideoAsset',
      fallbackMessage: 'Failed to update video',
    });
  }
}

export async function publishVideo(id: string): Promise<void> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'publishVideo' });

  let res;
  try {
    res = await client.rpc('publish_video_asset', { p_video_id: id });
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'publishVideo' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'publishVideo',
      fallbackMessage: 'Failed to publish video',
    });
  }
}

export async function unpublishVideo(id: string): Promise<void> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'unpublishVideo' });

  let res;
  try {
    res = await client.rpc('unpublish_video_asset', { p_video_id: id });
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'unpublishVideo' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'unpublishVideo',
      fallbackMessage: 'Failed to unpublish video',
    });
  }
}

export async function archiveVideo(id: string): Promise<void> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'archiveVideo' });

  let res;
  try {
    res = await client.rpc('archive_video_asset', { p_video_id: id });
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'archiveVideo' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'archiveVideo',
      fallbackMessage: 'Failed to archive video',
    });
  }
}

export async function reorderVideos(courseId: string, videoIds: string[]): Promise<void> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'reorderVideos' });

  let res;
  try {
    res = await client.rpc('reorder_course_videos', {
      p_course_id: courseId,
      p_video_ids: videoIds,
    });
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'reorderVideos' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'reorderVideos',
      fallbackMessage: 'Failed to reorder videos',
    });
  }
}

export async function getVideoStats(videoId: string): Promise<VideoStatsRecord> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'getVideoStats' });

  let res;
  try {
    res = await client.rpc('get_video_stats', { p_video_id: videoId });
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'getVideoStats' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'getVideoStats',
      fallbackMessage: 'Failed to load video statistics',
    });
  }

  if (!res.data) {
    throw new ServiceError({
      category: 'DATABASE_ERROR',
      message: 'Video statistics RPC returned empty data.',
      service: SERVICE,
      operation: 'getVideoStats',
    });
  }

  return {
    videoId,
    totalViews: res.data.total_views || 0,
    completedCount: res.data.completed_count || 0,
    completionRate: res.data.completion_rate || 0,
    avgWatchedSeconds: res.data.avg_watched_seconds || 0,
    assignedStudentsCount: res.data.assigned_students_count || 0,
  };
}

// -----------------------------------------------------------------------------
// STUDENT API: Video Browsing & Playback Progress
// -----------------------------------------------------------------------------

export async function fetchStudentVideos(filters?: VideoFilter): Promise<VideoAssetRecord[]> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'fetchStudentVideos' });
  const user = await requireAuthenticatedUser(client, {
    service: SERVICE,
    operation: 'fetchStudentVideos',
  });
  const studentId = user.id;

  let query = client
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

  let res;
  try {
    res = await query;
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'fetchStudentVideos' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'fetchStudentVideos',
      fallbackMessage: 'Failed to fetch student videos',
    });
  }

  const mapped: VideoAssetRecord[] = (res.data || []).map((row: any) => {
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
  const client = requireSupabaseClient({
    service: SERVICE,
    operation: 'recordVideoPlaybackProgress',
  });

  let res;
  try {
    res = await client.rpc('record_video_progress', {
      p_video_id: videoId,
      p_position_seconds: Math.floor(positionSeconds),
      p_duration_seconds: Math.floor(durationSeconds),
    });
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'recordVideoPlaybackProgress' });
  }

  if (res.error || !res.data) {
    throwServiceError(res.error || new Error('Failed to record video progress'), {
      service: SERVICE,
      operation: 'recordVideoPlaybackProgress',
      fallbackMessage: 'Failed to record video progress',
    });
  }

  const data = res.data;
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
  const client = requireSupabaseClient({ service: SERVICE, operation: 'fetchLessonResources' });

  let query = client
    .from('lesson_resources')
    .select('*')
    .eq('lesson_id', lessonId)
    .order('order_index', { ascending: true })
    .order('created_at', { ascending: true });

  if (!isTeacher) {
    query = query.eq('is_published', true);
  }

  let res;
  try {
    res = await query;
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'fetchLessonResources' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'fetchLessonResources',
      fallbackMessage: 'Failed to fetch lesson resources',
    });
  }

  return (res.data || []).map((row: any) => ({
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
  const client = requireSupabaseClient({ service: SERVICE, operation: 'uploadLearningResource' });

  const safeFileName = params.file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `courses/${params.courseId}/lessons/${params.lessonId}/${Date.now()}-${safeFileName}`;
  const ext = safeFileName.split('.').pop()?.toLowerCase() || 'pdf';

  let uploadRes;
  try {
    uploadRes = await client.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, params.file, {
        contentType: params.file.type || 'application/octet-stream',
        upsert: false,
      });
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'uploadLearningResource.storage' });
  }

  if (uploadRes.error) {
    throwServiceError(uploadRes.error, {
      service: SERVICE,
      operation: 'uploadLearningResource.storage',
      fallbackMessage: 'Failed to upload file to storage',
    });
  }

  let dbRes;
  try {
    dbRes = await client
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
  } catch (err) {
    try {
      await client.storage.from(STORAGE_BUCKET).remove([storagePath]);
    } catch {
      // ignore rollback failure; rethrow original DB error
    }
    throwServiceError(err, { service: SERVICE, operation: 'uploadLearningResource.db' });
  }

  if (dbRes.error || !dbRes.data) {
    try {
      await client.storage.from(STORAGE_BUCKET).remove([storagePath]);
    } catch {
      // ignore rollback failure; rethrow original DB error
    }
    throwServiceError(dbRes.error || new Error('Failed to save resource record'), {
      service: SERVICE,
      operation: 'uploadLearningResource.db',
      fallbackMessage: 'Failed to save resource record',
    });
  }

  const data = dbRes.data;
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
  if (!params.externalUrl || !params.externalUrl.trim().startsWith('https://')) {
    throw new ServiceError({
      category: 'VALIDATION_ERROR',
      message: 'Only secure HTTPS links are allowed.',
      service: SERVICE,
      operation: 'addExternalResourceLink',
    });
  }

  const client = requireSupabaseClient({ service: SERVICE, operation: 'addExternalResourceLink' });

  let res;
  try {
    res = await client
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
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'addExternalResourceLink' });
  }

  if (res.error || !res.data) {
    throwServiceError(res.error || new Error('Failed to save external resource'), {
      service: SERVICE,
      operation: 'addExternalResourceLink',
      fallbackMessage: 'Failed to save external resource',
    });
  }

  const data = res.data;
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
  const client = requireSupabaseClient({ service: SERVICE, operation: 'getSecureResourceUrl' });

  let res;
  try {
    res = await client
      .from('lesson_resources')
      .select('id, file_url, storage_path')
      .eq('id', resourceId)
      .single();
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'getSecureResourceUrl' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'getSecureResourceUrl',
      fallbackMessage: 'Resource not accessible or unauthorized',
    });
  }

  if (!res.data) {
    throw new ServiceError({
      category: 'NOT_FOUND',
      message: 'Resource not found.',
      service: SERVICE,
      operation: 'getSecureResourceUrl',
      code: 'PGRST116',
    });
  }

  const path = res.data.storage_path || res.data.file_url;
  if (path.startsWith('https://')) {
    return path;
  }

  let signedRes;
  try {
    signedRes = await client.storage.from(STORAGE_BUCKET).createSignedUrl(path, 300);
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'getSecureResourceUrl.signedUrl' });
  }

  if (signedRes.error || !signedRes.data?.signedUrl) {
    throwServiceError(signedRes.error || new Error('Failed to generate signed resource URL'), {
      service: SERVICE,
      operation: 'getSecureResourceUrl.signedUrl',
      fallbackMessage: 'Failed to generate signed download link',
    });
  }

  return signedRes.data.signedUrl;
}

export async function deleteResource(resourceId: string): Promise<void> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'deleteResource' });

  let metaRes;
  try {
    metaRes = await client
      .from('lesson_resources')
      .select('id, storage_path, file_url')
      .eq('id', resourceId)
      .maybeSingle();
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'deleteResource.metadata' });
  }

  if (metaRes.error) {
    throwServiceError(metaRes.error, {
      service: SERVICE,
      operation: 'deleteResource.metadata',
      fallbackMessage: 'Failed to look up resource metadata',
    });
  }

  let dbRes;
  try {
    dbRes = await client.from('lesson_resources').delete().eq('id', resourceId);
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'deleteResource.db' });
  }

  if (dbRes.error) {
    throwServiceError(dbRes.error, {
      service: SERVICE,
      operation: 'deleteResource.db',
      fallbackMessage: 'Failed to delete resource',
    });
  }

  const meta = metaRes.data;
  const path =
    meta?.storage_path ||
    (meta?.file_url && !meta.file_url.startsWith('https://') ? meta.file_url : null);
  if (path) {
    let storageRes;
    try {
      storageRes = await client.storage.from(STORAGE_BUCKET).remove([path]);
    } catch (err) {
      throwServiceError(err, { service: SERVICE, operation: 'deleteResource.storage' });
    }
    if (storageRes.error) {
      throwServiceError(storageRes.error, {
        service: SERVICE,
        operation: 'deleteResource.storage',
        fallbackMessage: 'Failed to remove resource file from storage',
      });
    }
  }
}
