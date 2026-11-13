/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  requireSupabaseClient,
  requireAuthenticatedUser,
  throwServiceError,
} from '../../lib/errors/serviceError';
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
  endTime: string; // ISO 8601 UTC
  durationMinutes: number;
  provider: LiveSessionProvider;
  meetingUrl?: string | null;
  status: LiveSessionStatus;
  teacherNotes?: string | null;
  createdAt: string;
  updatedAt: string;
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

const SERVICE = 'liveSessionsService';

// -----------------------------------------------------------------------------
// TEACHER & SUPER ADMIN API
// -----------------------------------------------------------------------------

export async function fetchTeacherLiveSessions(filters?: {
  groupId?: string;
  status?: string;
  timeframe?: 'upcoming' | 'past' | 'all';
  search?: string;
}): Promise<LiveSessionRecord[]> {
  const client = requireSupabaseClient({
    service: SERVICE,
    operation: 'fetchTeacherLiveSessions',
  });

  let query = client
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

  let rowsRes;
  try {
    rowsRes = await query;
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'fetchTeacherLiveSessions' });
  }

  if (rowsRes.error) {
    throwServiceError(rowsRes.error, {
      service: SERVICE,
      operation: 'fetchTeacherLiveSessions',
      fallbackMessage: 'Failed to fetch live sessions',
    });
  }

  const rows = rowsRes.data || [];
  if (rows.length === 0) return [];

  const sessionIds = rows.map((r: any) => r.id);
  let attRes;
  try {
    attRes = await client.from('attendance').select('session_id').in('session_id', sessionIds);
  } catch (err) {
    throwServiceError(err, {
      service: SERVICE,
      operation: 'fetchTeacherLiveSessions.attendanceCounts',
    });
  }

  if (attRes.error) {
    throwServiceError(attRes.error, {
      service: SERVICE,
      operation: 'fetchTeacherLiveSessions.attendanceCounts',
      fallbackMessage: 'Failed to load live session attendance counts',
    });
  }

  const attendanceCountMap = new Map<string, number>();
  for (const a of attRes.data || []) {
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
    results = results.filter(
      (s) => new Date(s.startTime).getTime() >= now && s.status !== 'cancelled'
    );
  } else if (filters?.timeframe === 'past') {
    const now = Date.now();
    results = results.filter(
      (s) => new Date(s.endTime).getTime() < now || s.status === 'completed'
    );
  }

  if (filters?.search) {
    const q = filters.search.toLowerCase().trim();
    results = results.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        (s.titleArabic && s.titleArabic.toLowerCase().includes(q))
    );
  }

  return results;
}

export async function fetchLiveSessionById(id: string): Promise<LiveSessionRecord | null> {
  const client = requireSupabaseClient({
    service: SERVICE,
    operation: 'fetchLiveSessionById',
  });

  let res;
  try {
    res = await client
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
      .maybeSingle();
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'fetchLiveSessionById' });
  }

  if (res.error) {
    if (res.error.code === 'PGRST116') {
      return null;
    }
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'fetchLiveSessionById',
      fallbackMessage: 'Failed to load live session details',
    });
  }

  const r = res.data;
  if (!r) return null;

  let countRes;
  try {
    countRes = await client
      .from('attendance')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', id);
  } catch (err) {
    throwServiceError(err, {
      service: SERVICE,
      operation: 'fetchLiveSessionById.attendanceCount',
    });
  }

  if (countRes.error) {
    throwServiceError(countRes.error, {
      service: SERVICE,
      operation: 'fetchLiveSessionById.attendanceCount',
      fallbackMessage: 'Failed to count attendance for session',
    });
  }

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
    attendanceCount: countRes.count || 0,
  };
}

