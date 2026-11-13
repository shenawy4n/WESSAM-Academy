/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { supabase } from '../../lib/supabase/client';
import {
  AssignmentRecord,
  AssignmentStatus,
  AssignmentTarget,
  AssignmentAttachment,
  CreateAssignmentPayload,
  GradingHistoryRecord,
  GradeSubmissionPayload,
  SubmissionRecord,
} from './types';

export const ASSIGNMENT_STORAGE_BUCKET = 'assignment-files';

let phase5CSchemaReady = true;

export function isAssignmentsPhase5CSchemaReady(): boolean {
  return phase5CSchemaReady;
}

export function isMissingSchemaFeatureError(error: any): boolean {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = String(error.message || '').toLowerCase();
  return (
    code === 'PGRST200' ||
    code === 'PGRST202' ||
    code === 'PGRST204' ||
    code === '42703' ||
    code === '42P01' ||
    code === '42883' ||
    msg.includes('schema cache') ||
    msg.includes('could not find a relationship') ||
    msg.includes('could not find the function') ||
    msg.includes('does not exist')
  );
}

function ensureClient() {
  if (!supabase) {
    throw new Error('Supabase client is not initialized. Please configure VITE_SUPABASE_URL and key.');
  }
  return supabase;
}

/**
 * Maps raw database assignment row into AssignmentRecord.
 */
function mapAssignmentRow(row: any): AssignmentRecord {
  const derivedStatus: AssignmentStatus =
    (row.status as AssignmentStatus) || (row.is_published ? 'published' : 'draft');

  return {
    id: row.id,
    teacherId: row.teacher_id || '',
    courseId: row.course_id,
    unitId: row.unit_id,
    lessonId: row.lesson_id || null,
    title: row.title,
    titleArabic: row.title_arabic || row.title,
    instructions: row.instructions || '',
    instructionsArabic: row.instructions_arabic || null,
    assignmentType: row.assignment_type || 'written',
    dueDate: row.due_date,
    publishAt: row.publish_at || null,
    cutoffDate: row.cutoff_date || null,
    maxScore: Number(row.max_score) || 100,
    targetGroupId: row.target_group_id || null,
    isPublished: Boolean(row.is_published),
    status: derivedStatus,
    allowLateSubmissions: row.allow_late_submissions ?? true,
    latePenaltyPercentage: Number(row.late_penalty_percentage) || 0,
    gracePeriodMinutes: Number(row.grace_period_minutes) || 0,
    maxAttempts: Number(row.max_attempts) || 1,
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
    rubric: Array.isArray(row.rubric) ? row.rubric : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
    course: row.courses ? {
      id: row.courses.id,
      title: row.courses.title,
      titleArabic: row.courses.title_arabic,
    } : null,
    unit: row.course_units ? {
      id: row.course_units.id,
      title: row.course_units.title,
      titleArabic: row.course_units.title_arabic,
    } : null,
    lesson: row.lessons ? {
      id: row.lessons.id,
      title: row.lessons.title,
      titleArabic: row.lessons.title_arabic,
    } : null,
    targets: Array.isArray(row.assignment_targets)
      ? row.assignment_targets.map((t: any) => ({
          id: t.id,
          assignmentId: t.assignment_id,
          targetType: t.target_type,
          groupId: t.group_id,
          studentId: t.student_id,
          groupName: t.groups?.name_arabic || t.groups?.name,
          studentName: t.profiles?.full_name_arabic || t.profiles?.full_name,
        }))
      : [],
    totalSubmissions: Array.isArray(row.submissions) ? row.submissions.length : 0,
    pendingGrading: Array.isArray(row.submissions)
      ? row.submissions.filter((s: any) => s.status === 'submitted' || s.score === null || s.score === undefined).length
      : 0,
    gradedCount: Array.isArray(row.submissions)
      ? row.submissions.filter((s: any) => s.status === 'graded' || (s.score !== null && s.score !== undefined)).length
      : 0,
  };
}

