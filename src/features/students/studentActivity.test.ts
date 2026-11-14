/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCourseActivitySummaries,
  mapAttendanceActivityRows,
  mapQuizAttemptActivityRows,
  mapAssignmentSubmissionActivityRows,
  computeLastLearningActivityAt,
  isStudentActivityEmpty,
  StudentActivitySummary,
} from './studentActivityService';

test('buildCourseActivitySummaries - calculates published lesson progress and sorts completed vs pending', () => {
  const summaries = buildCourseActivitySummaries({
    groupCoursesRows: [
      {
        course_id: 'c1',
        group_id: 'g1',
        courses: {
          id: 'c1',
          title: 'English Grammar A1',
          title_arabic: 'قواعد اللغة الإنجليزية A1',
          level: 'beginner',
          is_published: true,
        },
        groups: {
          id: 'g1',
          name: 'Cohort A',
          name_arabic: 'المجموعة أ',
        },
      },
      // Same course also assigned through g2 should deduplicate course and collect both groups
      {
        course_id: 'c1',
        group_id: 'g2',
        courses: {
          id: 'c1',
          title: 'English Grammar A1',
          title_arabic: 'قواعد اللغة الإنجليزية A1',
          level: 'beginner',
          is_published: true,
        },
        groups: {
          id: 'g2',
          name: 'Cohort B',
          name_arabic: 'المجموعة ب',
        },
      },
    ],
    lessonRows: [
      {
        id: 'l2',
        course_id: 'c1',
        unit_id: 'u1',
        title: 'Present Simple',
        title_arabic: 'المضارع البسيط',
        duration_minutes: 30,
        order_index: 2,
        is_published: true,
        course_units: { id: 'u1', title: 'Unit 1', title_arabic: 'الوحدة 1', order_index: 1 },
      },
      {
        id: 'l1',
        course_id: 'c1',
        unit_id: 'u1',
        title: 'Nouns & Pronouns',
        title_arabic: 'الأسماء والضمائر',
        duration_minutes: 25,
        order_index: 1,
        is_published: true,
        course_units: { id: 'u1', title: 'Unit 1', title_arabic: 'الوحدة 1', order_index: 1 },
      },
      {
        id: 'l3-draft',
        course_id: 'c1',
        unit_id: 'u2',
        title: 'Draft Lesson',
        title_arabic: 'درس مسودة',
        duration_minutes: 20,
        order_index: 1,
        is_published: false,
        course_units: { id: 'u2', title: 'Unit 2', title_arabic: 'الوحدة 2', order_index: 2 },
      },
      // Lesson belonging to an unauthorized course must be excluded
      {
        id: 'l-unauth',
        course_id: 'c-other',
        unit_id: 'u9',
        title: 'Hidden Lesson',
        title_arabic: 'درس مخفي',
        duration_minutes: 15,
        order_index: 1,
        is_published: true,
        course_units: { id: 'u9', title: 'Unit 9', title_arabic: 'الوحدة 9', order_index: 1 },
      },
    ],
    progressRows: [
      {
        lesson_id: 'l1',
        is_completed: true,
        watch_seconds: 1500,
        last_accessed_at: '2026-11-10T10:00:00.000Z',
      },
      {
        lesson_id: 'l2',
        is_completed: false,
        watch_seconds: 300,
        last_accessed_at: '2026-11-11T12:30:00.000Z',
      },
    ],
  });

  assert.equal(summaries.length, 1);
  const c1 = summaries[0];
  assert.equal(c1.groupNames.length, 2);
  assert.equal(c1.totalPublishedLessons, 2);
  assert.equal(c1.completedLessonsCount, 1);
  assert.equal(c1.pendingLessonsCount, 1);
  assert.equal(c1.progressPercentage, 50);
  assert.equal(c1.lastAccessedAt, '2026-11-11T12:30:00.000Z');
  assert.equal(c1.completedLessons[0].id, 'l1');
  assert.equal(c1.pendingLessons[0].id, 'l2');
});

test('mapAttendanceActivityRows - maps attendance safely without meeting_url', () => {
  const mapped = mapAttendanceActivityRows([
    {
      id: 'att-1',
      session_id: 'sess-1',
      status: 'present',
      joined_at: '2026-11-12T17:02:00.000Z',
      recorded_at: '2026-11-12T17:00:00.000Z',
      notes: 'Participated actively',
      live_sessions: {
        id: 'sess-1',
        course_id: 'c1',
        group_id: 'g1',
        title: 'Speaking Workshop',
        title_arabic: 'ورشة المحادثة',
        start_time: '2026-11-12T17:00:00.000Z',
        end_time: '2026-11-12T18:00:00.000Z',
        status: 'completed',
      },
    },
  ]);

  assert.equal(mapped.length, 1);
  assert.equal(mapped[0].sessionTitleArabic, 'ورشة المحادثة');
  assert.equal(mapped[0].status, 'present');
  assert.equal('meetingUrl' in mapped[0], false);
});

