/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { supabase } from '../../lib/supabase/client';
import {
  QuizRecord,
  QuestionItem,
  CreateQuizParams,
  UpsertQuestionParams,
  QuizAttemptRecord,
  AttemptReviewData,
} from './types';
import { resolveAssessmentStatus } from './quizScoring';

// -----------------------------------------------------------------------------
// Preview Demo Data (for testing when disconnected or without active database)
// -----------------------------------------------------------------------------
let DEMO_QUIZZES: QuizRecord[] = [
  {
    id: 'qqqqqqqq-1111-4111-8111-111111111111',
    courseId: 'cccccccc-1111-4111-8111-111111111111',
    groupId: 'aaaaaaaa-aaaa-4aaa-8aaa-cccccccccccc',
    teacherId: '11111111-1111-4111-8111-111111111111',
    title: 'IELTS Academic Writing Task 2 Diagnostic Assessment',
    titleArabic: 'التقييم التشخيصي: مقال الرأي والنقاش الأكاديمي (الآيلتس)',
    description: 'Timed diagnostic assessment covering argumentative thesis generation, paragraph structure, and lexical resource.',
    descriptionArabic: 'اختبار تشخيصي يقيس صياغة أطروحة المقال، تماسك الفقرات، والمفردات الأكاديمية الدقيقة.',
    durationMinutes: 45,
    passingScore: 65,
    maxAttempts: 2,
    totalPoints: 20,
    isRandomized: false,
    isPublished: true,
    isArchived: false,
    startDate: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
    endDate: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    showResultsImmediately: true,
    showCorrectAnswersAfterSubmission: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    groupName: 'Group A - Intensive IELTS Prep',
    groupNameArabic: 'المجموعة أ - الإعداد المكثف للآيلتس',
    courseTitle: 'IELTS Academic Writing & Speaking Mastery',
    courseTitleArabic: 'إتقان الكتابة والمحادثة الأكاديمية لاختبار الآيلتس',
    questionsCount: 3,
    submissionsCount: 1,
  },
  {
    id: 'qqqqqqqq-2222-4222-8222-222222222222',
    courseId: 'cccccccc-2222-4222-8222-222222222222',
    groupId: 'aaaaaaaa-aaaa-4aaa-8aaa-cccccccccccc',
    teacherId: '11111111-1111-4111-8111-111111111111',
    title: 'Grammar Foundations: Relative Clauses & Subject-Verb Agreement',
    titleArabic: 'أساسيات القواعد: جمل الوصل وتطابق الفاعل والفعل',
    description: 'Comprehensive quiz on non-defining relative clauses and common irregular subject agreements.',
    descriptionArabic: 'اختبار شامل حول جمل الوصل المعترضة وتطابق الفاعل مع الأفعال الشاذة.',
    durationMinutes: 30,
    passingScore: 70,
    maxAttempts: 1,
    totalPoints: 15,
    isRandomized: false,
    isPublished: true,
    isArchived: false,
    startDate: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    endDate: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString(),
    showResultsImmediately: true,
    showCorrectAnswersAfterSubmission: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    groupName: 'Group A - Intensive IELTS Prep',
    groupNameArabic: 'المجموعة أ - الإعداد المكثف للآيلتس',
    courseTitle: 'English Grammar Foundations & Sentence Structure',
    courseTitleArabic: 'أساسيات قواعد اللغة الإنجليزية وبناء الجملة السليمة',
    questionsCount: 2,
    submissionsCount: 0,
  },
];

