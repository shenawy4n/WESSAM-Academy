/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale } from '../../hooks/useLocale';
import {
  AccessibleStudentOption,
  StudentAcademicRecord,
  fetchAccessibleStudentsForRecords,
  fetchStudentAcademicRecord,
} from './academicRecordsService';
import { AcademicRecordDetailPanel } from './AcademicRecordDetailPanel';
import { Card, CardContent } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { Award, Search, Users } from 'lucide-react';

interface AcademicRecordsViewProps {
  initialStudentId?: string | null;
}

export const AcademicRecordsView: React.FC<AcademicRecordsViewProps> = ({
  initialStudentId = null,
}) => {
  const { isRtl } = useLocale();
  const [students, setStudents] = useState<AccessibleStudentOption[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(initialStudentId);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [studentsError, setStudentsError] = useState<unknown>(null);

  const [record, setRecord] = useState<StudentAcademicRecord | null>(null);
  const [recordLoading, setRecordLoading] = useState(false);
  const [recordError, setRecordError] = useState<unknown>(null);

  // Server-level filters
  const [courseId, setCourseId] = useState('all');
  const [groupId, setGroupId] = useState('all');
  const [academicYear, setAcademicYear] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const loadStudents = useCallback(async () => {
    setStudentsLoading(true);
    setStudentsError(null);
    try {
      const list = await fetchAccessibleStudentsForRecords();
      setStudents(list);
      setSelectedStudentId((prev) => {
        if (initialStudentId && list.some((s) => s.id === initialStudentId)) {
          return initialStudentId;
        }
        if (prev && list.some((s) => s.id === prev)) {
          return prev;
        }
        return list[0]?.id ?? null;
      });
    } catch (err) {
      setStudentsError(err);
    } finally {
      setStudentsLoading(false);
    }
  }, [initialStudentId]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  useEffect(() => {
    if (initialStudentId) {
      setSelectedStudentId(initialStudentId);
    }
  }, [initialStudentId]);

  const loadSelectedRecord = useCallback(async () => {
    if (!selectedStudentId) {
      setRecord(null);
      return;
    }
    setRecordLoading(true);
    setRecordError(null);
    try {
      const data = await fetchStudentAcademicRecord({
        studentId: selectedStudentId,
        courseId,
        groupId,
        academicYear,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
      });
      setRecord(data);
    } catch (err) {
      setRecordError(err);
    } finally {
      setRecordLoading(false);
    }
  }, [selectedStudentId, courseId, groupId, academicYear, dateFrom, dateTo]);

  useEffect(() => {
    loadSelectedRecord();
  }, [loadSelectedRecord]);

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) =>
      [s.fullName, s.fullNameArabic, s.studentNumber || '', s.username || '']
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [students, studentSearch]);

  const handleResetFilters = () => {
    setCourseId('all');
    setGroupId('all');
    setAcademicYear('all');
    setDateFrom('');
    setDateTo('');
  };

  if (studentsLoading) {
    return (
      <div className="py-16 flex justify-center">
        <LoadingSpinner size="lg" label={isRtl ? 'جاري تحميل السجلات الأكاديمية...' : 'Loading academic records...'} />
      </div>
    );
  }

  if (studentsError) {
    return <ErrorState error={studentsError} isRtl={isRtl} onRetry={loadStudents} />;
  }

  if (students.length === 0) {
    return (
      <EmptyState
        icon={<Users className="w-6 h-6" />}
        title={isRtl ? 'لا يوجد طلاب في نطاق صلاحياتك' : 'No authorized students found'}
        description={
          isRtl
            ? 'عند إسناد مجموعات وطلاب إلى مقرراتك ستظهر سجلاتهم الأكاديمية ونتائجهم هنا.'
            : 'Once students are enrolled in your cohorts or courses, their academic records will appear here.'
        }
      />
    );
  }

  return (
    <div className="space-y-5" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Student Selector Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
            <div className="lg:col-span-5">
              <div className="relative">
                <Search
                  className={`w-4 h-4 text-slate-400 absolute top-2.5 ${isRtl ? 'right-3' : 'left-3'}`}
                />
                <input
                  type="text"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder={isRtl ? 'ابحث باسم الطالب أو الرقم الأكاديمي...' : 'Search student by name or ID...'}
                  className={`w-full py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#356AE6] ${
                    isRtl ? 'pr-9 pl-3' : 'pl-9 pr-3'
                  }`}
                />
              </div>
            </div>

            <div className="lg:col-span-7 flex flex-col sm:flex-row sm:items-center gap-2.5">
              <label className="text-xs font-semibold text-slate-700 whitespace-nowrap">
                {isRtl ? 'الطالب المختار:' : 'Selected Student:'}
              </label>
              <select
                value={selectedStudentId || ''}
                onChange={(e) => {
                  setSelectedStudentId(e.target.value);
                  handleResetFilters();
                }}
                className="flex-1 py-2 px-3 text-xs font-medium border border-slate-200 rounded-lg bg-white text-[#14243A]"
              >
                {filteredStudents.map((s) => (
                  <option key={s.id} value={s.id}>
                    {isRtl ? s.fullNameArabic : s.fullName}
                    {s.studentNumber ? ` (${s.studentNumber})` : ''}
                    {s.status && s.status !== 'active' ? ` [${s.status}]` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {recordLoading && !record ? (
        <div className="py-12 flex justify-center">
          <LoadingSpinner size="md" label={isRtl ? 'جاري تحميل السجل...' : 'Loading transcript...'} />
        </div>
      ) : recordError ? (
        <ErrorState error={recordError} isRtl={isRtl} onRetry={loadSelectedRecord} />
      ) : record ? (
        <AcademicRecordDetailPanel
          record={record}
          mode="staff"
          dateFrom={dateFrom}
          dateTo={dateTo}
          academicYear={academicYear}
          courseId={courseId}
          groupId={groupId}
          isRefreshing={recordLoading}
          onServerFilterChange={(patch) => {
            if (patch.dateFrom !== undefined) setDateFrom(patch.dateFrom);
            if (patch.dateTo !== undefined) setDateTo(patch.dateTo);
            if (patch.academicYear !== undefined) setAcademicYear(patch.academicYear);
            if (patch.courseId !== undefined) setCourseId(patch.courseId);
            if (patch.groupId !== undefined) setGroupId(patch.groupId);
          }}
          onResetFilters={handleResetFilters}
        />
      ) : (
        <EmptyState
          icon={<Award className="w-6 h-6" />}
          title={isRtl ? 'اختر طالباً لعرض سجله' : 'Select a student'}
          description={isRtl ? 'اختر طالباً من القائمة أعلاه لاستعراض درجاته وسجله.' : 'Choose a student above to inspect grades and attendance.'}
        />
      )}
    </div>
  );
};
