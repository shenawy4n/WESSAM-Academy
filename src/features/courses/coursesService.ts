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

export type CourseLevel = 'beginner' | 'intermediate' | 'advanced';

export interface CourseRecord {
  id: string;
  teacherId: string;
  title: string;
  titleArabic: string;
  description?: string | null;
  descriptionArabic?: string | null;
  coverImageUrl?: string | null;
  level: CourseLevel;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
  unitsCount?: number;
  lessonsCount?: number;
  assignedGroupsCount?: number;
  assignedGroups?: { id: string; name: string; nameArabic: string; studentCount?: number }[];
}

export interface LessonResourceRecord {
  id: string;
  lessonId: string;
  title: string;
  titleArabic?: string | null;
  fileUrl: string;
  storagePath?: string | null;
  fileType?: string | null;
  fileSizeBytes?: number | null;
  createdAt: string;
}

export interface LessonRecord {
  id: string;
  courseId: string;
  unitId: string;
  title: string;
  titleArabic: string;
  description?: string | null;
  durationMinutes: number;
  orderIndex: number;
  videoUrl?: string | null;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
  resources?: LessonResourceRecord[];
  progress?: {
    isCompleted: boolean;
    watchSeconds: number;
    lastAccessedAt?: string;
  } | null;
}

export interface CourseUnitRecord {
  id: string;
  courseId: string;
  title: string;
  titleArabic: string;
  orderIndex: number;
  createdAt: string;
  lessons: LessonRecord[];
}

export interface StudentCourseSummary {
  id: string;
  title: string;
  titleArabic: string;
  description?: string | null;
  descriptionArabic?: string | null;
  coverImageUrl?: string | null;
  level: CourseLevel;
  totalLessons: number;
  completedLessons: number;
  progressPercentage: number;
  groupName?: string;
  groupNameArabic?: string;
}

// -----------------------------------------------------------------------------
// Storage Configuration & Validation Constants
// -----------------------------------------------------------------------------
export const STORAGE_BUCKET = 'learning-resources';
export const MAX_RESOURCE_SIZE_BYTES = 26214400; // 25 MB
const SERVICE = 'coursesService';

export const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
  'application/zip',
  'image/jpeg',
  'image/png',
]);

export const ALLOWED_EXTENSIONS = new Set([
  'pdf',
  'docx',
  'doc',
  'pptx',
  'ppt',
  'zip',
  'jpg',
  'jpeg',
  'png',
]);

export function validateLearningResourceFile(file: File): { isValid: boolean; error?: string } {
  if (!file) {
    return { isValid: false, error: 'No file provided' };
  }

  if (file.size > MAX_RESOURCE_SIZE_BYTES) {
    return {
      isValid: false,
      error: `File size exceeds 25 MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB)`,
    };
  }

  const nameParts = file.name.split('.');
  const ext = (nameParts[nameParts.length - 1] || '').toLowerCase();

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return {
      isValid: false,
      error: `Disallowed file extension .${ext}. Permitted formats: PDF, DOCX, PPTX, ZIP, JPG, PNG`,
    };
  }

  if (file.type && !ALLOWED_MIME_TYPES.has(file.type)) {
    return { isValid: false, error: `Disallowed MIME type ${file.type}` };
  }

  return { isValid: true };
}

// -----------------------------------------------------------------------------
// TEACHER & SUPER ADMIN API
// -----------------------------------------------------------------------------

