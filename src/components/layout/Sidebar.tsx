/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useLocale } from '../../hooks/useLocale';
import { useAuth } from '../../features/auth/AuthContext';
import { TeacherView, StudentView } from '../../types/navigation';
import {
  LayoutDashboard,
  Users,
  FolderGit2,
  BookOpen,
  FileText,
  Video,
  Radio,
  UserCheck,
  HelpCircle,
  FileQuestion,
  ClipboardList,
  CheckSquare,
  Award,
  BarChart3,
  Bell,
  Settings,
  Home,
  PlayCircle,
  User,
  LogOut,
  X,
} from 'lucide-react';
import { BrandLogo } from '../shared/BrandLogo';

interface SidebarProps {
  currentView: string;
  onSelectView: (view: any) => void;
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onSelectView,
  isOpen,
  onClose,
}) => {
  const { t, isRtl } = useLocale();
  const { role, user, logout } = useAuth();

  const teacherNavItems = [
    { id: 'dashboard' as TeacherView, label: t.navigation.dashboard, icon: LayoutDashboard },
    { id: 'students' as TeacherView, label: t.navigation.students, icon: Users },
    { id: 'groups' as TeacherView, label: t.navigation.groups, icon: FolderGit2 },
    { id: 'courses' as TeacherView, label: t.navigation.courses, icon: BookOpen },
    { id: 'lessons' as TeacherView, label: t.navigation.lessons, icon: FileText },
    { id: 'video' as TeacherView, label: t.navigation.videoLibrary, icon: Video },
    { id: 'live-sessions' as TeacherView, label: t.navigation.liveClasses, icon: Radio },
    { id: 'attendance' as TeacherView, label: t.navigation.attendance, icon: UserCheck },
    { id: 'question-bank' as TeacherView, label: t.navigation.questionBank, icon: HelpCircle },
    { id: 'quizzes' as TeacherView, label: t.navigation.quizzesExams, icon: FileQuestion },
    { id: 'assignments' as TeacherView, label: t.navigation.assignments, icon: ClipboardList },
    { id: 'submissions' as TeacherView, label: t.navigation.submissionsGrading, icon: CheckSquare },
    { id: 'results' as TeacherView, label: t.navigation.results, icon: Award },
    { id: 'analytics' as TeacherView, label: t.navigation.analytics, icon: BarChart3 },
    { id: 'notifications' as TeacherView, label: t.navigation.notifications, icon: Bell },
    { id: 'settings' as TeacherView, label: t.navigation.settings, icon: Settings },
  ];

  const studentNavItems = [
    { id: 'home' as StudentView, label: t.navigation.home, icon: Home },
    { id: 'courses' as StudentView, label: t.navigation.myCourses, icon: BookOpen },
    { id: 'lessons' as StudentView, label: t.navigation.lessons, icon: PlayCircle },
    { id: 'video' as StudentView, label: t.navigation.videoLibrary, icon: Video },
    { id: 'live-sessions' as StudentView, label: t.navigation.liveClasses, icon: Radio },
    { id: 'assignments' as StudentView, label: t.navigation.assignments, icon: ClipboardList },
    { id: 'quizzes' as StudentView, label: t.navigation.quizzesExams, icon: FileQuestion },
    { id: 'results' as StudentView, label: t.navigation.results, icon: Award },
    { id: 'notifications' as StudentView, label: t.navigation.notifications, icon: Bell },
    { id: 'profile' as StudentView, label: t.navigation.myProfile, icon: User },
  ];

  const navItems = (role === 'teacher' || role === 'super_admin')
    ? teacherNavItems
    : role === 'student'
    ? studentNavItems
    : [];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Panel */}
      <aside
        className={`fixed top-0 bottom-0 z-50 w-64 bg-[#14243A] text-slate-300 flex flex-col transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isRtl
            ? `right-0 border-l border-slate-800 ${isOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}`
            : `left-0 border-r border-slate-800 ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`
        }`}
      >
        {/* Brand Header */}
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
          <BrandLogo size="sm" inverted />
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 lg:hidden"
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Academic Role Indicator */}
        <div className="px-4 py-2.5 bg-slate-900/60 border-b border-slate-800/50 flex items-center justify-between text-xs">
          <span className="text-slate-400 font-medium">
            {role === 'super_admin'
              ? (isRtl ? 'بوابة الإدارة العليا' : 'Super Admin Portal')
              : role === 'student'
              ? (isRtl ? 'بوابة الطالب' : 'Student Portal')
              : (isRtl ? 'بوابة المعلم والإدارة' : 'Teacher Portal')}
          </span>
          <span className="text-[#D8B96C] text-[11px] font-semibold">
            {role === 'super_admin' ? 'SUPER-ADMIN' : role === 'student' ? 'WESSAM-STD' : 'ACADEMY-ADMIN'}
          </span>
        </div>

        {/* Navigation Items List */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onSelectView(item.id);
                  onClose();
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-start cursor-pointer ${
                  isActive
                    ? 'bg-[#356AE6] text-white shadow-xs font-semibold'
                    : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* User Footnote & Sign Out */}
        <div className="p-3 border-t border-slate-800/80 bg-[#0F1B2C]">
          <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800">
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="w-7 h-7 rounded-full bg-[#356AE6]/20 border border-[#356AE6]/40 flex items-center justify-center text-[#D8B96C] text-xs font-bold shrink-0">
                {user?.fullName?.charAt(0) || 'W'}
              </div>
              <div className="flex flex-col truncate">
                <span className="text-xs font-medium text-white truncate">
                  {isRtl ? (user?.fullNameArabic || user?.fullName) : user?.fullName}
                </span>
                <span className="text-[10px] text-slate-400 truncate">
                  {user?.email || user?.role}
                </span>
              </div>
            </div>
            <button
              onClick={() => logout()}
              title={t.common.logout}
              className="p-1.5 rounded-md text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors shrink-0"
              aria-label={t.common.logout}
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
