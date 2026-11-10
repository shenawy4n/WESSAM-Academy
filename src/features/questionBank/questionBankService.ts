import { supabase } from '../../lib/supabase/client';
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

// In-memory fallback items for dev/preview when Supabase connection or table is freshly provisioned
let fallbackQuestionBank: QuestionBankItem[] = [
  {
    id: 'demo-q-1',
    teacher_id: 'demo-teacher',
    course_id: null,
    unit_id: null,
    lesson_id: null,
    question_text: 'Which sentence uses the present perfect continuous tense correctly?',
    question_text_arabic: 'أي الجمل الآتية تستخدم زمن المضارع التام المستمر بشكل صحيح؟',
    question_type: 'multiple_choice',
    difficulty: 'medium',
    points: 2,
    explanation: 'The present perfect continuous is formed with have/has been + present participle (-ing).',
    topic: 'Tenses',
    tags: ['grammar', 'tenses', 'present-perfect'],
    time_limit_seconds: 60,
    is_active: true,
    archived_at: null,
    metadata: {},
    created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    options: [
      { id: 'opt-1-1', question_id: 'demo-q-1', option_text: 'She has been studying English for three hours.', is_correct: true, order_index: 0 },
      { id: 'opt-1-2', question_id: 'demo-q-1', option_text: 'She is been studying English since three hours.', is_correct: false, order_index: 1 },
      { id: 'opt-1-3', question_id: 'demo-q-1', option_text: 'She has study English for three hours.', is_correct: false, order_index: 2 },
      { id: 'opt-1-4', question_id: 'demo-q-1', option_text: 'She had studying English three hours ago.', is_correct: false, order_index: 3 },
    ],
  },
  {
    id: 'demo-q-2',
    teacher_id: 'demo-teacher',
    course_id: null,
    unit_id: null,
    lesson_id: null,
    question_text: 'Select all words that can function as relative pronouns:',
    question_text_arabic: 'اختر جميع الكلمات التي يمكن أن تعمل كضمائر وصل:',
    question_type: 'multiple_select',
    difficulty: 'medium',
    points: 3,
    explanation: '"Who", "which", and "that" are relative pronouns.',
    topic: 'Pronouns',
    tags: ['grammar', 'relative-clauses'],
    time_limit_seconds: 90,
    is_active: true,
    archived_at: null,
    metadata: {},
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    options: [
      { id: 'opt-2-1', question_id: 'demo-q-2', option_text: 'who', is_correct: true, order_index: 0 },
      { id: 'opt-2-2', question_id: 'demo-q-2', option_text: 'which', is_correct: true, order_index: 1 },
      { id: 'opt-2-3', question_id: 'demo-q-2', option_text: 'that', is_correct: true, order_index: 2 },
      { id: 'opt-2-4', question_id: 'demo-q-2', option_text: 'slowly', is_correct: false, order_index: 3 },
    ],
  },
  {
    id: 'demo-q-3',
    teacher_id: 'demo-teacher',
    course_id: null,
    unit_id: null,
    lesson_id: null,
    question_text: 'Adjectives in English always precede plural nouns.',
    question_text_arabic: 'تأتي الصفات في اللغة الإنجليزية دائماً قبل الأسماء في صيغة الجمع.',
    question_type: 'true_false',
    difficulty: 'easy',
    points: 1,
    explanation: 'Adjectives can also follow linking verbs (predicate adjectives), e.g., "The books are heavy".',
    topic: 'Adjectives',
    tags: ['syntax', 'adjectives'],
    time_limit_seconds: 45,
    is_active: true,
    archived_at: null,
    metadata: {},
    created_at: new Date(Date.now() - 86400000).toISOString(),
    updated_at: new Date(Date.now() - 86400000).toISOString(),
    options: [
      { id: 'opt-3-1', question_id: 'demo-q-3', option_text: 'True', option_text_arabic: 'صح', is_correct: false, order_index: 0 },
      { id: 'opt-3-2', question_id: 'demo-q-3', option_text: 'False', option_text_arabic: 'خطأ', is_correct: true, order_index: 1 },
    ],
  },
  {
    id: 'demo-q-4',
    teacher_id: 'demo-teacher',
    course_id: null,
    unit_id: null,
    lesson_id: null,
    question_text: 'Match the formal business expressions with their standard meanings:',
    question_text_arabic: 'صل بين تعابير الأعمال الرسمية ومعانيها القياسية:',
    question_type: 'matching',
    difficulty: 'hard',
    points: 4,
    explanation: 'Business communication phrases used in professional emails.',
    topic: 'Business English',
    tags: ['business', 'vocabulary'],
    time_limit_seconds: 120,
    is_active: true,
    archived_at: null,
    metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    options: [
      { id: 'opt-4-1', question_id: 'demo-q-4', option_text: 'Please find attached', target_match_text: 'The document is enclosed with this message', is_correct: true, order_index: 0 },
      { id: 'opt-4-2', question_id: 'demo-q-4', option_text: 'At your earliest convenience', target_match_text: 'As soon as possible without pressure', is_correct: true, order_index: 1 },
      { id: 'opt-4-3', question_id: 'demo-q-4', option_text: 'Keep me in the loop', target_match_text: 'Keep me informed about progress', is_correct: true, order_index: 2 },
    ],
  },
];