export async function fetchTeacherCourses(filter?: {
  status?: 'all' | 'published' | 'draft';
  level?: string;
  search?: string;
}): Promise<CourseRecord[]> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'fetchTeacherCourses' });

  let query = client
    .from('courses')
    .select(`
      id,
      teacher_id,
      title,
      title_arabic,
      description,
      description_arabic,
      cover_image_url,
      level,
      is_published,
      created_at,
      updated_at
    `)
    .order('created_at', { ascending: false });

  if (filter?.status === 'published') query = query.eq('is_published', true);
  if (filter?.status === 'draft') query = query.eq('is_published', false);
  if (filter?.level && filter.level !== 'all') query = query.eq('level', filter.level);

  let coursesRes;
  try {
    coursesRes = await query;
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'fetchTeacherCourses' });
  }

  if (coursesRes.error) {
    throwServiceError(coursesRes.error, {
      service: SERVICE,
      operation: 'fetchTeacherCourses',
      fallbackMessage: 'Failed to fetch courses',
    });
  }

  const courses = coursesRes.data || [];
  if (courses.length === 0) return [];

  const courseIds = courses.map((c: any) => c.id);

  let unitsRes;
  let lessonsRes;
  let groupsRes;
  try {
    [unitsRes, lessonsRes, groupsRes] = await Promise.all([
      client.from('course_units').select('id, course_id').in('course_id', courseIds),
      client.from('lessons').select('id, course_id').in('course_id', courseIds),
      client
        .from('group_courses')
        .select(`
          course_id,
          group_id,
          groups:group_id (
            id,
            name,
            name_arabic
          )
        `)
        .in('course_id', courseIds),
    ]);
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'fetchTeacherCourses.metadata' });
  }

  if (unitsRes.error) {
    throwServiceError(unitsRes.error, {
      service: SERVICE,
      operation: 'fetchTeacherCourses.units',
      fallbackMessage: 'Failed to load course unit counts',
    });
  }
  if (lessonsRes.error) {
    throwServiceError(lessonsRes.error, {
      service: SERVICE,
      operation: 'fetchTeacherCourses.lessons',
      fallbackMessage: 'Failed to load course lesson counts',
    });
  }
  if (groupsRes.error) {
    throwServiceError(groupsRes.error, {
      service: SERVICE,
      operation: 'fetchTeacherCourses.groups',
      fallbackMessage: 'Failed to load assigned groups for courses',
    });
  }

  const unitsCountMap = new Map<string, number>();
  for (const u of unitsRes.data || []) {
    unitsCountMap.set(u.course_id, (unitsCountMap.get(u.course_id) || 0) + 1);
  }

  const lessonsCountMap = new Map<string, number>();
  for (const l of lessonsRes.data || []) {
    lessonsCountMap.set(l.course_id, (lessonsCountMap.get(l.course_id) || 0) + 1);
  }

  const groupsMap = new Map<string, { id: string; name: string; nameArabic: string }[]>();
  for (const g of groupsRes.data || []) {
    if (g.groups) {
      const list = groupsMap.get(g.course_id) || [];
      const grp = g.groups as any;
      list.push({ id: grp.id, name: grp.name, nameArabic: grp.name_arabic });
      groupsMap.set(g.course_id, list);
    }
  }

  let mapped: CourseRecord[] = courses.map((c: any) => {
    const assigned = groupsMap.get(c.id) || [];
    return {
      id: c.id,
      teacherId: c.teacher_id,
      title: c.title,
      titleArabic: c.title_arabic,
      description: c.description,
      descriptionArabic: c.description_arabic,
      coverImageUrl: c.cover_image_url,
      level: c.level as CourseLevel,
      isPublished: c.is_published,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      unitsCount: unitsCountMap.get(c.id) || 0,
      lessonsCount: lessonsCountMap.get(c.id) || 0,
      assignedGroupsCount: assigned.length,
      assignedGroups: assigned,
    };
  });

  if (filter?.search) {
    const q = filter.search.toLowerCase().trim();
    mapped = mapped.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.titleArabic.toLowerCase().includes(q) ||
        (c.description && c.description.toLowerCase().includes(q))
    );
  }

  return mapped;
}

export async function createCourse(params: {
  title: string;
  titleArabic: string;
  description?: string;
  descriptionArabic?: string;
  level: CourseLevel;
  coverImageUrl?: string;
  isPublished?: boolean;
}): Promise<CourseRecord> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'createCourse' });
  const caller = await requireAuthenticatedUser(client, {
    service: SERVICE,
    operation: 'createCourse',
  });

  let res;
  try {
    res = await client
      .from('courses')
      .insert({
        teacher_id: caller.id,
        title: params.title.trim(),
        title_arabic: params.titleArabic.trim(),
        description: params.description?.trim() || null,
        description_arabic: params.descriptionArabic?.trim() || null,
        level: params.level,
        cover_image_url: params.coverImageUrl?.trim() || null,
        is_published: params.isPublished ?? false,
      })
      .select('*')
      .single();
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'createCourse' });
  }

  if (res.error || !res.data) {
    throwServiceError(res.error || new Error('Failed to create course'), {
      service: SERVICE,
      operation: 'createCourse',
      fallbackMessage: 'Failed to create course',
    });
  }

  const data = res.data;
  return {
    id: data.id,
    teacherId: data.teacher_id,
    title: data.title,
    titleArabic: data.title_arabic,
    description: data.description,
    descriptionArabic: data.description_arabic,
    coverImageUrl: data.cover_image_url,
    level: data.level as CourseLevel,
    isPublished: data.is_published,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    unitsCount: 0,
    lessonsCount: 0,
    assignedGroupsCount: 0,
    assignedGroups: [],
  };
}

export async function updateCourse(params: {
  id: string;
  title: string;
  titleArabic: string;
  description?: string;
  descriptionArabic?: string;
  level: CourseLevel;
  coverImageUrl?: string;
  isPublished?: boolean;
}): Promise<void> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'updateCourse' });

  let res;
  try {
    res = await client
      .from('courses')
      .update({
        title: params.title.trim(),
        title_arabic: params.titleArabic.trim(),
        description: params.description?.trim() || null,
        description_arabic: params.descriptionArabic?.trim() || null,
        level: params.level,
        cover_image_url: params.coverImageUrl?.trim() || null,
        is_published: params.isPublished,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id);
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'updateCourse' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'updateCourse',
      fallbackMessage: 'Failed to update course',
    });
  }
}

export async function deleteCourse(courseId: string): Promise<void> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'deleteCourse' });

  let res;
  try {
    res = await client.from('courses').delete().eq('id', courseId);
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'deleteCourse' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'deleteCourse',
      fallbackMessage: 'Failed to delete course',
    });
  }
}

