/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  FileText,
  Plus,
  Search,
  Filter,
  Calendar,
  Clock,
  CheckSquare,
  Users,
  Copy,
  Edit,
  Trash2,
  Archive,
  AlertCircle,
  BarChart3,
  CheckCircle2,
  BookOpen,
} from 'lucide-react';
import { AssignmentRecord, AssignmentStatus } from './types';
import {
  fetchTeacherAssignments,
  duplicateAssignment,
  deleteOrArchiveAssignment,
  isAssignmentsPhase5CSchemaReady,
} from './assignmentService';
import { formatAssignmentDateTime, getAssignmentDeadlineStatus } from './assignmentUtils';
import { AssignmentModal } from './AssignmentModal';
import { GradingWorkspaceModal } from './GradingWorkspaceModal';
import { fetchTeacherCourses } from '../courses/coursesService';

interface TeacherAssignmentsViewProps {
  initialTab?: 'all' | 'grading';
}

export const TeacherAssignmentsView: React.FC<TeacherAssignmentsViewProps> = ({
  initialTab = 'all',
}) => {
  const [assignments, setAssignments] = useState<AssignmentRecord[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [schemaReady, setSchemaReady] = useState<boolean>(true);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [assignmentToEdit, setAssignmentToEdit] = useState<AssignmentRecord | null>(null);
  const [gradingAssignment, setGradingAssignment] = useState<AssignmentRecord | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setActionError(null);
      const [assigns, courseList] = await Promise.all([
        fetchTeacherAssignments({
          courseId: selectedCourseId || undefined,
          status: selectedStatus,
          search: searchTerm,
        }),
        fetchTeacherCourses(),
      ]);
      setAssignments(assigns);
      setCourses(courseList || []);
      setSchemaReady(isAssignmentsPhase5CSchemaReady());
    } catch (err: any) {
      console.error('Failed to load assignments:', err);
      setActionError(err.message || 'فشل جلب قائمة الواجبات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedCourseId, selectedStatus]);

  // Handle Search submit
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadData();
  };

  // Duplicate handler
  const handleDuplicate = async (id: string) => {
    try {
      await duplicateAssignment(id);
      await loadData();
    } catch (err: any) {
      setActionError(err.message || 'فشل نسخ الواجب');
    }
  };

  // Archive / Delete handler
  const handleArchive = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من أرشفة هذا الواجب؟ سيتم إخفاؤه عن الطلاب دون حذف البيانات.')) return;
    try {
      await deleteOrArchiveAssignment(id, true);
      await loadData();
    } catch (err: any) {
      setActionError(err.message || 'فشل أرشفة الواجب');
    }
  };

  // Metrics
  const totalCount = assignments.length;
  const publishedCount = assignments.filter((a) => a.status === 'published').length;
  const draftsCount = assignments.filter((a) => a.status === 'draft').length;
  const totalSubmissions = assignments.reduce((acc, a) => acc + (a.totalSubmissions || 0), 0);
  const totalPendingGrading = assignments.reduce((acc, a) => acc + (a.pendingGrading || 0), 0);

  return (
    <div dir="rtl" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-6 h-6 text-blue-600" />
            <span>إدارة الواجبات والتطبيقات المنزلية</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            إنشاء المهام الدراسية، متابعة تسليمات الطلاب، رصد الدرجات مع السلالم التقييمية (Rubrics)
          </p>
        </div>

        <button
          onClick={() => {
            setAssignmentToEdit(null);
            setIsCreateModalOpen(true);
          }}
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-2 shadow-sm cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>إنشاء واجب جديد</span>
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="p-3.5 bg-white border border-slate-200 rounded-2xl shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500">إجمالي الواجبات</span>
          <p className="text-xl font-extrabold text-slate-900 mt-1">{totalCount}</p>
        </div>

        <div className="p-3.5 bg-white border border-slate-200 rounded-2xl shadow-2xs">
          <span className="text-[11px] font-bold text-emerald-600">منشورة ومتاحة</span>
          <p className="text-xl font-extrabold text-emerald-700 mt-1">{publishedCount}</p>
        </div>

        <div className="p-3.5 bg-white border border-slate-200 rounded-2xl shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500">مسودات</span>
          <p className="text-xl font-extrabold text-slate-600 mt-1">{draftsCount}</p>
        </div>

        <div className="p-3.5 bg-white border border-slate-200 rounded-2xl shadow-2xs">
          <span className="text-[11px] font-bold text-blue-600">إجمالي التسليمات</span>
          <p className="text-xl font-extrabold text-blue-700 mt-1">{totalSubmissions}</p>
        </div>

        <div className="p-3.5 bg-indigo-50 border border-indigo-200 rounded-2xl shadow-2xs">
          <span className="text-[11px] font-bold text-indigo-700">بانتظار التصحيح</span>
          <p className="text-xl font-extrabold text-indigo-900 mt-1">{totalPendingGrading}</p>
        </div>
      </div>

      {/* Schema migration notice */}
      {!schemaReady && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">تنبيه قاعدة البيانات: المخطط الأساسي قيد التشغيل</p>
            <p className="text-[11px] text-amber-800 mt-0.5">
              لتفعيل ربط الدروس، الاستهداف المتعدد، المرفقات، والسلالم التقييمية، يرجى تطبيق ملف الترحيل{' '}
              <code className="px-1 py-0.5 bg-amber-100 rounded-sm font-mono">
                20261111000015_complete_assignments_and_homework.sql
              </code>{' '}
              على قاعدة بيانات Supabase.
            </p>
          </div>
        </div>
      )}

      {/* Error alert */}
      {actionError && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <form onSubmit={handleSearch} className="flex-1 min-w-[240px] relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="بحث في عنوان الواجب أو الكورس..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pr-9 pl-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
          />
        </form>

        <div className="flex items-center gap-2">
          <select
            value={selectedCourseId}
            onChange={(e) => setSelectedCourseId(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500"
          >
            <option value="">جميع الكورسات الدراسية</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.titleArabic || c.title}
              </option>
            ))}
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">جميع الحالات</option>
            <option value="published">المنشورة فقط</option>
            <option value="draft">المسودات فقط</option>
            <option value="closed">المغلقة فقط</option>
            <option value="archived">المؤرشفة</option>
          </select>
        </div>
      </div>

      {/* Assignments List Table / Cards */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400">جارٍ جلب الواجبات والتطبيقات...</div>
        ) : assignments.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <FileText className="w-10 h-10 mx-auto mb-2 text-slate-300" />
            <p className="text-xs font-bold text-slate-600">لا توجد واجبات منزلية مسجلة</p>
            <p className="text-[11px] text-slate-400 mt-1">
              اضغط على زر "إنشاء واجب جديد" بالأعلى لتعيين واجب أو نشاط لطلابك.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {assignments.map((assignment) => {
              const deadline = getAssignmentDeadlineStatus(
                assignment.dueDate,
                assignment.cutoffDate,
                assignment.allowLateSubmissions
              );

              return (
                <div
                  key={assignment.id}
                  className="p-5 hover:bg-slate-50/80 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  {/* Left: Info */}
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-slate-900">
                        {assignment.titleArabic || assignment.title}
                      </h3>
                      {assignment.title && assignment.titleArabic && (
                        <span className="text-xs text-slate-500">({assignment.title})</span>
                      )}

                      {/* Status badge */}
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          assignment.status === 'published'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : assignment.status === 'draft'
                            ? 'bg-slate-100 text-slate-700 border border-slate-200'
                            : 'bg-rose-100 text-rose-800 border border-rose-200'
                        }`}
                      >
                        {assignment.status === 'published'
                          ? 'منشور ومتاح'
                          : assignment.status === 'draft'
                          ? 'مسودة'
                          : 'مغلق'}
                      </span>

                      {/* Countdown / deadline status badge */}
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${deadline.badgeColor}`}>
                        {deadline.labelAr}
                      </span>
                    </div>

                    {/* Metadata tags */}
                    <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                      <span className="flex items-center gap-1 font-semibold text-slate-700">
                        <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                        {assignment.course?.titleArabic || assignment.course?.title || 'عام'}
                      </span>

                      {assignment.unit && (
                        <span>• {assignment.unit.titleArabic || assignment.unit.title}</span>
                      )}

                      <span>•</span>

                      <span className="flex items-center gap-1 text-slate-600">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        التسليم: {formatAssignmentDateTime(assignment.dueDate)}
                      </span>

                      <span>•</span>

                      <span className="font-bold text-slate-700">
                        الدرجة: {assignment.maxScore}
                      </span>
                    </div>

                    {/* Targeting tag */}
                    <div className="text-[11px] text-slate-500 flex items-center gap-1.5 pt-0.5">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      {assignment.targets && assignment.targets.length > 0 ? (
                        <span>
                          مستهدف إلى: {assignment.targets.map((t) => t.groupName || t.studentName).filter(Boolean).join('، ')}
                        </span>
                      ) : (
                        <span>مستهدف إلى: جميع طلاب المقرر</span>
                      )}
                    </div>
                  </div>

                  {/* Right: Stats & Actions */}
                  <div className="flex items-center gap-3 self-end md:self-center shrink-0">
                    {/* Submissions & Grading Pill */}
                    <button
                      onClick={() => setGradingAssignment(assignment)}
                      className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl text-xs font-bold text-indigo-900 flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <CheckSquare className="w-4 h-4 text-indigo-600" />
                      <span>مكتب التصحيح</span>
                      <span className="px-1.5 py-0.5 rounded-md bg-indigo-600 text-white text-[10px]">
                        {assignment.pendingGrading || 0} بحاجة للتصحيح
                      </span>
                    </button>

                    {/* Edit button */}
                    <button
                      onClick={() => {
                        setAssignmentToEdit(assignment);
                        setIsCreateModalOpen(true);
                      }}
                      className="p-2 text-slate-500 hover:text-blue-600 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
                      title="تعديل الواجب"
                    >
                      <Edit className="w-4 h-4" />
                    </button>

                    {/* Duplicate button */}
                    <button
                      onClick={() => handleDuplicate(assignment.id)}
                      className="p-2 text-slate-500 hover:text-blue-600 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
                      title="نسخ كمسودة جديدة"
                    >
                      <Copy className="w-4 h-4" />
                    </button>

                    {/* Archive button */}
                    <button
                      onClick={() => handleArchive(assignment.id)}
                      className="p-2 text-slate-500 hover:text-amber-600 rounded-xl hover:bg-amber-50 transition-colors cursor-pointer"
                      title="أرشفة الواجب"
                    >
                      <Archive className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {isCreateModalOpen && (
        <AssignmentModal
          isOpen={isCreateModalOpen}
          onClose={() => {
            setIsCreateModalOpen(false);
            setAssignmentToEdit(null);
          }}
          assignmentToEdit={assignmentToEdit}
          onSaved={loadData}
        />
      )}

      {/* Grading Workspace Modal */}
      {gradingAssignment && (
        <GradingWorkspaceModal
          isOpen={Boolean(gradingAssignment)}
          onClose={() => setGradingAssignment(null)}
          assignment={gradingAssignment}
          onGraded={loadData}
        />
      )}
    </div>
  );
};
