/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Megaphone,
  Plus,
  Send,
  Calendar,
  Clock,
  Archive,
  Trash2,
  Edit3,
  Search,
  Filter,
  Users,
  User,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { useLocale } from '../../hooks/useLocale';
import { useAuth } from '../auth/AuthContext';
import { notificationService } from './notificationService';
import { Announcement, AnnouncementFormData, AnnouncementStatus } from './types';
import { resolvePriorityBadge, formatNotificationTime } from './notificationUtils';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { AnnouncementModal } from './AnnouncementModal';

export const AnnouncementManagementView: React.FC = () => {
  const { isRtl } = useLocale();
  const { user } = useAuth();

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isProcessingSchedules, setIsProcessingSchedules] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<AnnouncementStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await notificationService.fetchAnnouncements(user?.id);
      setAnnouncements(data);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user?.id]);

  const handleCreateNew = () => {
    setSelectedAnnouncement(null);
    setIsModalOpen(true);
  };

  const handleEdit = (ann: Announcement) => {
    setSelectedAnnouncement(ann);
    setIsModalOpen(true);
  };

  const handleSaveDraft = async (formData: AnnouncementFormData) => {
    if (!user?.id) return;
    if (selectedAnnouncement) {
      await notificationService.updateAnnouncement(selectedAnnouncement.id, formData);
    } else {
      await notificationService.createAnnouncement(user.id, formData);
    }
    await loadData();
  };

  const handlePublishNow = async (formData: AnnouncementFormData) => {
    if (!user?.id) return;
    let targetId = selectedAnnouncement?.id;
    if (!targetId) {
      const created = await notificationService.createAnnouncement(user.id, formData);
      targetId = created.id;
    } else {
      await notificationService.updateAnnouncement(targetId, formData);
    }
    await notificationService.publishAnnouncement(targetId);
    await loadData();
  };

  const handlePublishExisting = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await notificationService.publishAnnouncement(id);
    await loadData();
  };

  const handleArchive = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await notificationService.archiveAnnouncement(id);
    await loadData();
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await notificationService.deleteAnnouncement(id);
    await loadData();
  };

  const handleProcessDueSchedules = async () => {
    setIsProcessingSchedules(true);
    try {
      await notificationService.processScheduledAnnouncements();
      await loadData();
    } finally {
      setIsProcessingSchedules(false);
    }
  };

  // Metrics
  const totalCount = announcements.length;
  const publishedCount = announcements.filter((a) => a.status === 'published').length;
  const scheduledCount = announcements.filter((a) => a.status === 'scheduled').length;
  const draftCount = announcements.filter((a) => a.status === 'draft').length;

  const filteredAnnouncements = announcements.filter((ann) => {
    if (statusFilter !== 'all' && ann.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchEn = ann.title.toLowerCase().includes(q) || ann.body.toLowerCase().includes(q);
      const matchAr = ann.titleArabic.includes(q) || ann.bodyArabic.includes(q);
      if (!matchEn && !matchAr) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs">
        <div>
          <h2 className="text-xl font-bold text-[#14243A]">
            {isRtl ? 'إدارة الإعلانات والتنبيهات' : 'Announcement Management Desk'}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {isRtl
              ? 'إنشاء وجدولة الإعلانات الرسمية للطلاب والمجموعات مع تحديد الأولويات ونطاق الصلاحيات.'
              : 'Draft, schedule, and broadcast official academy announcements within your authorized cohorts.'}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            icon={<RefreshCw className={`w-3.5 h-3.5 ${isProcessingSchedules ? 'animate-spin' : ''}`} />}
            onClick={handleProcessDueSchedules}
            isLoading={isProcessingSchedules}
            title={isRtl ? 'معالجة الإعلانات المجدولة المستحقة' : 'Process due scheduled announcements'}
          >
            {isRtl ? 'فحص الجدولة' : 'Check Schedules'}
          </Button>

          <Button
            variant="primary"
            size="sm"
            icon={<Plus className="w-4 h-4" />}
            onClick={handleCreateNew}
          >
            {isRtl ? 'إعلان جديد' : 'New Announcement'}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
          <span className="text-xs text-slate-500 font-medium">
            {isRtl ? 'إجمالي الإعلانات' : 'Total Announcements'}
          </span>
          <div className="text-2xl font-bold text-[#14243A] mt-1">{totalCount}</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-emerald-100 shadow-2xs">
          <span className="text-xs text-emerald-600 font-medium">
            {isRtl ? 'المنشورة حالياً' : 'Published'}
          </span>
          <div className="text-2xl font-bold text-emerald-700 mt-1">{publishedCount}</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-amber-100 shadow-2xs">
          <span className="text-xs text-amber-600 font-medium">
            {isRtl ? 'المجدولة مستقبلاً' : 'Scheduled'}
          </span>
          <div className="text-2xl font-bold text-amber-700 mt-1">{scheduledCount}</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
          <span className="text-xs text-slate-500 font-medium">
            {isRtl ? 'المسودات' : 'Drafts'}
          </span>
          <div className="text-2xl font-bold text-slate-700 mt-1">{draftCount}</div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        {/* Status Tabs */}
        <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-medium overflow-x-auto scrollbar-none">
          {(['all', 'published', 'scheduled', 'draft', 'archived'] as (AnnouncementStatus | 'all')[]).map(
            (tab) => {
              const label =
                tab === 'all'
                  ? isRtl
                    ? 'الكل'
                    : 'All'
                  : tab === 'published'
                  ? isRtl
                    ? 'المنشورة'
                    : 'Published'
                  : tab === 'scheduled'
                  ? isRtl
                    ? 'المجدولة'
                    : 'Scheduled'
                  : tab === 'draft'
                  ? isRtl
                    ? 'المسودات'
                    : 'Drafts'
                  : isRtl
                  ? 'المؤرشفة'
                  : 'Archived';

              return (
                <button
                  key={tab}
                  onClick={() => setStatusFilter(tab)}
                  className={`px-3 py-1.5 rounded-lg shrink-0 transition-colors cursor-pointer ${
                    statusFilter === tab
                      ? 'bg-white text-[#14243A] shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              );
            }
          )}
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isRtl ? 'بحث في عنوان أو محتوى الإعلان...' : 'Search announcements...'}
            className="w-full text-xs ps-9 pe-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#356AE6]"
          />
        </div>
      </div>

      {/* Announcements List */}
      <div className="space-y-3.5">
        {isLoading ? (
          <div className="py-16 flex flex-col items-center justify-center">
            <LoadingSpinner size="lg" />
            <span className="text-xs text-slate-400 mt-3">
              {isRtl ? 'جارِ تحميل الإعلانات...' : 'Loading announcements...'}
            </span>
          </div>
        ) : filteredAnnouncements.length === 0 ? (
          <EmptyState
            icon={<Megaphone className="w-6 h-6 text-[#356AE6]" />}
            title={isRtl ? 'لا توجد إعلانات' : 'No announcements found'}
            description={
              isRtl
                ? 'ابدأ بإنشاء أول إعلان رسمي للطلاب أو المجموعات الدراسية.'
                : 'Broadcast your first announcement or schedule updates for upcoming sessions.'
            }
            actionLabel={isRtl ? 'إنشاء إعلان جديد' : 'Create announcement'}
            onAction={handleCreateNew}
          />
        ) : (
          filteredAnnouncements.map((ann) => {
            const priorityBadge = resolvePriorityBadge(ann.priority);
            const title = isRtl ? ann.titleArabic || ann.title : ann.title;
            const body = isRtl ? ann.bodyArabic || ann.body : ann.body;

            return (
              <div
                key={ann.id}
                className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs hover:border-slate-300 transition-all space-y-3"
              >
                {/* Top Row: Badges & Audience */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {/* Status Badge */}
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                        ann.status === 'published'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : ann.status === 'scheduled'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : ann.status === 'draft'
                          ? 'bg-slate-100 text-slate-700 border-slate-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}
                    >
                      {ann.status === 'published'
                        ? isRtl
                          ? 'منشور'
                          : 'Published'
                        : ann.status === 'scheduled'
                        ? isRtl
                          ? 'مجدول'
                          : 'Scheduled'
                        : ann.status === 'draft'
                        ? isRtl
                          ? 'مسودة'
                          : 'Draft'
                        : isRtl
                        ? 'مؤرشف'
                        : 'Archived'}
                    </span>

                    {/* Priority Badge */}
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${priorityBadge.bg} ${priorityBadge.text} ${priorityBadge.border}`}
                    >
                      {ann.priority === 'urgent'
                        ? isRtl
                          ? 'عاجل'
                          : 'Urgent'
                        : ann.priority === 'important'
                        ? isRtl
                          ? 'هام'
                          : 'Important'
                        : isRtl
                        ? 'عادي'
                        : 'Normal'}
                    </span>

                    {/* Target Audience Badge */}
                    <span className="text-[11px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded flex items-center gap-1">
                      {ann.targetAudience === 'all_students' ? (
                        <>
                          <Users className="w-3 h-3 text-[#356AE6]" />
                          <span>{isRtl ? 'جميع الطلاب' : 'All Students'}</span>
                        </>
                      ) : ann.targetAudience === 'group' ? (
                        <>
                          <Users className="w-3 h-3 text-emerald-600" />
                          <span>{ann.groupName || (isRtl ? 'مجموعة محددة' : 'Specific Group')}</span>
                        </>
                      ) : (
                        <>
                          <User className="w-3 h-3 text-purple-600" />
                          <span>{ann.studentName || (isRtl ? 'طالب محدد' : 'Individual Student')}</span>
                        </>
                      )}
                    </span>
                  </div>

                  {/* Scheduled / Published Date */}
                  <div className="text-[11px] text-slate-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>
                      {ann.status === 'published' && ann.publishedAt
                        ? `${isRtl ? 'نُشر في: ' : 'Published: '} ${formatNotificationTime(
                            ann.publishedAt,
                            isRtl
                          )}`
                        : ann.status === 'scheduled' && ann.scheduledFor
                        ? `${isRtl ? 'مجدول للنشر في: ' : 'Scheduled for: '} ${formatNotificationTime(
                            ann.scheduledFor,
                            isRtl
                          )}`
                        : `${isRtl ? 'تاريخ الإنشاء: ' : 'Created: '} ${formatNotificationTime(
                            ann.createdAt,
                            isRtl
                          )}`}
                    </span>
                  </div>
                </div>

                {/* Main Content */}
                <div>
                  <h3 className="text-base font-bold text-[#14243A] leading-snug">{title}</h3>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed whitespace-pre-wrap">
                    {body}
                  </p>
                </div>

                {/* Footer: Delivered count and action buttons */}
                <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    {ann.status === 'published' && (
                      <span className="text-xs text-emerald-700 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>
                          {isRtl
                            ? `تم التسليم إلى ${ann.deliveredCount || 0} طالباً`
                            : `Delivered to ${ann.deliveredCount || 0} students`}
                        </span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {ann.status !== 'published' && ann.status !== 'archived' && (
                      <Button
                        variant="primary"
                        size="sm"
                        icon={<Send className="w-3.5 h-3.5" />}
                        onClick={(e) => handlePublishExisting(ann.id, e)}
                      >
                        {isRtl ? 'نشر الآن' : 'Publish Now'}
                      </Button>
                    )}

                    {ann.status === 'draft' && (
                      <Button
                        variant="outline"
                        size="sm"
                        icon={<Edit3 className="w-3.5 h-3.5" />}
                        onClick={() => handleEdit(ann)}
                      >
                        {isRtl ? 'تعديل' : 'Edit'}
                      </Button>
                    )}

                    {ann.status === 'published' && (
                      <Button
                        variant="outline"
                        size="sm"
                        icon={<Archive className="w-3.5 h-3.5 text-slate-500" />}
                        onClick={(e) => handleArchive(ann.id, e)}
                      >
                        {isRtl ? 'أرشفة' : 'Archive'}
                      </Button>
                    )}

                    {ann.status === 'draft' && (
                      <button
                        onClick={(e) => handleDelete(ann.id, e)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title={isRtl ? 'حذف المسودة' : 'Delete draft'}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal */}
      <AnnouncementModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        announcement={selectedAnnouncement}
        onSaveDraft={handleSaveDraft}
        onPublishNow={handlePublishNow}
      />
    </div>
  );
};
