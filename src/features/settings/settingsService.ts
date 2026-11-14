/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  requireSupabaseClient,
  requireAuthenticatedUser,
  throwServiceError,
  ServiceError,
} from '../../lib/errors/serviceError';

const SERVICE = 'settingsService';

export type SettingKey =
  | 'academy_info'
  | 'academic_settings'
  | 'notification_settings'
  | 'access_policies'
  | 'appearance_language'
  | 'platform_options';

export interface AcademyInfoSetting {
  academy_name_ar: string;
  academy_name_en: string;
  description_ar: string;
  description_en: string;
  owner_name_ar: string;
  owner_name_en: string;
  contact_email: string;
  contact_phone: string;
  logo_url: string;
  timezone: 'Asia/Riyadh';
  default_language: 'ar' | 'en';
}

export interface GradingScaleBand {
  label_ar: string;
  label_en: string;
  min_pct: number;
}

export interface AcademicSettingsValue {
  current_academic_year: string;
  academic_term: 'first' | 'second' | 'summer' | string;
  default_passing_score: number;
  attention_threshold_score: number;
  attention_attendance_threshold: number;
  default_quiz_max_attempts: number;
  default_allow_late_submissions: boolean;
  grading_scale: GradingScaleBand[];
}

export interface NotificationSettingsValue {
  in_app_notifications_enabled: boolean;
  allow_teacher_announcements: boolean;
  allow_scheduled_announcements: boolean;
  default_announcement_priority: 'normal' | 'important' | 'urgent';
  notify_on_grade_release: boolean;
}

export interface AccessPoliciesValue {
  enforce_active_student_isolation: boolean;
  allow_teacher_student_registration: boolean;
  require_super_admin_for_settings: boolean;
  session_review_audit_enabled: boolean;
}

export interface AppearanceLanguageValue {
  default_language: 'ar' | 'en';
  force_rtl_for_arabic: boolean;
  primary_brand_color: string;
  accent_brand_color: string;
  compact_tables: boolean;
}

export interface PlatformOptionsValue {
  live_session_default_provider: 'zoom' | 'google_meet' | 'custom' | 'teams';
  live_session_default_duration_minutes: number;
  max_upload_size_mb: number;
  maintenance_banner_enabled: boolean;
  maintenance_banner_ar: string;
  maintenance_banner_en: string;
}

export interface SystemSettingsBundle {
  academy_info: AcademyInfoSetting;
  academic_settings: AcademicSettingsValue;
  notification_settings: NotificationSettingsValue;
  access_policies: AccessPoliciesValue;
  appearance_language: AppearanceLanguageValue;
  platform_options: PlatformOptionsValue;
  updatedAtByKey: Partial<Record<SettingKey, string>>;
}

