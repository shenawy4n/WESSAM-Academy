/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  HelpCircle,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  GripVertical,
  Edit2,
  Save,
  BookOpen,
} from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useLocale } from '../../hooks/useLocale';
import { QuestionItem, QuestionType, UpsertQuestionParams } from './types';
import { fetchQuizById, saveQuizQuestion, deleteQuizQuestion } from './quizService';

interface QuizQuestionBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  quizId: string;
  quizTitle: string;
  onQuestionsUpdated?: () => void;
}

export const QuizQuestionBuilderModal: React.FC<QuizQuestionBuilderModalProps> = ({
  isOpen,
  onClose,
  quizId,
  quizTitle,
  onQuestionsUpdated,
}) => {
  const { isRtl } = useLocale();

  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editor form state
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [questionText, setQuestionText] = useState('');
  const [questionTextArabic, setQuestionTextArabic] = useState('');
  const [questionType, setQuestionType] = useState<QuestionType>('multiple_choice');
  const [points, setPoints] = useState(5);
  const [explanation, setExplanation] = useState('');
  const [explanationArabic, setExplanationArabic] = useState('');
  const [correctAnswerText, setCorrectAnswerText] = useState('');
  const [gradingGuidelines, setGradingGuidelines] = useState('');
  const [options, setOptions] = useState<{ id?: string; optionText: string; optionTextArabic?: string; isCorrect: boolean; orderIndex: number }[]>([
    { optionText: '', optionTextArabic: '', isCorrect: true, orderIndex: 1 },
    { optionText: '', optionTextArabic: '', isCorrect: false, orderIndex: 2 },
  ]);

  const loadQuestions = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchQuizById(quizId);
      if (res) {
        setQuestions(res.questions);
      }
    } catch (err: any) {
      console.error('Failed to load questions:', err);
      setError(err.message || 'Error loading questions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadQuestions();
      resetForm();
    }
  }, [isOpen, quizId]);

  const resetForm = () => {
    setEditingQuestionId(null);
    setQuestionText('');
    setQuestionTextArabic('');
    setQuestionType('multiple_choice');
    setPoints(5);
    setExplanation('');
    setExplanationArabic('');
    setCorrectAnswerText('');
    setGradingGuidelines('');
    setOptions([
      { optionText: '', optionTextArabic: '', isCorrect: true, orderIndex: 1 },
      { optionText: '', optionTextArabic: '', isCorrect: false, orderIndex: 2 },
      { optionText: '', optionTextArabic: '', isCorrect: false, orderIndex: 3 },
    ]);
  };

  const handleEditQuestion = (q: QuestionItem) => {
    setEditingQuestionId(q.id);
    setQuestionText(q.questionText);
    setQuestionTextArabic(q.questionTextArabic || '');
    setQuestionType(q.questionType);
    setPoints(q.points);
    setExplanation(q.explanation || '');
    setExplanationArabic(q.explanationArabic || '');
    setCorrectAnswerText(q.correctAnswerText || '');
    setGradingGuidelines(q.gradingGuidelines || '');

    if (q.questionType === 'multiple_choice' || q.questionType === 'true_false') {
      setOptions(
        q.options.map((o, idx) => ({
          id: o.id,
          optionText: o.optionText,
          optionTextArabic: o.optionTextArabic || '',
          isCorrect: !!o.isCorrect,
          orderIndex: o.orderIndex || idx + 1,
        }))
      );
    }
  };

  const handleTypeChange = (type: QuestionType) => {
    setQuestionType(type);
    if (type === 'true_false') {
      setOptions([
        { optionText: 'True', optionTextArabic: 'صواب', isCorrect: true, orderIndex: 1 },
        { optionText: 'False', optionTextArabic: 'خطأ', isCorrect: false, orderIndex: 2 },
      ]);
    } else if (type === 'multiple_choice' && options.length < 2) {
      setOptions([
        { optionText: '', optionTextArabic: '', isCorrect: true, orderIndex: 1 },
        { optionText: '', optionTextArabic: '', isCorrect: false, orderIndex: 2 },
      ]);
    }
  };

  const handleAddOption = () => {
    setOptions((prev) => [
      ...prev,
      {
        optionText: '',
        optionTextArabic: '',
        isCorrect: false,
        orderIndex: prev.length + 1,
      },
    ]);
  };

  const handleRemoveOption = (index: number) => {
    if (options.length <= 2) return;
    setOptions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSetCorrectOption = (index: number) => {
    setOptions((prev) =>
      prev.map((opt, i) => ({
        ...opt,
        isCorrect: i === index,
      }))
    );
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!questionText.trim()) {
      setError(isRtl ? 'يرجى كتابة نص السؤال باللغة الإنجليزية' : 'Please provide question English text');
      return;
    }

    if (questionType === 'multiple_choice' || questionType === 'true_false') {
      const validOptions = options.filter((o) => o.optionText.trim() !== '');
      if (validOptions.length < 2) {
        setError(isRtl ? 'يجب توفير خيارين على الأقل' : 'Please provide at least 2 answer options');
        return;
      }
      const hasCorrect = options.some((o) => o.isCorrect);
      if (!hasCorrect) {
        setError(isRtl ? 'يرجى تحديد الإجابة الصحيحة' : 'Please select the correct answer');
        return;
      }
    }

    try {
      setSaving(true);
      const payload: UpsertQuestionParams = {
        id: editingQuestionId || undefined,
        questionText: questionText.trim(),
        questionTextArabic: questionTextArabic.trim() || undefined,
        questionType,
        points: Number(points) > 0 ? Number(points) : 1,
        orderIndex: editingQuestionId
          ? (questions.find((q) => q.id === editingQuestionId)?.orderIndex || questions.length + 1)
          : questions.length + 1,
        explanation: explanation.trim() || undefined,
        explanationArabic: explanationArabic.trim() || undefined,
        correctAnswerText: questionType === 'short_answer' ? correctAnswerText.trim() || undefined : undefined,
        gradingGuidelines: questionType === 'short_answer' ? gradingGuidelines.trim() || undefined : undefined,
        options: questionType !== 'short_answer' ? options : undefined,
      };

      await saveQuizQuestion(quizId, payload);
      await loadQuestions();
      resetForm();
      if (onQuestionsUpdated) onQuestionsUpdated();
    } catch (err: any) {
      console.error('Failed to save question:', err);
      setError(err.message || 'Error saving question');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    const confirmMsg = isRtl
      ? 'هل أنت متأكد من حذف هذا السؤال من الاختبار؟'
      : 'Are you sure you want to remove this question?';
    if (!window.confirm(confirmMsg)) return;

    try {
      setLoading(true);
      await deleteQuizQuestion(quizId, questionId);
      await loadQuestions();
      if (onQuestionsUpdated) onQuestionsUpdated();
    } catch (err: any) {
      console.error('Delete error:', err);
      setError(err.message || 'Failed to delete question');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${isRtl ? 'بنك أسئلة الاختبار' : 'Question Bank'} — ${quizTitle}`}
      maxWidth="2xl"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 max-h-[80vh] overflow-y-auto p-1">
        {/* Left: Questions List (4 cols) */}
        <div className="lg:col-span-5 border-b lg:border-b-0 lg:border-e border-slate-200 pe-0 lg:pe-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">
              {isRtl ? `الأسئلة الحالية (${questions.length})` : `Quiz Questions (${questions.length})`}
            </h3>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={resetForm}
              className="text-xs"
            >
              <Plus className="w-3.5 h-3.5 me-1 text-[#356AE6]" />
              {isRtl ? 'سؤال جديد' : 'New Question'}
            </Button>
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs text-slate-400">
              {isRtl ? 'جارٍ تحميل الأسئلة...' : 'Loading questions...'}
            </div>
          ) : questions.length === 0 ? (
            <div className="p-8 text-center rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-400 space-y-1">
              <HelpCircle className="w-8 h-8 text-slate-300 mx-auto" />
              <p>{isRtl ? 'لا توجد أسئلة بعد في هذا الاختبار.' : 'No questions created yet.'}</p>
              <p className="text-[11px] text-slate-400">
                {isRtl ? 'أضف أول سؤال باستخدام النموذج على اليمين.' : 'Add your first question using the editor.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {questions.map((q, idx) => (
                <div
                  key={q.id}
                  onClick={() => handleEditQuestion(q)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer text-xs ${
                    editingQuestionId === q.id
                      ? 'border-[#356AE6] bg-[#356AE6]/5 shadow-xs'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-bold text-slate-800 line-clamp-2">
                      #{idx + 1} {q.questionText}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteQuestion(q.id);
                      }}
                      className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                      title={isRtl ? 'حذف السؤال' : 'Delete question'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center gap-2 mt-2 text-[10px] text-slate-500 font-medium">
                    <span className="px-1.5 py-0.5 rounded-md bg-slate-100 font-semibold text-slate-700 uppercase">
                      {q.questionType.replace('_', ' ')}
                    </span>
                    <span>{q.points} {isRtl ? 'درجات' : 'pts'}</span>
                    {q.options && q.options.length > 0 && (
                      <span>• {q.options.length} {isRtl ? 'خيارات' : 'options'}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Question Editor Form (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-[#356AE6]" />
              {editingQuestionId
                ? (isRtl ? 'تعديل السؤال المحدد' : 'Edit Question')
                : (isRtl ? 'إضافة سؤال جديد' : 'Add Question')}
            </h3>
            {editingQuestionId && (
              <button
                type="button"
                onClick={resetForm}
                className="text-xs text-slate-500 hover:text-[#356AE6]"
              >
                {isRtl ? 'إلغاء التعديل' : 'Cancel Edit'}
              </button>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSaveQuestion} className="space-y-4">
            {/* Type & Points */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {isRtl ? 'نوع السؤال' : 'Question Type'}
                </label>
                <select
                  value={questionType}
                  onChange={(e) => handleTypeChange(e.target.value as QuestionType)}
                  className="w-full text-xs rounded-xl border border-slate-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#356AE6]/20 focus:border-[#356AE6]"
                >
                  <option value="multiple_choice">{isRtl ? 'اختيار من متعدد (Multiple Choice)' : 'Multiple Choice'}</option>
                  <option value="true_false">{isRtl ? 'صواب أو خطأ (True / False)' : 'True / False'}</option>
                  <option value="short_answer">{isRtl ? 'إجابة قصيرة ومقال (Short Answer)' : 'Short Answer'}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {isRtl ? 'الدرجات المخصصة' : 'Points Assigned'}
                </label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={points}
                  onChange={(e) => setPoints(Number(e.target.value))}
                />
              </div>
            </div>

            {/* Question Texts */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isRtl ? 'نص السؤال (إنجليزي) *' : 'Question Text (English) *'}
              </label>
              <textarea
                rows={2}
                required
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value)}
                placeholder="Enter the question statement..."
                className="w-full text-xs rounded-xl border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#356AE6]/20 focus:border-[#356AE6]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isRtl ? 'نص السؤال (عربي)' : 'Question Text (Arabic)'}
              </label>
              <textarea
                rows={2}
                dir="rtl"
                value={questionTextArabic}
                onChange={(e) => setQuestionTextArabic(e.target.value)}
                placeholder="أدخل نص السؤال باللغة العربية..."
                className="w-full text-xs rounded-xl border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#356AE6]/20 focus:border-[#356AE6]"
              />
            </div>

            {/* Objective Options */}
            {(questionType === 'multiple_choice' || questionType === 'true_false') && (
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-800">
                    {isRtl ? 'خيارات الإجابة (حدد الإجابة الصحيحة بالدائرة)' : 'Answer Options (Select correct answer radio)'}
                  </label>
                  {questionType === 'multiple_choice' && (
                    <button
                      type="button"
                      onClick={handleAddOption}
                      className="text-xs text-[#356AE6] hover:underline font-semibold"
                    >
                      + {isRtl ? 'إضافة خيار' : 'Add Choice'}
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  {options.map((opt, idx) => (
                    <div
                      key={idx}
                      className={`flex items-center gap-2 p-2 rounded-xl border transition-colors ${
                        opt.isCorrect ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-200 bg-white'
                      }`}
                    >
                      <input
                        type="radio"
                        name="correct_option"
                        checked={opt.isCorrect}
                        onChange={() => handleSetCorrectOption(idx)}
                        className="text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                        title={isRtl ? 'تحديد كإجابة صحيحة' : 'Mark as correct answer'}
                      />

                      <div className="flex-1 grid grid-cols-2 gap-2">
                        <Input
                          type="text"
                          placeholder={`Option ${idx + 1}`}
                          value={opt.optionText}
                          onChange={(e) => {
                            const val = e.target.value;
                            setOptions((prev) =>
                              prev.map((o, i) => (i === idx ? { ...o, optionText: val } : o))
                            );
                          }}
                        />
                        <Input
                          type="text"
                          dir="rtl"
                          placeholder={`خيار ${idx + 1}`}
                          value={opt.optionTextArabic || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setOptions((prev) =>
                              prev.map((o, i) => (i === idx ? { ...o, optionTextArabic: val } : o))
                            );
                          }}
                        />
                      </div>

                      {questionType === 'multiple_choice' && options.length > 2 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveOption(idx)}
                          className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Short Answer Details */}
            {questionType === 'short_answer' && (
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {isRtl ? 'نموذج الإجابة الاسترشادي (يظهر للمعلم أثناء التصحيح وبعد المراجعة)' : 'Model Answer (Visible to teacher and upon review)'}
                  </label>
                  <textarea
                    rows={2}
                    value={correctAnswerText}
                    onChange={(e) => setCorrectAnswerText(e.target.value)}
                    placeholder="Enter exemplary model answer or expected keywords..."
                    className="w-full text-xs rounded-xl border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#356AE6]/20 focus:border-[#356AE6]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {isRtl ? 'معايير وتوجيهات التصحيح اليدوي (Rubric)' : 'Teacher Grading Rubric / Guidelines'}
                  </label>
                  <textarea
                    rows={2}
                    value={gradingGuidelines}
                    onChange={(e) => setGradingGuidelines(e.target.value)}
                    placeholder="e.g. Award 3 pts for thesis structure, 2 pts for academic vocabulary..."
                    className="w-full text-xs rounded-xl border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#356AE6]/20 focus:border-[#356AE6]"
                  />
                </div>
              </div>
            )}

            {/* Explanations */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {isRtl ? 'التفسير الأكاديمي (إنجليزي)' : 'Explanation (English)'}
                </label>
                <textarea
                  rows={2}
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  placeholder="Rationale shown during review..."
                  className="w-full text-xs rounded-xl border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#356AE6]/20 focus:border-[#356AE6]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {isRtl ? 'التفسير الأكاديمي (عربي)' : 'Explanation (Arabic)'}
                </label>
                <textarea
                  rows={2}
                  dir="rtl"
                  value={explanationArabic}
                  onChange={(e) => setExplanationArabic(e.target.value)}
                  placeholder="الشرح التعليمي بعد التسليم..."
                  className="w-full text-xs rounded-xl border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#356AE6]/20 focus:border-[#356AE6]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <Button type="submit" disabled={saving} className="bg-[#14243A] hover:bg-[#1f3758] text-white">
                <Save className="w-3.5 h-3.5 me-1" />
                {saving ? (isRtl ? 'جارٍ الحفظ...' : 'Saving...') : isRtl ? 'حفظ السؤال' : 'Save Question'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </Modal>
  );
};
