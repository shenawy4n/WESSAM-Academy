/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { supabase } from '../../lib/supabase/client';

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
    return { isValid: false, error: `File size exceeds 25 MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB)` };
  }

  const nameParts = file.name.split('.');
  const ext = (nameParts[nameParts.length - 1] || '').toLowerCase();

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { isValid: false, error: `Disallowed file extension .${ext}. Permitted formats: PDF, DOCX, PPTX, ZIP, JPG, PNG` };
  }

  if (file.type && !ALLOWED_MIME_TYPES.has(file.type)) {
    return { isValid: false, error: `Disallowed MIME type ${file.type}` };
  }

  return { isValid: true };
}

// -----------------------------------------------------------------------------
// Preview Demo Data for Offline / Inspection Mode
// -----------------------------------------------------------------------------
const DEMO_COURSES: CourseRecord[] = [
  {
    id: 'cccccccc-1111-4111-8111-111111111111',
    teacherId: '11111111-1111-4111-8111-111111111111',
    title: 'IELTS Academic Writing & Speaking Mastery',
    titleArabic: 'إتقان الكتابة والمحادثة الأكاديمية لاختبار الآيلتس',
    description: 'Comprehensive preparation designed for Saudi students targeting Band 7.0+ in IELTS Academic writing task 1 & 2, alongside fluent speaking techniques.',
    descriptionArabic: 'برنامج تدريبي متكامل موجه للطلاب السعوديين لتحقيق درجة 7.0 فما فوق في مهام الكتابة الأكاديمية والتحدث بطلاقة بإشراف الأستاذ وسام.',
    coverImageUrl: 'https://images.unsplash.com/photo-1546410531-bb4caa6b424d?auto=format&fit=crop&w=800&q=80',
    level: 'advanced',
    isPublished: true,
    createdAt: '2026-09-01T08:00:00Z',
    updatedAt: '2026-09-15T12:00:00Z',
    unitsCount: 2,
    lessonsCount: 4,
    assignedGroupsCount: 1,
    assignedGroups: [
      { id: 'demo-group-1', name: 'Group A - Intensive IELTS Prep', nameArabic: 'المجموعة أ - الإعداد المكثف للآيلتس', studentCount: 2 },
    ],
  },
  {
    id: 'cccccccc-2222-4222-8222-222222222222',
    teacherId: '11111111-1111-4111-8111-111111111111',
    title: 'English Grammar Foundations & Sentence Structure',
    titleArabic: 'أساسيات قواعد اللغة الإنجليزية وبناء الجملة السليمة',
    description: 'Master core tenses, active vs passive voice, conditionals, and sentence mechanics with practical Saudi academic context.',
    descriptionArabic: 'إتقان الأزمنة الرئيسية، المبني للمعلوم والمجهول، الجمل الشرطية، وتراكيب الجمل الإنجليزية المعاصرة مع تطبيقات عملية.',
    coverImageUrl: 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=800&q=80',
    level: 'intermediate',
    isPublished: true,
    createdAt: '2026-09-05T09:00:00Z',
    updatedAt: '2026-09-20T14:00:00Z',
    unitsCount: 1,
    lessonsCount: 1,
    assignedGroupsCount: 2,
    assignedGroups: [
      { id: 'demo-group-1', name: 'Group A - Intensive IELTS Prep', nameArabic: 'المجموعة أ - الإعداد المكثف للآيلتس', studentCount: 2 },
      { id: 'demo-group-2', name: 'Group B - Advanced Academic English', nameArabic: 'المجموعة ب - الإنجليزية الأكاديمية المتقدمة', studentCount: 1 },
    ],
  },
  {
    id: 'cccccccc-3333-4333-8333-333333333333',
    teacherId: '11111111-1111-4111-8111-111111111111',
    title: 'Secondary English Enrichment (Draft)',
    titleArabic: 'إثراء اللغة الإنجليزية للمرحلة الثانوية (مسودة)',
    description: 'Upcoming supplementary curriculum aligning with Saudi high school standards and vocabulary expansion.',
    descriptionArabic: 'منهج إثرائي قيد الإعداد يتماشى مع معايير وزارة التعليم للمرحلة الثانوية وتوسيع الحصيلة اللغوية.',
    coverImageUrl: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=800&q=80',
    level: 'beginner',
    isPublished: false,
    createdAt: '2026-09-28T10:00:00Z',
    updatedAt: '2026-09-28T10:00:00Z',
    unitsCount: 1,
    lessonsCount: 1,
    assignedGroupsCount: 0,
    assignedGroups: [],
  },
];

