/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useLocale } from '../../hooks/useLocale';
import { useAuth } from './AuthContext';
import { BrandLogo } from '../../components/shared/BrandLogo';
import { LanguageSwitcher } from '../../components/shared/LanguageSwitcher';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import {
  ShieldCheck,
  User,
  Lock,
  Mail,
  GraduationCap,
  Sparkles,
  Clock,
  ArrowRight,
  ArrowLeft,
  Info,
} from 'lucide-react';

export const LoginScreen: React.FC = () => {
  const { t, isRtl } = useLocale();
  const { loginTeacher, loginStudent, setActiveTestRole, isLoading } = useAuth();

  const [activeTab, setActiveTab] = useState<'student' | 'teacher'>('student');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (activeTab === 'teacher') {
      if (!email || !password) {
        setFormError(isRtl ? 'يرجى كتابة البريد الإلكتروني وكلمة المرور' : 'Please provide both email and password');
        return;
      }
      setSubmitting(true);
      const res = await loginTeacher(email, password);
      setSubmitting(false);
      if (!res.success) {
        setFormError(res.error || t.auth.invalidCredentials);
      }
    } else {
      if (!username || !password) {
        setFormError(isRtl ? 'يرجى إدخال اسم المستخدم وكلمة المرور' : 'Please provide both username and password');
        return;
      }
      setSubmitting(true);
      const res = await loginStudent(username, password);
      setSubmitting(false);
      if (!res.success) {
        setFormError(res.error || t.auth.invalidCredentials);
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F6FA] flex flex-col justify-between p-4 sm:p-6 lg:p-8">
      {/* Top Header */}
      <header className="max-w-5xl w-full mx-auto flex items-center justify-between pb-4">
        <BrandLogo size="md" />
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 font-medium px-2.5 py-1 rounded-md bg-white border border-slate-200/80">
            <Clock className="w-3.5 h-3.5 text-[#356AE6]" />
            <span>{t.common.timezoneNotice}</span>
          </div>
          <LanguageSwitcher />
        </div>
      </header>

      {/* Main Content Card */}
      <main className="max-w-md w-full mx-auto my-6 bg-white border border-slate-200/90 rounded-2xl shadow-sm overflow-hidden">
        {/* Banner */}
        <div className="bg-[#14243A] p-6 text-white text-center relative overflow-hidden">
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-[#356AE6]/20 rounded-full blur-xl pointer-events-none" />
          <div className="inline-flex p-2.5 rounded-xl bg-[#356AE6]/20 border border-[#D8B96C]/30 text-[#D8B96C] mb-3">
            <GraduationCap className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold tracking-tight">{t.auth.title}</h2>
          <p className="text-xs text-slate-300 mt-1 max-w-xs mx-auto leading-relaxed">
            {t.auth.subtitle}
          </p>
        </div>

        {/* Tab Switcher (Segmented Control - functional buttons) */}
        <div className="p-4 pb-0">
          <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-lg gap-1">
            <button
              type="button"
              onClick={() => {
                setActiveTab('student');
                setFormError(null);
              }}
              className={`py-2 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'student'
                  ? 'bg-white text-[#14243A] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>{t.auth.studentLoginTab}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('teacher');
                setFormError(null);
              }}
              className={`py-2 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'teacher'
                  ? 'bg-white text-[#14243A] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-[#356AE6]" />
              <span>{t.auth.teacherLoginTab}</span>
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {formError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2">
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
              <span>{formError}</span>
            </div>
          )}

          {activeTab === 'teacher' ? (
            <Input
              type="email"
              label={t.auth.emailLabel}
              placeholder={t.auth.emailPlaceholder}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              startIcon={<Mail className="w-4 h-4" />}
              autoComplete="email"
              required
            />
          ) : (
            <Input
              type="text"
              label={t.auth.usernameLabel}
              placeholder={t.auth.usernamePlaceholder}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              startIcon={<User className="w-4 h-4" />}
              autoComplete="username"
              required
            />
          )}

          <Input
            type="password"
            label={t.auth.passwordLabel}
            placeholder={t.auth.passwordPlaceholder}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            startIcon={<Lock className="w-4 h-4" />}
            autoComplete="current-password"
            required
          />

          <div className="pt-2">
            <Button
              type="submit"
              variant="primary"
              size="md"
              className="w-full font-semibold"
              isLoading={submitting || isLoading}
              icon={isRtl ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
            >
              {submitting ? t.auth.signingIn : t.auth.signInButton}
            </Button>
          </div>

          <div className="pt-2 text-center">
            <p className="text-[11px] text-slate-500 leading-normal">
              {activeTab === 'student' ? t.auth.studentNotice : t.auth.teacherNotice}
            </p>
          </div>

          {/* Quick Preview Entry for Phase 1 Inspection */}
          {setActiveTestRole && (
            <div className="pt-4 border-t border-slate-100 flex flex-col gap-2">
              <span className="text-[10px] text-slate-400 font-medium text-center uppercase tracking-wider">
                {isRtl ? 'معاينة الواجهات الأكاديمية (Phase 1 Inspection)' : 'Phase 1 Portal Preview'}
              </span>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveTestRole('teacher')}
                  className="text-xs"
                >
                  {isRtl ? 'دخول تجريبي كمعلم' : 'Demo Teacher'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveTestRole('student')}
                  className="text-xs"
                >
                  {isRtl ? 'دخول تجريبي كطالب' : 'Demo Student'}
                </Button>
              </div>
            </div>
          )}
        </form>
      </main>

      {/* Footer */}
      <footer className="max-w-5xl w-full mx-auto text-center text-xs text-slate-400 py-3">
        <p>
          WESSAM Academy · {t.common.brandName} · {t.common.teacherName} · {t.common.saudiArabia}
        </p>
      </footer>
    </div>
  );
};
