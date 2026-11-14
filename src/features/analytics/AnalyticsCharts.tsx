/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  AttendanceTrendPoint,
  GroupAnalyticsRow,
  ScoreDistributionBand,
} from './analyticsService';

interface DistributionChartProps {
  bands: ScoreDistributionBand[];
  isRtl: boolean;
}

export const ScoreDistributionChart: React.FC<DistributionChartProps> = ({ bands, isRtl }) => {
  const total = bands.reduce((acc, b) => acc + b.count, 0);

  const labels: Record<string, { ar: string; en: string; color: string }> = {
    '90_100': { ar: 'ممتاز (90 - 100%)', en: 'Excellent (90–100%)', color: '#10B981' },
    '75_89': { ar: 'جيد جداً (75 - 89%)', en: 'Very Good (75–89%)', color: '#356AE6' },
    '60_74': { ar: 'جيد (60 - 74%)', en: 'Good (60–74%)', color: '#D8B96C' },
    below_60: { ar: 'يحتاج متابعة (< 60%)', en: 'Needs Attention (< 60%)', color: '#E11D48' },
    ungraded: { ar: 'بدون تقييم مرصود', en: 'Ungraded / Pending', color: '#94A3B8' },
  };

  if (total === 0) {
    return (
      <div className="py-10 text-center text-xs text-slate-500">
        {isRtl ? 'لا توجد بيانات طلاب ضمن النطاق المحدد.' : 'No student score distribution data in scope.'}
      </div>
    );
  }

  return (
    <div className="space-y-3" role="region" aria-label={isRtl ? 'توزيع مستويات الطلاب' : 'Student score distribution'}>
      {bands.map((b) => {
        const meta = labels[b.band] || { ar: b.band, en: b.band, color: '#64748B' };
        const pct = total > 0 ? Math.round((b.count / total) * 100) : 0;
        return (
          <div key={b.band} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-[#14243A]">{isRtl ? meta.ar : meta.en}</span>
              <span className="text-slate-600 tabular-nums font-medium">
                {b.count} {isRtl ? 'طالب' : 'students'} · {pct}%
              </span>
            </div>
            <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden" aria-hidden="true">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${pct}%`, backgroundColor: meta.color }}
              />
            </div>
          </div>
        );
      })}
      <p className="text-[11px] text-slate-500 pt-1 tabular-nums">
        {isRtl
          ? `الإجمالي: ${total} طالب نشط ضمن النطاق (الوحدة: عدد الطلاب ونسبتهم المئوية).`
          : `Total: ${total} active students in scope (unit: student count & percentage share).`}
      </p>
    </div>
  );
};

interface AttendanceTrendChartProps {
  series: AttendanceTrendPoint[];
  isRtl: boolean;
}

export const AttendanceTrendChart: React.FC<AttendanceTrendChartProps> = ({ series, isRtl }) => {
  if (series.length === 0) {
    return (
      <div className="py-10 text-center text-xs text-slate-500">
        {isRtl ? 'لا توجد سجلات حضور في الفترة الزمنية المحددة.' : 'No attendance records in the selected period.'}
      </div>
    );
  }

  const displaySeries = series.slice(-14);
  const svgWidth = 560;
  const svgHeight = 180;
  const padX = 28;
  const padY = 20;
  const chartW = svgWidth - padX * 2;
  const chartH = svgHeight - padY * 2;
  const barGap = 6;
  const barW = Math.max(10, Math.floor(chartW / displaySeries.length) - barGap);

  return (
    <div className="space-y-2" role="region" aria-label={isRtl ? 'اتجاه نسبة الحضور اليومي' : 'Daily attendance rate trend'}>
      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full min-w-[420px] h-44"
          role="img"
          aria-label={isRtl ? 'رسم بياني لنسبة الحضور اليومية (%)' : 'Daily attendance rate bar chart (%)'}
        >
          {[0, 25, 50, 75, 100].map((tick) => {
            const y = padY + chartH - (tick / 100) * chartH;
            return (
              <g key={tick}>
                <line x1={padX} x2={svgWidth - padX} y1={y} y2={y} stroke="#E2E8F0" strokeDasharray="3 3" />
                <text x={padX - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#64748B">
                  {tick}%
                </text>
              </g>
            );
          })}

          {displaySeries.map((pt, idx) => {
            const rate = pt.attendanceRatePct ?? 0;
            const barH = (rate / 100) * chartH;
            const x = padX + idx * (barW + barGap) + 4;
            const y = padY + chartH - barH;
            const fill = pt.attendanceRatePct === null ? '#CBD5E1' : rate >= 75 ? '#356AE6' : '#D97706';

            return (
              <g key={pt.riyadhDate}>
                <rect x={x} y={y} width={barW} height={Math.max(2, barH)} rx={3} fill={fill}>
                  <title>
                    {pt.riyadhDate}: {pt.attendanceRatePct !== null ? `${pt.attendanceRatePct}%` : 'N/A'} (
                    {pt.present}P / {pt.late}L / {pt.absent}A)
                  </title>
                </rect>
                <text x={x + barW / 2} y={svgHeight - 4} textAnchor="middle" fontSize="8" fill="#64748B">
                  {pt.riyadhDate.slice(5)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <p className="text-[11px] text-slate-500 tabular-nums">
        {isRtl
          ? `يعرض آخر ${displaySeries.length} يوم نشاط بتوقيت مكة المكرمة (Asia/Riyadh) — الوحدة: نسبة الحضور %.`
          : `Showing last ${displaySeries.length} active days in Makkah Time (Asia/Riyadh) — unit: attendance rate %.`}
      </p>
    </div>
  );
};

interface GroupComparisonChartProps {
  groups: GroupAnalyticsRow[];
  isRtl: boolean;
}

export const GroupComparisonChart: React.FC<GroupComparisonChartProps> = ({ groups, isRtl }) => {
  if (groups.length === 0) {
    return (
      <div className="py-8 text-center text-xs text-slate-500">
        {isRtl ? 'لا توجد مجموعات ضمن النطاق للمقارنة.' : 'No cohorts available for comparison.'}
      </div>
    );
  }

  return (
    <div className="space-y-3.5" role="region" aria-label={isRtl ? 'مقارنة أداء المجموعات' : 'Cohort performance comparison'}>
      {groups.slice(0, 8).map((g) => (
        <div key={g.groupId} className="space-y-1.5 pb-2.5 border-b border-slate-100 last:border-b-0 last:pb-0">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-[#14243A]">{isRtl ? g.nameArabic : g.name}</span>
            <span className="text-[11px] text-slate-500 tabular-nums">
              {g.activeStudentsCount} {isRtl ? 'طالب' : 'students'}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] tabular-nums">
            <div>
              <div className="flex justify-between text-slate-600 mb-0.5">
                <span>{isRtl ? 'الحضور' : 'Attendance'}</span>
                <span className="font-semibold">{g.attendanceRatePct !== null ? `${g.attendanceRatePct}%` : '—'}</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-600 rounded-full"
                  style={{ width: `${g.attendanceRatePct ?? 0}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-slate-600 mb-0.5">
                <span>{isRtl ? 'الاختبارات' : 'Quizzes'}</span>
                <span className="font-semibold">{g.avgQuizScorePct !== null ? `${g.avgQuizScorePct}%` : '—'}</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#356AE6] rounded-full"
                  style={{ width: `${g.avgQuizScorePct ?? 0}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-slate-600 mb-0.5">
                <span>{isRtl ? 'تقدم المقررات' : 'Progress'}</span>
                <span className="font-semibold">{g.avgCourseProgressPct !== null ? `${g.avgCourseProgressPct}%` : '—'}</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#D8B96C] rounded-full"
                  style={{ width: `${g.avgCourseProgressPct ?? 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
