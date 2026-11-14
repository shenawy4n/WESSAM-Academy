/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  requireSupabaseClient,
  requireAuthenticatedUser,
  throwServiceError,
  ServiceError,
} from '../../lib/errors/serviceError';
import {
  QuizRecord,
  QuestionItem,
  CreateQuizParams,
  UpsertQuestionParams,
  QuizAttemptRecord,
  AttemptReviewData,
} from './types';
import { resolveAssessmentStatus } from './quizScoring';

const SERVICE = 'quizService';

// -----------------------------------------------------------------------------
// TEACHER & SUPER ADMIN APIS
// -----------------------------------------------------------------------------

export async function fetchTeacherQuizzes(filters?: {
  groupId?: string;
  courseId?: string;
  status?: string;
  search?: string;
}): Promise<QuizRecord[]> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'fetchTeacherQuizzes' });

  let query = client
    .from('quizzes')
    .select(`
      id,
      title,
      title_arabic,
      description,
      description_arabic,
      course_id,
      group_id,
      lesson_id,
      teacher_id,
      duration_minutes,
      passing_score,
      max_attempts,
      total_points,
      is_randomized,
      is_published,
      is_archived,
      start_date,
      end_date,
      show_results_immediately,
      show_correct_answers_after_submission,
      created_at,
      updated_at,
      groups:group_id (
        id,
        name,
        name_arabic
      ),
      courses:course_id (
        id,
        title,
        title_arabic
      ),
      lessons:lesson_id (
        id,
        title,
        title_arabic
      )
    `)
    .order('created_at', { ascending: false });

  if (filters?.groupId && filters.groupId !== 'all') {
    query = query.eq('group_id', filters.groupId);
  }
  if (filters?.courseId && filters.courseId !== 'all') {
    query = query.eq('course_id', filters.courseId);
  }
  if (filters?.status === 'published') {
    query = query.eq('is_published', true).eq('is_archived', false);
  } else if (filters?.status === 'draft') {
    query = query.eq('is_published', false).eq('is_archived', false);
  } else if (filters?.status === 'archived') {
    query = query.eq('is_archived', true);
  }

  let rowsRes;
  try {
    rowsRes = await query;
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'fetchTeacherQuizzes' });
  }

  if (rowsRes.error) {
    throwServiceError(rowsRes.error, {
      service: SERVICE,
      operation: 'fetchTeacherQuizzes',
      fallbackMessage: 'Failed to fetch quizzes',
    });
  }

  const rows = rowsRes.data || [];
  if (rows.length === 0) return [];

  const quizIds = rows.map((r: any) => r.id);

  let questionsRes;
  let attemptsRes;
  try {
    [questionsRes, attemptsRes] = await Promise.all([
      client.from('quiz_questions').select('quiz_id').in('quiz_id', quizIds),
      client.from('quiz_attempts').select('quiz_id').in('quiz_id', quizIds),
    ]);
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'fetchTeacherQuizzes.counts' });
  }

  if (questionsRes.error) {
    throwServiceError(questionsRes.error, {
      service: SERVICE,
      operation: 'fetchTeacherQuizzes.questionCounts',
      fallbackMessage: 'Failed to load quiz question counts',
    });
  }

  if (attemptsRes.error) {
    throwServiceError(attemptsRes.error, {
      service: SERVICE,
      operation: 'fetchTeacherQuizzes.attemptCounts',
      fallbackMessage: 'Failed to load quiz submission counts',
    });
  }

  const qCountMap = new Map<string, number>();
  for (const q of questionsRes.data || []) {
    qCountMap.set(q.quiz_id, (qCountMap.get(q.quiz_id) || 0) + 1);
  }

  const aCountMap = new Map<string, number>();
  for (const a of attemptsRes.data || []) {
    aCountMap.set(a.quiz_id, (aCountMap.get(a.quiz_id) || 0) + 1);
  }

  let results: QuizRecord[] = rows.map((r: any) => ({
    id: r.id,
    title: r.title,
    titleArabic: r.title_arabic,
    description: r.description,
    descriptionArabic: r.description_arabic,
    courseId: r.course_id,
    groupId: r.group_id,
    lessonId: r.lesson_id,
    teacherId: r.teacher_id,
    durationMinutes: r.duration_minutes || 30,
    passingScore: Number(r.passing_score) || 60,
    maxAttempts: r.max_attempts || 1,
    totalPoints: Number(r.total_points) || 100,
    isRandomized: !!r.is_randomized,
    isPublished: !!r.is_published,
    isArchived: !!r.is_archived,
    startDate: r.start_date,
    endDate: r.end_date,
    showResultsImmediately: r.show_results_immediately !== false,
    showCorrectAnswersAfterSubmission: !!r.show_correct_answers_after_submission,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    groupName: r.groups?.name,
    groupNameArabic: r.groups?.name_arabic,
    courseTitle: r.courses?.title,
    courseTitleArabic: r.courses?.title_arabic,
    lessonTitle: r.lessons?.title,
    lessonTitleArabic: r.lessons?.title_arabic,
    questionsCount: qCountMap.get(r.id) || 0,
    submissionsCount: aCountMap.get(r.id) || 0,
  }));

  if (filters?.search) {
    const s = filters.search.toLowerCase().trim();
    results = results.filter(
      (q) =>
        q.title.toLowerCase().includes(s) ||
        (q.titleArabic && q.titleArabic.toLowerCase().includes(s))
    );
  }

  return results;
}

