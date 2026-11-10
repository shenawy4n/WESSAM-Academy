export type QuestionType =
  | 'multiple_choice'
  | 'multiple_select'
  | 'true_false'
  | 'short_answer'
  | 'essay'
  | 'fill_in_the_blank'
  | 'matching';

export type DifficultyLevel = 'easy' | 'medium' | 'hard';

export interface QuestionOptionItem {
  id?: string;
  question_id?: string;
  option_text: string;
  option_text_arabic?: string | null;
  is_correct: boolean;
  order_index: number;
  explanation?: string | null;
  target_match_text?: string | null;
  target_match_arabic?: string | null;
  metadata?: Record<string, any>;
}

export interface QuestionBankItem {
  id: string;
  teacher_id: string;
  course_id: string | null;
  unit_id: string | null;
  lesson_id: string | null;
  question_text: string;
  question_text_arabic: string | null;
  question_type: QuestionType;
  difficulty: DifficultyLevel;
  points: number;
  explanation: string | null;
  topic: string | null;
  tags: string[];
  time_limit_seconds: number | null;
  is_active: boolean;
  archived_at: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  options?: QuestionOptionItem[];
  // Joined relation fields
  course?: { id: string; title: string; title_arabic?: string | null } | null;
  teacher?: { id: string; email: string; raw_user_meta_data?: { full_name?: string } } | null;
}

export interface QuestionBankFilters {
  searchQuery: string;
  questionType: QuestionType | 'all';
  difficulty: DifficultyLevel | 'all';
  courseId: string | 'all';
  topic: string | 'all';
  tag: string | '';
  lifecycle: 'active' | 'archived' | 'all';
  sortBy: 'created_at' | 'points' | 'difficulty' | 'question_text';
  sortOrder: 'asc' | 'desc';
}

export interface QuestionBankStats {
  total: number;
  active: number;
  archived: number;
  by_type: Record<QuestionType, number>;
  by_difficulty: Record<DifficultyLevel, number>;
}

export interface QuestionValidationIssue {
  field?: string;
  message: string;
  messageArabic: string;
}

export interface ParsedImportRow {
  rowNumber: number;
  raw: Record<string, any>;
  item?: Partial<QuestionBankItem>;
  options?: QuestionOptionItem[];
  errors: QuestionValidationIssue[];
  isValid: boolean;
}

export interface ImportValidationSummary {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  rows: ParsedImportRow[];
}