export async function toggleCoursePublish(courseId: string, isPublished: boolean): Promise<void> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'toggleCoursePublish' });

  let res;
  try {
    res = await client
      .from('courses')
      .update({ is_published: isPublished, updated_at: new Date().toISOString() })
      .eq('id', courseId);
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'toggleCoursePublish' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'toggleCoursePublish',
      fallbackMessage: 'Failed to toggle course publish status',
    });
  }
}

// -----------------------------------------------------------------------------
// CURRICULUM (UNITS & LESSONS) API
// -----------------------------------------------------------------------------

export async function fetchCourseCurriculum(courseId: string): Promise<{
  course: CourseRecord;
  units: CourseUnitRecord[];
}> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'fetchCourseCurriculum' });

  let cRes;
  try {
    cRes = await client.from('courses').select('*').eq('id', courseId).single();
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'fetchCourseCurriculum' });
  }

  if (cRes.error) {
    throwServiceError(cRes.error, {
      service: SERVICE,
      operation: 'fetchCourseCurriculum',
      fallbackMessage: 'Failed to load course',
    });
  }

  if (!cRes.data) {
    throw new ServiceError({
      category: 'NOT_FOUND',
      message: 'Course not found.',
      service: SERVICE,
      operation: 'fetchCourseCurriculum',
      code: 'PGRST116',
    });
  }

  const c = cRes.data;

  let uRes;
  let lRes;
  try {
    [uRes, lRes] = await Promise.all([
      client
        .from('course_units')
        .select('*')
        .eq('course_id', courseId)
        .order('order_index', { ascending: true }),
      client
        .from('lessons')
        .select(`
          id,
          course_id,
          unit_id,
          title,
          title_arabic,
          description,
          duration_minutes,
          order_index,
          video_url,
          is_published,
          created_at,
          updated_at
        `)
        .eq('course_id', courseId)
        .order('order_index', { ascending: true }),
    ]);
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'fetchCourseCurriculum.structure' });
  }

  if (uRes.error) {
    throwServiceError(uRes.error, {
      service: SERVICE,
      operation: 'fetchCourseCurriculum.units',
      fallbackMessage: 'Failed to fetch course units',
    });
  }
  if (lRes.error) {
    throwServiceError(lRes.error, {
      service: SERVICE,
      operation: 'fetchCourseCurriculum.lessons',
      fallbackMessage: 'Failed to fetch course lessons',
    });
  }

  const lessons = lRes.data || [];
  const lessonIds = lessons.map((l: any) => l.id);
  const resourcesMap = new Map<string, LessonResourceRecord[]>();

  if (lessonIds.length > 0) {
    let resourcesRes;
    try {
      resourcesRes = await client
        .from('lesson_resources')
        .select('*')
        .in('lesson_id', lessonIds)
        .order('created_at', { ascending: true });
    } catch (err) {
      throwServiceError(err, { service: SERVICE, operation: 'fetchCourseCurriculum.resources' });
    }

    if (resourcesRes.error) {
      throwServiceError(resourcesRes.error, {
        service: SERVICE,
        operation: 'fetchCourseCurriculum.resources',
        fallbackMessage: 'Failed to fetch lesson resources',
      });
    }

    for (const r of resourcesRes.data || []) {
      const list = resourcesMap.get(r.lesson_id) || [];
      list.push({
        id: r.id,
        lessonId: r.lesson_id,
        title: r.title,
        titleArabic: r.title_arabic,
        fileUrl: r.file_url,
        storagePath: r.storage_path,
        fileType: r.file_type,
        fileSizeBytes: r.file_size_bytes,
        createdAt: r.created_at,
      });
      resourcesMap.set(r.lesson_id, list);
    }
  }

  const lessonsByUnit = new Map<string, LessonRecord[]>();
  for (const l of lessons) {
    const list = lessonsByUnit.get(l.unit_id) || [];
    list.push({
      id: l.id,
      courseId: l.course_id,
      unitId: l.unit_id,
      title: l.title,
      titleArabic: l.title_arabic,
      description: l.description,
      durationMinutes: l.duration_minutes || 45,
      orderIndex: l.order_index,
      videoUrl: l.video_url,
      isPublished: l.is_published,
      createdAt: l.created_at,
      updatedAt: l.updated_at,
      resources: resourcesMap.get(l.id) || [],
    });
    lessonsByUnit.set(l.unit_id, list);
  }

  const structuredUnits: CourseUnitRecord[] = (uRes.data || []).map((u: any) => ({
    id: u.id,
    courseId: u.course_id,
    title: u.title,
    titleArabic: u.title_arabic,
    orderIndex: u.order_index,
    createdAt: u.created_at,
    lessons: lessonsByUnit.get(u.id) || [],
  }));

  const courseRecord: CourseRecord = {
    id: c.id,
    teacherId: c.teacher_id,
    title: c.title,
    titleArabic: c.title_arabic,
    description: c.description,
    descriptionArabic: c.description_arabic,
    coverImageUrl: c.cover_image_url,
    level: c.level as CourseLevel,
    isPublished: c.is_published,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    unitsCount: structuredUnits.length,
    lessonsCount: lessons.length,
  };

  return { course: courseRecord, units: structuredUnits };
}

