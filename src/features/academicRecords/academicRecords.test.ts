/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDirectStudentAcademicRecord,
  buildUnifiedTranscript,
  fetchAccessibleStudentsForRecords,
  fetchStudentAcademicRecord,
  filterAndSortTranscript,
  isAcademicRecordsRpcCompatibilityError,
  mapRawAcademicRecord,
  paginateArray,
} from './academicRecordsService';
import { setSupabaseClientForTesting } from '../../lib/supabase/client';
import { formatServiceErrorForUi, ServiceError } from '../../lib/errors/serviceError';

test.afterEach(() => {
  setSupabaseClientForTesting(undefined);
});

function sampleRawPayload() {
  return {
    student: {
      id: 'st-1',
      full_name: 'Faisal Al-Harbi',
      full_name_arabic: 'فيصل الحربي',
      status: 'active',
      student_number: 'WES-2026-001',
      username: 'faisal.h',
      enrolled_at: '2026-09-01T10:00:00Z',
    },
    groups: [
      {
        id: 'g-1',
        name: 'Level 1 Cohort A',
        name_arabic: 'المستوى الأول - أ',
        academic_year: '2026/2027',
        is_active: true,
        is_primary: true,
      },
    ],
    courses: [
      {
        course_id: 'c-1',
        title: 'English Grammar Foundations',
        title_arabic: 'أساسيات قواعد اللغة الإنجليزية',
        level: 'beginner',
        is_published: true,
        groups: [{ id: 'g-1', name: 'Level 1', name_arabic: 'أ', academic_year: '2026/2027' }],
        total_lessons: 10,
        completed_lessons: 7,
        pending_lessons: 3,
        progress_percentage: 70,
        last_accessed_at: '2026-11-10T15:00:00Z',
      },
    ],
    quizzes: [
      {
        id: 'qa-1',
        quiz_id: 'q-1',
        title: 'Unit 1 Quiz',
        title_arabic: 'اختبار الوحدة الأولى',
        course_id: 'c-1',
        course_title: 'English Grammar Foundations',
        course_title_arabic: 'أساسيات قواعد اللغة الإنجليزية',
        group_id: 'g-1',
        academic_year: '2026/2027',
        attempt_number: 1,
        status: 'graded',
        passing_score: 60,
        requires_manual_grading: false,
        is_result_released: true,
        points_scored: 17,
        total_points_possible: 20,
        percentage_score: 85,
        is_passed: true,
        started_at: '2026-11-05T14:00:00Z',
        submitted_at: '2026-11-05T14:20:00Z',
        event_at: '2026-11-05T14:20:00Z',
      },
      {
        id: 'qa-2',
        quiz_id: 'q-2',
        title: 'Midterm Essay Quiz',
        title_arabic: 'اختبار منتصف الفصل',
        course_id: 'c-1',
        attempt_number: 1,
        status: 'submitted',
        passing_score: 60,
        requires_manual_grading: true,
        is_result_released: false,
        points_scored: null,
        total_points_possible: null,
        percentage_score: null,
        is_passed: null,
        started_at: '2026-11-11T12:00:00Z',
        submitted_at: '2026-11-11T12:30:00Z',
        event_at: '2026-11-11T12:30:00Z',
      },
    ],
    assignments: [
      {
        id: 'sub-1',
        assignment_id: 'a-1',
        title: 'Paragraph Writing',
        title_arabic: 'كتابة فقرة',
        course_id: 'c-1',
        academic_year: '2026/2027',
        attempt_number: 1,
        status: 'submitted',
        max_score: 20,
        submitted_at: '2026-11-12T10:00:00Z',
        is_late: false,
        is_grade_released: false,
        score: null,
        percentage_score: null,
      },
    ],
    attendance: [
      {
        id: 'att-1',
        session_id: 'sess-1',
        session_title: 'Week 1 Live',
        session_title_arabic: 'حصة الأسبوع الأول',
        course_id: 'c-1',
        group_id: 'g-1',
        start_time: '2026-11-03T16:00:00Z',
        status: 'present',
        recorded_at: '2026-11-03T16:05:00Z',
      },
    ],
    attendance_summary: {
      present: 1,
      late: 0,
      excused: 0,
      absent: 0,
      total: 1,
      countable_total: 1,
      attendance_rate_pct: 100,
    },
    summary: {
      enrolled_courses: 1,
      total_lessons: 10,
      completed_lessons: 7,
      pending_lessons: 3,
      course_progress_pct: 70,
      quiz_attempts_count: 2,
      completed_quizzes_count: 2,
      graded_quizzes_count: 1,
      avg_quiz_percentage: 85,
      assignment_submissions_count: 1,
      graded_assignments_count: 0,
      avg_assignment_percentage: null,
      overall_academic_average_pct: 85,
      passing_threshold: 60,
      attendance_rate_pct: 100,
      last_learning_activity_at: '2026-11-12T10:00:00Z',
    },
    timezone: 'Asia/Riyadh',
  };
}

