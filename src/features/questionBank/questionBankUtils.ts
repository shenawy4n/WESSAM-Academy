import {
  QuestionBankItem,
  QuestionOptionItem,
  QuestionType,
  DifficultyLevel,
  QuestionValidationIssue,
  ParsedImportRow,
  ImportValidationSummary,
} from './types';

export const QUESTION_TYPES: { value: QuestionType; labelEn: string; labelAr: string }[] = [
  { value: 'multiple_choice', labelEn: 'Multiple Choice (Single)', labelAr: 'اختيار من متعدد (إجابة واحدة)' },
  { value: 'multiple_select', labelEn: 'Multiple Select (Multi-Answer)', labelAr: 'اختيار متعدد (أكثر من إجابة)' },
  { value: 'true_false', labelEn: 'True / False', labelAr: 'صح / خطأ' },
  { value: 'short_answer', labelEn: 'Short Answer', labelAr: 'إجابة قصيرة' },
  { value: 'essay', labelEn: 'Essay / Long Answer', labelAr: 'سؤال مقالي' },
  { value: 'fill_in_the_blank', labelEn: 'Fill in the Blank', labelAr: 'املأ الفراغ' },
  { value: 'matching', labelEn: 'Matching Pairs', labelAr: 'توصيل / مطابقة' },
];

