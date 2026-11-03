/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'gold';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  icon,
  className = '',
  disabled,
  ...props
}) => {
  const baseClasses =
    'inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed select-none cursor-pointer';

  const sizeClasses = {
    sm: 'text-xs px-3 py-1.5 rounded-md gap-1.5 h-8',
    md: 'text-sm px-4 py-2 rounded-lg gap-2 h-10',
    lg: 'text-base px-6 py-2.5 rounded-lg gap-2.5 h-12',
  }[size];

  const variantClasses = {
    primary:
      'bg-[#356AE6] text-white hover:bg-[#2756C5] active:bg-[#1E48A8] focus-visible:ring-[#356AE6] shadow-sm',
    secondary:
      'bg-[#14243A] text-white hover:bg-[#1d324f] active:bg-[#0c1827] focus-visible:ring-[#14243A] shadow-sm',
    outline:
      'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 focus-visible:ring-[#356AE6]',
    ghost:
      'text-slate-700 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-slate-400',
    gold:
      'bg-[#D8B96C] text-[#14243A] font-semibold hover:bg-[#C4A456] active:bg-[#B39345] focus-visible:ring-[#D8B96C] shadow-sm',
  }[variant];

  return (
    <button
      className={`${baseClasses} ${sizeClasses} ${variantClasses} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : icon ? <span className="shrink-0">{icon}</span> : null}
      <span>{children}</span>
    </button>
  );
};
