/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  Video,
  Users,
  BookOpen,
  Link2,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useLocale } from '../../hooks/useLocale';
import {
  LiveSessionRecord,
  LiveSessionProvider,
  createLiveSession,
  updateLiveSession,
  getAuthorizedMeetingLink,
} from './liveSessionsService';
import { utcToRiyadhInputs } from '../../lib/dateUtils';
import { supabase } from '../../lib/supabase/client';

interface GroupOption {
  id: string;
  name: string;
  nameArabic: string;
}

interface CourseOption {
  id: string;
  title: string;
  titleArabic: string;
}

interface LessonOption {
  id: string;
  courseId: string;
  title: string;
  titleArabic: string;
}

interface SessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionToEdit?: LiveSessionRecord | null;
  onSuccess: () => void;
}

export const SessionModal: React.FC<SessionModalProps> = ({
  isOpen,
  onClose,
  sessionToEdit,
  onSuccess,
}) => {
  const { isRtl } = useLocale();

  const [title, setTitle] = useState('');
  const [titleArabic, setTitleArabic] = useState('');
  const [description, setDescription] = useState('');
  const [descriptionArabic, setDescriptionArabic] = useState('');
  const [groupId, setGroupId] = useState('');
  const [courseId, setCourseId] = useState('');
  const [lessonId, setLessonId] = useState('');
  const [dateRiyadh, setDateRiyadh] = useState('');
  const [timeRiyadh, setTimeRiyadh] = useState('20:00');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [provider, setProvider] = useState<LiveSessionProvider>('zoom');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [teacherNotes, setTeacherNotes] = useState('');

  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [lessons, setLessons] = useState<LessonOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load active groups and courses for dropdown selectors
  useEffect(() => {
    if (!isOpen) return;

    async function loadSelectOptions() {
      try {
        setLoading(true);
        if (supabase) {
          const [grpRes, crsRes, lsnRes] = await Promise.all([
            supabase
              .from('groups')
              .select('id, name, name_arabic')
              .eq('is_active', true)
              .is('archived_at', null)
              .order('name'),
            supabase
              .from('courses')
              .select('id, title, title_arabic')
              .eq('is_published', true)
              .order('title'),
            supabase
              .from('lessons')
              .select('id, course_id, title, title_arabic')
              .order('order_index'),
          ]);

          setGroups(
            (grpRes.data || []).map((g) => ({
              id: g.id,
              name: g.name,
              nameArabic: g.name_arabic || g.name,
            }))
          );
          setCourses(
            (crsRes.data || []).map((c) => ({
              id: c.id,
              title: c.title,
              titleArabic: c.title_arabic || c.title,
            }))
          );
          setLessons(
            (lsnRes.data || []).map((l) => ({
              id: l.id,
              courseId: l.course_id,
              title: l.title,
              titleArabic: l.title_arabic || l.title,
            }))
          );
        } else {
          // Demo fallback options
          setGroups([
            { id: 'aaaaaaaa-aaaa-4aaa-8aaa-cccccccccccc', name: 'Group A - Intensive IELTS Prep', nameArabic: 'المجموعة أ - الإعداد المكثف للآيلتس' },
            { id: 'group-2', name: 'Group B - Advanced Academic English', nameArabic: 'المجموعة ب - الإنجليزية الأكاديمية المتقدمة' },
          ]);
          setCourses([
            { id: 'cccccccc-1111-4111-8111-111111111111', title: 'IELTS Academic Writing & Speaking Mastery', titleArabic: 'إتقان الكتابة والمحادثة الأكاديمية لاختبار الآيلتس' },
            { id: 'cccccccc-2222-4222-8222-222222222222', title: 'English Grammar Foundations & Sentence Structure', titleArabic: 'أساسيات قواعد اللغة الإنجليزية وبناء الجملة السليمة' },
          ]);
          setLessons([
            { id: '55555555-1111-4111-8111-111111111111', courseId: 'cccccccc-1111-4111-8111-111111111111', title: 'Lesson 1.1: Analyzing the Prompt & Generating Band 7 Ideas', titleArabic: 'الدرس 1.1: تحليل نص السؤال وتوليد الأفكار لدرجة 7+' },
          ]);
        }
      } catch (err: any) {
        console.error('Error loading session form options:', err);
      } finally {
        setLoading(false);
      }
    }

    loadSelectOptions();
  }, [isOpen]);

  // Populate form for edit or reset for new session
  useEffect(() => {
    if (!isOpen) return;

    setError(null);
    if (sessionToEdit) {
      setTitle(sessionToEdit.title);
      setTitleArabic(sessionToEdit.titleArabic || '');
      setDescription(sessionToEdit.description || '');
      setDescriptionArabic(sessionToEdit.descriptionArabic || '');
      setGroupId(sessionToEdit.groupId);
      setCourseId(sessionToEdit.courseId || '');
      setLessonId(sessionToEdit.lessonId || '');
      const parts = utcToRiyadhInputs(sessionToEdit.startTime);
      setDateRiyadh(parts.date);
      setTimeRiyadh(parts.time || '20:00');
      setDurationMinutes(sessionToEdit.durationMinutes || 60);
      setProvider(sessionToEdit.provider || 'zoom');
      setMeetingUrl(sessionToEdit.meetingUrl || '');
      setTeacherNotes(sessionToEdit.teacherNotes || '');

      // Load authorized meeting URL if not already present
      if (!sessionToEdit.meetingUrl) {
        getAuthorizedMeetingLink(sessionToEdit.id)
          .then((link) => {
            if (link) setMeetingUrl(link);
          })
          .catch((err) => {
            console.error('Could not fetch meeting link for editing:', err);
          });
      }
    } else {
      setTitle('');
      setTitleArabic('');
      setDescription('');
      setDescriptionArabic('');
      setGroupId(groups[0]?.id || '');
      setCourseId('');
      setLessonId('');
      // Default to tomorrow in Riyadh time
      const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
      const parts = utcToRiyadhInputs(tomorrow.toISOString());
      setDateRiyadh(parts.date);
      setTimeRiyadh('20:00');
      setDurationMinutes(60);
      setProvider('zoom');
      setMeetingUrl('');
      setTeacherNotes('');
    }
  }, [isOpen, sessionToEdit, groups]);

  const filteredLessons = courseId
    ? lessons.filter((l) => l.courseId === courseId)
    : lessons;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError(isRtl ? 'يرجى إدخال عنوان الحصة المباشرة' : 'Please provide a session title');
      return;
    }
    if (!groupId) {
      setError(isRtl ? 'يرجى اختيار المجموعة الدراسية المخصصة' : 'Please select an assigned group');
      return;
    }
    if (!dateRiyadh || !timeRiyadh) {
      setError(isRtl ? 'يرجى تحديد تاريخ ووقت الحصة وفق توقيت مكة' : 'Please set date and time in Asia/Riyadh');
      return;
    }
    if (meetingUrl && !meetingUrl.startsWith('https://')) {
      setError(isRtl ? 'يجب أن يبدأ رابط الاجتماع بـ https://' : 'Meeting URL must begin with https://');
      return;
    }

    try {
      setSaving(true);
      if (sessionToEdit) {
        await updateLiveSession(sessionToEdit.id, {
          title: title.trim(),
          titleArabic: titleArabic.trim() || undefined,
          description: description.trim() || undefined,
          descriptionArabic: descriptionArabic.trim() || undefined,
          groupId,
          courseId: courseId || null,
          lessonId: lessonId || null,
          scheduledDateRiyadh: dateRiyadh,
          scheduledTimeRiyadh: timeRiyadh,
          durationMinutes,
          provider,
          meetingUrl: meetingUrl.trim() || undefined,
          teacherNotes: teacherNotes.trim() || undefined,
        });
      } else {
        await createLiveSession({
          title: title.trim(),
          titleArabic: titleArabic.trim() || undefined,
          description: description.trim() || undefined,
          descriptionArabic: descriptionArabic.trim() || undefined,
          groupId,
          courseId: courseId || undefined,
          lessonId: lessonId || undefined,
          scheduledDateRiyadh: dateRiyadh,
          scheduledTimeRiyadh: timeRiyadh,
          durationMinutes,
          provider,
          meetingUrl: meetingUrl.trim() || undefined,
          teacherNotes: teacherNotes.trim() || undefined,
        });
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to save session:', err);
      setError(err.message || 'An error occurred while saving the live session');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        sessionToEdit
          ? isRtl
            ? 'تعديل بيانات الحصة المباشرة'
            : 'Edit Live Session'
          : isRtl
          ? 'جدولة حصة تفاعلية مباشرة'
          : 'Schedule Live Session'
      }
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Timezone Notice Banner */}
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200/80 text-amber-800 text-xs flex items-center gap-2">
          <Clock className="w-4 h-4 shrink-0 text-amber-600" />
          <span>
            {isRtl
              ? 'ملاحظة: تُجدول جميع المواعيد بتوقيت مكة المكرمة (Asia/Riyadh - UTC+3) لضمان دقة الحضور لكافة الطلاب.'
              : 'Notice: All session times are scheduled in Asia/Riyadh (Makkah Time, UTC+3).'}
          </span>
        </div>

        {/* Titles (English & Arabic) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label={isRtl ? 'عنوان الحصة (إنجليزي) *' : 'Session Title (English) *'}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. IELTS Writing Task 2 Live Clinic"
            required
          />
          <Input
            label={isRtl ? 'عنوان الحصة (عربي)' : 'Session Title (Arabic)'}
            value={titleArabic}
            onChange={(e) => setTitleArabic(e.target.value)}
            placeholder="مثال: ورشة تدريبية لكتابة مقال الآيلتس"
          />
        </div>

        {/* Group & Course Linking */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-slate-500" />
              <span>{isRtl ? 'المجموعة الدراسية المستهدفة *' : 'Target Student Group *'}</span>
            </label>
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="w-full text-xs rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#356AE6]/30 focus:border-[#356AE6]"
              required
            >
              <option value="">{isRtl ? '-- اختر المجموعة --' : '-- Select Group --'}</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {isRtl ? g.nameArabic || g.name : g.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-slate-500" />
              <span>{isRtl ? 'المقرر المرتبط (اختياري)' : 'Associated Course (Optional)'}</span>
            </label>
            <select
              value={courseId}
              onChange={(e) => {
                setCourseId(e.target.value);
                setLessonId('');
              }}
              className="w-full text-xs rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#356AE6]/30 focus:border-[#356AE6]"
            >
              <option value="">{isRtl ? '-- بدون ربط بمقرر --' : '-- No Course Link --'}</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {isRtl ? c.titleArabic || c.title : c.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Optional Lesson Link (if course selected) */}
        {courseId && (
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-500" />
              <span>{isRtl ? 'الدرس المرتبط (اختياري)' : 'Associated Lesson (Optional)'}</span>
            </label>
            <select
              value={lessonId}
              onChange={(e) => setLessonId(e.target.value)}
              className="w-full text-xs rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#356AE6]/30 focus:border-[#356AE6]"
            >
              <option value="">{isRtl ? '-- عام للمقرر بدون درس محدد --' : '-- General Course Session --'}</option>
              {filteredLessons.map((l) => (
                <option key={l.id} value={l.id}>
                  {isRtl ? l.titleArabic || l.title : l.title}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Schedule Date & Time (Riyadh) + Duration */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <span>{isRtl ? 'تاريخ الحصة *' : 'Session Date *'}</span>
            </label>
            <input
              type="date"
              value={dateRiyadh}
              onChange={(e) => setDateRiyadh(e.target.value)}
              className="w-full text-xs rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#356AE6]/30 focus:border-[#356AE6]"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span>{isRtl ? 'الوقت بتوقيت مكة *' : 'Time (Asia/Riyadh) *'}</span>
            </label>
            <input
              type="time"
              value={timeRiyadh}
              onChange={(e) => setTimeRiyadh(e.target.value)}
              className="w-full text-xs rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#356AE6]/30 focus:border-[#356AE6]"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span>{isRtl ? 'المدة (بالدقائق)' : 'Duration (Minutes)'}</span>
            </label>
            <select
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
              className="w-full text-xs rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#356AE6]/30 focus:border-[#356AE6]"
            >
              <option value={30}>30 {isRtl ? 'دقيقة' : 'min'}</option>
              <option value={45}>45 {isRtl ? 'دقيقة' : 'min'}</option>
              <option value={60}>60 {isRtl ? 'دقيقة (ساعة)' : 'min (1 hr)'}</option>
              <option value={90}>90 {isRtl ? 'دقيقة (ساعة ونصف)' : 'min (1.5 hr)'}</option>
              <option value={120}>120 {isRtl ? 'دقيقة (ساعتان)' : 'min (2 hrs)'}</option>
            </select>
          </div>
        </div>

        {/* Meeting Provider & Meeting URL */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
              <Video className="w-3.5 h-3.5 text-slate-500" />
              <span>{isRtl ? 'مزود البث' : 'Meeting Platform'}</span>
            </label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as LiveSessionProvider)}
              className="w-full text-xs rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#356AE6]/30 focus:border-[#356AE6]"
            >
              <option value="zoom">Zoom</option>
              <option value="google_meet">Google Meet</option>
              <option value="teams">Microsoft Teams</option>
              <option value="custom">{isRtl ? 'رابط مخصص' : 'Custom URL'}</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <Input
              label={isRtl ? 'رابط الاجتماع الآمن (متاح فقط للمجموعة) *' : 'Secure Meeting URL (Restricted to cohort) *'}
              value={meetingUrl}
              onChange={(e) => setMeetingUrl(e.target.value)}
              placeholder="https://zoom.us/j/123456789... or https://meet.google.com/..."
              startIcon={<Link2 className="w-4 h-4 text-slate-400" />}
              required
            />
          </div>
        </div>

        {/* Descriptions & Notes */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            {isRtl ? 'وصف الحصة والمحاور الأساسية' : 'Session Objectives & Outline'}
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full text-xs rounded-xl border border-slate-300 bg-white p-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#356AE6]/30 focus:border-[#356AE6]"
            placeholder={isRtl ? 'اكتب نبذة عن أهداف الحصة للطلاب...' : 'Outline key discussion topics for attendees...'}
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            {isRtl ? 'ملاحظات المعلم الداخلية (سرية)' : 'Teacher Internal Notes (Private)'}
          </label>
          <input
            type="text"
            value={teacherNotes}
            onChange={(e) => setTeacherNotes(e.target.value)}
            className="w-full text-xs rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#356AE6]/30 focus:border-[#356AE6]"
            placeholder={isRtl ? 'ملاحظات خاصة بالتحضير أو متابعة الواجبات السابقة...' : 'Private reminders for this lecture...'}
          />
        </div>

        {/* Form Actions */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" type="button" onClick={onClose} disabled={saving}>
            {isRtl ? 'إلغاء' : 'Cancel'}
          </Button>
          <Button variant="primary" size="sm" type="submit" isLoading={saving}>
            {sessionToEdit
              ? isRtl
                ? 'حفظ التعديلات'
                : 'Save Changes'
              : isRtl
              ? 'تأكيد الجدولة'
              : 'Schedule Session'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