export async function createUnit(params: {
  courseId: string;
  title: string;
  titleArabic: string;
}): Promise<CourseUnitRecord> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'createUnit' });

  let existingRes;
  try {
    existingRes = await client
      .from('course_units')
      .select('order_index')
      .eq('course_id', params.courseId)
      .order('order_index', { ascending: false })
      .limit(1);
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'createUnit.orderLookup' });
  }

  if (existingRes.error) {
    throwServiceError(existingRes.error, {
      service: SERVICE,
      operation: 'createUnit.orderLookup',
      fallbackMessage: 'Failed to determine unit ordering',
    });
  }

  const existing = existingRes.data;
  const nextIndex = existing && existing.length > 0 ? (existing[0].order_index || 0) + 1 : 1;

  let res;
  try {
    res = await client
      .from('course_units')
      .insert({
        course_id: params.courseId,
        title: params.title.trim(),
        title_arabic: params.titleArabic.trim(),
        order_index: nextIndex,
      })
      .select('*')
      .single();
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'createUnit' });
  }

  if (res.error || !res.data) {
    throwServiceError(res.error || new Error('Failed to create unit'), {
      service: SERVICE,
      operation: 'createUnit',
      fallbackMessage: 'Failed to create unit',
    });
  }

  const data = res.data;
  return {
    id: data.id,
    courseId: data.course_id,
    title: data.title,
    titleArabic: data.title_arabic,
    orderIndex: data.order_index,
    createdAt: data.created_at,
    lessons: [],
  };
}

export async function updateUnit(params: {
  id: string;
  title: string;
  titleArabic: string;
}): Promise<void> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'updateUnit' });

  let res;
  try {
    res = await client
      .from('course_units')
      .update({
        title: params.title.trim(),
        title_arabic: params.titleArabic.trim(),
      })
      .eq('id', params.id);
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'updateUnit' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'updateUnit',
      fallbackMessage: 'Failed to update unit',
    });
  }
}

export async function deleteUnit(unitId: string): Promise<void> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'deleteUnit' });

  let res;
  try {
    res = await client.from('course_units').delete().eq('id', unitId);
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'deleteUnit' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'deleteUnit',
      fallbackMessage: 'Failed to delete unit',
    });
  }
}

export async function reorderUnits(courseId: string, unitIds: string[]): Promise<void> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'reorderUnits' });

  let res;
  try {
    res = await client.rpc('reorder_course_units', {
      p_course_id: courseId,
      p_unit_ids: unitIds,
    });
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'reorderUnits' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'reorderUnits',
      fallbackMessage: 'Failed to reorder units',
    });
  }
}

export async function createLesson(params: {
  courseId: string;
  unitId: string;
  title: string;
  titleArabic: string;
  description?: string;
  durationMinutes?: number;
  videoUrl?: string;
  isPublished?: boolean;
}): Promise<LessonRecord> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'createLesson' });

  let existingRes;
  try {
    existingRes = await client
      .from('lessons')
      .select('order_index')
      .eq('unit_id', params.unitId)
      .order('order_index', { ascending: false })
      .limit(1);
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'createLesson.orderLookup' });
  }

  if (existingRes.error) {
    throwServiceError(existingRes.error, {
      service: SERVICE,
      operation: 'createLesson.orderLookup',
      fallbackMessage: 'Failed to determine lesson ordering',
    });
  }

  const existing = existingRes.data;
  const nextIndex = existing && existing.length > 0 ? (existing[0].order_index || 0) + 1 : 1;

  let res;
  try {
    res = await client
      .from('lessons')
      .insert({
        course_id: params.courseId,
        unit_id: params.unitId,
        title: params.title.trim(),
        title_arabic: params.titleArabic.trim(),
        description: params.description?.trim() || null,
        duration_minutes: params.durationMinutes || 45,
        order_index: nextIndex,
        video_url: params.videoUrl?.trim() || null,
        is_published: params.isPublished ?? true,
      })
      .select('*')
      .single();
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'createLesson' });
  }

  if (res.error || !res.data) {
    throwServiceError(res.error || new Error('Failed to create lesson'), {
      service: SERVICE,
      operation: 'createLesson',
      fallbackMessage: 'Failed to create lesson',
    });
  }

  const data = res.data;
  return {
    id: data.id,
    courseId: data.course_id,
    unitId: data.unit_id,
    title: data.title,
    titleArabic: data.title_arabic,
    description: data.description,
    durationMinutes: data.duration_minutes || 45,
    orderIndex: data.order_index,
    videoUrl: data.video_url,
    isPublished: data.is_published,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    resources: [],
  };
}

