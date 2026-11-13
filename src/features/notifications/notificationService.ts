/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getSupabaseClient } from '../../lib/supabase/client';
import {
  requireSupabaseClient,
  throwServiceError,
  toServiceError,
  ServiceError,
} from '../../lib/errors/serviceError';
import {
  Announcement,
  AnnouncementFormData,
  AppNotification,
  NotificationCategory,
} from './types';

const SERVICE = 'notificationService';

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
    const client = requireSupabaseClient({ service: SERVICE, operation: 'fetchNotifications' });
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;
    const unreadOnly = options?.unreadOnly ?? false;
    const category = options?.category ?? null;

    let res;
    try {
      res = await client.rpc('get_my_notifications', {
        p_limit: limit,
        p_offset: offset,
        p_unread_only: unreadOnly,
        p_category: category,
      });
    } catch (err) {
      throwServiceError(err, { service: SERVICE, operation: 'fetchNotifications' });
    }

    if (res.error) {
      throwServiceError(res.error, {
        service: SERVICE,
        operation: 'fetchNotifications',
        fallbackMessage: 'Failed to load notifications',
      });
    }

    const rows = Array.isArray(res.data) ? res.data : [];
    const mapped: AppNotification[] = rows.map((item: any) => ({
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
  },

  /**
   * Get unread notifications count for badge.
   */
  async getUnreadCount(): Promise<number> {
    const client = requireSupabaseClient({ service: SERVICE, operation: 'getUnreadCount' });

    let res;
    try {
      res = await client.rpc('get_unread_notifications_count');
    } catch (err) {
      throwServiceError(err, { service: SERVICE, operation: 'getUnreadCount' });
    }

    if (res.error) {
      throwServiceError(res.error, {
        service: SERVICE,
        operation: 'getUnreadCount',
        fallbackMessage: 'Failed to load unread notifications count',
      });
    }

    if (typeof res.data !== 'number' && res.data !== null && res.data !== undefined) {
      const parsed = Number(res.data);
      if (Number.isNaN(parsed)) {
        throw new ServiceError({
          category: 'DATABASE_ERROR',
          message: 'Unexpected unread count response from server.',
          service: SERVICE,
          operation: 'getUnreadCount',
        });
      }
      return parsed;
    }

    return res.data ?? 0;
  },

  /**
   * Mark a single notification as read.
   */
  async markAsRead(notificationId: string): Promise<boolean> {
    const client = requireSupabaseClient({ service: SERVICE, operation: 'markAsRead' });

    let res;
    try {
      res = await client.rpc('mark_notification_as_read', {
        p_notification_id: notificationId,
      });
    } catch (err) {
      throwServiceError(err, { service: SERVICE, operation: 'markAsRead' });
    }

    if (res.error) {
      throwServiceError(res.error, {
        service: SERVICE,
        operation: 'markAsRead',
        fallbackMessage: 'Failed to mark notification as read',
      });
    }

    return Boolean(res.data);
  },

  /**
   * Mark all unread notifications as read.
   */
  async markAllAsRead(): Promise<number> {
    const client = requireSupabaseClient({ service: SERVICE, operation: 'markAllAsRead' });

    let res;
    try {
      res = await client.rpc('mark_all_notifications_as_read');
    } catch (err) {
      throwServiceError(err, { service: SERVICE, operation: 'markAllAsRead' });
    }

    if (res.error) {
      throwServiceError(res.error, {
        service: SERVICE,
        operation: 'markAllAsRead',
        fallbackMessage: 'Failed to mark all notifications as read',
      });
    }

    return typeof res.data === 'number' ? res.data : Number(res.data || 0);
  },

  /**
   * Setup Realtime subscription on notification_recipients.
   */
  subscribeToNotifications(
    userId: string,
    onUpdate: () => void,
    onError?: (error: ServiceError) => void
  ): () => void {
    const client = getSupabaseClient();
    if (!client) {
      onError?.(
        new ServiceError({
          category: 'CONFIGURATION_ERROR',
          message: 'Supabase client is not configured for realtime notifications.',
          service: SERVICE,
          operation: 'subscribeToNotifications',
        })
      );
      return () => {};
    }

    try {
      const channel = client
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
        .subscribe((status, err) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            onError?.(
              toServiceError(err || new Error(`Realtime subscription status: ${status}`), {
                service: SERVICE,
                operation: 'subscribeToNotifications',
                fallbackMessage: 'Failed to subscribe to realtime notifications',
              })
            );
          }
        });

      return () => {
        try {
          client.removeChannel(channel);
        } catch {
          // cleanup only on unmount
        }
      };
    } catch (err) {
      onError?.(
        toServiceError(err, {
          service: SERVICE,
          operation: 'subscribeToNotifications',
          fallbackMessage: 'Failed to initialize realtime notifications channel',
        })
      );
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
    const client = requireSupabaseClient({ service: SERVICE, operation: 'fetchAnnouncements' });

    let query = client
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

    let res;
    try {
      res = await query;
    } catch (err) {
      throwServiceError(err, { service: SERVICE, operation: 'fetchAnnouncements' });
    }

    if (res.error) {
      throwServiceError(res.error, {
        service: SERVICE,
        operation: 'fetchAnnouncements',
        fallbackMessage: 'Failed to fetch announcements',
      });
    }

    return (res.data || []).map((item: any) => ({
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
  },

  /**
   * Create new announcement draft or schedule.
   */
  async createAnnouncement(
    teacherId: string,
    formData: AnnouncementFormData
  ): Promise<Announcement> {
    const client = requireSupabaseClient({ service: SERVICE, operation: 'createAnnouncement' });
    const status = formData.isScheduled ? 'scheduled' : 'draft';

    const payload: Record<string, unknown> = {
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

    let res;
    try {
      res = await client.from('announcements').insert(payload).select().single();
    } catch (err) {
      throwServiceError(err, { service: SERVICE, operation: 'createAnnouncement' });
    }

    if (res.error) {
      throwServiceError(res.error, {
        service: SERVICE,
        operation: 'createAnnouncement',
        fallbackMessage: 'Failed to create announcement',
      });
    }

    const data = res.data;
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
  },

  /**
   * Update an existing announcement.
   */
  async updateAnnouncement(
    id: string,
    formData: Partial<AnnouncementFormData>
  ): Promise<boolean> {
    const client = requireSupabaseClient({ service: SERVICE, operation: 'updateAnnouncement' });

    const payload: Record<string, unknown> = {
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

    let res;
    try {
      res = await client.from('announcements').update(payload).eq('id', id);
    } catch (err) {
      throwServiceError(err, { service: SERVICE, operation: 'updateAnnouncement' });
    }

    if (res.error) {
      throwServiceError(res.error, {
        service: SERVICE,
        operation: 'updateAnnouncement',
        fallbackMessage: 'Failed to update announcement',
      });
    }

    return true;
  },

  /**
   * Publish an announcement now.
   */
  async publishAnnouncement(id: string): Promise<{ success: boolean; deliveredRecipients: number }> {
    const client = requireSupabaseClient({ service: SERVICE, operation: 'publishAnnouncement' });

    let res;
    try {
      res = await client.rpc('publish_announcement', {
        p_announcement_id: id,
      });
    } catch (err) {
      throwServiceError(err, { service: SERVICE, operation: 'publishAnnouncement' });
    }

    if (res.error) {
      throwServiceError(res.error, {
        service: SERVICE,
        operation: 'publishAnnouncement',
        fallbackMessage: 'Failed to publish announcement',
      });
    }

    return {
      success: true,
      deliveredRecipients: res.data?.delivered_recipients || 0,
    };
  },

  /**
   * Archive an announcement.
   */
  async archiveAnnouncement(id: string): Promise<boolean> {
    const client = requireSupabaseClient({ service: SERVICE, operation: 'archiveAnnouncement' });

    let res;
    try {
      res = await client.rpc('archive_announcement', {
        p_announcement_id: id,
      });
    } catch (err) {
      throwServiceError(err, { service: SERVICE, operation: 'archiveAnnouncement' });
    }

    if (res.error) {
      throwServiceError(res.error, {
        service: SERVICE,
        operation: 'archiveAnnouncement',
        fallbackMessage: 'Failed to archive announcement',
      });
    }

    return true;
  },

  /**
   * Process due scheduled announcements.
   */
  async processScheduledAnnouncements(): Promise<number> {
    const client = requireSupabaseClient({
      service: SERVICE,
      operation: 'processScheduledAnnouncements',
    });

    let res;
    try {
      res = await client.rpc('process_scheduled_announcements');
    } catch (err) {
      throwServiceError(err, { service: SERVICE, operation: 'processScheduledAnnouncements' });
    }

    if (res.error) {
      throwServiceError(res.error, {
        service: SERVICE,
        operation: 'processScheduledAnnouncements',
        fallbackMessage: 'Failed to process scheduled announcements',
      });
    }

    return typeof res.data === 'number' ? res.data : Number(res.data || 0);
  },

  /**
   * Delete draft announcement.
   */
  async deleteAnnouncement(id: string): Promise<boolean> {
    const client = requireSupabaseClient({ service: SERVICE, operation: 'deleteAnnouncement' });

    let res;
    try {
      res = await client.from('announcements').delete().eq('id', id);
    } catch (err) {
      throwServiceError(err, { service: SERVICE, operation: 'deleteAnnouncement' });
    }

    if (res.error) {
      throwServiceError(res.error, {
        service: SERVICE,
        operation: 'deleteAnnouncement',
        fallbackMessage: 'Failed to delete announcement',
      });
    }

    return true;
  },
};
