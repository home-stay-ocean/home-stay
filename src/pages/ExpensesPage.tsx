import React, { useState, useEffect, useMemo } from 'react';
import { Expense } from '../types';
import { api } from '../lib/supabase';
import { useHomestay } from '../contexts/HomestayContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/common/Toast';
import { Modal } from '../components/common/Modal';
import { formatCurrency, EXPENSE_CATEGORIES } from '../lib/constants';
import {
  formatDisplayDate,
  TimeframePreset,
  getTimeframeDates,
  isDateInDateRange,
  calculateNights,
} from '../lib/dateUtils';
import { exportExpensesToCSV } from '../lib/csvExport';
import { Pagination } from '../components/common/Pagination';
import {
  Receipt,
  PlusCircle,
  Download,
  Search,
  Trash2,
  Calendar,
  Building,
  Tag,
  CalendarDays,
  RotateCcw,
} from 'lucide-react';

interface ExpensesPageProps {
  onOpenNewExpense: () => void;
}

export const ExpensesPage: React.FC<ExpensesPageProps> = ({ onOpenNewExpense }) => {
  const { role } = useAuth();
  const { homestays, activeHomestayId, setActiveHomestayId } = useHomestay();
  const { showToast, showError } = useToast();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // In-app Delete Confirmation State
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Filters
  const [homestayFilter, setHomestayFilter] = useState(activeHomestayId);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTimeframe, setSelectedTimeframe] = useState<TimeframePreset>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  const timeframe = useMemo(() => {
    return getTimeframeDates(selectedTimeframe, customStartDate, customEndDate);
  }, [selectedTimeframe, customStartDate, customEndDate]);

  const isOwnerOrAdmin = role === 'super_admin' || role === 'owner';

  useEffect(() => {
    setHomestayFilter(activeHomestayId);
  }, [activeHomestayId]);

  const fetchExpenses = async () => {
    try {
      setLoading(true);
      const data = await api.getExpenses();
      setExpenses(data);
    } catch (err) {
      console.error('Failed to load expenses:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, []);

  const hasActiveFilters =
    searchTerm.trim() !== '' ||
    homestayFilter !== 'all' ||
    categoryFilter !== 'all' ||
    selectedTimeframe !== 'all';

  const handleResetFilters = () => {
    setSearchTerm('');
    setCategoryFilter('all');
    setHomestayFilter('all');
    setActiveHomestayId('all');
    setSelectedTimeframe('all');
    setCustomStartDate('');
    setCustomEndDate('');
  };

  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      // 1. Homestay
      if (homestayFilter && homestayFilter !== 'all') {
        if (e.homestay_id !== homestayFilter) return false;
      }

      // 2. Category
      if (categoryFilter && categoryFilter !== 'all') {
        if (e.category !== categoryFilter) return false;
      }

      // 3. Search
      if (searchTerm.trim()) {
        const s = searchTerm.toLowerCase().trim();
        const match =
          Boolean(e.note?.toLowerCase().includes(s)) ||
          Boolean(e.homestay?.name?.toLowerCase().includes(s)) ||
          Boolean(e.category?.toLowerCase().includes(s)) ||
          Boolean(e.creator?.full_name?.toLowerCase().includes(s));
        if (!match) return false;
      }

      // 4. Timeframe
      if (!isDateInDateRange(e.spent_on, timeframe.startDate, timeframe.endDate)) {
        return false;
      }

      return true;
    });
  }, [expenses, homestayFilter, categoryFilter, searchTerm, timeframe]);

  const totalExpenseAmount = filteredExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const pagedExpenses = filteredExpenses.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleConfirmDelete = async () => {
    if (!expenseToDelete) return;
    try {
      setIsDeleting(true);
      await api.deleteExpense(expenseToDelete.id);
      showToast('Expense Removed', 'Expense record deleted.');
      setExpenseToDelete(null);
      fetchExpenses();
    } catch (err) {
      showError(err, 'Could not delete expense');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExportCSV = () => {
    if (filteredExpenses.length === 0) {
      showToast('No Data', 'No expenses available to export.', 'info');
      return;
    }
    exportExpensesToCSV(filteredExpenses);
    showToast('Export Started', `Exported ${filteredExpenses.length} expense entries to CSV.`);
  };

  const getCategoryConfig = (catId: string) => {
    return EXPENSE_CATEGORIES.find((c) => c.id === catId) || EXPENSE_CATEGORIES[4];
  };

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-sm">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Operating Expenses
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Log housekeeping, utilities, staff wages, and property repairs
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-semibold rounded-xl border border-slate-200 flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={onOpenNewExpense}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs sm:text-sm font-bold rounded-xl shadow-md shadow-brand-600/20 flex items-center gap-1.5 transition-all hover:scale-[1.01]"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Add Expense</span>
          </button>
        </div>
      </div>

      {/* Filter and KPI Banner */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search expenses..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:bg-white focus:ring-2 focus:ring-brand-500 focus:outline-none"
            />
          </div>

          {/* Property Filter */}
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

          {/* Category Filter */}
          <div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium focus:bg-white focus:ring-2 focus:ring-brand-500 focus:outline-none"
            >
              <option value="all">All Categories</option>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
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
                ({filteredExpenses.length} {filteredExpenses.length === 1 ? 'entry' : 'entries'})
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

        {/* Total Expense Summary */}
        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between">
          <span className="text-xs text-slate-500 font-semibold">
            Filtered Total ({filteredExpenses.length} records{selectedTimeframe !== 'all' ? ` • ${timeframe.label}` : ''}):
          </span>
          <span className="text-base font-extrabold text-slate-900">
            {formatCurrency(totalExpenseAmount)}
          </span>
        </div>
      </div>

      {/* Expenses List: Table & Mobile Cards */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-slate-400 text-sm">Loading expenses...</div>
        ) : filteredExpenses.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">No expenses found.</div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Property</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Description / Note</th>
                    <th className="px-4 py-3">Spent On</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    {isOwnerOrAdmin && <th className="px-4 py-3 text-right">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedExpenses.map((e) => {
                    const cat = getCategoryConfig(e.category);
                    return (
                      <tr key={e.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-4 py-3.5 font-bold text-slate-900">
                          {e.homestay?.name || 'Homestay'}
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cat.color}`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-current" />
                            {cat.label}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-slate-600 max-w-xs truncate">
                          {e.note || '-'}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-slate-500">
                          {formatDisplayDate(e.spent_on, true)}
                        </td>
                        <td className="px-4 py-3.5 text-right font-extrabold text-slate-900">
                          {formatCurrency(e.amount)}
                        </td>
                        {isOwnerOrAdmin && (
                          <td className="px-4 py-3.5 text-right">
                            <button
                              onClick={() => setExpenseToDelete(e)}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              title="Delete Expense"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-slate-100">
              {pagedExpenses.map((e) => {
                const cat = getCategoryConfig(e.category);
                return (
                  <div key={e.id} className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">{e.homestay?.name}</span>
                      <span className="text-sm font-extrabold text-slate-900">
                        {formatCurrency(e.amount)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${cat.color}`}
                      >
                        {cat.label}
                      </span>
                      <span className="text-slate-400 text-[11px]">{formatDisplayDate(e.spent_on)}</span>
                    </div>

                    {e.note && <p className="text-xs text-slate-600 italic">{e.note}</p>}

                    {isOwnerOrAdmin && (
                      <div className="flex justify-end pt-1">
                        <button
                          onClick={() => setExpenseToDelete(e)}
                          className="text-xs text-rose-600 font-semibold hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <Pagination
              currentPage={currentPage}
              pageSize={pageSize}
              totalCount={filteredExpenses.length}
              onPageChange={setCurrentPage}
              onPageSizeChange={(sz) => {
                setPageSize(sz);
                setCurrentPage(1);
              }}
              isLoading={loading}
            />
          </>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={Boolean(expenseToDelete)}
        onClose={() => setExpenseToDelete(null)}
        title="Delete Expense Record"
        maxWidth="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Are you sure you want to delete this expense of{' '}
            <strong className="text-slate-900">
              {expenseToDelete ? formatCurrency(expenseToDelete.amount) : ''}
            </strong>{' '}
            for{' '}
            <strong className="text-slate-900">
              {expenseToDelete?.homestay?.name || 'this property'}
            </strong>
            ? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setExpenseToDelete(null)}
              className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors disabled:opacity-50"
            >
              {isDeleting ? 'Deleting...' : 'Delete Expense'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
