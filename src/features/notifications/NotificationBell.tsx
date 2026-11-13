/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Bell, CheckCheck, ExternalLink, ArrowRight, ArrowLeft } from 'lucide-react';
import { useLocale } from '../../hooks/useLocale';
import { useAuth } from '../auth/AuthContext';
import { notificationService } from './notificationService';
import { AppNotification } from './types';
import { resolveCategoryBadge, resolveCategoryLabel, formatNotificationTime } from './notificationUtils';
import { ErrorState } from '../../components/ui/ErrorState';

interface NotificationBellProps {
  onOpenCenter: () => void;
  onNavigateToResource?: (url: string) => void;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({
  onOpenCenter,
  onNavigateToResource,
}) => {
  const { isRtl } = useLocale();
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [recentNotifications, setRecentNotifications] = useState<AppNotification[]>([]);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const loadData = async () => {
    setLoadError(null);
    try {
      const [count, listRes] = await Promise.all([
        notificationService.getUnreadCount(),
        notificationService.fetchNotifications({ limit: 5 }),
      ]);
      setUnreadCount(count);
      setRecentNotifications(listRes.notifications);
    } catch (err) {
      setLoadError(err);
    }
  };

  useEffect(() => {
    loadData();

    // Subscribe to realtime changes if user exists
    if (user?.id) {
      const unsubscribe = notificationService.subscribeToNotifications(
        user.id,
        () => {
          loadData();
        },
        (err) => {
          setLoadError(err);
        }
      );
      return () => unsubscribe();
    }
  }, [user?.id]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleMarkAllRead = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsLoading(true);
    setActionError(null);
    try {
      await notificationService.markAllAsRead();
      await loadData();
    } catch (err) {
      setActionError(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleItemClick = async (notif: AppNotification) => {
    setActionError(null);
    if (!notif.isRead) {
      try {
        await notificationService.markAsRead(notif.id);
        setUnreadCount((prev) => Math.max(0, prev - 1));
        setRecentNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, isRead: true } : n))
        );
      } catch (err) {
        setActionError(err);
        return;
      }
    }
    setIsOpen(false);

    if (notif.actionUrl && onNavigateToResource) {
      onNavigateToResource(notif.actionUrl);
    } else {
      onOpenCenter();
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) loadData();
        }}
        className="relative p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
        aria-label={isRtl ? 'الإشعارات' : 'Notifications'}
      >
        <Bell className="w-5 h-5 text-slate-700" />
        {unreadCount > 0 && (
          <span className="absolute top-1 end-1 min-w-[18px] h-[18px] px-1 bg-red-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-white animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          dir={isRtl ? 'rtl' : 'ltr'}
          className={`absolute ${
            isRtl ? 'left-0 sm:left-auto sm:right-0' : 'right-0'
          } mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-slate-200/90 z-50 overflow-hidden transform transition-all`}
        >
          {/* Header */}
          <div className="p-3.5 px-4 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-[#14243A]">
                {isRtl ? 'الإشعارات والتنبيهات' : 'Notifications'}
              </span>
              {unreadCount > 0 && (
                <span className="bg-[#356AE6]/10 text-[#356AE6] text-xs font-semibold px-2 py-0.5 rounded-full">
                  {unreadCount} {isRtl ? 'جديد' : 'new'}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                disabled={isLoading}
                className="text-xs text-[#356AE6] hover:text-[#2756C5] font-medium flex items-center gap-1 cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>{isRtl ? 'تحديد الكل كمقروء' : 'Mark all read'}</span>
              </button>
            )}
          </div>

          {/* Action Error Banner */}
          {Boolean(actionError) && (
            <div className="p-2.5 border-b border-slate-100">
              <ErrorState variant="banner" error={actionError} isRtl={isRtl} onDismiss={() => setActionError(null)} />
            </div>
          )}

          {/* List */}
          <div className="max-h-[360px] overflow-y-auto divide-y divide-slate-100">
            {loadError ? (
              <div className="p-3">
                <ErrorState variant="banner" error={loadError} isRtl={isRtl} onRetry={loadData} />
              </div>
            ) : recentNotifications.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                {isRtl ? 'لا توجد إشعارات حالياً' : 'No notifications right now'}
              </div>
            ) : (
              recentNotifications.map((notif) => {
                const badge = resolveCategoryBadge(notif.category);
                const title = isRtl ? notif.titleArabic || notif.title : notif.title;
                const body = isRtl ? notif.bodyArabic || notif.body : notif.body;

                return (
                  <div
                    key={notif.id}
                    onClick={() => handleItemClick(notif)}
                    className={`p-3.5 hover:bg-slate-50/80 transition-colors cursor-pointer flex gap-3 items-start ${
                      !notif.isRead ? 'bg-blue-50/30' : ''
                    }`}
                  >
                    {/* Unread indicator */}
                    <div className="pt-1.5 shrink-0">
                      <span
                        className={`block w-2 h-2 rounded-full ${
                          !notif.isRead ? 'bg-[#356AE6]' : 'bg-transparent'
                        }`}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${badge.bg} ${badge.text} ${badge.border}`}
                        >
                          {resolveCategoryLabel(notif.category, isRtl)}
                        </span>
                        <span className="text-[10px] text-slate-400 shrink-0">
                          {formatNotificationTime(notif.createdAt, isRtl)}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-slate-800 line-clamp-1 leading-snug">
                        {title}
                      </p>
                      <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5 leading-relaxed">
                        {body}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="p-2.5 bg-slate-50/90 border-t border-slate-100 text-center">
            <button
              onClick={() => {
                setIsOpen(false);
                onOpenCenter();
              }}
              className="text-xs font-semibold text-[#14243A] hover:text-[#356AE6] w-full py-1 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>{isRtl ? 'فتح مركز الإشعارات الكامل' : 'Open Full Notification Center'}</span>
              {isRtl ? <ArrowLeft className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
