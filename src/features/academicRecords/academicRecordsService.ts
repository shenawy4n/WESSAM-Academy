/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  requireSupabaseClient,
  requireAuthenticatedUser,
  toServiceError,
  logServiceError,
  isMissingSchemaFeatureError,
  ServiceError,
} from '../../lib/errors/serviceError';
import { ACADEMIC_TIMEZONE, formatRiyadhDateTime, utcToRiyadhInputs } from '../../lib/dateUtils';

const SERVICE = 'academicRecordsService';

export interface AcademicGroupMembership {
  id: string;
  name: string;
  nameArabic: string;
  academicYear: string | null;
  isActive: boolean;
  archivedAt?: string | null;
  isPrimary: boolean;
  joinedAt?: string | null;
}

export interface AccessibleStudentOption {
  id: string;
  fullName: string;
  fullNameArabic: string;
  status: string | null;
  studentNumber: string | null;
  username: string | null;
  enrolledAt: string | null;
  groups: AcademicGroupMembership[];
}

export interface AcademicCourseProgressRow {
  courseId: string;
  title: string;
  titleArabic: string;
  level: string | null;
  isPublished: boolean;
  groups: { id: string; name: string; nameArabic: string; academicYear: string | null }[];
  totalLessons: number;
  completedLessons: number;
  pendingLessons: number;
  progressPercentage: number | null;
  lastAccessedAt: string | null;
}

export interface AcademicQuizRow {
  id: string;
  quizId: string;
  title: string;
  titleArabic: string;
  courseId: string | null;
  courseTitle: string | null;
  courseTitleArabic: string | null;
  groupId: string | null;
  groupName: string | null;
  groupNameArabic: string | null;
  academicYear: string | null;
  attemptNumber: number;
  status: string;
  passingScore: number | null;
  requiresManualGrading: boolean;
  isResultReleased: boolean;
  pointsScored: number | null;
  totalPointsPossible: number | null;
  percentageScore: number | null;
  isPassed: boolean | null;
  teacherFeedback: string | null;
  startedAt: string;
  submittedAt: string | null;
  gradedAt: string | null;
  eventAt: string;
}

export interface AcademicAssignmentRow {
  id: string;
  assignmentId: string;
  title: string;
  titleArabic: string;
  courseId: string | null;
  courseTitle: string | null;
  courseTitleArabic: string | null;
  groupId: string | null;
  groupName: string | null;
  groupNameArabic: string | null;
  academicYear: string | null;
  attemptNumber: number;
  status: string;
  maxScore: number | null;
  dueDate: string | null;
  submittedAt: string | null;
  isLate: boolean;
  gradedAt: string | null;
  isGradeReleased: boolean;
  releasedAt: string | null;
  score: number | null;
  percentageScore: number | null;
  teacherFeedback: string | null;
}

export interface AcademicAttendanceRow {
  id: string;
  sessionId: string;
  sessionTitle: string;
  sessionTitleArabic: string | null;
  courseId: string | null;
  courseTitle: string | null;
  courseTitleArabic: string | null;
  groupId: string | null;
  groupName: string | null;
  groupNameArabic: string | null;
  startTime: string;
  status: 'present' | 'late' | 'excused' | 'absent' | string;
  joinedAt: string | null;
  recordedAt: string;
  notes: string | null;
}

export interface AcademicAttendanceSummary {
  present: number;
  late: number;
  excused: number;
  absent: number;
  total: number;
  countableTotal: number;
  attendanceRatePct: number | null;
}

export interface AcademicSummaryMetrics {
  enrolledCourses: number;
  totalLessons: number;
  completedLessons: number;
  pendingLessons: number;
  courseProgressPct: number | null;
  quizAttemptsCount: number;
  completedQuizzesCount: number;
  gradedQuizzesCount: number;
  avgQuizPercentage: number | null;
  assignmentSubmissionsCount: number;
  gradedAssignmentsCount: number;
  avgAssignmentPercentage: number | null;
  overallAcademicAveragePct: number | null;
  passingThreshold: number | null;
  attendanceRatePct: number | null;
  lastLearningActivityAt: string | null;
}

export interface StudentAcademicRecord {
  student: {
    id: string;
    fullName: string;
    fullNameArabic: string;
    status: string | null;
    studentNumber: string | null;
    username: string | null;
    enrolledAt: string | null;
    notes: string | null;
  };
  groups: AcademicGroupMembership[];
  courses: AcademicCourseProgressRow[];
  quizzes: AcademicQuizRow[];
  assignments: AcademicAssignmentRow[];
  attendance: AcademicAttendanceRow[];
  attendanceSummary: AcademicAttendanceSummary;
  summary: AcademicSummaryMetrics;
  timezone: string;
}

export type TranscriptEntryType = 'quiz' | 'assignment' | 'attendance';

export interface UnifiedTranscriptEntry {
  id: string;
  entryType: TranscriptEntryType;
  title: string;
  titleArabic: string;
  courseId: string | null;
  courseTitle: string | null;
  courseTitleArabic: string | null;
  groupId: string | null;
  groupName: string | null;
  groupNameArabic: string | null;
  academicYear: string | null;
  eventAt: string;
  statusLabel: string;
  statusKey: string;
  rawScoreDisplay: string | null;
  percentageScore: number | null;
  passingThreshold: number | null;
  isPassed: boolean | null;
  isLate: boolean;
  isReleased: boolean;
  feedback: string | null;
  attemptNumber: number | null;
}

export interface TranscriptFilterOptions {
  search: string;
  assessmentType: 'all' | TranscriptEntryType;
  courseId: string;
  groupId: string;
  academicYear: string;
  dateFrom: string;
  dateTo: string;
  sortBy: 'date_desc' | 'date_asc' | 'score_desc' | 'score_asc';
}

export interface AcademicRecordQueryFilters {
  studentId?: string | null;
  courseId?: string | null;
  groupId?: string | null;
  academicYear?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
}

function academicContractError(fieldPath: string, detail: string): ServiceError {
  return new ServiceError({
    category: 'DATABASE_ERROR',
    code: 'INVALID_ACADEMIC_RECORD_CONTRACT',
    message: `Academic record payload contract violation at "${fieldPath}": ${detail}`,
    service: SERVICE,
    operation: 'mapRawAcademicRecord',
  });
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v && typeof v === 'object' && !Array.isArray(v));
}