const DEMO_CURRICULUM: Record<string, CourseUnitRecord[]> = {
  'cccccccc-1111-4111-8111-111111111111': [
    {
      id: '44444444-1111-4111-8111-111111111111',
      courseId: 'cccccccc-1111-4111-8111-111111111111',
      title: 'Unit 1: Academic Writing Task 2 — Argumentative Essays',
      titleArabic: 'الوحدة 1: مهمة الكتابة الأكاديمية 2 — المقالات الجدلية',
      orderIndex: 1,
      createdAt: '2026-09-01T08:30:00Z',
      lessons: [
        {
          id: '55555555-1111-4111-8111-111111111111',
          courseId: 'cccccccc-1111-4111-8111-111111111111',
          unitId: '44444444-1111-4111-8111-111111111111',
          title: 'Lesson 1.1: Analyzing the Prompt & Generating Band 7 Ideas',
          titleArabic: 'الدرس 1.1: تحليل نص السؤال وتوليد الأفكار لدرجة 7+',
          description: 'Learn Mr. Wessam\'s 4-step framework to deconstruct any IELTS prompt, identify key question words, and plan balanced body paragraphs.',
          durationMinutes: 45,
          orderIndex: 1,
          videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          isPublished: true,
          createdAt: '2026-09-01T09:00:00Z',
          updatedAt: '2026-09-01T09:00:00Z',
          resources: [
            {
              id: '66666666-1111-4111-8111-111111111111',
              lessonId: '55555555-1111-4111-8111-111111111111',
              title: 'IELTS Task 2 Planning Template (PDF)',
              titleArabic: 'نموذج التخطيط لمقالة الآيلتس (PDF)',
              fileUrl: 'courses/cccccccc-1111-4111-8111-111111111111/lessons/55555555-1111-4111-8111-111111111111/task2-template.pdf',
              storagePath: 'courses/cccccccc-1111-4111-8111-111111111111/lessons/55555555-1111-4111-8111-111111111111/task2-template.pdf',
              fileType: 'pdf',
              fileSizeBytes: 1250000,
              createdAt: '2026-09-01T10:00:00Z',
            },
          ],
          progress: { isCompleted: true, watchSeconds: 2700, lastAccessedAt: '2026-10-01T14:00:00Z' },
        },
        {
          id: '55555555-2222-4222-8222-222222222222',
          courseId: 'cccccccc-1111-4111-8111-111111111111',
          unitId: '44444444-1111-4111-8111-111111111111',
          title: 'Lesson 1.2: Mastering Academic Cohesive Devices',
          titleArabic: 'الدرس 1.2: إتقان أدوات الربط والتماسك الأكاديمي',
          description: 'Avoid repetitive linking words like "moreover" and discover contextual transition techniques for maximum cohesion marks.',
          durationMinutes: 50,
          orderIndex: 2,
          videoUrl: 'https://vimeo.com/76979871',
          isPublished: true,
          createdAt: '2026-09-03T09:00:00Z',
          updatedAt: '2026-09-03T09:00:00Z',
          resources: [
            {
              id: '66666666-2222-4222-8222-222222222222',
              lessonId: '55555555-2222-4222-8222-222222222222',
              title: 'Academic Linking Words Cheat Sheet',
              titleArabic: 'جدول أدوات الربط الأكاديمية الاحترافية',
              fileUrl: 'courses/cccccccc-1111-4111-8111-111111111111/lessons/55555555-2222-4222-8222-222222222222/cohesive-devices.pdf',
              storagePath: 'courses/cccccccc-1111-4111-8111-111111111111/lessons/55555555-2222-4222-8222-222222222222/cohesive-devices.pdf',
              fileType: 'pdf',
              fileSizeBytes: 890000,
              createdAt: '2026-09-03T10:00:00Z',
            },
          ],
          progress: { isCompleted: false, watchSeconds: 840, lastAccessedAt: '2026-10-02T15:30:00Z' },
        },
      ],
    },
    {
      id: '44444444-2222-4222-8222-222222222222',
      courseId: 'cccccccc-1111-4111-8111-111111111111',
      title: 'Unit 2: IELTS Speaking Fluency & Topic Vocabulary',
      titleArabic: 'الوحدة 2: طلاقة التحدث في الآيلتس ومفردات المواضيع الشائعة',
      orderIndex: 2,
      createdAt: '2026-09-05T08:30:00Z',
      lessons: [
        {
          id: '55555555-3333-4333-8333-333333333333',
          courseId: 'cccccccc-1111-4111-8111-111111111111',
          unitId: '44444444-2222-4222-8222-222222222222',
          title: 'Lesson 2.1: Part 2 Long Turn — 2-Minute Speech Technique',
          titleArabic: 'الدرس 2.1: الجزء الثاني — تكنيك التحدث المتواصل لدقيقتين',
          description: 'Structure your notes during the 1-minute prep time and speak fluently without awkward pauses.',
          durationMinutes: 40,
          orderIndex: 1,
          videoUrl: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
          isPublished: true,
          createdAt: '2026-09-05T09:00:00Z',
          updatedAt: '2026-09-05T09:00:00Z',
          resources: [],
          progress: { isCompleted: false, watchSeconds: 0 },
        },
      ],
    },
  ],
};

