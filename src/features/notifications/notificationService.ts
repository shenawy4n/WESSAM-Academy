/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { supabase } from '../../lib/supabase/client';
import {
  Announcement,
  AnnouncementFormData,
  AppNotification,
  NotificationCategory,
  NotificationFilter,
} from './types';
import { isScheduledReadyToPublish } from './notificationUtils';

// -----------------------------------------------------------------------------
// Demo Mock Storage (for offline preview mode)
// -----------------------------------------------------------------------------
let DEMO_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'notif-1',
    title: 'Upcoming Live Class: Task 2 Essay Workshop',
    titleArabic: 'حصة تفاعلية مباشرة: ورشة عمل مقال الرأي',
    body: 'The live masterclass begins today at 19:00 (Riyadh Time). Please prepare your drafts.',
    bodyArabic: 'تنطلق ورشة العمل المباشرة اليوم في تمام الساعة 19:00 بتوقيت الرياض. يرجى تجهيز مسودات المقال.',
    type: 'live_session',
    category: 'live_session',
    priority: 'urgent',
    actionUrl: '/live-sessions',
    createdAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
    isRead: false,
  },
  {
    id: 'notif-2',
    title: 'Assessment Results Released: Grammar Foundations',
    titleArabic: 'اعتماد نتائج التقييم: أساسيات القواعد اللغوية',
    body: 'Your quiz has been evaluated. Review your answers and teacher feedback now.',
    bodyArabic: 'تم تصحيح اختبارك بنجاح. يمكنك الآن مراجعة الإجابات النموذجية وملاحظات المعلم.',
    type: 'grade',
    category: 'quiz_result',
    priority: 'important',
    actionUrl: '/assessments',
    createdAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    isRead: false,
  },
  {
    id: 'notif-3',
    title: 'New Study Material: Lexical Resource Cheat-sheet (PDF)',
    titleArabic: 'مادة دراسية جديدة: ملخص المفردات الأكاديمية (PDF)',
    body: 'A downloadable vocabulary list has been uploaded to Unit 3.',
    bodyArabic: 'تم رفع ملخص المفردات المتقدمة الخاص بالوحدة الثالثة بصيغة PDF.',
    type: 'resource',
    category: 'new_material',
    priority: 'normal',
    actionUrl: '/courses',
    createdAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    isRead: true,
    readAt: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
  },
  {
    id: 'notif-4',
    title: 'Academy Broadcast: Ramadan Schedule Adjustments',
    titleArabic: 'إعلان عام: مواعيد الحصص المباشرة خلال شهر رمضان المبارك',
    body: 'Evening live sessions will start at 21:30 Riyadh Time starting next week.',
    bodyArabic: 'ستبدأ الحصص المسائية في تمام 21:30 بتوقيت مكة المكرمة اعتباراً من الأسبوع القادم.',
    type: 'announcement',
    category: 'general',
    priority: 'important',
    actionUrl: '/announcements',
    createdAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
    isRead: true,
    readAt: new Date(Date.now() - 40 * 3600 * 1000).toISOString(),
  },
];

