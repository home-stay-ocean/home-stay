import React, { useState, useEffect } from 'react';
import { Booking } from '../types';
import { api } from '../lib/supabase';
import { useHomestay } from '../contexts/HomestayContext';
import { getTodayISO, calculateNights } from '../lib/dateUtils';
import {
  BedDouble,
  Users,
  LogIn,
  LogOut,
  CalendarCheck,
  CheckCircle2,
  Shield,
} from 'lucide-react';

export const BasicStatsPage: React.FC = () => {
  const { activeHomestayId, rooms } = useHomestay();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  const todayStr = getTodayISO();

  useEffect(() => {
    async function loadStats() {
      try {
        setLoading(true);
        const data = await api.getBookings({ homestay_id: activeHomestayId });
        setBookings(data);
      } catch (err) {
        console.error('Failed to load manager stats:', err);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, [activeHomestayId]);

  const scopedRooms = rooms.filter(
    (r) => activeHomestayId === 'all' || r.homestay_id === activeHomestayId
  );
  const totalRooms = scopedRooms.length || 1;

  const activeCheckedIn = bookings.filter((b) => b.status === 'checked_in');
  const todayArrivals = bookings.filter(
    (b) => (b.check_in?.split('T')[0] || b.check_in) === todayStr && b.status !== 'cancelled'
  );
  const todayDepartures = bookings.filter(
    (b) => (b.check_out?.split('T')[0] || b.check_out) === todayStr && b.status !== 'cancelled'
  );
  const upcomingBookings = bookings.filter(
    (b) => b.status === 'booked' && (b.check_in?.split('T')[0] || b.check_in) >= todayStr
  );

  const occupancyRate = Math.min(100, Math.round((activeCheckedIn.length / totalRooms) * 100));
  const totalGuestsHosted = bookings
    .filter((b) => b.status !== 'cancelled')
    .reduce((sum, b) => sum + (b.num_guests || 1), 0);

  if (loading) {
    return (
      <div className="bg-white p-12 text-center rounded-2xl border border-slate-200 text-slate-400 text-sm">
        Loading occupancy statistics...
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Occupancy & Operational Counts
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time room occupancy, arrivals, departures, and guest counts
          </p>
        </div>

        <span className="px-3 py-1 bg-blue-50 text-blue-700 text-xs font-bold rounded-full border border-blue-200 self-start sm:self-auto flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5" />
          Manager Restricted View (Occupancy Only)
        </span>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Occupancy Rate */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Current Occupancy Rate
          </span>
          <p className="text-3xl font-black text-brand-600 mt-2">{occupancyRate}%</p>
          <div className="mt-2 w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-500 rounded-full transition-all"
              style={{ width: `${occupancyRate}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            {activeCheckedIn.length} of {totalRooms} rooms occupied
          </p>
        </div>

        {/* Checked In */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Rooms Checked In
          </span>
          <p className="text-3xl font-black text-slate-900 mt-2">{activeCheckedIn.length}</p>
          <p className="text-[11px] text-slate-400 mt-2">Currently staying guests</p>
        </div>

        {/* Today's Arrivals */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Arrivals Today
          </span>
          <p className="text-3xl font-black text-blue-600 mt-2">{todayArrivals.length}</p>
          <p className="text-[11px] text-slate-400 mt-2">Expected check-ins</p>
        </div>

        {/* Departures Today */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Departures Today
          </span>
          <p className="text-3xl font-black text-slate-700 mt-2">{todayDepartures.length}</p>
          <p className="text-[11px] text-slate-400 mt-2">Rooms freeing for cleaning</p>
        </div>
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Upcoming Bookings
            </span>
            <p className="text-2xl font-black text-slate-900 mt-1">{upcomingBookings.length}</p>
            <p className="text-xs text-slate-500 mt-0.5">Reservations on the calendar</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <CalendarCheck className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Total Visitors Hosted
            </span>
            <p className="text-2xl font-black text-slate-900 mt-1">{totalGuestsHosted}</p>
            <p className="text-xs text-slate-500 mt-0.5">Guest headcount across bookings</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Room Status List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h3 className="font-bold text-slate-900 text-base mb-3">Room Readiness & Live State</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {scopedRooms.map((room) => {
            const isOccupied = activeCheckedIn.some((b) => b.room_id === room.id);
            const isArrivingToday = todayArrivals.some((b) => b.room_id === room.id);

            return (
              <div
                key={room.id}
                className={`p-3.5 rounded-xl border flex items-center justify-between ${
                  isOccupied
                    ? 'border-emerald-300 bg-emerald-50/50'
                    : isArrivingToday
                    ? 'border-blue-300 bg-blue-50/50'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div>
                  <p className="text-xs font-bold text-slate-900">{room.name}</p>
                  <p className="text-[11px] text-slate-500">{room.homestay?.name}</p>
                </div>
                <div>
                  <span
                    className={`px-2 py-0.5 text-xs font-bold rounded-full ${
                      isOccupied
                        ? 'bg-emerald-600 text-white'
                        : isArrivingToday
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {isOccupied ? 'Occupied' : isArrivingToday ? 'Arriving Today' : 'Available'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
