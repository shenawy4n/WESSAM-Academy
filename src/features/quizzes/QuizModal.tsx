/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  FileText,
  Clock,
  Award,
  Layers,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Eye,
  Lock,
} from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useLocale } from '../../hooks/useLocale';
import { QuizRecord, CreateQuizParams } from './types';
import { createQuiz, updateQuiz } from './quizService';
import { getErrorMessage, requireSupabaseClient, throwServiceError } from '../../lib/errors/serviceError';

interface QuizModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  quizToEdit?: QuizRecord | null;
}

export const QuizModal: React.FC<QuizModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  quizToEdit,
}) => {
  const { isRtl } = useLocale();

  const [title, setTitle] = useState('');
  const [titleArabic, setTitleArabic] = useState('');
  const [description, setDescription] = useState('');
  const [descriptionArabic, setDescriptionArabic] = useState('');
  const [courseId, setCourseId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [lessonId, setLessonId] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [passingScore, setPassingScore] = useState(60);
  const [maxAttempts, setMaxAttempts] = useState(1);
  const [totalPoints, setTotalPoints] = useState(100);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showResultsImmediately, setShowResultsImmediately] = useState(true);
  const [showCorrectAnswersAfterSubmission, setShowCorrectAnswersAfterSubmission] = useState(false);
  const [isPublished, setIsPublished] = useState(false);

  const [courses, setCourses] = useState<{ id: string; title: string; titleArabic: string }[]>([]);
  const [groups, setGroups] = useState<{ id: string; name: string; nameArabic: string }[]>([]);
  const [lessons, setLessons] = useState<{ id: string; courseId: string; title: string; titleArabic: string }[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load selection options
  useEffect(() => {
    if (!isOpen) return;

    async function loadOptions() {
      try {
        const client = requireSupabaseClient({ service: 'QuizModal', operation: 'loadOptions' });
        const [gRes, cRes, lRes] = await Promise.all([
          client.from('groups').select('id, name, name_arabic').eq('is_active', true).order('name'),
          client.from('courses').select('id, title, title_arabic').order('title'),
          client.from('lessons').select('id, course_id, title, title_arabic').order('order_index'),
        ]);

        if (gRes.error) throwServiceError(gRes.error, { service: 'QuizModal', operation: 'loadGroups' });
        if (cRes.error) throwServiceError(cRes.error, { service: 'QuizModal', operation: 'loadCourses' });
        if (lRes.error) throwServiceError(lRes.error, { service: 'QuizModal', operation: 'loadLessons' });

        setGroups((gRes.data || []).map((g: any) => ({ id: g.id, name: g.name, nameArabic: g.name_arabic || g.name })));
        setCourses((cRes.data || []).map((c: any) => ({ id: c.id, title: c.title, titleArabic: c.title_arabic || c.title })));
        setLessons((lRes.data || []).map((l: any) => ({ id: l.id, courseId: l.course_id, title: l.title, titleArabic: l.title_arabic || l.title })));
      } catch (err: unknown) {
        setError(getErrorMessage(err, isRtl));
      }
    }
    loadOptions();
  }, [isOpen, isRtl]);

  // Sync state when editing or resetting
  useEffect(() => {
    if (!isOpen) return;
    setError(null);

    if (quizToEdit) {
      setTitle(quizToEdit.title);
      setTitleArabic(quizToEdit.titleArabic || '');
      setDescription(quizToEdit.description || '');
      setDescriptionArabic(quizToEdit.descriptionArabic || '');
      setCourseId(quizToEdit.courseId || '');
      setGroupId(quizToEdit.groupId || '');
      setLessonId(quizToEdit.lessonId || '');
      setDurationMinutes(quizToEdit.durationMinutes || 30);
      setPassingScore(quizToEdit.passingScore || 60);
      setMaxAttempts(quizToEdit.maxAttempts || 1);
      setTotalPoints(quizToEdit.totalPoints || 100);
      setStartDate(quizToEdit.startDate ? quizToEdit.startDate.slice(0, 16) : '');
      setEndDate(quizToEdit.endDate ? quizToEdit.endDate.slice(0, 16) : '');
      setShowResultsImmediately(quizToEdit.showResultsImmediately !== false);
      setShowCorrectAnswersAfterSubmission(!!quizToEdit.showCorrectAnswersAfterSubmission);
      setIsPublished(quizToEdit.isPublished);
    } else {
      setTitle('');
      setTitleArabic('');
      setDescription('');
      setDescriptionArabic('');
      setCourseId('');
      setGroupId('');
      setLessonId('');
      setDurationMinutes(30);
      setPassingScore(60);
      setMaxAttempts(1);
      setTotalPoints(100);
      setStartDate('');
      setEndDate('');
      setShowResultsImmediately(true);
      setShowCorrectAnswersAfterSubmission(false);
      setIsPublished(false);
    }
  }, [isOpen, quizToEdit]);

  const filteredLessons = courseId
    ? lessons.filter((l) => l.courseId === courseId)
    : lessons;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError(isRtl ? 'يرجى إدخال عنوان الاختبار باللغة الإنجليزية' : 'Please provide assessment English title');
      return;
    }
    if (!titleArabic.trim()) {
      setError(isRtl ? 'يرجى إدخال عنوان الاختبار باللغة العربية' : 'Please provide assessment Arabic title');
      return;
    }

    try {
      setLoading(true);
      const params: CreateQuizParams = {
        title: title.trim(),
        titleArabic: titleArabic.trim(),
        description: description.trim() || undefined,
        descriptionArabic: descriptionArabic.trim() || undefined,
        courseId: courseId || null,
        groupId: groupId || null,
        lessonId: lessonId || null,
        durationMinutes: Number(durationMinutes) > 0 ? Number(durationMinutes) : 30,
        passingScore: Number(passingScore) >= 0 ? Number(passingScore) : 60,
        maxAttempts: Number(maxAttempts) > 0 ? Number(maxAttempts) : 1,
        totalPoints: Number(totalPoints) > 0 ? Number(totalPoints) : 100,
        startDate: startDate ? new Date(startDate).toISOString() : null,
        endDate: endDate ? new Date(endDate).toISOString() : null,
        showResultsImmediately,
        showCorrectAnswersAfterSubmission,
        isPublished,
      };

      if (quizToEdit) {
        await updateQuiz(quizToEdit.id, params);
      } else {
        await createQuiz(params);
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(getErrorMessage(err, isRtl));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        quizToEdit
          ? (isRtl ? 'تعديل التقييم والاختبار' : 'Edit Assessment')
          : (isRtl ? 'إنشاء اختبار وتقييم جديد' : 'Create New Assessment')
      }
      maxWidth="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-500 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Titles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              {isRtl ? 'عنوان الاختبار (إنجليزي) *' : 'Assessment Title (English) *'}
            </label>
            <Input
              type="text"
              required
              placeholder="e.g. IELTS Writing Task 2 Diagnostic Quiz"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              {isRtl ? 'عنوان الاختبار (عربي) *' : 'Assessment Title (Arabic) *'}
            </label>
            <Input
              type="text"
              required
              dir="rtl"
              placeholder="مثال: الاختبار التشخيصي لمقال الآيلتس 2"
              value={titleArabic}
              onChange={(e) => setTitleArabic(e.target.value)}
            />
          </div>
        </div>

        {/* Descriptions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              {isRtl ? 'الوصف والتعليمات (إنجليزي)' : 'Description & Instructions (English)'}
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Guidelines for students before starting..."
              className="w-full text-sm rounded-xl border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#356AE6]/20 focus:border-[#356AE6]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              {isRtl ? 'الوصف والتعليمات (عربي)' : 'Description & Instructions (Arabic)'}
            </label>
            <textarea
              rows={3}
              dir="rtl"
              value={descriptionArabic}
              onChange={(e) => setDescriptionArabic(e.target.value)}
              placeholder="إرشادات وتعليمات خوض الاختبار..."
              className="w-full text-sm rounded-xl border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#356AE6]/20 focus:border-[#356AE6]"
            />
          </div>
        </div>

        {/* Target Associations */}
        <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-100 space-y-4">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-slate-500" />
            {isRtl ? 'ربط الاختبار بالمجموعة أو الدورة التدريبية' : 'Curriculum & Group Assignment'}
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                {isRtl ? 'المجموعة المستهدفة' : 'Target Cohort Group'}
              </label>
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className="w-full text-sm rounded-xl border border-slate-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#356AE6]/20 focus:border-[#356AE6]"
              >
                <option value="">{isRtl ? '— غير مقيد بمجموعة محددة —' : '— All Enrolled Students —'}</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {isRtl ? g.nameArabic : g.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                {isRtl ? 'المقرر الدراسي المرتبط' : 'Associated Course'}
              </label>
              <select
                value={courseId}
                onChange={(e) => {
                  setCourseId(e.target.value);
                  setLessonId('');
                }}
                className="w-full text-sm rounded-xl border border-slate-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#356AE6]/20 focus:border-[#356AE6]"
              >
                <option value="">{isRtl ? '— بدون مقرر محدد —' : '— Standalone Assessment —'}</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {isRtl ? c.titleArabic : c.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                {isRtl ? 'الدرس المرتبط (اختياري)' : 'Associated Lesson (Optional)'}
              </label>
              <select
                value={lessonId}
                onChange={(e) => setLessonId(e.target.value)}
                disabled={!courseId}
                className="w-full text-sm rounded-xl border border-slate-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#356AE6]/20 focus:border-[#356AE6] disabled:opacity-50"
              >
                <option value="">{isRtl ? '— غير مرتبط بدرس —' : '— General Course Quiz —'}</option>
                {filteredLessons.map((l) => (
                  <option key={l.id} value={l.id}>
                    {isRtl ? l.titleArabic : l.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Timers & Scoring Settings */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              <Clock className="w-3.5 h-3.5 inline me-1 text-slate-400" />
              {isRtl ? 'المدة (بالدقائق)' : 'Duration (Mins)'}
            </label>
            <Input
              type="number"
              min={5}
              max={240}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              <Award className="w-3.5 h-3.5 inline me-1 text-slate-400" />
              {isRtl ? 'درجة النجاح (%)' : 'Passing Score (%)'}
            </label>
            <Input
              type="number"
              min={0}
              max={100}
              value={passingScore}
              onChange={(e) => setPassingScore(Number(e.target.value))}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              <FileText className="w-3.5 h-3.5 inline me-1 text-slate-400" />
              {isRtl ? 'الدرجة الكلية' : 'Total Points'}
            </label>
            <Input
              type="number"
              min={1}
              value={totalPoints}
              onChange={(e) => setTotalPoints(Number(e.target.value))}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {isRtl ? 'الحد الأقصى للمحاولات' : 'Max Attempts'}
            </label>
            <Input
              type="number"
              min={1}
              max={10}
              value={maxAttempts}
              onChange={(e) => setMaxAttempts(Number(e.target.value))}
            />
          </div>
        </div>

        {/* Availability Window */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              {isRtl ? 'تاريخ الإتاحة (البداية)' : 'Available From'}
            </label>
            <Input
              type="datetime-local"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              {isRtl ? 'الموعد النهائي (الإغلاق)' : 'Deadline / Due Date'}
            </label>
            <Input
              type="datetime-local"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>

        {/* Review & Feedback Configuration */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            {isRtl ? 'إعدادات المراجعة وحجب الإجابات' : 'Review & Academic Integrity Settings'}
          </h4>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={showResultsImmediately}
              onChange={(e) => setShowResultsImmediately(e.target.checked)}
              className="mt-0.5 rounded text-[#356AE6] focus:ring-[#356AE6]"
            />
            <div className="text-xs">
              <span className="font-semibold text-slate-800 block">
                {isRtl ? 'إظهار الدرجة فور التسليم' : 'Show Score Immediately After Submission'}
              </span>
              <span className="text-slate-500">
                {isRtl
                  ? 'يرى الطالب نتيجته المبدئية مباشرة بعد إنهاء المحاولة'
                  : 'Students view their points and percentage immediately'}
              </span>
            </div>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={showCorrectAnswersAfterSubmission}
              onChange={(e) => setShowCorrectAnswersAfterSubmission(e.target.checked)}
              className="mt-0.5 rounded text-[#356AE6] focus:ring-[#356AE6]"
            />
            <div className="text-xs">
              <span className="font-semibold text-slate-800 block">
                {isRtl ? 'السماح بمراجعة الإجابات الصحيحة والتوضيحات' : 'Allow Correct Answer & Explanation Review'}
              </span>
              <span className="text-slate-500">
                {isRtl
                  ? 'يكشف نموذج الإجابة والشروحات للطالب بعد التسليم المكتمل'
                  : 'Reveals model answers and explanations to students upon completion'}
              </span>
            </div>
          </label>

          <label className="flex items-start gap-3 cursor-pointer pt-2 border-t border-slate-100">
            <input
              type="checkbox"
              checked={isPublished}
              onChange={(e) => setIsPublished(e.target.checked)}
              className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-600"
            />
            <div className="text-xs">
              <span className="font-bold text-emerald-800 block">
                {isRtl ? 'نشر الاختبار وجعله متاحاً للطلاب' : 'Publish Assessment to Students'}
              </span>
              <span className="text-slate-500">
                {isRtl
                  ? 'عند التفعيل، سيتمكن الطلاب المستهدفون من رؤية وبدء الاختبار'
                  : 'When published, eligible students can see and start the assessment'}
              </span>
            </div>
          </label>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            {isRtl ? 'إلغاء' : 'Cancel'}
          </Button>
          <Button type="submit" disabled={loading} className="bg-[#14243A] hover:bg-[#1f3758] text-white">
            {loading ? (isRtl ? 'جارٍ الحفظ...' : 'Saving...') : isRtl ? 'حفظ الاختبار' : 'Save Assessment'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