export async function updateLesson(params: {
  id: string;
  title: string;
  titleArabic: string;
  description?: string;
  durationMinutes?: number;
  videoUrl?: string;
  isPublished?: boolean;
}): Promise<void> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'updateLesson' });

  let res;
  try {
    res = await client
      .from('lessons')
      .update({
        title: params.title.trim(),
        title_arabic: params.titleArabic.trim(),
        description: params.description?.trim() || null,
        duration_minutes: params.durationMinutes || 45,
        video_url: params.videoUrl?.trim() || null,
        is_published: params.isPublished,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id);
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'updateLesson' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'updateLesson',
      fallbackMessage: 'Failed to update lesson',
    });
  }
}

export async function deleteLesson(lessonId: string): Promise<void> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'deleteLesson' });

  let res;
  try {
    res = await client.from('lessons').delete().eq('id', lessonId);
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'deleteLesson' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'deleteLesson',
      fallbackMessage: 'Failed to delete lesson',
    });
  }
}

export async function reorderLessons(unitId: string, lessonIds: string[]): Promise<void> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'reorderLessons' });

  let res;
  try {
    res = await client.rpc('reorder_course_lessons', {
      p_unit_id: unitId,
      p_lesson_ids: lessonIds,
    });
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'reorderLessons' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'reorderLessons',
      fallbackMessage: 'Failed to reorder lessons',
    });
  }
}

// -----------------------------------------------------------------------------
// PRIVATE LEARNING RESOURCE STORAGE & MANAGEMENT
// -----------------------------------------------------------------------------

export async function uploadLessonResource(params: {
  courseId: string;
  lessonId: string;
  file: File;
  title: string;
  titleArabic?: string;
}): Promise<LessonResourceRecord> {
  const validation = validateLearningResourceFile(params.file);
  if (!validation.isValid) {
    throw new ServiceError({
      category: 'VALIDATION_ERROR',
      message: validation.error || 'Invalid resource file',
      service: SERVICE,
      operation: 'uploadLessonResource',
    });
  }

  const client = requireSupabaseClient({ service: SERVICE, operation: 'uploadLessonResource' });

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
    throwServiceError(err, { service: SERVICE, operation: 'uploadLessonResource.storage' });
  }

  if (uploadRes.error) {
    throwServiceError(uploadRes.error, {
      service: SERVICE,
      operation: 'uploadLessonResource.storage',
      fallbackMessage: 'Failed to upload resource to storage',
    });
  }

  let dbRes;
  try {
    dbRes = await client
      .from('lesson_resources')
      .insert({
        lesson_id: params.lessonId,
        title: params.title.trim(),
        title_arabic: params.titleArabic?.trim() || null,
        file_url: storagePath,
        storage_path: storagePath,
        file_type: ext,
        file_size_bytes: params.file.size,
      })
      .select('*')
      .single();
  } catch (err) {
    try {
      await client.storage.from(STORAGE_BUCKET).remove([storagePath]);
    } catch {
      // ignore rollback failure
    }
    throwServiceError(err, { service: SERVICE, operation: 'uploadLessonResource.db' });
  }

  if (dbRes.error || !dbRes.data) {
    try {
      await client.storage.from(STORAGE_BUCKET).remove([storagePath]);
    } catch {
      // ignore rollback failure
    }
    throwServiceError(dbRes.error || new Error('Failed to save resource record'), {
      service: SERVICE,
      operation: 'uploadLessonResource.db',
      fallbackMessage: 'Failed to save resource record',
    });
  }

  const data = dbRes.data;
  return {
    id: data.id,
    lessonId: data.lesson_id,
    title: data.title,
    titleArabic: data.title_arabic,
    fileUrl: data.file_url,
    storagePath: data.storage_path,
    fileType: data.file_type,
    fileSizeBytes: data.file_size_bytes,
    createdAt: data.created_at,
  };
}

export async function addLessonResource(params: {
  lessonId: string;
  title: string;
  titleArabic?: string;
  fileUrl: string;
  fileType?: string;
}): Promise<LessonResourceRecord> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'addLessonResource' });
  const ext = params.fileType || params.fileUrl.split('.').pop()?.toLowerCase() || 'pdf';

  let res;
  try {
    res = await client
      .from('lesson_resources')
      .insert({
        lesson_id: params.lessonId,
        title: params.title.trim(),
        title_arabic: params.titleArabic?.trim() || null,
        file_url: params.fileUrl.trim(),
        storage_path: null,
        file_type: ext,
        file_size_bytes: null,
      })
      .select('*')
      .single();
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'addLessonResource' });
  }

  if (res.error || !res.data) {
    throwServiceError(res.error || new Error('Failed to add resource'), {
      service: SERVICE,
      operation: 'addLessonResource',
      fallbackMessage: 'Failed to add resource',
    });
  }

  const data = res.data;
  return {
    id: data.id,
    lessonId: data.lesson_id,
    title: data.title,
    titleArabic: data.title_arabic,
    fileUrl: data.file_url,
    storagePath: data.storage_path,
    fileType: data.file_type,
    fileSizeBytes: data.file_size_bytes,
    createdAt: data.created_at,
  };
}