interface MockTableQuery {
  table: string;
  selectStr: string;
  filters: Record<string, unknown>;
}

function createMockSupabaseClient(options: {
  userId: string;
  rpcHandler: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
  tableHandler: (query: MockTableQuery) => Promise<{ data: any; error: any }>;
}) {
  const executedQueries: MockTableQuery[] = [];

  const buildChain = (table: string, selectStr: string) => {
    const filters: Record<string, unknown> = {};
    let singleMode: 'none' | 'single' | 'maybeSingle' = 'none';

    const execute = async () => {
      const q: MockTableQuery = { table, selectStr, filters: { ...filters } };
      executedQueries.push(q);
      const res = await options.tableHandler(q);
      if (singleMode === 'single' && Array.isArray(res.data)) {
        return { data: res.data[0] ?? null, error: res.error };
      }
      if (singleMode === 'maybeSingle' && Array.isArray(res.data)) {
        return { data: res.data[0] ?? null, error: res.error };
      }
      return res;
    };

    const chain: any = {
      eq(col: string, val: unknown) {
        filters[`eq:${col}`] = val;
        return chain;
      },
      in(col: string, vals: unknown[]) {
        filters[`in:${col}`] = vals;
        return chain;
      },
      not(col: string, op: string, val: unknown) {
        filters[`not:${col}:${op}`] = val;
        return chain;
      },
      single() {
        singleMode = 'single';
        return execute();
      },
      maybeSingle() {
        singleMode = 'maybeSingle';
        return execute();
      },
      then(resolve: any, reject: any) {
        return execute().then(resolve, reject);
      },
    };
    return chain;
  };

  return {
    executedQueries,
    client: {
      auth: {
        async getUser() {
          return { data: { user: { id: options.userId } }, error: null };
        },
      },
      async rpc(fn: string, args?: Record<string, unknown>) {
        return options.rpcHandler(fn, args);
      },
      from(table: string) {
        return {
          select(selectStr: string) {
            return buildChain(table, selectStr);
          },
        };
      },
    } as any,
  };
}

test('mapRawAcademicRecord preserves NULL for ungraded/unreleased items instead of fabricating 0', () => {
  const mapped = mapRawAcademicRecord(sampleRawPayload());
  assert.equal(mapped.summary.avgAssignmentPercentage, null);
  assert.equal(mapped.assignments[0].score, null);
  assert.equal(mapped.assignments[0].percentageScore, null);
  assert.equal(mapped.quizzes[1].percentageScore, null);
  assert.equal(mapped.quizzes[1].isPassed, null);
  assert.equal(mapped.timezone, 'Asia/Riyadh');
});

test('buildUnifiedTranscript merges quizzes, assignments, and attendance sorted chronologically descending', () => {
  const mapped = mapRawAcademicRecord(sampleRawPayload());
  const transcript = buildUnifiedTranscript(mapped);

  assert.equal(transcript.length, 4);
  assert.equal(transcript[0].id, 'assignment-sub-1');
  assert.equal(transcript[1].id, 'quiz-qa-2');
  assert.equal(transcript[2].id, 'quiz-qa-1');
  assert.equal(transcript[3].id, 'attendance-att-1');

  assert.equal(transcript[0].percentageScore, null);
  assert.equal(transcript[0].isPassed, null);
  assert.equal(transcript[2].percentageScore, 85);
  assert.equal(transcript[2].passingThreshold, 60);
  assert.equal(transcript[2].isPassed, true);
});