/**
 * Maps raw database submission row into SubmissionRecord.
 */
function mapSubmissionRow(row: any): SubmissionRecord {
  const rawAcademic = row.profiles?.student_academic_profiles;
  const academicProfile = Array.isArray(rawAcademic) ? rawAcademic[0] : rawAcademic;
  const rawGroups = row.profiles?.group_students;
  const firstGroup = Array.isArray(rawGroups) ? rawGroups[0] : rawGroups;

  return {
    id: row.id,
    assignmentId: row.assignment_id,
    studentId: row.student_id,
    attemptNumber: Number(row.attempt_number) || 1,
    content: row.content,
    fileUrl: row.file_url,
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
    studentComment: row.student_comment || null,
    submittedAt: row.submitted_at,
    isLate: Boolean(row.is_late),
    status: row.status || (row.score !== null && row.score !== undefined ? 'graded' : 'submitted'),
    score: row.score !== null && row.score !== undefined ? Number(row.score) : null,
    teacherFeedback: row.teacher_feedback,
    privateTeacherNotes: row.private_teacher_notes || null,
    rubricScores: row.rubric_scores || {},
    gradedAt: row.graded_at,
    gradedBy: row.graded_by,
    isGradeReleased: row.is_grade_released ?? (row.score !== null && row.score !== undefined),
    releasedAt: row.released_at || null,
    updatedAt: row.updated_at || row.submitted_at,
    student: row.profiles
      ? {
          id: row.profiles.id,
          fullName: row.profiles.full_name,
          fullNameArabic: row.profiles.full_name_arabic,
          studentNumber: academicProfile?.student_number || null,
          groupName: firstGroup?.groups?.name_arabic || firstGroup?.groups?.name || null,
        }
      : null,
  };
}

const FULL_TEACHER_ASSIGNMENT_SELECT = `
  *,
  courses:courses!course_id(id, title, title_arabic),
  course_units:course_units!unit_id(id, title, title_arabic),
  lessons:lessons!lesson_id(id, title, title_arabic),
  assignment_targets(id, assignment_id, target_type, group_id, student_id, groups(name, name_arabic), profiles:profiles!student_id(full_name, full_name_arabic)),
  submissions(id, status, score, is_grade_released)
`;

const BASELINE_ASSIGNMENT_SELECT = `
  *,
  courses:courses!course_id(id, title, title_arabic),
  course_units:course_units!unit_id(id, title, title_arabic),
  submissions(id, score, graded_at)
`;

/**
 * Fetches teacher assignments with joined details and submission stats.
 */
export async function fetchTeacherAssignments(filter?: {
  courseId?: string;
  status?: string;
  search?: string;
}): Promise<AssignmentRecord[]> {
  const client = ensureClient();

  let query = client
    .from('assignments')
    .select(FULL_TEACHER_ASSIGNMENT_SELECT)
    .order('created_at', { ascending: false });

  if (filter?.courseId) {
    query = query.eq('course_id', filter.courseId);
  }

  if (filter?.status && filter.status !== 'all') {
    query = query.eq('status', filter.status);
  }

  let { data, error } = await query;

  if (error && isMissingSchemaFeatureError(error)) {
    phase5CSchemaReady = false;
    let fallbackQuery = client
      .from('assignments')
      .select(BASELINE_ASSIGNMENT_SELECT)
      .order('created_at', { ascending: false });

    if (filter?.courseId) {
      fallbackQuery = fallbackQuery.eq('course_id', filter.courseId);
    }
    if (filter?.status === 'published') {
      fallbackQuery = fallbackQuery.eq('is_published', true);
    } else if (filter?.status === 'draft') {
      fallbackQuery = fallbackQuery.eq('is_published', false);
    }

    const fallbackRes = await fallbackQuery;
    data = fallbackRes.data;
    error = fallbackRes.error;
  } else if (!error) {
    phase5CSchemaReady = true;
  }

  if (error) {
    throw new Error(`Failed to fetch assignments: ${error.message}`);
  }

  let results = (data || []).map(mapAssignmentRow);

  if (filter?.search && filter.search.trim()) {
    const term = filter.search.trim().toLowerCase();
    results = results.filter(
      (a) =>
        a.title.toLowerCase().includes(term) ||
        a.titleArabic.toLowerCase().includes(term) ||
        (a.course?.title && a.course.title.toLowerCase().includes(term))
    );
  }

  return results;
}

