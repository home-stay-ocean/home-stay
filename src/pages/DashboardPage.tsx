import React, { useState, useEffect } from 'react';
import { Booking, Room } from '../types';
import { api } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useHomestay } from '../contexts/HomestayContext';
import { useToast } from '../components/common/Toast';
import { formatCurrency } from '../lib/constants';
import { getTodayISO, formatDisplayDate } from '../lib/dateUtils';
import { StatusBadge } from '../components/common/Badge';
import {
  LogIn,
  LogOut,
  BedDouble,
  DollarSign,
  AlertCircle,
  PlusCircle,
  Calendar,
  Receipt,
  Users,
  CheckCircle2,
  Building,
  TrendingUp,
} from 'lucide-react';

interface DashboardPageProps {
  onOpenNewBooking: (roomId?: string, date?: string) => void;
  onOpenNewExpense: () => void;
  onSelectBooking: (b: Booking) => void;
  onNavigateToSetup?: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  onOpenNewBooking,
  onOpenNewExpense,
  onSelectBooking,
  onNavigateToSetup,
}) => {
  const { role } = useAuth();
  const { activeHomestayId, homestays, rooms } = useHomestay();
  const { showToast, showError } = useToast();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  const isOwnerOrAdmin = role === 'super_admin' || role === 'owner';
  const todayStr = getTodayISO();

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const data = await api.getBookings({ homestay_id: activeHomestayId });
      setBookings(data);
    } catch (err) {
      console.error('Error fetching dashboard bookings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [activeHomestayId]);

  // Active rooms in current scope
  const scopedRooms = rooms.filter(
    (r) => activeHomestayId === 'all' || r.homestay_id === activeHomestayId
  );
  const totalRoomsCount = scopedRooms.length || 1;

  // 1. Today's Check-Ins: bookings starting today (check_in === todayStr) and not cancelled
  const todayCheckIns = bookings.filter(
    (b) => (b.check_in?.split('T')[0] || b.check_in) === todayStr && b.status !== 'cancelled'
  );

  // 2. Today's Check-Outs: bookings ending today (check_out === todayStr) and not cancelled
  const todayCheckOuts = bookings.filter(
    (b) => (b.check_out?.split('T')[0] || b.check_out) === todayStr && b.status !== 'cancelled'
  );

  // 3. Rooms Occupied Now: status === 'checked_in'
  const currentlyOccupiedBookings = bookings.filter((b) => b.status === 'checked_in');
  const occupiedRoomsCount = currentlyOccupiedBookings.length;
  const occupancyPercentage = Math.min(100, Math.round((occupiedRoomsCount / totalRoomsCount) * 100));

  // 4. Financial Calculations for Owner/Super Admin:
  // This month's collected income: sum of payments made in the current calendar month
  const currentMonthPrefix = todayStr.substring(0, 7); // YYYY-MM
  let thisMonthIncome = 0;
  let totalPendingPayments = 0;

  bookings.forEach((b) => {
    if (b.status === 'cancelled') return;

    // Sum payments paid in this month
    b.payments?.forEach((p) => {
      const pDate = p.paid_on?.split('T')[0] || p.paid_on || '';
      if (pDate.startsWith(currentMonthPrefix)) {
        thisMonthIncome += Number(p.amount);
      }
    });

    // Pending payments across active/completed bookings
    const paid = b.payments?.reduce((sum, p) => sum + Number(p.amount), 0) || b.total_paid || 0;
    const balance = Number(b.total_amount) - paid;
    if (balance > 0) {
      totalPendingPayments += balance;
    }
  });

  // Action handlers
  const handleQuickCheckIn = async (b: Booking, e: React.MouseEvent) => {
    e.stopPropagation();
    if (b.status === 'checked_out') {
      showToast('Already Checked Out', 'This guest has already completed their stay and checked out.', 'warning');
      return;
    }
    if (b.status === 'checked_in') {
      showToast('Already Checked In', 'This guest is already checked in.', 'info');
      return;
    }
    try {
      await api.updateBookingStatus(b.id, 'checked_in');
      showToast('Guest Checked In', `${b.guest?.name || 'Guest'} checked in to ${b.room?.name}`);
      fetchDashboardData();
    } catch (err) {
      showError(err, 'Check-in failed');
    }
  };

  const handleQuickCheckOut = async (b: Booking, e: React.MouseEvent) => {
    e.stopPropagation();
    if (b.status === 'checked_out') {
      showToast('Already Checked Out', 'This guest has already departed and checked out.', 'warning');
      return;
    }
    if (b.status !== 'checked_in') {
      showToast('Not Checked In', 'Guest must be checked in first before checking out.', 'warning');
      return;
    }
    try {
      await api.updateBookingStatus(b.id, 'checked_out');
      showToast('Guest Checked Out', `${b.guest?.name || 'Guest'} checked out of ${b.room?.name}`);
      fetchDashboardData();
    } catch (err) {
      showError(err, 'Check-out failed');
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Welcome & Quick Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-sm">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Today's Front Desk
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Operations summary for {formatDisplayDate(todayStr, true)}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onOpenNewBooking()}
            className="flex-1 sm:flex-none px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs sm:text-sm font-bold rounded-xl shadow-md shadow-brand-600/20 flex items-center justify-center gap-1.5 transition-all hover:scale-[1.01]"
          >
            <PlusCircle className="w-4 h-4" />
            <span>New Booking</span>
          </button>
          <button
            onClick={onOpenNewExpense}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-semibold rounded-xl border border-slate-200 flex items-center gap-1.5 transition-colors"
          >
            <Receipt className="w-4 h-4 text-slate-500" />
            <span className="hidden sm:inline">Add Expense</span>
          </button>
        </div>
      </div>

      {/* Onboarding Banner when no homestays are added yet */}
      {homestays.length === 0 && (
        <div className="bg-gradient-to-r from-brand-50 to-emerald-50 border border-brand-200 rounded-2xl p-6 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-brand-600 text-white flex items-center justify-center mx-auto shadow-md">
            <Building className="w-6 h-6" />
          </div>
          <div className="max-w-md mx-auto">
            <h3 className="text-base font-bold text-slate-900">All data cleared & ready!</h3>
            <p className="text-xs text-slate-600 mt-1">
              You are logged in as Super Admin. Get started by adding your first homestay and rooms.
            </p>
          </div>
          {onNavigateToSetup && (
            <button
              onClick={onNavigateToSetup}
              className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-xl shadow-md transition-all inline-flex items-center gap-1.5"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Add Your First Homestay</span>
            </button>
          )}
        </div>
      )}


      {/* KPI Cards: Role-aware display */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* 1. Today's Check-Ins */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Check-Ins Today
            </span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <LogIn className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl sm:text-3xl font-black text-slate-900">{todayCheckIns.length}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {todayCheckIns.filter((b) => b.status === 'checked_in').length} already arrived
            </p>
          </div>
        </div>

        {/* 2. Today's Check-Outs */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Check-Outs Today
            </span>
            <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center">
              <LogOut className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl sm:text-3xl font-black text-slate-900">{todayCheckOuts.length}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {todayCheckOuts.filter((b) => b.status === 'checked_out').length} already departed
            </p>
          </div>
        </div>

        {/* 3. Rooms Occupied Now */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Rooms Occupied
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <BedDouble className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl sm:text-3xl font-black text-slate-900">
              {occupiedRoomsCount}{' '}
              <span className="text-sm font-semibold text-slate-400">/ {totalRoomsCount}</span>
            </p>
            <div className="mt-1 flex items-center gap-1.5">
              <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${occupancyPercentage}%` }}
                />
              </div>
              <span className="text-[10px] font-bold text-emerald-700">{occupancyPercentage}%</span>
            </div>
          </div>
        </div>

        {/* 4. Financial KPI (Owner & Super Admin only) OR Total Guests for Manager */}
        {isOwnerOrAdmin ? (
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                This Month's Income
              </span>
              <div className="w-8 h-8 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <p className="text-2xl sm:text-3xl font-black text-brand-700">
                {formatCurrency(thisMonthIncome)}
              </p>
              <p className="text-[11px] text-rose-500 font-semibold mt-0.5">
                {totalPendingPayments > 0
                  ? `${formatCurrency(totalPendingPayments)} pending balance`
                  : 'All payments settled'}
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Total Guests
              </span>
              <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <p className="text-2xl sm:text-3xl font-black text-purple-700">
                {bookings.filter((b) => b.status !== 'cancelled').reduce((acc, b) => acc + (b.num_guests || 1), 0)}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">Registered guest visitors</p>
            </div>
          </div>
        )}
      </div>

      {/* Operational Lists: Today's Check-ins & Check-outs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Check-ins Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                <LogIn className="w-3.5 h-3.5" />
              </div>
              <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                Expected Arrivals Today ({todayCheckIns.length})
              </h3>
            </div>
          </div>

          <div className="mt-3 flex-1 space-y-2 overflow-y-auto max-h-[360px]">
            {todayCheckIns.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400">
                No guest check-ins scheduled for today.
              </div>
            ) : (
              todayCheckIns.map((b) => (
                <div
                  key={b.id}
                  onClick={() => onSelectBooking(b)}
                  className="p-3 rounded-xl border border-slate-200/80 hover:border-brand-300 hover:bg-brand-50/20 cursor-pointer transition-all flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">
                      {b.guest?.name || 'Guest'}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {b.room?.homestay?.name} • <span className="font-semibold text-brand-700">{b.room?.name}</span>
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {b.num_guests} Guests • Out: {formatDisplayDate(b.check_out)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {b.status === 'booked' && (
                      <button
                        onClick={(e) => handleQuickCheckIn(b, e)}
                        className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-1 transition-colors"
                      >
                        <LogIn className="w-3 h-3" />
                        Check In
                      </button>
                    )}
                    {b.status === 'checked_in' && (
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        In House
                      </span>
                    )}
                    {b.status === 'checked_out' && (
                      <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200 flex items-center gap-1">
                        <LogOut className="w-3 h-3 text-slate-400" />
                        Checked Out
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Check-outs Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-slate-200 text-slate-700 flex items-center justify-center">
                <LogOut className="w-3.5 h-3.5" />
              </div>
              <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                Expected Departures Today ({todayCheckOuts.length})
              </h3>
            </div>
          </div>

          <div className="mt-3 flex-1 space-y-2 overflow-y-auto max-h-[360px]">
            {todayCheckOuts.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400">
                No guest check-outs scheduled for today.
              </div>
            ) : (
              todayCheckOuts.map((b) => {
                const totalPaid = b.payments?.reduce((acc, p) => acc + Number(p.amount), 0) || b.total_paid || 0;
                const balanceDue = Number(b.total_amount) - totalPaid;

                return (
                  <div
                    key={b.id}
                    onClick={() => onSelectBooking(b)}
                    className="p-3 rounded-xl border border-slate-200/80 hover:border-slate-300 hover:bg-slate-50 cursor-pointer transition-all flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate">
                        {b.guest?.name || 'Guest'}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {b.room?.homestay?.name} • <span className="font-semibold text-slate-700">{b.room?.name}</span>
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        In since: {formatDisplayDate(b.check_in)}
                        {balanceDue > 0 && isOwnerOrAdmin && (
                          <span className="text-rose-600 font-bold ml-1.5">
                            (Due: {formatCurrency(balanceDue)})
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {b.status === 'checked_in' && (
                        <button
                          onClick={(e) => handleQuickCheckOut(b, e)}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-1 transition-colors"
                        >
                          <LogOut className="w-3 h-3" />
                          Check Out
                        </button>
                      )}
                      {b.status === 'checked_out' && (
                        <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          Departed
                        </span>
                      )}
                      {b.status === 'booked' && (
                        <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200 flex items-center gap-1">
                          Awaiting Check-In
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