test('filterAndSortTranscript and paginateArray filter cleanly by type, search, and sort order', () => {
  const mapped = mapRawAcademicRecord(sampleRawPayload());
  const transcript = buildUnifiedTranscript(mapped);

  const quizzesOnly = filterAndSortTranscript(transcript, {
    search: '',
    assessmentType: 'quiz',
    courseId: 'all',
    groupId: 'all',
    academicYear: 'all',
    dateFrom: '',
    dateTo: '',
    sortBy: 'score_desc',
  });
  assert.equal(quizzesOnly.length, 2);
  assert.equal(quizzesOnly[0].id, 'quiz-qa-1');

  const paged = paginateArray(transcript, 2, 2);
  assert.equal(paged.totalPages, 2);
  assert.equal(paged.currentPage, 2);
  assert.equal(paged.items.length, 2);
});

test('isAcademicRecordsRpcCompatibilityError distinguishes missing/unpatched RPCs from RLS & network errors', () => {
  assert.equal(
    isAcademicRecordsRpcCompatibilityError({
      code: 'PGRST202',
      message: 'Could not find the function public.list_accessible_students_for_records without parameters in the schema cache',
    }),
    true
  );
  assert.equal(
    isAcademicRecordsRpcCompatibilityError({
      code: '42703',
      message: 'column gs.is_primary does not exist',
    }),
    true
  );
  assert.equal(
    isAcademicRecordsRpcCompatibilityError({
      code: '42P01',
      message: 'relation "public.assignment_targets" does not exist',
    }),
    true
  );

  // Must NEVER match RLS, auth, not-found, or network errors
  assert.equal(
    isAcademicRecordsRpcCompatibilityError({
      code: '42501',
      message: 'Forbidden: You are not authorized to view this student record',
    }),
    false
  );
  assert.equal(
    isAcademicRecordsRpcCompatibilityError({
      status: 401,
      message: 'JWT expired',
    }),
    false
  );
  assert.equal(
    isAcademicRecordsRpcCompatibilityError(new TypeError('Failed to fetch')),
    false
  );
});

test('fetchAccessibleStudentsForRecords resolves real RLS-enforced direct queries without gs.is_primary when RPC hits PGRST202 or 42703', async () => {
  const { client, executedQueries } = createMockSupabaseClient({
    userId: 'teacher-1',
    rpcHandler: async () => ({
      data: null,
      error: {
        code: '42703',
        message: 'column gs.is_primary does not exist',
      },
    }),
    tableHandler: async ({ table, selectStr, filters }) => {
      if (table === 'profiles' && filters['eq:id'] === 'teacher-1') {
        return { data: { id: 'teacher-1', role: 'teacher', status: 'active' }, error: null };
      }
      if (table === 'courses') return { data: [{ id: 'course-1' }], error: null };
      if (table === 'live_sessions') return { data: [], error: null };
      if (table === 'quizzes') return { data: [], error: null };
      if (table === 'assignments') return { data: [], error: null };
      if (table === 'group_courses') return { data: [{ group_id: 'g-1' }], error: null };
      if (table === 'group_students' && selectStr === 'student_id') {
        return { data: [{ student_id: 'st-1' }], error: null };
      }
      if (table === 'profiles' && filters['eq:role'] === 'student') {
        return {
          data: [
            {
              id: 'st-1',
              full_name: 'Faisal Al-Harbi',
              full_name_arabic: 'فيصل الحربي',
              status: 'active',
              created_at: '2026-09-01T00:00:00Z',
            },
          ],
          error: null,
        };
      }
      if (table === 'student_academic_profiles') {
        return {
          data: [
            {
              profile_id: 'st-1',
              student_number: 'WES-001',
              username: 'faisal.h',
              group_id: 'g-1',
              enrolled_at: '2026-09-01T10:00:00Z',
            },
          ],
          error: null,
        };
      }
      if (table === 'group_students') {
        assert.equal(
          selectStr.includes('is_primary'),
          false,
          'Direct query must never reference nonexistent group_students.is_primary'
        );
        return {
          data: [
            {
              student_id: 'st-1',
              group_id: 'g-1',
              joined_at: '2026-09-01T10:00:00Z',
              groups: {
                id: 'g-1',
                name: 'Level 1 A',
                name_arabic: 'المستوى الأول أ',
                academic_year: '2026/2027',
                is_active: true,
                archived_at: null,
              },
            },
            {
              student_id: 'st-1',
              group_id: 'g-other-teacher',
              joined_at: '2026-09-02T10:00:00Z',
              groups: {
                id: 'g-other-teacher',
                name: 'Other Teacher Group',
                name_arabic: 'مجموعة أخرى',
                academic_year: '2026/2027',
                is_active: true,
                archived_at: null,
              },
            },
          ],
          error: null,
        };
      }
      return { data: [], error: null };
    },
  });

  setSupabaseClientForTesting(client);
  const students = await fetchAccessibleStudentsForRecords();

  assert.equal(students.length, 1);
  assert.equal(students[0].id, 'st-1');
  // Teacher scope filters out g-other-teacher and derives isPrimary from sap.group_id
  assert.equal(students[0].groups.length, 1);
  assert.equal(students[0].groups[0].id, 'g-1');
  assert.equal(students[0].groups[0].isPrimary, true);
  assert.ok(executedQueries.some((q) => q.table === 'group_students'));
});

