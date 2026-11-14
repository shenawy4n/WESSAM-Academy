/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type NotificationCategory =
  | 'general'
  | 'new_lesson'
  | 'new_material'
  | 'live_session'
  | 'quiz_published'
  | 'quiz_result'
  | 'teacher_message'
  | 'student_message'
  | 'account_alert';

export type NotificationPriority = 'normal' | 'important' | 'urgent';

export type TargetAudience = 'all_students' | 'group' | 'student';

export type AnnouncementStatus = 'draft' | 'scheduled' | 'published' | 'archived';

export interface AppNotification {
  id: string;
  title: string;
  titleArabic: string;
  body: string;
  bodyArabic: string;
  type: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  actionUrl?: string | null;
  relatedResourceId?: string | null;
  senderId?: string | null;
  announcementId?: string | null;
  createdAt: string;
  isRead: boolean;
  readAt?: string | null;
}

export interface Announcement {
  id: string;
  teacherId: string;
  title: string;
  titleArabic: string;
  body: string;
  bodyArabic: string;
  targetAudience: TargetAudience;
  groupId?: string | null;
  studentId?: string | null;
  priority: NotificationPriority;
  status: AnnouncementStatus;
  scheduledFor?: string | null;
  publishedAt?: string | null;
  archivedAt?: string | null;
  actionUrl?: string | null;
  relatedResourceType?: string | null;
  relatedResourceId?: string | null;
  createdAt: string;
  updatedAt: string;
  // Joined display fields
  groupName?: string;
  studentName?: string;
  deliveredCount?: number;
}

export interface AnnouncementFormData {
  title: string;
  titleArabic: string;
  body: string;
  bodyArabic: string;
  targetAudience: TargetAudience;
  groupId?: string;
  studentId?: string;
  priority: NotificationPriority;
  scheduledFor?: string;
  actionUrl?: string;
  isScheduled: boolean;
}

export type NotificationFilter = 'all' | 'unread' | 'read';
