import React, { useState, useEffect, useCallback } from 'react';
import { ReferralPerson, CommissionType, CommissionStatus, Booking } from '../types';
import { api } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/common/Toast';
import { Modal } from '../components/common/Modal';
import { Pagination } from '../components/common/Pagination';
import { formatCurrency, COMMISSION_STATUS_CONFIG } from '../lib/constants';
import {
  formatDisplayDate,
  formatDisplayDateTime,
  TimeframePreset,
  getTimeframeDates,
} from '../lib/dateUtils';
import {
  Users2,
  PlusCircle,
  Search,
  Filter,
  DollarSign,
  TrendingUp,
  Award,
  CheckCircle,
  Clock,
  Edit,
  Trash2,
  Calendar,
  Check,
  CheckCheck,
  XCircle,
  Wind,
} from 'lucide-react';

export const ReferralsPage: React.FC = () => {
  const { role } = useAuth();
  const { showToast, showError } = useToast();
  const isOwnerOrAdmin = role === 'super_admin' || role === 'owner';

  const [activeTab, setActiveTab] = useState<'reports' | 'persons'>('reports');

  // Referral Persons Management State
  const [persons, setPersons] = useState<ReferralPerson[]>([]);
  const [personsLoading, setPersonsLoading] = useState(true);
  const [personSearch, setPersonSearch] = useState('');
  const [personPage, setPersonPage] = useState(1);
  const [personPageSize, setPersonPageSize] = useState(50);
  const [personTotalCount, setPersonTotalCount] = useState(0);

  // Person Add/Edit Modal
  const [isPersonModalOpen, setIsPersonModalOpen] = useState(false);
  const [personToEdit, setPersonToEdit] = useState<ReferralPerson | null>(null);
  const [personName, setPersonName] = useState('');
  const [personPhone, setPersonPhone] = useState('');
  const [personEmail, setPersonEmail] = useState('');
  const [commType, setCommType] = useState<CommissionType>('percentage');
  const [commRate, setCommRate] = useState<number>(10);
  const [personNotes, setPersonNotes] = useState('');
  const [personSaving, setPersonSaving] = useState(false);

  // Commission Reports State
  const [selectedTimeframe, setSelectedTimeframe] = useState<TimeframePreset>('this_month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [selectedPersonFilter, setSelectedPersonFilter] = useState('all');
  const [commStatusFilter, setCommStatusFilter] = useState('all');

  // Commission Transactions Paged Table
  const [commBookings, setCommBookings] = useState<Booking[]>([]);
  const [commLoading, setCommLoading] = useState(true);
  const [commPage, setCommPage] = useState(1);
  const [commPageSize, setCommPageSize] = useState(50);
  const [commTotalCount, setCommTotalCount] = useState(0);

  // Payout Modal State
  const [payoutBooking, setPayoutBooking] = useState<Booking | null>(null);
  const [payoutNotes, setPayoutNotes] = useState('');
  const [isPayoutSaving, setIsPayoutSaving] = useState(false);

  const timeframe = getTimeframeDates(selectedTimeframe, customStart, customEnd);

  // Load Persons List
  const fetchPersons = useCallback(async () => {
    try {
      setPersonsLoading(true);
      const res = await api.getReferralPersonsPaged({
        page: personPage,
        pageSize: personPageSize,
        search: personSearch.trim() || undefined,
      });
      setPersons(res.data);
      setPersonTotalCount(res.totalCount);
    } catch (err) {
      console.error('Failed to load referral persons:', err);
    } finally {
      setPersonsLoading(false);
    }
  }, [personPage, personPageSize, personSearch]);

  useEffect(() => {
    fetchPersons();
  }, [fetchPersons]);

  // Load Commission Transactions
  const fetchCommissionBookings = useCallback(async () => {
    try {
      setCommLoading(true);
      const res = await api.getBookingsPaged({
        page: commPage,
        pageSize: commPageSize,
        referral_person_id: selectedPersonFilter !== 'all' ? selectedPersonFilter : undefined,
        commission_status: commStatusFilter !== 'all' ? commStatusFilter : undefined,
        check_in_from: timeframe.startDate,
        check_in_to: timeframe.endDate,
        sort_by: 'newest',
      });

      // Filter to only bookings with a referral person
      const referredOnly = res.data.filter((b) => b.referral_person_id || b.manual_referral_name);
      setCommBookings(referredOnly);
      setCommTotalCount(res.totalCount);
    } catch (err) {
      console.error('Failed to load commission bookings:', err);
    } finally {
      setCommLoading(false);
    }
  }, [commPage, commPageSize, selectedPersonFilter, commStatusFilter, timeframe]);

  useEffect(() => {
    fetchCommissionBookings();
  }, [fetchCommissionBookings]);

  // Calculate aggregated KPIs across loaded persons
  const totalReferredBookings = persons.reduce((sum, p) => sum + (p.total_bookings || 0), 0);
  const totalAcBookings = persons.reduce((sum, p) => sum + (p.ac_bookings || 0), 0);
  const totalNonAcBookings = persons.reduce((sum, p) => sum + (p.non_ac_bookings || 0), 0);
  const totalReferredRevenue = persons.reduce((sum, p) => sum + (p.total_revenue || 0), 0);
  const totalCommissionPayable = persons.reduce((sum, p) => sum + (p.commission_payable || 0), 0);
  const totalCommissionPaid = persons.reduce((sum, p) => sum + (p.commission_paid || 0), 0);
  const totalCommissionPending = persons.reduce((sum, p) => sum + (p.commission_pending || 0), 0);

  // Open Add/Edit Modal
  const handleOpenAddPerson = () => {
    setPersonToEdit(null);
    setPersonName('');
    setPersonPhone('');
    setPersonEmail('');
    setCommType('percentage');
    setCommRate(10);
    setPersonNotes('');
    setIsPersonModalOpen(true);
  };

  const handleOpenEditPerson = (p: ReferralPerson) => {
    setPersonToEdit(p);
    setPersonName(p.name);
    setPersonPhone(p.phone);
    setPersonEmail(p.email || '');
    setCommType(p.commission_type);
    setCommRate(p.default_commission_rate);
    setPersonNotes(p.notes || '');
    setIsPersonModalOpen(true);
  };

  const handleSavePerson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!personName.trim() || !personPhone.trim()) {
      showToast('Validation Error', 'Please enter referral person name and phone number.', 'warning');
      return;
    }

    try {
      setPersonSaving(true);
      await api.saveReferralPerson({
        id: personToEdit?.id,
        name: personName.trim(),
        phone: personPhone.trim(),
        email: personEmail.trim() || null,
        commission_type: commType,
        default_commission_rate: Number(commRate),
        notes: personNotes.trim() || null,
      });

      showToast(
        personToEdit ? 'Referral Person Updated' : 'Referral Person Added',
        `${personName} is ready to be linked to guest reservations.`
      );
      setIsPersonModalOpen(false);
      fetchPersons();
    } catch (err: any) {
      showError(err, 'Failed to save referral person');
    } finally {
      setPersonSaving(false);
    }
  };

  // Quick Commission Approval
  const handleApproveCommission = async (bookingId: string) => {
    try {
      await api.updateCommissionStatus(bookingId, 'approved');
      showToast('Commission Approved', 'The commission has been approved for payout.');
      fetchCommissionBookings();
      fetchPersons();
    } catch (err) {
      showError(err, 'Could not approve commission');
    }
  };

  // Submit Commission Payout
  const handleConfirmPayout = async () => {
    if (!payoutBooking) return;
    try {
      setIsPayoutSaving(true);
      await api.updateCommissionStatus(payoutBooking.id, 'paid', payoutNotes.trim() || undefined);
      showToast('Commission Paid', `Recorded payment of ${formatCurrency(payoutBooking.commission_amount)}`);
      setPayoutBooking(null);
      setPayoutNotes('');
      fetchCommissionBookings();
      fetchPersons();
    } catch (err) {
      showError(err, 'Failed to record commission payout');
    } finally {
      setIsPayoutSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-sm">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Referral & Commission Management
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Track referral partners (auto drivers, local guides, agents), commissions snapshot, and payouts
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isOwnerOrAdmin && (
            <button
              onClick={handleOpenAddPerson}
              className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs sm:text-sm font-bold rounded-xl shadow-md shadow-brand-600/20 flex items-center gap-1.5 transition-all"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Add Referral Person</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Overview Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Referred Bookings
          </span>
          <p className="text-xl font-extrabold text-slate-900 mt-1">
            {totalReferredBookings.toLocaleString('en-IN')}
          </p>
          <span className="text-[10px] text-slate-500">Across all partners</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            AC vs Non-AC
          </span>
          <p className="text-sm font-extrabold text-slate-800 mt-1 flex items-center gap-1.5">
            <span className="text-cyan-700">{totalAcBookings} AC</span>
            <span>•</span>
            <span className="text-slate-600">{totalNonAcBookings} Non-AC</span>
          </p>
          <span className="text-[10px] text-slate-400">Room breakdowns</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Total Revenue
          </span>
          <p className="text-xl font-extrabold text-slate-900 mt-1">
            {formatCurrency(totalReferredRevenue)}
          </p>
          <span className="text-[10px] text-slate-500">From brought guests</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">
            Commission Payable
          </span>
          <p className="text-xl font-extrabold text-amber-700 mt-1">
            {formatCurrency(totalCommissionPayable)}
          </p>
          <span className="text-[10px] text-amber-600">Pending & approved</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">
            Commission Paid
          </span>
          <p className="text-xl font-extrabold text-emerald-700 mt-1">
            {formatCurrency(totalCommissionPaid)}
          </p>
          <span className="text-[10px] text-emerald-600">Total settled</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wider block">
            Pending Approval
          </span>
          <p className="text-xl font-extrabold text-rose-700 mt-1">
            {formatCurrency(totalCommissionPending)}
          </p>
          <span className="text-[10px] text-rose-500">Awaiting management</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('reports')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'reports'
              ? 'bg-brand-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>Commission Transactions & Reports</span>
        </button>

        <button
          onClick={() => setActiveTab('persons')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'persons'
              ? 'bg-brand-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Users2 className="w-4 h-4" />
          <span>Referral Persons Directory ({personTotalCount})</span>
        </button>
      </div>

      {/* TAB 1: Commission Transactions & Reports */}
      {activeTab === 'reports' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-xs">
              {/* Timeframe Presets */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                  Timeframe
                </label>
                <select
                  value={selectedTimeframe}
                  onChange={(e) => setSelectedTimeframe(e.target.value as TimeframePreset)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold"
                >
                  <option value="today">Today</option>
                  <option value="yesterday">Yesterday</option>
                  <option value="this_week">This Week</option>
                  <option value="this_month">This Month</option>
                  <option value="last_month">Previous Month</option>
                  <option value="last_30_days">Last 30 Days</option>
                  <option value="this_year">This Year</option>
                  <option value="custom">Custom Date Range</option>
                  <option value="all">All Time</option>
                </select>
              </div>

              {/* Referral Person Filter */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                  Referral Person
                </label>
                <select
                  value={selectedPersonFilter}
                  onChange={(e) => setSelectedPersonFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold"
                >
                  <option value="all">All Referral Persons</option>
                  {persons.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.phone})
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
                  value={commStatusFilter}
                  onChange={(e) => setCommStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold"
                >
                  <option value="all">All Statuses</option>
                  <option value="pending">Pending Approval</option>
                  <option value="approved">Approved</option>
                  <option value="paid">Paid</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>

            {/* Custom Range row if custom selected */}
            {selectedTimeframe === 'custom' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">End Date</label>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Transactions Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {commLoading ? (
              <div className="p-10 text-center text-slate-400 text-xs">
                Loading commission records...
              </div>
            ) : commBookings.length === 0 ? (
              <div className="p-10 text-center text-slate-400 text-xs">
                No referral commission records found for this period.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-4">Booking Ref</th>
                      <th className="py-3 px-4">Referral Person</th>
                      <th className="py-3 px-4">Guest</th>
                      <th className="py-3 px-4">Room & AC Spec</th>
                      <th className="py-3 px-4">Booking Revenue</th>
                      <th className="py-3 px-4">Snapshot Rate</th>
                      <th className="py-3 px-4">Commission</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Payout Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {commBookings.map((b) => {
                      const refName = b.referral_person?.name || b.manual_referral_name || 'Referral';
                      return (
                        <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-brand-700">
                            {b.booking_number || b.id.substring(0, 8).toUpperCase()}
                          </td>

                          <td className="py-3 px-4 font-bold text-slate-900">
                            {refName}
                            {b.referral_person?.phone && (
                              <span className="block text-[10px] text-slate-400 font-normal">
                                {b.referral_person.phone}
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-4 text-slate-800">
                            <span className="font-semibold">{b.guest?.name || 'Guest'}</span>
                            <span className="block text-[10px] text-slate-400">{b.guest?.phone}</span>
                          </td>

                          <td className="py-3 px-4">
                            <span className="font-semibold">{b.room?.name}</span>
                            <span
                              className={`ml-1.5 text-[9px] font-bold px-1.5 py-0.2 rounded border ${
                                b.is_ac
                                  ? 'bg-cyan-50 text-cyan-700 border-cyan-200'
                                  : 'bg-slate-100 text-slate-600 border-slate-200'
                              }`}
                            >
                              {b.is_ac ? 'AC' : 'Non-AC'}
                            </span>
                          </td>

                          <td className="py-3 px-4 font-extrabold text-slate-900">
                            {formatCurrency(b.total_amount)}
                          </td>

                          <td className="py-3 px-4 text-slate-600">
                            {b.commission_type === 'percentage'
                              ? `${b.commission_rate}%`
                              : formatCurrency(b.commission_rate)}
                          </td>

                          <td className="py-3 px-4 font-extrabold text-amber-700 text-sm">
                            {formatCurrency(b.commission_amount)}
                          </td>

                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                COMMISSION_STATUS_CONFIG[b.commission_status || 'pending']?.bg || 'bg-amber-50'
                              } ${COMMISSION_STATUS_CONFIG[b.commission_status || 'pending']?.text || 'text-amber-800'}`}
                            >
                              {b.commission_status?.toUpperCase() || 'PENDING'}
                            </span>
                          </td>

                          <td className="py-3 px-4 text-right">
                            {isOwnerOrAdmin && b.status !== 'cancelled' ? (
                              <div className="flex items-center justify-end gap-1.5">
                                {b.commission_status === 'pending' && (
                                  <button
                                    onClick={() => handleApproveCommission(b.id)}
                                    className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold"
                                  >
                                    Approve
                                  </button>
                                )}

                                {b.commission_status !== 'paid' && (
                                  <button
                                    onClick={() => {
                                      setPayoutBooking(b);
                                      setPayoutNotes('');
                                    }}
                                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm"
                                  >
                                    Pay Now
                                  </button>
                                )}

                                {b.commission_status === 'paid' && (
                                  <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                    Settled
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-400">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <Pagination
              currentPage={commPage}
              pageSize={commPageSize}
              totalCount={commTotalCount}
              onPageChange={setCommPage}
              onPageSizeChange={(sz) => {
                setCommPageSize(sz);
                setCommPage(1);
              }}
              isLoading={commLoading}
            />
          </div>
        </div>
      )}

      {/* TAB 2: Referral Persons Directory */}
      {activeTab === 'persons' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={personSearch}
                onChange={(e) => {
                  setPersonSearch(e.target.value);
                  setPersonPage(1);
                }}
                placeholder="Search referral name, phone..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium focus:bg-white focus:ring-2 focus:ring-brand-500 focus:outline-none"
              />
            </div>

            {isOwnerOrAdmin && (
              <button
                onClick={handleOpenAddPerson}
                className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Add Person</span>
              </button>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {personsLoading ? (
              <div className="p-10 text-center text-slate-400 text-xs">Loading partners...</div>
            ) : persons.length === 0 ? (
              <div className="p-10 text-center text-slate-400 text-xs">No referral persons found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-4">Name & Contact</th>
                      <th className="py-3 px-4">Default Commission</th>
                      <th className="py-3 px-4">Bookings Brought</th>
                      <th className="py-3 px-4">AC / Non-AC</th>
                      <th className="py-3 px-4">Total Revenue</th>
                      <th className="py-3 px-4">Payable</th>
                      <th className="py-3 px-4">Paid</th>
                      <th className="py-3 px-4">Pending</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {persons.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-bold text-slate-900">
                          {p.name}
                          <span className="block text-[11px] text-slate-500 font-medium">{p.phone}</span>
                        </td>

                        <td className="py-3 px-4 font-semibold text-slate-800">
                          {p.commission_type === 'percentage'
                            ? `${p.default_commission_rate}%`
                            : formatCurrency(p.default_commission_rate)}
                        </td>

                        <td className="py-3 px-4 font-bold text-slate-900">
                          {p.total_bookings || 0}
                        </td>

                        <td className="py-3 px-4 text-slate-600">
                          {p.ac_bookings || 0} AC • {p.non_ac_bookings || 0} Non-AC
                        </td>

                        <td className="py-3 px-4 font-extrabold text-slate-900">
                          {formatCurrency(p.total_revenue || 0)}
                        </td>

                        <td className="py-3 px-4 font-bold text-amber-700">
                          {formatCurrency(p.commission_payable || 0)}
                        </td>

                        <td className="py-3 px-4 font-bold text-emerald-700">
                          {formatCurrency(p.commission_paid || 0)}
                        </td>

                        <td className="py-3 px-4 font-bold text-rose-700">
                          {formatCurrency(p.commission_pending || 0)}
                        </td>

                        <td className="py-3 px-4 text-right">
                          {isOwnerOrAdmin && (
                            <button
                              onClick={() => handleOpenEditPerson(p)}
                              className="p-1.5 text-slate-500 hover:text-brand-600 hover:bg-brand-50 rounded-lg"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <Pagination
              currentPage={personPage}
              pageSize={personPageSize}
              totalCount={personTotalCount}
              onPageChange={setPersonPage}
              onPageSizeChange={(sz) => {
                setPersonPageSize(sz);
                setPersonPage(1);
              }}
              isLoading={personsLoading}
            />
          </div>
        </div>
      )}

      {/* Add / Edit Referral Person Modal */}
      <Modal
        isOpen={isPersonModalOpen}
        onClose={() => setIsPersonModalOpen(false)}
        title={personToEdit ? 'Edit Referral Person' : 'Add Referral Person'}
        subtitle="Manage referral partner contact details and commission rate"
        maxWidth="md"
      >
        <form onSubmit={handleSavePerson} className="space-y-4 text-xs">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
              Full Name *
            </label>
            <input
              type="text"
              value={personName}
              onChange={(e) => setPersonName(e.target.value)}
              placeholder="e.g. Ramesh Kumar (Local Taxi Operator)"
              required
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                Phone Number *
              </label>
              <input
                type="tel"
                value={personPhone}
                onChange={(e) => setPersonPhone(e.target.value)}
                placeholder="e.g. 9876543210"
                required
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={personEmail}
                onChange={(e) => setPersonEmail(e.target.value)}
                placeholder="optional@domain.com"
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                Commission Type
              </label>
              <select
                value={commType}
                onChange={(e) => setCommType(e.target.value as CommissionType)}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-bold"
              >
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed Rate (₹)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                Default Rate {commType === 'percentage' ? '(%)' : '(₹)'}
              </label>
              <input
                type="number"
                min="0"
                value={commRate}
                onChange={(e) => setCommRate(Number(e.target.value))}
                required
                className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-bold"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
              Internal Notes / Bank / UPI Details
            </label>
            <input
              type="text"
              value={personNotes}
              onChange={(e) => setPersonNotes(e.target.value)}
              placeholder="e.g. UPI ID: ramesh@upi / Auto stand near railway station"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsPersonModalOpen(false)}
              className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={personSaving}
              className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl shadow-md disabled:opacity-50"
            >
              {personSaving ? 'Saving...' : personToEdit ? 'Save Changes' : 'Create Person'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Payout Confirmation Modal */}
      {payoutBooking && (
        <Modal
          isOpen={Boolean(payoutBooking)}
          onClose={() => setPayoutBooking(null)}
          title="Confirm Commission Payout"
          subtitle={`Booking Ref: ${payoutBooking.booking_number || payoutBooking.id}`}
          maxWidth="sm"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
              <span className="text-[11px] text-emerald-800 font-medium block">Payout Recipient:</span>
              <p className="text-sm font-bold text-emerald-950 mt-0.5">
                {payoutBooking.referral_person?.name || payoutBooking.manual_referral_name}
              </p>
              <div className="mt-2 flex items-center justify-between border-t border-emerald-200 pt-2">
                <span className="font-medium text-emerald-800">Amount to Pay:</span>
                <span className="text-base font-extrabold text-emerald-900">
                  {formatCurrency(payoutBooking.commission_amount)}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                Payment Reference / Notes
              </label>
              <input
                type="text"
                value={payoutNotes}
                onChange={(e) => setPayoutNotes(e.target.value)}
                placeholder="e.g. Paid via Google Pay (Ref #12345)"
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setPayoutBooking(null)}
                className="px-3.5 py-1.5 text-slate-600 font-semibold rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPayout}
                disabled={isPayoutSaving}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-sm"
              >
                {isPayoutSaving ? 'Recording...' : 'Mark as Paid'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

