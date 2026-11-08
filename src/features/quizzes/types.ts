/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type QuestionType = 'multiple_choice' | 'true_false' | 'short_answer';

export type AssessmentStatus = 'upcoming' | 'available' | 'in_progress' | 'completed' | 'draft' | 'archived';

export interface QuestionOption {
  id: string;
  questionId?: string;
  optionText: string;
  optionTextArabic?: string | null;
  isCorrect?: boolean; // Only visible to teacher or when review authorized
  orderIndex: number;
}

export interface QuestionItem {
  id: string;
  questionText: string;
  questionTextArabic?: string | null;
  questionType: QuestionType;
  skillCategory?: string;
  difficultyLevel?: string;
  explanation?: string | null;
  explanationArabic?: string | null;
  points: number;
  orderIndex: number;
  isRequired: boolean;
  correctAnswerText?: string | null; // For short answer (server-side/teacher view)
  gradingGuidelines?: string | null;
  options: QuestionOption[];
}

export interface QuizRecord {
  id: string;
  courseId?: string | null;
  groupId?: string | null;
  lessonId?: string | null;
  teacherId?: string | null;
  title: string;
  titleArabic: string;
  description?: string | null;
  descriptionArabic?: string | null;
  durationMinutes: number;
  passingScore: number;
  maxAttempts: number;
  totalPoints: number;
  isRandomized: boolean;
  isPublished: boolean;
  isArchived: boolean;
  startDate?: string | null;
  endDate?: string | null;
  showResultsImmediately: boolean;
  showCorrectAnswersAfterSubmission: boolean;
  createdAt: string;
  updatedAt: string;
  // Joined details
  courseTitle?: string;
  courseTitleArabic?: string;
  groupName?: string;
  groupNameArabic?: string;
  lessonTitle?: string;
  lessonTitleArabic?: string;
  questionsCount?: number;
  submissionsCount?: number;
  // Student-specific state
  studentState?: AssessmentStatus;
  userAttemptsCount?: number;
  activeAttemptId?: string | null;
  lastAttemptScore?: number | null;
  lastAttemptPercentage?: number | null;
  isPassed?: boolean | null;
}

export interface QuizAttemptRecord {
  id: string;
  quizId: string;
  studentId: string;
  attemptNumber: number;
  startedAt: string;
  completedAt?: string | null;
  submittedAt?: string | null;
  expiresAt: string;
  timeLimitSeconds: number;
  status: 'in_progress' | 'submitted' | 'graded' | 'timed_out';
  score?: number | null;
  pointsScored?: number | null;
  totalPointsPossible: number;
  percentageScore?: number | null;
  isPassed?: boolean | null;
  requiresManualGrading: boolean;
  teacherFeedback?: string | null;
  gradedAt?: string | null;
  gradedBy?: string | null;
  questionSnapshot: QuestionItem[];
  studentName?: string;
  studentNameArabic?: string;
  studentNumber?: string;
}

export interface StudentAnswerItem {
  questionId: string;
  selectedOptionId?: string | null;
  answerText?: string | null;
  isCorrect?: boolean | null;
  pointsAwarded?: number | null;
  teacherFeedback?: string | null;
  needsReview?: boolean;
}

export interface AttemptReviewData {
  attemptId: string;
  quizId: string;
  quizTitle: string;
  quizTitleArabic: string;
  status: string;
  startedAt: string;
  completedAt?: string | null;
  score?: number | null;
  totalPossible: number;
  percentageScore?: number | null;
  isPassed?: boolean | null;
  requiresManualGrading: boolean;
  teacherFeedback?: string | null;
  allowCorrectAnswers: boolean;
  allowScores: boolean;
  questions: {
    questionId: string;
    questionText: string;
    questionTextArabic?: string | null;
    questionType: QuestionType;
    points: number;
    orderIndex: number;
    studentSelectedOptionId?: string | null;
    studentAnswerText?: string | null;
    pointsAwarded?: number | null;
    isCorrect?: boolean | null;
    teacherFeedback?: string | null;
    needsReview?: boolean;
    explanation?: string | null;
    explanationArabic?: string | null;
    correctAnswerText?: string | null;
    options: QuestionOption[];
  }[];
}

export interface CreateQuizParams {
  title: string;
  titleArabic: string;
  description?: string;
  descriptionArabic?: string;
  courseId?: string | null;
  groupId?: string | null;
  lessonId?: string | null;
  durationMinutes: number;
  passingScore: number;
  maxAttempts: number;
  totalPoints: number;
  startDate?: string | null;
  endDate?: string | null;
  showResultsImmediately: boolean;
  showCorrectAnswersAfterSubmission: boolean;
  isPublished?: boolean;
}

export interface UpsertQuestionParams {
  id?: string;
  questionText: string;
  questionTextArabic?: string;
  questionType: QuestionType;
  points: number;
  orderIndex: number;
  isRequired?: boolean;
  explanation?: string;
  explanationArabic?: string;
  correctAnswerText?: string;
  gradingGuidelines?: string;
  options?: {
    id?: string;
    optionText: string;
    optionTextArabic?: string;
    isCorrect: boolean;
    orderIndex: number;
  }[];
}
