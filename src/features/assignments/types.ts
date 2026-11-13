/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type AssignmentType = 'written' | 'file_upload' | 'practical' | 'mixed';
export type AssignmentStatus = 'draft' | 'published' | 'closed' | 'archived';
export type SubmissionStatus = 'draft' | 'submitted' | 'graded' | 'returned_for_revision';

export interface AssignmentAttachment {
  id?: string;
  name: string;
  path: string;
  url?: string;
  size?: number;
  mimeType?: string;
  uploadedAt?: string;
}

export interface RubricCriterion {
  id: string;
  title: string;
  titleArabic?: string;
  description?: string;
  maxPoints: number;
}

export interface AssignmentTarget {
  id?: string;
  assignmentId?: string;
  targetType: 'group' | 'student';
  groupId?: string;
  studentId?: string;
  groupName?: string;
  studentName?: string;
}

export interface AssignmentRecord {
  id: string;
  teacherId: string;
  courseId: string;
  unitId?: string | null;
  lessonId?: string | null;
  title: string;
  titleArabic: string;
  instructions: string;
  instructionsArabic?: string | null;
  assignmentType: AssignmentType;
  dueDate: string;
  publishAt?: string | null;
  cutoffDate?: string | null;
  maxScore: number;
  targetGroupId?: string | null;
  isPublished: boolean;
  status: AssignmentStatus;
  allowLateSubmissions: boolean;
  latePenaltyPercentage: number;
  gracePeriodMinutes: number;
  maxAttempts: number;
  attachments: AssignmentAttachment[];
  rubric: RubricCriterion[];
  createdAt: string;
  updatedAt: string;
  // Joined relation fields
  course?: { id: string; title: string; titleArabic?: string | null } | null;
  unit?: { id: string; title: string; titleArabic?: string | null } | null;
  lesson?: { id: string; title: string; titleArabic?: string | null } | null;
  targets?: AssignmentTarget[];
  // Aggregate stats
  totalSubmissions?: number;
  pendingGrading?: number;
  gradedCount?: number;
}

export interface SubmissionRecord {
  id: string;
  assignmentId: string;
  studentId: string;
  attemptNumber: number;
  content?: string | null;
  fileUrl?: string | null;
  attachments: AssignmentAttachment[];
  studentComment?: string | null;
  submittedAt: string;
  isLate: boolean;
  status: SubmissionStatus;
  score?: number | null;
  teacherFeedback?: string | null;
  privateTeacherNotes?: string | null;
  rubricScores?: Record<string, number>;
  gradedAt?: string | null;
  gradedBy?: string | null;
  isGradeReleased: boolean;
  releasedAt?: string | null;
  updatedAt: string;
  // Joined student relation
  student?: {
    id: string;
    fullName: string;
    fullNameArabic?: string | null;
    studentNumber?: string | null;
    groupName?: string | null;
  } | null;
}

export interface GradingHistoryRecord {
  id: string;
  submissionId: string;
  assignmentId: string;
  studentId: string;
  gradedBy: string;
  previousScore?: number | null;
  newScore: number;
  previousFeedback?: string | null;
  newFeedback?: string | null;
  actionType: 'grade' | 'regrade' | 'return_for_revision' | 'release_grade';
  isGradeReleased: boolean;
  createdAt: string;
  graderName?: string;
}

export interface CreateAssignmentPayload {
  courseId: string;
  unitId?: string | null;
  lessonId?: string | null;
  title: string;
  titleArabic?: string;
  instructions: string;
  instructionsArabic?: string | null;
  assignmentType: AssignmentType;
  dueDate: string;
  publishAt?: string | null;
  cutoffDate?: string | null;
  maxScore: number;
  targetGroupId?: string | null;
  status?: AssignmentStatus;
  allowLateSubmissions?: boolean;
  latePenaltyPercentage?: number;
  gracePeriodMinutes?: number;
  maxAttempts?: number;
  attachments?: AssignmentAttachment[];
  rubric?: RubricCriterion[];
  targets?: { targetType: 'group' | 'student'; groupId?: string; studentId?: string }[];
}

export interface GradeSubmissionPayload {
  submissionId: string;
  score: number;
  feedback?: string;
  privateNotes?: string;
  rubricScores?: Record<string, number>;
  releaseGrade?: boolean;
  actionType?: 'grade' | 'regrade' | 'return_for_revision';
}

export interface AssignmentStats {
  total: number;
  published: number;
  drafts: number;
  closed: number;
  totalSubmissions: number;
  pendingGrading: number;
}