export async function createLiveSession(
  params: CreateLiveSessionParams
): Promise<LiveSessionRecord> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'createLiveSession' });
  const caller = await requireAuthenticatedUser(client, {
    service: SERVICE,
    operation: 'createLiveSession',
  });

  const startTimeUtc = riyadhToUtcIso(params.scheduledDateRiyadh, params.scheduledTimeRiyadh);
  const duration = params.durationMinutes > 0 ? params.durationMinutes : 60;
  const endTimeUtc = new Date(new Date(startTimeUtc).getTime() + duration * 60000).toISOString();

  let res;
  try {
    res = await client
      .from('live_sessions')
      .insert({
        title: params.title.trim(),
        title_arabic: params.titleArabic?.trim() || null,
        description: params.description?.trim() || null,
        description_arabic: params.descriptionArabic?.trim() || null,
        group_id: params.groupId,
        course_id: params.courseId || null,
        lesson_id: params.lessonId || null,
        teacher_id: caller.id,
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
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'createLiveSession' });
  }

  if (res.error || !res.data) {
    throwServiceError(res.error || new Error('Failed to create live session'), {
      service: SERVICE,
      operation: 'createLiveSession',
      fallbackMessage: 'Failed to create live session',
    });
  }

  const data = res.data;
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

export async function updateLiveSession(
  id: string,
  params: UpdateLiveSessionParams
): Promise<void> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'updateLiveSession' });

  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (params.title) payload.title = params.title.trim();
  if (params.titleArabic !== undefined) payload.title_arabic = params.titleArabic?.trim() || null;
  if (params.description !== undefined) payload.description = params.description?.trim() || null;
  if (params.descriptionArabic !== undefined)
    payload.description_arabic = params.descriptionArabic?.trim() || null;
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

  let res;
  try {
    res = await client.from('live_sessions').update(payload).eq('id', id);
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'updateLiveSession' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'updateLiveSession',
      fallbackMessage: 'Failed to update live session',
    });
  }
}

export async function cancelLiveSession(id: string, reason?: string): Promise<void> {
  return updateLiveSession(id, {
    status: 'cancelled',
    teacherNotes: reason ? `Cancelled: ${reason}` : 'Cancelled by teacher',
  });
}

export async function deleteLiveSession(id: string): Promise<void> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'deleteLiveSession' });

  let res;
  try {
    res = await client.from('live_sessions').delete().eq('id', id);
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'deleteLiveSession' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'deleteLiveSession',
      fallbackMessage: 'Failed to delete live session',
    });
  }
}

// -----------------------------------------------------------------------------
// ATTENDANCE MANAGEMENT API
// -----------------------------------------------------------------------------

