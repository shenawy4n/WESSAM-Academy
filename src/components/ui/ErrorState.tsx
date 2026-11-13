/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  AlertTriangle,
  DatabaseZap,
  Lock,
  RefreshCw,
  Settings,
  ShieldAlert,
  WifiOff,
  X,
} from 'lucide-react';
import { Button } from './Button';
import { formatServiceErrorForUi, ServiceErrorCategory } from '../../lib/errors/serviceError';

export interface ErrorStateProps {
  error: unknown;
  isRtl?: boolean;
  onRetry?: () => void;
  onDismiss?: () => void;
  variant?: 'card' | 'banner';
  fallbackMessage?: string;
  className?: string;
}

function getCategoryStyles(category: ServiceErrorCategory) {
  switch (category) {
    case 'CONFIGURATION_ERROR':
      return {
        icon: Settings,
        bg: 'bg-amber-50/70',
        border: 'border-amber-200',
        iconBg: 'bg-amber-100 text-amber-700 border-amber-200',
        textColor: 'text-amber-900',
        subtextColor: 'text-amber-800',
      };
    case 'AUTHENTICATION_ERROR':
      return {
        icon: Lock,
        bg: 'bg-amber-50/70',
        border: 'border-amber-200',
        iconBg: 'bg-amber-100 text-amber-700 border-amber-200',
        textColor: 'text-amber-900',
        subtextColor: 'text-amber-800',
      };
    case 'AUTHORIZATION_ERROR':
      return {
        icon: ShieldAlert,
        bg: 'bg-rose-50/70',
        border: 'border-rose-200',
        iconBg: 'bg-rose-100 text-rose-700 border-rose-200',
        textColor: 'text-rose-900',
        subtextColor: 'text-rose-800',
      };
    case 'NETWORK_ERROR':
      return {
        icon: WifiOff,
        bg: 'bg-slate-50',
        border: 'border-slate-300',
        iconBg: 'bg-slate-100 text-slate-700 border-slate-200',
        textColor: 'text-slate-900',
        subtextColor: 'text-slate-700',
      };
    case 'SCHEMA_ERROR':
    case 'DATABASE_ERROR':
      return {
        icon: DatabaseZap,
        bg: 'bg-rose-50/60',
        border: 'border-rose-200',
        iconBg: 'bg-rose-100 text-rose-700 border-rose-200',
        textColor: 'text-rose-900',
        subtextColor: 'text-rose-800',
      };
    default:
      return {
        icon: AlertTriangle,
        bg: 'bg-rose-50/60',
        border: 'border-rose-200',
        iconBg: 'bg-rose-100 text-rose-700 border-rose-200',
        textColor: 'text-rose-900',
        subtextColor: 'text-rose-800',
      };
  }
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  error,
  isRtl = true,
  onRetry,
  onDismiss,
  variant = 'card',
  fallbackMessage,
  className = '',
}) => {
  const formatted = formatServiceErrorForUi(error, isRtl, fallbackMessage);
  const style = getCategoryStyles(formatted.category);
  const Icon = style.icon;

  if (variant === 'banner') {
    return (
      <div
        role="alert"
        className={`flex items-start justify-between gap-3 p-3.5 rounded-xl border ${style.bg} ${style.border} ${className}`}
      >
        <div className="flex items-start gap-2.5 min-w-0">
          <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${style.iconBg}`}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h4 className={`text-xs font-bold ${style.textColor}`}>{formatted.title}</h4>
            <p className={`text-xs mt-0.5 leading-relaxed ${style.subtextColor}`}>{formatted.message}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {onRetry && formatted.canRetry && (
            <Button variant="outline" size="sm" onClick={onRetry} icon={<RefreshCw className="w-3.5 h-3.5" />}>
              {isRtl ? 'إعادة المحاولة' : 'Retry'}
            </Button>
          )}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label={isRtl ? 'إغلاق' : 'Dismiss'}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-white/70 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center text-center p-8 sm:p-10 rounded-xl border ${style.bg} ${style.border} ${className}`}
    >
      <div className={`w-12 h-12 rounded-xl border shadow-2xs flex items-center justify-center mb-4 ${style.iconBg}`}>
        <Icon className="w-5 h-5" />
      </div>
      <h4 className={`text-sm font-bold ${style.textColor}`}>{formatted.title}</h4>
      <p className={`text-xs max-w-md mt-1.5 mb-5 leading-relaxed ${style.subtextColor}`}>
        {formatted.message}
      </p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} icon={<RefreshCw className="w-3.5 h-3.5" />}>
          {isRtl ? 'إعادة المحاولة' : 'Retry'}
        </Button>
      )}
    </div>
  );
};
