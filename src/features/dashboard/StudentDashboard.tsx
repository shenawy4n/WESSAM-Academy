/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useLocale } from '../../hooks/useLocale';
import { useAuth } from '../auth/AuthContext';
import { requireSupabaseClient, ServiceError, throwServiceError } from '../../lib/errors/serviceError';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import {
  BookOpen,
  Radio,
  ClipboardList,
  Award,
  Bell,
  Sparkles,
  PlayCircle,
  GraduationCap,
  Calendar,
  Video,
  MessageSquare,
} from 'lucide-react';
import { formatRiyadhDateTime, isSessionLive } from '../../lib/dateUtils';
import { getAuthorizedMeetingLink } from '../liveSessions/liveSessionsService';
import { fetchStudentAssignments } from '../assignments/assignmentService';
import { messagingService } from '../messaging/messagingService';

interface StudentUpcomingSession {
  id: string;
  title: string;
  title_arabic?: string | null;
  start_time: string;
  duration_minutes: number;
  provider: string;
}

export const StudentDashboard: React.FC<{ onNavigate: (view: string) => void }> = ({ onNavigate }) => {
  const { t, isRtl } = useLocale();
  const { user, studentProfile } = useAuth();
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<unknown>(null);
  const [joinError, setJoinError] = useState<unknown>(null);
  const [coursesCount, setCoursesCount] = useState<number>(0);
  const [assignmentsCount, setAssignmentsCount] = useState<number>(0);
  const [upcomingSessions, setUpcomingSessions] = useState<StudentUpcomingSession[]>([]);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [unreadMessages, setUnreadMessages] = useState<number>(0);

  const loadStudentData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const client = requireSupabaseClient({ service: 'StudentDashboard', operation: 'loadStudentData' });
      if (!user) {
        throw new ServiceError({
          category: 'AUTHENTICATION_ERROR',
          message: 'Authenticated user required to load dashboard.',
          service: 'StudentDashboard',
          operation: 'loadStudentData',
        });
      }

      if (!studentProfile?.groupId) {
        setCoursesCount(0);
        setAssignmentsCount(0);
        setUpcomingSessions([]);
        return;
      }

      const [coursesRes, sessionsRes, studentAssignData] = await Promise.all([
        client.from('group_courses').select('id', { count: 'exact', head: true }).eq('group_id', studentProfile.groupId),
        client
          .from('live_sessions')
          .select('id, title, title_arabic, start_time, duration_minutes, provider')
          .eq('group_id', studentProfile.groupId)
          .eq('status', 'scheduled')
          .order('start_time', { ascending: true })
          .limit(3),
        fetchStudentAssignments(),
      ]);

      if (coursesRes.error) {
        throwServiceError(coursesRes.error, { service: 'StudentDashboard', operation: 'countGroupCourses' });
      }
      if (sessionsRes.error) {
        throwServiceError(sessionsRes.error, { service: 'StudentDashboard', operation: 'fetchUpcomingSessions' });
      }

      setCoursesCount(coursesRes.count ?? 0);
      const pendingCount = studentAssignData.assignments.filter((a) => {
        const subs = studentAssignData.mySubmissions[a.id] || [];
        return !subs.some((s) => s.status === 'submitted' || s.status === 'graded');
      }).length;
      setAssignmentsCount(pendingCount);
      setUpcomingSessions((sessionsRes.data || []) as StudentUpcomingSession[]);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [user, studentProfile]);

  useEffect(() => {
    loadStudentData();
  }, [loadStudentData]);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    const loadUnread = () => {
      messagingService
        .getUnreadMessagesCount()
        .then((count) => {
          if (active) setUnreadMessages(count);
        })
        .catch(() => {
          // Non-fatal on dashboard widget if messaging migration not yet applied
        });
    };
    loadUnread();
    const unsub = messagingService.subscribeToMessages(user.id, loadUnread);
    return () => {
      active = false;
      unsub();
    };
  }, [user?.id]);

  const handleJoinClass = async (sessionId: string) => {
    setJoinError(null);
    try {
      setJoiningId(sessionId);
      const link = await getAuthorizedMeetingLink(sessionId);
      if (!link) {
        throw new ServiceError({
          category: 'NOT_FOUND',
          message: isRtl ? 'رابط الحصة المباشرة غير متاح حالياً.' : 'Live meeting link is not available yet.',
          service: 'StudentDashboard',
          operation: 'handleJoinClass',
        });
      }
      window.open(link, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setJoinError(err);
    } finally {
      setJoiningId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-[#14243A] rounded-2xl p-6 sm:p-8 text-white relative overflow-hidden shadow-xs">
        <div className="absolute top-0 end-0 -mt-8 -me-8 w-48 h-48 bg-[#D8B96C]/15 rounded-full blur-2xl pointer-events-none" />
        <div className="relative z-10 max-w-2xl">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#D8B96C] mb-2 uppercase tracking-wide">
            <GraduationCap className="w-4 h-4" />
            <span>{isRtl ? 'بوابة الطالب الأكاديمية' : 'Student Learning Portal'}</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            {isRtl
              ? `أهلاً بك، ${user?.fullNameArabic || user?.fullName || 'عزيزي الطالب'}`
              : `Welcome, ${user?.fullName || 'Student'}`}
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 mt-1.5 leading-relaxed">
            {t.studentDashboard.welcomeMessage}
          </p>

          {/* Academic Profile Details */}
          {studentProfile && (
            <div className="mt-4 pt-4 border-t border-slate-700/60 flex flex-wrap gap-4 text-xs text-slate-300">
              {studentProfile.groupName && (
                <div>
                  <span className="text-slate-400">{isRtl ? 'المجموعة:' : 'Group:'} </span>
                  <span className="font-semibold text-white">{studentProfile.groupName}</span>
                </div>
              )}
              {studentProfile.studentNumber && (
                <div>
                  <span className="text-slate-400">{isRtl ? 'الرقم الأكاديمي:' : 'Student ID:'} </span>
                  <span className="font-mono text-[#D8B96C]">{studentProfile.studentNumber}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {Boolean(error) && (
        <ErrorState variant="banner" error={error} isRtl={isRtl} onRetry={loadStudentData} />
      )}
      {Boolean(joinError) && (
        <ErrorState variant="banner" error={joinError} isRtl={isRtl} onDismiss={() => setJoinError(null)} />
      )}

      {/* Main Grid: My Courses & Upcoming Live Classes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols): Enrolled Courses & Assignments */}
        <div className="lg:col-span-2 space-y-6">
          {/* Enrolled Courses */}
          <Card>
            <CardHeader
              title={t.studentDashboard.enrolledCourses}
              subtitle={isRtl ? 'المناهج والمقررات المخصصة لمجموعتك الدراسية' : 'Curricula assigned to your academic cohort'}
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onNavigate('courses')}
                  icon={<BookOpen className="w-3.5 h-3.5" />}
                >
                  {isRtl ? 'استعراض الكل' : 'View All'}
                </Button>
              }
            />
            <CardContent>
              {error ? (
                <ErrorState error={error} isRtl={isRtl} onRetry={loadStudentData} />
              ) : coursesCount === 0 ? (
                <EmptyState
                  icon={<BookOpen className="w-6 h-6 text-slate-400" />}
                  title={t.studentDashboard.noEnrolledCourses}
                  description={isRtl ? 'عند تفعيل حسابك وإضافتك لمجموعتك من قِبل الأستاذ وسام، ستظهر المقررات الدراسية ووحدات الدروس هنا مباشرة.' : 'Once enrolled by your teacher, your course units, lessons, and video materials will appear here.'}
                />
              ) : (
                <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <div>
                    <p className="text-sm font-bold text-[#14243A]">
                      {isRtl
                        ? `لديك ${coursesCount} مقرر دراسي مخصص لمجموعتك`
                        : `You have ${coursesCount} enrolled course${coursesCount === 1 ? '' : 's'}`}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {isRtl ? 'افتح صفحة المقررات لاستعراض الوحدات والدروس.' : 'Open My Courses to browse units and lessons.'}
                    </p>
                  </div>
                  <Button variant="primary" size="sm" onClick={() => onNavigate('courses')}>
                    {isRtl ? 'فتح المقررات' : 'Open Courses'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pending Assignments */}
          <Card>
            <CardHeader
              title={t.studentDashboard.pendingAssignments}
              subtitle={isRtl ? 'الواجبات والتطبيقات العملية' : 'Coursework and practice assignments'}
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onNavigate('assignments')}
                >
                  {isRtl ? 'صفحة الواجبات' : 'Assignments'}
                </Button>
              }
            />
            <CardContent>
              {error ? (
                <ErrorState error={error} isRtl={isRtl} onRetry={loadStudentData} />
              ) : assignmentsCount === 0 ? (
                <EmptyState
                  icon={<ClipboardList className="w-6 h-6 text-slate-400" />}
                  title={t.studentDashboard.noPendingAssignments}
                  description={isRtl ? 'لا توجد تكاليف متأخرة أو واجبات بانتظار التسليم.' : 'No outstanding tasks are due at this moment.'}
                />
              ) : (
                <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <div>
                    <p className="text-sm font-bold text-[#14243A]">
                      {isRtl
                        ? `يوجد ${assignmentsCount} واجب منشور لمجموعتك`
                        : `${assignmentsCount} published assignment${assignmentsCount === 1 ? '' : 's'} for your group`}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {isRtl ? 'راجع صفحة الواجبات للتحقق من المواعيد وحالة التسليم.' : 'Visit Assignments to review due dates and submission status.'}
                    </p>
                  </div>
                  <Button variant="primary" size="sm" onClick={() => onNavigate('assignments')}>
                    {isRtl ? 'عرض الواجبات' : 'View Assignments'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Live Classes & Notifications */}
        <div className="space-y-6">
          {/* Upcoming Live Sessions */}
          <Card>
            <CardHeader
              title={t.studentDashboard.upcomingLiveClasses}
              subtitle={t.common.timezoneNotice}
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onNavigate('live-sessions')}
                  icon={<Calendar className="w-3.5 h-3.5" />}
                >
                  {isRtl ? 'عرض الجدول' : 'View Schedule'}
                </Button>
              }
            />
            <CardContent>
              {error ? (
                <ErrorState error={error} isRtl={isRtl} onRetry={loadStudentData} />
              ) : upcomingSessions.length === 0 ? (
                <EmptyState
                  icon={<Radio className="w-6 h-6 text-slate-400" />}
                  title={t.studentDashboard.noUpcomingClasses}
                  description={isRtl ? 'سيصلك تنبيه فوري بالرابط وموعد الحصة فور جدولتها.' : 'You will be notified once a live session is scheduled.'}
                />
              ) : (
                <div className="divide-y divide-slate-100">
                  {upcomingSessions.map((session) => {
                    const isLive = isSessionLive(session.start_time, session.duration_minutes);
                    return (
                      <div key={session.id} className="py-3 space-y-2 first:pt-0 last:pb-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            {isLive && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 mb-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse" />
                                {isRtl ? 'مباشر الآن' : 'Live Now'}
                              </span>
                            )}
                            <h4 className="text-xs font-bold text-[#14243A]">
                              {isRtl ? (session.title_arabic || session.title) : session.title}
                            </h4>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {formatRiyadhDateTime(session.start_time, { locale: isRtl ? 'ar' : 'en' })}
                            </div>
                          </div>
                          <span className="text-[10px] px-2 py-0.5 bg-slate-100 rounded text-slate-600 uppercase font-medium">
                            {session.provider}
                          </span>
                        </div>
                        <Button
                          variant={isLive ? 'gold' : 'outline'}
                          size="sm"
                          className="w-full text-xs"
                          disabled={joiningId === session.id}
                          onClick={() => handleJoinClass(session.id)}
                          icon={joiningId === session.id ? undefined : <Video className="w-3.5 h-3.5" />}
                        >
                          {joiningId === session.id
                            ? (isRtl ? 'جاري التحقق...' : 'Checking...')
                            : isLive
                            ? (isRtl ? 'انضم الآن' : 'Join Live')
                            : (isRtl ? 'دخول القاعة' : 'Launch Meeting')}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recorded Video Library Widget */}
          <Card>
            <CardHeader
              title={t.navigation.videoLibrary}
              subtitle={isRtl ? 'المحاضرات والشروحات المسجلة' : 'Recorded lectures & explanations'}
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onNavigate('video')}
                  icon={<PlayCircle className="w-3.5 h-3.5" />}
                >
                  {isRtl ? 'فتح المكتبة' : 'Open Library'}
                </Button>
              }
            />
            <CardContent>
              <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#356AE6] text-white flex items-center justify-center shrink-0">
                    <Video className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-slate-900">
                      {isRtl ? 'متابعة المشاهدة' : 'Continue Watching'}
                    </h5>
                    <p className="text-[11px] text-slate-500">
                      {isRtl ? 'استكمل محاضراتك المسجلة وحافظ على تقدمك' : 'Resume recorded lectures and track your progress'}
                    </p>
                  </div>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => onNavigate('video')}
                  className="text-xs shrink-0"
                >
                  {isRtl ? 'مشاهدة' : 'Watch'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Message Teacher Card */}
          <Card>
            <CardHeader
              title={t.navigation.messageTeacher}
              subtitle={isRtl ? 'التواصل المباشر مع معلمك' : 'Direct communication with your teacher'}
              action={
                unreadMessages > 0 ? (
                  <span className="bg-[#356AE6] text-white text-[11px] font-bold px-2 py-0.5 rounded-md">
                    {unreadMessages} {isRtl ? 'جديد' : 'new'}
                  </span>
                ) : undefined
              }
            />
            <CardContent>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-[#14243A] text-[#D8B96C] flex items-center justify-center shrink-0">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h5 className="text-xs font-bold text-slate-900">
                      {isRtl ? 'إرسال سؤال أو مرفق للمعلم' : 'Ask a Question or Share Files'}
                    </h5>
                    <p className="text-[11px] text-slate-500 truncate">
                      {unreadMessages > 0
                        ? isRtl
                          ? `لديك ${unreadMessages} رسالة غير مقروءة`
                          : `You have ${unreadMessages} unread message(s)`
                        : isRtl
                        ? 'افتح صندوق الرسائل للتواصل الخاص'
                        : 'Open private messaging with your teacher'}
                    </p>
                  </div>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => onNavigate('messages')}
                  className="text-xs shrink-0"
                >
                  {isRtl ? 'فتح الرسائل' : 'Messages'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Recent Results */}
          <Card>
            <CardHeader
              title={t.studentDashboard.recentResults}
              subtitle={isRtl ? 'درجات الاختبارات والتقييمات' : 'Exam and quiz performance records'}
            />
            <CardContent>
              <EmptyState
                icon={<Award className="w-6 h-6 text-slate-400" />}
                title={t.studentDashboard.noRecentResults}
                description={isRtl ? 'سجلك الأكاديمي ودرجات التقييمات ستُحفظ هنا فور إتمامها وتصحيحها.' : 'Grades and teacher evaluations will be listed here.'}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
