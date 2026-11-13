/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setSupabaseClientForTesting } from '../../lib/supabase/client';
import { ServiceError, formatServiceErrorForUi } from '../../lib/errors/serviceError';
import { fetchGroups, updateGroup, fetchGroupDetails } from '../groups/groupService';
import { fetchStudents } from '../students/studentService';
import { notificationService } from '../notifications/notificationService';
import { fetchTeacherVideos, recordVideoPlaybackProgress } from '../videoLibrary/videoLibraryService';
import { fetchTeacherCourses, createCourse, fetchStudentCourseDetails } from '../courses/coursesService';
import { fetchTeacherQuizzes, createQuiz } from '../quizzes/quizService';
import { fetchTeacherLiveSessions, saveSessionAttendance } from '../liveSessions/liveSessionsService';
import { fetchQuestionBankItems } from '../questionBank/questionBankService';
import {
  fetchTeacherAssignments,
  isAssignmentsPhase5CSchemaReady,
} from '../assignments/assignmentService';

type QueryOutcome =
  | { data: any; error: any; count?: number | null }
  | Error;

type TableHandler = (ctx: { table: string; op: 'select' | 'insert' | 'update' | 'delete'; payload?: any }) => QueryOutcome | Promise<QueryOutcome>;
type RpcHandler = (fnName: string, params?: any) => QueryOutcome | Promise<QueryOutcome>;

function createMockSupabaseClient(options: {
  tableHandler?: TableHandler;
  rpcHandler?: RpcHandler;
  user?: { id: string; email?: string } | null;
  authError?: any;
}) {
  const resolveOutcome = async (
    handler: (() => QueryOutcome | Promise<QueryOutcome>) | undefined
  ) => {
    const out = handler ? await handler() : { data: [], error: null };
    if (out instanceof Error) {
      throw out;
    }
    return out;
  };

  return {
    auth: {
      getUser: async () => {
        if (options.authError instanceof Error) {
          throw options.authError;
        }
        return {
          data: { user: options.user !== undefined ? options.user : { id: 'teacher-1', email: 'teacher@wessam.academy' } },
          error: options.authError || null,
        };
      },
    },
    from(table: string) {
      let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
      let payload: any = undefined;

      const builder: any = {
        select() {
          return builder;
        },
        insert(vals: any) {
          op = 'insert';
          payload = vals;
          return builder;
        },
        update(vals: any) {
          op = 'update';
          payload = vals;
          return builder;
        },
        delete() {
          op = 'delete';
          return builder;
        },
        eq() {
          return builder;
        },
        neq() {
          return builder;
        },
        in() {
          return builder;
        },
        is() {
          return builder;
        },
        not() {
          return builder;
        },
        gte() {
          return builder;
        },
        lte() {
          return builder;
        },
        order() {
          return builder;
        },
        limit() {
          return builder;
        },
        single() {
          return resolveOutcome(() =>
            options.tableHandler ? options.tableHandler({ table, op, payload }) : { data: null, error: null }
          );
        },
        maybeSingle() {
          return resolveOutcome(() =>
            options.tableHandler ? options.tableHandler({ table, op, payload }) : { data: null, error: null }
          );
        },
        then(onFulfilled: any, onRejected: any) {
          return resolveOutcome(() =>
            options.tableHandler ? options.tableHandler({ table, op, payload }) : { data: [], error: null }
          ).then(onFulfilled, onRejected);
        },
      };

      return builder;
    },
    rpc(fnName: string, params?: any) {
      return resolveOutcome(() =>
        options.rpcHandler ? options.rpcHandler(fnName, params) : { data: [], error: null }
      );
    },
  } as any;
}

afterEach(() => {
  setSupabaseClientForTesting(null);
});

