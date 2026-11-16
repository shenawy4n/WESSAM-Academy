/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale } from '../../hooks/useLocale';
import { useAuth } from '../auth/AuthContext';
import { UnauthorizedScreen } from '../auth/UnauthorizedScreen';
import {
  DEFAULT_SYSTEM_SETTINGS,
  SettingKey,
  SettingsAuditLogEntry,
  StaffAccountRecord,
  StaffGovernanceDirectory,
  SystemSettingsBundle,
  canModifyStaffRoleOrStatus,
  createTeacherAccount,
  fetchSettingsAuditLogs,
  fetchStaffAccessDirectory,
  fetchSystemSettingsBundle,
  updateStaffAccountAccess,
  updateSystemSetting,
  validateCreateTeacherInput,
  validateSettingPayload,
} from './settingsService';
import { ServiceError } from '../../lib/errors/serviceError';
import { formatRecordTimestampRiyadh } from '../academicRecords/academicRecordsService';
import { Card, CardContent, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { ErrorState } from '../../components/ui/ErrorState';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { Modal } from '../../components/ui/Modal';
import {
  Bell,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  GraduationCap,
  History,
  Palette,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
  Sliders,
  UserPlus,
} from 'lucide-react';

type SettingsSectionId =
  | 'academy_info'
  | 'academic_settings'
  | 'notification_settings'
  | 'access_policies'
  | 'appearance_language'
  | 'platform_options'
  | 'audit_trail';

export const SystemSettingsView: React.FC<{ onUnauthorizedReturn?: () => void }> = ({
  onUnauthorizedReturn,
}) => {
  const { isRtl, lang, setLang } = useLocale();
  const { role, user } = useAuth();

  const [activeSection, setActiveSection] = useState<SettingsSectionId>('academy_info');
  const [savedBundle, setSavedBundle] = useState<SystemSettingsBundle>(DEFAULT_SYSTEM_SETTINGS);
  const [draftBundle, setDraftBundle] = useState<SystemSettingsBundle>(DEFAULT_SYSTEM_SETTINGS);
  const [directory, setDirectory] = useState<StaffGovernanceDirectory | null>(null);
  const [auditLogs, setAuditLogs] = useState<SettingsAuditLogEntry[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [savingKey, setSavingKey] = useState<SettingKey | null>(null);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Sensitive change confirmation state
  const [pendingConfirmKey, setPendingConfirmKey] = useState<SettingKey | null>(null);
  const [pendingTabSwitch, setPendingTabSwitch] = useState<SettingsSectionId | null>(null);

  // Staff role/status edit modal state
  const [editingStaff, setEditingStaff] = useState<StaffAccountRecord | null>(null);
  const [staffNewRole, setStaffNewRole] = useState<'super_admin' | 'teacher'>('teacher');
  const [staffNewStatus, setStaffNewStatus] = useState<'active' | 'inactive' | 'suspended'>('active');
  const [staffReason, setStaffReason] = useState('');
  const [staffSubmitting, setStaffSubmitting] = useState(false);
  const [staffError, setStaffError] = useState<unknown>(null);

  // Create Teacher modal state (Super Admin only)
  const [isCreateTeacherOpen, setIsCreateTeacherOpen] = useState(false);
  const [teacherFullName, setTeacherFullName] = useState('');
  const [teacherFullNameArabic, setTeacherFullNameArabic] = useState('');
  const [teacherEmail, setTeacherEmail] = useState('');
  const [teacherPhone, setTeacherPhone] = useState('');
  const [teacherPassword, setTeacherPassword] = useState('');
  const [teacherConfirmPassword, setTeacherConfirmPassword] = useState('');
  const [showTeacherPassword, setShowTeacherPassword] = useState(false);
  const [createTeacherSubmitting, setCreateTeacherSubmitting] = useState(false);
  const [createTeacherError, setCreateTeacherError] = useState<unknown>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [bundle, staffDir, logs] = await Promise.all([
        fetchSystemSettingsBundle(),
        fetchStaffAccessDirectory(),
        fetchSettingsAuditLogs(40, 0),
      ]);
      setSavedBundle(bundle);
      setDraftBundle(bundle);
      setDirectory(staffDir);
      setAuditLogs(logs);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (role === 'super_admin') {
      loadAll();
    }
  }, [loadAll, role]);

  const currentSectionKey: SettingKey | null =
    activeSection === 'audit_trail' ? null : (activeSection as SettingKey);

  const isCurrentSectionDirty = useMemo(() => {
    if (!currentSectionKey) return false;
    return (
      JSON.stringify(draftBundle[currentSectionKey]) !==
      JSON.stringify(savedBundle[currentSectionKey])
    );
  }, [activeSection, currentSectionKey, draftBundle, savedBundle]);

  const handleSelectSection = (next: SettingsSectionId) => {
    if (next === activeSection) return;
    if (isCurrentSectionDirty) {
      setPendingTabSwitch(next);
      return;
    }
    setSaveError(null);
    setSaveSuccessMsg(null);
    setActiveSection(next);
  };

  const handleCancelDraft = () => {
    if (!currentSectionKey) return;
    setDraftBundle((prev) => ({
      ...prev,
      [currentSectionKey]: savedBundle[currentSectionKey],
    }));
    setSaveError(null);
    setSaveSuccessMsg(null);
  };

  const commitSettingSave = async (key: SettingKey) => {
    setSavingKey(key);
    setSaveError(null);
    setSaveSuccessMsg(null);
    try {
      const payload = draftBundle[key];
      const errMsg = validateSettingPayload(key, payload as Record<string, any>);
      if (errMsg) {
        throw new Error(errMsg);
      }
      const res = await updateSystemSetting(key, payload);
      setSavedBundle((prev) => ({
        ...prev,
        [key]: res.value,
        updatedAtByKey: { ...prev.updatedAtByKey, [key]: res.updatedAt },
      }));
      setDraftBundle((prev) => ({
        ...prev,
        [key]: res.value,
        updatedAtByKey: { ...prev.updatedAtByKey, [key]: res.updatedAt },
      }));

      // Reflect default language change immediately if edited
      if (key === 'appearance_language' && (res.value as any).default_language) {
        setLang((res.value as any).default_language);
      }

      const freshLogs = await fetchSettingsAuditLogs(40, 0).catch(() => auditLogs);
      setAuditLogs(freshLogs);

      setSaveSuccessMsg(
        isRtl
          ? 'تم حفظ الإعدادات وتوثيق التغيير في سجل التدقيق بنجاح.'
          : 'Settings saved to database and recorded in the audit log.'
      );
    } catch (err) {
      setSaveError(err);
    } finally {
      setSavingKey(null);
      setPendingConfirmKey(null);
    }
  };

  const handleSaveSection = (key: SettingKey) => {
    const isSensitive =
      key === 'access_policies' ||
      (key === 'platform_options' && draftBundle.platform_options.maintenance_banner_enabled);
    if (isSensitive) {
      setPendingConfirmKey(key);
      return;
    }
    commitSettingSave(key);
  };

  const handleOpenStaffEdit = (acc: StaffAccountRecord) => {
    setEditingStaff(acc);
    setStaffNewRole(acc.role);
    setStaffNewStatus(acc.status);
    setStaffReason('');
    setStaffError(null);
  };

  const handleConfirmStaffUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaff || !directory) return;

    const guard = canModifyStaffRoleOrStatus(directory, editingStaff.id, staffNewRole, staffNewStatus);
    if (!guard.allowed) {
      setStaffError(new Error(guard.reason));
      return;
    }

    setStaffSubmitting(true);
    setStaffError(null);
    try {
      await updateStaffAccountAccess({
        targetUserId: editingStaff.id,
        newRole: staffNewRole,
        newStatus: staffNewStatus,
        reason: staffReason,
      });
      setEditingStaff(null);
      const [freshDir, freshLogs] = await Promise.all([
        fetchStaffAccessDirectory(),
        fetchSettingsAuditLogs(40, 0),
      ]);
      setDirectory(freshDir);
      setAuditLogs(freshLogs);
      setSaveSuccessMsg(
        isRtl
          ? 'تم تحديث صلاحيات الحساب وتوثيق التعديل في سجل التدقيق.'
          : 'Staff access permissions updated and audited.'
      );
    } catch (err) {
      setStaffError(err);
    } finally {
      setStaffSubmitting(false);
    }
  };

  const resetCreateTeacherForm = () => {
    setTeacherFullName('');
    setTeacherFullNameArabic('');
    setTeacherEmail('');
    setTeacherPhone('');
    setTeacherPassword('');
    setTeacherConfirmPassword('');
    setShowTeacherPassword(false);
    setCreateTeacherError(null);
  };

  const handleOpenCreateTeacher = () => {
    if (role !== 'super_admin') return;
    resetCreateTeacherForm();
    setIsCreateTeacherOpen(true);
  };

  const handleCreateTeacherSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (role !== 'super_admin') return;

    const payload = {
      fullName: teacherFullName,
      fullNameArabic: teacherFullNameArabic || undefined,
      email: teacherEmail,
      phone: teacherPhone || undefined,
      password: teacherPassword,
    };

    const validationError = validateCreateTeacherInput(payload, teacherConfirmPassword, isRtl);
    if (validationError) {
      setCreateTeacherError(
        new ServiceError({
          category: 'VALIDATION_ERROR',
          message: validationError,
          service: 'SystemSettingsView',
          operation: 'handleCreateTeacherSubmit',
        })
      );
      return;
    }

    setCreateTeacherSubmitting(true);
    setCreateTeacherError(null);
    try {
      const created = await createTeacherAccount(payload);
      resetCreateTeacherForm();
      setIsCreateTeacherOpen(false);

      const [freshDir, freshLogs] = await Promise.all([
        fetchStaffAccessDirectory(),
        fetchSettingsAuditLogs(40, 0),
      ]);
      setDirectory(freshDir);
      setAuditLogs(freshLogs);

      const displayName = isRtl ? created.fullNameArabic : created.fullName;
      setSaveSuccessMsg(
        isRtl
          ? `تم إنشاء حساب المعلم "${displayName}" (${created.email}) بصلاحية teacher وتوثيق العملية في سجل التدقيق.`
          : `Teacher account created for "${displayName}" (${created.email}) with role "teacher" and recorded in the audit log.`
      );
    } catch (err) {
      if (err instanceof ServiceError && err.code === 'EMAIL_ALREADY_EXISTS') {
        setCreateTeacherError(
          new ServiceError({
            category: 'VALIDATION_ERROR',
            message: isRtl
              ? 'هذا البريد الإلكتروني مسجل مسبقاً. يرجى استخدام بريد إلكتروني آخر.'
              : 'An account with this email already exists.',
            service: err.service,
            operation: err.operation,
            code: err.code,
            status: err.status,
          })
        );
      } else {
        setCreateTeacherError(err);
      }
    } finally {
      setCreateTeacherSubmitting(false);
    }
  };

  const sections: { id: SettingsSectionId; label: string; icon: React.ComponentType<any> }[] = [
    { id: 'academy_info', label: isRtl ? 'معلومات الأكاديمية' : 'Academy Info', icon: Building2 },
    { id: 'academic_settings', label: isRtl ? 'الإعدادات الأكاديمية' : 'Academic Rules', icon: GraduationCap },
    { id: 'notification_settings', label: isRtl ? 'إعدادات الإشعارات' : 'Notifications', icon: Bell },
    { id: 'access_policies', label: isRtl ? 'المستخدمون والصلاحيات' : 'Users & Access', icon: ShieldCheck },
    { id: 'appearance_language', label: isRtl ? 'المظهر واللغة' : 'Appearance & Language', icon: Palette },
    { id: 'platform_options', label: isRtl ? 'خيارات المنصة' : 'Platform Options', icon: Sliders },
    { id: 'audit_trail', label: isRtl ? 'سجل تغييرات الإعدادات' : 'Settings Audit Log', icon: History },
  ];

  if (role !== 'super_admin') {
    return <UnauthorizedScreen onReturn={onUnauthorizedReturn || (() => {})} />;
  }

  if (loading) {
    return (
      <div className="py-16 flex justify-center">
        <LoadingSpinner size="lg" label={isRtl ? 'جاري تحميل إعدادات النظام...' : 'Loading system settings...'} />
      </div>
    );
  }

  if (error) {
    return <ErrorState error={error} isRtl={isRtl} onRetry={loadAll} />;
  }

  return (
    <div className="space-y-5" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Super Admin Governance Banner */}
      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#14243A] text-[#D8B96C] flex items-center justify-center shrink-0">
              <Settings2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#14243A]">
                {isRtl ? 'إدارة إعدادات المنصة والحوكمة (المشرف العام فقط)' : 'System Settings & Governance (Super Admin Only)'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {isRtl
                  ? 'جميع التغييرات تُحفظ في قاعدة البيانات وتُسجَّل في سجل التدقيق بتوقيت مكة المكرمة (Asia/Riyadh). لا يُسمح بتخزين مفاتيح أو أسرار برمجية هنا.'
                  : 'All updates persist to Supabase and emit sanitized audit entries in Makkah Time (Asia/Riyadh). Secrets and API keys are strictly prohibited.'}
              </p>
            </div>
          </div>
          {isCurrentSectionDirty && (
            <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg whitespace-nowrap">
              {isRtl ? 'يوجد تعديلات غير محفوظة' : 'Unsaved changes'}
            </span>
          )}
        </CardContent>
      </Card>

      {saveSuccessMsg && (
        <div
          role="status"
          className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-900 text-xs flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{saveSuccessMsg}</span>
        </div>
      )}

      {Boolean(saveError) && (
        <ErrorState error={saveError} isRtl={isRtl} variant="banner" onDismiss={() => setSaveError(null)} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Category Rail */}
        <Card className="lg:col-span-3">
          <CardContent className="p-2.5 space-y-1">
            {sections.map((sec) => {
              const Icon = sec.icon;
              const isActive = activeSection === sec.id;
              return (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => handleSelectSection(sec.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-semibold transition-colors text-start cursor-pointer ${
                    isActive
                      ? 'bg-[#356AE6] text-white'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{sec.label}</span>
                </button>
              );
            })}
          </CardContent>
        </Card>

        {/* Active Settings Editor */}
        <div className="lg:col-span-9 space-y-5">
          {/* A. ACADEMY INFORMATION */}
          {activeSection === 'academy_info' && (
            <Card>
              <CardHeader
                title={isRtl ? 'معلومات الأكاديمية' : 'Academy Information'}
                subtitle={isRtl ? 'الاسم التعريفي، الوصف، وبيانات التواصل الرسمية' : 'Official bilingual identity and contact profile'}
              />
              <CardContent className="space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {isRtl ? 'اسم الأكاديمية (عربي)' : 'Academy Name (Arabic)'}
                    </label>
                    <input
                      type="text"
                      dir="rtl"
                      value={draftBundle.academy_info.academy_name_ar}
                      onChange={(e) =>
                        setDraftBundle((p) => ({
                          ...p,
                          academy_info: { ...p.academy_info, academy_name_ar: e.target.value },
                        }))
                      }
                      className="w-full py-2 px-3 border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {isRtl ? 'اسم الأكاديمية (إنجليزي)' : 'Academy Name (English)'}
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={draftBundle.academy_info.academy_name_en}
                      onChange={(e) =>
                        setDraftBundle((p) => ({
                          ...p,
                          academy_info: { ...p.academy_info, academy_name_en: e.target.value },
                        }))
                      }
                      className="w-full py-2 px-3 border border-slate-200 rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {isRtl ? 'اسم المالك / المشرف العام (عربي)' : 'Owner Name (Arabic)'}
                    </label>
                    <input
                      type="text"
                      dir="rtl"
                      value={draftBundle.academy_info.owner_name_ar}
                      onChange={(e) =>
                        setDraftBundle((p) => ({
                          ...p,
                          academy_info: { ...p.academy_info, owner_name_ar: e.target.value },
                        }))
                      }
                      className="w-full py-2 px-3 border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {isRtl ? 'اسم المالك / المشرف العام (إنجليزي)' : 'Owner Name (English)'}
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={draftBundle.academy_info.owner_name_en}
                      onChange={(e) =>
                        setDraftBundle((p) => ({
                          ...p,
                          academy_info: { ...p.academy_info, owner_name_en: e.target.value },
                        }))
                      }
                      className="w-full py-2 px-3 border border-slate-200 rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {isRtl ? 'الوصف الأكاديمي (عربي)' : 'Description (Arabic)'}
                    </label>
                    <textarea
                      rows={2}
                      dir="rtl"
                      value={draftBundle.academy_info.description_ar}
                      onChange={(e) =>
                        setDraftBundle((p) => ({
                          ...p,
                          academy_info: { ...p.academy_info, description_ar: e.target.value },
                        }))
                      }
                      className="w-full py-2 px-3 border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {isRtl ? 'الوصف الأكاديمي (إنجليزي)' : 'Description (English)'}
                    </label>
                    <textarea
                      rows={2}
                      dir="ltr"
                      value={draftBundle.academy_info.description_en}
                      onChange={(e) =>
                        setDraftBundle((p) => ({
                          ...p,
                          academy_info: { ...p.academy_info, description_en: e.target.value },
                        }))
                      }
                      className="w-full py-2 px-3 border border-slate-200 rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {isRtl ? 'البريد الإلكتروني للتواصل' : 'Contact Email'}
                    </label>
                    <input
                      type="email"
                      dir="ltr"
                      value={draftBundle.academy_info.contact_email}
                      onChange={(e) =>
                        setDraftBundle((p) => ({
                          ...p,
                          academy_info: { ...p.academy_info, contact_email: e.target.value },
                        }))
                      }
                      className="w-full py-2 px-3 border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {isRtl ? 'هاتف التواصل' : 'Contact Phone'}
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={draftBundle.academy_info.contact_phone}
                      onChange={(e) =>
                        setDraftBundle((p) => ({
                          ...p,
                          academy_info: { ...p.academy_info, contact_phone: e.target.value },
                        }))
                      }
                      className="w-full py-2 px-3 border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {isRtl ? 'المنطقة الزمنية المعتمدة' : 'Academic Timezone'}
                    </label>
                    <input
                      type="text"
                      disabled
                      value={isRtl ? 'توقيت مكة المكرمة (Asia/Riyadh)' : 'Asia/Riyadh (Makkah Time)'}
                      className="w-full py-2 px-3 border border-slate-200 rounded-lg bg-slate-50 text-slate-500"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* B. ACADEMIC SETTINGS */}
          {activeSection === 'academic_settings' && (
            <Card>
              <CardHeader
                title={isRtl ? 'الإعدادات الأكاديمية والتقديرات' : 'Academic Thresholds & Grading Scale'}
                subtitle={isRtl ? 'تتحكم في حد النجاح ومؤشرات التنبيه المبكر في التحليلات' : 'Controls passing threshold and analytics attention flags'}
              />
              <CardContent className="space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {isRtl ? 'العام الدراسي الحالي' : 'Current Academic Year'}
                    </label>
                    <input
                      type="text"
                      value={draftBundle.academic_settings.current_academic_year}
                      onChange={(e) =>
                        setDraftBundle((p) => ({
                          ...p,
                          academic_settings: { ...p.academic_settings, current_academic_year: e.target.value },
                        }))
                      }
                      className="w-full py-2 px-3 border border-slate-200 rounded-lg tabular-nums"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {isRtl ? 'الفصل الدراسي' : 'Academic Term'}
                    </label>
                    <select
                      value={draftBundle.academic_settings.academic_term}
                      onChange={(e) =>
                        setDraftBundle((p) => ({
                          ...p,
                          academic_settings: { ...p.academic_settings, academic_term: e.target.value },
                        }))
                      }
                      className="w-full py-2 px-3 border border-slate-200 rounded-lg bg-white"
                    >
                      <option value="first">{isRtl ? 'الفصل الأول' : 'First Term'}</option>
                      <option value="second">{isRtl ? 'الفصل الثاني' : 'Second Term'}</option>
                      <option value="third">{isRtl ? 'الفصل الثالث' : 'Third Term'}</option>
                      <option value="summer">{isRtl ? 'الفصل الصيفي' : 'Summer Term'}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {isRtl ? 'حد النجاح الافتراضي (%)' : 'Default Passing Score (%)'}
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={draftBundle.academic_settings.default_passing_score}
                      onChange={(e) =>
                        setDraftBundle((p) => ({
                          ...p,
                          academic_settings: {
                            ...p.academic_settings,
                            default_passing_score: Number(e.target.value),
                          },
                        }))
                      }
                      className="w-full py-2 px-3 border border-slate-200 rounded-lg tabular-nums"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {isRtl ? 'حد تنبيه التحصيل (%)' : 'Attention Score Threshold (%)'}
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={draftBundle.academic_settings.attention_threshold_score}
                      onChange={(e) =>
                        setDraftBundle((p) => ({
                          ...p,
                          academic_settings: {
                            ...p.academic_settings,
                            attention_threshold_score: Number(e.target.value),
                          },
                        }))
                      }
                      className="w-full py-2 px-3 border border-slate-200 rounded-lg tabular-nums"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {isRtl ? 'حد تنبيه الحضور (%)' : 'Attention Attendance Threshold (%)'}
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={draftBundle.academic_settings.attention_attendance_threshold}
                      onChange={(e) =>
                        setDraftBundle((p) => ({
                          ...p,
                          academic_settings: {
                            ...p.academic_settings,
                            attention_attendance_threshold: Number(e.target.value),
                          },
                        }))
                      }
                      className="w-full py-2 px-3 border border-slate-200 rounded-lg tabular-nums"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {isRtl ? 'محاولات الاختبار الافتراضية' : 'Default Quiz Max Attempts'}
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={draftBundle.academic_settings.default_quiz_max_attempts}
                      onChange={(e) =>
                        setDraftBundle((p) => ({
                          ...p,
                          academic_settings: {
                            ...p.academic_settings,
                            default_quiz_max_attempts: Number(e.target.value),
                          },
                        }))
                      }
                      className="w-full py-2 px-3 border border-slate-200 rounded-lg tabular-nums"
                    />
                  </div>

                  <div className="flex items-end pb-1.5">
                    <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={draftBundle.academic_settings.default_allow_late_submissions}
                        onChange={(e) =>
                          setDraftBundle((p) => ({
                            ...p,
                            academic_settings: {
                              ...p.academic_settings,
                              default_allow_late_submissions: e.target.checked,
                            },
                          }))
                        }
                        className="rounded border-slate-300"
                      />
                      <span>{isRtl ? 'السماح بالتسليم المتأخر افتراضياً' : 'Allow late submissions by default'}</span>
                    </label>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* C. NOTIFICATION SETTINGS */}
          {activeSection === 'notification_settings' && (
            <Card>
              <CardHeader
                title={isRtl ? 'إعدادات الإشعارات والتنبيهات الداخلية' : 'In-App Notification Settings'}
                subtitle={isRtl ? 'تشمل فقط قنوات الإشعارات المدعومة داخل المنصة' : 'Covers supported in-platform notification & announcement behaviors only'}
              />
              <CardContent className="space-y-4 text-xs">
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-slate-600">
                  {isRtl
                    ? 'ملاحظة: تدعم المنصة الإشعارات الفورية داخل النظام فقط؛ ولا تتضمن إرسال بريد إلكتروني أو رسائل SMS أو إشعارات دفع خارجية حالياً.'
                    : 'Note: The platform currently supports real-time in-app notifications only; external email, SMS, or mobile push gateways are not active.'}
                </div>

                <div className="space-y-3">
                  <label className="flex items-center justify-between p-3 border border-slate-200 rounded-lg cursor-pointer">
                    <span className="font-semibold text-[#14243A]">
                      {isRtl ? 'تفعيل مركز الإشعارات الداخلية' : 'Enable In-App Notification Center'}
                    </span>
                    <input
                      type="checkbox"
                      checked={draftBundle.notification_settings.in_app_notifications_enabled}
                      onChange={(e) =>
                        setDraftBundle((p) => ({
                          ...p,
                          notification_settings: {
                            ...p.notification_settings,
                            in_app_notifications_enabled: e.target.checked,
                          },
                        }))
                      }
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 border border-slate-200 rounded-lg cursor-pointer">
                    <span className="font-semibold text-[#14243A]">
                      {isRtl ? 'السماح للمعلمين بنشر إعلانات لمجموعاتهم' : 'Allow teachers to publish cohort announcements'}
                    </span>
                    <input
                      type="checkbox"
                      checked={draftBundle.notification_settings.allow_teacher_announcements}
                      onChange={(e) =>
                        setDraftBundle((p) => ({
                          ...p,
                          notification_settings: {
                            ...p.notification_settings,
                            allow_teacher_announcements: e.target.checked,
                          },
                        }))
                      }
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 border border-slate-200 rounded-lg cursor-pointer">
                    <span className="font-semibold text-[#14243A]">
                      {isRtl ? 'إشعار الطالب عند إعلان الدرجة' : 'Notify student upon grade release'}
                    </span>
                    <input
                      type="checkbox"
                      checked={draftBundle.notification_settings.notify_on_grade_release}
                      onChange={(e) =>
                        setDraftBundle((p) => ({
                          ...p,
                          notification_settings: {
                            ...p.notification_settings,
                            notify_on_grade_release: e.target.checked,
                          },
                        }))
                      }
                    />
                  </label>
                </div>

                <div className="max-w-xs">
                  <label className="block font-semibold text-slate-700 mb-1">
                    {isRtl ? 'الأولوية الافتراضية للإعلانات' : 'Default Announcement Priority'}
                  </label>
                  <select
                    value={draftBundle.notification_settings.default_announcement_priority}
                    onChange={(e) =>
                      setDraftBundle((p) => ({
                        ...p,
                        notification_settings: {
                          ...p.notification_settings,
                          default_announcement_priority: e.target.value as 'normal' | 'important' | 'urgent',
                        },
                      }))
                    }
                    className="w-full py-2 px-3 border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="normal">{isRtl ? 'عادي' : 'Normal'}</option>
                    <option value="important">{isRtl ? 'مهم' : 'Important'}</option>
                    <option value="urgent">{isRtl ? 'عاجل' : 'Urgent'}</option>
                  </select>
                </div>
              </CardContent>
            </Card>
          )}

          {/* D. USER & ACCESS GOVERNANCE */}
          {activeSection === 'access_policies' && (
            <div className="space-y-5">
              <Card>
                <CardHeader
                  title={isRtl ? 'سياسات الوصول والحسابات' : 'Access & Isolation Policies'}
                  subtitle={isRtl ? 'تشديد عزل الطلاب غير النشطين وحماية الإعدادات للمشرف العام' : 'Account activation rules and Super Admin security boundaries'}
                />
                <CardContent className="space-y-3 text-xs">
                  <label className="flex items-center justify-between p-3 border border-slate-200 rounded-lg cursor-pointer">
                    <span className="font-semibold text-[#14243A]">
                      {isRtl ? 'فرض العزل الصارم للطلاب الموقوفين/غير النشطين' : 'Enforce strict isolation for inactive/suspended students'}
                    </span>
                    <input
                      type="checkbox"
                      checked={draftBundle.access_policies.enforce_active_student_isolation}
                      onChange={(e) =>
                        setDraftBundle((p) => ({
                          ...p,
                          access_policies: {
                            ...p.access_policies,
                            enforce_active_student_isolation: e.target.checked,
                          },
                        }))
                      }
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 border border-slate-200 rounded-lg cursor-pointer">
                    <span className="font-semibold text-[#14243A]">
                      {isRtl ? 'السماح للمعلمين بتسجيل حسابات طلاب جديدة' : 'Allow teachers to provision student accounts'}
                    </span>
                    <input
                      type="checkbox"
                      checked={draftBundle.access_policies.allow_teacher_student_registration}
                      onChange={(e) =>
                        setDraftBundle((p) => ({
                          ...p,
                          access_policies: {
                            ...p.access_policies,
                            allow_teacher_student_registration: e.target.checked,
                          },
                        }))
                      }
                    />
                  </label>
                </CardContent>
              </Card>

              <Card>
                <CardHeader
                  title={isRtl ? 'دليل الأدوار والصلاحيات الإدارية' : 'Staff & Admin Access Governance'}
                  subtitle={
                    directory
                      ? isRtl
                        ? `المشرفون النشطون: ${directory.roleCounts.activeSuperAdmins} · المعلمون: ${directory.roleCounts.activeTeachers} · الطلاب النشطون: ${directory.roleCounts.activeStudents}`
                        : `Active Super Admins: ${directory.roleCounts.activeSuperAdmins} · Teachers: ${directory.roleCounts.activeTeachers} · Active Students: ${directory.roleCounts.activeStudents}`
                      : undefined
                  }
                  action={
                    role === 'super_admin' ? (
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={handleOpenCreateTeacher}
                        icon={<UserPlus className="w-3.5 h-3.5" />}
                      >
                        {isRtl ? 'إضافة حساب معلم' : 'Create Teacher Account'}
                      </Button>
                    ) : undefined
                  }
                />
                <CardContent className="p-0">
                  {!directory || directory.staffAccounts.length === 0 ? (
                    <div className="p-6">
                      <EmptyState
                        icon={<ShieldCheck className="w-5 h-5" />}
                        title={isRtl ? 'لا توجد حسابات إدارية' : 'No staff accounts'}
                        description={isRtl ? 'لم يتم العثور على حسابات معلمين أو مشرفين.' : 'No staff profiles loaded.'}
                      />
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-start">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                          <tr>
                            <th className="py-3 px-4 text-start">{isRtl ? 'الاسم' : 'Name'}</th>
                            <th className="py-3 px-4 text-start">{isRtl ? 'الدور' : 'Role'}</th>
                            <th className="py-3 px-4 text-start">{isRtl ? 'الحالة' : 'Status'}</th>
                            <th className="py-3 px-4 text-end">{isRtl ? 'إدارة' : 'Action'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {directory.staffAccounts.map((acc) => (
                            <tr key={acc.id} className="hover:bg-slate-50/70">
                              <td className="py-3 px-4">
                                <div className="font-semibold text-[#14243A]">
                                  {isRtl ? acc.fullNameArabic : acc.fullName}
                                  {acc.id === user?.id && (
                                    <span className="mx-1.5 text-[11px] text-[#356AE6]">
                                      ({isRtl ? 'حسابك' : 'You'})
                                    </span>
                                  )}
                                </div>
                                {acc.email && (
                                  <div className="text-[11px] text-slate-500 mt-0.5 font-mono" dir="ltr">
                                    {acc.email}
                                  </div>
                                )}
                              </td>
                              <td className="py-3 px-4 font-medium">
                                {acc.role === 'super_admin'
                                  ? isRtl
                                    ? 'مشرف عام (Super Admin)'
                                    : 'Super Admin'
                                  : isRtl
                                  ? 'معلم (Teacher)'
                                  : 'Teacher'}
                              </td>
                              <td className="py-3 px-4">
                                <span
                                  className={`font-semibold ${
                                    acc.status === 'active' ? 'text-emerald-700' : 'text-rose-700'
                                  }`}
                                >
                                  {acc.status}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-end">
                                <Button size="sm" variant="outline" onClick={() => handleOpenStaffEdit(acc)}>
                                  {isRtl ? 'تعديل الصلاحية' : 'Manage Access'}
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* E. APPEARANCE & LANGUAGE */}
          {activeSection === 'appearance_language' && (
            <Card>
              <CardHeader
                title={isRtl ? 'المظهر واللغة الافتراضية' : 'Appearance & Language Defaults'}
                subtitle={isRtl ? 'ضبط اللغة الافتراضية واتجاه العرض وكثافة الجداول' : 'Default locale, RTL enforcement, and table density'}
              />
              <CardContent className="space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {isRtl ? 'اللغة الافتراضية للمنصة' : 'Default Platform Language'}
                    </label>
                    <select
                      value={draftBundle.appearance_language.default_language}
                      onChange={(e) =>
                        setDraftBundle((p) => ({
                          ...p,
                          appearance_language: {
                            ...p.appearance_language,
                            default_language: e.target.value as 'ar' | 'en',
                          },
                        }))
                      }
                      className="w-full py-2 px-3 border border-slate-200 rounded-lg bg-white"
                    >
                      <option value="ar">{isRtl ? 'العربية (RTL)' : 'Arabic (RTL)'}</option>
                      <option value="en">{isRtl ? 'الإنجليزية (LTR)' : 'English (LTR)'}</option>
                    </select>
                  </div>

                  <div className="flex items-end pb-2">
                    <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={draftBundle.appearance_language.compact_tables}
                        onChange={(e) =>
                          setDraftBundle((p) => ({
                            ...p,
                            appearance_language: {
                              ...p.appearance_language,
                              compact_tables: e.target.checked,
                            },
                          }))
                        }
                      />
                      <span>{isRtl ? 'تفعيل العرض المدمج للجداول الأكاديمية' : 'Use compact academic table rows'}</span>
                    </label>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* F. PLATFORM OPTIONS */}
          {activeSection === 'platform_options' && (
            <Card>
              <CardHeader
                title={isRtl ? 'خيارات المنصة والحصص المباشرة' : 'Platform & Live Session Options'}
                subtitle={isRtl ? 'إعدادات الحصص الافتراضية وشريط الصيانة الداخلي' : 'Session defaults and maintenance notice options'}
              />
              <CardContent className="space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {isRtl ? 'مزود الحصص الافتراضي' : 'Default Live Provider'}
                    </label>
                    <select
                      value={draftBundle.platform_options.live_session_default_provider}
                      onChange={(e) =>
                        setDraftBundle((p) => ({
                          ...p,
                          platform_options: {
                            ...p.platform_options,
                            live_session_default_provider: e.target.value as any,
                          },
                        }))
                      }
                      className="w-full py-2 px-3 border border-slate-200 rounded-lg bg-white"
                    >
                      <option value="zoom">Zoom</option>
                      <option value="google_meet">Google Meet</option>
                      <option value="teams">Microsoft Teams</option>
                      <option value="custom">{isRtl ? 'رابط مخصص' : 'Custom Link'}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {isRtl ? 'المدة الافتراضية للحصة (دقيقة)' : 'Default Duration (mins)'}
                    </label>
                    <input
                      type="number"
                      min={10}
                      max={480}
                      value={draftBundle.platform_options.live_session_default_duration_minutes}
                      onChange={(e) =>
                        setDraftBundle((p) => ({
                          ...p,
                          platform_options: {
                            ...p.platform_options,
                            live_session_default_duration_minutes: Number(e.target.value),
                          },
                        }))
                      }
                      className="w-full py-2 px-3 border border-slate-200 rounded-lg tabular-nums"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {isRtl ? 'الحد الأقصى لحجم المرفق (MB)' : 'Max Upload Size (MB)'}
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={draftBundle.platform_options.max_upload_size_mb}
                      onChange={(e) =>
                        setDraftBundle((p) => ({
                          ...p,
                          platform_options: {
                            ...p.platform_options,
                            max_upload_size_mb: Number(e.target.value),
                          },
                        }))
                      }
                      className="w-full py-2 px-3 border border-slate-200 rounded-lg tabular-nums"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-800 pt-1">
                  <input
                    type="checkbox"
                    checked={draftBundle.platform_options.maintenance_banner_enabled}
                    onChange={(e) =>
                      setDraftBundle((p) => ({
                        ...p,
                        platform_options: {
                          ...p.platform_options,
                          maintenance_banner_enabled: e.target.checked,
                        },
                      }))
                    }
                  />
                  <span>{isRtl ? 'إظهار تنبيه صيانة للمستخدمين' : 'Show maintenance notice banner'}</span>
                </label>

                {draftBundle.platform_options.maintenance_banner_enabled && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <input
                      type="text"
                      dir="rtl"
                      placeholder="نص تنبيه الصيانة بالعربية"
                      value={draftBundle.platform_options.maintenance_banner_ar}
                      onChange={(e) =>
                        setDraftBundle((p) => ({
                          ...p,
                          platform_options: { ...p.platform_options, maintenance_banner_ar: e.target.value },
                        }))
                      }
                      className="w-full py-2 px-3 border border-slate-200 rounded-lg"
                    />
                    <input
                      type="text"
                      dir="ltr"
                      placeholder="Maintenance notice in English"
                      value={draftBundle.platform_options.maintenance_banner_en}
                      onChange={(e) =>
                        setDraftBundle((p) => ({
                          ...p,
                          platform_options: { ...p.platform_options, maintenance_banner_en: e.target.value },
                        }))
                      }
                      className="w-full py-2 px-3 border border-slate-200 rounded-lg"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* G. SETTINGS AUDIT TRAIL */}
          {activeSection === 'audit_trail' && (
            <Card>
              <CardHeader
                title={isRtl ? 'سجل تدقيق تغييرات الإعدادات والصلاحيات' : 'System Settings & Access Audit Log'}
                subtitle={isRtl ? 'توقيت مكة المكرمة (Asia/Riyadh) — للقراءة فقط' : 'Makkah Time (Asia/Riyadh) — append-only'}
              />
              <CardContent className="p-0">
                {auditLogs.length === 0 ? (
                  <div className="p-6">
                    <EmptyState
                      icon={<History className="w-5 h-5" />}
                      title={isRtl ? 'لا توجد تغييرات مسجلة بعد' : 'No settings changes logged yet'}
                      description={isRtl ? 'ستظهر هنا أي تعديلات مستقبلية على الإعدادات أو الصلاحيات.' : 'Future setting or role updates will appear here.'}
                    />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-start">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                        <tr>
                          <th className="py-3 px-4 text-start">{isRtl ? 'المنفذ' : 'Actor'}</th>
                          <th className="py-3 px-4 text-start">{isRtl ? 'العملية' : 'Action'}</th>
                          <th className="py-3 px-4 text-start">{isRtl ? 'القسم / المعرف' : 'Target'}</th>
                          <th className="py-3 px-4 text-start">{isRtl ? 'التوقيت (الرياض)' : 'Timestamp (Riyadh)'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {auditLogs.map((log) => (
                          <tr key={log.id} className="hover:bg-slate-50/70">
                            <td className="py-3 px-4 font-semibold text-[#14243A]">
                              {isRtl ? log.actorNameArabic : log.actorName}
                              <span className="mx-1 text-[11px] font-normal text-slate-500">({log.actorRole})</span>
                            </td>
                            <td className="py-3 px-4 font-mono text-[11px] text-slate-700">{log.action}</td>
                            <td className="py-3 px-4 font-mono text-[11px] text-[#356AE6]">
                              {log.entityType}:{log.entityId}
                            </td>
                            <td className="py-3 px-4 tabular-nums text-slate-500 whitespace-nowrap">
                              {formatRecordTimestampRiyadh(log.createdAt, lang)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Save / Cancel Bar for editable sections */}
          {currentSectionKey && (
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500 tabular-nums">
                {savedBundle.updatedAtByKey[currentSectionKey]
                  ? `${isRtl ? 'آخر تحديث:' : 'Last updated:'} ${formatRecordTimestampRiyadh(
                      savedBundle.updatedAtByKey[currentSectionKey],
                      lang
                    )}`
                  : isRtl
                  ? 'الإعدادات الافتراضية للنظام'
                  : 'System defaults'}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!isCurrentSectionDirty || savingKey !== null}
                  onClick={handleCancelDraft}
                  icon={<RotateCcw className="w-3.5 h-3.5" />}
                >
                  {isRtl ? 'تراجع' : 'Discard'}
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={!isCurrentSectionDirty}
                  isLoading={savingKey === currentSectionKey}
                  onClick={() => handleSaveSection(currentSectionKey)}
                  icon={<Save className="w-3.5 h-3.5" />}
                >
                  {isRtl ? 'حفظ التغييرات' : 'Save Changes'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal for Sensitive Settings */}
      <Modal
        isOpen={pendingConfirmKey !== null}
        onClose={() => setPendingConfirmKey(null)}
        title={isRtl ? 'تأكيد تعديل إعداد حساس' : 'Confirm Sensitive Configuration Change'}
        maxWidth="md"
      >
        <div className="space-y-4 text-xs text-slate-700">
          <p className="leading-relaxed">
            {isRtl
              ? 'أنت على وشك حفظ تغييرات تؤثر على سياسات الوصول أو وضع المنصة. سيتم توثيق هذا التعديل باسمك في سجل التدقيق.'
              : 'You are about to commit changes affecting access governance or platform notice state. This action is audited under your Super Admin account.'}
          </p>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button variant="outline" size="sm" onClick={() => setPendingConfirmKey(null)}>
              {isRtl ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button
              variant="primary"
              size="sm"
              isLoading={savingKey !== null}
              onClick={() => pendingConfirmKey && commitSettingSave(pendingConfirmKey)}
            >
              {isRtl ? 'تأكيد وحفظ' : 'Confirm & Save'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Unsaved Changes Navigation Guard Modal */}
      <Modal
        isOpen={pendingTabSwitch !== null}
        onClose={() => setPendingTabSwitch(null)}
        title={isRtl ? 'تعديلات غير محفوظة' : 'Unsaved Changes'}
        maxWidth="sm"
      >
        <div className="space-y-4 text-xs text-slate-700">
          <p>
            {isRtl
              ? 'لديك تعديلات غير محفوظة في القسم الحالي. هل تريد تجاهلها والانتقال للقسم التالي؟'
              : 'You have unsaved changes in this section. Discard them and switch sections?'}
          </p>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button variant="outline" size="sm" onClick={() => setPendingTabSwitch(null)}>
              {isRtl ? 'البقاء هنا' : 'Stay'}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                handleCancelDraft();
                if (pendingTabSwitch) setActiveSection(pendingTabSwitch);
                setPendingTabSwitch(null);
              }}
            >
              {isRtl ? 'تجاهل والانتقال' : 'Discard & Switch'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Staff Role & Status Edit Modal */}
      <Modal
        isOpen={editingStaff !== null}
        onClose={() => !staffSubmitting && setEditingStaff(null)}
        title={isRtl ? 'إدارة صلاحيات الحساب الإداري' : 'Manage Staff Account Access'}
        subtitle={editingStaff ? (isRtl ? editingStaff.fullNameArabic : editingStaff.fullName) : undefined}
        maxWidth="md"
      >
        <form onSubmit={handleConfirmStaffUpdate} className="space-y-4 text-xs">
          {Boolean(staffError) && <ErrorState error={staffError} isRtl={isRtl} variant="banner" />}

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              {isRtl ? 'الدور الوظيفي' : 'Role'}
            </label>
            <select
              value={staffNewRole}
              onChange={(e) => setStaffNewRole(e.target.value as 'super_admin' | 'teacher')}
              className="w-full py-2 px-3 border border-slate-200 rounded-lg bg-white"
            >
              <option value="teacher">{isRtl ? 'معلم (Teacher)' : 'Teacher'}</option>
              <option value="super_admin">{isRtl ? 'مشرف عام (Super Admin)' : 'Super Admin'}</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              {isRtl ? 'حالة الحساب' : 'Account Status'}
            </label>
            <select
              value={staffNewStatus}
              onChange={(e) => setStaffNewStatus(e.target.value as 'active' | 'inactive' | 'suspended')}
              className="w-full py-2 px-3 border border-slate-200 rounded-lg bg-white"
            >
              <option value="active">{isRtl ? 'نشط' : 'Active'}</option>
              <option value="inactive">{isRtl ? 'غير نشط' : 'Inactive'}</option>
              <option value="suspended">{isRtl ? 'موقوف' : 'Suspended'}</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              {isRtl ? 'سبب التعديل (يُحفظ في سجل التدقيق)' : 'Audit Reason (optional)'}
            </label>
            <input
              type="text"
              value={staffReason}
              onChange={(e) => setStaffReason(e.target.value)}
              className="w-full py-2 px-3 border border-slate-200 rounded-lg"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={staffSubmitting}
              onClick={() => setEditingStaff(null)}
            >
              {isRtl ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={staffSubmitting}>
              {isRtl ? 'تطبيق الصلاحية' : 'Update Access'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Create Teacher Account Modal (Super Admin Only) */}
      <Modal
        isOpen={isCreateTeacherOpen}
        onClose={() => {
          if (!createTeacherSubmitting) {
            resetCreateTeacherForm();
            setIsCreateTeacherOpen(false);
          }
        }}
        title={isRtl ? 'إنشاء حساب معلم جديد' : 'Create New Teacher Account'}
        subtitle={
          isRtl
            ? 'حصرياً للمشرف العام — يتم إنشاء الحساب بدور معلم (Teacher) فقط'
            : 'Super Admin only — provisions an active account strictly with role "teacher"'
        }
        maxWidth="md"
      >
        <form onSubmit={handleCreateTeacherSubmit} className="space-y-4 text-xs">
          {Boolean(createTeacherError) && (
            <ErrorState error={createTeacherError} isRtl={isRtl} variant="banner" />
          )}

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 leading-relaxed">
            {isRtl
              ? 'يُمنح الحساب الجديد صلاحية معلم (Teacher) نشطة لتسجيل الدخول عبر البريد الإلكتروني وكلمة المرور، وتُوثّق العملية تلقائياً في سجل التدقيق دون حفظ كلمة المرور.'
              : 'The account will be created with active "teacher" role for email/password login and recorded in the Super Admin audit trail (passwords are never logged).'}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                {isRtl ? 'الاسم الكامل (بالإنجليزية أو العام) *' : 'Full Name *'}
              </label>
              <input
                type="text"
                required
                minLength={2}
                maxLength={150}
                value={teacherFullName}
                onChange={(e) => setTeacherFullName(e.target.value)}
                placeholder={isRtl ? 'مثال: Ahmed Al-Qahtani' : 'e.g. Ahmed Al-Qahtani'}
                className="w-full py-2 px-3 border border-slate-200 rounded-lg"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                {isRtl ? 'الاسم بالعربية (اختياري)' : 'Arabic Full Name (optional)'}
              </label>
              <input
                type="text"
                dir="rtl"
                maxLength={150}
                value={teacherFullNameArabic}
                onChange={(e) => setTeacherFullNameArabic(e.target.value)}
                placeholder={isRtl ? 'مثال: أ. أحمد القحطاني' : 'أ. أحمد القحطاني'}
                className="w-full py-2 px-3 border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                {isRtl ? 'البريد الإلكتروني المهني *' : 'Email Address *'}
              </label>
              <input
                type="email"
                dir="ltr"
                required
                maxLength={254}
                autoComplete="off"
                value={teacherEmail}
                onChange={(e) => setTeacherEmail(e.target.value)}
                placeholder="teacher@wessam-academy.com"
                className="w-full py-2 px-3 border border-slate-200 rounded-lg"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                {isRtl ? 'رقم الجوال (اختياري)' : 'Phone Number (optional)'}
              </label>
              <input
                type="tel"
                dir="ltr"
                maxLength={30}
                value={teacherPhone}
                onChange={(e) => setTeacherPhone(e.target.value)}
                placeholder="+966 5X XXX XXXX"
                className="w-full py-2 px-3 border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                {isRtl ? 'كلمة المرور الأولية *' : 'Initial Password *'}
              </label>
              <div className="relative">
                <input
                  type={showTeacherPassword ? 'text' : 'password'}
                  dir="ltr"
                  required
                  minLength={8}
                  maxLength={128}
                  autoComplete="new-password"
                  value={teacherPassword}
                  onChange={(e) => setTeacherPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full py-2 px-3 border border-slate-200 rounded-lg pe-9"
                />
                <button
                  type="button"
                  onClick={() => setShowTeacherPassword((v) => !v)}
                  className="absolute inset-y-0 end-2 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                  aria-label={showTeacherPassword ? 'Hide password' : 'Show password'}
                >
                  {showTeacherPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {isRtl ? '8 أحرف على الأقل' : 'At least 8 characters'}
              </p>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                {isRtl ? 'تأكيد كلمة المرور *' : 'Confirm Password *'}
              </label>
              <input
                type={showTeacherPassword ? 'text' : 'password'}
                dir="ltr"
                required
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                value={teacherConfirmPassword}
                onChange={(e) => setTeacherConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full py-2 px-3 border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={createTeacherSubmitting}
              onClick={() => {
                resetCreateTeacherForm();
                setIsCreateTeacherOpen(false);
              }}
            >
              {isRtl ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={createTeacherSubmitting}
              icon={<UserPlus className="w-3.5 h-3.5" />}
            >
              {isRtl ? 'إنشاء حساب المعلم' : 'Create Teacher Account'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