export interface StaffAccountRecord {
  id: string;
  fullName: string;
  fullNameArabic: string;
  role: 'super_admin' | 'teacher';
  status: 'active' | 'inactive' | 'suspended';
  phone: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StaffGovernanceDirectory {
  staffAccounts: StaffAccountRecord[];
  roleCounts: {
    activeSuperAdmins: number;
    activeTeachers: number;
    activeStudents: number;
    inactiveOrSuspendedStudents: number;
  };
}

export interface SettingsAuditLogEntry {
  id: string;
  actorId: string | null;
  actorName: string;
  actorNameArabic: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  oldData: Record<string, any> | null;
  newData: Record<string, any> | null;
  createdAt: string;
}

export const DEFAULT_SYSTEM_SETTINGS: SystemSettingsBundle = {
  academy_info: {
    academy_name_ar: 'أكاديمية الوسام التعليمية',
    academy_name_en: 'WESSAM Academy',
    description_ar: 'منصة متكاملة لتعليم اللغة الإنجليزية للطلاب في المملكة العربية السعودية',
    description_en: 'Comprehensive online English-learning platform for Saudi students',
    owner_name_ar: 'أ. وسام إبراهيم دراز',
    owner_name_en: 'Mr. Wessam Ibrahim Draz',
    contact_email: '',
    contact_phone: '',
    logo_url: '',
    timezone: 'Asia/Riyadh',
    default_language: 'ar',
  },
  academic_settings: {
    current_academic_year: '2026/2027',
    academic_term: 'first',
    default_passing_score: 60,
    attention_threshold_score: 60,
    attention_attendance_threshold: 75,
    default_quiz_max_attempts: 1,
    default_allow_late_submissions: true,
    grading_scale: [
      { label_ar: 'ممتاز', label_en: 'Excellent', min_pct: 90 },
      { label_ar: 'جيد جداً', label_en: 'Very Good', min_pct: 75 },
      { label_ar: 'جيد', label_en: 'Good', min_pct: 60 },
      { label_ar: 'يحتاج متابعة', label_en: 'Needs Attention', min_pct: 0 },
    ],
  },
  notification_settings: {
    in_app_notifications_enabled: true,
    allow_teacher_announcements: true,
    allow_scheduled_announcements: true,
    default_announcement_priority: 'normal',
    notify_on_grade_release: true,
  },
  access_policies: {
    enforce_active_student_isolation: true,
    allow_teacher_student_registration: true,
    require_super_admin_for_settings: true,
    session_review_audit_enabled: true,
  },
  appearance_language: {
    default_language: 'ar',
    force_rtl_for_arabic: true,
    primary_brand_color: '#14243A',
    accent_brand_color: '#356AE6',
    compact_tables: false,
  },
  platform_options: {
    live_session_default_provider: 'zoom',
    live_session_default_duration_minutes: 60,
    max_upload_size_mb: 50,
    maintenance_banner_enabled: false,
    maintenance_banner_ar: '',
    maintenance_banner_en: '',
  },
  updatedAtByKey: {},
};

const FORBIDDEN_SECRET_KEY_REGEX = /(secret|password|passphrase|private_key|api_key|apikey|service_role|anon_key|access_token|refresh_token|bearer)/i;
const FORBIDDEN_SECRET_VALUE_REGEX = /(sk_live_|sk_test_|eyJhbGciOiJIUz|-----BEGIN (RSA |EC |)PRIVATE KEY)/i;

/**
 * Pure validator rejecting secret/credential keys or values before RPC submission.
 */
export function containsForbiddenSecretPayload(payload: unknown): boolean {
  if (payload === null || payload === undefined) return false;
  if (typeof payload === 'string') {
    return FORBIDDEN_SECRET_VALUE_REGEX.test(payload);
  }
  if (Array.isArray(payload)) {
    return payload.some((item) => containsForbiddenSecretPayload(item));
  }
  if (typeof payload === 'object') {
    for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
      if (FORBIDDEN_SECRET_KEY_REGEX.test(k)) return true;
      if (containsForbiddenSecretPayload(v)) return true;
    }
  }
  return false;
}

/**
 * Pure domain validator for a setting payload. Returns localized error key or null if valid.
 */
export function validateSettingPayload(
  key: SettingKey,
  value: Record<string, any>
): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return 'Settings payload must be an object.';
  }
  if (containsForbiddenSecretPayload(value)) {
    return 'Secret keys, tokens, or passwords cannot be stored in system settings.';
  }

  if (key === 'academy_info') {
    if (!String(value.academy_name_ar || '').trim() || !String(value.academy_name_en || '').trim()) {
      return 'Arabic and English academy names are required.';
    }
    if (value.timezone !== 'Asia/Riyadh') {
      return 'Academic timezone must remain Asia/Riyadh.';
    }
    if (value.logo_url && !/^https?:\/\/|^\/|^$/i.test(String(value.logo_url).trim())) {
      return 'Logo URL must be a valid HTTP(S) URL or relative path.';
    }
  }

  if (key === 'academic_settings') {
    if (!String(value.current_academic_year || '').trim()) {
      return 'Academic year is required.';
    }
    const nums = [
      value.default_passing_score,
      value.attention_threshold_score,
      value.attention_attendance_threshold,
    ];
    for (const n of nums) {
      if (typeof n !== 'number' || Number.isNaN(n) || n < 0 || n > 100) {
        return 'Thresholds must be numbers between 0 and 100.';
      }
    }
  }

  if (key === 'platform_options') {
    const dur = Number(value.live_session_default_duration_minutes);
    if (!Number.isFinite(dur) || dur < 10 || dur > 480) {
      return 'Default live session duration must be between 10 and 480 minutes.';
    }
  }

  return null;
}

