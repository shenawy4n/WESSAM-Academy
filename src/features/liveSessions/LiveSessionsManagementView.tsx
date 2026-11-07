/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Radio,
  Plus,
  Calendar,
  Clock,
  Users,
  Video,
  UserCheck,
  Edit2,
  Trash2,
  Search,
  ExternalLink,
  Copy,
  Check,
  Filter,
  CheckCircle2,
  XCircle,
  AlertCircle,
  BookOpen,
} from 'lucide-react';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { useLocale } from '../../hooks/useLocale';
import {
  LiveSessionRecord,
  fetchTeacherLiveSessions,
  cancelLiveSession,
  deleteLiveSession,
} from './liveSessionsService';
import { SessionModal } from './SessionModal';
import { AttendanceSheetModal } from './AttendanceSheetModal';
import { formatRiyadhDateTime, isSessionLive } from '../../lib/dateUtils';
import { supabase } from '../../lib/supabase/client';

export const LiveSessionsManagementView: React.FC = () => {
  const { isRtl } = useLocale();

  const [sessions, setSessions] = useState<LiveSessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [timeframe, setTimeframe] = useState<'all' | 'upcoming' | 'past'>('upcoming');
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [groups, setGroups] = useState<{ id: string; name: string; nameArabic: string }[]>([]);

  // Modals state
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [sessionToEdit, setSessionToEdit] = useState<LiveSessionRecord | null>(null);
  const [attendanceSession, setAttendanceSession] = useState<LiveSessionRecord | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Load groups for filter
  useEffect(() => {
    async function loadGroups() {
      try {
        if (supabase) {
          const { data } = await supabase
            .from('groups')
            .select('id, name, name_arabic')
            .order('name');
          setGroups((data || []).map((g) => ({
            id: g.id,
            name: g.name,
            nameArabic: g.name_arabic || g.name,
          })));
        }
      } catch (err) {
        console.error('Error loading filter groups:', err);
      }
    }
    loadGroups();
  }, []);

  const loadSessions = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchTeacherLiveSessions({
        groupId: selectedGroup,
        status: selectedStatus,
        timeframe,
        search: searchQuery,
      });
      setSessions(data);
    } catch (err: any) {
      console.error('Failed to load sessions:', err);
      setError(err.message || 'Error loading live sessions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, [timeframe, selectedGroup, selectedStatus, searchQuery]);

  const handleCopyLink = async (id: string, url?: string | null) => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy meeting link:', err);
    }
  };

  const handleCancelSession = async (session: LiveSessionRecord) => {
    const confirmMsg = isRtl
      ? `هل أنت متأكد من رغبتك في إلغاء الحصة المباشرة: "${session.titleArabic || session.title}"؟`
      : `Are you sure you want to cancel session: "${session.title}"?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      await cancelLiveSession(session.id);
      loadSessions();
    } catch (err: any) {
      alert(`Error cancelling session: ${err.message}`);
    }
  };

  const handleDeleteSession = async (session: LiveSessionRecord) => {
    const confirmMsg = isRtl
      ? `تحذير: سيتم حذف الحصة "${session.titleArabic || session.title}" نهائياً بما في ذلك سجل الحضور المرتبط بها. هل تريد المتابعة؟`
      : `Warning: This will permanently delete "${session.title}" and any associated attendance records. Proceed?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      await deleteLiveSession(session.id);
      loadSessions();
    } catch (err: any) {
      alert(`Error deleting session: ${err.message}`);
    }
  };

  const upcomingCount = sessions.filter((s) => s.status === 'scheduled').length;
  const liveCount = sessions.filter((s) => s.status === 'live' || isSessionLive(s.startTime, s.endTime)).length;

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Action */}
      <div className="bg-[#14243A] rounded-2xl p-6 sm:p-8 text-white relative overflow-hidden shadow-xs">
        <div className="absolute top-0 end-0 -mt-8 -me-8 w-48 h-48 bg-[#356AE6]/15 rounded-full blur-2xl pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-[#D8B96C] mb-2 uppercase tracking-wide">
              <Radio className="w-4 h-4 text-rose-500 animate-pulse" />
              <span>{isRtl ? 'البث المباشر والحصص التفاعلية' : 'Live Classes & Interactive Sessions'}</span>
              <span className="text-slate-500">·</span>
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-300 font-normal">
                {isRtl ? 'توقيت مكة المكرمة (Asia/Riyadh)' : 'Makkah Time (Asia/Riyadh)'}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
              {isRtl ? 'إدارة حصص البث المباشر والغياب' : 'Live Classrooms & Attendance Management'}
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl leading-relaxed">
              {isRtl
                ? 'جدولة وإطلاق الحصص التفاعلية، وتوجيه روابط الزوم وجوجل ميت المشفرة للمجموعات المصرح لها، ورصد الحضور بدقة.'
                : 'Schedule lectures, generate cohort-restricted live rooms (Zoom/Meet/Teams), and track student attendance compliance.'}
            </p>
          </div>

          <Button
            variant="gold"
            size="md"
            icon={<Plus className="w-4 h-4" />}
            onClick={() => {
              setSessionToEdit(null);
              setIsSessionModalOpen(true);
            }}
          >
            {isRtl ? 'جدولة حصة جديدة' : 'Schedule Session'}
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Timeframe Tabs */}
          <div className="flex items-center p-1 bg-slate-100 rounded-xl">
            <button
              onClick={() => setTimeframe('upcoming')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                timeframe === 'upcoming'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {isRtl ? 'القادمة' : 'Upcoming'}
              {upcomingCount > 0 && (
                <span className="ms-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-[#356AE6] text-white">
                  {upcomingCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setTimeframe('past')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                timeframe === 'past'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {isRtl ? 'السابقة والمنتهية' : 'Past & Completed'}
            </button>
            <button
              onClick={() => setTimeframe('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                timeframe === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {isRtl ? 'جميع الحصص' : 'All Sessions'}
            </button>
          </div>

          {/* Controls: Group, Status, Search */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Group Filter */}
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="text-xs rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#356AE6]/30"
            >
              <option value="all">{isRtl ? 'جميع المجموعات' : 'All Groups'}</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {isRtl ? g.nameArabic || g.name : g.name}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="text-xs rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#356AE6]/30"
            >
              <option value="all">{isRtl ? 'جميع الحالات' : 'All Statuses'}</option>
              <option value="scheduled">{isRtl ? 'مجدولة' : 'Scheduled'}</option>
              <option value="live">{isRtl ? 'جارية الآن' : 'Live Now'}</option>
              <option value="completed">{isRtl ? 'مكتملة' : 'Completed'}</option>
              <option value="cancelled">{isRtl ? 'ملغاة' : 'Cancelled'}</option>
            </select>

            {/* Search */}
            <div className="relative min-w-[180px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isRtl ? 'بحث في العناوين...' : 'Search sessions...'}
                className="w-full text-xs rounded-xl border border-slate-200 ps-8 pe-3 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#356AE6]/30"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Sessions Grid / List */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3 text-xs text-slate-500">
          <LoadingSpinner size="lg" />
          <span>{isRtl ? 'جاري تحميل جدول الحصص المباشرة...' : 'Loading live classrooms...'}</span>
        </div>
      ) : error ? (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={<Radio className="w-8 h-8 text-slate-400" />}
          title={isRtl ? 'لا توجد حصص مباشرة تطابق البحث' : 'No Live Sessions Found'}
          description={
            isRtl
              ? 'لم يتم العثور على أي حصص مجدولة وفق معايير التصفية المحددة. يمكنك جدولة حصة جديدة الآن.'
              : 'No sessions match your selected filters. Create a new lecture or adjust your search.'
          }
          actionLabel={isRtl ? 'جدولة حصة جديدة' : 'Schedule Session'}
          onAction={() => {
            setSessionToEdit(null);
            setIsSessionModalOpen(true);
          }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sessions.map((session) => {
            const isLive = session.status === 'live' || isSessionLive(session.startTime, session.endTime);
            const isCancelled = session.status === 'cancelled';
            const isCompleted = session.status === 'completed';

            return (
              <Card
                key={session.id}
                className={`flex flex-col justify-between transition-all border ${
                  isLive
                    ? 'border-rose-400 ring-2 ring-rose-500/20 shadow-md'
                    : isCancelled
                    ? 'border-slate-200 opacity-60 bg-slate-50/50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="p-5 space-y-3">
                  {/* Status & Provider Header */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      {isLive ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-700">
                          <span className="w-2 h-2 rounded-full bg-rose-600 animate-ping" />
                          {isRtl ? 'بث مباشر الآن' : 'LIVE NOW'}
                        </span>
                      ) : isCancelled ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-500">
                          <XCircle className="w-3 h-3 text-slate-400" />
                          {isRtl ? 'ملغاة' : 'Cancelled'}
                        </span>
                      ) : isCompleted ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
                          <CheckCircle2 className="w-3 h-3 text-slate-500" />
                          {isRtl ? 'منتهية' : 'Completed'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                          <Calendar className="w-3 h-3 text-emerald-600" />
                          {isRtl ? 'مجدولة' : 'Scheduled'}
                        </span>
                      )}
                    </div>

                    <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-600 uppercase tracking-wider">
                      {session.provider === 'google_meet' ? 'Google Meet' : session.provider}
                    </span>
                  </div>

                  {/* Title & Group */}
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 line-clamp-2 leading-snug">
                      {isRtl ? session.titleArabic || session.title : session.title}
                    </h3>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1 font-medium">
                      <Users className="w-3.5 h-3.5 text-[#356AE6]" />
                      <span>{isRtl ? session.groupNameArabic || session.groupName : session.groupName}</span>
                    </div>
                  </div>

                  {/* Course & Lesson badge if linked */}
                  {session.courseTitle && (
                    <div className="p-2 rounded-xl bg-slate-50 border border-slate-100 text-[11px] text-slate-600 flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">
                        {isRtl ? session.courseTitleArabic || session.courseTitle : session.courseTitle}
                      </span>
                    </div>
                  )}

                  {/* Date, Time, Duration (Asia/Riyadh) */}
                  <div className="pt-2 border-t border-slate-100 space-y-1 text-xs text-slate-600">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-semibold text-slate-800">
                        {formatRiyadhDateTime(session.startTime, {
                          locale: isRtl ? 'ar' : 'en',
                        })}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 ps-5">
                      {session.durationMinutes} {isRtl ? 'دقيقة' : 'minutes'} · {isRtl ? 'بتوقيت مكة' : 'Makkah Time'}
                    </div>
                  </div>
                </div>

                {/* Card Actions Footer */}
                <div className="p-4 bg-slate-50/80 border-t border-slate-100 rounded-b-2xl flex flex-wrap items-center justify-between gap-2">
                  {/* Attendance Button */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAttendanceSession(session)}
                    disabled={isCancelled}
                    icon={<UserCheck className="w-3.5 h-3.5 text-[#356AE6]" />}
                    className="text-xs"
                  >
                    {isRtl ? 'رصد الحضور' : 'Attendance'}
                    {session.attendanceCount !== undefined && session.attendanceCount > 0 && (
                      <span className="ms-1 px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-bold">
                        {session.attendanceCount}
                      </span>
                    )}
                  </Button>

                  {/* Meeting Launch or Copy Link */}
                  <div className="flex items-center gap-1">
                    {session.meetingUrl && !isCancelled && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleCopyLink(session.id, session.meetingUrl)}
                          title={isRtl ? 'نسخ رابط الحصة' : 'Copy link'}
                          className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 transition-colors"
                        >
                          {copiedId === session.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>

                        <a
                          href={session.meetingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-[#356AE6] hover:bg-slate-100 transition-colors"
                          title={isRtl ? 'بدء الحصة / فتح الرابط' : 'Launch classroom'}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </>
                    )}

                    {!isCancelled && (
                      <button
                        type="button"
                        onClick={() => {
                          setSessionToEdit(session);
                          setIsSessionModalOpen(true);
                        }}
                        title={isRtl ? 'تعديل بيانات الحصة' : 'Edit session'}
                        className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {!isCancelled ? (
                      <button
                        type="button"
                        onClick={() => handleCancelSession(session)}
                        title={isRtl ? 'إلغاء الحصة' : 'Cancel session'}
                        className="p-1.5 rounded-lg border border-slate-200 bg-white text-rose-600 hover:bg-rose-50 transition-colors"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleDeleteSession(session)}
                        title={isRtl ? 'حذف الحصة الملغاة نهائياً' : 'Delete session permanently'}
                        className="p-1.5 rounded-lg border border-slate-200 bg-white text-rose-600 hover:bg-rose-50 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modals */}
      <SessionModal
        isOpen={isSessionModalOpen}
        onClose={() => setIsSessionModalOpen(false)}
        sessionToEdit={sessionToEdit}
        onSuccess={loadSessions}
      />

      <AttendanceSheetModal
        isOpen={Boolean(attendanceSession)}
        onClose={() => setAttendanceSession(null)}
        session={attendanceSession}
        onSuccess={loadSessions}
      />
    </div>
  );
};
