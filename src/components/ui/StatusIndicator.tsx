/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

export interface StatusIndicatorProps {
  status: 'active' | 'inactive' | 'suspended' | 'scheduled' | 'in_progress' | 'completed' | 'pending';
  label?: string;
  className?: string;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({ status, label, className = '' }) => {
  const config = {
    active: { dot: 'bg-emerald-500', text: 'text-emerald-700', defaultLabel: 'Active' },
    inactive: { dot: 'bg-slate-400', text: 'text-slate-600', defaultLabel: 'Inactive' },
    suspended: { dot: 'bg-rose-500', text: 'text-rose-700', defaultLabel: 'Suspended' },
    scheduled: { dot: 'bg-blue-500', text: 'text-blue-700', defaultLabel: 'Scheduled' },
    in_progress: { dot: 'bg-amber-500 animate-pulse', text: 'text-amber-700', defaultLabel: 'In Progress' },
    completed: { dot: 'bg-emerald-500', text: 'text-emerald-700', defaultLabel: 'Completed' },
    pending: { dot: 'bg-amber-400', text: 'text-amber-700', defaultLabel: 'Pending' },
  }[status];

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${config.text} ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${config.dot}`} aria-hidden="true" />
      <span>{label || config.defaultLabel}</span>
    </span>
  );
};