describe('Phase 2 Service Cleanup & Zero Demo Fallback Verification', () => {
  it('1. Throws CONFIGURATION_ERROR across all 9 core services when Supabase client is null', async () => {
    setSupabaseClientForTesting(null);

    const calls: Array<[string, () => Promise<unknown>]> = [
      ['groupService.fetchGroups', () => fetchGroups()],
      ['studentService.fetchStudents', () => fetchStudents()],
      ['notificationService.fetchNotifications', () => notificationService.fetchNotifications()],
      ['videoLibraryService.fetchTeacherVideos', () => fetchTeacherVideos()],
      ['coursesService.fetchTeacherCourses', () => fetchTeacherCourses()],
      ['quizService.fetchTeacherQuizzes', () => fetchTeacherQuizzes()],
      ['liveSessionsService.fetchTeacherLiveSessions', () => fetchTeacherLiveSessions()],
      ['questionBankService.fetchQuestionBankItems', () => fetchQuestionBankItems()],
      ['assignmentService.fetchTeacherAssignments', () => fetchTeacherAssignments()],
    ];

    for (const [name, fn] of calls) {
      await assert.rejects(
        fn,
        (err: unknown) => err instanceof ServiceError && err.category === 'CONFIGURATION_ERROR',
        `${name} did not throw CONFIGURATION_ERROR when client is null`
      );
    }
  });

  it('2. Returns honest empty arrays and zero counts when backend returns empty rows', async () => {
    setSupabaseClientForTesting(
      createMockSupabaseClient({
        tableHandler: () => ({ data: [], error: null }),
        rpcHandler: (fnName) => {
          if (fnName === 'get_unread_notifications_count') {
            return { data: 0, error: null };
          }
          return { data: [], error: null };
        },
      })
    );

    assert.deepEqual(await fetchGroups(), []);
    assert.deepEqual(await fetchStudents(), []);
    assert.deepEqual(await fetchTeacherVideos(), []);
    assert.deepEqual(await fetchTeacherCourses(), []);
    assert.deepEqual(await fetchTeacherQuizzes(), []);
    assert.deepEqual(await fetchTeacherLiveSessions(), []);
    assert.deepEqual(await fetchQuestionBankItems(), []);
    assert.deepEqual(await fetchTeacherAssignments(), []);
    const notifRes = await notificationService.fetchNotifications();
    assert.deepEqual(notifRes, { notifications: [], totalCount: 0 });
    assert.equal(await notificationService.getUnreadCount(), 0);
  });

  it('3. Accurately maps valid backend rows without fabricating demo data', async () => {
    setSupabaseClientForTesting(
      createMockSupabaseClient({
        tableHandler: ({ table }) => {
          switch (table) {
            case 'groups':
              return {
                data: [
                  {
                    id: 'g-1',
                    name: 'IELTS Alpha',
                    name_arabic: 'آيلتس ألفا',
                    academic_year: '2026-2027',
                    max_students: 25,
                    is_active: true,
                    created_at: '2026-10-01T10:00:00Z',
                    updated_at: '2026-10-01T10:00:00Z',
                  },
                ],
                error: null,
              };
            case 'group_students':
              return { data: [{ group_id: 'g-1' }, { group_id: 'g-1' }], error: null };
            case 'courses':
              return {
                data: [
                  {
                    id: 'c-1',
                    teacher_id: 'teacher-1',
                    title: 'Academic Writing',
                    title_arabic: 'الكتابة الأكاديمية',
                    level: 'intermediate',
                    is_published: true,
                    created_at: '2026-10-01T10:00:00Z',
                    updated_at: '2026-10-01T10:00:00Z',
                  },
                ],
                error: null,
              };
            case 'course_units':
              return { data: [{ id: 'u-1', course_id: 'c-1' }], error: null };
            case 'lessons':
              return { data: [{ id: 'l-1', course_id: 'c-1' }, { id: 'l-2', course_id: 'c-1' }], error: null };
            case 'group_courses':
              return {
                data: [{ course_id: 'c-1', group_id: 'g-1', groups: { id: 'g-1', name: 'IELTS Alpha', name_arabic: 'آيلتس ألفا' } }],
                error: null,
              };
            default:
              return { data: [], error: null };
          }
        },
      })
    );

    const groups = await fetchGroups();
    assert.equal(groups.length, 1);
    assert.equal(groups[0].studentCount, 2);
    assert.equal(groups[0].name, 'IELTS Alpha');

    const courses = await fetchTeacherCourses();
    assert.equal(courses.length, 1);
    assert.equal(courses[0].unitsCount, 1);
    assert.equal(courses[0].lessonsCount, 2);
    assert.equal(courses[0].assignedGroupsCount, 1);
  });

  it('4. Classifies network failures into NETWORK_ERROR across services', async () => {
    setSupabaseClientForTesting(
      createMockSupabaseClient({
        tableHandler: () => {
          throw new TypeError('Failed to fetch');
        },
        rpcHandler: () => {
          throw new TypeError('Failed to fetch');
        },
      })
    );

    await assert.rejects(
      () => fetchTeacherCourses(),
      (err: unknown) => err instanceof ServiceError && err.category === 'NETWORK_ERROR'
    );
    await assert.rejects(
      () => notificationService.fetchNotifications(),
      (err: unknown) => err instanceof ServiceError && err.category === 'NETWORK_ERROR'
    );
  });

  it('5. Classifies RLS / 42501 / 403 permission failures into AUTHORIZATION_ERROR', async () => {
    setSupabaseClientForTesting(
      createMockSupabaseClient({
        tableHandler: () => ({
          data: null,
          error: { code: '42501', message: 'permission denied for table quizzes' },
        }),
      })
    );

    await assert.rejects(
      () => fetchTeacherQuizzes(),
      (err: unknown) => err instanceof ServiceError && err.category === 'AUTHORIZATION_ERROR'
    );
  });

  it('6. Classifies missing table/column/RPC into SCHEMA_ERROR', async () => {
    setSupabaseClientForTesting(
      createMockSupabaseClient({
        tableHandler: () => ({
          data: null,
          error: { code: 'PGRST204', message: "Could not find the 'video_source' column" },
        }),
      })
    );

    await assert.rejects(
      () => fetchTeacherVideos(),
      (err: unknown) => err instanceof ServiceError && err.category === 'SCHEMA_ERROR'
    );
  });

  it('7. coursesService fails cleanly on secondary query errors instead of returning partial 0 counts', async () => {
    // Failure in units/lessons/groups inside fetchTeacherCourses
    setSupabaseClientForTesting(
      createMockSupabaseClient({
        tableHandler: ({ table }) => {
          if (table === 'courses') {
            return {
              data: [
                {
                  id: 'c-1',
                  teacher_id: 'teacher-1',
                  title: 'Course',
                  title_arabic: 'مقرر',
                  level: 'beginner',
                  is_published: true,
                  created_at: '2026-10-01T10:00:00Z',
                  updated_at: '2026-10-01T10:00:00Z',
                },
              ],
              error: null,
            };
          }
          if (table === 'course_units') {
            return { data: null, error: { code: '42501', message: 'permission denied' } };
          }
          return { data: [], error: null };
        },
      })
    );

    await assert.rejects(
      () => fetchTeacherCourses(),
      (err: unknown) => err instanceof ServiceError && err.category === 'AUTHORIZATION_ERROR'
    );

    // Failure in lesson_progress inside fetchStudentCourseDetails
    setSupabaseClientForTesting(
      createMockSupabaseClient({
        tableHandler: ({ table }) => {
          if (table === 'courses') {
            return {
              data: {
                id: 'c-1',
                teacher_id: 'teacher-1',
                title: 'Course',
                title_arabic: 'مقرر',
                level: 'beginner',
                is_published: true,
                created_at: '2026-10-01T10:00:00Z',
                updated_at: '2026-10-01T10:00:00Z',
              },
              error: null,
            };
          }
          if (table === 'course_units') {
            return { data: [{ id: 'u-1', course_id: 'c-1', title: 'Unit', title_arabic: 'وحدة', order_index: 1, created_at: '2026-10-01T10:00:00Z' }], error: null };
          }
          if (table === 'lessons') {
            return { data: [{ id: 'l-1', course_id: 'c-1', unit_id: 'u-1', title: 'Lesson', title_arabic: 'درس', duration_minutes: 10, order_index: 1, is_published: true, created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z' }], error: null };
          }
          if (table === 'lesson_progress') {
            return { data: null, error: new TypeError('Failed to fetch') };
          }
          return { data: [], error: null };
        },
      })
    );

    await assert.rejects(
      () => fetchStudentCourseDetails('c-1'),
      (err: unknown) => err instanceof ServiceError && err.category === 'NETWORK_ERROR'
    );
  });

  it('8. Propagates write and mutation failures as ServiceError instead of succeeding silently', async () => {
    setSupabaseClientForTesting(
      createMockSupabaseClient({
        tableHandler: () => ({
          data: null,
          error: { code: '42501', message: 'RLS policy violation' },
        }),
        rpcHandler: () => ({
          data: null,
          error: { status: 503, message: 'Service Unavailable' },
        }),
      })
    );

    await assert.rejects(
      () =>
        createCourse({
          title: 'Grammar',
          titleArabic: 'القواعد',
          level: 'beginner',
        }),
      (err: unknown) => err instanceof ServiceError && err.category === 'AUTHORIZATION_ERROR'
    );

    await assert.rejects(
      () =>
        updateGroup({
          id: 'g-1',
          name: 'G1',
          nameArabic: 'م1',
          academicYear: '2026',
          maxStudents: 20,
          isActive: true,
        }),
      (err: unknown) => err instanceof ServiceError && err.category === 'AUTHORIZATION_ERROR'
    );

    await assert.rejects(
      () =>
        createQuiz({
          title: 'Quiz 1',
          titleArabic: 'اختبار 1',
          durationMinutes: 30,
          passingScore: 60,
          maxAttempts: 1,
          totalPoints: 10,
          showResultsImmediately: true,
          showCorrectAnswersAfterSubmission: true,
        }),
      (err: unknown) => err instanceof ServiceError && err.category === 'AUTHORIZATION_ERROR'
    );

    await assert.rejects(
      () => notificationService.publishAnnouncement('ann-1'),
      (err: unknown) => err instanceof ServiceError && err.category === 'NETWORK_ERROR'
    );

    await assert.rejects(
      () => saveSessionAttendance('s-1', [{ studentId: 'st-1', status: 'present' }]),
      (err: unknown) => err instanceof ServiceError && err.category === 'NETWORK_ERROR'
    );
  });

  it('9. notificationService throws ServiceError on read/count/mark failures instead of returning 0/true/[]', async () => {
    setSupabaseClientForTesting(
      createMockSupabaseClient({
        rpcHandler: () => ({
          data: null,
          error: { code: 'PGRST202', message: 'Could not find the function public.get_unread_notifications_count' },
        }),
      })
    );

    await assert.rejects(
      () => notificationService.fetchNotifications(),
      (err: unknown) => err instanceof ServiceError && err.category === 'SCHEMA_ERROR'
    );
    await assert.rejects(
      () => notificationService.getUnreadCount(),
      (err: unknown) => err instanceof ServiceError && err.category === 'SCHEMA_ERROR'
    );
    await assert.rejects(
      () => notificationService.markAsRead('n-1'),
      (err: unknown) => err instanceof ServiceError && err.category === 'SCHEMA_ERROR'
    );
    await assert.rejects(
      () => notificationService.markAllAsRead(),
      (err: unknown) => err instanceof ServiceError && err.category === 'SCHEMA_ERROR'
    );
  });

  it('10. videoLibraryService.recordVideoPlaybackProgress throws ServiceError on failure', async () => {
    setSupabaseClientForTesting(
      createMockSupabaseClient({
        rpcHandler: () => ({
          data: null,
          error: { code: '42501', message: 'Not enrolled in course' },
        }),
      })
    );

    await assert.rejects(
      () => recordVideoPlaybackProgress('vid-1', 120, 300),
      (err: unknown) => err instanceof ServiceError && err.category === 'AUTHORIZATION_ERROR'
    );
  });

  it('11. studentService.fetchStudents fails when secondary academic profile or group queries fail', async () => {
    setSupabaseClientForTesting(
      createMockSupabaseClient({
        tableHandler: ({ table }) => {
          if (table === 'profiles') {
            return {
              data: [
                {
                  id: 'st-1',
                  role: 'student',
                  full_name: 'Student One',
                  full_name_arabic: 'طالب ١',
                  status: 'active',
                  created_at: '2026-10-01T10:00:00Z',
                },
              ],
              error: null,
            };
          }
          if (table === 'student_academic_profiles') {
            return { data: null, error: { code: '42501', message: 'permission denied' } };
          }
          return { data: [], error: null };
        },
      })
    );

    await assert.rejects(
      () => fetchStudents(),
      (err: unknown) => err instanceof ServiceError && err.category === 'AUTHORIZATION_ERROR'
    );
  });

  it('12. groupService fails cleanly when secondary group_students or fetchGroupDetails queries fail', async () => {
    setSupabaseClientForTesting(
      createMockSupabaseClient({
        tableHandler: ({ table }) => {
          if (table === 'groups') {
            return {
              data: [
                {
                  id: 'g-1',
                  name: 'Group A',
                  name_arabic: 'المجموعة أ',
                  academic_year: '2026',
                  max_students: 20,
                  is_active: true,
                  created_at: '2026-10-01T10:00:00Z',
                  updated_at: '2026-10-01T10:00:00Z',
                },
              ],
              error: null,
            };
          }
          if (table === 'group_students') {
            return { data: null, error: new TypeError('Failed to fetch') };
          }
          return { data: [], error: null };
        },
      })
    );

    await assert.rejects(
      () => fetchGroups(),
      (err: unknown) => err instanceof ServiceError && err.category === 'NETWORK_ERROR'
    );

    // Also test fetchGroupDetails secondary group_courses failure
    setSupabaseClientForTesting(
      createMockSupabaseClient({
        tableHandler: ({ table }) => {
          if (table === 'groups') {
            return {
              data: {
                id: 'g-1',
                name: 'Group A',
                name_arabic: 'المجموعة أ',
                academic_year: '2026',
                max_students: 20,
                is_active: true,
                created_at: '2026-10-01T10:00:00Z',
                updated_at: '2026-10-01T10:00:00Z',
              },
              error: null,
            };
          }
          if (table === 'group_courses') {
            return { data: null, error: { code: '42501', message: 'permission denied' } };
          }
          return { data: [], error: null };
        },
      })
    );

    await assert.rejects(
      () => fetchGroupDetails('g-1'),
      (err: unknown) => err instanceof ServiceError && err.category === 'AUTHORIZATION_ERROR'
    );
  });

  it('13. assignmentService schema fallback activates ONLY on verified schema errors and resets when schema succeeds', async () => {
    let callCount = 0;
    setSupabaseClientForTesting(
      createMockSupabaseClient({
        tableHandler: () => {
          callCount += 1;
          if (callCount === 1) {
            return {
              data: null,
              error: {
                code: 'PGRST200',
                message: "Could not find a relationship between 'assignments' and 'lesson_id' in the schema cache",
              },
            };
          }
          return {
            data: [
              {
                id: 'a-1',
                course_id: 'c-1',
                title: 'Essay 1',
                title_arabic: 'مقال ١',
                due_date: '2026-12-01T20:00:00Z',
                max_score: 100,
                is_published: true,
                created_at: '2026-10-01T10:00:00Z',
              },
            ],
            error: null,
          };
        },
      })
    );

    const fallbackResults = await fetchTeacherAssignments();
    assert.equal(isAssignmentsPhase5CSchemaReady(), false);
    assert.equal(fallbackResults.length, 1);
    assert.equal(fallbackResults[0].title, 'Essay 1');

    // Subsequent call where Phase 5C schema succeeds must reset schemaReady back to true
    callCount = 10;
    const fullResults = await fetchTeacherAssignments();
    assert.equal(isAssignmentsPhase5CSchemaReady(), true);
    assert.equal(fullResults.length, 1);

    // Must NOT mask 42501 or network error with baseline query
    let attempts = 0;
    setSupabaseClientForTesting(
      createMockSupabaseClient({
        tableHandler: () => {
          attempts += 1;
          return { data: null, error: { code: '42501', message: 'permission denied' } };
        },
      })
    );

    await assert.rejects(
      () => fetchTeacherAssignments(),
      (err: unknown) => err instanceof ServiceError && err.category === 'AUTHORIZATION_ERROR'
    );
    assert.equal(attempts, 1);

    // Baseline failure after verified schema fallback must also throw ServiceError
    setSupabaseClientForTesting(
      createMockSupabaseClient({
        tableHandler: () => ({
          data: null,
          error: { code: 'PGRST200', message: 'Could not find a relationship in schema cache' },
        }),
      })
    );
    await assert.rejects(
      () => fetchTeacherAssignments(),
      (err: unknown) => err instanceof ServiceError && err.category === 'SCHEMA_ERROR'
    );
  });

  it('14. Throws AUTHENTICATION_ERROR on expired/missing auth session', async () => {
    setSupabaseClientForTesting(
      createMockSupabaseClient({
        user: null,
        authError: { status: 401, message: 'JWT expired' },
      })
    );

    await assert.rejects(
      () =>
        createCourse({
          title: 'Speaking',
          titleArabic: 'المحادثة',
          level: 'beginner',
        }),
      (err: unknown) => err instanceof ServiceError && err.category === 'AUTHENTICATION_ERROR'
    );
  });

  it('15. Distinguishes UI error banners from empty state and omits internal secrets in both languages', () => {
    const cfgUi = formatServiceErrorForUi(
      new ServiceError({
        category: 'CONFIGURATION_ERROR',
        message: 'Missing VITE_SUPABASE_URL',
        service: 'client',
        operation: 'init',
      }),
      true
    );
    assert.equal(cfgUi.canRetry, false);
    assert.ok(cfgUi.title.includes('إعدادات النظام'));

    const dbUi = formatServiceErrorForUi(
      new ServiceError({
        category: 'DATABASE_ERROR',
        message: 'Query failed token=abc123',
        service: 'test',
        operation: 'run',
      }),
      false
    );
    assert.equal(dbUi.canRetry, true);
    assert.equal(dbUi.message.includes('abc123'), false);
  });
});
