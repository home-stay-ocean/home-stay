import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  Booking,
  Expense,
  Guest,
  Homestay,
  Payment,
  Profile,
  Room,
  ActivityLog,
  UserRole,
} from '../types';
import { intervalsOverlap } from './dateUtils';

const env = import.meta.env;

// Automatically support standard VITE_*, Vercel Supabase integration NEXT_PUBLIC_*, and SUPABASE_* variables
const supabaseUrl: string =
  env.VITE_SUPABASE_URL ||
  (env as any).NEXT_PUBLIC_SUPABASE_URL ||
  (env as any).SUPABASE_URL ||
  '';

const supabaseAnonKey: string =
  env.VITE_SUPABASE_ANON_KEY ||
  (env as any).NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  (env as any).NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  (env as any).SUPABASE_ANON_KEY ||
  (env as any).SUPABASE_PUBLISHABLE_KEY ||
  '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl.startsWith('http') &&
  !supabaseUrl.includes('your-project-id')
);

// Safe Supabase client initialization
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Clean up any legacy localStorage mock keys
export function clearLegacyLocalStorage() {
  try {
    if (typeof localStorage !== 'undefined') {
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith('hm_')) {
          localStorage.removeItem(k);
        }
      });
    }
  } catch (e) {
    // ignore
  }
}

// Auto-run cleanup on module load
clearLegacyLocalStorage();

function getClient(): SupabaseClient {
  if (!supabase || !isSupabaseConfigured) {
    throw new Error(
      'Supabase is not configured. Please add your VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file.'
    );
  }
  return supabase;
}

// ==============================================================================
// DIRECT SUPABASE DATA SERVICE (PURE DATABASE - NO LOCAL STORAGE MOCK)
// ==============================================================================

