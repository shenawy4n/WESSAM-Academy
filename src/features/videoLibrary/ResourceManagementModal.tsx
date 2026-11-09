/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useLocale } from '../../hooks/useLocale';
import { LearningResourceRecord, ResourceType } from './types';
import {
  fetchLessonResources,
  uploadLearningResource,
  addExternalResourceLink,
  deleteResource,
  getSecureResourceUrl,
} from './videoLibraryService';
import { getResourceTypeLabel, validateResourceType } from './videoLibraryUtils';
import {
  X,
  Paperclip,
  Upload,
  Link as LinkIcon,
  Download,
  Trash2,
  FileText,
  AlertCircle,
  CheckCircle2,
  Plus,
} from 'lucide-react';

interface ResourceManagementModalProps {
  courseId: string;
  lessonId: string;
  lessonTitle: string;
  isOpen: boolean;
  onClose: () => void;
}

export const ResourceManagementModal: React.FC<ResourceManagementModalProps> = ({
  courseId,
  lessonId,
  lessonTitle,
  isOpen,
  onClose,
}) => {
  const { t, isRtl } = useLocale();

  const [resources, setResources] = useState<LearningResourceRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [tab, setTab] = useState<'list' | 'upload_file' | 'add_link'>('list');

  // Form states
  const [title, setTitle] = useState('');
  const [titleArabic, setTitleArabic] = useState('');
  const [description, setDescription] = useState('');
  const [resourceType, setResourceType] = useState<ResourceType>('pdf');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [externalUrl, setExternalUrl] = useState('');
  const [isPublished, setIsPublished] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadResources = async () => {
    try {
      setLoading(true);
      const data = await fetchLessonResources(lessonId, true);
      setResources(data);
    } catch (err: any) {
      console.warn('Could not load resources:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadResources();
      setTab('list');
      setErrorMsg(null);
    }
  }, [isOpen, lessonId]);

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg(isRtl ? 'يرجى إدخال عنوان المورد' : 'Title is required');
      return;
    }
    if (!selectedFile) {
      setErrorMsg(isRtl ? 'يرجى اختيار ملف للرفع' : 'File is required');
      return;
    }
    if (selectedFile.size > 26214400) {
      setErrorMsg(isRtl ? 'حجم الملف يتجاوز الحد المسموح (25 ميجابايت)' : 'File exceeds 25 MB limit');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      await uploadLearningResource({
        courseId,
        lessonId,
        file: selectedFile,
        title: title.trim(),
        titleArabic: titleArabic.trim() || undefined,
        description: description.trim() || undefined,
        resourceType,
        isPublished,
      });
      await loadResources();
      resetForm();
      setTab('list');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to upload resource');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg(isRtl ? 'يرجى إدخال عنوان المورد' : 'Title is required');
      return;
    }
    if (!externalUrl.trim() || !externalUrl.startsWith('https://')) {
      setErrorMsg(isRtl ? 'يرجى إدخال رابط HTTPS آمن ومعتمد' : 'Secure HTTPS URL is required');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      await addExternalResourceLink({
        courseId,
        lessonId,
        title: title.trim(),
        titleArabic: titleArabic.trim() || undefined,
        externalUrl: externalUrl.trim(),
        description: description.trim() || undefined,
        resourceType,
        isPublished,
      });
      await loadResources();
      resetForm();
      setTab('list');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to add resource link');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (resId: string) => {
    if (!confirm(isRtl ? 'هل أنت متأكد من حذف هذا المورد؟' : 'Are you sure you want to delete this resource?')) {
      return;
    }
    try {
      await deleteResource(resId);
      await loadResources();
    } catch (err: any) {
      alert(err.message || 'Failed to delete resource');
    }
  };

  const handleDownload = async (resId: string) => {
    try {
      const url = await getSecureResourceUrl(resId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      alert(err.message || 'Failed to obtain download URL');
    }
  };

  const resetForm = () => {
    setTitle('');
    setTitleArabic('');
    setDescription('');
    setSelectedFile(null);
    setExternalUrl('');
    setResourceType('pdf');
    setIsPublished(true);
    setErrorMsg(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-[#356AE6]/10 flex items-center justify-center text-[#356AE6] shrink-0">
              <Paperclip className="w-4 h-4" />
            </div>
            <div className="truncate">
              <h2 className="text-sm font-bold text-slate-900 truncate">
                {isRtl ? 'إدارة المذكرات والموارد التعليمية' : 'Manage Learning Resources'}
              </h2>
              <span className="text-xs text-slate-500 truncate block">
                {lessonTitle}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTab('list')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              tab === 'list'
                ? 'bg-white text-[#356AE6] shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {isRtl ? 'قائمة الموارد الحالية' : 'Current Resources'} ({resources.length})
          </button>
          <button
            type="button"
            onClick={() => {
              resetForm();
              setTab('upload_file');
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              tab === 'upload_file'
                ? 'bg-white text-[#356AE6] shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{isRtl ? 'رفع ملف (PDF / Word)' : 'Upload File'}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              resetForm();
              setTab('add_link');
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              tab === 'add_link'
                ? 'bg-white text-[#356AE6] shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <LinkIcon className="w-3.5 h-3.5" />
            <span>{isRtl ? 'إضافة رابط خارجي' : 'External Link'}</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {errorMsg && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {tab === 'list' && (
            <div className="space-y-3">
              {loading ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  {isRtl ? 'جاري تحميل الموارد...' : 'Loading resources...'}
                </div>
              ) : resources.length === 0 ? (
                <div className="py-8 text-center text-slate-400 space-y-2">
                  <FileText className="w-8 h-8 mx-auto text-slate-300" />
                  <p className="text-xs">{isRtl ? 'لا توجد موارد أو ملفات مرفقة لهذا الدرس' : 'No resources attached to this lesson yet.'}</p>
                  <button
                    type="button"
                    onClick={() => setTab('upload_file')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#356AE6] text-white text-xs font-semibold"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isRtl ? 'رفع أول ملف' : 'Upload First File'}</span>
                  </button>
                </div>
              ) : (
                resources.map((res) => (
                  <div
                    key={res.id}
                    className="p-3.5 rounded-xl border border-slate-200 bg-white flex items-center justify-between gap-3 shadow-xs"
                  >
                    <div className="overflow-hidden">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 truncate">
                          {isRtl ? (res.titleArabic || res.title) : res.title}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-semibold">
                          {getResourceTypeLabel(res.resourceType, isRtl)}
                        </span>
                        {!res.isPublished && (
                          <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[10px] font-semibold border border-amber-200">
                            {isRtl ? 'مسودة' : 'Draft'}
                          </span>
                        )}
                      </div>
                      {res.description && (
                        <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{res.description}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleDownload(res.id)}
                        title={isRtl ? 'تحميل أو فتح المورد' : 'Download / View'}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-[#356AE6] hover:bg-slate-100 cursor-pointer"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(res.id)}
                        title={isRtl ? 'حذف المورد' : 'Delete'}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-slate-100 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {(tab === 'upload_file' || tab === 'add_link') && (
            <form onSubmit={tab === 'upload_file' ? handleFileUpload : handleLinkSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {isRtl ? 'عنوان المورد (إنجليزي) *' : 'Resource Title (English) *'}
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Speaking Diagnostic Test Sheet"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300"
                    dir="ltr"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {isRtl ? 'عنوان المورد (عربي)' : 'Resource Title (Arabic)'}
                  </label>
                  <input
                    type="text"
                    value={titleArabic}
                    onChange={(e) => setTitleArabic(e.target.value)}
                    placeholder="مثال: ورقة اختبار تحديد مستوى المحادثة"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300"
                    dir="rtl"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {isRtl ? 'نوع المورد التعليمي' : 'Resource Type'}
                </label>
                <select
                  value={resourceType}
                  onChange={(e) => setResourceType(e.target.value as ResourceType)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white"
                >
                  <option value="pdf">PDF Document</option>
                  <option value="worksheet">Study Worksheet</option>
                  <option value="image">Image / Infographic</option>
                  <option value="document">Word Document</option>
                  <option value="slides">Presentation Slides</option>
                  <option value="link">External Link</option>
                  <option value="other">Other Asset</option>
                </select>
              </div>

              {tab === 'upload_file' ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {isRtl ? 'اختيار الملف (بحد أقصى 25 ميجابايت) *' : 'Choose File (Max 25 MB) *'}
                  </label>
                  <input
                    type="file"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    className="w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-[#356AE6]/10 file:text-[#356AE6] hover:file:bg-[#356AE6]/20 cursor-pointer"
                    accept=".pdf,.docx,.doc,.pptx,.ppt,.zip,.jpg,.jpeg,.png,.webp"
                    required
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    {isRtl ? 'يتم حفظ الملف في مستودع سحابي خاص ومحمي بروابط موقعة ومؤقتة.' : 'Files are stored in private storage and accessed via short-lived signed tokens.'}
                  </p>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {isRtl ? 'رابط المورد التعليمي المعتمد (HTTPS) *' : 'Approved Learning Link (HTTPS) *'}
                  </label>
                  <input
                    type="url"
                    value={externalUrl}
                    onChange={(e) => setExternalUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300"
                    dir="ltr"
                    required
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {isRtl ? 'ملاحظات إضافية للطلاب' : 'Notes / Instructions'}
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="e.g. Please solve task 1 before attending tomorrow's session."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="pub-res"
                  checked={isPublished}
                  onChange={(e) => setIsPublished(e.target.checked)}
                  className="w-4 h-4 rounded text-[#356AE6]"
                />
                <label htmlFor="pub-res" className="text-xs text-slate-700 font-medium cursor-pointer">
                  {isRtl ? 'نشر المورد للطلاب فوراً' : 'Publish resource to enrolled students immediately'}
                </label>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setTab('list')}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#356AE6] hover:bg-[#2855BE] shadow-xs disabled:opacity-60"
                >
                  <Upload className="w-4 h-4" />
                  <span>{isSubmitting ? (isRtl ? 'جاري الرفع...' : 'Saving...') : (isRtl ? 'حفظ المورد' : 'Save Resource')}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