export async function fetchQuizById(
  id: string
): Promise<{ quiz: QuizRecord; questions: QuestionItem[] } | null> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'fetchQuizById' });

  let quizRes;
  try {
    quizRes = await client
      .from('quizzes')
      .select(`
        id,
        title,
        title_arabic,
        description,
        description_arabic,
        course_id,
        group_id,
        lesson_id,
        teacher_id,
        duration_minutes,
        passing_score,
        max_attempts,
        total_points,
        is_randomized,
        is_published,
        is_archived,
        start_date,
        end_date,
        show_results_immediately,
        show_correct_answers_after_submission,
        created_at,
        updated_at,
        groups:group_id (
          id,
          name,
          name_arabic
        ),
        courses:course_id (
          id,
          title,
          title_arabic
        ),
        lessons:lesson_id (
          id,
          title,
          title_arabic
        )
      `)
      .eq('id', id)
      .maybeSingle();
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'fetchQuizById' });
  }

  if (quizRes.error) {
    if (quizRes.error.code === 'PGRST116') {
      return null;
    }
    throwServiceError(quizRes.error, {
      service: SERVICE,
      operation: 'fetchQuizById',
      fallbackMessage: 'Failed to load quiz details',
    });
  }

  const r = quizRes.data;
  if (!r) return null;

  let qRes;
  try {
    qRes = await client
      .from('quiz_questions')
      .select(`
        id,
        points,
        order_index,
        is_required,
        question_bank:question_id (
          id,
          question_text,
          question_text_arabic,
          question_type,
          points,
          explanation,
          explanation_arabic,
          correct_answer_text,
          grading_guidelines,
          question_options (
            id,
            option_text,
            option_text_arabic,
            is_correct,
            order_index
          )
        )
      `)
      .eq('quiz_id', id)
      .order('order_index', { ascending: true });
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'fetchQuizById.questions' });
  }

  if (qRes.error) {
    throwServiceError(qRes.error, {
      service: SERVICE,
      operation: 'fetchQuizById.questions',
      fallbackMessage: 'Failed to load quiz questions',
    });
  }

  const questions: QuestionItem[] = (qRes.data || []).map((row: any) => {
    const qb = row.question_bank;
    const opts = (qb?.question_options || [])
      .map((o: any) => ({
        id: o.id,
        questionId: qb?.id,
        optionText: o.option_text,
        optionTextArabic: o.option_text_arabic,
        isCorrect: o.is_correct,
        orderIndex: o.order_index,
      }))
      .sort((a: any, b: any) => a.orderIndex - b.orderIndex);

    return {
      id: qb?.id,
      questionText: qb?.question_text || '',
      questionTextArabic: qb?.question_text_arabic,
      questionType: qb?.question_type,
      points: Number(row.points || qb?.points || 1),
      orderIndex: row.order_index,
      isRequired: row.is_required !== false,
      explanation: qb?.explanation,
      explanationArabic: qb?.explanation_arabic,
      correctAnswerText: qb?.correct_answer_text,
      gradingGuidelines: qb?.grading_guidelines,
      options: opts,
    };
  });

  const quiz: QuizRecord = {
    id: r.id,
    title: r.title,
    titleArabic: r.title_arabic,
    description: r.description,
    descriptionArabic: r.description_arabic,
    courseId: r.course_id,
    groupId: r.group_id,
    lessonId: r.lesson_id,
    teacherId: r.teacher_id,
    durationMinutes: r.duration_minutes || 30,
    passingScore: Number(r.passing_score) || 60,
    maxAttempts: r.max_attempts || 1,
    totalPoints: Number(r.total_points) || 100,
    isRandomized: !!r.is_randomized,
    isPublished: !!r.is_published,
    isArchived: !!r.is_archived,
    startDate: r.start_date,
    endDate: r.end_date,
    showResultsImmediately: r.show_results_immediately !== false,
    showCorrectAnswersAfterSubmission: !!r.show_correct_answers_after_submission,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    groupName: (r.groups as any)?.name,
    groupNameArabic: (r.groups as any)?.name_arabic,
    courseTitle: (r.courses as any)?.title,
    courseTitleArabic: (r.courses as any)?.title_arabic,
    lessonTitle: (r.lessons as any)?.title,
    lessonTitleArabic: (r.lessons as any)?.title_arabic,
    questionsCount: questions.length,
  };

  return { quiz, questions };
}

