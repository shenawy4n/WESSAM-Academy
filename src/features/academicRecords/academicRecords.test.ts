/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUnifiedTranscript,
  filterAndSortTranscript,
  mapRawAcademicRecord,
  paginateArray,
} from './academicRecordsService';

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
  assert.equal(transcript[0].id, 'assignment-sub-1'); // Nov 12
  assert.equal(transcript[1].id, 'quiz-qa-2'); // Nov 11
  assert.equal(transcript[2].id, 'quiz-qa-1'); // Nov 5
  assert.equal(transcript[3].id, 'attendance-att-1'); // Nov 3

  // Unreleased assignment does NOT fabricate 0% or pass/fail
  assert.equal(transcript[0].percentageScore, null);
  assert.equal(transcript[0].isPassed, null);
  // Released graded quiz preserves passing threshold & score
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