let DEMO_QUESTIONS: Record<string, QuestionItem[]> = {
  'qqqqqqqq-1111-4111-8111-111111111111': [
    {
      id: 'qb-1',
      questionText: 'Which of the following is the most academically appropriate thesis statement for an agree/disagree prompt on remote learning?',
      questionTextArabic: 'أي من الجمل التالية تمثل أطروحة أكاديمية سليمة لمقال إبداء الرأي حول التعليم عن بعد؟',
      questionType: 'multiple_choice',
      points: 5,
      orderIndex: 1,
      isRequired: true,
      explanation: 'Academic thesis statements must clearly outline both main points without informal vocabulary.',
      explanationArabic: 'يجب أن تحدد الأطروحة الأكاديمية النقاط الرئيسية بوضوح مع تجنب الألفاظ العامية.',
      options: [
        { id: 'opt-1', optionText: 'I completely think online learning is super cool and fun for all.', optionTextArabic: 'أعتقد تماماً أن التعلم عبر الإنترنت ممتع ورائع للجميع.', isCorrect: false, orderIndex: 1 },
        { id: 'opt-2', optionText: 'Although virtual education offers unmatched schedule flexibility, it ultimately compromises collaborative discourse and student accountability.', optionTextArabic: 'على الرغم من مرونة التعليم الافتراضي، إلا أنه يحد من الحوار التفاعلي والانضباط الطلابي.', isCorrect: true, orderIndex: 2 },
        { id: 'opt-3', optionText: 'There are many points on both sides of this big issue.', optionTextArabic: 'هناك العديد من النقاط في كلا جانبي هذه القضية.', isCorrect: false, orderIndex: 3 },
      ],
    },
    {
      id: 'qb-2',
      questionText: 'True or False: In IELTS Academic Writing Task 2, using bullet points in body paragraphs is acceptable provided the ideas are well-explained.',
      questionTextArabic: 'صواب أم خطأ: في مقال الآيلتس الأكاديمي، يُسمح باستخدام النقاط المرقومة في فقرات العرض بشرط شرح الأفكار جيداً.',
      questionType: 'true_false',
      points: 5,
      orderIndex: 2,
      isRequired: true,
      explanation: 'Academic essays strictly require continuous prose and complete paragraphs; bullet points incur severe coherence penalties.',
      explanationArabic: 'يتطلب المقال الأكاديمي فقرات مترابطة تماماً؛ يؤدي استخدام النقاط إلى خفض درجة الترابط بشكل كبير.',
      options: [
        { id: 'opt-tf-1', optionText: 'True', optionTextArabic: 'صواب', isCorrect: false, orderIndex: 1 },
        { id: 'opt-tf-2', optionText: 'False', optionTextArabic: 'خطأ', isCorrect: true, orderIndex: 2 },
      ],
    },
    {
      id: 'qb-3',
      questionText: 'Write a cohesive topic sentence introducing the environmental consequences of rapid urbanization.',
      questionTextArabic: 'اكتب جملة رئيسية متماسكة (Topic Sentence) تطرح الآثار البيئية للتحضر العمراني السريع.',
      questionType: 'short_answer',
      points: 10,
      orderIndex: 3,
      isRequired: true,
      correctAnswerText: 'Model Answer: Rapid urban expansion precipitates acute ecological strain, most notably through rampant deforestation, diminished air quality, and escalated greenhouse emissions.',
      gradingGuidelines: 'Award up to 10 points based on: clear grammatical structure (4 pts), advanced lexical choices (3 pts), and direct focus on environmental strain (3 pts).',
      options: [],
    },
  ],
};

let DEMO_ATTEMPTS: QuizAttemptRecord[] = [];

// -----------------------------------------------------------------------------
// TEACHER & SUPER ADMIN APIS
// -----------------------------------------------------------------------------

