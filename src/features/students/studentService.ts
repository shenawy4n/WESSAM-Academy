/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { supabase } from '../../lib/supabase/client';

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

// Fallback preview data for disconnected / demo preview mode
const PREVIEW_DEMO_STUDENTS: StudentRecord[] = [
  {
    id: 'demo-student-1',
    role: 'student',
    fullName: 'Ahmed Mohammed Al-Harbi',
    fullNameArabic: 'أحمد محمد الحربي',
    phone: '+966501234567',
    status: 'active',
    createdAt: '2026-09-01T10:00:00Z',
    academicProfile: {
      id: 'demo-acad-1',
      studentNumber: 'WES-2026-001',
      username: 'ahmed.harbi',
      groupId: 'demo-group-1',
      enrolledAt: '2026-09-01T10:00:00Z',
      status: 'active',
      notes: 'Excellent grammar fundamentals, working on IELTS speaking.',
    },
    groups: [
      {
        id: 'demo-group-1',
        name: 'Group A - Intensive IELTS Prep',
        nameArabic: 'المجموعة أ - الإعداد المكثف للآيلتس',
        academicYear: '2026/2027',
        joinedAt: '2026-09-01T10:00:00Z',
        isPrimary: true,
      },
    ],
  },
  {
    id: 'demo-student-2',
    role: 'student',
    fullName: 'Sara Abdullah Al-Otaibi',
    fullNameArabic: 'سارة عبد الله العتيبي',
    phone: '+966559876543',
    status: 'active',
    createdAt: '2026-09-05T12:00:00Z',
    academicProfile: {
      id: 'demo-acad-2',
      studentNumber: 'WES-2026-002',
      username: 'sara.otaibi',
      groupId: 'demo-group-1',
      enrolledAt: '2026-09-05T12:00:00Z',
      status: 'active',
      notes: 'High commitment, preparing for university abroad.',
    },
    groups: [
      {
        id: 'demo-group-1',
        name: 'Group A - Intensive IELTS Prep',
        nameArabic: 'المجموعة أ - الإعداد المكثف للآيلتس',
        academicYear: '2026/2027',
        joinedAt: '2026-09-05T12:00:00Z',
        isPrimary: true,
      },
    ],
  },
  {
    id: 'demo-student-3',
    role: 'student',
    fullName: 'Fahad Khalid Al-Dosari',
    fullNameArabic: 'فهد خالد الدوسري',
    phone: '+966543322114',
    status: 'inactive',
    createdAt: '2026-09-10T08:30:00Z',
    academicProfile: {
      id: 'demo-acad-3',
      studentNumber: 'WES-2026-003',
      username: 'fahad.dosari',
      groupId: 'demo-group-2',
      enrolledAt: '2026-09-10T08:30:00Z',
      status: 'inactive',
      notes: 'Temporarily paused due to school exams.',
    },
    groups: [
      {
        id: 'demo-group-2',
        name: 'Group B - Advanced Academic English',
        nameArabic: 'المجموعة ب - الإنجليزية الأكاديمية المتقدمة',
        academicYear: '2026/2027',
        joinedAt: '2026-09-10T08:30:00Z',
        isPrimary: true,
      },
    ],
  },
];

