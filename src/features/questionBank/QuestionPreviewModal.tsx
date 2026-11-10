import React from 'react';
import { X, CheckCircle, Clock, BookOpen, Layers } from 'lucide-react';
import { QuestionBankItem } from './types';
import { QUESTION_TYPES, DIFFICULTY_LEVELS } from './questionBankUtils';

interface QuestionPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  question: QuestionBankItem | null;
}

export const QuestionPreviewModal: React.FC<QuestionPreviewModalProps> = ({
  isOpen,
  onClose,
  question,
}) => {
  if (!isOpen || !question) return null;

  const typeConfig = QUESTION_TYPES.find((t) => t.value === question.question_type);
  const diffConfig = DIFFICULTY_LEVELS.find((d) => d.value === question.difficulty);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[85vh]"
        dir="rtl"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 className="text-lg font-bold text-slate-800">معاينة السؤال (كما يظهر للطالب)</h2>
            <p className="text-xs text-slate-500">Student View & Teacher Answer Key Preview</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Metadata badges */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
              {typeConfig?.labelAr || question.question_type}
            </span>
            <span className={`px-2.5 py-1 text-xs font-semibold rounded-lg border ${diffConfig?.color}`}>
              {diffConfig?.labelAr || question.difficulty}
            </span>
            <span className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200">
              {question.points} {question.points === 1 ? 'درجة' : 'درجات'}
            </span>
            {question.time_limit_seconds && (
              <span className="px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-100 text-slate-600 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                <span>{question.time_limit_seconds} ثانية</span>
              </span>
            )}
            {question.course?.title && (
              <span className="px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-100 text-slate-600 flex items-center gap-1">
                <BookOpen className="w-3.5 h-3.5" />
                <span>{question.course.title_arabic || question.course.title}</span>
              </span>
            )}
            {question.topic && (
              <span className="px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-100 text-slate-600 flex items-center gap-1">
                <Layers className="w-3.5 h-3.5" />
                <span>{question.topic}</span>
              </span>
            )}
          </div>

          {/* Question Text */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
            <div dir="ltr" className="text-base font-semibold text-slate-900 leading-relaxed font-sans">
              {question.question_text}
            </div>
            {question.question_text_arabic && (
              <div dir="rtl" className="text-sm font-medium text-slate-700 border-t border-slate-200/60 pt-2 font-sans">
                {question.question_text_arabic}
              </div>
            )}
          </div>

          {/* Options Display */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
              {question.question_type === 'matching' ? 'أزواج التوصيل والحل' : 'الخيارات والإجابة النموذجية'}
            </h3>

            {question.question_type === 'matching' ? (
              <div className="space-y-2">
                {(question.options || []).map((opt, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 rounded-xl border border-emerald-200 bg-emerald-50/30 text-sm"
                  >
                    <span dir="ltr" className="font-medium text-slate-800">
                      {opt.option_text}
                    </span>
                    <span className="text-emerald-600 font-bold px-3">➔</span>
                    <span dir="ltr" className="font-semibold text-emerald-800">
                      {opt.target_match_text}
                    </span>
                  </div>
                ))}
              </div>
            ) : question.question_type === 'essay' ? (
              <div className="p-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-center text-xs text-slate-500">
                [مساحة مخصصة لكتابة الطالب إجابته المقالية بحرية]
              </div>
            ) : (
              <div className="space-y-2">
                {(question.options || []).map((opt, idx) => (
                  <div
                    key={idx}
                    className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
                      opt.is_correct
                        ? 'border-emerald-300 bg-emerald-50/50 text-emerald-950 font-medium'
                        : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${
                        opt.is_correct
                          ? 'bg-emerald-600 text-white'
                          : 'border border-slate-300 bg-slate-50 text-slate-400'
                      }`}
                    >
                      {opt.is_correct ? <CheckCircle className="w-3.5 h-3.5" /> : idx + 1}
                    </div>

                    <div className="flex-1">
                      <div dir="ltr" className="text-sm font-sans">
                        {opt.option_text}
                      </div>
                      {opt.option_text_arabic && (
                        <div dir="rtl" className="text-xs text-slate-500 mt-0.5">
                          {opt.option_text_arabic}
                        </div>
                      )}
                    </div>

                    {opt.is_correct && (
                      <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-md">
                        الإجابة الصحيحة
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Explanation / Model Answer */}
          {question.explanation && (
            <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 text-xs text-amber-900 space-y-1">
              <span className="font-bold block">التفسير والشرح النموذجي:</span>
              <p className="leading-relaxed">{question.explanation}</p>
            </div>
          )}

          {/* Tags */}
          {question.tags && question.tags.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap pt-2">
              <span className="text-xs text-slate-400">الوسوم:</span>
              {question.tags.map((t, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 text-[11px] rounded-md bg-slate-100 text-slate-600 font-medium"
                >
                  #{t}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl transition-colors"
          >
            إغلاق المعاينة
          </button>
        </div>
      </div>
    </div>
  );
};
