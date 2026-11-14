/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getSupabaseClient } from '../../lib/supabase/client';
import {
  requireSupabaseClient,
  requireAuthenticatedUser,
  throwServiceError,
  toServiceError,
  ServiceError,
} from '../../lib/errors/serviceError';
import {
  realtimeManager,
  RealtimeChangePayload,
  RealtimeChannelStatus,
} from '../notifications/realtimeManager';
import {
  AuthorizedTeacher,
  DirectMessage,
  MessageAttachment,
  MessageConversation,
} from './types';
import {
  MESSAGE_STORAGE_BUCKET,
  buildSafeStorageObjectPath,
  isSafeStorageObjectPath,
  validateMessageAttachment,
  validateMessageDraft,
} from './messageValidation';

const SERVICE = 'messagingService';

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function mapAttachment(raw: any): MessageAttachment {
  return {
    id: raw.id,
    messageId: raw.message_id,
    conversationId: raw.conversation_id,
    uploaderId: raw.uploader_id,
    storageBucket: raw.storage_bucket || MESSAGE_STORAGE_BUCKET,
    storagePath: raw.storage_path,
    fileName: raw.file_name,
    fileSizeBytes: Number(raw.file_size_bytes || 0),
    mimeType: raw.mime_type,
    fileExtension: raw.file_extension,
    createdAt: raw.created_at,
  };
}

function mapMessage(raw: any): DirectMessage {
  return {
    id: raw.id,
    conversationId: raw.conversation_id,
    senderId: raw.sender_id,
    recipientId: raw.recipient_id,
    body: raw.body ?? null,
    hasAttachments: Boolean(raw.has_attachments),
    clientMessageId: raw.client_message_id ?? null,
    isRead: Boolean(raw.is_read),
    readAt: raw.read_at ?? null,
    createdAt: raw.created_at,
    senderName: raw.sender_name,
    senderNameArabic: raw.sender_name_arabic,
    attachments: Array.isArray(raw.attachments) ? raw.attachments.map(mapAttachment) : [],
  };
}

function mapConversation(raw: any): MessageConversation {
  return {
    id: raw.id,
    studentId: raw.student_id,
    teacherId: raw.teacher_id,
    groupId: raw.group_id ?? null,
    courseId: raw.course_id ?? null,
    lastMessageAt: raw.last_message_at ?? null,
    lastMessagePreview: raw.last_message_preview ?? null,
    lastSenderId: raw.last_sender_id ?? null,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    studentName: raw.student_name || '',
    studentNameArabic: raw.student_name_arabic || raw.student_name || '',
    teacherName: raw.teacher_name || '',
    teacherNameArabic: raw.teacher_name_arabic || raw.teacher_name || '',
    groupName: raw.group_name ?? null,
    groupNameArabic: raw.group_name_arabic ?? null,
    courseTitle: raw.course_title ?? null,
    courseTitleArabic: raw.course_title_arabic ?? null,
    unreadCount: Number(raw.unread_count || 0),
  };
}

