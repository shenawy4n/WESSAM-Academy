/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Send,
  Paperclip,
  FileText,
  Image as ImageIcon,
  Music,
  Archive,
  Download,
  Eye,
  X,
  Search,
  RefreshCw,
  MessageSquare,
  UserCheck,
  WifiOff,
  Check,
  CheckCheck,
  Plus,
  Clock,
  GraduationCap,
} from 'lucide-react';
import { useLocale } from '../../hooks/useLocale';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { Modal } from '../../components/ui/Modal';
import { formatRiyadhDateTime } from '../../lib/dateUtils';
import { formatFileSize } from '../assignments/assignmentUtils';
import { fetchStudents, StudentRecord } from '../students/studentService';
import { messagingService, SendMessageProgress } from './messagingService';
import {
  AuthorizedTeacher,
  DirectMessage,
  MessageAttachment,
  MessageConversation,
  PendingAttachmentItem,
} from './types';
import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_MESSAGE_BODY_LENGTH,
  isImageAttachment,
  validateMessageAttachment,
  validateMessageDraft,
} from './messageValidation';
import type { RealtimeChannelStatus } from '../notifications/realtimeManager';

interface MessagingWorkspaceProps {
  mode: 'student' | 'teacher';
  initialConversationId?: string | null;
  onClearInitialConversation?: () => void;
}

const ACCEPTED_FILE_INPUT =
  '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.jpg,.jpeg,.png,.webp,.mp3,.wav,.m4a,.txt';

