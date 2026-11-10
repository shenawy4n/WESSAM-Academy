import React, { useState } from 'react';
import { X, Plus, Trash2, Check, AlertCircle, HelpCircle } from 'lucide-react';
import {
  QuestionBankItem,
  QuestionOptionItem,
  QuestionType,
  DifficultyLevel,
} from './types';
import { QUESTION_TYPES, DIFFICULTY_LEVELS, validateQuestionItem } from './questionBankUtils';

interface QuestionEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: Partial<QuestionBankItem>, options: QuestionOptionItem[]) => Promise<void>;
  initialItem?: QuestionBankItem | null;
  courses: { id: string; title: string; title_arabic?: string | null }[];
}

export const QuestionEditorModal: React.FC<QuestionEditorModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialItem,
  courses,
}) => {
  if (!isOpen) return null;

  const [questionText, setQuestionText] = useState(initialItem?.question_text || '');
  const [questionTextArabic, setQuestionTextArabic] = useState(initialItem?.question_text_arabic || '');
  const [questionType, setQuestionType] = useState<QuestionType>(initialItem?.question_type || 'multiple_choice');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>(initialItem?.difficulty || 'medium');
  const [points, setPoints] = useState<number>(initialItem?.points !== undefined ? initialItem.points : 2);
  const [timeLimitSeconds, setTimeLimitSeconds] = useState<number | ''>(initialItem?.time_limit_seconds || '');
  const [courseId, setCourseId] = useState<string>(initialItem?.course_id || '');
  const [topic, setTopic] = useState<string>(initialItem?.topic || '');
  const [tagsInput, setTagsInput] = useState<string>((initialItem?.tags || []).join(', '));
  const [explanation, setExplanation] = useState<string>(initialItem?.explanation || '');

  // Options state
  const [options, setOptions] = useState<QuestionOptionItem[]>(() => {
    if (initialItem?.options && initialItem.options.length > 0) {
      return initialItem.options;
    }
    // Default options by type
    if (questionType === 'multiple_choice') {
      return [
        { option_text: '', is_correct: true, order_index: 0 },
        { option_text: '', is_correct: false, order_index: 1 },
        { option_text: '', is_correct: false, order_index: 2 },
        { option_text: '', is_correct: false, order_index: 3 },
      ];
    }
    if (questionType === 'true_false') {
      return [
        { option_text: 'True', option_text_arabic: 'صح', is_correct: true, order_index: 0 },
        { option_text: 'False', option_text_arabic: 'خطأ', is_correct: false, order_index: 1 },
      ];
    }
    if (questionType === 'matching') {
      return [
        { option_text: '', target_match_text: '', is_correct: true, order_index: 0 },
        { option_text: '', target_match_text: '', is_correct: true, order_index: 1 },
      ];
    }
    if (questionType === 'short_answer' || questionType === 'fill_in_the_blank') {
      return [{ option_text: '', is_correct: true, order_index: 0 }];
    }
    return [];
  });

  const [saving, setSaving] = useState(false);
  const [clientErrors, setClientErrors] = useState<string[]>([]);

  // When question type changes, initialize appropriate options if empty/mismatched
  const handleTypeChange = (newType: QuestionType) => {
    setQuestionType(newType);
    if (newType === 'multiple_choice' || newType === 'multiple_select') {
      setOptions([
        { option_text: '', is_correct: true, order_index: 0 },
        { option_text: '', is_correct: false, order_index: 1 },
        { option_text: '', is_correct: false, order_index: 2 },
      ]);
    } else if (newType === 'true_false') {
      setOptions([
        { option_text: 'True', option_text_arabic: 'صح', is_correct: true, order_index: 0 },
        { option_text: 'False', option_text_arabic: 'خطأ', is_correct: false, order_index: 1 },
      ]);
    } else if (newType === 'matching') {
      setOptions([
        { option_text: '', target_match_text: '', is_correct: true, order_index: 0 },
        { option_text: '', target_match_text: '', is_correct: true, order_index: 1 },
      ]);
    } else if (newType === 'short_answer' || newType === 'fill_in_the_blank') {
      setOptions([{ option_text: '', is_correct: true, order_index: 0 }]);
    } else if (newType === 'essay') {
      setOptions([]);
    }
  };

  const handleOptionCorrectToggle = (index: number) => {
    if (questionType === 'multiple_choice' || questionType === 'true_false') {
      setOptions(
        options.map((opt, i) => ({
          ...opt,
          is_correct: i === index,
        }))
      );
    } else {
      // multi select
      setOptions(
        options.map((opt, i) => (i === index ? { ...opt, is_correct: !opt.is_correct } : opt))
      );
    }
  };

  const handleAddOption = () => {
    if (questionType === 'matching') {
      setOptions([
        ...options,
        {
          option_text: '',
          target_match_text: '',
          is_correct: true,
          order_index: options.length,
        },
      ]);
    } else {
      setOptions([
        ...options,
        {
          option_text: '',
          is_correct: false,
          order_index: options.length,
        },
      ]);
    }
  };

  const handleRemoveOption = (index: number) => {
    setOptions(options.filter((_, i) => i !== index).map((o, idx) => ({ ...o, order_index: idx })));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setClientErrors([]);

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const partialItem: Partial<QuestionBankItem> = {
      ...(initialItem?.id ? { id: initialItem.id } : {}),
      question_text: questionText.trim(),
      question_text_arabic: questionTextArabic.trim() || null,
      question_type: questionType,
      difficulty,
      points: Number(points) || 1,
      time_limit_seconds: timeLimitSeconds === '' ? null : Number(timeLimitSeconds),
      course_id: courseId || null,
      topic: topic.trim() || null,
      tags,
      explanation: explanation.trim() || null,
      is_active: initialItem?.is_active !== undefined ? initialItem.is_active : true,
    };

    // Validate
    const issues = validateQuestionItem(partialItem, options);
    if (issues.length > 0) {
      setClientErrors(issues.map((i) => `${i.messageArabic} (${i.message})`));
      return;
    }

    setSaving(true);
    try {
      await onSave(partialItem, options);
      onClose();
    } catch (err: any) {
      setClientErrors([err.message || 'حدث خطأ أثناء حفظ السؤال']);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]"
        dir="rtl"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 className="text-xl font-bold text-slate-800">
              {initialItem ? 'تعديل سؤال في بنك الأسئلة' : 'إضافة سؤال جديد لبنك الأسئلة'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {initialItem ? 'Edit Question in Bank' : 'Create New Bank Question'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-5">
          {clientErrors.length > 0 && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-1">
              <div className="flex items-center gap-2 text-rose-800 font-semibold text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>يرجى تصحيح الأخطاء التالية قبل الحفظ:</span>
              </div>
              <ul className="list-disc list-inside text-xs text-rose-700 space-y-0.5">
                {clientErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Type & Difficulty Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                نوع السؤال / Type *
              </label>
              <select
                value={questionType}
                onChange={(e) => handleTypeChange(e.target.value as QuestionType)}
                className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2 bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              >
                {QUESTION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.labelAr} ({t.labelEn})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                مستوى الصعوبة / Difficulty *
              </label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as DifficultyLevel)}
                className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2 bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              >
                {DIFFICULTY_LEVELS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.labelAr} - {d.labelEn}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  الدرجة / Points *
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={points}
                  onChange={(e) => setPoints(parseFloat(e.target.value) || 0)}
                  className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2 bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  الوقت (ثوانٍ)
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder="اختياري"
                  value={timeLimitSeconds}
                  onChange={(e) =>
                    setTimeLimitSeconds(e.target.value === '' ? '' : parseInt(e.target.value))
                  }
                  className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2 bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Question Text (English) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700">
                نص السؤال (الإنجليزية) / Question Text (English) *
              </label>
              <span className="text-[11px] text-slate-400">LTR</span>
            </div>
            <textarea
              dir="ltr"
              rows={2}
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              placeholder="e.g. Which of the following is an irregular verb?"
              className="w-full text-sm font-sans border border-slate-300 rounded-xl p-3 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 bg-white"
              required
            />
          </div>

          {/* Question Text (Arabic) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700">
                نص السؤال (العربية) / Arabic Question Text (Optional)
              </label>
              <span className="text-[11px] text-slate-400">RTL</span>
            </div>
            <textarea
              dir="rtl"
              rows={2}
              value={questionTextArabic}
              onChange={(e) => setQuestionTextArabic(e.target.value)}
              placeholder="مثال: أي من الأفعال التالية يعتبر فعلاً غير منتظم؟"
              className="w-full text-sm font-sans border border-slate-300 rounded-xl p-3 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 bg-white"
            />
          </div>

          {/* Course & Topic */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                الكورس المرتبط / Course (Optional)
              </label>
              <select
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2 bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">عام / غير مقيد بكورس معين</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title_arabic ? `${c.title_arabic} (${c.title})` : c.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                الموضوع / Topic
              </label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="مثال: Past Tense, Passive Voice, Vocabulary"
                className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2 bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              الوسوم / Tags (مفصولة بفواصل)
            </label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="grammar, unit-3, quiz-midterm, past-tense"
              className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2 bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Dynamic Options Section based on questionType */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-800">
                  {questionType === 'matching'
                    ? 'أزواج التوصيل / Matching Pairs'
                    : questionType === 'short_answer' || questionType === 'fill_in_the_blank'
                    ? 'الإجابات المقبولة / Accepted Answers'
                    : questionType === 'essay'
                    ? 'معايير التصحيح المقالي / Essay Grading Criteria'
                    : 'الخيارات والإجابة الصحيحة / Options & Correct Answer'}
                </h3>
                <p className="text-xs text-slate-500">
                  {questionType === 'multiple_choice'
                    ? 'حدد خياراً واحداً كإجابة صحيحة'
                    : questionType === 'multiple_select'
                    ? 'يمكن تحديد أكثر من إجابة صحيحة'
                    : questionType === 'matching'
                    ? 'أدخل العنصر الأساسي والعنصر المطابق المقابل له'
                    : ''}
                </p>
              </div>

              {['multiple_choice', 'multiple_select', 'matching', 'short_answer'].includes(
                questionType
              ) && (
                <button
                  type="button"
                  onClick={handleAddOption}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1.5 rounded-lg transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة عنصر</span>
                </button>
              )}
            </div>

            {/* Options List */}
            {questionType === 'matching' ? (
              <div className="space-y-2">
                {options.map((opt, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 bg-white p-2.5 rounded-xl border border-slate-200"
                  >
                    <span className="text-xs font-bold text-slate-400 w-5">{idx + 1}.</span>
                    <input
                      type="text"
                      dir="ltr"
                      placeholder="العنصر الأساسي (Item A)"
                      value={opt.option_text}
                      onChange={(e) => {
                        const copy = [...options];
                        copy[idx].option_text = e.target.value;
                        setOptions(copy);
                      }}
                      className="flex-1 text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                    />
                    <span className="text-slate-400 font-bold">➔</span>
                    <input
                      type="text"
                      dir="ltr"
                      placeholder="المطابق له (Target Match)"
                      value={opt.target_match_text || ''}
                      onChange={(e) => {
                        const copy = [...options];
                        copy[idx].target_match_text = e.target.value;
                        setOptions(copy);
                      }}
                      className="flex-1 text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                    />
                    {options.length > 2 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveOption(idx)}
                        className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : questionType === 'essay' ? (
              <div className="bg-white p-3 rounded-xl border border-slate-200 text-xs text-slate-600">
                <p className="mb-2 font-medium">
                  الأسئلة المقالية تتطلب تصحيحاً ومراجعة يدوية من المعلم، وسيتمكن الطالب من كتابة
                  إجابته بحرية.
                </p>
                <p className="text-slate-500">
                  يمكنك تدوين معايير التقييم وسلم الدرجات في حقل "الشرح والتوضيح" بالأسفل ليرى المعلم
                  طريقة توزيع الدرجات.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {options.map((opt, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center gap-3 bg-white p-2.5 rounded-xl border transition-all ${
                      opt.is_correct
                        ? 'border-emerald-300 ring-1 ring-emerald-400/30 bg-emerald-50/20'
                        : 'border-slate-200'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleOptionCorrectToggle(idx)}
                      className={`w-6 h-6 rounded-lg flex items-center justify-center border transition-all ${
                        opt.is_correct
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'border-slate-300 hover:border-slate-400 text-transparent'
                      }`}
                      title={opt.is_correct ? 'الإجابة صحيحة' : 'اجعلها الإجابة الصحيحة'}
                    >
                      <Check className="w-4 h-4 stroke-[3]" />
                    </button>

                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2">
                      <input
                        type="text"
                        dir="ltr"
                        placeholder={`Option ${idx + 1} (English)`}
                        value={opt.option_text}
                        onChange={(e) => {
                          const copy = [...options];
                          copy[idx].option_text = e.target.value;
                          setOptions(copy);
                        }}
                        className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                        required
                      />
                      <input
                        type="text"
                        dir="rtl"
                        placeholder="الترجمة / النص العربي (اختياري)"
                        value={opt.option_text_arabic || ''}
                        onChange={(e) => {
                          const copy = [...options];
                          copy[idx].option_text_arabic = e.target.value;
                          setOptions(copy);
                        }}
                        className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>

                    {options.length > 2 && questionType !== 'true_false' && (
                      <button
                        type="button"
                        onClick={() => handleRemoveOption(idx)}
                        className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Explanation */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <label className="text-xs font-semibold text-slate-700">
                الشرح والتوضيح النموذجي / Explanation & Model Answer
              </label>
              <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <textarea
              dir="auto"
              rows={2}
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="يظهر للطالب بعد إعلان نتائج الاختبار لشرح سبب صحة الإجابة، أو لمعايير التصحيح المقالي للمعلم..."
              className="w-full text-sm border border-slate-300 rounded-xl p-3 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 bg-white"
            />
          </div>

          {/* Actions */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl shadow-xs transition-colors flex items-center gap-2"
            >
              {saving ? 'جارٍ الحفظ...' : initialItem ? 'حفظ التعديلات' : 'إضافة إلى بنك الأسئلة'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
