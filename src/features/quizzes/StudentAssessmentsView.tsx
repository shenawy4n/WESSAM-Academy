/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  FileQuestion,
  Clock,
  Award,
  CheckCircle2,
  AlertCircle,
  Play,
  RotateCcw,
  Eye,
  Calendar,
  Lock,
  BookOpen,
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { useLocale } from '../../hooks/useLocale';
import { QuizRecord, QuestionItem } from './types';
import { fetchStudentAssessments, startQuizAttempt } from './quizService';
import { QuizRunnerModal } from './QuizRunnerModal';
import { QuizReviewModal } from './QuizReviewModal';

export const StudentAssessmentsView: React.FC = () => {
  const { isRtl } = useLocale();

  const [quizzes, setQuizzes] = useState<QuizRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'available' | 'in_progress' | 'upcoming' | 'completed'>('all');

  // Runner state
  const [runnerOpen, setRunnerOpen] = useState(false);
  const [activeAttemptId, setActiveAttemptId] = useState<string | null>(null);
  const [runnerQuizTitle, setRunnerQuizTitle] = useState('');
  const [runnerExpiresAt, setRunnerExpiresAt] = useState('');
  const [runnerQuestions, setRunnerQuestions] = useState<QuestionItem[]>([]);
  const [startingQuizId, setStartingQuizId] = useState<string | null>(null);

  // Review state
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewAttemptId, setReviewAttemptId] = useState<string | null>(null);

  const loadAssessments = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const data = await fetchStudentAssessments();
      setQuizzes(data);
    } catch (err: unknown) {
      setLoadError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAssessments();
  }, []);

  const handleStartOrResume = async (quiz: QuizRecord) => {
    try {
      setStartingQuizId(quiz.id);
      setActionError(null);
      const res = await startQuizAttempt(quiz.id);

      setActiveAttemptId(res.attemptId);
      setRunnerQuizTitle(isRtl ? quiz.titleArabic || quiz.title : quiz.title);
      setRunnerExpiresAt(res.expiresAt);
      setRunnerQuestions(res.questionSnapshot);
      setRunnerOpen(true);
    } catch (err: unknown) {
      setActionError(err);
    } finally {
      setStartingQuizId(null);
    }
  };

  const handleRunnerSubmitted = (attemptId: string) => {
    setRunnerOpen(false);
    loadAssessments();
    // Prompt open review if allowed
    setReviewAttemptId(attemptId);
    setReviewOpen(true);
  };

  const handleOpenReview = (attemptId: string) => {
    setReviewAttemptId(attemptId);
    setReviewOpen(true);
  };

  const filteredQuizzes = quizzes.filter((q) => {
    if (activeTab === 'all') return true;
    return q.studentState === activeTab;
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <FileQuestion className="w-6 h-6 text-[#356AE6]" />
          <span>{isRtl ? 'الاختبارات والتقييمات الأكاديمية' : 'Academic Quizzes & Assessments'}</span>
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          {isRtl
            ? 'خوض الاختبارات الإلكترونية المحددة لمجموعتك الدراسية، متابعة الوقت المتبقي، ومراجعة النتائج والدرجات.'
            : 'Take timed cohort assessments, track your progress, and review verified academic scores.'}
        </p>
      </div>

      {Boolean(actionError) && (
        <ErrorState
          variant="banner"
          error={actionError}
          isRtl={isRtl}
          onDismiss={() => setActionError(null)}
        />
      )}

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'all'
              ? 'bg-[#14243A] text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          {isRtl ? 'جميع الاختبارات' : 'All Assessments'} ({quizzes.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('in_progress')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'in_progress'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          {isRtl ? 'قيد التنفيذ' : 'In Progress'} ({quizzes.filter((q) => q.studentState === 'in_progress').length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('available')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'available'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          {isRtl ? 'متاحة للبدء' : 'Available'} ({quizzes.filter((q) => q.studentState === 'available').length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('upcoming')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'upcoming'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          {isRtl ? 'قادمة قريباً' : 'Upcoming'} ({quizzes.filter((q) => q.studentState === 'upcoming').length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('completed')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'completed'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          {isRtl ? 'المكتملة' : 'Completed'} ({quizzes.filter((q) => q.studentState === 'completed').length})
        </button>
      </div>

      {/* Assessment Cards */}
      {loading ? (
        <div className="py-16 flex justify-center">
          <LoadingSpinner size="lg" />
        </div>
      ) : loadError ? (
        <ErrorState error={loadError} isRtl={isRtl} onRetry={loadAssessments} />
      ) : filteredQuizzes.length === 0 ? (
        <EmptyState
          icon={<FileQuestion className="w-6 h-6 text-[#356AE6]" />}
          title={isRtl ? 'لا توجد اختبارات في هذا القسم' : 'No assessments in this category'}
          description={
            isRtl
              ? 'ستظهر هنا الاختبارات والتقييمات المخصصة لدوراتك ومجموعتك الأكاديمية.'
              : 'Assigned assessments for your cohort and courses will appear here.'
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredQuizzes.map((quiz) => {
            const isInProgress = quiz.studentState === 'in_progress';
            const isAvailable = quiz.studentState === 'available';
            const isCompleted = quiz.studentState === 'completed';
            const isUpcoming = quiz.studentState === 'upcoming';

            return (
              <Card key={quiz.id} className="p-5 flex flex-col justify-between hover:border-slate-300 transition-all">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                        isInProgress
                          ? 'bg-amber-100 text-amber-800 animate-pulse'
                          : isAvailable
                          ? 'bg-blue-100 text-blue-800'
                          : isCompleted
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-purple-100 text-purple-800'
                      }`}
                    >
                      {isInProgress
                        ? (isRtl ? 'محاولة جارية الآن' : 'Attempt In Progress')
                        : isAvailable
                        ? (isRtl ? 'متاح لخوض الاختبار' : 'Ready to Start')
                        : isCompleted
                        ? (isRtl ? 'مكتمل' : 'Completed')
                        : (isRtl ? 'قادم قريباً' : 'Upcoming')}
                    </span>

                    {quiz.courseTitle && (
                      <span className="text-[11px] text-slate-500 font-medium truncate max-w-[160px]">
                        {isRtl ? quiz.courseTitleArabic || quiz.courseTitle : quiz.courseTitle}
                      </span>
                    )}
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-slate-900 leading-snug">
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

                  {/* Metadata Row */}
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-[11px] text-slate-600">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>{quiz.durationMinutes} {isRtl ? 'دقيقة' : 'mins'}</span>
                    </div>

                    <div className="flex items-center gap-1">
                      <Award className="w-3.5 h-3.5 text-slate-400" />
                      <span>{quiz.totalPoints} {isRtl ? 'درجة' : 'pts'}</span>
                    </div>

                    <div className="flex items-center gap-1">
                      <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                      <span>
                        {quiz.userAttemptsCount || 0} / {quiz.maxAttempts} {isRtl ? 'محاولات' : 'attempts'}
                      </span>
                    </div>
                  </div>

                  {/* Score badge if completed */}
                  {isCompleted && quiz.lastAttemptPercentage !== undefined && quiz.lastAttemptPercentage !== null && (
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between text-xs">
                      <span className="text-slate-500">{isRtl ? 'آخر نتيجة محققة:' : 'Achieved Score:'}</span>
                      <span className="font-extrabold text-slate-800">
                        {quiz.lastAttemptPercentage}%{' '}
                        {quiz.isPassed !== null && (
                          <span className={quiz.isPassed ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
                            ({quiz.isPassed ? (isRtl ? 'ناجح' : 'Passed') : (isRtl ? 'راسب' : 'Failed')})
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                </div>

                {/* Card Action Button */}
                <div className="pt-4 mt-2">
                  {isInProgress ? (
                    <Button
                      type="button"
                      onClick={() => handleStartOrResume(quiz)}
                      disabled={startingQuizId === quiz.id}
                      className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-xs"
                    >
                      <Play className="w-3.5 h-3.5 me-1.5 fill-current" />
                      {startingQuizId === quiz.id
                        ? (isRtl ? 'جارٍ الاستئناف...' : 'Resuming...')
                        : (isRtl ? 'استئناف محاولة الاختبار' : 'Resume Assessment Attempt')}
                    </Button>
                  ) : isAvailable ? (
                    <Button
                      type="button"
                      onClick={() => handleStartOrResume(quiz)}
                      disabled={startingQuizId === quiz.id}
                      className="w-full bg-[#14243A] hover:bg-[#1f3758] text-white font-bold text-xs shadow-xs"
                    >
                      <Play className="w-3.5 h-3.5 me-1.5 fill-current" />
                      {startingQuizId === quiz.id
                        ? (isRtl ? 'جارٍ البدء...' : 'Starting...')
                        : (isRtl ? 'بدء الاختبار الآن' : 'Start Assessment')}
                    </Button>
                  ) : isCompleted ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={async () => {
                        if (quiz.activeAttemptId) {
                          handleOpenReview(quiz.activeAttemptId);
                          return;
                        }
                        try {
                          setActionError(null);
                          const res = await startQuizAttempt(quiz.id);
                          handleOpenReview(res.attemptId);
                        } catch (err: unknown) {
                          setActionError(err);
                        }
                      }}
                      className="w-full text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      <Eye className="w-3.5 h-3.5 me-1.5 text-[#356AE6]" />
                      {isRtl ? 'عرض النتيجة والمراجعة' : 'Review Results & Feedback'}
                    </Button>
                  ) : (
                    <div className="w-full py-2 px-3 rounded-xl bg-slate-100 text-center text-xs font-medium text-slate-500 flex items-center justify-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-slate-400" />
                      <span>
                        {quiz.startDate
                          ? `${isRtl ? 'يُفتح في:' : 'Opens on:'} ${new Date(quiz.startDate).toLocaleDateString()}`
                          : (isRtl ? 'غير متاح حالياً' : 'Not available yet')}
                      </span>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Quiz Runner Modal */}
      {runnerOpen && activeAttemptId && (
        <QuizRunnerModal
          key={activeAttemptId}
          isOpen={runnerOpen}
          onClose={() => setRunnerOpen(false)}
          attemptId={activeAttemptId}
          quizTitle={runnerQuizTitle}
          expiresAt={runnerExpiresAt}
          questions={runnerQuestions}
          onSubmitted={handleRunnerSubmitted}
        />
      )}

      {/* Quiz Review Modal */}
      {reviewOpen && reviewAttemptId && (
        <QuizReviewModal
          isOpen={reviewOpen}
          onClose={() => setReviewOpen(false)}
          attemptId={reviewAttemptId}
        />
      )}
    </div>
  );
};
