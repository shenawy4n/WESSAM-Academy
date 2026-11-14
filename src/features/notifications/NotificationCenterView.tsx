/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bell,
  CheckCheck,
  Check,
  Search,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  BookOpen,
  FileText,
  Video,
  FileQuestion,
  Award,
  MessageSquare,
  ShieldAlert,
} from 'lucide-react';
import { useLocale } from '../../hooks/useLocale';
import { useAuth } from '../auth/AuthContext';
import { notificationService } from './notificationService';
import { AppNotification, NotificationCategory, NotificationFilter } from './types';
import {
  resolveCategoryLabel,
  resolveCategoryBadge,
  resolvePriorityLabel,
  resolvePriorityBadge,
  filterNotifications,
  formatNotificationTime,
} from './notificationUtils';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';

interface NotificationCenterViewProps {
  onNavigateToResource?: (url: string) => void;
}

export const NotificationCenterView: React.FC<NotificationCenterViewProps> = ({
  onNavigateToResource,
}) => {
  const { isRtl } = useLocale();
  const { user } = useAuth();

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [realtimeError, setRealtimeError] = useState<unknown>(null);
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [category, setCategory] = useState<NotificationCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const activeSessionRef = useRef<{ userId?: string; generation: number }>({
    userId: user?.id,
    generation: 0,
  });

  const loadData = useCallback(async (showLoading = true) => {
    const currentUserId = user?.id;
    const generation = activeSessionRef.current.generation;
    if (!currentUserId) {
      setNotifications([]);
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    if (showLoading) setIsLoading(true);
    else setIsRefreshing(true);
    setLoadError(null);

    try {
      const res = await notificationService.fetchNotifications({ limit: 100 });
      if (
        activeSessionRef.current.userId !== currentUserId ||
        activeSessionRef.current.generation !== generation
      ) {
        return;
      }
      setNotifications(res.notifications);
    } catch (err) {
      if (
        activeSessionRef.current.userId !== currentUserId ||
        activeSessionRef.current.generation !== generation
      ) {
        return;
      }
      setLoadError(err);
    } finally {
      if (
        activeSessionRef.current.userId === currentUserId &&
        activeSessionRef.current.generation === generation
      ) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [user?.id]);

  useEffect(() => {
    const nextGeneration = activeSessionRef.current.generation + 1;
    activeSessionRef.current = {
      userId: user?.id,
      generation: nextGeneration,
    };
    let isActive = true;

    loadData();

    if (!user?.id) {
      return () => {
        isActive = false;
      };
    }

    const unsubscribe = notificationService.subscribeToNotifications(
      user.id,
      () => {
        if (isActive) {
          loadData(false);
        }
      },
      (err) => {
        if (isActive) {
          setRealtimeError(err);
        }
      },
      (status) => {
        if (isActive && status === 'SUBSCRIBED') {
          setRealtimeError(null);
        }
      }
    );

    return () => {
      isActive = false;
      activeSessionRef.current.generation += 1;
      unsubscribe();
    };
  }, [user?.id, loadData]);

  const handleMarkAsRead = async (id: string, e?: React.MouseEvent): Promise<boolean> => {
    if (e) e.stopPropagation();
    setActionError(null);
    try {
      await notificationService.markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n))
      );
      return true;
    } catch (err) {
      setActionError(err);
      return false;
    }
  };

  const handleMarkAllAsRead = async () => {
    setActionError(null);
    try {
      await notificationService.markAllAsRead();
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, isRead: true, readAt: new Date().toISOString() }))
      );
    } catch (err) {
      setActionError(err);
    }
  };

  const handleActionClick = async (notif: AppNotification) => {
    if (!notif.isRead) {
      const marked = await handleMarkAsRead(notif.id);
      if (!marked) return;
    }
    if (notif.actionUrl && onNavigateToResource) {
      onNavigateToResource(notif.actionUrl);
    }
  };

  const filteredList = filterNotifications(notifications, filter, category, searchQuery);
  const totalCount = notifications.length;
  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const highPriorityCount = notifications.filter(
    (n) => (n.priority === 'urgent' || n.priority === 'important') && !n.isRead
  ).length;

  const getCategoryIcon = (cat: NotificationCategory) => {
    switch (cat) {
      case 'live_session':
        return <Video className="w-4 h-4 text-emerald-600" />;
      case 'quiz_published':
        return <FileQuestion className="w-4 h-4 text-amber-600" />;
      case 'quiz_result':
        return <Award className="w-4 h-4 text-amber-600" />;
      case 'new_lesson':
        return <BookOpen className="w-4 h-4 text-blue-600" />;
      case 'new_material':
        return <FileText className="w-4 h-4 text-blue-600" />;
      case 'account_alert':
        return <ShieldAlert className="w-4 h-4 text-rose-600" />;
      case 'teacher_message':
        return <MessageSquare className="w-4 h-4 text-purple-600" />;
      case 'student_message':
        return <MessageSquare className="w-4 h-4 text-indigo-600" />;
      case 'general':
      default:
        return <Bell className="w-4 h-4 text-slate-600" />;
    }
  };

  const categoriesList: { id: NotificationCategory | 'all'; labelEn: string; labelAr: string }[] = [
    { id: 'all', labelEn: 'All Categories', labelAr: 'جميع التصنيفات' },
    { id: 'general', labelEn: 'Announcements', labelAr: 'الإعلانات' },
    { id: 'live_session', labelEn: 'Live Classes', labelAr: 'الحصص المباشرة' },
    { id: 'quiz_published', labelEn: 'Assessments', labelAr: 'الاختبارات' },
    { id: 'quiz_result', labelEn: 'Results', labelAr: 'النتائج' },
    { id: 'new_lesson', labelEn: 'Lessons', labelAr: 'الدروس' },
    { id: 'new_material', labelEn: 'Materials', labelAr: 'المواد الدراسية' },
    { id: 'teacher_message', labelEn: 'Teacher Messages', labelAr: 'رسائل المعلم' },
    { id: 'student_message', labelEn: 'Student Messages', labelAr: 'رسائل الطلاب' },
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs">
        <div>
          <h2 className="text-xl font-bold text-[#14243A]">
            {isRtl ? 'مركز الإشعارات والتنبيهات' : 'Notification Center'}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {isRtl
              ? 'متابعة تنبيهات الحصص المباشرة، الاختبارات، نتائج التقييمات، وإعلانات الأكاديمية.'
              : 'Real-time updates on live classes, assignments, examinations, and official academy broadcasts.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              icon={<CheckCheck className="w-4 h-4 text-[#356AE6]" />}
              onClick={handleMarkAllAsRead}
            >
              {isRtl ? 'تحديد الكل كمقروء' : 'Mark all read'}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            icon={<RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />}
            onClick={() => loadData(false)}
          >
            {isRtl ? 'تحديث' : 'Refresh'}
          </Button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 font-medium">
              {isRtl ? 'إجمالي التنبيهات' : 'Total Notifications'}
            </span>
            <div className="text-2xl font-bold text-[#14243A] mt-1">{totalCount}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
            <Bell className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-blue-100 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs text-blue-600 font-medium">
              {isRtl ? 'غير مقروءة' : 'Unread'}
            </span>
            <div className="text-2xl font-bold text-[#356AE6] mt-1">{unreadCount}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-[#356AE6]">
            <Check className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-amber-100 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs text-amber-600 font-medium">
              {isRtl ? 'تنبيهات هامة أو عاجلة' : 'Important / Urgent'}
            </span>
            <div className="text-2xl font-bold text-amber-700 mt-1">{highPriorityCount}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs space-y-4">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* Status Tabs */}
          <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-medium">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                filter === 'all'
                  ? 'bg-white text-[#14243A] shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {isRtl ? 'الكل' : 'All'} ({totalCount})
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                filter === 'unread'
                  ? 'bg-white text-[#356AE6] shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {isRtl ? 'غير المقروءة' : 'Unread'} ({unreadCount})
            </button>
            <button
              onClick={() => setFilter('read')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                filter === 'read'
                  ? 'bg-white text-[#14243A] shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {isRtl ? 'المقروءة' : 'Read'} ({totalCount - unreadCount})
            </button>
          </div>

          {/* Search bar */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isRtl ? 'بحث في نص الإشعار أو العنوان...' : 'Search notifications...'}
              className="w-full text-xs ps-9 pe-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#356AE6]"
            />
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
          {categoriesList.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              className={`px-2.5 py-1 rounded-lg shrink-0 transition-colors border cursor-pointer ${
                category === cat.id
                  ? 'bg-[#14243A] text-white border-[#14243A] font-semibold'
                  : 'bg-slate-50 text-slate-600 border-slate-200/80 hover:bg-slate-100'
              }`}
            >
              {isRtl ? cat.labelAr : cat.labelEn}
            </button>
          ))}
        </div>
      </div>

      {/* Notifications List */}
      <div className="space-y-3">
        {Boolean(realtimeError) && (
          <ErrorState
            variant="banner"
            error={realtimeError}
            isRtl={isRtl}
            onRetry={() => {
              setRealtimeError(null);
              if (user?.id) {
                notificationService.retryNotificationsSubscription(user.id);
              }
              loadData(false);
            }}
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
        {isLoading ? (
          <div className="py-16 flex flex-col items-center justify-center">
            <LoadingSpinner size="lg" />
            <span className="text-xs text-slate-400 mt-3">
              {isRtl ? 'جارِ تحميل الإشعارات...' : 'Loading notifications...'}
            </span>
          </div>
        ) : loadError ? (
          <ErrorState
            error={loadError}
            isRtl={isRtl}
            onRetry={() => loadData(true)}
          />
        ) : filteredList.length === 0 ? (
          <EmptyState
            icon={<Bell className="w-6 h-6 text-[#356AE6]" />}
            title={isRtl ? 'لا توجد إشعارات مطابقة' : 'No notifications found'}
            description={
              searchQuery || category !== 'all' || filter !== 'all'
                ? isRtl
                  ? 'لم يتم العثور على نتائج تطابق معايير التصفية الحالية.'
                  : 'No results match your active search and category filters.'
                : isRtl
                ? 'ستظهر هنا التنبيهات الخاصة بالدروس والاختبارات والحصص المباشرة.'
                : 'Updates regarding live sessions, quizzes, and broadcasts will appear here.'
            }
            actionLabel={
              searchQuery || category !== 'all' || filter !== 'all'
                ? isRtl
                  ? 'إعادة ضبط الفلاتر'
                  : 'Reset filters'
                : undefined
            }
            onAction={() => {
              setFilter('all');
              setCategory('all');
              setSearchQuery('');
            }}
          />
        ) : (
          filteredList.map((notif) => {
            const badge = resolveCategoryBadge(notif.category);
            const priorityBadge = resolvePriorityBadge(notif.priority);
            const title = isRtl ? notif.titleArabic || notif.title : notif.title;
            const body = isRtl ? notif.bodyArabic || notif.body : notif.body;

            return (
              <div
                key={notif.id}
                onClick={() => handleActionClick(notif)}
                className={`p-4 sm:p-5 rounded-2xl border transition-all cursor-pointer flex flex-col sm:flex-row sm:items-start justify-between gap-4 ${
                  !notif.isRead
                    ? 'bg-white border-blue-200 shadow-sm ring-1 ring-blue-50'
                    : 'bg-white border-slate-200/80 shadow-2xs hover:border-slate-300'
                }`}
              >
                <div className="flex items-start gap-3.5 flex-1 min-w-0">
                  {/* Category icon circle */}
                  <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 mt-0.5">
                    {getCategoryIcon(notif.category)}
                  </div>

                  <div className="flex-1 min-w-0 space-y-1.5">
                    {/* Tags row */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${badge.bg} ${badge.text} ${badge.border}`}
                      >
                        {resolveCategoryLabel(notif.category, isRtl)}
                      </span>

                      {notif.priority !== 'normal' && (
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${priorityBadge.bg} ${priorityBadge.text} ${priorityBadge.border}`}
                        >
                          {resolvePriorityLabel(notif.priority, isRtl)}
                        </span>
                      )}

                      {!notif.isRead && (
                        <span className="w-2 h-2 rounded-full bg-[#356AE6] shrink-0" />
                      )}

                      <span className="text-[11px] text-slate-400 ms-auto">
                        {formatNotificationTime(notif.createdAt, isRtl)}
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="text-sm font-bold text-[#14243A] leading-snug">
                      {title}
                    </h3>

                    {/* Description */}
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {body}
                    </p>
                  </div>
                </div>

                {/* Actions column */}
                <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                  {notif.actionUrl && (
                    <Button
                      variant="outline"
                      size="sm"
                      icon={<ExternalLink className="w-3.5 h-3.5" />}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleActionClick(notif);
                      }}
                    >
                      {isRtl ? 'عرض المصدر' : 'Open Resource'}
                    </Button>
                  )}

                  {!notif.isRead ? (
                    <button
                      onClick={(e) => handleMarkAsRead(notif.id, e)}
                      className="text-xs text-slate-500 hover:text-[#356AE6] font-medium flex items-center gap-1 p-1 rounded hover:bg-slate-50 transition-colors"
                      title={isRtl ? 'تحديد كمقروء' : 'Mark as read'}
                    >
                      <Check className="w-3.5 h-3.5 text-slate-400" />
                      <span>{isRtl ? 'تحديد كمقروء' : 'Mark read'}</span>
                    </button>
                  ) : (
                    <span className="text-[11px] text-slate-400 flex items-center gap-1">
                      <CheckCheck className="w-3 h-3 text-emerald-500" />
                      <span>{isRtl ? 'مقروء' : 'Read'}</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