export async function fetchStudents(): Promise<StudentRecord[]> {
  if (!supabase) {
    return PREVIEW_DEMO_STUDENTS;
  }

  // 1. Fetch student profiles
  const { data: profiles, error: profileErr } = await supabase
    .from('profiles')
    .select('id, role, full_name, full_name_arabic, phone, status, created_at')
    .eq('role', 'student')
    .order('created_at', { ascending: false });

  if (profileErr) {
    throw new Error(`Failed to fetch student directory: ${profileErr.message}`);
  }

  if (!profiles || profiles.length === 0) {
    return [];
  }

  const studentIds = profiles.map((p) => p.id);

  // 2. Fetch academic profiles in parallel
  const [academicRes, membershipsRes] = await Promise.all([
    supabase
      .from('student_academic_profiles')
      .select('id, profile_id, student_number, username, group_id, enrolled_at, status, notes')
      .in('profile_id', studentIds),
    supabase
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

  const academicMap = new Map<string, any>();
  if (academicRes.data) {
    for (const item of academicRes.data) {
      academicMap.set(item.profile_id, item);
    }
  }

  const membershipMap = new Map<string, StudentGroupMembership[]>();
  if (membershipsRes.data) {
    for (const item of membershipsRes.data as any[]) {
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
  }

  return profiles.map((p) => {
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

export async function createStudent(payload: CreateStudentPayload): Promise<{ success: boolean; studentId: string; username: string }> {
  if (!supabase) {
    throw new Error('Supabase client is not configured.');
  }

  const { data, error } = await supabase.functions.invoke('create-student', {
    body: payload,
  });

  if (error) {
    throw new Error(error.message || 'Failed to provision student.');
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data;
}

export async function updateStudentDetails(params: {
  studentId: string;
  fullName: string;
  fullNameArabic?: string;
  phone?: string;
  studentNumber?: string;
  notes?: string;
}): Promise<void> {
  if (!supabase) return;

  // Prefer atomic RPC if available
  const { error: rpcErr } = await supabase.rpc('update_student_details', {
    p_student_id: params.studentId,
    p_full_name: params.fullName.trim(),
    p_full_name_arabic: params.fullNameArabic ? params.fullNameArabic.trim() : params.fullName.trim(),
    p_phone: params.phone ? params.phone.trim() : null,
    p_student_number: params.studentNumber ? params.studentNumber.trim() : null,
    p_notes: params.notes ? params.notes.trim() : null,
  });

  if (!rpcErr) return;

  // Fallback to direct table updates
  const { error: profileErr } = await supabase
    .from('profiles')
    .update({
      full_name: params.fullName.trim(),
      full_name_arabic: params.fullNameArabic ? params.fullNameArabic.trim() : params.fullName.trim(),
      phone: params.phone ? params.phone.trim() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.studentId)
    .eq('role', 'student');

  if (profileErr) throw new Error(profileErr.message);

  const { error: acadErr } = await supabase
    .from('student_academic_profiles')
    .update({
      student_number: params.studentNumber ? params.studentNumber.trim() : null,
      notes: params.notes ? params.notes.trim() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('profile_id', params.studentId);

  if (acadErr) throw new Error(acadErr.message);
}

export async function updateStudentStatus(params: {
  studentId: string;
  status: 'active' | 'inactive' | 'suspended';
  reason?: string;
}): Promise<void> {
  if (!supabase) return;

  // Prefer atomic RPC which syncs profiles, academic profile, and credentials
  const { error: rpcErr } = await supabase.rpc('update_student_status', {
    p_student_id: params.studentId,
    p_status: params.status,
    p_reason: params.reason || null,
  });

  if (!rpcErr) return;

  // Direct table fallback
  const { error: pErr } = await supabase
    .from('profiles')
    .update({ status: params.status, updated_at: new Date().toISOString() })
    .eq('id', params.studentId)
    .eq('role', 'student');

  if (pErr) throw new Error(pErr.message);

  await supabase
    .from('student_academic_profiles')
    .update({ status: params.status, updated_at: new Date().toISOString() })
    .eq('profile_id', params.studentId);
}

export async function resetStudentPassword(params: {
  studentId: string;
  newPassword: string;
}): Promise<void> {
  if (!supabase) {
    throw new Error('Supabase client is not configured.');
  }

  const { data, error } = await supabase.functions.invoke('reset-student-password', {
    body: params,
  });

  if (error) {
    throw new Error(error.message || 'Failed to reset student password.');
  }

  if (data?.error) {
    throw new Error(data.error);
  }
}
