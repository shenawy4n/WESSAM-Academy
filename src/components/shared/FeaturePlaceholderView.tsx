/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useLocale } from '../../hooks/useLocale';
import { Card, CardHeader, CardContent } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { LucideIcon, Layers, Calendar, Clock } from 'lucide-react';

interface FeaturePlaceholderViewProps {
  title: string;
  subtitle: string;
  targetPhase: string;
  icon: LucideIcon;
  description: string;
  plannedCapabilities: string[];
}

export const FeaturePlaceholderView: React.FC<FeaturePlaceholderViewProps> = ({
  title,
  subtitle,
  targetPhase,
  icon: Icon,
  description,
  plannedCapabilities,
}) => {
  const { isRtl } = useLocale();

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#356AE6] mb-1">
            <span className="w-2 h-2 rounded-full bg-[#356AE6]" />
            <span>{targetPhase}</span>
          </div>
          <h2 className="text-xl font-bold text-[#14243A]">{title}</h2>
          <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg shrink-0">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span>{isRtl ? 'بانتظار تنفيذ المرحلة المجدولة' : 'Scheduled for Phase Rollout'}</span>
        </div>
      </div>

      {/* Description & Capabilities Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="p-8">
              <EmptyState
                icon={<Icon className="w-6 h-6 text-[#356AE6]" />}
                title={title}
                description={description}
              />
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader
              title={isRtl ? 'المواصفات الهندسية المجدولة' : 'Planned Architectural Scope'}
              subtitle={isRtl ? 'وفق وثيقة أكاديمية الوسام' : 'Per WESSAM Academy Roadmap'}
            />
            <CardContent className="p-5">
              <ul className="space-y-2.5 text-xs text-slate-600">
                {plannedCapabilities.map((cap, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#D8B96C] mt-1.5 shrink-0" />
                    <span>{cap}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