/**
 * Fetches student assignments targeted to the current student with their submissions.
 */
export async function fetchStudentAssignments(): Promise<{
  assignments: AssignmentRecord[];
  mySubmissions: Record<string, SubmissionRecord[]>;
}> {
  const client = ensureClient();
  const { data: { user } } = await client.auth.getUser();

  if (!user) {
    throw new Error('User is not authenticated');
  }

  // 1. Fetch accessible assignments
  let { data: assignData, error: assignError } = await client
    .from('assignments')
    .select(`
      *,
      courses:courses!course_id(id, title, title_arabic),
      course_units:course_units!unit_id(id, title, title_arabic),
      lessons:lessons!lesson_id(id, title, title_arabic),
      assignment_targets(id, assignment_id, target_type, group_id, student_id)
    `)
    .eq('is_published', true)
    .order('due_date', { ascending: true });

  if (assignError && isMissingSchemaFeatureError(assignError)) {
    phase5CSchemaReady = false;
    const fallbackAssignRes = await client
      .from('assignments')
      .select(`
        *,
        courses:courses!course_id(id, title, title_arabic),
        course_units:course_units!unit_id(id, title, title_arabic)
      `)
      .eq('is_published', true)
      .order('due_date', { ascending: true });
    assignData = fallbackAssignRes.data;
    assignError = fallbackAssignRes.error;
  } else if (!assignError) {
    phase5CSchemaReady = true;
  }

  if (assignError) {
    throw new Error(`Failed to fetch student assignments: ${assignError.message}`);
  }

  const assignments = (assignData || []).map(mapAssignmentRow);

  // 2. Fetch student's own submissions
  let { data: subData, error: subError } = await client
    .from('submissions')
    .select('*')
    .eq('student_id', user.id)
    .order('attempt_number', { ascending: false });

  if (subError && isMissingSchemaFeatureError(subError)) {
    const fallbackSubRes = await client
      .from('submissions')
      .select('*')
      .eq('student_id', user.id)
      .order('submitted_at', { ascending: false });
    subData = fallbackSubRes.data;
    subError = fallbackSubRes.error;
  }

  if (subError) {
    throw new Error(`Failed to fetch student submissions: ${subError.message}`);
  }

  const mySubmissions: Record<string, SubmissionRecord[]> = {};
  for (const s of subData || []) {
    const mapped = mapSubmissionRow(s);
    if (!mySubmissions[mapped.assignmentId]) {
      mySubmissions[mapped.assignmentId] = [];
    }
    mySubmissions[mapped.assignmentId].push(mapped);
  }

  return { assignments, mySubmissions };
}

/**
 * Fetches single assignment details.
 */
export async function fetchAssignmentDetails(assignmentId: string): Promise<AssignmentRecord> {
  const client = ensureClient();

  let { data, error } = await client
    .from('assignments')
    .select(FULL_TEACHER_ASSIGNMENT_SELECT)
    .eq('id', assignmentId)
    .single();

  if (error && isMissingSchemaFeatureError(error)) {
    phase5CSchemaReady = false;
    const fallbackRes = await client
      .from('assignments')
      .select(BASELINE_ASSIGNMENT_SELECT)
      .eq('id', assignmentId)
      .single();
    data = fallbackRes.data;
    error = fallbackRes.error;
  }

  if (error || !data) {
    throw new Error(`Assignment not found: ${error?.message || 'Not found'}`);
  }

  return mapAssignmentRow(data);
}

/**
 * Creates assignment atomically using RPC.
 */
