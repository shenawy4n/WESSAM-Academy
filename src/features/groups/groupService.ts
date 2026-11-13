/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { requireSupabaseClient, throwServiceError, ServiceError } from '../../lib/errors/serviceError';

export type GroupStatusFilter = 'all' | 'active' | 'inactive' | 'archived';

export interface GroupRecord {
  id: string;
  name: string;
  nameArabic: string;
  description?: string;
  academicYear: string;
  maxStudents: number;
  isActive: boolean;
  archivedAt?: string | null;
  archivedBy?: string | null;
  archiveReason?: string | null;
  createdAt: string;
  updatedAt: string;
  studentCount: number;
}

export function isGroupArchived(group: { archivedAt?: string | null }): boolean {
  return Boolean(group.archivedAt);
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

const SERVICE = 'groupService';

export async function fetchGroups(filter: GroupStatusFilter = 'all'): Promise<GroupRecord[]> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'fetchGroups' });

  let query = client
    .from('groups')
    .select(`
      id,
      name,
      name_arabic,
      description,
      academic_year,
      max_students,
      is_active,
      archived_at,
      archived_by,
      archive_reason,
      created_at,
      updated_at
    `)
    .order('created_at', { ascending: false });

  if (filter === 'active') {
    query = query.eq('is_active', true).is('archived_at', null);
  } else if (filter === 'inactive') {
    query = query.eq('is_active', false).is('archived_at', null);
  } else if (filter === 'archived') {
    query = query.not('archived_at', 'is', null);
  } else {
    query = query.is('archived_at', null);
  }

  let groupsRes;
  try {
    groupsRes = await query;
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'fetchGroups' });
  }

  if (groupsRes.error) {
    throwServiceError(groupsRes.error, {
      service: SERVICE,
      operation: 'fetchGroups',
      fallbackMessage: 'Failed to fetch academic groups',
    });
  }

  const groups = groupsRes.data || [];
  if (groups.length === 0) {
    return [];
  }

  // Count enrollments per group cleanly — fail if secondary query fails so 0 is never fabricated
  let membershipsRes;
  try {
    membershipsRes = await client.from('group_students').select('group_id');
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'fetchGroups.memberships' });
  }

  if (membershipsRes.error) {
    throwServiceError(membershipsRes.error, {
      service: SERVICE,
      operation: 'fetchGroups.memberships',
      fallbackMessage: 'Failed to load group enrollment counts',
    });
  }

  const countMap = new Map<string, number>();
  for (const m of membershipsRes.data || []) {
    countMap.set(m.group_id, (countMap.get(m.group_id) || 0) + 1);
  }

  return groups.map((g: any) => ({
    id: g.id,
    name: g.name,
    nameArabic: g.name_arabic,
    description: g.description,
    academicYear: g.academic_year,
    maxStudents: g.max_students || 30,
    isActive: g.is_active,
    archivedAt: g.archived_at,
    archivedBy: g.archived_by,
    archiveReason: g.archive_reason,
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
  const client = requireSupabaseClient({ service: SERVICE, operation: 'createGroup' });

  let res;
  try {
    res = await client
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
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'createGroup' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'createGroup',
      fallbackMessage: 'Failed to create group',
    });
  }

  const data = res.data;
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
  const client = requireSupabaseClient({ service: SERVICE, operation: 'updateGroup' });

  let res;
  try {
    res = await client
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
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'updateGroup' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'updateGroup',
      fallbackMessage: 'Failed to update group',
    });
  }
}