export async function createQuiz(params: CreateQuizParams): Promise<QuizRecord> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'createQuiz' });
  const caller = await requireAuthenticatedUser(client, {
    service: SERVICE,
    operation: 'createQuiz',
  });

  let res;
  try {
    res = await client
      .from('quizzes')
      .insert({
        title: params.title.trim(),
        title_arabic: params.titleArabic.trim(),
        description: params.description?.trim() || null,
        description_arabic: params.descriptionArabic?.trim() || null,
        course_id: params.courseId || null,
        group_id: params.groupId || null,
        lesson_id: params.lessonId || null,
        teacher_id: caller.id,
        duration_minutes: params.durationMinutes,
        passing_score: params.passingScore,
        max_attempts: params.maxAttempts,
        total_points: params.totalPoints,
        start_date: params.startDate || null,
        end_date: params.endDate || null,
        show_results_immediately: params.showResultsImmediately,
        show_correct_answers_after_submission: params.showCorrectAnswersAfterSubmission,
        is_published: !!params.isPublished,
        is_archived: false,
      })
      .select('*')
      .single();
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'createQuiz' });
  }

  if (res.error || !res.data) {
    throwServiceError(res.error || new Error('Failed to create quiz'), {
      service: SERVICE,
      operation: 'createQuiz',
      fallbackMessage: 'Failed to create quiz',
    });
  }

  const data = res.data;
  return {
    id: data.id,
    title: data.title,
    titleArabic: data.title_arabic,
    description: data.description,
    descriptionArabic: data.description_arabic,
    courseId: data.course_id,
    groupId: data.group_id,
    lessonId: data.lesson_id,
    teacherId: data.teacher_id,
    durationMinutes: data.duration_minutes,
    passingScore: Number(data.passing_score),
    maxAttempts: data.max_attempts,
    totalPoints: Number(data.total_points),
    isRandomized: !!data.is_randomized,
    isPublished: !!data.is_published,
    isArchived: !!data.is_archived,
    startDate: data.start_date,
    endDate: data.end_date,
    showResultsImmediately: data.show_results_immediately,
    showCorrectAnswersAfterSubmission: data.show_correct_answers_after_submission,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    questionsCount: 0,
    submissionsCount: 0,
  };
}

