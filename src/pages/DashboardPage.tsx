import React, { useState, useEffect } from 'react';
import { Booking, DashboardStats } from '../types';
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
  Clock,
  Wind,
  Users2,
  CheckCheck,
  RefreshCw,
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

  const isOwnerOrAdmin = role === 'super_admin' || role === 'owner';
  const todayStr = getTodayISO();

  // Optimized Database Aggregation Statistics
  const [stats, setStats] = useState<DashboardStats>({
    total_bookings: 0,
    total_customers: 0,
    currently_checked_in: 0,
    today_bookings: 0,
    today_checkins: 0,
    today_checkouts: 0,
    today_auto_checkouts: 0,
    ac_bookings: 0,
    non_ac_bookings: 0,
    direct_bookings: 0,
    referral_bookings: 0,
    commission_payable: 0,
    commission_paid: 0,
    commission_pending: 0,
    total_rooms: 1,
    this_month_income: 0,
    total_pending_payments: 0,
  });

  const [todayArrivals, setTodayArrivals] = useState<Booking[]>([]);
  const [todayDepartures, setTodayDepartures] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoCheckoutRunning, setAutoCheckoutRunning] = useState(false);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      // 1. Process pending automatic checkouts at 12 PM IST
      const autoRes = await api.processAutomaticCheckouts();
      if (autoRes.updatedCount > 0) {
        showToast(
          'Automatic Checkout',
          `${autoRes.updatedCount} reservation(s) checked out automatically at 12:00 PM IST.`
        );
      }

      // 2. Fetch Aggregated Statistics directly from Database (Fast & Scalable for 100,000+ bookings)
      const aggStats = await api.getDashboardStats(activeHomestayId);
      setStats(aggStats);

      // 3. Fetch only today's arrivals & departures (Limit 20 for fast operations)
      const [arrivalsRes, departuresRes] = await Promise.all([
        api.getBookingsPaged({
          page: 1,
          pageSize: 20,
          homestay_id: activeHomestayId,
          check_in_from: todayStr,
          check_in_to: todayStr,
          status: 'booked',
        }),
        api.getBookingsPaged({
          page: 1,
          pageSize: 20,
          homestay_id: activeHomestayId,
          check_out_from: todayStr,
          check_out_to: todayStr,
          status: 'checked_in',
        }),
      ]);

      setTodayArrivals(arrivalsRes.data);
      setTodayDepartures(departuresRes.data);
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [activeHomestayId]);

  const handleManualRunAutoCheckout = async () => {
    try {
      setAutoCheckoutRunning(true);
      const res = await api.processAutomaticCheckouts();
      if (res.updatedCount > 0) {
        showToast(
          'Automatic Checkout Run',
          `${res.updatedCount} guest(s) processed for 12:00 PM IST checkout.`
        );
      } else {
        showToast('Auto Checkout Checked', 'No guests due for automatic checkout right now (12 PM IST rule).', 'info');
      }
      fetchDashboardData();
    } catch (err) {
      showError(err, 'Could not trigger automatic checkout');
    } finally {
      setAutoCheckoutRunning(false);
    }
  };

  // Quick check in/out
  const handleQuickCheckIn = async (b: Booking, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.updateBookingStatus(b.id, 'checked_in', 'manual');
      showToast('Guest Checked In', `${b.guest?.name || 'Guest'} checked in to ${b.room?.name}`);
      fetchDashboardData();
    } catch (err) {
      showError(err, 'Check-in failed');
    }
  };

  const handleQuickCheckOut = async (b: Booking, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.updateBookingStatus(b.id, 'checked_out', 'manual');
      showToast('Guest Checked Out', `${b.guest?.name || 'Guest'} checked out of ${b.room?.name}`);
      fetchDashboardData();
    } catch (err) {
      showError(err, 'Check-out failed');
    }
  };

  const scopedRooms = rooms.filter(
    (r) => activeHomestayId === 'all' || r.homestay_id === activeHomestayId
  );
  const totalRoomsCount = scopedRooms.length || 1;
  const occupancyPercentage = Math.min(
    100,
    Math.round((stats.currently_checked_in / totalRoomsCount) * 100)
  );

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header with Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-sm">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Property Operations Dashboard
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {activeHomestayId === 'all'
              ? 'Consolidated Portfolio Operations • India (Asia/Kolkata)'
              : `${homestays.find((h) => h.id === activeHomestayId)?.name || 'Homestay'} Overview`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Automatic Checkout trigger button */}
          <button
            onClick={handleManualRunAutoCheckout}
            disabled={autoCheckoutRunning}
            title="Checks out checked-in reservations whose scheduled checkout date is today or past, if after 12:00 PM IST"
            className="px-3 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-bold rounded-xl border border-purple-200 flex items-center gap-1.5 transition-colors"
          >
            <Clock className={`w-3.5 h-3.5 ${autoCheckoutRunning ? 'animate-spin' : ''}`} />
            <span>Process 12 PM Checkout</span>
          </button>

          <button
            onClick={() => onOpenNewExpense()}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-semibold rounded-xl border border-slate-200 flex items-center gap-1.5 transition-colors"
          >
            <Receipt className="w-4 h-4 text-slate-500" />
            <span>Add Expense</span>
          </button>

          <button
            onClick={() => onOpenNewBooking()}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs sm:text-sm font-bold rounded-xl shadow-md shadow-brand-600/20 flex items-center gap-1.5 transition-all hover:scale-[1.01]"
          >
            <PlusCircle className="w-4 h-4" />
            <span>New Booking</span>
          </button>
        </div>
      </div>

      {/* 1. Primary Operational Aggregated KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Reservations */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Total Reservations
            </span>
            <div className="w-8 h-8 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">
            {stats.total_bookings.toLocaleString('en-IN')}
          </p>
          <span className="text-[11px] text-slate-500 font-medium">
            {stats.total_customers.toLocaleString('en-IN')} Unique Customers
          </span>
        </div>

        {/* Occupancy Now */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Currently In-House
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <BedDouble className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">
            {stats.currently_checked_in}{' '}
            <span className="text-xs font-semibold text-slate-400">/ {totalRoomsCount} rooms</span>
          </p>
          <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
            <div
              className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${occupancyPercentage}%` }}
            />
          </div>
        </div>

        {/* Today's Check-Ins */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Today's Arrivals
            </span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <LogIn className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">
            {stats.today_checkins}
          </p>
          <span className="text-[11px] text-slate-500 font-medium">
            Scheduled for check-in today
          </span>
        </div>

        {/* Today's Checkouts */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Today's Departures
            </span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <LogOut className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">
            {stats.today_checkouts}
          </p>
          <span className="text-[11px] text-purple-700 font-semibold">
            Auto Check-Out at 12:00 PM IST
          </span>
        </div>
      </div>

      {/* 2. Room Tier & Referral Overview Aggregated KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* AC vs Non-AC */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            AC Room Bookings
          </span>
          <p className="text-xl font-extrabold text-cyan-700 mt-1">
            {stats.ac_bookings.toLocaleString('en-IN')}
          </p>
          <span className="text-[10px] text-slate-500">Air-conditioned suites</span>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Non-AC Bookings
          </span>
          <p className="text-xl font-extrabold text-slate-700 mt-1">
            {stats.non_ac_bookings.toLocaleString('en-IN')}
          </p>
          <span className="text-[10px] text-slate-500">Standard ventilated rooms</span>
        </div>

        {/* Direct vs Referral */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Direct Bookings
          </span>
          <p className="text-xl font-extrabold text-slate-900 mt-1">
            {stats.direct_bookings.toLocaleString('en-IN')}
          </p>
          <span className="text-[10px] text-slate-500">Direct guest inquiries</span>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">
            Referral Bookings
          </span>
          <p className="text-xl font-extrabold text-amber-700 mt-1">
            {stats.referral_bookings.toLocaleString('en-IN')}
          </p>
          <span className="text-[10px] text-amber-600">Brought by agents & drivers</span>
        </div>
      </div>

      {/* 3. Referral Commission Overview (Financial Snapshot) */}
      <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Users2 className="w-4 h-4 text-amber-700" />
            <h3 className="font-extrabold text-sm text-amber-900">
              Referral Commissions Summary
            </h3>
          </div>
          <span className="text-[11px] text-amber-800 font-semibold bg-amber-100 px-2 py-0.5 rounded-full">
            Separate from revenue
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-white p-3 rounded-xl border border-amber-200/80">
            <span className="text-[10px] font-bold text-slate-500 uppercase block">
              Total Commission Payable
            </span>
            <p className="text-lg font-black text-amber-800 mt-0.5">
              {formatCurrency(stats.commission_payable)}
            </p>
            <span className="text-[10px] text-slate-400">Total liability</span>
          </div>

          <div className="bg-white p-3 rounded-xl border border-amber-200/80">
            <span className="text-[10px] font-bold text-emerald-700 uppercase block">
              Commission Already Paid
            </span>
            <p className="text-lg font-black text-emerald-700 mt-0.5">
              {formatCurrency(stats.commission_paid)}
            </p>
            <span className="text-[10px] text-emerald-600">Disbursed to partners</span>
          </div>

          <div className="bg-white p-3 rounded-xl border border-amber-200/80">
            <span className="text-[10px] font-bold text-rose-700 uppercase block">
              Pending Payouts
            </span>
            <p className="text-lg font-black text-rose-700 mt-0.5">
              {formatCurrency(stats.commission_pending)}
            </p>
            <span className="text-[10px] text-rose-500">Requires settlement</span>
          </div>
        </div>
      </div>

      {/* 4. Actionable Today's Operations: Arrivals & Departures */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Arrivals Today */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="flex items-center gap-2">
              <LogIn className="w-4 h-4 text-emerald-600" />
              <h3 className="font-extrabold text-sm text-slate-900">
                Pending Arrivals Today ({todayArrivals.length})
              </h3>
            </div>
            <span className="text-xs text-slate-400 font-medium">{formatDisplayDate(todayStr)}</span>
          </div>

          {todayArrivals.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400">
              No pending arrivals scheduled for today.
            </div>
          ) : (
            <div className="space-y-2">
              {todayArrivals.map((b) => (
                <div
                  key={b.id}
                  onClick={() => onSelectBooking(b)}
                  className="p-3 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-200/80 flex items-center justify-between cursor-pointer transition-colors"
                >
                  <div>
                    <div className="font-bold text-xs text-slate-900">
                      {b.guest?.name || 'Guest'}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {b.room?.name} • {b.is_ac ? 'AC' : 'Non-AC'} • {b.guest?.phone}
                    </div>
                  </div>

                  <button
                    onClick={(e) => handleQuickCheckIn(b, e)}
                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm"
                  >
                    Check In
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Departures Today */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="flex items-center gap-2">
              <LogOut className="w-4 h-4 text-purple-600" />
              <h3 className="font-extrabold text-sm text-slate-900">
                Pending Departures Today ({todayDepartures.length})
              </h3>
            </div>
            <span className="text-[11px] text-purple-700 font-bold bg-purple-50 px-2 py-0.5 rounded-full">
              Auto Check-out 12:00 PM IST
            </span>
          </div>

          {todayDepartures.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400">
              No departing guests pending checkout today.
            </div>
          ) : (
            <div className="space-y-2">
              {todayDepartures.map((b) => (
                <div
                  key={b.id}
                  onClick={() => onSelectBooking(b)}
                  className="p-3 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-200/80 flex items-center justify-between cursor-pointer transition-colors"
                >
                  <div>
                    <div className="font-bold text-xs text-slate-900">
                      {b.guest?.name || 'Guest'}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {b.room?.name} • Checked in: {b.check_in_at ? formatDisplayDate(b.check_in_at) : b.check_in}
                    </div>
                  </div>

                  <button
                    onClick={(e) => handleQuickCheckOut(b, e)}
                    className="px-3 py-1 bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold rounded-lg shadow-sm"
                  >
                    Check Out Now
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