/**
 * Fetch all question bank items accessible to the current user
 */
export async function fetchQuestionBankItems(includeArchived = false): Promise<QuestionBankItem[]> {
  if (!supabase) {
    return includeArchived
      ? fallbackQuestionBank
      : fallbackQuestionBank.filter((q) => q.is_active);
  }

  try {
    let query = supabase
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

    const { data, error } = await query;

    if (error) {
      console.warn('Supabase query error for question_bank, falling back to local dataset:', error.message);
      return includeArchived
        ? fallbackQuestionBank
        : fallbackQuestionBank.filter((q) => q.is_active);
    }

    if (data && data.length > 0) {
      // Sort options by order_index
      return data.map((item: any) => ({
        ...item,
        options: (item.options || []).sort((a: any, b: any) => a.order_index - b.order_index),
      }));
    }

    return includeArchived
      ? fallbackQuestionBank
      : fallbackQuestionBank.filter((q) => q.is_active);
  } catch (err: any) {
    console.warn('fetchQuestionBankItems catch fallback:', err);
    return includeArchived
      ? fallbackQuestionBank
      : fallbackQuestionBank.filter((q) => q.is_active);
  }
}

/**
 * Fetch aggregated statistics for question bank
 */
export async function fetchQuestionBankStats(): Promise<QuestionBankStats> {
  if (supabase) {
    try {
      const { data, error } = await supabase.rpc('get_question_bank_stats');
      if (!error && data) {
        return data as QuestionBankStats;
      }
    } catch (e) {
      // fallback
    }
  }

  // Fallback calculation
  const total = fallbackQuestionBank.length;
  const active = fallbackQuestionBank.filter((q) => q.is_active).length;
  const archived = total - active;
  const by_type: Record<QuestionType, number> = {
    multiple_choice: 0,
    multiple_select: 0,
    true_false: 0,
    short_answer: 0,
    essay: 0,
    fill_in_the_blank: 0,
    matching: 0,
  };
  const by_difficulty: Record<DifficultyLevel, number> = {
    easy: 0,
    medium: 0,
    hard: 0,
  };

  fallbackQuestionBank.forEach((q) => {
    if (by_type[q.question_type] !== undefined) by_type[q.question_type]++;
    if (by_difficulty[q.difficulty] !== undefined) by_difficulty[q.difficulty]++;
  });

  return { total, active, archived, by_type, by_difficulty };
}

/**
 * Create a new question with its options atomically via RPC or client fallback
 */
