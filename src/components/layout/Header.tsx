import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useHomestay } from '../../contexts/HomestayContext';
import { ROLE_LABELS } from '../../lib/constants';
import { RoleBadge } from '../common/Badge';
import {
  Building2,
  ChevronDown,
  LogOut,
  HelpCircle,
  Sparkles,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';

interface HeaderProps {}

export const Header: React.FC<HeaderProps> = () => {
  const { user, profile, role, signOut } = useAuth();
  const { homestays, activeHomestayId, setActiveHomestayId } = useHomestay();
  const [showUserMenu, setShowUserMenu] = useState(false);

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 py-2.5 sm:py-3">
      <div className="flex items-center justify-between gap-2 sm:gap-4 max-w-7xl mx-auto">
        {/* Left: Homestay Property Switcher */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-2 bg-slate-100/80 hover:bg-slate-200/60 p-1 sm:p-1.5 rounded-xl border border-slate-200 transition-colors">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-brand-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <Building2 className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
            </div>
            <select
              value={activeHomestayId}
              onChange={(e) => setActiveHomestayId(e.target.value)}
              className="bg-transparent text-xs sm:text-sm font-semibold text-slate-800 focus:outline-none cursor-pointer pr-2 max-w-[140px] sm:max-w-[220px] truncate"
              title="Select Property"
            >
              {homestays.length > 0 ? (
                <>
                  <option value="all">All Properties ({homestays.length})</option>
                  {homestays.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </>
              ) : (
                <option value="all">No Properties Added</option>
              )}
            </select>
          </div>
        </div>

        {/* Right: User Profile */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* User Profile dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 p-1 pl-2 hover:bg-slate-100 rounded-xl transition-colors border border-transparent hover:border-slate-200"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-brand-600 to-emerald-400 text-white font-bold text-xs flex items-center justify-center shadow-sm">
                {(profile?.full_name || user?.email || 'U').charAt(0).toUpperCase()}
              </div>
              <div className="hidden lg:block text-left">
                <p className="text-xs font-semibold text-slate-800 leading-tight max-w-[120px] truncate">
                  {profile?.full_name || 'Admin User'}
                </p>
                <div className="mt-0.5">
                  <RoleBadge role={role} size="sm" />
                </div>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
            </button>

            {showUserMenu && (
              <div
                className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-xl shadow-xl py-1 z-50 animate-fadeIn"
                onMouseLeave={() => setShowUserMenu(false)}
              >
                <div className="px-3.5 py-2.5 border-b border-slate-100">
                  <p className="text-xs font-bold text-slate-900 truncate">
                    {profile?.full_name || 'Homestay Staff'}
                  </p>
                  <p className="text-[11px] text-slate-500 truncate mt-0.5">
                    {profile?.email || user?.email || 'user@homestay.com'}
                  </p>
                  <div className="mt-2">
                    <RoleBadge role={role} size="sm" />
                  </div>
                </div>

                <div className="my-1" />

                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    signOut();
                  }}
                  className="w-full text-left px-3.5 py-2 text-xs text-rose-600 hover:bg-rose-50 flex items-center gap-2"
                >
                  <LogOut className="w-4 h-4 text-rose-500" />
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
