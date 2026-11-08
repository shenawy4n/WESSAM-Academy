/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { supabase } from '../../lib/supabase/client';
import { riyadhToUtcIso } from '../../lib/dateUtils';

export type LiveSessionProvider = 'zoom' | 'google_meet' | 'teams' | 'custom';
export type LiveSessionStatus = 'scheduled' | 'live' | 'completed' | 'cancelled';
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

export interface LiveSessionRecord {
  id: string;
  title: string;
  titleArabic?: string | null;
  description?: string | null;
  descriptionArabic?: string | null;
  groupId: string;
  courseId?: string | null;
  lessonId?: string | null;
  teacherId?: string | null;
  startTime: string; // ISO 8601 UTC
  endTime: string;   // ISO 8601 UTC
  durationMinutes: number;
  provider: LiveSessionProvider;
  meetingUrl?: string | null;
  status: LiveSessionStatus;
  teacherNotes?: string | null;
  createdAt: string;
  updatedAt: string;
  // Joined relation fields
  groupName?: string;
  groupNameArabic?: string;
  courseTitle?: string;
  courseTitleArabic?: string;
  lessonTitle?: string;
  lessonTitleArabic?: string;
  attendanceCount?: number;
  enrolledStudentsCount?: number;
}

export interface AttendanceRecord {
  id: string;
  sessionId: string;
  studentId: string;
  status: AttendanceStatus;
  joinedAt?: string | null;
  notes?: string | null;
  markedBy?: string | null;
  recordedAt: string;
  updatedAt?: string;
  // Joined details
  studentName?: string;
  studentNameArabic?: string;
  studentNumber?: string;
  sessionTitle?: string;
  sessionTitleArabic?: string;
  sessionStartTime?: string;
}

export interface RosterAttendanceItem {
  studentId: string;
  studentName: string;
  studentNameArabic: string;
  studentNumber?: string;
  status: AttendanceStatus;
  notes?: string;
  markedAt?: string;
}

export interface StudentAttendanceSummary {
  studentId: string;
  studentName: string;
  studentNameArabic: string;
  studentNumber?: string;
  groupName?: string;
  groupNameArabic?: string;
  totalSessions: number;
  presentCount: number;
  lateCount: number;
  excusedCount: number;
  absentCount: number;
  attendancePercentage: number;
}

export interface AttendanceReportData {
  totalSessions: number;
  cancelledSessionsCount: number;
  activeSessionsCount: number;
  overallPresent: number;
  overallLate: number;
  overallExcused: number;
  overallAbsent: number;
  overallAttendanceRate: number;
  studentSummaries: StudentAttendanceSummary[];
}

export interface CreateLiveSessionParams {
  title: string;
  titleArabic?: string;
  description?: string;
  descriptionArabic?: string;
  groupId: string;
  courseId?: string;
  lessonId?: string;
  scheduledDateRiyadh: string; // YYYY-MM-DD
  scheduledTimeRiyadh: string; // HH:mm
  durationMinutes: number;
  provider: LiveSessionProvider;
  meetingUrl?: string;
  teacherNotes?: string;
}

export interface UpdateLiveSessionParams {
  title?: string;
  titleArabic?: string;
  description?: string;
  descriptionArabic?: string;
  groupId?: string;
  courseId?: string | null;
  lessonId?: string | null;
  scheduledDateRiyadh?: string;
  scheduledTimeRiyadh?: string;
  durationMinutes?: number;
  provider?: LiveSessionProvider;
  meetingUrl?: string;
  status?: LiveSessionStatus;
  teacherNotes?: string;
}

