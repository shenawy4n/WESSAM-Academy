/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Clock,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Send,
  Save,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { useLocale } from '../../hooks/useLocale';
import { QuestionItem } from './types';
import { saveQuizAnswers, submitQuizAttempt } from './quizService';
import { calculateRemainingSeconds, formatTimerDisplay } from './quizScoring';

interface QuizRunnerModalProps {
  isOpen: boolean;
  onClose: () => void;
  attemptId: string;
  quizTitle: string;
  expiresAt: string;
  questions: QuestionItem[];
  onSubmitted: (attemptId: string) => void;
}

export const QuizRunnerModal: React.FC<QuizRunnerModalProps> = ({
  isOpen,
  onClose,
  attemptId,
  quizTitle,
  expiresAt,
  questions,
  onSubmitted,
}) => {
  const { isRtl } = useLocale();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, { optionId?: string; text?: string }>>({});
  const [remainingSeconds, setRemainingSeconds] = useState<number>(() => calculateRemainingSeconds(expiresAt));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);

  // Timer interval
  useEffect(() => {
    if (!isOpen) return;

    const interval = setInterval(() => {
      const sec = calculateRemainingSeconds(expiresAt);
      setRemainingSeconds(sec);

      if (sec <= 0) {
        clearInterval(interval);
        // Time expired! Auto-submit
        handleAutoSubmitOnExpiry();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, expiresAt]);

  const handleAutoSubmitOnExpiry = async () => {
    if (isSubmitting) return;
    try {
      setIsSubmitting(true);
      const answersPayload = Object.entries(selectedAnswers).map(([qId, val]) => ({
        questionId: qId,
        selectedOptionId: val.optionId || null,
        answerText: val.text || null,
      }));
      await submitQuizAttempt(attemptId, answersPayload);
      onSubmitted(attemptId);
    } catch (err: any) {
      console.error('Auto-submit on expiry error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Autosave when answer changes (debounced)
  const autosaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleSelectOption = (questionId: string, optionId: string) => {
    setSelectedAnswers((prev) => {
      const next = {
        ...prev,
        [questionId]: { ...prev[questionId], optionId },
      };
      triggerAutoSave(next);
      return next;
    });
  };

  const handleTextAnswerChange = (questionId: string, text: string) => {
    setSelectedAnswers((prev) => {
      const next = {
        ...prev,
        [questionId]: { ...prev[questionId], text },
      };
      triggerAutoSave(next);
      return next;
    });
  };

  const triggerAutoSave = (answersState: Record<string, { optionId?: string; text?: string }>) => {
    setSaveStatus('saving');
    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
    }

    autosaveTimeoutRef.current = setTimeout(async () => {
      try {
        const payload = Object.entries(answersState).map(([qId, val]) => ({
          questionId: qId,
          selectedOptionId: val.optionId || null,
          answerText: val.text || null,
        }));
        await saveQuizAnswers(attemptId, payload);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch (err) {
        console.error('Background autosave error:', err);
        setSaveStatus('idle');
      }
    }, 800);
  };

  const handleFinalSubmit = async () => {
    try {
      setIsSubmitting(true);
      setError(null);

      const answersPayload = Object.entries(selectedAnswers).map(([qId, val]) => ({
        questionId: qId,
        selectedOptionId: val.optionId || null,
        answerText: val.text || null,
      }));

      await submitQuizAttempt(attemptId, answersPayload);
      setConfirmSubmitOpen(false);
      onSubmitted(attemptId);
    } catch (err: any) {
      console.error('Submission error:', err);
      setError(err.message || 'Submission failed');
      setIsSubmitting(false);
    }
  };

  const currentQ = questions[currentIndex];
  const isLastQuestion = currentIndex === questions.length - 1;
  const answeredCount = Object.keys(selectedAnswers).filter((k) => {
    const a = selectedAnswers[k];
    return a?.optionId || (a?.text && a.text.trim().length > 0);
  }).length;

  const isUrgentTimer = remainingSeconds <= 300; // Under 5 mins

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (window.confirm(isRtl ? 'هل تريد الخروج؟ يمكنك استئناف المحاولة لاحقاً قبل انتهاء الوقت.' : 'Leave assessment? You can resume before the timer expires.')) {
          onClose();
        }
      }}
      title={quizTitle}
      maxWidth="xl"
    >
      <div className="space-y-4">
        {/* Top Control Bar: Server Countdown & Autosave */}
        <div className="p-3.5 rounded-2xl bg-[#14243A] text-white flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-300">
              {isRtl ? 'السؤال' : 'Question'} <strong className="text-white">{currentIndex + 1}</strong> {isRtl ? 'من' : 'of'} {questions.length}
            </span>
            <span className="text-slate-400 text-xs">•</span>
            <span className="text-xs text-emerald-400">
              {answeredCount} {isRtl ? 'مُجاب' : 'answered'}
            </span>
          </div>

          <div className="flex items-center gap-4">
            {saveStatus === 'saving' && (
              <span className="text-[11px] text-slate-300 animate-pulse flex items-center gap-1">
                <Save className="w-3 h-3" />
                {isRtl ? 'جارٍ الحفظ التلقائي...' : 'Autosaving...'}
              </span>
            )}
            {saveStatus === 'saved' && (
              <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                {isRtl ? 'تم الحفظ' : 'Saved'}
              </span>
            )}

            {/* Countdown Badge */}
            <div
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold font-mono transition-colors ${
                isUrgentTimer
                  ? 'bg-rose-500 text-white animate-pulse'
                  : 'bg-white/10 text-white border border-white/20'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>{formatTimerDisplay(remainingSeconds)}</span>
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Question Content */}
        {currentQ && (
          <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 leading-snug">
                  {currentQ.questionText}
                </h3>
                {currentQ.questionTextArabic && (
                  <p className="text-sm font-medium text-slate-600 mt-1" dir="rtl">
                    {currentQ.questionTextArabic}
                  </p>
                )}
              </div>

              <span className="shrink-0 px-2.5 py-1 rounded-lg bg-slate-100 text-xs font-semibold text-slate-700">
                {currentQ.points} {isRtl ? 'درجات' : 'pts'}
              </span>
            </div>

            {/* Options for Multiple Choice & True/False */}
            {(currentQ.questionType === 'multiple_choice' || currentQ.questionType === 'true_false') && (
              <div className="space-y-2.5 pt-2">
                {currentQ.options.map((option) => {
                  const isSelected = selectedAnswers[currentQ.id]?.optionId === option.id;
                  return (
                    <label
                      key={option.id}
                      onClick={() => handleSelectOption(currentQ.id, option.id)}
                      className={`flex items-center gap-3 p-3.5 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'border-[#356AE6] bg-[#356AE6]/5 shadow-xs font-semibold text-slate-900'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50 text-slate-700'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`q_${currentQ.id}`}
                        checked={isSelected}
                        onChange={() => handleSelectOption(currentQ.id, option.id)}
                        className="text-[#356AE6] focus:ring-[#356AE6] w-4 h-4 cursor-pointer"
                      />
                      <div className="flex-1 flex items-center justify-between text-xs sm:text-sm">
                        <span>{option.optionText}</span>
                        {option.optionTextArabic && (
                          <span className="text-slate-500 font-normal" dir="rtl">
                            {option.optionTextArabic}
                          </span>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            {/* Short Answer Text Area */}
            {currentQ.questionType === 'short_answer' && (
              <div className="space-y-2 pt-2">
                <textarea
                  rows={5}
                  value={selectedAnswers[currentQ.id]?.text || ''}
                  onChange={(e) => handleTextAnswerChange(currentQ.id, e.target.value)}
                  placeholder={isRtl ? 'اكتب إجابتك الأكاديمية المفصلة هنا...' : 'Compose your structured academic response here...'}
                  className="w-full text-xs sm:text-sm rounded-xl border border-slate-200 p-3.5 focus:outline-none focus:ring-2 focus:ring-[#356AE6]/20 focus:border-[#356AE6]"
                />
                <span className="text-[11px] text-slate-400 block">
                  {isRtl ? 'سيتم مراجعة وتدقيق هذه الإجابة يدوياً من قِبل المعلم.' : 'This response will be reviewed and graded manually by the instructor.'}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Questions Navigator Grid */}
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {questions.map((q, idx) => {
              const isAns = !!selectedAnswers[q.id]?.optionId || !!selectedAnswers[q.id]?.text?.trim();
              const isCurrent = idx === currentIndex;
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => setCurrentIndex(idx)}
                  className={`w-7 h-7 rounded-lg text-xs font-bold transition-all ${
                    isCurrent
                      ? 'bg-[#14243A] text-white shadow-xs'
                      : isAns
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>

          {/* Navigation Controls */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
              className="text-xs"
            >
              <ChevronLeft className="w-3.5 h-3.5 me-1 rtl:rotate-180" />
              {isRtl ? 'السابق' : 'Previous'}
            </Button>

            {!isLastQuestion ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1))}
                className="text-xs"
              >
                {isRtl ? 'التالي' : 'Next'}
                <ChevronRight className="w-3.5 h-3.5 ms-1 rtl:rotate-180" />
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={() => setConfirmSubmitOpen(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
              >
                <Send className="w-3.5 h-3.5 me-1" />
                {isRtl ? 'تسليم الاختبار' : 'Submit Exam'}
              </Button>
            )}
          </div>
        </div>

        {/* Submit Confirmation Dialog */}
        {confirmSubmitOpen && (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 space-y-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-xs">
                  {isRtl ? 'تأكيد تسليم الاختبار النهائي' : 'Confirm Final Assessment Submission'}
                </h4>
                <p className="text-xs text-amber-800 mt-1">
                  {isRtl
                    ? `لقد أجبت على ${answeredCount} من أصل ${questions.length} سؤال. بعد التسليم، لن تتمكن من تعديل إجاباتك.`
                    : `You have answered ${answeredCount} of ${questions.length} questions. You will not be able to modify answers after submission.`}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-amber-200/60">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirmSubmitOpen(false)}
                disabled={isSubmitting}
                className="text-xs"
              >
                {isRtl ? 'متابعة المراجعة' : 'Keep Reviewing'}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleFinalSubmit}
                disabled={isSubmitting}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
              >
                {isSubmitting ? (isRtl ? 'جارٍ التسليم...' : 'Submitting...') : isRtl ? 'تأكيد التسليم الآن' : 'Confirm & Submit'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