test('fetchStudentAcademicRecord enforces student self-isolation and never hides RLS 42501 errors', async () => {
  const { client } = createMockSupabaseClient({
    userId: 'st-1',
    rpcHandler: async () => ({
      data: null,
      error: {
        code: 'PGRST202',
        message: 'Could not find the function public.get_student_academic_record in the schema cache',
      },
    }),
    tableHandler: async ({ table, filters }) => {
      if (table === 'profiles' && filters['eq:id'] === 'st-1') {
        return { data: { id: 'st-1', role: 'student', status: 'active' }, error: null };
      }
      return { data: [], error: null };
    },
  });

  setSupabaseClientForTesting(client);

  await assert.rejects(
    () => fetchStudentAcademicRecord({ studentId: 'st-2' }),
    (err: unknown) => {
      assert.ok(err instanceof ServiceError);
      assert.equal(err.category, 'AUTHORIZATION_ERROR');
      assert.equal(err.code, '42501');
      const ui = formatServiceErrorForUi(err, true);
      assert.equal(ui.category, 'AUTHORIZATION_ERROR');
      assert.equal(ui.title, 'غير مصرح بالوصول');
      return true;
    }
  );
});

test('fetchStudentAcademicRecord handles PGRST202 + baseline submissions schema cleanly while preserving NULLs and Riyadh date filters', async () => {
  const { client, executedQueries } = createMockSupabaseClient({
    userId: 'st-1',
    rpcHandler: async () => ({
      data: null,
      error: {
        code: 'PGRST202',
        message: 'Could not find the function public.get_student_academic_record in the schema cache',
      },
    }),
    tableHandler: async ({ table, selectStr, filters }) => {
      if (table === 'profiles' && filters['eq:id'] === 'st-1') {
        return {
          data: {
            id: 'st-1',
            role: 'student',
            status: 'active',
            full_name: 'Faisal Al-Harbi',
            full_name_arabic: 'فيصل الحربي',
            created_at: '2026-09-01T10:00:00Z',
          },
          error: null,
        };
      }
      if (table === 'student_academic_profiles') {
        return {
          data: {
            profile_id: 'st-1',
            student_number: 'WES-2026-001',
            username: 'faisal.h',
            group_id: 'g-1',
            enrolled_at: '2026-09-01T10:00:00Z',
            notes: 'Private teacher note',
          },
          error: null,
        };
      }
      if (table === 'group_students') {
        return {
          data: [
            {
              student_id: 'st-1',
              group_id: 'g-1',
              joined_at: '2026-09-01T10:00:00Z',
              groups: {
                id: 'g-1',
                name: 'Level 1 A',
                name_arabic: 'المستوى الأول أ',
                academic_year: '2026/2027',
                is_active: true,
                archived_at: null,
              },
            },
            {
              student_id: 'st-1',
              group_id: 'g-2',
              joined_at: '2026-09-02T10:00:00Z',
              groups: {
                id: 'g-2',
                name: 'Level 1 B',
                name_arabic: 'المستوى الأول ب',
                academic_year: '2026/2027',
                is_active: true,
                archived_at: null,
              },
            },
          ],
          error: null,
        };
      }
      if (table === 'group_courses') {
        // Same course c-1 assigned to 2 groups -> must deduplicate cleanly
        return {
          data: [
            {
              course_id: 'c-1',
              group_id: 'g-1',
              courses: {
                id: 'c-1',
                title: 'Grammar',
                title_arabic: 'القواعد',
                level: 'beginner',
                is_published: true,
                teacher_id: 't-1',
              },
              groups: {
                id: 'g-1',
                name: 'Level 1 A',
                name_arabic: 'المستوى الأول أ',
                academic_year: '2026/2027',
              },
            },
            {
              course_id: 'c-1',
              group_id: 'g-2',
              courses: {
                id: 'c-1',
                title: 'Grammar',
                title_arabic: 'القواعد',
                level: 'beginner',
                is_published: true,
                teacher_id: 't-1',
              },
              groups: {
                id: 'g-2',
                name: 'Level 1 B',
                name_arabic: 'المستوى الأول ب',
                academic_year: '2026/2027',
              },
            },
          ],
          error: null,
        };
      }
      if (table === 'lessons') {
        return {
          data: [
            { id: 'l-1', course_id: 'c-1', is_published: true },
            { id: 'l-2', course_id: 'c-1', is_published: true },
            { id: 'l-draft', course_id: 'c-1', is_published: false },
          ],
          error: null,
        };
      }
      if (table === 'lesson_progress') {
        return {
          data: [{ lesson_id: 'l-1', is_completed: true, last_accessed_at: '2026-11-11T10:00:00Z' }],
          error: null,
        };
      }
      if (table === 'quiz_attempts') {
        return {
          data: [
            {
              id: 'qa-1',
              quiz_id: 'q-1',
              attempt_number: 1,
              status: 'graded',
              requires_manual_grading: false,
              started_at: '2026-11-10T21:30:00Z', // 2026-11-11 00:30 Asia/Riyadh
              completed_at: '2026-11-10T21:45:00Z',
              submitted_at: '2026-11-10T21:45:00Z',
              graded_at: '2026-11-10T21:46:00Z',
              points_scored: 18,
              total_points_possible: 20,
              percentage_score: 90,
              is_passed: true,
              teacher_feedback: 'Great work',
              quizzes: {
                id: 'q-1',
                course_id: 'c-1',
                group_id: 'g-1',
                teacher_id: 't-1',
                title: 'Quiz 1',
                title_arabic: 'اختبار 1',
                passing_score: 60,
                show_results_immediately: true,
                courses: { id: 'c-1', title: 'Grammar', title_arabic: 'القواعد' },
                groups: {
                  id: 'g-1',
                  name: 'Level 1 A',
                  name_arabic: 'المستوى الأول أ',
                  academic_year: '2026/2027',
                },
              },
            },
          ],
          error: null,
        };
      }
      if (table === 'submissions') {
        // Simulate baseline production submissions table without Phase 5C columns
        if (selectStr.includes('is_grade_released')) {
          return {
            data: null,
            error: {
              code: '42703',
              message: 'column submissions.is_grade_released does not exist',
            },
          };
        }
        return {
          data: [
            {
              id: 'sub-ungraded',
              assignment_id: 'a-1',
              submitted_at: '2026-11-11T08:00:00Z',
              is_late: false,
              graded_at: null,
              score: null,
              teacher_feedback: null,
              assignments: {
                id: 'a-1',
                course_id: 'c-1',
                target_group_id: 'g-1',
                title: 'Homework 1',
                title_arabic: 'واجب 1',
                max_score: 20,
                due_date: '2026-11-12T20:00:00Z',
                courses: { id: 'c-1', title: 'Grammar', title_arabic: 'القواعد', teacher_id: 't-1' },
                groups: {
                  id: 'g-1',
                  name: 'Level 1 A',
                  name_arabic: 'المستوى الأول أ',
                  academic_year: '2026/2027',
                },
              },
            },
          ],
          error: null,
        };
      }
      if (table === 'attendance') {
        assert.equal(
          selectStr.includes('meeting_url'),
          false,
          'Attendance query must never select live_sessions.meeting_url'
        );
        return {
          data: [
            {
              id: 'att-1',
              session_id: 'sess-1',
              status: 'present',
              joined_at: '2026-11-10T21:30:00Z',
              recorded_at: '2026-11-10T21:30:00Z',
              notes: null,
              live_sessions: {
                id: 'sess-1',
                course_id: 'c-1',
                group_id: 'g-1',
                teacher_id: 't-1',
                title: 'Midnight Riyadh Live',
                title_arabic: 'حصة منتصف الليل',
                start_time: '2026-11-10T21:30:00Z', // 2026-11-11 00:30 Asia/Riyadh
                end_time: '2026-11-10T22:30:00Z',
                status: 'completed',
                courses: { id: 'c-1', title: 'Grammar', title_arabic: 'القواعد' },
                groups: {
                  id: 'g-1',
                  name: 'Level 1 A',
                  name_arabic: 'المستوى الأول أ',
                  academic_year: '2026/2027',
                },
              },
            },
            {
              id: 'att-2',
              session_id: 'sess-2',
              status: 'excused',
              joined_at: null,
              recorded_at: '2026-11-11T10:00:00Z',
              notes: 'Medical excuse',
              live_sessions: {
                id: 'sess-2',
                course_id: 'c-1',
                group_id: 'g-1',
                teacher_id: 't-1',
                title: 'Excused Session',
                title_arabic: 'حصة بعذر',
                start_time: '2026-11-11T10:00:00Z',
                end_time: '2026-11-11T11:00:00Z',
                status: 'completed',
                courses: { id: 'c-1', title: 'Grammar', title_arabic: 'القواعد' },
                groups: {
                  id: 'g-1',
                  name: 'Level 1 A',
                  name_arabic: 'المستوى الأول أ',
                  academic_year: '2026/2027',
                },
              },
            },
          ],
          error: null,
        };
      }
      return { data: [], error: null };
    },
  });

  setSupabaseClientForTesting(client);

  const record = await fetchStudentAcademicRecord({
    dateFrom: '2026-11-11',
    dateTo: '2026-11-11',
  });

  // Private teacher notes must remain hidden from students
  assert.equal(record.student.notes, null);
  assert.equal(record.groups.find((g) => g.id === 'g-1')?.isPrimary, true);
  assert.equal(record.groups.find((g) => g.id === 'g-2')?.isPrimary, false);

  // Deduplicated courses (c-1 once) & only published lessons counted (1/2 = 50%)
  assert.equal(record.courses.length, 1);
  assert.equal(record.courses[0].totalLessons, 2);
  assert.equal(record.courses[0].completedLessons, 1);
  assert.equal(record.courses[0].progressPercentage, 50);

  // Quiz at 2026-11-10T21:45Z belongs to 2026-11-11 Asia/Riyadh
  assert.equal(record.quizzes.length, 1);
  assert.equal(record.quizzes[0].percentageScore, 90);

  // Ungraded baseline submission preserves NULL instead of 0
  assert.equal(record.assignments.length, 1);
  assert.equal(record.assignments[0].score, null);
  assert.equal(record.assignments[0].percentageScore, null);
  assert.equal(record.summary.avgAssignmentPercentage, null);
  assert.equal(record.summary.overallAcademicAveragePct, 90);

  // Excused session excluded from countable denominator (1 present / 1 countable = 100%)
  assert.equal(record.attendance.length, 2);
  assert.equal(record.attendanceSummary.excused, 1);
  assert.equal(record.attendanceSummary.countableTotal, 1);
  assert.equal(record.attendanceSummary.attendanceRatePct, 100);

  // Verified fallback path hit submissions twice (Phase 5C then baseline)
  assert.equal(
    executedQueries.filter((q) => q.table === 'submissions').length,
    2
  );
});

