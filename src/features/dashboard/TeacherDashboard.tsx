/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useLocale } from '../../hooks/useLocale';
import { useAuth } from '../auth/AuthContext';
import { requireSupabaseClient, throwServiceError } from '../../lib/errors/serviceError';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import {
  Users,
  FolderGit2,
  BookOpen,
  Radio,
  ClipboardList,
  CheckCircle2,
  Plus,
  Calendar,
  Sparkles,
  ArrowUpRight,
  ShieldCheck,
  GraduationCap,
  Clock,
  Video,
  MessageSquare,
} from 'lucide-react';
import { formatRiyadhDateTime, isSessionLive } from '../../lib/dateUtils';
import { messagingService } from '../messaging/messagingService';

interface MetricCount {
  totalStudents: number;
  activeStudents: number;
  totalGroups: number;
  activeCourses: number;
  upcomingLiveClasses: number;
  pendingReviews: number;
}

interface UpcomingSessionItem {
  id: string;
  title: string;
  title_arabic?: string | null;
  start_time: string;
  duration_minutes: number;
  provider: string;
  group_name?: string;
  group_name_arabic?: string | null;
}

export const TeacherDashboard: React.FC<{ onNavigate: (view: string) => void }> = ({ onNavigate }) => {
  const { t, isRtl } = useLocale();
  const { user } = useAuth();
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<unknown>(null);
  const [metrics, setMetrics] = useState<MetricCount>({
    totalStudents: 0,
    activeStudents: 0,
    totalGroups: 0,
    activeCourses: 0,
    upcomingLiveClasses: 0,
    pendingReviews: 0,
  });
  const [upcomingSessions, setUpcomingSessions] = useState<UpcomingSessionItem[]>([]);
  const [unreadMessages, setUnreadMessages] = useState<number>(0);

  const loadMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const client = requireSupabaseClient({ service: 'TeacherDashboard', operation: 'loadMetrics' });
      const [
        studentsRes,
        activeStudentsRes,
        groupsRes,
        coursesRes,
        liveRes,
        submissionsRes,
        sessionsRes,
      ] = await Promise.all([
        client.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'student'),
        client.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'student').eq('status', 'active'),
        client.from('groups').select('id', { count: 'exact', head: true }),
        client.from('courses').select('id', { count: 'exact', head: true }).eq('is_published', true),
        client.from('live_sessions').select('id', { count: 'exact', head: true }).eq('status', 'scheduled'),
        client.from('submissions').select('id', { count: 'exact', head: true }).is('graded_at', null),
        client
          .from('live_sessions')
          .select(`
            id,
            title,
            title_arabic,
            start_time,
            duration_minutes,
            provider,
            groups:group_id (
              name,
              name_arabic
            )
          `)
          .eq('status', 'scheduled')
          .order('start_time', { ascending: true })
          .limit(3),
      ]);

      if (studentsRes.error) throwServiceError(studentsRes.error, { service: 'TeacherDashboard', operation: 'countStudents' });
      if (activeStudentsRes.error) throwServiceError(activeStudentsRes.error, { service: 'TeacherDashboard', operation: 'countActiveStudents' });
      if (groupsRes.error) throwServiceError(groupsRes.error, { service: 'TeacherDashboard', operation: 'countGroups' });
      if (coursesRes.error) throwServiceError(coursesRes.error, { service: 'TeacherDashboard', operation: 'countCourses' });
      if (liveRes.error) throwServiceError(liveRes.error, { service: 'TeacherDashboard', operation: 'countLiveSessions' });
      if (submissionsRes.error) throwServiceError(submissionsRes.error, { service: 'TeacherDashboard', operation: 'countPendingSubmissions' });
      if (sessionsRes.error) throwServiceError(sessionsRes.error, { service: 'TeacherDashboard', operation: 'fetchUpcomingSessions' });

      setMetrics({
        totalStudents: studentsRes.count ?? 0,
        activeStudents: activeStudentsRes.count ?? 0,
        totalGroups: groupsRes.count ?? 0,
        activeCourses: coursesRes.count ?? 0,
        upcomingLiveClasses: liveRes.count ?? 0,
        pendingReviews: submissionsRes.count ?? 0,
      });

      const mapped: UpcomingSessionItem[] = (sessionsRes.data || []).map((r: any) => ({
        id: r.id,
        title: r.title,
        title_arabic: r.title_arabic,
        start_time: r.start_time,
        duration_minutes: r.duration_minutes || 60,
        provider: r.provider,
        group_name: r.groups?.name,
        group_name_arabic: r.groups?.name_arabic,
      }));
      setUpcomingSessions(mapped);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

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
          // Non-fatal on dashboard widget
        });
    };
    loadUnread();
    const unsub = messagingService.subscribeToMessages(user.id, loadUnread);
    return () => {
      active = false;
      unsub();
    };
  }, [user?.id]);

  const metricCards = [
    {
      title: t.teacherDashboard.totalStudents,
      value: metrics.totalStudents,
      subtext: `${metrics.activeStudents} ${t.common.active}`,
      icon: Users,
      color: 'text-[#356AE6]',
      viewKey: 'students',
    },
    {
      title: t.teacherDashboard.totalGroups,
      value: metrics.totalGroups,
      subtext: isRtl ? 'مجموعات نشطة' : 'Active Groups',
      icon: FolderGit2,
      color: 'text-indigo-600',
      viewKey: 'groups',
    },
    {
      title: t.teacherDashboard.activeCourses,
      value: metrics.activeCourses,
      subtext: isRtl ? 'مقررات معتمدة' : 'Published Courses',
      icon: BookOpen,
      color: 'text-emerald-600',
      viewKey: 'courses',
    },
    {
      title: t.teacherDashboard.upcomingLiveClasses,
      value: metrics.upcomingLiveClasses,
      subtext: isRtl ? 'خلال هذا الأسبوع' : 'Scheduled',
      icon: Radio,
      color: 'text-amber-600',
      viewKey: 'live-sessions',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-[#14243A] rounded-2xl p-6 sm:p-8 text-white relative overflow-hidden shadow-xs">
        <div className="absolute top-0 end-0 -mt-8 -me-8 w-48 h-48 bg-[#356AE6]/15 rounded-full blur-2xl pointer-events-none" />
        <div className="relative z-10 max-w-2xl">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#D8B96C] mb-2 uppercase tracking-wide">
            <GraduationCap className="w-4 h-4" />
            <span>{t.common.brandName} · {t.common.saudiArabia}</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            {isRtl ? `أهلاً بك، ${user?.fullNameArabic || 'أ. وسام إبراهيم دراز'}` : `Welcome, ${user?.fullName || 'Mr. Wessam Ibrahim Draz'}`}
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 mt-1.5 leading-relaxed">
            {t.teacherDashboard.welcomeMessage}
          </p>

          <div className="mt-6 flex flex-wrap gap-2.5">
            <Button
              variant="gold"
              size="sm"
              icon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => onNavigate('students')}
            >
              {t.teacherDashboard.newStudentAction}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="bg-white/10 text-white border-white/20 hover:bg-white/20"
              icon={<FolderGit2 className="w-3.5 h-3.5" />}
              onClick={() => onNavigate('groups')}
            >
              {t.teacherDashboard.newGroupAction}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="bg-white/10 text-white border-white/20 hover:bg-white/20"
              icon={<BookOpen className="w-3.5 h-3.5" />}
              onClick={() => onNavigate('courses')}
            >
              {t.teacherDashboard.newCourseAction}
            </Button>
          </div>
        </div>
      </div>

      {/* Error Banner when dashboard metrics fail to load */}
      {Boolean(error) && (
        <ErrorState
          variant="banner"
          error={error}
          isRtl={isRtl}
          onRetry={loadMetrics}
        />
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metricCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <Card
              key={i}
              className="p-5 hover:border-[#356AE6]/40 transition-colors cursor-pointer group"
              onClick={() => onNavigate(card.viewKey)}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-500">{card.title}</p>
                  <h4 className="text-2xl font-bold text-[#14243A] mt-1 tracking-tight">
                    {loading ? '—' : error ? '!' : card.value}
                  </h4>
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-1 font-medium">
                    <span>{card.subtext}</span>
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 group-hover:bg-slate-100 transition-colors">
                  <Icon className={`w-5 h-5 ${card.color}`} />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Main Grid: Upcoming Classes & Pending Evaluations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upcoming Live Sessions (2 cols on desktop) */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader
              title={t.teacherDashboard.upcomingLiveClasses}
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
                <ErrorState error={error} isRtl={isRtl} onRetry={loadMetrics} />
              ) : upcomingSessions.length === 0 ? (
                <EmptyState
                  icon={<Radio className="w-6 h-6 text-slate-400" />}
                  title={t.teacherDashboard.noUpcomingClasses}
                  description={isRtl ? 'يمكنك جدولة حصص البث المباشر وربطها بالمجموعات الدراسية من خلال تبويب الحصص المباشرة.' : 'Schedule live interactive classes for your student groups from the live classes portal.'}
                  actionLabel={t.teacherDashboard.scheduleLiveAction}
                  onAction={() => onNavigate('live-sessions')}
                />
              ) : (
                <div className="divide-y divide-slate-100">
                  {upcomingSessions.map((session) => {
                    const isLive = isSessionLive(session.start_time, session.duration_minutes);
                    return (
                      <div key={session.id} className="py-3 flex items-center justify-between gap-4 first:pt-0 last:pb-0">
                        <div>
                          <div className="flex items-center gap-2">
                            {isLive && (
                              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                            )}
                            <h4 className="text-xs sm:text-sm font-bold text-[#14243A]">
                              {isRtl ? (session.title_arabic || session.title) : session.title}
                            </h4>
                            {session.group_name && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">
                                {isRtl ? (session.group_name_arabic || session.group_name) : session.group_name}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1">
                            <span>{formatRiyadhDateTime(session.start_time, { locale: isRtl ? 'ar' : 'en' })}</span>
                            <span>•</span>
                            <span>{session.duration_minutes} {isRtl ? 'دقيقة' : 'min'}</span>
                            <span>•</span>
                            <span className="uppercase text-[10px] font-medium">{session.provider}</span>
                          </div>
                        </div>

                        <Button
                          variant={isLive ? 'gold' : 'outline'}
                          size="sm"
                          onClick={() => onNavigate('live-sessions')}
                        >
                          {isLive ? (isRtl ? 'مباشر الآن' : 'Live Now') : (isRtl ? 'إدارة' : 'Manage')}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pending Submissions / Tasks */}
          <Card>
            <CardHeader
              title={t.teacherDashboard.pendingReviews}
              subtitle={isRtl ? 'الواجبات والتكاليف المسلمة بانتظار التقييم' : 'Submitted student work awaiting evaluation'}
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onNavigate('submissions')}
                >
                  {isRtl ? 'مركز التصحيح' : 'Grading Desk'}
                </Button>
              }
            />
            <CardContent>
              {error ? (
                <ErrorState error={error} isRtl={isRtl} onRetry={loadMetrics} />
              ) : metrics.pendingReviews === 0 ? (
                <EmptyState
                  icon={<ClipboardList className="w-6 h-6 text-slate-400" />}
                  title={t.teacherDashboard.noPendingAssignments}
                  description={isRtl ? 'لا توجد تسليمات معلقة تتطلب التدقيق في الوقت الحالي.' : 'All submitted assignments and quizzes are currently evaluated.'}
                />
              ) : (
                <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-amber-50/70 border border-amber-200">
                  <div>
                    <p className="text-sm font-bold text-amber-900">
                      {isRtl
                        ? `${metrics.pendingReviews} تسليم بانتظار التقييم`
                        : `${metrics.pendingReviews} submissions awaiting grading`}
                    </p>
                    <p className="text-xs text-amber-800 mt-0.5">
                      {isRtl ? 'انتقل إلى مركز التصحيح لمراجعة أعمال الطلاب ورصد الدرجات.' : 'Open the grading desk to review student submissions and assign grades.'}
                    </p>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => onNavigate('submissions')}
                  >
                    {isRtl ? 'فتح التصحيح' : 'Review'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar Column: Student Messages & Recent Activity */}
        <div className="space-y-6">
          <Card>
            <CardHeader
              title={t.navigation.studentMessages}
              subtitle={isRtl ? 'الاستفسارات المباشرة من الطلاب' : 'Direct inquiries from students'}
              action={
                unreadMessages > 0 ? (
                  <span className="bg-[#356AE6] text-white text-[11px] font-bold px-2 py-0.5 rounded-md">
                    {unreadMessages} {isRtl ? 'جديد' : 'new'}
                  </span>
                ) : undefined
              }
            />
            <CardContent>
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-[#14243A] text-[#D8B96C] flex items-center justify-center shrink-0">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#14243A]">
                      {unreadMessages > 0
                        ? isRtl
                          ? `${unreadMessages} رسالة جديدة من الطلاب`
                          : `${unreadMessages} unread student message(s)`
                        : isRtl
                        ? 'صندوق رسائل الطلاب'
                        : 'Student Inbox'}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {isRtl ? 'مراجعة الرسائل والرد مع المرفقات' : 'Review threads and reply with attachments'}
                    </p>
                  </div>
                </div>
                <Button variant="primary" size="sm" onClick={() => onNavigate('messages')}>
                  {isRtl ? 'فتح' : 'Open'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader
              title={t.teacherDashboard.recentActivity}
              subtitle={isRtl ? 'سجل العمليات الأكاديمية' : 'Audit & Learning Events'}
            />
            <CardContent>
              <EmptyState
                icon={<CheckCircle2 className="w-6 h-6 text-slate-400" />}
                title={t.teacherDashboard.emptyMetricsTitle}
                description={t.teacherDashboard.noRecentActivity}
              />
            </CardContent>
          </Card>

          {/* Quick Academic Profile Summary */}
          <Card className="bg-slate-50/50">
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#14243A]">
                <ShieldCheck className="w-4 h-4 text-[#356AE6]" />
                <span>{isRtl ? 'الاعتماد الأكاديمي والبيئة' : 'Academic Directorship'}</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                {isRtl
                  ? 'منصة أكاديمية الوسام التعليمية تعمل تحت إشراف أ. وسام إبراهيم دراز لتقديم مناهج اللغة الإنجليزية الحديثة للمراحل التعليمية المختلفة في المملكة العربية السعودية.'
                  : 'WESSAM Academy is directed by Mr. Wessam Ibrahim Draz, delivering contemporary English curriculum to learners across Saudi Arabia.'}
              </p>
              <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-500">
                <span>{t.common.timezoneNotice}</span>
                <span className="font-mono text-slate-600">v1.0.0-phase1</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