export async function updateQuiz(
  id: string,
  params: Partial<CreateQuizParams> & { isPublished?: boolean; isArchived?: boolean }
): Promise<void> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'updateQuiz' });

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (params.title) payload.title = params.title.trim();
  if (params.titleArabic) payload.title_arabic = params.titleArabic.trim();
  if (params.description !== undefined) payload.description = params.description?.trim() || null;
  if (params.descriptionArabic !== undefined) payload.description_arabic = params.descriptionArabic?.trim() || null;
  if (params.groupId !== undefined) payload.group_id = params.groupId;
  if (params.courseId !== undefined) payload.course_id = params.courseId;
  if (params.lessonId !== undefined) payload.lesson_id = params.lessonId;
  if (params.durationMinutes !== undefined) payload.duration_minutes = params.durationMinutes;
  if (params.passingScore !== undefined) payload.passing_score = params.passingScore;
  if (params.maxAttempts !== undefined) payload.max_attempts = params.maxAttempts;
  if (params.totalPoints !== undefined) payload.total_points = params.totalPoints;
  if (params.startDate !== undefined) payload.start_date = params.startDate;
  if (params.endDate !== undefined) payload.end_date = params.endDate;
  if (params.showResultsImmediately !== undefined) payload.show_results_immediately = params.showResultsImmediately;
  if (params.showCorrectAnswersAfterSubmission !== undefined)
    payload.show_correct_answers_after_submission = params.showCorrectAnswersAfterSubmission;
  if (params.isPublished !== undefined) payload.is_published = params.isPublished;
  if (params.isArchived !== undefined) payload.is_archived = params.isArchived;

  let res;
  try {
    res = await client.from('quizzes').update(payload).eq('id', id);
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'updateQuiz' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'updateQuiz',
      fallbackMessage: 'Failed to update quiz',
    });
  }
}

export async function deleteQuiz(id: string): Promise<void> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'deleteQuiz' });

  let res;
  try {
    res = await client.from('quizzes').delete().eq('id', id);
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'deleteQuiz' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'deleteQuiz',
      fallbackMessage: 'Failed to delete quiz',
    });
  }
}

