/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { UserRole, AccountStatus } from './auth';

export interface Group {
  id: string;
  name: string;
  nameArabic: string;
  description?: string;
  academicYear: string;
  maxStudents?: number;
  isActive: boolean;
  archivedAt?: string | null;
  archivedBy?: string | null;
  archiveReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Course {
  id: string;
  title: string;
  titleArabic: string;
  description?: string;
  descriptionArabic?: string;
  coverImageUrl?: string;
  level: 'beginner' | 'intermediate' | 'advanced' | 'exam_prep';
  isPublished: boolean;
  teacherId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CourseUnit {
  id: string;
  courseId: string;
  title: string;
  titleArabic: string;
  orderIndex: number;
  createdAt: string;
}

export interface Lesson {
  id: string;
  unitId: string;
  courseId: string;
  title: string;
  titleArabic: string;
  description?: string;
  durationMinutes?: number;
  orderIndex: number;
  videoAssetId?: string;
  isPublished: boolean;
  createdAt: string;
}

export interface LiveSession {
  id: string;
  title: string;
  courseId?: string;
  groupId?: string;
  startTime: string; // ISO timestamptz (Asia/Riyadh context)
  endTime: string;
  provider: 'zoom' | 'google_meet' | 'custom';
  meetingUrl?: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  teacherNotes?: string;
  createdAt: string;
}

export interface AttendanceRecord {
  id: string;
  sessionId: string;
  studentId: string;
  status: 'present' | 'absent' | 'late' | 'excused';
  joinedAt?: string;
  notes?: string;
  recordedAt: string;
}

export interface Assignment {
  id: string;
  courseId: string;
  unitId?: string;
  title: string;
  titleArabic: string;
  instructions: string;
  dueDate: string;
  maxScore: number;
  targetGroupId?: string;
  isPublished: boolean;
  createdAt: string;
}

export interface Quiz {
  id: string;
  courseId: string;
  title: string;
  titleArabic: string;
  description?: string;
  durationMinutes: number;
  passingScore: number;
  maxAttempts: number;
  isRandomized: boolean;
  isPublished: boolean;
  startDate?: string;
  endDate?: string;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  recipientId?: string;
  groupId?: string;
  title: string;
  titleArabic: string;
  body: string;
  bodyArabic: string;
  type: 'general' | 'assignment' | 'quiz' | 'live_session' | 'grade' | 'announcement';
  relatedResourceId?: string;
  isRead: boolean;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  actorId: string;
  actorRole: UserRole;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}