// -----------------------------------------------------------------------------
// Preview Demo Data (for disconnected development or test verification)
// -----------------------------------------------------------------------------
let DEMO_SESSIONS: LiveSessionRecord[] = [
  {
    id: 'eeeeeeee-1111-4111-8111-111111111111',
    title: 'Live Workshop: IELTS Academic Task 2 Breakdown',
    titleArabic: 'ورشة عمل تفاعلية: استراتيجيات كتابة مقال الآيلتس 7+',
    description: 'Interactive session breaking down argumentative essay prompts and drafting body paragraphs with Mr. Wessam.',
    descriptionArabic: 'حصة تفاعلية مباشرة لتحليل نص السؤال وصياغة الفقرات الجدلية مع الأستاذ وسام إبراهيم دراز.',
    groupId: 'aaaaaaaa-aaaa-4aaa-8aaa-cccccccccccc',
    courseId: 'cccccccc-1111-4111-8111-111111111111',
    lessonId: '55555555-1111-4111-8111-111111111111',
    teacherId: '11111111-1111-4111-8111-111111111111',
    startTime: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    endTime: new Date(Date.now() + 25 * 3600 * 1000).toISOString(),
    durationMinutes: 60,
    provider: 'zoom',
    meetingUrl: 'https://zoom.us/j/9876543210?pwd=academicSessionPass',
    status: 'scheduled',
    teacherNotes: 'Students should prepare their sample prompts in advance.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    groupName: 'Group A - Intensive IELTS Prep',
    groupNameArabic: 'المجموعة أ - الإعداد المكثف للآيلتس',
    courseTitle: 'IELTS Academic Writing & Speaking Mastery',
    courseTitleArabic: 'إتقان الكتابة والمحادثة الأكاديمية لاختبار الآيلتس',
    lessonTitle: 'Lesson 1.1: Analyzing the Prompt & Generating Band 7 Ideas',
    lessonTitleArabic: 'الدرس 1.1: تحليل نص السؤال وتوليد الأفكار لدرجة 7+',
    attendanceCount: 0,
    enrolledStudentsCount: 15,
  },
  {
    id: 'eeeeeeee-2222-4222-8222-222222222222',
    title: 'Grammar Q&A Clinic: Complex Sentences & Clauses',
    titleArabic: 'عيادة القواعد والأسئلة الشائعة: الجمل المعقدة وأدوات الربط',
    description: 'Review of relative clauses, punctuation mechanics, and avoiding common Arabic-to-English syntax errors.',
    descriptionArabic: 'مراجعة جمل الوصل، علامات الترقيم، وتصحيح الأخطاء الشائعة في الترجمة من العربية للإنجليزية.',
    groupId: 'aaaaaaaa-aaaa-4aaa-8aaa-cccccccccccc',
    courseId: 'cccccccc-2222-4222-8222-222222222222',
    teacherId: '11111111-1111-4111-8111-111111111111',
    startTime: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
    endTime: new Date(Date.now() - 47 * 3600 * 1000).toISOString(),
    durationMinutes: 60,
    provider: 'google_meet',
    meetingUrl: 'https://meet.google.com/abc-defg-hij',
    status: 'completed',
    teacherNotes: 'Excellent participation on conditionals review.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    groupName: 'Group A - Intensive IELTS Prep',
    groupNameArabic: 'المجموعة أ - الإعداد المكثف للآيلتس',
    courseTitle: 'English Grammar Foundations & Sentence Structure',
    courseTitleArabic: 'أساسيات قواعد اللغة الإنجليزية وبناء الجملة السليمة',
    attendanceCount: 14,
    enrolledStudentsCount: 15,
  },
];

let DEMO_ATTENDANCE: Record<string, AttendanceRecord[]> = {
  'eeeeeeee-2222-4222-8222-222222222222': [
    {
      id: 'att-1',
      sessionId: 'eeeeeeee-2222-4222-8222-222222222222',
      studentId: '22222222-2222-4222-8222-222222222222',
      status: 'present',
      notes: 'Active engagement in speaking drill',
      recordedAt: new Date(Date.now() - 47 * 3600 * 1000).toISOString(),
      studentName: 'Enrolled Student',
      studentNameArabic: 'طالب ملتحق',
      studentNumber: 'STU-2026-001',
      sessionTitle: 'Grammar Q&A Clinic: Complex Sentences & Clauses',
      sessionTitleArabic: 'عيادة القواعد والأسئلة الشائعة: الجمل المعقدة وأدوات الربط',
    },
  ],
};

// -----------------------------------------------------------------------------
// TEACHER & SUPER ADMIN API
// -----------------------------------------------------------------------------