test('mapQuizAttemptActivityRows - maps scores, grading status, and teacher feedback', () => {
  const mapped = mapQuizAttemptActivityRows([
    {
      id: 'qa-1',
      quiz_id: 'q-1',
      status: 'graded',
      attempt_number: 1,
      started_at: '2026-11-10T14:00:00.000Z',
      completed_at: '2026-11-10T14:25:00.000Z',
      submitted_at: '2026-11-10T14:25:00.000Z',
      graded_at: '2026-11-10T15:00:00.000Z',
      score: 85,
      points_scored: 17,
      total_points_possible: 20,
      percentage_score: 85,
      is_passed: true,
      requires_manual_grading: false,
      teacher_feedback: 'Great mastery of tenses',
      quizzes: {
        id: 'q-1',
        course_id: 'c1',
        title: 'Unit 1 Quiz',
        title_arabic: 'اختبار الوحدة الأولى',
        passing_score: 60,
        total_points: 20,
        courses: { id: 'c1', title: 'Grammar A1', title_arabic: 'القواعد A1' },
      },
    },
  ]);

  assert.equal(mapped.length, 1);
  assert.equal(mapped[0].percentageScore, 85);
  assert.equal(mapped[0].pointsScored, 17);
  assert.equal(mapped[0].isPassed, true);
  assert.equal(mapped[0].teacherFeedback, 'Great mastery of tenses');
});

test('mapAssignmentSubmissionActivityRows - handles both baseline and Phase 5C submission rows', () => {
  // Baseline row lacks status, attempt_number, is_grade_released
  const mapped = mapAssignmentSubmissionActivityRows([
    {
      id: 'sub-baseline-graded',
      assignment_id: 'a1',
      submitted_at: '2026-11-09T09:00:00.000Z',
      is_late: false,
      score: 92,
      teacher_feedback: 'Well structured essay',
      graded_at: '2026-11-09T18:00:00.000Z',
      assignments: {
        id: 'a1',
        course_id: 'c1',
        title: 'Essay 1',
        title_arabic: 'مقال 1',
        due_date: '2026-11-10T00:00:00.000Z',
        max_score: 100,
        courses: { id: 'c1', title: 'Writing', title_arabic: 'الكتابة' },
      },
    },
    {
      id: 'sub-baseline-pending',
      assignment_id: 'a2',
      submitted_at: '2026-11-13T11:00:00.000Z',
      is_late: true,
      score: null,
      teacher_feedback: null,
      graded_at: null,
      assignments: {
        id: 'a2',
        course_id: 'c1',
        title: 'Essay 2',
        title_arabic: 'مقال 2',
        due_date: '2026-11-12T00:00:00.000Z',
        max_score: 50,
        courses: null,
      },
    },
    {
      id: 'sub-phase5c-revision',
      assignment_id: 'a3',
      attempt_number: 2,
      submitted_at: '2026-11-14T08:00:00.000Z',
      is_late: false,
      status: 'returned_for_revision',
      score: 40,
      teacher_feedback: 'Please expand paragraph 2',
      graded_at: '2026-11-14T09:30:00.000Z',
      is_grade_released: false,
      assignments: {
        id: 'a3',
        course_id: 'c1',
        title: 'Essay 3',
        title_arabic: 'مقال 3',
        due_date: '2026-11-15T00:00:00.000Z',
        max_score: 100,
        courses: null,
      },
    },
  ]);

  assert.equal(mapped[0].status, 'graded');
  assert.equal(mapped[0].attemptNumber, 1);
  assert.equal(mapped[0].isGradeReleased, true);

  assert.equal(mapped[1].status, 'submitted');
  assert.equal(mapped[1].isLate, true);
  assert.equal(mapped[1].score, null);

  assert.equal(mapped[2].status, 'returned_for_revision');
  assert.equal(mapped[2].attemptNumber, 2);
  assert.equal(mapped[2].isGradeReleased, false);
});

test('computeLastLearningActivityAt & isStudentActivityEmpty', () => {
  const latest = computeLastLearningActivityAt({
    courses: [
      {
        courseId: 'c1',
        title: 'Course',
        titleArabic: 'مقرر',
        level: 'beginner',
        isPublished: true,
        groupNames: [],
        totalPublishedLessons: 1,
        completedLessonsCount: 1,
        pendingLessonsCount: 0,
        progressPercentage: 100,
        lastAccessedAt: '2026-11-10T10:00:00.000Z',
        completedLessons: [],
        pendingLessons: [],
      },
    ],
    attendance: [
      {
        id: 'att-1',
        sessionId: 's1',
        sessionTitle: 'Live',
        sessionTitleArabic: 'جلسة',
        sessionStartTime: null,
        sessionEndTime: null,
        sessionStatus: null,
        status: 'present',
        joinedAt: '2026-11-12T17:00:00.000Z',
        recordedAt: '2026-11-12T17:05:00.000Z',
        notes: null,
      },
    ],
    quizAttempts: [],
    submissions: [],
  });

  assert.equal(latest, '2026-11-12T17:05:00.000Z');

  const emptySummary: StudentActivitySummary = {
    studentId: 'stu-1',
    courses: [],
    totalEnrolledCourses: 0,
    totalPublishedLessons: 0,
    totalCompletedLessons: 0,
    totalPendingLessons: 0,
    overallCourseProgressPercentage: 0,
    attendance: [],
    attendanceTotalCount: 0,
    attendanceMetrics: { present: 0, late: 0, excused: 0, absent: 0, total: 0, percentage: 100 },
    quizAttempts: [],
    quizAttemptsTotalCount: 0,
    averageQuizPercentage: null,
    submissions: [],
    submissionsTotalCount: 0,
    gradedSubmissionsCount: 0,
    pendingSubmissionsCount: 0,
    lastLearningActivityAt: null,
  };

  assert.equal(isStudentActivityEmpty(emptySummary), true);
});
