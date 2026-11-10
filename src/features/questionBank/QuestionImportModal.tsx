import React, { useState } from 'react';
import {
  X,
  Upload,
  Download,
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  FileCode,
  FileText,
} from 'lucide-react';
import {
  parseAndValidateCsv,
  parseAndValidateJson,
  generateQuestionBankCsvTemplate,
  generateQuestionBankJsonTemplate,
} from './questionBankUtils';
import { ImportValidationSummary, QuestionBankItem, QuestionOptionItem } from './types';

interface QuestionImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCommitImport: (
    rows: { item: Partial<QuestionBankItem>; options: QuestionOptionItem[] }[]
  ) => Promise<void>;
}

export const QuestionImportModal: React.FC<QuestionImportModalProps> = ({
  isOpen,
  onClose,
  onCommitImport,
}) => {
  if (!isOpen) return null;

  const [activeTab, setActiveTab] = useState<'csv' | 'json'>('csv');
  const [inputText, setInputText] = useState('');
  const [summary, setSummary] = useState<ImportValidationSummary | null>(null);
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);

  const handleDownloadTemplate = (type: 'csv' | 'json') => {
    const content =
      type === 'csv' ? generateQuestionBankCsvTemplate() : generateQuestionBankJsonTemplate();
    const mime = type === 'csv' ? 'text/csv;charset=utf-8;' : 'application/json;charset=utf-8;';
    const filename = `wessam_question_bank_template.${type}`;

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = (event.target?.result as string) || '';
      setInputText(content);
      validateData(content, activeTab);
    };
    reader.readAsText(file);
  };

  const validateData = (text: string, type: 'csv' | 'json') => {
    if (!text.trim()) {
      setSummary(null);
      return;
    }
    const res = type === 'csv' ? parseAndValidateCsv(text) : parseAndValidateJson(text);
    setSummary(res);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputText(val);
    validateData(val, activeTab);
  };

  const handleTabChange = (tab: 'csv' | 'json') => {
    setActiveTab(tab);
    setInputText('');
    setSummary(null);
    setCommitError(null);
  };

  const handleCommit = async () => {
    if (!summary || summary.validRows === 0) return;
    setCommitting(true);
    setCommitError(null);

    const validItems = summary.rows
      .filter((r) => r.isValid && r.item)
      .map((r) => ({
        item: r.item!,
        options: r.options || [],
      }));

    try {
      await onCommitImport(validItems);
      onClose();
    } catch (err: any) {
      setCommitError(err.message || 'فشل في استيراد الأسئلة');
    } finally {
      setCommitting(false);
    }
  };

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
              استيراد أسئلة من ملف (CSV / JSON)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Bulk Import with Client-Side Validation & Preview
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Format tabs & templates toolbar */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
            <button
              onClick={() => handleTabChange('csv')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all ${
                activeTab === 'csv'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>ملف CSV (جداول إكسل)</span>
            </button>
            <button
              onClick={() => handleTabChange('json')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all ${
                activeTab === 'json'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>ملف JSON (هيكلي)</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleDownloadTemplate(activeTab)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>تحميل نموذج {activeTab.toUpperCase()} الفارغ</span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {commitError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{commitError}</span>
            </div>
          )}

          {/* Upload Dropzone / Paste Area */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700">
                الصق محتوى {activeTab.toUpperCase()} أو ارفع ملفاً:
              </label>
              <label className="cursor-pointer text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1">
                <Upload className="w-3.5 h-3.5" />
                <span>اختر ملف من جهازك</span>
                <input
                  type="file"
                  accept={activeTab === 'csv' ? '.csv,text/csv' : '.json,application/json'}
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            <textarea
              dir="ltr"
              rows={6}
              value={inputText}
              onChange={handleTextChange}
              placeholder={
                activeTab === 'csv'
                  ? 'question_text,question_text_arabic,question_type,difficulty,points...\n"What is a noun?","ما هو الاسم؟",multiple_choice,easy,1...'
                  : '{\n  "questions": [\n    {\n      "question_text": "...",\n      "question_type": "multiple_choice",\n      ...\n    }\n  ]\n}'
              }
              className="w-full text-xs font-mono p-3 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Validation Summary */}
          {summary && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center">
                  <span className="text-xs text-slate-500 block">إجمالي الأسئلة</span>
                  <span className="text-xl font-bold text-slate-800">{summary.totalRows}</span>
                </div>
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
                  <span className="text-xs text-emerald-700 block">أسئلة صالحة للاستيراد</span>
                  <span className="text-xl font-bold text-emerald-700">{summary.validRows}</span>
                </div>
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-center">
                  <span className="text-xs text-rose-700 block">أسئلة بها أخطاء</span>
                  <span className="text-xl font-bold text-rose-700">{summary.invalidRows}</span>
                </div>
              </div>

              {/* Rows Preview */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2 bg-slate-100 border-b border-slate-200 text-xs font-bold text-slate-700 flex justify-between">
                  <span>جدول التحقق من البيانات المستوردة</span>
                  <span>{summary.validRows} من {summary.totalRows} جاهز للاستيراد</span>
                </div>
                <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
                  {summary.rows.map((row) => (
                    <div
                      key={row.rowNumber}
                      className={`p-3 text-xs flex items-start gap-3 ${
                        row.isValid ? 'bg-white hover:bg-slate-50/50' : 'bg-rose-50/50'
                      }`}
                    >
                      <div className="shrink-0 mt-0.5">
                        {row.isValid ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-rose-600" />
                        )}
                      </div>

                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-800">
                            سطر #{row.rowNumber}:{' '}
                            {row.item?.question_text || row.raw.question_text || '(بدون نص)'}
                          </span>
                          <span className="text-[11px] font-semibold text-slate-500">
                            {row.item?.question_type} • {row.item?.difficulty} • {row.item?.points} درجات
                          </span>
                        </div>

                        {!row.isValid && (
                          <div className="text-rose-700 space-y-0.5 pt-1">
                            {row.errors.map((e, idx) => (
                              <p key={idx} className="text-[11px]">
                                • {e.messageArabic} ({e.message})
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            {summary?.validRows
              ? `سيتم حفظ ${summary.validRows} سؤال وتخطي غير الصالح`
              : 'يرجى تقديم بيانات صالحة للاستيراد'}
          </span>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={committing}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleCommit}
              disabled={!summary || summary.validRows === 0 || committing}
              className="px-6 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl shadow-xs transition-colors"
            >
              {committing ? 'جارٍ الاستيراد...' : `استيراد (${summary?.validRows || 0}) أسئلة`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
