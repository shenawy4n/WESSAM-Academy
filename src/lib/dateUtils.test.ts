/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatRiyadhDate,
  formatRiyadhTime,
  riyadhToUtcIso,
  utcToRiyadhInputs,
  calculateAttendanceMetrics,
} from './dateUtils';

test('dateUtils - Conversion of Riyadh local time to UTC ISO 8601', () => {
  // Saudi Arabia is UTC+3. Therefore, 20:30 in Riyadh is 17:30 UTC.
  const utcIso = riyadhToUtcIso('2026-11-08', '20:30');
  assert.equal(utcIso, '2026-11-08T17:30:00.000Z');

  // Morning session: 09:15 in Riyadh is 06:15 UTC.
  const morningIso = riyadhToUtcIso('2026-12-01', '09:15');
  assert.equal(morningIso, '2026-12-01T06:15:00.000Z');
});

test('dateUtils - Conversion of UTC ISO to Riyadh input components', () => {
  // 17:30 UTC corresponds to 20:30 in Riyadh
  const parts = utcToRiyadhInputs('2026-11-08T17:30:00.000Z');
  assert.equal(parts.date, '2026-11-08');
  assert.equal(parts.time, '20:30');
});

test('dateUtils - Localized Formatting in Asia/Riyadh', () => {
  const utcIso = '2026-11-08T17:30:00.000Z';
  const englishTime = formatRiyadhTime(utcIso, 'en');
  // Should display 8:30 PM in English
  assert.match(englishTime, /8:30/);
  assert.match(englishTime, /PM/i);

  const englishDate = formatRiyadhDate(utcIso, 'en');
  assert.match(englishDate, /Nov/i);
  assert.match(englishDate, /2026/);
});

test('dateUtils - Attendance Metric Calculations', () => {
  // Mixed records: 3 present, 1 late, 1 excused, 1 absent
  const sampleRecords = [
    { status: 'present' },
    { status: 'present' },
    { status: 'present' },
    { status: 'late' },
    { status: 'excused' },
    { status: 'absent' },
  ];

  const stats = calculateAttendanceMetrics(sampleRecords);
  assert.equal(stats.present, 3);
  assert.equal(stats.late, 1);
  assert.equal(stats.excused, 1);
  assert.equal(stats.absent, 1);
  assert.equal(stats.total, 6);
  // Countable: 3 present + 1 late + 1 absent = 5. Positive: 4 (present + late).
  // 4 / 5 = 80%
  assert.equal(stats.percentage, 80);
});

test('dateUtils - Attendance Metric with zero or only excused sessions', () => {
  const emptyStats = calculateAttendanceMetrics([]);
  assert.equal(emptyStats.percentage, 100);
  assert.equal(emptyStats.total, 0);

  const excusedOnly = calculateAttendanceMetrics([{ status: 'excused' }, { status: 'excused' }]);
  assert.equal(excusedOnly.percentage, 100);
  assert.equal(excusedOnly.total, 2);
  assert.equal(excusedOnly.excused, 2);
});