export async function fetchTeacherLiveSessions(filters?: {
  groupId?: string;
  status?: string;
  timeframe?: 'upcoming' | 'past' | 'all';
  search?: string;
}): Promise<LiveSessionRecord[]> {
  if (!supabase) {
    let result = [...DEMO_SESSIONS];
    if (filters?.groupId && filters.groupId !== 'all') {
      result = result.filter((s) => s.groupId === filters.groupId);
    }
    if (filters?.status && filters.status !== 'all') {
      result = result.filter((s) => s.status === filters.status);
    }
    if (filters?.timeframe === 'upcoming') {
      result = result.filter((s) => new Date(s.startTime).getTime() >= Date.now() && s.status !== 'cancelled');
    } else if (filters?.timeframe === 'past') {
      result = result.filter((s) => new Date(s.endTime).getTime() < Date.now() || s.status === 'completed');
    }
    if (filters?.search) {
      const q = filters.search.toLowerCase().trim();
      result = result.filter((s) =>
        s.title.toLowerCase().includes(q) ||
        (s.titleArabic && s.titleArabic.toLowerCase().includes(q))
      );
    }
    return result.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  }

  let query = supabase
    .from('live_sessions')
    .select(`
      id,
      title,
      title_arabic,
      description,
      description_arabic,
      group_id,
      course_id,
      lesson_id,
      teacher_id,
      start_time,
      end_time,
      duration_minutes,
      provider,
      status,
      teacher_notes,
      created_at,
      updated_at,
      groups:group_id (
        id,
        name,
        name_arabic
      ),
      courses:course_id (
        id,
        title,
        title_arabic
      ),
      lessons:lesson_id (
        id,
        title,
        title_arabic
      )
    `)
    .order('start_time', { ascending: false });

  if (filters?.groupId && filters.groupId !== 'all') {
    query = query.eq('group_id', filters.groupId);
  }
  if (filters?.status && filters.status !== 'all') {
    query = query.eq('status', filters.status);
  }

  const { data: rows, error } = await query;
  if (error) throw new Error(`Failed to fetch live sessions: ${error.message}`);
  if (!rows || rows.length === 0) return [];

  // Count attendance records for these sessions
  const sessionIds = rows.map((r) => r.id);
  const { data: attendanceData } = await supabase
    .from('attendance')
    .select('session_id')
    .in('session_id', sessionIds);

  const attendanceCountMap = new Map<string, number>();
  for (const a of attendanceData || []) {
    attendanceCountMap.set(a.session_id, (attendanceCountMap.get(a.session_id) || 0) + 1);
  }

  let results: LiveSessionRecord[] = rows.map((r: any) => ({
    id: r.id,
    title: r.title,
    titleArabic: r.title_arabic,
    description: r.description,
    descriptionArabic: r.description_arabic,
    groupId: r.group_id,
    courseId: r.course_id,
    lessonId: r.lesson_id,
    teacherId: r.teacher_id,
    startTime: r.start_time,
    endTime: r.end_time,
    durationMinutes: r.duration_minutes || 60,
    provider: r.provider as LiveSessionProvider,
    meetingUrl: undefined,
    status: r.status as LiveSessionStatus,
    teacherNotes: r.teacher_notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    groupName: r.groups?.name,
    groupNameArabic: r.groups?.name_arabic,
    courseTitle: r.courses?.title,
    courseTitleArabic: r.courses?.title_arabic,
    lessonTitle: r.lessons?.title,
    lessonTitleArabic: r.lessons?.title_arabic,
    attendanceCount: attendanceCountMap.get(r.id) || 0,
  }));

  if (filters?.timeframe === 'upcoming') {
    const now = Date.now();
    results = results.filter((s) => new Date(s.startTime).getTime() >= now && s.status !== 'cancelled');
  } else if (filters?.timeframe === 'past') {
    const now = Date.now();
    results = results.filter((s) => new Date(s.endTime).getTime() < now || s.status === 'completed');
  }

  if (filters?.search) {
    const q = filters.search.toLowerCase().trim();
    results = results.filter((s) =>
      s.title.toLowerCase().includes(q) ||
      (s.titleArabic && s.titleArabic.toLowerCase().includes(q))
    );
  }

  return results;
}

