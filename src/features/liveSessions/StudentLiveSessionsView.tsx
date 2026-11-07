/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useLocale } from '../../hooks/useLocale';
import { useAuth } from '../auth/AuthContext';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import {
  fetchStudentLiveSessions,
  fetchStudentAttendanceHistory,
  getAuthorizedMeetingLink,
  LiveSessionRecord,
  AttendanceRecord,
} from './liveSessionsService';
import {
  formatRiyadhDateTime,
  isSessionLive,
  isSessionUpcoming,
  calculateAttendanceMetrics,
} from '../../lib/dateUtils';
import {
  Radio,
  Calendar,
  Clock,
  Video,
  CheckCircle2,
  AlertCircle,
  Clock4,
  XCircle,
  HelpCircle,
  BookOpen,
  Users,
  Award,
} from 'lucide-react';

export const StudentLiveSessionsView: React.FC = () => {
  const { isRtl } = useLocale();
  const { user, studentProfile } = useAuth();

  const [activeTab, setActiveTab] = useState<'upcoming' | 'past' | 'attendance'>('upcoming');
  const [sessions, setSessions] = useState<LiveSessionRecord[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      if (!user) return;
      try {
        setLoading(true);
        setError(null);
        const [sessionList, attendanceList] = await Promise.all([
          fetchStudentLiveSessions(),
          fetchStudentAttendanceHistory(),
        ]);
        setSessions(sessionList);
        setAttendanceRecords(attendanceList);
      } catch (err: unknown) {
        console.error('Failed to load student live sessions:', err);
        setError(isRtl ? 'تعذر تحميل بيانات الحصص المباشرة' : 'Failed to load live sessions');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [user, isRtl]);

  const upcomingSessions = sessions.filter(
    (s) => s.status === 'scheduled' || isSessionUpcoming(s.startTime) || isSessionLive(s.startTime, s.durationMinutes)
  );

  const pastSessions = sessions.filter(
    (s) => s.status === 'completed' || s.status === 'cancelled' || !upcomingSessions.some((u) => u.id === s.id)
  );

  const handleJoinClass = async (sessionId: string) => {
    try {
      setJoiningId(sessionId);
      setError(null);
      const link = await getAuthorizedMeetingLink(sessionId);
      if (link) {
        window.open(link, '_blank', 'noopener,noreferrer');
      } else {
        setError(isRtl ? 'رابط الحصة غير متوفر حالياً' : 'Meeting link is not available yet');
      }
    } catch (err: unknown) {
      console.error('Failed to retrieve authorized meeting link:', err);
      setError(isRtl ? 'غير مصرح لك بالوصول لرابط هذه الحصة' : 'Unauthorized to access this meeting link');
    } finally {
      setJoiningId(null);
    }
  };

  const attendanceMetrics = calculateAttendanceMetrics(attendanceRecords);

  const getAttendanceForSession = (sessionId: string) => {
    return attendanceRecords.find((a) => a.sessionId === sessionId);
  };

  const renderAttendanceBadge = (status: AttendanceRecord['status'] | undefined) => {
    switch (status) {
      case 'present':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {isRtl ? 'حاضر' : 'Present'}
          </span>
        );
      case 'late':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock4 className="w-3.5 h-3.5" />
            {isRtl ? 'متأخر' : 'Late'}
          </span>
        );
      case 'excused':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <HelpCircle className="w-3.5 h-3.5" />
            {isRtl ? 'معذور' : 'Excused'}
          </span>
        );
      case 'absent':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3.5 h-3.5" />
            {isRtl ? 'غائب' : 'Absent'}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-50 text-slate-500 border border-slate-200">
            {isRtl ? 'غير مرصود' : 'Not Recorded'}
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="p-12 flex justify-center items-center">
        <LoadingSpinner size="lg" label={isRtl ? 'جاري تحميل الحصص المباشرة...' : 'Loading live sessions...'} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-[#14243A] rounded-2xl p-6 sm:p-8 text-white relative overflow-hidden shadow-xs">
        <div className="absolute top-0 end-0 -mt-8 -me-8 w-48 h-48 bg-[#356AE6]/15 rounded-full blur-2xl pointer-events-none" />
        <div className="relative z-10 max-w-2xl">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#D8B96C] mb-2 uppercase tracking-wide">
            <Radio className="w-4 h-4 text-[#D8B96C]" />
            <span>{isRtl ? 'الحصص التفاعلية المباشرة' : 'Interactive Live Sessions'}</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            {isRtl ? 'حصص البث المباشر وسجل الحضور' : 'Live Classes & Attendance Portal'}
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 mt-1.5 leading-relaxed">
            {isRtl
              ? 'تابع جدول الحصص التفاعلية مع أ. وسام إبراهيم دراز، وانضم مباشرة للقاعات المصرح بها بتوقيت المملكة العربية السعودية (Asia/Riyadh).'
              : 'Join scheduled interactive sessions with Mr. Wessam and monitor your attendance record in Asia/Riyadh timezone.'}
          </p>

          {studentProfile?.groupName && (
            <div className="mt-4 flex items-center gap-2 text-xs text-slate-300">
              <Users className="w-4 h-4 text-[#D8B96C]" />
              <span>{isRtl ? 'المجموعة المقيد بها:' : 'Enrolled Cohort:'} </span>
              <span className="font-semibold text-white">{studentProfile.groupName}</span>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-1">
        <button
          type="button"
          onClick={() => setActiveTab('upcoming')}
          className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 -mb-1 ${
            activeTab === 'upcoming'
              ? 'border-[#356AE6] text-[#356AE6]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          {isRtl ? 'الحصص القادمة' : 'Upcoming Classes'} ({upcomingSessions.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('past')}
          className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 -mb-1 ${
            activeTab === 'past'
              ? 'border-[#356AE6] text-[#356AE6]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          {isRtl ? 'الحصص السابقة' : 'Past Classes'} ({pastSessions.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('attendance')}
          className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 -mb-1 ${
            activeTab === 'attendance'
              ? 'border-[#356AE6] text-[#356AE6]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          {isRtl ? 'سجل حضوري الأكاديمي' : 'My Attendance'}
        </button>
      </div>

      {/* Tab 1: Upcoming Sessions */}
      {activeTab === 'upcoming' && (
        <div>
          {upcomingSessions.length === 0 ? (
            <EmptyState
              icon={<Radio className="w-8 h-8 text-slate-400" />}
              title={isRtl ? 'لا توجد حصص مباشرة قادمة حالياً' : 'No upcoming live sessions scheduled'}
              description={
                isRtl
                  ? 'سيتم إشعارك فور قيام الأستاذ وسام بجدولة حصة مباشرة جديدة لمجموعتك الدراسية.'
                  : 'You will receive notice once Mr. Wessam schedules a live class for your cohort.'
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {upcomingSessions.map((session) => {
                const liveNow = isSessionLive(session.startTime, session.durationMinutes);
                return (
                  <Card key={session.id} className="p-5 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          {liveNow && (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-bold bg-rose-50 text-rose-600 border border-rose-200 mb-2 animate-pulse">
                              <span className="w-2 h-2 rounded-full bg-rose-600" />
                              {isRtl ? 'جارية الآن (مباشر)' : 'Live Now'}
                            </span>
                          )}
                          <h3 className="text-base font-bold text-[#14243A]">
                            {isRtl ? (session.titleArabic || session.title) : session.title}
                          </h3>
                        </div>
                        <span className="text-xs px-2.5 py-1 rounded bg-slate-100 font-medium text-slate-600 uppercase">
                          {session.provider}
                        </span>
                      </div>

                      {(session.description || session.descriptionArabic) && (
                        <p className="text-xs text-slate-600 line-clamp-2 mb-3">
                          {isRtl ? (session.descriptionArabic || session.description) : (session.description || session.descriptionArabic)}
                        </p>
                      )}

                      <div className="space-y-1.5 text-xs text-slate-500 mb-4">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-slate-400" />
                          <span>{formatRiyadhDateTime(session.startTime, { locale: isRtl ? 'ar' : 'en' })}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-slate-400" />
                          <span>
                            {session.durationMinutes} {isRtl ? 'دقيقة' : 'minutes'}
                          </span>
                        </div>
                        {session.courseTitle && (
                          <div className="flex items-center gap-2">
                            <BookOpen className="w-4 h-4 text-slate-400" />
                            <span>
                              {isRtl ? (session.courseTitleArabic || session.courseTitle) : session.courseTitle}
                              {session.lessonTitle && ` — ${isRtl ? (session.lessonTitleArabic || session.lessonTitle) : session.lessonTitle}`}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                      <div className="text-[11px] text-slate-400">
                        {isRtl ? 'توقيت مكة المكرمة (UTC+3)' : 'Asia/Riyadh (UTC+3)'}
                      </div>
                      <Button
                        variant={liveNow ? 'gold' : 'primary'}
                        size="sm"
                        disabled={joiningId === session.id}
                        onClick={() => handleJoinClass(session.id)}
                        icon={joiningId === session.id ? undefined : <Video className="w-3.5 h-3.5" />}
                      >
                        {joiningId === session.id
                          ? (isRtl ? 'جاري التحقق...' : 'Checking...')
                          : liveNow
                          ? (isRtl ? 'انضم إلى الحصة الآن' : 'Join Live Class')
                          : (isRtl ? 'دخول القاعة' : 'Launch Meeting')}
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Past Sessions */}
      {activeTab === 'past' && (
        <div>
          {pastSessions.length === 0 ? (
            <EmptyState
              icon={<Calendar className="w-8 h-8 text-slate-400" />}
              title={isRtl ? 'لا توجد حصص سابقة مسجلة' : 'No past live classes recorded'}
              description={isRtl ? 'ستظهر الحصص المنتهية وسجل حضورك هنا.' : 'Completed sessions and attendance records will be displayed here.'}
            />
          ) : (
            <div className="space-y-3">
              {pastSessions.map((session) => {
                const myAttendance = getAttendanceForSession(session.id);
                return (
                  <Card key={session.id} className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-[#14243A]">
                            {isRtl ? (session.titleArabic || session.title) : session.title}
                          </h4>
                          {session.status === 'cancelled' && (
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-50 text-rose-600 border border-rose-200">
                              {isRtl ? 'ملغاة' : 'Cancelled'}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-slate-500 mt-1">
                          <span>{formatRiyadhDateTime(session.startTime, { locale: isRtl ? 'ar' : 'en' })}</span>
                          <span>•</span>
                          <span>{session.durationMinutes} {isRtl ? 'دقيقة' : 'min'}</span>
                          {session.groupName && (
                            <>
                              <span>•</span>
                              <span>{isRtl ? (session.groupNameArabic || session.groupName) : session.groupName}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-end">
                          <div className="text-[11px] text-slate-400 mb-0.5">{isRtl ? 'حالة الحضور:' : 'Attendance:'}</div>
                          {session.status === 'cancelled' ? (
                            <span className="text-xs text-slate-400 italic">
                              {isRtl ? 'مستثناة (حصة ملغاة)' : 'Excluded (Cancelled)'}
                            </span>
                          ) : (
                            renderAttendanceBadge(myAttendance?.status)
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Attendance History & Analytics */}
      {activeTab === 'attendance' && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card className="p-4">
              <div className="text-xs text-slate-500">{isRtl ? 'نسبة الالتزام' : 'Compliance Rate'}</div>
              <div className={`text-2xl font-bold mt-1 ${
                attendanceMetrics.percentage >= 85
                  ? 'text-emerald-600'
                  : attendanceMetrics.percentage >= 70
                  ? 'text-amber-600'
                  : 'text-rose-600'
              }`}>
                {attendanceMetrics.percentage}%
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {isRtl ? 'النسبة الأكاديمية' : 'Official Metric'}
              </div>
            </Card>

            <Card className="p-4">
              <div className="text-xs text-slate-500">{isRtl ? 'الحصص المحضورة' : 'Attended'}</div>
              <div className="text-2xl font-bold text-emerald-600 mt-1">
                {attendanceMetrics.present}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {isRtl ? `+ ${attendanceMetrics.late} تأخير` : `+ ${attendanceMetrics.late} late`}
              </div>
            </Card>

            <Card className="p-4">
              <div className="text-xs text-slate-500">{isRtl ? 'غياب بعذر' : 'Excused'}</div>
              <div className="text-2xl font-bold text-blue-600 mt-1">
                {attendanceMetrics.excused}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {isRtl ? 'لا يحتسب ضدك' : 'Not penalized'}
              </div>
            </Card>

            <Card className="p-4">
              <div className="text-xs text-slate-500">{isRtl ? 'غياب بدون عذر' : 'Unexcused'}</div>
              <div className="text-2xl font-bold text-rose-600 mt-1">
                {attendanceMetrics.absent}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {isRtl ? 'يؤثر على النسبة' : 'Affects score'}
              </div>
            </Card>
          </div>

          {/* Itemized Table */}
          <Card>
            <CardHeader
              title={isRtl ? 'تفاصيل سجل الحضور' : 'Itemized Attendance History'}
              subtitle={isRtl ? 'سجل غير قابل للتعديل موثق بقاعدة البيانات' : 'Official attendance records logged in database'}
            />
            <CardContent>
              {attendanceRecords.length === 0 ? (
                <EmptyState
                  icon={<Award className="w-6 h-6 text-slate-400" />}
                  title={isRtl ? 'لا يوجد سجل حضور بعد' : 'No attendance recorded yet'}
                  description={isRtl ? 'سيتم تسجيل وتحديث حضورك فور إقامة الحصص المباشرة ورصدها من قبل المعلم.' : 'Your attendance will be updated after each live session.'}
                />
              ) : (
                <div className="divide-y divide-slate-100">
                  {attendanceRecords.map((record) => (
                    <div key={record.id} className="py-3 flex items-center justify-between gap-4">
                      <div>
                        <div className="text-xs font-semibold text-[#14243A]">
                          {record.sessionTitle || (isRtl ? 'حصة مباشرة' : 'Live Class')}
                        </div>
                        {record.sessionStartTime && (
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {formatRiyadhDateTime(record.sessionStartTime, { locale: isRtl ? 'ar' : 'en' })}
                          </div>
                        )}
                        {record.notes && (
                          <div className="text-[11px] text-slate-500 mt-1 italic">
                            &quot;{record.notes}&quot;
                          </div>
                        )}
                      </div>
                      <div>
                        {renderAttendanceBadge(record.status)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};