test('buildDirectStudentAcademicRecord hides unreleased assignment & quiz grades from students while preserving NULLs', () => {
  const record = buildDirectStudentAcademicRecord({
    callerRole: 'student',
    callerId: 'st-1',
    studentProfile: {
      id: 'st-1',
      full_name: 'Faisal',
      full_name_arabic: 'فيصل',
      status: 'active',
      created_at: '2026-09-01T00:00:00Z',
    },
    academicProfile: { group_id: 'g-1', notes: 'Secret staff note' },
    membershipRows: [],
    groupCoursesRows: [],
    lessonRows: [],
    lessonProgressRows: [],
    quizAttemptRows: [
      {
        id: 'qa-hidden',
        quiz_id: 'q-1',
        attempt_number: 1,
        status: 'submitted',
        requires_manual_grading: true,
        started_at: '2026-11-10T10:00:00Z',
        submitted_at: '2026-11-10T10:20:00Z',
        points_scored: 15,
        total_points_possible: 20,
        percentage_score: 75,
        is_passed: true,
        teacher_feedback: 'Pending review note',
        quizzes: {
          id: 'q-1',
          title: 'Essay Quiz',
          title_arabic: 'اختبار مقالي',
          passing_score: 60,
          show_results_immediately: false,
        },
      },
    ],
    submissionRows: [
      {
        id: 'sub-hidden',
        assignment_id: 'a-1',
        attempt_number: 1,
        status: 'graded',
        submitted_at: '2026-11-10T12:00:00Z',
        is_late: false,
        graded_at: '2026-11-10T13:00:00Z',
        is_grade_released: false,
        score: 18,
        teacher_feedback: 'Unreleased feedback',
        assignments: {
          id: 'a-1',
          title: 'Writing',
          title_arabic: 'كتابة',
          max_score: 20,
        },
      },
    ],
    attendanceRows: [],
  });

  assert.equal(record.student.notes, null);
  assert.equal(record.quizzes[0].isResultReleased, false);
  assert.equal(record.quizzes[0].percentageScore, null);
  assert.equal(record.quizzes[0].teacherFeedback, null);
  assert.equal(record.assignments[0].isGradeReleased, false);
  assert.equal(record.assignments[0].score, null);
  assert.equal(record.assignments[0].percentageScore, null);
  assert.equal(record.assignments[0].teacherFeedback, null);
  assert.equal(record.summary.overallAcademicAveragePct, null);
  assert.equal(record.summary.attendanceRatePct, null);
});

