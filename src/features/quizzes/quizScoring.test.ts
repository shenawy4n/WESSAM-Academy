/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateObjectiveAnswer,
  calculateQuizScoreSummary,
  calculateRemainingSeconds,
  formatTimerDisplay,
  resolveAssessmentStatus,
} from './quizScoring';

describe('quizScoring - Objective Answer Evaluation', () => {
  it('correctly grades matching multiple-choice answer', () => {
    const res = evaluateObjectiveAnswer({
      questionType: 'multiple_choice',
      points: 5,
      selectedOptionId: 'opt-123',
      correctOptionId: 'opt-123',
    });
    assert.equal(res.isCorrect, true);
    assert.equal(res.pointsAwarded, 5);
    assert.equal(res.needsReview, false);
  });

  it('correctly grades incorrect multiple-choice answer', () => {
    const res = evaluateObjectiveAnswer({
      questionType: 'multiple_choice',
      points: 5,
      selectedOptionId: 'opt-wrong',
      correctOptionId: 'opt-123',
    });
    assert.equal(res.isCorrect, false);
    assert.equal(res.pointsAwarded, 0);
    assert.equal(res.needsReview, false);
  });

  it('correctly grades unanswered objective question as 0 points', () => {
    const res = evaluateObjectiveAnswer({
      questionType: 'true_false',
      points: 2,
      selectedOptionId: null,
      correctOptionId: 'opt-true',
    });
    assert.equal(res.isCorrect, false);
    assert.equal(res.pointsAwarded, 0);
    assert.equal(res.needsReview, false);
  });

  it('flags short-answer questions as needsReview with 0 provisional points', () => {
    const res = evaluateObjectiveAnswer({
      questionType: 'short_answer',
      points: 10,
      selectedOptionId: null,
      correctOptionId: null,
    });
    assert.equal(res.isCorrect, null);
    assert.equal(res.pointsAwarded, 0);
    assert.equal(res.needsReview, true);
  });
});

describe('quizScoring - Score Summary & Pass/Fail', () => {
  it('computes exact percentage and pass status for 80% with 60% threshold', () => {
    const summary = calculateQuizScoreSummary(16, 20, 60);
    assert.equal(summary.percentage, 80);
    assert.equal(summary.isPassed, true);
  });

  it('computes fail status when percentage is below passing threshold', () => {
    const summary = calculateQuizScoreSummary(11, 20, 60);
    assert.equal(summary.percentage, 55);
    assert.equal(summary.isPassed, false);
  });

  it('handles edge case of 0 total points gracefully', () => {
    const summary = calculateQuizScoreSummary(0, 0, 60);
    assert.equal(summary.percentage, 100);
    assert.equal(summary.isPassed, true);
  });
});

describe('quizScoring - Server Countdown Timer', () => {
  it('computes remaining seconds accurately from server ISO expiration', () => {
    const nowMs = 1700000000000;
    const expiresAtIso = new Date(nowMs + 125000).toISOString();
    const remaining = calculateRemainingSeconds(expiresAtIso, nowMs);
    assert.equal(remaining, 125);
  });

  it('returns 0 when expiration has passed', () => {
    const nowMs = 1700000000000;
    const expiresAtIso = new Date(nowMs - 5000).toISOString();
    const remaining = calculateRemainingSeconds(expiresAtIso, nowMs);
    assert.equal(remaining, 0);
  });

  it('formats MM:SS correctly for under one hour', () => {
    assert.equal(formatTimerDisplay(125), '02:05');
    assert.equal(formatTimerDisplay(59), '00:59');
    assert.equal(formatTimerDisplay(0), '00:00');
  });

  it('formats HH:MM:SS correctly for over one hour', () => {
    assert.equal(formatTimerDisplay(3665), '01:01:05');
  });
});

describe('quizScoring - Assessment Status Resolution', () => {
  const fixedNow = 1700000000000;

  it('resolves to archived when isArchived is true', () => {
    const status = resolveAssessmentStatus({
      isPublished: true,
      isArchived: true,
      maxAttempts: 2,
      userAttemptsCount: 0,
      currentTimestampMs: fixedNow,
    });
    assert.equal(status, 'archived');
  });

  it('resolves to draft when isPublished is false', () => {
    const status = resolveAssessmentStatus({
      isPublished: false,
      isArchived: false,
      maxAttempts: 2,
      userAttemptsCount: 0,
      currentTimestampMs: fixedNow,
    });
    assert.equal(status, 'draft');
  });

  it('resolves to in_progress when active attempt has unexpired timer', () => {
    const status = resolveAssessmentStatus({
      isPublished: true,
      isArchived: false,
      maxAttempts: 2,
      userAttemptsCount: 0,
      activeAttemptExpiresAt: new Date(fixedNow + 60000).toISOString(),
      currentTimestampMs: fixedNow,
    });
    assert.equal(status, 'in_progress');
  });

  it('resolves to upcoming when start date is in the future', () => {
    const status = resolveAssessmentStatus({
      isPublished: true,
      isArchived: false,
      startDate: new Date(fixedNow + 3600000).toISOString(),
      maxAttempts: 2,
      userAttemptsCount: 0,
      currentTimestampMs: fixedNow,
    });
    assert.equal(status, 'upcoming');
  });

  it('resolves to completed when student attempts reach maxAttempts', () => {
    const status = resolveAssessmentStatus({
      isPublished: true,
      isArchived: false,
      maxAttempts: 1,
      userAttemptsCount: 1,
      currentTimestampMs: fixedNow,
    });
    assert.equal(status, 'completed');
  });

  it('resolves to available when within window and attempts remaining', () => {
    const status = resolveAssessmentStatus({
      isPublished: true,
      isArchived: false,
      startDate: new Date(fixedNow - 3600000).toISOString(),
      endDate: new Date(fixedNow + 86400000).toISOString(),
      maxAttempts: 3,
      userAttemptsCount: 1,
      currentTimestampMs: fixedNow,
    });
    assert.equal(status, 'available');
  });
});
