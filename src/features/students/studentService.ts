/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { requireSupabaseClient, throwServiceError, ServiceError } from '../../lib/errors/serviceError';

export interface StudentGroupMembership {
  id: string;
  name: string;
  nameArabic: string;
  academicYear: string;
  joinedAt: string;
  isPrimary: boolean;
}

export interface StudentRecord {
  id: string;
  role: 'student';
  fullName: string;
  fullNameArabic: string;
  phone?: string;
  status: 'active' | 'inactive' | 'suspended';
  createdAt: string;
  academicProfile?: {
    id: string;
    studentNumber?: string;
    username: string;
    groupId?: string;
    enrolledAt: string;
    status: 'active' | 'inactive' | 'suspended';
    notes?: string;
  };
  groups: StudentGroupMembership[];
}

export interface CreateStudentPayload {
  fullName: string;
  fullNameArabic?: string;
  username: string;
  password: string;
  studentNumber?: string;
  phone?: string;
  groupId?: string;
  notes?: string;
}

const SERVICE = 'studentService';

export async function fetchStudents(): Promise<StudentRecord[]> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'fetchStudents' });

  let profileRes;
  try {
    profileRes = await client
      .from('profiles')
      .select('id, role, full_name, full_name_arabic, phone, status, created_at')
      .eq('role', 'student')
      .order('created_at', { ascending: false });
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'fetchStudents' });
  }

  if (profileRes.error) {
    throwServiceError(profileRes.error, {
      service: SERVICE,
      operation: 'fetchStudents',
      fallbackMessage: 'Failed to fetch student directory',
    });
  }

  const profiles = profileRes.data || [];
  if (profiles.length === 0) {
    return [];
  }

  const studentIds = profiles.map((p: any) => p.id);

  let academicRes;
  let membershipsRes;
  try {
    [academicRes, membershipsRes] = await Promise.all([
      client
        .from('student_academic_profiles')
        .select('id, profile_id, student_number, username, group_id, enrolled_at, status, notes')
        .in('profile_id', studentIds),
      client
        .from('group_students')
        .select(`
          student_id,
          group_id,
          joined_at,
          groups:group_id (
            id,
            name,
            name_arabic,
            academic_year
          )
        `)
        .in('student_id', studentIds),
    ]);
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'fetchStudents.details' });
  }

  if (academicRes.error) {
    throwServiceError(academicRes.error, {
      service: SERVICE,
      operation: 'fetchStudents.academicProfiles',
      fallbackMessage: 'Failed to load student academic profiles',
    });
  }

  if (membershipsRes.error) {
    throwServiceError(membershipsRes.error, {
      service: SERVICE,
      operation: 'fetchStudents.memberships',
      fallbackMessage: 'Failed to load student group memberships',
    });
  }

  const academicMap = new Map<string, any>();
  for (const item of academicRes.data || []) {
    academicMap.set(item.profile_id, item);
  }

  const membershipMap = new Map<string, StudentGroupMembership[]>();
  for (const item of (membershipsRes.data || []) as any[]) {
    const g = item.groups;
    if (!g) continue;
    const list = membershipMap.get(item.student_id) || [];
    const primaryGroupId = academicMap.get(item.student_id)?.group_id;
    list.push({
      id: g.id,
      name: g.name,
      nameArabic: g.name_arabic,
      academicYear: g.academic_year,
      joinedAt: item.joined_at,
      isPrimary: g.id === primaryGroupId,
    });
    membershipMap.set(item.student_id, list);
  }

  return profiles.map((p: any) => {
    const acad = academicMap.get(p.id);
    const groups = membershipMap.get(p.id) || [];
    return {
      id: p.id,
      role: 'student',
      fullName: p.full_name,
      fullNameArabic: p.full_name_arabic || p.full_name,
      phone: p.phone,
      status: p.status,
      createdAt: p.created_at,
      academicProfile: acad
        ? {
            id: acad.id,
            studentNumber: acad.student_number,
            username: acad.username,
            groupId: acad.group_id,
            enrolledAt: acad.enrolled_at,
            status: acad.status,
            notes: acad.notes,
          }
        : undefined,
      groups,
    };
  });
}

export async function createStudent(
  payload: CreateStudentPayload
): Promise<{ success: boolean; studentId: string; username: string }> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'createStudent' });

  let res;
  try {
    res = await client.functions.invoke('create-student', {
      body: payload,
    });
  } catch (err) {
    throwServiceError(err, {
      service: SERVICE,
      operation: 'createStudent',
      fallbackMessage: 'Failed to invoke student provisioning service',
    });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'createStudent',
      fallbackMessage: 'Failed to provision student',
    });
  }

  if (res.data?.error) {
    throw new ServiceError({
      category: 'VALIDATION_ERROR',
      message: String(res.data.error),
      service: SERVICE,
      operation: 'createStudent',
    });
  }

  if (!res.data || !res.data.studentId) {
    throw new ServiceError({
      category: 'DATABASE_ERROR',
      message: 'Student creation service returned an empty or invalid response.',
      service: SERVICE,
      operation: 'createStudent',
    });
  }

  return res.data;
}

export async function updateStudentDetails(params: {
  studentId: string;
  fullName: string;
  fullNameArabic?: string;
  phone?: string;
  studentNumber?: string;
  notes?: string;
}): Promise<void> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'updateStudentDetails' });

  let res;
  try {
    res = await client.rpc('update_student_details', {
      p_student_id: params.studentId,
      p_full_name: params.fullName.trim(),
      p_full_name_arabic: params.fullNameArabic ? params.fullNameArabic.trim() : params.fullName.trim(),
      p_phone: params.phone ? params.phone.trim() : null,
      p_student_number: params.studentNumber ? params.studentNumber.trim() : null,
      p_notes: params.notes ? params.notes.trim() : null,
    });
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'updateStudentDetails' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'updateStudentDetails',
      fallbackMessage: 'Failed to update student details',
    });
  }
}

export async function updateStudentStatus(params: {
  studentId: string;
  status: 'active' | 'inactive' | 'suspended';
  reason?: string;
}): Promise<void> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'updateStudentStatus' });

  let res;
  try {
    res = await client.rpc('update_student_status', {
      p_student_id: params.studentId,
      p_status: params.status,
      p_reason: params.reason || null,
    });
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'updateStudentStatus' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'updateStudentStatus',
      fallbackMessage: 'Failed to update student status',
    });
  }
}

export async function resetStudentPassword(params: {
  studentId: string;
  newPassword: string;
}): Promise<void> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'resetStudentPassword' });

  let res;
  try {
    res = await client.functions.invoke('reset-student-password', {
      body: params,
    });
  } catch (err) {
    throwServiceError(err, {
      service: SERVICE,
      operation: 'resetStudentPassword',
      fallbackMessage: 'Failed to reach password reset service',
    });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'resetStudentPassword',
      fallbackMessage: 'Failed to reset student password',
    });
  }

  if (res.data?.error) {
    throw new ServiceError({
      category: 'VALIDATION_ERROR',
      message: String(res.data.error),
      service: SERVICE,
      operation: 'resetStudentPassword',
    });
  }
}