test('mapRawAcademicRecord and buildDirectStudentAcademicRecord return null for omitted metadata instead of fabricating defaults', () => {
  const mapped = mapRawAcademicRecord({
    student: { id: 'st-omit', full_name: 'Omar' },
    groups: [{ id: 'g-1', name: 'Cohort', is_active: true, is_primary: true }],
    courses: [
      {
        course_id: 'c-1',
        title: 'Course',
        is_published: true,
        groups: [{ id: 'g-1', name: 'Cohort' }],
        total_lessons: 0,
        completed_lessons: 0,
        pending_lessons: 0,
        progress_percentage: null,
      },
    ],
    quizzes: [
      {
        id: 'qa-1',
        quiz_id: 'q-1',
        title: 'Quiz',
        attempt_number: 1,
        status: 'submitted',
        requires_manual_grading: false,
        is_result_released: false,
        points_scored: null,
        total_points_possible: null,
        percentage_score: null,
        is_passed: null,
        started_at: '2026-11-10T10:00:00Z',
      },
    ],
    assignments: [
      {
        id: 'sub-1',
        assignment_id: 'a-1',
        title: 'Assign',
        attempt_number: 1,
        status: 'submitted',
        is_late: false,
        is_grade_released: false,
        score: null,
        percentage_score: null,
      },
    ],
    attendance: [],
    attendance_summary: {
      present: 0,
      late: 0,
      excused: 0,
      absent: 0,
      total: 0,
      countable_total: 0,
      attendance_rate_pct: null,
    },
    summary: {
      enrolled_courses: 1,
      total_lessons: 0,
      completed_lessons: 0,
      pending_lessons: 0,
      course_progress_pct: null,
      quiz_attempts_count: 1,
      completed_quizzes_count: 1,
      graded_quizzes_count: 0,
      avg_quiz_percentage: null,
      assignment_submissions_count: 1,
      graded_assignments_count: 0,
      avg_assignment_percentage: null,
      overall_academic_average_pct: null,
      attendance_rate_pct: null,
    },
    timezone: 'Asia/Riyadh',
  });

  assert.equal(mapped.student.enrolledAt, null);
  assert.equal(mapped.student.status, null);
  assert.equal(mapped.groups[0].academicYear, null);
  assert.equal(mapped.courses[0].level, null);
  assert.equal(mapped.quizzes[0].passingScore, null);
  assert.equal(mapped.assignments[0].maxScore, null);
  assert.equal(mapped.summary.passingThreshold, null);

  const direct = buildDirectStudentAcademicRecord({
    callerRole: 'teacher',
    callerId: 't-1',
    studentProfile: { id: 'st-omit', full_name: 'Omar' },
    academicProfile: null,
    membershipRows: [{ group_id: 'g-1', groups: { id: 'g-1', name: 'Cohort', is_active: true } }],
    groupCoursesRows: [
      {
        course_id: 'c-1',
        group_id: 'g-1',
        courses: { id: 'c-1', title: 'Course', is_published: true, teacher_id: 't-1' },
        groups: { id: 'g-1', name: 'Cohort' },
      },
    ],
    lessonRows: [],
    lessonProgressRows: [],
    quizAttemptRows: [
      {
        id: 'qa-direct',
        quiz_id: 'q-1',
        status: 'submitted',
        started_at: '2026-11-10T10:00:00Z',
        quizzes: { id: 'q-1', title: 'Quiz', teacher_id: 't-1' },
      },
    ],
    submissionRows: [
      {
        id: 'sub-direct',
        assignment_id: 'a-1',
        assignments: { id: 'a-1', title: 'Assign', teacher_id: 't-1' },
      },
    ],
    attendanceRows: [],
  });

  assert.equal(direct.student.enrolledAt, null);
  assert.equal(direct.student.status, null);
  assert.equal(direct.groups[0].academicYear, null);
  assert.equal(direct.courses[0].level, null);
  assert.equal(direct.quizzes[0].passingScore, null);
  assert.equal(direct.assignments[0].maxScore, null);
  assert.equal(direct.summary.passingThreshold, null);
});

