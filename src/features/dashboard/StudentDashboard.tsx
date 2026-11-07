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
} from 'lucide-react';
import { formatRiyadhDateTime, isSessionLive } from '../../lib/dateUtils';
import { getAuthorizedMeetingLink } from '../liveSessions/liveSessionsService';

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
  const [coursesCount, setCoursesCount] = useState<number>(0);
  const [liveSessionsCount, setLiveSessionsCount] = useState<number>(0);
  const [assignmentsCount, setAssignmentsCount] = useState<number>(0);
  const [upcomingSessions, setUpcomingSessions] = useState<StudentUpcomingSession[]>([]);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  useEffect(() => {
    async function loadStudentData() {
      if (!supabase || !user) {
        setCoursesCount(2);
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        if (studentProfile?.groupId) {
          const [{ count: cCount }, { count: sCount }, { data: sessionRows }] = await Promise.all([
            supabase.from('group_courses').select('id', { count: 'exact', head: true }).eq('group_id', studentProfile.groupId),
            supabase.from('live_sessions').select('id', { count: 'exact', head: true }).eq('group_id', studentProfile.groupId).eq('status', 'scheduled'),
            supabase
              .from('live_sessions')
              .select('id, title, title_arabic, start_time, duration_minutes, provider')
              .eq('group_id', studentProfile.groupId)
              .eq('status', 'scheduled')
              .order('start_time', { ascending: true })
              .limit(3),
          ]);
          setCoursesCount(cCount || 0);
          setLiveSessionsCount(sCount || 0);
          if (sessionRows) {
            setUpcomingSessions(sessionRows as StudentUpcomingSession[]);
          }
        }
      } catch (err) {
        console.error('Error querying student dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadStudentData();
  }, [user, studentProfile]);

  const handleJoinClass = async (sessionId: string) => {
    try {
      setJoiningId(sessionId);
      const link = await getAuthorizedMeetingLink(sessionId);
      if (link) {
        window.open(link, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      console.error('Failed to get meeting link:', err);
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
              {coursesCount === 0 ? (
                <EmptyState
                  icon={<BookOpen className="w-6 h-6 text-slate-400" />}
                  title={t.studentDashboard.noEnrolledCourses}
                  description={isRtl ? 'عند تفعيل حسابك وإضافتك لمجموعتك من قِبل الأستاذ وسام، ستظهر المقررات الدراسية ووحدات الدروس هنا مباشرة.' : 'Once enrolled by your teacher, your course units, lessons, and video materials will appear here.'}
                />
              ) : null}
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
              <EmptyState
                icon={<ClipboardList className="w-6 h-6 text-slate-400" />}
                title={t.studentDashboard.noPendingAssignments}
                description={isRtl ? 'لا توجد تكاليف متأخرة أو واجبات بانتظار التسليم.' : 'No outstanding tasks are due at this moment.'}
              />
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
              {upcomingSessions.length === 0 ? (
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