export async function saveQuizQuestion(quizId: string, params: UpsertQuestionParams): Promise<void> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'saveQuizQuestion' });
  const caller = await requireAuthenticatedUser(client, {
    service: SERVICE,
    operation: 'saveQuizQuestion',
  });

  let questionId = params.id;

  if (questionId) {
    let updRes;
    try {
      updRes = await client
        .from('question_bank')
        .update({
          question_text: params.questionText,
          question_text_arabic: params.questionTextArabic || null,
          question_type: params.questionType,
          points: params.points,
          explanation: params.explanation || null,
          explanation_arabic: params.explanationArabic || null,
          correct_answer_text: params.correctAnswerText || null,
          grading_guidelines: params.gradingGuidelines || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', questionId);
    } catch (err) {
      throwServiceError(err, { service: SERVICE, operation: 'saveQuizQuestion.updateBank' });
    }

    if (updRes.error) {
      throwServiceError(updRes.error, {
        service: SERVICE,
        operation: 'saveQuizQuestion.updateBank',
        fallbackMessage: 'Failed to update question',
      });
    }

    let linkUpdRes;
    try {
      linkUpdRes = await client
        .from('quiz_questions')
        .update({
          points: params.points,
          order_index: params.orderIndex,
          is_required: params.isRequired !== false,
        })
        .eq('quiz_id', quizId)
        .eq('question_id', questionId);
    } catch (err) {
      throwServiceError(err, { service: SERVICE, operation: 'saveQuizQuestion.updateLink' });
    }

    if (linkUpdRes.error) {
      throwServiceError(linkUpdRes.error, {
        service: SERVICE,
        operation: 'saveQuizQuestion.updateLink',
        fallbackMessage: 'Failed to update quiz question link',
      });
    }
  } else {
    let qRes;
    try {
      qRes = await client
        .from('question_bank')
        .insert({
          teacher_id: caller.id,
          question_text: params.questionText,
          question_text_arabic: params.questionTextArabic || null,
          question_type: params.questionType,
          points: params.points,
          explanation: params.explanation || null,
          explanation_arabic: params.explanationArabic || null,
          correct_answer_text: params.correctAnswerText || null,
          grading_guidelines: params.gradingGuidelines || null,
        })
        .select('id')
        .single();
    } catch (err) {
      throwServiceError(err, { service: SERVICE, operation: 'saveQuizQuestion.createBank' });
    }

    if (qRes.error || !qRes.data) {
      throwServiceError(qRes.error || new Error('Failed to create question'), {
        service: SERVICE,
        operation: 'saveQuizQuestion.createBank',
        fallbackMessage: 'Failed to create question',
      });
    }
    questionId = qRes.data.id;

    let linkRes;
    try {
      linkRes = await client.from('quiz_questions').insert({
        quiz_id: quizId,
        question_id: questionId,
        points: params.points,
        order_index: params.orderIndex,
        is_required: params.isRequired !== false,
      });
    } catch (err) {
      throwServiceError(err, { service: SERVICE, operation: 'saveQuizQuestion.linkQuestion' });
    }

    if (linkRes.error) {
      throwServiceError(linkRes.error, {
        service: SERVICE,
        operation: 'saveQuizQuestion.linkQuestion',
        fallbackMessage: 'Failed to link question to quiz',
      });
    }
  }

  if (params.questionType !== 'short_answer' && params.options && params.options.length > 0) {
    let delRes;
    try {
      delRes = await client.from('question_options').delete().eq('question_id', questionId);
    } catch (err) {
      throwServiceError(err, { service: SERVICE, operation: 'saveQuizQuestion.clearOptions' });
    }

    if (delRes.error) {
      throwServiceError(delRes.error, {
        service: SERVICE,
        operation: 'saveQuizQuestion.clearOptions',
        fallbackMessage: 'Failed to clear existing question options',
      });
    }

    const optPayload = params.options.map((o) => ({
      question_id: questionId,
      option_text: o.optionText,
      option_text_arabic: o.optionTextArabic || null,
      is_correct: !!o.isCorrect,
      order_index: o.orderIndex,
    }));

    let optRes;
    try {
      optRes = await client.from('question_options').insert(optPayload);
    } catch (err) {
      throwServiceError(err, { service: SERVICE, operation: 'saveQuizQuestion.insertOptions' });
    }

    if (optRes.error) {
      throwServiceError(optRes.error, {
        service: SERVICE,
        operation: 'saveQuizQuestion.insertOptions',
        fallbackMessage: 'Failed to save question options',
      });
    }
  }
}

export async function deleteQuizQuestion(quizId: string, questionId: string): Promise<void> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'deleteQuizQuestion' });

  let res;
  try {
    res = await client
      .from('quiz_questions')
      .delete()
      .eq('quiz_id', quizId)
      .eq('question_id', questionId);
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'deleteQuizQuestion' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'deleteQuizQuestion',
      fallbackMessage: 'Failed to remove question from quiz',
    });
  }
}

// -----------------------------------------------------------------------------
// STUDENT ASSESSMENT APIS
// -----------------------------------------------------------------------------