export async function fetchGroupDetails(groupId: string): Promise<GroupDetailedView> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'fetchGroupDetails' });

  let gRes;
  try {
    gRes = await client.from('groups').select('*').eq('id', groupId).single();
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'fetchGroupDetails' });
  }

  if (gRes.error) {
    throwServiceError(gRes.error, {
      service: SERVICE,
      operation: 'fetchGroupDetails',
      fallbackMessage: 'Failed to load group details',
    });
  }

  if (!gRes.data) {
    throw new ServiceError({
      category: 'NOT_FOUND',
      message: 'Group not found.',
      service: SERVICE,
      operation: 'fetchGroupDetails',
      code: 'PGRST116',
    });
  }

  const g = gRes.data;

  let rosterRes;
  let coursesRes;
  try {
    [rosterRes, coursesRes] = await Promise.all([
      client
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
      client
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
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'fetchGroupDetails.relations' });
  }

  if (rosterRes.error) {
    throwServiceError(rosterRes.error, {
      service: SERVICE,
      operation: 'fetchGroupDetails.roster',
      fallbackMessage: 'Failed to load group student roster',
    });
  }

  if (coursesRes.error) {
    throwServiceError(coursesRes.error, {
      service: SERVICE,
      operation: 'fetchGroupDetails.courses',
      fallbackMessage: 'Failed to load courses assigned to group',
    });
  }

  const studentIds = (rosterRes.data || []).map((r: any) => r.student_id);
  const academicMap = new Map<string, any>();

  if (studentIds.length > 0) {
    let acadRes;
    try {
      acadRes = await client
        .from('student_academic_profiles')
        .select('profile_id, username, student_number, group_id')
        .in('profile_id', studentIds);
    } catch (err) {
      throwServiceError(err, { service: SERVICE, operation: 'fetchGroupDetails.academicProfiles' });
    }

    if (acadRes.error) {
      throwServiceError(acadRes.error, {
        service: SERVICE,
        operation: 'fetchGroupDetails.academicProfiles',
        fallbackMessage: 'Failed to load student academic profiles for group roster',
      });
    }

    for (const a of acadRes.data || []) {
      academicMap.set(a.profile_id, a);
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
    archivedAt: g.archived_at,
    archivedBy: g.archived_by,
    archiveReason: g.archive_reason,
    createdAt: g.created_at,
    updatedAt: g.updated_at,
    studentCount: roster.length,
    roster,
    assignedCourses,
  };
}

export async function archiveGroup(params: {
  groupId: string;
  reason: string;
}): Promise<void> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'archiveGroup' });

  let res;
  try {
    res = await client.rpc('archive_group', {
      p_group_id: params.groupId,
      p_reason: params.reason.trim(),
    });
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'archiveGroup' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'archiveGroup',
      fallbackMessage: 'Failed to archive group',
    });
  }
}

export async function restoreGroup(params: {
  groupId: string;
}): Promise<void> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'restoreGroup' });

  let res;
  try {
    res = await client.rpc('restore_group', {
      p_group_id: params.groupId,
    });
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'restoreGroup' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'restoreGroup',
      fallbackMessage: 'Failed to restore group',
    });
  }
}

export async function enrollStudentInGroup(params: {
  studentId: string;
  groupId: string;
  setAsPrimary?: boolean;
}): Promise<void> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'enrollStudentInGroup' });

  let res;
  try {
    res = await client.rpc('enroll_student_in_group', {
      p_student_id: params.studentId,
      p_group_id: params.groupId,
      p_set_as_primary: params.setAsPrimary ?? false,
    });
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'enrollStudentInGroup' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'enrollStudentInGroup',
      fallbackMessage: 'Failed to enroll student in group',
    });
  }
}

export async function removeStudentFromGroup(params: {
  studentId: string;
  groupId: string;
}): Promise<void> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'removeStudentFromGroup' });

  let res;
  try {
    res = await client.rpc('remove_student_from_group', {
      p_student_id: params.studentId,
      p_group_id: params.groupId,
    });
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'removeStudentFromGroup' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'removeStudentFromGroup',
      fallbackMessage: 'Failed to remove student from group',
    });
  }
}

export async function transferStudentGroup(params: {
  studentId: string;
  fromGroupId: string;
  toGroupId: string;
}): Promise<void> {
  const client = requireSupabaseClient({ service: SERVICE, operation: 'transferStudentGroup' });

  let res;
  try {
    res = await client.rpc('transfer_student_group', {
      p_student_id: params.studentId,
      p_from_group_id: params.fromGroupId,
      p_to_group_id: params.toGroupId,
    });
  } catch (err) {
    throwServiceError(err, { service: SERVICE, operation: 'transferStudentGroup' });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'transferStudentGroup',
      fallbackMessage: 'Failed to transfer student between groups',
    });
  }
}