async function readFileHeaderBytes(file: File): Promise<Uint8Array | undefined> {
  if (typeof file.slice !== 'function') return undefined;
  try {
    const slice = file.slice(0, 64);
    if (typeof slice.arrayBuffer === 'function') {
      const buffer = await slice.arrayBuffer();
      return new Uint8Array(buffer);
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export interface SendMessageProgress {
  stage: 'validating' | 'uploading' | 'sending';
  uploaded: number;
  total: number;
}

export const messagingService = {
  async fetchAuthorizedTeachers(): Promise<AuthorizedTeacher[]> {
    const client = requireSupabaseClient({ service: SERVICE, operation: 'fetchAuthorizedTeachers' });
    let res;
    try {
      res = await client.rpc('get_authorized_messaging_teachers');
    } catch (err) {
      throwServiceError(err, { service: SERVICE, operation: 'fetchAuthorizedTeachers' });
    }

    if (res.error) {
      throwServiceError(res.error, {
        service: SERVICE,
        operation: 'fetchAuthorizedTeachers',
        fallbackMessage: 'Failed to load authorized teachers',
      });
    }

    const rows = Array.isArray(res.data) ? res.data : [];
    return rows.map((row: any) => ({
      teacherId: row.teacher_id,
      fullName: row.full_name,
      fullNameArabic: row.full_name_arabic || row.full_name,
      role: row.role === 'super_admin' ? 'super_admin' : 'teacher',
      groupId: row.group_id ?? null,
      groupName: row.group_name ?? null,
      groupNameArabic: row.group_name_arabic ?? null,
      courseId: row.course_id ?? null,
      courseTitle: row.course_title ?? null,
      courseTitleArabic: row.course_title_arabic ?? null,
      conversationId: row.conversation_id ?? null,
    }));
  },

  async getOrCreateConversation(params: {
    teacherId?: string;
    studentId?: string;
  }): Promise<MessageConversation> {
    const client = requireSupabaseClient({ service: SERVICE, operation: 'getOrCreateConversation' });
    let res;
    try {
      res = await client.rpc('get_or_create_student_teacher_conversation', {
        p_teacher_id: params.teacherId ?? null,
        p_student_id: params.studentId ?? null,
      });
    } catch (err) {
      throwServiceError(err, { service: SERVICE, operation: 'getOrCreateConversation' });
    }

    if (res.error) {
      throwServiceError(res.error, {
        service: SERVICE,
        operation: 'getOrCreateConversation',
        fallbackMessage: 'Failed to initialize conversation',
      });
    }

    if (!res.data || typeof res.data !== 'object') {
      throw new ServiceError({
        category: 'DATABASE_ERROR',
        message: 'Failed to initialize conversation: server returned an empty record.',
        service: SERVICE,
        operation: 'getOrCreateConversation',
      });
    }

    return mapConversation(res.data);
  },

  async fetchConversations(): Promise<MessageConversation[]> {
    const client = requireSupabaseClient({ service: SERVICE, operation: 'fetchConversations' });
    let res;
    try {
      res = await client.rpc('get_my_message_conversations');
    } catch (err) {
      throwServiceError(err, { service: SERVICE, operation: 'fetchConversations' });
    }

    if (res.error) {
      throwServiceError(res.error, {
        service: SERVICE,
        operation: 'fetchConversations',
        fallbackMessage: 'Failed to load conversations',
      });
    }

    const rows = Array.isArray(res.data) ? res.data : [];
    return rows.map(mapConversation);
  },

  async fetchMessages(
    conversationId: string,
    limit = 100,
    offset = 0
  ): Promise<DirectMessage[]> {
    const client = requireSupabaseClient({ service: SERVICE, operation: 'fetchMessages' });
    let res;
    try {
      res = await client.rpc('get_conversation_messages', {
        p_conversation_id: conversationId,
        p_limit: limit,
        p_offset: offset,
      });
    } catch (err) {
      throwServiceError(err, { service: SERVICE, operation: 'fetchMessages' });
    }

    if (res.error) {
      throwServiceError(res.error, {
        service: SERVICE,
        operation: 'fetchMessages',
        fallbackMessage: 'Failed to load conversation messages',
      });
    }

    const rows = Array.isArray(res.data) ? res.data : [];
    return rows.map(mapMessage);
  },

  async getUnreadMessagesCount(): Promise<number> {
    const client = requireSupabaseClient({ service: SERVICE, operation: 'getUnreadMessagesCount' });
    let res;
    try {
      res = await client.rpc('get_unread_messages_count');
    } catch (err) {
      throwServiceError(err, { service: SERVICE, operation: 'getUnreadMessagesCount' });
    }

    if (res.error) {
      throwServiceError(res.error, {
        service: SERVICE,
        operation: 'getUnreadMessagesCount',
        fallbackMessage: 'Failed to load unread messages count',
      });
    }

    return typeof res.data === 'number' ? res.data : Number(res.data || 0);
  },

  async markConversationRead(conversationId: string): Promise<number> {
    const client = requireSupabaseClient({ service: SERVICE, operation: 'markConversationRead' });
    let res;
    try {
      res = await client.rpc('mark_conversation_messages_read', {
        p_conversation_id: conversationId,
      });
    } catch (err) {
      throwServiceError(err, { service: SERVICE, operation: 'markConversationRead' });
    }

    if (res.error) {
      throwServiceError(res.error, {
        service: SERVICE,
        operation: 'markConversationRead',
        fallbackMessage: 'Failed to mark conversation messages as read',
      });
    }

    return typeof res.data === 'number' ? res.data : Number(res.data || 0);
  },

  async sendMessage(params: {
    conversationId: string;
    body?: string;
    files?: File[];
    clientMessageId?: string;
    onProgress?: (progress: SendMessageProgress) => void;
  }): Promise<DirectMessage> {
    const client = requireSupabaseClient({ service: SERVICE, operation: 'sendMessage' });
    const user = await requireAuthenticatedUser(client, { service: SERVICE, operation: 'sendMessage' });

    const bodyText = params.body ?? '';
    const files = params.files ?? [];

    params.onProgress?.({ stage: 'validating', uploaded: 0, total: files.length });

    const draftCheck = validateMessageDraft(bodyText, files.length);
    if (!draftCheck.valid) {
      throw new ServiceError({
        category: 'VALIDATION_ERROR',
        message: draftCheck.errorEn || 'Invalid message payload',
        service: SERVICE,
        operation: 'sendMessage',
      });
    }

    const validatedFiles: Array<{
      file: File;
      sanitizedName: string;
      extension: string;
      mimeType: string;
    }> = [];

    for (const file of files) {
      const headerBytes = await readFileHeaderBytes(file);
      const check = validateMessageAttachment(file, headerBytes);
      if (!check.valid || !check.sanitizedName || !check.extension || !check.mimeType) {
        throw new ServiceError({
          category: 'VALIDATION_ERROR',
          message: check.errorEn || `Invalid attachment "${file.name}"`,
          service: SERVICE,
          operation: 'sendMessage',
        });
      }
      validatedFiles.push({
        file,
        sanitizedName: check.sanitizedName,
        extension: check.extension,
        mimeType: check.mimeType,
      });
    }

    const uploadedPaths: string[] = [];
    const attachmentsPayload: Array<{
      storage_path: string;
      file_name: string;
      file_size_bytes: number;
      mime_type: string;
      file_extension: string;
    }> = [];

    try {
      for (let i = 0; i < validatedFiles.length; i += 1) {
        const item = validatedFiles[i];
        params.onProgress?.({ stage: 'uploading', uploaded: i, total: validatedFiles.length });

        const storagePath = buildSafeStorageObjectPath(
          params.conversationId,
          user.id,
          item.sanitizedName
        );

        const uploadRes = await client.storage
          .from(MESSAGE_STORAGE_BUCKET)
          .upload(storagePath, item.file, {
            cacheControl: '3600',
            upsert: false,
            contentType: item.mimeType,
          });

        if (uploadRes.error) {
          throwServiceError(uploadRes.error, {
            service: SERVICE,
            operation: 'sendMessage.uploadAttachment',
            fallbackMessage: `Failed to upload attachment "${item.file.name}"`,
          });
        }

        uploadedPaths.push(storagePath);
        attachmentsPayload.push({
          storage_path: storagePath,
          file_name: item.file.name.slice(0, 255),
          file_size_bytes: item.file.size,
          mime_type: item.mimeType,
          file_extension: item.extension,
        });
      }

      params.onProgress?.({
        stage: 'sending',
        uploaded: validatedFiles.length,
        total: validatedFiles.length,
      });

      const rpcRes = await client.rpc('send_direct_message', {
        p_conversation_id: params.conversationId,
        p_body: bodyText.trim() ? bodyText.trim() : null,
        p_attachments: attachmentsPayload,
        p_client_message_id: params.clientMessageId || generateUuid(),
      });

      if (rpcRes.error) {
        throwServiceError(rpcRes.error, {
          service: SERVICE,
          operation: 'sendMessage.persist',
          fallbackMessage: 'Failed to send message',
        });
      }

      if (!rpcRes.data || typeof rpcRes.data !== 'object') {
        throw new ServiceError({
          category: 'DATABASE_ERROR',
          message: 'Message persistence returned an empty server response.',
          service: SERVICE,
          operation: 'sendMessage.persist',
        });
      }

      return mapMessage(rpcRes.data);
    } catch (err) {
      // Clean up any storage objects uploaded during this failed send attempt
      if (uploadedPaths.length > 0) {
        try {
          await client.storage.from(MESSAGE_STORAGE_BUCKET).remove(uploadedPaths);
        } catch {
          // Best-effort rollback cleanup; DB never persisted orphan metadata
        }
      }
      throw toServiceError(err, {
        service: SERVICE,
        operation: 'sendMessage',
        fallbackMessage: 'Failed to deliver message',
      });
    }
  },

  async getAttachmentSignedUrl(storagePath: string, expiresInSeconds = 300): Promise<string> {
    const client = requireSupabaseClient({ service: SERVICE, operation: 'getAttachmentSignedUrl' });

    if (!isSafeStorageObjectPath(storagePath)) {
      throw new ServiceError({
        category: 'VALIDATION_ERROR',
        message: 'Invalid or unsafe attachment storage path.',
        service: SERVICE,
        operation: 'getAttachmentSignedUrl',
      });
    }

    let res;
    try {
      res = await client.storage
        .from(MESSAGE_STORAGE_BUCKET)
        .createSignedUrl(storagePath, expiresInSeconds);
    } catch (err) {
      throwServiceError(err, { service: SERVICE, operation: 'getAttachmentSignedUrl' });
    }

    if (res.error || !res.data?.signedUrl) {
      throwServiceError(res.error || new Error('Failed to generate signed attachment URL'), {
        service: SERVICE,
        operation: 'getAttachmentSignedUrl',
        fallbackMessage: 'Failed to generate secure download link',
      });
    }

    return res.data.signedUrl;
  },

  subscribeToMessages(
    userId: string,
    onUpdate: (payload: RealtimeChangePayload) => void,
    onError?: (error: ServiceError) => void,
    onStatusChange?: (status: RealtimeChannelStatus) => void
  ): () => void {
    if (!userId) {
      return () => {};
    }

    const client = getSupabaseClient();
    if (!client) {
      onError?.(
        new ServiceError({
          category: 'CONFIGURATION_ERROR',
          message: 'Supabase client is not configured for realtime messaging.',
          service: SERVICE,
          operation: 'subscribeToMessages',
        })
      );
      return () => {};
    }

    try {
      const handle = realtimeManager.subscribe({
        client,
        scope: 'messages',
        userId,
        baseTopic: `user_messages_${userId}`,
        filters: [
          {
            event: '*',
            schema: 'public',
            table: 'messages',
            filter: `recipient_id=eq.${userId}`,
          },
          {
            event: '*',
            schema: 'public',
            table: 'messages',
            filter: `sender_id=eq.${userId}`,
          },
        ],
        listener: {
          onUpdate,
          onError,
          onStatusChange,
        },
      });

      return handle.unsubscribe;
    } catch (err) {
      onError?.(
        toServiceError(err, {
          service: SERVICE,
          operation: 'subscribeToMessages',
          fallbackMessage: 'Failed to initialize realtime messaging channel',
        })
      );
      return () => {};
    }
  },

  retryMessagesSubscription(userId: string): void {
    const client = getSupabaseClient();
    if (!client || !userId) return;
    realtimeManager.retry(client, 'messages', userId);
  },
};
