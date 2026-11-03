/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useLocale } from '../../hooks/useLocale';
import { getMissingSupabaseEnv } from '../../lib/supabase/client';
import { BrandLogo } from '../../components/shared/BrandLogo';
import { LanguageSwitcher } from '../../components/shared/LanguageSwitcher';
import { Button } from '../../components/ui/Button';
import { Database, AlertTriangle, Key, ExternalLink, ArrowRight, ArrowLeft } from 'lucide-react';

interface ConfigErrorScreenProps {
  onBypassToPreview?: () => void;
}

export const ConfigErrorScreen: React.FC<ConfigErrorScreenProps> = ({ onBypassToPreview }) => {
  const { t, isRtl } = useLocale();
  const missing = getMissingSupabaseEnv();

  return (
    <div className="min-h-screen bg-[#F4F6FA] flex flex-col justify-between p-4 sm:p-6 lg:p-8">
      {/* Top Bar */}
      <header className="max-w-4xl w-full mx-auto flex items-center justify-between pb-6 border-b border-slate-200">
        <BrandLogo size="md" />
        <LanguageSwitcher />
      </header>

      {/* Main Container */}
      <main className="max-w-2xl w-full mx-auto my-8 bg-white border border-slate-200 rounded-2xl shadow-sm p-6 sm:p-8">
        <div className="flex items-center gap-3 text-amber-600 mb-4">
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#14243A]">{t.configError.title}</h2>
            <p className="text-xs text-slate-500">{t.configError.subtitle}</p>
          </div>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed mb-6">
          {t.configError.explanation}
        </p>

        {/* Missing Variables List */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6 text-start">
          <h4 className="text-xs font-bold text-[#14243A] uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Key className="w-3.5 h-3.5 text-[#356AE6]" />
            <span>{t.configError.envVarsNeeded}</span>
          </h4>
          <ul className="space-y-2">
            {missing.map((envVar) => (
              <li
                key={envVar}
                className="flex items-center justify-between text-xs font-mono bg-white p-2 rounded-lg border border-slate-200"
              >
                <span className="text-rose-600 font-semibold">{envVar}</span>
                <span className="text-[11px] text-slate-400 font-sans">{isRtl ? 'غير متوفر' : 'Missing'}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Setup Steps */}
        <div className="space-y-3 mb-6 text-start text-xs">
          <div className="p-3 rounded-lg border border-slate-100 bg-white">
            <div className="font-semibold text-slate-800">{t.configError.step1Title}</div>
            <div className="text-slate-500 mt-0.5">{t.configError.step1Desc}</div>
          </div>
          <div className="p-3 rounded-lg border border-slate-100 bg-white">
            <div className="font-semibold text-slate-800">{t.configError.step2Title}</div>
            <div className="text-slate-500 mt-0.5">{t.configError.step2Desc}</div>
          </div>
          <div className="p-3 rounded-lg border border-slate-100 bg-white">
            <div className="font-semibold text-slate-800">{t.configError.step3Title}</div>
            <div className="text-slate-500 mt-0.5">{t.configError.step3Desc}</div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-4 border-t border-slate-100">
          <Button
            variant="primary"
            onClick={() => window.location.reload()}
            className="w-full sm:w-auto"
            icon={<Database className="w-4 h-4" />}
          >
            {t.configError.retryButton}
          </Button>

          {onBypassToPreview && (
            <Button
              variant="outline"
              onClick={onBypassToPreview}
              className="w-full sm:w-auto text-[#14243A]"
              icon={isRtl ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
            >
              {isRtl ? 'معاينة واجهات المنصة التفاعلية (Phase 1)' : 'Inspect Phase 1 Interactive Shell'}
            </Button>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-4xl w-full mx-auto text-center text-xs text-slate-400 pt-4">
        <p>
          WESSAM Academy (أكاديمية الوسام التعليمية) · {t.common.teacherName} · {t.common.saudiArabia}
        </p>
      </footer>
    </div>
  );
};