export async function createAssignment(payload: CreateAssignmentPayload): Promise<string> {
  const client = ensureClient();

  const p_assignment = {
    course_id: payload.courseId,
    unit_id: payload.unitId || null,
    lesson_id: payload.lessonId || null,
    title: payload.title,
    title_arabic: payload.titleArabic || payload.title,
    instructions: payload.instructions,
    instructions_arabic: payload.instructionsArabic || null,
    assignment_type: payload.assignmentType,
    due_date: payload.dueDate,
    publish_at: payload.publishAt || null,
    cutoff_date: payload.cutoffDate || null,
    max_score: payload.maxScore,
    target_group_id: payload.targetGroupId || null,
    is_published: payload.status === 'published',
    status: payload.status || 'draft',
    allow_late_submissions: payload.allowLateSubmissions ?? true,
    late_penalty_percentage: payload.latePenaltyPercentage ?? 0,
    grace_period_minutes: payload.gracePeriodMinutes ?? 0,
    max_attempts: payload.maxAttempts ?? 1,
    attachments: payload.attachments || [],
    rubric: payload.rubric || [],
  };

  const p_targets = (payload.targets || []).map((t) => ({
    target_type: t.targetType,
    group_id: t.groupId || null,
    student_id: t.studentId || null,
  }));

  const { data, error } = await client.rpc('create_assignment', {
    p_assignment,
    p_targets,
  });

  if (error) {
    if (isMissingSchemaFeatureError(error)) {
      throw new Error(
        'تعذر إنشاء الواجب: يرجى تطبيق الترحيل 20261111000015_complete_assignments_and_homework.sql على قاعدة بيانات Supabase أولاً.'
      );
    }
    throw new Error(`Failed to create assignment: ${error.message}`);
  }

  return data?.id || data;
}

/**
 * Updates assignment atomically using RPC.
 */
export async function updateAssignment(
  assignmentId: string,
  payload: Partial<CreateAssignmentPayload>
): Promise<string> {
  const client = ensureClient();

  const p_assignment: Record<string, any> = {};
  if (payload.courseId !== undefined) p_assignment.course_id = payload.courseId;
  if (payload.unitId !== undefined) p_assignment.unit_id = payload.unitId;
  if (payload.lessonId !== undefined) p_assignment.lesson_id = payload.lessonId;
  if (payload.title !== undefined) p_assignment.title = payload.title;
  if (payload.titleArabic !== undefined) p_assignment.title_arabic = payload.titleArabic;
  if (payload.instructions !== undefined) p_assignment.instructions = payload.instructions;
  if (payload.instructionsArabic !== undefined) p_assignment.instructions_arabic = payload.instructionsArabic;
  if (payload.assignmentType !== undefined) p_assignment.assignment_type = payload.assignmentType;
  if (payload.dueDate !== undefined) p_assignment.due_date = payload.dueDate;
  if (payload.publishAt !== undefined) p_assignment.publish_at = payload.publishAt;
  if (payload.cutoffDate !== undefined) p_assignment.cutoff_date = payload.cutoffDate;
  if (payload.maxScore !== undefined) p_assignment.max_score = payload.maxScore;
  if (payload.targetGroupId !== undefined) p_assignment.target_group_id = payload.targetGroupId;
  if (payload.status !== undefined) {
    p_assignment.status = payload.status;
    p_assignment.is_published = payload.status === 'published';
  }
  if (payload.allowLateSubmissions !== undefined) p_assignment.allow_late_submissions = payload.allowLateSubmissions;
  if (payload.latePenaltyPercentage !== undefined) p_assignment.late_penalty_percentage = payload.latePenaltyPercentage;
  if (payload.gracePeriodMinutes !== undefined) p_assignment.grace_period_minutes = payload.gracePeriodMinutes;
  if (payload.maxAttempts !== undefined) p_assignment.max_attempts = payload.maxAttempts;
  if (payload.attachments !== undefined) p_assignment.attachments = payload.attachments;
  if (payload.rubric !== undefined) p_assignment.rubric = payload.rubric;

  const p_targets = payload.targets
    ? payload.targets.map((t) => ({
        target_type: t.targetType,
        group_id: t.groupId || null,
        student_id: t.studentId || null,
      }))
    : null;

  const { data, error } = await client.rpc('update_assignment', {
    p_assignment_id: assignmentId,
    p_assignment,
    p_targets,
  });

  if (error) {
    if (isMissingSchemaFeatureError(error)) {
      throw new Error(
        'تعذر تحديث الواجب: يرجى تطبيق الترحيل 20261111000015_complete_assignments_and_homework.sql على قاعدة بيانات Supabase أولاً.'
      );
    }
    throw new Error(`Failed to update assignment: ${error.message}`);
  }

  return data?.id || assignmentId;
}

