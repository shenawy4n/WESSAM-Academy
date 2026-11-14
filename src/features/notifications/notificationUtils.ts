/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppNotification, NotificationCategory, NotificationFilter, NotificationPriority } from './types';

export function resolveCategoryLabel(category: NotificationCategory, isRtl: boolean): string {
  switch (category) {
    case 'general':
      return isRtl ? 'إعلان عام' : 'General Announcement';
    case 'new_lesson':
      return isRtl ? 'درس جديد' : 'New Lesson';
    case 'new_material':
      return isRtl ? 'مادة تعليمية' : 'Study Material';
    case 'live_session':
      return isRtl ? 'حصة مباشرة' : 'Live Session';
    case 'quiz_published':
      return isRtl ? 'اختبار متاح' : 'Assessment';
    case 'quiz_result':
      return isRtl ? 'نتيجة اختبار' : 'Assessment Result';
    case 'teacher_message':
      return isRtl ? 'رسالة المعلم' : 'Teacher Message';
    case 'student_message':
      return isRtl ? 'رسالة الطالب' : 'Student Message';
    case 'account_alert':
      return isRtl ? 'تنبيه الحساب' : 'Account Alert';
    default:
      return isRtl ? 'تنبيه' : 'Notification';
  }
}

export function resolveCategoryBadge(category: NotificationCategory): {
  bg: string;
  text: string;
  border: string;
} {
  switch (category) {
    case 'live_session':
      return { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' };
    case 'quiz_published':
    case 'quiz_result':
      return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' };
    case 'new_lesson':
    case 'new_material':
      return { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' };
    case 'account_alert':
      return { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' };
    case 'teacher_message':
      return { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' };
    case 'student_message':
      return { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' };
    case 'general':
    default:
      return { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' };
  }
}

export function resolvePriorityLabel(priority: NotificationPriority, isRtl: boolean): string {
  switch (priority) {
    case 'urgent':
      return isRtl ? 'عاجل' : 'Urgent';
    case 'important':
      return isRtl ? 'هام' : 'Important';
    case 'normal':
    default:
      return isRtl ? 'عادي' : 'Normal';
  }
}

export function resolvePriorityBadge(priority: NotificationPriority): {
  bg: string;
  text: string;
  border: string;
} {
  switch (priority) {
    case 'urgent':
      return { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' };
    case 'important':
      return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' };
    case 'normal':
    default:
      return { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' };
  }
}

export function filterNotifications(
  notifications: AppNotification[],
  filter: NotificationFilter,
  category: NotificationCategory | 'all',
  searchQuery = ''
): AppNotification[] {
  return notifications.filter((notif) => {
    // 1. Read / Unread Filter
    if (filter === 'unread' && notif.isRead) return false;
    if (filter === 'read' && !notif.isRead) return false;

    // 2. Category Filter
    if (category !== 'all' && notif.category !== category) return false;

    // 3. Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchTitle = notif.title.toLowerCase().includes(q) || notif.titleArabic.includes(q);
      const matchBody = notif.body.toLowerCase().includes(q) || notif.bodyArabic.includes(q);
      if (!matchTitle && !matchBody) return false;
    }

    return true;
  });
}

export function computeUnreadCount(notifications: AppNotification[]): number {
  return notifications.reduce((acc, curr) => (!curr.isRead ? acc + 1 : acc), 0);
}

export function isScheduledReadyToPublish(scheduledFor: string | null | undefined, now = new Date()): boolean {
  if (!scheduledFor) return false;
  const scheduledTime = new Date(scheduledFor).getTime();
  return !isNaN(scheduledTime) && scheduledTime <= now.getTime();
}

export function buildIdempotencyKey(prefix: string, id: string, differentiator?: string | number): string {
  if (differentiator !== undefined && differentiator !== null) {
    return `${prefix}_${id}_${differentiator}`;
  }
  return `${prefix}_${id}`;
}

export function formatNotificationTime(dateString: string, isRtl: boolean): string {
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;

    // Asia/Riyadh formatting
    return new Intl.DateTimeFormat(isRtl ? 'ar-SA' : 'en-US', {
      timeZone: 'Asia/Riyadh',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(d);
  } catch {
    return dateString;
  }
}
