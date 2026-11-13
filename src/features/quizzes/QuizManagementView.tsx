/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  FileQuestion,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Award,
  Layers,
  Edit2,
  Trash2,
  Users,
  Archive,
  BookOpen,
  Calendar,
  AlertCircle,
  Eye,
  Check,
} from 'lucide-react';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { useLocale } from '../../hooks/useLocale';
import { QuizRecord } from './types';
import { fetchTeacherQuizzes, updateQuiz, deleteQuiz } from './quizService';
import { QuizModal } from './QuizModal';
import { QuizQuestionBuilderModal } from './QuizQuestionBuilderModal';
import { QuizSubmissionsModal } from './QuizSubmissionsModal';
import { requireSupabaseClient, throwServiceError } from '../../lib/errors/serviceError';

export const QuizManagementView: React.FC = () => {
  const { isRtl } = useLocale();

  const [quizzes, setQuizzes] = useState<QuizRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [selectedCourse, setSelectedCourse] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [groups, setGroups] = useState<{ id: string; name: string; nameArabic: string }[]>([]);
  const [courses, setCourses] = useState<{ id: string; title: string; titleArabic: string }[]>([]);

  // Modals state
  const [isQuizModalOpen, setIsQuizModalOpen] = useState(false);
  const [quizToEdit, setQuizToEdit] = useState<QuizRecord | null>(null);

  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [builderQuiz, setBuilderQuiz] = useState<QuizRecord | null>(null);

  const [isSubmissionsOpen, setIsSubmissionsOpen] = useState(false);
  const [submissionsQuiz, setSubmissionsQuiz] = useState<QuizRecord | null>(null);

  // Load filter options
  useEffect(() => {
    async function loadFilterData() {
      try {
        const client = requireSupabaseClient({
          service: 'quizManagementView',
          operation: 'loadFilterData',
        });
        const [{ data: gList, error: gErr }, { data: cList, error: cErr }] = await Promise.all([
          client.from('groups').select('id, name, name_arabic').eq('is_active', true).order('name'),
          client.from('courses').select('id, title, title_arabic').order('title'),
        ]);
        if (gErr) {
          throwServiceError(gErr, {
            service: 'quizManagementView',
            operation: 'loadFilterData.groups',
          });
        }
        if (cErr) {
          throwServiceError(cErr, {
            service: 'quizManagementView',
            operation: 'loadFilterData.courses',
          });
        }
        setGroups((gList || []).map((g: any) => ({ id: g.id, name: g.name, nameArabic: g.name_arabic || g.name })));
        setCourses((cList || []).map((c: any) => ({ id: c.id, title: c.title, titleArabic: c.title_arabic || c.title })));
      } catch (err: unknown) {
        setActionError(err);
      }
    }
    loadFilterData();
  }, []);

  const loadQuizzes = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const data = await fetchTeacherQuizzes({
        groupId: selectedGroup,
        courseId: selectedCourse,
        status: statusFilter,
        search: searchQuery,
      });
      setQuizzes(data);
    } catch (err: unknown) {
      setLoadError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQuizzes();
  }, [statusFilter, selectedGroup, selectedCourse, searchQuery]);

  const handleTogglePublish = async (quiz: QuizRecord) => {
    try {
      setActionError(null);
      await updateQuiz(quiz.id, { isPublished: !quiz.isPublished });
      await loadQuizzes();
    } catch (err: unknown) {
      setActionError(err);
    }
  };

  const handleToggleArchive = async (quiz: QuizRecord) => {
    const confirmMsg = isRtl
      ? quiz.isArchived
        ? 'هل ترغب في استعادة هذا الاختبار من الأرشيف؟'
        : 'هل أنت متأكد من رغبتك في أرشفة هذا الاختبار؟ لن يتمكن الطلاب من بدء محاولات جديدة.'
      : quiz.isArchived
      ? 'Do you want to restore this assessment from archive?'
      : 'Are you sure you want to archive this assessment?';
    if (!window.confirm(confirmMsg)) return;

    try {
      setActionError(null);
      await updateQuiz(quiz.id, { isArchived: !quiz.isArchived });
      await loadQuizzes();
    } catch (err: unknown) {
      setActionError(err);
    }
  };

  const handleDeleteQuiz = async (quiz: QuizRecord) => {
    const confirmMsg = isRtl
      ? `هل أنت متأكد من حذف الاختبار نهائياً: "${quiz.titleArabic || quiz.title}"؟`
      : `Are you sure you want to permanently delete: "${quiz.title}"?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      setActionError(null);
      await deleteQuiz(quiz.id);
      await loadQuizzes();
    } catch (err: unknown) {
      setActionError(err);
    }
  };

  const totalPublished = quizzes.filter((q) => q.isPublished && !q.isArchived).length;
  const totalSubmissions = quizzes.reduce((acc, q) => acc + (q.submissionsCount || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <FileQuestion className="w-6 h-6 text-[#356AE6]" />
            <span>{isRtl ? 'إدارة الاختبارات والتقييمات' : 'Assessments & Quizzes Management'}</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            {isRtl
              ? 'إنشاء وإدارة بنوك الأسئلة، جدولة مواعيد الاختبارات، وتصحيح الإجابات مع الحفاظ على سرية نماذج الحلول.'
              : 'Create question banks, schedule assessments, and evaluate student responses securely.'}
          </p>
        </div>

        <Button
          type="button"
          onClick={() => {
            setQuizToEdit(null);
            setIsQuizModalOpen(true);
          }}
          className="bg-[#14243A] hover:bg-[#1f3758] text-white shadow-xs"
        >
          <Plus className="w-4 h-4 me-1.5" />
          <span>{isRtl ? 'إنشاء اختبار جديد' : 'New Assessment'}</span>
        </Button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="p-4">
          <span className="text-xs font-medium text-slate-500 block mb-1">
            {isRtl ? 'إجمالي الاختبارات' : 'Total Assessments'}
          </span>
          <span className="text-2xl font-bold text-slate-900">{quizzes.length}</span>
        </Card>

        <Card className="p-4">
          <span className="text-xs font-medium text-slate-500 block mb-1">
            {isRtl ? 'الاختبارات النشطة المنشورة' : 'Active Published'}
          </span>
          <span className="text-2xl font-bold text-emerald-600">{totalPublished}</span>
        </Card>

        <Card className="p-4">
          <span className="text-xs font-medium text-slate-500 block mb-1">
            {isRtl ? 'إجمالي التسليمات' : 'Total Submissions'}
          </span>
          <span className="text-2xl font-bold text-[#356AE6]">{totalSubmissions}</span>
        </Card>

        <Card className="p-4">
          <span className="text-xs font-medium text-slate-500 block mb-1">
            {isRtl ? 'مسودة أو مؤرشفة' : 'Drafts / Archived'}
          </span>
          <span className="text-2xl font-bold text-slate-700">
            {quizzes.filter((q) => !q.isPublished || q.isArchived).length}
          </span>
        </Card>
      </div>

      {/* Filters Bar */}
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              type="text"
              placeholder={isRtl ? 'البحث عن اختبار...' : 'Search assessments...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="ps-9 text-xs"
            />
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full text-xs rounded-xl border border-slate-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#356AE6]/20 focus:border-[#356AE6]"
            >
              <option value="all">{isRtl ? 'كل الحالات' : 'All Statuses'}</option>
              <option value="published">{isRtl ? 'المنشورة فقط' : 'Published'}</option>
              <option value="draft">{isRtl ? 'المسودات' : 'Drafts'}</option>
              <option value="archived">{isRtl ? 'المؤرشفة' : 'Archived'}</option>
            </select>
          </div>

          <div>
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="w-full text-xs rounded-xl border border-slate-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#356AE6]/20 focus:border-[#356AE6]"
            >
              <option value="all">{isRtl ? 'كل المجموعات' : 'All Cohorts'}</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {isRtl ? g.nameArabic : g.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={selectedCourse}
              onChange={(e) => setSelectedCourse(e.target.value)}
              className="w-full text-xs rounded-xl border border-slate-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#356AE6]/20 focus:border-[#356AE6]"
            >
              <option value="all">{isRtl ? 'كل المقررات' : 'All Courses'}</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {isRtl ? c.titleArabic : c.title}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {Boolean(actionError) && (
        <ErrorState
          variant="banner"
          error={actionError}
          isRtl={isRtl}
          onDismiss={() => setActionError(null)}
        />
      )}

      {/* Assessment List */}
      {loading ? (
        <div className="py-16 flex justify-center">
          <LoadingSpinner size="lg" />
        </div>
      ) : loadError ? (
        <ErrorState error={loadError} isRtl={isRtl} onRetry={loadQuizzes} />
      ) : quizzes.length === 0 ? (
        <EmptyState
          icon={<FileQuestion className="w-6 h-6 text-[#356AE6]" />}
          title={isRtl ? 'لا توجد اختبارات مسجلة' : 'No assessments found'}
          description={
            isRtl
              ? 'قم بإنشاء اختبار وتقييم جديد، ثم أضف الأسئلة من بنك الأسئلة المدمج.'
              : 'Create a new assessment and populate questions using the question builder.'
          }
          actionLabel={isRtl ? 'إنشاء اختبار الآن' : 'Create Assessment Now'}
          onAction={() => {
            setQuizToEdit(null);
            setIsQuizModalOpen(true);
          }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {quizzes.map((quiz) => (
            <Card key={quiz.id} className="p-5 hover:border-slate-300 transition-all">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                {/* Left info */}
                <div className="space-y-2 max-w-2xl">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        quiz.isArchived
                          ? 'bg-slate-200 text-slate-700'
                          : quiz.isPublished
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {quiz.isArchived
                        ? (isRtl ? 'مؤرشف' : 'Archived')
                        : quiz.isPublished
                        ? (isRtl ? 'منشور للطلاب' : 'Published')
                        : (isRtl ? 'مسودة' : 'Draft')}
                    </span>

                    {quiz.groupName && (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                        {isRtl ? quiz.groupNameArabic || quiz.groupName : quiz.groupName}
                      </span>
                    )}

                    {quiz.courseTitle && (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                        {isRtl ? quiz.courseTitleArabic || quiz.courseTitle : quiz.courseTitle}
                      </span>
                    )}
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      {isRtl ? quiz.titleArabic || quiz.title : quiz.title}
                    </h3>
                    {isRtl && quiz.title && quiz.titleArabic && (
                      <span className="text-xs text-slate-500 block font-normal mt-0.5" dir="ltr">
                        {quiz.title}
                      </span>
                    )}
                  </div>

                  {(quiz.description || quiz.descriptionArabic) && (
                    <p className="text-xs text-slate-600 line-clamp-2">
                      {isRtl ? quiz.descriptionArabic || quiz.description : quiz.description}
                    </p>
                  )}

                  {/* Badges line */}
                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-1">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      {quiz.durationMinutes} {isRtl ? 'دقيقة' : 'mins'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Award className="w-3.5 h-3.5 text-slate-400" />
                      {quiz.totalPoints} {isRtl ? 'درجة' : 'pts'} ({isRtl ? 'النجاح' : 'Pass'}: {quiz.passingScore}%)
                    </span>
                    <span className="flex items-center gap-1 font-semibold text-slate-700">
                      <BookOpen className="w-3.5 h-3.5 text-[#356AE6]" />
                      {quiz.questionsCount || 0} {isRtl ? 'أسئلة' : 'questions'}
                    </span>
                    <span className="flex items-center gap-1 font-semibold text-slate-700">
                      <Users className="w-3.5 h-3.5 text-emerald-600" />
                      {quiz.submissionsCount || 0} {isRtl ? 'تسليمات' : 'submissions'}
                    </span>
                  </div>
                </div>

                {/* Right Action buttons */}
                <div className="flex flex-wrap items-center gap-2 border-t lg:border-t-0 pt-3 lg:pt-0">
                  {/* Question bank builder */}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setBuilderQuiz(quiz);
                      setIsBuilderOpen(true);
                    }}
                    className="text-xs"
                  >
                    <BookOpen className="w-3.5 h-3.5 me-1 text-[#356AE6]" />
                    {isRtl ? 'بنك الأسئلة' : 'Questions'}
                    {quiz.questionsCount !== undefined && quiz.questionsCount > 0 && (
                      <span className="ms-1.5 px-1.5 py-0.2 rounded-full text-[10px] bg-blue-100 text-blue-800 font-bold">
                        {quiz.questionsCount}
                      </span>
                    )}
                  </Button>

                  {/* Submissions & Grading */}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSubmissionsQuiz(quiz);
                      setIsSubmissionsOpen(true);
                    }}
                    className="text-xs"
                  >
                    <Users className="w-3.5 h-3.5 me-1 text-emerald-600" />
                    {isRtl ? 'النتائج والتصحيح' : 'Grading'}
                    {quiz.submissionsCount !== undefined && quiz.submissionsCount > 0 && (
                      <span className="ms-1.5 px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-bold">
                        {quiz.submissionsCount}
                      </span>
                    )}
                  </Button>

                  {/* Edit settings */}
                  <button
                    type="button"
                    onClick={() => {
                      setQuizToEdit(quiz);
                      setIsQuizModalOpen(true);
                    }}
                    title={isRtl ? 'تعديل الإعدادات' : 'Edit assessment'}
                    className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  {/* Toggle publish */}
                  <button
                    type="button"
                    onClick={() => handleTogglePublish(quiz)}
                    title={quiz.isPublished ? (isRtl ? 'إلغاء النشر' : 'Unpublish') : (isRtl ? 'نشر للطلاب' : 'Publish')}
                    className={`p-2 rounded-lg border transition-colors ${
                      quiz.isPublished
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        : 'border-slate-200 text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </button>

                  {/* Toggle archive */}
                  <button
                    type="button"
                    onClick={() => handleToggleArchive(quiz)}
                    title={quiz.isArchived ? (isRtl ? 'استعادة من الأرشيف' : 'Restore') : (isRtl ? 'أرشفة' : 'Archive')}
                    className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 transition-colors"
                  >
                    <Archive className="w-3.5 h-3.5" />
                  </button>

                  {/* Delete */}
                  <button
                    type="button"
                    onClick={() => handleDeleteQuiz(quiz)}
                    title={isRtl ? 'حذف الاختبار' : 'Delete'}
                    className="p-2 rounded-lg border border-slate-200 text-rose-500 hover:bg-rose-50 hover:border-rose-200 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Quiz Modal */}
      {isQuizModalOpen && (
        <QuizModal
          isOpen={isQuizModalOpen}
          onClose={() => setIsQuizModalOpen(false)}
          onSuccess={loadQuizzes}
          quizToEdit={quizToEdit}
        />
      )}

      {/* Question Builder Modal */}
      {isBuilderOpen && builderQuiz && (
        <QuizQuestionBuilderModal
          isOpen={isBuilderOpen}
          onClose={() => setIsBuilderOpen(false)}
          quizId={builderQuiz.id}
          quizTitle={isRtl ? builderQuiz.titleArabic || builderQuiz.title : builderQuiz.title}
          onQuestionsUpdated={loadQuizzes}
        />
      )}

      {/* Submissions Modal */}
      {isSubmissionsOpen && submissionsQuiz && (
        <QuizSubmissionsModal
          isOpen={isSubmissionsOpen}
          onClose={() => setIsSubmissionsOpen(false)}
          quizId={submissionsQuiz.id}
          quizTitle={isRtl ? submissionsQuiz.titleArabic || submissionsQuiz.title : submissionsQuiz.title}
        />
      )}
    </div>
  );
};