test('mapRawAcademicRecord preserves genuine database zeros cleanly across scores, counts, and rates', () => {
  const payload = sampleRawPayload() as any;
  payload.courses[0].completed_lessons = 0;
  payload.courses[0].pending_lessons = 10;
  payload.courses[0].progress_percentage = 0;
  payload.quizzes[0].points_scored = 0;
  payload.quizzes[0].percentage_score = 0;
  payload.quizzes[0].is_passed = false;
  payload.assignments[0].score = 0;
  payload.assignments[0].percentage_score = 0;
  payload.assignments[0].is_grade_released = true;
  payload.attendance_summary.present = 0;
  payload.attendance_summary.absent = 1;
  payload.attendance_summary.attendance_rate_pct = 0;
  payload.summary.completed_lessons = 0;
  payload.summary.course_progress_pct = 0;
  payload.summary.avg_quiz_percentage = 0;
  payload.summary.avg_assignment_percentage = 0;
  payload.summary.overall_academic_average_pct = 0;
  payload.summary.attendance_rate_pct = 0;

  const mapped = mapRawAcademicRecord(payload);
  assert.equal(mapped.courses[0].completedLessons, 0);
  assert.equal(mapped.courses[0].progressPercentage, 0);
  assert.equal(mapped.quizzes[0].pointsScored, 0);
  assert.equal(mapped.quizzes[0].percentageScore, 0);
  assert.equal(mapped.assignments[0].score, 0);
  assert.equal(mapped.assignments[0].percentageScore, 0);
  assert.equal(mapped.attendanceSummary.present, 0);
  assert.equal(mapped.attendanceSummary.attendanceRatePct, 0);
  assert.equal(mapped.summary.courseProgressPct, 0);
  assert.equal(mapped.summary.avgQuizPercentage, 0);
  assert.equal(mapped.summary.avgAssignmentPercentage, 0);
  assert.equal(mapped.summary.overallAcademicAveragePct, 0);
  assert.equal(mapped.summary.attendanceRatePct, 0);
});

