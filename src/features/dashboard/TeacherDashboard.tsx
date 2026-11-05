/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useLocale } from '../../hooks/useLocale';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../../lib/supabase/client';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
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
} from 'lucide-react';

interface MetricCount {
  totalStudents: number;
  activeStudents: number;
  totalGroups: number;
  activeCourses: number;
  upcomingLiveClasses: number;
  pendingReviews: number;
}

export const TeacherDashboard: React.FC<{ onNavigate: (view: string) => void }> = ({ onNavigate }) => {
  const { t, isRtl } = useLocale();
  const { user } = useAuth();
  const [loading, setLoading] = useState<boolean>(true);
  const [metrics, setMetrics] = useState<MetricCount>({
    totalStudents: 0,
    activeStudents: 0,
    totalGroups: 0,
    activeCourses: 0,
    upcomingLiveClasses: 0,
    pendingReviews: 0,
  });

  useEffect(() => {
    async function loadMetrics() {
      if (!supabase) {
        setMetrics({
          totalStudents: 3,
          activeStudents: 3,
          totalGroups: 3,
          activeCourses: 2,
          upcomingLiveClasses: 0,
          pendingReviews: 0,
        });
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        // Query actual counts from PostgreSQL
        const [
          { count: studentsCount },
          { count: activeStudentsCount },
          { count: groupsCount },
          { count: coursesCount },
          { count: liveCount },
          { count: submissionsCount },
        ] = await Promise.all([
          supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'student'),
          supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'student').eq('status', 'active'),
          supabase.from('groups').select('id', { count: 'exact', head: true }),
          supabase.from('courses').select('id', { count: 'exact', head: true }).eq('is_published', true),
          supabase.from('live_sessions').select('id', { count: 'exact', head: true }).eq('status', 'scheduled'),
          supabase.from('submissions').select('id', { count: 'exact', head: true }).is('graded_at', null),
        ]);

        setMetrics({
          totalStudents: studentsCount || 0,
          activeStudents: activeStudentsCount || 0,
          totalGroups: groupsCount || 0,
          activeCourses: coursesCount || 0,
          upcomingLiveClasses: liveCount || 0,
          pendingReviews: submissionsCount || 0,
        });
      } catch (err) {
        console.error('Failed to query metrics from database:', err);
      } finally {
        setLoading(false);
      }
    }
    loadMetrics();
  }, []);

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
                    {loading ? '—' : card.value}
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
              {metrics.upcomingLiveClasses === 0 ? (
                <EmptyState
                  icon={<Radio className="w-6 h-6 text-slate-400" />}
                  title={t.teacherDashboard.noUpcomingClasses}
                  description={isRtl ? 'يمكنك جدولة حصص البث المباشر وربطها بالمجموعات الدراسية من خلال تبويب الحصص المباشرة.' : 'Schedule live interactive classes for your student groups from the live classes portal.'}
                  actionLabel={t.teacherDashboard.scheduleLiveAction}
                  onAction={() => onNavigate('live-sessions')}
                />
              ) : (
                <div className="text-xs text-slate-600">
                  {/* Future dynamic listing */}
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
              {metrics.pendingReviews === 0 ? (
                <EmptyState
                  icon={<ClipboardList className="w-6 h-6 text-slate-400" />}
                  title={t.teacherDashboard.noPendingAssignments}
                  description={isRtl ? 'لا توجد تسليمات معلقة تتطلب التدقيق في الوقت الحالي.' : 'All submitted assignments and quizzes are currently evaluated.'}
                />
              ) : null}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar Column: Recent Activity & Academic Status */}
        <div className="space-y-6">
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
