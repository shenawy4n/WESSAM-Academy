/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useLocale } from '../../hooks/useLocale';
import { useAuth, ENABLE_PREVIEW_ROLES } from '../../features/auth/AuthContext';
import { LanguageSwitcher } from '../shared/LanguageSwitcher';
import { Menu, Clock, ShieldCheck, UserCheck } from 'lucide-react';
import { NotificationBell } from '../../features/notifications/NotificationBell';

interface HeaderProps {
  onToggleSidebar: () => void;
  pageTitle: string;
  onOpenNotifications?: () => void;
  onNavigateToResource?: (url: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  onToggleSidebar,
  pageTitle,
  onOpenNotifications = () => {},
  onNavigateToResource,
}) => {
  const { t, isRtl } = useLocale();
  const { role, user, setActiveTestRole } = useAuth();

  return (
    <header className="sticky top-0 z-30 h-16 bg-white border-b border-slate-200/90 px-4 sm:px-6 flex items-center justify-between shadow-2xs">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="p-2 -ms-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 lg:hidden"
          aria-label="Toggle navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-base sm:text-lg font-bold text-[#14243A] leading-tight">
            {pageTitle}
          </h1>
          <p className="hidden sm:block text-[11px] text-slate-500">
            {t.common.brandName} · {t.common.teacherName}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2.5 sm:gap-4">
        {/* Riyadh Timezone Indicator */}
        <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-500 font-medium px-2.5 py-1 rounded-md bg-slate-50 border border-slate-200/60">
          <Clock className="w-3.5 h-3.5 text-[#356AE6]" />
          <span>{t.common.timezoneNotice}</span>
        </div>

        {/* Phase 1 Portal Switcher (strictly gated by DEV && VITE_ENABLE_PREVIEW_ROLES) */}
        {ENABLE_PREVIEW_ROLES && setActiveTestRole && (
          <div className="hidden sm:flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-medium">
            <button
              onClick={() => setActiveTestRole('teacher')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                role === 'teacher' || role === 'super_admin'
                  ? 'bg-white text-[#14243A] shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-[#356AE6]" />
              <span>{isRtl ? 'المعلم' : 'Teacher'}</span>
            </button>
            <button
              onClick={() => setActiveTestRole('student')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                role === 'student'
                  ? 'bg-white text-[#14243A] shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>{isRtl ? 'الطالب' : 'Student'}</span>
            </button>
          </div>
        )}

        {/* Notification Bell */}
        <NotificationBell
          onOpenCenter={onOpenNotifications}
          onNavigateToResource={onNavigateToResource}
        />

        {/* Language Switcher */}
        <LanguageSwitcher />

        {/* User Pill */}
        <div className="hidden sm:flex items-center gap-2 ps-2 border-s border-slate-200 text-xs">
          <div className="w-7 h-7 rounded-full bg-[#14243A] text-white flex items-center justify-center font-bold text-xs">
            {user?.fullName?.charAt(0) || 'W'}
          </div>
          <span className="font-semibold text-slate-800 max-w-[120px] truncate">
            {isRtl ? (user?.fullNameArabic || user?.fullName) : user?.fullName}
          </span>
        </div>
      </div>
    </header>
  );
};
