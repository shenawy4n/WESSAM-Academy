/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  UserCheck,
  Clock,
  AlertCircle,
  Save,
  CheckCircle2,
  Calendar,
  Users,
} from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { useLocale } from '../../hooks/useLocale';
import {
  LiveSessionRecord,
  AttendanceStatus,
  RosterAttendanceItem,
  fetchSessionRosterAndAttendance,
  saveSessionAttendance,
} from './liveSessionsService';
import { formatRiyadhDateTime } from '../../lib/dateUtils';

interface AttendanceSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: LiveSessionRecord | null;
  onSuccess: () => void;
}

export const AttendanceSheetModal: React.FC<AttendanceSheetModalProps> = ({
  isOpen,
  onClose,
  session,
  onSuccess,
}) => {
  const { isRtl } = useLocale();

  const [roster, setRoster] = useState<RosterAttendanceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Load roster and current records
  useEffect(() => {
    if (!isOpen || !session) return;

    async function loadRoster() {
      if (!session) return;
      try {
        setLoading(true);
        setError(null);
        setSavedSuccess(false);
        const data = await fetchSessionRosterAndAttendance(session.id, session.groupId);
        setRoster(data);
      } catch (err: any) {
        console.error('Failed to load roster:', err);
        setError(err.message || 'Error loading student roster');
      } finally {
        setLoading(false);
      }
    }

    loadRoster();
  }, [isOpen, session]);

  if (!session) return null;

  const handleStatusChange = (studentId: string, status: AttendanceStatus) => {
    setRoster((prev) =>
      prev.map((item) => (item.studentId === studentId ? { ...item, status } : item))
    );
    setSavedSuccess(false);
  };

  const handleNotesChange = (studentId: string, notes: string) => {
    setRoster((prev) =>
      prev.map((item) => (item.studentId === studentId ? { ...item, notes } : item))
    );
    setSavedSuccess(false);
  };

  const handleMarkAllPresent = () => {
    setRoster((prev) => prev.map((item) => ({ ...item, status: 'present' })));
    setSavedSuccess(false);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      const payload = roster.map((item) => ({
        studentId: item.studentId,
        status: item.status,
        notes: item.notes,
      }));

      await saveSessionAttendance(session.id, payload);
      setSavedSuccess(true);
      onSuccess();
      setTimeout(() => {
        onClose();
      }, 900);
    } catch (err: any) {
      console.error('Failed to save attendance:', err);
      setError(err.message || 'Error saving attendance');
    } finally {
      setSaving(false);
    }
  };

  // Real-time metrics
  const totalCount = roster.length;
  const presentCount = roster.filter((r) => r.status === 'present').length;
  const lateCount = roster.filter((r) => r.status === 'late').length;
  const excusedCount = roster.filter((r) => r.status === 'excused').length;
  const absentCount = roster.filter((r) => r.status === 'absent').length;

  const countableTotal = presentCount + lateCount + absentCount;
  const complianceRate =
    countableTotal === 0 ? 100 : Math.round(((presentCount + lateCount) / countableTotal) * 100);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isRtl ? 'رصد حضور الحصة المباشرة' : 'Live Class Attendance Sheet'}
      maxWidth="xl"
    >
      <div className="space-y-4">
        {/* Session Header Card */}
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div>
            <div className="flex items-center gap-2 text-slate-500 font-medium">
              <Calendar className="w-3.5 h-3.5" />
              <span>
                {formatRiyadhDateTime(session.startTime, {
                  locale: isRtl ? 'ar' : 'en',
                })}
              </span>
              <span className="text-slate-300">·</span>
              <Users className="w-3.5 h-3.5" />
              <span className="font-semibold text-slate-800">
                {isRtl ? session.groupNameArabic || session.groupName : session.groupName}
              </span>
            </div>
            <h4 className="text-sm font-bold text-slate-900 mt-1">
              {isRtl ? session.titleArabic || session.title : session.title}
            </h4>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAllPresent}
            disabled={loading || saving || roster.length === 0}
            className="text-emerald-700 border-emerald-300 hover:bg-emerald-50"
            icon={<CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
          >
            {isRtl ? 'تحضير الكل حاضرين' : 'Mark All Present'}
          </Button>
        </div>

        {/* Real-time Statistics Summary Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
          <div className="p-2.5 rounded-xl bg-white border border-slate-200 text-center">
            <p className="text-[10px] text-slate-500 uppercase font-semibold">{isRtl ? 'الطلاب' : 'Total'}</p>
            <p className="text-base font-bold text-slate-800 mt-0.5">{totalCount}</p>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200 text-center">
            <p className="text-[10px] text-emerald-700 uppercase font-semibold">{isRtl ? 'حاضر' : 'Present'}</p>
            <p className="text-base font-bold text-emerald-700 mt-0.5">{presentCount}</p>
          </div>
          <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200 text-center">
            <p className="text-[10px] text-amber-700 uppercase font-semibold">{isRtl ? 'متأخر' : 'Late'}</p>
            <p className="text-base font-bold text-amber-700 mt-0.5">{lateCount}</p>
          </div>
          <div className="p-2.5 rounded-xl bg-blue-50/70 border border-blue-200 text-center">
            <p className="text-[10px] text-blue-700 uppercase font-semibold">{isRtl ? 'معذور' : 'Excused'}</p>
            <p className="text-base font-bold text-blue-700 mt-0.5">{excusedCount}</p>
          </div>
          <div className="p-2.5 rounded-xl bg-rose-50/70 border border-rose-200 text-center">
            <p className="text-[10px] text-rose-700 uppercase font-semibold">{isRtl ? 'غائب' : 'Absent'}</p>
            <p className="text-base font-bold text-rose-700 mt-0.5">{absentCount}</p>
          </div>
          <div className="p-2.5 rounded-xl bg-[#14243A] text-white text-center">
            <p className="text-[10px] text-slate-300 uppercase font-semibold">{isRtl ? 'نسبة الحضور' : 'Rate'}</p>
            <p className="text-base font-bold text-[#D8B96C] mt-0.5">{complianceRate}%</p>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {savedSuccess && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{isRtl ? 'تم حفظ سجل الحضور بنجاح' : 'Attendance record successfully saved!'}</span>
          </div>
        )}

        {/* Student Roster Table */}
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-slate-500">
            <LoadingSpinner size="md" />
            <span>{isRtl ? 'جاري تحميل قائمة الطلاب...' : 'Loading student roster...'}</span>
          </div>
        ) : roster.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500">
            {isRtl
              ? 'لا يوجد طلاب مسجلين في هذه المجموعة حالياً.'
              : 'No students are currently enrolled in this group.'}
          </div>
        ) : (
          <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[380px] overflow-y-auto">
            <table className="w-full text-xs text-start border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold sticky top-0 z-10">
                <tr>
                  <th className="py-2.5 px-3 text-start">{isRtl ? 'الطالب' : 'Student'}</th>
                  <th className="py-2.5 px-3 text-start w-64">{isRtl ? 'حالة الحضور' : 'Status'}</th>
                  <th className="py-2.5 px-3 text-start">{isRtl ? 'ملاحظة' : 'Note'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {roster.map((student) => {
                  return (
                    <tr key={student.studentId} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-800">
                          {isRtl ? student.studentNameArabic : student.studentName}
                        </div>
                        {student.studentNumber && (
                          <div className="text-[10px] font-mono text-slate-400">
                            {student.studentNumber}
                          </div>
                        )}
                      </td>

                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleStatusChange(student.studentId, 'present')}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                              student.status === 'present'
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {isRtl ? 'حاضر' : 'Present'}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleStatusChange(student.studentId, 'late')}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                              student.status === 'late'
                                ? 'bg-amber-600 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {isRtl ? 'متأخر' : 'Late'}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleStatusChange(student.studentId, 'excused')}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                              student.status === 'excused'
                                ? 'bg-blue-600 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {isRtl ? 'معذور' : 'Excused'}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleStatusChange(student.studentId, 'absent')}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                              student.status === 'absent'
                                ? 'bg-rose-600 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {isRtl ? 'غائب' : 'Absent'}
                          </button>
                        </div>
                      </td>

                      <td className="py-2.5 px-3">
                        <input
                          type="text"
                          value={student.notes || ''}
                          onChange={(e) => handleNotesChange(student.studentId, e.target.value)}
                          placeholder={isRtl ? 'ملاحظة (اختياري)...' : 'Optional note...'}
                          className="w-full text-xs rounded-lg border border-slate-200 px-2 py-1 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#356AE6]"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Modal Actions */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            <span>
              {isRtl
                ? 'الحفظ يتم في سجل الأكاديمية الدائم مع توثيق اسم المعلم وتوقيت التسجيل.'
                : 'Attendance logs are permanently recorded with teacher signature and timestamp.'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
              {isRtl ? 'إغلاق' : 'Close'}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              isLoading={saving}
              disabled={loading || roster.length === 0}
              icon={<Save className="w-3.5 h-3.5" />}
            >
              {isRtl ? 'حفظ السجل' : 'Save Attendance'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
