/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface AuthorizedTeacher {
  teacherId: string;
  fullName: string;
  fullNameArabic: string;
  role: 'teacher' | 'super_admin';
  groupId?: string | null;
  groupName?: string | null;
  groupNameArabic?: string | null;
  courseId?: string | null;
  courseTitle?: string | null;
  courseTitleArabic?: string | null;
  conversationId?: string | null;
}

export interface MessageAttachment {
  id: string;
  messageId: string;
  conversationId: string;
  uploaderId: string;
  storageBucket: string;
  storagePath: string;
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  fileExtension: string;
  createdAt: string;
}

export interface DirectMessage {
  id: string;
  conversationId: string;
  senderId: string;
  recipientId: string;
  body: string | null;
  hasAttachments: boolean;
  clientMessageId?: string | null;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
  senderName?: string;
  senderNameArabic?: string;
  attachments: MessageAttachment[];
}

export interface MessageConversation {
  id: string;
  studentId: string;
  teacherId: string;
  groupId?: string | null;
  courseId?: string | null;
  lastMessageAt?: string | null;
  lastMessagePreview?: string | null;
  lastSenderId?: string | null;
  createdAt: string;
  updatedAt: string;
  studentName: string;
  studentNameArabic: string;
  teacherName: string;
  teacherNameArabic: string;
  groupName?: string | null;
  groupNameArabic?: string | null;
  courseTitle?: string | null;
  courseTitleArabic?: string | null;
  unreadCount: number;
}

export interface PendingAttachmentItem {
  id: string;
  file: File;
  sanitizedName: string;
  extension: string;
  mimeType: string;
  previewUrl?: string;
}
