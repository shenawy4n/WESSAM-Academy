/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useLocale } from '../../hooks/useLocale';
import { Globe } from 'lucide-react';

export const LanguageSwitcher: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { lang, toggleLang } = useLocale();

  return (
    <button
      type="button"
      onClick={toggleLang}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#356AE6] ${
        compact ? 'px-2 py-1' : ''
      }`}
      title={lang === 'ar' ? 'Switch to English' : 'التحويل إلى العربية'}
      aria-label="Toggle language"
    >
      <Globe className="w-3.5 h-3.5 text-slate-500" />
      <span>{lang === 'ar' ? 'English' : 'العربية'}</span>
    </button>
  );
};