export async function getLessonResourceDownloadUrl(resourceId: string): Promise<string> {
  const client = requireSupabaseClient({
    service: SERVICE,
    operation: 'getLessonResourceDownloadUrl',
  });

  let res;
  try {
    res = await client
      .from('lesson_resources')
      .select('id, file_url, storage_path')
      .eq('id', resourceId)
      .single();
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'getLessonResourceDownloadUrl' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'getLessonResourceDownloadUrl',
      fallbackMessage: 'Resource not accessible or unauthorized',
    });
  }

  if (!res.data) {
    throw new ServiceError({
      category: 'NOT_FOUND',
      message: 'Resource not found.',
      service: SERVICE,
      operation: 'getLessonResourceDownloadUrl',
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
    throwServiceError(err, {
      service: SERVICE,
      operation: 'getLessonResourceDownloadUrl.signedUrl',
    });
  }

  if (signedRes.error || !signedRes.data?.signedUrl) {
    throwServiceError(signedRes.error || new Error('Failed to generate download URL'), {
      service: SERVICE,
      operation: 'getLessonResourceDownloadUrl.signedUrl',
      fallbackMessage: 'Failed to generate download URL',
    });
  }

  return signedRes.data.signedUrl;
}

export async function deleteLessonResource(resourceId: string): Promise<void> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'deleteLessonResource' });

  let metaRes;
  try {
    metaRes = await client
      .from('lesson_resources')
      .select('id, storage_path, file_url')
      .eq('id', resourceId)
      .maybeSingle();
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'deleteLessonResource.metadata' });
  }

  if (metaRes.error) {
    throwServiceError(metaRes.error, {
      service: SERVICE,
      operation: 'deleteLessonResource.metadata',
      fallbackMessage: 'Failed to fetch resource metadata',
    });
  }

  let dbRes;
  try {
    dbRes = await client.from('lesson_resources').delete().eq('id', resourceId);
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'deleteLessonResource.db' });
  }

  if (dbRes.error) {
    throwServiceError(dbRes.error, {
      service: SERVICE,
      operation: 'deleteLessonResource.db',
      fallbackMessage: 'Failed to delete resource',
    });
  }

  const meta = metaRes.data;
  const pathToDelete =
    meta?.storage_path ||
    (meta?.file_url && !meta.file_url.startsWith('https://') ? meta.file_url : null);
  if (pathToDelete) {
    let rmRes;
    try {
      rmRes = await client.storage.from(STORAGE_BUCKET).remove([pathToDelete]);
    } catch (err) {
      throwServiceError(err, { service: SERVICE, operation: 'deleteLessonResource.storage' });
    }
    if (rmRes.error) {
      throwServiceError(rmRes.error, {
        service: SERVICE,
        operation: 'deleteLessonResource.storage',
        fallbackMessage: 'Failed to remove resource file from storage',
      });
    }
  }
}

// -----------------------------------------------------------------------------
// COURSE GROUP ASSIGNMENT API
// -----------------------------------------------------------------------------

export async function fetchCourseAssignedGroups(courseId: string): Promise<
  {
    id: string;
    name: string;
    nameArabic: string;
    assignedAt: string;
    studentCount: number;
  }[]
> {
  const client = requireSupabaseClient({
    service: SERVICE,
    operation: 'fetchCourseAssignedGroups',
  });

  let res;
  try {
    res = await client
      .from('group_courses')
      .select(`
        assigned_at,
        group_id,
        groups:group_id (
          id,
          name,
          name_arabic,
          archived_at
        )
      `)
      .eq('course_id', courseId);
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'fetchCourseAssignedGroups' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'fetchCourseAssignedGroups',
      fallbackMessage: 'Failed to fetch assigned groups',
    });
  }

  const data = res.data || [];
  if (data.length === 0) return [];

  const groupIds = data.map((d: any) => d.group_id);
  let countsRes;
  try {
    countsRes = await client.from('group_students').select('group_id').in('group_id', groupIds);
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'fetchCourseAssignedGroups.counts' });
  }

  if (countsRes.error) {
    throwServiceError(countsRes.error, {
      service: SERVICE,
      operation: 'fetchCourseAssignedGroups.counts',
      fallbackMessage: 'Failed to load student counts for assigned groups',
    });
  }

  const countMap = new Map<string, number>();
  for (const c of countsRes.data || []) {
    countMap.set(c.group_id, (countMap.get(c.group_id) || 0) + 1);
  }

  return data
    .filter((d: any) => d.groups && !d.groups.archived_at)
    .map((d: any) => ({
      id: d.groups.id,
      name: d.groups.name,
      nameArabic: d.groups.name_arabic,
      assignedAt: d.assigned_at,
      studentCount: countMap.get(d.groups.id) || 0,
    }));
}

export async function assignCourseToGroup(courseId: string, groupId: string): Promise<void> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'assignCourseToGroup' });

  let res;
  try {
    res = await client.rpc('assign_course_to_group', {
      p_course_id: courseId,
      p_group_id: groupId,
    });
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'assignCourseToGroup' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'assignCourseToGroup',
      fallbackMessage: 'Failed to assign course to group',
    });
  }
}

