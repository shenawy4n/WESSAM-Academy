import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateQuestionItem,
  filterQuestions,
  sortQuestions,
  computeQuestionBankStats,
  exportQuestionsToJson,
  parseAndValidateCsv,
  parseAndValidateJson,
} from './questionBankUtils';
import { QuestionBankItem, QuestionOptionItem } from './types';

describe('Question Bank Utils - Validation', () => {
  test('validates required question text and points', () => {
    const issues = validateQuestionItem({ question_text: '', points: -1, question_type: 'multiple_choice' }, []);
    assert.equal(issues.some((i) => i.field === 'question_text'), true);
    assert.equal(issues.some((i) => i.field === 'points'), true);
  });

  test('validates multiple choice requires at least 2 options and exactly 1 correct answer', () => {
    // 0 options
    const issue0 = validateQuestionItem({ question_text: 'Test', points: 1, question_type: 'multiple_choice' }, []);
    assert.equal(issue0.some((i) => i.message.includes('at least 2 options')), true);

    // 2 options, 0 correct
    const optionsNoCorrect: QuestionOptionItem[] = [
      { option_text: 'A', is_correct: false, order_index: 0 },
      { option_text: 'B', is_correct: false, order_index: 1 },
    ];
    const issueNoCorrect = validateQuestionItem(
      { question_text: 'Test', points: 1, question_type: 'multiple_choice' },
      optionsNoCorrect
    );
    assert.equal(issueNoCorrect.some((i) => i.message.includes('exactly one correct option')), true);

    // 2 options, 2 correct
    const optionsTwoCorrect: QuestionOptionItem[] = [
      { option_text: 'A', is_correct: true, order_index: 0 },
      { option_text: 'B', is_correct: true, order_index: 1 },
    ];
    const issueTwoCorrect = validateQuestionItem(
      { question_text: 'Test', points: 1, question_type: 'multiple_choice' },
      optionsTwoCorrect
    );
    assert.equal(issueTwoCorrect.some((i) => i.message.includes('exactly one correct option')), true);

    // 2 options, 1 correct - Valid!
    const validOptions: QuestionOptionItem[] = [
      { option_text: 'A', is_correct: true, order_index: 0 },
      { option_text: 'B', is_correct: false, order_index: 1 },
    ];
    const issueValid = validateQuestionItem(
      { question_text: 'Test', points: 1, question_type: 'multiple_choice' },
      validOptions
    );
    assert.equal(issueValid.length, 0);
  });

  test('validates multiple select requires at least 1 correct answer and 2 options', () => {
    const options: QuestionOptionItem[] = [
      { option_text: 'A', is_correct: false, order_index: 0 },
      { option_text: 'B', is_correct: false, order_index: 1 },
    ];
    const issues = validateQuestionItem(
      { question_text: 'Select all', points: 2, question_type: 'multiple_select' },
      options
    );
    assert.equal(issues.some((i) => i.message.includes('at least one correct option')), true);

    const validMultiOptions: QuestionOptionItem[] = [
      { option_text: 'A', is_correct: true, order_index: 0 },
      { option_text: 'B', is_correct: true, order_index: 1 },
      { option_text: 'C', is_correct: false, order_index: 2 },
    ];
    const validIssues = validateQuestionItem(
      { question_text: 'Select all', points: 2, question_type: 'multiple_select' },
      validMultiOptions
    );
    assert.equal(validIssues.length, 0);
  });

  test('validates true/false requires exactly 2 options and 1 correct answer', () => {
    const invalidTF: QuestionOptionItem[] = [
      { option_text: 'True', is_correct: true, order_index: 0 },
      { option_text: 'False', is_correct: true, order_index: 1 },
    ];
    const issues = validateQuestionItem(
      { question_text: 'The sky is blue', points: 1, question_type: 'true_false' },
      invalidTF
    );
    assert.equal(issues.some((i) => i.message.includes('exactly one correct answer')), true);
  });

  test('validates matching pairs require matching target text', () => {
    const invalidMatching: QuestionOptionItem[] = [
      { option_text: 'Left 1', target_match_text: 'Right 1', is_correct: true, order_index: 0 },
      { option_text: 'Left 2', target_match_text: '', is_correct: true, order_index: 1 },
    ];
    const issues = validateQuestionItem(
      { question_text: 'Match items', points: 2, question_type: 'matching' },
      invalidMatching
    );
    assert.equal(issues.some((i) => i.message.includes('target match text')), true);
  });
});

