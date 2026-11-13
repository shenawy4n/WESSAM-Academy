/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { formatRiyadhDateTime } from '../../lib/dateUtils';
import {
  AssignmentRecord,
  AssignmentType,
  CreateAssignmentPayload,
  SubmissionRecord,
} from './types';

export const ASSIGNMENT_TYPES: { value: AssignmentType; labelAr: string; labelEn: string }[] = [
  { value: 'written', labelAr: 'إجابة نصية مقالية', labelEn: 'Written Response' },
  { value: 'file_upload', labelAr: 'رفع ملفات ومستندات', labelEn: 'File Upload' },
  { value: 'mixed', labelAr: 'إجابة نصية + ملفات مرفقة', labelEn: 'Mixed (Text & Files)' },
  { value: 'practical', labelAr: 'مهمة عملية وتطبيق', labelEn: 'Practical Task' },
];

export const ALLOWED_FILE_EXTENSIONS = [
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'zip',
  'jpg',
  'jpeg',
  'png',
  'mp3',
  'wav',
  'm4a',
  'txt',
];

export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

/**
 * Format date in Asia/Riyadh with the mandatory label: توقيت مكة المكرمة (Asia/Riyadh)
 */
export function formatAssignmentDateTime(isoString: string | null | undefined): string {
  if (!isoString) return '—';
  try {
    const formatted = formatRiyadhDateTime(isoString);
    return `${formatted} (توقيت مكة المكرمة)`;
  } catch {
    return isoString;
  }
}

/**
 * Validates assignment creation/update payload.
 */
export function validateAssignmentPayload(payload: Partial<CreateAssignmentPayload>): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!payload.title || !payload.title.trim()) {
    errors.push('عنوان الواجب بالإنجليزية مطلوب (Title is required)');
  }

  if (!payload.courseId) {
    errors.push('يرجى اختيار الكورس الدراسي (Course is required)');
  }

  if (!payload.dueDate) {
    errors.push('تاريخ ووقت التسليم مطلوب (Due date is required)');
  } else {
    const dueTime = new Date(payload.dueDate).getTime();
    if (isNaN(dueTime)) {
      errors.push('صيغة تاريخ التسليم غير صالحة (Invalid due date format)');
    }
  }

  if (payload.maxScore !== undefined && (payload.maxScore <= 0 || isNaN(payload.maxScore))) {
    errors.push('الدرجة القصوى يجب أن تكون أكبر من صفر (Max score must be greater than zero)');
  }

  if (
    payload.maxAttempts !== undefined &&
    (payload.maxAttempts < 1 || !Number.isInteger(payload.maxAttempts))
  ) {
    errors.push('عدد المحاولات المسموح بها يجب أن يكون 1 على الأقل (Max attempts must be at least 1)');
  }

  if (
    payload.gracePeriodMinutes !== undefined &&
    (payload.gracePeriodMinutes < 0 || isNaN(payload.gracePeriodMinutes))
  ) {
    errors.push('فترة السماح يجب ألا تكون سالبة (Grace period cannot be negative)');
  }

  if (
    payload.latePenaltyPercentage !== undefined &&
    (payload.latePenaltyPercentage < 0 || payload.latePenaltyPercentage > 100)
  ) {
    errors.push('نسبة خصم التأخير يجب أن تتراوح بين 0% و 100% (Late penalty must be between 0% and 100%)');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Server/client late submission calculation logic:
 * Checks whether current time exceeds due date + grace period.
 */
export function computeIsSubmissionLate(
  submissionTimeIso: string,
  dueDateIso: string,
  gracePeriodMinutes = 0
): boolean {
  const subTime = new Date(submissionTimeIso).getTime();
  const dueTime = new Date(dueDateIso).getTime();
  const graceMs = (gracePeriodMinutes || 0) * 60 * 1000;

  if (isNaN(subTime) || isNaN(dueTime)) return false;

  // On time if submitted at or before due date + grace period
  return subTime > dueTime + graceMs;
}

/**
 * Computes remaining time or deadline status for display.
 */
export function getAssignmentDeadlineStatus(
  dueDateIso: string,
  cutoffDateIso?: string | null,
  allowLate = true
): {
  isPastDue: boolean;
  isPastCutoff: boolean;
  labelAr: string;
  badgeColor: string;
} {
  const now = Date.now();
  const due = new Date(dueDateIso).getTime();
  const cutoff = cutoffDateIso ? new Date(cutoffDateIso).getTime() : null;

  if (cutoff && now > cutoff) {
    return {
      isPastDue: true,
      isPastCutoff: true,
      labelAr: 'انتهت المهلة النهائية تماماً (مغلق)',
      badgeColor: 'bg-rose-100 text-rose-800 border-rose-200',
    };
  }

  if (now > due) {
    if (!allowLate) {
      return {
        isPastDue: true,
        isPastCutoff: true,
        labelAr: 'فات موعد التسليم (غير مسموح بالتأخير)',
        badgeColor: 'bg-rose-100 text-rose-800 border-rose-200',
      };
    }
    return {
      isPastDue: true,
      isPastCutoff: false,
      labelAr: 'متأخر (يُقبل مع احتساب التأخير)',
      badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
    };
  }

  const diffMs = due - now;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  let labelAr = '';
  if (diffDays > 1) {
    labelAr = `متبقي ${diffDays} أيام`;
  } else if (diffHours > 0) {
    labelAr = `متبقي ${diffHours} ساعة`;
  } else {
    const diffMin = Math.max(1, Math.floor(diffMs / (1000 * 60)));
    labelAr = `متبقي ${diffMin} دقيقة`;
  }

  return {
    isPastDue: false,
    isPastCutoff: false,
    labelAr,
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  };
}

/**
 * Validates grading score.
 */
export function validateGradeInput(score: number, maxScore: number): { isValid: boolean; error?: string } {
  if (isNaN(score)) {
    return { isValid: false, error: 'يرجى إدخال رقم صحيح للدرجة' };
  }
  if (score < 0) {
    return { isValid: false, error: 'لا يمكن أن تكون الدرجة سالبة' };
  }
  if (score > maxScore) {
    return { isValid: false, error: `الدرجة لا يمكن أن تتجاوز الحد الأقصى (${maxScore})` };
  }
  return { isValid: true };
}

/**
 * Human readable file size formatter.
 */
export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
