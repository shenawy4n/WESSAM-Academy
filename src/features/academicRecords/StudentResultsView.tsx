/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../../hooks/useLocale';
import {
  StudentAcademicRecord,
  fetchStudentAcademicRecord,
} from './academicRecordsService';
import { AcademicRecordDetailPanel } from './AcademicRecordDetailPanel';
import { ErrorState } from '../../components/ui/ErrorState';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';

export const StudentResultsView: React.FC = () => {
  const { isRtl } = useLocale();
  const [record, setRecord] = useState<StudentAcademicRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const [courseId, setCourseId] = useState('all');
  const [groupId, setGroupId] = useState('all');
  const [academicYear, setAcademicYear] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const loadOwnRecord = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // studentId omitted intentionally: server RPC locks lookup strictly to auth.uid()
      const data = await fetchStudentAcademicRecord({
        courseId,
        groupId,
        academicYear,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
      });
      setRecord(data);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [courseId, groupId, academicYear, dateFrom, dateTo]);

  useEffect(() => {
    loadOwnRecord();
  }, [loadOwnRecord]);

  const handleResetFilters = () => {
    setCourseId('all');
    setGroupId('all');
    setAcademicYear('all');
    setDateFrom('');
    setDateTo('');
  };

  if (loading && !record) {
    return (
      <div className="py-16 flex justify-center">
        <LoadingSpinner size="lg" label={isRtl ? 'جاري تحميل سجلك الأكاديمي...' : 'Loading your academic record...'} />
      </div>
    );
  }

  if (error) {
    return <ErrorState error={error} isRtl={isRtl} onRetry={loadOwnRecord} />;
  }

  if (!record) return null;

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'}>
      <AcademicRecordDetailPanel
        record={record}
        mode="student"
        dateFrom={dateFrom}
        dateTo={dateTo}
        academicYear={academicYear}
        courseId={courseId}
        groupId={groupId}
        isRefreshing={loading}
        onServerFilterChange={(patch) => {
          if (patch.dateFrom !== undefined) setDateFrom(patch.dateFrom);
          if (patch.dateTo !== undefined) setDateTo(patch.dateTo);
          if (patch.academicYear !== undefined) setAcademicYear(patch.academicYear);
          if (patch.courseId !== undefined) setCourseId(patch.courseId);
          if (patch.groupId !== undefined) setGroupId(patch.groupId);
        }}
        onResetFilters={handleResetFilters}
      />
    </div>
  );
};