/**
 * Pure guard matching server-side protection for the last active Super Admin.
 */
export function canModifyStaffRoleOrStatus(
  directory: StaffGovernanceDirectory,
  targetUserId: string,
  newRole: 'super_admin' | 'teacher',
  newStatus: 'active' | 'inactive' | 'suspended'
): { allowed: boolean; reason?: string } {
  const target = directory.staffAccounts.find((a) => a.id === targetUserId);
  if (!target) {
    return { allowed: false, reason: 'Target staff account not found.' };
  }
  const wasActiveSuper = target.role === 'super_admin' && target.status === 'active';
  const willStillBeActiveSuper = newRole === 'super_admin' && newStatus === 'active';

  if (wasActiveSuper && !willStillBeActiveSuper && directory.roleCounts.activeSuperAdmins <= 1) {
    return {
      allowed: false,
      reason: 'Cannot demote or deactivate the last active Super Admin.',
    };
  }
  return { allowed: true };
}

export async function fetchSystemSettingsBundle(): Promise<SystemSettingsBundle> {
  const client = requireSupabaseClient({
    service: SERVICE,
    operation: 'fetchSystemSettingsBundle',
  });
  await requireAuthenticatedUser(client, {
    service: SERVICE,
    operation: 'fetchSystemSettingsBundle',
  });

  let res;
  try {
    res = await client.rpc('get_system_settings_bundle');
  } catch (err) {
    throwServiceError(err, {
      service: SERVICE,
      operation: 'fetchSystemSettingsBundle',
    });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'fetchSystemSettingsBundle',
      fallbackMessage: 'Failed to load system settings. Ensure migration 20261114000021 is applied.',
    });
  }

  const raw = res.data || {};
  const updatedAtByKey: Partial<Record<SettingKey, string>> = {};
  for (const k of Object.keys(raw) as SettingKey[]) {
    if (raw[k]?.updated_at) {
      updatedAtByKey[k] = raw[k].updated_at;
    }
  }

  return {
    academy_info: { ...DEFAULT_SYSTEM_SETTINGS.academy_info, ...(raw.academy_info?.value || {}) },
    academic_settings: { ...DEFAULT_SYSTEM_SETTINGS.academic_settings, ...(raw.academic_settings?.value || {}) },
    notification_settings: {
      ...DEFAULT_SYSTEM_SETTINGS.notification_settings,
      ...(raw.notification_settings?.value || {}),
    },
    access_policies: { ...DEFAULT_SYSTEM_SETTINGS.access_policies, ...(raw.access_policies?.value || {}) },
    appearance_language: {
      ...DEFAULT_SYSTEM_SETTINGS.appearance_language,
      ...(raw.appearance_language?.value || {}),
    },
    platform_options: { ...DEFAULT_SYSTEM_SETTINGS.platform_options, ...(raw.platform_options?.value || {}) },
    updatedAtByKey,
  };
}

export async function fetchPublicAcademyConfig(): Promise<{
  academy_info?: Partial<AcademyInfoSetting>;
  appearance_language?: Partial<AppearanceLanguageValue>;
}> {
  const client = requireSupabaseClient({
    service: SERVICE,
    operation: 'fetchPublicAcademyConfig',
  });
  const res = await client.rpc('get_academy_public_config');
  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'fetchPublicAcademyConfig',
    });
  }
  return (res.data || {}) as any;
}

export async function updateSystemSetting<K extends SettingKey>(
  key: K,
  value: SystemSettingsBundle[K]
): Promise<{ key: K; value: SystemSettingsBundle[K]; updatedAt: string }> {
  const validationError = validateSettingPayload(key, value as Record<string, any>);
  if (validationError) {
    throw new ServiceError({
      category: 'VALIDATION_ERROR',
      message: validationError,
      service: SERVICE,
      operation: 'updateSystemSetting',
    });
  }

  const client = requireSupabaseClient({
    service: SERVICE,
    operation: 'updateSystemSetting',
  });
  await requireAuthenticatedUser(client, {
    service: SERVICE,
    operation: 'updateSystemSetting',
  });

  let res;
  try {
    res = await client.rpc('update_system_setting', {
      p_key: key,
      p_value: value,
    });
  } catch (err) {
    throwServiceError(err, {
      service: SERVICE,
      operation: 'updateSystemSetting',
    });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'updateSystemSetting',
      fallbackMessage: 'Failed to persist system setting.',
    });
  }

  return {
    key,
    value: (res.data?.value || value) as SystemSettingsBundle[K],
    updatedAt: res.data?.updated_at || new Date().toISOString(),
  };
}