/**
 * Soft-archives or deletes an assignment.
 */
export async function deleteOrArchiveAssignment(assignmentId: string, archiveOnly = true): Promise<void> {
  const client = ensureClient();

  if (archiveOnly) {
    let { error } = await client
      .from('assignments')
      .update({ status: 'archived', is_published: false })
      .eq('id', assignmentId);

    if (error && isMissingSchemaFeatureError(error)) {
      const fallbackRes = await client
        .from('assignments')
        .update({ is_published: false })
        .eq('id', assignmentId);
      error = fallbackRes.error;
    }

    if (error) throw new Error(`Failed to archive assignment: ${error.message}`);
  } else {
    const { error } = await client
      .from('assignments')
      .delete()
      .eq('id', assignmentId);

    if (error) throw new Error(`Failed to delete assignment: ${error.message}`);
  }
}

/**
 * Duplicates an assignment as draft.
 */
export async function duplicateAssignment(assignmentId: string): Promise<string> {
  const original = await fetchAssignmentDetails(assignmentId);
  const payload: CreateAssignmentPayload = {
    courseId: original.courseId,
    unitId: original.unitId,
    lessonId: original.lessonId,
    title: `${original.title} (Copy)`,
    titleArabic: `${original.titleArabic} (نسخة)`,
    instructions: original.instructions,
    instructionsArabic: original.instructionsArabic,
    assignmentType: original.assignmentType,
    dueDate: new Date(Date.now() + 7 * 86400000).toISOString(),
    publishAt: null,
    cutoffDate: null,
    maxScore: original.maxScore,
    status: 'draft',
    allowLateSubmissions: original.allowLateSubmissions,
    latePenaltyPercentage: original.latePenaltyPercentage,
    gracePeriodMinutes: original.gracePeriodMinutes,
    maxAttempts: original.maxAttempts,
    attachments: original.attachments,
    rubric: original.rubric,
    targets: original.targets?.map((t) => ({
      targetType: t.targetType,
      groupId: t.groupId,
      studentId: t.studentId,
    })) || [],
  };

  return createAssignment(payload);
}

/**
 * Submits assignment solution via RPC.
 */
export async function submitAssignment(payload: {
  assignmentId: string;
  content?: string;
  attachments?: AssignmentAttachment[];
  studentComment?: string;
}): Promise<string> {
  const client = ensureClient();

  const { data, error } = await client.rpc('submit_assignment', {
    p_assignment_id: payload.assignmentId,
    p_content: payload.content || '',
    p_attachments: payload.attachments || [],
    p_student_comment: payload.studentComment || null,
  });

  if (error) {
    if (isMissingSchemaFeatureError(error)) {
      throw new Error(
        'تعذر تسليم الواجب: يرجى تطبيق الترحيل 20261111000015_complete_assignments_and_homework.sql على قاعدة بيانات Supabase أولاً.'
      );
    }
    throw new Error(`Failed to submit assignment: ${error.message}`);
  }

  return data?.id || data;
}

/**
 * Fetches all student submissions for an assignment (Teacher view).
 */
