/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { LocaleProvider, useLocale } from './hooks/useLocale';
import { AuthProvider, useAuth } from './features/auth/AuthContext';
import { isSupabaseConfigured } from './lib/supabase/client';
import { ConfigErrorScreen } from './features/auth/ConfigErrorScreen';
import { LoginScreen } from './features/auth/LoginScreen';
import { UnauthorizedScreen } from './features/auth/UnauthorizedScreen';
import { AppLayout } from './components/layout/AppLayout';
import { TeacherDashboard } from './features/dashboard/TeacherDashboard';
import { StudentDashboard } from './features/dashboard/StudentDashboard';
import { StudentManagementView } from './features/students/StudentManagementView';
import { GroupManagementView } from './features/groups/GroupManagementView';
import { CoursesManagementView } from './features/courses/CoursesManagementView';
import { StudentCoursesView } from './features/courses/StudentCoursesView';
import { LiveSessionsManagementView } from './features/liveSessions/LiveSessionsManagementView';
import { AttendanceReportsView } from './features/liveSessions/AttendanceReportsView';
import { StudentLiveSessionsView } from './features/liveSessions/StudentLiveSessionsView';
import { QuizManagementView } from './features/quizzes/QuizManagementView';
import { StudentAssessmentsView } from './features/quizzes/StudentAssessmentsView';
import { AnnouncementManagementView } from './features/notifications/AnnouncementManagementView';
import { NotificationCenterView } from './features/notifications/NotificationCenterView';
import { TeacherVideoLibraryView } from './features/videoLibrary/TeacherVideoLibraryView';
import { StudentVideoLibraryView } from './features/videoLibrary/StudentVideoLibraryView';
import { QuestionBankView } from './features/questionBank/QuestionBankView';
import { TeacherAssignmentsView } from './features/assignments/TeacherAssignmentsView';
import { StudentAssignmentsView } from './features/assignments/StudentAssignmentsView';
import { MessagingWorkspace } from './features/messaging/MessagingWorkspace';
import { parseMessageActionUrl } from './features/messaging/messageValidation';
import { AcademicRecordsView } from './features/academicRecords/AcademicRecordsView';
import { StudentResultsView } from './features/academicRecords/StudentResultsView';
import { PerformanceAnalyticsView } from './features/analytics/PerformanceAnalyticsView';
import { SystemSettingsView } from './features/settings/SystemSettingsView';
import { StudentProfileView } from './features/auth/StudentProfileView';
import { LoadingSpinner } from './components/ui/LoadingSpinner';
import { TeacherView, StudentView } from './types/navigation';

