import React, { useState } from 'react';
import { ActiveScreen } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import {
  LayoutDashboard,
  CalendarCheck2,
  CalendarDays,
  Receipt,
  MoreHorizontal,
  LineChart,
  BarChart3,
  BedDouble,
  Users2,
  Award,
  History,
  X,
  LogOut,
  HelpCircle,
} from 'lucide-react';
import { RoleBadge } from '../common/Badge';

interface MobileNavProps {
  currentScreen: ActiveScreen;
  onSelectScreen: (screen: ActiveScreen) => void;
}

export const MobileNav: React.FC<MobileNavProps> = ({
  currentScreen,
  onSelectScreen,
}) => {
  const { role, profile, signOut } = useAuth();
  const [showMoreDrawer, setShowMoreDrawer] = useState(false);

  const isSuperAdmin = role === 'super_admin';
  const isOwnerOrAdmin = role === 'super_admin' || role === 'owner';
  const isManager = role === 'manager';

  const primaryItems = [
    { id: 'dashboard' as ActiveScreen, label: 'Home', icon: LayoutDashboard },
    { id: 'bookings' as ActiveScreen, label: 'Bookings', icon: CalendarCheck2 },
    { id: 'calendar' as ActiveScreen, label: 'Calendar', icon: CalendarDays },
    { id: 'expenses' as ActiveScreen, label: 'Expenses', icon: Receipt },
  ];

  const moreItems = [
    {
      id: 'customers' as ActiveScreen,
      label: 'Customer Profiles',
      icon: Users2,
      visible: true,
      desc: 'Guest records & history',
    },
    {
      id: 'referrals' as ActiveScreen,
      label: 'Referrals & Commissions',
      icon: Award,
      visible: isOwnerOrAdmin,
      desc: 'Partner payouts & reports',
    },
    {
      id: 'analytics' as ActiveScreen,
      label: 'Financial Analytics',
      icon: LineChart,
      visible: isOwnerOrAdmin,
      desc: 'Income, profit, and trends',
    },
    {
      id: 'basic_stats' as ActiveScreen,
      label: 'Occupancy & Stats',
      icon: BarChart3,
      visible: isManager,
      desc: 'Basic room occupancy & booking counts',
    },
    {
      id: 'setup' as ActiveScreen,
      label: 'Homestays & Rooms',
      icon: BedDouble,
      visible: isOwnerOrAdmin,
      desc: 'Properties, room rates, and status',
    },
    {
      id: 'users' as ActiveScreen,
      label: 'Staff & Users',
      icon: Users2,
      visible: isSuperAdmin,
      desc: 'Create and manage system access',
    },
    {
      id: 'activity_log' as ActiveScreen,
      label: 'Audit Activity Log',
      icon: History,
      visible: isSuperAdmin,
      desc: 'Triggered audit trail of changes',
    },
  ];

  return (
    <>
      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-lg border-t border-slate-200/90 px-2 py-1.5 shadow-lg safe-bottom">
        <div className="flex items-center justify-around">
          {primaryItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentScreen === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onSelectScreen(item.id);
                  setShowMoreDrawer(false);
                }}
                className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all ${
                  isActive
                    ? 'text-brand-600 font-bold'
                    : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                <div
                  className={`p-1 rounded-lg transition-transform ${
                    isActive ? 'scale-110 bg-brand-50' : ''
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-[10px] mt-0.5 tracking-tight">{item.label}</span>
              </button>
            );
          })}

          {/* More button */}
          <button
            onClick={() => setShowMoreDrawer(!showMoreDrawer)}
            className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all ${
              showMoreDrawer || moreItems.some((m) => m.id === currentScreen)
                ? 'text-brand-600 font-bold'
                : 'text-slate-400 hover:text-slate-700'
            }`}
          >
            <div
              className={`p-1 rounded-lg transition-transform ${
                showMoreDrawer || moreItems.some((m) => m.id === currentScreen)
                  ? 'scale-110 bg-brand-50'
                  : ''
              }`}
            >
              <MoreHorizontal className="w-5 h-5" />
            </div>
            <span className="text-[10px] mt-0.5 tracking-tight">More</span>
          </button>
        </div>
      </nav>

      {/* More Drawer Sheet */}
      {showMoreDrawer && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div
            className="fixed inset-0"
            onClick={() => setShowMoreDrawer(false)}
            aria-hidden="true"
          />

          <div className="relative z-10 bg-white rounded-t-3xl shadow-2xl border-t border-slate-100 max-h-[85vh] overflow-y-auto animate-slideUp p-5">
            {/* Drawer handle & header */}
            <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-4" />
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-base">All Features</h3>
                <div className="mt-1">
                  <RoleBadge role={role} size="sm" />
                </div>
              </div>
              <button
                onClick={() => setShowMoreDrawer(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Feature list */}
            <div className="py-3 space-y-1">
              {moreItems
                .filter((item) => item.visible)
                .map((item) => {
                  const Icon = item.icon;
                  const isActive = currentScreen === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        onSelectScreen(item.id);
                        setShowMoreDrawer(false);
                      }}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors ${
                        isActive
                          ? 'bg-brand-50 border border-brand-200 text-brand-900 font-semibold'
                          : 'hover:bg-slate-50 text-slate-800'
                      }`}
                    >
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          isActive
                            ? 'bg-brand-600 text-white'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{item.label}</p>
                        <p className="text-xs text-slate-500 truncate">{item.desc}</p>
                      </div>
                    </button>
                  );
                })}
            </div>

            {/* Quick Actions & Logout */}
            <div className="pt-3 border-t border-slate-100 space-y-2">

              <button
                onClick={() => {
                  setShowMoreDrawer(false);
                  signOut();
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-sm font-semibold transition-colors"
              >
                <LogOut className="w-5 h-5 text-rose-600" />
                <span>Sign Out ({profile?.full_name || 'Staff'})</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