export async function removeCourseFromGroup(courseId: string, groupId: string): Promise<void> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'removeCourseFromGroup' });

  let res;
  try {
    res = await client.rpc('remove_course_from_group', {
      p_course_id: courseId,
      p_group_id: groupId,
    });
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'removeCourseFromGroup' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'removeCourseFromGroup',
      fallbackMessage: 'Failed to remove course from group',
    });
  }
}

// -----------------------------------------------------------------------------
// STUDENT LEARNING API
// -----------------------------------------------------------------------------

export async function fetchStudentCourses(): Promise<StudentCourseSummary[]> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'fetchStudentCourses' });

  let coursesRes;
  try {
    coursesRes = await client
      .from('courses')
      .select(`
        id,
        title,
        title_arabic,
        description,
        description_arabic,
        cover_image_url,
        level,
        is_published
      `)
      .eq('is_published', true);
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'fetchStudentCourses' });
  }

  if (coursesRes.error) {
    throwServiceError(coursesRes.error, {
      service: SERVICE,
      operation: 'fetchStudentCourses',
      fallbackMessage: 'Failed to fetch student courses',
    });
  }

  const courses = coursesRes.data || [];
  if (courses.length === 0) return [];

  const courseIds = courses.map((c: any) => c.id);

  let lessonsRes;
  try {
    lessonsRes = await client
      .from('lessons')
      .select('id, course_id')
      .in('course_id', courseIds)
      .eq('is_published', true);
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'fetchStudentCourses.lessons' });
  }

  if (lessonsRes.error) {
    throwServiceError(lessonsRes.error, {
      service: SERVICE,
      operation: 'fetchStudentCourses.lessons',
      fallbackMessage: 'Failed to load published course lessons',
    });
  }

  const lessons = lessonsRes.data || [];
  const totalLessonsMap = new Map<string, number>();
  const lessonIds: string[] = [];
  for (const l of lessons) {
    totalLessonsMap.set(l.course_id, (totalLessonsMap.get(l.course_id) || 0) + 1);
    lessonIds.push(l.id);
  }

  const completedMap = new Map<string, number>();
  if (lessonIds.length > 0) {
    let progressRes;
    try {
      progressRes = await client
        .from('lesson_progress')
        .select('lesson_id, is_completed')
        .in('lesson_id', lessonIds)
        .eq('is_completed', true);
    } catch (err) {
      throwServiceError(err, { service: SERVICE, operation: 'fetchStudentCourses.progress' });
    }

    if (progressRes.error) {
      throwServiceError(progressRes.error, {
        service: SERVICE,
        operation: 'fetchStudentCourses.progress',
        fallbackMessage: 'Failed to load course completion progress',
      });
    }

    const lessonToCourse = new Map<string, string>();
    for (const l of lessons) lessonToCourse.set(l.id, l.course_id);

    for (const p of progressRes.data || []) {
      const cId = lessonToCourse.get(p.lesson_id);
      if (cId) {
        completedMap.set(cId, (completedMap.get(cId) || 0) + 1);
      }
    }
  }

  return courses.map((c: any) => {
    const total = totalLessonsMap.get(c.id) || 0;
    const completed = completedMap.get(c.id) || 0;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return {
      id: c.id,
      title: c.title,
      titleArabic: c.title_arabic,
      description: c.description,
      descriptionArabic: c.description_arabic,
      coverImageUrl: c.cover_image_url,
      level: c.level as CourseLevel,
      totalLessons: total,
      completedLessons: completed,
      progressPercentage: pct,
    };
  });
}

