import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Filter,
  Plus,
  Copy,
  Trash2,
  Archive,
  RefreshCw,
  Upload,
  Download,
  Eye,
  Edit,
  Tag,
  Clock,
  CheckCircle,
  HelpCircle,
  Layers,
  Sparkles,
  BookOpen,
  ArrowUpDown,
  CheckSquare,
  Square,
  FolderArchive,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  QuestionBankItem,
  QuestionOptionItem,
  QuestionType,
  DifficultyLevel,
} from './types';
import {
  fetchQuestionBankItems,
  fetchQuestionBankStats,
  createQuestionBankItem,
  updateQuestionBankItem,
  duplicateQuestionBankItem,
  archiveQuestionBankItems,
  restoreQuestionBankItems,
  importQuestions,
} from './questionBankService';
import {
  filterQuestions,
  sortQuestions,
  computeQuestionBankStats,
  exportQuestionsToJson,
  QUESTION_TYPES,
  DIFFICULTY_LEVELS,
} from './questionBankUtils';
import { QuestionEditorModal } from './QuestionEditorModal';
import { QuestionPreviewModal } from './QuestionPreviewModal';
import { QuestionImportModal } from './QuestionImportModal';
import { supabase } from '../../lib/supabase/client';

export const QuestionBankView: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<QuestionBankItem[]>([]);
  const [courses, setCourses] = useState<{ id: string; title: string; title_arabic?: string | null }[]>([]);

  // Filtering & Sorting
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<QuestionType | 'all'>('all');
  const [diffFilter, setDiffFilter] = useState<DifficultyLevel | 'all'>('all');
  const [courseFilter, setCourseFilter] = useState<string | 'all'>('all');
  const [tagFilter, setTagFilter] = useState('');
  const [lifecycleTab, setLifecycleTab] = useState<'active' | 'archived'>('active');
  const [sortBy, setSortBy] = useState<'created_at' | 'points' | 'difficulty' | 'question_text'>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Modals
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<QuestionBankItem | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewingItem, setPreviewingItem] = useState<QuestionBankItem | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);

  // Status message
  const [alertNotice, setAlertNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const fetchedItems = await fetchQuestionBankItems(true);
      setItems(fetchedItems);
      if (supabase) {
        const coursesRes = await supabase.from('courses').select('id, title, title_arabic').order('title');
        if (coursesRes.data) {
          setCourses(coursesRes.data);
        }
      }
    } catch (err: any) {
      setAlertNotice({ type: 'error', message: err.message || 'فشل في تحميل الأسئلة' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const stats = useMemo(() => computeQuestionBankStats(items), [items]);

  const filteredItems = useMemo(() => {
    const filtered = filterQuestions(
      items,
      searchQuery,
      typeFilter,
      diffFilter,
      courseFilter,
      lifecycleTab,
      tagFilter
    );
    return sortQuestions(filtered, sortBy, sortOrder);
  }, [items, searchQuery, typeFilter, diffFilter, courseFilter, lifecycleTab, tagFilter, sortBy, sortOrder]);

  // Paginated items
  const totalPages = Math.ceil(filteredItems.length / pageSize) || 1;
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, currentPage, pageSize]);

  // Toggle selection
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllCurrentPage = () => {
    const pageIds = paginatedItems.map((q) => q.id);
    const allSelected = pageIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        pageIds.forEach((id) => next.delete(id));
      } else {
        pageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  // Actions
  const handleCreate = () => {
    setEditingItem(null);
    setIsEditorOpen(true);
  };

  const handleEdit = (item: QuestionBankItem) => {
    setEditingItem(item);
    setIsEditorOpen(true);
  };

  const handlePreview = (item: QuestionBankItem) => {
    setPreviewingItem(item);
    setIsPreviewOpen(true);
  };

  const handleSaveQuestion = async (
    itemData: Partial<QuestionBankItem>,
    options: QuestionOptionItem[]
  ) => {
    try {
      if (editingItem) {
        await updateQuestionBankItem({
          id: editingItem.id,
          question_text: itemData.question_text || '',
          question_text_arabic: itemData.question_text_arabic,
          question_type: itemData.question_type || 'multiple_choice',
          difficulty: itemData.difficulty || 'medium',
          points: itemData.points || 1,
          explanation: itemData.explanation,
          course_id: itemData.course_id,
          unit_id: itemData.unit_id,
          lesson_id: itemData.lesson_id,
          topic: itemData.topic,
          tags: itemData.tags,
          time_limit_seconds: itemData.time_limit_seconds,
          options,
        });
        setAlertNotice({ type: 'success', message: 'تم تحديث السؤال بنجاح' });
      } else {
        await createQuestionBankItem({
          question_text: itemData.question_text || '',
          question_text_arabic: itemData.question_text_arabic,
          question_type: itemData.question_type || 'multiple_choice',
          difficulty: itemData.difficulty || 'medium',
          points: itemData.points || 1,
          explanation: itemData.explanation,
          course_id: itemData.course_id,
          unit_id: itemData.unit_id,
          lesson_id: itemData.lesson_id,
          topic: itemData.topic,
          tags: itemData.tags,
          time_limit_seconds: itemData.time_limit_seconds,
          options,
        });
        setAlertNotice({ type: 'success', message: 'تمت إضافة السؤال لبنك الأسئلة بنجاح' });
      }
      await loadData();
    } catch (err: any) {
      setAlertNotice({ type: 'error', message: err.message || 'فشل في حفظ السؤال' });
      throw err;
    }
  };

  const handleDuplicate = async (questionId: string) => {
    try {
      await duplicateQuestionBankItem(questionId);
      setAlertNotice({ type: 'success', message: 'تم تكرار السؤال بنجاح' });
      await loadData();
    } catch (err: any) {
      setAlertNotice({ type: 'error', message: err.message || 'فشل في نسخ السؤال' });
    }
  };

  const handleBulkArchive = async () => {
    if (selectedIds.size === 0) return;
    try {
      const count = await archiveQuestionBankItems(Array.from(selectedIds));
      setSelectedIds(new Set());
      setAlertNotice({ type: 'success', message: `تمت أرشفة ${count} سؤال بنجاح` });
      await loadData();
    } catch (err: any) {
      setAlertNotice({ type: 'error', message: err.message || 'فشل في أرشفة الأسئلة' });
    }
  };

  const handleBulkRestore = async () => {
    if (selectedIds.size === 0) return;
    try {
      const count = await restoreQuestionBankItems(Array.from(selectedIds));
      setSelectedIds(new Set());
      setAlertNotice({ type: 'success', message: `تمت استعادة ${count} سؤال بنجاح` });
      await loadData();
    } catch (err: any) {
      setAlertNotice({ type: 'error', message: err.message || 'فشل في استعادة الأسئلة' });
    }
  };

  const handleExportJson = () => {
    const targetItems = selectedIds.size > 0
      ? items.filter((q) => selectedIds.has(q.id))
      : filteredItems;

    const jsonStr = exportQuestionsToJson(targetItems);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `wessam_questions_export_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setAlertNotice({ type: 'success', message: `تم تصدير ${targetItems.length} سؤال بصيغة JSON` });
  };

  const handleCommitImport = async (
    rows: { item: Partial<QuestionBankItem>; options: QuestionOptionItem[] }[]
  ) => {
    try {
      const res = await importQuestions(rows);
      if (res.errors && res.errors.length > 0) {
        setAlertNotice({
          type: 'error',
          message: `فشل الاستيراد: ${res.errors.join(', ')}`,
        });
      } else {
        setAlertNotice({
          type: 'success',
          message: `تم استيراد ${res.successCount} سؤال بنجاح إلى بنك الأسئلة`,
        });
        await loadData();
      }
    } catch (err: any) {
      setAlertNotice({
        type: 'error',
        message: err.message || 'فشل في استيراد الأسئلة',
      });
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Top Banner & Header */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">
              بنك الأسئلة الشامل
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
              Phase 5B
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            إدارة شاملة ومستقلة لأسئلة الاختبارات مع دعم لكافة الأنماط التعليمية والتحكم في الخصوصية
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsImportOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>استيراد أسئلة</span>
          </button>
          <button
            onClick={handleExportJson}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>تصدير JSON</span>
          </button>
          <button
            onClick={handleCreate}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة سؤال جديد</span>
          </button>
        </div>
      </div>

      {/* Alert notice if present */}
      {alertNotice && (
        <div
          className={`p-4 rounded-xl text-xs font-semibold flex items-center justify-between border ${
            alertNotice.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          <span>{alertNotice.message}</span>
          <button
            onClick={() => setAlertNotice(null)}
            className="text-slate-400 hover:text-slate-600"
          >
            ✕
          </button>
        </div>
      )}

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-xs font-medium text-slate-500 block">إجمالي الأسئلة</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black text-slate-800">{stats.total}</span>
            <span className="text-xs text-slate-400">سؤال متاح</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-xs font-medium text-emerald-600 block">الأسئلة النشطة</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black text-emerald-600">{stats.active}</span>
            <span className="text-xs text-emerald-500">جاهزة للاستخدام</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-xs font-medium text-amber-600 block">الأنماط والمطابقة</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black text-amber-600">
              {stats.by_type.matching + stats.by_type.multiple_select}
            </span>
            <span className="text-xs text-slate-400">توصيل ومتعدد</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-xs font-medium text-slate-500 block">في الأرشيف</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black text-slate-600">{stats.archived}</span>
            <span className="text-xs text-slate-400">مؤرشفة</span>
          </div>
        </div>
      </div>

      {/* Search, Filter & Tabs Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
        {/* Lifecycle Tabs */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setLifecycleTab('active');
                setCurrentPage(1);
              }}
              className={`px-4 py-1.5 text-xs font-bold rounded-xl transition-all ${
                lifecycleTab === 'active'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              الأسئلة النشطة ({stats.active})
            </button>
            <button
              onClick={() => {
                setLifecycleTab('archived');
                setCurrentPage(1);
              }}
              className={`px-4 py-1.5 text-xs font-bold rounded-xl transition-all ${
                lifecycleTab === 'archived'
                  ? 'bg-slate-800 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              الأرشيف ({stats.archived})
            </button>
          </div>

          {/* Bulk Actions */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-semibold">
                تم تحديد ({selectedIds.size})
              </span>
              {lifecycleTab === 'active' ? (
                <button
                  onClick={handleBulkArchive}
                  className="px-3 py-1 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg flex items-center gap-1 transition-colors"
                >
                  <Archive className="w-3.5 h-3.5" />
                  <span>أرشفة المحدد</span>
                </button>
              ) : (
                <button
                  onClick={handleBulkRestore}
                  className="px-3 py-1 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg flex items-center gap-1 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>استعادة المحدد</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Filter controls row */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {/* Search */}
          <div className="md:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="ابحث بالنص، الشرح، الموضوع، أو الخيارات..."
              className="w-full text-xs pr-9 pl-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Type filter */}
          <div>
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value as any);
                setCurrentPage(1);
              }}
              className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">جميع أنواع الأسئلة</option>
              {QUESTION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.labelAr}
                </option>
              ))}
            </select>
          </div>

          {/* Difficulty filter */}
          <div>
            <select
              value={diffFilter}
              onChange={(e) => {
                setDiffFilter(e.target.value as any);
                setCurrentPage(1);
              }}
              className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">جميع مستويات الصعوبة</option>
              {DIFFICULTY_LEVELS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.labelAr}
                </option>
              ))}
            </select>
          </div>

          {/* Course filter */}
          <div>
            <select
              value={courseFilter}
              onChange={(e) => {
                setCourseFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">جميع الكورسات</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title_arabic || c.title}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Questions List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {/* Table Header Bar */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-bold text-slate-600">
          <div className="flex items-center gap-3">
            <button
              onClick={selectAllCurrentPage}
              className="text-slate-400 hover:text-emerald-600"
              title="تحديد كل صفحة"
            >
              {paginatedItems.length > 0 &&
              paginatedItems.every((q) => selectedIds.has(q.id)) ? (
                <CheckSquare className="w-4 h-4 text-emerald-600" />
              ) : (
                <Square className="w-4 h-4" />
              )}
            </button>
            <span>السؤال والتفاصيل ({filteredItems.length} نتيجة)</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 font-normal">ترتيب حسب:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-transparent font-bold text-slate-700 text-xs border-none focus:outline-hidden"
              >
                <option value="created_at">الأحدث إضافة</option>
                <option value="points">الدرجات</option>
                <option value="difficulty">مستوى الصعوبة</option>
                <option value="question_text">النص الإنجليزي</option>
              </select>
              <button
                onClick={() => setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
                className="p-1 hover:bg-slate-200 rounded-sm"
                title="عكس الترتيب"
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Rows */}
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">جارٍ تحميل بنك الأسئلة...</div>
        ) : filteredItems.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm space-y-2">
            <p>لا توجد أسئلة تطابق معايير البحث أو التصفية الحالية.</p>
            <button
              onClick={handleCreate}
              className="text-xs font-bold text-emerald-600 hover:text-emerald-700"
            >
              + إضافة أول سؤال في هذه الفئة
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {paginatedItems.map((q) => {
              const isSelected = selectedIds.has(q.id);
              const typeConfig = QUESTION_TYPES.find((t) => t.value === q.question_type);
              const diffConfig = DIFFICULTY_LEVELS.find((d) => d.value === q.difficulty);

              return (
                <div
                  key={q.id}
                  className={`p-5 transition-colors flex items-start gap-4 ${
                    isSelected ? 'bg-emerald-50/30' : 'hover:bg-slate-50/70'
                  }`}
                >
                  <button
                    onClick={() => toggleSelect(q.id)}
                    className="shrink-0 mt-1 text-slate-300 hover:text-emerald-600"
                  >
                    {isSelected ? (
                      <CheckSquare className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <Square className="w-5 h-5" />
                    )}
                  </button>

                  {/* Question details */}
                  <div className="flex-1 space-y-2">
                    {/* Badges */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                        {typeConfig?.labelAr || q.question_type}
                      </span>
                      <span
                        className={`px-2 py-0.5 text-[11px] font-bold rounded-md border ${diffConfig?.color}`}
                      >
                        {diffConfig?.labelAr || q.difficulty}
                      </span>
                      <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                        {q.points} {q.points === 1 ? 'درجة' : 'درجات'}
                      </span>
                      {q.time_limit_seconds && (
                        <span className="px-2 py-0.5 text-[11px] font-medium text-slate-500 bg-slate-100 rounded-md flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{q.time_limit_seconds}ث</span>
                        </span>
                      )}
                      {q.course && (
                        <span className="px-2 py-0.5 text-[11px] font-medium text-slate-500 bg-slate-100 rounded-md flex items-center gap-1">
                          <BookOpen className="w-3 h-3" />
                          <span>{q.course.title_arabic || q.course.title}</span>
                        </span>
                      )}
                      {q.topic && (
                        <span className="px-2 py-0.5 text-[11px] font-medium text-slate-500 bg-slate-100 rounded-md flex items-center gap-1">
                          <Layers className="w-3 h-3" />
                          <span>{q.topic}</span>
                        </span>
                      )}
                    </div>

                    {/* Text */}
                    <div>
                      <h3 dir="ltr" className="text-sm font-bold text-slate-900 font-sans">
                        {q.question_text}
                      </h3>
                      {q.question_text_arabic && (
                        <p dir="rtl" className="text-xs text-slate-600 mt-0.5 font-sans">
                          {q.question_text_arabic}
                        </p>
                      )}
                    </div>

                    {/* Preview of options count */}
                    <div className="text-[11px] text-slate-500 flex items-center gap-3">
                      {q.question_type === 'matching' ? (
                        <span>
                          {q.options?.length || 0} أزواج متطابقة
                        </span>
                      ) : q.question_type === 'essay' ? (
                        <span>سؤال مقالي (تصحيح يدوي)</span>
                      ) : (
                        <span>
                          {q.options?.length || 0} خيارات ({q.options?.filter((o) => o.is_correct).length || 0} صحيحة)
                        </span>
                      )}

                      {q.tags && q.tags.length > 0 && (
                        <div className="flex items-center gap-1">
                          <Tag className="w-3 h-3 text-slate-400" />
                          <span>{q.tags.join(', ')}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions buttons */}
                  <div className="shrink-0 flex items-center gap-1">
                    <button
                      onClick={() => handlePreview(q)}
                      className="p-2 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                      title="معاينة السؤال"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDuplicate(q.id)}
                      className="p-2 text-slate-500 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors"
                      title="نسخ السؤال"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleEdit(q)}
                      className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                      title="تعديل السؤال"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
            <span>
              عرض الصفحة {currentPage} من {totalPages} ({filteredItems.length} سؤال إجمالاً)
            </span>

            <div className="flex items-center gap-1">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <QuestionEditorModal
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        onSave={handleSaveQuestion}
        initialItem={editingItem}
        courses={courses}
      />

      <QuestionPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        question={previewingItem}
      />

      <QuestionImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onCommitImport={handleCommitImport}
      />
    </div>
  );
};