export async function fetchAssignmentSubmissions(assignmentId: string): Promise<SubmissionRecord[]> {
  const client = ensureClient();

  const { data, error } = await client
    .from('submissions')
    .select(`
      *,
      profiles:profiles!student_id(
        id,
        full_name,
        full_name_arabic,
        student_academic_profiles(student_number),
        group_students(groups(name, name_arabic))
      )
    `)
    .eq('assignment_id', assignmentId)
    .order('submitted_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch submissions: ${error.message}`);
  }

  return (data || []).map(mapSubmissionRow);
}

/**
 * Grades or returns submission for revision via RPC.
 */
export async function gradeSubmission(payload: GradeSubmissionPayload): Promise<string> {
  const client = ensureClient();

  const { data, error } = await client.rpc('grade_assignment_submission', {
    p_submission_id: payload.submissionId,
    p_score: payload.score,
    p_feedback: payload.feedback || null,
    p_private_notes: payload.privateNotes || null,
    p_rubric_scores: payload.rubricScores || {},
    p_release_grade: payload.releaseGrade ?? false,
    p_action_type: payload.actionType || 'grade',
  });

  if (error) {
    if (isMissingSchemaFeatureError(error)) {
      throw new Error(
        'تعذر رصد الدرجة: يرجى تطبيق الترحيل 20261111000015_complete_assignments_and_homework.sql على قاعدة بيانات Supabase أولاً.'
      );
    }
    throw new Error(`Failed to grade submission: ${error.message}`);
  }

  return data?.id || data;
}

/**
 * Fetches audit trail of grading actions for a submission.
 */
export async function fetchGradingHistory(submissionId: string): Promise<GradingHistoryRecord[]> {
  const client = ensureClient();

  const { data, error } = await client
    .from('assignment_grading_history')
    .select(`
      *,
      grader:profiles!graded_by(full_name, full_name_arabic)
    `)
    .eq('submission_id', submissionId)
    .order('created_at', { ascending: false });

  if (error) {
    if (isMissingSchemaFeatureError(error)) {
      return [];
    }
    throw new Error(`Failed to fetch grading history: ${error.message}`);
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    submissionId: row.submission_id,
    assignmentId: row.assignment_id,
    studentId: row.student_id,
    gradedBy: row.graded_by,
    previousScore: row.previous_score !== null ? Number(row.previous_score) : null,
    newScore: Number(row.new_score),
    previousFeedback: row.previous_feedback,
    newFeedback: row.new_feedback,
    actionType: row.action_type,
    isGradeReleased: Boolean(row.is_grade_released),
    createdAt: row.created_at,
    graderName: row.grader?.full_name_arabic || row.grader?.full_name || 'الأستاذ المصحح',
  }));
}

/**
 * Uploads a file to private 'assignment-files' bucket.
 */
export async function uploadAssignmentFile(
  file: File,
  folder: 'attachments' | 'submissions',
  contextId: string,
  studentId?: string
): Promise<AssignmentAttachment> {
  const client = ensureClient();

  const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const timestamp = Date.now();
  const filePath = folder === 'attachments'
    ? `attachments/${contextId}/${timestamp}_${cleanName}`
    : `submissions/${contextId}/${studentId || 'me'}/${timestamp}_${cleanName}`;

  const { error: uploadError } = await client.storage
    .from(ASSIGNMENT_STORAGE_BUCKET)
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Upload failed: ${uploadError.message}`);
  }

  return {
    name: file.name,
    path: filePath,
    size: file.size,
    mimeType: file.type,
    uploadedAt: new Date().toISOString(),
  };
}

/**
 * Generates a signed URL for private file access.
 */
export async function getAssignmentFileSignedUrl(path: string, expiresInSeconds = 3600): Promise<string> {
  const client = ensureClient();

  const { data, error } = await client.storage
    .from(ASSIGNMENT_STORAGE_BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(`Failed to generate signed download link: ${error?.message || 'Unknown error'}`);
  }

  return data.signedUrl;
}