export async function fetchStudentCourseDetails(courseId: string): Promise<{
  course: CourseRecord;
  units: CourseUnitRecord[];
  totalLessons: number;
  completedLessons: number;
  progressPercentage: number;
}> {
  const client = requireSupabaseClient({
    service: SERVICE,
    operation: 'fetchStudentCourseDetails',
  });

  let cRes;
  try {
    cRes = await client.from('courses').select('*').eq('id', courseId).single();
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'fetchStudentCourseDetails' });
  }

  if (cRes.error) {
    throwServiceError(cRes.error, {
      service: SERVICE,
      operation: 'fetchStudentCourseDetails',
      fallbackMessage: 'Failed to load course details',
    });
  }

  if (!cRes.data) {
    throw new ServiceError({
      category: 'NOT_FOUND',
      message: 'Course not found.',
      service: SERVICE,
      operation: 'fetchStudentCourseDetails',
      code: 'PGRST116',
    });
  }

  const c = cRes.data;

  let uRes;
  let lRes;
  try {
    [uRes, lRes] = await Promise.all([
      client
        .from('course_units')
        .select('*')
        .eq('course_id', courseId)
        .order('order_index', { ascending: true }),
      client
        .from('lessons')
        .select(`
          id,
          course_id,
          unit_id,
          title,
          title_arabic,
          description,
          duration_minutes,
          order_index,
          video_url,
          is_published,
          created_at,
          updated_at
        `)
        .eq('course_id', courseId)
        .eq('is_published', true)
        .order('order_index', { ascending: true }),
    ]);
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'fetchStudentCourseDetails.structure' });
  }

  if (uRes.error) {
    throwServiceError(uRes.error, {
      service: SERVICE,
      operation: 'fetchStudentCourseDetails.units',
      fallbackMessage: 'Failed to fetch course units',
    });
  }
  if (lRes.error) {
    throwServiceError(lRes.error, {
      service: SERVICE,
      operation: 'fetchStudentCourseDetails.lessons',
      fallbackMessage: 'Failed to fetch published lessons',
    });
  }

  const lessons = lRes.data || [];
  const lessonIds = lessons.map((l: any) => l.id);

  let resourcesRows: any[] = [];
  let progressRows: any[] = [];

  if (lessonIds.length > 0) {
    let resData;
    let progData;
    try {
      [resData, progData] = await Promise.all([
        client.from('lesson_resources').select('*').in('lesson_id', lessonIds),
        client.from('lesson_progress').select('*').in('lesson_id', lessonIds),
      ]);
    } catch (err) {
      throwServiceError(err, {
        service: SERVICE,
        operation: 'fetchStudentCourseDetails.attachmentsAndProgress',
      });
    }

    if (resData.error) {
      throwServiceError(resData.error, {
        service: SERVICE,
        operation: 'fetchStudentCourseDetails.resources',
        fallbackMessage: 'Failed to fetch lesson resources',
      });
    }
    if (progData.error) {
      throwServiceError(progData.error, {
        service: SERVICE,
        operation: 'fetchStudentCourseDetails.progress',
        fallbackMessage: 'Failed to fetch lesson progress',
      });
    }

    resourcesRows = resData.data || [];
    progressRows = progData.data || [];
  }

  const resourcesMap = new Map<string, LessonResourceRecord[]>();
  for (const r of resourcesRows) {
    const list = resourcesMap.get(r.lesson_id) || [];
    list.push({
      id: r.id,
      lessonId: r.lesson_id,
      title: r.title,
      titleArabic: r.title_arabic,
      fileUrl: r.file_url,
      storagePath: r.storage_path,
      fileType: r.file_type,
      fileSizeBytes: r.file_size_bytes,
      createdAt: r.created_at,
    });
    resourcesMap.set(r.lesson_id, list);
  }

  const progressMap = new Map<
    string,
    { isCompleted: boolean; watchSeconds: number; lastAccessedAt?: string }
  >();
  const totalCount = lessons.length;
  let completedCount = 0;

  for (const p of progressRows) {
    progressMap.set(p.lesson_id, {
      isCompleted: p.is_completed,
      watchSeconds: p.watch_seconds,
      lastAccessedAt: p.last_accessed_at,
    });
    if (p.is_completed) completedCount++;
  }

  const lessonsByUnit = new Map<string, LessonRecord[]>();
  for (const l of lessons) {
    const list = lessonsByUnit.get(l.unit_id) || [];
    list.push({
      id: l.id,
      courseId: l.course_id,
      unitId: l.unit_id,
      title: l.title,
      titleArabic: l.title_arabic,
      description: l.description,
      durationMinutes: l.duration_minutes || 45,
      orderIndex: l.order_index,
      videoUrl: l.video_url,
      isPublished: l.is_published,
      createdAt: l.created_at,
      updatedAt: l.updated_at,
      resources: resourcesMap.get(l.id) || [],
      progress: progressMap.get(l.id) || null,
    });
    lessonsByUnit.set(l.unit_id, list);
  }

  const structuredUnits: CourseUnitRecord[] = (uRes.data || []).map((u: any) => ({
    id: u.id,
    courseId: u.course_id,
    title: u.title,
    titleArabic: u.title_arabic,
    orderIndex: u.order_index,
    createdAt: u.created_at,
    lessons: lessonsByUnit.get(u.id) || [],
  }));

  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return {
    course: {
      id: c.id,
      teacherId: c.teacher_id,
      title: c.title,
      titleArabic: c.title_arabic,
      description: c.description,
      descriptionArabic: c.description_arabic,
      coverImageUrl: c.cover_image_url,
      level: c.level as CourseLevel,
      isPublished: c.is_published,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      unitsCount: structuredUnits.length,
      lessonsCount: totalCount,
    },
    units: structuredUnits,
    totalLessons: totalCount,
    completedLessons: completedCount,
    progressPercentage: progressPct,
  };
}

export async function recordLessonProgress(
  lessonId: string,
  isCompleted: boolean,
  watchSeconds?: number
): Promise<void> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'recordLessonProgress' });

  let res;
  try {
    res = await client.rpc('record_lesson_progress', {
      p_lesson_id: lessonId,
      p_is_completed: isCompleted,
      p_watch_seconds: watchSeconds ?? 0,
    });
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'recordLessonProgress' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'recordLessonProgress',
      fallbackMessage: 'Failed to record lesson progress',
    });
  }
}