export async function fetchTeacherQuizzes(filters?: {
  groupId?: string;
  courseId?: string;
  status?: string;
  search?: string;
}): Promise<QuizRecord[]> {
  if (!supabase) {
    let result = [...DEMO_QUIZZES];
    if (filters?.groupId && filters.groupId !== 'all') {
      result = result.filter((q) => q.groupId === filters.groupId);
    }
    if (filters?.courseId && filters.courseId !== 'all') {
      result = result.filter((q) => q.courseId === filters.courseId);
    }
    if (filters?.status === 'published') {
      result = result.filter((q) => q.isPublished && !q.isArchived);
    } else if (filters?.status === 'draft') {
      result = result.filter((q) => !q.isPublished && !q.isArchived);
    } else if (filters?.status === 'archived') {
      result = result.filter((q) => q.isArchived);
    }
    if (filters?.search) {
      const s = filters.search.toLowerCase().trim();
      result = result.filter((q) =>
        q.title.toLowerCase().includes(s) ||
        (q.titleArabic && q.titleArabic.toLowerCase().includes(s))
      );
    }
    return result;
  }

  let query = supabase
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

  const { data: rows, error } = await query;
  if (error) throw new Error(`Failed to fetch quizzes: ${error.message}`);
  if (!rows || rows.length === 0) return [];

  // Count questions & submissions for each quiz
  const quizIds = rows.map((r) => r.id);
  const [questionsRes, attemptsRes] = await Promise.all([
    supabase.from('quiz_questions').select('quiz_id').in('quiz_id', quizIds),
    supabase.from('quiz_attempts').select('quiz_id').in('quiz_id', quizIds),
  ]);

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
    results = results.filter((q) =>
      q.title.toLowerCase().includes(s) ||
      (q.titleArabic && q.titleArabic.toLowerCase().includes(s))
    );
  }

  return results;
}

