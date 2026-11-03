import React, { useState, useEffect, useMemo } from 'react';
import { Booking } from '../types';
import { api } from '../lib/supabase';
import { useHomestay } from '../contexts/HomestayContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/common/Toast';
import { StatusBadge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { formatCurrency } from '../lib/constants';
import {
  formatDisplayDate,
  calculateNights,
  TimeframePreset,
  getTimeframeDates,
  isBookingInDateRange,
} from '../lib/dateUtils';
import { exportBookingsToCSV } from '../lib/csvExport';
import {
  Search,
  Filter,
  Download,
  PlusCircle,
  CreditCard,
  LogIn,
  LogOut,
  Calendar,
  Phone,
  BedDouble,
  Building,
  Edit,
  Trash2,
  CheckCircle,
  CalendarDays,
  RotateCcw,
} from 'lucide-react';

interface BookingsPageProps {
  onOpenNewBooking: () => void;
  onOpenEditBooking: (b: Booking) => void;
  onOpenPaymentModal: (b: Booking) => void;
  onSelectBooking: (b: Booking) => void;
}

export const BookingsPage: React.FC<BookingsPageProps> = ({
  onOpenNewBooking,
  onOpenEditBooking,
  onOpenPaymentModal,
  onSelectBooking,
}) => {
  const { role } = useAuth();
  const { homestays, rooms, activeHomestayId, setActiveHomestayId } = useHomestay();
  const { showToast, showError } = useToast();

  const isOwnerOrAdmin = role === 'super_admin' || role === 'owner';

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  // In-app Delete Confirmation State (immune to browser window.confirm blocking)
  const [bookingToDelete, setBookingToDelete] = useState<Booking | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [homestayFilter, setHomestayFilter] = useState(activeHomestayId);
  const [unpaidOnly, setUnpaidOnly] = useState(false);
  const [selectedTimeframe, setSelectedTimeframe] = useState<TimeframePreset>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  const timeframe = useMemo(() => {
    return getTimeframeDates(selectedTimeframe, customStartDate, customEndDate);
  }, [selectedTimeframe, customStartDate, customEndDate]);

  useEffect(() => {
    setHomestayFilter(activeHomestayId);
  }, [activeHomestayId]);

  const fetchBookings = async () => {
    try {
      setLoading(true);
      const data = await api.getBookings();
      setBookings(data);
    } catch (err) {
      console.error('Failed to load bookings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  const hasActiveFilters =
    searchTerm.trim() !== '' ||
    statusFilter !== 'all' ||
    homestayFilter !== 'all' ||
    unpaidOnly ||
    selectedTimeframe !== 'all';

  const handleResetFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setHomestayFilter('all');
    setActiveHomestayId('all');
    setUnpaidOnly(false);
    setSelectedTimeframe('all');
    setCustomStartDate('');
    setCustomEndDate('');
  };

  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      // 1. Homestay / Property filter
      if (homestayFilter && homestayFilter !== 'all') {
        const hId = b.room?.homestay_id || rooms.find((r) => r.id === b.room_id)?.homestay_id;
        if (hId !== homestayFilter) return false;
      }

      // 2. Status filter
      if (statusFilter && statusFilter !== 'all') {
        if (b.status !== statusFilter) return false;
      }

      // 3. Unpaid only filter
      if (unpaidOnly) {
        const totalPaid = b.payments?.reduce((acc, p) => acc + Number(p.amount || 0), 0) || b.total_paid || 0;
        const balanceDue = Math.max(0, Number(b.total_amount || 0) - totalPaid);
        if (balanceDue <= 0 || b.status === 'cancelled') return false;
      }

      // 4. Search term (instant matching across name, phone, room, notes, ID)
      if (searchTerm.trim()) {
        const s = searchTerm.toLowerCase().trim();
        const matches =
          Boolean(b.guest?.name?.toLowerCase().includes(s)) ||
          Boolean(b.guest?.phone?.toLowerCase().includes(s)) ||
          Boolean(b.guest?.id_proof_note?.toLowerCase().includes(s)) ||
          Boolean(b.room?.name?.toLowerCase().includes(s)) ||
          Boolean(b.room?.homestay?.name?.toLowerCase().includes(s)) ||
          Boolean(b.notes?.toLowerCase().includes(s)) ||
          Boolean(b.id?.toLowerCase().includes(s));
        if (!matches) return false;
      }

      // 5. Timeframe / Date range filter
      if (!isBookingInDateRange(b.check_in, b.check_out, timeframe.startDate, timeframe.endDate)) {
        return false;
      }

      return true;
    });
  }, [bookings, homestayFilter, statusFilter, unpaidOnly, searchTerm, timeframe, rooms]);

  const handleExportCSV = () => {
    if (filteredBookings.length === 0) {
      showToast('No Data', 'No bookings available to export for current filters.', 'info');
      return;
    }
    exportBookingsToCSV(filteredBookings);
    showToast('Export Started', `Exported ${filteredBookings.length} bookings to CSV.`);
  };

  const handleQuickStatus = async (b: Booking, newStatus: Booking['status'], e: React.MouseEvent) => {
    e.stopPropagation();
    if (b.status === 'checked_out' && newStatus === 'checked_in') {
      showToast('Already Checked Out', 'This guest has already checked out and completed their stay.', 'warning');
      return;
    }
    try {
      await api.updateBookingStatus(b.id, newStatus);
      showToast('Status Updated', `Booking changed to ${newStatus.replace('_', ' ').toUpperCase()}`);
      fetchBookings();
    } catch (err) {
      showError(err, 'Could not update status');
    }
  };

  const handleDeleteBooking = (b: Booking, e: React.MouseEvent) => {
    e.stopPropagation();
    setBookingToDelete(b);
  };

  const handleConfirmDelete = async () => {
    if (!bookingToDelete) return;
    try {
      setIsDeleting(true);
      await api.deleteBooking(bookingToDelete.id);
      showToast('Booking Deleted', `Reservation for ${bookingToDelete.guest?.name || 'Guest'} has been removed.`);
      setBookingToDelete(null);
      fetchBookings();
    } catch (err: any) {
      showError(err, 'Failed to delete booking');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Header & Main Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-sm">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Guest Reservations
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage check-ins, payments, and dates with overlap protection
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-semibold rounded-xl border border-slate-200 flex items-center gap-1.5 transition-colors"
            title="Export filtered bookings to CSV"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={onOpenNewBooking}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs sm:text-sm font-bold rounded-xl shadow-md shadow-brand-600/20 flex items-center gap-1.5 transition-all hover:scale-[1.01]"
          >
            <PlusCircle className="w-4 h-4" />
            <span>New Booking</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search guest, phone, room..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:bg-white focus:ring-2 focus:ring-brand-500 focus:outline-none"
            />
          </div>

          {/* Homestay Selector */}
          <div>
            <select
              value={homestayFilter}
              onChange={(e) => {
                setHomestayFilter(e.target.value);
                setActiveHomestayId(e.target.value);
              }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium focus:bg-white focus:ring-2 focus:ring-brand-500 focus:outline-none"
            >
              <option value="all">All Homestays</option>
              {homestays.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium focus:bg-white focus:ring-2 focus:ring-brand-500 focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="booked">Booked (Upcoming)</option>
              <option value="checked_in">Checked In</option>
              <option value="checked_out">Checked Out</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {/* Unpaid Toggle Button */}
          <div className="flex items-center">
            <label className="flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl cursor-pointer w-full transition-colors">
              <input
                type="checkbox"
                checked={unpaidOnly}
                onChange={(e) => setUnpaidOnly(e.target.checked)}
                className="w-4 h-4 text-brand-600 rounded border-slate-300 focus:ring-brand-500"
              />
              <span className="text-xs font-semibold text-slate-700">Unpaid / Balance Due Only</span>
            </label>
          </div>
        </div>

        {/* Timeframe Presets */}
        <div className="pt-2 border-t border-slate-100 space-y-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5 text-brand-600" />
                Filter By Period:
              </span>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-brand-50 text-brand-700 border border-brand-200">
                {timeframe.label}
              </span>
              <span className="text-xs text-slate-400 font-medium">
                ({filteredBookings.length} {filteredBookings.length === 1 ? 'booking' : 'bookings'})
              </span>
            </div>

            {hasActiveFilters && (
              <button
                onClick={handleResetFilters}
                className="text-xs font-bold text-rose-600 hover:text-rose-800 flex items-center gap-1 hover:underline self-start sm:self-auto bg-rose-50 hover:bg-rose-100 px-2.5 py-1 rounded-lg border border-rose-200 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset All Filters</span>
              </button>
            )}
          </div>

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
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all ${
                    isSelected
                      ? 'bg-slate-900 text-white shadow-sm scale-[1.02]'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                  }`}
                >
                  <span>{preset.icon}</span>
                  <span>{preset.label}</span>
                </button>
              );
            })}
          </div>

          {selectedTimeframe === 'custom' && (
            <div className="pt-2 flex flex-wrap items-center gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-slate-600">From:</label>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-medium focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-slate-600">To:</label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-medium focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
              </div>
              {customStartDate && customEndDate && (
                <span className="text-xs font-bold text-brand-700 bg-brand-50 px-2 py-1 rounded-md border border-brand-200">
                  {calculateNights(customStartDate, customEndDate) + 1} day(s) selected
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bookings View: Desktop Table & Mobile Cards */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-slate-400 text-sm">
            Loading reservations...
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="text-center py-12 text-slate-400 space-y-2">
            <p className="text-base font-semibold text-slate-600">No bookings found</p>
            <p className="text-xs">
              {selectedTimeframe !== 'all'
                ? `No reservations found for ${timeframe.label}. Try selecting All Time.`
                : 'Try adjusting your search criteria or create a new reservation.'}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Guest</th>
                    <th className="px-4 py-3">Homestay & Room</th>
                    <th className="px-4 py-3">Dates (In → Out)</th>
                    <th className="px-4 py-3 text-right">Amount / Paid</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredBookings.map((b) => {
                    const totalPaid = b.payments?.reduce((acc, p) => acc + Number(p.amount), 0) || b.total_paid || 0;
                    const balanceDue = Math.max(0, Number(b.total_amount) - totalPaid);
                    const isFullyPaid = balanceDue <= 0;
                    const nights = calculateNights(b.check_in, b.check_out);

                    return (
                      <tr
                        key={b.id}
                        onClick={() => onSelectBooking(b)}
                        className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                      >
                        {/* Guest */}
                        <td className="px-4 py-3.5">
                          <p className="font-bold text-slate-900">{b.guest?.name || 'Guest'}</p>
                          <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                            <Phone className="w-3 h-3 text-slate-400" />
                            {b.guest?.phone}
                          </p>
                        </td>

                        {/* Property & Room */}
                        <td className="px-4 py-3.5">
                          <p className="text-xs font-semibold text-slate-800">{b.room?.homestay?.name}</p>
                          <p className="text-xs text-brand-700 font-bold mt-0.5">{b.room?.name}</p>
                        </td>

                        {/* Dates */}
                        <td className="px-4 py-3.5">
                          <p className="text-xs font-semibold text-slate-900">
                            {formatDisplayDate(b.check_in)} → {formatDisplayDate(b.check_out)}
                          </p>
                          <p className="text-[11px] text-slate-400 mt-0.5">{nights} Nights ({b.num_guests} guests)</p>
                        </td>

                        {/* Finances */}
                        <td className="px-4 py-3.5 text-right">
                          <p className="font-extrabold text-slate-900">{formatCurrency(b.total_amount)}</p>
                          <p
                            className={`text-xs font-semibold mt-0.5 ${
                              isFullyPaid ? 'text-emerald-600' : 'text-rose-600'
                            }`}
                          >
                            {isFullyPaid ? 'Paid' : `Due: ${formatCurrency(balanceDue)}`}
                          </p>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3.5">
                          <StatusBadge status={b.status} size="sm" />
                        </td>

                        {/* Action buttons */}
                        <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Check In / Out */}
                            {b.status === 'booked' && (
                              <button
                                onClick={(e) => handleQuickStatus(b, 'checked_in', e)}
                                className="px-2.5 py-1 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm"
                                title="Check In Guest"
                              >
                                Check In
                              </button>
                            )}
                            {b.status === 'checked_in' && (
                              <button
                                onClick={(e) => handleQuickStatus(b, 'checked_out', e)}
                                className="px-2.5 py-1 text-xs font-bold text-white bg-slate-700 hover:bg-slate-800 rounded-lg shadow-sm"
                                title="Check Out Guest"
                              >
                                Check Out
                              </button>
                            )}

                            {/* Payment action with double pay protection */}
                            {!isFullyPaid && b.status !== 'cancelled' ? (
                              <button
                                onClick={() => onOpenPaymentModal(b)}
                                className="px-2 py-1 text-xs font-bold text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-lg flex items-center gap-1"
                                title="Record payment"
                              >
                                <CreditCard className="w-3 h-3 text-brand-600" />
                                + Pay
                              </button>
                            ) : (
                              <span className="px-2 py-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-1">
                                <CheckCircle className="w-3 h-3 text-emerald-600" />
                                Paid
                              </span>
                            )}

                            {/* Working Edit button */}
                            <button
                              onClick={() => onOpenEditBooking(b)}
                              className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1 transition-colors"
                              title="Edit Booking"
                            >
                              <Edit className="w-3.5 h-3.5 text-slate-500" />
                              <span>Edit</span>
                            </button>

                            {/* Working Delete button (Owner / Super Admin) */}
                            {isOwnerOrAdmin && (
                              <button
                                onClick={(e) => handleDeleteBooking(b, e)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                title="Delete Booking"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List View */}
            <div className="md:hidden divide-y divide-slate-100">
              {filteredBookings.map((b) => {
                const totalPaid = b.payments?.reduce((acc, p) => acc + Number(p.amount), 0) || b.total_paid || 0;
                const balanceDue = Math.max(0, Number(b.total_amount) - totalPaid);
                const isFullyPaid = balanceDue <= 0;
                const nights = calculateNights(b.check_in, b.check_out);

                return (
                  <div
                    key={b.id}
                    onClick={() => onSelectBooking(b)}
                    className="p-4 hover:bg-slate-50 transition-colors space-y-2.5 cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-slate-900 text-sm">{b.guest?.name || 'Guest'}</p>
                        <p className="text-xs text-slate-500">{b.guest?.phone}</p>
                      </div>
                      <StatusBadge status={b.status} size="sm" />
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-700 bg-slate-50 p-2 rounded-xl">
                      <div>
                        <p className="font-semibold">{b.room?.homestay?.name}</p>
                        <p className="text-brand-700 font-bold">{b.room?.name}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">{formatDisplayDate(b.check_in)}</p>
                        <p className="text-[10px] text-slate-400">→ {formatDisplayDate(b.check_out)} ({nights}n)</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <div>
                        <span className="text-xs font-extrabold text-slate-900">
                          {formatCurrency(b.total_amount)}
                        </span>
                        {isFullyPaid ? (
                          <span className="text-xs font-bold text-emerald-600 ml-2">Fully Paid</span>
                        ) : (
                          <span className="text-xs font-bold text-rose-600 ml-2">
                            Due: {formatCurrency(balanceDue)}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap justify-end" onClick={(e) => e.stopPropagation()}>
                        {b.status === 'booked' && (
                          <button
                            onClick={(e) => handleQuickStatus(b, 'checked_in', e)}
                            className="px-2.5 py-1 text-xs font-bold text-white bg-emerald-600 rounded-lg"
                          >
                            Check In
                          </button>
                        )}
                        {b.status === 'checked_in' && (
                          <button
                            onClick={(e) => handleQuickStatus(b, 'checked_out', e)}
                            className="px-2.5 py-1 text-xs font-bold text-white bg-slate-800 rounded-lg"
                          >
                            Check Out
                          </button>
                        )}
                        {!isFullyPaid && b.status !== 'cancelled' ? (
                          <button
                            onClick={() => onOpenPaymentModal(b)}
                            className="px-2 py-1 text-xs font-bold text-brand-700 bg-brand-50 border border-brand-200 rounded-lg flex items-center gap-1"
                          >
                            <CreditCard className="w-3 h-3 text-brand-600" />
                            + Pay
                          </button>
                        ) : (
                          <span className="px-2 py-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-0.5">
                            <CheckCircle className="w-3 h-3 text-emerald-600" />
                            Paid
                          </span>
                        )}

                        <button
                          onClick={() => onOpenEditBooking(b)}
                          className="px-2 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1"
                          title="Edit Booking"
                        >
                          <Edit className="w-3 h-3 text-slate-500" />
                          <span>Edit</span>
                        </button>

                        {isOwnerOrAdmin && (
                          <button
                            onClick={(e) => handleDeleteBooking(b, e)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                            title="Delete Booking"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Delete Confirmation Modal (Native In-App Modal) */}
      {bookingToDelete && (
        <Modal
          isOpen={Boolean(bookingToDelete)}
          onClose={() => setBookingToDelete(null)}
          title="Delete Reservation"
          subtitle={`Ref: ${bookingToDelete.id}`}
          maxWidth="sm"
        >
          <div className="space-y-4">
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 space-y-1.5">
              <p className="font-bold text-sm text-rose-900">Permanently delete this reservation?</p>
              <div className="bg-white/70 p-2.5 rounded-lg border border-rose-100 space-y-1">
                <p>
                  Guest: <span className="font-bold text-slate-900">{bookingToDelete.guest?.name || 'Guest'}</span>
                </p>
                <p>
                  Property / Room: <span className="font-bold text-slate-900">{bookingToDelete.room?.homestay?.name} • {bookingToDelete.room?.name}</span>
                </p>
                <p>
                  Dates: <span className="font-bold text-slate-900">{bookingToDelete.check_in} → {bookingToDelete.check_out}</span>
                </p>
              </div>
              <p className="text-rose-700 text-[11px] pt-1">
                Warning: This action is permanent. All payment records and check-in history associated with this booking will be removed.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setBookingToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-sm transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? 'Deleting...' : 'Delete Permanently'}</span>
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
