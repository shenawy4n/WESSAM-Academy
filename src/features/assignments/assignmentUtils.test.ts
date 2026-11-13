/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateAssignmentPayload,
  computeIsSubmissionLate,
  getAssignmentDeadlineStatus,
  validateGradeInput,
  formatFileSize,
  formatAssignmentDateTime,
} from './assignmentUtils';

describe('assignmentUtils', () => {
  describe('validateAssignmentPayload', () => {
    it('rejects missing title, courseId, and dueDate', () => {
      const result = validateAssignmentPayload({});
      assert.equal(result.isValid, false);
      assert.ok(result.errors.some((e) => e.includes('Title is required')));
      assert.ok(result.errors.some((e) => e.includes('Course is required')));
      assert.ok(result.errors.some((e) => e.includes('Due date is required')));
    });

    it('rejects invalid due date', () => {
      const result = validateAssignmentPayload({
        title: 'Homework 1',
        courseId: 'c1',
        dueDate: 'invalid-date',
      });
      assert.equal(result.isValid, false);
      assert.ok(result.errors.some((e) => e.includes('Invalid due date format')));
    });

    it('rejects negative maxScore or invalid attempts', () => {
      const result = validateAssignmentPayload({
        title: 'Homework 1',
        courseId: 'c1',
        dueDate: '2026-12-01T20:00:00Z',
        maxScore: -5,
        maxAttempts: 0,
        gracePeriodMinutes: -10,
        latePenaltyPercentage: 150,
      });
      assert.equal(result.isValid, false);
      assert.ok(result.errors.some((e) => e.includes('Max score must be greater than zero')));
      assert.ok(result.errors.some((e) => e.includes('Max attempts must be at least 1')));
      assert.ok(result.errors.some((e) => e.includes('Grace period cannot be negative')));
      assert.ok(result.errors.some((e) => e.includes('Late penalty must be between 0% and 100%')));
    });

    it('accepts valid payload', () => {
      const result = validateAssignmentPayload({
        title: 'Essay on Climate',
        titleArabic: 'مقال عن المناخ',
        courseId: '00000000-0000-0000-0000-000000000001',
        dueDate: '2026-12-01T20:00:00Z',
        maxScore: 100,
        maxAttempts: 2,
        gracePeriodMinutes: 15,
        latePenaltyPercentage: 10,
      });
      assert.equal(result.isValid, true);
      assert.equal(result.errors.length, 0);
    });
  });

  describe('computeIsSubmissionLate', () => {
    const dueDate = '2026-11-15T18:00:00.000Z';

    it('marks submission on time when before due date', () => {
      const subDate = '2026-11-15T17:59:00.000Z';
      assert.equal(computeIsSubmissionLate(subDate, dueDate, 0), false);
    });

    it('marks submission on time within grace period', () => {
      // 10 minutes past due date, but grace period is 15 minutes
      const subDate = '2026-11-15T18:10:00.000Z';
      assert.equal(computeIsSubmissionLate(subDate, dueDate, 15), false);
    });

    it('marks submission late when past due date and grace period', () => {
      // 16 minutes past due date with 15 minutes grace period
      const subDate = '2026-11-15T18:16:00.000Z';
      assert.equal(computeIsSubmissionLate(subDate, dueDate, 15), true);
    });
  });

  describe('getAssignmentDeadlineStatus', () => {
    it('indicates closed when past cutoff date', () => {
      const pastCutoff = new Date(Date.now() - 3600000).toISOString();
      const pastDue = new Date(Date.now() - 7200000).toISOString();
      const status = getAssignmentDeadlineStatus(pastDue, pastCutoff, true);
      assert.equal(status.isPastCutoff, true);
      assert.ok(status.labelAr.includes('مغلق'));
    });

    it('indicates late when past due but before cutoff', () => {
      const pastDue = new Date(Date.now() - 3600000).toISOString();
      const futureCutoff = new Date(Date.now() + 3600000).toISOString();
      const status = getAssignmentDeadlineStatus(pastDue, futureCutoff, true);
      assert.equal(status.isPastDue, true);
      assert.equal(status.isPastCutoff, false);
      assert.ok(status.labelAr.includes('متأخر'));
    });

    it('indicates time remaining when before due date', () => {
      const futureDue = new Date(Date.now() + 48 * 3600000).toISOString();
      const status = getAssignmentDeadlineStatus(futureDue, null, true);
      assert.equal(status.isPastDue, false);
      assert.ok(status.labelAr.includes('متبقي'));
    });
  });

  describe('validateGradeInput', () => {
    it('validates score range correctly', () => {
      assert.equal(validateGradeInput(85, 100).isValid, true);
      assert.equal(validateGradeInput(-1, 100).isValid, false);
      assert.equal(validateGradeInput(105, 100).isValid, false);
      assert.equal(validateGradeInput(NaN, 100).isValid, false);
    });
  });

  describe('formatFileSize', () => {
    it('formats bytes into readable human units', () => {
      assert.equal(formatFileSize(0), '0 B');
      assert.equal(formatFileSize(1024), '1 KB');
      assert.equal(formatFileSize(1024 * 1024 * 2.5), '2.5 MB');
    });
  });

  describe('formatAssignmentDateTime', () => {
    it('includes Asia/Riyadh / توقيت مكة المكرمة label', () => {
      const formatted = formatAssignmentDateTime('2026-11-15T18:00:00.000Z');
      assert.ok(formatted.includes('توقيت مكة المكرمة'));
    });

    it('handles empty input gracefully', () => {
      assert.equal(formatAssignmentDateTime(null), '—');
    });
  });
});