export const api = {
  // ----------------------------------------------------------------------------
  // HOMESTAYS & ROOMS
  // ----------------------------------------------------------------------------
  async getHomestays(): Promise<Homestay[]> {
    const client = getClient();
    const { data, error } = await client
      .from('homestays')
      .select('*, rooms(count)')
      .order('name');
    if (error) throw error;
    return (data || []).map((h: any) => ({
      ...h,
      rooms_count: h.rooms?.[0]?.count || 0,
    }));
  },

  async saveHomestay(homestay: Partial<Homestay>): Promise<Homestay> {
    const client = getClient();
    if (homestay.id) {
      const { data, error } = await client
        .from('homestays')
        .update({ name: homestay.name, location: homestay.location })
        .eq('id', homestay.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    } else {
      const { data, error } = await client
        .from('homestays')
        .insert({ name: homestay.name, location: homestay.location })
        .select()
        .single();
      if (error) throw error;
      return data;
    }
  },

  async deleteHomestay(id: string): Promise<void> {
    const client = getClient();
    const { error } = await client.from('homestays').delete().eq('id', id);
    if (error) throw error;
  },

  async getRooms(homestayId?: string): Promise<Room[]> {
    const client = getClient();
    let query = client
      .from('rooms')
      .select('*, homestay:homestays(*)')
      .order('name');
    if (homestayId && homestayId !== 'all') {
      query = query.eq('homestay_id', homestayId);
    }
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async saveRoom(room: Partial<Room>): Promise<Room> {
    const client = getClient();
    if (room.id) {
      const { data, error } = await client
        .from('rooms')
        .update({
          name: room.name,
          homestay_id: room.homestay_id,
          default_rate: room.default_rate,
          active: room.active ?? true,
        })
        .eq('id', room.id)
        .select('*, homestay:homestays(*)')
        .single();
      if (error) throw error;
      return data;
    } else {
      const { data, error } = await client
        .from('rooms')
        .insert({
          name: room.name,
          homestay_id: room.homestay_id,
          default_rate: room.default_rate,
          active: room.active ?? true,
        })
        .select('*, homestay:homestays(*)')
        .single();
      if (error) throw error;
      return data;
    }
  },

  async deleteRoom(id: string): Promise<void> {
    const client = getClient();
    const { error } = await client.from('rooms').delete().eq('id', id);
    if (error) throw error;
  },

  // ----------------------------------------------------------------------------
  // GUESTS
  // ----------------------------------------------------------------------------
  async getGuests(search?: string): Promise<Guest[]> {
    const client = getClient();
    let query = client.from('guests').select('*').order('name');
    if (search) {
      query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
    }
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async saveGuest(guest: Partial<Guest>): Promise<Guest> {
    const client = getClient();
    if (guest.id) {
      const { data, error } = await client
        .from('guests')
        .update({
          name: guest.name,
          phone: guest.phone,
          id_proof_note: guest.id_proof_note,
        })
        .eq('id', guest.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    } else {
      const { data, error } = await client
        .from('guests')
        .insert({
          name: guest.name,
          phone: guest.phone,
          id_proof_note: guest.id_proof_note,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    }
  },

  async findGuestByPhone(phone: string): Promise<Guest | null> {
    const client = getClient();
    const { data, error } = await client
      .from('guests')
      .select('*')
      .eq('phone', phone)
      .maybeSingle();
    if (error) return null;
    return data || null;
  },

  // ----------------------------------------------------------------------------
  // BOOKINGS (Exclusion Constraint & Double Booking Prevention)
  // ----------------------------------------------------------------------------
  async getBookings(filters?: {
    homestay_id?: string;
    status?: string;
    unpaid_only?: boolean;
    search?: string;
  }): Promise<Booking[]> {
    const client = getClient();
    let query = client
      .from('bookings')
      .select(`
        *,
        guest:guests(*),
        room:rooms(*, homestay:homestays(*)),
        payments(*)
      `)
      .order('check_in', { ascending: false });

    if (filters?.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }

    const { data, error } = await query;
    if (error) throw error;

    let result = (data || []).map((b: any) => {
      const room = Array.isArray(b.room) ? b.room[0] : b.room;
      const guest = Array.isArray(b.guest) ? b.guest[0] : b.guest;
      const payments = Array.isArray(b.payments) ? b.payments : [];
      const totalPaid = payments.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
      return {
        ...b,
        room,
        guest,
        payments,
        total_paid: totalPaid,
        balance_due: Math.max(0, Number(b.total_amount || 0) - totalPaid),
      };
    });

    if (filters?.homestay_id && filters.homestay_id !== 'all') {
      result = result.filter((b) => b.room?.homestay_id === filters.homestay_id);
    }

    if (filters?.unpaid_only) {
      result = result.filter((b) => (b.balance_due || 0) > 0 && b.status !== 'cancelled');
    }

    if (filters?.search) {
      const s = filters.search.toLowerCase();
      result = result.filter(
        (b) =>
          Boolean(b.guest?.name?.toLowerCase().includes(s)) ||
          Boolean(b.guest?.phone?.toLowerCase().includes(s)) ||
          Boolean(b.room?.name?.toLowerCase().includes(s)) ||
          Boolean(b.room?.homestay?.name?.toLowerCase().includes(s))
      );
    }

    return result;
  },

  async saveBooking(booking: Partial<Booking>, creatorId?: string): Promise<Booking> {
    const client = getClient();

    // Client-side overlap validation
    const allBookings = await api.getBookings();
    const overlapping = allBookings.find(
      (b) =>
        b.id !== booking.id &&
        b.room_id === booking.room_id &&
        b.status !== 'cancelled' &&
        intervalsOverlap(booking.check_in!, booking.check_out!, b.check_in, b.check_out)
    );

    if (overlapping) {
      throw new Error(
        `Room Conflict: This room is already booked by ${overlapping.guest?.name || 'another guest'} from ${overlapping.check_in} to ${overlapping.check_out}. Please choose another room or different dates.`
      );
    }

    try {
      if (booking.id) {
        const { data, error } = await client
          .from('bookings')
          .update({
            guest_id: booking.guest_id,
            room_id: booking.room_id,
            check_in: booking.check_in,
            check_out: booking.check_out,
            num_guests: booking.num_guests,
            rate_per_night: booking.rate_per_night,
            total_amount: booking.total_amount,
            status: booking.status,
            source: booking.source,
            notes: booking.notes,
            updated_at: new Date().toISOString(),
          })
          .eq('id', booking.id)
          .select('*, guest:guests(*), room:rooms(*, homestay:homestays(*))')
          .single();

        if (error) {
          if (error.code === '23P01' || error.message.includes('no_overlapping_bookings')) {
            throw new Error('Room Conflict: This room is already booked for the selected dates. Please choose another date or room.');
          }
          throw error;
        }
        return data;
      } else {
        const { data, error } = await client
          .from('bookings')
          .insert({
            guest_id: booking.guest_id,
            room_id: booking.room_id,
            check_in: booking.check_in,
            check_out: booking.check_out,
            num_guests: booking.num_guests,
            rate_per_night: booking.rate_per_night,
            total_amount: booking.total_amount,
            status: booking.status || 'booked',
            source: booking.source || 'phone',
            notes: booking.notes,
            created_by: creatorId,
          })
          .select('*, guest:guests(*), room:rooms(*, homestay:homestays(*))')
          .single();

        if (error) {
          if (error.code === '23P01' || error.message.includes('no_overlapping_bookings')) {
            throw new Error('Room Conflict: This room is already booked for the selected dates. Please choose another date or room.');
          }
          throw error;
        }
        return data;
      }
    } catch (err: any) {
      if (err.code === '23P01' || err.message?.includes('no_overlapping_bookings')) {
        throw new Error('Room Conflict: This room is already booked for the selected dates. Please choose another date or room.');
      }
      throw err;
    }
  },

  async updateBookingStatus(bookingId: string, status: Booking['status']): Promise<void> {
    const client = getClient();
    const { data: bData } = await client
      .from('bookings')
      .select('status')
      .eq('id', bookingId)
      .single();

    if (bData && bData.status === 'checked_out' && status === 'checked_in') {
      throw new Error('This guest has already checked out. A completed reservation cannot be checked in again.');
    }

    const { error } = await client
      .from('bookings')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', bookingId);
    if (error) throw error;
  },

  async deleteBooking(bookingId: string): Promise<void> {
    const client = getClient();
    const { error } = await client.from('bookings').delete().eq('id', bookingId);
    if (error) throw error;
  },

  // ----------------------------------------------------------------------------
  // PAYMENTS (with Double-Payment & Overpayment Protection)
  // ----------------------------------------------------------------------------
  async getPayments(bookingId?: string): Promise<Payment[]> {
    const client = getClient();
    let query = client
      .from('payments')
      .select(`
        *,
        booking:bookings(*, guest:guests(*), room:rooms(*, homestay:homestays(*))),
        receiver:profiles(*)
      `)
      .order('paid_on', { ascending: false });

    if (bookingId) {
      query = query.eq('booking_id', bookingId);
    }
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async recordPayment(payment: Partial<Payment>, receiverId?: string): Promise<Payment> {
    const payAmount = Number(payment.amount);
    if (!payAmount || payAmount <= 0) {
      throw new Error('Payment amount must be greater than zero.');
    }

    const client = getClient();

    // Validate remaining balance to stop double pay
    const { data: bData, error: bErr } = await client
      .from('bookings')
      .select('total_amount, payments(amount)')
      .eq('id', payment.booking_id)
      .single();

    if (!bErr && bData) {
      const totalPaid = (bData.payments || []).reduce((sum: number, p: any) => sum + Number(p.amount), 0);
      const remaining = Number(bData.total_amount) - totalPaid;
      if (remaining <= 0) {
        throw new Error('This booking is already fully paid. Cannot record additional payments.');
      }
      if (payAmount > remaining) {
        throw new Error(`Payment amount (₹${payAmount}) exceeds the remaining balance due of ₹${remaining}.`);
      }
    }

    const { data, error } = await client
      .from('payments')
      .insert({
        booking_id: payment.booking_id,
        amount: payAmount,
        method: payment.method || 'cash',
        paid_on: payment.paid_on || new Date().toISOString().split('T')[0],
        note: payment.note,
        received_by: receiverId,
      })
      .select(`
        *,
        booking:bookings(*, guest:guests(*), room:rooms(*, homestay:homestays(*))),
        receiver:profiles(*)
      `)
      .single();

    if (error) throw error;
    return data;
  },

  // ----------------------------------------------------------------------------
  // EXPENSES
  // ----------------------------------------------------------------------------
  async getExpenses(filters?: { homestay_id?: string; category?: string }): Promise<Expense[]> {
    const client = getClient();
    let query = client
      .from('expenses')
      .select('*, homestay:homestays(*), creator:profiles(*)')
      .order('spent_on', { ascending: false });

    if (filters?.homestay_id && filters.homestay_id !== 'all') {
      query = query.eq('homestay_id', filters.homestay_id);
    }
    if (filters?.category && filters.category !== 'all') {
      query = query.eq('category', filters.category);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async addExpense(expense: Partial<Expense>, creatorId?: string): Promise<Expense> {
    const client = getClient();
    const { data, error } = await client
      .from('expenses')
      .insert({
        homestay_id: expense.homestay_id,
        category: expense.category || 'other',
        amount: Number(expense.amount),
        spent_on: expense.spent_on || new Date().toISOString().split('T')[0],
        note: expense.note,
        created_by: creatorId,
      })
      .select('*, homestay:homestays(*)')
      .single();
    if (error) throw error;
    return data;
  },

  async recordExpense(expense: Partial<Expense>, creatorId?: string): Promise<Expense> {
    return api.addExpense(expense, creatorId);
  },

  async deleteExpense(expenseId: string): Promise<void> {
    const client = getClient();
    const { error } = await client.from('expenses').delete().eq('id', expenseId);
    if (error) throw error;
  },

  // ----------------------------------------------------------------------------
  // USERS & PROFILES (Super Admin)
  // ----------------------------------------------------------------------------
  async getUsers(): Promise<Profile[]> {
    const client = getClient();
    const { data, error } = await client
      .from('profiles')
      .select('*, manager_homestays(homestay_id)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map((u: any) => ({
      ...u,
      assigned_homestay_ids: (u.manager_homestays || []).map((mh: any) => mh.homestay_id),
    }));
  },

  async adminCreateUser(params: {
    email: string;
    password: string;
    full_name: string;
    role: UserRole;
    assigned_homestays?: string[];
  }): Promise<{ success: boolean; message: string; user?: any }> {
    const client = getClient();
    const { data, error } = await client.functions.invoke('admin-create-user', {
      body: { action: 'create_user', ...params },
    });
    if (error) throw new Error(error.message || 'Edge Function call failed.');
    if (data?.error) throw new Error(data.error);
    return data;
  },

  async adminToggleUserStatus(userId: string, active: boolean): Promise<void> {
    const client = getClient();
    try {
      const { data, error } = await client.functions.invoke('admin-create-user', {
        body: { action: 'toggle_active', user_id: userId, active },
      });
      if (!error && !data?.error) return;
    } catch (e) {
      // Edge function not deployed, fallback to direct Supabase RLS update
    }
    const { error } = await client.from('profiles').update({ active }).eq('id', userId);
    if (error) throw error;
  },

  async adminResetPassword(userId: string, newPassword: string): Promise<void> {
    const client = getClient();
    const { data, error } = await client.functions.invoke('admin-create-user', {
      body: { action: 'reset_password', user_id: userId, new_password: newPassword },
    });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
  },

  async adminUpdateRole(userId: string, role: UserRole, assigned_homestays?: string[]): Promise<void> {
    const client = getClient();
    try {
      const { data, error } = await client.functions.invoke('admin-create-user', {
        body: { action: 'update_role', user_id: userId, role, assigned_homestays },
      });
      if (!error && !data?.error) return;
    } catch (e) {
      // Edge function not deployed, fallback to direct Supabase RLS update
    }
    const { error } = await client.from('profiles').update({ role }).eq('id', userId);
    if (error) throw error;

    if (assigned_homestays !== undefined) {
      await client.from('manager_homestays').delete().eq('user_id', userId);
      if (assigned_homestays.length > 0) {
        const rows = assigned_homestays.map((hId) => ({ user_id: userId, homestay_id: hId }));
        await client.from('manager_homestays').insert(rows);
      }
    }
  },

  // ----------------------------------------------------------------------------
  // ACTIVITY LOG (Owner & Super Admin)
  // ----------------------------------------------------------------------------
  async getActivityLogs(): Promise<ActivityLog[]> {
    const client = getClient();
    const { data, error } = await client
      .from('activity_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return data || [];
  },
};