export async function fetchLiveSessionById(id: string): Promise<LiveSessionRecord | null> {
  if (!supabase) {
    return DEMO_SESSIONS.find((s) => s.id === id) || null;
  }

  const { data: r, error } = await supabase
    .from('live_sessions')
    .select(`
      id,
      title,
      title_arabic,
      description,
      description_arabic,
      group_id,
      course_id,
      lesson_id,
      teacher_id,
      start_time,
      end_time,
      duration_minutes,
      provider,
      status,
      teacher_notes,
      created_at,
      updated_at,
      groups:group_id (
        id,
        name,
        name_arabic
      ),
      courses:course_id (
        id,
        title,
        title_arabic
      ),
      lessons:lesson_id (
        id,
        title,
        title_arabic
      )
    `)
    .eq('id', id)
    .single();

  if (error || !r) return null;

  const { count } = await supabase
    .from('attendance')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', id);

  return {
    id: r.id,
    title: r.title,
    titleArabic: r.title_arabic,
    description: r.description,
    descriptionArabic: r.description_arabic,
    groupId: r.group_id,
    courseId: r.course_id,
    lessonId: r.lesson_id,
    teacherId: r.teacher_id,
    startTime: r.start_time,
    endTime: r.end_time,
    durationMinutes: r.duration_minutes || 60,
    provider: r.provider as LiveSessionProvider,
    meetingUrl: undefined,
    status: r.status as LiveSessionStatus,
    teacherNotes: r.teacher_notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    groupName: (r.groups as any)?.name,
    groupNameArabic: (r.groups as any)?.name_arabic,
    courseTitle: (r.courses as any)?.title,
    courseTitleArabic: (r.courses as any)?.title_arabic,
    lessonTitle: (r.lessons as any)?.title,
    lessonTitleArabic: (r.lessons as any)?.title_arabic,
    attendanceCount: count || 0,
  };
}