export const DIFFICULTY_LEVELS: { value: DifficultyLevel; labelEn: string; labelAr: string; color: string }[] = [
  { value: 'easy', labelEn: 'Easy', labelAr: 'سهل', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { value: 'medium', labelEn: 'Medium', labelAr: 'متوسط', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { value: 'hard', labelEn: 'Hard', labelAr: 'صعب', color: 'bg-rose-50 text-rose-700 border-rose-200' },
];

/**
 * Validate a question and its options before saving or committing.
 */
export function validateQuestionItem(
  item: Partial<QuestionBankItem>,
  options: QuestionOptionItem[] = []
): QuestionValidationIssue[] {
  const issues: QuestionValidationIssue[] = [];

  // Question text validation
  if (!item.question_text || item.question_text.trim() === '') {
    issues.push({
      field: 'question_text',
      message: 'Question text is required',
      messageArabic: 'نص السؤال مطلوب باللغة الإنجليزية أو العربية',
    });
  }

  // Points validation
  if (item.points === undefined || item.points === null || Number(item.points) < 0) {
    issues.push({
      field: 'points',
      message: 'Points must be 0 or greater',
      messageArabic: 'الدرجات يجب أن تكون 0 أو أكثر',
    });
  }

  // Type-specific validations
  const qType = item.question_type;
  if (!qType) {
    issues.push({
      field: 'question_type',
      message: 'Question type is required',
      messageArabic: 'نوع السؤال مطلوب',
    });
    return issues;
  }

  const correctOptions = options.filter((o) => o.is_correct);

  if (qType === 'multiple_choice') {
    if (options.length < 2) {
      issues.push({
        field: 'options',
        message: 'Multiple choice requires at least 2 options',
        messageArabic: 'أسئلة الاختيار من متعدد تتطلب خيارين على الأقل',
      });
    }
    if (correctOptions.length !== 1) {
      issues.push({
        field: 'options',
        message: 'Multiple choice requires exactly one correct option',
        messageArabic: 'يجب تحديد إجابة صحيحة واحدة بالضبط لاختيار من متعدد',
      });
    }
    const emptyOptions = options.filter((o) => !o.option_text || o.option_text.trim() === '');
    if (emptyOptions.length > 0) {
      issues.push({
        field: 'options',
        message: 'All options must have non-empty text',
        messageArabic: 'جميع الخيارات يجب أن تحتوي على نص',
      });
    }
  } else if (qType === 'multiple_select') {
    if (options.length < 2) {
      issues.push({
        field: 'options',
        message: 'Multiple select requires at least 2 options',
        messageArabic: 'أسئلة الاختيار المتعدد تتطلب خيارين على الأقل',
      });
    }
    if (correctOptions.length < 1) {
      issues.push({
        field: 'options',
        message: 'Multiple select requires at least one correct option',
        messageArabic: 'يجب تحديد إجابة صحيحة واحدة على الأقل للاختيار المتعدد',
      });
    }
    const emptyOptions = options.filter((o) => !o.option_text || o.option_text.trim() === '');
    if (emptyOptions.length > 0) {
      issues.push({
        field: 'options',
        message: 'All options must have non-empty text',
        messageArabic: 'جميع الخيارات يجب أن تحتوي على نص',
      });
    }
  } else if (qType === 'true_false') {
    if (options.length !== 2) {
      issues.push({
        field: 'options',
        message: 'True/False requires exactly 2 options (True and False)',
        messageArabic: 'سؤال صح/خطأ يتطلب خيارين بالضبط',
      });
    }
    if (correctOptions.length !== 1) {
      issues.push({
        field: 'options',
        message: 'True/False requires exactly one correct answer',
        messageArabic: 'يجب تحديد صح أو خطأ كإجابة صحيحة واحدة',
      });
    }
  } else if (qType === 'short_answer' || qType === 'fill_in_the_blank') {
    if (options.length < 1) {
      issues.push({
        field: 'options',
        message: 'Provide at least one accepted answer/key',
        messageArabic: 'يجب تقديم إجابة مقبولة واحدة على الأقل أو نموذج إجابة',
      });
    }
  } else if (qType === 'matching') {
    if (options.length < 2) {
      issues.push({
        field: 'options',
        message: 'Matching requires at least 2 pairs',
        messageArabic: 'سؤال التوصيل يتطلب زوجين من العناصر على الأقل',
      });
    }
    const missingTarget = options.filter(
      (o) => !o.target_match_text || o.target_match_text.trim() === ''
    );
    if (missingTarget.length > 0) {
      issues.push({
        field: 'options',
        message: 'Every matching item must have a corresponding target match text',
        messageArabic: 'كل عنصر في التوصيل يجب أن يكون له عنصر مطابق',
      });
    }
  } else if (qType === 'essay') {
    // Essay doesn't require options, but can have rubric/guide in metadata or explanation
  }

  return issues;
}

/**
 * Filter questions based on filter parameters
 */
export function filterQuestions(
  items: QuestionBankItem[],
  query: string,
  typeFilter: QuestionType | 'all',
  difficultyFilter: DifficultyLevel | 'all',
  courseFilter: string | 'all',
  lifecycleFilter: 'active' | 'archived' | 'all',
  tagFilter: string = ''
): QuestionBankItem[] {
  const q = query.trim().toLowerCase();
  const tag = tagFilter.trim().toLowerCase();

  return items.filter((item) => {
    // Lifecycle
    if (lifecycleFilter === 'active' && !item.is_active) return false;
    if (lifecycleFilter === 'archived' && item.is_active) return false;

    // Type
    if (typeFilter !== 'all' && item.question_type !== typeFilter) return false;

    // Difficulty
    if (difficultyFilter !== 'all' && item.difficulty !== difficultyFilter) return false;

    // Course
    if (courseFilter !== 'all' && item.course_id !== courseFilter) return false;

    // Tag
    if (tag) {
      const hasTag = item.tags && item.tags.some((t) => t.toLowerCase().includes(tag));
      if (!hasTag) return false;
    }

    // Text search (English text, Arabic text, explanation, topic, tags)
    if (q) {
      const matchText = item.question_text?.toLowerCase().includes(q);
      const matchArabic = item.question_text_arabic?.toLowerCase().includes(q);
      const matchExp = item.explanation?.toLowerCase().includes(q);
      const matchTopic = item.topic?.toLowerCase().includes(q);
      const matchCourse = item.course?.title?.toLowerCase().includes(q);
      const matchOption = item.options?.some(
        (opt) =>
          opt.option_text?.toLowerCase().includes(q) ||
          opt.option_text_arabic?.toLowerCase().includes(q) ||
          opt.target_match_text?.toLowerCase().includes(q)
      );

      if (!matchText && !matchArabic && !matchExp && !matchTopic && !matchCourse && !matchOption) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Sort question items
 */
export function sortQuestions(
  items: QuestionBankItem[],
  sortBy: 'created_at' | 'points' | 'difficulty' | 'question_text',
  order: 'asc' | 'desc'
): QuestionBankItem[] {
  const diffOrder: Record<DifficultyLevel, number> = { easy: 1, medium: 2, hard: 3 };

  return [...items].sort((a, b) => {
    let cmp = 0;
    if (sortBy === 'created_at') {
      cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    } else if (sortBy === 'points') {
      cmp = a.points - b.points;
    } else if (sortBy === 'difficulty') {
      cmp = diffOrder[a.difficulty] - diffOrder[b.difficulty];
    } else if (sortBy === 'question_text') {
      cmp = (a.question_text || '').localeCompare(b.question_text || '');
    }
    return order === 'asc' ? cmp : -cmp;
  });
}

/**
 * Compute aggregate statistics for questions
 */
export function computeQuestionBankStats(items: QuestionBankItem[]): {
  total: number;
  active: number;
  archived: number;
  by_type: Record<QuestionType, number>;
  by_difficulty: Record<DifficultyLevel, number>;
} {
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

  let active = 0;
  let archived = 0;

  for (const item of items) {
    if (item.is_active) active++;
    else archived++;

    if (by_type[item.question_type] !== undefined) {
      by_type[item.question_type]++;
    }
    if (by_difficulty[item.difficulty] !== undefined) {
      by_difficulty[item.difficulty]++;
    }
  }

  return {
    total: items.length,
    active,
    archived,
    by_type,
    by_difficulty,
  };
}

/**
 * Export questions to formatted JSON
 */
export function exportQuestionsToJson(items: QuestionBankItem[]): string {
  const exportPayload = {
    exported_at: new Date().toISOString(),
    system: 'WESSAM Academy - Question Bank Module',
    version: '1.0',
    count: items.length,
    questions: items.map((q) => ({
      question_text: q.question_text,
      question_text_arabic: q.question_text_arabic,
      question_type: q.question_type,
      difficulty: q.difficulty,
      points: q.points,
      explanation: q.explanation,
      topic: q.topic,
      tags: q.tags || [],
      time_limit_seconds: q.time_limit_seconds,
      metadata: q.metadata || {},
      options: (q.options || []).map((opt) => ({
        option_text: opt.option_text,
        option_text_arabic: opt.option_text_arabic,
        is_correct: opt.is_correct,
        order_index: opt.order_index,
        explanation: opt.explanation,
        target_match_text: opt.target_match_text,
        target_match_arabic: opt.target_match_arabic,
      })),
    })),
  };

  return JSON.stringify(exportPayload, null, 2);
}

/**
 * Generate standard CSV template for import
 */
export function generateQuestionBankCsvTemplate(): string {
  const headers = [
    'question_text',
    'question_text_arabic',
    'question_type',
    'difficulty',
    'points',
    'topic',
    'tags',
    'explanation',
    'option_1',
    'option_1_correct',
    'option_2',
    'option_2_correct',
    'option_3',
    'option_3_correct',
    'option_4',
    'option_4_correct',
    'matching_pair_1_source',
    'matching_pair_1_target',
    'matching_pair_2_source',
    'matching_pair_2_target',
  ];

  const sampleRows = [
    [
      '"What is the past tense of the verb \\"go\\"?"',
      '"ما هو زمن الماضي للفعل \\"go\\"؟"',
      'multiple_choice',
      'easy',
      '2',
      'Grammar - Irregular Verbs',
      'grammar,verbs,past-tense',
      '"Went is the irregular past tense of go."',
      'Went',
      'true',
      'Goed',
      'false',
      'Gone',
      'false',
      'Going',
      'false',
      '',
      '',
      '',
      '',
    ].join(','),
    [
      '"Select all modal verbs from the list:"',
      '"اختر جميع الأفعال الناقصة من القائمة:"',
      'multiple_select',
      'medium',
      '3',
      'Grammar - Modals',
      'grammar,modals',
      '"Could and should are modal verbs."',
      'Could',
      'true',
      'Should',
      'true',
      'Running',
      'false',
      'Quickly',
      'false',
      '',
      '',
      '',
      '',
    ].join(','),
    [
      '"The sun rises in the west."',
      '"تشرق الشمس من الغرب."',
      'true_false',
      'easy',
      '1',
      'General Science & English',
      'science,true-false',
      '"The sun rises in the east."',
      'True',
      'false',
      'False',
      'true',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ].join(','),
    [
      '"Match the synonyms:"',
      '"صل بين الكلمات المترادفة:"',
      'matching',
      'medium',
      '4',
      'Vocabulary',
      'vocab,synonyms',
      '"Accurate pairings of English adjectives."',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'Huge',
      'Enormous',
      'Tiny',
      'Minuscule',
    ].join(','),
  ];

  return [headers.join(','), ...sampleRows].join('\n');
}

/**
 * Generate JSON template for import
 */
export function generateQuestionBankJsonTemplate(): string {
  return JSON.stringify(
    {
      version: '1.0',
      questions: [
        {
          question_text: 'Choose the correct preposition: She is interested ___ learning English.',
          question_text_arabic: 'اختر حرف الجر الصحيح: هي مهتمة بتعلم اللغة الإنجليزية.',
          question_type: 'multiple_choice',
          difficulty: 'easy',
          points: 2,
          topic: 'Prepositions',
          tags: ['grammar', 'prepositions'],
          explanation: 'The adjective "interested" takes the preposition "in".',
          options: [
            { option_text: 'in', is_correct: true, order_index: 0 },
            { option_text: 'at', is_correct: false, order_index: 1 },
            { option_text: 'on', is_correct: false, order_index: 2 },
            { option_text: 'for', is_correct: false, order_index: 3 },
          ],
        },
        {
          question_text: 'Match each word to its definition:',
          question_text_arabic: 'صل كل كلمة بتعريفها المناسب:',
          question_type: 'matching',
          difficulty: 'medium',
          points: 4,
          topic: 'Vocabulary',
          tags: ['vocab'],
          options: [
            { option_text: 'Benevolent', target_match_text: 'Kind and generous', is_correct: true, order_index: 0 },
            { option_text: 'Diligent', target_match_text: 'Hardworking and careful', is_correct: true, order_index: 1 },
          ],
        },
      ],
    },
    null,
    2
  );
}

/**
 * Parse CSV text into tokens supporting quotes
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

/**
 * Parse and validate CSV data
 */
export function parseAndValidateCsv(csvText: string): ImportValidationSummary {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return {
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      rows: [],
    };
  }

  const rawHeaders = parseCsvLine(lines[0]).map((h) => h.replace(/^["']|["']$/g, '').toLowerCase().trim());
  const rows: ParsedImportRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const rowMap: Record<string, string> = {};
    rawHeaders.forEach((h, idx) => {
      rowMap[h] = values[idx] !== undefined ? values[idx].replace(/^["']|["']$/g, '') : '';
    });

    const rowErrors: QuestionValidationIssue[] = [];

    const questionText = rowMap['question_text'] || '';
    const questionTextAr = rowMap['question_text_arabic'] || null;
    const qTypeRaw = (rowMap['question_type'] || '').toLowerCase();
    const difficultyRaw = (rowMap['difficulty'] || 'medium').toLowerCase() as DifficultyLevel;
    const pointsRaw = Number(rowMap['points'] || 1);
    const topic = rowMap['topic'] || null;
    const tags = rowMap['tags']
      ? rowMap['tags'].split(',').map((t) => t.trim()).filter(Boolean)
      : [];
    const explanation = rowMap['explanation'] || null;

    // Validate type enum
    const validTypes: QuestionType[] = [
      'multiple_choice',
      'multiple_select',
      'true_false',
      'short_answer',
      'essay',
      'fill_in_the_blank',
      'matching',
    ];
    let qType: QuestionType = 'multiple_choice';
    if (!validTypes.includes(qTypeRaw as QuestionType)) {
      rowErrors.push({
        field: 'question_type',
        message: `Invalid question type: "${qTypeRaw}". Must be one of: ${validTypes.join(', ')}`,
        messageArabic: `نوع سؤال غير صالح: "${qTypeRaw}"`,
      });
    } else {
      qType = qTypeRaw as QuestionType;
    }

    const options: QuestionOptionItem[] = [];

    if (qType === 'matching') {
      for (let p = 1; p <= 5; p++) {
        const src = rowMap[`matching_pair_${p}_source`];
        const tgt = rowMap[`matching_pair_${p}_target`];
        if (src && tgt) {
          options.push({
            option_text: src,
            target_match_text: tgt,
            is_correct: true,
            order_index: p - 1,
          });
        }
      }
    } else {
      for (let optIdx = 1; optIdx <= 6; optIdx++) {
        const optText = rowMap[`option_${optIdx}`];
        if (optText) {
          const isCorrect = (rowMap[`option_${optIdx}_correct`] || '').toLowerCase() === 'true';
          options.push({
            option_text: optText,
            is_correct: isCorrect,
            order_index: optIdx - 1,
          });
        }
      }
    }

    const item: Partial<QuestionBankItem> = {
      question_text: questionText,
      question_text_arabic: questionTextAr,
      question_type: qType,
      difficulty: ['easy', 'medium', 'hard'].includes(difficultyRaw) ? difficultyRaw : 'medium',
      points: isNaN(pointsRaw) ? 1 : pointsRaw,
      topic,
      tags,
      explanation,
      is_active: true,
      metadata: {},
    };

    // Run semantic validation
    const semanticIssues = validateQuestionItem(item, options);
    rowErrors.push(...semanticIssues);

    rows.push({
      rowNumber: i + 1,
      raw: rowMap,
      item,
      options,
      errors: rowErrors,
      isValid: rowErrors.length === 0,
    });
  }

  return {
    totalRows: rows.length,
    validRows: rows.filter((r) => r.isValid).length,
    invalidRows: rows.filter((r) => !r.isValid).length,
    rows,
  };
}

/**
 * Parse and validate JSON data
 */
export function parseAndValidateJson(jsonText: string): ImportValidationSummary {
  let parsed: any;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err: any) {
    return {
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      rows: [
        {
          rowNumber: 1,
          raw: {},
          errors: [
            {
              message: `Invalid JSON syntax: ${err.message}`,
              messageArabic: `صيغة JSON غير صحيحة: ${err.message}`,
            },
          ],
          isValid: false,
        },
      ],
    };
  }

  const rawList: any[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.questions)
    ? parsed.questions
    : [];

  const rows: ParsedImportRow[] = [];

  rawList.forEach((raw, idx) => {
    const rowErrors: QuestionValidationIssue[] = [];

    const item: Partial<QuestionBankItem> = {
      question_text: raw.question_text || '',
      question_text_arabic: raw.question_text_arabic || null,
      question_type: raw.question_type,
      difficulty: raw.difficulty || 'medium',
      points: raw.points !== undefined ? Number(raw.points) : 1,
      topic: raw.topic || null,
      tags: Array.isArray(raw.tags) ? raw.tags : [],
      explanation: raw.explanation || null,
      time_limit_seconds: raw.time_limit_seconds ? Number(raw.time_limit_seconds) : null,
      is_active: raw.is_active !== undefined ? Boolean(raw.is_active) : true,
      metadata: raw.metadata || {},
    };

    const options: QuestionOptionItem[] = (raw.options || []).map((o: any, oIdx: number) => ({
      option_text: o.option_text || '',
      option_text_arabic: o.option_text_arabic || null,
      is_correct: Boolean(o.is_correct),
      order_index: o.order_index !== undefined ? o.order_index : oIdx,
      explanation: o.explanation || null,
      target_match_text: o.target_match_text || null,
      target_match_arabic: o.target_match_arabic || null,
    }));

    const semanticIssues = validateQuestionItem(item, options);
    rowErrors.push(...semanticIssues);

    rows.push({
      rowNumber: idx + 1,
      raw,
      item,
      options,
      errors: rowErrors,
      isValid: rowErrors.length === 0,
    });
  });

  return {
    totalRows: rows.length,
    validRows: rows.filter((r) => r.isValid).length,
    invalidRows: rows.filter((r) => !r.isValid).length,
    rows,
  };
}
