import React from 'react';
import { ActiveScreen } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import {
  LayoutDashboard,
  CalendarCheck2,
  CalendarDays,
  LineChart,
  BarChart3,
  Receipt,
  BedDouble,
  Users2,
  Users,
  Award,
  History,
  Home,
  Shield,
} from 'lucide-react';

interface SidebarProps {
  currentScreen: ActiveScreen;
  onSelectScreen: (screen: ActiveScreen) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentScreen, onSelectScreen }) => {
  const { role } = useAuth();

  const isSuperAdmin = role === 'super_admin';
  const isOwnerOrAdmin = role === 'super_admin' || role === 'owner';
  const isManager = role === 'manager';

  const navItems = [
    {
      id: 'dashboard' as ActiveScreen,
      label: 'Dashboard',
      icon: LayoutDashboard,
      visible: true,
    },
    {
      id: 'bookings' as ActiveScreen,
      label: 'Bookings',
      icon: CalendarCheck2,
      visible: true,
    },
    {
      id: 'customers' as ActiveScreen,
      label: 'Customers',
      icon: Users,
      visible: true,
    },
    {
      id: 'referrals' as ActiveScreen,
      label: 'Referral & Comm.',
      icon: Award,
      visible: isOwnerOrAdmin,
      badge: 'Payouts',
    },
    {
      id: 'calendar' as ActiveScreen,
      label: 'Room Calendar',
      icon: CalendarDays,
      visible: true,
    },
    // Financial Analytics for Owner & Super Admin
    {
      id: 'analytics' as ActiveScreen,
      label: 'Financial Analytics',
      icon: LineChart,
      visible: isOwnerOrAdmin,
      badge: 'Full',
    },
    // Manager sees only basic occupancy stats
    {
      id: 'basic_stats' as ActiveScreen,
      label: 'Occupancy & Stats',
      icon: BarChart3,
      visible: isManager,
      badge: 'Basic',
    },
    {
      id: 'expenses' as ActiveScreen,
      label: 'Expenses',
      icon: Receipt,
      visible: true,
    },
    // Setup for homestays and rooms
    {
      id: 'setup' as ActiveScreen,
      label: 'Homestays & Rooms',
      icon: BedDouble,
      visible: isOwnerOrAdmin,
    },
    // Users for Super Admin only
    {
      id: 'users' as ActiveScreen,
      label: 'Staff & Users',
      icon: Users2,
      visible: isSuperAdmin,
      badge: 'Admin',
    },
    // Activity Log - STRICTLY ADMIN ONLY (Hidden from Partners & Managers)
    {
      id: 'activity_log' as ActiveScreen,
      label: 'Audit Activity Log',
      icon: History,
      visible: isSuperAdmin,
      badge: 'Admin',
    },
  ];

  return (
    <aside className="w-64 bg-white border-r border-slate-200/90 flex flex-col shrink-0 h-screen sticky top-0 hidden md:flex select-none">
      {/* Brand logo & title */}
      <div className="p-5 border-b border-slate-100 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-emerald-500 text-white flex items-center justify-center shadow-md shadow-brand-500/20 shrink-0">
          <Home className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="font-extrabold text-base text-slate-900 tracking-tight leading-tight">
            Homestay Manager
          </h1>
          <p className="text-[11px] font-medium text-slate-400">Operations & Bookings</p>
        </div>
      </div>

      {/* Navigation links */}
      <div className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        <div className="px-3 py-1 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
          Menu
        </div>
        {navItems
          .filter((item) => item.visible)
          .map((item) => {
            const Icon = item.icon;
            const isActive = currentScreen === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectScreen(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  isActive
                    ? 'bg-brand-600 text-white shadow-md shadow-brand-600/20 font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-4 h-4 ${
                      isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-600'
                    }`}
                  />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide ${
                      isActive
                        ? 'bg-brand-700/80 text-white'
                        : 'bg-slate-100 text-slate-500 border border-slate-200'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
      </div>

      {/* Bottom role indicator */}
      <div className="p-4 border-t border-slate-100 bg-slate-50/60">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-slate-200/80 flex items-center justify-center text-slate-600 shrink-0">
            <Shield className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-slate-700 truncate">
              {role === 'super_admin' ? 'Super Admin Mode' : role === 'owner' ? 'Partner / Owner Mode' : 'Property Manager Mode'}
            </p>
            <p className="text-[10px] text-slate-400 truncate">
              {role === 'super_admin' ? 'Full audit logs & user controls' : role === 'owner' ? 'Portfolio & commission access' : 'Restricted operations view'}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
};