test('mapRawAcademicRecord throws explicit ServiceError for missing required fields, NULL counts, or malformed payloads', () => {
  assert.throws(() => mapRawAcademicRecord({}), (err: unknown) => {
    assert.ok(err instanceof ServiceError);
    assert.equal(err.code, 'INVALID_ACADEMIC_RECORD_CONTRACT');
    return true;
  });

  const missingTotalLessons = sampleRawPayload() as any;
  delete missingTotalLessons.courses[0].total_lessons;
  assert.throws(() => mapRawAcademicRecord(missingTotalLessons), (err: unknown) => {
    assert.ok(err instanceof ServiceError);
    assert.equal(err.code, 'INVALID_ACADEMIC_RECORD_CONTRACT');
    return true;
  });

  const missingAttemptNumber = sampleRawPayload() as any;
  delete missingAttemptNumber.quizzes[0].attempt_number;
  assert.throws(() => mapRawAcademicRecord(missingAttemptNumber), (err: unknown) => {
    assert.ok(err instanceof ServiceError);
    assert.equal(err.code, 'INVALID_ACADEMIC_RECORD_CONTRACT');
    return true;
  });

  const nullAttendanceCount = sampleRawPayload() as any;
  nullAttendanceCount.attendance_summary.present = null;
  assert.throws(() => mapRawAcademicRecord(nullAttendanceCount), (err: unknown) => {
    assert.ok(err instanceof ServiceError);
    assert.equal(err.code, 'INVALID_ACADEMIC_RECORD_CONTRACT');
    return true;
  });

  const malformedAvgScore = sampleRawPayload() as any;
  malformedAvgScore.summary.avg_quiz_percentage = 'not-a-number';
  assert.throws(() => mapRawAcademicRecord(malformedAvgScore), (err: unknown) => {
    assert.ok(err instanceof ServiceError);
    assert.equal(err.code, 'INVALID_ACADEMIC_RECORD_CONTRACT');
    return true;
  });
});