function AppContent() {
  const { t, isRtl } = useLocale();
  const { user, role, isLoading } = useAuth();
  const isConfigured = isSupabaseConfigured();

  const [currentTeacherView, setCurrentTeacherView] = useState<TeacherView>('dashboard');
  const [currentStudentView, setCurrentStudentView] = useState<StudentView>('home');
  const [teacherNotificationTab, setTeacherNotificationTab] = useState<'announcements' | 'inbox'>('announcements');
  const [pendingConversationId, setPendingConversationId] = useState<string | null>(null);
  const [pendingRecordStudentId, setPendingRecordStudentId] = useState<string | null>(null);

  // Strict configuration gate: never bypass to a fake preview shell when backend is unconfigured
  if (!isConfigured) {
    return <ConfigErrorScreen />;
  }

  // Prevent flicker or momentary display of unauthenticated screens while session resolves
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F4F6FA] flex flex-col items-center justify-center p-6 text-center">
        <LoadingSpinner size="lg" label={t.common.loading} />
      </div>
    );
  }

  // If user is not authenticated yet
  if (!user) {
    return <LoginScreen />;
  }

  // Teacher & Super Admin Portal
  if (role === 'teacher' || role === 'super_admin') {
    const getPageTitle = (view: TeacherView): string => {
      switch (view) {
        case 'dashboard':
          return t.navigation.dashboard;
        case 'students':
          return t.navigation.students;
        case 'groups':
          return t.navigation.groups;
        case 'courses':
          return t.navigation.courses;
        case 'lessons':
          return t.navigation.lessons;
        case 'video':
          return t.navigation.videoLibrary;
        case 'live-sessions':
          return t.navigation.liveClasses;
        case 'attendance':
          return t.navigation.attendance;
        case 'question-bank':
          return t.navigation.questionBank;
        case 'quizzes':
          return t.navigation.quizzesExams;
        case 'assignments':
          return t.navigation.assignments;
        case 'submissions':
          return t.navigation.submissionsGrading;
        case 'results':
          return t.navigation.results;
        case 'analytics':
          return t.navigation.analytics;
        case 'messages':
          return t.navigation.studentMessages;
        case 'notifications':
          return t.navigation.notifications;
        case 'settings':
          return t.navigation.settings;
        default:
          return t.navigation.dashboard;
      }
    };

    const handleTeacherNavigateToResource = (url: string) => {
      const convId = parseMessageActionUrl(url);
      if (convId || url.startsWith('/messages')) {
        setPendingConversationId(convId);
        setCurrentTeacherView('messages');
        return;
      }
      if (url.includes('/courses')) setCurrentTeacherView('courses');
      else if (url.includes('/live-sessions')) setCurrentTeacherView('live-sessions');
      else if (url.includes('/assessments')) setCurrentTeacherView('quizzes');
      else if (url.includes('/assignments')) setCurrentTeacherView('assignments');
      else if (url.includes('/students')) setCurrentTeacherView('students');
    };

    const renderTeacherView = () => {
      switch (currentTeacherView) {
        case 'dashboard':
          return <TeacherDashboard onNavigate={(v) => setCurrentTeacherView(v as TeacherView)} />;

        case 'students':
          return (
            <StudentManagementView
              onOpenAcademicRecord={(studentId) => {
                setPendingRecordStudentId(studentId);
                setCurrentTeacherView('results');
              }}
            />
          );

        case 'groups':
          return <GroupManagementView />;

        case 'courses':
        case 'lessons':
          return <CoursesManagementView />;

        case 'video':
          return <TeacherVideoLibraryView />;

        case 'live-sessions':
          return <LiveSessionsManagementView />;

        case 'attendance':
          return <AttendanceReportsView />;

        case 'question-bank':
          return <QuestionBankView />;

        case 'quizzes':
          return <QuizManagementView />;

        case 'assignments':
          return <TeacherAssignmentsView initialTab="all" />;

        case 'submissions':
          return <TeacherAssignmentsView initialTab="grading" />;

        case 'results':
          return <AcademicRecordsView initialStudentId={pendingRecordStudentId} />;

        case 'analytics':
          return (
            <PerformanceAnalyticsView
              onInspectStudentRecord={(studentId) => {
                setPendingRecordStudentId(studentId);
                setCurrentTeacherView('results');
              }}
            />
          );

        case 'messages':
          return (
            <MessagingWorkspace
              mode="teacher"
              initialConversationId={pendingConversationId}
              onClearInitialConversation={() => setPendingConversationId(null)}
            />
          );

        case 'notifications':
          return (
            <div className="space-y-4" dir={isRtl ? 'rtl' : 'ltr'}>
              <div className="flex bg-slate-100 p-1 rounded-xl w-fit text-xs font-bold border border-slate-200">
                <button
                  onClick={() => setTeacherNotificationTab('announcements')}
                  className={`px-4 py-2 rounded-lg transition-colors cursor-pointer ${
                    teacherNotificationTab === 'announcements'
                      ? 'bg-white text-[#14243A] shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {isRtl ? 'لوحة إدارة الإعلانات' : 'Announcement Desk'}
                </button>
                <button
                  onClick={() => setTeacherNotificationTab('inbox')}
                  className={`px-4 py-2 rounded-lg transition-colors cursor-pointer ${
                    teacherNotificationTab === 'inbox'
                      ? 'bg-white text-[#356AE6] shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {isRtl ? 'الإشعارات الواردة' : 'Received Alerts'}
                </button>
              </div>

              {teacherNotificationTab === 'announcements' ? (
                <AnnouncementManagementView />
              ) : (
                <NotificationCenterView onNavigateToResource={handleTeacherNavigateToResource} />
              )}
            </div>
          );

        case 'settings':
          return role === 'super_admin' ? (
            <SystemSettingsView onUnauthorizedReturn={() => setCurrentTeacherView('dashboard')} />
          ) : (
            <UnauthorizedScreen onReturn={() => setCurrentTeacherView('dashboard')} />
          );

        default:
          return <TeacherDashboard onNavigate={(v) => setCurrentTeacherView(v as TeacherView)} />;
      }
    };

    return (
      <AppLayout
        currentView={currentTeacherView}
        onSelectView={(v) => setCurrentTeacherView(v as TeacherView)}
        pageTitle={getPageTitle(currentTeacherView)}
        onNavigateToResource={handleTeacherNavigateToResource}
      >
        {renderTeacherView()}
      </AppLayout>
    );
  }

  // Student Portal
  if (role === 'student') {
    const getPageTitle = (view: StudentView): string => {
      switch (view) {
        case 'home':
          return t.navigation.home;
        case 'courses':
          return t.navigation.myCourses;
        case 'lessons':
          return t.navigation.lessons;
        case 'video':
          return t.navigation.videoLibrary;
        case 'live-sessions':
          return t.navigation.liveClasses;
        case 'assignments':
          return t.navigation.assignments;
        case 'quizzes':
          return t.navigation.quizzesExams;
        case 'results':
          return t.navigation.results;
        case 'messages':
          return t.navigation.messageTeacher;
        case 'notifications':
          return t.navigation.notifications;
        case 'profile':
          return t.navigation.myProfile;
        default:
          return t.navigation.home;
      }
    };

    const handleStudentNavigateToResource = (url: string) => {
      const convId = parseMessageActionUrl(url);
      if (convId || url.startsWith('/messages')) {
        setPendingConversationId(convId);
        setCurrentStudentView('messages');
        return;
      }
      if (url.includes('/courses')) setCurrentStudentView('courses');
      else if (url.includes('/live-sessions')) setCurrentStudentView('live-sessions');
      else if (url.includes('/assessments')) setCurrentStudentView('quizzes');
      else if (url.includes('/assignments')) setCurrentStudentView('assignments');
    };

    const renderStudentView = () => {
      switch (currentStudentView) {
        case 'home':
          return <StudentDashboard onNavigate={(v) => setCurrentStudentView(v as StudentView)} />;

        case 'courses':
        case 'lessons':
          return <StudentCoursesView />;

        case 'video':
          return (
            <StudentVideoLibraryView
              onNavigateToLesson={() => setCurrentStudentView('lessons')}
            />
          );

        case 'live-sessions':
          return <StudentLiveSessionsView />;

        case 'assignments':
          return <StudentAssignmentsView />;

        case 'quizzes':
          return <StudentAssessmentsView />;

        case 'results':
          return <StudentResultsView />;

        case 'messages':
          return (
            <MessagingWorkspace
              mode="student"
              initialConversationId={pendingConversationId}
              onClearInitialConversation={() => setPendingConversationId(null)}
            />
          );

        case 'notifications':
          return <NotificationCenterView onNavigateToResource={handleStudentNavigateToResource} />;

        case 'profile':
          return <StudentProfileView />;

        default:
          return <StudentDashboard onNavigate={(v) => setCurrentStudentView(v as StudentView)} />;
      }
    };

    return (
      <AppLayout
        currentView={currentStudentView}
        onSelectView={(v) => setCurrentStudentView(v as StudentView)}
        pageTitle={getPageTitle(currentStudentView)}
        onNavigateToResource={handleStudentNavigateToResource}
      >
        {renderStudentView()}
      </AppLayout>
    );
  }

  // Fallback for unauthorized roles
  return <UnauthorizedScreen onReturn={() => window.location.reload()} />;
}

export default function App() {
  return (
    <LocaleProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </LocaleProvider>
  );
}
