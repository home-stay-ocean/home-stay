import React, { useState } from 'react';
import { Booking, CommissionStatus } from '../../types';
import { Modal } from '../common/Modal';
import { StatusBadge } from '../common/Badge';
import { api } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../common/Toast';
import { formatCurrency, COMMISSION_STATUS_CONFIG, CHECKOUT_METHOD_CONFIG } from '../../lib/constants';
import { formatDisplayDate, formatDisplayDateTime, formatDisplayTime, calculateNights } from '../../lib/dateUtils';
import {
  Calendar,
  User,
  Phone,
  Home,
  CreditCard,
  CheckCircle,
  LogIn,
  LogOut,
  XCircle,
  Trash2,
  Edit,
  PlusCircle,
  Clock,
  Wind,
  Users2,
  Award,
  Check,
  CheckCheck,
} from 'lucide-react';

interface BookingDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: Booking | null;
  onOpenPaymentModal: (b: Booking) => void;
  onOpenEditModal: (b: Booking) => void;
  onRefresh: () => void;
}

export const BookingDetailsModal: React.FC<BookingDetailsModalProps> = ({
  isOpen,
  onClose,
  booking,
  onOpenPaymentModal,
  onOpenEditModal,
  onRefresh,
}) => {
  const { role } = useAuth();
  const { showToast, showError } = useToast();
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  // Commission payout dialog
  const [isCommissionPayOpen, setIsCommissionPayOpen] = useState(false);
  const [commPayNotes, setCommPayNotes] = useState('');

  if (!booking) return null;

  const isOwnerOrAdmin = role === 'super_admin' || role === 'owner';
  const totalPaid = booking.payments?.reduce((acc, p) => acc + Number(p.amount), 0) || booking.total_paid || 0;
  const balanceDue = Number(booking.total_amount) - totalPaid;
  const nights = calculateNights(booking.check_in, booking.check_out);

  const handleStatusChange = async (newStatus: Booking['status']) => {
    if (booking.status === 'checked_out' && newStatus === 'checked_in') {
      showToast('Already Checked Out', 'This guest has already checked out and completed their stay.', 'warning');
      return;
    }
    try {
      setLoadingAction(newStatus);
      await api.updateBookingStatus(booking.id, newStatus, 'manual');
      showToast('Status Updated', `Booking status changed to ${newStatus.replace('_', ' ').toUpperCase()}`);
      onRefresh();
      onClose();
    } catch (err: any) {
      showError(err, 'Failed to update status');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleCommissionAction = async (newStatus: CommissionStatus) => {
    try {
      setLoadingAction(`comm_${newStatus}`);
      await api.updateCommissionStatus(booking.id, newStatus, commPayNotes.trim() || undefined);
      showToast('Commission Updated', `Commission status marked as ${newStatus.toUpperCase()}`);
      setIsCommissionPayOpen(false);
      onRefresh();
    } catch (err: any) {
      showError(err, 'Could not update commission status');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleDelete = async () => {
    try {
      setLoadingAction('delete');
      await api.deleteBooking(booking.id);
      showToast('Booking Deleted', 'Booking record has been removed.');
      onRefresh();
      onClose();
    } catch (err: any) {
      showError(err, 'Failed to delete booking');
    } finally {
      setLoadingAction(null);
      setIsConfirmingDelete(false);
    }
  };

  const bookingRef = booking.booking_number || `HS-${booking.id.substring(0, 8).toUpperCase()}`;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Reservation Details"
      subtitle={`Booking Ref: ${bookingRef}`}
      maxWidth="lg"
    >
      <div className="space-y-4">
        {/* Top Header info */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div>
              <span className="text-xs text-slate-400 font-medium">Status</span>
              <div className="mt-1">
                <StatusBadge status={booking.status} />
              </div>
            </div>

            <div className="ml-3 pl-3 border-l border-slate-200">
              <span className="text-xs text-slate-400 font-medium">Room Specification</span>
              <div className="mt-1">
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    booking.is_ac
                      ? 'bg-cyan-100 text-cyan-800 border border-cyan-200'
                      : 'bg-slate-100 text-slate-700 border border-slate-200'
                  }`}
                >
                  <Wind className="w-3 h-3" />
                  {booking.is_ac ? 'AC Room' : 'Non-AC Room'}
                </span>
              </div>
            </div>
          </div>

          <div className="text-right">
            <span className="text-xs text-slate-400 font-medium">Payment State</span>
            <div className="mt-1">
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                  balanceDue <= 0
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-rose-100 text-rose-800'
                }`}
              >
                {balanceDue <= 0 ? 'Fully Paid' : `Balance Due: ${formatCurrency(balanceDue)}`}
              </span>
            </div>
          </div>
        </div>

        {/* Customer & Stay Property Details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <User className="w-3.5 h-3.5 text-brand-600" />
              Customer Profile
            </p>
            <p className="text-sm font-bold text-slate-900 mt-1">{booking.guest?.name || 'Guest'}</p>
            <p className="text-xs text-slate-700 font-semibold flex items-center gap-1 mt-0.5">
              <Phone className="w-3 h-3 text-slate-400" />
              {booking.guest?.phone || 'No phone'}
            </p>
            {booking.guest?.id_proof_note && (
              <p className="text-[11px] text-slate-500 mt-1 italic">
                Note: {booking.guest.id_proof_note}
              </p>
            )}
          </div>

          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Home className="w-3.5 h-3.5 text-brand-600" />
              Property & Room
            </p>
            <p className="text-sm font-bold text-slate-900 mt-1">{booking.room?.homestay?.name || 'Homestay'}</p>
            <p className="text-xs text-brand-700 font-bold mt-0.5">
              {booking.room?.name} • {booking.room?.room_type || 'Standard'}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              {booking.num_guests} Guests • {booking.source.toUpperCase()} Source
            </p>
          </div>
        </div>

        {/* Stay Dates and Actual Check-in / Checkout Times */}
        <div className="p-3.5 bg-brand-50/50 border border-brand-100 rounded-2xl space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-brand-600 text-white flex items-center justify-center font-bold text-xs">
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">Scheduled Stay Range</p>
                <p className="text-sm font-bold text-slate-900">
                  {formatDisplayDate(booking.check_in)} → {formatDisplayDate(booking.check_out)}
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs font-bold text-brand-800 bg-brand-100/80 px-2 py-0.5 rounded-full">
                {nights} Nights
              </span>
              <p className="text-[10px] text-slate-400 mt-1">Free checkout day</p>
            </div>
          </div>

          {/* Actual Check-In and Checkout Timestamps */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-brand-200/60 text-xs text-slate-700">
            <div>
              <span className="text-[11px] text-slate-500 block">Exact Check-In:</span>
              <span className="font-semibold text-slate-900">
                {booking.check_in_at ? formatDisplayDateTime(booking.check_in_at) : 'Not recorded yet'}
              </span>
            </div>

            <div>
              <span className="text-[11px] text-slate-500 block">Actual Check-Out & Method:</span>
              <span className="font-semibold text-slate-900">
                {booking.actual_checkout_at
                  ? `${formatDisplayDateTime(booking.actual_checkout_at)} (${booking.checkout_method === 'automatic' ? 'Auto 12 PM IST' : 'Manual'})`
                  : 'Pending departure (Auto at 12:00 PM IST on checkout date)'}
              </span>
            </div>
          </div>
        </div>

        {/* Referral Person & Commission Tracking Card */}
        <div className="p-3.5 bg-amber-50/60 border border-amber-200 rounded-2xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
              <Users2 className="w-3.5 h-3.5 text-amber-700" />
              Referral & Commission Snapshot
            </span>

            {booking.referral_person_id || booking.manual_referral_name ? (
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                  COMMISSION_STATUS_CONFIG[booking.commission_status || 'pending']?.bg || 'bg-amber-100'
                } ${COMMISSION_STATUS_CONFIG[booking.commission_status || 'pending']?.text || 'text-amber-800'}`}
              >
                Status: {booking.commission_status?.toUpperCase() || 'PENDING'}
              </span>
            ) : (
              <span className="text-[11px] font-semibold text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200">
                Direct Booking
              </span>
            )}
          </div>

          {booking.referral_person_id || booking.manual_referral_name ? (
            <div className="space-y-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-slate-500 font-medium">Brought By: </span>
                  <span className="font-bold text-slate-900">
                    {booking.referral_person?.name || booking.manual_referral_name}
                  </span>
                  {booking.referral_person?.phone && (
                    <span className="text-slate-500 ml-1">({booking.referral_person.phone})</span>
                  )}
                </div>

                <div>
                  <span className="text-slate-500 font-medium">Locked Rate: </span>
                  <span className="font-bold text-slate-800">
                    {booking.commission_type === 'percentage'
                      ? `${booking.commission_rate}%`
                      : formatCurrency(booking.commission_rate)}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 font-medium">Commission Amount: </span>
                  <span className="font-extrabold text-amber-800 text-sm">
                    {formatCurrency(booking.commission_amount)}
                  </span>
                </div>
              </div>

              {booking.commission_paid_at && (
                <p className="text-[11px] text-emerald-700 font-medium">
                  Paid on {formatDisplayDateTime(booking.commission_paid_at)}
                  {booking.commission_notes ? ` • Note: ${booking.commission_notes}` : ''}
                </p>
              )}

              {/* Management Commission Approval / Payment Buttons */}
              {isOwnerOrAdmin && booking.status !== 'cancelled' && (
                <div className="pt-2 border-t border-amber-200/80 flex items-center justify-end gap-2">
                  {booking.commission_status === 'pending' && (
                    <button
                      type="button"
                      onClick={() => handleCommissionAction('approved')}
                      disabled={Boolean(loadingAction)}
                      className="px-2.5 py-1 text-xs font-bold text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-lg flex items-center gap-1 transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Approve Commission
                    </button>
                  )}

                  {booking.commission_status !== 'paid' && (
                    <button
                      type="button"
                      onClick={() => setIsCommissionPayOpen(true)}
                      disabled={Boolean(loadingAction)}
                      className="px-3 py-1 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg flex items-center gap-1 shadow-sm transition-colors"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      Mark Commission as Paid
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              This reservation was booked directly without an external referral or agent commission.
            </p>
          )}
        </div>

        {/* Payout dialog modal */}
        {isCommissionPayOpen && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2 text-xs animate-fadeIn">
            <p className="font-bold text-emerald-900">
              Confirm Commission Payout of {formatCurrency(booking.commission_amount)}
            </p>
            <input
              type="text"
              value={commPayNotes}
              onChange={(e) => setCommPayNotes(e.target.value)}
              placeholder="Payment reference (e.g. UPI Ref / Cash receipt)"
              className="w-full px-2.5 py-1.5 bg-white border border-emerald-200 rounded-lg text-xs"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCommissionPayOpen(false)}
                className="px-2.5 py-1 text-slate-600 hover:bg-white rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleCommissionAction('paid')}
                disabled={Boolean(loadingAction)}
                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm"
              >
                Confirm Paid
              </button>
            </div>
          </div>
        )}

        {/* Financial Breakdown */}
        <div className="bg-slate-900 text-white p-4 rounded-2xl space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-300">
            <span>Rate per Night:</span>
            <span>{formatCurrency(booking.rate_per_night)}</span>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-300">
            <span>Duration:</span>
            <span>{nights} nights</span>
          </div>
          <div className="flex items-center justify-between text-sm font-semibold border-t border-slate-800 pt-2 text-white">
            <span>Total Booking Revenue:</span>
            <span className="text-base font-bold text-white">{formatCurrency(booking.total_amount)}</span>
          </div>
          <div className="flex items-center justify-between text-xs text-emerald-400">
            <span>Total Collected / Paid:</span>
            <span>{formatCurrency(totalPaid)}</span>
          </div>
          <div className="flex items-center justify-between text-sm font-bold border-t border-slate-800 pt-2">
            <span>Remaining Balance Due:</span>
            <span className={balanceDue > 0 ? 'text-rose-400' : 'text-emerald-400'}>
              {formatCurrency(balanceDue)}
            </span>
          </div>
        </div>

        {/* Payments History */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5 text-brand-600" />
              Payments History ({booking.payments?.length || 0})
            </h4>
            {balanceDue > 0 && booking.status !== 'cancelled' ? (
              <button
                onClick={() => {
                  onClose();
                  onOpenPaymentModal(booking);
                }}
                className="text-xs font-bold text-brand-600 hover:text-brand-700 hover:underline flex items-center gap-1"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                Record Payment
              </button>
            ) : (
              <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                {balanceDue <= 0 ? 'Fully Paid' : 'Cancelled'}
              </span>
            )}
          </div>

          {booking.payments && booking.payments.length > 0 ? (
            <div className="space-y-1.5">
              {booking.payments.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                >
                  <div>
                    <span className="font-bold text-slate-900">{formatCurrency(p.amount)}</span>
                    <span className="text-slate-500 ml-1.5 uppercase font-medium">({p.method})</span>
                    {p.note && <p className="text-[11px] text-slate-500 mt-0.5">{p.note}</p>}
                  </div>
                  <div className="text-right text-slate-400 text-[11px]">
                    <p>{formatDisplayDate(p.paid_on)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-xs text-slate-400">
              No payments recorded yet for this booking.
            </div>
          )}
        </div>

        {/* Operational Action Buttons or Delete Confirmation */}
        {isConfirmingDelete ? (
          <div className="pt-2 border-t border-rose-200">
            <div className="bg-rose-50 border border-rose-200 p-3 rounded-xl flex items-center justify-between text-xs animate-fadeIn">
              <div className="text-rose-800 pr-2">
                <p className="font-bold">Delete this reservation permanently?</p>
                <p className="text-[11px] text-rose-600">All payment records for this booking will also be removed.</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsConfirmingDelete(false)}
                  disabled={loadingAction === 'delete'}
                  className="px-3 py-1.5 text-slate-600 hover:bg-white rounded-lg text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={loadingAction === 'delete'}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{loadingAction === 'delete' ? 'Deleting...' : 'Yes, Delete'}</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
            {/* Status buttons */}
            <div className="flex items-center gap-1.5">
              {booking.status === 'booked' && (
                <button
                  onClick={() => handleStatusChange('checked_in')}
                  disabled={Boolean(loadingAction)}
                  className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl flex items-center gap-1 transition-colors"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  Check In
                </button>
              )}

              {booking.status === 'checked_in' && (
                <button
                  onClick={() => handleStatusChange('checked_out')}
                  disabled={Boolean(loadingAction)}
                  className="px-3 py-1.5 text-xs font-bold text-white bg-slate-700 hover:bg-slate-800 rounded-xl flex items-center gap-1 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Check Out (Manual)
                </button>
              )}

              {booking.status !== 'cancelled' && (
                <button
                  onClick={() => handleStatusChange('cancelled')}
                  disabled={Boolean(loadingAction)}
                  className="px-3 py-1.5 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-xl flex items-center gap-1 transition-colors"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Cancel
                </button>
              )}
            </div>

            {/* Edit & Delete actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  onClose();
                  onOpenEditModal(booking);
                }}
                className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl flex items-center gap-1 transition-colors"
              >
                <Edit className="w-3.5 h-3.5" />
                Edit
              </button>

              {isOwnerOrAdmin && (
                <button
                  onClick={() => setIsConfirmingDelete(true)}
                  className="px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl flex items-center gap-1 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
