/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getRiyadhDateString,
  mapAnalyticsDashboard,
  resolveRiyadhDateRange,
  shiftIsoDate,
} from './analyticsService';

test('getRiyadhDateString converts UTC instant accurately to Asia/Riyadh (UTC+3) date across midnight boundary', () => {
  // 2026-11-10T21:30:00Z is 2026-11-11 00:30 AM in Riyadh!
  const instant = new Date('2026-11-10T21:30:00Z');
  assert.equal(getRiyadhDateString(instant), '2026-11-11');

  // 2026-11-10T20:59:59Z is 2026-11-10 23:59:59 in Riyadh
  const beforeMidnight = new Date('2026-11-10T20:59:59Z');
  assert.equal(getRiyadhDateString(beforeMidnight), '2026-11-10');
});

test('resolveRiyadhDateRange computes inclusive calendar ranges cleanly in Riyadh time', () => {
  const ref = new Date('2026-11-14T10:00:00Z'); // 13:00 Riyadh on Nov 14
  assert.deepEqual(resolveRiyadhDateRange('today', undefined, undefined, ref), {
    dateFrom: '2026-11-14',
    dateTo: '2026-11-14',
  });
  assert.deepEqual(resolveRiyadhDateRange('7d', undefined, undefined, ref), {
    dateFrom: '2026-11-08',
    dateTo: '2026-11-14',
  });
  assert.deepEqual(resolveRiyadhDateRange('30d', undefined, undefined, ref), {
    dateFrom: '2026-10-16',
    dateTo: '2026-11-14',
  });
  assert.deepEqual(resolveRiyadhDateRange('all', undefined, undefined, ref), {
    dateFrom: null,
    dateTo: null,
  });
  assert.equal(shiftIsoDate('2026-03-01', -1), '2026-02-28');
});

test('mapAnalyticsDashboard distinguishes NULL unavailable metrics from numeric 0%', () => {
  const mapped = mapAnalyticsDashboard({
    scope: {
      is_super_admin: false,
      attention_score_threshold: 65,
      attention_attendance_threshold: 80,
      timezone: 'Asia/Riyadh',
    },
    kpis: {
      active_students_count: 12,
      total_students_count: 14,
      active_groups_count: 2,
      published_courses_count: 3,
      active_teachers_count: null,
      live_sessions_count: 0,
      attendance_rate_pct: null,
      attendance_records_count: 0,
      avg_quiz_score_pct: 0,
      graded_quiz_attempts_count: 2,
      assignment_completion_rate_pct: null,
      expected_assignment_pairs_count: 0,
      submitted_assignment_pairs_count: 0,
      avg_course_progress_pct: 42.5,
      expected_lesson_completions_count: 40,
      completed_lesson_completions_count: 17,
    },
    student_analytics: { score_distribution: [], top_performers: [], attention_needed: [] },
    group_analytics: [],
    course_analytics: [],
    attendance_analytics: { breakdown: {}, trend_series: [], recent_sessions: [] },
  });

  assert.equal(mapped.kpis.attendanceRatePct, null);
  assert.equal(mapped.kpis.assignmentCompletionRatePct, null);
  assert.equal(mapped.kpis.avgQuizScorePct, 0);
  assert.equal(mapped.kpis.activeTeachersCount, null);
  assert.equal(mapped.scope.attentionScoreThreshold, 65);
  assert.equal(mapped.scope.attentionAttendanceThreshold, 80);
});

test('mapAnalyticsDashboard returns null when group academic_year or course level is missing', () => {
  const mapped = mapAnalyticsDashboard({
    scope: {},
    kpis: {},
    student_analytics: {},
    group_analytics: [{ group_id: 'g-1', name: 'Cohort A', is_active: true }],
    course_analytics: [{ course_id: 'c-1', title: 'Grammar', is_published: true }],
    attendance_analytics: {},
  });

  assert.equal(mapped.groupAnalytics[0].academicYear, null);
  assert.equal(mapped.courseAnalytics[0].level, null);
});
