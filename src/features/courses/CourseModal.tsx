/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useLocale } from '../../hooks/useLocale';
import { CourseLevel, CourseRecord } from './coursesService';
import { X, BookOpen, AlertCircle } from 'lucide-react';

interface CourseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    id?: string;
    title: string;
    titleArabic: string;
    description: string;
    descriptionArabic: string;
    level: CourseLevel;
    coverImageUrl: string;
    isPublished: boolean;
  }) => Promise<void>;
  courseToEdit?: CourseRecord | null;
}

export const CourseModal: React.FC<CourseModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  courseToEdit,
}) => {
  const { t, isRtl } = useLocale();

  const [title, setTitle] = useState('');
  const [titleArabic, setTitleArabic] = useState('');
  const [description, setDescription] = useState('');
  const [descriptionArabic, setDescriptionArabic] = useState('');
  const [level, setLevel] = useState<CourseLevel>('intermediate');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [isPublished, setIsPublished] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (courseToEdit) {
      setTitle(courseToEdit.title);
      setTitleArabic(courseToEdit.titleArabic);
      setDescription(courseToEdit.description || '');
      setDescriptionArabic(courseToEdit.descriptionArabic || '');
      setLevel(courseToEdit.level);
      setCoverImageUrl(courseToEdit.coverImageUrl || '');
      setIsPublished(courseToEdit.isPublished);
    } else {
      setTitle('');
      setTitleArabic('');
      setDescription('');
      setDescriptionArabic('');
      setLevel('intermediate');
      setCoverImageUrl('');
      setIsPublished(false);
    }
    setErrorMessage(null);
  }, [courseToEdit, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !titleArabic.trim()) {
      setErrorMessage(
        isRtl
          ? 'يرجى إدخال اسم المقرر باللغتين العربية والإنجليزية.'
          : 'Please enter the course title in both Arabic and English.'
      );
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      await onSubmit({
        id: courseToEdit?.id,
        title: title.trim(),
        titleArabic: titleArabic.trim(),
        description: description.trim(),
        descriptionArabic: descriptionArabic.trim(),
        level,
        coverImageUrl: coverImageUrl.trim(),
        isPublished,
      });
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save course');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-slate-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur-xs z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#356AE6]/10 flex items-center justify-center text-[#356AE6]">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {courseToEdit ? t.courses.editCourse : t.courses.createCourse}
              </h3>
              <p className="text-xs text-slate-500">
                {isRtl ? 'أكاديمية الوسام التعليمية' : 'WESSAM Academy'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label={t.common.close}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t.courses.titleAr} <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                dir="rtl"
                value={titleArabic}
                onChange={(e) => setTitleArabic(e.target.value)}
                placeholder="مثال: إتقان محادثة وقواعد الآيلتس"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#356AE6]/20 focus:border-[#356AE6]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t.courses.titleEn} <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                dir="ltr"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. IELTS Speaking & Writing Mastery"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#356AE6]/20 focus:border-[#356AE6]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t.courses.level}
              </label>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value as CourseLevel)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#356AE6]/20 focus:border-[#356AE6]"
              >
                <option value="beginner">{t.courses.beginner}</option>
                <option value="intermediate">{t.courses.intermediate}</option>
                <option value="advanced">{t.courses.advanced}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t.courses.coverImageUrl}
              </label>
              <input
                type="url"
                dir="ltr"
                value={coverImageUrl}
                onChange={(e) => setCoverImageUrl(e.target.value)}
                placeholder="https://images.unsplash.com/..."
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#356AE6]/20 focus:border-[#356AE6]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t.courses.descAr}
            </label>
            <textarea
              rows={2}
              dir="rtl"
              value={descriptionArabic}
              onChange={(e) => setDescriptionArabic(e.target.value)}
              placeholder="وصف تفصيلي لأهداف المقرر ومخرجاته التعليمية..."
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#356AE6]/20 focus:border-[#356AE6]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t.courses.descEn}
            </label>
            <textarea
              rows={2}
              dir="ltr"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detailed description of course objectives and competencies..."
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#356AE6]/20 focus:border-[#356AE6]"
            />
          </div>

          {/* Published Toggle */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <div>
              <span className="block text-xs font-semibold text-slate-800">
                {t.courses.publishCourse}
              </span>
              <span className="text-[11px] text-slate-500">
                {isRtl
                  ? 'عند التفعيل، سيظهر المقرر للطلاب في المجموعات الدراسية المسند إليها.'
                  : 'When published, this course becomes visible to enrolled students.'}
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#356AE6]"></div>
            </label>
          </div>

          {/* Actions */}
          <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              {t.common.cancel}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-semibold text-white bg-[#356AE6] hover:bg-[#2855BE] rounded-xl shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? t.common.loading : t.common.save}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
