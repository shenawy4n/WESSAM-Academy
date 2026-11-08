/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AssessmentStatus, QuestionType } from './types';

export interface ObjectiveGradingInput {
  questionType: QuestionType;
  points: number;
  selectedOptionId?: string | null;
  correctOptionId?: string | null;
}

export interface ObjectiveGradingResult {
  isCorrect: boolean | null;
  pointsAwarded: number;
  needsReview: boolean;
}

/**
 * Evaluates an objective question answer.
 * For multiple-choice & true/false: returns exact boolean and awarded points.
 * For short-answer: returns needsReview = true and 0 points until teacher grades.
 */
export function evaluateObjectiveAnswer(input: ObjectiveGradingInput): ObjectiveGradingResult {
  if (input.questionType === 'short_answer') {
    return {
      isCorrect: null,
      pointsAwarded: 0,
      needsReview: true,
    };
  }

  if (!input.selectedOptionId) {
    return {
      isCorrect: false,
      pointsAwarded: 0,
      needsReview: false,
    };
  }

  const isCorrect = input.selectedOptionId === input.correctOptionId;
  return {
    isCorrect,
    pointsAwarded: isCorrect ? input.points : 0,
    needsReview: false,
  };
}

/**
 * Calculates score percentage and pass/fail verdict.
 */
export function calculateQuizScoreSummary(
  scoredPoints: number,
  totalPossiblePoints: number,
  passingScorePercentage: number
): { percentage: number; isPassed: boolean } {
  if (totalPossiblePoints <= 0) {
    return { percentage: 100, isPassed: true };
  }
  const percentage = Math.round((scoredPoints / totalPossiblePoints) * 10000) / 100;
  return {
    percentage,
    isPassed: percentage >= passingScorePercentage,
  };
}

/**
 * Computes remaining timer seconds from an authoritative server ISO expiration string.
 * Negative or zero values indicate expired.
 */
export function calculateRemainingSeconds(expiresAtIso: string, currentTimestampMs: number = Date.now()): number {
  const expiresAtMs = new Date(expiresAtIso).getTime();
  if (isNaN(expiresAtMs)) return 0;
  const diffSec = Math.floor((expiresAtMs - currentTimestampMs) / 1000);
  return Math.max(0, diffSec);
}

/**
 * Formats seconds into MM:SS or HH:MM:SS string.
 */
export function formatTimerDisplay(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Determines the student assessment state according to publishing, date window,
 * attempt limits, and active attempts.
 */
export function resolveAssessmentStatus(params: {
  isPublished: boolean;
  isArchived: boolean;
  startDate?: string | null;
  endDate?: string | null;
  maxAttempts: number;
  userAttemptsCount: number;
  activeAttemptExpiresAt?: string | null;
  currentTimestampMs?: number;
}): AssessmentStatus {
  const now = params.currentTimestampMs ?? Date.now();

  if (params.isArchived) return 'archived';
  if (!params.isPublished) return 'draft';

  // Active in-progress attempt takes highest precedence
  if (params.activeAttemptExpiresAt) {
    const expiresMs = new Date(params.activeAttemptExpiresAt).getTime();
    if (expiresMs > now) {
      return 'in_progress';
    }
  }

  // If completed and reached attempt limit
  if (params.userAttemptsCount >= params.maxAttempts) {
    return 'completed';
  }

  // Check upcoming window
  if (params.startDate) {
    const startMs = new Date(params.startDate).getTime();
    if (startMs > now) {
      return 'upcoming';
    }
  }

  // Check deadline window
  if (params.endDate) {
    const endMs = new Date(params.endDate).getTime();
    if (endMs < now) {
      return 'completed'; // Deadline closed
    }
  }

  return 'available';
}