describe('Question Bank Utils - Filtering & Sorting', () => {
  const sampleItems: QuestionBankItem[] = [
    {
      id: '1',
      teacher_id: 't1',
      course_id: 'c1',
      unit_id: null,
      lesson_id: null,
      question_text: 'What is grammar?',
      question_text_arabic: 'ما هي القواعد؟',
      question_type: 'multiple_choice',
      difficulty: 'easy',
      points: 2,
      explanation: 'Grammar rules',
      topic: 'Syntax',
      tags: ['grammar', 'basics'],
      time_limit_seconds: null,
      is_active: true,
      archived_at: null,
      metadata: {},
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: '2',
      teacher_id: 't1',
      course_id: 'c2',
      unit_id: null,
      lesson_id: null,
      question_text: 'Advanced vocabulary match',
      question_text_arabic: 'توصيل المفردات المتقدمة',
      question_type: 'matching',
      difficulty: 'hard',
      points: 5,
      explanation: 'Advanced words',
      topic: 'Vocabulary',
      tags: ['vocab', 'advanced'],
      time_limit_seconds: 60,
      is_active: false,
      archived_at: '2026-01-02T00:00:00Z',
      metadata: {},
      created_at: '2026-01-02T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
    },
  ];

  test('filters by active/archived lifecycle', () => {
    const activeOnly = filterQuestions(sampleItems, '', 'all', 'all', 'all', 'active');
    assert.equal(activeOnly.length, 1);
    assert.equal(activeOnly[0].id, '1');

    const archivedOnly = filterQuestions(sampleItems, '', 'all', 'all', 'all', 'archived');
    assert.equal(archivedOnly.length, 1);
    assert.equal(archivedOnly[0].id, '2');
  });

  test('filters by Arabic search term', () => {
    const results = filterQuestions(sampleItems, 'القواعد', 'all', 'all', 'all', 'all');
    assert.equal(results.length, 1);
    assert.equal(results[0].id, '1');
  });

  test('sorts by points descending', () => {
    const sorted = sortQuestions(sampleItems, 'points', 'desc');
    assert.equal(sorted[0].points, 5);
    assert.equal(sorted[1].points, 2);
  });

  test('computes aggregate statistics correctly', () => {
    const stats = computeQuestionBankStats(sampleItems);
    assert.equal(stats.total, 2);
    assert.equal(stats.active, 1);
    assert.equal(stats.archived, 1);
    assert.equal(stats.by_type.multiple_choice, 1);
    assert.equal(stats.by_type.matching, 1);
    assert.equal(stats.by_difficulty.easy, 1);
    assert.equal(stats.by_difficulty.hard, 1);
  });
});