export async function fetchSessionRosterAndAttendance(
  sessionId: string,
  groupId: string
): Promise<RosterAttendanceItem[]> {
  const client = requireSupabaseClient({
    service: SERVICE,
    operation: 'fetchSessionRosterAndAttendance',
  });

  let enrollRes;
  let attRes;
  try {
    [enrollRes, attRes] = await Promise.all([
      client
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
        .eq('group_id', groupId),
      client
        .from('attendance')
        .select('student_id, status, notes, recorded_at')
        .eq('session_id', sessionId),
    ]);
  } catch (err) {
    throwServiceError(err, {
      service: SERVICE,
      operation: 'fetchSessionRosterAndAttendance',
    });
  }

  if (enrollRes.error) {
    throwServiceError(enrollRes.error, {
      service: SERVICE,
      operation: 'fetchSessionRosterAndAttendance.roster',
      fallbackMessage: 'Failed to load student roster',
    });
  }

  if (attRes.error) {
    throwServiceError(attRes.error, {
      service: SERVICE,
      operation: 'fetchSessionRosterAndAttendance.attendance',
      fallbackMessage: 'Failed to load attendance records',
    });
  }

  const attendanceMap = new Map<
    string,
    { status: AttendanceStatus; notes?: string; recorded_at?: string }
  >();
  for (const a of attRes.data || []) {
    attendanceMap.set(a.student_id, {
      status: a.status as AttendanceStatus,
      notes: a.notes || '',
      recorded_at: a.recorded_at,
    });
  }

  const roster: RosterAttendanceItem[] = [];
  for (const e of enrollRes.data || []) {
    const p = e.profiles as any;
    if (p && p.status === 'active') {
      const existing = attendanceMap.get(e.student_id);
      roster.push({
        studentId: e.student_id,
        studentName: p.full_name || 'Student',
        studentNameArabic: p.full_name_arabic || p.full_name || 'طالب',
        studentNumber: p.student_id_number || undefined,
        status: existing ? existing.status : 'present',
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
  const client = requireSupabaseClient({
    service: SERVICE,
    operation: 'saveSessionAttendance',
  });

  const payload = records.map((r) => ({
    student_id: r.studentId,
    status: r.status,
    notes: r.notes || null,
  }));

  let res;
  try {
    res = await client.rpc('record_session_attendance', {
      p_session_id: sessionId,
      p_records: payload,
    });
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'saveSessionAttendance' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'saveSessionAttendance',
      fallbackMessage: 'Failed to save attendance',
    });
  }
}

// -----------------------------------------------------------------------------
// STUDENT PORTAL API
// -----------------------------------------------------------------------------

export async function fetchStudentLiveSessions(): Promise<LiveSessionRecord[]> {
  const client = requireSupabaseClient({
    service: SERVICE,
    operation: 'fetchStudentLiveSessions',
  });

  let res;
  try {
    res = await client
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
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'fetchStudentLiveSessions' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'fetchStudentLiveSessions',
      fallbackMessage: 'Failed to fetch student live sessions',
    });
  }

  return (res.data || []).map((r: any) => ({
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
  const client = requireSupabaseClient({
    service: SERVICE,
    operation: 'fetchStudentAttendanceHistory',
  });

  let res;
  try {
    res = await client
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
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'fetchStudentAttendanceHistory' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'fetchStudentAttendanceHistory',
      fallbackMessage: 'Failed to fetch student attendance history',
    });
  }

  return (res.data || []).map((r: any) => ({
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
  const client = requireSupabaseClient({
    service: SERVICE,
    operation: 'getAuthorizedMeetingLink',
  });

  let res;
  try {
    res = await client.rpc('get_session_meeting_link', {
      p_session_id: sessionId,
    });
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'getAuthorizedMeetingLink' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'getAuthorizedMeetingLink',
      fallbackMessage: 'Meeting link access denied',
    });
  }

  return (res.data as string | null) ?? null;
}

// -----------------------------------------------------------------------------
// ATTENDANCE REPORTS & ANALYTICS
// -----------------------------------------------------------------------------

export async function fetchGroupAttendanceReport(
  groupId?: string,
  dateFrom?: string,
  dateTo?: string
): Promise<AttendanceReportData> {
  const client = requireSupabaseClient({
    service: SERVICE,
    operation: 'fetchGroupAttendanceReport',
  });

  let sessionQuery = client.from('live_sessions').select('id, group_id, status, start_time');

  if (groupId && groupId !== 'all') {
    sessionQuery = sessionQuery.eq('group_id', groupId);
  }
  if (dateFrom) {
    sessionQuery = sessionQuery.gte('start_time', dateFrom);
  }
  if (dateTo) {
    sessionQuery = sessionQuery.lte('start_time', dateTo);
  }

  let sessRes;
  try {
    sessRes = await sessionQuery;
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'fetchGroupAttendanceReport.sessions' });
  }

  if (sessRes.error) {
    throwServiceError(sessRes.error, {
      service: SERVICE,
      operation: 'fetchGroupAttendanceReport.sessions',
      fallbackMessage: 'Failed to load sessions for report',
    });
  }

  const allSessions = sessRes.data || [];
  const cancelledCount = allSessions.filter((s: any) => s.status === 'cancelled').length;
  const activeSessions = allSessions.filter((s: any) => s.status !== 'cancelled');
  const activeSessionIds = activeSessions.map((s: any) => s.id);

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

  let attRes;
  try {
    attRes = await client
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
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'fetchGroupAttendanceReport.records' });
  }

  if (attRes.error) {
    throwServiceError(attRes.error, {
      service: SERVICE,
      operation: 'fetchGroupAttendanceReport.records',
      fallbackMessage: 'Failed to load attendance report data',
    });
  }

  let overallPresent = 0;
  let overallLate = 0;
  let overallExcused = 0;
  let overallAbsent = 0;

  const studentMap = new Map<
    string,
    {
      studentId: string;
      studentName: string;
      studentNameArabic: string;
      studentNumber?: string;
      present: number;
      late: number;
      excused: number;
      absent: number;
      total: number;
    }
  >();

  for (const a of attRes.data || []) {
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
  const overallRate =
    overallCountable === 0 ? 100 : Math.round(((overallPresent + overallLate) / overallCountable) * 100);

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
