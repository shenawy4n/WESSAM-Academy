/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  requireSupabaseClient,
  throwServiceError,
  ServiceError,
} from '../../lib/errors/serviceError';
import {
  QuestionBankItem,
  QuestionOptionItem,
  QuestionBankStats,
  QuestionType,
  DifficultyLevel,
} from './types';

export interface CreateQuestionPayload {
  question_text: string;
  question_text_arabic?: string | null;
  question_type: QuestionType;
  difficulty: DifficultyLevel;
  points: number;
  explanation?: string | null;
  course_id?: string | null;
  unit_id?: string | null;
  lesson_id?: string | null;
  topic?: string | null;
  tags?: string[];
  time_limit_seconds?: number | null;
  metadata?: Record<string, any>;
  options?: QuestionOptionItem[];
}

export interface UpdateQuestionPayload extends CreateQuestionPayload {
  id: string;
}

const SERVICE = 'questionBankService';

function normalizeDifficulty(diff: string | null | undefined): DifficultyLevel {
  if (!diff) return 'medium';
  const lower = diff.toLowerCase();
  if (lower === 'easy') return 'easy';
  if (lower === 'hard' || lower === 'advanced') return 'hard';
  return 'medium';
}

function toDbDifficulty(diff: DifficultyLevel): string {
  if (diff === 'medium') return 'intermediate';
  if (diff === 'hard') return 'advanced';
  return 'easy';
}

/**
 * Fetch all question bank items accessible to the current user.
 * Strictly queries the backend without mock fallbacks.
 * Returns empty array [] if no questions exist.
 */
export async function fetchQuestionBankItems(includeArchived = false): Promise<QuestionBankItem[]> {
  const client = requireSupabaseClient({
    service: SERVICE,
    operation: 'fetchQuestionBankItems',
  });

  let query = client
    .from('question_bank')
    .select(`
      *,
      course:courses(id, title, title_arabic),
      options:question_options(*)
    `)
    .order('created_at', { ascending: false });

  if (!includeArchived) {
    query = query.eq('is_active', true);
  }

  let res;
  try {
    res = await query;
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'fetchQuestionBankItems' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'fetchQuestionBankItems',
      fallbackMessage: 'Failed to fetch question bank items',
    });
  }

  const data = res.data || [];
  if (data.length === 0) {
    return [];
  }

  return data.map((item: any) => ({
    ...item,
    difficulty: normalizeDifficulty(item.difficulty_level || item.difficulty),
    options: (item.options || []).sort(
      (a: QuestionOptionItem, b: QuestionOptionItem) => (a.order_index ?? 0) - (b.order_index ?? 0)
    ),
  }));
}

/**
 * Fetch aggregated statistics for question bank via RPC.
 */
export async function fetchQuestionBankStats(): Promise<QuestionBankStats> {
  const client = requireSupabaseClient({
    service: SERVICE,
    operation: 'fetchQuestionBankStats',
  });

  let res;
  try {
    res = await client.rpc('get_question_bank_stats');
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'fetchQuestionBankStats' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'fetchQuestionBankStats',
      fallbackMessage: 'Failed to fetch question bank statistics',
    });
  }

  const raw = res.data || {};
  const by_type: Record<QuestionType, number> = {
    multiple_choice: 0,
    multiple_select: 0,
    true_false: 0,
    short_answer: 0,
    essay: 0,
    fill_in_the_blank: 0,
    matching: 0,
    ...(raw.by_type || {}),
  };

  const rawByDiff = raw.by_difficulty || {};
  const by_difficulty: Record<DifficultyLevel, number> = {
    easy: Number(rawByDiff.easy || 0),
    medium: Number(rawByDiff.intermediate || rawByDiff.medium || 0),
    hard: Number(rawByDiff.advanced || rawByDiff.hard || 0),
  };

  return {
    total: Number(raw.total_questions ?? raw.total ?? 0),
    active: Number(raw.active_questions ?? raw.active ?? 0),
    archived: Number(raw.archived_questions ?? raw.archived ?? 0),
    by_type,
    by_difficulty,
  };
}

/**
 * Create a new question with its options atomically via RPC.
 */
