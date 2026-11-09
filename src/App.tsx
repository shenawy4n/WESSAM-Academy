/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
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
import { FeaturePlaceholderView } from './components/shared/FeaturePlaceholderView';
import { LoadingSpinner } from './components/ui/LoadingSpinner';
import { TeacherView, StudentView } from './types/navigation';
import {
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
  User,
  PlayCircle,
  Home,
} from 'lucide-react';

function AppContent() {
  const { t, isRtl } = useLocale();
  const { user, role, isLoading } = useAuth();
  const isConfigured = isSupabaseConfigured();

  const [previewBypass, setPreviewBypass] = useState<boolean>(false);
  const [currentTeacherView, setCurrentTeacherView] = useState<TeacherView>('dashboard');
  const [currentStudentView, setCurrentStudentView] = useState<StudentView>('home');
  const [teacherNotificationTab, setTeacherNotificationTab] = useState<'announcements' | 'inbox'>('announcements');

  // If Supabase environment is missing and user has not clicked inspection mode
  if (!isConfigured && !previewBypass) {
    return <ConfigErrorScreen onBypassToPreview={() => setPreviewBypass(true)} />;
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
        case 'notifications':
          return t.navigation.notifications;
        case 'settings':
          return t.navigation.settings;
        default:
          return t.navigation.dashboard;
      }
    };

    const renderTeacherView = () => {
      switch (currentTeacherView) {
        case 'dashboard':
          return <TeacherDashboard onNavigate={(v) => setCurrentTeacherView(v as TeacherView)} />;

        case 'students':
          return <StudentManagementView />;

        case 'groups':
          return <GroupManagementView />;

        case 'courses':
        case 'lessons':
          return <CoursesManagementView />;

        case 'video':
          return (
            <FeaturePlaceholderView
              title={t.navigation.videoLibrary}
              subtitle={isRtl ? 'مكتبة الفيديوهات التعليمية المسجلة' : 'Recorded lecture library'}
              targetPhase="Phase 3 — Courses & Learning"
              icon={Video}
              description={isRtl ? 'إدارة الفيديوهات المسجلة عبر المزود السحابي مع روابط تشغيل موثقة ومحمية بسيرفر الموقع.' : 'Video provider abstraction (prepared for Mux) with signed server-side playback authorization.'}
              plannedCapabilities={[
                isRtl ? 'تخزين بيانات الفيديو وروابط التشغيل الموقعة' : 'Signed URL playback tokens without client secrets',
                isRtl ? 'التحقق من أحقية الطالب قبل إصدار رمز المشاهدة' : 'Server authorization verification before streaming',
                isRtl ? 'تتبع فترات المشاهدة والإكمال' : 'Playback engagement and progress logging',
              ]}
            />
          );

        case 'live-sessions':
          return <LiveSessionsManagementView />;

        case 'attendance':
          return <AttendanceReportsView />;

        case 'question-bank':
          return (
            <FeaturePlaceholderView
              title={t.navigation.questionBank}
              subtitle={isRtl ? 'بنك أسئلة اللغة الإنجليزية وقواعدها' : 'English question bank & grammar repository'}
              targetPhase="Phase 5 — Assessments"
              icon={HelpCircle}
              description={isRtl ? 'بنك شامل لأسئلة القواعد، المفردات، الفهم، والاستماع لتكوين الاختبارات.' : 'Comprehensive repository for grammar, vocabulary, reading, and listening questions.'}
              plannedCapabilities={[
                isRtl ? 'دعم الأسئلة متعددة الاختيارات، صح/خطأ، إعادة الترتيب وإكمال الفراغ' : 'Multiple Choice, True/False, Fill in Blank, Sentence Ordering',
                isRtl ? 'تصنيف الأسئلة حسب المهارة ومستوى الصعوبة' : 'Categorize by skill, topic, and difficulty',
                isRtl ? 'توليد اختبارات عشوائية من البنك' : 'Dynamic question selection from bank',
              ]}
            />
          );

        case 'quizzes':
          return <QuizManagementView />;

        case 'assignments':
          return (
            <FeaturePlaceholderView
              title={t.navigation.assignments}
              subtitle={isRtl ? 'الواجبات والتطبيقات المنزلية' : 'Coursework and homework tasks'}
              targetPhase="Phase 5 — Assessments"
              icon={ClipboardList}
              description={isRtl ? 'تكليف الطلاب بالواجبات مع تحديد مواعيد التسليم ورفع الملفات والتوجيهات.' : 'Homework assignment desk with deadlines, instructions, and file submissions.'}
              plannedCapabilities={[
                isRtl ? 'تحديد مواعيد التسليم النهائية بدقة' : 'Enforce precise due dates and late flags',
                isRtl ? 'إرفاق نماذج وتوجيهات الحل' : 'Attach assignment guidelines and rubrics',
                isRtl ? 'تعيين الواجب لمجموعة أو لطلاب محددين' : 'Target groups or individual students',
              ]}
            />
          );

        case 'submissions':
          return (
            <FeaturePlaceholderView
              title={t.navigation.submissionsGrading}
              subtitle={isRtl ? 'مركز التدقيق وتصحيح أعمال الطلاب' : 'Grading and submission evaluation desk'}
              targetPhase="Phase 5 — Assessments"
              icon={CheckSquare}
              description={isRtl ? 'مراجعة حلول الطلاب، رصد الدرجات، وكتابة الملاحظات التعليمية والتوجيهات.' : 'Review student submissions, award scores, and provide teacher feedback.'}
              plannedCapabilities={[
                isRtl ? 'استعراض ملفات وحلول الطلاب' : 'View student answers and submitted files',
                isRtl ? 'رصد الدرجات وإرسال الملاحظات الفردية' : 'Input scores and individualized teacher feedback',
                isRtl ? 'إشعار الطالب فور اعتماد النتيجة' : 'Instant notification to student upon review',
              ]}
            />
          );

        case 'results':
          return (
            <FeaturePlaceholderView
              title={t.navigation.results}
              subtitle={isRtl ? 'السجلات الأكاديمية والدرجات الإجمالية' : 'Academic transcripts and grade records'}
              targetPhase="Phase 6 — Analytics & Finalization"
              icon={Award}
              description={isRtl ? 'سجل أكاديمي شامل لكل طالب يوثق الحضور، الواجبات، والاختبارات عبر الفصول.' : 'Comprehensive academic record keeping for student transcripts, attendance, and exam history.'}
              plannedCapabilities={[
                isRtl ? 'تقارير درجات مجمعة قابلة للطباعة والتصدير' : 'Aggregated printable grade reports',
                isRtl ? 'سجل تاريخي غير قابل للتعديل' : 'Audit-protected academic history',
                isRtl ? 'تتبع تطور مستوى الطالب على مدار العام' : 'Year-over-year proficiency progress tracking',
              ]}
            />
          );

        case 'analytics':
          return (
            <FeaturePlaceholderView
              title={t.navigation.analytics}
              subtitle={isRtl ? 'مؤشرات الأداء وتحليلات التعلم' : 'Performance analytics and cohort insights'}
              targetPhase="Phase 6 — Analytics & Finalization"
              icon={BarChart3}
              description={isRtl ? 'رسوم بيانية حقيقية توضح التزام المجموعات ونقاط القوة والضعف في مهارات اللغة الإنجليزية.' : 'Real database analytics evaluating cohort engagement and language skill breakdowns.'}
              plannedCapabilities={[
                isRtl ? 'تحليل نسب إتقان المهارات (القواعد، المفردات، القراءة)' : 'Skill proficiency analytics (Grammar, Vocab, Reading)',
                isRtl ? 'معدلات الحضور والتسليم في الموعد' : 'Attendance and on-time submission ratios',
                isRtl ? 'كشف الطلاب الذين يحتاجون إلى متابعة إضافية' : 'Early identification of struggling students',
              ]}
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
                <NotificationCenterView
                  onNavigateToResource={(url) => {
                    if (url.includes('/courses')) setCurrentTeacherView('courses');
                    else if (url.includes('/live-sessions')) setCurrentTeacherView('live-sessions');
                    else if (url.includes('/assessments')) setCurrentTeacherView('quizzes');
                    else if (url.includes('/students')) setCurrentTeacherView('students');
                  }}
                />
              )}
            </div>
          );

        case 'settings':
          return (
            <FeaturePlaceholderView
              title={t.navigation.settings}
              subtitle={isRtl ? 'إعدادات المنصة والهوية الأكاديمية' : 'Academy system configuration'}
              targetPhase="Phase 6 — Analytics & Finalization"
              icon={Settings}
              description={isRtl ? 'إدارة بيانات الأكاديمية، العام الدراسي، وإعدادات الربط التقني.' : 'Manage academy information, academic year configuration, and provider integrations.'}
              plannedCapabilities={[
                isRtl ? 'تحديث بيانات أكاديمية الوسام' : 'WESSAM Academy branding configuration',
                isRtl ? 'سجل العمليات الإدارية (Audit Logs)' : 'Audit logs of administrative actions',
                isRtl ? 'التحكم في مزودي الفيديو والحصص المباشرة' : 'Manage video and meeting provider endpoints',
              ]}
            />
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
        case 'live-sessions':
          return t.navigation.liveClasses;
        case 'assignments':
          return t.navigation.assignments;
        case 'quizzes':
          return t.navigation.quizzesExams;
        case 'results':
          return t.navigation.results;
        case 'notifications':
          return t.navigation.notifications;
        case 'profile':
          return t.navigation.myProfile;
        default:
          return t.navigation.home;
      }
    };

    const renderStudentView = () => {
      switch (currentStudentView) {
        case 'home':
          return <StudentDashboard onNavigate={(v) => setCurrentStudentView(v as StudentView)} />;

        case 'courses':
        case 'lessons':
          return <StudentCoursesView />;

        case 'live-sessions':
          return <StudentLiveSessionsView />;

        case 'assignments':
          return (
            <FeaturePlaceholderView
              title={t.navigation.assignments}
              subtitle={isRtl ? 'الواجبات والتطبيقات العملية' : 'Homework and assignments'}
              targetPhase="Phase 5 — Assessments"
              icon={ClipboardList}
              description={isRtl ? 'رفع الواجبات ومتابعة مواعيد التسليم النهائية وملاحظات الأستاذ وسام.' : 'Submit homework, monitor deadlines, and receive teacher feedback.'}
              plannedCapabilities={[
                isRtl ? 'رفع الملفات والحلول بسهولة' : 'Upload assignment response files and text',
                isRtl ? 'متابعة حالة التسليم (في الموعد / متأخر)' : 'Track on-time or late submission status',
                isRtl ? 'قراءة توجيهات وملاحظات الأستاذ وسام' : 'Review personalized teacher corrections',
              ]}
            />
          );

        case 'quizzes':
          return <StudentAssessmentsView />;

        case 'results':
          return (
            <FeaturePlaceholderView
              title={t.navigation.results}
              subtitle={isRtl ? 'سجل الدرجات ومستوى الأداء' : 'Academic transcript and grades'}
              targetPhase="Phase 6 — Analytics & Finalization"
              icon={Award}
              description={isRtl ? 'استعراض درجاتك في جميع الاختبارات والواجبات ونسبة الحضور.' : 'View your comprehensive grades, attendance record, and teacher praise.'}
              plannedCapabilities={[
                isRtl ? 'كشف درجات تفصيلي لكل مقرر' : 'Itemized course gradebook',
                isRtl ? 'نسبة حضور الحصص المباشرة' : 'Live attendance percentage',
                isRtl ? 'تتبع تطور مستواك في اللغة الإنجليزية' : 'Skill progression metrics over time',
              ]}
            />
          );

        case 'notifications':
          return (
            <NotificationCenterView
              onNavigateToResource={(url) => {
                if (url.includes('/courses')) setCurrentStudentView('courses');
                else if (url.includes('/live-sessions')) setCurrentStudentView('live-sessions');
                else if (url.includes('/assessments')) setCurrentStudentView('quizzes');
              }}
            />
          );

        case 'profile':
          return (
            <FeaturePlaceholderView
              title={t.navigation.myProfile}
              subtitle={isRtl ? 'الملف الشخصي والبيانات الأكاديمية' : 'Student academic profile'}
              targetPhase="Phase 2 — Identity & Student Management"
              icon={User}
              description={isRtl ? 'بياناتك الأكاديمية المسجلة، اسم المستخدم، ورقم المجموعة.' : 'Your registered student ID, username, cohort details, and academic contacts.'}
              plannedCapabilities={[
                isRtl ? 'عرض الرقم الأكاديمي والمجموعة' : 'View student ID and academic cohort',
                isRtl ? 'تحديث بيانات الاتصال المصرح بها' : 'Update permitted contact details',
                isRtl ? 'تغيير كلمة المرور بشكل آمن' : 'Secure password update through Edge Function',
              ]}
            />
          );

        default:
          return <StudentDashboard onNavigate={(v) => setCurrentStudentView(v as StudentView)} />;
      }
    };

    return (
      <AppLayout
        currentView={currentStudentView}
        onSelectView={(v) => setCurrentStudentView(v as StudentView)}
        pageTitle={getPageTitle(currentStudentView)}
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
