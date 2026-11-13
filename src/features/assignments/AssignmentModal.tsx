/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  Calendar,
  Clock,
  FileText,
  UploadCloud,
  Trash2,
  Plus,
  AlertCircle,
  HelpCircle,
  BookOpen,
  Users,
  Award,
  Save,
  CheckCircle2,
} from 'lucide-react';
import {
  AssignmentRecord,
  AssignmentType,
  AssignmentAttachment,
  AssignmentStatus,
  RubricCriterion,
  CreateAssignmentPayload,
} from './types';
import {
  ASSIGNMENT_TYPES,
  validateAssignmentPayload,
  formatFileSize,
  ALLOWED_FILE_EXTENSIONS,
} from './assignmentUtils';
import {
  createAssignment,
  updateAssignment,
  uploadAssignmentFile,
} from './assignmentService';
import { fetchTeacherCourses, fetchCourseCurriculum } from '../courses/coursesService';
import { fetchGroups, GroupRecord } from '../groups/groupService';
import { fetchStudents, StudentRecord } from '../students/studentService';

interface AssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  assignmentToEdit?: AssignmentRecord | null;
  onSaved: () => void;
}

export const AssignmentModal: React.FC<AssignmentModalProps> = ({
  isOpen,
  onClose,
  assignmentToEdit,
  onSaved,
}) => {
  // 1. Form States
  const [title, setTitle] = useState('');
  const [titleArabic, setTitleArabic] = useState('');
  const [instructions, setInstructions] = useState('');
  const [instructionsArabic, setInstructionsArabic] = useState('');
  const [assignmentType, setAssignmentType] = useState<AssignmentType>('written');
  const [courseId, setCourseId] = useState('');
  const [unitId, setUnitId] = useState<string>('');
  const [lessonId, setLessonId] = useState<string>('');
  const [dueDate, setDueDate] = useState('');
  const [cutoffDate, setCutoffDate] = useState('');
  const [maxScore, setMaxScore] = useState<number>(100);
  const [maxAttempts, setMaxAttempts] = useState<number>(1);
  const [allowLateSubmissions, setAllowLateSubmissions] = useState<boolean>(true);
  const [latePenaltyPercentage, setLatePenaltyPercentage] = useState<number>(10);
  const [gracePeriodMinutes, setGracePeriodMinutes] = useState<number>(15);
  const [status, setStatus] = useState<AssignmentStatus>('draft');

  // Targets
  const [targetMode, setTargetMode] = useState<'all' | 'groups' | 'students'>('all');
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);

  // Rubric
  const [rubric, setRubric] = useState<RubricCriterion[]>([]);

  // Attachments
  const [attachments, setAttachments] = useState<AssignmentAttachment[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);

  // Metadata dropdown state
  const [courses, setCourses] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [lessons, setLessons] = useState<any[]>([]);
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [students, setStudents] = useState<StudentRecord[]>([]);

  // UI status
  const [activeTab, setActiveTab] = useState<'details' | 'rules' | 'rubric' | 'attachments'>('details');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Load initial dropdown options
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    async function loadOptions() {
      try {
        const [cList, gList, sList] = await Promise.all([
          fetchTeacherCourses(),
          fetchGroups('active'),
          fetchStudents(),
        ]);
        if (isMounted) {
          setCourses(cList || []);
          setGroups(gList || []);
          setStudents(sList || []);
        }
      } catch (err) {
        console.error('Failed to load courses or groups:', err);
      }
    }
    loadOptions();

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Load curriculum (units, lessons) when course changes
  useEffect(() => {
    if (!courseId) {
      setUnits([]);
      setLessons([]);
      return;
    }
    let isMounted = true;
    async function loadCurriculum() {
      try {
        const data = await fetchCourseCurriculum(courseId);
        if (isMounted) {
          setUnits(data.units || []);
        }
      } catch (err) {
        console.error('Failed to load curriculum:', err);
      }
    }
    loadCurriculum();
    return () => {
      isMounted = false;
    };
  }, [courseId]);

  // Populate lessons when unit changes
  useEffect(() => {
    if (!unitId) {
      setLessons([]);
      return;
    }
    const unit = units.find((u) => u.id === unitId);
    setLessons(unit?.lessons || []);
  }, [unitId, units]);

  // Populate form when editing or resetting
  useEffect(() => {
    if (!isOpen) return;

    if (assignmentToEdit) {
      setTitle(assignmentToEdit.title || '');
      setTitleArabic(assignmentToEdit.titleArabic || '');
      setInstructions(assignmentToEdit.instructions || '');
      setInstructionsArabic(assignmentToEdit.instructionsArabic || '');
      setAssignmentType(assignmentToEdit.assignmentType || 'written');
      setCourseId(assignmentToEdit.courseId || '');
      setUnitId(assignmentToEdit.unitId || '');
      setLessonId(assignmentToEdit.lessonId || '');
      setDueDate(assignmentToEdit.dueDate ? new Date(assignmentToEdit.dueDate).toISOString().slice(0, 16) : '');
      setCutoffDate(assignmentToEdit.cutoffDate ? new Date(assignmentToEdit.cutoffDate).toISOString().slice(0, 16) : '');
      setMaxScore(assignmentToEdit.maxScore || 100);
      setMaxAttempts(assignmentToEdit.maxAttempts || 1);
      setAllowLateSubmissions(assignmentToEdit.allowLateSubmissions ?? true);
      setLatePenaltyPercentage(assignmentToEdit.latePenaltyPercentage ?? 10);
      setGracePeriodMinutes(assignmentToEdit.gracePeriodMinutes ?? 15);
      setStatus(assignmentToEdit.status || 'draft');
      setRubric(assignmentToEdit.rubric || []);
      setAttachments(assignmentToEdit.attachments || []);

      if (assignmentToEdit.targets && assignmentToEdit.targets.length > 0) {
        const hasStudents = assignmentToEdit.targets.some((t) => t.targetType === 'student');
        if (hasStudents) {
          setTargetMode('students');
          setSelectedStudentIds(
            assignmentToEdit.targets.filter((t) => t.targetType === 'student' && t.studentId).map((t) => t.studentId!)
          );
        } else {
          setTargetMode('groups');
          setSelectedGroupIds(
            assignmentToEdit.targets.filter((t) => t.targetType === 'group' && t.groupId).map((t) => t.groupId!)
          );
        }
      } else {
        setTargetMode('all');
      }
    } else {
      // Defaults for new assignment
      setTitle('');
      setTitleArabic('');
      setInstructions('');
      setInstructionsArabic('');
      setAssignmentType('written');
      setCourseId('');
      setUnitId('');
      setLessonId('');
      // Default due date: tomorrow at 23:59
      const d = new Date();
      d.setDate(d.getDate() + 3);
      d.setHours(23, 59, 0, 0);
      setDueDate(d.toISOString().slice(0, 16));
      setCutoffDate('');
      setMaxScore(100);
      setMaxAttempts(1);
      setAllowLateSubmissions(true);
      setLatePenaltyPercentage(10);
      setGracePeriodMinutes(15);
      setStatus('draft');
      setTargetMode('all');
      setSelectedGroupIds([]);
      setSelectedStudentIds([]);
      setRubric([]);
      setAttachments([]);
    }
    setErrors([]);
    setSuccessMessage(null);
    setActiveTab('details');
  }, [isOpen, assignmentToEdit]);

  if (!isOpen) return null;

  // File upload handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!ALLOWED_FILE_EXTENSIONS.includes(ext)) {
      setErrors([`صيغة الملف غير مدعومة (.${ext}). يرجى رفع ملف صالح (PDF, Word, Excel, Images)`]);
      return;
    }

    try {
      setUploadingFile(true);
      setErrors([]);
      const uploaded = await uploadAssignmentFile(
        file,
        'attachments',
        assignmentToEdit?.id || 'temp_' + Date.now()
      );
      setAttachments((prev) => [...prev, uploaded]);
    } catch (err: any) {
      setErrors([err.message || 'فشل رفع الملف']);
    } finally {
      setUploadingFile(false);
      e.target.value = '';
    }
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  // Rubric helpers
  const handleAddRubricCriterion = () => {
    const newCrit: RubricCriterion = {
      id: 'crit_' + Date.now(),
      title: 'Grammar & Accuracy',
      titleArabic: 'صحة القواعد اللغوية والدقة',
      description: 'Correct verb tense usage and sentence structure.',
      maxPoints: 20,
    };
    setRubric((prev) => [...prev, newCrit]);
  };

  const handleUpdateCriterion = (id: string, updates: Partial<RubricCriterion>) => {
    setRubric((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
    );
  };

  const handleRemoveCriterion = (id: string) => {
    setRubric((prev) => prev.filter((c) => c.id !== id));
  };

  // Save handler
  const handleSave = async (publishImmediately = false) => {
    setErrors([]);
    setSuccessMessage(null);

    const chosenStatus: AssignmentStatus = publishImmediately ? 'published' : status;

    const payload: Partial<CreateAssignmentPayload> = {
      title,
      titleArabic: titleArabic.trim() ? titleArabic : title,
      instructions,
      instructionsArabic,
      assignmentType,
      courseId,
      unitId: unitId || null,
      lessonId: lessonId || null,
      dueDate: dueDate ? new Date(dueDate).toISOString() : '',
      cutoffDate: cutoffDate ? new Date(cutoffDate).toISOString() : null,
      maxScore,
      maxAttempts,
      allowLateSubmissions,
      latePenaltyPercentage,
      gracePeriodMinutes,
      status: chosenStatus,
      attachments,
      rubric,
      targets:
        targetMode === 'groups'
          ? selectedGroupIds.map((gid) => ({ targetType: 'group' as const, groupId: gid }))
          : targetMode === 'students'
          ? selectedStudentIds.map((sid) => ({ targetType: 'student' as const, studentId: sid }))
          : [],
    };

    const validation = validateAssignmentPayload(payload);
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    try {
      setLoading(true);
      if (assignmentToEdit) {
        await updateAssignment(assignmentToEdit.id, payload);
        setSuccessMessage('تم تحديث الواجب بنجاح');
      } else {
        await createAssignment(payload as CreateAssignmentPayload);
        setSuccessMessage('تم إنشاء الواجب بنجاح');
      }

      setTimeout(() => {
        onSaved();
        onClose();
      }, 700);
    } catch (err: any) {
      setErrors([err.message || 'حدث خطأ أثناء حفظ الواجب']);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div
        dir="rtl"
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-50 text-blue-700 border border-blue-200">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {assignmentToEdit ? 'تعديل الواجب المنزلي' : 'إنشاء واجب منزلي وتطبيق جديد'}
              </h2>
              <p className="text-xs text-slate-500">
                إدارة المهام والتطبيقات اللغوية، مواعيد التسليم، والسلالم التقييمية (Rubrics)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 px-6 bg-slate-100/70 text-xs font-semibold gap-2">
          <button
            onClick={() => setActiveTab('details')}
            className={`py-3 px-4 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'details'
                ? 'border-blue-600 text-blue-700 font-bold bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            بيانات الواجب والمنهج
          </button>
          <button
            onClick={() => setActiveTab('rules')}
            className={`py-3 px-4 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'rules'
                ? 'border-blue-600 text-blue-700 font-bold bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            مواعيد التسليم والاستهداف (توقيت مكة)
          </button>
          <button
            onClick={() => setActiveTab('rubric')}
            className={`py-3 px-4 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'rubric'
                ? 'border-blue-600 text-blue-700 font-bold bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            معايير التقييم (Rubric)
          </button>
          <button
            onClick={() => setActiveTab('attachments')}
            className={`py-3 px-4 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'attachments'
                ? 'border-blue-600 text-blue-700 font-bold bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            الملفات المرفقة ({attachments.length})
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Notifications / Errors */}
          {errors.length > 0 && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 space-y-1">
              <div className="flex items-center gap-2 font-bold text-rose-800">
                <AlertCircle className="w-4 h-4" />
                <span>يرجى مراجعة الملاحظات التالية:</span>
              </div>
              <ul className="list-disc list-inside space-y-0.5">
                {errors.map((e, idx) => (
                  <li key={idx}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          {successMessage && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2 font-bold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* TAB 1: DETAILS */}
          {activeTab === 'details' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    عنوان الواجب (English) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Essay on Climate Change & Renewable Energy"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    عنوان الواجب (بالعربية)
                  </label>
                  <input
                    type="text"
                    value={titleArabic}
                    onChange={(e) => setTitleArabic(e.target.value)}
                    placeholder="مثال: مقال حول التغير المناخي والطاقة المتجددة"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Assignment Type & Score */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    نوع الواجب والتسليم
                  </label>
                  <select
                    value={assignmentType}
                    onChange={(e) => setAssignmentType(e.target.value as AssignmentType)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  >
                    {ASSIGNMENT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.labelAr} ({t.labelEn})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    الدرجة القصوى للواجب
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    value={maxScore}
                    onChange={(e) => setMaxScore(parseInt(e.target.value) || 100)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    حالة النشر الحالية
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as AssignmentStatus)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  >
                    <option value="draft">مسودة (Draft - غير مرئي للطلاب)</option>
                    <option value="published">منشور (Published - متاح للتسليم)</option>
                    <option value="closed">مغلق (Closed - انتهاء المهلة)</option>
                  </select>
                </div>
              </div>

              {/* Curriculum Selection */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                  <BookOpen className="w-4 h-4 text-blue-600" />
                  <span>الربط بالمنهج الأكاديمي</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      الكورس الدراسي <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={courseId}
                      onChange={(e) => {
                        setCourseId(e.target.value);
                        setUnitId('');
                        setLessonId('');
                      }}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    >
                      <option value="">-- اختر الكورس --</option>
                      {courses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.titleArabic || c.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      الوحدة التعليمية (اختياري)
                    </label>
                    <select
                      value={unitId}
                      onChange={(e) => {
                        setUnitId(e.target.value);
                        setLessonId('');
                      }}
                      disabled={!courseId}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-hidden disabled:bg-slate-100"
                    >
                      <option value="">-- عام في الكورس / كل الوحدات --</option>
                      {units.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.titleArabic || u.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      الدرس المرتبط (اختياري)
                    </label>
                    <select
                      value={lessonId}
                      onChange={(e) => setLessonId(e.target.value)}
                      disabled={!unitId}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-hidden disabled:bg-slate-100"
                    >
                      <option value="">-- كل دروس الوحدة --</option>
                      {lessons.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.titleArabic || l.title}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Instructions */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  توجيهات وتعليمات الحل للطلاب (English)
                </label>
                <textarea
                  rows={3}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="Write an essay of at least 250 words following the IELTS Writing Task 2 criteria..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  توجيهات إضافية باللغة العربية (اختياري)
                </label>
                <textarea
                  rows={2}
                  value={instructionsArabic}
                  onChange={(e) => setInstructionsArabic(e.target.value)}
                  placeholder="اكتب مقالاً لا يقل عن 250 كلمة مع مراعاة مقدمة قوية وجسم موضوعي وخاتمة واضحة..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>
            </div>
          )}

          {/* TAB 2: RULES & TARGETING */}
          {activeTab === 'rules' && (
            <div className="space-y-6">
              {/* Deadlines Section */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                    <Calendar className="w-4 h-4 text-blue-600" />
                    <span>مواعيد التسليم (توقيت مكة المكرمة - Asia/Riyadh)</span>
                  </div>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 border border-blue-200">
                    GMT+3 (توقيت مكة)
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      موعد التسليم النهائي (Due Date) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="datetime-local"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      موعد الإغلاق التام (Cutoff Date - يمنع أي تسليم بعده)
                    </label>
                    <input
                      type="datetime-local"
                      value={cutoffDate}
                      onChange={(e) => setCutoffDate(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    />
                  </div>
                </div>

                {/* Late policy and grace period */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-200">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      السماح بالتسليم المتأخر؟
                    </label>
                    <div className="flex items-center gap-2 mt-2">
                      <input
                        type="checkbox"
                        id="allowLateToggle"
                        checked={allowLateSubmissions}
                        onChange={(e) => setAllowLateSubmissions(e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded-sm"
                      />
                      <label htmlFor="allowLateToggle" className="text-xs text-slate-700 cursor-pointer">
                        قبول الحلول بعد الموعد
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      فترة السماح التلقائية (بالدقائق)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={gracePeriodMinutes}
                      onChange={(e) => setGracePeriodMinutes(parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">لا يُحتسب التأخير خلال هذه الدقائق</p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      نسبة خصم التأخير (%)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={latePenaltyPercentage}
                      onChange={(e) => setLatePenaltyPercentage(parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">تُخصم من إجمالي الدرجة إذا سُلّم متأخراً</p>
                  </div>
                </div>

                <div className="pt-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    عدد المحاولات المسموح بها للطالب
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={maxAttempts}
                    onChange={(e) => setMaxAttempts(parseInt(e.target.value) || 1)}
                    className="w-48 px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    في حال طلب الأستاذ تعديل الحل، يمكن للطالب رفع محاولة جديدة ضمن هذا الحد
                  </p>
                </div>
              </div>

              {/* Target Students / Groups */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                  <Users className="w-4 h-4 text-blue-600" />
                  <span>تخصيص الواجب والمستهدفين</span>
                </div>

                <div className="flex gap-4 text-xs font-semibold">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="targetMode"
                      value="all"
                      checked={targetMode === 'all'}
                      onChange={() => setTargetMode('all')}
                      className="text-blue-600"
                    />
                    <span>جميع الطلاب المسجلين بالكورس</span>
                  </label>

                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="targetMode"
                      value="groups"
                      checked={targetMode === 'groups'}
                      onChange={() => setTargetMode('groups')}
                      className="text-blue-600"
                    />
                    <span>مجموعات محددة فقط</span>
                  </label>

                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="targetMode"
                      value="students"
                      checked={targetMode === 'students'}
                      onChange={() => setTargetMode('students')}
                      className="text-blue-600"
                    />
                    <span>طلاب محددين بالاسم</span>
                  </label>
                </div>

                {targetMode === 'groups' && (
                  <div className="space-y-2 pt-2 border-t border-slate-200">
                    <p className="text-xs text-slate-600 font-bold">حدد المجموعات المستهدفة:</p>
                    <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2 bg-white rounded-xl border border-slate-200">
                      {groups.map((g) => (
                        <label key={g.id} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer p-1 hover:bg-slate-50 rounded-md">
                          <input
                            type="checkbox"
                            checked={selectedGroupIds.includes(g.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedGroupIds((prev) => [...prev, g.id]);
                              } else {
                                setSelectedGroupIds((prev) => prev.filter((id) => id !== g.id));
                              }
                            }}
                            className="rounded-sm text-blue-600"
                          />
                          <span>{g.nameArabic || g.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {targetMode === 'students' && (
                  <div className="space-y-2 pt-2 border-t border-slate-200">
                    <p className="text-xs text-slate-600 font-bold">حدد الطلاب المستهدفين:</p>
                    <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2 bg-white rounded-xl border border-slate-200">
                      {students.map((s) => (
                        <label key={s.id} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer p-1 hover:bg-slate-50 rounded-md">
                          <input
                            type="checkbox"
                            checked={selectedStudentIds.includes(s.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedStudentIds((prev) => [...prev, s.id]);
                              } else {
                                setSelectedStudentIds((prev) => prev.filter((id) => id !== s.id));
                              }
                            }}
                            className="rounded-sm text-blue-600"
                          />
                          <span>
                            {s.fullNameArabic || s.fullName}
                            {s.academicProfile?.studentNumber ? ` (${s.academicProfile.studentNumber})` : s.academicProfile?.username ? ` (${s.academicProfile.username})` : ''}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: RUBRIC */}
          {activeTab === 'rubric' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-900">سلم معايير التصحيح (Grading Rubric)</h4>
                  <p className="text-[11px] text-slate-500">
                    أضف معايير تفصيلية لتوزيع درجات الواجب (مثل: القواعد 20، المفردات 30، الترابط 50).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAddRubricCriterion}
                  className="px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold hover:bg-blue-100 flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة معيار تصحيح</span>
                </button>
              </div>

              {rubric.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <Award className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-600">لا يوجد سلم معايير بعد</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    يمكنك رصد درجة إجمالية مباشرة، أو إضافة معايير فرعية للمساعدة في التصحيح الموضوعي.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {rubric.map((criterion, idx) => (
                    <div
                      key={criterion.id}
                      className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-extrabold text-slate-700">المعيار {idx + 1}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveCriterion(criterion.id)}
                          className="text-rose-500 hover:text-rose-700 text-xs flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>حذف</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                            اسم المعيار (English)
                          </label>
                          <input
                            type="text"
                            value={criterion.title}
                            onChange={(e) => handleUpdateCriterion(criterion.id, { title: e.target.value })}
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                            اسم المعيار (عربي)
                          </label>
                          <input
                            type="text"
                            value={criterion.titleArabic || ''}
                            onChange={(e) => handleUpdateCriterion(criterion.id, { titleArabic: e.target.value })}
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                            الدرجة المخصصة لهذا المعيار
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={criterion.maxPoints}
                            onChange={(e) =>
                              handleUpdateCriterion(criterion.id, { maxPoints: parseInt(e.target.value) || 0 })
                            }
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                          توجيهات التقييم والشرح
                        </label>
                        <input
                          type="text"
                          value={criterion.description || ''}
                          onChange={(e) => handleUpdateCriterion(criterion.id, { description: e.target.value })}
                          placeholder="تفاصيل التقييم وكيفية منح الدرجة..."
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
                        />
                      </div>
                    </div>
                  ))}

                  <div className="flex justify-between items-center text-xs font-bold px-3 py-2 bg-blue-50 text-blue-900 rounded-xl border border-blue-200">
                    <span>مجموع درجات المعايير:</span>
                    <span>
                      {rubric.reduce((acc, c) => acc + (c.maxPoints || 0), 0)} / {maxScore} درجة
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: ATTACHMENTS */}
          {activeTab === 'attachments' && (
            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-bold text-slate-900">مرفقات الأستاذ (نماذج، ملفات PDF، أسئلة إضافية)</h4>
                <p className="text-[11px] text-slate-500">
                  الملفات المرفوعة تُحفظ بأمان في التخزين السحابي الخاص للمنصة ويتم توليد روابط وصول مؤمنة للطلاب.
                </p>
              </div>

              {/* Upload area */}
              <div className="p-6 border-2 border-dashed border-slate-300 hover:border-blue-400 bg-slate-50 rounded-2xl text-center relative transition-colors">
                <UploadCloud className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-700">اضغط لرفع ملف أو اسحب الملف وأفلته هنا</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  الحد الأقصى للملف: 50MB (PDF, DOCX, XLSX, Images, Audio)
                </p>
                <input
                  type="file"
                  onChange={handleFileUpload}
                  disabled={uploadingFile}
                  className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
                />
              </div>

              {uploadingFile && (
                <div className="text-xs text-blue-600 font-bold flex items-center justify-center gap-2">
                  <div className="w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  <span>جارٍ رفع وتأمين الملف...</span>
                </div>
              )}

              {/* Uploaded attachments list */}
              {attachments.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-slate-800">الملفات المرفقة حالياً:</p>
                  <div className="space-y-2">
                    {attachments.map((file, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                            <FileText className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-800">{file.name}</p>
                            <p className="text-[10px] text-slate-400">{formatFileSize(file.size)}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveAttachment(idx)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 rounded-xl hover:bg-slate-200 transition-colors cursor-pointer"
          >
            إلغاء
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => handleSave(false)}
              className="px-4 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>حفظ كمسودة</span>
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={() => handleSave(true)}
              className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>نشر الواجب فوراً</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
