/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useLocale } from '../../hooks/useLocale';
import { useAuth } from './AuthContext';
import { BrandLogo } from '../../components/shared/BrandLogo';
import { LanguageSwitcher } from '../../components/shared/LanguageSwitcher';
import { Button } from '../../components/ui/Button';
import { ShieldAlert, ArrowLeft, ArrowRight, Home } from 'lucide-react';

export const UnauthorizedScreen: React.FC<{ onReturn: () => void }> = ({ onReturn }) => {
  const { t, isRtl } = useLocale();
  const { logout } = useAuth();

  return (
    <div className="min-h-screen bg-[#F4F6FA] flex flex-col justify-between p-4 sm:p-6 lg:p-8">
      {/* Top Header */}
      <header className="max-w-4xl w-full mx-auto flex items-center justify-between pb-6 border-b border-slate-200">
        <BrandLogo size="md" />
        <LanguageSwitcher />
      </header>

      {/* Main Container */}
      <main className="max-w-md w-full mx-auto my-auto bg-white border border-slate-200 rounded-2xl shadow-sm p-6 sm:p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200/80 text-rose-600 flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="w-7 h-7" />
        </div>

        <h2 className="text-lg font-bold text-[#14243A] mb-1">
          {t.auth.unauthorizedTitle}
        </h2>
        <p className="text-xs text-slate-500 mb-6 leading-relaxed max-w-xs mx-auto">
          {t.auth.unauthorizedMessage}
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button
            variant="primary"
            onClick={onReturn}
            icon={<Home className="w-4 h-4" />}
          >
            {isRtl ? 'العودة للرئيسية' : 'Return to Portal'}
          </Button>

          <Button
            variant="outline"
            onClick={() => logout()}
          >
            {t.auth.returnToLogin}
          </Button>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-4xl w-full mx-auto text-center text-xs text-slate-400 pt-4">
        <p>WESSAM Academy · {t.common.brandName} · {t.common.saudiArabia}</p>
      </footer>
    </div>
  );
};