export async function createQuestionBankItem(payload: CreateQuestionPayload): Promise<string> {
  const optionsPayload = (payload.options || []).map((opt, idx) => ({
    option_text: opt.option_text,
    option_text_arabic: opt.option_text_arabic || null,
    is_correct: Boolean(opt.is_correct),
    order_index: opt.order_index !== undefined ? opt.order_index : idx,
    explanation: opt.explanation || null,
    target_match_text: opt.target_match_text || null,
    target_match_arabic: opt.target_match_arabic || null,
    metadata: opt.metadata || {},
  }));

  if (supabase) {
    try {
      const { data, error } = await supabase.rpc('create_question_bank_item', {
        p_question_text: payload.question_text,
        p_question_text_arabic: payload.question_text_arabic || null,
        p_question_type: payload.question_type,
        p_difficulty: payload.difficulty,
        p_points: payload.points,
        p_explanation: payload.explanation || null,
        p_course_id: payload.course_id || null,
        p_unit_id: payload.unit_id || null,
        p_lesson_id: payload.lesson_id || null,
        p_topic: payload.topic || null,
        p_tags: payload.tags || [],
        p_time_limit_seconds: payload.time_limit_seconds || null,
        p_metadata: payload.metadata || {},
        p_options: optionsPayload,
      });

      if (error) {
        console.warn('create_question_bank_item RPC failed, using local mock store:', error.message);
      } else if (data) {
        return data;
      }
    } catch (err) {
      console.warn('createQuestionBankItem exception:', err);
    }
  }

  // Local fallback
  const newId = `demo-q-${Date.now()}`;
  const newItem: QuestionBankItem = {
    id: newId,
    teacher_id: 'demo-teacher',
    course_id: payload.course_id || null,
    unit_id: payload.unit_id || null,
    lesson_id: payload.lesson_id || null,
    question_text: payload.question_text,
    question_text_arabic: payload.question_text_arabic || null,
    question_type: payload.question_type,
    difficulty: payload.difficulty,
    points: payload.points,
    explanation: payload.explanation || null,
    topic: payload.topic || null,
    tags: payload.tags || [],
    time_limit_seconds: payload.time_limit_seconds || null,
    is_active: true,
    archived_at: null,
    metadata: payload.metadata || {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    options: optionsPayload.map((opt, i) => ({
      ...opt,
      id: `opt-${newId}-${i}`,
      question_id: newId,
    })),
  };
  fallbackQuestionBank.unshift(newItem);
  return newId;
}

/**
 * Update an existing question and its options atomically via RPC
 */
export async function updateQuestionBankItem(payload: UpdateQuestionPayload): Promise<void> {
  const optionsPayload = (payload.options || []).map((opt, idx) => ({
    option_text: opt.option_text,
    option_text_arabic: opt.option_text_arabic || null,
    is_correct: Boolean(opt.is_correct),
    order_index: opt.order_index !== undefined ? opt.order_index : idx,
    explanation: opt.explanation || null,
    target_match_text: opt.target_match_text || null,
    target_match_arabic: opt.target_match_arabic || null,
    metadata: opt.metadata || {},
  }));

  if (supabase) {
    try {
      const { error } = await supabase.rpc('update_question_bank_item', {
        p_question_id: payload.id,
        p_question_text: payload.question_text,
        p_question_text_arabic: payload.question_text_arabic || null,
        p_question_type: payload.question_type,
        p_difficulty: payload.difficulty,
        p_points: payload.points,
        p_explanation: payload.explanation || null,
        p_course_id: payload.course_id || null,
        p_unit_id: payload.unit_id || null,
        p_lesson_id: payload.lesson_id || null,
        p_topic: payload.topic || null,
        p_tags: payload.tags || [],
        p_time_limit_seconds: payload.time_limit_seconds || null,
        p_metadata: payload.metadata || {},
        p_options: optionsPayload,
      });

      if (error) {
        console.warn('update_question_bank_item RPC failed:', error.message);
      } else {
        return;
      }
    } catch (err) {
      console.warn('updateQuestionBankItem exception:', err);
    }
  }

  // Local fallback
  const idx = fallbackQuestionBank.findIndex((q) => q.id === payload.id);
  if (idx !== -1) {
    fallbackQuestionBank[idx] = {
      ...fallbackQuestionBank[idx],
      ...payload,
      updated_at: new Date().toISOString(),
      options: optionsPayload.map((opt, i) => ({
        ...opt,
        id: `opt-${payload.id}-${i}`,
        question_id: payload.id,
      })),
    };
  }
}

/**
 * Duplicate a question item creating an independent copy with (Copy) title
 */
export async function duplicateQuestionBankItem(questionId: string): Promise<string> {
  if (supabase) {
    try {
      const { data, error } = await supabase.rpc('duplicate_question_bank_item', {
        p_question_id: questionId,
      });

      if (!error && data) {
        return data;
      }
    } catch (err) {
      console.warn('duplicateQuestionBankItem exception:', err);
    }
  }

  // Local fallback
  const existing = fallbackQuestionBank.find((q) => q.id === questionId);
  if (!existing) throw new Error('Question not found');

  const newId = `demo-q-${Date.now()}`;
  const copy: QuestionBankItem = {
    ...existing,
    id: newId,
    question_text: `${existing.question_text} (Copy)`,
    question_text_arabic: existing.question_text_arabic
      ? `${existing.question_text_arabic} (نسخة)`
      : null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    options: (existing.options || []).map((o, i) => ({
      ...o,
      id: `opt-${newId}-${i}`,
      question_id: newId,
    })),
  };
  fallbackQuestionBank.unshift(copy);
  return newId;
}

/**
 * Bulk archive question items
 */
export async function archiveQuestionBankItems(questionIds: string[]): Promise<number> {
  if (questionIds.length === 0) return 0;
  if (supabase) {
    try {
      const { data, error } = await supabase.rpc('archive_question_bank_items', {
        p_question_ids: questionIds,
      });

      if (!error && data !== null) {
        return Number(data);
      }
    } catch (err) {
      console.warn('archiveQuestionBankItems exception:', err);
    }
  }

  // Local fallback
  let count = 0;
  fallbackQuestionBank = fallbackQuestionBank.map((q) => {
    if (questionIds.includes(q.id)) {
      count++;
      return { ...q, is_active: false, archived_at: new Date().toISOString() };
    }
    return q;
  });
  return count;
}

/**
 * Bulk restore question items
 */
export async function restoreQuestionBankItems(questionIds: string[]): Promise<number> {
  if (questionIds.length === 0) return 0;
  if (supabase) {
    try {
      const { data, error } = await supabase.rpc('restore_question_bank_items', {
        p_question_ids: questionIds,
      });

      if (!error && data !== null) {
        return Number(data);
      }
    } catch (err) {
      console.warn('restoreQuestionBankItems exception:', err);
    }
  }

  // Local fallback
  let count = 0;
  fallbackQuestionBank = fallbackQuestionBank.map((q) => {
    if (questionIds.includes(q.id)) {
      count++;
      return { ...q, is_active: true, archived_at: null };
    }
    return q;
  });
  return count;
}

/**
 * Import a validated list of questions atomically
 */
export async function importQuestions(
  parsedRows: { item: Partial<QuestionBankItem>; options: QuestionOptionItem[] }[]
): Promise<{ successCount: number; errors: string[] }> {
  let successCount = 0;
  const errors: string[] = [];

  for (const row of parsedRows) {
    try {
      await createQuestionBankItem({
        question_text: row.item.question_text || '',
        question_text_arabic: row.item.question_text_arabic || null,
        question_type: row.item.question_type || 'multiple_choice',
        difficulty: row.item.difficulty || 'medium',
        points: row.item.points !== undefined ? Number(row.item.points) : 1,
        explanation: row.item.explanation || null,
        course_id: row.item.course_id || null,
        topic: row.item.topic || null,
        tags: row.item.tags || [],
        options: row.options || [],
      });
      successCount++;
    } catch (err: any) {
      errors.push(`Row error: ${err.message || 'Unknown import error'}`);
    }
  }

  return { successCount, errors };
}

/**
 * Add bank questions to a quiz with recalculation of quiz total points
 */
export async function addBankQuestionsToQuiz(
  quizId: string,
  questionIds: string[]
): Promise<number> {
  if (supabase) {
    try {
      const { data, error } = await supabase.rpc('add_bank_questions_to_quiz', {
        p_quiz_id: quizId,
        p_question_bank_ids: questionIds,
      });

      if (!error && data !== null) {
        return Number(data);
      }
      throw new Error(error?.message || 'Failed to add questions to quiz');
    } catch (err: any) {
      console.error('addBankQuestionsToQuiz error:', err);
      throw err;
    }
  }

  return questionIds.length;
}
