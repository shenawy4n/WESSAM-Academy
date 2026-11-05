/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useLocale } from '../../hooks/useLocale';
import {
  CourseRecord,
  fetchTeacherCourses,
  createCourse,
  updateCourse,
  deleteCourse,
  toggleCoursePublish,
} from './coursesService';
import { CourseModal } from './CourseModal';
import { CourseWorkspaceView } from './CourseWorkspaceView';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import {
  BookOpen,
  Plus,
  Search,
  Filter,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  Layers,
  Users,
  ExternalLink,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';

export const CoursesManagementView: React.FC = () => {
  const { t, isRtl } = useLocale();

  const [courses, setCourses] = useState<CourseRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [levelFilter, setLevelFilter] = useState<string>('all');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [courseToEdit, setCourseToEdit] = useState<CourseRecord | null>(null);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadCourses = async () => {
    try {
      setIsLoading(true);
      const data = await fetchTeacherCourses({
        status: statusFilter,
        level: levelFilter,
        search: searchQuery,
      });
      setCourses(data);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load courses');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCourses();
  }, [statusFilter, levelFilter, searchQuery]);

  const handleOpenCreateModal = () => {
    setCourseToEdit(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (course: CourseRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    setCourseToEdit(course);
    setIsModalOpen(true);
  };

  const handleModalSubmit = async (data: any) => {
    if (data.id) {
      await updateCourse({
        id: data.id,
        title: data.title,
        titleArabic: data.titleArabic,
        description: data.description,
        descriptionArabic: data.descriptionArabic,
        level: data.level,
        coverImageUrl: data.coverImageUrl,
        isPublished: data.isPublished,
      });
      setSuccessMessage(
        isRtl ? 'تم تحديث بيانات المقرر بنجاح' : 'Course details updated successfully'
      );
    } else {
      await createCourse({
        title: data.title,
        titleArabic: data.titleArabic,
        description: data.description,
        descriptionArabic: data.descriptionArabic,
        level: data.level,
        coverImageUrl: data.coverImageUrl,
        isPublished: data.isPublished,
      });
      setSuccessMessage(
        isRtl ? 'تم إنشاء المقرر الدراسي بنجاح' : 'Course created successfully'
      );
    }
    await loadCourses();
  };

  const handleDeleteCourse = async (courseId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(t.courses.deleteCourseConfirm)) return;
    try {
      await deleteCourse(courseId);
      setSuccessMessage(
        isRtl ? 'تم حذف المقرر الدراسي بنجاح' : 'Course deleted successfully'
      );
      await loadCourses();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to delete course');
    }
  };

  const handleTogglePublish = async (course: CourseRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const nextState = !course.isPublished;
      await toggleCoursePublish(course.id, nextState);
      setSuccessMessage(
        nextState
          ? (isRtl ? 'تم نشر المقرر الدراسي للطلاب' : 'Course published to students')
          : (isRtl ? 'تم تحويل المقرر إلى مسودة' : 'Course reverted to draft')
      );
      await loadCourses();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to toggle course publish status');
    }
  };

  // If a specific course workspace is opened
  if (selectedCourseId) {
    return (
      <CourseWorkspaceView
        courseId={selectedCourseId}
        onBack={() => {
          setSelectedCourseId(null);
          loadCourses();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-white rounded-2xl p-6 shadow-xs border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-[#356AE6]/10 text-[#356AE6]">
              <BookOpen className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-bold text-slate-900">{t.courses.title}</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-xl">
            {t.courses.subtitle}
          </p>
        </div>

        <button
          onClick={handleOpenCreateModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#356AE6] hover:bg-[#2855BE] text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>{t.courses.createCourse}</span>
        </button>
      </div>

      {/* Alert Messages */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-rose-500 hover:text-rose-700">
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
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-700">
            {t.common.close}
          </button>
        </div>
      )}

      {/* Filters & Search Toolbar */}
      <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 left-3 rtl:left-auto rtl:right-3 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.courses.searchPlaceholder}
            className="w-full pl-9 pr-4 rtl:pr-9 rtl:pl-4 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#356AE6]/20 focus:border-[#356AE6]"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 shrink-0">
            <Filter className="w-3.5 h-3.5" />
            <span>{t.common.filter}:</span>
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-1.5 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#356AE6]/20 focus:border-[#356AE6]"
          >
            <option value="all">{t.courses.allStatuses}</option>
            <option value="published">{t.courses.published}</option>
            <option value="draft">{t.courses.draft}</option>
          </select>

          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#356AE6]/20 focus:border-[#356AE6]"
          >
            <option value="all">{t.courses.allLevels}</option>
            <option value="beginner">{t.courses.beginner}</option>
            <option value="intermediate">{t.courses.intermediate}</option>
            <option value="advanced">{t.courses.advanced}</option>
          </select>
        </div>
      </div>

      {/* Courses List / Cards */}
      {isLoading ? (
        <div className="p-12 text-center">
          <LoadingSpinner size="lg" label={t.common.loading} />
        </div>
      ) : courses.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200">
          <BookOpen className="w-12 h-12 text-slate-400 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-800 mb-1">{t.courses.noCoursesFound}</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
            {t.courses.noCoursesSubtitle}
          </p>
          <button
            onClick={handleOpenCreateModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#356AE6] text-white rounded-xl text-xs font-semibold"
          >
            <Plus className="w-4 h-4" />
            <span>{t.courses.createCourse}</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {courses.map((course) => (
            <div
              key={course.id}
              onClick={() => setSelectedCourseId(course.id)}
              className="group bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs hover:shadow-md hover:border-[#356AE6]/50 transition-all cursor-pointer flex flex-col"
            >
              {/* Cover Image / Thumbnail */}
              <div className="relative h-44 w-full bg-slate-900 overflow-hidden">
                {course.coverImageUrl ? (
                  <img
                    src={course.coverImageUrl}
                    alt={course.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-[#14243A] to-[#25456E] flex items-center justify-center text-white/40">
                    <BookOpen className="w-12 h-12" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-black/20" />

                {/* Badges on Top */}
                <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase backdrop-blur-xs ${
                      course.isPublished
                        ? 'bg-emerald-500/90 text-white'
                        : 'bg-amber-500/90 text-white'
                    }`}
                  >
                    {course.isPublished ? t.courses.published : t.courses.draft}
                  </span>

                  <span className="px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-xs text-white text-[10px] font-medium">
                    {course.level === 'beginner'
                      ? 'Beginner / A1-A2'
                      : course.level === 'advanced'
                      ? 'Advanced / C1-C2'
                      : 'Intermediate / B1-B2'}
                  </span>
                </div>

                {/* Title on Thumbnail Bottom */}
                <div className="absolute bottom-3 left-3 right-3 text-white">
                  <h3 className="text-sm font-bold line-clamp-1">
                    {isRtl ? course.titleArabic : course.title}
                  </h3>
                  <p className="text-[11px] text-slate-300 line-clamp-1">
                    {isRtl ? course.title : course.titleArabic}
                  </p>
                </div>
              </div>

              {/* Card Body */}
              <div className="p-4 flex-1 flex flex-col justify-between">
                <p className="text-xs text-slate-600 line-clamp-2 mb-4">
                  {isRtl
                    ? (course.descriptionArabic || course.description || 'منهج تعليمي شامل بإشراف الأستاذ وسام.')
                    : (course.description || course.descriptionArabic || 'Comprehensive curriculum by Mr. Wessam.')}
                </p>

                {/* Metrics */}
                <div className="grid grid-cols-3 gap-2 py-2.5 px-3 bg-slate-50 rounded-xl text-center border border-slate-100 mb-4">
                  <div>
                    <span className="block text-xs font-bold text-slate-900">
                      {course.unitsCount ?? 0}
                    </span>
                    <span className="text-[10px] text-slate-500">{t.courses.units}</span>
                  </div>
                  <div className="border-x border-slate-200">
                    <span className="block text-xs font-bold text-slate-900">
                      {course.lessonsCount ?? 0}
                    </span>
                    <span className="text-[10px] text-slate-500">{t.courses.lessons}</span>
                  </div>
                  <div>
                    <span className="block text-xs font-bold text-slate-900">
                      {course.assignedGroupsCount ?? 0}
                    </span>
                    <span className="text-[10px] text-slate-500">{t.courses.assignedCohorts}</span>
                  </div>
                </div>

                {/* Footer Controls */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <span className="text-[11px] text-[#356AE6] font-semibold flex items-center gap-1 group-hover:underline">
                    <span>{t.courses.manageCurriculum}</span>
                    <ExternalLink className="w-3 h-3" />
                  </span>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => handleTogglePublish(course, e)}
                      title={course.isPublished ? t.courses.unpublishCourse : t.courses.publishCourse}
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      {course.isPublished ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={(e) => handleOpenEditModal(course, e)}
                      title={t.courses.editCourse}
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleDeleteCourse(course.id, e)}
                      title={t.courses.deleteCourse}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      <CourseModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleModalSubmit}
        courseToEdit={courseToEdit}
      />
    </div>
  );
};
