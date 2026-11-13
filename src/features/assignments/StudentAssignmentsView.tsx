/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  FileText,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Search,
  BookOpen,
  ArrowRight,
} from 'lucide-react';
import { AssignmentRecord, SubmissionRecord } from './types';
import { fetchStudentAssignments } from './assignmentService';
import { formatAssignmentDateTime, getAssignmentDeadlineStatus } from './assignmentUtils';
import { StudentSubmissionModal } from './StudentSubmissionModal';

export const StudentAssignmentsView: React.FC = () => {
  const [assignments, setAssignments] = useState<AssignmentRecord[]>([]);
  const [submissions, setSubmissions] = useState<Record<string, SubmissionRecord[]>>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pending' | 'submitted' | 'graded'>('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAssignment, setSelectedAssignment] = useState<AssignmentRecord | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const data = await fetchStudentAssignments();
      setAssignments(data.assignments);
      setSubmissions(data.mySubmissions);
    } catch (err: any) {
      console.error('Failed to load student assignments:', err);
      setLoadError(err.message || 'فشل تحميل الواجبات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Categorize assignments
  const pendingAssignments: AssignmentRecord[] = [];
  const submittedAssignments: AssignmentRecord[] = [];
  const gradedAssignments: AssignmentRecord[] = [];

  for (const a of assignments) {
    const subs = submissions[a.id] || [];
    const latest = subs.length > 0 ? subs[0] : null;

    if (!latest) {
      pendingAssignments.push(a);
    } else if (latest.status === 'returned_for_revision') {
      pendingAssignments.push(a);
    } else if (latest.isGradeReleased && latest.score !== null && latest.score !== undefined) {
      gradedAssignments.push(a);
    } else {
      submittedAssignments.push(a);
    }
  }

  // Active list based on tab
  const currentList =
    activeTab === 'pending'
      ? pendingAssignments
      : activeTab === 'submitted'
      ? submittedAssignments
      : gradedAssignments;

  const filteredList = currentList.filter((a) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      a.title.toLowerCase().includes(term) ||
      a.titleArabic.toLowerCase().includes(term) ||
      (a.course?.title && a.course.title.toLowerCase().includes(term))
    );
  });

  return (
    <div dir="rtl" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-6 h-6 text-blue-600" />
            <span>واجباتي والتطبيقات المنزلية</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            متابعة المهام المطلوبة، رفع الحلول والملفات، ومراجعة تصحيحات وملاحظات الأستاذ وسام
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-xs font-semibold">
          <Clock className="w-4 h-4 text-blue-600" />
          <span>توقيت مكة المكرمة (Asia/Riyadh)</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-2 text-xs font-bold">
        <button
          onClick={() => setActiveTab('pending')}
          className={`py-3 px-4 border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
            activeTab === 'pending'
              ? 'border-blue-600 text-blue-700 bg-blue-50/50 rounded-t-xl'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>مطلوب تسليمه</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-100 text-amber-800 border border-amber-200">
            {pendingAssignments.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('submitted')}
          className={`py-3 px-4 border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
            activeTab === 'submitted'
              ? 'border-blue-600 text-blue-700 bg-blue-50/50 rounded-t-xl'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>قيد التصحيح والمراجعة</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-200 text-slate-700">
            {submittedAssignments.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('graded')}
          className={`py-3 px-4 border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
            activeTab === 'graded'
              ? 'border-blue-600 text-blue-700 bg-blue-50/50 rounded-t-xl'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>الواجبات المصححة والدرجات</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-200">
            {gradedAssignments.length}
          </span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="بحث في أسماء الواجبات..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pr-9 pl-4 py-2.5 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
        />
      </div>

      {loadError && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      {/* Assignments List Cards */}
      <div className="space-y-3">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400">جارٍ تحميل الواجبات...</div>
        ) : filteredList.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
            <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-xs font-bold text-slate-600">لا توجد واجبات في هذا القسم حالياً</p>
          </div>
        ) : (
          filteredList.map((assignment) => {
            const subs = submissions[assignment.id] || [];
            const latest = subs.length > 0 ? subs[0] : null;
            const deadline = getAssignmentDeadlineStatus(
              assignment.dueDate,
              assignment.cutoffDate,
              assignment.allowLateSubmissions
            );

            return (
              <div
                key={assignment.id}
                className="p-5 bg-white border border-slate-200 rounded-2xl shadow-2xs hover:border-blue-300 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                {/* Info */}
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-bold text-slate-900">
                      {assignment.titleArabic || assignment.title}
                    </h3>

                    {/* Deadline status badge */}
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${deadline.badgeColor}`}>
                      {deadline.labelAr}
                    </span>

                    {/* Revision requested flag */}
                    {latest?.status === 'returned_for_revision' && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200 flex items-center gap-1">
                        <RotateCcw className="w-3 h-3" /> مطلوب إعادة التعديل
                      </span>
                    )}

                    {/* Graded badge */}
                    {latest?.isGradeReleased && latest?.score !== null && (
                      <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-200">
                        الدرجة: {latest.score} / {assignment.maxScore}
                      </span>
                    )}
                  </div>

                  {/* Metadata */}
                  <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                    <span className="flex items-center gap-1 font-semibold text-slate-700">
                      <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                      {assignment.course?.titleArabic || assignment.course?.title}
                    </span>

                    {assignment.unit && (
                      <span>• {assignment.unit.titleArabic || assignment.unit.title}</span>
                    )}

                    <span>•</span>

                    <span className="flex items-center gap-1 text-slate-600">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      آخر موعد: {formatAssignmentDateTime(assignment.dueDate)}
                    </span>
                  </div>
                </div>

                {/* Action button */}
                <button
                  onClick={() => setSelectedAssignment(assignment)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 self-end md:self-center cursor-pointer shadow-xs"
                >
                  <span>
                    {latest?.isGradeReleased && latest?.score !== null
                      ? 'عرض النتيجة والملاحظات'
                      : latest?.status === 'returned_for_revision'
                      ? 'تعديل الحل وإعادة التسليم'
                      : latest
                      ? 'عرض تفاصيل التسليم'
                      : 'حل وتسليم الواجب'}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 rotate-180" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Submission Modal */}
      {selectedAssignment && (
        <StudentSubmissionModal
          isOpen={Boolean(selectedAssignment)}
          onClose={() => setSelectedAssignment(null)}
          assignment={selectedAssignment}
          submissions={submissions[selectedAssignment.id] || []}
          onSubmitted={loadData}
        />
      )}
    </div>
  );
};