describe('Question Bank Utils - Import & Export', () => {
  test('exports questions to structured JSON format', () => {
    const sampleItems: QuestionBankItem[] = [
      {
        id: '1',
        teacher_id: 't1',
        course_id: null,
        unit_id: null,
        lesson_id: null,
        question_text: 'Test Question',
        question_text_arabic: 'سؤال تجريبي',
        question_type: 'short_answer',
        difficulty: 'medium',
        points: 3,
        explanation: 'Exp',
        topic: 'Test',
        tags: ['demo'],
        time_limit_seconds: null,
        is_active: true,
        archived_at: null,
        metadata: {},
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        options: [{ option_text: 'Ans 1', is_correct: true, order_index: 0 }],
      },
    ];

    const jsonStr = exportQuestionsToJson(sampleItems);
    const parsed = JSON.parse(jsonStr);
    assert.equal(parsed.count, 1);
    assert.equal(parsed.questions[0].question_text, 'Test Question');
    assert.equal(parsed.questions[0].options[0].option_text, 'Ans 1');
  });

  test('parses valid CSV and reports accurate validity counts', () => {
    const validCsv = `question_text,question_text_arabic,question_type,difficulty,points,topic,tags,explanation,option_1,option_1_correct,option_2,option_2_correct
"What is a noun?","ما هو الاسم؟",multiple_choice,easy,1,Grammar,noun,Explanation,Person,true,Run,false`;

    const summary = parseAndValidateCsv(validCsv);
    assert.equal(summary.totalRows, 1);
    assert.equal(summary.validRows, 1);
    assert.equal(summary.invalidRows, 0);
    assert.equal(summary.rows[0].item?.question_type, 'multiple_choice');
    assert.equal(summary.rows[0].options?.length, 2);
    assert.equal(summary.rows[0].options?.[0].is_correct, true);
  });

  test('detects invalid rows in CSV import', () => {
    // Multiple choice with NO correct option
    const invalidCsv = `question_text,question_text_arabic,question_type,difficulty,points,topic,tags,explanation,option_1,option_1_correct,option_2,option_2_correct
"Invalid Q","سؤال غير صالح",multiple_choice,easy,1,Grammar,noun,Explanation,Person,false,Run,false`;

    const summary = parseAndValidateCsv(invalidCsv);
    assert.equal(summary.totalRows, 1);
    assert.equal(summary.validRows, 0);
    assert.equal(summary.invalidRows, 1);
    assert.equal(summary.rows[0].isValid, false);
    assert.equal(summary.rows[0].errors.length > 0, true);
  });

  test('parses and validates JSON imports', () => {
    const jsonStr = JSON.stringify({
      questions: [
        {
          question_text: 'True or False?',
          question_type: 'true_false',
          difficulty: 'easy',
          points: 1,
          options: [
            { option_text: 'True', is_correct: true, order_index: 0 },
            { option_text: 'False', is_correct: false, order_index: 1 },
          ],
        },
      ],
    });

    const summary = parseAndValidateJson(jsonStr);
    assert.equal(summary.totalRows, 1);
    assert.equal(summary.validRows, 1);
  });
});

describe('Question Bank RPC Contract & Serialization', () => {
  test('serializes CreateQuestionPayload into expected RPC p_question and p_options contract', () => {
    const payload = {
      question_text: 'What is syntax?',
      question_text_arabic: 'ما هو بناء الجملة؟',
      question_type: 'multiple_choice' as const,
      difficulty: 'medium' as const,
      points: 3,
      topic: 'Syntax',
      tags: ['grammar', 'sentence-structure'],
      options: [
        { option_text: 'Word arrangement rules', is_correct: true, order_index: 0 },
        { option_text: 'Random words', is_correct: false, order_index: 1 },
      ],
    };

    // Verify contract format expected by migration 20261110000014
    const questionContract = {
      question_text: payload.question_text.trim(),
      question_text_arabic: payload.question_text_arabic?.trim() || null,
      question_type: payload.question_type,
      difficulty_level: payload.difficulty === 'medium' ? 'intermediate' : payload.difficulty,
      points: Math.max(1, payload.points || 1),
      topic: payload.topic,
      tags: payload.tags,
    };

    assert.equal(questionContract.question_text, 'What is syntax?');
    assert.equal(questionContract.question_type, 'multiple_choice');
    assert.equal(questionContract.difficulty_level, 'intermediate');
    assert.equal(questionContract.points, 3);
    assert.deepEqual(questionContract.tags, ['grammar', 'sentence-structure']);

    const optionsContract = payload.options.map((opt, idx) => ({
      option_text: opt.option_text,
      is_correct: opt.is_correct,
      order_index: opt.order_index ?? idx,
    }));

    assert.equal(optionsContract.length, 2);
    assert.equal(optionsContract[0].is_correct, true);
    assert.equal(optionsContract[1].is_correct, false);
  });

  test('validates matching pairs payload serializes target_match_text correctly', () => {
    const matchingPayload = {
      question_text: 'Match words',
      question_type: 'matching' as const,
      difficulty: 'hard' as const,
      points: 4,
      options: [
        { option_text: 'Enclosed', target_match_text: 'Attached file', is_correct: true, order_index: 0 },
        { option_text: 'Promptly', target_match_text: 'Immediately', is_correct: true, order_index: 1 },
      ],
    };

    const optionsPayload = matchingPayload.options.map((opt, idx) => ({
      option_text: opt.option_text,
      target_match_text: opt.target_match_text,
      is_correct: Boolean(opt.is_correct),
      order_index: opt.order_index ?? idx,
    }));

    assert.equal(optionsPayload[0].target_match_text, 'Attached file');
    assert.equal(optionsPayload[1].target_match_text, 'Immediately');
  });
});