function hasOwn(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function readRequiredObject(
  parent: Record<string, unknown>,
  key: string,
  path: string
): Record<string, unknown> {
  if (!hasOwn(parent, key) || !isPlainObject(parent[key])) {
    throw academicContractError(path, 'expected non-null object');
  }
  return parent[key] as Record<string, unknown>;
}

function readRequiredArray(
  parent: Record<string, unknown>,
  key: string,
  path: string
): unknown[] {
  if (!hasOwn(parent, key) || !Array.isArray(parent[key])) {
    throw academicContractError(path, 'expected array');
  }
  return parent[key] as unknown[];
}

function parseStrictFiniteNumber(val: unknown, path: string): number {
  if (typeof val === 'boolean' || (typeof val === 'string' && val.trim() === '')) {
    throw academicContractError(path, 'expected finite number');
  }
  if (typeof val !== 'number' && typeof val !== 'string') {
    throw academicContractError(path, 'expected finite number');
  }
  const n = Number(val);
  if (!Number.isFinite(n)) {
    throw academicContractError(path, 'expected finite number');
  }
  return n;
}

function readRequiredFiniteNumber(
  obj: Record<string, unknown>,
  key: string,
  path: string
): number {
  if (!hasOwn(obj, key) || obj[key] === undefined) {
    throw academicContractError(path, 'missing required numeric field');
  }
  if (obj[key] === null) {
    throw academicContractError(path, 'required numeric field cannot be null');
  }
  return parseStrictFiniteNumber(obj[key], path);
}

function readNullableFiniteNumber(
  obj: Record<string, unknown>,
  key: string,
  path: string,
  options: { allowOmitted?: boolean } = {}
): number | null {
  if (!hasOwn(obj, key) || obj[key] === undefined) {
    if (options.allowOmitted) return null;
    throw academicContractError(path, 'missing nullable numeric field');
  }
  if (obj[key] === null) {
    return null;
  }
  return parseStrictFiniteNumber(obj[key], path);
}

function readRequiredBoolean(
  obj: Record<string, unknown>,
  key: string,
  path: string
): boolean {
  if (!hasOwn(obj, key) || typeof obj[key] !== 'boolean') {
    throw academicContractError(path, 'expected boolean');
  }
  return obj[key] as boolean;
}

function readNullableBoolean(
  obj: Record<string, unknown>,
  key: string,
  path: string,
  options: { allowOmitted?: boolean } = {}
): boolean | null {
  if (!hasOwn(obj, key) || obj[key] === undefined) {
    if (options.allowOmitted) return null;
    throw academicContractError(path, 'missing nullable boolean field');
  }
  if (obj[key] === null) {
    return null;
  }
  if (typeof obj[key] !== 'boolean') {
    throw academicContractError(path, 'expected boolean or null');
  }
  return obj[key] as boolean;
}

function readRequiredString(
  obj: Record<string, unknown>,
  key: string,
  path: string
): string {
  if (!hasOwn(obj, key) || typeof obj[key] !== 'string' || obj[key].trim() === '') {
    throw academicContractError(path, 'expected non-empty string');
  }
  return obj[key] as string;
}

function readNullableString(
  obj: Record<string, unknown>,
  key: string,
  path: string,
  options: { allowOmitted?: boolean } = {}
): string | null {
  if (!hasOwn(obj, key) || obj[key] === undefined) {
    if (options.allowOmitted) return null;
    throw academicContractError(path, 'missing nullable string field');
  }
  if (obj[key] === null) {
    return null;
  }
  if (typeof obj[key] !== 'string') {
    throw academicContractError(path, 'expected string or null');
  }
  const str = obj[key] as string;
  return str.trim() === '' ? null : str;
}

function toNumOrNull(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

function unwrapSingle<T>(val: T | T[] | null | undefined): T | null {
  if (!val) return null;
  return Array.isArray(val) ? val[0] ?? null : val;
}

function throwLoggedServiceError(
  err: unknown,
  context: { service: string; operation: string; fallbackMessage?: string }
): never {
  const serviceErr = toServiceError(err, context);
  logServiceError(serviceErr);
  throw serviceErr;
}

/**
 * Checks strictly whether a Phase 6A RPC failed because the RPC migration is not yet
 * deployed (PGRST202 / 42883) or because an unpatched 20261114000019 RPC hit the
 * known `gs.is_primary` / optional Phase 5C schema mismatch inside the RPC body.
 * Never returns true for RLS (42501), auth (401), not-found (P0002), or network errors.
 */
export function isAcademicRecordsRpcCompatibilityError(err: unknown): boolean {
  if (!err || !isMissingSchemaFeatureError(err)) {
    return false;
  }

  const record = typeof err === 'object' ? (err as Record<string, unknown>) : {};
  const code = String(record.code || '').toUpperCase();
  const message = `${String(record.message || '')} ${String(record.details || '')} ${String(record.hint || '')}`.toLowerCase();

  if (code === 'PGRST202' || code === '42883') {
    return true;
  }

  if (
    /could not find the function/i.test(message) ||
    /function .* does not exist/i.test(message)
  ) {
    return true;
  }

  if (
    (code === '42703' || code === '42P01') &&
    /(is_primary|assignment_targets|is_grade_released|attempt_number|can_manage_assignment|a\.teacher_id)/.test(
      message
    )
  ) {
    return true;
  }

  return false;
}

function matchesRiyadhDateBounds(
  iso: string | null | undefined,
  dateFrom?: string | null,
  dateTo?: string | null
): boolean {
  if (!dateFrom && !dateTo) return true;
  if (!iso) return false;
  const riyadhDate = utcToRiyadhInputs(iso).date;
  if (!riyadhDate) return false;
  if (dateFrom && riyadhDate < dateFrom) return false;
  if (dateTo && riyadhDate > dateTo) return false;
  return true;
}

/**
 * Pure transformer combining quiz attempts, assignment submissions, and attendance records
 * into a unified chronological academic transcript without fabricating missing grades as 0.
 */
export function buildUnifiedTranscript(record: StudentAcademicRecord): UnifiedTranscriptEntry[] {
  const entries: UnifiedTranscriptEntry[] = [];

  for (const q of record.quizzes) {
    const hasScore = q.percentageScore !== null && q.isResultReleased;
    const rawDisplay =
      hasScore && q.pointsScored !== null && q.totalPointsPossible !== null
        ? `${q.pointsScored} / ${q.totalPointsPossible}`
        : null;

    entries.push({
      id: `quiz-${q.id}`,
      entryType: 'quiz',
      title: q.title,
      titleArabic: q.titleArabic || q.title,
      courseId: q.courseId,
      courseTitle: q.courseTitle,
      courseTitleArabic: q.courseTitleArabic,
      groupId: q.groupId,
      groupName: q.groupName,
      groupNameArabic: q.groupNameArabic,
      academicYear: q.academicYear,
      eventAt: q.eventAt,
      statusLabel: q.status,
      statusKey: q.status,
      rawScoreDisplay: rawDisplay,
      percentageScore: hasScore ? q.percentageScore : null,
      passingThreshold: q.passingScore,
      isPassed: hasScore ? q.isPassed : null,
      isLate: false,
      isReleased: q.isResultReleased,
      feedback: q.teacherFeedback,
      attemptNumber: q.attemptNumber,
    });
  }

  for (const a of record.assignments) {
    const hasScore = a.score !== null && a.percentageScore !== null;
    const rawDisplay =
      hasScore && a.maxScore !== null
        ? `${a.score} / ${a.maxScore}`
        : hasScore
        ? String(a.score)
        : null;

    entries.push({
      id: `assignment-${a.id}`,
      entryType: 'assignment',
      title: a.title,
      titleArabic: a.titleArabic || a.title,
      courseId: a.courseId,
      courseTitle: a.courseTitle,
      courseTitleArabic: a.courseTitleArabic,
      groupId: a.groupId,
      groupName: a.groupName,
      groupNameArabic: a.groupNameArabic,
      academicYear: a.academicYear,
      eventAt: a.submittedAt || '',
      statusLabel: a.status,
      statusKey: a.status,
      rawScoreDisplay: rawDisplay,
      percentageScore: hasScore ? a.percentageScore : null,
      passingThreshold: null,
      isPassed: null,
      isLate: a.isLate,
      isReleased: a.isGradeReleased,
      feedback: a.teacherFeedback,
      attemptNumber: a.attemptNumber,
    });
  }

  for (const att of record.attendance) {
    entries.push({
      id: `attendance-${att.id}`,
      entryType: 'attendance',
      title: att.sessionTitle,
      titleArabic: att.sessionTitleArabic || att.sessionTitle,
      courseId: att.courseId,
      courseTitle: att.courseTitle,
      courseTitleArabic: att.courseTitleArabic,
      groupId: att.groupId,
      groupName: att.groupName,
      groupNameArabic: att.groupNameArabic,
      academicYear: null,
      eventAt: att.startTime,
      statusLabel: att.status,
      statusKey: att.status,
      rawScoreDisplay: null,
      percentageScore: null,
      passingThreshold: null,
      isPassed: null,
      isLate: att.status === 'late',
      isReleased: true,
      feedback: att.notes,
      attemptNumber: null,
    });
  }

  return entries.sort((a, b) => new Date(b.eventAt).getTime() - new Date(a.eventAt).getTime());
}

/**
 * Pure client-side refinement filter + sort + pagination on an already-fetched student record.
 */
export function filterAndSortTranscript(
  entries: UnifiedTranscriptEntry[],
  filters: TranscriptFilterOptions
): UnifiedTranscriptEntry[] {
  const searchTerm = filters.search.trim().toLowerCase();

  const filtered = entries.filter((item) => {
    if (filters.assessmentType !== 'all' && item.entryType !== filters.assessmentType) {
      return false;
    }
    if (filters.courseId && filters.courseId !== 'all' && item.courseId !== filters.courseId) {
      return false;
    }
    if (filters.groupId && filters.groupId !== 'all' && item.groupId !== filters.groupId) {
      return false;
    }
    if (
      filters.academicYear &&
      filters.academicYear !== 'all' &&
      item.academicYear !== filters.academicYear
    ) {
      return false;
    }
    if (searchTerm) {
      const haystacks = [
        item.title,
        item.titleArabic,
        item.courseTitle || '',
        item.courseTitleArabic || '',
        item.feedback || '',
      ]
        .join(' ')
        .toLowerCase();
      if (!haystacks.includes(searchTerm)) return false;
    }
    return true;
  });

  return [...filtered].sort((a, b) => {
    if (filters.sortBy === 'date_asc') {
      return new Date(a.eventAt).getTime() - new Date(b.eventAt).getTime();
    }
    if (filters.sortBy === 'score_desc') {
      return (b.percentageScore ?? -1) - (a.percentageScore ?? -1);
    }
    if (filters.sortBy === 'score_asc') {
      return (a.percentageScore ?? 999) - (b.percentageScore ?? 999);
    }
    return new Date(b.eventAt).getTime() - new Date(a.eventAt).getTime();
  });
}

export function paginateArray<T>(
  items: T[],
  page: number,
  pageSize: number
): { items: T[]; totalPages: number; currentPage: number; totalCount: number } {
  const safeSize = Math.max(1, pageSize);
  const totalCount = items.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / safeSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * safeSize;
  return {
    items: items.slice(start, start + safeSize),
    totalPages,
    currentPage,
    totalCount,
  };
}

export function formatRecordTimestampRiyadh(iso: string | null | undefined, locale: 'ar' | 'en'): string {
  if (!iso) return '—';
  const formatted = formatRiyadhDateTime(iso, { locale, includeDate: true, includeTime: true });
  return formatted || '—';
}

export function mapRawAcademicRecord(raw: unknown): StudentAcademicRecord {
  if (!isPlainObject(raw)) {
    throw academicContractError('root', 'expected non-null academic record object');
  }

  const student = readRequiredObject(raw, 'student', 'student');
  const groupsRaw = readRequiredArray(raw, 'groups', 'groups');
  const coursesRaw = readRequiredArray(raw, 'courses', 'courses');
  const quizzesRaw = readRequiredArray(raw, 'quizzes', 'quizzes');
  const assignmentsRaw = readRequiredArray(raw, 'assignments', 'assignments');
  const attendanceRaw = readRequiredArray(raw, 'attendance', 'attendance');
  const attSum = readRequiredObject(raw, 'attendance_summary', 'attendance_summary');
  const sum = readRequiredObject(raw, 'summary', 'summary');
  const timezone = readRequiredString(raw, 'timezone', 'timezone');

  const studentFullName =
    readNullableString(student, 'full_name', 'student.full_name', { allowOmitted: true }) ?? '';
  const studentFullNameArabic =
    readNullableString(student, 'full_name_arabic', 'student.full_name_arabic', {
      allowOmitted: true,
    }) || studentFullName;

  return {
    student: {
      id: readRequiredString(student, 'id', 'student.id'),
      fullName: studentFullName,
      fullNameArabic: studentFullNameArabic,
      status: readNullableString(student, 'status', 'student.status', { allowOmitted: true }),
      studentNumber: readNullableString(student, 'student_number', 'student.student_number', {
        allowOmitted: true,
      }),
      username: readNullableString(student, 'username', 'student.username', { allowOmitted: true }),
      enrolledAt: readNullableString(student, 'enrolled_at', 'student.enrolled_at', {
        allowOmitted: true,
      }),
      notes: readNullableString(student, 'notes', 'student.notes', { allowOmitted: true }),
    },
    groups: groupsRaw.map((g, idx) => {
      const path = `groups[${idx}]`;
      if (!isPlainObject(g)) {
        throw academicContractError(path, 'expected object');
      }
      const name = readRequiredString(g, 'name', `${path}.name`);
      const nameArabic =
        readNullableString(g, 'name_arabic', `${path}.name_arabic`, { allowOmitted: true }) || name;
      return {
        id: readRequiredString(g, 'id', `${path}.id`),
        name,
        nameArabic,
        academicYear: readNullableString(g, 'academic_year', `${path}.academic_year`, {
          allowOmitted: true,
        }),
        isActive: readRequiredBoolean(g, 'is_active', `${path}.is_active`),
        archivedAt: readNullableString(g, 'archived_at', `${path}.archived_at`, {
          allowOmitted: true,
        }),
        isPrimary: readRequiredBoolean(g, 'is_primary', `${path}.is_primary`),
        joinedAt: readNullableString(g, 'joined_at', `${path}.joined_at`, { allowOmitted: true }),
      };
    }),
    courses: coursesRaw.map((c, idx) => {
      const path = `courses[${idx}]`;
      if (!isPlainObject(c)) {
        throw academicContractError(path, 'expected object');
      }
      const title = readRequiredString(c, 'title', `${path}.title`);
      const titleArabic =
        readNullableString(c, 'title_arabic', `${path}.title_arabic`, { allowOmitted: true }) ||
        title;
      const courseGroupsRaw = readRequiredArray(c, 'groups', `${path}.groups`);
      return {
        courseId: readRequiredString(c, 'course_id', `${path}.course_id`),
        title,
        titleArabic,
        level: readNullableString(c, 'level', `${path}.level`, { allowOmitted: true }),
        isPublished: readRequiredBoolean(c, 'is_published', `${path}.is_published`),
        groups: courseGroupsRaw.map((cg, cgIdx) => {
          const cgPath = `${path}.groups[${cgIdx}]`;
          if (!isPlainObject(cg)) {
            throw academicContractError(cgPath, 'expected object');
          }
          const cgName = readRequiredString(cg, 'name', `${cgPath}.name`);
          return {
            id: readRequiredString(cg, 'id', `${cgPath}.id`),
            name: cgName,
            nameArabic:
              readNullableString(cg, 'name_arabic', `${cgPath}.name_arabic`, {
                allowOmitted: true,
              }) || cgName,
            academicYear: readNullableString(cg, 'academic_year', `${cgPath}.academic_year`, {
              allowOmitted: true,
            }),
          };
        }),
        totalLessons: readRequiredFiniteNumber(c, 'total_lessons', `${path}.total_lessons`),
        completedLessons: readRequiredFiniteNumber(
          c,
          'completed_lessons',
          `${path}.completed_lessons`
        ),
        pendingLessons: readRequiredFiniteNumber(c, 'pending_lessons', `${path}.pending_lessons`),
        progressPercentage: readNullableFiniteNumber(
          c,
          'progress_percentage',
          `${path}.progress_percentage`
        ),
        lastAccessedAt: readNullableString(c, 'last_accessed_at', `${path}.last_accessed_at`, {
          allowOmitted: true,
        }),
      };
    }),
    quizzes: quizzesRaw.map((q, idx) => {
      const path = `quizzes[${idx}]`;
      if (!isPlainObject(q)) {
        throw academicContractError(path, 'expected object');
      }
      const title = readRequiredString(q, 'title', `${path}.title`);
      const titleArabic =
        readNullableString(q, 'title_arabic', `${path}.title_arabic`, { allowOmitted: true }) ||
        title;
      const startedAt = readRequiredString(q, 'started_at', `${path}.started_at`);
      const submittedAt = readNullableString(q, 'submitted_at', `${path}.submitted_at`, {
        allowOmitted: true,
      });
      const eventAt =
        readNullableString(q, 'event_at', `${path}.event_at`, { allowOmitted: true }) ||
        submittedAt ||
        startedAt;

      return {
        id: readRequiredString(q, 'id', `${path}.id`),
        quizId: readRequiredString(q, 'quiz_id', `${path}.quiz_id`),
        title,
        titleArabic,
        courseId: readNullableString(q, 'course_id', `${path}.course_id`, { allowOmitted: true }),
        courseTitle: readNullableString(q, 'course_title', `${path}.course_title`, {
          allowOmitted: true,
        }),
        courseTitleArabic: readNullableString(
          q,
          'course_title_arabic',
          `${path}.course_title_arabic`,
          { allowOmitted: true }
        ),
        groupId: readNullableString(q, 'group_id', `${path}.group_id`, { allowOmitted: true }),
        groupName: readNullableString(q, 'group_name', `${path}.group_name`, {
          allowOmitted: true,
        }),
        groupNameArabic: readNullableString(q, 'group_name_arabic', `${path}.group_name_arabic`, {
          allowOmitted: true,
        }),
        academicYear: readNullableString(q, 'academic_year', `${path}.academic_year`, {
          allowOmitted: true,
        }),
        attemptNumber: readRequiredFiniteNumber(q, 'attempt_number', `${path}.attempt_number`),
        status: readRequiredString(q, 'status', `${path}.status`),
        passingScore: readNullableFiniteNumber(q, 'passing_score', `${path}.passing_score`, {
          allowOmitted: true,
        }),
        requiresManualGrading: readRequiredBoolean(
          q,
          'requires_manual_grading',
          `${path}.requires_manual_grading`
        ),
        isResultReleased: readRequiredBoolean(
          q,
          'is_result_released',
          `${path}.is_result_released`
        ),
        pointsScored: readNullableFiniteNumber(q, 'points_scored', `${path}.points_scored`),
        totalPointsPossible: readNullableFiniteNumber(
          q,
          'total_points_possible',
          `${path}.total_points_possible`
        ),
        percentageScore: readNullableFiniteNumber(
          q,
          'percentage_score',
          `${path}.percentage_score`
        ),
        isPassed: readNullableBoolean(q, 'is_passed', `${path}.is_passed`),
        teacherFeedback: readNullableString(q, 'teacher_feedback', `${path}.teacher_feedback`, {
          allowOmitted: true,
        }),
        startedAt,
        submittedAt,
        gradedAt: readNullableString(q, 'graded_at', `${path}.graded_at`, { allowOmitted: true }),
        eventAt,
      };
    }),
    assignments: assignmentsRaw.map((a, idx) => {
      const path = `assignments[${idx}]`;
      if (!isPlainObject(a)) {
        throw academicContractError(path, 'expected object');
      }
      const title = readRequiredString(a, 'title', `${path}.title`);
      const titleArabic =
        readNullableString(a, 'title_arabic', `${path}.title_arabic`, { allowOmitted: true }) ||
        title;

      return {
        id: readRequiredString(a, 'id', `${path}.id`),
        assignmentId: readRequiredString(a, 'assignment_id', `${path}.assignment_id`),
        title,
        titleArabic,
        courseId: readNullableString(a, 'course_id', `${path}.course_id`, { allowOmitted: true }),
        courseTitle: readNullableString(a, 'course_title', `${path}.course_title`, {
          allowOmitted: true,
        }),
        courseTitleArabic: readNullableString(
          a,
          'course_title_arabic',
          `${path}.course_title_arabic`,
          { allowOmitted: true }
        ),
        groupId: readNullableString(a, 'group_id', `${path}.group_id`, { allowOmitted: true }),
        groupName: readNullableString(a, 'group_name', `${path}.group_name`, {
          allowOmitted: true,
        }),
        groupNameArabic: readNullableString(a, 'group_name_arabic', `${path}.group_name_arabic`, {
          allowOmitted: true,
        }),
        academicYear: readNullableString(a, 'academic_year', `${path}.academic_year`, {
          allowOmitted: true,
        }),
        attemptNumber: readRequiredFiniteNumber(a, 'attempt_number', `${path}.attempt_number`),
        status: readRequiredString(a, 'status', `${path}.status`),
        maxScore: readNullableFiniteNumber(a, 'max_score', `${path}.max_score`, {
          allowOmitted: true,
        }),
        dueDate: readNullableString(a, 'due_date', `${path}.due_date`, { allowOmitted: true }),
        submittedAt: readNullableString(a, 'submitted_at', `${path}.submitted_at`, {
          allowOmitted: true,
        }),
        isLate: readRequiredBoolean(a, 'is_late', `${path}.is_late`),
        gradedAt: readNullableString(a, 'graded_at', `${path}.graded_at`, { allowOmitted: true }),
        isGradeReleased: readRequiredBoolean(
          a,
          'is_grade_released',
          `${path}.is_grade_released`
        ),
        releasedAt: readNullableString(a, 'released_at', `${path}.released_at`, {
          allowOmitted: true,
        }),
        score: readNullableFiniteNumber(a, 'score', `${path}.score`),
        percentageScore: readNullableFiniteNumber(
          a,
          'percentage_score',
          `${path}.percentage_score`
        ),
        teacherFeedback: readNullableString(a, 'teacher_feedback', `${path}.teacher_feedback`, {
          allowOmitted: true,
        }),
      };
    }),
    attendance: attendanceRaw.map((att, idx) => {
      const path = `attendance[${idx}]`;
      if (!isPlainObject(att)) {
        throw academicContractError(path, 'expected object');
      }
      return {
        id: readRequiredString(att, 'id', `${path}.id`),
        sessionId: readRequiredString(att, 'session_id', `${path}.session_id`),
        sessionTitle: readRequiredString(att, 'session_title', `${path}.session_title`),
        sessionTitleArabic: readNullableString(
          att,
          'session_title_arabic',
          `${path}.session_title_arabic`,
          { allowOmitted: true }
        ),
        courseId: readNullableString(att, 'course_id', `${path}.course_id`, { allowOmitted: true }),
        courseTitle: readNullableString(att, 'course_title', `${path}.course_title`, {
          allowOmitted: true,
        }),
        courseTitleArabic: readNullableString(
          att,
          'course_title_arabic',
          `${path}.course_title_arabic`,
          { allowOmitted: true }
        ),
        groupId: readNullableString(att, 'group_id', `${path}.group_id`, { allowOmitted: true }),
        groupName: readNullableString(att, 'group_name', `${path}.group_name`, {
          allowOmitted: true,
        }),
        groupNameArabic: readNullableString(
          att,
          'group_name_arabic',
          `${path}.group_name_arabic`,
          { allowOmitted: true }
        ),
        startTime: readRequiredString(att, 'start_time', `${path}.start_time`),
        status: readRequiredString(att, 'status', `${path}.status`),
        joinedAt: readNullableString(att, 'joined_at', `${path}.joined_at`, { allowOmitted: true }),
        recordedAt: readRequiredString(att, 'recorded_at', `${path}.recorded_at`),
        notes: readNullableString(att, 'notes', `${path}.notes`, { allowOmitted: true }),
      };
    }),
    attendanceSummary: {
      present: readRequiredFiniteNumber(attSum, 'present', 'attendance_summary.present'),
      late: readRequiredFiniteNumber(attSum, 'late', 'attendance_summary.late'),
      excused: readRequiredFiniteNumber(attSum, 'excused', 'attendance_summary.excused'),
      absent: readRequiredFiniteNumber(attSum, 'absent', 'attendance_summary.absent'),
      total: readRequiredFiniteNumber(attSum, 'total', 'attendance_summary.total'),
      countableTotal: readRequiredFiniteNumber(
        attSum,
        'countable_total',
        'attendance_summary.countable_total'
      ),
      attendanceRatePct: readNullableFiniteNumber(
        attSum,
        'attendance_rate_pct',
        'attendance_summary.attendance_rate_pct'
      ),
    },
    summary: {
      enrolledCourses: readRequiredFiniteNumber(sum, 'enrolled_courses', 'summary.enrolled_courses'),
      totalLessons: readRequiredFiniteNumber(sum, 'total_lessons', 'summary.total_lessons'),
      completedLessons: readRequiredFiniteNumber(
        sum,
        'completed_lessons',
        'summary.completed_lessons'
      ),
      pendingLessons: readRequiredFiniteNumber(sum, 'pending_lessons', 'summary.pending_lessons'),
      courseProgressPct: readNullableFiniteNumber(
        sum,
        'course_progress_pct',
        'summary.course_progress_pct'
      ),
      quizAttemptsCount: readRequiredFiniteNumber(
        sum,
        'quiz_attempts_count',
        'summary.quiz_attempts_count'
      ),
      completedQuizzesCount: readRequiredFiniteNumber(
        sum,
        'completed_quizzes_count',
        'summary.completed_quizzes_count'
      ),
      gradedQuizzesCount: readRequiredFiniteNumber(
        sum,
        'graded_quizzes_count',
        'summary.graded_quizzes_count'
      ),
      avgQuizPercentage: readNullableFiniteNumber(
        sum,
        'avg_quiz_percentage',
        'summary.avg_quiz_percentage'
      ),
      assignmentSubmissionsCount: readRequiredFiniteNumber(
        sum,
        'assignment_submissions_count',
        'summary.assignment_submissions_count'
      ),
      gradedAssignmentsCount: readRequiredFiniteNumber(
        sum,
        'graded_assignments_count',
        'summary.graded_assignments_count'
      ),
      avgAssignmentPercentage: readNullableFiniteNumber(
        sum,
        'avg_assignment_percentage',
        'summary.avg_assignment_percentage'
      ),
      overallAcademicAveragePct: readNullableFiniteNumber(
        sum,
        'overall_academic_average_pct',
        'summary.overall_academic_average_pct'
      ),
      passingThreshold: readNullableFiniteNumber(
        sum,
        'passing_threshold',
        'summary.passing_threshold',
        { allowOmitted: true }
      ),
      attendanceRatePct: readNullableFiniteNumber(
        sum,
        'attendance_rate_pct',
        'summary.attendance_rate_pct'
      ),
      lastLearningActivityAt: readNullableString(
        sum,
        'last_learning_activity_at',
        'summary.last_learning_activity_at',
        { allowOmitted: true }
      ),
    },
    timezone,
  };
}

// ============================================================================
// SCHEMA-SAFE DIRECT RLS QUERY IMPLEMENTATION (WHEN PHASE 6A RPC IS PENDING)
// ============================================================================

interface CallerContext {
  userId: string;
  role: 'super_admin' | 'teacher' | 'student';
  isSuperAdmin: boolean;
  isStaff: boolean;
}

interface TeacherScope {
  authorizedGroupIds: Set<string>;
  authorizedCourseIds: Set<string>;
  authorizedQuizIds: Set<string>;
  authorizedAssignmentIds: Set<string>;
}

const GROUP_MEMBERSHIPS_SELECT_WITH_ARCHIVE = `
  student_id,
  group_id,
  joined_at,
  groups:group_id (
    id,
    name,
    name_arabic,
    academic_year,
    is_active,
    archived_at
  )
`;

const GROUP_MEMBERSHIPS_SELECT_BASELINE = `
  student_id,
  group_id,
  joined_at,
  groups:group_id (
    id,
    name,
    name_arabic,
    academic_year,
    is_active
  )
`;

const PHASE5C_SUBMISSIONS_SELECT = `
  id,
  assignment_id,
  attempt_number,
  status,
  submitted_at,
  is_late,
  graded_at,
  is_grade_released,
  released_at,
  score,
  teacher_feedback,
  assignments:assignment_id (
    id,
    course_id,
    teacher_id,
    target_group_id,
    title,
    title_arabic,
    max_score,
    due_date,
    courses:course_id (
      id,
      title,
      title_arabic,
      teacher_id
    ),
    groups:target_group_id (
      id,
      name,
      name_arabic,
      academic_year
    )
  )
`;

const BASELINE_SUBMISSIONS_SELECT = `
  id,
  assignment_id,
  submitted_at,
  is_late,
  graded_at,
  score,
  teacher_feedback,
  assignments:assignment_id (
    id,
    course_id,
    target_group_id,
    title,
    title_arabic,
    max_score,
    due_date,
    courses:course_id (
      id,
      title,
      title_arabic,
      teacher_id
    ),
    groups:target_group_id (
      id,
      name,
      name_arabic,
      academic_year
    )
  )
`;

async function resolveCallerContext(
  client: SupabaseClient,
  userId: string,
  operation: string
): Promise<CallerContext> {
  let res;
  try {
    res = await client
      .from('profiles')
      .select('id, role, status')
      .eq('id', userId)
      .single();
  } catch (err) {
    throwLoggedServiceError(err, { service: SERVICE, operation });
  }

  if (res.error) {
    throwLoggedServiceError(res.error, {
      service: SERVICE,
      operation,
      fallbackMessage: 'Failed to verify active user role.',
    });
  }

  const profile = res.data as { id: string; role: string; status: string } | null;
  if (!profile || profile.status !== 'active') {
    throwLoggedServiceError(
      new ServiceError({
        category: 'AUTHORIZATION_ERROR',
        code: '42501',
        status: 403,
        message: 'Forbidden: Active account required',
        service: SERVICE,
        operation,
      }),
      { service: SERVICE, operation }
    );
  }

  if (profile.role !== 'super_admin' && profile.role !== 'teacher' && profile.role !== 'student') {
    throwLoggedServiceError(
      new ServiceError({
        category: 'AUTHORIZATION_ERROR',
        code: '42501',
        status: 403,
        message: 'Forbidden: Insufficient permissions',
        service: SERVICE,
        operation,
      }),
      { service: SERVICE, operation }
    );
  }

  return {
    userId: profile.id,
    role: profile.role,
    isSuperAdmin: profile.role === 'super_admin',
    isStaff: profile.role === 'super_admin' || profile.role === 'teacher',
  };
}

async function resolveTeacherScope(
  client: SupabaseClient,
  teacherId: string,
  operation: string
): Promise<TeacherScope> {
  const fetchTeacherAssignments = async () => {
    const primary = await client
      .from('assignments')
      .select('id, course_id, target_group_id')
      .eq('teacher_id', teacherId);

    if (primary.error && isMissingSchemaFeatureError(primary.error)) {
      return await client
        .from('assignments')
        .select('id, course_id, target_group_id, courses:course_id!inner(teacher_id)')
        .eq('courses.teacher_id', teacherId);
    }
    return primary;
  };

  let coursesRes: any;
  let sessionsRes: any;
  let quizzesRes: any;
  let assignmentsRes: any;

  try {
    [coursesRes, sessionsRes, quizzesRes, assignmentsRes] = await Promise.all([
      client.from('courses').select('id').eq('teacher_id', teacherId),
      client.from('live_sessions').select('group_id').eq('teacher_id', teacherId),
      client.from('quizzes').select('id, group_id').eq('teacher_id', teacherId),
      fetchTeacherAssignments(),
    ]);
  } catch (err) {
    throwLoggedServiceError(err, { service: SERVICE, operation: `${operation}.teacherScope` });
  }

  for (const r of [coursesRes, sessionsRes, quizzesRes, assignmentsRes]) {
    if (r.error) {
      throwLoggedServiceError(r.error, {
        service: SERVICE,
        operation: `${operation}.teacherScope`,
        fallbackMessage: 'Failed to verify teacher authorization scope.',
      });
    }
  }

  const authorizedCourseIds = new Set<string>(
    (coursesRes.data || []).map((c: any) => c.id).filter(Boolean)
  );
  const authorizedGroupIds = new Set<string>();
  const authorizedQuizIds = new Set<string>();
  const authorizedAssignmentIds = new Set<string>();

  for (const s of sessionsRes.data || []) {
    if (s.group_id) authorizedGroupIds.add(s.group_id);
  }
  for (const q of quizzesRes.data || []) {
    if (q.id) authorizedQuizIds.add(q.id);
    if (q.group_id) authorizedGroupIds.add(q.group_id);
  }
  for (const a of assignmentsRes.data || []) {
    if (a.id) authorizedAssignmentIds.add(a.id);
    if (a.target_group_id) authorizedGroupIds.add(a.target_group_id);
  }

  if (authorizedCourseIds.size > 0) {
    let gcRes: any;
    try {
      gcRes = await client
        .from('group_courses')
        .select('group_id')
        .in('course_id', Array.from(authorizedCourseIds));
    } catch (err) {
      throwLoggedServiceError(err, { service: SERVICE, operation: `${operation}.teacherGroups` });
    }
    if (gcRes.error) {
      throwLoggedServiceError(gcRes.error, {
        service: SERVICE,
        operation: `${operation}.teacherGroups`,
      });
    }
    for (const row of gcRes.data || []) {
      if (row.group_id) authorizedGroupIds.add(row.group_id);
    }
  }

  return {
    authorizedGroupIds,
    authorizedCourseIds,
    authorizedQuizIds,
    authorizedAssignmentIds,
  };
}

async function fetchGroupMembershipsWithSchemaFallback(
  client: SupabaseClient,
  filter: { studentIds?: string[]; studentId?: string }
): Promise<{ data: any[]; error: unknown }> {
  const buildQuery = (selectStr: string) => {
    let q = client.from('group_students').select(selectStr);
    if (filter.studentId) {
      q = q.eq('student_id', filter.studentId);
    } else if (filter.studentIds && filter.studentIds.length > 0) {
      q = q.in('student_id', filter.studentIds);
    }
    return q;
  };

  const primary = await buildQuery(GROUP_MEMBERSHIPS_SELECT_WITH_ARCHIVE);
  if (primary.error && isMissingSchemaFeatureError(primary.error)) {
    const fallback = await buildQuery(GROUP_MEMBERSHIPS_SELECT_BASELINE);
    return { data: fallback.data || [], error: fallback.error };
  }
  return { data: primary.data || [], error: primary.error };
}

async function fetchAccessibleStudentsDirect(
  client: SupabaseClient,
  caller: CallerContext
): Promise<AccessibleStudentOption[]> {
  const op = 'fetchAccessibleStudentsForRecords.direct';

  if (caller.role === 'student') {
    throwLoggedServiceError(
      new ServiceError({
        category: 'AUTHORIZATION_ERROR',
        code: '42501',
        status: 403,
        message: 'Forbidden: Only teachers and super admins can list student records',
        service: SERVICE,
        operation: op,
      }),
      { service: SERVICE, operation: op }
    );
  }

  let teacherScope: TeacherScope | null = null;
  let scopedStudentIds: string[] | null = null;

  if (caller.role === 'teacher') {
    teacherScope = await resolveTeacherScope(client, caller.userId, op);
    const idSet = new Set<string>();

    const groupIds = Array.from(teacherScope.authorizedGroupIds);
    const quizIds = Array.from(teacherScope.authorizedQuizIds);
    const assignmentIds = Array.from(teacherScope.authorizedAssignmentIds);

    let gsRes: any = { data: [], error: null };
    let qaRes: any = { data: [], error: null };
    let subRes: any = { data: [], error: null };

    try {
      [gsRes, qaRes, subRes] = await Promise.all([
        groupIds.length > 0
          ? client.from('group_students').select('student_id').in('group_id', groupIds)
          : Promise.resolve({ data: [], error: null }),
        quizIds.length > 0
          ? client.from('quiz_attempts').select('student_id').in('quiz_id', quizIds)
          : Promise.resolve({ data: [], error: null }),
        assignmentIds.length > 0
          ? client.from('submissions').select('student_id').in('assignment_id', assignmentIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
    } catch (err) {
      throwLoggedServiceError(err, { service: SERVICE, operation: op });
    }

    for (const r of [gsRes, qaRes, subRes]) {
      if (r.error) {
        throwLoggedServiceError(r.error, { service: SERVICE, operation: op });
      }
    }

    for (const row of gsRes.data || []) if (row.student_id) idSet.add(row.student_id);
    for (const row of qaRes.data || []) if (row.student_id) idSet.add(row.student_id);
    for (const row of subRes.data || []) if (row.student_id) idSet.add(row.student_id);

    scopedStudentIds = Array.from(idSet);
    if (scopedStudentIds.length === 0) {
      return [];
    }
  }

  let profilesQuery = client
    .from('profiles')
    .select('id, full_name, full_name_arabic, status, created_at')
    .eq('role', 'student');

  if (scopedStudentIds !== null) {
    profilesQuery = profilesQuery.in('id', scopedStudentIds);
  }

  let profilesRes: any;
  try {
    profilesRes = await profilesQuery;
  } catch (err) {
    throwLoggedServiceError(err, { service: SERVICE, operation: `${op}.profiles` });
  }
  if (profilesRes.error) {
    throwLoggedServiceError(profilesRes.error, { service: SERVICE, operation: `${op}.profiles` });
  }

  const profileRows = profilesRes.data || [];
  if (profileRows.length === 0) return [];

  const studentIds = profileRows.map((p: any) => p.id);

  let sapRes: any;
  let membershipsRes: { data: any[]; error: unknown };
  try {
    [sapRes, membershipsRes] = await Promise.all([
      client
        .from('student_academic_profiles')
        .select('profile_id, student_number, username, group_id, enrolled_at')
        .in('profile_id', studentIds),
      fetchGroupMembershipsWithSchemaFallback(client, { studentIds }),
    ]);
  } catch (err) {
    throwLoggedServiceError(err, { service: SERVICE, operation: `${op}.details` });
  }

  if (sapRes.error) {
    throwLoggedServiceError(sapRes.error, { service: SERVICE, operation: `${op}.academicProfiles` });
  }
  if (membershipsRes.error) {
    throwLoggedServiceError(membershipsRes.error, {
      service: SERVICE,
      operation: `${op}.groupMemberships`,
    });
  }

  const sapMap = new Map<string, any>();
  for (const s of sapRes.data || []) {
    sapMap.set(s.profile_id, s);
  }

  const groupsByStudent = new Map<string, AcademicGroupMembership[]>();
  for (const row of membershipsRes.data || []) {
    const g = unwrapSingle<any>(row.groups);
    if (!g?.id) continue;
    if (teacherScope && !teacherScope.authorizedGroupIds.has(g.id)) continue;

    const primaryGroupId = sapMap.get(row.student_id)?.group_id || null;
    const list = groupsByStudent.get(row.student_id) || [];
    list.push({
      id: g.id,
      name: g.name,
      nameArabic: g.name_arabic || g.name,
      academicYear: g.academic_year || null,
      isActive: Boolean(g.is_active),
      archivedAt: g.archived_at ?? null,
      isPrimary: Boolean(primaryGroupId && g.id === primaryGroupId),
      joinedAt: row.joined_at ?? null,
    });
    groupsByStudent.set(row.student_id, list);
  }

  return profileRows
    .map((p: any) => {
      const sap = sapMap.get(p.id);
      const groups = (groupsByStudent.get(p.id) || []).sort((a, b) => {
        if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      return {
        id: p.id,
        fullName: p.full_name || '',
        fullNameArabic: p.full_name_arabic || p.full_name || '',
        status: p.status || null,
        studentNumber: sap?.student_number || null,
        username: sap?.username || null,
        enrolledAt: sap?.enrolled_at || p.created_at || null,
        groups,
      };
    })
    .sort((a: AccessibleStudentOption, b: AccessibleStudentOption) =>
      a.fullNameArabic.localeCompare(b.fullNameArabic, 'ar')
    );
}

/**
 * Pure builder computing a complete StudentAcademicRecord from real RLS-filtered table rows.
 * Enforces student privacy/release gating, NULL preservation for ungraded items, course
 * deduplication across groups, Asia/Riyadh date bounds, and teacher scope filtering.
 */
export function buildDirectStudentAcademicRecord(params: {
  callerRole: 'super_admin' | 'teacher' | 'student';
  callerId: string;
  studentProfile: any;
  academicProfile: any | null;
  membershipRows: any[];
  groupCoursesRows: any[];
  lessonRows: any[];
  lessonProgressRows: any[];
  quizAttemptRows: any[];
  submissionRows: any[];
  attendanceRows: any[];
  passingThreshold?: number | null;
  filters?: AcademicRecordQueryFilters;
  teacherScope?: TeacherScope | null;
  assignmentTargetGroupIdsByAssignment?: Map<string, Set<string>>;
}): StudentAcademicRecord {
  const {
    callerRole,
    callerId,
    studentProfile,
    academicProfile,
    membershipRows,
    groupCoursesRows,
    lessonRows,
    lessonProgressRows,
    quizAttemptRows,
    submissionRows,
    attendanceRows,
    passingThreshold = null,
    filters = {},
    teacherScope = null,
    assignmentTargetGroupIdsByAssignment = new Map(),
  } = params;

  const isStaff = callerRole === 'super_admin' || callerRole === 'teacher';
  const isSuper = callerRole === 'super_admin';
  const primaryGroupId: string | null = academicProfile?.group_id || null;

  const courseFilter = filters.courseId && filters.courseId !== 'all' ? filters.courseId : null;
  const groupFilter = filters.groupId && filters.groupId !== 'all' ? filters.groupId : null;
  const yearFilter =
    filters.academicYear && filters.academicYear !== 'all' ? filters.academicYear : null;
  const dateFrom = filters.dateFrom || null;
  const dateTo = filters.dateTo || null;

  const studentGroupsMap = new Map<string, AcademicGroupMembership>();
  const studentAcademicYears = new Set<string>();
  for (const row of membershipRows || []) {
    const g = unwrapSingle<any>(row.groups);
    if (!g?.id) continue;
    if (g.academic_year) studentAcademicYears.add(g.academic_year);
    if (callerRole === 'teacher' && teacherScope && !teacherScope.authorizedGroupIds.has(g.id)) {
      continue;
    }
    studentGroupsMap.set(g.id, {
      id: g.id,
      name: g.name,
      nameArabic: g.name_arabic || g.name,
      academicYear: g.academic_year || null,
      isActive: Boolean(g.is_active),
      archivedAt: g.archived_at ?? null,
      isPrimary: Boolean(primaryGroupId && g.id === primaryGroupId),
      joinedAt: row.joined_at ?? null,
    });
  }

  const groups = Array.from(studentGroupsMap.values()).sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    const bTime = b.joinedAt ? new Date(b.joinedAt).getTime() : 0;
    const aTime = a.joinedAt ? new Date(a.joinedAt).getTime() : 0;
    return bTime - aTime;
  });

  // Track course -> associated group IDs from group_courses
  const allCourseGroupIds = new Map<string, Set<string>>();
  const scopedCourseMap = new Map<
    string,
    {
      courseId: string;
      title: string;
      titleArabic: string;
      level: string | null;
      isPublished: boolean;
      groupsMap: Map<string, { id: string; name: string; nameArabic: string; academicYear: string | null }>;
    }
  >();

  for (const row of groupCoursesRows || []) {
    const c = unwrapSingle<any>(row.courses);
    const g = unwrapSingle<any>(row.groups);
    if (!c?.id || !g?.id) continue;

    if (!allCourseGroupIds.has(c.id)) {
      allCourseGroupIds.set(c.id, new Set<string>());
    }
    allCourseGroupIds.get(c.id)!.add(g.id);

    if (groupFilter && g.id !== groupFilter) continue;
    if (courseFilter && c.id !== courseFilter) continue;
    if (yearFilter && g.academic_year !== yearFilter) continue;
    if (
      callerRole === 'teacher' &&
      teacherScope &&
      c.teacher_id !== callerId &&
      !teacherScope.authorizedGroupIds.has(g.id)
    ) {
      continue;
    }

    let entry = scopedCourseMap.get(c.id);
    if (!entry) {
      entry = {
        courseId: c.id,
        title: c.title,
        titleArabic: c.title_arabic || c.title,
        level: c.level || null,
        isPublished: Boolean(c.is_published),
        groupsMap: new Map(),
      };
      scopedCourseMap.set(c.id, entry);
    }
    entry.groupsMap.set(g.id, {
      id: g.id,
      name: g.name,
      nameArabic: g.name_arabic || g.name,
      academicYear: g.academic_year || null,
    });
  }

  const progressByLesson = new Map<string, any>();
  for (const lp of lessonProgressRows || []) {
    if (lp.lesson_id) progressByLesson.set(lp.lesson_id, lp);
  }

  const lessonStatsByCourse = new Map<
    string,
    { total: number; completed: number; lastAccessedAt: string | null }
  >();
  for (const l of lessonRows || []) {
    if (!l.is_published || !scopedCourseMap.has(l.course_id)) continue;
    const stats = lessonStatsByCourse.get(l.course_id) || {
      total: 0,
      completed: 0,
      lastAccessedAt: null,
    };
    stats.total += 1;
    const prog = progressByLesson.get(l.id);
    if (prog?.is_completed) stats.completed += 1;
    if (prog?.last_accessed_at) {
      if (
        !stats.lastAccessedAt ||
        new Date(prog.last_accessed_at).getTime() > new Date(stats.lastAccessedAt).getTime()
      ) {
        stats.lastAccessedAt = prog.last_accessed_at;
      }
    }
    lessonStatsByCourse.set(l.course_id, stats);
  }

  const courses: AcademicCourseProgressRow[] = Array.from(scopedCourseMap.values())
    .map((entry) => {
      const stats = lessonStatsByCourse.get(entry.courseId) || {
        total: 0,
        completed: 0,
        lastAccessedAt: null,
      };
      return {
        courseId: entry.courseId,
        title: entry.title,
        titleArabic: entry.titleArabic,
        level: entry.level,
        isPublished: entry.isPublished,
        groups: Array.from(entry.groupsMap.values()),
        totalLessons: stats.total,
        completedLessons: stats.completed,
        pendingLessons: Math.max(stats.total - stats.completed, 0),
        progressPercentage: stats.total === 0 ? null : round1((stats.completed / stats.total) * 100),
        lastAccessedAt: stats.lastAccessedAt,
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));

  // Deduplicated & Scoped Quiz Attempts
  const seenQuizAttemptIds = new Set<string>();
  const quizzes: AcademicQuizRow[] = [];
  for (const qa of quizAttemptRows || []) {
    if (!qa?.id || seenQuizAttemptIds.has(qa.id)) continue;
    const q = unwrapSingle<any>(qa.quizzes);
    if (!q?.id) continue;
    const c = unwrapSingle<any>(q.courses);
    const g = unwrapSingle<any>(q.groups);
    const eventAt = qa.submitted_at || qa.completed_at || qa.started_at;

    if (courseFilter && q.course_id !== courseFilter) continue;
    if (
      groupFilter &&
      q.group_id !== groupFilter &&
      !(q.course_id && allCourseGroupIds.get(q.course_id)?.has(groupFilter))
    ) {
      continue;
    }
    if (
      yearFilter &&
      g?.academic_year !== yearFilter &&
      !studentAcademicYears.has(yearFilter)
    ) {
      continue;
    }
    if (!matchesRiyadhDateBounds(eventAt, dateFrom, dateTo)) continue;

    if (callerRole === 'teacher' && teacherScope && !isSuper) {
      const canManageQuiz =
        q.teacher_id === callerId ||
        (!q.teacher_id && q.course_id && teacherScope.authorizedCourseIds.has(q.course_id)) ||
        (q.group_id && teacherScope.authorizedGroupIds.has(q.group_id));
      if (!canManageQuiz) continue;
    }

    seenQuizAttemptIds.add(qa.id);

    const canViewScore =
      qa.status === 'in_progress'
        ? false
        : isStaff
        ? true
        : qa.status === 'graded'
        ? true
        : qa.status === 'submitted' &&
          Boolean(q.show_results_immediately) &&
          !qa.requires_manual_grading;

    const isCompletedStatus = qa.status === 'submitted' || qa.status === 'graded';

    quizzes.push({
      id: qa.id,
      quizId: qa.quiz_id,
      title: q.title,
      titleArabic: q.title_arabic || q.title,
      courseId: q.course_id || null,
      courseTitle: c?.title || null,
      courseTitleArabic: c?.title_arabic || null,
      groupId: q.group_id || null,
      groupName: g?.name || null,
      groupNameArabic: g?.name_arabic || null,
      academicYear: g?.academic_year || null,
      attemptNumber: Number(qa.attempt_number ?? 1),
      status: qa.status,
      passingScore: toNumOrNull(q.passing_score),
      requiresManualGrading: Boolean(qa.requires_manual_grading),
      isResultReleased: canViewScore,
      pointsScored: canViewScore && isCompletedStatus ? toNumOrNull(qa.points_scored) : null,
      totalPointsPossible:
        canViewScore && isCompletedStatus ? toNumOrNull(qa.total_points_possible) : null,
      percentageScore: canViewScore && isCompletedStatus ? toNumOrNull(qa.percentage_score) : null,
      isPassed:
        canViewScore && isCompletedStatus && typeof qa.is_passed === 'boolean'
          ? qa.is_passed
          : null,
      teacherFeedback: canViewScore ? qa.teacher_feedback || null : null,
      startedAt: qa.started_at,
      submittedAt: qa.submitted_at || null,
      gradedAt: qa.graded_at || null,
      eventAt,
    });
  }
  quizzes.sort((a, b) => new Date(b.eventAt).getTime() - new Date(a.eventAt).getTime());

  // Deduplicated & Scoped Assignment Submissions (Baseline & Phase 5C safe)
  const seenSubmissionIds = new Set<string>();
  const assignments: AcademicAssignmentRow[] = [];
  for (const s of submissionRows || []) {
    if (!s?.id || seenSubmissionIds.has(s.id)) continue;
    const a = unwrapSingle<any>(s.assignments);
    if (!a?.id) continue;
    const c = unwrapSingle<any>(a.courses);
    const g = unwrapSingle<any>(a.groups);

    if (courseFilter && a.course_id !== courseFilter) continue;
    if (
      groupFilter &&
      a.target_group_id !== groupFilter &&
      !assignmentTargetGroupIdsByAssignment.get(a.id)?.has(groupFilter) &&
      !(a.course_id && allCourseGroupIds.get(a.course_id)?.has(groupFilter))
    ) {
      continue;
    }
    if (
      yearFilter &&
      g?.academic_year !== yearFilter &&
      !studentAcademicYears.has(yearFilter)
    ) {
      continue;
    }
    if (!matchesRiyadhDateBounds(s.submitted_at, dateFrom, dateTo)) continue;

    if (callerRole === 'teacher' && teacherScope && !isSuper) {
      const canManageAssignment =
        a.teacher_id === callerId ||
        (c?.teacher_id && c.teacher_id === callerId) ||
        (a.course_id && teacherScope.authorizedCourseIds.has(a.course_id)) ||
        (a.target_group_id && teacherScope.authorizedGroupIds.has(a.target_group_id));
      if (!canManageAssignment) continue;
    }

    seenSubmissionIds.add(s.id);

    const rawScore = toNumOrNull(s.score);
    const hasPhase5CReleaseFlag =
      s.is_grade_released !== undefined && s.is_grade_released !== null;
    const isGradeReleased = hasPhase5CReleaseFlag
      ? Boolean(s.is_grade_released)
      : rawScore !== null;
    const canViewGrade = isStaff ? rawScore !== null : isGradeReleased && rawScore !== null;
    const maxScore = toNumOrNull(a.max_score);
    const status =
      s.status || (rawScore !== null || s.graded_at ? 'graded' : 'submitted');

    assignments.push({
      id: s.id,
      assignmentId: s.assignment_id,
      title: a.title,
      titleArabic: a.title_arabic || a.title,
      courseId: a.course_id || null,
      courseTitle: c?.title || null,
      courseTitleArabic: c?.title_arabic || null,
      groupId: a.target_group_id || null,
      groupName: g?.name || null,
      groupNameArabic: g?.name_arabic || null,
      academicYear: g?.academic_year || null,
      attemptNumber: Number(s.attempt_number ?? 1),
      status,
      maxScore,
      dueDate: a.due_date || null,
      submittedAt: s.submitted_at || null,
      isLate: Boolean(s.is_late),
      gradedAt: s.graded_at || null,
      isGradeReleased,
      releasedAt: s.released_at ?? (isGradeReleased ? s.graded_at || null : null),
      score: canViewGrade ? rawScore : null,
      percentageScore:
        canViewGrade && rawScore !== null && maxScore !== null && maxScore > 0
          ? round1((rawScore / maxScore) * 100)
          : null,
      teacherFeedback:
        canViewGrade || status === 'returned_for_revision' ? s.teacher_feedback || null : null,
    });
  }
  assignments.sort((a, b) => {
    const bt = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
    const at = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
    return bt - at;
  });

  // Attendance History & Summary
  const seenAttendanceIds = new Set<string>();
  const attendance: AcademicAttendanceRow[] = [];
  for (const att of attendanceRows || []) {
    if (!att?.id || seenAttendanceIds.has(att.id)) continue;
    const ls = unwrapSingle<any>(att.live_sessions);
    if (!ls?.id) continue;
    const c = unwrapSingle<any>(ls.courses);
    const g = unwrapSingle<any>(ls.groups);

    if (courseFilter && ls.course_id !== courseFilter) continue;
    if (groupFilter && ls.group_id !== groupFilter) continue;
    if (yearFilter && g?.academic_year !== yearFilter) continue;
    if (!matchesRiyadhDateBounds(ls.start_time, dateFrom, dateTo)) continue;

    if (callerRole === 'teacher' && teacherScope && !isSuper) {
      const canViewSession =
        ls.teacher_id === callerId ||
        (ls.group_id && teacherScope.authorizedGroupIds.has(ls.group_id));
      if (!canViewSession) continue;
    }

    seenAttendanceIds.add(att.id);
    attendance.push({
      id: att.id,
      sessionId: att.session_id,
      sessionTitle: ls.title,
      sessionTitleArabic: ls.title_arabic || null,
      courseId: ls.course_id || null,
      courseTitle: c?.title || null,
      courseTitleArabic: c?.title_arabic || null,
      groupId: ls.group_id || null,
      groupName: g?.name || null,
      groupNameArabic: g?.name_arabic || null,
      startTime: ls.start_time,
      status: att.status,
      joinedAt: att.joined_at || null,
      recordedAt: att.recorded_at,
      notes: att.notes || null,
    });
  }
  attendance.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

  let present = 0;
  let late = 0;
  let excused = 0;
  let absent = 0;
  for (const att of attendance) {
    if (att.status === 'present') present += 1;
    else if (att.status === 'late') late += 1;
    else if (att.status === 'excused') excused += 1;
    else if (att.status === 'absent') absent += 1;
  }
  const countableTotal = present + late + absent;
  const attendanceSummary: AcademicAttendanceSummary = {
    present,
    late,
    excused,
    absent,
    total: attendance.length,
    countableTotal,
    attendanceRatePct: countableTotal === 0 ? null : round1(((present + late) / countableTotal) * 100),
  };

  // Last learning activity across unfiltered student timestamps
  const activityDates: string[] = [];
  for (const lp of lessonProgressRows || []) if (lp.last_accessed_at) activityDates.push(lp.last_accessed_at);
  for (const qa of quizAttemptRows || []) {
    const ts = qa.submitted_at || qa.completed_at || qa.started_at;
    if (ts) activityDates.push(ts);
  }
  for (const s of submissionRows || []) if (s.submitted_at) activityDates.push(s.submitted_at);
  for (const att of attendanceRows || []) if (att.recorded_at) activityDates.push(att.recorded_at);

  let lastLearningActivityAt: string | null = null;
  let latestMs = -Infinity;
  for (const iso of activityDates) {
    const ms = new Date(iso).getTime();
    if (!Number.isNaN(ms) && ms > latestMs) {
      latestMs = ms;
      lastLearningActivityAt = iso;
    }
  }

  const totalLessons = courses.reduce((acc, c) => acc + c.totalLessons, 0);
  const completedLessons = courses.reduce((acc, c) => acc + c.completedLessons, 0);
  const pendingLessons = Math.max(totalLessons - completedLessons, 0);

  const quizPercentages = quizzes
    .map((q) => q.percentageScore)
    .filter((v): v is number => v !== null);
  const assignmentPercentages = assignments
    .map((a) => a.percentageScore)
    .filter((v): v is number => v !== null);
  const combinedPercentages = [...quizPercentages, ...assignmentPercentages];

  const avgQuizPercentage =
    quizPercentages.length === 0
      ? null
      : round1(quizPercentages.reduce((sum, v) => sum + v, 0) / quizPercentages.length);
  const avgAssignmentPercentage =
    assignmentPercentages.length === 0
      ? null
      : round1(
          assignmentPercentages.reduce((sum, v) => sum + v, 0) / assignmentPercentages.length
        );
  const overallAcademicAveragePct =
    combinedPercentages.length === 0
      ? null
      : round1(combinedPercentages.reduce((sum, v) => sum + v, 0) / combinedPercentages.length);

  return {
    student: {
      id: studentProfile.id,
      fullName: studentProfile.full_name || '',
      fullNameArabic: studentProfile.full_name_arabic || studentProfile.full_name || '',
      status: studentProfile.status || null,
      studentNumber: academicProfile?.student_number || null,
      username: academicProfile?.username || null,
      enrolledAt: academicProfile?.enrolled_at || studentProfile.created_at || null,
      notes: isStaff ? academicProfile?.notes || null : null,
    },
    groups,
    courses,
    quizzes,
    assignments,
    attendance,
    attendanceSummary,
    summary: {
      enrolledCourses: courses.length,
      totalLessons,
      completedLessons,
      pendingLessons,
      courseProgressPct: totalLessons === 0 ? null : round1((completedLessons / totalLessons) * 100),
      quizAttemptsCount: quizzes.length,
      completedQuizzesCount: quizzes.filter(
        (q) => q.status === 'submitted' || q.status === 'graded'
      ).length,
      gradedQuizzesCount: quizPercentages.length,
      avgQuizPercentage,
      assignmentSubmissionsCount: assignments.length,
      gradedAssignmentsCount: assignmentPercentages.length,
      avgAssignmentPercentage,
      overallAcademicAveragePct,
      passingThreshold,
      attendanceRatePct: attendanceSummary.attendanceRatePct,
      lastLearningActivityAt,
    },
    timezone: ACADEMIC_TIMEZONE,
  };
}

async function fetchStudentAcademicRecordDirect(
  client: SupabaseClient,
  caller: CallerContext,
  filters: AcademicRecordQueryFilters
): Promise<StudentAcademicRecord> {
  const op = 'fetchStudentAcademicRecord.direct';

  let targetStudentId: string;
  if (caller.role === 'student') {
    if (filters.studentId && filters.studentId !== caller.userId) {
      throwLoggedServiceError(
        new ServiceError({
          category: 'AUTHORIZATION_ERROR',
          code: '42501',
          status: 403,
          message: 'Forbidden: Students can only access their own academic record',
          service: SERVICE,
          operation: op,
        }),
        { service: SERVICE, operation: op }
      );
    }
    targetStudentId = caller.userId;
  } else {
    if (!filters.studentId) {
      throwLoggedServiceError(
        new ServiceError({
          category: 'VALIDATION_ERROR',
          code: '22023',
          status: 400,
          message: 'Student identifier is required for staff academic record lookup',
          service: SERVICE,
          operation: op,
        }),
        { service: SERVICE, operation: op }
      );
    }
    targetStudentId = filters.studentId;
  }

  let studentRes: any;
  let sapRes: any;
  let membershipsRes: { data: any[]; error: unknown };
  try {
    [studentRes, sapRes, membershipsRes] = await Promise.all([
      client
        .from('profiles')
        .select('id, role, status, full_name, full_name_arabic, created_at')
        .eq('id', targetStudentId)
        .eq('role', 'student')
        .maybeSingle(),
      client
        .from('student_academic_profiles')
        .select('profile_id, student_number, username, group_id, enrolled_at, notes')
        .eq('profile_id', targetStudentId)
        .maybeSingle(),
      fetchGroupMembershipsWithSchemaFallback(client, { studentId: targetStudentId }),
    ]);
  } catch (err) {
    throwLoggedServiceError(err, { service: SERVICE, operation: `${op}.studentProfile` });
  }

  if (studentRes.error) {
    throwLoggedServiceError(studentRes.error, {
      service: SERVICE,
      operation: `${op}.studentProfile`,
    });
  }
  if (!studentRes.data) {
    throwLoggedServiceError(
      new ServiceError({
        category: 'NOT_FOUND',
        code: 'P0002',
        status: 404,
        message: 'Student academic record not found',
        service: SERVICE,
        operation: op,
      }),
      { service: SERVICE, operation: op }
    );
  }
  if (sapRes.error) {
    throwLoggedServiceError(sapRes.error, {
      service: SERVICE,
      operation: `${op}.academicProfile`,
    });
  }
  if (membershipsRes.error) {
    throwLoggedServiceError(membershipsRes.error, {
      service: SERVICE,
      operation: `${op}.groupMemberships`,
    });
  }

  let teacherScope: TeacherScope | null = null;
  if (caller.role === 'teacher') {
    teacherScope = await resolveTeacherScope(client, caller.userId, op);
  }

  const studentGroupIds = Array.from(
    new Set(
      (membershipsRes.data || [])
        .map((m: any) => m.group_id)
        .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
    )
  );

  const fetchGroupCoursesPromise =
    studentGroupIds.length > 0
      ? client
          .from('group_courses')
          .select(
            `
            course_id,
            group_id,
            courses:course_id (
              id,
              title,
              title_arabic,
              level,
              is_published,
              teacher_id
            ),
            groups:group_id (
              id,
              name,
              name_arabic,
              academic_year
            )
          `
          )
          .in('group_id', studentGroupIds)
      : Promise.resolve({ data: [], error: null });

  const fetchAttendancePromise = client
    .from('attendance')
    .select(
      `
      id,
      session_id,
      status,
      joined_at,
      recorded_at,
      notes,
      live_sessions:session_id (
        id,
        course_id,
        group_id,
        teacher_id,
        title,
        title_arabic,
        start_time,
        end_time,
        status,
        courses:course_id (
          id,
          title,
          title_arabic
        ),
        groups:group_id (
          id,
          name,
          name_arabic,
          academic_year
        )
      )
    `
    )
    .eq('student_id', targetStudentId);

  const fetchQuizzesPromise = client
    .from('quiz_attempts')
    .select(
      `
      id,
      quiz_id,
      attempt_number,
      status,
      requires_manual_grading,
      started_at,
      completed_at,
      submitted_at,
      graded_at,
      points_scored,
      total_points_possible,
      percentage_score,
      is_passed,
      teacher_feedback,
      quizzes:quiz_id (
        id,
        course_id,
        group_id,
        teacher_id,
        title,
        title_arabic,
        passing_score,
        show_results_immediately,
        courses:course_id (
          id,
          title,
          title_arabic
        ),
        groups:group_id (
          id,
          name,
          name_arabic,
          academic_year
        )
      )
    `
    )
    .eq('student_id', targetStudentId);

  const fetchSubmissionsWithSchemaFallback = async () => {
    const primary = await client
      .from('submissions')
      .select(PHASE5C_SUBMISSIONS_SELECT)
      .eq('student_id', targetStudentId);

    if (primary.error && isMissingSchemaFeatureError(primary.error)) {
      return await client
        .from('submissions')
        .select(BASELINE_SUBMISSIONS_SELECT)
        .eq('student_id', targetStudentId);
    }

    return primary;
  };

  const fetchPassingThresholdPromise = async (): Promise<number | null> => {
    if (!caller.isStaff) return null;
    try {
      const settingsRes = await client
        .from('system_settings')
        .select('value')
        .eq('key', 'academic_settings')
        .maybeSingle();

      if (settingsRes.error) {
        if (isMissingSchemaFeatureError(settingsRes.error)) {
          return null;
        }
        const errCat = toServiceError(settingsRes.error, {
          service: SERVICE,
          operation: `${op}.settings`,
        });
        if (errCat.category === 'AUTHORIZATION_ERROR' || errCat.category === 'NOT_FOUND') {
          return null;
        }
        throw errCat;
      }

      const rawVal = (settingsRes.data as any)?.value?.default_passing_score;
      const parsed = Number(rawVal);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    } catch (err) {
      if (err instanceof ServiceError && err.category === 'NETWORK_ERROR') {
        throw err;
      }
      return null;
    }
  };

  let groupCoursesRes: any;
  let attendanceRes: any;
  let quizzesRes: any;
  let submissionsRes: any;
  let passingThreshold: number | null = null;

  try {
    [groupCoursesRes, attendanceRes, quizzesRes, submissionsRes, passingThreshold] =
      await Promise.all([
        fetchGroupCoursesPromise,
        fetchAttendancePromise,
        fetchQuizzesPromise,
        fetchSubmissionsWithSchemaFallback(),
        fetchPassingThresholdPromise(),
      ]);
  } catch (err) {
    throwLoggedServiceError(err, { service: SERVICE, operation: op });
  }

  for (const r of [groupCoursesRes, attendanceRes, quizzesRes, submissionsRes]) {
    if (r.error) {
      throwLoggedServiceError(r.error, {
        service: SERVICE,
        operation: op,
        fallbackMessage: 'Failed to load student academic record components.',
      });
    }
  }

  // Verify teacher authorization against cohort OR quiz/assignment activity (mirrors can_staff_view_student_record)
  if (caller.role === 'teacher' && teacherScope) {
    const inAuthorizedGroup = studentGroupIds.some((gid) =>
      teacherScope!.authorizedGroupIds.has(gid)
    );
    const hasTeacherQuizAttempt = (quizzesRes.data || []).some((qa: any) =>
      teacherScope!.authorizedQuizIds.has(qa.quiz_id)
    );
    const hasTeacherSubmission = (submissionsRes.data || []).some((s: any) =>
      teacherScope!.authorizedAssignmentIds.has(s.assignment_id)
    );

    if (!inAuthorizedGroup && !hasTeacherQuizAttempt && !hasTeacherSubmission) {
      throwLoggedServiceError(
        new ServiceError({
          category: 'AUTHORIZATION_ERROR',
          code: '42501',
          status: 403,
          message: 'Forbidden: You are not authorized to view this student record',
          service: SERVICE,
          operation: op,
        }),
        { service: SERVICE, operation: op }
      );
    }
  }

  const courseIds = Array.from(
    new Set(
      (groupCoursesRes.data || [])
        .map((gc: any) => gc.course_id)
        .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
    )
  );

  let lessonRows: any[] = [];
  let lessonProgressRows: any[] = [];
  if (courseIds.length > 0) {
    let lessonsRes: any;
    let progressRes: any;
    try {
      [lessonsRes, progressRes] = await Promise.all([
        client.from('lessons').select('id, course_id, is_published').in('course_id', courseIds),
        client
          .from('lesson_progress')
          .select('lesson_id, is_completed, last_accessed_at')
          .eq('student_id', targetStudentId),
      ]);
    } catch (err) {
      throwLoggedServiceError(err, { service: SERVICE, operation: `${op}.lessons` });
    }
    if (lessonsRes.error) {
      throwLoggedServiceError(lessonsRes.error, { service: SERVICE, operation: `${op}.lessons` });
    }
    if (progressRes.error) {
      throwLoggedServiceError(progressRes.error, {
        service: SERVICE,
        operation: `${op}.lessonProgress`,
      });
    }
    lessonRows = lessonsRes.data || [];
    lessonProgressRows = progressRes.data || [];
  }

  // Optional multi-group assignment_targets resolution when groupId filter is active
  const assignmentTargetGroupIdsByAssignment = new Map<string, Set<string>>();
  const submissionAssignmentIds = Array.from(
    new Set(
      (submissionsRes.data || [])
        .map((s: any) => s.assignment_id)
        .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
    )
  );
  if (filters.groupId && filters.groupId !== 'all' && submissionAssignmentIds.length > 0) {
    try {
      const targetsRes = await client
        .from('assignment_targets')
        .select('assignment_id, group_id')
        .in('assignment_id', submissionAssignmentIds)
        .not('group_id', 'is', null);

      if (targetsRes.error) {
        if (!isMissingSchemaFeatureError(targetsRes.error)) {
          throwLoggedServiceError(targetsRes.error, {
            service: SERVICE,
            operation: `${op}.assignmentTargets`,
          });
        }
      } else {
        for (const t of targetsRes.data || []) {
          if (!t.assignment_id || !t.group_id) continue;
          if (!assignmentTargetGroupIdsByAssignment.has(t.assignment_id)) {
            assignmentTargetGroupIdsByAssignment.set(t.assignment_id, new Set<string>());
          }
          assignmentTargetGroupIdsByAssignment.get(t.assignment_id)!.add(t.group_id);
        }
      }
    } catch (err) {
      if (err instanceof ServiceError) throw err;
      throwLoggedServiceError(err, { service: SERVICE, operation: `${op}.assignmentTargets` });
    }
  }

  return buildDirectStudentAcademicRecord({
    callerRole: caller.role,
    callerId: caller.userId,
    studentProfile: studentRes.data,
    academicProfile: sapRes.data || null,
    membershipRows: membershipsRes.data || [],
    groupCoursesRows: groupCoursesRes.data || [],
    lessonRows,
    lessonProgressRows,
    quizAttemptRows: quizzesRes.data || [],
    submissionRows: submissionsRes.data || [],
    attendanceRows: attendanceRes.data || [],
    passingThreshold,
    filters,
    teacherScope,
    assignmentTargetGroupIdsByAssignment,
  });
}

// ============================================================================
// PUBLIC SERVICE ENTRYPOINTS
// ============================================================================

/**
 * Fetches authorized students list for staff academic record selection.
 * Uses server RPC when deployed, and executes RLS-enforced direct queries if
 * migration 20261114000019 / 20261114000022 is pending or hits gs.is_primary.
 */
export async function fetchAccessibleStudentsForRecords(): Promise<AccessibleStudentOption[]> {
  const client = requireSupabaseClient({
    service: SERVICE,
    operation: 'fetchAccessibleStudentsForRecords',
  });
  const user = await requireAuthenticatedUser(client, {
    service: SERVICE,
    operation: 'fetchAccessibleStudentsForRecords',
  });

  let res: { data: any; error: unknown };
  try {
    res = await client.rpc('list_accessible_students_for_records');
  } catch (err) {
    throwLoggedServiceError(err, {
      service: SERVICE,
      operation: 'fetchAccessibleStudentsForRecords',
    });
  }

  if (res.error) {
    if (isAcademicRecordsRpcCompatibilityError(res.error)) {
      const rpcErr = toServiceError(res.error, {
        service: SERVICE,
        operation: 'fetchAccessibleStudentsForRecords.rpc',
      });
      if (typeof console !== 'undefined' && typeof console.warn === 'function') {
        console.warn('[academicRecordsService] RPC unavailable or schema-outdated; using RLS-enforced direct queries.', {
          code: rpcErr.code,
          message: rpcErr.message,
        });
      }
      const caller = await resolveCallerContext(
        client,
        user.id,
        'fetchAccessibleStudentsForRecords.direct'
      );
      return fetchAccessibleStudentsDirect(client, caller);
    }

    throwLoggedServiceError(res.error, {
      service: SERVICE,
      operation: 'fetchAccessibleStudentsForRecords',
      fallbackMessage: 'Failed to load authorized students list.',
    });
  }

  if (!Array.isArray(res.data)) {
    throw academicContractError('root', 'expected array of accessible students');
  }

  return res.data.map((r: unknown, idx: number) => {
    const rowPath = `students[${idx}]`;
    if (!isPlainObject(r)) {
      throw academicContractError(rowPath, 'expected object');
    }
    const fullName =
      readNullableString(r, 'full_name', `${rowPath}.full_name`, { allowOmitted: true }) ?? '';
    const fullNameArabic =
      readNullableString(r, 'full_name_arabic', `${rowPath}.full_name_arabic`, {
        allowOmitted: true,
      }) || fullName;
    const groupsRaw = readRequiredArray(r, 'groups', `${rowPath}.groups`);

    return {
      id: readRequiredString(r, 'id', `${rowPath}.id`),
      fullName,
      fullNameArabic,
      status: readNullableString(r, 'status', `${rowPath}.status`, { allowOmitted: true }),
      studentNumber: readNullableString(r, 'student_number', `${rowPath}.student_number`, {
        allowOmitted: true,
      }),
      username: readNullableString(r, 'username', `${rowPath}.username`, { allowOmitted: true }),
      enrolledAt: readNullableString(r, 'enrolled_at', `${rowPath}.enrolled_at`, {
        allowOmitted: true,
      }),
      groups: groupsRaw.map((g: unknown, gIdx: number) => {
        const gPath = `${rowPath}.groups[${gIdx}]`;
        if (!isPlainObject(g)) {
          throw academicContractError(gPath, 'expected object');
        }
        const gName = readRequiredString(g, 'name', `${gPath}.name`);
        return {
          id: readRequiredString(g, 'id', `${gPath}.id`),
          name: gName,
          nameArabic:
            readNullableString(g, 'name_arabic', `${gPath}.name_arabic`, { allowOmitted: true }) ||
            gName,
          academicYear: readNullableString(g, 'academic_year', `${gPath}.academic_year`, {
            allowOmitted: true,
          }),
          isActive: readRequiredBoolean(g, 'is_active', `${gPath}.is_active`),
          archivedAt: readNullableString(g, 'archived_at', `${gPath}.archived_at`, {
            allowOmitted: true,
          }),
          isPrimary: readRequiredBoolean(g, 'is_primary', `${gPath}.is_primary`),
        };
      }),
    };
  });
}

/**
 * Fetches unified academic record for a student (or self when called by a student).
 * Uses server RPC when deployed, and executes RLS-enforced direct queries if
 * migration 20261114000019 / 20261114000022 is pending or hits gs.is_primary.
 */
export async function fetchStudentAcademicRecord(
  filters: AcademicRecordQueryFilters
): Promise<StudentAcademicRecord> {
  const client = requireSupabaseClient({
    service: SERVICE,
    operation: 'fetchStudentAcademicRecord',
  });
  const user = await requireAuthenticatedUser(client, {
    service: SERVICE,
    operation: 'fetchStudentAcademicRecord',
  });

  let res: { data: any; error: unknown };
  try {
    res = await client.rpc('get_student_academic_record', {
      p_student_id: filters.studentId ?? null,
      p_course_id: filters.courseId && filters.courseId !== 'all' ? filters.courseId : null,
      p_group_id: filters.groupId && filters.groupId !== 'all' ? filters.groupId : null,
      p_academic_year:
        filters.academicYear && filters.academicYear !== 'all' ? filters.academicYear : null,
      p_date_from: filters.dateFrom || null,
      p_date_to: filters.dateTo || null,
    });
  } catch (err) {
    throwLoggedServiceError(err, {
      service: SERVICE,
      operation: 'fetchStudentAcademicRecord',
    });
  }

  if (res.error) {
    if (isAcademicRecordsRpcCompatibilityError(res.error)) {
      const rpcErr = toServiceError(res.error, {
        service: SERVICE,
        operation: 'fetchStudentAcademicRecord.rpc',
      });
      if (typeof console !== 'undefined' && typeof console.warn === 'function') {
        console.warn('[academicRecordsService] RPC unavailable or schema-outdated; using RLS-enforced direct queries.', {
          code: rpcErr.code,
          message: rpcErr.message,
        });
      }
      const caller = await resolveCallerContext(
        client,
        user.id,
        'fetchStudentAcademicRecord.direct'
      );
      return fetchStudentAcademicRecordDirect(client, caller, filters);
    }

    throwLoggedServiceError(res.error, {
      service: SERVICE,
      operation: 'fetchStudentAcademicRecord',
      fallbackMessage: 'Failed to load academic record.',
    });
  }

  if (!res.data) {
    throwLoggedServiceError(
      new ServiceError({
        category: 'NOT_FOUND',
        message: 'Academic record could not be resolved.',
        service: SERVICE,
        operation: 'fetchStudentAcademicRecord',
      }),
      { service: SERVICE, operation: 'fetchStudentAcademicRecord' }
    );
  }

  return mapRawAcademicRecord(res.data);
}