export async function fetchStudentAssessments(): Promise<QuizRecord[]> {
  const client = requireSupabaseClient({
    service: SERVICE,
    operation: 'fetchStudentAssessments',
  });

  let rowsRes;
  try {
    rowsRes = await client
      .from('quizzes')
      .select(`
        id,
        title,
        title_arabic,
        description,
        description_arabic,
        course_id,
        group_id,
        lesson_id,
        duration_minutes,
        passing_score,
        max_attempts,
        total_points,
        is_published,
        is_archived,
        start_date,
        end_date,
        show_results_immediately,
        show_correct_answers_after_submission,
        created_at,
        updated_at,
        courses:course_id (
          id,
          title,
          title_arabic
        ),
        lessons:lesson_id (
          id,
          title,
          title_arabic
        )
      `)
      .order('created_at', { ascending: false });
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'fetchStudentAssessments' });
  }

  if (rowsRes.error) {
    throwServiceError(rowsRes.error, {
      service: SERVICE,
      operation: 'fetchStudentAssessments',
      fallbackMessage: 'Failed to fetch assessments',
    });
  }

  const rows = rowsRes.data || [];
  if (rows.length === 0) return [];

  const quizIds = rows.map((r: any) => r.id);
  let attemptsRes;
  try {
    attemptsRes = await client
      .from('quiz_attempts')
      .select('id, quiz_id, status, expires_at, score, percentage_score, is_passed, started_at, completed_at')
      .in('quiz_id', quizIds)
      .order('started_at', { ascending: false });
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'fetchStudentAssessments.attempts' });
  }

  if (attemptsRes.error) {
    throwServiceError(attemptsRes.error, {
      service: SERVICE,
      operation: 'fetchStudentAssessments.attempts',
      fallbackMessage: 'Failed to load student quiz attempts',
    });
  }

  const attemptsByQuiz = new Map<string, any[]>();
  for (const a of attemptsRes.data || []) {
    const list = attemptsByQuiz.get(a.quiz_id) || [];
    list.push(a);
    attemptsByQuiz.set(a.quiz_id, list);
  }

  const nowMs = Date.now();

  return rows.map((r: any) => {
    const myAttempts = attemptsByQuiz.get(r.id) || [];
    const activeAttempt = myAttempts.find((a) => a.status === 'in_progress');
    const lastAttempt = myAttempts[0];

    const state = resolveAssessmentStatus({
      isPublished: r.is_published,
      isArchived: r.is_archived,
      startDate: r.start_date,
      endDate: r.end_date,
      maxAttempts: r.max_attempts || 1,
      userAttemptsCount: myAttempts.filter((a) => a.status !== 'in_progress').length,
      activeAttemptExpiresAt: activeAttempt?.expires_at,
      currentTimestampMs: nowMs,
    });

    return {
      id: r.id,
      title: r.title,
      titleArabic: r.title_arabic,
      description: r.description,
      descriptionArabic: r.description_arabic,
      courseId: r.course_id,
      groupId: r.group_id,
      lessonId: r.lesson_id,
      durationMinutes: r.duration_minutes || 30,
      passingScore: Number(r.passing_score) || 60,
      maxAttempts: r.max_attempts || 1,
      totalPoints: Number(r.total_points) || 100,
      isRandomized: false,
      isPublished: r.is_published,
      isArchived: r.is_archived,
      startDate: r.start_date,
      endDate: r.end_date,
      showResultsImmediately: r.show_results_immediately !== false,
      showCorrectAnswersAfterSubmission: !!r.show_correct_answers_after_submission,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      courseTitle: r.courses?.title,
      courseTitleArabic: r.courses?.title_arabic,
      lessonTitle: r.lessons?.title,
      lessonTitleArabic: r.lessons?.title_arabic,
      studentState: state,
      userAttemptsCount: myAttempts.length,
      activeAttemptId: activeAttempt?.id || null,
      lastAttemptScore: lastAttempt?.score,
      lastAttemptPercentage: lastAttempt?.percentage_score,
      isPassed: lastAttempt?.is_passed,
    };
  });
}

