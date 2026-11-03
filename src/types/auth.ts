/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'super_admin' | 'teacher' | 'student' | 'moderator';

export type AccountStatus = 'active' | 'inactive' | 'suspended';

export interface UserProfile {
  id: string; // references auth.users.id
  role: UserRole;
  fullName: string;
  fullNameArabic?: string;
  email?: string;
  phone?: string;
  avatarUrl?: string;
  status: AccountStatus;
  createdAt: string;
  updatedAt: string;
}

export interface StudentAcademicProfile {
  id: string;
  profileId: string;
  studentNumber?: string;
  username: string;
  groupId?: string;
  groupName?: string;
  enrolledAt: string;
  status: AccountStatus;
  notes?: string;
}

export interface AuthSession {
  user: UserProfile | null;
  studentAcademicProfile?: StudentAcademicProfile | null;
  accessToken?: string;
  refreshToken?: string;
  isLoading: boolean;
  error?: string | null;
}