export async function createQuestionBankItem(payload: CreateQuestionPayload): Promise<string> {
  const client = requireSupabaseClient({
    service: SERVICE,
    operation: 'createQuestionBankItem',
  });

  const questionPayload = {
    question_text: payload.question_text.trim(),
    question_text_arabic: payload.question_text_arabic?.trim() || null,
    question_type: payload.question_type,
    difficulty_level: toDbDifficulty(payload.difficulty),
    points: Math.max(1, payload.points || 1),
    explanation: payload.explanation?.trim() || null,
    course_id: payload.course_id || null,
    unit_id: payload.unit_id || null,
    lesson_id: payload.lesson_id || null,
    topic: payload.topic?.trim() || null,
    tags: payload.tags || [],
    time_limit_seconds: payload.time_limit_seconds || null,
    metadata: payload.metadata || {},
  };

  const optionsPayload = (payload.options || []).map((opt, idx) => ({
    option_text: opt.option_text.trim(),
    option_text_arabic: opt.option_text_arabic?.trim() || null,
    is_correct: Boolean(opt.is_correct),
    order_index: opt.order_index !== undefined ? opt.order_index : idx,
    explanation: opt.explanation?.trim() || null,
    target_match_text: opt.target_match_text?.trim() || null,
    target_match_arabic: opt.target_match_arabic?.trim() || null,
    metadata: opt.metadata || {},
  }));

  let res;
  try {
    res = await client.rpc('create_question_bank_item', {
      p_question: questionPayload,
      p_options: optionsPayload,
    });
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'createQuestionBankItem' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'createQuestionBankItem',
      fallbackMessage: 'Failed to create question',
    });
  }

  if (!res.data || !res.data.id) {
    throw new ServiceError({
      category: 'DATABASE_ERROR',
      message: 'Failed to create question: Server returned empty response.',
      service: SERVICE,
      operation: 'createQuestionBankItem',
    });
  }

  return res.data.id as string;
}

/**
 * Update an existing question and its options atomically via RPC.
 */
export async function updateQuestionBankItem(payload: UpdateQuestionPayload): Promise<void> {
  const client = requireSupabaseClient({
    service: SERVICE,
    operation: 'updateQuestionBankItem',
  });

  const questionPayload = {
    question_text: payload.question_text.trim(),
    question_text_arabic: payload.question_text_arabic?.trim() || null,
    question_type: payload.question_type,
    difficulty_level: toDbDifficulty(payload.difficulty),
    points: Math.max(1, payload.points || 1),
    explanation: payload.explanation?.trim() || null,
    course_id: payload.course_id || null,
    unit_id: payload.unit_id || null,
    lesson_id: payload.lesson_id || null,
    topic: payload.topic?.trim() || null,
    tags: payload.tags || [],
    time_limit_seconds: payload.time_limit_seconds || null,
    metadata: payload.metadata || {},
  };

  const optionsPayload = (payload.options || []).map((opt, idx) => ({
    option_text: opt.option_text.trim(),
    option_text_arabic: opt.option_text_arabic?.trim() || null,
    is_correct: Boolean(opt.is_correct),
    order_index: opt.order_index !== undefined ? opt.order_index : idx,
    explanation: opt.explanation?.trim() || null,
    target_match_text: opt.target_match_text?.trim() || null,
    target_match_arabic: opt.target_match_arabic?.trim() || null,
    metadata: opt.metadata || {},
  }));

  let res;
  try {
    res = await client.rpc('update_question_bank_item', {
      p_question_id: payload.id,
      p_question: questionPayload,
      p_options: optionsPayload,
    });
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'updateQuestionBankItem' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'updateQuestionBankItem',
      fallbackMessage: 'Failed to update question',
    });
  }
}

/**
 * Duplicate a question item creating an independent copy with (Copy) title via RPC.
 */
export async function duplicateQuestionBankItem(questionId: string): Promise<string> {
  const client = requireSupabaseClient({
    service: SERVICE,
    operation: 'duplicateQuestionBankItem',
  });

  let res;
  try {
    res = await client.rpc('duplicate_question_bank_item', {
      p_question_id: questionId,
    });
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'duplicateQuestionBankItem' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'duplicateQuestionBankItem',
      fallbackMessage: 'Failed to duplicate question',
    });
  }

  const newId = res.data?.new_question_id;
  if (!newId) {
    throw new ServiceError({
      category: 'DATABASE_ERROR',
      message: 'Server did not return the new question identifier.',
      service: SERVICE,
      operation: 'duplicateQuestionBankItem',
    });
  }

  return newId as string;
}