export async function startQuizAttempt(quizId: string): Promise<{
  attemptId: string;
  quizId: string;
  attemptNumber: number;
  startedAt: string;
  expiresAt: string;
  timeLimitSeconds: number;
  questionSnapshot: QuestionItem[];
  isRestored: boolean;
}> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'startQuizAttempt' });

  let res;
  try {
    res = await client.rpc('start_quiz_attempt', {
      p_quiz_id: quizId,
    });
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'startQuizAttempt' });
  }

  if (res.error || !res.data) {
    throwServiceError(res.error || new Error('Failed to start assessment'), {
      service: SERVICE,
      operation: 'startQuizAttempt',
      fallbackMessage: 'Failed to start assessment',
    });
  }

  const data = res.data;
  return {
    attemptId: data.attempt_id,
    quizId: data.quiz_id,
    attemptNumber: data.attempt_number,
    startedAt: data.started_at,
    expiresAt: data.expires_at,
    timeLimitSeconds: data.time_limit_seconds,
    questionSnapshot: data.question_snapshot,
    isRestored: !!data.is_restored,
  };
}

export async function saveQuizAnswers(
  attemptId: string,
  answers: { questionId: string; selectedOptionId?: string | null; answerText?: string | null }[]
): Promise<void> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'saveQuizAnswers' });

  const payload = answers.map((a) => ({
    question_id: a.questionId,
    selected_option_id: a.selectedOptionId || null,
    answer_text: a.answerText || null,
  }));

  let res;
  try {
    res = await client.rpc('save_quiz_answers', {
      p_attempt_id: attemptId,
      p_answers: payload,
    });
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'saveQuizAnswers' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'saveQuizAnswers',
      fallbackMessage: 'Failed to save answers',
    });
  }
}

export async function submitQuizAttempt(
  attemptId: string,
  answers?: { questionId: string; selectedOptionId?: string | null; answerText?: string | null }[]
): Promise<any> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'submitQuizAttempt' });

  const payload = answers
    ? answers.map((a) => ({
        question_id: a.questionId,
        selected_option_id: a.selectedOptionId || null,
        answer_text: a.answerText || null,
      }))
    : null;

  let res;
  try {
    res = await client.rpc('submit_quiz_attempt', {
      p_attempt_id: attemptId,
      p_answers: payload,
    });
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'submitQuizAttempt' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'submitQuizAttempt',
      fallbackMessage: 'Quiz submission failed',
    });
  }

  return res.data;
}

export async function getQuizAttemptReview(attemptId: string): Promise<AttemptReviewData> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'getQuizAttemptReview' });

  let res;
  try {
    res = await client.rpc('get_quiz_attempt_review', {
      p_attempt_id: attemptId,
    });
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'getQuizAttemptReview' });
  }

  if (res.error || !res.data) {
    throwServiceError(res.error || new Error('Failed to load review'), {
      service: SERVICE,
      operation: 'getQuizAttemptReview',
      fallbackMessage: 'Failed to load attempt review',
    });
  }

  const data = res.data;
  return {
    attemptId: data.attempt_id,
    quizId: data.quiz_id,
    quizTitle: data.quiz_title,
    quizTitleArabic: data.quiz_title_arabic,
    status: data.status,
    startedAt: data.started_at,
    completedAt: data.completed_at,
    score: data.score,
    totalPossible: data.total_possible,
    percentageScore: data.percentage_score,
    isPassed: data.is_passed,
    requiresManualGrading: !!data.requires_manual_grading,
    teacherFeedback: data.teacher_feedback,
    allowCorrectAnswers: !!data.allow_correct_answers,
    allowScores: !!data.allow_scores,
    questions: (data.questions || []).map((q: any) => ({
      questionId: q.question_id,
      questionText: q.question_text,
      questionTextArabic: q.question_text_arabic,
      questionType: q.question_type,
      points: Number(q.points),
      orderIndex: q.order_index,
      studentSelectedOptionId: q.student_selected_option_id,
      studentAnswerText: q.student_answer_text,
      pointsAwarded: q.points_awarded !== null ? Number(q.points_awarded) : null,
      isCorrect: q.is_correct,
      teacherFeedback: q.teacher_feedback,
      needsReview: !!q.needs_review,
      explanation: q.explanation,
      explanationArabic: q.explanation_arabic,
      correctAnswerText: q.correct_answer_text,
      options: (q.options || []).map((o: any) => ({
        id: o.id,
        optionText: o.option_text,
        optionTextArabic: o.option_text_arabic,
        isCorrect: o.is_correct,
        orderIndex: o.order_index,
      })),
    })),
  };
}

