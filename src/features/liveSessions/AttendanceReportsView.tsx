/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  UserCheck,
  Calendar,
  Users,
  AlertCircle,
  FileSpreadsheet,
  Percent,
  CheckCircle2,
  Clock,
  XCircle,
  ShieldAlert,
} from 'lucide-react';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { ErrorState } from '../../components/ui/ErrorState';
import { useLocale } from '../../hooks/useLocale';
import {
  AttendanceReportData,
  fetchGroupAttendanceReport,
} from './liveSessionsService';
import { requireSupabaseClient, throwServiceError } from '../../lib/errors/serviceError';

export const AttendanceReportsView: React.FC = () => {
  const { isRtl } = useLocale();

  const [report, setReport] = useState<AttendanceReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [filterError, setFilterError] = useState<unknown>(null);

  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [groups, setGroups] = useState<{ id: string; name: string; nameArabic: string }[]>([]);

  useEffect(() => {
    async function loadGroups() {
      try {
        setFilterError(null);
        const client = requireSupabaseClient({
          service: 'attendanceReportsView',
          operation: 'loadGroups',
        });
        const { data, error: grpErr } = await client
          .from('groups')
          .select('id, name, name_arabic')
          .order('name');
        if (grpErr) {
          throwServiceError(grpErr, {
            service: 'attendanceReportsView',
            operation: 'loadGroups',
          });
        }
        setGroups((data || []).map((g) => ({
          id: g.id,
          name: g.name,
          nameArabic: g.name_arabic || g.name,
        })));
      } catch (err: unknown) {
        setFilterError(err);
      }
    }
    loadGroups();
  }, []);

  const loadReport = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const data = await fetchGroupAttendanceReport(
        selectedGroup,
        dateFrom ? new Date(dateFrom).toISOString() : undefined,
        dateTo ? new Date(dateTo + 'T23:59:59.999Z').toISOString() : undefined
      );
      setReport(data);
    } catch (err: unknown) {
      setLoadError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [selectedGroup, dateFrom, dateTo]);

  const getComplianceBadge = (pct: number) => {
    if (pct >= 85) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          {pct}%
        </span>
      );
    }
    if (pct >= 70) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
          <Clock className="w-3.5 h-3.5 text-amber-600" />
          {pct}%
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800">
        <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
        {pct}%
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-[#14243A] rounded-2xl p-6 sm:p-8 text-white relative overflow-hidden shadow-xs">
        <div className="absolute top-0 end-0 -mt-8 -me-8 w-48 h-48 bg-[#D8B96C]/15 rounded-full blur-2xl pointer-events-none" />
        <div className="relative z-10 max-w-2xl">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#D8B96C] mb-2 uppercase tracking-wide">
            <UserCheck className="w-4 h-4" />
            <span>{isRtl ? 'سجل الحضور والالتزام الأكاديمي' : 'Attendance & Academic Compliance'}</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            {isRtl ? 'تقارير الحضور والغياب للمجموعات والطلاب' : 'Roster Attendance Analytics & Reports'}
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 mt-1 leading-relaxed">
            {isRtl
              ? 'متابعة نسب التزام الطلاب بالحضور للحصص المباشرة، مع استبعاد الحصص الملغاة تلقائياً واحتساب الأعذار المعتمدة.'
              : 'Monitor group and individual student attendance rates, excluding cancelled sessions and accounting for excused absences.'}
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                {isRtl ? 'المجموعة الدراسية' : 'Group Filter'}
              </label>
              <select
                value={selectedGroup}
                onChange={(e) => setSelectedGroup(e.target.value)}
                className="text-xs rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#356AE6]/30"
              >
                <option value="all">{isRtl ? 'جميع المجموعات' : 'All Groups'}</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {isRtl ? g.nameArabic || g.name : g.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                {isRtl ? 'من تاريخ' : 'From Date'}
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="text-xs rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#356AE6]/30"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                {isRtl ? 'إلى تاريخ' : 'To Date'}
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="text-xs rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#356AE6]/30"
              />
            </div>
          </div>

          {(dateFrom || dateTo || selectedGroup !== 'all') && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedGroup('all');
                setDateFrom('');
                setDateTo('');
              }}
            >
              {isRtl ? 'إعادة ضبط التصفية' : 'Reset Filters'}
            </Button>
          )}
        </div>
      </Card>

      {Boolean(filterError) && (
        <ErrorState
          variant="banner"
          error={filterError}
          isRtl={isRtl}
          onDismiss={() => setFilterError(null)}
        />
      )}

      {/* Aggregate Metrics Bar */}
      {report && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card className="p-4 text-center">
            <p className="text-xs text-slate-500 font-medium">{isRtl ? 'إجمالي الحصص' : 'Total Sessions'}</p>
            <h4 className="text-2xl font-bold text-slate-900 mt-1">{report.totalSessions}</h4>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {report.cancelledSessionsCount} {isRtl ? 'ملغاة مستبعدة' : 'cancelled excluded'}
            </p>
          </Card>

          <Card className="p-4 text-center bg-emerald-50/60 border-emerald-200/80">
            <p className="text-xs text-emerald-800 font-medium">{isRtl ? 'إجمالي الحضور' : 'Present'}</p>
            <h4 className="text-2xl font-bold text-emerald-700 mt-1">{report.overallPresent}</h4>
            <p className="text-[10px] text-emerald-600 mt-0.5">{isRtl ? 'حضور في الموعد' : 'On-time'}</p>
          </Card>

          <Card className="p-4 text-center bg-amber-50/60 border-amber-200/80">
            <p className="text-xs text-amber-800 font-medium">{isRtl ? 'حالات التأخير' : 'Late'}</p>
            <h4 className="text-2xl font-bold text-amber-700 mt-1">{report.overallLate}</h4>
            <p className="text-[10px] text-amber-600 mt-0.5">{isRtl ? 'حضور متأخر' : 'Late arrivals'}</p>
          </Card>

          <Card className="p-4 text-center bg-blue-50/60 border-blue-200/80">
            <p className="text-xs text-blue-800 font-medium">{isRtl ? 'أعذار مقبولة' : 'Excused'}</p>
            <h4 className="text-2xl font-bold text-blue-700 mt-1">{report.overallExcused}</h4>
            <p className="text-[10px] text-blue-600 mt-0.5">{isRtl ? 'غير محسوبة كغياب' : 'Excused absence'}</p>
          </Card>

          <Card className="p-4 text-center bg-rose-50/60 border-rose-200/80">
            <p className="text-xs text-rose-800 font-medium">{isRtl ? 'حالات الغياب' : 'Absent'}</p>
            <h4 className="text-2xl font-bold text-rose-700 mt-1">{report.overallAbsent}</h4>
            <p className="text-[10px] text-rose-600 mt-0.5">{isRtl ? 'غياب غير مبرر' : 'Unexcused'}</p>
          </Card>

          <Card className="p-4 text-center bg-[#14243A] text-white">
            <p className="text-xs text-slate-300 font-medium">{isRtl ? 'نسبة الالتزام العامة' : 'Compliance Rate'}</p>
            <h4 className="text-2xl font-bold text-[#D8B96C] mt-1">{report.overallAttendanceRate}%</h4>
            <p className="text-[10px] text-slate-400 mt-0.5">{isRtl ? 'المعدل التراكمي' : 'Weighted average'}</p>
          </Card>
        </div>
      )}

      {/* Student Roster Report Table */}
      <Card>
        <CardHeader
          title={isRtl ? 'سجل الالتزام التفصيلي لكل طالب' : 'Individual Student Attendance Records'}
          subtitle={
            isRtl
              ? 'تفصيل الحضور والغياب ونسبة الالتزام لكل طالب مسجل في المجموعات المحددة.'
              : 'Detailed breakdown of sessions attended, excused absences, and compliance rate per student.'
          }
        />
        <CardContent>
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-2 text-xs text-slate-500">
              <LoadingSpinner size="md" />
              <span>{isRtl ? 'جاري تجميع وحساب بيانات الحضور...' : 'Calculating attendance metrics...'}</span>
            </div>
          ) : loadError ? (
            <ErrorState error={loadError} isRtl={isRtl} onRetry={loadReport} />
          ) : !report || report.studentSummaries.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              {isRtl
                ? 'لا توجد سجلات حضور مسجلة تطابق التصفية الحالية.'
                : 'No attendance records found matching your filters.'}
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden overflow-x-auto">
              <table className="w-full text-xs text-start border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <tr>
                    <th className="py-3 px-4 text-start">{isRtl ? 'الطالب' : 'Student'}</th>
                    <th className="py-3 px-4 text-center">{isRtl ? 'الحصص المحسوبة' : 'Active Sessions'}</th>
                    <th className="py-3 px-4 text-center">{isRtl ? 'حاضر' : 'Present'}</th>
                    <th className="py-3 px-4 text-center">{isRtl ? 'متأخر' : 'Late'}</th>
                    <th className="py-3 px-4 text-center">{isRtl ? 'معذور' : 'Excused'}</th>
                    <th className="py-3 px-4 text-center">{isRtl ? 'غائب' : 'Absent'}</th>
                    <th className="py-3 px-4 text-center">{isRtl ? 'نسبة الالتزام' : 'Compliance'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.studentSummaries.map((s) => (
                    <tr key={s.studentId} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-800">
                          {isRtl ? s.studentNameArabic : s.studentName}
                        </div>
                        {s.studentNumber && (
                          <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                            {s.studentNumber}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center font-medium text-slate-700">
                        {s.totalSessions}
                      </td>
                      <td className="py-3 px-4 text-center text-emerald-700 font-semibold">
                        {s.presentCount}
                      </td>
                      <td className="py-3 px-4 text-center text-amber-700 font-semibold">
                        {s.lateCount}
                      </td>
                      <td className="py-3 px-4 text-center text-blue-700 font-semibold">
                        {s.excusedCount}
                      </td>
                      <td className="py-3 px-4 text-center text-rose-700 font-semibold">
                        {s.absentCount}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {getComplianceBadge(s.attendancePercentage)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