let DEMO_ANNOUNCEMENTS: Announcement[] = [
  {
    id: 'ann-1',
    teacherId: '11111111-1111-4111-8111-111111111111',
    title: 'Ramadan Schedule & Live Session Timings',
    titleArabic: 'جدول مواعيد الحصص المباشرة خلال شهر رمضان',
    body: 'All evening cohorts will transition to 21:30 KSA time to accommodate prayer and study schedules.',
    bodyArabic: 'سيتم تقديم الحصص المسائية لتبدأ الساعة 9:30 مساءً بتوقيت المملكة مراعاة لأوقات الصلاة والمذاكرة.',
    targetAudience: 'all_students',
    priority: 'important',
    status: 'published',
    publishedAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
    actionUrl: '/live-sessions',
    createdAt: new Date(Date.now() - 50 * 3600 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
    deliveredCount: 45,
  },
  {
    id: 'ann-2',
    teacherId: '11111111-1111-4111-8111-111111111111',
    title: 'Important: Task 2 Submission Deadline for Cohort A',
    titleArabic: 'هام: الموعد النهائي لتسليم مسودة مقال الرأي للمجموعة أ',
    body: 'Please make sure to submit your essay before Friday midnight for detailed feedback.',
    bodyArabic: 'يرجى التأكد من رفع المقال قبل منتصف ليل الجمعة للحصول على التقييم التفصيلي.',
    targetAudience: 'group',
    groupId: 'aaaaaaaa-aaaa-4aaa-8aaa-cccccccccccc',
    groupName: 'Group A - Intensive IELTS Prep',
    priority: 'urgent',
    status: 'published',
    publishedAt: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
    actionUrl: '/assessments',
    createdAt: new Date(Date.now() - 14 * 3600 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
    deliveredCount: 28,
  },
  {
    id: 'ann-3',
    teacherId: '11111111-1111-4111-8111-111111111111',
    title: 'Weekend Mock Exam Briefing',
    titleArabic: 'توجيهات الاختبار التجريبي لنهاية الأسبوع',
    body: 'Review the technical requirements for the 3-hour mock exam before taking it on Saturday.',
    bodyArabic: 'يرجى مراجعة المتطلبات التقنية للاختبار التجريبي الشامل قبل يوم السبت.',
    targetAudience: 'all_students',
    priority: 'normal',
    status: 'scheduled',
    scheduledFor: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'ann-4',
    teacherId: '11111111-1111-4111-8111-111111111111',
    title: 'Draft: Speaking Evaluation Rubric Overview',
    titleArabic: 'مسودة: معايير تقييم الطلاقة اللغوية لاختبار المحادثة',
    body: 'Drafting announcement to explain band descriptors 7 through 9.',
    bodyArabic: 'شرح لمعايير التقييم الخاصة بدرجات المحادثة من 7 إلى 9.',
    targetAudience: 'all_students',
    priority: 'normal',
    status: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export const notificationService = {
  /**
   * Fetch current user's notifications with pagination, filters, and read state.
   */
  async fetchNotifications(options?: {
    limit?: number;
    offset?: number;
    unreadOnly?: boolean;
    category?: NotificationCategory;
  }): Promise<{ notifications: AppNotification[]; totalCount: number }> {
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;
    const unreadOnly = options?.unreadOnly ?? false;
    const category = options?.category ?? null;

    if (supabase) {
      try {
        // 1. Try secure RPC
        const { data, error } = await supabase.rpc('get_my_notifications', {
          p_limit: limit,
          p_offset: offset,
          p_unread_only: unreadOnly,
          p_category: category,
        });

        if (!error && Array.isArray(data)) {
          const mapped: AppNotification[] = data.map((item: any) => ({
            id: item.id,
            title: item.title,
            titleArabic: item.title_arabic,
            body: item.body,
            bodyArabic: item.body_arabic,
            type: item.type || 'general',
            category: (item.category as NotificationCategory) || 'general',
            priority: item.priority || 'normal',
            actionUrl: item.action_url,
            relatedResourceId: item.related_resource_id,
            senderId: item.sender_id,
            announcementId: item.announcement_id,
            createdAt: item.created_at,
            isRead: Boolean(item.is_read),
            readAt: item.read_at,
          }));

          return {
            notifications: mapped,
            totalCount: mapped.length,
          };
        }
      } catch {
        // Graceful fallback to demo mode
      }
    }

    // 2. Demo fallback
    let filtered = [...DEMO_NOTIFICATIONS];
    if (unreadOnly) {
      filtered = filtered.filter((n) => !n.isRead);
    }
    if (category) {
      filtered = filtered.filter((n) => n.category === category);
    }

    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const paginated = filtered.slice(offset, offset + limit);

    return {
      notifications: paginated,
      totalCount: filtered.length,
    };
  },

  /**
   * Get unread notifications count for badge.
   */
  async getUnreadCount(): Promise<number> {
    if (supabase) {
      try {
        const { data, error } = await supabase.rpc('get_unread_notifications_count');
        if (!error && typeof data === 'number') {
          return data;
        }
      } catch {
        // fallback
      }
    }

    return DEMO_NOTIFICATIONS.filter((n) => !n.isRead).length;
  },

  /**
   * Mark a single notification as read.
   */
  async markAsRead(notificationId: string): Promise<boolean> {
    if (supabase) {
      try {
        const { data, error } = await supabase.rpc('mark_notification_as_read', {
          p_notification_id: notificationId,
        });

        if (!error) {
          // Also update local demo cache
          DEMO_NOTIFICATIONS = DEMO_NOTIFICATIONS.map((n) =>
            n.id === notificationId ? { ...n, isRead: true, readAt: new Date().toISOString() } : n
          );
          return Boolean(data);
        }
      } catch {
        // fallback
      }
    }

    DEMO_NOTIFICATIONS = DEMO_NOTIFICATIONS.map((n) =>
      n.id === notificationId ? { ...n, isRead: true, readAt: new Date().toISOString() } : n
    );
    return true;
  },

  /**
   * Mark all unread notifications as read.
   */
  async markAllAsRead(): Promise<number> {
    if (supabase) {
      try {
        const { data, error } = await supabase.rpc('mark_all_notifications_as_read');
        if (!error && typeof data === 'number') {
          DEMO_NOTIFICATIONS = DEMO_NOTIFICATIONS.map((n) => ({
            ...n,
            isRead: true,
            readAt: new Date().toISOString(),
          }));
          return data;
        }
      } catch {
        // fallback
      }
    }

    const count = DEMO_NOTIFICATIONS.filter((n) => !n.isRead).length;
    DEMO_NOTIFICATIONS = DEMO_NOTIFICATIONS.map((n) => ({
      ...n,
      isRead: true,
      readAt: new Date().toISOString(),
    }));
    return count;
  },

  /**
   * Setup Realtime subscription on notification_recipients.
   */
  subscribeToNotifications(userId: string, onUpdate: () => void) {
    if (!supabase) return () => {};

    try {
      const channel = supabase
        .channel(`user_notifications_${userId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notification_recipients',
            filter: `recipient_id=eq.${userId}`,
          },
          () => {
            onUpdate();
          }
        )
        .subscribe();

      return () => {
        if (supabase) {
          supabase.removeChannel(channel);
        }
      };
    } catch {
      return () => {};
    }
  },

  // ---------------------------------------------------------------------------
  // Teacher Announcement Management
  // ---------------------------------------------------------------------------

  /**
   * Fetch announcements list for teacher desk.
   */
  async fetchAnnouncements(teacherId?: string): Promise<Announcement[]> {
    if (supabase) {
      try {
        let query = supabase
          .from('announcements')
          .select(`
            *,
            groups:group_id (name, name_arabic),
            profiles:student_id (full_name, full_name_arabic)
          `)
          .order('created_at', { ascending: false });

        if (teacherId) {
          query = query.eq('teacher_id', teacherId);
        }

        const { data, error } = await query;
        if (!error && Array.isArray(data)) {
          return data.map((item: any) => ({
            id: item.id,
            teacherId: item.teacher_id,
            title: item.title,
            titleArabic: item.title_arabic,
            body: item.body,
            bodyArabic: item.body_arabic,
            targetAudience: item.target_audience,
            groupId: item.group_id,
            studentId: item.student_id,
            priority: item.priority,
            status: item.status,
            scheduledFor: item.scheduled_for,
            publishedAt: item.published_at,
            archivedAt: item.archived_at,
            actionUrl: item.action_url,
            relatedResourceType: item.related_resource_type,
            relatedResourceId: item.related_resource_id,
            createdAt: item.created_at,
            updatedAt: item.updated_at,
            groupName: item.groups?.name,
            studentName: item.profiles?.full_name,
          }));
        }
      } catch {
        // fallback
      }
    }

    return [...DEMO_ANNOUNCEMENTS];
  },

  /**
   * Create new announcement draft or schedule.
   */
  async createAnnouncement(
    teacherId: string,
    formData: AnnouncementFormData
  ): Promise<Announcement> {
    const status = formData.isScheduled ? 'scheduled' : 'draft';

    if (supabase) {
      try {
        const payload: any = {
          teacher_id: teacherId,
          title: formData.title,
          title_arabic: formData.titleArabic,
          body: formData.body,
          body_arabic: formData.bodyArabic,
          target_audience: formData.targetAudience,
          group_id: formData.targetAudience === 'group' ? formData.groupId : null,
          student_id: formData.targetAudience === 'student' ? formData.studentId : null,
          priority: formData.priority,
          status,
          scheduled_for: formData.isScheduled && formData.scheduledFor ? formData.scheduledFor : null,
          action_url: formData.actionUrl || null,
        };

        const { data, error } = await supabase.from('announcements').insert(payload).select().single();
        if (!error && data) {
          return {
            id: data.id,
            teacherId: data.teacher_id,
            title: data.title,
            titleArabic: data.title_arabic,
            body: data.body,
            bodyArabic: data.body_arabic,
            targetAudience: data.target_audience,
            groupId: data.group_id,
            studentId: data.student_id,
            priority: data.priority,
            status: data.status,
            scheduledFor: data.scheduled_for,
            publishedAt: data.published_at,
            archivedAt: data.archived_at,
            actionUrl: data.action_url,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
          };
        }
      } catch {
        // fallback
      }
    }

    const newDemo: Announcement = {
      id: `ann-${Date.now()}`,
      teacherId,
      title: formData.title,
      titleArabic: formData.titleArabic,
      body: formData.body,
      bodyArabic: formData.bodyArabic,
      targetAudience: formData.targetAudience,
      groupId: formData.targetAudience === 'group' ? formData.groupId : null,
      studentId: formData.targetAudience === 'student' ? formData.studentId : null,
      priority: formData.priority,
      status,
      scheduledFor: formData.isScheduled ? formData.scheduledFor : null,
      actionUrl: formData.actionUrl,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    DEMO_ANNOUNCEMENTS.unshift(newDemo);
    return newDemo;
  },

  /**
   * Update an existing announcement.
   */
  async updateAnnouncement(
    id: string,
    formData: Partial<AnnouncementFormData>
  ): Promise<boolean> {
    if (supabase) {
      try {
        const payload: any = {
          title: formData.title,
          title_arabic: formData.titleArabic,
          body: formData.body,
          body_arabic: formData.bodyArabic,
          target_audience: formData.targetAudience,
          group_id: formData.targetAudience === 'group' ? formData.groupId : null,
          student_id: formData.targetAudience === 'student' ? formData.studentId : null,
          priority: formData.priority,
          action_url: formData.actionUrl,
          updated_at: new Date().toISOString(),
        };

        if (formData.isScheduled !== undefined) {
          payload.status = formData.isScheduled ? 'scheduled' : 'draft';
          payload.scheduled_for = formData.isScheduled ? formData.scheduledFor : null;
        }

        const { error } = await supabase.from('announcements').update(payload).eq('id', id);
        if (!error) return true;
      } catch {
        // fallback
      }
    }

    DEMO_ANNOUNCEMENTS = DEMO_ANNOUNCEMENTS.map((a) =>
      a.id === id
        ? {
            ...a,
            ...formData,
            status: formData.isScheduled ? 'scheduled' : a.status === 'scheduled' ? 'draft' : a.status,
            updatedAt: new Date().toISOString(),
          }
        : a
    );
    return true;
  },

  /**
   * Publish an announcement now.
   */
  async publishAnnouncement(id: string): Promise<{ success: boolean; deliveredRecipients: number }> {
    if (supabase) {
      try {
        const { data, error } = await supabase.rpc('publish_announcement', {
          p_announcement_id: id,
        });

        if (!error && data) {
          return {
            success: true,
            deliveredRecipients: data.delivered_recipients || 0,
          };
        }
      } catch {
        // fallback
      }
    }

    // Demo fallback
    const target = DEMO_ANNOUNCEMENTS.find((a) => a.id === id);
    if (target) {
      target.status = 'published';
      target.publishedAt = new Date().toISOString();
      target.deliveredCount = 35;

      // Also create a demo notification
      DEMO_NOTIFICATIONS.unshift({
        id: `notif-${Date.now()}`,
        title: target.title,
        titleArabic: target.titleArabic,
        body: target.body,
        bodyArabic: target.bodyArabic,
        type: 'announcement',
        category: 'general',
        priority: target.priority,
        actionUrl: target.actionUrl || '/announcements',
        createdAt: new Date().toISOString(),
        isRead: false,
      });
    }

    return { success: true, deliveredRecipients: 35 };
  },

  /**
   * Archive an announcement.
   */
  async archiveAnnouncement(id: string): Promise<boolean> {
    if (supabase) {
      try {
        const { error } = await supabase.rpc('archive_announcement', {
          p_announcement_id: id,
        });

        if (!error) return true;
      } catch {
        // fallback
      }
    }

    DEMO_ANNOUNCEMENTS = DEMO_ANNOUNCEMENTS.map((a) =>
      a.id === id ? { ...a, status: 'archived', archivedAt: new Date().toISOString() } : a
    );
    return true;
  },

  /**
   * Process due scheduled announcements.
   */
  async processScheduledAnnouncements(): Promise<number> {
    if (supabase) {
      try {
        const { data, error } = await supabase.rpc('process_scheduled_announcements');
        if (!error && typeof data === 'number') {
          return data;
        }
      } catch {
        // fallback
      }
    }

    let count = 0;
    const now = new Date();
    DEMO_ANNOUNCEMENTS.forEach((a) => {
      if (a.status === 'scheduled' && isScheduledReadyToPublish(a.scheduledFor, now)) {
        a.status = 'published';
        a.publishedAt = now.toISOString();
        a.deliveredCount = 30;
        count++;
      }
    });

    return count;
  },

  /**
   * Delete draft announcement.
   */
  async deleteAnnouncement(id: string): Promise<boolean> {
    if (supabase) {
      try {
        const { error } = await supabase.from('announcements').delete().eq('id', id);
        if (!error) return true;
      } catch {
        // fallback
      }
    }

    DEMO_ANNOUNCEMENTS = DEMO_ANNOUNCEMENTS.filter((a) => a.id !== id);
    return true;
  },
};
