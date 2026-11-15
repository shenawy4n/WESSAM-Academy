/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { useLocale } from '../../hooks/useLocale';
import {
  StudentAcademicRecord,
  TranscriptEntryType,
  TranscriptFilterOptions,
  UnifiedTranscriptEntry,
  buildUnifiedTranscript,
  filterAndSortTranscript,
  formatRecordTimestampRiyadh,
  paginateArray,
} from './academicRecordsService';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { BrandLogo } from '../../components/shared/BrandLogo';
import {
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileSpreadsheet,
  Filter,
  Printer,
  RotateCcw,
  Search,
  UserCheck,
  XCircle,
} from 'lucide-react';

interface AcademicRecordDetailPanelProps {
  record: StudentAcademicRecord;
  mode: 'staff' | 'student';
  dateFrom: string;
  dateTo: string;
  academicYear: string;
  courseId: string;
  groupId: string;
  onServerFilterChange: (patch: {
    dateFrom?: string;
    dateTo?: string;
    academicYear?: string;
    courseId?: string;
    groupId?: string;
  }) => void;
  onResetFilters: () => void;
  isRefreshing?: boolean;
}

type RecordSectionTab = 'transcript' | 'quizzes' | 'assignments' | 'courses' | 'attendance';

export const AcademicRecordDetailPanel: React.FC<AcademicRecordDetailPanelProps> = ({
  record,
  mode,
  dateFrom,
  dateTo,
  academicYear,
  courseId,
  groupId,
  onServerFilterChange,
  onResetFilters,
  isRefreshing = false,
}) => {
  const { isRtl, lang } = useLocale();
  const [activeTab, setActiveTab] = useState<RecordSectionTab>('transcript');
  const [search, setSearch] = useState('');
  const [assessmentType, setAssessmentType] = useState<'all' | TranscriptEntryType>('all');
  const [sortBy, setSortBy] = useState<TranscriptFilterOptions['sortBy']>('date_desc');
  const [page, setPage] = useState(1);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  const pageSize = 12;

  const unifiedEntries = useMemo(() => buildUnifiedTranscript(record), [record]);

  const filteredEntries = useMemo(
    () =>
      filterAndSortTranscript(unifiedEntries, {
        search,
        assessmentType,
        courseId: 'all', // already server-filtered or refined locally
        groupId: 'all',
        academicYear: 'all',
        dateFrom,
        dateTo,
        sortBy,
      }),
    [unifiedEntries, search, assessmentType, dateFrom, dateTo, sortBy]
  );

  const paginatedTranscript = useMemo(
    () => paginateArray(filteredEntries, page, pageSize),
    [filteredEntries, page]
  );

  const availableAcademicYears = useMemo(() => {
    const years = new Set<string>();
    for (const g of record.groups) {
      if (g.academicYear) years.add(g.academicYear);
    }
    return Array.from(years).sort().reverse();
  }, [record.groups]);

  const pctDisplay = (val: number | null | undefined, emptyLabel?: string) => {
    if (val === null || val === undefined) {
      return emptyLabel || (isRtl ? 'غير متاح' : 'N/A');
    }
    return `${val}%`;
  };

  const renderEntryTypeLabel = (type: TranscriptEntryType) => {
    if (type === 'quiz') return isRtl ? 'اختبار' : 'Quiz';
    if (type === 'assignment') return isRtl ? 'واجب' : 'Assignment';
    return isRtl ? 'حضور حصة' : 'Session Attendance';
  };

  const renderEntryStatus = (entry: UnifiedTranscriptEntry) => {
    if (entry.entryType === 'quiz') {
      if (entry.statusKey === 'in_progress') {
        return <span className="text-amber-700 font-medium">{isRtl ? 'قيد التنفيذ' : 'In Progress'}</span>;
      }
      if (!entry.isReleased || entry.percentageScore === null) {
        return <span className="text-slate-500 font-medium">{isRtl ? 'بانتظار إعلان النتيجة' : 'Pending Review'}</span>;
      }
      return entry.isPassed ? (
        <span className="text-emerald-700 font-semibold">{isRtl ? 'ناجح' : 'Passed'}</span>
      ) : (
        <span className="text-rose-700 font-semibold">{isRtl ? 'دون حد النجاح' : 'Below Pass'}</span>
      );
    }

    if (entry.entryType === 'assignment') {
      if (entry.statusKey === 'returned_for_revision') {
        return <span className="text-amber-700 font-semibold">{isRtl ? 'مُعاد للمراجعة' : 'Revision Requested'}</span>;
      }
      if (entry.percentageScore === null) {
        return (
          <span className="text-slate-600 font-medium">
            {entry.isReleased === false && mode === 'student'
              ? isRtl
                ? 'مُسلَّم (بانتظار نشر الدرجة)'
                : 'Submitted (Grade Pending)'
              : isRtl
              ? 'بانتظار التصحيح'
              : 'Pending Grading'}
          </span>
        );
      }
      return (
        <span className="text-emerald-700 font-semibold">
          {isRtl ? 'مُقيَّم' : 'Graded'}
          {entry.isLate ? (isRtl ? ' · متأخر' : ' · Late') : ''}
        </span>
      );
    }

    // Attendance
    if (entry.statusKey === 'present') {
      return <span className="text-emerald-700 font-semibold">{isRtl ? 'حاضر' : 'Present'}</span>;
    }
    if (entry.statusKey === 'late') {
      return <span className="text-amber-700 font-semibold">{isRtl ? 'متأخر' : 'Late'}</span>;
    }
    if (entry.statusKey === 'excused') {
      return <span className="text-blue-700 font-semibold">{isRtl ? 'بعذر' : 'Excused'}</span>;
    }
    return <span className="text-rose-700 font-semibold">{isRtl ? 'غائب' : 'Absent'}</span>;
  };

  const handlePrintReport = () => {
    setIsPrintModalOpen(true);
    setTimeout(() => {
      window.print();
    }, 150);
  };

  const tabItems: { id: RecordSectionTab; label: string; count?: number }[] = [
    {
      id: 'transcript',
      label: isRtl ? 'السجل الموحّد' : 'Transcript',
      count: filteredEntries.length,
    },
    {
      id: 'quizzes',
      label: isRtl ? 'الاختبارات' : 'Quizzes',
      count: record.quizzes.length,
    },
    {
      id: 'assignments',
      label: isRtl ? 'الواجبات' : 'Assignments',
      count: record.assignments.length,
    },
    {
      id: 'courses',
      label: isRtl ? 'تقدم المقررات' : 'Course Progress',
      count: record.courses.length,
    },
    {
      id: 'attendance',
      label: isRtl ? 'الحضور' : 'Attendance',
      count: record.attendance.length,
    },
  ];

  return (
    <div className="space-y-5">
      {/* Student Profile Header Strip */}
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-lg font-bold text-[#14243A]">
                  {isRtl ? record.student.fullNameArabic : record.student.fullName}
                </h2>
                <span className="text-xs font-medium text-slate-500">
                  {isRtl ? record.student.fullName : record.student.fullNameArabic}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                {record.student.studentNumber && (
                  <span className="font-mono font-medium text-slate-700 tabular-nums">
                    {isRtl ? 'الرقم الأكاديمي:' : 'ID:'} {record.student.studentNumber}
                  </span>
                )}
                {record.student.username && (
                  <span className="font-mono text-[#356AE6]">@{record.student.username}</span>
                )}
                <span aria-hidden="true">·</span>
                <span>
                  {record.groups.length > 0
                    ? record.groups
                        .map((g) =>
                          g.academicYear
                            ? `${isRtl ? g.nameArabic : g.name} (${g.academicYear})`
                            : isRtl
                            ? g.nameArabic
                            : g.name
                        )
                        .join(' , ')
                    : isRtl
                    ? 'غير مسجل في مجموعة'
                    : 'No group assigned'}
                </span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">
                  {isRtl ? 'آخر نشاط:' : 'Last activity:'}{' '}
                  {formatRecordTimestampRiyadh(record.summary.lastLearningActivityAt, lang)}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <span className="text-[11px] text-slate-500 font-medium px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 whitespace-nowrap">
                {isRtl ? 'توقيت مكة المكرمة (Asia/Riyadh)' : 'Makkah Time (Asia/Riyadh)'}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={handlePrintReport}
                icon={<Printer className="w-3.5 h-3.5" />}
                className="whitespace-nowrap"
              >
                {isRtl ? 'تقرير أكاديمي للطباعة' : 'Printable Academic Report'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary KPI Grid (Single-Level Cards, tabular-nums) */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{isRtl ? 'المعدل العام الموثق' : 'Verified Average'}</span>
            <Award className="w-4 h-4 text-[#D8B96C]" />
          </div>
          <div className="text-2xl font-bold text-[#14243A] mt-2 tabular-nums">
            {pctDisplay(record.summary.overallAcademicAveragePct)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 tabular-nums">
            {record.summary.passingThreshold !== null
              ? isRtl
                ? `حد النجاح الافتراضي: ${record.summary.passingThreshold}%`
                : `Default pass: ${record.summary.passingThreshold}%`
              : isRtl
              ? 'مبني على النتائج المعتمدة'
              : 'Based on released grades'}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{isRtl ? 'متوسط الاختبارات' : 'Quizzes Average'}</span>
            <FileSpreadsheet className="w-4 h-4 text-[#356AE6]" />
          </div>
          <div className="text-2xl font-bold text-[#14243A] mt-2 tabular-nums">
            {pctDisplay(record.summary.avgQuizPercentage)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 tabular-nums">
            {isRtl
              ? `${record.summary.gradedQuizzesCount} مقيم من ${record.summary.quizAttemptsCount} محاولة`
              : `${record.summary.gradedQuizzesCount} graded / ${record.summary.quizAttemptsCount} attempts`}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{isRtl ? 'متوسط الواجبات' : 'Assignments Average'}</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-[#14243A] mt-2 tabular-nums">
            {pctDisplay(record.summary.avgAssignmentPercentage)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 tabular-nums">
            {isRtl
              ? `${record.summary.gradedAssignmentsCount} مصحح من ${record.summary.assignmentSubmissionsCount} تسليم`
              : `${record.summary.gradedAssignmentsCount} graded / ${record.summary.assignmentSubmissionsCount} submitted`}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{isRtl ? 'نسبة الحضور' : 'Attendance Rate'}</span>
            <UserCheck className="w-4 h-4 text-[#356AE6]" />
          </div>
          <div className="text-2xl font-bold text-[#14243A] mt-2 tabular-nums">
            {pctDisplay(record.summary.attendanceRatePct)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 tabular-nums">
            {isRtl
              ? `${record.attendanceSummary.present} حاضر · ${record.attendanceSummary.late} متأخر · ${record.attendanceSummary.absent} غائب`
              : `${record.attendanceSummary.present} present · ${record.attendanceSummary.late} late · ${record.attendanceSummary.absent} absent`}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{isRtl ? 'إنجاز الدروس' : 'Lesson Completion'}</span>
            <BookOpen className="w-4 h-4 text-[#14243A]" />
          </div>
          <div className="text-2xl font-bold text-[#14243A] mt-2 tabular-nums">
            {pctDisplay(record.summary.courseProgressPct)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 tabular-nums">
            {isRtl
              ? `${record.summary.completedLessons} من ${record.summary.totalLessons} درس منشور`
              : `${record.summary.completedLessons} / ${record.summary.totalLessons} published lessons`}
          </div>
        </div>
      </div>

      {/* Filters & Section Tabs */}
      <Card>
        <div className="p-4 border-b border-slate-100 space-y-3">
          {/* Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
              {tabItems.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id);
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    activeTab === tab.id
                      ? 'bg-white text-[#14243A] shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                  {typeof tab.count === 'number' ? (
                    <span className="mx-1 text-[11px] text-slate-400 tabular-nums">({tab.count})</span>
                  ) : null}
                </button>
              ))}
            </div>

            {isRefreshing && (
              <span className="text-xs text-[#356AE6] font-medium">
                {isRtl ? 'جاري التحديث...' : 'Refreshing...'}
              </span>
            )}
          </div>

          {/* Filter Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2.5 pt-1">
            <div className="relative lg:col-span-2">
              <Search
                className={`w-3.5 h-3.5 text-slate-400 absolute top-2.5 ${isRtl ? 'right-3' : 'left-3'}`}
              />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder={isRtl ? 'ابحث في عنوان التقييم أو الملاحظات...' : 'Search assessment or feedback...'}
                className={`w-full py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#356AE6] ${
                  isRtl ? 'pr-8 pl-3' : 'pl-8 pr-3'
                }`}
              />
            </div>

            <select
              value={courseId}
              onChange={(e) => onServerFilterChange({ courseId: e.target.value })}
              aria-label={isRtl ? 'تصفية حسب المقرر' : 'Filter by course'}
              className="py-1.5 px-2.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
            >
              <option value="all">{isRtl ? 'كل المقررات' : 'All Courses'}</option>
              {record.courses.map((c) => (
                <option key={c.courseId} value={c.courseId}>
                  {isRtl ? c.titleArabic : c.title}
                </option>
              ))}
            </select>

            <select
              value={groupId}
              onChange={(e) => onServerFilterChange({ groupId: e.target.value })}
              aria-label={isRtl ? 'تصفية حسب المجموعة' : 'Filter by group'}
              className="py-1.5 px-2.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
            >
              <option value="all">{isRtl ? 'كل المجموعات' : 'All Groups'}</option>
              {record.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {isRtl ? g.nameArabic : g.name}
                </option>
              ))}
            </select>

            <select
              value={academicYear}
              onChange={(e) => onServerFilterChange({ academicYear: e.target.value })}
              aria-label={isRtl ? 'العام الدراسي' : 'Academic Year'}
              className="py-1.5 px-2.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
            >
              <option value="all">{isRtl ? 'كل الأعوام الدراسية' : 'All Academic Years'}</option>
              {availableAcademicYears.map((yr) => (
                <option key={yr} value={yr}>
                  {yr}
                </option>
              ))}
            </select>

            {activeTab === 'transcript' ? (
              <select
                value={assessmentType}
                onChange={(e) => {
                  setAssessmentType(e.target.value as 'all' | TranscriptEntryType);
                  setPage(1);
                }}
                aria-label={isRtl ? 'نوع السجل' : 'Entry Type'}
                className="py-1.5 px-2.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
              >
                <option value="all">{isRtl ? 'كل الأنواع' : 'All Types'}</option>
                <option value="quiz">{isRtl ? 'اختبارات' : 'Quizzes'}</option>
                <option value="assignment">{isRtl ? 'واجبات' : 'Assignments'}</option>
                <option value="attendance">{isRtl ? 'حضور' : 'Attendance'}</option>
              </select>
            ) : (
              <div className="hidden lg:block" />
            )}

            <div className="flex items-center gap-1.5">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as TranscriptFilterOptions['sortBy'])}
                aria-label={isRtl ? 'الترتيب' : 'Sort order'}
                className="w-full py-1.5 px-2.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
              >
                <option value="date_desc">{isRtl ? 'الأحدث أولاً' : 'Newest First'}</option>
                <option value="date_asc">{isRtl ? 'الأقدم أولاً' : 'Oldest First'}</option>
                <option value="score_desc">{isRtl ? 'الأعلى درجة' : 'Highest Score'}</option>
                <option value="score_asc">{isRtl ? 'الأقل درجة' : 'Lowest Score'}</option>
              </select>
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setAssessmentType('all');
                  setSortBy('date_desc');
                  setPage(1);
                  onResetFilters();
                }}
                title={isRtl ? 'إعادة ضبط الفلاتر' : 'Reset filters'}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800 cursor-pointer shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Riyadh Date Window Row */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
              <Calendar className="w-3.5 h-3.5 text-[#356AE6]" />
              {isRtl ? 'النطاق الزمني (توقيت مكة المكرمة Asia/Riyadh):' : 'Date Range (Asia/Riyadh):'}
            </span>
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-slate-500">{isRtl ? 'من' : 'From'}</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => onServerFilterChange({ dateFrom: e.target.value })}
                className="py-1 px-2 text-xs border border-slate-200 rounded-md bg-white tabular-nums"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-slate-500">{isRtl ? 'إلى' : 'To'}</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => onServerFilterChange({ dateTo: e.target.value })}
                className="py-1 px-2 text-xs border border-slate-200 rounded-md bg-white tabular-nums"
              />
            </div>
          </div>
        </div>

        {/* TAB 1: UNIFIED TRANSCRIPT */}
        {activeTab === 'transcript' && (
          <div>
            {paginatedTranscript.items.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={<Filter className="w-5 h-5" />}
                  title={isRtl ? 'لا توجد قيود مطابقة في السجل' : 'No matching transcript entries'}
                  description={
                    isRtl
                      ? 'لا توجد اختبارات أو واجبات أو سجلات حضور ضمن المعايير المحددة حالياً.'
                      : 'No quizzes, assignments, or attendance events match the current filters.'
                  }
                />
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-start">
                    <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600">
                      <tr>
                        <th className="py-3 px-4 font-semibold text-start">{isRtl ? 'البند' : 'Assessment / Item'}</th>
                        <th className="py-3 px-4 font-semibold text-start">{isRtl ? 'النوع' : 'Type'}</th>
                        <th className="py-3 px-4 font-semibold text-start">{isRtl ? 'المقرر' : 'Course'}</th>
                        <th className="py-3 px-4 font-semibold text-start">{isRtl ? 'التاريخ (الرياض)' : 'Date (Riyadh)'}</th>
                        <th className="py-3 px-4 font-semibold text-start">{isRtl ? 'النتيجة' : 'Score'}</th>
                        <th className="py-3 px-4 font-semibold text-start">{isRtl ? 'الحالة' : 'Status'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedTranscript.items.map((entry) => (
                        <tr key={entry.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-semibold text-[#14243A]">
                              {isRtl ? entry.titleArabic : entry.title}
                            </div>
                            {entry.feedback && (
                              <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                                {entry.feedback}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                            {renderEntryTypeLabel(entry.entryType)}
                            {entry.attemptNumber ? ` · #${entry.attemptNumber}` : ''}
                          </td>
                          <td className="py-3 px-4 text-slate-600">
                            {entry.courseTitle
                              ? isRtl
                                ? entry.courseTitleArabic || entry.courseTitle
                                : entry.courseTitle
                              : '—'}
                          </td>
                          <td className="py-3 px-4 text-slate-500 tabular-nums whitespace-nowrap">
                            {formatRecordTimestampRiyadh(entry.eventAt, lang)}
                          </td>
                          <td className="py-3 px-4 tabular-nums whitespace-nowrap">
                            {entry.percentageScore !== null ? (
                              <div>
                                <span className="font-bold text-[#14243A]">{entry.percentageScore}%</span>
                                {entry.rawScoreDisplay && (
                                  <span className="text-[11px] text-slate-500 mx-1.5">
                                    ({entry.rawScoreDisplay})
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">{renderEntryStatus(entry)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {paginatedTranscript.totalPages > 1 && (
                  <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <span className="tabular-nums">
                      {isRtl
                        ? `صفحة ${paginatedTranscript.currentPage} من ${paginatedTranscript.totalPages} (${paginatedTranscript.totalCount} سجل)`
                        : `Page ${paginatedTranscript.currentPage} of ${paginatedTranscript.totalPages} (${paginatedTranscript.totalCount} entries)`}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={paginatedTranscript.currentPage === 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        className="p-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                      >
                        {isRtl ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                      </button>
                      <button
                        type="button"
                        disabled={paginatedTranscript.currentPage === paginatedTranscript.totalPages}
                        onClick={() => setPage((p) => Math.min(paginatedTranscript.totalPages, p + 1))}
                        className="p-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                      >
                        {isRtl ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* TAB 2: QUIZZES */}
        {activeTab === 'quizzes' && (
          <div className="p-4">
            {record.quizzes.length === 0 ? (
              <EmptyState
                icon={<Award className="w-5 h-5" />}
                title={isRtl ? 'لا توجد محاولات اختبارات' : 'No quiz attempts recorded'}
                description={
                  isRtl
                    ? 'لم يقم الطالب بأداء اختبارات ضمن الفلاتر المحددة.'
                    : 'No quiz attempts match the selected filters.'
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-start">
                  <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2.5 px-3 text-start">{isRtl ? 'الاختبار' : 'Quiz'}</th>
                      <th className="py-2.5 px-3 text-start">{isRtl ? 'المحاولة' : 'Attempt'}</th>
                      <th className="py-2.5 px-3 text-start">{isRtl ? 'الدرجة' : 'Score'}</th>
                      <th className="py-2.5 px-3 text-start">{isRtl ? 'حد النجاح' : 'Passing'}</th>
                      <th className="py-2.5 px-3 text-start">{isRtl ? 'النتيجة' : 'Outcome'}</th>
                      <th className="py-2.5 px-3 text-start">{isRtl ? 'التاريخ' : 'Submitted (Riyadh)'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {record.quizzes.map((q) => (
                      <tr key={q.id} className="hover:bg-slate-50/60">
                        <td className="py-3 px-3">
                          <div className="font-semibold text-[#14243A]">
                            {isRtl ? q.titleArabic : q.title}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {q.courseTitle ? (isRtl ? q.courseTitleArabic || q.courseTitle : q.courseTitle) : '—'}
                          </div>
                        </td>
                        <td className="py-3 px-3 tabular-nums">#{q.attemptNumber}</td>
                        <td className="py-3 px-3 tabular-nums">
                          {q.isResultReleased && q.percentageScore !== null ? (
                            <span className="font-bold text-[#14243A]">
                              {q.percentageScore}%{' '}
                              <span className="text-[11px] font-normal text-slate-500">
                                ({q.pointsScored}/{q.totalPointsPossible})
                              </span>
                            </span>
                          ) : (
                            <span className="text-slate-400">
                              {q.status === 'in_progress'
                                ? isRtl
                                  ? 'قيد الحل'
                                  : 'In Progress'
                                : isRtl
                                ? 'بانتظار النتيجة'
                                : 'Pending Release'}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 tabular-nums text-slate-600">
                          {q.passingScore !== null ? `${q.passingScore}%` : '—'}
                        </td>
                        <td className="py-3 px-3">
                          {q.isResultReleased && q.isPassed !== null ? (
                            q.isPassed ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                {isRtl ? 'ناجح' : 'Passed'}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-rose-700 font-semibold">
                                <XCircle className="w-3.5 h-3.5" />
                                {isRtl ? 'لم يجتز' : 'Not Passed'}
                              </span>
                            )
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                        <td className="py-3 px-3 tabular-nums text-slate-500 whitespace-nowrap">
                          {formatRecordTimestampRiyadh(q.submittedAt || q.startedAt, lang)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: ASSIGNMENTS */}
        {activeTab === 'assignments' && (
          <div className="p-4">
            {record.assignments.length === 0 ? (
              <EmptyState
                icon={<FileSpreadsheet className="w-5 h-5" />}
                title={isRtl ? 'لا توجد تسليمات واجبات' : 'No assignment submissions'}
                description={
                  isRtl
                    ? 'لم يتم العثور على تسليمات واجبات ضمن الفلاتر المحددة.'
                    : 'No assignment submissions found for the selected filters.'
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-start">
                  <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2.5 px-3 text-start">{isRtl ? 'الواجب' : 'Assignment'}</th>
                      <th className="py-2.5 px-3 text-start">{isRtl ? 'الحالة' : 'Status'}</th>
                      <th className="py-2.5 px-3 text-start">{isRtl ? 'الدرجة' : 'Grade'}</th>
                      <th className="py-2.5 px-3 text-start">{isRtl ? 'ملاحظات المعلم' : 'Teacher Feedback'}</th>
                      <th className="py-2.5 px-3 text-start">{isRtl ? 'تاريخ التسليم' : 'Submitted (Riyadh)'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {record.assignments.map((a) => (
                      <tr key={a.id} className="hover:bg-slate-50/60">
                        <td className="py-3 px-3">
                          <div className="font-semibold text-[#14243A]">
                            {isRtl ? a.titleArabic : a.title}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {a.courseTitle ? (isRtl ? a.courseTitleArabic || a.courseTitle : a.courseTitle) : '—'}
                            {a.isLate ? (isRtl ? ' · تسليم متأخر' : ' · Late submission') : ''}
                          </div>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          {a.status === 'graded'
                            ? isRtl
                              ? 'مصحح'
                              : 'Graded'
                            : a.status === 'returned_for_revision'
                            ? isRtl
                              ? 'مُعاد للتعديل'
                              : 'Returned for Revision'
                            : isRtl
                            ? 'تم التسليم'
                            : 'Submitted'}
                        </td>
                        <td className="py-3 px-3 tabular-nums whitespace-nowrap">
                          {a.score !== null ? (
                            <span className="font-bold text-[#14243A]">
                              {a.maxScore !== null ? `${a.score} / ${a.maxScore}` : a.score}{' '}
                              {a.percentageScore !== null && (
                                <span className="text-slate-500 font-normal">({a.percentageScore}%)</span>
                              )}
                            </span>
                          ) : (
                            <span className="text-slate-400">
                              {mode === 'student' && !a.isGradeReleased
                                ? isRtl
                                  ? 'بانتظار الإعلان'
                                  : 'Pending Release'
                                : isRtl
                                ? 'غير مصحح'
                                : 'Ungraded'}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-slate-600 max-w-xs">
                          {a.teacherFeedback || '—'}
                        </td>
                        <td className="py-3 px-3 tabular-nums text-slate-500 whitespace-nowrap">
                          {formatRecordTimestampRiyadh(a.submittedAt, lang)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: COURSE & LESSON PROGRESS */}
        {activeTab === 'courses' && (
          <div className="p-4 space-y-3">
            {record.courses.length === 0 ? (
              <EmptyState
                icon={<BookOpen className="w-5 h-5" />}
                title={isRtl ? 'لا توجد مقررات مسندة' : 'No assigned courses'}
                description={
                  isRtl
                    ? 'لم يتم إسناد مقررات لمجموعة الطالب ضمن الفلاتر المحددة.'
                    : 'No courses are assigned to this student for the selected filters.'
                }
              />
            ) : (
              record.courses.map((c) => (
                <div key={c.courseId} className="p-4 rounded-xl border border-slate-200 bg-white">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-bold text-[#14243A]">
                        {isRtl ? c.titleArabic : c.title}
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                        {c.completedLessons} / {c.totalLessons}{' '}
                        {isRtl ? 'درس مكتمل' : 'lessons completed'} · {c.pendingLessons}{' '}
                        {isRtl ? 'درس متبقٍ' : 'pending'}
                      </p>
                    </div>
                    <div className="text-end">
                      <span className="text-base font-bold text-[#356AE6] tabular-nums">
                        {pctDisplay(c.progressPercentage)}
                      </span>
                      <div className="text-[11px] text-slate-400 tabular-nums">
                        {isRtl ? 'آخر دخول:' : 'Last accessed:'}{' '}
                        {formatRecordTimestampRiyadh(c.lastAccessedAt, lang)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#356AE6] rounded-full transition-all"
                      style={{ width: `${Math.min(100, Math.max(0, c.progressPercentage ?? 0))}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 5: ATTENDANCE */}
        {activeTab === 'attendance' && (
          <div className="p-4">
            {record.attendance.length === 0 ? (
              <EmptyState
                icon={<Clock className="w-5 h-5" />}
                title={isRtl ? 'لا توجد سجلات حضور' : 'No attendance records'}
                description={
                  isRtl
                    ? 'لم تُسجَّل حصص حضور للطالب ضمن النطاق المحدد.'
                    : 'No session attendance entries found for the selected criteria.'
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-start">
                  <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2.5 px-3 text-start">{isRtl ? 'الحصة المباشرة' : 'Live Session'}</th>
                      <th className="py-2.5 px-3 text-start">{isRtl ? 'موعد الحصة (الرياض)' : 'Session Time (Riyadh)'}</th>
                      <th className="py-2.5 px-3 text-start">{isRtl ? 'حالة الحضور' : 'Status'}</th>
                      <th className="py-2.5 px-3 text-start">{isRtl ? 'ملاحظات' : 'Notes'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {record.attendance.map((att) => (
                      <tr key={att.id} className="hover:bg-slate-50/60">
                        <td className="py-3 px-3 font-semibold text-[#14243A]">
                          {isRtl ? att.sessionTitleArabic || att.sessionTitle : att.sessionTitle}
                        </td>
                        <td className="py-3 px-3 tabular-nums text-slate-500 whitespace-nowrap">
                          {formatRecordTimestampRiyadh(att.startTime, lang)}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap font-semibold">
                          {att.status === 'present' && (
                            <span className="text-emerald-700">{isRtl ? 'حاضر' : 'Present'}</span>
                          )}
                          {att.status === 'late' && (
                            <span className="text-amber-700">{isRtl ? 'متأخر' : 'Late'}</span>
                          )}
                          {att.status === 'excused' && (
                            <span className="text-blue-700">{isRtl ? 'بعذر' : 'Excused'}</span>
                          )}
                          {att.status === 'absent' && (
                            <span className="text-rose-700">{isRtl ? 'غائب' : 'Absent'}</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-slate-600">{att.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Printable Academic Report Preview Modal */}
      <Modal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        title={isRtl ? 'التقرير الأكاديمي الرسمي' : 'Official Academic Transcript'}
        subtitle={isRtl ? 'توقيت مكة المكرمة (Asia/Riyadh)' : 'Makkah Time (Asia/Riyadh)'}
        maxWidth="2xl"
      >
        <div id="printable-academic-report" className="space-y-5 text-xs text-slate-800" dir={isRtl ? 'rtl' : 'ltr'}>
          <div className="flex items-start justify-between border-b-2 border-[#14243A] pb-4">
            <BrandLogo size="md" />
            <div className="text-end">
              <div className="text-sm font-bold text-[#14243A]">
                {isRtl ? 'كشف السجل الأكاديمي والنتائج' : 'Academic Record & Transcript'}
              </div>
              <div className="text-[11px] text-slate-500 tabular-nums mt-0.5">
                {isRtl ? 'تاريخ الإصدار:' : 'Issued:'}{' '}
                {formatRecordTimestampRiyadh(new Date().toISOString(), lang)}
              </div>
              <div className="text-[11px] text-slate-500">
                {isRtl ? 'توقيت مكة المكرمة (Asia/Riyadh)' : 'Asia/Riyadh'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-lg border border-slate-200">
            <div>
              <span className="text-slate-500 block">{isRtl ? 'اسم الطالب' : 'Student Name'}</span>
              <span className="font-bold text-[#14243A]">
                {isRtl ? record.student.fullNameArabic : record.student.fullName}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">{isRtl ? 'الرقم الأكاديمي' : 'Student ID'}</span>
              <span className="font-mono font-semibold tabular-nums">
                {record.student.studentNumber || '—'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">{isRtl ? 'المعدل العام' : 'Verified Average'}</span>
              <span className="font-bold text-[#356AE6] tabular-nums">
                {pctDisplay(record.summary.overallAcademicAveragePct)}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">{isRtl ? 'نسبة الحضور' : 'Attendance'}</span>
              <span className="font-bold text-[#14243A] tabular-nums">
                {pctDisplay(record.summary.attendanceRatePct)}
              </span>
            </div>
          </div>

          <div>
            <h4 className="font-bold text-[#14243A] mb-2">
              {isRtl ? 'ملخص المقررات والتقدم' : 'Course Progress Summary'}
            </h4>
            <table className="w-full border border-slate-200 text-xs">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  <th className="p-2 text-start border-b border-slate-200">{isRtl ? 'المقرر' : 'Course'}</th>
                  <th className="p-2 text-start border-b border-slate-200">{isRtl ? 'الدروس المكتملة' : 'Completed'}</th>
                  <th className="p-2 text-start border-b border-slate-200">{isRtl ? 'نسبة الإنجاز' : 'Completion'}</th>
                </tr>
              </thead>
              <tbody>
                {record.courses.map((c) => (
                  <tr key={c.courseId} className="border-b border-slate-100">
                    <td className="p-2 font-medium">{isRtl ? c.titleArabic : c.title}</td>
                    <td className="p-2 tabular-nums">
                      {c.completedLessons} / {c.totalLessons}
                    </td>
                    <td className="p-2 tabular-nums">{pctDisplay(c.progressPercentage)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <h4 className="font-bold text-[#14243A] mb-2">
              {isRtl ? 'سجل التقييمات والنتائج المعلنة' : 'Graded Assessments & Results'}
            </h4>
            <table className="w-full border border-slate-200 text-xs">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  <th className="p-2 text-start border-b border-slate-200">{isRtl ? 'التقييم' : 'Assessment'}</th>
                  <th className="p-2 text-start border-b border-slate-200">{isRtl ? 'النوع' : 'Type'}</th>
                  <th className="p-2 text-start border-b border-slate-200">{isRtl ? 'النسبة' : 'Score'}</th>
                  <th className="p-2 text-start border-b border-slate-200">{isRtl ? 'التاريخ' : 'Date'}</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries
                  .filter((e) => e.entryType !== 'attendance')
                  .slice(0, 40)
                  .map((e) => (
                    <tr key={e.id} className="border-b border-slate-100">
                      <td className="p-2 font-medium">{isRtl ? e.titleArabic : e.title}</td>
                      <td className="p-2">{renderEntryTypeLabel(e.entryType)}</td>
                      <td className="p-2 tabular-nums">
                        {e.percentageScore !== null ? `${e.percentageScore}% (${e.rawScoreDisplay || ''})` : '—'}
                      </td>
                      <td className="p-2 tabular-nums">{formatRecordTimestampRiyadh(e.eventAt, lang)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2 print:hidden">
            <Button variant="outline" size="sm" onClick={() => setIsPrintModalOpen(false)}>
              {isRtl ? 'إغلاق' : 'Close'}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => window.print()}
              icon={<Printer className="w-3.5 h-3.5" />}
            >
              {isRtl ? 'طباعة الآن' : 'Print Now'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
