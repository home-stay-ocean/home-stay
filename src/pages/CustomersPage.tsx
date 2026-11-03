import React, { useState, useEffect, useCallback } from 'react';
import { Guest, Booking } from '../types';
import { api } from '../lib/supabase';
import { useToast } from '../components/common/Toast';
import { Modal } from '../components/common/Modal';
import { Pagination } from '../components/common/Pagination';
import { formatCurrency } from '../lib/constants';
import { formatDisplayDate, formatDisplayDateTime, normalizePhoneNumber } from '../lib/dateUtils';
import {
  Users,
  Search,
  Phone,
  Calendar,
  Edit,
  History,
  ShieldCheck,
  Building,
  UserCheck,
} from 'lucide-react';

interface CustomersPageProps {
  onSelectBooking?: (b: Booking) => void;
}

export const CustomersPage: React.FC<CustomersPageProps> = ({ onSelectBooking }) => {
  const { showToast, showError } = useToast();

  const [customers, setCustomers] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalCount, setTotalCount] = useState(0);

  // Edit Customer Modal
  const [customerToEdit, setCustomerToEdit] = useState<Guest | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editIdNote, setEditIdNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Customer History Modal
  const [historyCustomer, setHistoryCustomer] = useState<Guest | null>(null);
  const [customerBookings, setCustomerBookings] = useState<Booking[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchCustomers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.getCustomersPaged({
        page: currentPage,
        pageSize,
        search: searchTerm.trim() || undefined,
      });
      setCustomers(res.data);
      setTotalCount(res.totalCount);
    } catch (err) {
      console.error('Failed to load customers:', err);
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, searchTerm]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const handleOpenEdit = (c: Guest) => {
    setCustomerToEdit(c);
    setEditName(c.name);
    setEditPhone(c.phone);
    setEditIdNote(c.id_proof_note || '');
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerToEdit) return;

    try {
      setIsSaving(true);
      await api.upsertCustomer({
        id: customerToEdit.id,
        name: editName.trim(),
        phone: editPhone.trim(),
        id_proof_note: editIdNote.trim() || null,
      });

      showToast('Customer Updated', `${editName}'s profile has been updated.`);
      setCustomerToEdit(null);
      fetchCustomers();
    } catch (err: any) {
      showError(err, 'Could not save customer profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleViewHistory = async (c: Guest) => {
    setHistoryCustomer(c);
    try {
      setHistoryLoading(true);
      const res = await api.getBookingsPaged({
        page: 1,
        pageSize: 50,
        search: c.phone,
      });
      setCustomerBookings(res.data);
    } catch (err) {
      console.error('Failed to load customer history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              Customer Profiles
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-brand-50 text-brand-700 border border-brand-200">
              {totalCount.toLocaleString('en-IN')} Total Guests
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Unified guest records deduplicated by normalized mobile number (+91)
          </p>
        </div>
      </div>

      {/* Search Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search by customer name or phone..."
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium focus:bg-white focus:ring-2 focus:ring-brand-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Customers Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-400 text-xs">Loading customer directory...</div>
        ) : customers.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-xs">No customer profiles found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Customer Name</th>
                  <th className="py-3 px-4">Normalized Mobile Phone</th>
                  <th className="py-3 px-4">ID Proof Reference</th>
                  <th className="py-3 px-4">Total Reservations</th>
                  <th className="py-3 px-4">First Registered</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-900">
                      {c.name}
                      {(c.bookings_count || 0) > 1 && (
                        <span className="ml-2 inline-flex items-center gap-0.5 text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                          <UserCheck className="w-2.5 h-2.5" />
                          Repeat Guest ({c.bookings_count})
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 font-mono font-semibold text-slate-700">
                      {c.phone}
                    </td>

                    <td className="py-3 px-4 text-slate-600">
                      {c.id_proof_note || <span className="text-slate-400 italic">None recorded</span>}
                    </td>

                    <td className="py-3 px-4 font-extrabold text-slate-900">
                      {c.bookings_count || 0} Stays
                    </td>

                    <td className="py-3 px-4 text-slate-500">
                      {formatDisplayDate(c.created_at)}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleViewHistory(c)}
                          title="View Stay History"
                          className="px-2.5 py-1 text-xs font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-lg flex items-center gap-1 transition-colors"
                        >
                          <History className="w-3.5 h-3.5" />
                          <span>History</span>
                        </button>

                        <button
                          onClick={() => handleOpenEdit(c)}
                          title="Edit Customer"
                          className="p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          currentPage={currentPage}
          pageSize={pageSize}
          totalCount={totalCount}
          onPageChange={setCurrentPage}
          onPageSizeChange={(sz) => {
            setPageSize(sz);
            setCurrentPage(1);
          }}
          isLoading={loading}
        />
      </div>

      {/* Edit Customer Profile Modal */}
      {customerToEdit && (
        <Modal
          isOpen={Boolean(customerToEdit)}
          onClose={() => setCustomerToEdit(null)}
          title="Edit Customer Profile"
          subtitle={`Profile ID: ${customerToEdit.id}`}
          maxWidth="md"
        >
          <form onSubmit={handleSaveCustomer} className="space-y-4 text-xs">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                Full Name *
              </label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                Mobile Phone (Normalized) *
              </label>
              <input
                type="tel"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                required
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-900"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                Primary matching key for subsequent bookings.
              </span>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                ID Proof Note
              </label>
              <input
                type="text"
                value={editIdNote}
                onChange={(e) => setEditIdNote(e.target.value)}
                placeholder="e.g. Aadhaar / Passport details"
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setCustomerToEdit(null)}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl shadow-md"
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Customer Reservation History Modal */}
      {historyCustomer && (
        <Modal
          isOpen={Boolean(historyCustomer)}
          onClose={() => setHistoryCustomer(null)}
          title={`Stay History: ${historyCustomer.name}`}
          subtitle={`Mobile: ${historyCustomer.phone}`}
          maxWidth="lg"
        >
          <div className="space-y-3 text-xs">
            {historyLoading ? (
              <div className="p-8 text-center text-slate-400">Loading reservation history...</div>
            ) : customerBookings.length === 0 ? (
              <div className="p-8 text-center text-slate-400">No previous bookings found.</div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {customerBookings.map((b) => (
                  <div
                    key={b.id}
                    onClick={() => {
                      if (onSelectBooking) {
                        setHistoryCustomer(null);
                        onSelectBooking(b);
                      }
                    }}
                    className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between hover:bg-white hover:shadow-sm cursor-pointer transition-all"
                  >
                    <div>
                      <div className="font-bold text-slate-900 flex items-center gap-2">
                        <span className="font-mono text-brand-700">{b.booking_number || b.id.substring(0, 8)}</span>
                        <span>•</span>
                        <span>{b.room?.homestay?.name} ({b.room?.name})</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {formatDisplayDate(b.check_in)} → {formatDisplayDate(b.check_out)} • {b.is_ac ? 'AC' : 'Non-AC'}
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="font-extrabold text-slate-900">{formatCurrency(b.total_amount)}</p>
                      <span className="text-[10px] font-bold uppercase text-brand-600">{b.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};

