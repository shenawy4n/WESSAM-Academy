/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { supabase } from '../../lib/supabase/client';

export interface GroupRecord {
  id: string;
  name: string;
  nameArabic: string;
  description?: string;
  academicYear: string;
  maxStudents: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  studentCount: number;
}

export interface GroupStudentMember {
  studentId: string;
  fullName: string;
  fullNameArabic: string;
  username?: string;
  studentNumber?: string;
  phone?: string;
  status: 'active' | 'inactive' | 'suspended';
  joinedAt: string;
  isPrimary: boolean;
}

export interface GroupAssignedCourse {
  courseId: string;
  title: string;
  titleArabic: string;
  level: string;
  assignedAt: string;
}

export interface GroupDetailedView extends GroupRecord {
  roster: GroupStudentMember[];
  assignedCourses: GroupAssignedCourse[];
}

const PREVIEW_DEMO_GROUPS: GroupRecord[] = [
  {
    id: 'demo-group-1',
    name: 'Group A - Intensive IELTS Prep',
    nameArabic: 'المجموعة أ - الإعداد المكثف للآيلتس',
    description: 'Targeted preparation for students aiming for band 6.5+ in Academic IELTS.',
    academicYear: '2026/2027',
    maxStudents: 25,
    isActive: true,
    createdAt: '2026-08-15T10:00:00Z',
    updatedAt: '2026-08-15T10:00:00Z',
    studentCount: 2,
  },
  {
    id: 'demo-group-2',
    name: 'Group B - Advanced Academic English',
    nameArabic: 'المجموعة ب - الإنجليزية الأكاديمية المتقدمة',
    description: 'Focus on essay writing, critical analysis, and academic presentation skills.',
    academicYear: '2026/2027',
    maxStudents: 30,
    isActive: true,
    createdAt: '2026-08-20T10:00:00Z',
    updatedAt: '2026-08-20T10:00:00Z',
    studentCount: 1,
  },
  {
    id: 'demo-group-3',
    name: 'Group C - Secondary School English Mastery',
    nameArabic: 'المجموعة ج - إتقان اللغة الإنجليزية للمرحلة الثانوية',
    description: 'Comprehensive curriculum aligned with Saudi Ministry of Education guidelines.',
    academicYear: '2026/2027',
    maxStudents: 30,
    isActive: false,
    createdAt: '2026-08-25T10:00:00Z',
    updatedAt: '2026-08-25T10:00:00Z',
    studentCount: 0,
  },
];

export async function fetchGroups(): Promise<GroupRecord[]> {
  if (!supabase) {
    return PREVIEW_DEMO_GROUPS;
  }

  const { data: groups, error } = await supabase
    .from('groups')
    .select(`
      id,
      name,
      name_arabic,
      description,
      academic_year,
      max_students,
      is_active,
      created_at,
      updated_at
    `)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch academic groups: ${error.message}`);
  }

  if (!groups || groups.length === 0) {
    return [];
  }

  // Count active enrollments per group
  const { data: memberships } = await supabase
    .from('group_students')
    .select('group_id');

  const countMap = new Map<string, number>();
  if (memberships) {
    for (const m of memberships) {
      countMap.set(m.group_id, (countMap.get(m.group_id) || 0) + 1);
    }
  }

  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    nameArabic: g.name_arabic,
    description: g.description,
    academicYear: g.academic_year,
    maxStudents: g.max_students || 30,
    isActive: g.is_active,
    createdAt: g.created_at,
    updatedAt: g.updated_at,
    studentCount: countMap.get(g.id) || 0,
  }));
}

export async function createGroup(params: {
  name: string;
  nameArabic: string;
  description?: string;
  academicYear: string;
  maxStudents: number;
  isActive: boolean;
}): Promise<GroupRecord> {
  if (!supabase) {
    throw new Error('Supabase client is not configured.');
  }

  const { data, error } = await supabase
    .from('groups')
    .insert({
      name: params.name.trim(),
      name_arabic: params.nameArabic.trim(),
      description: params.description?.trim() || null,
      academic_year: params.academicYear.trim(),
      max_students: params.maxStudents,
      is_active: params.isActive,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to create group: ${error.message}`);
  }

  return {
    id: data.id,
    name: data.name,
    nameArabic: data.name_arabic,
    description: data.description,
    academicYear: data.academic_year,
    maxStudents: data.max_students,
    isActive: data.is_active,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    studentCount: 0,
  };
}