// -----------------------------------------------------------------------------
// TEACHER & SUPER ADMIN API
// -----------------------------------------------------------------------------

export async function fetchTeacherCourses(filter?: {
  status?: 'all' | 'published' | 'draft';
  level?: string;
  search?: string;
}): Promise<CourseRecord[]> {
  if (!supabase) {
    let result = [...DEMO_COURSES];
    if (filter?.status === 'published') result = result.filter((c) => c.isPublished);
    if (filter?.status === 'draft') result = result.filter((c) => !c.isPublished);
    if (filter?.level && filter.level !== 'all') result = result.filter((c) => c.level === filter.level);
    if (filter?.search) {
      const q = filter.search.toLowerCase().trim();
      result = result.filter((c) =>
        c.title.toLowerCase().includes(q) ||
        c.titleArabic.toLowerCase().includes(q) ||
        (c.description && c.description.toLowerCase().includes(q))
      );
    }
    return result;
  }

  let query = supabase
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

  const { data: courses, error } = await query;
  if (error) throw new Error(`Failed to fetch courses: ${error.message}`);
  if (!courses || courses.length === 0) return [];

  const courseIds = courses.map((c) => c.id);

  const [unitsRes, lessonsRes, groupsRes] = await Promise.all([
    supabase.from('course_units').select('id, course_id').in('course_id', courseIds),
    supabase.from('lessons').select('id, course_id').in('course_id', courseIds),
    supabase
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

  return courses.map((c) => {
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
  if (!supabase) {
    const newCourse: CourseRecord = {
      id: `cccccccc-${Date.now().toString(16).padStart(4, '0')}-4000-8000-000000000000`,
      teacherId: '11111111-1111-4111-8111-111111111111',
      title: params.title.trim(),
      titleArabic: params.titleArabic.trim(),
      description: params.description?.trim() || null,
      descriptionArabic: params.descriptionArabic?.trim() || null,
      level: params.level,
      coverImageUrl: params.coverImageUrl?.trim() || null,
      isPublished: params.isPublished ?? false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      unitsCount: 0,
      lessonsCount: 0,
      assignedGroupsCount: 0,
      assignedGroups: [],
    };
    DEMO_COURSES.unshift(newCourse);
    DEMO_CURRICULUM[newCourse.id] = [];
    return newCourse;
  }

  const { data: userRes } = await supabase.auth.getUser();
  const callerId = userRes?.user?.id;
  if (!callerId) throw new Error('Not authenticated');

  // Enforces authenticated caller's own profile ID as teacher_id
  const { data, error } = await supabase
    .from('courses')
    .insert({
      teacher_id: callerId,
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

  if (error) throw new Error(`Failed to create course: ${error.message}`);

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
  if (!supabase) {
    const course = DEMO_COURSES.find((c) => c.id === params.id);
    if (course) {
      course.title = params.title.trim();
      course.titleArabic = params.titleArabic.trim();
      course.description = params.description?.trim() || null;
      course.descriptionArabic = params.descriptionArabic?.trim() || null;
      course.level = params.level;
      course.coverImageUrl = params.coverImageUrl?.trim() || null;
      if (params.isPublished !== undefined) course.isPublished = params.isPublished;
      course.updatedAt = new Date().toISOString();
    }
    return;
  }

  const { error } = await supabase
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

  if (error) throw new Error(`Failed to update course: ${error.message}`);
}

export async function deleteCourse(courseId: string): Promise<void> {
  if (!supabase) {
    const idx = DEMO_COURSES.findIndex((c) => c.id === courseId);
    if (idx !== -1) DEMO_COURSES.splice(idx, 1);
    delete DEMO_CURRICULUM[courseId];
    return;
  }

  const { error } = await supabase.from('courses').delete().eq('id', courseId);
  if (error) throw new Error(`Failed to delete course: ${error.message}`);
}

export async function toggleCoursePublish(courseId: string, isPublished: boolean): Promise<void> {
  if (!supabase) {
    const course = DEMO_COURSES.find((c) => c.id === courseId);
    if (course) {
      course.isPublished = isPublished;
      course.updatedAt = new Date().toISOString();
    }
    return;
  }

  const { error } = await supabase
    .from('courses')
    .update({ is_published: isPublished, updated_at: new Date().toISOString() })
    .eq('id', courseId);

  if (error) throw new Error(`Failed to toggle publish status: ${error.message}`);
}

// -----------------------------------------------------------------------------
// CURRICULUM (UNITS & LESSONS) API
// -----------------------------------------------------------------------------

export async function fetchCourseCurriculum(courseId: string): Promise<{
  course: CourseRecord;
  units: CourseUnitRecord[];
}> {
  if (!supabase) {
    const course = DEMO_COURSES.find((c) => c.id === courseId) || DEMO_COURSES[0];
    const units = DEMO_CURRICULUM[courseId] || [];
    return { course, units };
  }

  const { data: c, error: cErr } = await supabase
    .from('courses')
    .select('*')
    .eq('id', courseId)
    .single();

  if (cErr || !c) throw new Error(`Course not found: ${cErr?.message}`);

  const { data: units, error: uErr } = await supabase
    .from('course_units')
    .select('*')
    .eq('course_id', courseId)
    .order('order_index', { ascending: true });

  if (uErr) throw new Error(`Failed to fetch units: ${uErr.message}`);

  const { data: lessons, error: lErr } = await supabase
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
    .order('order_index', { ascending: true });

  if (lErr) throw new Error(`Failed to fetch lessons: ${lErr.message}`);

  const lessonIds = (lessons || []).map((l) => l.id);
  const resourcesMap = new Map<string, LessonResourceRecord[]>();
  if (lessonIds.length > 0) {
    const { data: resources } = await supabase
      .from('lesson_resources')
      .select('*')
      .in('lesson_id', lessonIds)
      .order('created_at', { ascending: true });

    if (resources) {
      for (const r of resources) {
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
  }

  const lessonsByUnit = new Map<string, LessonRecord[]>();
  for (const l of lessons || []) {
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

  const structuredUnits: CourseUnitRecord[] = (units || []).map((u) => ({
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
    lessonsCount: (lessons || []).length,
  };

  return { course: courseRecord, units: structuredUnits };
}

export async function createUnit(params: {
  courseId: string;
  title: string;
  titleArabic: string;
}): Promise<CourseUnitRecord> {
  if (!supabase) {
    const units = DEMO_CURRICULUM[params.courseId] || [];
    const newUnit: CourseUnitRecord = {
      id: `44444444-${Date.now().toString(16).padStart(4, '0')}-4000-8000-000000000000`,
      courseId: params.courseId,
      title: params.title.trim(),
      titleArabic: params.titleArabic.trim(),
      orderIndex: units.length + 1,
      createdAt: new Date().toISOString(),
      lessons: [],
    };
    units.push(newUnit);
    DEMO_CURRICULUM[params.courseId] = units;
    return newUnit;
  }

  const { data: existing } = await supabase
    .from('course_units')
    .select('order_index')
    .eq('course_id', params.courseId)
    .order('order_index', { ascending: false })
    .limit(1);

  const nextIndex = existing && existing.length > 0 ? (existing[0].order_index || 0) + 1 : 1;

  const { data, error } = await supabase
    .from('course_units')
    .insert({
      course_id: params.courseId,
      title: params.title.trim(),
      title_arabic: params.titleArabic.trim(),
      order_index: nextIndex,
    })
    .select('*')
    .single();

  if (error) throw new Error(`Failed to create unit: ${error.message}`);

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
  if (!supabase) {
    for (const list of Object.values(DEMO_CURRICULUM)) {
      const u = list.find((item) => item.id === params.id);
      if (u) {
        u.title = params.title.trim();
        u.titleArabic = params.titleArabic.trim();
        break;
      }
    }
    return;
  }

  const { error } = await supabase
    .from('course_units')
    .update({
      title: params.title.trim(),
      title_arabic: params.titleArabic.trim(),
    })
    .eq('id', params.id);

  if (error) throw new Error(`Failed to update unit: ${error.message}`);
}

export async function deleteUnit(unitId: string): Promise<void> {
  if (!supabase) {
    for (const [cId, list] of Object.entries(DEMO_CURRICULUM)) {
      const idx = list.findIndex((u) => u.id === unitId);
      if (idx !== -1) {
        list.splice(idx, 1);
        DEMO_CURRICULUM[cId] = list;
        break;
      }
    }
    return;
  }

  const { error } = await supabase.from('course_units').delete().eq('id', unitId);
  if (error) throw new Error(`Failed to delete unit: ${error.message}`);
}

export async function reorderUnits(courseId: string, unitIds: string[]): Promise<void> {
  if (!supabase) {
    const list = DEMO_CURRICULUM[courseId] || [];
    const sorted = [...list].sort((a, b) => unitIds.indexOf(a.id) - unitIds.indexOf(b.id));
    sorted.forEach((u, idx) => {
      u.orderIndex = idx + 1;
    });
    DEMO_CURRICULUM[courseId] = sorted;
    return;
  }

  const { error } = await supabase.rpc('reorder_course_units', {
    p_course_id: courseId,
    p_unit_ids: unitIds,
  });

  if (error) throw new Error(error.message || 'Failed to reorder units');
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
  if (!supabase) {
    const list = DEMO_CURRICULUM[params.courseId] || [];
    const unit = list.find((u) => u.id === params.unitId);
    const newLesson: LessonRecord = {
      id: `55555555-${Date.now().toString(16).padStart(4, '0')}-4000-8000-000000000000`,
      courseId: params.courseId,
      unitId: params.unitId,
      title: params.title.trim(),
      titleArabic: params.titleArabic.trim(),
      description: params.description?.trim() || null,
      durationMinutes: params.durationMinutes || 45,
      orderIndex: (unit?.lessons.length || 0) + 1,
      videoUrl: params.videoUrl?.trim() || null,
      isPublished: params.isPublished ?? true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      resources: [],
    };
    unit?.lessons.push(newLesson);
    return newLesson;
  }

  const { data: existing } = await supabase
    .from('lessons')
    .select('order_index')
    .eq('unit_id', params.unitId)
    .order('order_index', { ascending: false })
    .limit(1);

  const nextIndex = existing && existing.length > 0 ? (existing[0].order_index || 0) + 1 : 1;

  const { data, error } = await supabase
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

  if (error) throw new Error(`Failed to create lesson: ${error.message}`);

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
  if (!supabase) {
    for (const list of Object.values(DEMO_CURRICULUM)) {
      for (const unit of list) {
        const l = unit.lessons.find((item) => item.id === params.id);
        if (l) {
          l.title = params.title.trim();
          l.titleArabic = params.titleArabic.trim();
          l.description = params.description?.trim() || null;
          if (params.durationMinutes !== undefined) l.durationMinutes = params.durationMinutes;
          l.videoUrl = params.videoUrl?.trim() || null;
          if (params.isPublished !== undefined) l.isPublished = params.isPublished;
          l.updatedAt = new Date().toISOString();
          return;
        }
      }
    }
    return;
  }

  const { error } = await supabase
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

  if (error) throw new Error(`Failed to update lesson: ${error.message}`);
}

export async function deleteLesson(lessonId: string): Promise<void> {
  if (!supabase) {
    for (const list of Object.values(DEMO_CURRICULUM)) {
      for (const unit of list) {
        const idx = unit.lessons.findIndex((l) => l.id === lessonId);
        if (idx !== -1) {
          unit.lessons.splice(idx, 1);
          return;
        }
      }
    }
    return;
  }

  const { error } = await supabase.from('lessons').delete().eq('id', lessonId);
  if (error) throw new Error(`Failed to delete lesson: ${error.message}`);
}

export async function reorderLessons(unitId: string, lessonIds: string[]): Promise<void> {
  if (!supabase) {
    for (const list of Object.values(DEMO_CURRICULUM)) {
      const unit = list.find((u) => u.id === unitId);
      if (unit) {
        const sorted = [...unit.lessons].sort((a, b) => lessonIds.indexOf(a.id) - lessonIds.indexOf(b.id));
        sorted.forEach((l, idx) => {
          l.orderIndex = idx + 1;
        });
        unit.lessons = sorted;
        return;
      }
    }
    return;
  }

  const { error } = await supabase.rpc('reorder_course_lessons', {
    p_unit_id: unitId,
    p_lesson_ids: lessonIds,
  });

  if (error) throw new Error(error.message || 'Failed to reorder lessons');
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
  // Validate file parameters
  const validation = validateLearningResourceFile(params.file);
  if (!validation.isValid) {
    throw new Error(validation.error || 'Invalid resource file');
  }

  const safeFileName = params.file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `courses/${params.courseId}/lessons/${params.lessonId}/${Date.now()}-${safeFileName}`;
  const ext = safeFileName.split('.').pop()?.toLowerCase() || 'pdf';

  if (!supabase) {
    const res: LessonResourceRecord = {
      id: `66666666-${Date.now().toString(16).padStart(4, '0')}-4000-8000-000000000000`,
      lessonId: params.lessonId,
      title: params.title.trim(),
      titleArabic: params.titleArabic?.trim() || null,
      fileUrl: storagePath,
      storagePath,
      fileType: ext,
      fileSizeBytes: params.file.size,
      createdAt: new Date().toISOString(),
    };
    for (const list of Object.values(DEMO_CURRICULUM)) {
      for (const u of list) {
        const l = u.lessons.find((item) => item.id === params.lessonId);
        if (l) {
          l.resources = l.resources || [];
          l.resources.push(res);
          return res;
        }
      }
    }
    return res;
  }

  // 1. Upload to private Supabase Storage bucket
  const { error: uploadErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, params.file, {
      contentType: params.file.type || 'application/octet-stream',
      upsert: false,
    });

  if (uploadErr) {
    throw new Error(`Failed to upload resource to storage: ${uploadErr.message}`);
  }

  // 2. Insert metadata into public.lesson_resources
  const { data, error: dbErr } = await supabase
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

  if (dbErr) {
    // Attempt rollback of storage object if DB insert fails
    await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
    throw new Error(`Failed to save resource record: ${dbErr.message}`);
  }

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
  const ext = params.fileType || params.fileUrl.split('.').pop()?.toLowerCase() || 'pdf';

  if (!supabase) {
    const res: LessonResourceRecord = {
      id: `66666666-${Date.now().toString(16).padStart(4, '0')}-4000-8000-000000000000`,
      lessonId: params.lessonId,
      title: params.title.trim(),
      titleArabic: params.titleArabic?.trim() || null,
      fileUrl: params.fileUrl.trim(),
      storagePath: null,
      fileType: ext,
      fileSizeBytes: null,
      createdAt: new Date().toISOString(),
    };
    for (const list of Object.values(DEMO_CURRICULUM)) {
      for (const u of list) {
        const l = u.lessons.find((item) => item.id === params.lessonId);
        if (l) {
          l.resources = l.resources || [];
          l.resources.push(res);
          return res;
        }
      }
    }
    return res;
  }

  const { data, error } = await supabase
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

  if (error || !data) {
    throw new Error(`Failed to add resource: ${error?.message}`);
  }

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
  if (!supabase) {
    return 'https://example.com/resources/sample-handout.pdf';
  }

  // Fetch resource row (enforces RLS: only permitted users can read)
  const { data: res, error } = await supabase
    .from('lesson_resources')
    .select('id, file_url, storage_path')
    .eq('id', resourceId)
    .single();

  if (error || !res) {
    throw new Error('Resource not accessible or unauthorized');
  }

  const path = res.storage_path || res.file_url;

  // If path looks like an external HTTPS link from earlier migration, return direct URL
  if (path.startsWith('https://')) {
    return path;
  }

  // Generate short-lived (5-minute) signed URL via Supabase Storage
  const { data: signedData, error: signErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, 300);

  if (signErr || !signedData?.signedUrl) {
    throw new Error(`Failed to generate download URL: ${signErr?.message || 'Access denied'}`);
  }

  return signedData.signedUrl;
}

export async function deleteLessonResource(resourceId: string): Promise<void> {
  if (!supabase) {
    for (const list of Object.values(DEMO_CURRICULUM)) {
      for (const u of list) {
        for (const l of u.lessons) {
          if (l.resources) {
            const idx = l.resources.findIndex((r) => r.id === resourceId);
            if (idx !== -1) {
              l.resources.splice(idx, 1);
              return;
            }
          }
        }
      }
    }
    return;
  }

  // 1. Fetch resource metadata to retrieve storage path
  const { data: res } = await supabase
    .from('lesson_resources')
    .select('id, storage_path, file_url')
    .eq('id', resourceId)
    .single();

  // 2. Delete database record (enforces RLS: only course owner or super admin can delete)
  const { error: dbErr } = await supabase
    .from('lesson_resources')
    .delete()
    .eq('id', resourceId);

  if (dbErr) {
    throw new Error(`Failed to delete resource: ${dbErr.message}`);
  }

  // 3. Delete underlying storage object if present
  const pathToDelete = res?.storage_path || (res?.file_url && !res.file_url.startsWith('https://') ? res.file_url : null);
  if (pathToDelete) {
    await supabase.storage.from(STORAGE_BUCKET).remove([pathToDelete]);
  }
}

// -----------------------------------------------------------------------------
// COURSE GROUP ASSIGNMENT API
// -----------------------------------------------------------------------------

export async function fetchCourseAssignedGroups(courseId: string): Promise<{
  id: string;
  name: string;
  nameArabic: string;
  assignedAt: string;
  studentCount: number;
}[]> {
  if (!supabase) {
    const course = DEMO_COURSES.find((c) => c.id === courseId);
    return (course?.assignedGroups || []).map((g) => ({
      id: g.id,
      name: g.name,
      nameArabic: g.nameArabic,
      assignedAt: '2026-09-01T10:00:00Z',
      studentCount: g.studentCount || 0,
    }));
  }

  const { data, error } = await supabase
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

  if (error) throw new Error(`Failed to fetch assigned groups: ${error.message}`);
  if (!data || data.length === 0) return [];

  const groupIds = data.map((d: any) => d.group_id);
  const { data: counts } = await supabase
    .from('group_students')
    .select('group_id')
    .in('group_id', groupIds);

  const countMap = new Map<string, number>();
  if (counts) {
    for (const c of counts) {
      countMap.set(c.group_id, (countMap.get(c.group_id) || 0) + 1);
    }
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
  if (!supabase) {
    const course = DEMO_COURSES.find((c) => c.id === courseId);
    if (course) {
      course.assignedGroups = course.assignedGroups || [];
      if (!course.assignedGroups.some((g) => g.id === groupId)) {
        course.assignedGroups.push({
          id: groupId,
          name: `Cohort ${groupId}`,
          nameArabic: `مجموعة ${groupId}`,
          studentCount: 1,
        });
        course.assignedGroupsCount = course.assignedGroups.length;
      }
    }
    return;
  }

  const { error } = await supabase.rpc('assign_course_to_group', {
    p_course_id: courseId,
    p_group_id: groupId,
  });

  if (error) throw new Error(error.message || 'Failed to assign course to group');
}

export async function removeCourseFromGroup(courseId: string, groupId: string): Promise<void> {
  if (!supabase) {
    const course = DEMO_COURSES.find((c) => c.id === courseId);
    if (course && course.assignedGroups) {
      course.assignedGroups = course.assignedGroups.filter((g) => g.id !== groupId);
      course.assignedGroupsCount = course.assignedGroups.length;
    }
    return;
  }

  const { error } = await supabase.rpc('remove_course_from_group', {
    p_course_id: courseId,
    p_group_id: groupId,
  });

  if (error) throw new Error(error.message || 'Failed to remove course from group');
}

// -----------------------------------------------------------------------------
// STUDENT LEARNING API
// -----------------------------------------------------------------------------

export async function fetchStudentCourses(): Promise<StudentCourseSummary[]> {
  if (!supabase) {
    return [
      {
        id: 'cccccccc-1111-4111-8111-111111111111',
        title: 'IELTS Academic Writing & Speaking Mastery',
        titleArabic: 'إتقان الكتابة والمحادثة الأكاديمية لاختبار الآيلتس',
        description: 'Comprehensive preparation designed for Saudi students targeting Band 7.0+ in IELTS Academic writing task 1 & 2.',
        descriptionArabic: 'برنامج تدريبي متكامل موجه للطلاب السعوديين لتحقيق درجة 7.0 فما فوق في مهام الكتابة الأكاديمية والتحدث بطلاقة.',
        coverImageUrl: 'https://images.unsplash.com/photo-1546410531-bb4caa6b424d?auto=format&fit=crop&w=800&q=80',
        level: 'advanced',
        totalLessons: 4,
        completedLessons: 1,
        progressPercentage: 25,
        groupName: 'Group A - Intensive IELTS Prep',
        groupNameArabic: 'المجموعة أ - الإعداد المكثف للآيلتس',
      },
      {
        id: 'cccccccc-2222-4222-8222-222222222222',
        title: 'English Grammar Foundations & Sentence Structure',
        titleArabic: 'أساسيات قواعد اللغة الإنجليزية وبناء الجملة السليمة',
        description: 'Master core tenses, active vs passive voice, conditionals, and sentence mechanics with practical Saudi academic context.',
        descriptionArabic: 'إتقان الأزمنة الرئيسية، المبني للمعلوم والمجهول، الجمل الشرطية، وتراكيب الجمل الإنجليزية المعاصرة مع تطبيقات عملية.',
        coverImageUrl: 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=800&q=80',
        level: 'intermediate',
        totalLessons: 1,
        completedLessons: 1,
        progressPercentage: 100,
        groupName: 'Group A - Intensive IELTS Prep',
        groupNameArabic: 'المجموعة أ - الإعداد المكثف للآيلتس',
      },
    ];
  }

  // Fetch published courses accessible via student's active group enrollments
  const { data: courses, error } = await supabase
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

  if (error) throw new Error(`Failed to fetch student courses: ${error.message}`);
  if (!courses || courses.length === 0) return [];

  const courseIds = courses.map((c) => c.id);

  // Fetch published lessons for these courses
  const { data: lessons } = await supabase
    .from('lessons')
    .select('id, course_id')
    .in('course_id', courseIds)
    .eq('is_published', true);

  const totalLessonsMap = new Map<string, number>();
  const lessonIds: string[] = [];
  for (const l of lessons || []) {
    totalLessonsMap.set(l.course_id, (totalLessonsMap.get(l.course_id) || 0) + 1);
    lessonIds.push(l.id);
  }

  // Fetch completed progress for this student
  const completedMap = new Map<string, number>();
  if (lessonIds.length > 0) {
    const { data: progress } = await supabase
      .from('lesson_progress')
      .select('lesson_id, is_completed')
      .in('lesson_id', lessonIds)
      .eq('is_completed', true);

    if (progress) {
      const lessonToCourse = new Map<string, string>();
      for (const l of lessons || []) lessonToCourse.set(l.id, l.course_id);

      for (const p of progress) {
        const cId = lessonToCourse.get(p.lesson_id);
        if (cId) {
          completedMap.set(cId, (completedMap.get(cId) || 0) + 1);
        }
      }
    }
  }

  return courses.map((c) => {
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
  if (!supabase) {
    const course = DEMO_COURSES.find((c) => c.id === courseId) || DEMO_COURSES[0];
    const units = DEMO_CURRICULUM[courseId] || [];
    let total = 0;
    let completed = 0;
    units.forEach((u) => {
      u.lessons.forEach((l) => {
        total++;
        if (l.progress?.isCompleted) completed++;
      });
    });
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return {
      course,
      units,
      totalLessons: total,
      completedLessons: completed,
      progressPercentage: pct,
    };
  }

  // 1. Fetch course details (enforces RLS)
  const { data: c, error: cErr } = await supabase
    .from('courses')
    .select('*')
    .eq('id', courseId)
    .single();

  if (cErr || !c) throw new Error(`Course not accessible: ${cErr?.message}`);

  // 2. Fetch units (enforces RLS)
  const { data: units, error: uErr } = await supabase
    .from('course_units')
    .select('*')
    .eq('course_id', courseId)
    .order('order_index', { ascending: true });

  if (uErr) throw new Error(`Failed to fetch units: ${uErr.message}`);

  // 3. Fetch published lessons (enforces RLS)
  const { data: lessons, error: lErr } = await supabase
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
    .order('order_index', { ascending: true });

  if (lErr) throw new Error(`Failed to fetch lessons: ${lErr.message}`);

  const lessonIds = (lessons || []).map((l) => l.id);

  // 4. Fetch resources and progress
  const [resData, progData] = await Promise.all([
    lessonIds.length > 0
      ? supabase.from('lesson_resources').select('*').in('lesson_id', lessonIds)
      : { data: [] },
    lessonIds.length > 0
      ? supabase.from('lesson_progress').select('*').in('lesson_id', lessonIds)
      : { data: [] },
  ]);

  const resourcesMap = new Map<string, LessonResourceRecord[]>();
  for (const r of resData.data || []) {
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

  const progressMap = new Map<string, { isCompleted: boolean; watchSeconds: number; lastAccessedAt?: string }>();
  let totalCount = (lessons || []).length;
  let completedCount = 0;

  for (const p of progData.data || []) {
    progressMap.set(p.lesson_id, {
      isCompleted: p.is_completed,
      watchSeconds: p.watch_seconds,
      lastAccessedAt: p.last_accessed_at,
    });
    if (p.is_completed) completedCount++;
  }

  const lessonsByUnit = new Map<string, LessonRecord[]>();
  for (const l of lessons || []) {
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

  const structuredUnits: CourseUnitRecord[] = (units || []).map((u) => ({
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
  if (!supabase) {
    for (const list of Object.values(DEMO_CURRICULUM)) {
      for (const u of list) {
        const l = u.lessons.find((item) => item.id === lessonId);
        if (l) {
          l.progress = {
            isCompleted,
            watchSeconds: watchSeconds ?? (l.progress?.watchSeconds || 0),
            lastAccessedAt: new Date().toISOString(),
          };
          return;
        }
      }
    }
    return;
  }

  const { error } = await supabase.rpc('record_lesson_progress', {
    p_lesson_id: lessonId,
    p_is_completed: isCompleted,
    p_watch_seconds: watchSeconds ?? 0,
  });

  if (error) throw new Error(error.message || 'Failed to record progress');
}
