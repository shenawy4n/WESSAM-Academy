import React, { useState, useEffect } from 'react';
import {
  X,
  Search,
  Filter,
  CheckSquare,
  Square,
  HelpCircle,
  Plus,
  Layers,
} from 'lucide-react';
import { QuestionBankItem, QuestionType, DifficultyLevel } from './types';
import { fetchQuestionBankItems, addBankQuestionsToQuiz } from './questionBankService';
import { filterQuestions, QUESTION_TYPES, DIFFICULTY_LEVELS } from './questionBankUtils';

interface QuestionBankPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  quizId: string;
  onSuccess: (addedCount: number) => void;
}

export const QuestionBankPickerModal: React.FC<QuestionBankPickerModalProps> = ({
  isOpen,
  onClose,
  quizId,
  onSuccess,
}) => {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<QuestionBankItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<QuestionType | 'all'>('all');
  const [diffFilter, setDiffFilter] = useState<DifficultyLevel | 'all'>('all');

  useEffect(() => {
    if (!isOpen) {
      setSelectedIds(new Set());
      setError(null);
      return;
    }

    async function loadQuestions() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchQuestionBankItems(false);
        setItems(data);
      } catch (err: any) {
        setError(err.message || 'فشل في تحميل بنك الأسئلة');
      } finally {
        setLoading(false);
      }
    }
    loadQuestions();
  }, [isOpen]);

  const filteredItems = filterQuestions(
    items,
    searchQuery,
    typeFilter,
    diffFilter,
    'all',
    'active',
    ''
  );

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    if (selectedIds.size === filteredItems.length && filteredItems.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map((q) => q.id)));
    }
  };

  const handleAddSelected = async () => {
    if (selectedIds.size === 0) return;
    setSubmitting(true);
    setError(null);

    try {
      const added = await addBankQuestionsToQuiz(quizId, Array.from(selectedIds));
      onSuccess(added);
      onClose();
    } catch (err: any) {
      setError(err.message || 'فشل في إضافة الأسئلة إلى الاختبار');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]"
        dir="rtl"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 className="text-xl font-bold text-slate-800">
              اختيار أسئلة من بنك الأسئلة
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Select questions from your library to add to this assessment
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter bar */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث بالإنجليزية أو العربية..."
              className="w-full text-xs pr-9 pl-3 py-2 bg-white border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">جميع أنواع الأسئلة</option>
              {QUESTION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.labelAr}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={diffFilter}
              onChange={(e) => setDiffFilter(e.target.value as any)}
              className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">جميع الصعوبات</option>
              {DIFFICULTY_LEVELS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.labelAr}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Body list */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-center py-12 text-slate-400 text-sm">جارٍ تحميل الأسئلة...</div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              لم يتم العثور على أسئلة تطابق معايير البحث
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-2 text-xs text-slate-500">
                <button
                  type="button"
                  onClick={selectAllFiltered}
                  className="font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1.5"
                >
                  {selectedIds.size === filteredItems.length ? (
                    <CheckSquare className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-400" />
                  )}
                  <span>تحديد كل النتائج ({filteredItems.length})</span>
                </button>
                <span>تم تحديد: {selectedIds.size}</span>
              </div>

              <div className="space-y-2">
                {filteredItems.map((q) => {
                  const isSelected = selectedIds.has(q.id);
                  const typeLabel = QUESTION_TYPES.find((t) => t.value === q.question_type)?.labelAr;
                  const diffConfig = DIFFICULTY_LEVELS.find((d) => d.value === q.difficulty);

                  return (
                    <div
                      key={q.id}
                      onClick={() => toggleSelect(q.id)}
                      className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                        isSelected
                          ? 'border-emerald-300 bg-emerald-50/40 ring-1 ring-emerald-400/30'
                          : 'border-slate-200 bg-white hover:bg-slate-50/60'
                      }`}
                    >
                      <div className="shrink-0 mt-0.5 text-emerald-600">
                        {isSelected ? (
                          <CheckSquare className="w-5 h-5 text-emerald-600" />
                        ) : (
                          <Square className="w-5 h-5 text-slate-300" />
                        )}
                      </div>

                      <div className="flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                            {typeLabel}
                          </span>
                          <span
                            className={`text-[11px] font-semibold border px-2 py-0.5 rounded-md ${diffConfig?.color}`}
                          >
                            {diffConfig?.labelAr}
                          </span>
                          <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
                            {q.points} {q.points === 1 ? 'درجة' : 'درجات'}
                          </span>
                          {q.topic && (
                            <span className="text-[11px] text-slate-500 flex items-center gap-1">
                              <Layers className="w-3 h-3" />
                              <span>{q.topic}</span>
                            </span>
                          )}
                        </div>

                        <div dir="ltr" className="text-sm font-semibold text-slate-800 font-sans">
                          {q.question_text}
                        </div>
                        {q.question_text_arabic && (
                          <div dir="rtl" className="text-xs text-slate-600 font-sans">
                            {q.question_text_arabic}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <span className="text-xs text-slate-500 font-medium">
            تم تحديد {selectedIds.size} أسئلة للإضافة للاختبار
          </span>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleAddSelected}
              disabled={selectedIds.size === 0 || submitting}
              className="px-6 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl shadow-xs transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>{submitting ? 'جارٍ الإضافة...' : `إضافة المحدد (${selectedIds.size})`}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