export const MessagingWorkspace: React.FC<MessagingWorkspaceProps> = ({
  mode,
  initialConversationId,
  onClearInitialConversation,
}) => {
  const { isRtl } = useLocale();
  const { user } = useAuth();

  const [conversations, setConversations] = useState<MessageConversation[]>([]);
  const [authorizedTeachers, setAuthorizedTeachers] = useState<AuthorizedTeacher[]>([]);
  const [teacherStudents, setTeacherStudents] = useState<StudentRecord[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(
    initialConversationId || null
  );
  const [messages, setMessages] = useState<DirectMessage[]>([]);

  const [isLoadingList, setIsLoadingList] = useState<boolean>(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(false);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [sendProgress, setSendProgress] = useState<SendMessageProgress | null>(null);
  const [isStartingConversation, setIsStartingConversation] = useState<boolean>(false);

  const [listError, setListError] = useState<unknown>(null);
  const [messagesError, setMessagesError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeChannelStatus>('SUBSCRIBING');
  const [realtimeError, setRealtimeError] = useState<unknown>(null);
  const [isOffline, setIsOffline] = useState<boolean>(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [draftBody, setDraftBody] = useState<string>('');
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachmentItem[]>([]);

  // Teacher "New Message to Student" modal
  const [isNewStudentModalOpen, setIsNewStudentModalOpen] = useState<boolean>(false);
  const [studentPickerQuery, setStudentPickerQuery] = useState<string>('');
  const [isLoadingStudents, setIsLoadingStudents] = useState<boolean>(false);
  const [modalError, setModalError] = useState<unknown>(null);

  // Secure attachment preview state
  const [loadingAttachmentId, setLoadingAttachmentId] = useState<string | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<{
    attachment: MessageAttachment;
    signedUrl: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeSessionRef = useRef<{ userId?: string; generation: number }>({
    userId: user?.id,
    generation: 0,
  });
  const selectedConversationRef = useRef<string | null>(selectedConversationId);
  selectedConversationRef.current = selectedConversationId;
  const initialConversationIdRef = useRef<string | null | undefined>(initialConversationId);
  initialConversationIdRef.current = initialConversationId;
  const pendingAttachmentsRef = useRef<PendingAttachmentItem[]>([]);
  pendingAttachmentsRef.current = pendingAttachments;

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Revoke any remaining preview object URLs strictly on component unmount
  useEffect(() => {
    return () => {
      pendingAttachmentsRef.current.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
    };
  }, []);

  const loadInboxData = useCallback(
    async (showLoader = true) => {
      const currentUserId = user?.id;
      const generation = activeSessionRef.current.generation;
      if (!currentUserId) return;

      if (showLoader) setIsLoadingList(true);
      setListError(null);

      try {
        const [convList, teachersList] = await Promise.all([
          messagingService.fetchConversations(),
          mode === 'student' ? messagingService.fetchAuthorizedTeachers() : Promise.resolve([]),
        ]);

        if (
          activeSessionRef.current.userId !== currentUserId ||
          activeSessionRef.current.generation !== generation
        ) {
          return;
        }

        setConversations(convList);
        if (mode === 'student') {
          setAuthorizedTeachers(teachersList);
        }

        // Preserve selection or auto-select initialConversationId / first conversation
        const targetInitialId = initialConversationIdRef.current;
        setSelectedConversationId((prev) => {
          if (targetInitialId && convList.some((c) => c.id === targetInitialId)) {
            return targetInitialId;
          }
          if (prev && convList.some((c) => c.id === prev)) {
            return prev;
          }
          return convList[0]?.id || null;
        });
      } catch (err) {
        if (
          activeSessionRef.current.userId !== currentUserId ||
          activeSessionRef.current.generation !== generation
        ) {
          return;
        }
        setListError(err);
      } finally {
        if (
          activeSessionRef.current.userId === currentUserId &&
          activeSessionRef.current.generation === generation
        ) {
          setIsLoadingList(false);
        }
      }
    },
    [user?.id, mode]
  );

  const loadConversationMessages = useCallback(
    async (conversationId: string, showLoader = true) => {
      const currentUserId = user?.id;
      const generation = activeSessionRef.current.generation;
      if (!currentUserId || !conversationId) return;

      if (showLoader) setIsLoadingMessages(true);
      setMessagesError(null);

      try {
        const rows = await messagingService.fetchMessages(conversationId);
        if (
          activeSessionRef.current.userId !== currentUserId ||
          activeSessionRef.current.generation !== generation ||
          selectedConversationRef.current !== conversationId
        ) {
          return;
        }
        setMessages(rows);

        const hasUnreadIncoming = rows.some(
          (m) => m.recipientId === currentUserId && !m.isRead
        );
        if (hasUnreadIncoming) {
          await messagingService.markConversationRead(conversationId);
          setConversations((prev) =>
            prev.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c))
          );
          setMessages((prev) =>
            prev.map((m) =>
              m.recipientId === currentUserId && !m.isRead
                ? { ...m, isRead: true, readAt: new Date().toISOString() }
                : m
            )
          );
        }
      } catch (err) {
        if (
          activeSessionRef.current.userId !== currentUserId ||
          activeSessionRef.current.generation !== generation
        ) {
          return;
        }
        setMessagesError(err);
      } finally {
        if (
          activeSessionRef.current.userId === currentUserId &&
          activeSessionRef.current.generation === generation
        ) {
          setIsLoadingMessages(false);
        }
      }
    },
    [user?.id]
  );

  useEffect(() => {
    const nextGen = activeSessionRef.current.generation + 1;
    activeSessionRef.current = {
      userId: user?.id,
      generation: nextGen,
    };
    let isActive = true;

    loadInboxData(true);

    if (!user?.id) {
      return () => {
        isActive = false;
      };
    }

    const unsubscribe = messagingService.subscribeToMessages(
      user.id,
      (payload) => {
        if (!isActive) return;
        const row = (payload.new || payload.old) as Record<string, unknown> | null | undefined;
        const changedConvId =
          typeof row?.conversation_id === 'string' ? row.conversation_id : null;

        loadInboxData(false);
        if (changedConvId && selectedConversationRef.current === changedConvId) {
          loadConversationMessages(changedConvId, false);
        }
      },
      (err) => {
        if (isActive) {
          setRealtimeError(err);
        }
      },
      (status) => {
        if (isActive) {
          setRealtimeStatus(status);
          if (status === 'SUBSCRIBED') {
            setRealtimeError(null);
          }
        }
      }
    );

    return () => {
      isActive = false;
      activeSessionRef.current.generation += 1;
      unsubscribe();
    };
  }, [user?.id, loadInboxData, loadConversationMessages]);

  useEffect(() => {
    if (initialConversationId) {
      setSelectedConversationId(initialConversationId);
      onClearInitialConversation?.();
    }
  }, [initialConversationId, onClearInitialConversation]);

  useEffect(() => {
    if (selectedConversationId) {
      loadConversationMessages(selectedConversationId, true);
    } else {
      setMessages([]);
    }
  }, [selectedConversationId, loadConversationMessages]);

  useEffect(() => {
    if (messages.length > 0 && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages.length, selectedConversationId]);

  const selectedConversation = useMemo(
    () => conversations.find((c) => c.id === selectedConversationId) || null,
    [conversations, selectedConversationId]
  );

  const filteredConversations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((conv) => {
      const targetName =
        mode === 'student'
          ? `${conv.teacherName} ${conv.teacherNameArabic}`
          : `${conv.studentName} ${conv.studentNameArabic}`;
      const groupName = `${conv.groupName || ''} ${conv.groupNameArabic || ''}`;
      const preview = conv.lastMessagePreview || '';
      return (
        targetName.toLowerCase().includes(q) ||
        groupName.toLowerCase().includes(q) ||
        preview.toLowerCase().includes(q)
      );
    });
  }, [conversations, searchQuery, mode]);

  const unstartedAuthorizedTeachers = useMemo(() => {
    if (mode !== 'student') return [];
    const existingTeacherIds = new Set(conversations.map((c) => c.teacherId));
    return authorizedTeachers.filter((t) => !existingTeacherIds.has(t.teacherId));
  }, [authorizedTeachers, conversations, mode]);

  const totalUnread = useMemo(
    () => conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0),
    [conversations]
  );

  const handleStartTeacherConversation = async (teacherId: string) => {
    setActionError(null);
    setIsStartingConversation(true);
    try {
      const conv = await messagingService.getOrCreateConversation({ teacherId });
      setConversations((prev) => {
        const exists = prev.some((c) => c.id === conv.id);
        return exists ? prev : [conv, ...prev];
      });
      setSelectedConversationId(conv.id);
    } catch (err) {
      setActionError(err);
    } finally {
      setIsStartingConversation(false);
    }
  };

  const handleOpenNewStudentModal = async () => {
    setIsNewStudentModalOpen(true);
    setModalError(null);
    setActionError(null);
    if (teacherStudents.length > 0) return;

    setIsLoadingStudents(true);
    try {
      const roster = await fetchStudents();
      setTeacherStudents(roster.filter((s) => s.status === 'active'));
    } catch (err) {
      setModalError(err);
    } finally {
      setIsLoadingStudents(false);
    }
  };

  const handleStartStudentConversation = async (studentId: string) => {
    setModalError(null);
    setActionError(null);
    setIsStartingConversation(true);
    try {
      const conv = await messagingService.getOrCreateConversation({ studentId });
      setConversations((prev) => {
        const exists = prev.some((c) => c.id === conv.id);
        return exists ? prev : [conv, ...prev];
      });
      setSelectedConversationId(conv.id);
      setIsNewStudentModalOpen(false);
    } catch (err) {
      setModalError(err);
    } finally {
      setIsStartingConversation(false);
    }
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    e.target.value = '';
    if (selectedFiles.length === 0) return;

    setValidationMessage(null);
    setActionError(null);

    if (pendingAttachments.length + selectedFiles.length > MAX_ATTACHMENTS_PER_MESSAGE) {
      setValidationMessage(
        isRtl
          ? `الحد الأقصى هو ${MAX_ATTACHMENTS_PER_MESSAGE} مرفقات في الرسالة الواحدة.`
          : `Maximum ${MAX_ATTACHMENTS_PER_MESSAGE} attachments allowed per message.`
      );
      return;
    }

    const nextItems: PendingAttachmentItem[] = [];
    for (const file of selectedFiles) {
      const check = validateMessageAttachment(file);
      if (!check.valid || !check.sanitizedName || !check.extension || !check.mimeType) {
        setValidationMessage(
          isRtl
            ? check.errorAr || check.errorEn || 'ملف غير صالح'
            : check.errorEn || 'Invalid file selected'
        );
        return;
      }

      const previewUrl = isImageAttachment(check.mimeType, check.extension)
        ? URL.createObjectURL(file)
        : undefined;

      nextItems.push({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        file,
        sanitizedName: check.sanitizedName,
        extension: check.extension,
        mimeType: check.mimeType,
        previewUrl,
      });
    }

    setPendingAttachments((prev) => [...prev, ...nextItems]);
  };

  const handleRemovePendingAttachment = (id: string) => {
    setPendingAttachments((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((item) => item.id !== id);
    });
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedConversationId || isSending) return;

    setValidationMessage(null);
    setActionError(null);

    if (isOffline) {
      setValidationMessage(
        isRtl
          ? 'أنت غير متصل بالإنترنت حالياً. يرجى استعادة الاتصال ثم إعادة المحاولة.'
          : 'You appear to be offline. Reconnect to send your message.'
      );
      return;
    }

    const draftCheck = validateMessageDraft(draftBody, pendingAttachments.length);
    if (!draftCheck.valid) {
      setValidationMessage(
        isRtl
          ? draftCheck.errorAr || draftCheck.errorEn || 'يرجى كتابة رسالة'
          : draftCheck.errorEn || 'Please enter a message'
      );
      return;
    }

    setIsSending(true);
    setSendProgress({
      stage: pendingAttachments.length > 0 ? 'uploading' : 'sending',
      uploaded: 0,
      total: pendingAttachments.length,
    });

    try {
      const sent = await messagingService.sendMessage({
        conversationId: selectedConversationId,
        body: draftBody,
        files: pendingAttachments.map((p) => p.file),
        onProgress: (progress) => setSendProgress(progress),
      });

      setMessages((prev) =>
        prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]
      );
      setConversations((prev) => {
        const updated = prev.map((c) =>
          c.id === selectedConversationId
            ? {
                ...c,
                lastMessageAt: sent.createdAt,
                lastMessagePreview:
                  sent.body?.slice(0, 140) ||
                  (sent.attachments.length > 0
                    ? isRtl
                      ? `مرفق (${sent.attachments.length})`
                      : `Attachment (${sent.attachments.length})`
                    : ''),
                lastSenderId: sent.senderId,
                updatedAt: sent.createdAt,
              }
            : c
        );
        return [...updated].sort((a, b) =>
          (b.lastMessageAt || b.updatedAt).localeCompare(a.lastMessageAt || a.updatedAt)
        );
      });

      setDraftBody('');
      pendingAttachments.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
      setPendingAttachments([]);
    } catch (err) {
      setActionError(err);
    } finally {
      setIsSending(false);
      setSendProgress(null);
    }
  };

  const handleOpenAttachment = async (attachment: MessageAttachment) => {
    setActionError(null);
    setLoadingAttachmentId(attachment.id);
    try {
      const signedUrl = await messagingService.getAttachmentSignedUrl(attachment.storagePath);
      if (isImageAttachment(attachment.mimeType, attachment.fileExtension)) {
        setPreviewAttachment({ attachment, signedUrl });
        return;
      }

      // Safe download/open link without window.open
      const link = document.createElement('a');
      link.href = signedUrl;
      link.download = attachment.fileName;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      setActionError(err);
    } finally {
      setLoadingAttachmentId(null);
    }
  };

  const renderAttachmentIcon = (mimeType: string, ext: string) => {
    if (isImageAttachment(mimeType, ext)) return <ImageIcon className="w-4 h-4 text-blue-600" />;
    if (mimeType.startsWith('audio/')) return <Music className="w-4 h-4 text-purple-600" />;
    if (ext === 'zip') return <Archive className="w-4 h-4 text-amber-600" />;
    return <FileText className="w-4 h-4 text-slate-600" />;
  };

  const filteredTeacherStudents = useMemo(() => {
    const q = studentPickerQuery.trim().toLowerCase();
    if (!q) return teacherStudents;
    return teacherStudents.filter(
      (s) =>
        s.fullName.toLowerCase().includes(q) ||
        s.fullNameArabic.toLowerCase().includes(q) ||
        (s.academicProfile?.username || '').toLowerCase().includes(q) ||
        (s.academicProfile?.studentNumber || '').toLowerCase().includes(q)
    );
  }, [teacherStudents, studentPickerQuery]);

  const handleRetryAll = () => {
    if (user?.id) {
      messagingService.retryMessagesSubscription(user.id);
    }
    loadInboxData(true);
    if (selectedConversationId) {
      loadConversationMessages(selectedConversationId, false);
    }
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Header Banner */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg sm:text-xl font-bold text-[#14243A]">
              {mode === 'student'
                ? isRtl
                  ? 'مراسلة المدرس'
                  : 'Message Teacher'
                : isRtl
                ? 'رسائل الطلاب'
                : 'Student Messages'}
            </h2>
            {totalUnread > 0 && (
              <span className="bg-[#356AE6] text-white text-[11px] font-bold px-2 py-0.5 rounded-md">
                {totalUnread} {isRtl ? 'غير مقروء' : 'unread'}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-2">
            <span>
              {mode === 'student'
                ? isRtl
                  ? 'تواصل مباشر وخاص مع معلميك المعتمدين وإرسال الملفات التعليمية.'
                  : 'Private direct messaging with your assigned academy teachers.'
                : isRtl
                ? 'صندوق الرسائل الخاص لمتابعة استفسارات الطلاب والرد عليها مع المرفقات.'
                : 'Private inbox for reviewing and replying to your students’ messages and files.'}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
              <Clock className="w-3 h-3 text-[#356AE6]" />
              <span>توقيت مكة المكرمة (Asia/Riyadh)</span>
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`text-[11px] font-medium px-2.5 py-1 rounded-lg border ${
              isOffline
                ? 'bg-rose-50 text-rose-700 border-rose-200'
                : realtimeStatus === 'SUBSCRIBED'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}
          >
            {isOffline
              ? isRtl
                ? 'غير متصل'
                : 'Offline'
              : realtimeStatus === 'SUBSCRIBED'
              ? isRtl
                ? 'تحديث فوري متصل'
                : 'Live Connected'
              : isRtl
              ? 'جارٍ المزامنة...'
              : 'Syncing...'}
          </span>

          {mode === 'teacher' && (
            <Button
              variant="primary"
              size="sm"
              icon={<Plus className="w-4 h-4" />}
              onClick={handleOpenNewStudentModal}
            >
              {isRtl ? 'محادثة جديدة' : 'New Message'}
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            icon={<RefreshCw className="w-3.5 h-3.5" />}
            onClick={handleRetryAll}
          >
            {isRtl ? 'تحديث' : 'Refresh'}
          </Button>
        </div>
      </div>

      {/* Offline or Realtime Error Alerts */}
      {isOffline && (
        <div
          role="alert"
          className="flex items-center gap-2.5 p-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-xs font-medium"
        >
          <WifiOff className="w-4 h-4 shrink-0 text-amber-700" />
          <span>
            {isRtl
              ? 'الاتصال بالإنترنت مقطوع حالياً. ستعود الرسائل الفورية للعمل تلقائياً فور عودة الاتصال.'
              : 'You are currently offline. Messaging and file uploads require an active connection.'}
          </span>
        </div>
      )}

      {Boolean(realtimeError) && (
        <ErrorState
          variant="banner"
          error={realtimeError}
          isRtl={isRtl}
          onRetry={handleRetryAll}
          onDismiss={() => setRealtimeError(null)}
        />
      )}

      {Boolean(actionError) && (
        <ErrorState
          variant="banner"
          error={actionError}
          isRtl={isRtl}
          onDismiss={() => setActionError(null)}
        />
      )}

      {/* Main Split Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-[580px]">
        {/* Left / Start Column: Conversations & Authorized Contacts */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col overflow-hidden max-h-[700px]">
          <div className="p-3.5 border-b border-slate-100 bg-slate-50/70 space-y-2.5">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  mode === 'student'
                    ? isRtl
                      ? 'ابحث عن معلم أو رسالة...'
                      : 'Search teacher or message...'
                    : isRtl
                    ? 'ابحث باسم الطالب أو المجموعة...'
                    : 'Search student or group...'
                }
                className="w-full text-xs ps-9 pe-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#356AE6]"
              />
            </div>

            {/* Student: Quick Start with Authorized Teachers not yet in a thread */}
            {mode === 'student' && unstartedAuthorizedTeachers.length > 0 && (
              <div className="pt-1 space-y-1.5">
                <span className="text-[11px] font-bold text-slate-500 block">
                  {isRtl ? 'المعلمون المتاحون للمراسلة:' : 'Available Teachers:'}
                </span>
                <div className="flex flex-col gap-1.5">
                  {unstartedAuthorizedTeachers.map((teacher) => (
                    <button
                      key={teacher.teacherId}
                      type="button"
                      disabled={isStartingConversation}
                      onClick={() => handleStartTeacherConversation(teacher.teacherId)}
                      className="w-full flex items-center justify-between gap-2 p-2 rounded-xl border border-blue-100 bg-blue-50/60 hover:bg-blue-50 text-start transition-colors cursor-pointer"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[#14243A] truncate">
                          {isRtl ? teacher.fullNameArabic : teacher.fullName}
                        </p>
                        {(teacher.groupNameArabic || teacher.courseTitleArabic) && (
                          <p className="text-[10px] text-slate-500 truncate">
                            {isRtl
                              ? teacher.groupNameArabic || teacher.courseTitleArabic
                              : teacher.groupName || teacher.courseTitle}
                          </p>
                        )}
                      </div>
                      <span className="text-[11px] font-semibold text-[#356AE6] shrink-0">
                        {isRtl ? 'بدء محادثة' : 'Start Chat'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {isLoadingList ? (
              <div className="py-12 flex flex-col items-center justify-center">
                <LoadingSpinner size="md" />
                <span className="text-xs text-slate-400 mt-2">
                  {isRtl ? 'جارٍ تحميل المحادثات...' : 'Loading conversations...'}
                </span>
              </div>
            ) : listError ? (
              <div className="p-4">
                <ErrorState error={listError} isRtl={isRtl} onRetry={() => loadInboxData(true)} />
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="p-6 text-center space-y-2">
                <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <p className="text-xs font-bold text-[#14243A]">
                  {mode === 'student'
                    ? authorizedTeachers.length === 0
                      ? isRtl
                        ? 'لا يوجد معلمون مرتبطون بمجموعتك حالياً'
                        : 'No authorized teachers assigned yet'
                      : isRtl
                      ? 'لا توجد محادثات مفتوحة بعد'
                      : 'No active conversations yet'
                    : isRtl
                    ? 'لا توجد رسائل من الطلاب حالياً'
                    : 'No student conversations yet'}
                </p>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  {mode === 'student'
                    ? authorizedTeachers.length === 0
                      ? isRtl
                        ? 'عند تسجيلك في مجموعة أو مقرر دراسي سيظهر معلموك هنا للتواصل المباشر.'
                        : 'Once enrolled in a group or course, your authorized teachers will appear here.'
                      : isRtl
                      ? 'اختر اسم معلمك من الأعلى لبدء أول محادثة مباشرة.'
                      : 'Select your teacher above to start your first conversation.'
                    : isRtl
                    ? 'ستظهر هنا رسائل طلابك فور إرسالها أو يمكنك بدء محادثة جديدة من الأعلى.'
                    : 'Incoming student conversations appear here, or click New Message above.'}
                </p>
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const isSelected = conv.id === selectedConversationId;
                const displayName =
                  mode === 'student'
                    ? isRtl
                      ? conv.teacherNameArabic
                      : conv.teacherName
                    : isRtl
                    ? conv.studentNameArabic
                    : conv.studentName;
                const groupLabel = isRtl
                  ? conv.groupNameArabic || conv.groupName
                  : conv.groupName;

                return (
                  <button
                    key={conv.id}
                    type="button"
                    onClick={() => setSelectedConversationId(conv.id)}
                    className={`w-full p-3.5 text-start transition-colors flex items-start gap-3 cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50/70 border-s-4 border-[#356AE6]'
                        : 'hover:bg-slate-50/80'
                    }`}
                  >
                    <div className="w-9 h-9 rounded-xl bg-[#14243A] text-white flex items-center justify-center font-bold text-xs shrink-0">
                      {displayName.charAt(0) || 'W'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[#14243A] truncate">
                          {displayName}
                        </span>
                        {conv.lastMessageAt && (
                          <span className="text-[10px] text-slate-400 shrink-0">
                            {formatRiyadhDateTime(conv.lastMessageAt, {
                              locale: isRtl ? 'ar' : 'en',
                              includeDate: false,
                            })}
                          </span>
                        )}
                      </div>

                      {groupLabel && (
                        <span className="inline-block text-[10px] font-medium text-slate-500 mt-0.5 truncate max-w-full">
                          {groupLabel}
                        </span>
                      )}

                      <div className="flex items-center justify-between gap-2 mt-1">
                        <p className="text-[11px] text-slate-500 truncate">
                          {conv.lastMessagePreview ||
                            (isRtl ? 'محادثة جاهزة للكتابة...' : 'Ready to chat...')}
                        </p>
                        {conv.unreadCount > 0 && (
                          <span className="min-w-[18px] h-[18px] px-1 bg-[#356AE6] text-white text-[10px] font-bold rounded-full flex items-center justify-center shrink-0">
                            {conv.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right / Thread Column: Conversation Header, Message History & Composer */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col overflow-hidden max-h-[700px]">
          {!selectedConversation ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <EmptyState
                icon={<MessageSquare className="w-6 h-6 text-[#356AE6]" />}
                title={
                  isRtl ? 'اختر محادثة للبدء' : 'Select a Conversation'
                }
                description={
                  mode === 'student'
                    ? isRtl
                      ? 'اختر معلمك من القائمة الجانبية لعرض الرسائل السابقة أو إرسال استفسار أو ملف جديد.'
                      : 'Select your teacher from the list to view history or send a new message.'
                    : isRtl
                    ? 'اختر محادثة طالب من القائمة الجانبية لعرض الرسائل والمرفقات والرد عليها.'
                    : 'Choose a student conversation on the side to view messages, attachments, and reply.'
                }
              />
            </div>
          ) : (
            <>
              {/* Thread Header */}
              <div className="p-4 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-[#14243A] text-[#D8B96C] flex items-center justify-center font-bold text-sm shrink-0">
                    <GraduationCap className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-[#14243A] truncate">
                      {mode === 'student'
                        ? isRtl
                          ? selectedConversation.teacherNameArabic
                          : selectedConversation.teacherName
                        : isRtl
                        ? selectedConversation.studentNameArabic
                        : selectedConversation.studentName}
                    </h3>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                        <UserCheck className="w-3 h-3" />
                        {mode === 'student'
                          ? isRtl
                            ? 'المعلم المعتمد'
                            : 'Authorized Teacher'
                          : isRtl
                          ? 'طالب مقيد'
                          : 'Enrolled Student'}
                      </span>
                      {(selectedConversation.groupNameArabic || selectedConversation.groupName) && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-200/70 text-slate-700 text-[10px] font-semibold">
                          {isRtl
                            ? selectedConversation.groupNameArabic || selectedConversation.groupName
                            : selectedConversation.groupName}
                        </span>
                      )}
                      {(selectedConversation.courseTitleArabic || selectedConversation.courseTitle) && (
                        <span className="text-[10px] text-slate-500 truncate">
                          {isRtl
                            ? selectedConversation.courseTitleArabic ||
                              selectedConversation.courseTitle
                            : selectedConversation.courseTitle}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Messages Feed */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 bg-[#F8FAFC]">
                {isLoadingMessages ? (
                  <div className="py-16 flex flex-col items-center justify-center">
                    <LoadingSpinner size="md" />
                    <span className="text-xs text-slate-400 mt-2">
                      {isRtl ? 'جارٍ تحميل الرسائل...' : 'Loading messages...'}
                    </span>
                  </div>
                ) : messagesError ? (
                  <ErrorState
                    error={messagesError}
                    isRtl={isRtl}
                    onRetry={() => loadConversationMessages(selectedConversation.id, true)}
                  />
                ) : messages.length === 0 ? (
                  <div className="py-12 text-center space-y-2">
                    <p className="text-xs font-bold text-[#14243A]">
                      {isRtl ? 'ابدأ المحادثة الآن' : 'Start the Conversation'}
                    </p>
                    <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                      {isRtl
                        ? 'هذه محادثة خاصة ومؤمنة. يمكنك إرسال رسائل نصية أو إرفاق ملفات دراسية وسيصل إشعار فوري للطرف الآخر.'
                        : 'This is a private, secure thread. Send text messages or study files and the recipient will be notified immediately.'}
                    </p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isOwn = msg.senderId === user?.id;
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}
                      >
                        <div
                          className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 shadow-2xs space-y-2 ${
                            isOwn
                              ? 'bg-[#14243A] text-white rounded-ee-sm'
                              : 'bg-white text-[#14243A] border border-slate-200/90 rounded-es-sm'
                          }`}
                        >
                          {!isOwn && (msg.senderNameArabic || msg.senderName) && (
                            <div className="text-[10px] font-bold text-[#356AE6]">
                              {isRtl
                                ? msg.senderNameArabic || msg.senderName
                                : msg.senderName}
                            </div>
                          )}

                          {msg.body && (
                            <p className="text-xs sm:text-[13px] leading-relaxed whitespace-pre-wrap break-words">
                              {msg.body}
                            </p>
                          )}

                          {msg.attachments.length > 0 && (
                            <div className="space-y-1.5 pt-1">
                              {msg.attachments.map((att) => {
                                const isLoadingFile = loadingAttachmentId === att.id;
                                const isImg = isImageAttachment(att.mimeType, att.fileExtension);
                                return (
                                  <div
                                    key={att.id}
                                    className={`flex items-center justify-between gap-2.5 p-2 rounded-xl border text-xs ${
                                      isOwn
                                        ? 'bg-white/10 border-white/15 text-white'
                                        : 'bg-slate-50 border-slate-200 text-slate-800'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center shrink-0">
                                        {renderAttachmentIcon(att.mimeType, att.fileExtension)}
                                      </div>
                                      <div className="min-w-0">
                                        <p className="text-[11px] font-semibold truncate">
                                          {att.fileName}
                                        </p>
                                        <p
                                          className={`text-[10px] ${
                                            isOwn ? 'text-slate-300' : 'text-slate-500'
                                          }`}
                                        >
                                          {formatFileSize(att.fileSizeBytes)} •{' '}
                                          {att.fileExtension.toUpperCase()}
                                        </p>
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      disabled={isLoadingFile}
                                      onClick={() => handleOpenAttachment(att)}
                                      className={`px-2 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 shrink-0 transition-colors cursor-pointer ${
                                        isOwn
                                          ? 'bg-white/15 hover:bg-white/25 text-white'
                                          : 'bg-white hover:bg-slate-100 text-[#356AE6] border border-slate-200'
                                      }`}
                                    >
                                      {isImg ? (
                                        <Eye className="w-3.5 h-3.5" />
                                      ) : (
                                        <Download className="w-3.5 h-3.5" />
                                      )}
                                      <span>
                                        {isLoadingFile
                                          ? '...'
                                          : isImg
                                          ? isRtl
                                            ? 'معاينة'
                                            : 'Preview'
                                          : isRtl
                                          ? 'تحميل'
                                          : 'Download'}
                                      </span>
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          <div
                            className={`flex items-center justify-end gap-1.5 text-[10px] ${
                              isOwn ? 'text-slate-300' : 'text-slate-400'
                            }`}
                          >
                            <span>
                              {formatRiyadhDateTime(msg.createdAt, {
                                locale: isRtl ? 'ar' : 'en',
                              })}
                            </span>
                            {isOwn && (
                              <span
                                title={
                                  msg.isRead
                                    ? isRtl
                                      ? 'تمت القراءة'
                                      : 'Read'
                                    : isRtl
                                    ? 'تم الإرسال'
                                    : 'Sent'
                                }
                              >
                                {msg.isRead ? (
                                  <CheckCheck className="w-3.5 h-3.5 text-[#D8B96C]" />
                                ) : (
                                  <Check className="w-3.5 h-3.5 text-slate-300" />
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Composer Area */}
              <form
                onSubmit={handleSendMessage}
                className="p-3.5 sm:p-4 border-t border-slate-200 bg-white space-y-2.5"
              >
                {validationMessage && (
                  <div
                    role="alert"
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium"
                  >
                    <span>{validationMessage}</span>
                    <button
                      type="button"
                      onClick={() => setValidationMessage(null)}
                      className="p-0.5 text-rose-500 hover:text-rose-800 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Pending Attachments Preview Strip */}
                {pendingAttachments.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {pendingAttachments.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs max-w-[240px]"
                      >
                        {item.previewUrl ? (
                          <img
                            src={item.previewUrl}
                            alt={item.file.name}
                            className="w-7 h-7 rounded-md object-cover shrink-0 border border-slate-200"
                          />
                        ) : (
                          <div className="w-7 h-7 rounded-md bg-white border border-slate-200 flex items-center justify-center shrink-0">
                            {renderAttachmentIcon(item.mimeType, item.extension)}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold text-slate-800 truncate">
                            {item.file.name}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {formatFileSize(item.file.size)}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={isSending}
                          onClick={() => handleRemovePendingAttachment(item.id)}
                          aria-label={isRtl ? 'إزالة المرفق' : 'Remove attachment'}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded-md cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Sending Progress Bar */}
                {isSending && sendProgress && (
                  <div className="text-[11px] text-[#356AE6] font-medium flex items-center justify-between">
                    <span>
                      {sendProgress.stage === 'uploading'
                        ? isRtl
                          ? `جارٍ رفع المرفقات (${sendProgress.uploaded + 1}/${sendProgress.total})...`
                          : `Uploading attachments (${sendProgress.uploaded + 1}/${sendProgress.total})...`
                        : isRtl
                        ? 'جارٍ إرسال الرسالة...'
                        : 'Sending message...'}
                    </span>
                  </div>
                )}

                <div className="flex items-end gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={ACCEPTED_FILE_INPUT}
                    onChange={handleFilePick}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={isSending || pendingAttachments.length >= MAX_ATTACHMENTS_PER_MESSAGE}
                    onClick={() => fileInputRef.current?.click()}
                    title={isRtl ? 'إرفاق ملف أو صورة' : 'Attach file or image'}
                    aria-label={isRtl ? 'إرفاق ملف' : 'Attach file'}
                    className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-[#14243A] transition-colors disabled:opacity-50 cursor-pointer shrink-0"
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>

                  <textarea
                    rows={2}
                    maxLength={MAX_MESSAGE_BODY_LENGTH}
                    value={draftBody}
                    onChange={(e) => setDraftBody(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder={
                      isRtl
                        ? 'اكتب رسالتك هنا... (Enter للإرسال، Shift+Enter لسطر جديد)'
                        : 'Write your message... (Enter to send, Shift+Enter for new line)'
                    }
                    className="flex-1 text-xs sm:text-sm px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#356AE6] resize-none"
                  />

                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    isLoading={isSending}
                    disabled={isSending || isOffline}
                    icon={<Send className="w-4 h-4" />}
                    className="shrink-0"
                  >
                    {isRtl ? 'إرسال' : 'Send'}
                  </Button>
                </div>
                <p className="text-[10px] text-slate-400">
                  {isRtl
                    ? 'الملفات المسموحة: PDF، Word، Excel، PowerPoint، الصور، الصوتيات، TXT، ZIP (الحد الأقصى 10 ميجابايت لكل ملف).'
                    : 'Allowed files: PDF, Word, Excel, PowerPoint, images, audio, TXT, ZIP (max 10 MB per file).'}
                </p>
              </form>
            </>
          )}
        </div>
      </div>

      {/* Teacher Modal: Start New Conversation with Student */}
      <Modal
        isOpen={isNewStudentModalOpen}
        onClose={() => {
          setIsNewStudentModalOpen(false);
          setModalError(null);
        }}
        title={isRtl ? 'بدء محادثة مع طالب' : 'Start Conversation with Student'}
        subtitle={
          isRtl
            ? 'اختر طالباً من الطلاب النشطين المقيدين لبدء المراسلة المباشرة.'
            : 'Select an active enrolled student to start a private conversation.'
        }
        maxWidth="md"
      >
        <div className="space-y-3">
          {Boolean(modalError) && (
            <ErrorState
              variant="banner"
              error={modalError}
              isRtl={isRtl}
              onDismiss={() => setModalError(null)}
            />
          )}

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={studentPickerQuery}
              onChange={(e) => setStudentPickerQuery(e.target.value)}
              placeholder={
                isRtl
                  ? 'ابحث بالاسم أو اسم المستخدم أو الرقم الأكاديمي...'
                  : 'Search by name, username, or student ID...'
              }
              className="w-full text-xs ps-9 pe-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#356AE6]"
            />
          </div>

          {isLoadingStudents ? (
            <div className="py-10 flex justify-center">
              <LoadingSpinner size="md" />
            </div>
          ) : filteredTeacherStudents.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-6">
              {isRtl ? 'لا يوجد طلاب مطابقون للبحث.' : 'No matching active students found.'}
            </p>
          ) : (
            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-xl">
              {filteredTeacherStudents.map((student) => (
                <button
                  key={student.id}
                  type="button"
                  disabled={isStartingConversation}
                  onClick={() => handleStartStudentConversation(student.id)}
                  className="w-full p-3 hover:bg-slate-50 flex items-center justify-between gap-2 text-start transition-colors cursor-pointer"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#14243A] truncate">
                      {isRtl ? student.fullNameArabic : student.fullName}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {student.groups[0]
                        ? isRtl
                          ? student.groups[0].nameArabic
                          : student.groups[0].name
                        : student.academicProfile?.username}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-[#356AE6] shrink-0">
                    {isRtl ? 'مراسلة' : 'Message'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Secure Image Preview Modal */}
      <Modal
        isOpen={Boolean(previewAttachment)}
        onClose={() => setPreviewAttachment(null)}
        title={previewAttachment?.attachment.fileName || ''}
        subtitle={
          previewAttachment
            ? formatFileSize(previewAttachment.attachment.fileSizeBytes)
            : undefined
        }
        maxWidth="xl"
      >
        {previewAttachment && (
          <div className="space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 flex items-center justify-center max-h-[60vh] overflow-hidden">
              <img
                src={previewAttachment.signedUrl}
                alt={previewAttachment.attachment.fileName}
                className="max-h-[56vh] w-auto object-contain rounded-lg"
              />
            </div>
            <div className="flex justify-end">
              <a
                href={previewAttachment.signedUrl}
                download={previewAttachment.attachment.fileName}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#356AE6] text-white text-xs font-semibold hover:bg-[#2756C5] transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>{isRtl ? 'تحميل الصورة' : 'Download Image'}</span>
              </a>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
