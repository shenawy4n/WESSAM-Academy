/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AssessmentStatus, QuestionItem, QuestionOption, QuestionType } from './types';

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
 * Normalizes a quiz_attempts.question_snapshot JSONB payload (which may use snake_case
 * keys from PostgreSQL RPCs such as question_id / question_text / option_text or camelCase
 * keys) into typed QuestionItem[] with guaranteed unique IDs and numeric orderIndex sorting.
 */
export function normalizeQuestionSnapshot(rawSnapshot: unknown): QuestionItem[] {
  if (!Array.isArray(rawSnapshot)) return [];

  return rawSnapshot
    .map((item: any, idx: number): QuestionItem => {
      const id = String(item?.id ?? item?.question_id ?? `question_${idx}`);
      const rawOptions = Array.isArray(item?.options) ? item.options : [];

      const options: QuestionOption[] = rawOptions
        .map((opt: any, optIdx: number): QuestionOption => ({
          id: String(opt?.id ?? `${id}_opt_${optIdx}`),
          questionId: opt?.questionId ?? opt?.question_id ?? id,
          optionText: String(opt?.optionText ?? opt?.option_text ?? ''),
          optionTextArabic: opt?.optionTextArabic ?? opt?.option_text_arabic ?? null,
          isCorrect: opt?.isCorrect ?? opt?.is_correct,
          orderIndex: Number(opt?.orderIndex ?? opt?.order_index ?? optIdx + 1),
        }))
        .sort((a: QuestionOption, b: QuestionOption) => a.orderIndex - b.orderIndex);

      return {
        id,
        questionText: String(item?.questionText ?? item?.question_text ?? ''),
        questionTextArabic: item?.questionTextArabic ?? item?.question_text_arabic ?? null,
        questionType: (item?.questionType ?? item?.question_type ?? 'multiple_choice') as QuestionType,
        points: Number(item?.points ?? 1),
        orderIndex: Number(item?.orderIndex ?? item?.order_index ?? idx + 1),
        isRequired: item?.isRequired ?? item?.is_required ?? true,
        options,
      };
    })
    .sort((a: QuestionItem, b: QuestionItem) => a.orderIndex - b.orderIndex);
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
