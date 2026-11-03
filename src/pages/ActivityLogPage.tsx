import React, { useState, useEffect, useCallback } from 'react';
import { ActivityLog } from '../types';
import { api } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Pagination } from '../components/common/Pagination';
import { formatDisplayDateTime } from '../lib/dateUtils';
import {
  History,
  Search,
  Filter,
  Shield,
  Clock,
  ChevronDown,
  ChevronUp,
  FileCode,
  ShieldAlert,
} from 'lucide-react';

export const ActivityLogPage: React.FC = () => {
  const { role } = useAuth();
  const isSuperAdmin = role === 'super_admin';

  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableFilter, setTableFilter] = useState('all');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Server-side pagination (default 50, options: 50, 100, 200)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalCount, setTotalCount] = useState(0);

  const fetchLogs = useCallback(async () => {
    if (!isSuperAdmin) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await api.getActivityLogsPaged({
        page: currentPage,
        pageSize,
        table: tableFilter,
        search: searchTerm.trim() || undefined,
      });
      setLogs(res.data);
      setTotalCount(res.totalCount);
    } catch (err) {
      console.error('Failed to load activity logs:', err);
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin, currentPage, pageSize, tableFilter, searchTerm]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Security guard: If a Partner (owner) or Manager attempts to view this page, block them completely
  if (!isSuperAdmin) {
    return (
      <div className="p-8 text-center bg-white rounded-2xl border border-rose-200 shadow-sm space-y-3">
        <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto" />
        <h3 className="text-base font-extrabold text-slate-900">Access Restricted</h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          Audit activity logs and active administrative records are strictly reserved for Super Admin accounts.
          Partners and property managers do not have permission to view internal administrative logs.
        </p>
      </div>
    );
  }

  const getActionBadge = (action: string) => {
    const act = action.toUpperCase();
    if (act.includes('INSERT') || act.includes('CREATE')) {
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
    if (act.includes('UPDATE') || act.includes('RESET')) {
      return 'bg-blue-50 text-blue-700 border-blue-200';
    }
    if (act.includes('DELETE') || act.includes('DISABLE')) {
      return 'bg-rose-50 text-rose-700 border-rose-200';
    }
    if (act.includes('AUTOMATIC')) {
      return 'bg-purple-50 text-purple-700 border-purple-200';
    }
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              System Audit Activity Log
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
              {totalCount.toLocaleString('en-IN')} Entries
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Immutable database trigger audit records • Hidden from Partner & Manager accounts
          </p>
        </div>

        <span className="px-3 py-1 bg-purple-50 text-purple-700 text-xs font-bold rounded-full border border-purple-200 self-start sm:self-auto flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5" />
          Admin Only Audit Trail
        </span>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search action, record ID..."
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:bg-white focus:ring-2 focus:ring-brand-500 focus:outline-none"
          />
        </div>

        <div className="w-full sm:w-auto">
          <select
            value={tableFilter}
            onChange={(e) => {
              setTableFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full sm:w-auto px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold focus:bg-white focus:ring-2 focus:ring-brand-500 focus:outline-none"
          >
            <option value="all">All Audited Tables</option>
            <option value="bookings">Bookings</option>
            <option value="payments">Payments</option>
            <option value="expenses">Expenses</option>
            <option value="rooms">Rooms</option>
            <option value="homestays">Homestays</option>
            <option value="referral_persons">Referral Persons</option>
          </select>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            Loading audit records from database...
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <History className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <p className="font-bold text-slate-700">No activity logs found</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 text-xs">
            {logs.map((log) => {
              const isExpanded = expandedLogId === log.id;
              return (
                <div key={log.id} className="p-4 hover:bg-slate-50/60 transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${getActionBadge(
                          log.action
                        )}`}
                      >
                        {log.action}
                      </span>
                      <span className="font-bold text-slate-900 capitalize">
                        {log.table_name.replace('_', ' ')}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                        #{log.record_id.substring(0, 10)}...
                      </span>
                    </div>

                    <div className="flex items-center gap-4 text-slate-500 text-[11px]">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {formatDisplayDateTime(log.created_at)}
                      </span>

                      <button
                        onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                        className="text-brand-600 hover:text-brand-700 font-bold flex items-center gap-1"
                      >
                        <FileCode className="w-3.5 h-3.5" />
                        <span>{isExpanded ? 'Hide Payload' : 'View Payload'}</span>
                        {isExpanded ? (
                          <ChevronUp className="w-3 h-3" />
                        ) : (
                          <ChevronDown className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Expanded JSON payload view */}
                  {isExpanded && log.details && (
                    <div className="mt-3 p-3 bg-slate-900 text-emerald-400 font-mono text-[11px] rounded-xl overflow-x-auto shadow-inner">
                      <pre>{JSON.stringify(log.details, null, 2)}</pre>
                    </div>
                  )}
                </div>
              );
            })}
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
    </div>
  );
};