// -----------------------------------------------------------------------------
// TEACHER GRADING APIS
// -----------------------------------------------------------------------------

export async function fetchQuizSubmissions(quizId: string): Promise<QuizAttemptRecord[]> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'fetchQuizSubmissions' });

  let res;
  try {
    res = await client
      .from('quiz_attempts')
      .select(`
        id,
        quiz_id,
        student_id,
        attempt_number,
        started_at,
        completed_at,
        submitted_at,
        expires_at,
        time_limit_seconds,
        status,
        score,
        points_scored,
        total_points_possible,
        percentage_score,
        is_passed,
        requires_manual_grading,
        teacher_feedback,
        graded_at,
        graded_by,
        question_snapshot,
        profiles:student_id (
          id,
          full_name,
          full_name_arabic,
          student_id_number
        )
      `)
      .eq('quiz_id', quizId)
      .order('started_at', { ascending: false });
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'fetchQuizSubmissions' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'fetchQuizSubmissions',
      fallbackMessage: 'Failed to fetch quiz submissions',
    });
  }

  const rows = res.data || [];
  return rows.map((r: any) => ({
    id: r.id,
    quizId: r.quiz_id,
    studentId: r.student_id,
    attemptNumber: r.attempt_number,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    submittedAt: r.submitted_at,
    expiresAt: r.expires_at,
    timeLimitSeconds: r.time_limit_seconds,
    status: r.status,
    score: r.score !== null ? Number(r.score) : null,
    pointsScored: r.points_scored !== null ? Number(r.points_scored) : null,
    totalPointsPossible: Number(r.total_points_possible || 0),
    percentageScore: r.percentage_score !== null ? Number(r.percentage_score) : null,
    isPassed: r.is_passed,
    requiresManualGrading: !!r.requires_manual_grading,
    teacherFeedback: r.teacher_feedback,
    gradedAt: r.graded_at,
    gradedBy: r.graded_by,
    questionSnapshot: r.question_snapshot || [],
    studentName: r.profiles?.full_name || 'Student',
    studentNameArabic: r.profiles?.full_name_arabic || r.profiles?.full_name || 'طالب',
    studentNumber: r.profiles?.student_id_number,
  }));
}

export async function gradeStudentAttempt(
  attemptId: string,
  grades: { questionId: string; pointsAwarded: number; feedback?: string }[],
  teacherFeedback?: string
): Promise<any> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'gradeStudentAttempt' });

  let res;
  try {
    res = await client.rpc('grade_student_attempt', {
      p_attempt_id: attemptId,
      p_grades: grades.map((g) => ({
        question_id: g.questionId,
        points_awarded: g.pointsAwarded,
        feedback: g.feedback || null,
      })),
      p_teacher_feedback: teacherFeedback || null,
    });
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'gradeStudentAttempt' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'gradeStudentAttempt',
      fallbackMessage: 'Failed to submit grading',
    });
  }

  return res.data;
}
