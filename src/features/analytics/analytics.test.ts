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
import { ServiceError } from '../../lib/errors/serviceError';

function createValidRawAnalyticsPayload() {
  return {
    scope: {
      is_super_admin: false,
      date_from: null,
      date_to: null,
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
    student_analytics: {
      score_distribution: [],
      top_performers: [],
      attention_needed: [],
    },
    group_analytics: [],
    course_analytics: [],
    attendance_analytics: {
      breakdown: {
        present: 0,
        late: 0,
        excused: 0,
        absent: 0,
        total_records: 0,
        countable_records: 0,
      },
      trend_series: [],
      recent_sessions: [],
    },
  };
}

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

test('mapAnalyticsDashboard preserves genuine 0 values and NULL unavailable metrics distinctly', () => {
  const mapped = mapAnalyticsDashboard(createValidRawAnalyticsPayload());

  assert.equal(mapped.kpis.attendanceRatePct, null);
  assert.equal(mapped.kpis.assignmentCompletionRatePct, null);
  assert.equal(mapped.kpis.avgQuizScorePct, 0);
  assert.equal(mapped.kpis.liveSessionsCount, 0);
  assert.equal(mapped.kpis.activeTeachersCount, null);
  assert.equal(mapped.attendanceAnalytics.breakdown.present, 0);
  assert.equal(mapped.scope.attentionScoreThreshold, 65);
  assert.equal(mapped.scope.attentionAttendanceThreshold, 80);
});

test('mapAnalyticsDashboard preserves null for omitted group academic_year, course level, or NULL thresholds without inventing defaults', () => {
  const payload: any = createValidRawAnalyticsPayload();
  payload.scope.attention_score_threshold = null;
  payload.scope.attention_attendance_threshold = null;
  payload.group_analytics = [
    {
      group_id: 'g-1',
      name: 'Cohort A',
      is_active: true,
      active_students_count: 0,
      attendance_rate_pct: null,
      avg_quiz_score_pct: 0,
      avg_course_progress_pct: null,
    },
  ];
  payload.course_analytics = [
    {
      course_id: 'c-1',
      title: 'Grammar',
      is_published: true,
      published_lessons_count: 0,
      enrolled_students_count: 0,
      avg_completion_pct: null,
      avg_quiz_score_pct: null,
      published_assignments_count: 0,
    },
  ];

  const mapped = mapAnalyticsDashboard(payload);

  assert.equal(mapped.scope.attentionScoreThreshold, null);
  assert.equal(mapped.scope.attentionAttendanceThreshold, null);
  assert.equal(mapped.groupAnalytics[0].academicYear, null);
  assert.equal(mapped.groupAnalytics[0].activeStudentsCount, 0);
  assert.equal(mapped.groupAnalytics[0].avgQuizScorePct, 0);
  assert.equal(mapped.groupAnalytics[0].attendanceRatePct, null);
  assert.equal(mapped.courseAnalytics[0].level, null);
  assert.equal(mapped.courseAnalytics[0].publishedLessonsCount, 0);
});

test('mapAnalyticsDashboard throws ServiceError on missing properties, NULL required counts, or malformed values', () => {
  assert.throws(
    () => mapAnalyticsDashboard({}),
    (err: unknown) => err instanceof ServiceError && err.code === 'INVALID_ANALYTICS_CONTRACT'
  );

  const missingKpiCount: any = createValidRawAnalyticsPayload();
  delete missingKpiCount.kpis.active_students_count;
  assert.throws(
    () => mapAnalyticsDashboard(missingKpiCount),
    (err: unknown) => err instanceof ServiceError && /active_students_count/.test(err.message)
  );

  const nullRequiredCount: any = createValidRawAnalyticsPayload();
  nullRequiredCount.kpis.published_courses_count = null;
  assert.throws(
    () => mapAnalyticsDashboard(nullRequiredCount),
    (err: unknown) => err instanceof ServiceError && /published_courses_count/.test(err.message)
  );

  const missingThresholdKey: any = createValidRawAnalyticsPayload();
  delete missingThresholdKey.scope.attention_score_threshold;
  assert.throws(
    () => mapAnalyticsDashboard(missingThresholdKey),
    (err: unknown) => err instanceof ServiceError && /attention_score_threshold/.test(err.message)
  );

  const malformedRate: any = createValidRawAnalyticsPayload();
  malformedRate.kpis.avg_quiz_score_pct = 'not-a-number';
  assert.throws(
    () => mapAnalyticsDashboard(malformedRate),
    (err: unknown) => err instanceof ServiceError && /avg_quiz_score_pct/.test(err.message)
  );

  const malformedBoolean: any = createValidRawAnalyticsPayload();
  malformedBoolean.scope.is_super_admin = undefined;
  assert.throws(
    () => mapAnalyticsDashboard(malformedBoolean),
    (err: unknown) => err instanceof ServiceError && /is_super_admin/.test(err.message)
  );
});
