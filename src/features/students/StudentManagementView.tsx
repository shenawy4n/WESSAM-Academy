/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useLocale } from '../../hooks/useLocale';
import {
  StudentRecord,
  CreateStudentPayload,
  fetchStudents,
  createStudent,
  updateStudentDetails,
  updateStudentStatus,
  resetStudentPassword,
} from './studentService';
import { fetchGroups, GroupRecord } from '../groups/groupService';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { StatusIndicator } from '../../components/ui/StatusIndicator';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';
import {
  Users,
  UserPlus,
  Search,
  Filter,
  Eye,
  Edit2,
  KeyRound,
  ShieldAlert,
  GraduationCap,
  Calendar,
  Phone,
  Hash,
  AtSign,
  AlertCircle,
  CheckCircle2,
  Lock,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  ClipboardList,
} from 'lucide-react';

export const StudentManagementView: React.FC = () => {
  const { t, isRtl } = useLocale();

  // Data states
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Filters & Pagination
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 10;

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [selectedStudent, setSelectedStudent] = useState<StudentRecord | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState<boolean>(false);
  const [isEditOpen, setIsEditOpen] = useState<boolean>(false);
  const [isStatusOpen, setIsStatusOpen] = useState<boolean>(false);
  const [isResetPasswordOpen, setIsResetPasswordOpen] = useState<boolean>(false);

  // Form states for Create
  const [createForm, setCreateForm] = useState<CreateStudentPayload>({
    fullName: '',
    fullNameArabic: '',
    username: '',
    password: '',
    studentNumber: '',
    phone: '',
    groupId: '',
    notes: '',
  });
  const [createSubmitting, setCreateSubmitting] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Form states for Edit
  const [editForm, setEditForm] = useState<{
    fullName: string;
    fullNameArabic: string;
    phone: string;
    studentNumber: string;
    notes: string;
  }>({ fullName: '', fullNameArabic: '', phone: '', studentNumber: '', notes: '' });
  const [editSubmitting, setEditSubmitting] = useState<boolean>(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Status Change State
  const [newStatus, setNewStatus] = useState<'active' | 'inactive' | 'suspended'>('active');
  const [statusReason, setStatusReason] = useState<string>('');
  const [statusSubmitting, setStatusSubmitting] = useState<boolean>(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  // Password Reset State
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [resetSubmitting, setResetSubmitting] = useState<boolean>(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // Detail view active tab
  const [detailTab, setDetailTab] = useState<'personal' | 'academic' | 'groups' | 'activity'>('personal');

  // Load initial directory data
  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [studentsData, groupsData] = await Promise.all([
        fetchStudents(),
        fetchGroups(),
      ]);
      setStudents(studentsData);
      setGroups(groupsData);
    } catch (err: any) {
      console.error('Error loading student directory:', err);
      setError(err?.message || 'Failed to load students directory.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 4000);
  };

  // Metric counts
  const metrics = useMemo(() => {
    const total = students.length;
    const active = students.filter((s) => s.status === 'active').length;
    const inactive = students.filter((s) => s.status === 'inactive').length;
    const suspended = students.filter((s) => s.status === 'suspended').length;
    return { total, active, inactive, suspended };
  }, [students]);

  // Filtered & Paginated records
  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      // Search match
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        s.fullName.toLowerCase().includes(q) ||
        s.fullNameArabic.toLowerCase().includes(q) ||
        (s.academicProfile?.username && s.academicProfile.username.toLowerCase().includes(q)) ||
        (s.academicProfile?.studentNumber && s.academicProfile.studentNumber.toLowerCase().includes(q)) ||
        (s.phone && s.phone.includes(q));

      // Status match
      const matchStatus = statusFilter === 'all' || s.status === statusFilter;

      // Group match
      const matchGroup =
        groupFilter === 'all' ||
        s.groups.some((g) => g.id === groupFilter) ||
        s.academicProfile?.groupId === groupFilter;

      return matchSearch && matchStatus && matchGroup;
    });
  }, [students, searchQuery, statusFilter, groupFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / pageSize));
  const paginatedStudents = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredStudents.slice(start, start + pageSize);
  }, [filteredStudents, currentPage]);

  // Handlers for Modals
  const handleOpenDetail = (student: StudentRecord) => {
    setSelectedStudent(student);
    setDetailTab('personal');
    setIsDetailOpen(true);
  };

  const handleOpenEdit = (student: StudentRecord) => {
    setSelectedStudent(student);
    setEditForm({
      fullName: student.fullName,
      fullNameArabic: student.fullNameArabic,
      phone: student.phone || '',
      studentNumber: student.academicProfile?.studentNumber || '',
      notes: student.academicProfile?.notes || '',
    });
    setEditError(null);
    setIsEditOpen(true);
  };

  const handleOpenStatus = (student: StudentRecord) => {
    setSelectedStudent(student);
    setNewStatus(student.status);
    setStatusReason('');
    setStatusError(null);
    setIsStatusOpen(true);
  };

  const handleOpenResetPassword = (student: StudentRecord) => {
    setSelectedStudent(student);
    setNewPassword('');
    setConfirmPassword('');
    setResetError(null);
    setIsResetPasswordOpen(true);
  };

  // Submit Create Student
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.fullName.trim()) {
      setCreateError(t.students.formFullName + ' is required');
      return;
    }
    if (!createForm.username.trim()) {
      setCreateError(t.students.formUsername + ' is required');
      return;
    }
    if (!createForm.password || createForm.password.length < 8) {
      setCreateError(t.students.formPassword + ' (min 8 chars required)');
      return;
    }

    try {
      setCreateSubmitting(true);
      setCreateError(null);
      await createStudent({
        fullName: createForm.fullName.trim(),
        fullNameArabic: createForm.fullNameArabic?.trim() || createForm.fullName.trim(),
        username: createForm.username.trim().toLowerCase(),
        password: createForm.password,
        studentNumber: createForm.studentNumber?.trim() || undefined,
        phone: createForm.phone?.trim() || undefined,
        groupId: createForm.groupId || undefined,
        notes: createForm.notes?.trim() || undefined,
      });

      setIsCreateOpen(false);
      setCreateForm({
        fullName: '',
        fullNameArabic: '',
        username: '',
        password: '',
        studentNumber: '',
        phone: '',
        groupId: '',
        notes: '',
      });
      showToast(t.students.registerStudent + ' — Success');
      await loadData();
    } catch (err: any) {
      console.error('Create student error:', err);
      setCreateError(err?.message || 'Failed to register student.');
    } finally {
      setCreateSubmitting(false);
    }
  };

  // Submit Edit Details
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) return;
    if (!editForm.fullName.trim()) {
      setEditError(t.students.formFullName + ' is required');
      return;
    }

    try {
      setEditSubmitting(true);
      setEditError(null);
      await updateStudentDetails({
        studentId: selectedStudent.id,
        fullName: editForm.fullName,
        fullNameArabic: editForm.fullNameArabic,
        phone: editForm.phone,
        studentNumber: editForm.studentNumber,
        notes: editForm.notes,
      });

      setIsEditOpen(false);
      showToast(t.students.statusSuccess);
      await loadData();
    } catch (err: any) {
      setEditError(err?.message || 'Failed to update student details.');
    } finally {
      setEditSubmitting(false);
    }
  };

  // Submit Status Change
  const handleStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) return;

    try {
      setStatusSubmitting(true);
      setStatusError(null);
      await updateStudentStatus({
        studentId: selectedStudent.id,
        status: newStatus,
        reason: statusReason.trim() || undefined,
      });

      setIsStatusOpen(false);
      showToast(t.students.statusSuccess);
      await loadData();
    } catch (err: any) {
      setStatusError(err?.message || 'Failed to update student status.');
    } finally {
      setStatusSubmitting(false);
    }
  };

  // Submit Password Reset
  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) return;
    if (newPassword.length < 8) {
      setResetError(t.students.newPasswordLabel);
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError(t.students.passwordMismatch);
      return;
    }

    try {
      setResetSubmitting(true);
      setResetError(null);
      await resetStudentPassword({
        studentId: selectedStudent.id,
        newPassword,
      });

      setIsResetPasswordOpen(false);
      showToast(t.students.passwordSuccess);
    } catch (err: any) {
      setResetError(err?.message || 'Failed to reset password.');
    } finally {
      setResetSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Success Notification Banner */}
      {successToast && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center justify-between shadow-xs transition-all">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span className="text-sm font-semibold">{successToast}</span>
          </div>
          <button onClick={() => setSuccessToast(null)} className="text-emerald-600 hover:text-emerald-900 text-sm">
            ×
          </button>
        </div>
      )}

      {/* Global Error Notice */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl flex items-center gap-2.5">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      {/* Top Header & Metrics Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[#14243A] tracking-tight">{t.students.title}</h1>
          <p className="text-sm text-slate-500 mt-1">{t.students.subtitle}</p>
        </div>
        <Button
          onClick={() => {
            setCreateError(null);
            setIsCreateOpen(true);
          }}
          className="bg-[#356AE6] hover:bg-[#2a56bf] text-white flex items-center gap-2 shadow-xs"
        >
          <UserPlus className="w-4 h-4" />
          <span>{t.students.registerStudent}</span>
        </Button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>{t.students.totalStudents}</span>
            <Users className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-2xl font-black text-[#14243A] mt-2">{metrics.total}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>{t.students.activeStudents}</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
          </div>
          <p className="text-2xl font-black text-emerald-700 mt-2">{metrics.active}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>{t.students.inactiveStudents}</span>
            <span className="w-2 h-2 rounded-full bg-slate-400" />
          </div>
          <p className="text-2xl font-black text-slate-600 mt-2">{metrics.inactive}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>{t.students.suspendedStudents}</span>
            <span className="w-2 h-2 rounded-full bg-rose-500" />
          </div>
          <p className="text-2xl font-black text-rose-700 mt-2">{metrics.suspended}</p>
        </div>
      </div>

      {/* Filters & Search Control */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className={`w-4 h-4 text-slate-400 absolute top-3.5 ${isRtl ? 'right-3.5' : 'left-3.5'}`} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder={t.students.searchPlaceholder}
            className={`w-full py-2.5 bg-slate-50 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-[#356AE6] ${
              isRtl ? 'pr-10 pl-4' : 'pl-10 pr-4'
            }`}
          />
        </div>

        {/* Group Filter */}
        <div className="flex items-center gap-2">
          <select
            value={groupFilter}
            onChange={(e) => {
              setGroupFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="py-2.5 px-3 bg-slate-50 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-[#356AE6] text-slate-700"
          >
            <option value="all">{t.students.allGroups}</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {isRtl ? g.nameArabic : g.name}
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
            <option value="all">{t.students.allStatuses}</option>
            <option value="active">{t.common.active}</option>
            <option value="inactive">{t.common.inactive}</option>
            <option value="suspended">{t.common.suspended}</option>
          </select>
        </div>
      </div>

      {/* Directory Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 flex justify-center items-center">
            <LoadingSpinner size="lg" label={t.common.loading} />
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<Users className="w-6 h-6 text-slate-400" />}
              title={t.students.noStudentsFound}
              description={t.students.noStudentsSubtitle}
              actionLabel={t.students.registerStudent}
              onAction={() => setIsCreateOpen(true)}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" dir={isRtl ? 'rtl' : 'ltr'}>
              <thead className="bg-slate-50/80 text-xs uppercase text-slate-500 font-semibold border-b border-slate-200/80">
                <tr>
                  <th className="py-3.5 px-4">{t.students.colStudent}</th>
                  <th className="py-3.5 px-4">{t.students.colStudentNumber}</th>
                  <th className="py-3.5 px-4">{t.students.colUsername}</th>
                  <th className="py-3.5 px-4">{t.students.colGroup}</th>
                  <th className="py-3.5 px-4">{t.students.colStatus}</th>
                  <th className="py-3.5 px-4">{t.students.colEnrolledAt}</th>
                  <th className="py-3.5 px-4 text-center">{t.students.colActions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {paginatedStudents.map((student) => {
                  const primaryGroup =
                    student.groups.find((g) => g.isPrimary) || student.groups[0];
                  return (
                    <tr key={student.id} className="hover:bg-slate-50/60 transition-colors">
                      {/* Name & Arabic Name */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-blue-50 border border-blue-100 text-blue-700 font-bold flex items-center justify-center shrink-0 text-xs">
                            {student.fullName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-[#14243A] leading-tight">
                              {isRtl ? student.fullNameArabic : student.fullName}
                            </p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              {isRtl ? student.fullName : student.fullNameArabic}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Student Number */}
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-600">
                        {student.academicProfile?.studentNumber ? (
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200">
                            {student.academicProfile.studentNumber}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Username */}
                      <td className="py-3.5 px-4 font-mono text-xs text-blue-600">
                        @{student.academicProfile?.username || '—'}
                      </td>

                      {/* Primary Group */}
                      <td className="py-3.5 px-4">
                        {primaryGroup ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-800 border border-blue-100">
                            <GraduationCap className="w-3.5 h-3.5 text-blue-600" />
                            {isRtl ? primaryGroup.nameArabic : primaryGroup.name}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        <StatusIndicator status={student.status} />
                      </td>

                      {/* Enrolled Date */}
                      <td className="py-3.5 px-4 text-xs text-slate-500">
                        {new Date(student.createdAt).toLocaleDateString(isRtl ? 'ar-SA' : 'en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleOpenDetail(student)}
                            title={t.students.studentDetails}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenEdit(student)}
                            title={t.students.editStudent}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenStatus(student)}
                            title={t.students.changeStatus}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                          >
                            <ShieldAlert className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenResetPassword(student)}
                            title={t.students.resetPassword}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          >
                            <KeyRound className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {filteredStudents.length > pageSize && (
          <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 bg-slate-50/50">
            <span>
              {isRtl
                ? `عرض ${(currentPage - 1) * pageSize + 1} إلى ${Math.min(
                    currentPage * pageSize,
                    filteredStudents.length
                  )} من ${filteredStudents.length} طالب`
                : `Showing ${(currentPage - 1) * pageSize + 1} to ${Math.min(
                    currentPage * pageSize,
                    filteredStudents.length
                  )} of ${filteredStudents.length} students`}
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isRtl ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
              </button>
              <span className="px-3 py-1 font-semibold text-slate-700">
                {currentPage} / {totalPages}
              </span>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isRtl ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* MODAL 1: CREATE STUDENT MODAL                                       */}
      {/* ------------------------------------------------------------------- */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => !createSubmitting && setIsCreateOpen(false)}
        title={t.students.registerStudent}
        subtitle={isRtl ? 'إنشاء حساب وهوية دخول آمنة عبر خادم الأكاديمية' : 'Provisioning secure identity via academy edge function'}
        maxWidth="lg"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          {createError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{createError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {t.students.formFullName} <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={createForm.fullName}
                onChange={(e) => setCreateForm({ ...createForm, fullName: e.target.value })}
                placeholder="e.g. Faisal Al-Harbi"
                className="w-full py-2 px-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {t.students.formFullNameArabic} <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                dir="rtl"
                value={createForm.fullNameArabic}
                onChange={(e) => setCreateForm({ ...createForm, fullNameArabic: e.target.value })}
                placeholder="مثال: فيصل الحربي"
                className="w-full py-2 px-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {t.students.formUsername} <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className={`absolute top-2.5 text-slate-400 text-sm ${isRtl ? 'right-3' : 'left-3'}`}>@</span>
                <input
                  type="text"
                  required
                  value={createForm.username}
                  onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                  placeholder="faisal.harbi"
                  className={`w-full py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-hidden ${
                    isRtl ? 'pr-7 pl-3' : 'pl-7 pr-3'
                  }`}
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">3-30 lowercase characters (a-z, 0-9, . - _)</p>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {t.students.formPassword} <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Lock className={`w-4 h-4 text-slate-400 absolute top-2.5 ${isRtl ? 'right-3' : 'left-3'}`} />
                <input
                  type="password"
                  required
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  placeholder="••••••••••••"
                  className={`w-full py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-hidden ${
                    isRtl ? 'pr-9 pl-3' : 'pl-9 pr-3'
                  }`}
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">Min 8 characters</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {t.students.formStudentNumber}
              </label>
              <input
                type="text"
                value={createForm.studentNumber}
                onChange={(e) => setCreateForm({ ...createForm, studentNumber: e.target.value })}
                placeholder="e.g. WES-2026-105"
                className="w-full py-2 px-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {t.students.formPhone}
              </label>
              <input
                type="text"
                value={createForm.phone}
                onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                placeholder="+966 50 123 4567"
                className="w-full py-2 px-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {t.students.formPrimaryGroup}
            </label>
            <select
              value={createForm.groupId}
              onChange={(e) => setCreateForm({ ...createForm, groupId: e.target.value })}
              className="w-full py-2 px-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-hidden text-slate-700"
            >
              <option value="">{isRtl ? '-- بدون مجموعة حالياً --' : '-- No Group (Unassigned) --'}</option>
              {groups
                .filter((g) => g.isActive)
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {isRtl ? g.nameArabic : g.name} ({g.studentCount}/{g.maxStudents})
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {t.students.formNotes}
            </label>
            <textarea
              rows={2}
              value={createForm.notes}
              onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
              placeholder={isRtl ? 'ملاحظات المعلم حول مستوى الطالب وأهدافه...' : 'Teacher notes on student level, targets...'}
              className="w-full py-2 px-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              disabled={createSubmitting}
              onClick={() => setIsCreateOpen(false)}
            >
              {t.common.cancel}
            </Button>
            <Button
              type="submit"
              disabled={createSubmitting}
              className="bg-[#356AE6] hover:bg-[#2a56bf] text-white"
            >
              {createSubmitting ? t.students.submitting : t.students.registerStudent}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ------------------------------------------------------------------- */}
      {/* MODAL 2: STUDENT DETAILS MODAL                                      */}
      {/* ------------------------------------------------------------------- */}
      <Modal
        isOpen={isDetailOpen && !!selectedStudent}
        onClose={() => setIsDetailOpen(false)}
        title={selectedStudent ? (isRtl ? selectedStudent.fullNameArabic : selectedStudent.fullName) : ''}
        subtitle={selectedStudent ? `@${selectedStudent.academicProfile?.username || 'student'}` : ''}
        maxWidth="xl"
      >
        {selectedStudent && (
          <div className="space-y-5">
            {/* Nav Tabs */}
            <div className="flex border-b border-slate-200 text-xs font-bold gap-6">
              <button
                onClick={() => setDetailTab('personal')}
                className={`pb-2.5 transition-colors border-b-2 ${
                  detailTab === 'personal'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                {t.students.tabPersonal}
              </button>
              <button
                onClick={() => setDetailTab('academic')}
                className={`pb-2.5 transition-colors border-b-2 ${
                  detailTab === 'academic'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                {t.students.tabAcademic}
              </button>
              <button
                onClick={() => setDetailTab('groups')}
                className={`pb-2.5 transition-colors border-b-2 ${
                  detailTab === 'groups'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                {t.students.tabGroups} ({selectedStudent.groups.length})
              </button>
              <button
                onClick={() => setDetailTab('activity')}
                className={`pb-2.5 transition-colors border-b-2 ${
                  detailTab === 'activity'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                {t.students.tabActivity}
              </button>
            </div>

            {/* Tab 1: Personal */}
            {detailTab === 'personal' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-3 bg-slate-50 rounded-lg">
                  <span className="text-slate-400 block">{t.students.formFullName}</span>
                  <span className="text-sm font-bold text-slate-800 mt-0.5 block">{selectedStudent.fullName}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg">
                  <span className="text-slate-400 block">{t.students.formFullNameArabic}</span>
                  <span className="text-sm font-bold text-slate-800 mt-0.5 block">{selectedStudent.fullNameArabic}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg">
                  <span className="text-slate-400 block">{t.students.colPhone}</span>
                  <span className="text-sm font-medium text-slate-800 mt-0.5 block">{selectedStudent.phone || '—'}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg">
                  <span className="text-slate-400 block">{t.students.colStatus}</span>
                  <div className="mt-1">
                    <StatusIndicator status={selectedStudent.status} />
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Academic */}
            {detailTab === 'academic' && (
              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <span className="text-slate-400 block">{t.students.colStudentNumber}</span>
                    <span className="text-sm font-mono font-bold text-slate-800 mt-0.5 block">
                      {selectedStudent.academicProfile?.studentNumber || '—'}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <span className="text-slate-400 block">{t.students.colUsername}</span>
                    <span className="text-sm font-mono font-bold text-blue-600 mt-0.5 block">
                      @{selectedStudent.academicProfile?.username || '—'}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <span className="text-slate-400 block">{t.students.colEnrolledAt}</span>
                    <span className="text-sm font-medium text-slate-800 mt-0.5 block">
                      {new Date(selectedStudent.createdAt).toLocaleDateString(isRtl ? 'ar-SA' : 'en-US')}
                    </span>
                  </div>
                </div>
                {selectedStudent.academicProfile?.notes && (
                  <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-lg">
                    <span className="text-blue-900 font-bold block mb-1">{t.students.formNotes}</span>
                    <p className="text-slate-700 leading-relaxed">{selectedStudent.academicProfile.notes}</p>
                  </div>
                )}
              </div>
            )}

            {/* Tab 3: Group Memberships */}
            {detailTab === 'groups' && (
              <div className="space-y-3">
                {selectedStudent.groups.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">{t.students.noGroupsAssigned}</p>
                ) : (
                  selectedStudent.groups.map((g) => (
                    <div
                      key={g.id}
                      className="p-3 rounded-lg border border-slate-200 bg-white flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800">{isRtl ? g.nameArabic : g.name}</span>
                          {g.isPrimary && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
                              {isRtl ? 'الأساسية' : 'Primary'}
                            </span>
                          )}
                        </div>
                        <span className="text-slate-400 text-[11px] block mt-0.5">{g.academicYear}</span>
                      </div>
                      <span className="text-slate-400 text-[11px]">
                        {new Date(g.joinedAt).toLocaleDateString(isRtl ? 'ar-SA' : 'en-US')}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Tab 4: Activity (Phase 3/4 integration notice) */}
            {detailTab === 'activity' && (
              <div className="p-8 text-center bg-slate-50/60 rounded-xl border border-dashed border-slate-200">
                <ClipboardList className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <h4 className="text-sm font-bold text-slate-700">{t.students.activityEmptyTitle}</h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">{t.students.activityEmptyDesc}</p>
              </div>
            )}

            {/* Action Bar */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setIsDetailOpen(false);
                    handleOpenEdit(selectedStudent);
                  }}
                  className="flex items-center gap-1.5"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>{t.students.editStudent}</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setIsDetailOpen(false);
                    handleOpenStatus(selectedStudent);
                  }}
                  className="flex items-center gap-1.5"
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>{t.students.changeStatus}</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setIsDetailOpen(false);
                    handleOpenResetPassword(selectedStudent);
                  }}
                  className="flex items-center gap-1.5 text-rose-600 border-rose-200 hover:bg-rose-50"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>{t.students.resetPassword}</span>
                </Button>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setIsDetailOpen(false)}>
                {t.common.close}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ------------------------------------------------------------------- */}
      {/* MODAL 3: EDIT STUDENT DETAILS                                       */}
      {/* ------------------------------------------------------------------- */}
      <Modal
        isOpen={isEditOpen && !!selectedStudent}
        onClose={() => !editSubmitting && setIsEditOpen(false)}
        title={t.students.editStudent}
        subtitle={selectedStudent ? `@${selectedStudent.academicProfile?.username || ''}` : ''}
        maxWidth="md"
      >
        <form onSubmit={handleEditSubmit} className="space-y-4">
          {editError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{editError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {t.students.formFullName} <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={editForm.fullName}
              onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
              className="w-full py-2 px-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {t.students.formFullNameArabic} <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              dir="rtl"
              value={editForm.fullNameArabic}
              onChange={(e) => setEditForm({ ...editForm, fullNameArabic: e.target.value })}
              className="w-full py-2 px-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {t.students.formStudentNumber}
              </label>
              <input
                type="text"
                value={editForm.studentNumber}
                onChange={(e) => setEditForm({ ...editForm, studentNumber: e.target.value })}
                className="w-full py-2 px-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {t.students.formPhone}
              </label>
              <input
                type="text"
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                className="w-full py-2 px-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {t.students.formNotes}
            </label>
            <textarea
              rows={3}
              value={editForm.notes}
              onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
              className="w-full py-2 px-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              disabled={editSubmitting}
              onClick={() => setIsEditOpen(false)}
            >
              {t.common.cancel}
            </Button>
            <Button
              type="submit"
              disabled={editSubmitting}
              className="bg-[#356AE6] hover:bg-[#2a56bf] text-white"
            >
              {editSubmitting ? t.students.updating : t.common.save}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ------------------------------------------------------------------- */}
      {/* MODAL 4: CHANGE ACCOUNT STATUS                                      */}
      {/* ------------------------------------------------------------------- */}
      <Modal
        isOpen={isStatusOpen && !!selectedStudent}
        onClose={() => !statusSubmitting && setIsStatusOpen(false)}
        title={t.students.statusChangeTitle}
        subtitle={selectedStudent?.fullName}
        maxWidth="md"
      >
        <form onSubmit={handleStatusSubmit} className="space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed bg-amber-50 border border-amber-200 p-3 rounded-lg">
            {t.students.statusChangeDesc}
          </p>

          {statusError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{statusError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">{t.common.status}</label>
            <div className="grid grid-cols-3 gap-2">
              {(['active', 'inactive', 'suspended'] as const).map((st) => (
                <button
                  type="button"
                  key={st}
                  onClick={() => setNewStatus(st)}
                  className={`py-2 px-3 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    newStatus === st
                      ? 'border-blue-600 bg-blue-50 text-blue-700 ring-2 ring-blue-600/20'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <StatusIndicator status={st} />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {t.students.statusChangeReason}
            </label>
            <input
              type="text"
              value={statusReason}
              onChange={(e) => setStatusReason(e.target.value)}
              placeholder="e.g. End of academic semester / Tuition settlement"
              className="w-full py-2 px-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              disabled={statusSubmitting}
              onClick={() => setIsStatusOpen(false)}
            >
              {t.common.cancel}
            </Button>
            <Button
              type="submit"
              disabled={statusSubmitting}
              className="bg-[#356AE6] hover:bg-[#2a56bf] text-white"
            >
              {statusSubmitting ? t.students.updating : t.common.save}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ------------------------------------------------------------------- */}
      {/* MODAL 5: RESET PASSWORD MODAL                                       */}
      {/* ------------------------------------------------------------------- */}
      <Modal
        isOpen={isResetPasswordOpen && !!selectedStudent}
        onClose={() => !resetSubmitting && setIsResetPasswordOpen(false)}
        title={t.students.resetPasswordTitle}
        subtitle={selectedStudent ? `@${selectedStudent.academicProfile?.username || ''}` : ''}
        maxWidth="md"
      >
        <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed bg-blue-50 border border-blue-200 p-3 rounded-lg">
            {t.students.resetPasswordDesc}
          </p>

          {resetError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{resetError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {t.students.newPasswordLabel}
            </label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full py-2 px-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {t.students.confirmPasswordLabel}
            </label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full py-2 px-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              disabled={resetSubmitting}
              onClick={() => setIsResetPasswordOpen(false)}
            >
              {t.common.cancel}
            </Button>
            <Button
              type="submit"
              disabled={resetSubmitting}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {resetSubmitting ? t.students.updating : t.students.resetPassword}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
