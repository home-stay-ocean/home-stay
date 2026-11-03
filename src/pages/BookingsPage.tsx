import React, { useState, useEffect, useCallback } from 'react';
import { Booking, ReferralPerson } from '../types';
import { api } from '../lib/supabase';
import { useHomestay } from '../contexts/HomestayContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/common/Toast';
import { StatusBadge } from '../components/common/Badge';
import { Pagination } from '../components/common/Pagination';
import { formatCurrency, COMMISSION_STATUS_CONFIG, CHECKOUT_METHOD_CONFIG } from '../lib/constants';
import {
  formatDisplayDate,
  formatDisplayDateTime,
  formatDisplayTime,
  calculateNights,
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
  Wind,
  Users2,
  Clock,
  ChevronDown,
  ChevronUp,
  Sparkles,
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

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalCount, setTotalCount] = useState(0);

  // Data & Loading State
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [referralPersons, setReferralPersons] = useState<ReferralPerson[]>([]);
  const [loading, setLoading] = useState(true);

  // In-app Delete Confirmation State
  const [bookingToDelete, setBookingToDelete] = useState<Booking | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Filter States
  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [homestayFilter, setHomestayFilter] = useState(activeHomestayId);
  const [roomIdFilter, setRoomIdFilter] = useState('all');
  const [acFilter, setAcFilter] = useState<'all' | 'ac' | 'non_ac'>('all');
  const [referralFilter, setReferralFilter] = useState('all'); // 'all', 'direct', or referral_person_id
  const [commissionStatusFilter, setCommissionStatusFilter] = useState('all');
  const [checkoutMethodFilter, setCheckoutMethodFilter] = useState('all');
  const [checkInFrom, setCheckInFrom] = useState('');
  const [checkInTo, setCheckInTo] = useState('');
  const [checkOutFrom, setCheckOutFrom] = useState('');
  const [checkOutTo, setCheckOutTo] = useState('');
  const [unpaidOnly, setUnpaidOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'check_in' | 'check_out'>('newest');

  // Load referral persons for the filter dropdown
  useEffect(() => {
    api.getReferralPersons().then(setReferralPersons).catch(() => {});
  }, []);

  // Sync homestay filter with global context
  useEffect(() => {
    setHomestayFilter(activeHomestayId);
  }, [activeHomestayId]);

  // Fetch Paginated Bookings from Server
  const fetchBookings = useCallback(async () => {
    try {
      setLoading(true);
      const isAcParam = acFilter === 'all' ? undefined : acFilter === 'ac';
      const isDirectParam = referralFilter === 'direct' ? true : undefined;
      const refPersonParam =
        referralFilter !== 'all' && referralFilter !== 'direct' ? referralFilter : undefined;

      const pagedResult = await api.getBookingsPaged({
        page: currentPage,
        pageSize,
        homestay_id: homestayFilter,
        room_id: roomIdFilter,
        status: statusFilter,
        is_ac: isAcParam,
        direct_only: isDirectParam,
        referral_person_id: refPersonParam,
        commission_status: commissionStatusFilter,
        checkout_method: checkoutMethodFilter,
        check_in_from: checkInFrom || undefined,
        check_in_to: checkInTo || undefined,
        check_out_from: checkOutFrom || undefined,
        check_out_to: checkOutTo || undefined,
        unpaid_only: unpaidOnly,
        search: searchTerm.trim() || undefined,
        sort_by: sortBy,
      });

      setBookings(pagedResult.data);
      setTotalCount(pagedResult.totalCount);
    } catch (err) {
      console.error('Failed to load paged bookings:', err);
    } finally {
      setLoading(false);
    }
  }, [
    currentPage,
    pageSize,
    homestayFilter,
    roomIdFilter,
    statusFilter,
    acFilter,
    referralFilter,
    commissionStatusFilter,
    checkoutMethodFilter,
    checkInFrom,
    checkInTo,
    checkOutFrom,
    checkOutTo,
    unpaidOnly,
    searchTerm,
    sortBy,
  ]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  // Reset page to 1 whenever filters change
  const handleFilterChange = (setter: (val: any) => void, val: any) => {
    setter(val);
    setCurrentPage(1);
  };

  const hasActiveFilters =
    searchTerm.trim() !== '' ||
    statusFilter !== 'all' ||
    homestayFilter !== 'all' ||
    roomIdFilter !== 'all' ||
    acFilter !== 'all' ||
    referralFilter !== 'all' ||
    commissionStatusFilter !== 'all' ||
    checkoutMethodFilter !== 'all' ||
    checkInFrom !== '' ||
    checkInTo !== '' ||
    checkOutFrom !== '' ||
    checkOutTo !== '' ||
    unpaidOnly ||
    sortBy !== 'newest';

  const handleResetFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setHomestayFilter('all');
    setActiveHomestayId('all');
    setRoomIdFilter('all');
    setAcFilter('all');
    setReferralFilter('all');
    setCommissionStatusFilter('all');
    setCheckoutMethodFilter('all');
    setCheckInFrom('');
    setCheckInTo('');
    setCheckOutFrom('');
    setCheckOutTo('');
    setUnpaidOnly(false);
    setSortBy('newest');
    setCurrentPage(1);
  };

  const handleExportCSV = () => {
    if (bookings.length === 0) {
      showToast('No Data', 'No bookings available to export for current page.', 'info');
      return;
    }
    exportBookingsToCSV(bookings);
    showToast('Export Started', `Exported ${bookings.length} reservations to CSV.`);
  };

  const handleQuickStatus = async (b: Booking, newStatus: Booking['status'], e: React.MouseEvent) => {
    e.stopPropagation();
    if (b.status === 'checked_out' && newStatus === 'checked_in') {
      showToast('Already Checked Out', 'This guest has already checked out and completed their stay.', 'warning');
      return;
    }
    try {
      await api.updateBookingStatus(b.id, newStatus, 'manual');
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

  // Rooms filtered by chosen homestay for the room filter
  const selectableRooms = rooms.filter(
    (r) => homestayFilter === 'all' || r.homestay_id === homestayFilter
  );

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Header & Main Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              Guest Reservations
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-brand-50 text-brand-700 border border-brand-200">
              {totalCount.toLocaleString('en-IN')} Total Records
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Scalable reservation management • Server-side pagination • Overlap & duplicate customer protection
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-semibold rounded-xl border border-slate-200 flex items-center gap-1.5 transition-colors"
            title="Export currently loaded page to CSV"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>Export Page</span>
          </button>
          <button
            onClick={onOpenNewBooking}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs sm:text-sm font-bold rounded-xl shadow-md shadow-brand-600/20 flex items-center gap-1.5 transition-all hover:scale-[1.01]"
          >
            <PlusCircle className="w-4 h-4" />
            <span>New Reservation</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        {/* Primary Filter Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search Input */}
          <div className="relative lg:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => handleFilterChange(setSearchTerm, e.target.value)}
              placeholder="Search booking #, guest name, phone, notes..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium focus:bg-white focus:ring-2 focus:ring-brand-500 focus:outline-none"
            />
          </div>

          {/* Homestay Selector */}
          <div>
            <select
              value={homestayFilter}
              onChange={(e) => {
                handleFilterChange(setHomestayFilter, e.target.value);
                setActiveHomestayId(e.target.value);
              }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold text-slate-700 focus:bg-white focus:ring-2 focus:ring-brand-500 focus:outline-none"
            >
              <option value="all">All Homestays</option>
              {homestays.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status Selector */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => handleFilterChange(setStatusFilter, e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold text-slate-700 focus:bg-white focus:ring-2 focus:ring-brand-500 focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="booked">Booked</option>
              <option value="checked_in">Checked In</option>
              <option value="checked_out">Checked Out</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {/* Sort By */}
          <div>
            <select
              value={sortBy}
              onChange={(e) => handleFilterChange(setSortBy, e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold text-slate-700 focus:bg-white focus:ring-2 focus:ring-brand-500 focus:outline-none"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="check_in">Check-In Date</option>
              <option value="check_out">Check-Out Date</option>
            </select>
          </div>
        </div>

        {/* Advanced Filters Toggle Button */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setIsAdvancedFiltersOpen(!isAdvancedFiltersOpen)}
            className="flex items-center gap-1.5 text-xs font-bold text-brand-600 hover:text-brand-700"
          >
            <Filter className="w-3.5 h-3.5" />
            <span>{isAdvancedFiltersOpen ? 'Hide Advanced Filters' : 'Show Advanced Filters'}</span>
            {isAdvancedFiltersOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          <div className="flex items-center gap-3">
            {/* Unpaid Only Checkbox */}
            <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={unpaidOnly}
                onChange={(e) => handleFilterChange(setUnpaidOnly, e.target.checked)}
                className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 border-slate-300"
              />
              <span className="font-semibold">Unpaid Balance Only</span>
            </label>

            {hasActiveFilters && (
              <button
                onClick={handleResetFilters}
                className="px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-lg flex items-center gap-1 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Filters</span>
              </button>
            )}
          </div>
        </div>

        {/* Collapsible Advanced Filters Panel */}
        {isAdvancedFiltersOpen && (
          <div className="p-4 bg-slate-50/80 border border-slate-200 rounded-xl space-y-3 animate-fadeIn">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              {/* Room Filter */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                  Specific Room
                </label>
                <select
                  value={roomIdFilter}
                  onChange={(e) => handleFilterChange(setRoomIdFilter, e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-medium"
                >
                  <option value="all">All Rooms</option>
                  {selectableRooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.is_ac ? 'AC' : 'Non-AC'})
                    </option>
                  ))}
                </select>
              </div>

              {/* AC vs Non-AC */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                  AC / Non-AC
                </label>
                <select
                  value={acFilter}
                  onChange={(e) => handleFilterChange(setAcFilter, e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-medium"
                >
                  <option value="all">All (AC & Non-AC)</option>
                  <option value="ac">AC Rooms Only</option>
                  <option value="non_ac">Non-AC Rooms Only</option>
                </select>
              </div>

              {/* Referral Person / Direct */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                  Referral / Brought By
                </label>
                <select
                  value={referralFilter}
                  onChange={(e) => handleFilterChange(setReferralFilter, e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-medium"
                >
                  <option value="all">All Bookings</option>
                  <option value="direct">Direct Booking (No Referral)</option>
                  {referralPersons.map((rp) => (
                    <option key={rp.id} value={rp.id}>
                      {rp.name} ({rp.phone})
                    </option>
                  ))}
                </select>
              </div>

              {/* Commission Status */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                  Commission Status
                </label>
                <select
                  value={commissionStatusFilter}
                  onChange={(e) => handleFilterChange(setCommissionStatusFilter, e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-medium"
                >
                  <option value="all">All Commissions</option>
                  <option value="pending">Pending Approval</option>
                  <option value="approved">Approved</option>
                  <option value="paid">Paid</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>

            {/* Date ranges & checkout method */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs pt-2 border-t border-slate-200/60">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Check-In From
                </label>
                <input
                  type="date"
                  value={checkInFrom}
                  onChange={(e) => handleFilterChange(setCheckInFrom, e.target.value)}
                  className="w-full px-2.5 py-1 bg-white border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Check-In Until
                </label>
                <input
                  type="date"
                  value={checkInTo}
                  onChange={(e) => handleFilterChange(setCheckInTo, e.target.value)}
                  className="w-full px-2.5 py-1 bg-white border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Check-Out From
                </label>
                <input
                  type="date"
                  value={checkOutFrom}
                  onChange={(e) => handleFilterChange(setCheckOutFrom, e.target.value)}
                  className="w-full px-2.5 py-1 bg-white border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Check-Out Until
                </label>
                <input
                  type="date"
                  value={checkOutTo}
                  onChange={(e) => handleFilterChange(setCheckOutTo, e.target.value)}
                  className="w-full px-2.5 py-1 bg-white border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Checkout Method
                </label>
                <select
                  value={checkoutMethodFilter}
                  onChange={(e) => handleFilterChange(setCheckoutMethodFilter, e.target.value)}
                  className="w-full px-2.5 py-1 bg-white border border-slate-200 rounded-lg font-medium"
                >
                  <option value="all">All Methods</option>
                  <option value="manual">Manual Checkout</option>
                  <option value="automatic">Auto (12 PM IST)</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bookings Table View */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            <div className="w-8 h-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            Loading reservations from database...
          </div>
        ) : bookings.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="font-bold text-slate-700 text-base">No matching reservations found</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
              Try adjusting your search keywords, clearing date filters, or create a new reservation.
            </p>
            {hasActiveFilters && (
              <button
                onClick={handleResetFilters}
                className="mt-4 px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
              >
                Reset All Filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Booking Ref</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Property & Room</th>
                  <th className="py-3 px-4">Stay Dates</th>
                  <th className="py-3 px-4">Timestamps & Method</th>
                  <th className="py-3 px-4">Referred By / Commission</th>
                  <th className="py-3 px-4">Payment</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {bookings.map((b) => {
                  const nights = calculateNights(b.check_in, b.check_out);
                  const isFullyPaid = (b.balance_due || 0) <= 0;
                  const bookingNumber = b.booking_number || `HS-${b.id.substring(0, 8).toUpperCase()}`;

                  return (
                    <tr
                      key={b.id}
                      onClick={() => onSelectBooking(b)}
                      className="hover:bg-slate-50/80 cursor-pointer transition-colors group"
                    >
                      {/* Booking Number */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="font-mono font-extrabold text-brand-700 bg-brand-50 px-2 py-0.5 rounded border border-brand-100">
                          {bookingNumber}
                        </span>
                        <span className="block text-[10px] text-slate-400 mt-1">
                          {formatDisplayDate(b.created_at)}
                        </span>
                      </td>

                      {/* Customer Info */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 group-hover:text-brand-600 transition-colors">
                          {b.guest?.name || 'Guest'}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 text-slate-400" />
                          <span>{b.guest?.phone || '-'}</span>
                        </div>
                      </td>

                      {/* Room & AC / Non-AC */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{b.room?.name || 'Room'}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {b.room?.homestay?.name || 'Homestay'}
                        </div>
                        <span
                          className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.2 rounded mt-1 ${
                            b.is_ac
                              ? 'bg-cyan-50 text-cyan-700 border border-cyan-200'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          <Wind className="w-2.5 h-2.5" />
                          {b.is_ac ? 'AC' : 'Non-AC'}
                        </span>
                      </td>

                      {/* Stay Dates */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-bold text-slate-800">
                          {formatDisplayDate(b.check_in)} → {formatDisplayDate(b.check_out)}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5 font-medium">
                          {nights} {nights === 1 ? 'Night' : 'Nights'} • {b.num_guests} Guests
                        </div>
                      </td>

                      {/* Timestamps & Checkout Method */}
                      <td className="py-3 px-4 whitespace-nowrap text-[11px]">
                        <div>
                          <span className="text-slate-400 text-[10px]">In: </span>
                          <span className="font-semibold text-slate-800">
                            {b.check_in_at ? formatDisplayTime(b.check_in_at) : '-'}
                          </span>
                        </div>
                        <div className="mt-0.5">
                          <span className="text-slate-400 text-[10px]">Out: </span>
                          <span className="font-semibold text-slate-800">
                            {b.actual_checkout_at ? formatDisplayTime(b.actual_checkout_at) : 'Pending'}
                          </span>
                          {b.checkout_method === 'automatic' && (
                            <span className="ml-1 text-[9px] font-bold bg-purple-100 text-purple-700 px-1 rounded">
                              Auto 12 PM
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Referral Person & Commission */}
                      <td className="py-3 px-4">
                        {b.referral_person_id || b.manual_referral_name ? (
                          <div>
                            <div className="font-bold text-slate-900 flex items-center gap-1">
                              <Users2 className="w-3 h-3 text-amber-600" />
                              <span>{b.referral_person?.name || b.manual_referral_name}</span>
                            </div>
                            <div className="text-[11px] font-semibold text-amber-800 mt-0.5">
                              Comm: {formatCurrency(b.commission_amount)}
                              <span
                                className={`ml-1.5 text-[9px] font-bold uppercase px-1 py-0.2 rounded border ${
                                  COMMISSION_STATUS_CONFIG[b.commission_status || 'pending']?.bg || 'bg-amber-50'
                                } ${COMMISSION_STATUS_CONFIG[b.commission_status || 'pending']?.text || 'text-amber-700'}`}
                              >
                                {b.commission_status || 'pending'}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">Direct Booking</span>
                        )}
                      </td>

                      {/* Payment */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-extrabold text-slate-900">
                          {formatCurrency(b.total_amount)}
                        </div>
                        {isFullyPaid ? (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700">
                            <CheckCircle className="w-2.5 h-2.5" />
                            Paid
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-rose-600">
                            Due: {formatCurrency(b.balance_due)}
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <StatusBadge status={b.status} />
                      </td>

                      {/* Quick Actions */}
                      <td
                        className="py-3 px-4 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-1">
                          {/* Payment modal trigger */}
                          {!isFullyPaid && b.status !== 'cancelled' && (
                            <button
                              onClick={() => onOpenPaymentModal(b)}
                              title="Record Payment"
                              className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                            >
                              <CreditCard className="w-4 h-4" />
                            </button>
                          )}

                          {/* Quick Check-In / Check-Out */}
                          {b.status === 'booked' && (
                            <button
                              onClick={(e) => handleQuickStatus(b, 'checked_in', e)}
                              title="Quick Check-In"
                              className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                            >
                              <LogIn className="w-4 h-4" />
                            </button>
                          )}

                          {b.status === 'checked_in' && (
                            <button
                              onClick={(e) => handleQuickStatus(b, 'checked_out', e)}
                              title="Quick Check-Out"
                              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                            >
                              <LogOut className="w-4 h-4" />
                            </button>
                          )}

                          {/* Edit button */}
                          <button
                            onClick={() => onOpenEditBooking(b)}
                            title="Edit Reservation"
                            className="p-1.5 text-slate-500 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                          >
                            <Edit className="w-4 h-4" />
                          </button>

                          {/* Delete button (Owner / Admin) */}
                          {isOwnerOrAdmin && (
                            <button
                              onClick={(e) => handleDeleteBooking(b, e)}
                              title="Delete Reservation"
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
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
        )}

        {/* Server-Side Pagination Bar */}
        <Pagination
          currentPage={currentPage}
          pageSize={pageSize}
          totalCount={totalCount}
          onPageChange={setCurrentPage}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize);
            setCurrentPage(1);
          }}
          isLoading={loading}
        />
      </div>

      {/* Delete Confirmation Modal */}
      {bookingToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 animate-fadeIn">
            <h3 className="text-base font-bold text-slate-900">
              Delete Reservation {bookingToDelete.booking_number || bookingToDelete.id}?
            </h3>
            <p className="text-xs text-slate-500 mt-2">
              Are you sure you want to remove the booking for{' '}
              <span className="font-bold text-slate-800">
                {bookingToDelete.guest?.name || 'Guest'}
              </span>
              ? All associated payment records will also be removed.
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={() => setBookingToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-sm"
              >
                {isDeleting ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
