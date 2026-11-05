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
} from 'lucide-react';

export const StudentDashboard: React.FC<{ onNavigate: (view: string) => void }> = ({ onNavigate }) => {
  const { t, isRtl } = useLocale();
  const { user, studentProfile } = useAuth();
  const [loading, setLoading] = useState<boolean>(true);
  const [coursesCount, setCoursesCount] = useState<number>(0);
  const [liveSessionsCount, setLiveSessionsCount] = useState<number>(0);
  const [assignmentsCount, setAssignmentsCount] = useState<number>(0);

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
          const [{ count: cCount }, { count: sCount }] = await Promise.all([
            supabase.from('group_courses').select('id', { count: 'exact', head: true }).eq('group_id', studentProfile.groupId),
            supabase.from('live_sessions').select('id', { count: 'exact', head: true }).eq('group_id', studentProfile.groupId).eq('status', 'scheduled'),
          ]);
          setCoursesCount(cCount || 0);
          setLiveSessionsCount(sCount || 0);
        }
      } catch (err) {
        console.error('Error querying student dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadStudentData();
  }, [user, studentProfile]);

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
            />
            <CardContent>
              <EmptyState
                icon={<Radio className="w-6 h-6 text-slate-400" />}
                title={t.studentDashboard.noUpcomingClasses}
                description={isRtl ? 'سيصلك تنبيه فوري بالرابط وموعد الحصة فور جدولتها.' : 'You will be notified once a live session is scheduled.'}
              />
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