export async function createLiveSession(params: CreateLiveSessionParams): Promise<LiveSessionRecord> {
  const startTimeUtc = riyadhToUtcIso(params.scheduledDateRiyadh, params.scheduledTimeRiyadh);
  const duration = params.durationMinutes > 0 ? params.durationMinutes : 60;
  const endTimeUtc = new Date(new Date(startTimeUtc).getTime() + duration * 60000).toISOString();

  if (!supabase) {
    const newSession: LiveSessionRecord = {
      id: `eeeeeeee-${Date.now().toString(16).padStart(4, '0')}-4000-8000-000000000000`,
      title: params.title.trim(),
      titleArabic: params.titleArabic?.trim() || null,
      description: params.description?.trim() || null,
      descriptionArabic: params.descriptionArabic?.trim() || null,
      groupId: params.groupId,
      courseId: params.courseId || null,
      lessonId: params.lessonId || null,
      teacherId: '11111111-1111-4111-8111-111111111111',
      startTime: startTimeUtc,
      endTime: endTimeUtc,
      durationMinutes: duration,
      provider: params.provider,
      meetingUrl: params.meetingUrl?.trim() || null,
      status: 'scheduled',
      teacherNotes: params.teacherNotes?.trim() || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      groupName: 'Assigned Cohort',
      groupNameArabic: 'المجموعة المخصصة',
      attendanceCount: 0,
    };
    DEMO_SESSIONS.unshift(newSession);
    return newSession;
  }

  const { data: userRes } = await supabase.auth.getUser();
  const callerId = userRes?.user?.id;

  const { data, error } = await supabase
    .from('live_sessions')
    .insert({
      title: params.title.trim(),
      title_arabic: params.titleArabic?.trim() || null,
      description: params.description?.trim() || null,
      description_arabic: params.descriptionArabic?.trim() || null,
      group_id: params.groupId,
      course_id: params.courseId || null,
      lesson_id: params.lessonId || null,
      teacher_id: callerId,
      start_time: startTimeUtc,
      end_time: endTimeUtc,
      duration_minutes: duration,
      provider: params.provider,
      meeting_url: params.meetingUrl?.trim() || null,
      status: 'scheduled',
      teacher_notes: params.teacherNotes?.trim() || null,
    })
    .select(`
      id,
      title,
      title_arabic,
      description,
      description_arabic,
      group_id,
      course_id,
      lesson_id,
      teacher_id,
      start_time,
      end_time,
      duration_minutes,
      provider,
      status,
      teacher_notes,
      created_at,
      updated_at
    `)
    .single();

  if (error) throw new Error(`Failed to create live session: ${error.message}`);

  return {
    id: data.id,
    title: data.title,
    titleArabic: data.title_arabic,
    description: data.description,
    descriptionArabic: data.description_arabic,
    groupId: data.group_id,
    courseId: data.course_id,
    lessonId: data.lesson_id,
    teacherId: data.teacher_id,
    startTime: data.start_time,
    endTime: data.end_time,
    durationMinutes: data.duration_minutes,
    provider: data.provider,
    meetingUrl: params.meetingUrl?.trim() || null,
    status: data.status,
    teacherNotes: data.teacher_notes,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function updateLiveSession(id: string, params: UpdateLiveSessionParams): Promise<void> {
  if (!supabase) {
    const s = DEMO_SESSIONS.find((item) => item.id === id);
    if (s) {
      if (params.title) s.title = params.title.trim();
      if (params.titleArabic !== undefined) s.titleArabic = params.titleArabic?.trim() || null;
      if (params.description !== undefined) s.description = params.description?.trim() || null;
      if (params.descriptionArabic !== undefined) s.descriptionArabic = params.descriptionArabic?.trim() || null;
      if (params.groupId) s.groupId = params.groupId;
      if (params.courseId !== undefined) s.courseId = params.courseId;
      if (params.lessonId !== undefined) s.lessonId = params.lessonId;
      if (params.durationMinutes) s.durationMinutes = params.durationMinutes;
      if (params.provider) s.provider = params.provider;
      if (params.meetingUrl !== undefined) s.meetingUrl = params.meetingUrl?.trim() || null;
      if (params.status) s.status = params.status;
      if (params.teacherNotes !== undefined) s.teacherNotes = params.teacherNotes?.trim() || null;
      if (params.scheduledDateRiyadh && params.scheduledTimeRiyadh) {
        s.startTime = riyadhToUtcIso(params.scheduledDateRiyadh, params.scheduledTimeRiyadh);
        s.endTime = new Date(new Date(s.startTime).getTime() + (s.durationMinutes || 60) * 60000).toISOString();
      }
      s.updatedAt = new Date().toISOString();
    }
    return;
  }

  const payload: any = {
    updated_at: new Date().toISOString(),
  };

  if (params.title) payload.title = params.title.trim();
  if (params.titleArabic !== undefined) payload.title_arabic = params.titleArabic?.trim() || null;
  if (params.description !== undefined) payload.description = params.description?.trim() || null;
  if (params.descriptionArabic !== undefined) payload.description_arabic = params.descriptionArabic?.trim() || null;
  if (params.groupId) payload.group_id = params.groupId;
  if (params.courseId !== undefined) payload.course_id = params.courseId;
  if (params.lessonId !== undefined) payload.lesson_id = params.lessonId;
  if (params.durationMinutes) payload.duration_minutes = params.durationMinutes;
  if (params.provider) payload.provider = params.provider;
  if (params.meetingUrl !== undefined) payload.meeting_url = params.meetingUrl?.trim() || null;
  if (params.status) payload.status = params.status;
  if (params.teacherNotes !== undefined) payload.teacher_notes = params.teacherNotes?.trim() || null;

  if (params.scheduledDateRiyadh && params.scheduledTimeRiyadh) {
    const startUtc = riyadhToUtcIso(params.scheduledDateRiyadh, params.scheduledTimeRiyadh);
    payload.start_time = startUtc;
    const dur = params.durationMinutes || 60;
    payload.end_time = new Date(new Date(startUtc).getTime() + dur * 60000).toISOString();
  }

  const { error } = await supabase
    .from('live_sessions')
    .update(payload)
    .eq('id', id);

  if (error) throw new Error(`Failed to update live session: ${error.message}`);
}

export async function cancelLiveSession(id: string, reason?: string): Promise<void> {
  return updateLiveSession(id, {
    status: 'cancelled',
    teacherNotes: reason ? `Cancelled: ${reason}` : 'Cancelled by teacher',
  });
}

export async function deleteLiveSession(id: string): Promise<void> {
  if (!supabase) {
    DEMO_SESSIONS = DEMO_SESSIONS.filter((s) => s.id !== id);
    delete DEMO_ATTENDANCE[id];
    return;
  }

  const { error } = await supabase.from('live_sessions').delete().eq('id', id);
  if (error) throw new Error(`Failed to delete live session: ${error.message}`);
}

// -----------------------------------------------------------------------------
// ATTENDANCE MANAGEMENT API
// -----------------------------------------------------------------------------

export async function fetchSessionRosterAndAttendance(
  sessionId: string,
  groupId: string
): Promise<RosterAttendanceItem[]> {
  if (!supabase) {
    const existing = DEMO_ATTENDANCE[sessionId] || [];
    return [
      {
        studentId: '22222222-2222-4222-8222-222222222222',
        studentName: 'Enrolled Student',
        studentNameArabic: 'طالب ملتحق',
        studentNumber: 'STU-2026-001',
        status: existing.find((e) => e.studentId === '22222222-2222-4222-8222-222222222222')?.status || 'present',
        notes: existing.find((e) => e.studentId === '22222222-2222-4222-8222-222222222222')?.notes || '',
      },
    ];
  }

  // 1. Fetch active students enrolled in this group
  const { data: enrollments, error: enrollErr } = await supabase
    .from('group_students')
    .select(`
      student_id,
      profiles:student_id (
        id,
        full_name,
        full_name_arabic,
        student_id_number,
        status
      )
    `)
    .eq('group_id', groupId);

  if (enrollErr) throw new Error(`Failed to load student roster: ${enrollErr.message}`);

  // 2. Fetch any already recorded attendance records for this session
  const { data: attendanceList, error: attErr } = await supabase
    .from('attendance')
    .select('student_id, status, notes, recorded_at')
    .eq('session_id', sessionId);

  if (attErr) throw new Error(`Failed to load attendance records: ${attErr.message}`);

  const attendanceMap = new Map<string, { status: AttendanceStatus; notes?: string; recorded_at?: string }>();
  for (const a of attendanceList || []) {
    attendanceMap.set(a.student_id, {
      status: a.status as AttendanceStatus,
      notes: a.notes || '',
      recorded_at: a.recorded_at,
    });
  }

  const roster: RosterAttendanceItem[] = [];
  for (const e of enrollments || []) {
    const p = e.profiles as any;
    if (p && p.status === 'active') {
      const existing = attendanceMap.get(e.student_id);
      roster.push({
        studentId: e.student_id,
        studentName: p.full_name || 'Student',
        studentNameArabic: p.full_name_arabic || p.full_name || 'طالب',
        studentNumber: p.student_id_number || undefined,
        status: existing ? existing.status : 'present', // Default to present for rapid roll-call
        notes: existing?.notes || '',
        markedAt: existing?.recorded_at,
      });
    }
  }

  return roster.sort((a, b) => a.studentName.localeCompare(b.studentName));
}

export async function saveSessionAttendance(
  sessionId: string,
  records: { studentId: string; status: AttendanceStatus; notes?: string }[]
): Promise<void> {
  if (!supabase) {
    DEMO_ATTENDANCE[sessionId] = records.map((r, i) => ({
      id: `att-${i}`,
      sessionId,
      studentId: r.studentId,
      status: r.status,
      notes: r.notes || null,
      recordedAt: new Date().toISOString(),
    }));
    return;
  }

  // Use the atomic PostgreSQL RPC
  const payload = records.map((r) => ({
    student_id: r.studentId,
    status: r.status,
    notes: r.notes || null,
  }));

  const { error } = await supabase.rpc('record_session_attendance', {
    p_session_id: sessionId,
    p_records: payload,
  });

  if (error) {
    throw new Error(`Failed to save attendance: ${error.message}`);
  }
}

// -----------------------------------------------------------------------------
// STUDENT PORTAL API
// -----------------------------------------------------------------------------

export async function fetchStudentLiveSessions(): Promise<LiveSessionRecord[]> {
  if (!supabase) {
    return DEMO_SESSIONS.filter((s) => s.status !== 'cancelled');
  }

  // Student RLS policy permits SELECT only for sessions assigned to student's group
  const { data: rows, error } = await supabase
    .from('live_sessions')
    .select(`
      id,
      title,
      title_arabic,
      description,
      description_arabic,
      group_id,
      course_id,
      lesson_id,
      start_time,
      end_time,
      duration_minutes,
      provider,
      status,
      teacher_notes,
      created_at,
      updated_at,
      courses:course_id (
        id,
        title,
        title_arabic
      ),
      lessons:lesson_id (
        id,
        title,
        title_arabic
      )
    `)
    .order('start_time', { ascending: true });

  if (error) throw new Error(`Failed to fetch student sessions: ${error.message}`);
  if (!rows) return [];

  return rows.map((r: any) => ({
    id: r.id,
    title: r.title,
    titleArabic: r.title_arabic,
    description: r.description,
    descriptionArabic: r.description_arabic,
    groupId: r.group_id,
    courseId: r.course_id,
    lessonId: r.lesson_id,
    startTime: r.start_time,
    endTime: r.end_time,
    durationMinutes: r.duration_minutes || 60,
    provider: r.provider,
    meetingUrl: undefined,
    status: r.status,
    teacherNotes: r.teacher_notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    courseTitle: r.courses?.title,
    courseTitleArabic: r.courses?.title_arabic,
    lessonTitle: r.lessons?.title,
    lessonTitleArabic: r.lessons?.title_arabic,
  }));
}

export async function fetchStudentAttendanceHistory(): Promise<AttendanceRecord[]> {
  if (!supabase) {
    return Object.values(DEMO_ATTENDANCE).flat();
  }

  const { data: rows, error } = await supabase
    .from('attendance')
    .select(`
      id,
      session_id,
      student_id,
      status,
      joined_at,
      notes,
      recorded_at,
      live_sessions:session_id (
        id,
        title,
        title_arabic,
        start_time
      )
    `)
    .order('recorded_at', { ascending: false });

  if (error) throw new Error(`Failed to fetch student attendance history: ${error.message}`);
  if (!rows) return [];

  return rows.map((r: any) => ({
    id: r.id,
    sessionId: r.session_id,
    studentId: r.student_id,
    status: r.status,
    joinedAt: r.joined_at,
    notes: r.notes,
    recordedAt: r.recorded_at,
    sessionTitle: r.live_sessions?.title,
    sessionTitleArabic: r.live_sessions?.title_arabic,
    sessionStartTime: r.live_sessions?.start_time,
  }));
}

export async function getAuthorizedMeetingLink(sessionId: string): Promise<string | null> {
  if (!supabase) {
    const s = DEMO_SESSIONS.find((item) => item.id === sessionId);
    return s?.meetingUrl || null;
  }

  // Invoke secure PostgreSQL RPC with strict authentication and cohort-boundary check
  const { data, error } = await supabase.rpc('get_session_meeting_link', {
    p_session_id: sessionId,
  });

  if (error) {
    throw new Error(`Meeting link access denied: ${error.message}`);
  }

  return data as string | null;
}

// -----------------------------------------------------------------------------
// ATTENDANCE REPORTS & ANALYTICS
// -----------------------------------------------------------------------------

export async function fetchGroupAttendanceReport(
  groupId?: string,
  dateFrom?: string,
  dateTo?: string
): Promise<AttendanceReportData> {
  if (!supabase) {
    return {
      totalSessions: 2,
      cancelledSessionsCount: 0,
      activeSessionsCount: 2,
      overallPresent: 14,
      overallLate: 1,
      overallExcused: 1,
      overallAbsent: 1,
      overallAttendanceRate: 88,
      studentSummaries: [
        {
          studentId: '22222222-2222-4222-8222-222222222222',
          studentName: 'Enrolled Student',
          studentNameArabic: 'طالب ملتحق',
          studentNumber: 'STU-2026-001',
          groupName: 'Group A - Intensive IELTS Prep',
          groupNameArabic: 'المجموعة أ - الإعداد المكثف للآيلتس',
          totalSessions: 2,
          presentCount: 2,
          lateCount: 0,
          excusedCount: 0,
          absentCount: 0,
          attendancePercentage: 100,
        },
      ],
    };
  }

  // 1. Fetch non-cancelled live sessions matching filters
  let sessionQuery = supabase
    .from('live_sessions')
    .select('id, group_id, status, start_time');

  if (groupId && groupId !== 'all') {
    sessionQuery = sessionQuery.eq('group_id', groupId);
  }
  if (dateFrom) {
    sessionQuery = sessionQuery.gte('start_time', dateFrom);
  }
  if (dateTo) {
    sessionQuery = sessionQuery.lte('start_time', dateTo);
  }

  const { data: sessions, error: sessErr } = await sessionQuery;
  if (sessErr) throw new Error(`Failed to load sessions for report: ${sessErr.message}`);

  const allSessions = sessions || [];
  const cancelledCount = allSessions.filter((s) => s.status === 'cancelled').length;
  const activeSessions = allSessions.filter((s) => s.status !== 'cancelled');
  const activeSessionIds = activeSessions.map((s) => s.id);

  if (activeSessionIds.length === 0) {
    return {
      totalSessions: allSessions.length,
      cancelledSessionsCount: cancelledCount,
      activeSessionsCount: 0,
      overallPresent: 0,
      overallLate: 0,
      overallExcused: 0,
      overallAbsent: 0,
      overallAttendanceRate: 100,
      studentSummaries: [],
    };
  }

  // 2. Fetch all attendance records for these active sessions
  const { data: attendanceList, error: attErr } = await supabase
    .from('attendance')
    .select(`
      id,
      session_id,
      student_id,
      status,
      profiles:student_id (
        id,
        full_name,
        full_name_arabic,
        student_id_number
      )
    `)
    .in('session_id', activeSessionIds);

  if (attErr) throw new Error(`Failed to load attendance report data: ${attErr.message}`);

  let overallPresent = 0;
  let overallLate = 0;
  let overallExcused = 0;
  let overallAbsent = 0;

  const studentMap = new Map<string, {
    studentId: string;
    studentName: string;
    studentNameArabic: string;
    studentNumber?: string;
    present: number;
    late: number;
    excused: number;
    absent: number;
    total: number;
  }>();

  for (const a of attendanceList || []) {
    const p = a.profiles as any;
    const sId = a.student_id;
    if (!studentMap.has(sId)) {
      studentMap.set(sId, {
        studentId: sId,
        studentName: p?.full_name || 'Student',
        studentNameArabic: p?.full_name_arabic || p?.full_name || 'طالب',
        studentNumber: p?.student_id_number || undefined,
        present: 0,
        late: 0,
        excused: 0,
        absent: 0,
        total: 0,
      });
    }

    const item = studentMap.get(sId)!;
    item.total += 1;

    if (a.status === 'present') {
      item.present += 1;
      overallPresent += 1;
    } else if (a.status === 'late') {
      item.late += 1;
      overallLate += 1;
    } else if (a.status === 'excused') {
      item.excused += 1;
      overallExcused += 1;
    } else if (a.status === 'absent') {
      item.absent += 1;
      overallAbsent += 1;
    }
  }

  const studentSummaries: StudentAttendanceSummary[] = Array.from(studentMap.values()).map((s) => {
    const countable = s.present + s.late + s.absent;
    const pct = countable === 0 ? 100 : Math.round(((s.present + s.late) / countable) * 100);
    return {
      studentId: s.studentId,
      studentName: s.studentName,
      studentNameArabic: s.studentNameArabic,
      studentNumber: s.studentNumber,
      totalSessions: s.total,
      presentCount: s.present,
      lateCount: s.late,
      excusedCount: s.excused,
      absentCount: s.absent,
      attendancePercentage: pct,
    };
  });

  const overallCountable = overallPresent + overallLate + overallAbsent;
  const overallRate = overallCountable === 0 ? 100 : Math.round(((overallPresent + overallLate) / overallCountable) * 100);

  return {
    totalSessions: allSessions.length,
    cancelledSessionsCount: cancelledCount,
    activeSessionsCount: activeSessions.length,
    overallPresent,
    overallLate,
    overallExcused,
    overallAbsent,
    overallAttendanceRate: overallRate,
    studentSummaries: studentSummaries.sort((a, b) => b.attendancePercentage - a.attendancePercentage),
  };
}
