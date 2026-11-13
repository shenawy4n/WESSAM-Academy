/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useLocale } from '../../hooks/useLocale';
import { useAuth } from '../auth/AuthContext';
import {
  GroupRecord,
  GroupDetailedView,
  GroupStatusFilter,
  fetchGroups,
  createGroup,
  updateGroup,
  archiveGroup,
  restoreGroup,
  isGroupArchived,
  fetchGroupDetails,
  enrollStudentInGroup,
  removeStudentFromGroup,
  transferStudentGroup,
} from './groupService';
import { fetchStudents, StudentRecord } from '../students/studentService';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { StatusIndicator } from '../../components/ui/StatusIndicator';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import {
  FolderGit2,
  Plus,
  Search,
  Users,
  Calendar,
  Edit2,
  Eye,
  GraduationCap,
  ArrowRightLeft,
  UserMinus,
  UserPlus,
  AlertCircle,
  CheckCircle2,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Info,
  Archive,
  RotateCcw,
} from 'lucide-react';

export const GroupManagementView: React.FC = () => {
  const { t, isRtl } = useLocale();
  const { role } = useAuth();
  const isSuperAdmin = role === 'super_admin';

  // Data states
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [allStudents, setAllStudents] = useState<StudentRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 8;

  // Selected group & detail state
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groupDetails, setGroupDetails] = useState<GroupDetailedView | null>(null);
  const [detailsLoading, setDetailsLoading] = useState<boolean>(false);
  const [isDetailOpen, setIsDetailOpen] = useState<boolean>(false);

  // Create / Edit modal state
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [isEditOpen, setIsEditOpen] = useState<boolean>(false);
  const [groupForm, setGroupForm] = useState<{
    id?: string;
    name: string;
    nameArabic: string;
    academicYear: string;
    maxStudents: number;
    description: string;
    isActive: boolean;
  }>({
    name: '',
    nameArabic: '',
    academicYear: '2026/2027',
    maxStudents: 30,
    description: '',
    isActive: true,
  });
  const [formSubmitting, setFormSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Archive Modal State (Super Admin Only)
  const [isArchiveOpen, setIsArchiveOpen] = useState<boolean>(false);
  const [archiveTargetGroup, setArchiveTargetGroup] = useState<GroupRecord | null>(null);
  const [archiveReason, setArchiveReason] = useState<string>('');
  const [archiveSubmitting, setArchiveSubmitting] = useState<boolean>(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  // Enrollment & Transfer Modals
  const [isEnrollOpen, setIsEnrollOpen] = useState<boolean>(false);
  const [enrollStudentId, setEnrollStudentId] = useState<string>('');
  const [enrollAsPrimary, setEnrollAsPrimary] = useState<boolean>(true);
  const [enrollSubmitting, setEnrollSubmitting] = useState<boolean>(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);

  const [isTransferOpen, setIsTransferOpen] = useState<boolean>(false);
  const [transferStudentId, setTransferStudentId] = useState<string>('');
  const [transferTargetGroupId, setTransferTargetGroupId] = useState<string>('');
  const [transferSubmitting, setTransferSubmitting] = useState<boolean>(false);
  const [transferError, setTransferError] = useState<string | null>(null);

  const [isRemoveOpen, setIsRemoveOpen] = useState<boolean>(false);
  const [removeStudentId, setRemoveStudentId] = useState<string>('');
  const [removeStudentName, setRemoveStudentName] = useState<string>('');
  const [removeSubmitting, setRemoveSubmitting] = useState<boolean>(false);

  // Load groups and students
  const loadInitialData = async (filter: GroupStatusFilter = statusFilter as GroupStatusFilter) => {
    try {
      setLoading(true);
      setLoadError(null);
      setError(null);
      const [groupsData, studentsData] = await Promise.all([
        fetchGroups(filter),
        fetchStudents(),
      ]);
      setGroups(groupsData);
      setAllStudents(studentsData);
    } catch (err: unknown) {
      setLoadError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData(statusFilter as GroupStatusFilter);
  }, [statusFilter]);

  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 4000);
  };

  // Open Detailed View
  const handleOpenDetails = async (groupId: string) => {
    setSelectedGroupId(groupId);
    setIsDetailOpen(true);
    setDetailsLoading(true);
    try {
      const details = await fetchGroupDetails(groupId);
      setGroupDetails(details);
    } catch (err: any) {
      setIsDetailOpen(false);
      setError(err?.message || 'Failed to load group details.');
    } finally {
      setDetailsLoading(false);
    }
  };

  // Refresh Detailed View
  const refreshDetails = async (groupId: string) => {
    try {
      const details = await fetchGroupDetails(groupId);
      setGroupDetails(details);
      const updatedGroups = await fetchGroups(statusFilter as GroupStatusFilter);
      setGroups(updatedGroups);
    } catch (err: any) {
      setError(err?.message || 'Failed to refresh group details.');
    }
  };

  // Archive Handlers (Super Admin Only)
  const handleOpenArchive = (group: GroupRecord) => {
    if (!group.isActive) {
      setError(t.groups.cannotArchiveInactive);
      return;
    }
    setArchiveTargetGroup(group);
    setArchiveReason('');
    setArchiveError(null);
    setIsArchiveOpen(true);
  };

  const handleArchiveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!archiveTargetGroup) return;
    if (!archiveReason.trim()) {
      setArchiveError(t.groups.archiveReasonLabel);
      return;
    }

    try {
      setArchiveSubmitting(true);
      setArchiveError(null);
      await archiveGroup({
        groupId: archiveTargetGroup.id,
        reason: archiveReason.trim(),
      });
      setIsArchiveOpen(false);
      setArchiveTargetGroup(null);
      showToast(t.groups.archiveSuccess);
      await loadInitialData(statusFilter as GroupStatusFilter);
      if (selectedGroupId === archiveTargetGroup.id) {
        await refreshDetails(selectedGroupId);
      }
    } catch (err: any) {
      setArchiveError(err?.message || 'Failed to archive group');
    } finally {
      setArchiveSubmitting(false);
    }
  };

  const handleRestoreSubmit = async (group: GroupRecord) => {
    try {
      setLoading(true);
      await restoreGroup({ groupId: group.id });
      showToast(t.groups.restoreSuccess);
      await loadInitialData(statusFilter as GroupStatusFilter);
      if (selectedGroupId === group.id) {
        await refreshDetails(selectedGroupId);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to restore group');
    } finally {
      setLoading(false);
    }
  };

  // Metric computations
  const metrics = useMemo(() => {
    const total = groups.length;
    const active = groups.filter((g) => g.isActive && !g.archivedAt).length;
    const totalEnrolled = groups.reduce((acc, g) => acc + g.studentCount, 0);
    const totalCapacity = groups.reduce((acc, g) => acc + g.maxStudents, 0);
    const avgCap = totalCapacity > 0 ? Math.round((totalEnrolled / totalCapacity) * 100) : 0;
    return { total, active, totalEnrolled, avgCap };
  }, [groups]);

  // Distinct academic years
  const availableYears = useMemo(() => {
    const years = Array.from(new Set(groups.map((g) => g.academicYear)));
    return years.length > 0 ? years : ['2026/2027'];
  }, [groups]);

  // Filtered groups
  const filteredGroups = useMemo(() => {
    return groups.filter((g) => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        g.name.toLowerCase().includes(q) ||
        g.nameArabic.toLowerCase().includes(q) ||
        g.academicYear.toLowerCase().includes(q);

      const matchYear = yearFilter === 'all' || g.academicYear === yearFilter;
      const matchStatus =
        statusFilter === 'all'
          ? !g.archivedAt
          : statusFilter === 'archived'
          ? Boolean(g.archivedAt)
          : statusFilter === 'active'
          ? g.isActive && !g.archivedAt
          : !g.isActive && !g.archivedAt;

      return matchSearch && matchYear && matchStatus;
    });
  }, [groups, searchQuery, yearFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredGroups.length / pageSize));
  const paginatedGroups = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredGroups.slice(start, start + pageSize);
  }, [filteredGroups, currentPage]);

  // Create or Edit submit
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupForm.name.trim() || !groupForm.nameArabic.trim()) {
      setFormError('Both English and Arabic group names are required.');
      return;
    }

    try {
      setFormSubmitting(true);
      setFormError(null);

      if (groupForm.id) {
        // Edit
        await updateGroup({
          id: groupForm.id,
          name: groupForm.name,
          nameArabic: groupForm.nameArabic,
          academicYear: groupForm.academicYear,
          maxStudents: Number(groupForm.maxStudents),
          description: groupForm.description,
          isActive: groupForm.isActive,
        });
        showToast(t.groups.editGroup + ' — Saved');
      } else {
        // Create
        await createGroup({
          name: groupForm.name,
          nameArabic: groupForm.nameArabic,
          academicYear: groupForm.academicYear,
          maxStudents: Number(groupForm.maxStudents),
          description: groupForm.description,
          isActive: groupForm.isActive,
        });
        showToast(t.groups.createGroup + ' — Success');
      }

      setIsCreateOpen(false);
      setIsEditOpen(false);
      await loadInitialData();
      if (selectedGroupId && groupForm.id === selectedGroupId) {
        await refreshDetails(selectedGroupId);
      }
    } catch (err: any) {
      setFormError(err?.message || 'Operation failed.');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Open Edit Group modal
  const handleOpenEdit = (group: GroupRecord) => {
    setGroupForm({
      id: group.id,
      name: group.name,
      nameArabic: group.nameArabic,
      academicYear: group.academicYear,
      maxStudents: group.maxStudents,
      description: group.description || '',
      isActive: group.isActive,
    });
    setFormError(null);
    setIsEditOpen(true);
  };

  // Enrollment Handler
  const handleEnrollSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroupId || !enrollStudentId) return;

    try {
      setEnrollSubmitting(true);
      setEnrollError(null);
      await enrollStudentInGroup({
        groupId: selectedGroupId,
        studentId: enrollStudentId,
        setAsPrimary: enrollAsPrimary,
      });

      setIsEnrollOpen(false);
      setEnrollStudentId('');
      showToast(t.students.enrollSuccess);
      await refreshDetails(selectedGroupId);
    } catch (err: any) {
      setEnrollError(err?.message || 'Failed to enroll student.');
    } finally {
      setEnrollSubmitting(false);
    }
  };

  // Transfer Handler
  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroupId || !transferStudentId || !transferTargetGroupId) return;

    try {
      setTransferSubmitting(true);
      setTransferError(null);
      await transferStudentGroup({
        fromGroupId: selectedGroupId,
        toGroupId: transferTargetGroupId,
        studentId: transferStudentId,
      });

      setIsTransferOpen(false);
      showToast('Student transferred successfully');
      await refreshDetails(selectedGroupId);
    } catch (err: any) {
      setTransferError(err?.message || 'Failed to transfer student.');
    } finally {
      setTransferSubmitting(false);
    }
  };

  // Remove Handler
  const handleRemoveSubmit = async () => {
    if (!selectedGroupId || !removeStudentId) return;

    try {
      setRemoveSubmitting(true);
      await removeStudentFromGroup({
        groupId: selectedGroupId,
        studentId: removeStudentId,
      });

      setIsRemoveOpen(false);
      showToast('Student removed from group');
      await refreshDetails(selectedGroupId);
    } catch (err: any) {
      setError(err?.message || 'Failed to remove student from group.');
    } finally {
      setRemoveSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {successToast && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span className="text-sm font-semibold">{successToast}</span>
          </div>
          <button onClick={() => setSuccessToast(null)} className="text-emerald-600 hover:text-emerald-900 text-sm">
            ×
          </button>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl flex items-center gap-2.5">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[#14243A] tracking-tight">{t.groups.title}</h1>
          <p className="text-sm text-slate-500 mt-1">{t.groups.subtitle}</p>
        </div>
        <Button
          onClick={() => {
            setGroupForm({
              name: '',
              nameArabic: '',
              academicYear: '2026/2027',
              maxStudents: 30,
              description: '',
              isActive: true,
            });
            setFormError(null);
            setIsCreateOpen(true);
          }}
          className="bg-[#356AE6] hover:bg-[#2a56bf] text-white flex items-center gap-2 shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>{t.groups.createGroup}</span>
        </Button>
      </div>

      {/* Metrics Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>{t.groups.totalGroups}</span>
            <FolderGit2 className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-2xl font-black text-[#14243A] mt-2">{metrics.total}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>{t.groups.activeGroups}</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
          </div>
          <p className="text-2xl font-black text-emerald-700 mt-2">{metrics.active}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>{t.groups.totalEnrolled}</span>
            <Users className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-2xl font-black text-blue-700 mt-2">{metrics.totalEnrolled}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>{t.groups.avgCapacity}</span>
            <span className="text-xs text-slate-400 font-bold">%</span>
          </div>
          <p className="text-2xl font-black text-slate-800 mt-2">{metrics.avgCap}%</p>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className={`w-4 h-4 text-slate-400 absolute top-3.5 ${isRtl ? 'right-3.5' : 'left-3.5'}`} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder={t.groups.searchPlaceholder}
            className={`w-full py-2.5 bg-slate-50 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-[#356AE6] ${
              isRtl ? 'pr-10 pl-4' : 'pl-10 pr-4'
            }`}
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Year Filter */}
          <select
            value={yearFilter}
            onChange={(e) => {
              setYearFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="py-2.5 px-3 bg-slate-50 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-[#356AE6] text-slate-700"
          >
            <option value="all">{t.groups.allYears}</option>
            {availableYears.map((yr) => (
              <option key={yr} value={yr}>
                {yr}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="py-2.5 px-3 bg-slate-50 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-[#356AE6] text-slate-700"
          >
            <option value="all">{t.groups.allStatuses}</option>
            <option value="active">{t.common.active}</option>
            <option value="inactive">{t.common.inactive}</option>
            <option value="archived">{t.groups.archived}</option>
          </select>
        </div>
      </div>

      {/* Groups Grid / Cards */}
      {loading ? (
        <div className="p-12 flex justify-center items-center bg-white rounded-xl border border-slate-200">
          <LoadingSpinner size="lg" label={t.common.loading} />
        </div>
      ) : loadError ? (
        <ErrorState
          error={loadError}
          isRtl={isRtl}
          onRetry={() => loadInitialData(statusFilter as GroupStatusFilter)}
        />
      ) : filteredGroups.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8">
          <EmptyState
            icon={<FolderGit2 className="w-6 h-6 text-slate-400" />}
            title={t.groups.noGroupsFound}
            description={t.groups.noGroupsSubtitle}
            actionLabel={t.groups.createGroup}
            onAction={() => setIsCreateOpen(true)}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {paginatedGroups.map((group) => {
            const utilization =
              group.maxStudents > 0
                ? Math.min(100, Math.round((group.studentCount / group.maxStudents) * 100))
                : 0;
            const isFull = group.studentCount >= group.maxStudents;
            const isArchived = Boolean(group.archivedAt);

            return (
              <div
                key={group.id}
                className={`bg-white rounded-xl border shadow-xs hover:shadow-md transition-shadow p-5 flex flex-col justify-between ${
                  isArchived ? 'border-amber-200/90 bg-amber-50/20' : 'border-slate-200/90'
                }`}
              >
                <div>
                  {/* Top line with Year badge & Status */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                      {group.academicYear}
                    </span>
                    {isArchived ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                        <Archive className="w-3 h-3 text-amber-600" />
                        <span>{t.groups.archivedBadge}</span>
                      </span>
                    ) : (
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-bold ${
                          group.isActive ? 'text-emerald-700' : 'text-slate-400'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            group.isActive ? 'bg-emerald-500' : 'bg-slate-300'
                          }`}
                        />
                        {group.isActive ? t.common.active : t.common.inactive}
                      </span>
                    )}
                  </div>

                  {/* Group Name & Description */}
                  <h3 className="text-base font-bold text-[#14243A] leading-snug">
                    {isRtl ? group.nameArabic : group.name}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {isRtl ? group.name : group.nameArabic}
                  </p>

                  {group.description && (
                    <p className="text-xs text-slate-500 mt-2 line-clamp-2 leading-relaxed">
                      {group.description}
                    </p>
                  )}

                  {isArchived && group.archiveReason && (
                    <div className="mt-2.5 p-2 rounded-lg bg-amber-100/60 border border-amber-200 text-[11px] text-amber-900 flex items-start gap-1.5">
                      <Archive className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                      <span className="leading-tight line-clamp-2">{group.archiveReason}</span>
                    </div>
                  )}
                </div>

                {/* Capacity Progress Bar */}
                <div className="mt-5 pt-4 border-t border-slate-100">
                  <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                    <span className="text-slate-600 flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      <span>{group.studentCount} / {group.maxStudents} {isRtl ? 'طالب' : 'Students'}</span>
                    </span>
                    <span className={isFull ? 'text-rose-600 font-bold' : 'text-slate-500'}>
                      {utilization}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        isArchived
                          ? 'bg-amber-400'
                          : isFull
                          ? 'bg-rose-500'
                          : utilization > 80
                          ? 'bg-amber-500'
                          : 'bg-[#356AE6]'
                      }`}
                      style={{ width: `${utilization}%` }}
                    />
                  </div>

                  {/* Actions buttons */}
                  <div className="flex items-center justify-between mt-4 pt-2">
                    <button
                      onClick={() => handleOpenDetails(group.id)}
                      className="text-xs font-bold text-[#356AE6] hover:text-[#2a56bf] flex items-center gap-1.5 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>{t.groups.groupDetails}</span>
                    </button>

                    <div className="flex items-center gap-1">
                      {/* Super Admin Archive / Restore Button */}
                      {isSuperAdmin && (
                        isArchived ? (
                          <button
                            onClick={() => handleRestoreSubmit(group)}
                            className="p-1.5 rounded-lg text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 cursor-pointer flex items-center gap-1 text-xs font-bold"
                            title={t.groups.restoreGroup}
                          >
                            <RotateCcw className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="hidden sm:inline">{t.groups.restoreGroup}</span>
                          </button>
                        ) : (
                          <button
                            disabled={!group.isActive}
                            onClick={() => handleOpenArchive(group)}
                            className={`p-1.5 rounded-lg text-xs font-bold flex items-center gap-1 ${
                              group.isActive
                                ? 'text-amber-700 hover:text-amber-800 hover:bg-amber-50 cursor-pointer'
                                : 'text-slate-300 cursor-not-allowed'
                            }`}
                            title={group.isActive ? t.groups.archiveGroup : t.groups.cannotArchiveInactive}
                          >
                            <Archive className="w-3.5 h-3.5 text-amber-600" />
                            <span className="hidden sm:inline">{t.groups.archiveGroup}</span>
                          </button>
                        )
                      )}

                      {/* Edit Group Button: hidden if group is archived */}
                      {!isArchived && (
                        <button
                          onClick={() => handleOpenEdit(group)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-50 cursor-pointer"
                          title={t.groups.editGroup}
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {filteredGroups.length > pageSize && (
        <div className="p-4 bg-white rounded-xl border border-slate-200/80 flex items-center justify-between text-xs text-slate-500">
          <span>
            {isRtl
              ? `عرض ${(currentPage - 1) * pageSize + 1} إلى ${Math.min(
                  currentPage * pageSize,
                  filteredGroups.length
                )} من ${filteredGroups.length} مجموعة`
              : `Showing ${(currentPage - 1) * pageSize + 1} to ${Math.min(
                  currentPage * pageSize,
                  filteredGroups.length
                )} of ${filteredGroups.length} groups`}
          </span>
          <div className="flex items-center gap-1">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
            >
              {isRtl ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
            <span className="px-3 py-1 font-semibold text-slate-700">
              {currentPage} / {totalPages}
            </span>
            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="p-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
            >
              {isRtl ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* MODAL 1: CREATE / EDIT GROUP                                        */}
      {/* ------------------------------------------------------------------- */}
      <Modal
        isOpen={isCreateOpen || isEditOpen}
        onClose={() => {
          if (!formSubmitting) {
            setIsCreateOpen(false);
            setIsEditOpen(false);
          }
        }}
        title={groupForm.id ? t.groups.editGroup : t.groups.createGroup}
        subtitle={isRtl ? 'المجموعات الدراسية لتنظيم الطلاب والمقررات' : 'Academic cohorts and group cohorts'}
        maxWidth="md"
      >
        <form onSubmit={handleFormSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {t.groups.formNameEn} <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={groupForm.name}
              onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
              placeholder="e.g. Group A - IELTS Masterclass"
              className="w-full py-2 px-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {t.groups.formNameAr} <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              dir="rtl"
              value={groupForm.nameArabic}
              onChange={(e) => setGroupForm({ ...groupForm, nameArabic: e.target.value })}
              placeholder="مثال: المجموعة أ - تدريب مكثف للآيلتس"
              className="w-full py-2 px-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {t.groups.formYear} <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={groupForm.academicYear}
                onChange={(e) => setGroupForm({ ...groupForm, academicYear: e.target.value })}
                placeholder="2026/2027"
                className="w-full py-2 px-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {t.groups.formMaxCapacity} <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min={1}
                max={200}
                required
                value={groupForm.maxStudents}
                onChange={(e) => setGroupForm({ ...groupForm, maxStudents: Number(e.target.value) })}
                className="w-full py-2 px-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {t.groups.formDescription}
            </label>
            <textarea
              rows={3}
              value={groupForm.description}
              onChange={(e) => setGroupForm({ ...groupForm, description: e.target.value })}
              placeholder={isRtl ? 'وصف المستوى والأهداف التعليمية للمجموعة...' : 'Learning objectives and target level...'}
              className="w-full py-2 px-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="groupActiveCheck"
              checked={groupForm.isActive}
              onChange={(e) => setGroupForm({ ...groupForm, isActive: e.target.checked })}
              className="w-4 h-4 text-blue-600 rounded-md border-slate-300 focus:ring-blue-500"
            />
            <label htmlFor="groupActiveCheck" className="text-xs font-bold text-slate-700 select-none cursor-pointer">
              {t.groups.formIsActive}
            </label>
          </div>

          <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              disabled={formSubmitting}
              onClick={() => {
                setIsCreateOpen(false);
                setIsEditOpen(false);
              }}
            >
              {t.common.cancel}
            </Button>
            <Button
              type="submit"
              disabled={formSubmitting}
              className="bg-[#356AE6] hover:bg-[#2a56bf] text-white"
            >
              {formSubmitting ? t.common.loading : t.common.save}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ------------------------------------------------------------------- */}
      {/* MODAL 2: GROUP DETAILS & ROSTER                                     */}
      {/* ------------------------------------------------------------------- */}
      <Modal
        isOpen={isDetailOpen && !!groupDetails}
        onClose={() => setIsDetailOpen(false)}
        title={groupDetails ? (isRtl ? groupDetails.nameArabic : groupDetails.name) : ''}
        subtitle={groupDetails ? `${groupDetails.academicYear} • ${groupDetails.studentCount}/${groupDetails.maxStudents} Students` : ''}
        maxWidth="2xl"
      >
        {detailsLoading || !groupDetails ? (
          <div className="p-8 flex justify-center">
            <LoadingSpinner size="md" label={t.common.loading} />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Top Info Card */}
            {groupDetails.archivedAt && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs flex items-start gap-2.5 leading-relaxed">
                <Archive className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <strong className="block font-bold mb-0.5">{t.groups.archivedBadge}: {groupDetails.archiveReason || '—'}</strong>
                  <span className="text-amber-800">{t.groups.cannotEnrollArchived}</span>
                </div>
              </div>
            )}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
              <div>
                <p className="text-slate-600 leading-relaxed max-w-md">
                  {groupDetails.description || (isRtl ? 'لا يوجد وصف للمجموعة.' : 'No description provided.')}
                </p>
                <div className="flex items-center gap-3 mt-2 text-slate-400">
                  <span>{isRtl ? 'الحالة:' : 'Status:'} <StatusIndicator status={groupDetails.archivedAt ? 'inactive' : groupDetails.isActive ? 'active' : 'inactive'} /></span>
                  <span>•</span>
                  <span>{isRtl ? 'المقاعد المتبقية:' : 'Available Seats:'} <strong className="text-slate-700">{Math.max(0, groupDetails.maxStudents - groupDetails.studentCount)}</strong></span>
                </div>
              </div>

              {/* Action: Enroll student button */}
              <Button
                size="sm"
                disabled={Boolean(groupDetails.archivedAt) || groupDetails.studentCount >= groupDetails.maxStudents}
                title={groupDetails.archivedAt ? t.groups.cannotEnrollArchived : undefined}
                onClick={() => {
                  setEnrollStudentId('');
                  setEnrollAsPrimary(true);
                  setEnrollError(null);
                  setIsEnrollOpen(true);
                }}
                className="bg-[#356AE6] hover:bg-[#2a56bf] text-white flex items-center gap-1.5 shrink-0 shadow-xs disabled:opacity-40"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>{t.groups.enrollStudentBtn}</span>
              </Button>
            </div>

            {/* Roster Section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-[#14243A] flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-600" />
                  <span>{t.groups.rosterTitle}</span>
                  <span className="text-xs font-normal text-slate-400">({groupDetails.roster.length})</span>
                </h4>
              </div>

              {groupDetails.roster.length === 0 ? (
                <div className="p-6 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200 text-xs text-slate-400">
                  {t.groups.noStudentsInGroup}
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                  <table className="w-full text-left text-xs" dir={isRtl ? 'rtl' : 'ltr'}>
                    <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">{t.students.colStudent}</th>
                        <th className="py-2.5 px-3">{t.students.colStudentNumber}</th>
                        <th className="py-2.5 px-3">{t.students.colUsername}</th>
                        <th className="py-2.5 px-3">{t.students.colStatus}</th>
                        <th className="py-2.5 px-3 text-center">{t.students.colActions}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {groupDetails.roster.map((member) => (
                        <tr key={member.studentId} className="hover:bg-slate-50/50">
                          <td className="py-2.5 px-3">
                            <span className="font-bold text-slate-900 block">
                              {isRtl ? member.fullNameArabic : member.fullName}
                            </span>
                            {member.isPrimary && (
                              <span className="inline-block px-1.5 py-0.2 rounded-xs bg-amber-50 text-amber-700 text-[10px] font-semibold border border-amber-200 mt-0.5">
                                {isRtl ? 'مجموعة أساسية' : 'Primary'}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-500">
                            {member.studentNumber || '—'}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-blue-600">
                            @{member.username || 'student'}
                          </td>
                          <td className="py-2.5 px-3">
                            <StatusIndicator status={member.status} />
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center justify-center gap-1">
                              {/* Transfer */}
                              <button
                                onClick={() => {
                                  setTransferStudentId(member.studentId);
                                  setTransferTargetGroupId('');
                                  setTransferError(null);
                                  setIsTransferOpen(true);
                                }}
                                title={t.groups.transferStudentBtn}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                              >
                                <ArrowRightLeft className="w-3.5 h-3.5" />
                              </button>
                              {/* Remove */}
                              <button
                                onClick={() => {
                                  setRemoveStudentId(member.studentId);
                                  setRemoveStudentName(isRtl ? member.fullNameArabic : member.fullName);
                                  setIsRemoveOpen(true);
                                }}
                                title={t.groups.removeFromGroupBtn}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                              >
                                <UserMinus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Assigned Courses Section */}
            <div>
              <h4 className="text-sm font-bold text-[#14243A] flex items-center gap-2 mb-3">
                <BookOpen className="w-4 h-4 text-blue-600" />
                <span>{t.groups.assignedCoursesTitle}</span>
              </h4>
              {groupDetails.assignedCourses.length === 0 ? (
                <div className="p-5 bg-slate-50/50 rounded-xl border border-dashed border-slate-200 text-xs text-slate-400 text-center">
                  {t.groups.noCoursesAssigned}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {groupDetails.assignedCourses.map((c) => (
                    <div key={c.courseId} className="p-3 bg-white border border-slate-200 rounded-lg flex items-center justify-between">
                      <div>
                        <span className="font-bold text-slate-800 block">{isRtl ? c.titleArabic : c.title}</span>
                        <span className="text-slate-400 text-[10px] uppercase font-bold">{c.level}</span>
                      </div>
                      <span className="text-slate-400 text-[11px]">
                        {new Date(c.assignedAt).toLocaleDateString(isRtl ? 'ar-SA' : 'en-US')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer close */}
            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <Button size="sm" variant="outline" onClick={() => setIsDetailOpen(false)}>
                {t.common.close}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ------------------------------------------------------------------- */}
      {/* MODAL 3: ENROLL STUDENT INTO GROUP                                  */}
      {/* ------------------------------------------------------------------- */}
      <Modal
        isOpen={isEnrollOpen}
        onClose={() => !enrollSubmitting && setIsEnrollOpen(false)}
        title={t.groups.enrollModalTitle}
        subtitle={groupDetails ? (isRtl ? groupDetails.nameArabic : groupDetails.name) : ''}
        maxWidth="md"
      >
        <form onSubmit={handleEnrollSubmit} className="space-y-4">
          {enrollError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{enrollError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {t.groups.selectStudentLabel}
            </label>
            <select
              required
              value={enrollStudentId}
              onChange={(e) => setEnrollStudentId(e.target.value)}
              className="w-full py-2 px-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-hidden text-slate-700"
            >
              <option value="">{isRtl ? '-- حدد الطالب للتسكين --' : '-- Choose Student --'}</option>
              {allStudents
                .filter(
                  (s) =>
                    s.status === 'active' &&
                    !groupDetails?.roster.some((r) => r.studentId === s.id)
                )
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {isRtl ? s.fullNameArabic : s.fullName} (@{s.academicProfile?.username || 'user'})
                  </option>
                ))}
            </select>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="setPrimaryCheck"
              checked={enrollAsPrimary}
              onChange={(e) => setEnrollAsPrimary(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded-md border-slate-300 focus:ring-blue-500"
            />
            <label htmlFor="setPrimaryCheck" className="text-xs text-slate-700 font-medium select-none cursor-pointer">
              {t.groups.setAsPrimaryLabel}
            </label>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              disabled={enrollSubmitting}
              onClick={() => setIsEnrollOpen(false)}
            >
              {t.common.cancel}
            </Button>
            <Button
              type="submit"
              disabled={enrollSubmitting || !enrollStudentId}
              className="bg-[#356AE6] hover:bg-[#2a56bf] text-white"
            >
              {enrollSubmitting ? t.common.loading : t.groups.enrollStudentBtn}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ------------------------------------------------------------------- */}
      {/* MODAL 4: TRANSFER STUDENT BETWEEN GROUPS                            */}
      {/* ------------------------------------------------------------------- */}
      <Modal
        isOpen={isTransferOpen}
        onClose={() => !transferSubmitting && setIsTransferOpen(false)}
        title={t.groups.transferModalTitle}
        subtitle={groupDetails ? `${isRtl ? 'من:' : 'From:'} ${isRtl ? groupDetails.nameArabic : groupDetails.name}` : ''}
        maxWidth="md"
      >
        <form onSubmit={handleTransferSubmit} className="space-y-4">
          {transferError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{transferError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {t.groups.targetGroupLabel}
            </label>
            <select
              required
              value={transferTargetGroupId}
              onChange={(e) => setTransferTargetGroupId(e.target.value)}
              className="w-full py-2 px-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-hidden text-slate-700"
            >
              <option value="">{isRtl ? '-- اختر المجموعة الجديدة --' : '-- Select Destination Group --'}</option>
              {groups
                .filter((g) => g.id !== selectedGroupId && g.isActive && !g.archivedAt)
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {isRtl ? g.nameArabic : g.name} ({g.studentCount}/{g.maxStudents})
                  </option>
                ))}
            </select>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              disabled={transferSubmitting}
              onClick={() => setIsTransferOpen(false)}
            >
              {t.common.cancel}
            </Button>
            <Button
              type="submit"
              disabled={transferSubmitting || !transferTargetGroupId}
              className="bg-[#356AE6] hover:bg-[#2a56bf] text-white"
            >
              {transferSubmitting ? t.common.loading : t.groups.transferStudentBtn}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ------------------------------------------------------------------- */}
      {/* MODAL 5: CONFIRM REMOVE STUDENT FROM GROUP                          */}
      {/* ------------------------------------------------------------------- */}
      <Modal
        isOpen={isRemoveOpen}
        onClose={() => !removeSubmitting && setIsRemoveOpen(false)}
        title={t.groups.confirmRemoveTitle}
        subtitle={removeStudentName}
        maxWidth="sm"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed bg-amber-50 border border-amber-200 p-3 rounded-lg">
            {t.groups.confirmRemoveDesc}
          </p>

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              disabled={removeSubmitting}
              onClick={() => setIsRemoveOpen(false)}
            >
              {t.common.cancel}
            </Button>
            <Button
              type="button"
              disabled={removeSubmitting}
              onClick={handleRemoveSubmit}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {removeSubmitting ? t.common.loading : t.groups.removeFromGroupBtn}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ------------------------------------------------------------------- */}
      {/* MODAL 6: ARCHIVE GROUP CONFIRMATION (SUPER ADMIN ONLY)              */}
      {/* ------------------------------------------------------------------- */}
      <Modal
        isOpen={isArchiveOpen && !!archiveTargetGroup}
        onClose={() => {
          if (!archiveSubmitting) {
            setIsArchiveOpen(false);
            setArchiveTargetGroup(null);
          }
        }}
        title={t.groups.archiveModalTitle}
        subtitle={archiveTargetGroup ? (isRtl ? archiveTargetGroup.nameArabic : archiveTargetGroup.name) : ''}
        maxWidth="md"
      >
        <form onSubmit={handleArchiveSubmit} className="space-y-4">
          {archiveError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{archiveError}</span>
            </div>
          )}

          <div className="p-3.5 bg-amber-50/80 border border-amber-200/90 rounded-xl text-xs text-amber-900 flex items-start gap-2.5 leading-relaxed">
            <Archive className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-950 mb-1">{t.groups.archiveWarning}</p>
              <p className="text-[11px] text-amber-800">{t.groups.archiveModalSubtitle}</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {t.groups.archiveReasonLabel} <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={3}
              value={archiveReason}
              onChange={(e) => setArchiveReason(e.target.value)}
              placeholder={t.groups.archiveReasonPlaceholder}
              required
              className="w-full p-2.5 bg-slate-50 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500 text-slate-800"
            />
          </div>

          <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              disabled={archiveSubmitting}
              onClick={() => {
                setIsArchiveOpen(false);
                setArchiveTargetGroup(null);
              }}
            >
              {t.common.cancel}
            </Button>
            <Button
              type="submit"
              disabled={archiveSubmitting || !archiveReason.trim()}
              className="bg-amber-600 hover:bg-amber-700 text-white font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Archive className="w-4 h-4" />
              <span>{archiveSubmitting ? t.common.loading : t.groups.archiveGroup}</span>
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