export async function fetchQuizById(id: string): Promise<{ quiz: QuizRecord; questions: QuestionItem[] } | null> {
  if (!supabase) {
    const quiz = DEMO_QUIZZES.find((q) => q.id === id);
    if (!quiz) return null;
    return {
      quiz,
      questions: DEMO_QUESTIONS[id] || [],
    };
  }

  const { data: r, error } = await supabase
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
    .single();

  if (error || !r) return null;

  // Fetch questions for this quiz in order
  const { data: qRows, error: qErr } = await supabase
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

  if (qErr) throw new Error(`Failed to load quiz questions: ${qErr.message}`);

  const questions: QuestionItem[] = (qRows || []).map((row: any) => {
    const qb = row.question_bank;
    const opts = (qb?.question_options || []).map((o: any) => ({
      id: o.id,
      questionId: qb?.id,
      optionText: o.option_text,
      optionTextArabic: o.option_text_arabic,
      isCorrect: o.is_correct,
      orderIndex: o.order_index,
    })).sort((a: any, b: any) => a.orderIndex - b.orderIndex);

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
  if (!supabase) {
    const newQuiz: QuizRecord = {
      id: `qqqqqqqq-${Date.now().toString(16).padStart(4, '0')}-4000-8000-000000000000`,
      title: params.title.trim(),
      titleArabic: params.titleArabic.trim(),
      description: params.description?.trim() || null,
      descriptionArabic: params.descriptionArabic?.trim() || null,
      courseId: params.courseId || null,
      groupId: params.groupId || null,
      lessonId: params.lessonId || null,
      teacherId: '11111111-1111-4111-8111-111111111111',
      durationMinutes: params.durationMinutes,
      passingScore: params.passingScore,
      maxAttempts: params.maxAttempts,
      totalPoints: params.totalPoints,
      isRandomized: false,
      isPublished: !!params.isPublished,
      isArchived: false,
      startDate: params.startDate || null,
      endDate: params.endDate || null,
      showResultsImmediately: params.showResultsImmediately,
      showCorrectAnswersAfterSubmission: params.showCorrectAnswersAfterSubmission,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      questionsCount: 0,
      submissionsCount: 0,
    };
    DEMO_QUIZZES.unshift(newQuiz);
    return newQuiz;
  }

  const { data: userRes } = await supabase.auth.getUser();
  const callerId = userRes?.user?.id;

  const { data, error } = await supabase
    .from('quizzes')
    .insert({
      title: params.title.trim(),
      title_arabic: params.titleArabic.trim(),
      description: params.description?.trim() || null,
      description_arabic: params.descriptionArabic?.trim() || null,
      course_id: params.courseId || null,
      group_id: params.groupId || null,
      lesson_id: params.lessonId || null,
      teacher_id: callerId,
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

  if (error) throw new Error(`Failed to create quiz: ${error.message}`);

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
  if (!supabase) {
    const q = DEMO_QUIZZES.find((item) => item.id === id);
    if (q) {
      if (params.title) q.title = params.title.trim();
      if (params.titleArabic) q.titleArabic = params.titleArabic.trim();
      if (params.description !== undefined) q.description = params.description?.trim() || null;
      if (params.descriptionArabic !== undefined) q.descriptionArabic = params.descriptionArabic?.trim() || null;
      if (params.groupId !== undefined) q.groupId = params.groupId;
      if (params.courseId !== undefined) q.courseId = params.courseId;
      if (params.lessonId !== undefined) q.lessonId = params.lessonId;
      if (params.durationMinutes !== undefined) q.durationMinutes = params.durationMinutes;
      if (params.passingScore !== undefined) q.passingScore = params.passingScore;
      if (params.maxAttempts !== undefined) q.maxAttempts = params.maxAttempts;
      if (params.totalPoints !== undefined) q.totalPoints = params.totalPoints;
      if (params.startDate !== undefined) q.startDate = params.startDate;
      if (params.endDate !== undefined) q.endDate = params.endDate;
      if (params.showResultsImmediately !== undefined) q.showResultsImmediately = params.showResultsImmediately;
      if (params.showCorrectAnswersAfterSubmission !== undefined) q.showCorrectAnswersAfterSubmission = params.showCorrectAnswersAfterSubmission;
      if (params.isPublished !== undefined) q.isPublished = params.isPublished;
      if (params.isArchived !== undefined) q.isArchived = params.isArchived;
      q.updatedAt = new Date().toISOString();
    }
    return;
  }

  const payload: any = { updated_at: new Date().toISOString() };
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
  if (params.showCorrectAnswersAfterSubmission !== undefined) payload.show_correct_answers_after_submission = params.showCorrectAnswersAfterSubmission;
  if (params.isPublished !== undefined) payload.is_published = params.isPublished;
  if (params.isArchived !== undefined) payload.is_archived = params.isArchived;

  const { error } = await supabase.from('quizzes').update(payload).eq('id', id);
  if (error) throw new Error(`Failed to update quiz: ${error.message}`);
}

export async function deleteQuiz(id: string): Promise<void> {
  if (!supabase) {
    DEMO_QUIZZES = DEMO_QUIZZES.filter((q) => q.id !== id);
    delete DEMO_QUESTIONS[id];
    return;
  }

  const { error } = await supabase.from('quizzes').delete().eq('id', id);
  if (error) throw new Error(`Failed to delete quiz: ${error.message}`);
}

export async function saveQuizQuestion(quizId: string, params: UpsertQuestionParams): Promise<void> {
  if (!supabase) {
    const list = DEMO_QUESTIONS[quizId] || [];
    const qId = params.id || `qb-${Date.now()}`;
    const newOptions = (params.options || []).map((o, idx) => ({
      id: o.id || `opt-${idx}-${Date.now()}`,
      optionText: o.optionText,
      optionTextArabic: o.optionTextArabic,
      isCorrect: o.isCorrect,
      orderIndex: o.orderIndex,
    }));

    const existingIndex = list.findIndex((q) => q.id === qId);
    const item: QuestionItem = {
      id: qId,
      questionText: params.questionText,
      questionTextArabic: params.questionTextArabic,
      questionType: params.questionType,
      points: params.points,
      orderIndex: params.orderIndex,
      isRequired: params.isRequired !== false,
      explanation: params.explanation,
      explanationArabic: params.explanationArabic,
      correctAnswerText: params.correctAnswerText,
      gradingGuidelines: params.gradingGuidelines,
      options: newOptions,
    };

    if (existingIndex >= 0) {
      list[existingIndex] = item;
    } else {
      list.push(item);
    }
    DEMO_QUESTIONS[quizId] = list;
    return;
  }

  const { data: userRes } = await supabase.auth.getUser();
  const callerId = userRes?.user?.id;

  let questionId = params.id;

  if (questionId) {
    // Update existing question bank record
    const { error: updErr } = await supabase
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

    if (updErr) throw new Error(`Failed to update question: ${updErr.message}`);

    // Update quiz_questions linkage
    await supabase
      .from('quiz_questions')
      .update({
        points: params.points,
        order_index: params.orderIndex,
        is_required: params.isRequired !== false,
      })
      .eq('quiz_id', quizId)
      .eq('question_id', questionId);
  } else {
    // Insert new question bank record
    const { data: qData, error: qErr } = await supabase
      .from('question_bank')
      .insert({
        teacher_id: callerId,
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

    if (qErr) throw new Error(`Failed to create question: ${qErr.message}`);
    questionId = qData.id;

    // Link into quiz_questions
    const { error: linkErr } = await supabase
      .from('quiz_questions')
      .insert({
        quiz_id: quizId,
        question_id: questionId,
        points: params.points,
        order_index: params.orderIndex,
        is_required: params.isRequired !== false,
      });

    if (linkErr) throw new Error(`Failed to link question to quiz: ${linkErr.message}`);
  }

  // Handle options for objective questions
  if (params.questionType !== 'short_answer' && params.options && params.options.length > 0) {
    // Clean and replace options
    await supabase.from('question_options').delete().eq('question_id', questionId);

    const optPayload = params.options.map((o) => ({
      question_id: questionId,
      option_text: o.optionText,
      option_text_arabic: o.optionTextArabic || null,
      is_correct: !!o.isCorrect,
      order_index: o.orderIndex,
    }));

    const { error: optErr } = await supabase.from('question_options').insert(optPayload);
    if (optErr) throw new Error(`Failed to save question options: ${optErr.message}`);
  }
}

export async function deleteQuizQuestion(quizId: string, questionId: string): Promise<void> {
  if (!supabase) {
    if (DEMO_QUESTIONS[quizId]) {
      DEMO_QUESTIONS[quizId] = DEMO_QUESTIONS[quizId].filter((q) => q.id !== questionId);
    }
    return;
  }

  const { error } = await supabase
    .from('quiz_questions')
    .delete()
    .eq('quiz_id', quizId)
    .eq('question_id', questionId);

  if (error) throw new Error(`Failed to remove question: ${error.message}`);
}

// -----------------------------------------------------------------------------
// STUDENT ASSESSMENT APIS
// -----------------------------------------------------------------------------

export async function fetchStudentAssessments(): Promise<QuizRecord[]> {
  if (!supabase) {
    return DEMO_QUIZZES.map((q) => ({
      ...q,
      studentState: 'available',
      userAttemptsCount: 0,
    }));
  }

  // Student RLS policy ensures students only receive published, non-archived quizzes for their groups/courses
  const { data: rows, error } = await supabase
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

  if (error) throw new Error(`Failed to fetch assessments: ${error.message}`);
  if (!rows) return [];

  // Fetch the student's existing attempts for these quizzes
  const quizIds = rows.map((r) => r.id);
  const { data: userAttempts } = await supabase
    .from('quiz_attempts')
    .select('id, quiz_id, status, expires_at, score, percentage_score, is_passed, started_at, completed_at')
    .in('quiz_id', quizIds)
    .order('started_at', { ascending: false });

  const attemptsByQuiz = new Map<string, any[]>();
  for (const a of userAttempts || []) {
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
  if (!supabase) {
    const questions = DEMO_QUESTIONS[quizId] || [];
    const expiresAt = new Date(Date.now() + 45 * 60000).toISOString();
    return {
      attemptId: `att-${Date.now()}`,
      quizId,
      attemptNumber: 1,
      startedAt: new Date().toISOString(),
      expiresAt,
      timeLimitSeconds: 2700,
      questionSnapshot: questions.map((q) => ({
        ...q,
        options: q.options.map((o) => ({ ...o, isCorrect: undefined })),
      })),
      isRestored: false,
    };
  }

  // Invoke atomic PostgreSQL RPC
  const { data, error } = await supabase.rpc('start_quiz_attempt', {
    p_quiz_id: quizId,
  });

  if (error) {
    throw new Error(`Failed to start assessment: ${error.message}`);
  }

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
  if (!supabase) return;

  const payload = answers.map((a) => ({
    question_id: a.questionId,
    selected_option_id: a.selectedOptionId || null,
    answer_text: a.answerText || null,
  }));

  const { error } = await supabase.rpc('save_quiz_answers', {
    p_attempt_id: attemptId,
    p_answers: payload,
  });

  if (error) {
    throw new Error(`Failed to save answers: ${error.message}`);
  }
}

export async function submitQuizAttempt(
  attemptId: string,
  answers?: { questionId: string; selectedOptionId?: string | null; answerText?: string | null }[]
): Promise<any> {
  if (!supabase) {
    return {
      attempt_id: attemptId,
      status: 'graded',
      score: 15,
      percentage_score: 75,
      total_possible: 20,
      is_passed: true,
      requires_manual_grading: false,
    };
  }

  const payload = answers
    ? answers.map((a) => ({
        question_id: a.questionId,
        selected_option_id: a.selectedOptionId || null,
        answer_text: a.answerText || null,
      }))
    : null;

  const { data, error } = await supabase.rpc('submit_quiz_attempt', {
    p_attempt_id: attemptId,
    p_answers: payload,
  });

  if (error) {
    throw new Error(`Submission failed: ${error.message}`);
  }

  return data;
}

export async function getQuizAttemptReview(attemptId: string): Promise<AttemptReviewData> {
  if (!supabase) {
    return {
      attemptId,
      quizId: 'qqqqqqqq-1111-4111-8111-111111111111',
      quizTitle: 'IELTS Academic Writing Task 2 Diagnostic Assessment',
      quizTitleArabic: 'التقييم التشخيصي: مقال الرأي والنقاش الأكاديمي (الآيلتس)',
      status: 'graded',
      startedAt: new Date(Date.now() - 3600000).toISOString(),
      completedAt: new Date().toISOString(),
      score: 15,
      totalPossible: 20,
      percentageScore: 75,
      isPassed: true,
      requiresManualGrading: false,
      allowCorrectAnswers: true,
      allowScores: true,
      questions: [],
    };
  }

  const { data, error } = await supabase.rpc('get_quiz_attempt_review', {
    p_attempt_id: attemptId,
  });

  if (error) {
    throw new Error(`Failed to load review: ${error.message}`);
  }

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
  if (!supabase) {
    return DEMO_ATTEMPTS.filter((a) => a.quizId === quizId);
  }

  const { data: rows, error } = await supabase
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

  if (error) throw new Error(`Failed to fetch quiz submissions: ${error.message}`);
  if (!rows) return [];

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
  if (!supabase) {
    return {
      attempt_id: attemptId,
      status: 'graded',
      points_scored: 18,
      percentage_score: 90,
      is_passed: true,
    };
  }

  const { data, error } = await supabase.rpc('grade_student_attempt', {
    p_attempt_id: attemptId,
    p_grades: grades.map((g) => ({
      question_id: g.questionId,
      points_awarded: g.pointsAwarded,
      feedback: g.feedback || null,
    })),
    p_teacher_feedback: teacherFeedback || null,
  });

  if (error) {
    throw new Error(`Grading failed: ${error.message}`);
  }

  return data;
}
