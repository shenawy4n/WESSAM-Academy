/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useLocale } from '../../hooks/useLocale';
import { GraduationCap } from 'lucide-react';

export const BrandLogo: React.FC<{
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
  inverted?: boolean;
}> = ({ size = 'md', showSubtitle = true, inverted = false }) => {
  const { isRtl } = useLocale();

  const iconSizes = {
    sm: 'w-7 h-7 text-xs',
    md: 'w-9 h-9 text-sm',
    lg: 'w-12 h-12 text-base',
  }[size];

  const titleSizes = {
    sm: 'text-sm font-bold',
    md: 'text-base font-bold',
    lg: 'text-xl font-extrabold',
  }[size];

  return (
    <div className="flex items-center gap-3">
      {/* Insignia / Crest */}
      <div
        className={`${iconSizes} rounded-xl bg-gradient-to-br from-[#14243A] to-[#1E3A5F] border border-[#D8B96C]/40 flex items-center justify-center text-[#D8B96C] shadow-xs shrink-0`}
      >
        <GraduationCap className="w-5 h-5" />
      </div>

      <div className="flex flex-col text-start">
        <div className={`tracking-tight ${titleSizes} ${inverted ? 'text-white' : 'text-[#14243A]'}`}>
          {isRtl ? 'أكاديمية الوسام التعليمية' : 'WESSAM Academy'}
        </div>
        {showSubtitle && (
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
            <span className={inverted ? 'text-slate-300' : 'text-slate-500'}>
              {isRtl ? 'WESSAM Academy' : 'أكاديمية الوسام التعليمية'}
            </span>
            <span className="text-[#D8B96C]" aria-hidden="true">·</span>
            <span className={`text-[10px] ${inverted ? 'text-slate-400' : 'text-slate-400'}`}>
              {isRtl ? 'أ. وسام دراز' : 'Mr. Wessam Draz'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
