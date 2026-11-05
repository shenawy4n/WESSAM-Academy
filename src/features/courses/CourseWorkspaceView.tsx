/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useLocale } from '../../hooks/useLocale';
import {
  CourseRecord,
  CourseUnitRecord,
  LessonRecord,
  CourseLevel,
  fetchCourseCurriculum,
  updateCourse,
  toggleCoursePublish,
  createUnit,
  updateUnit,
  deleteUnit,
  reorderUnits,
  createLesson,
  updateLesson,
  deleteLesson,
  reorderLessons,
  addLessonResource,
  deleteLessonResource,
  fetchCourseAssignedGroups,
  assignCourseToGroup,
  removeCourseFromGroup,
} from './coursesService';
import { fetchGroups, GroupRecord } from '../groups/groupService';
import { SafeVideoPlayer } from './SafeVideoPlayer';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  Edit2,
  Trash2,
  ChevronDown,
  ChevronUp,
  FileText,
  Video,
  Paperclip,
  Users,
  Settings,
  BookOpen,
  CheckCircle,
  Eye,
  EyeOff,
  Clock,
  Download,
  AlertCircle,
  Layers,
} from 'lucide-react';

interface CourseWorkspaceViewProps {
  courseId: string;
  onBack: () => void;
}

type WorkspaceTab = 'curriculum' | 'groups' | 'settings';

