/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Megaphone,
  Calendar,
  Clock,
  Users,
  User,
  AlertTriangle,
  Link,
  Eye,
  CheckCircle2,
  Send,
  Save,
} from 'lucide-react';
import { useLocale } from '../../hooks/useLocale';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import {
  Announcement,
  AnnouncementFormData,
  NotificationPriority,
  TargetAudience,
} from './types';
import { resolveCategoryBadge, resolvePriorityBadge, formatNotificationTime } from './notificationUtils';
import { supabase } from '../../lib/supabase/client';

interface AnnouncementModalProps {
  isOpen: boolean;
  onClose: () => void;
  announcement?: Announcement | null;
  onSaveDraft: (data: AnnouncementFormData) => Promise<void>;
  onPublishNow: (data: AnnouncementFormData) => Promise<void>;
}

export const AnnouncementModal: React.FC<AnnouncementModalProps> = ({
  isOpen,
  onClose,
  announcement,
  onSaveDraft,
  onPublishNow,
}) => {
  const { isRtl } = useLocale();

  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const [title, setTitle] = useState('');
  const [titleArabic, setTitleArabic] = useState('');
  const [body, setBody] = useState('');
  const [bodyArabic, setBodyArabic] = useState('');
  const [targetAudience, setTargetAudience] = useState<TargetAudience>('all_students');
  const [groupId, setGroupId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [priority, setPriority] = useState<NotificationPriority>('normal');
  const [actionUrl, setActionUrl] = useState('');
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('18:00');

  // Groups and students for selection
  const [groups, setGroups] = useState<{ id: string; name: string; nameArabic?: string }[]>([]);
  const [students, setStudents] = useState<{ id: string; name: string; studentNumber?: string }[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (announcement) {
        setTitle(announcement.title);
        setTitleArabic(announcement.titleArabic);
        setBody(announcement.body);
        setBodyArabic(announcement.bodyArabic);
        setTargetAudience(announcement.targetAudience);
        setGroupId(announcement.groupId || '');
        setStudentId(announcement.studentId || '');
        setPriority(announcement.priority);
        setActionUrl(announcement.actionUrl || '');
        setIsScheduled(announcement.status === 'scheduled');
        if (announcement.scheduledFor) {
          const d = new Date(announcement.scheduledFor);
          setScheduledDate(d.toISOString().split('T')[0]);
          setScheduledTime(d.toTimeString().slice(0, 5));
        } else {
          setScheduledDate('');
          setScheduledTime('18:00');
        }
      } else {
        // Defaults
        setTitle('');
        setTitleArabic('');
        setBody('');
        setBodyArabic('');
        setTargetAudience('all_students');
        setGroupId('');
        setStudentId('');
        setPriority('normal');
        setActionUrl('');
        setIsScheduled(false);
        const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
        setScheduledDate(tomorrow.toISOString().split('T')[0]);
        setScheduledTime('18:00');
      }
      setActiveTab('edit');
      loadCohortData();
    }
  }, [isOpen, announcement]);

  const loadCohortData = async () => {
    if (!supabase) return;
    try {
      const [groupsRes, studentsRes] = await Promise.all([
        supabase.from('groups').select('id, name, name_arabic').eq('is_active', true),
        supabase.from('profiles').select('id, full_name, full_name_arabic').eq('role', 'student').eq('status', 'active'),
      ]);

      if (groupsRes.data) {
        setGroups(
          groupsRes.data.map((g: any) => ({
            id: g.id,
            name: g.name,
            nameArabic: g.name_arabic,
          }))
        );
        if (groupsRes.data.length > 0 && !groupId) {
          setGroupId(groupsRes.data[0].id);
        }
      }

      if (studentsRes.data) {
        setStudents(
          studentsRes.data.map((s: any) => ({
            id: s.id,
            name: s.full_name || s.full_name_arabic || 'Student',
          }))
        );
        if (studentsRes.data.length > 0 && !studentId) {
          setStudentId(studentsRes.data[0].id);
        }
      }
    } catch {
      // ignore
    }
  };

  const getFormData = (): AnnouncementFormData => {
    let scheduledForIso: string | undefined = undefined;
    if (isScheduled && scheduledDate) {
      // Build ISO string in Riyadh time
      scheduledForIso = new Date(`${scheduledDate}T${scheduledTime}:00+03:00`).toISOString();
    }

    return {
      title: title.trim(),
      titleArabic: titleArabic.trim(),
      body: body.trim(),
      bodyArabic: bodyArabic.trim(),
      targetAudience,
      groupId: targetAudience === 'group' ? groupId : undefined,
      studentId: targetAudience === 'student' ? studentId : undefined,
      priority,
      actionUrl: actionUrl.trim() || undefined,
      isScheduled,
      scheduledFor: scheduledForIso,
    };
  };

  const handleSaveDraft = async () => {
    if (!title.trim() && !titleArabic.trim()) return;
    setIsSubmitting(true);
    try {
      await onSaveDraft(getFormData());
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePublish = async () => {
    if (!title.trim() && !titleArabic.trim()) return;
    setIsSubmitting(true);
    try {
      await onPublishNow(getFormData());
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const isValid = (title.trim() || titleArabic.trim()) && (body.trim() || bodyArabic.trim());

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        announcement
          ? isRtl
            ? 'تعديل الإعلان'
            : 'Edit Announcement'
          : isRtl
          ? 'إنشاء إعلان جديد'
          : 'New Announcement'
      }
      subtitle={
        isRtl
          ? 'إرسال تنبيه رسمي للطلاب أو المجموعات مع خيارات الجدولة وتحديد الأولويات.'
          : 'Broadcast official academy announcement or group notice with scheduling and priority controls.'
      }
      maxWidth="2xl"
    >
      <div className="space-y-5" dir={isRtl ? 'rtl' : 'ltr'}>
        {/* Tab Toggle */}
        <div className="flex border-b border-slate-200">
          <button
            onClick={() => setActiveTab('edit')}
            className={`pb-2.5 px-4 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'edit'
                ? 'border-[#356AE6] text-[#356AE6]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Megaphone className="w-3.5 h-3.5" />
            <span>{isRtl ? 'تحرير الإعلان' : 'Edit Announcement'}</span>
          </button>
          <button
            onClick={() => setActiveTab('preview')}
            className={`pb-2.5 px-4 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'preview'
                ? 'border-[#356AE6] text-[#356AE6]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>{isRtl ? 'معاينة الطالب' : 'Student Preview'}</span>
          </button>
        </div>

        {activeTab === 'edit' ? (
          <div className="space-y-4">
            {/* Title Fields (Bilingual) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {isRtl ? 'عنوان الإعلان (بالعربية) *' : 'Title (Arabic) *'}
                </label>
                <input
                  type="text"
                  dir="rtl"
                  value={titleArabic}
                  onChange={(e) => setTitleArabic(e.target.value)}
                  placeholder="مثال: موعد الحصة المباشرة القادمة..."
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#356AE6]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {isRtl ? 'عنوان الإعلان (بالإنجليزية)' : 'Title (English)'}
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Upcoming Masterclass Schedule..."
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#356AE6]"
                />
              </div>
            </div>

            {/* Body Fields (Bilingual) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {isRtl ? 'نص الإعلان (بالعربية) *' : 'Body (Arabic) *'}
                </label>
                <textarea
                  rows={4}
                  dir="rtl"
                  value={bodyArabic}
                  onChange={(e) => setBodyArabic(e.target.value)}
                  placeholder="اكتب تفاصيل الإعلان والتوجيهات للطلاب..."
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#356AE6] resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {isRtl ? 'نص الإعلان (بالإنجليزية)' : 'Body (English)'}
                </label>
                <textarea
                  rows={4}
                  dir="ltr"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Announcement details and guidelines..."
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#356AE6] resize-none"
                />
              </div>
            </div>

            {/* Target Audience & Priority */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200/80">
              <div>
                <label className="block text-xs font-bold text-[#14243A] mb-1.5 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-[#356AE6]" />
                  <span>{isRtl ? 'الجمهور المستهدف' : 'Target Audience'}</span>
                </label>
                <select
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value as TargetAudience)}
                  className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#356AE6]"
                >
                  <option value="all_students">
                    {isRtl ? 'جميع الطلاب في نطاق صلاحياتي' : 'All Students (Authorized Scope)'}
                  </option>
                  <option value="group">{isRtl ? 'مجموعة دراسية محددة' : 'Specific Cohort Group'}</option>
                  <option value="student">{isRtl ? 'طالب محدد' : 'Individual Student'}</option>
                </select>

                {targetAudience === 'group' && (
                  <div className="mt-2.5">
                    <label className="block text-[11px] text-slate-500 mb-1">
                      {isRtl ? 'اختر المجموعة:' : 'Select Group:'}
                    </label>
                    <select
                      value={groupId}
                      onChange={(e) => setGroupId(e.target.value)}
                      className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg"
                    >
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {isRtl ? g.nameArabic || g.name : g.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {targetAudience === 'student' && (
                  <div className="mt-2.5">
                    <label className="block text-[11px] text-slate-500 mb-1">
                      {isRtl ? 'اختر الطالب:' : 'Select Student:'}
                    </label>
                    <select
                      value={studentId}
                      onChange={(e) => setStudentId(e.target.value)}
                      className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg"
                    >
                      {students.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-[#14243A] mb-1.5 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  <span>{isRtl ? 'درجة الأولوية' : 'Priority Level'}</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['normal', 'important', 'urgent'] as NotificationPriority[]).map((p) => {
                    const badge = resolvePriorityBadge(p);
                    const isSelected = priority === p;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPriority(p)}
                        className={`p-2 rounded-lg border text-xs font-semibold transition-all cursor-pointer text-center ${
                          isSelected
                            ? `${badge.bg} ${badge.text} ${badge.border} ring-2 ring-[#356AE6]`
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {p === 'urgent'
                          ? isRtl
                            ? 'عاجل'
                            : 'Urgent'
                          : p === 'important'
                          ? isRtl
                            ? 'هام'
                            : 'Important'
                          : isRtl
                          ? 'عادي'
                          : 'Normal'}
                      </button>
                    );
                  })}
                </div>

                {/* Resource deep-link */}
                <div className="mt-3">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1">
                    <Link className="w-3 h-3 text-slate-400" />
                    <span>{isRtl ? 'رابط المورد الداخلي (اختياري)' : 'Internal Resource URL (Optional)'}</span>
                  </label>
                  <input
                    type="text"
                    value={actionUrl}
                    onChange={(e) => setActionUrl(e.target.value)}
                    placeholder="/live-sessions or /assessments or /courses"
                    className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#356AE6]"
                  />
                </div>
              </div>
            </div>

            {/* Scheduling Options */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isScheduled}
                  onChange={(e) => setIsScheduled(e.target.checked)}
                  className="rounded text-[#356AE6] focus:ring-[#356AE6] w-4 h-4 cursor-pointer"
                />
                <span className="text-xs font-bold text-[#14243A] flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-[#356AE6]" />
                  <span>{isRtl ? 'جدولة النشر لتاريخ ووقت مستقبلي' : 'Schedule publication for a future date & time'}</span>
                </span>
              </label>

              {isScheduled && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">
                      {isRtl ? 'تاريخ النشر (توقيت مكة المكرمة):' : 'Publication Date (Riyadh Time):'}
                    </label>
                    <input
                      type="date"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">
                      {isRtl ? 'وقت النشر:' : 'Publication Time:'}
                    </label>
                    <input
                      type="time"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                      className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Live Preview Tab */
          <div className="p-5 rounded-2xl border border-blue-200 bg-blue-50/20 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#356AE6] flex items-center gap-1">
                <Megaphone className="w-3.5 h-3.5" />
                <span>{isRtl ? 'معاينة كما يراها الطالب' : 'Preview as seen by students'}</span>
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                  resolvePriorityBadge(priority).bg
                } ${resolvePriorityBadge(priority).text} ${
                  resolvePriorityBadge(priority).border
                }`}
              >
                {priority.toUpperCase()}
              </span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-2">
              <h4 className="text-sm font-bold text-[#14243A]">
                {isRtl ? titleArabic || title || 'عنوان الإعلان' : title || titleArabic || 'Announcement Title'}
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">
                {isRtl
                  ? bodyArabic || body || 'تفاصيل الإعلان الموجهة للطلاب...'
                  : body || bodyArabic || 'Announcement body description text...'}
              </p>
              {actionUrl && (
                <div className="pt-2">
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#356AE6]">
                    <Link className="w-3 h-3" />
                    <span>{actionUrl}</span>
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modal Actions */}
        <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isSubmitting}>
            {isRtl ? 'إلغاء' : 'Cancel'}
          </Button>

          <Button
            variant="outline"
            size="sm"
            icon={<Save className="w-3.5 h-3.5" />}
            onClick={handleSaveDraft}
            isLoading={isSubmitting}
            disabled={!isValid}
          >
            {isScheduled
              ? isRtl
                ? 'حفظ كإعلان مجدول'
                : 'Save as Scheduled'
              : isRtl
              ? 'حفظ كمسودة'
              : 'Save Draft'}
          </Button>

          {!isScheduled && (
            <Button
              variant="primary"
              size="sm"
              icon={<Send className="w-3.5 h-3.5" />}
              onClick={handlePublish}
              isLoading={isSubmitting}
              disabled={!isValid}
            >
              {isRtl ? 'نشر الآن فوراً' : 'Publish Now'}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
};
