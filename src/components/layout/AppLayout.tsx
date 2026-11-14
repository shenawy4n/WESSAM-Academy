/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useLocale } from '../../hooks/useLocale';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

interface AppLayoutProps {
  children: React.ReactNode;
  currentView: string;
  onSelectView: (view: any) => void;
  pageTitle: string;
  onNavigateToResource?: (url: string) => void;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  children,
  currentView,
  onSelectView,
  pageTitle,
  onNavigateToResource,
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isRtl } = useLocale();

  return (
    <div className="min-h-screen bg-[#F4F6FA] text-[#14243A] flex flex-col">
      {/* Sidebar */}
      <Sidebar
        currentView={currentView}
        onSelectView={onSelectView}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main Content Area (offset by sidebar width on desktop) */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-all duration-200 ${
          isRtl ? 'lg:mr-64' : 'lg:ml-64'
        }`}
      >
        <Header
          onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
          pageTitle={pageTitle}
          onOpenNotifications={() => onSelectView('notifications')}
          onNavigateToResource={onNavigateToResource}
        />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