export async function fetchStaffAccessDirectory(): Promise<StaffGovernanceDirectory> {
  const client = requireSupabaseClient({
    service: SERVICE,
    operation: 'fetchStaffAccessDirectory',
  });
  await requireAuthenticatedUser(client, {
    service: SERVICE,
    operation: 'fetchStaffAccessDirectory',
  });

  let res;
  try {
    res = await client.rpc('list_staff_and_access_accounts');
  } catch (err) {
    throwServiceError(err, {
      service: SERVICE,
      operation: 'fetchStaffAccessDirectory',
    });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'fetchStaffAccessDirectory',
      fallbackMessage: 'Failed to load staff access governance directory.',
    });
  }

  const data = res.data || {};
  const counts = data.role_counts || {};

  return {
    staffAccounts: Array.isArray(data.staff_accounts)
      ? data.staff_accounts.map((a: any) => ({
          id: a.id,
          fullName: a.full_name,
          fullNameArabic: a.full_name_arabic || a.full_name,
          role: a.role,
          status: a.status,
          phone: a.phone || null,
          createdAt: a.created_at,
          updatedAt: a.updated_at,
        }))
      : [],
    roleCounts: {
      activeSuperAdmins: Number(counts.active_super_admins ?? 0),
      activeTeachers: Number(counts.active_teachers ?? 0),
      activeStudents: Number(counts.active_students ?? 0),
      inactiveOrSuspendedStudents: Number(counts.inactive_or_suspended_students ?? 0),
    },
  };
}

export async function updateStaffAccountAccess(params: {
  targetUserId: string;
  newRole: 'super_admin' | 'teacher';
  newStatus: 'active' | 'inactive' | 'suspended';
  reason?: string;
}): Promise<void> {
  const client = requireSupabaseClient({
    service: SERVICE,
    operation: 'updateStaffAccountAccess',
  });
  await requireAuthenticatedUser(client, {
    service: SERVICE,
    operation: 'updateStaffAccountAccess',
  });

  let res;
  try {
    res = await client.rpc('update_staff_account_access', {
      p_target_user_id: params.targetUserId,
      p_new_role: params.newRole,
      p_new_status: params.newStatus,
      p_reason: params.reason || null,
    });
  } catch (err) {
    throwServiceError(err, {
      service: SERVICE,
      operation: 'updateStaffAccountAccess',
    });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'updateStaffAccountAccess',
      fallbackMessage: 'Failed to update staff account access.',
    });
  }
}

export async function fetchSettingsAuditLogs(limit = 30, offset = 0): Promise<SettingsAuditLogEntry[]> {
  const client = requireSupabaseClient({
    service: SERVICE,
    operation: 'fetchSettingsAuditLogs',
  });
  await requireAuthenticatedUser(client, {
    service: SERVICE,
    operation: 'fetchSettingsAuditLogs',
  });

  let res;
  try {
    res = await client.rpc('get_system_settings_audit_logs', {
      p_limit: limit,
      p_offset: offset,
    });
  } catch (err) {
    throwServiceError(err, {
      service: SERVICE,
      operation: 'fetchSettingsAuditLogs',
    });
  }

  if (res.error) {
    throwServiceError(res.error, {
      service: SERVICE,
      operation: 'fetchSettingsAuditLogs',
      fallbackMessage: 'Failed to load settings audit trail.',
    });
  }

  const rows = Array.isArray(res.data) ? res.data : [];
  return rows.map((r: any) => ({
    id: r.id,
    actorId: r.actor_id || null,
    actorName: r.actor_name || 'System',
    actorNameArabic: r.actor_name_arabic || r.actor_name || 'النظام',
    actorRole: r.actor_role || 'system',
    action: r.action,
    entityType: r.entity_type,
    entityId: r.entity_id,
    oldData: r.old_data || null,
    newData: r.new_data || null,
    createdAt: r.created_at,
  }));
}
