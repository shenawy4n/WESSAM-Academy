/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useLocale } from '../../hooks/useLocale';
import { useAuth } from './AuthContext';
import { Card, CardContent, CardHeader } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { formatRiyadhDateTime } from '../../lib/dateUtils';
import {
  BadgeCheck,
  Calendar,
  GraduationCap,
  Hash,
  Mail,
  Phone,
  ShieldCheck,
  User as UserIcon,
  Users,
} from 'lucide-react';

export const StudentProfileView: React.FC = () => {
  const { isRtl, lang } = useLocale();
  const { user, studentProfile } = useAuth();

  if (!user) {
    return (
      <EmptyState
        icon={<UserIcon className="w-6 h-6 text-slate-400" />}
        title={isRtl ? 'تعذر عرض الملف الشخصي' : 'Profile unavailable'}
        description={
          isRtl
            ? 'يرجى تسجيل الدخول لعرض بياناتك الأكاديمية.'
            : 'Please sign in to view your academic profile.'
        }
      />
    );
  }

  const displayName = isRtl
    ? user.fullNameArabic || user.fullName
    : user.fullName || user.fullNameArabic;
  const secondaryName = isRtl ? user.fullName : user.fullNameArabic;
  const enrolledFormatted = studentProfile?.enrolledAt
    ? formatRiyadhDateTime(studentProfile.enrolledAt, {
        locale: lang,
        includeDate: true,
        includeTime: false,
      })
    : '—';

  const statusLabel =
    user.status === 'active'
      ? isRtl
        ? 'نشط'
        : 'Active'
      : user.status === 'suspended'
      ? isRtl
        ? 'موقوف'
        : 'Suspended'
      : isRtl
      ? 'غير نشط'
      : 'Inactive';

  return (
    <div className="space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Header Banner */}
      <div className="bg-[#14243A] rounded-2xl p-6 sm:p-8 text-white relative overflow-hidden shadow-xs">
        <div className="absolute top-0 end-0 -mt-10 -me-10 w-52 h-52 bg-[#D8B96C]/15 rounded-full blur-2xl pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center text-[#D8B96C] shrink-0">
              <GraduationCap className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-[#D8B96C]">
                <span>{isRtl ? 'الملف الأكاديمي للطالب' : 'Student Academic Profile'}</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight mt-0.5">
                {displayName || '—'}
              </h2>
              {secondaryName && secondaryName !== displayName && (
                <p className="text-xs text-slate-300 mt-0.5">{secondaryName}</p>
              )}
            </div>
          </div>

          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold self-start sm:self-center ${
              user.status === 'active'
                ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/30'
                : 'bg-amber-500/20 text-amber-200 border border-amber-400/30'
            }`}
          >
            <BadgeCheck className="w-3.5 h-3.5" />
            {statusLabel}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Academic Registration Card */}
        <Card>
          <CardHeader
            title={isRtl ? 'البيانات الأكاديمية المسجلة' : 'Academic Registration Details'}
            subtitle={isRtl ? 'بيانات القيد المعتمدة لدى الإدارة' : 'Official academy enrollment metadata'}
          />
          <CardContent className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                  <Hash className="w-3.5 h-3.5 text-[#356AE6]" />
                  <span>{isRtl ? 'الرقم الأكاديمي' : 'Student Number'}</span>
                </div>
                <div className="font-mono font-bold text-[#14243A] tabular-nums">
                  {studentProfile?.studentNumber || '—'}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                  <UserIcon className="w-3.5 h-3.5 text-[#356AE6]" />
                  <span>{isRtl ? 'اسم المستخدم للدخول' : 'Login Username'}</span>
                </div>
                <div className="font-mono font-bold text-[#14243A]">
                  {studentProfile?.username ? `@${studentProfile.username}` : '—'}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                  <Users className="w-3.5 h-3.5 text-[#356AE6]" />
                  <span>{isRtl ? 'المجموعة الدراسية الأساسية' : 'Primary Study Group'}</span>
                </div>
                <div className="font-semibold text-[#14243A]">
                  {studentProfile?.groupName || (isRtl ? 'غير مسند لمجموعة بعد' : 'Not assigned yet')}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                  <Calendar className="w-3.5 h-3.5 text-[#356AE6]" />
                  <span>{isRtl ? 'تاريخ الالتحاق (الرياض)' : 'Enrolled Date (Riyadh)'}</span>
                </div>
                <div className="font-semibold text-[#14243A] tabular-nums">{enrolledFormatted}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Contact & Account Governance Card */}
        <Card>
          <CardHeader
            title={isRtl ? 'بيانات الاتصال وحوكمة الحساب' : 'Contact & Account Governance'}
            subtitle={isRtl ? 'المعلومات المسجلة لدى أكاديمية الوسام' : 'Information registered with WESSAM Academy'}
          />
          <CardContent className="space-y-4 text-xs">
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-2 text-slate-600">
                  <Mail className="w-4 h-4 text-[#356AE6]" />
                  <span>{isRtl ? 'البريد الإلكتروني' : 'Email'}</span>
                </div>
                <span className="font-mono text-[#14243A]">{user.email || '—'}</span>
              </div>

              <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-2 text-slate-600">
                  <Phone className="w-4 h-4 text-[#356AE6]" />
                  <span>{isRtl ? 'رقم الجوال' : 'Phone Number'}</span>
                </div>
                <span className="font-mono text-[#14243A] tabular-nums">{user.phone || '—'}</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-100 flex items-start gap-2.5 text-slate-700 leading-relaxed">
              <ShieldCheck className="w-4 h-4 text-[#356AE6] shrink-0 mt-0.5" />
              <p>
                {isRtl
                  ? 'تُدار بيانات القيد، المجموعة الدراسية، وإعادة تعيين كلمة المرور حصرياً عبر إدارة أكاديمية الوسام حفاظاً على أمان حسابك.'
                  : 'Enrollment records, cohort placement, and password resets are managed exclusively by WESSAM Academy administration for account security.'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