export const CourseWorkspaceView: React.FC<CourseWorkspaceViewProps> = ({
  courseId,
  onBack,
}) => {
  const { t, isRtl } = useLocale();

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('curriculum');
  const [isLoading, setIsLoading] = useState(true);
  const [course, setCourse] = useState<CourseRecord | null>(null);
  const [units, setUnits] = useState<CourseUnitRecord[]>([]);
  const [assignedGroups, setAssignedGroups] = useState<
    { id: string; name: string; nameArabic: string; assignedAt: string; studentCount: number }[]
  >([]);
  const [availableGroups, setAvailableGroups] = useState<GroupRecord[]>([]);

  const [expandedUnits, setExpandedUnits] = useState<Record<string, boolean>>({});
  const [previewLesson, setPreviewLesson] = useState<LessonRecord | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Unit modal states
  const [isUnitModalOpen, setIsUnitModalOpen] = useState(false);
  const [unitToEdit, setUnitToEdit] = useState<CourseUnitRecord | null>(null);
  const [unitTitleEn, setUnitTitleEn] = useState('');
  const [unitTitleAr, setUnitTitleAr] = useState('');

  // Lesson modal states
  const [isLessonModalOpen, setIsLessonModalOpen] = useState(false);
  const [lessonToEdit, setLessonToEdit] = useState<LessonRecord | null>(null);
  const [activeUnitIdForLesson, setActiveUnitIdForLesson] = useState<string | null>(null);
  const [lessonTitleEn, setLessonTitleEn] = useState('');
  const [lessonTitleAr, setLessonTitleAr] = useState('');
  const [lessonDescription, setLessonDescription] = useState('');
  const [lessonDuration, setLessonDuration] = useState(45);
  const [lessonVideoUrl, setLessonVideoUrl] = useState('');
  const [lessonIsPublished, setLessonIsPublished] = useState(true);

  // Resource modal states
  const [isResourceModalOpen, setIsResourceModalOpen] = useState(false);
  const [activeLessonIdForResource, setActiveLessonIdForResource] = useState<string | null>(null);
  const [resTitleEn, setResTitleEn] = useState('');
  const [resTitleAr, setResTitleAr] = useState('');
  const [resFileUrl, setResFileUrl] = useState('');

  // Group assign modal states
  const [selectedGroupIdToAssign, setSelectedGroupIdToAssign] = useState<string>('');

  // Course settings edit state
  const [settingsTitle, setSettingsTitle] = useState('');
  const [settingsTitleAr, setSettingsTitleAr] = useState('');
  const [settingsDesc, setSettingsDesc] = useState('');
  const [settingsDescAr, setSettingsDescAr] = useState('');
  const [settingsLevel, setSettingsLevel] = useState<CourseLevel>('intermediate');
  const [settingsCoverUrl, setSettingsCoverUrl] = useState('');
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [curric, groupsAssigned, allGroups] = await Promise.all([
        fetchCourseCurriculum(courseId),
        fetchCourseAssignedGroups(courseId),
        fetchGroups('active'),
      ]);

      setCourse(curric.course);
      setUnits(curric.units);
      setAssignedGroups(groupsAssigned);
      setAvailableGroups(allGroups);

      // Auto-expand all units initially
      const expMap: Record<string, boolean> = {};
      curric.units.forEach((u) => {
        expMap[u.id] = true;
      });
      setExpandedUnits(expMap);

      // Populate settings form
      setSettingsTitle(curric.course.title);
      setSettingsTitleAr(curric.course.titleArabic);
      setSettingsDesc(curric.course.description || '');
      setSettingsDescAr(curric.course.descriptionArabic || '');
      setSettingsLevel(curric.course.level);
      setSettingsCoverUrl(curric.course.coverImageUrl || '');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load curriculum');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [courseId]);

  const toggleUnitExpand = (unitId: string) => {
    setExpandedUnits((prev) => ({ ...prev, [unitId]: !prev[unitId] }));
  };

  const handleToggleCoursePublish = async () => {
    if (!course) return;
    try {
      const nextState = !course.isPublished;
      await toggleCoursePublish(course.id, nextState);
      setCourse({ ...course, isPublished: nextState });
      setSuccessMessage(
        nextState
          ? (isRtl ? 'تم نشر المقرر الدراسي بنجاح' : 'Course published successfully')
          : (isRtl ? 'تم تحويل المقرر إلى مسودة' : 'Course reverted to draft')
      );
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update course status');
    }
  };

  // ---------------------------------------------------------------------------
  // Unit Actions
  // ---------------------------------------------------------------------------
  const handleOpenAddUnit = () => {
    setUnitToEdit(null);
    setUnitTitleEn('');
    setUnitTitleAr('');
    setIsUnitModalOpen(true);
  };

  const handleOpenEditUnit = (unit: CourseUnitRecord) => {
    setUnitToEdit(unit);
    setUnitTitleEn(unit.title);
    setUnitTitleAr(unit.titleArabic);
    setIsUnitModalOpen(true);
  };

  const handleSaveUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unitTitleEn.trim() || !unitTitleAr.trim()) return;
    try {
      if (unitToEdit) {
        await updateUnit({
          id: unitToEdit.id,
          title: unitTitleEn.trim(),
          titleArabic: unitTitleAr.trim(),
        });
      } else {
        await createUnit({
          courseId,
          title: unitTitleEn.trim(),
          titleArabic: unitTitleAr.trim(),
        });
      }
      setIsUnitModalOpen(false);
      await loadData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save unit');
    }
  };

  const handleDeleteUnit = async (unitId: string) => {
    if (!window.confirm(t.courses.deleteUnitConfirm)) return;
    try {
      await deleteUnit(unitId);
      await loadData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to delete unit');
    }
  };

  const handleMoveUnit = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= units.length) return;

    const newUnits = [...units];
    const [moved] = newUnits.splice(index, 1);
    newUnits.splice(targetIndex, 0, moved);
    setUnits(newUnits);

    try {
      await reorderUnits(
        courseId,
        newUnits.map((u) => u.id)
      );
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to reorder units');
      await loadData();
    }
  };

  // ---------------------------------------------------------------------------
  // Lesson Actions
  // ---------------------------------------------------------------------------
  const handleOpenAddLesson = (unitId: string) => {
    setActiveUnitIdForLesson(unitId);
    setLessonToEdit(null);
    setLessonTitleEn('');
    setLessonTitleAr('');
    setLessonDescription('');
    setLessonDuration(45);
    setLessonVideoUrl('');
    setLessonIsPublished(true);
    setIsLessonModalOpen(true);
  };

  const handleOpenEditLesson = (lesson: LessonRecord) => {
    setActiveUnitIdForLesson(lesson.unitId);
    setLessonToEdit(lesson);
    setLessonTitleEn(lesson.title);
    setLessonTitleAr(lesson.titleArabic);
    setLessonDescription(lesson.description || '');
    setLessonDuration(lesson.durationMinutes || 45);
    setLessonVideoUrl(lesson.videoUrl || '');
    setLessonIsPublished(lesson.isPublished);
    setIsLessonModalOpen(true);
  };

  const handleSaveLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lessonTitleEn.trim() || !lessonTitleAr.trim()) return;
    try {
      if (lessonToEdit) {
        await updateLesson({
          id: lessonToEdit.id,
          title: lessonTitleEn.trim(),
          titleArabic: lessonTitleAr.trim(),
          description: lessonDescription.trim(),
          durationMinutes: lessonDuration,
          videoUrl: lessonVideoUrl.trim() || undefined,
          isPublished: lessonIsPublished,
        });
      } else if (activeUnitIdForLesson) {
        await createLesson({
          courseId,
          unitId: activeUnitIdForLesson,
          title: lessonTitleEn.trim(),
          titleArabic: lessonTitleAr.trim(),
          description: lessonDescription.trim(),
          durationMinutes: lessonDuration,
          videoUrl: lessonVideoUrl.trim() || undefined,
          isPublished: lessonIsPublished,
        });
      }
      setIsLessonModalOpen(false);
      await loadData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save lesson');
    }
  };

  const handleDeleteLesson = async (lessonId: string) => {
    if (!window.confirm(t.courses.deleteLessonConfirm)) return;
    try {
      await deleteLesson(lessonId);
      if (previewLesson?.id === lessonId) setPreviewLesson(null);
      await loadData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to delete lesson');
    }
  };

  const handleMoveLesson = async (unitId: string, lessonIndex: number, direction: 'up' | 'down') => {
    const unit = units.find((u) => u.id === unitId);
    if (!unit) return;
    const targetIndex = direction === 'up' ? lessonIndex - 1 : lessonIndex + 1;
    if (targetIndex < 0 || targetIndex >= unit.lessons.length) return;

    const newLessons = [...unit.lessons];
    const [moved] = newLessons.splice(lessonIndex, 1);
    newLessons.splice(targetIndex, 0, moved);

    const updatedUnits = units.map((u) => (u.id === unitId ? { ...u, lessons: newLessons } : u));
    setUnits(updatedUnits);

    try {
      await reorderLessons(
        unitId,
        newLessons.map((l) => l.id)
      );
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to reorder lessons');
      await loadData();
    }
  };

  // ---------------------------------------------------------------------------
  // Resource Actions
  // ---------------------------------------------------------------------------
  const handleOpenAddResource = (lessonId: string) => {
    setActiveLessonIdForResource(lessonId);
    setResTitleEn('');
    setResTitleAr('');
    setResFileUrl('');
    setIsResourceModalOpen(true);
  };

  const handleSaveResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeLessonIdForResource || !resTitleEn.trim() || !resFileUrl.trim()) return;
    try {
      await addLessonResource({
        lessonId: activeLessonIdForResource,
        title: resTitleEn.trim(),
        titleArabic: resTitleAr.trim() || undefined,
        fileUrl: resFileUrl.trim(),
        fileType: 'pdf',
      });
      setIsResourceModalOpen(false);
      await loadData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to add resource');
    }
  };

  const handleDeleteResource = async (resourceId: string) => {
    try {
      await deleteLessonResource(resourceId);
      await loadData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to delete resource');
    }
  };

  // ---------------------------------------------------------------------------
  // Group Assignment Actions
  // ---------------------------------------------------------------------------
  const handleAssignGroup = async () => {
    if (!selectedGroupIdToAssign) return;
    try {
      await assignCourseToGroup(courseId, selectedGroupIdToAssign);
      setSelectedGroupIdToAssign('');
      setSuccessMessage(
        isRtl ? 'تم إسناد المقرر للمجموعة الدراسية بنجاح' : 'Course assigned to group successfully'
      );
      await loadData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to assign group');
    }
  };

  const handleRemoveGroup = async (groupId: string) => {
    if (!window.confirm(t.courses.confirmRemoveGroup)) return;
    try {
      await removeCourseFromGroup(courseId, groupId);
      setSuccessMessage(
        isRtl ? 'تم إلغاء إسناد المقرر للمجموعة' : 'Course assignment removed'
      );
      await loadData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to remove group assignment');
    }
  };

  // ---------------------------------------------------------------------------
  // Course Settings Save
  // ---------------------------------------------------------------------------
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settingsTitle.trim() || !settingsTitleAr.trim()) return;
    try {
      setIsSavingSettings(true);
      await updateCourse({
        id: courseId,
        title: settingsTitle.trim(),
        titleArabic: settingsTitleAr.trim(),
        description: settingsDesc.trim(),
        descriptionArabic: settingsDescAr.trim(),
        level: settingsLevel,
        coverImageUrl: settingsCoverUrl.trim(),
      });
      setSuccessMessage(
        isRtl ? 'تم حفظ إعدادات المقرر بنجاح' : 'Course settings updated successfully'
      );
      await loadData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save course settings');
    } finally {
      setIsSavingSettings(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <LoadingSpinner size="lg" label={t.common.loading} />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="p-8 text-center text-slate-500">
        <p>{isRtl ? 'لم يتم العثور على المقرر الدراسي' : 'Course not found'}</p>
        <button
          onClick={onBack}
          className="mt-4 px-4 py-2 bg-[#356AE6] text-white rounded-xl text-xs font-semibold"
        >
          {t.common.back}
        </button>
      </div>
    );
  }

  const unassignedGroups = availableGroups.filter(
    (ag) => !assignedGroups.some((assigned) => assigned.id === ag.id)
  );

  return (
    <div className="space-y-6">
      {/* Top Banner Navigation */}
      <div className="bg-white rounded-2xl p-5 shadow-xs border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            title={t.common.back}
          >
            {isRtl ? <ArrowRight className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
          </button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-slate-900">
                {isRtl ? course.titleArabic : course.title}
              </h2>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                  course.isPublished
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}
              >
                {course.isPublished ? t.courses.publishedStatus : t.courses.draftStatus}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-medium border border-slate-200">
                {course.level === 'beginner'
                  ? t.courses.beginner
                  : course.level === 'advanced'
                  ? t.courses.advanced
                  : t.courses.intermediate}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {isRtl ? course.title : course.titleArabic}
            </p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleCoursePublish}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
              course.isPublished
                ? 'bg-white border-amber-200 text-amber-700 hover:bg-amber-50'
                : 'bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700'
            }`}
          >
            {course.isPublished ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span>{course.isPublished ? t.courses.unpublishCourse : t.courses.publishCourse}</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-rose-500 hover:text-rose-700 text-xs">
            {t.common.close}
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-700 text-xs">
            {t.common.close}
          </button>
        </div>
      )}

      {/* Workspace Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-1">
        <button
          onClick={() => setActiveTab('curriculum')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
            activeTab === 'curriculum'
              ? 'bg-[#356AE6] text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>{t.courses.manageCurriculum}</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20">
            {units.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('groups')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
            activeTab === 'groups'
              ? 'bg-[#356AE6] text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>{t.courses.manageAssignments}</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20">
            {assignedGroups.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
            activeTab === 'settings'
              ? 'bg-[#356AE6] text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>{t.courses.courseSettings}</span>
        </button>
      </div>

      {/* ===================================================================== */}
      {/* TAB 1: CURRICULUM BUILDER                                             */}
      {/* ===================================================================== */}
      {activeTab === 'curriculum' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">{t.courses.units}</h3>
              <p className="text-xs text-slate-500">
                {isRtl
                  ? 'قم بإضافة وحدات المنهج وترتيب تسلسل الدروس والشروحات'
                  : 'Organize curriculum into units and sequence educational lessons'}
              </p>
            </div>
            <button
              onClick={handleOpenAddUnit}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#356AE6] hover:bg-[#2855BE] text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{t.courses.addUnit}</span>
            </button>
          </div>

          {units.length === 0 ? (
            <div className="bg-white rounded-2xl p-10 text-center border border-slate-200">
              <BookOpen className="w-12 h-12 text-slate-400 mx-auto mb-3" />
              <h4 className="text-sm font-bold text-slate-800 mb-1">
                {isRtl ? 'لا توجد وحدات دراسية مضافة حتى الآن' : 'No curriculum units added yet'}
              </h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
                {isRtl
                  ? 'ابدأ بإنشاء الوحدة التعليمية الأولى، ثم أضف إليها الدروس والمذكرات للطلاب.'
                  : 'Start by creating your first unit, then attach structured lessons and handouts.'}
              </p>
              <button
                onClick={handleOpenAddUnit}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#356AE6] text-white rounded-xl text-xs font-semibold"
              >
                <Plus className="w-4 h-4" />
                <span>{t.courses.addUnit}</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {units.map((unit, unitIdx) => {
                const isExpanded = Boolean(expandedUnits[unit.id]);
                return (
                  <div
                    key={unit.id}
                    className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs transition-all"
                  >
                    {/* Unit Header */}
                    <div className="p-4 bg-slate-50/70 border-b border-slate-200/80 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => toggleUnitExpand(unit.id)}
                          className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
                        >
                          {isExpanded ? (
                            <ChevronUp className="w-5 h-5" />
                          ) : (
                            <ChevronDown className="w-5 h-5" />
                          )}
                        </button>
                        <div className="w-7 h-7 rounded-lg bg-[#356AE6]/10 text-[#356AE6] font-bold text-xs flex items-center justify-center shrink-0">
                          {unit.orderIndex}
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-900">
                            {isRtl ? unit.titleArabic : unit.title}
                          </h4>
                          <span className="text-[11px] text-slate-500">
                            {isRtl ? unit.title : unit.titleArabic} • {unit.lessons.length}{' '}
                            {t.courses.lessons}
                          </span>
                        </div>
                      </div>

                      {/* Unit Controls */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleMoveUnit(unitIdx, 'up')}
                          disabled={unitIdx === 0}
                          title={t.courses.moveUp}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 disabled:opacity-30 disabled:pointer-events-none"
                        >
                          <ChevronUp className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleMoveUnit(unitIdx, 'down')}
                          disabled={unitIdx === units.length - 1}
                          title={t.courses.moveDown}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 disabled:opacity-30 disabled:pointer-events-none"
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleOpenEditUnit(unit)}
                          title={t.courses.editUnit}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteUnit(unit.id)}
                          title={t.courses.deleteUnit}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleOpenAddLesson(unit.id)}
                          className="ml-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#356AE6] text-white text-[11px] font-semibold hover:bg-[#2855BE] transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>{t.courses.addLesson}</span>
                        </button>
                      </div>
                    </div>

                    {/* Unit Lessons Accordion Body */}
                    {isExpanded && (
                      <div className="p-4 space-y-3">
                        {unit.lessons.length === 0 ? (
                          <div className="p-6 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl">
                            <p>
                              {isRtl
                                ? 'لا توجد دروس مضافة في هذه الوحدة حتى الآن.'
                                : 'No lessons in this unit yet.'}
                            </p>
                            <button
                              onClick={() => handleOpenAddLesson(unit.id)}
                              className="mt-2 text-[#356AE6] font-semibold hover:underline inline-flex items-center gap-1"
                            >
                              <Plus className="w-3 h-3" />
                              <span>{t.courses.addLesson}</span>
                            </button>
                          </div>
                        ) : (
                          unit.lessons.map((lesson, lessonIdx) => (
                            <div
                              key={lesson.id}
                              className="p-3.5 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3"
                            >
                              <div className="flex items-start gap-3">
                                <div className="w-6 h-6 rounded-md bg-slate-100 text-slate-600 font-semibold text-xs flex items-center justify-center shrink-0 mt-0.5">
                                  {lesson.orderIndex}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <h5 className="text-xs font-bold text-slate-900">
                                      {isRtl ? lesson.titleArabic : lesson.title}
                                    </h5>
                                    <span
                                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                                        lesson.isPublished
                                          ? 'bg-emerald-50 text-emerald-700'
                                          : 'bg-amber-50 text-amber-700'
                                      }`}
                                    >
                                      {lesson.isPublished
                                        ? t.courses.published
                                        : t.courses.draft}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-slate-500 mt-0.5">
                                    {isRtl ? lesson.title : lesson.titleArabic}
                                  </p>

                                  <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-500">
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-3 h-3 text-slate-400" />
                                      <span>
                                        {lesson.durationMinutes} {isRtl ? 'دقيقة' : 'min'}
                                      </span>
                                    </span>
                                    {lesson.videoUrl && (
                                      <span className="flex items-center gap-1 text-[#356AE6]">
                                        <Video className="w-3 h-3" />
                                        <span>{isRtl ? 'فيديو مسجل' : 'Video attached'}</span>
                                      </span>
                                    )}
                                    <span className="flex items-center gap-1">
                                      <Paperclip className="w-3 h-3 text-slate-400" />
                                      <span>
                                        {lesson.resources?.length || 0} {t.courses.resources}
                                      </span>
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Lesson Controls */}
                              <div className="flex items-center gap-1 self-end md:self-center">
                                {lesson.videoUrl && (
                                  <button
                                    onClick={() => setPreviewLesson(lesson)}
                                    className="px-2 py-1 text-[11px] rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors"
                                  >
                                    {isRtl ? 'معاينة المشغل' : 'Preview Player'}
                                  </button>
                                )}
                                <button
                                  onClick={() => handleOpenAddResource(lesson.id)}
                                  title={t.courses.addResource}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                                >
                                  <Paperclip className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleMoveLesson(unit.id, lessonIdx, 'up')}
                                  disabled={lessonIdx === 0}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none"
                                >
                                  <ChevronUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleMoveLesson(unit.id, lessonIdx, 'down')}
                                  disabled={lessonIdx === unit.lessons.length - 1}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none"
                                >
                                  <ChevronDown className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleOpenEditLesson(lesson)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteLesson(lesson.id)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: GROUP ASSIGNMENTS                                              */}
      {/* ===================================================================== */}
      {activeTab === 'groups' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-5 border border-slate-200">
            <h3 className="text-sm font-bold text-slate-900 mb-1">
              {t.courses.assignToGroup}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              {isRtl
                ? 'إسناد هذا المقرر لمجموعة دراسية يمنح طلابها المنتظمين صلاحية استعراض المنهج والدروس فوراً.'
                : 'Assigning this course grants its enrolled active students instant access to units and lectures.'}
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-3">
              <select
                value={selectedGroupIdToAssign}
                onChange={(e) => setSelectedGroupIdToAssign(e.target.value)}
                className="w-full sm:w-80 px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#356AE6]/20 focus:border-[#356AE6]"
              >
                <option value="">{t.courses.selectGroupToAssign}</option>
                {unassignedGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {isRtl ? g.nameArabic : g.name} ({g.academicYear})
                  </option>
                ))}
              </select>

              <button
                onClick={handleAssignGroup}
                disabled={!selectedGroupIdToAssign}
                className="w-full sm:w-auto px-4 py-2 bg-[#356AE6] hover:bg-[#2855BE] text-white rounded-xl text-xs font-semibold shadow-xs disabled:opacity-40 transition-colors cursor-pointer"
              >
                {t.courses.assignToGroup}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-slate-200">
            <h3 className="text-sm font-bold text-slate-900 mb-4">
              {t.courses.assignedGroupsTitle}
            </h3>

            {assignedGroups.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl">
                <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="font-semibold text-slate-700">{t.courses.noGroupsAssigned}</p>
                <p className="text-slate-500 mt-0.5">{t.courses.noGroupsAssignedDesc}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {assignedGroups.map((g) => (
                  <div
                    key={g.id}
                    className="p-4 rounded-xl border border-slate-200 flex items-center justify-between gap-3 bg-slate-50/50"
                  >
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">
                        {isRtl ? g.nameArabic : g.name}
                      </h4>
                      <span className="text-[11px] text-slate-500">
                        {g.studentCount} {t.courses.enrolledStudentsCount}
                      </span>
                    </div>
                    <button
                      onClick={() => handleRemoveGroup(g.id)}
                      className="px-2.5 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                    >
                      {t.courses.removeFromGroup}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: COURSE SETTINGS                                                */}
      {/* ===================================================================== */}
      {activeTab === 'settings' && (
        <form onSubmit={handleSaveSettings} className="bg-white rounded-2xl p-6 border border-slate-200 space-y-4">
          <h3 className="text-sm font-bold text-slate-900 mb-2">
            {t.courses.courseSettings}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t.courses.titleAr} <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                dir="rtl"
                value={settingsTitleAr}
                onChange={(e) => setSettingsTitleAr(e.target.value)}
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
                value={settingsTitle}
                onChange={(e) => setSettingsTitle(e.target.value)}
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
                value={settingsLevel}
                onChange={(e) => setSettingsLevel(e.target.value as CourseLevel)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white"
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
                value={settingsCoverUrl}
                onChange={(e) => setSettingsCoverUrl(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t.courses.descAr}
            </label>
            <textarea
              rows={3}
              dir="rtl"
              value={settingsDescAr}
              onChange={(e) => setSettingsDescAr(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t.courses.descEn}
            </label>
            <textarea
              rows={3}
              dir="ltr"
              value={settingsDesc}
              onChange={(e) => setSettingsDesc(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300"
            />
          </div>

          <div className="pt-4 flex justify-end">
            <button
              type="submit"
              disabled={isSavingSettings}
              className="px-5 py-2 bg-[#356AE6] hover:bg-[#2855BE] text-white rounded-xl text-xs font-semibold shadow-xs disabled:opacity-50 transition-colors"
            >
              {isSavingSettings ? t.common.loading : t.common.save}
            </button>
          </div>
        </form>
      )}

      {/* ===================================================================== */}
      {/* PREVIEW VIDEO MODAL                                                   */}
      {/* ===================================================================== */}
      {previewLesson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs">
          <div className="bg-slate-900 rounded-2xl max-w-3xl w-full border border-slate-800 overflow-hidden shadow-2xl">
            <div className="p-4 bg-slate-950 flex items-center justify-between text-white">
              <h4 className="text-xs font-bold truncate">
                {isRtl ? previewLesson.titleArabic : previewLesson.title}
              </h4>
              <button
                onClick={() => setPreviewLesson(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="p-4">
              <SafeVideoPlayer
                videoUrl={previewLesson.videoUrl}
                title={previewLesson.title}
              />
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* UNIT CREATE/EDIT MODAL                                                */}
      {/* ===================================================================== */}
      {isUnitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5 border border-slate-200">
            <h3 className="text-sm font-bold text-slate-900 mb-3">
              {unitToEdit ? t.courses.editUnit : t.courses.addUnit}
            </h3>
            <form onSubmit={handleSaveUnit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t.courses.unitTitleAr} <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  dir="rtl"
                  value={unitTitleAr}
                  onChange={(e) => setUnitTitleAr(e.target.value)}
                  placeholder="الوحدة الأولى: القواعد والتراكيب"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t.courses.unitTitleEn} <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  dir="ltr"
                  value={unitTitleEn}
                  onChange={(e) => setUnitTitleEn(e.target.value)}
                  placeholder="Unit 1: Foundations & Grammar"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsUnitModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#356AE6] text-white rounded-xl text-xs font-semibold"
                >
                  {t.common.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* LESSON CREATE/EDIT MODAL                                              */}
      {/* ===================================================================== */}
      {isLessonModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5 border border-slate-200">
            <h3 className="text-sm font-bold text-slate-900 mb-3">
              {lessonToEdit ? t.courses.editLesson : t.courses.addLesson}
            </h3>
            <form onSubmit={handleSaveLesson} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t.courses.lessonTitleAr} <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  dir="rtl"
                  value={lessonTitleAr}
                  onChange={(e) => setLessonTitleAr(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t.courses.lessonTitleEn} <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  dir="ltr"
                  value={lessonTitleEn}
                  onChange={(e) => setLessonTitleEn(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {t.courses.durationMinutes}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={240}
                    value={lessonDuration}
                    onChange={(e) => setLessonDuration(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300"
                  />
                </div>

                <div className="flex flex-col justify-end">
                  <label className="flex items-center gap-2 cursor-pointer pb-2">
                    <input
                      type="checkbox"
                      checked={lessonIsPublished}
                      onChange={(e) => setLessonIsPublished(e.target.checked)}
                      className="rounded text-[#356AE6]"
                    />
                    <span className="text-xs font-medium text-slate-700">
                      {t.courses.isPublishedLabel}
                    </span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t.courses.videoUrl}
                </label>
                <input
                  type="url"
                  dir="ltr"
                  placeholder="https://www.youtube.com/watch?v=... أو https://vimeo.com/..."
                  value={lessonVideoUrl}
                  onChange={(e) => setLessonVideoUrl(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  {t.courses.videoUrlHelp}
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t.courses.lessonDescription}
                </label>
                <textarea
                  rows={3}
                  value={lessonDescription}
                  onChange={(e) => setLessonDescription(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsLessonModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#356AE6] text-white rounded-xl text-xs font-semibold"
                >
                  {t.common.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* RESOURCE ATTACH MODAL                                                 */}
      {/* ===================================================================== */}
      {isResourceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5 border border-slate-200">
            <h3 className="text-sm font-bold text-slate-900 mb-3">
              {t.courses.addResource}
            </h3>
            <form onSubmit={handleSaveResource} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t.courses.resourceTitle} <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  dir="ltr"
                  placeholder="e.g. Grammar Cheat Sheet (PDF)"
                  value={resTitleEn}
                  onChange={(e) => setResTitleEn(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t.courses.resourceTitleAr}
                </label>
                <input
                  type="text"
                  dir="rtl"
                  placeholder="مذكرة شرح القواعد والتطبيقات"
                  value={resTitleAr}
                  onChange={(e) => setResTitleAr(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t.courses.resourceFileUrl} <span className="text-rose-500">*</span>
                </label>
                <input
                  type="url"
                  required
                  dir="ltr"
                  placeholder="https://example.com/handout.pdf"
                  value={resFileUrl}
                  onChange={(e) => setResFileUrl(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsResourceModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#356AE6] text-white rounded-xl text-xs font-semibold"
                >
                  {t.courses.addResource}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
