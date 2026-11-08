/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Award,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Clock,
  MessageSquare,
  Lock,
  AlertCircle,
} from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { useLocale } from '../../hooks/useLocale';
import { AttemptReviewData } from './types';
import { getQuizAttemptReview } from './quizService';

interface QuizReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  attemptId: string;
}

export const QuizReviewModal: React.FC<QuizReviewModalProps> = ({
  isOpen,
  onClose,
  attemptId,
}) => {
  const { isRtl } = useLocale();

  const [review, setReview] = useState<AttemptReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    async function loadReview() {
      try {
        setLoading(true);
        setError(null);
        const data = await getQuizAttemptReview(attemptId);
        setReview(data);
      } catch (err: any) {
        console.error('Error loading review:', err);
        setError(err.message || 'Failed to load review');
      } finally {
        setLoading(false);
      }
    }
    loadReview();
  }, [isOpen, attemptId]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={review ? `${isRtl ? 'نتيجة ومراجعة:' : 'Results & Review:'} ${isRtl ? review.quizTitleArabic || review.quizTitle : review.quizTitle}` : (isRtl ? 'مراجعة الاختبار' : 'Assessment Review')}
      maxWidth="xl"
    >
      {loading ? (
        <div className="py-16 text-center text-xs text-slate-400">
          {isRtl ? 'جارٍ تحميل النتائج والمراجعة...' : 'Loading review details...'}
        </div>
      ) : error ? (
        <div className="p-8 text-center text-rose-600 bg-rose-50 rounded-2xl">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 text-rose-500" />
          <p className="font-semibold text-sm">{error}</p>
        </div>
      ) : review ? (
        <div className="space-y-5 max-h-[75vh] overflow-y-auto p-1">
          {/* Result Banner */}
          <div className="p-5 rounded-2xl bg-[#14243A] text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
            <div>
              <span className="text-xs text-[#D8B96C] font-semibold uppercase tracking-wider block mb-1">
                {isRtl ? 'النتيجة النهائية للاختبار' : 'Final Assessment Result'}
              </span>
              <div className="flex items-baseline gap-2">
                {review.allowScores && review.score !== null ? (
                  <>
                    <span className="text-3xl font-extrabold text-white">{review.percentageScore}%</span>
                    <span className="text-xs text-slate-300">
                      ({review.score} / {review.totalPossible} {isRtl ? 'درجة' : 'pts'})
                    </span>
                  </>
                ) : (
                  <span className="text-sm font-semibold text-slate-300">
                    {isRtl ? 'الدرجات قيد الاعتماد من المعلم' : 'Scores pending instructor evaluation'}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {review.isPassed !== null && review.allowScores ? (
                <span
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 ${
                    review.isPassed
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  }`}
                >
                  {review.isPassed ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>{isRtl ? 'ناجح (مستوفٍ للمعايير)' : 'Passed'}</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 text-rose-400" />
                      <span>{isRtl ? 'راسب (دون درجة النجاح)' : 'Needs Improvement'}</span>
                    </>
                  )}
                </span>
              ) : review.requiresManualGrading ? (
                <span className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {isRtl ? 'بانتظار تصحيح الأسئلة المقالية' : 'Short Answer Pending Evaluation'}
                </span>
              ) : null}
            </div>
          </div>

          {/* Teacher Overall Feedback */}
          {review.teacherFeedback && (
            <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 text-blue-950 space-y-1">
              <span className="text-xs font-bold text-blue-800 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" />
                {isRtl ? 'ملاحظات المعلم التوجيهية' : 'Teacher Guidance & Feedback'}
              </span>
              <p className="text-xs text-blue-900 whitespace-pre-wrap">{review.teacherFeedback}</p>
            </div>
          )}

          {/* Correct Answers Restriction Notice */}
          {!review.allowCorrectAnswers && (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-3 text-xs text-slate-600">
              <Lock className="w-4 h-4 text-slate-400 shrink-0" />
              <span>
                {isRtl
                  ? 'نموذج الحلول والشروحات الأكاديمية محجوب لحين إغلاق موعد الاختبار لضمان النزاهة الأكاديمية.'
                  : 'Answer keys and rationale are hidden by policy until the assessment window concludes.'}
              </span>
            </div>
          )}

          {/* Questions Review Breakdown */}
          <div className="space-y-3">
            {review.questions.map((q, idx) => {
              const isCorrect = q.isCorrect;
              return (
                <div key={q.questionId} className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-xs font-bold text-slate-800">
                      #{idx + 1} {q.questionText}
                      {q.questionTextArabic && (
                        <span className="block font-medium text-slate-600 mt-0.5" dir="rtl">
                          {q.questionTextArabic}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {review.allowCorrectAnswers && isCorrect !== null && (
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            isCorrect ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {isCorrect ? (isRtl ? 'إجابة صحيحة' : 'Correct') : (isRtl ? 'إجابة خاطئة' : 'Incorrect')}
                        </span>
                      )}

                      {review.allowScores && q.pointsAwarded !== null && (
                        <span className="text-xs font-bold text-slate-700">
                          {q.pointsAwarded} / {q.points} {isRtl ? 'درجات' : 'pts'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Student's Selected Answer */}
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 text-xs space-y-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">
                      {isRtl ? 'إجابتك المسجلة:' : 'Your Submitted Answer:'}
                    </span>
                    {q.questionType === 'short_answer' ? (
                      <p className="font-medium text-slate-800 whitespace-pre-wrap">
                        {q.studentAnswerText || <span className="text-slate-400 italic">{isRtl ? 'لم يتم تقديم إجابة' : 'No answer provided'}</span>}
                      </p>
                    ) : (
                      <p className="font-semibold text-slate-800">
                        {q.options.find((o) => o.id === q.studentSelectedOptionId)?.optionText || (
                          <span className="text-slate-400 italic">{isRtl ? 'لم تختر إجابة' : 'No option chosen'}</span>
                        )}
                      </p>
                    )}
                  </div>

                  {/* Options List with Correct Answer Highlight (if allowed) */}
                  {review.allowCorrectAnswers && (q.questionType === 'multiple_choice' || q.questionType === 'true_false') && (
                    <div className="space-y-1.5 pt-1">
                      {q.options.map((opt) => {
                        const isStudentChoice = q.studentSelectedOptionId === opt.id;
                        const isOptCorrect = opt.isCorrect;
                        return (
                          <div
                            key={opt.id}
                            className={`p-2.5 rounded-lg text-xs flex items-center justify-between border ${
                              isOptCorrect
                                ? 'border-emerald-300 bg-emerald-50/50 text-emerald-900 font-bold'
                                : isStudentChoice && !isOptCorrect
                                ? 'border-rose-300 bg-rose-50/50 text-rose-900'
                                : 'border-slate-100 bg-white text-slate-600'
                            }`}
                          >
                            <span>{opt.optionText}</span>
                            {isOptCorrect && (
                              <span className="text-[10px] text-emerald-700 font-bold">
                                ✓ {isRtl ? 'الإجابة النموذجية' : 'Correct Answer'}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Short Answer Model Answer (if allowed) */}
                  {review.allowCorrectAnswers && q.questionType === 'short_answer' && q.correctAnswerText && (
                    <div className="p-2.5 rounded-lg bg-emerald-50/60 border border-emerald-200 text-xs text-emerald-900">
                      <span className="text-[10px] font-bold uppercase block text-emerald-700">
                        {isRtl ? 'نموذج الإجابة الصحيحة:' : 'Model Answer:'}
                      </span>
                      <p>{q.correctAnswerText}</p>
                    </div>
                  )}

                  {/* Explanation (if allowed) */}
                  {review.allowCorrectAnswers && (q.explanation || q.explanationArabic) && (
                    <div className="p-2.5 rounded-lg bg-blue-50/50 border border-blue-100 text-xs text-blue-900">
                      <span className="text-[10px] font-bold uppercase block text-blue-700">
                        {isRtl ? 'الشرح والتوضيح الأكاديمي:' : 'Academic Explanation:'}
                      </span>
                      <p>{isRtl ? q.explanationArabic || q.explanation : q.explanation}</p>
                    </div>
                  )}

                  {/* Per-question feedback from teacher */}
                  {q.teacherFeedback && (
                    <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
                      <span className="text-[10px] font-bold uppercase block text-amber-700">
                        {isRtl ? 'ملاحظة المعلم لهذا السؤال:' : 'Teacher Feedback for this question:'}
                      </span>
                      <p>{q.teacherFeedback}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex justify-end pt-3 border-t border-slate-100">
            <Button type="button" onClick={onClose} className="bg-[#14243A] hover:bg-[#1f3758] text-white text-xs">
              {isRtl ? 'إغلاق المراجعة' : 'Close Review'}
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
};