export async function updateGroup(params: {
  id: string;
  name: string;
  nameArabic: string;
  description?: string;
  academicYear: string;
  maxStudents: number;
  isActive: boolean;
}): Promise<void> {
  if (!supabase) return;

  const { error } = await supabase
    .from('groups')
    .update({
      name: params.name.trim(),
      name_arabic: params.nameArabic.trim(),
      description: params.description?.trim() || null,
      academic_year: params.academicYear.trim(),
      max_students: params.maxStudents,
      is_active: params.isActive,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id);

  if (error) {
    throw new Error(`Failed to update group: ${error.message}`);
  }
}

export async function fetchGroupDetails(groupId: string): Promise<GroupDetailedView> {
  if (!supabase) {
    const demo = PREVIEW_DEMO_GROUPS.find((g) => g.id === groupId) || PREVIEW_DEMO_GROUPS[0];
    return {
      ...demo,
      roster: [
        {
          studentId: 'demo-student-1',
          fullName: 'Ahmed Mohammed Al-Harbi',
          fullNameArabic: 'أحمد محمد الحربي',
          username: 'ahmed.harbi',
          studentNumber: 'WES-2026-001',
          status: 'active',
          joinedAt: '2026-09-01T10:00:00Z',
          isPrimary: true,
        },
      ],
      assignedCourses: [],
    };
  }

  // 1. Fetch group metadata
  const { data: g, error: gErr } = await supabase
    .from('groups')
    .select('*')
    .eq('id', groupId)
    .single();

  if (gErr || !g) {
    throw new Error(`Group not found: ${gErr?.message}`);
  }

  // 2. Fetch enrolled students and their academic profiles
  const [rosterRes, coursesRes] = await Promise.all([
    supabase
      .from('group_students')
      .select(`
        student_id,
        joined_at,
        profiles:student_id (
          id,
          full_name,
          full_name_arabic,
          phone,
          status
        )
      `)
      .eq('group_id', groupId),
    supabase
      .from('group_courses')
      .select(`
        course_id,
        assigned_at,
        courses:course_id (
          id,
          title,
          title_arabic,
          level
        )
      `)
      .eq('group_id', groupId),
  ]);

  // Fetch usernames and student numbers for roster
  const studentIds = (rosterRes.data || []).map((r: any) => r.student_id);
  const academicMap = new Map<string, any>();
  if (studentIds.length > 0) {
    const { data: acads } = await supabase
      .from('student_academic_profiles')
      .select('profile_id, username, student_number, group_id')
      .in('profile_id', studentIds);
    if (acads) {
      for (const a of acads) academicMap.set(a.profile_id, a);
    }
  }

  const roster: GroupStudentMember[] = (rosterRes.data || [])
    .filter((r: any) => r.profiles)
    .map((r: any) => {
      const acad = academicMap.get(r.student_id);
      return {
        studentId: r.student_id,
        fullName: r.profiles.full_name,
        fullNameArabic: r.profiles.full_name_arabic || r.profiles.full_name,
        phone: r.profiles.phone,
        status: r.profiles.status,
        username: acad?.username,
        studentNumber: acad?.student_number,
        joinedAt: r.joined_at,
        isPrimary: acad?.group_id === groupId,
      };
    });

  const assignedCourses: GroupAssignedCourse[] = (coursesRes.data || [])
    .filter((c: any) => c.courses)
    .map((c: any) => ({
      courseId: c.course_id,
      title: c.courses.title,
      titleArabic: c.courses.title_arabic,
      level: c.courses.level,
      assignedAt: c.assigned_at,
    }));

  return {
    id: g.id,
    name: g.name,
    nameArabic: g.name_arabic,
    description: g.description,
    academicYear: g.academic_year,
    maxStudents: g.max_students || 30,
    isActive: g.is_active,
    createdAt: g.created_at,
    updatedAt: g.updated_at,
    studentCount: roster.length,
    roster,
    assignedCourses,
  };
}

export async function enrollStudentInGroup(params: {
  studentId: string;
  groupId: string;
  setAsPrimary?: boolean;
}): Promise<void> {
  if (!supabase) return;

  // Try RPC first
  const { error: rpcErr } = await supabase.rpc('enroll_student_in_group', {
    p_student_id: params.studentId,
    p_group_id: params.groupId,
    p_set_as_primary: params.setAsPrimary ?? false,
  });

  if (!rpcErr) return;

  // Direct table fallback
  const { error: insertErr } = await supabase
    .from('group_students')
    .insert({
      group_id: params.groupId,
      student_id: params.studentId,
    });

  if (insertErr) throw new Error(insertErr.message);

  if (params.setAsPrimary) {
    await supabase
      .from('student_academic_profiles')
      .update({ group_id: params.groupId, updated_at: new Date().toISOString() })
      .eq('profile_id', params.studentId);
  }
}

export async function removeStudentFromGroup(params: {
  studentId: string;
  groupId: string;
}): Promise<void> {
  if (!supabase) return;

  const { error: rpcErr } = await supabase.rpc('remove_student_from_group', {
    p_student_id: params.studentId,
    p_group_id: params.groupId,
  });

  if (!rpcErr) return;

  const { error: delErr } = await supabase
    .from('group_students')
    .delete()
    .eq('group_id', params.groupId)
    .eq('student_id', params.studentId);

  if (delErr) throw new Error(delErr.message);
}

export async function transferStudentGroup(params: {
  studentId: string;
  fromGroupId: string;
  toGroupId: string;
}): Promise<void> {
  if (!supabase) return;

  const { error: rpcErr } = await supabase.rpc('transfer_student_group', {
    p_student_id: params.studentId,
    p_from_group_id: params.fromGroupId,
    p_to_group_id: params.toGroupId,
  });

  if (!rpcErr) return;

  // Manual fallback transaction
  await supabase
    .from('group_students')
    .delete()
    .eq('group_id', params.fromGroupId)
    .eq('student_id', params.studentId);

  const { error: insErr } = await supabase
    .from('group_students')
    .insert({ group_id: params.toGroupId, student_id: params.studentId });

  if (insErr) throw new Error(insErr.message);

  await supabase
    .from('student_academic_profiles')
    .update({ group_id: params.toGroupId, updated_at: new Date().toISOString() })
    .eq('profile_id', params.studentId);
}
