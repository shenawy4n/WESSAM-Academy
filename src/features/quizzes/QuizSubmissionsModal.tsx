/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  UserCheck,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  Search,
  Check,
  Award,
  MessageSquare,
} from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useLocale } from '../../hooks/useLocale';
import { QuizAttemptRecord, AttemptReviewData } from './types';
import { fetchQuizSubmissions, getQuizAttemptReview, gradeStudentAttempt } from './quizService';

interface QuizSubmissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  quizId: string;
  quizTitle: string;
}

export const QuizSubmissionsModal: React.FC<QuizSubmissionsModalProps> = ({
  isOpen,
  onClose,
  quizId,
  quizTitle,
}) => {
  const { isRtl } = useLocale();

  const [submissions, setSubmissions] = useState<QuizAttemptRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Selected attempt for grading/inspection
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);
  const [reviewData, setReviewData] = useState<AttemptReviewData | null>(null);
  const [gradingLoading, setGradingLoading] = useState(false);
  const [gradesMap, setGradesMap] = useState<Record<string, { points: number; feedback: string }>>({});
  const [teacherFeedback, setTeacherFeedback] = useState('');
  const [savingGrades, setSavingGrades] = useState(false);

  const loadSubmissions = async () => {
    try {
      setLoading(true);
      setError(null);
      const list = await fetchQuizSubmissions(quizId);
      setSubmissions(list);
    } catch (err: any) {
      console.error('Failed to load submissions:', err);
      setError(err.message || 'Error loading submissions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSubmissions();
      setSelectedAttemptId(null);
      setReviewData(null);
    }
  }, [isOpen, quizId]);

  const handleSelectAttempt = async (attemptId: string) => {
    try {
      setSelectedAttemptId(attemptId);
      setGradingLoading(true);
      setError(null);
      const data = await getQuizAttemptReview(attemptId);
      setReviewData(data);
      setTeacherFeedback(data.teacherFeedback || '');

      const initialGrades: Record<string, { points: number; feedback: string }> = {};
      for (const q of data.questions) {
        initialGrades[q.questionId] = {
          points: q.pointsAwarded !== null && q.pointsAwarded !== undefined ? q.pointsAwarded : 0,
          feedback: q.teacherFeedback || '',
        };
      }
      setGradesMap(initialGrades);
    } catch (err: any) {
      console.error('Failed to load attempt details:', err);
      setError(err.message || 'Failed to load attempt');
    } finally {
      setGradingLoading(false);
    }
  };

  const handleSaveGrades = async () => {
    if (!selectedAttemptId || !reviewData) return;
    try {
      setSavingGrades(true);
      setError(null);

      const gradesPayload = Object.entries(gradesMap).map(([qId, val]) => ({
        questionId: qId,
        pointsAwarded: Number(val.points) >= 0 ? Number(val.points) : 0,
        feedback: val.feedback || undefined,
      }));

      await gradeStudentAttempt(selectedAttemptId, gradesPayload, teacherFeedback);
      await loadSubmissions();
      // Reload review
      await handleSelectAttempt(selectedAttemptId);
    } catch (err: any) {
      console.error('Failed to save manual grades:', err);
      setError(err.message || 'Failed to save grades');
    } finally {
      setSavingGrades(false);
    }
  };

  const filteredSubmissions = submissions.filter((s) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase().trim();
    return (
      s.studentName?.toLowerCase().includes(q) ||
      (s.studentNameArabic && s.studentNameArabic.toLowerCase().includes(q)) ||
      (s.studentNumber && s.studentNumber.toLowerCase().includes(q))
    );
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${isRtl ? 'تسليمات ونتائج الاختبار' : 'Submissions & Grading'} — ${quizTitle}`}
      maxWidth="2xl"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 max-h-[80vh] overflow-y-auto p-1">
        {/* Left: Submissions Roster (5 cols) */}
        <div className="lg:col-span-5 border-b lg:border-b-0 lg:border-e border-slate-200 pe-0 lg:pe-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              {isRtl ? `الطلاب والمحاولات (${filteredSubmissions.length})` : `Attempts (${filteredSubmissions.length})`}
            </h4>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              type="text"
              placeholder={isRtl ? 'البحث باسم الطالب...' : 'Search student...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="ps-9 text-xs"
            />
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs text-slate-400">
              {isRtl ? 'جارٍ تحميل التسليمات...' : 'Loading submissions...'}
            </div>
          ) : filteredSubmissions.length === 0 ? (
            <div className="p-8 text-center rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-400">
              {isRtl ? 'لم يقدم أي طالب هذا الاختبار حتى الآن.' : 'No student submissions found.'}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredSubmissions.map((s) => (
                <div
                  key={s.id}
                  onClick={() => handleSelectAttempt(s.id)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer text-xs ${
                    selectedAttemptId === s.id
                      ? 'border-[#356AE6] bg-[#356AE6]/5 shadow-xs'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="font-bold text-slate-800 block">
                        {isRtl ? s.studentNameArabic || s.studentName : s.studentName}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {isRtl ? `المحاولة رقم ${s.attemptNumber}` : `Attempt #${s.attemptNumber}`}
                      </span>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        s.status === 'graded'
                          ? s.isPassed
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                          : s.status === 'submitted'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {s.status === 'graded'
                        ? `${s.percentageScore}% ${s.isPassed ? (isRtl ? 'ناجح' : 'Passed') : (isRtl ? 'راسب' : 'Failed')}`
                        : s.status === 'submitted'
                        ? (isRtl ? 'يتطلب تصحيحاً' : 'Needs Grading')
                        : s.status}
                    </span>
                  </div>

                  <div className="mt-2 text-[10px] text-slate-500 flex items-center justify-between">
                    <span>
                      {isRtl ? 'الدرجة:' : 'Score:'}{' '}
                      <strong className="text-slate-800">
                        {s.pointsScored !== null ? `${s.pointsScored} / ${s.totalPointsPossible}` : '—'}
                      </strong>
                    </span>
                    <span>
                      {s.submittedAt ? new Date(s.submittedAt).toLocaleDateString() : '—'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Selected Attempt Review / Grading (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {!selectedAttemptId ? (
            <div className="p-12 text-center rounded-2xl bg-slate-50/60 border border-slate-100 text-slate-400 text-xs space-y-2">
              <UserCheck className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="font-semibold">{isRtl ? 'اختر تسليماً من القائمة للاطلاع والتدقيق' : 'Select a submission to review and grade'}</p>
              <p className="text-[11px] text-slate-400">
                {isRtl ? 'يمكنك تصحيح الإجابات المقالية ورصد الدرجات وإضافة ملاحظات توجيهية.' : 'You can evaluate short answers, adjust points, and provide guidance.'}
              </p>
            </div>
          ) : gradingLoading ? (
            <div className="p-12 text-center text-xs text-slate-400">
              {isRtl ? 'جارٍ تحميل إجابات الطالب...' : 'Loading attempt answers...'}
            </div>
          ) : reviewData ? (
            <div className="space-y-4">
              {/* Header metrics card */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-500 block">
                    {isRtl ? 'حالة التقييم الحالية' : 'Assessment Evaluation Status'}
                  </span>
                  <span className="text-sm font-bold text-slate-800">
                    {reviewData.status === 'graded'
                      ? `${reviewData.score} / ${reviewData.totalPossible} pts (${reviewData.percentageScore}%)`
                      : (isRtl ? 'معلق بانتظار تصحيح المقال' : 'Pending Manual Review')}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {reviewData.isPassed !== null && (
                    <span
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                        reviewData.isPassed ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {reviewData.isPassed ? (isRtl ? 'مستوفٍ لمعايير النجاح' : 'Passed') : (isRtl ? 'غير مستوفٍ للنجاح' : 'Failed')}
                    </span>
                  )}
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Questions list */}
              <div className="space-y-3">
                {reviewData.questions.map((q, idx) => (
                  <div key={q.questionId} className="p-4 rounded-xl border border-slate-200 bg-white space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-xs font-bold text-slate-800">
                        #{idx + 1} {q.questionText}
                        {q.questionTextArabic && (
                          <span className="block font-medium text-slate-600 mt-0.5" dir="rtl">
                            {q.questionTextArabic}
                          </span>
                        )}
                      </div>
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[10px] font-semibold text-slate-700">
                        {q.points} {isRtl ? 'درجات' : 'pts'}
                      </span>
                    </div>

                    {/* Student's answer display */}
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-xs space-y-1">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">
                        {isRtl ? 'إجابة الطالب المقدمة:' : 'Student Submitted Answer:'}
                      </span>
                      {q.questionType === 'short_answer' ? (
                        <p className="font-medium text-slate-800 whitespace-pre-wrap">
                          {q.studentAnswerText || <span className="text-slate-400 italic">{isRtl ? 'لم يقدم الطالب إجابة' : 'No answer submitted'}</span>}
                        </p>
                      ) : (
                        <p className="font-semibold text-slate-800">
                          {q.options.find((o) => o.id === q.studentSelectedOptionId)?.optionText || (
                            <span className="text-slate-400 italic">{isRtl ? 'لم يختر أي خيار' : 'No option selected'}</span>
                          )}
                        </p>
                      )}
                    </div>

                    {/* Model Answer if short_answer */}
                    {q.questionType === 'short_answer' && q.correctAnswerText && (
                      <div className="p-2.5 rounded-lg bg-amber-50/60 border border-amber-200/60 text-xs text-amber-900">
                        <span className="text-[10px] font-bold uppercase block text-amber-700">
                          {isRtl ? 'نموذج الإجابة الاسترشادي للمعلم:' : 'Teacher Reference Model Answer:'}
                        </span>
                        <p>{q.correctAnswerText}</p>
                      </div>
                    )}

                    {/* Grading row for this question */}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-600">
                          {isRtl ? 'الدرجة الممنوحة:' : 'Awarded Points:'}
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={q.points}
                          value={gradesMap[q.questionId]?.points ?? 0}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setGradesMap((prev) => ({
                              ...prev,
                              [q.questionId]: {
                                ...prev[q.questionId],
                                points: val,
                              },
                            }));
                          }}
                          className="w-20 text-xs font-bold rounded-lg border border-slate-200 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#356AE6]"
                        />
                        <span className="text-slate-400">/ {q.points}</span>
                      </div>

                      <div className="flex-1 max-w-xs">
                        <Input
                          type="text"
                          placeholder={isRtl ? 'ملاحظة للسؤال...' : 'Question feedback...'}
                          value={gradesMap[q.questionId]?.feedback || ''}
                          onChange={(e) => {
                            const txt = e.target.value;
                            setGradesMap((prev) => ({
                              ...prev,
                              [q.questionId]: {
                                ...prev[q.questionId],
                                feedback: txt,
                              },
                            }));
                          }}
                          className="text-xs py-1"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Overall Teacher Feedback */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <label className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
                  {isRtl ? 'الملاحظات والتوجيهات العامة للطالب' : 'Overall Teacher Feedback'}
                </label>
                <textarea
                  rows={3}
                  value={teacherFeedback}
                  onChange={(e) => setTeacherFeedback(e.target.value)}
                  placeholder={isRtl ? 'اكتب تقييمك العام لأداء الطالب في هذا الاختبار...' : 'Provide comprehensive feedback for the student...'}
                  className="w-full text-xs rounded-xl border border-slate-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#356AE6]/20 focus:border-[#356AE6]"
                />
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  onClick={handleSaveGrades}
                  disabled={savingGrades}
                  className="bg-[#14243A] hover:bg-[#1f3758] text-white"
                >
                  <Check className="w-3.5 h-3.5 me-1" />
                  {savingGrades ? (isRtl ? 'جارٍ الحفظ والاعتماد...' : 'Saving Grades...') : isRtl ? 'اعتماد وحفظ الدرجات' : 'Finalize & Save Grades'}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  );
};