/**
 * Bulk archive question items via RPC.
 */
export async function archiveQuestionBankItems(questionIds: string[]): Promise<number> {
  if (questionIds.length === 0) return 0;
  const client = requireSupabaseClient({
    service: SERVICE,
    operation: 'archiveQuestionBankItems',
  });

  let res;
  try {
    res = await client.rpc('archive_question_bank_items', {
      p_question_ids: questionIds,
    });
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'archiveQuestionBankItems' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'archiveQuestionBankItems',
      fallbackMessage: 'Failed to archive question items',
    });
  }

  return Number(res.data?.archived_count ?? 0);
}

/**
 * Bulk restore question items via RPC.
 */
export async function restoreQuestionBankItems(questionIds: string[]): Promise<number> {
  if (questionIds.length === 0) return 0;
  const client = requireSupabaseClient({
    service: SERVICE,
    operation: 'restoreQuestionBankItems',
  });

  let res;
  try {
    res = await client.rpc('restore_question_bank_items', {
      p_question_ids: questionIds,
    });
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'restoreQuestionBankItems' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'restoreQuestionBankItems',
      fallbackMessage: 'Failed to restore question items',
    });
  }

  return Number(res.data?.restored_count ?? 0);
}

/**
 * Import a validated list of questions atomically using the import_question_bank_items RPC.
 * Rolls back completely if any row fails validation or insertion.
 */
export async function importQuestions(
  parsedRows: { item: Partial<QuestionBankItem>; options: QuestionOptionItem[] }[]
): Promise<{ successCount: number; errors: string[] }> {
  if (parsedRows.length === 0) {
    return { successCount: 0, errors: [] };
  }

  const client = requireSupabaseClient({
    service: SERVICE,
    operation: 'importQuestions',
  });

  const itemsPayload = parsedRows.map((row) => ({
    question: {
      question_text: row.item.question_text?.trim() || '',
      question_text_arabic: row.item.question_text_arabic?.trim() || null,
      question_type: row.item.question_type || 'multiple_choice',
      difficulty_level: toDbDifficulty(row.item.difficulty || 'medium'),
      points: Math.max(1, Number(row.item.points) || 1),
      explanation: row.item.explanation?.trim() || null,
      course_id: row.item.course_id || null,
      unit_id: row.item.unit_id || null,
      lesson_id: row.item.lesson_id || null,
      topic: row.item.topic?.trim() || null,
      tags: row.item.tags || [],
      time_limit_seconds: row.item.time_limit_seconds || null,
    },
    options: (row.options || []).map((opt, idx) => ({
      option_text: opt.option_text.trim(),
      option_text_arabic: opt.option_text_arabic?.trim() || null,
      is_correct: Boolean(opt.is_correct),
      order_index: opt.order_index !== undefined ? opt.order_index : idx,
      target_match_text: opt.target_match_text?.trim() || null,
      target_match_arabic: opt.target_match_arabic?.trim() || null,
    })),
  }));

  let res;
  try {
    res = await client.rpc('import_question_bank_items', {
      p_items: itemsPayload,
    });
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'importQuestions' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'importQuestions',
      fallbackMessage: 'Failed to import questions',
    });
  }

  return {
    successCount: Number(res.data?.imported_count ?? itemsPayload.length),
    errors: [],
  };
}

/**
 * Add bank questions to a quiz with recalculation of quiz total points via RPC.
 */
export async function addBankQuestionsToQuiz(
  quizId: string,
  questionIds: string[],
  defaultPoints = 5
): Promise<number> {
  if (questionIds.length === 0) return 0;
  const client = requireSupabaseClient({
    service: SERVICE,
    operation: 'addBankQuestionsToQuiz',
  });

  let res;
  try {
    res = await client.rpc('add_bank_questions_to_quiz', {
      p_quiz_id: quizId,
      p_question_ids: questionIds,
      p_default_points: defaultPoints,
    });
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'addBankQuestionsToQuiz' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'addBankQuestionsToQuiz',
      fallbackMessage: 'Failed to add bank questions to quiz',
    });
  }

  return Number(res.data?.added_count ?? 0);
}
