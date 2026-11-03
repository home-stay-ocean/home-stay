import React, { useState, useEffect, useMemo } from 'react';
import { Booking, Expense, Payment, Room, Homestay } from '../types';
import { api } from '../lib/supabase';
import { useHomestay } from '../contexts/HomestayContext';
import { formatCurrency } from '../lib/constants';
import { calculateNights, TimeframePreset, getTimeframeDates, isDateInDateRange, isBookingInDateRange, formatDisplayDate } from '../lib/dateUtils';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  Legend,
} from 'recharts';
import {
  TrendingUp,
  DollarSign,
  Receipt,
  Users2,
  Calendar,
  BedDouble,
  AlertCircle,
  Sparkles,
  Building2,
  Building,
  CheckCircle2,
  ArrowRight,
  Layers,
  MapPin,
  Clock,
  Filter,
  RotateCcw,
  CalendarDays,
} from 'lucide-react';

export const AnalyticsPage: React.FC = () => {
  const { allHomestays, rooms, activeHomestayId } = useHomestay();

  const [selectedPropertyId, setSelectedPropertyId] = useState<string>(activeHomestayId || 'all');
  const [selectedTimeframe, setSelectedTimeframe] = useState<TimeframePreset>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  // Active timeframe calculation
  const timeframe = useMemo(() => {
    return getTimeframeDates(selectedTimeframe, customStartDate, customEndDate);
  }, [selectedTimeframe, customStartDate, customEndDate]);

  useEffect(() => {
    async function loadAllData() {
      try {
        setLoading(true);
        const [bData, pData, eData] = await Promise.all([
          api.getBookings(),
          api.getPayments(),
          api.getExpenses(),
        ]);
        setBookings(bData);
        setPayments(pData);
        setExpenses(eData);
      } catch (err) {
        console.error('Failed to load analytics data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadAllData();
  }, []);

  // Sync if context active homestay changes
  useEffect(() => {
    if (activeHomestayId && activeHomestayId !== 'all') {
      setSelectedPropertyId(activeHomestayId);
    }
  }, [activeHomestayId]);

  // Selected Homestay details (if single property chosen)
  const currentProperty = useMemo(() => {
    if (selectedPropertyId === 'all') return null;
    return allHomestays.find((h) => h.id === selectedPropertyId) || null;
  }, [selectedPropertyId, allHomestays]);

  // ----------------------------------------------------------------------------
  // SCOPED FILTERING BY PROPERTY & TIMEFRAME
  // ----------------------------------------------------------------------------
  const filteredRooms = useMemo(() => {
    if (selectedPropertyId === 'all') return rooms;
    return rooms.filter((r) => r.homestay_id === selectedPropertyId);
  }, [rooms, selectedPropertyId]);

  const filteredRoomIds = useMemo(() => {
    return new Set(filteredRooms.map((r) => r.id));
  }, [filteredRooms]);

  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      // 1. Property match
      if (selectedPropertyId !== 'all' && !filteredRoomIds.has(b.room_id)) {
        return false;
      }
      // 2. Date match
      if (!isBookingInDateRange(b.check_in, b.check_out, timeframe.startDate, timeframe.endDate)) {
        return false;
      }
      return true;
    });
  }, [bookings, filteredRoomIds, selectedPropertyId, timeframe]);

  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      // 1. Property match
      if (selectedPropertyId !== 'all') {
        const matchesProperty =
          p.booking?.room?.homestay_id === selectedPropertyId ||
          bookings.some((bk) => bk.id === p.booking_id && filteredRoomIds.has(bk.room_id));
        if (!matchesProperty) return false;
      }
      // 2. Date match
      if (!isDateInDateRange(p.paid_on, timeframe.startDate, timeframe.endDate)) {
        return false;
      }
      return true;
    });
  }, [payments, bookings, filteredRoomIds, selectedPropertyId, timeframe]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      // 1. Property match
      if (selectedPropertyId !== 'all' && e.homestay_id !== selectedPropertyId) {
        return false;
      }
      // 2. Date match
      if (!isDateInDateRange(e.spent_on, timeframe.startDate, timeframe.endDate)) {
        return false;
      }
      return true;
    });
  }, [expenses, selectedPropertyId, timeframe]);

  // ----------------------------------------------------------------------------
  // FINANCIAL KPI AGGREGATIONS (FOR CURRENT SCOPE & TIMEFRAME)
  // ----------------------------------------------------------------------------
  const totalGrossIncome = filteredPayments.reduce((sum, p) => sum + Number(p.amount), 0);
  const totalOperatingExpenses = filteredExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const netOperatingProfit = totalGrossIncome - totalOperatingExpenses;
  const profitMargin = totalGrossIncome > 0 ? Math.round((netOperatingProfit / totalGrossIncome) * 100) : 0;

  // Pending Payments for current scope
  let totalPendingPayments = 0;
  filteredBookings.forEach((b) => {
    if (b.status === 'cancelled') return;
    const paid = b.payments?.reduce((sum, p) => sum + Number(p.amount), 0) || b.total_paid || 0;
    const balance = Number(b.total_amount) - paid;
    if (balance > 0) totalPendingPayments += balance;
  });

  // ----------------------------------------------------------------------------
  // PROPERTY-BY-PROPERTY COMPARISON MATRIX (SIDE-BY-SIDE ALL PROPERTIES WITH TIMEFRAME)
  // ----------------------------------------------------------------------------
  const propertiesComparison = useMemo(() => {
    return allHomestays.map((h) => {
      const hRooms = rooms.filter((r) => r.homestay_id === h.id);
      const hRoomIds = new Set(hRooms.map((r) => r.id));

      const hBookings = bookings.filter((b) => {
        if (!hRoomIds.has(b.room_id) || b.status === 'cancelled') return false;
        if (timeframe.startDate && timeframe.endDate) {
          return b.check_in <= timeframe.endDate && b.check_out >= timeframe.startDate;
        }
        return true;
      });

      const hPayments = payments.filter((p) => {
        const matchesProperty =
          p.booking?.room?.homestay_id === h.id ||
          bookings.some((bk) => bk.id === p.booking_id && hRoomIds.has(bk.room_id));
        if (!matchesProperty) return false;
        if (!isDateInDateRange(p.paid_on, timeframe.startDate, timeframe.endDate)) {
          return false;
        }
        return true;
      });
      const income = hPayments.reduce((sum, p) => sum + Number(p.amount), 0);

      const hExpenses = expenses.filter((e) => {
        if (e.homestay_id !== h.id) return false;
        if (!isDateInDateRange(e.spent_on, timeframe.startDate, timeframe.endDate)) {
          return false;
        }
        return true;
      });
      const expenseTotal = hExpenses.reduce((sum, e) => sum + Number(e.amount), 0);

      const netProfit = income - expenseTotal;
      const margin = income > 0 ? Math.round((netProfit / income) * 100) : 0;

      let pending = 0;
      hBookings.forEach((b) => {
        const bPaid = b.payments?.reduce((s, p) => s + Number(p.amount), 0) || b.total_paid || 0;
        const bal = Number(b.total_amount) - bPaid;
        if (bal > 0) pending += bal;
      });

      const totalNights = hBookings.reduce(
        (sum, b) => sum + calculateNights(b.check_in, b.check_out),
        0
      );
      const daysCount =
        timeframe.startDate && timeframe.endDate
          ? Math.max(1, calculateNights(timeframe.startDate, timeframe.endDate) + 1)
          : 30;
      const roomCapacity = (hRooms.length || 1) * daysCount;
      const occupancyRate = Math.min(100, Math.round((totalNights / roomCapacity) * 100));

      return {
        id: h.id,
        name: h.name,
        location: h.location,
        roomsCount: hRooms.length,
        bookingsCount: hBookings.length,
        income,
        expenses: expenseTotal,
        netProfit,
        profitMargin: margin,
        pendingDue: pending,
        occupancyRate,
        totalNights,
      };
    });
  }, [allHomestays, rooms, bookings, payments, expenses, timeframe]);

  // ----------------------------------------------------------------------------
  // MONTHLY FINANCIAL TREND (FOR CURRENT SCOPE)
  // ----------------------------------------------------------------------------
  const monthlyFinancials = useMemo(() => {
    const map: Record<string, { month: string; income: number; expenses: number; profit: number }> = {};

    filteredPayments.forEach((p) => {
      if (!p.paid_on) return;
      const monthKey = p.paid_on.substring(0, 7); // YYYY-MM
      if (!map[monthKey]) {
        map[monthKey] = { month: monthKey, income: 0, expenses: 0, profit: 0 };
      }
      map[monthKey].income += Number(p.amount);
    });

    filteredExpenses.forEach((e) => {
      if (!e.spent_on) return;
      const monthKey = e.spent_on.substring(0, 7);
      if (!map[monthKey]) {
        map[monthKey] = { month: monthKey, income: 0, expenses: 0, profit: 0 };
      }
      map[monthKey].expenses += Number(e.amount);
    });

    Object.values(map).forEach((m) => {
      m.profit = m.income - m.expenses;
    });

    const sorted = Object.values(map).sort((a, b) => a.month.localeCompare(b.month));
    return sorted.slice(-6); // last 6 months
  }, [filteredPayments, filteredExpenses]);

  // ----------------------------------------------------------------------------
  // ROOM OCCUPANCY % (FOR CURRENT SCOPE)
  // ----------------------------------------------------------------------------
  const roomOccupancy = useMemo(() => {
    return filteredRooms.map((r) => {
      let occupiedNights = 0;
      filteredBookings.forEach((b) => {
        if (b.room_id === r.id && b.status !== 'cancelled' && b.check_in && b.check_out) {
          occupiedNights += calculateNights(b.check_in, b.check_out);
        }
      });
      const rate = Math.min(100, Math.round((occupiedNights / 30) * 100));
      return {
        name: r.name,
        homestayName: allHomestays.find((h) => h.id === r.homestay_id)?.name || '',
        occupancy: rate,
        nights: occupiedNights,
      };
    });
  }, [filteredRooms, filteredBookings, allHomestays]);

  // ----------------------------------------------------------------------------
  // BUSIEST MONTHS (FOR CURRENT SCOPE)
  // ----------------------------------------------------------------------------
  const busiestMonths = useMemo(() => {
    const monthCounts: Record<string, number> = {};
    filteredBookings.forEach((b) => {
      if (b.status === 'cancelled' || !b.check_in) return;
      const m = b.check_in.substring(0, 7);
      const n = b.check_out ? calculateNights(b.check_in, b.check_out) : 0;
      monthCounts[m] = (monthCounts[m] || 0) + n;
    });

    return Object.entries(monthCounts)
      .map(([month, nights]) => ({ month, nights }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-6);
  }, [filteredBookings]);

  // ----------------------------------------------------------------------------
  // LOYAL REPEAT GUESTS (FOR CURRENT SCOPE)
  // ----------------------------------------------------------------------------
  const repeatGuests = useMemo(() => {
    const guestMap: Record<
      string,
      { id: string; name: string; phone: string; count: number; totalSpent: number }
    > = {};

    filteredBookings.forEach((b) => {
      if (b.status === 'cancelled') return;
      const gId = b.guest_id;
      if (!guestMap[gId]) {
        guestMap[gId] = {
          id: gId,
          name: b.guest?.name || 'Guest',
          phone: b.guest?.phone || '',
          count: 0,
          totalSpent: 0,
        };
      }
      guestMap[gId].count += 1;
      guestMap[gId].totalSpent += Number(b.total_amount);
    });

    return Object.values(guestMap)
      .filter((g) => g.count >= 2)
      .sort((a, b) => b.totalSpent - a.totalSpent);
  }, [filteredBookings]);

  if (loading) {
    return (
      <div className="bg-white p-12 text-center rounded-2xl border border-slate-200 text-slate-400 text-sm">
        Calculating financial intelligence by property...
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              Financial Analytics & Intelligence
            </h2>
            <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-full border border-emerald-200">
              Owner / Super Admin
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Compare financial performance across properties or drill down into an individual homestay
          </p>
        </div>

        {/* Selected Scope Indicator */}
        <div className="flex items-center gap-1.5 self-start md:self-auto text-xs bg-slate-100 p-1.5 rounded-xl border border-slate-200">
          <Layers className="w-3.5 h-3.5 text-brand-600 ml-1" />
          <span className="text-slate-500 font-medium">Viewing:</span>
          <span className="font-bold text-slate-900">
            {selectedPropertyId === 'all'
              ? `All Properties (${allHomestays.length})`
              : currentProperty?.name || 'Property'}
          </span>
        </div>
      </div>

      {/* Property Selector Tabs / Filter Bar */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-brand-600" />
            Filter By Property:
          </span>
          {selectedPropertyId !== 'all' && (
            <button
              onClick={() => setSelectedPropertyId('all')}
              className="text-xs font-bold text-brand-600 hover:text-brand-700 hover:underline flex items-center gap-1"
            >
              <span>Reset to All Properties</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {/* All Properties Tab */}
          <button
            onClick={() => setSelectedPropertyId('all')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 whitespace-nowrap transition-all ${
              selectedPropertyId === 'all'
                ? 'bg-brand-600 text-white shadow-md shadow-brand-600/20 scale-[1.02]'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>All Properties ({allHomestays.length})</span>
          </button>

          {/* Individual Property Tabs */}
          {allHomestays.map((h) => {
            const isSelected = selectedPropertyId === h.id;
            const hRooms = rooms.filter((r) => r.homestay_id === h.id);
            return (
              <button
                key={h.id}
                onClick={() => setSelectedPropertyId(h.id)}
                className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 whitespace-nowrap transition-all ${
                  isSelected
                    ? 'bg-brand-600 text-white shadow-md shadow-brand-600/20 scale-[1.02]'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
                }`}
              >
                <Building className="w-4 h-4 text-slate-400 group-hover:text-slate-600" />
                <span>{h.name}</span>
                <span
                  className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                    isSelected
                      ? 'bg-brand-700 text-white'
                      : 'bg-slate-200/70 text-slate-600'
                  }`}
                >
                  {hRooms.length} rms
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Timeframe & Date Range Filter Bar */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <CalendarDays className="w-4 h-4 text-brand-600" />
              Timeframe & Date Range:
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-brand-50 text-brand-700 border border-brand-200">
              {timeframe.label}
            </span>
          </div>

          {(selectedTimeframe !== 'all' || selectedPropertyId !== 'all') && (
            <div className="flex items-center gap-2">
              {selectedTimeframe !== 'all' && (
                <button
                  onClick={() => {
                    setSelectedTimeframe('all');
                    setCustomStartDate('');
                    setCustomEndDate('');
                  }}
                  className="text-xs font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1 hover:underline"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset to All Time</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Preset Buttons */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {[
            { id: 'all', label: 'All Time', icon: '🌐' },
            { id: 'today', label: 'Today (Daily)', icon: '⚡' },
            { id: 'yesterday', label: 'Yesterday', icon: '⏪' },
            { id: 'this_month', label: 'This Month', icon: '📆' },
            { id: 'last_month', label: 'Last Month', icon: '🗓️' },
            { id: 'last_30_days', label: 'Last 30 Days', icon: '🕒' },
            { id: 'custom', label: 'Custom Date', icon: '✏️' },
          ].map((preset) => {
            const isSelected = selectedTimeframe === preset.id;
            return (
              <button
                key={preset.id}
                onClick={() => setSelectedTimeframe(preset.id as TimeframePreset)}
                className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 whitespace-nowrap transition-all ${
                  isSelected
                    ? 'bg-slate-900 text-white shadow-sm scale-[1.02]'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
                }`}
              >
                <span>{preset.icon}</span>
                <span>{preset.label}</span>
              </button>
            );
          })}
        </div>

        {/* Custom Date Range Picker (shown when 'custom' is selected) */}
        {selectedTimeframe === 'custom' && (
          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-3 bg-slate-50/70 p-3 rounded-xl border border-slate-200">
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-700">From Date:</label>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-medium focus:ring-2 focus:ring-brand-500 focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-700">To Date:</label>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-medium focus:ring-2 focus:ring-brand-500 focus:outline-none"
              />
            </div>

            {customStartDate && customEndDate && (
              <span className="text-xs font-bold text-brand-700 bg-brand-50 px-2.5 py-1 rounded-md border border-brand-200">
                {calculateNights(customStartDate, customEndDate) + 1} day(s) selected
              </span>
            )}
          </div>
        )}

        {/* Active Period & Filter Summary Banner */}
        <div className="flex flex-wrap items-center justify-between text-xs text-slate-600 bg-brand-50/40 px-3 py-2 rounded-xl border border-brand-100/60 gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>
              Data Scope: <strong className="text-slate-900">{timeframe.label}</strong>
              {timeframe.startDate && timeframe.endDate && (
                <span className="text-slate-500 ml-1">
                  ({formatDisplayDate(timeframe.startDate, true)}
                  {timeframe.startDate !== timeframe.endDate && ` → ${formatDisplayDate(timeframe.endDate, true)}`})
                </span>
              )}
              {' • '}
              Property: <strong className="text-slate-900">{selectedPropertyId === 'all' ? 'All Properties' : currentProperty?.name}</strong>
            </span>
          </div>

          <div className="flex items-center gap-3 text-slate-500 font-medium">
            <span>{filteredPayments.length} payment(s)</span>
            <span>•</span>
            <span>{filteredExpenses.length} expense(s)</span>
            <span>•</span>
            <span>{filteredBookings.length} booking(s)</span>
          </div>
        </div>
      </div>

      {/* Financial KPI Summary Cards (Scope-aware: All or Selected Property & Timeframe) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Gross Income */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              {selectedPropertyId === 'all' ? 'Total Collected Income' : `${currentProperty?.name} Revenue`}
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-brand-700 mt-2">
            {formatCurrency(totalGrossIncome)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">From verified payments</p>
        </div>

        {/* Operating Expenses */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              {selectedPropertyId === 'all' ? 'Total Expenses' : `${currentProperty?.name} Expenses`}
            </span>
            <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-slate-900 mt-2">
            {formatCurrency(totalOperatingExpenses)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Utilities, staff, maintenance & laundry</p>
        </div>

        {/* Net Profit */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Net Operating Profit
            </span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <p className={`text-2xl sm:text-3xl font-black mt-2 ${netOperatingProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {formatCurrency(netOperatingProfit)}
          </p>
          <p className="text-[11px] font-semibold text-emerald-700 mt-1">
            {profitMargin}% Operating Margin
          </p>
        </div>

        {/* Pending Payments */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Pending Balance Due
            </span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-rose-600 mt-2">
            {formatCurrency(totalPendingPayments)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Uncollected guest checkout balance</p>
        </div>
      </div>

      {/* ============================================================================== */}
      {/* PROPERTY-BY-PROPERTY FINANCIAL COMPARISON MATRIX */}
      {/* ============================================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
          <div>
            <h3 className="font-extrabold text-slate-900 text-base sm:text-lg flex items-center gap-2">
              <Building2 className="w-5 h-5 text-brand-600" />
              Property Performance Breakdown
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Side-by-side revenue, expenses, net profitability, and occupancy for every homestay
            </p>
          </div>
          <span className="text-xs font-bold text-slate-500 bg-white px-3 py-1 rounded-full border border-slate-200 self-start sm:self-auto">
            {propertiesComparison.length} {propertiesComparison.length === 1 ? 'Property' : 'Properties'} Tracked
          </span>
        </div>

        {/* Comparison Chart: Income vs Expenses vs Net Profit by Property */}
        {propertiesComparison.length > 0 && (
          <div className="p-5 border-b border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="font-bold text-slate-800 text-sm">
                  Revenue vs Expenses vs Net Profit by Property
                </h4>
                <p className="text-xs text-slate-400">Direct comparative performance across properties</p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1.5 text-slate-600">
                  <span className="w-3 h-3 rounded bg-emerald-600" /> Revenue
                </span>
                <span className="flex items-center gap-1.5 text-slate-600">
                  <span className="w-3 h-3 rounded bg-rose-500" /> Expenses
                </span>
                <span className="flex items-center gap-1.5 text-slate-600">
                  <span className="w-3 h-3 rounded bg-blue-600" /> Net Profit
                </span>
              </div>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={propertiesComparison} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(val) => `₹${val / 1000}k`} />
                  <Tooltip
                    formatter={(val: any) => [formatCurrency(Number(val)), '']}
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: 'none', color: '#fff' }}
                  />
                  <Bar dataKey="income" name="Gross Revenue" fill="#16a34a" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="expenses" name="Operating Expenses" fill="#f43f5e" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="netProfit" name="Net Profit" fill="#2563eb" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Detailed Comparison Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-xs uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Property</th>
                <th className="px-4 py-3.5 text-right">Revenue</th>
                <th className="px-4 py-3.5 text-right">Expenses</th>
                <th className="px-4 py-3.5 text-right">Net Profit</th>
                <th className="px-4 py-3.5 text-center">Margin</th>
                <th className="px-4 py-3.5 text-center">Occupancy</th>
                <th className="px-4 py-3.5 text-right">Balance Due</th>
                <th className="px-4 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {propertiesComparison.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-slate-400 text-xs">
                    No properties added yet. Add properties in 'Homestays & Rooms' setup to view financial analytics.
                  </td>
                </tr>
              ) : (
                propertiesComparison.map((p) => {
                  const isCurrent = selectedPropertyId === p.id;
                  return (
                    <tr
                      key={p.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isCurrent ? 'bg-brand-50/40' : ''
                      }`}
                    >
                      {/* Property */}
                      <td className="px-5 py-4">
                        <div className="flex items-start gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0 mt-0.5">
                            <Building className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="font-bold text-slate-900">{p.name}</p>
                              {isCurrent && (
                                <span className="text-[10px] font-bold text-brand-700 bg-brand-100 px-1.5 py-0.5 rounded-full">
                                  Active View
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                              <MapPin className="w-3 h-3 text-slate-300" />
                              {p.location} • {p.roomsCount} Rooms
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Revenue */}
                      <td className="px-4 py-4 text-right">
                        <p className="font-black text-slate-900">{formatCurrency(p.income)}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">{p.bookingsCount} bookings</p>
                      </td>

                      {/* Expenses */}
                      <td className="px-4 py-4 text-right">
                        <p className="font-bold text-rose-600">{formatCurrency(p.expenses)}</p>
                      </td>

                      {/* Net Profit */}
                      <td className="px-4 py-4 text-right">
                        <p
                          className={`font-black ${
                            p.netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'
                          }`}
                        >
                          {formatCurrency(p.netProfit)}
                        </p>
                      </td>

                      {/* Profit Margin */}
                      <td className="px-4 py-4 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                            p.profitMargin >= 40
                              ? 'bg-emerald-100 text-emerald-800'
                              : p.profitMargin > 0
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {p.profitMargin}%
                        </span>
                      </td>

                      {/* Occupancy */}
                      <td className="px-4 py-4 text-center">
                        <span className="font-bold text-slate-800">{p.occupancyRate}%</span>
                        <span className="text-[11px] text-slate-400 block">{p.totalNights} nights</span>
                      </td>

                      {/* Balance Due */}
                      <td className="px-4 py-4 text-right">
                        {p.pendingDue > 0 ? (
                          <span className="font-bold text-rose-600">{formatCurrency(p.pendingDue)}</span>
                        ) : (
                          <span className="text-xs font-semibold text-emerald-600">Settled</span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="px-4 py-4 text-right">
                        <button
                          onClick={() => setSelectedPropertyId(isCurrent ? 'all' : p.id)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                            isCurrent
                              ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                              : 'bg-brand-600 hover:bg-brand-700 text-white shadow-sm'
                          }`}
                        >
                          {isCurrent ? 'View All' : 'Select'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Chart 1: Monthly Income vs Expenses = Net Profit Trend (Scoped) */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="font-bold text-slate-900 text-base">
              Monthly Financial Trajectory: {selectedPropertyId === 'all' ? 'All Properties Combined' : currentProperty?.name}
            </h3>
            <p className="text-xs text-slate-500">Gross revenue collected vs expenses incurred = net earnings</p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 text-slate-600 font-medium">
              <span className="w-3 h-3 rounded bg-emerald-600" /> Income
            </span>
            <span className="flex items-center gap-1.5 text-slate-600 font-medium">
              <span className="w-3 h-3 rounded bg-rose-500" /> Expenses
            </span>
            <span className="flex items-center gap-1.5 text-slate-600 font-medium">
              <span className="w-3 h-3 rounded bg-blue-600" /> Net Profit
            </span>
          </div>
        </div>

        <div className="h-72 w-full">
          {monthlyFinancials.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-slate-400">
              No financial data recorded yet for this view.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyFinancials} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(val) => `₹${val / 1000}k`} />
                <Tooltip
                  formatter={(val: any) => [formatCurrency(Number(val)), '']}
                  contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: 'none', color: '#fff' }}
                />
                <Bar dataKey="income" name="Gross Income" fill="#16a34a" radius={[6, 6, 0, 0]} />
                <Bar dataKey="expenses" name="Expenses" fill="#f43f5e" radius={[6, 6, 0, 0]} />
                <Bar dataKey="profit" name="Net Profit" fill="#2563eb" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Row: Room Occupancy & Busiest Months */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Room Occupancy % */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold text-slate-900 text-base">
                Occupancy Rate % by Room
              </h3>
              <span className="text-[11px] font-semibold text-slate-500">
                {filteredRooms.length} {filteredRooms.length === 1 ? 'Room' : 'Rooms'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Estimated utilization over 30-day operating window for {selectedPropertyId === 'all' ? 'all units' : currentProperty?.name}
            </p>
          </div>

          <div className="space-y-3.5 max-h-[300px] overflow-y-auto pr-1">
            {roomOccupancy.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400">
                No rooms configured for this property.
              </div>
            ) : (
              roomOccupancy.map((r) => (
                <div key={`${r.homestayName}-${r.name}`} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-slate-800">{r.name}</span>
                      {selectedPropertyId === 'all' && (
                        <span className="text-[10px] text-slate-400 ml-1.5">({r.homestayName})</span>
                      )}
                    </div>
                    <span className="font-bold text-brand-700">
                      {r.occupancy}% ({r.nights} nights)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-500 rounded-full transition-all"
                      style={{ width: `${r.occupancy}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Busiest Months */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-base">
              Guest Nights Volume: {selectedPropertyId === 'all' ? 'All Properties' : currentProperty?.name}
            </h3>
            <p className="text-xs text-slate-500 mb-4">Total booked guest nights across recent months</p>
          </div>
          <div className="h-64 w-full">
            {busiestMonths.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                No booked nights recorded yet for this view.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={busiestMonths} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorNightsScoped" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} />
                  <YAxis stroke="#94a3b8" fontSize={11} />
                  <Tooltip
                    formatter={(val: any) => [`${val} nights`, 'Booked Nights']}
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: 'none', color: '#fff' }}
                  />
                  <Area type="monotone" dataKey="nights" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorNightsScoped)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Row: Loyal Repeat Guests */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-bold text-slate-900 text-base">Loyal Repeat Guests</h3>
            <p className="text-xs text-slate-500">
              Guests with 2+ stays at {selectedPropertyId === 'all' ? 'any homestay' : currentProperty?.name}
            </p>
          </div>
          <span className="px-2.5 py-0.5 text-xs font-bold text-purple-700 bg-purple-50 rounded-full border border-purple-200">
            {repeatGuests.length} Repeat {repeatGuests.length === 1 ? 'Guest' : 'Guests'}
          </span>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto max-h-[300px]">
          {repeatGuests.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-400">
              No repeat guests with multiple bookings for this selection.
            </div>
          ) : (
            repeatGuests.map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-between p-3 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-slate-50 transition-colors"
              >
                <div>
                  <p className="text-xs font-bold text-slate-900">{g.name}</p>
                  <p className="text-[11px] text-slate-500">{g.phone}</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded-full border border-brand-200">
                    {g.count} Bookings
                  </span>
                  <p className="text-[11px] font-semibold text-slate-900 mt-1">
                    {formatCurrency(g.totalSpent)}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
