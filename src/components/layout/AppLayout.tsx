import React from 'react';
import { ActiveScreen } from '../../types';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';

interface AppLayoutProps {
  currentScreen: ActiveScreen;
  onSelectScreen: (screen: ActiveScreen) => void;
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  currentScreen,
  onSelectScreen,
  children,
}) => {
  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Desktop Sidebar */}
      <Sidebar currentScreen={currentScreen} onSelectScreen={onSelectScreen} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full pb-24 md:pb-10">
          {children}
        </main>

        {/* Mobile Bottom Navigation */}
        <MobileNav
          currentScreen={currentScreen}
          onSelectScreen={onSelectScreen}
        />
      </div>
    </div>
  );
};
