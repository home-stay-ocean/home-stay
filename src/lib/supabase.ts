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
  ReferralPerson,
  CommissionStatus,
  DashboardStats,
  PagedResult,
} from '../types';
import { intervalsOverlap, normalizePhoneNumber, getTodayISO } from './dateUtils';

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
// DIRECT SUPABASE DATA SERVICE (PURE DATABASE - OPTIMISED FOR 100,000+ RECORDS)
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
    return (data || []).map((r: any) => ({
      ...r,
      room_type: r.room_type || 'Standard',
      is_ac: r.is_ac ?? true,
    }));
  },

  async saveRoom(room: Partial<Room>): Promise<Room> {
    const client = getClient();
    const payload = {
      name: room.name,
      homestay_id: room.homestay_id,
      default_rate: room.default_rate,
      room_type: room.room_type || 'Standard',
      is_ac: room.is_ac ?? true,
      active: room.active ?? true,
    };

    if (room.id) {
      const { data, error } = await client
        .from('rooms')
        .update(payload)
        .eq('id', room.id)
        .select('*, homestay:homestays(*)')
        .single();
      if (error) throw error;
      return data;
    } else {
      const { data, error } = await client
        .from('rooms')
        .insert(payload)
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
  // GUESTS / CUSTOMERS (WITH NORMALIZATION & DEDUPLICATION)
  // ----------------------------------------------------------------------------
  async getGuests(search?: string): Promise<Guest[]> {
    const client = getClient();
    let query = client.from('guests').select('*').order('name').limit(100);
    if (search && search.trim()) {
      const s = search.trim();
      const norm = normalizePhoneNumber(s);
      if (norm) {
        query = query.or(`name.ilike.%${s}%,phone.ilike.%${s}%,phone.eq.${norm}`);
      } else {
        query = query.or(`name.ilike.%${s}%,phone.ilike.%${s}%`);
      }
    }
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async getCustomersPaged(params?: {
    page?: number;
    pageSize?: number;
    search?: string;
  }): Promise<PagedResult<Guest>> {
    const client = getClient();
    const page = Math.max(1, params?.page || 1);
    const pageSize = params?.pageSize || 50;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = client
      .from('guests')
      .select('*, bookings:bookings(count)', { count: 'exact' });

    if (params?.search && params.search.trim()) {
      const s = params.search.trim();
      const norm = normalizePhoneNumber(s);
      if (norm) {
        query = query.or(`name.ilike.%${s}%,phone.ilike.%${s}%,phone.eq.${norm}`);
      } else {
        query = query.or(`name.ilike.%${s}%,phone.ilike.%${s}%`);
      }
    }

    query = query.order('created_at', { ascending: false }).range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;

    const formatted = (data || []).map((g: any) => ({
      ...g,
      bookings_count: g.bookings?.[0]?.count || 0,
    }));

    const totalCount = count || 0;
    return {
      data: formatted,
      totalCount,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
    };
  },

  async upsertCustomer(guest: {
    id?: string;
    name: string;
    phone: string;
    id_proof_note?: string | null;
  }): Promise<Guest> {
    const client = getClient();
    const normalizedPhone = normalizePhoneNumber(guest.phone);

    // 1. Try atomic PostgreSQL RPC function if available
    try {
      const { data: rpcGuestId, error: rpcErr } = await client.rpc('upsert_customer', {
        p_name: guest.name.trim(),
        p_phone: normalizedPhone,
        p_id_proof_note: guest.id_proof_note?.trim() || null,
      });
      if (!rpcErr && rpcGuestId) {
        const { data: gRecord } = await client
          .from('guests')
          .select('*')
          .eq('id', rpcGuestId)
          .single();
        if (gRecord) return gRecord;
      }
    } catch {
      // Fallback below
    }

    // 2. Client-side fallback lookup by normalized phone
    let existingQuery = client.from('guests').select('*');
    if (guest.id) {
      existingQuery = existingQuery.eq('id', guest.id);
    } else {
      existingQuery = existingQuery.or(`phone.eq.${normalizedPhone},phone.eq.${guest.phone.trim()}`);
    }

    const { data: existing } = await existingQuery.order('created_at', { ascending: true }).maybeSingle();

    if (existing) {
      const { data, error } = await client
        .from('guests')
        .update({
          name: guest.name.trim() || existing.name,
          phone: normalizedPhone,
          id_proof_note: guest.id_proof_note !== undefined ? (guest.id_proof_note?.trim() || null) : existing.id_proof_note,
        })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    } else {
      const { data, error } = await client
        .from('guests')
        .insert({
          name: guest.name.trim(),
          phone: normalizedPhone,
          id_proof_note: guest.id_proof_note?.trim() || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    }
  },

  async saveGuest(guest: Partial<Guest>): Promise<Guest> {
    return api.upsertCustomer({
      id: guest.id,
      name: guest.name || '',
      phone: guest.phone || '',
      id_proof_note: guest.id_proof_note,
    });
  },

  async findGuestByPhone(phone: string): Promise<Guest | null> {
    const client = getClient();
    const clean = phone.trim();
    if (!clean) return null;
    const normalized = normalizePhoneNumber(clean);

    let query = client.from('guests').select('*');
    if (normalized) {
      query = query.or(`phone.eq.${normalized},phone.eq.${clean}`);
    } else {
      query = query.eq('phone', clean);
    }

    const { data, error } = await query.order('created_at', { ascending: true }).maybeSingle();
    if (error) return null;
    return data || null;
  },

  // ----------------------------------------------------------------------------
  // REFERRAL PERSONS & COMMISSION MANAGEMENT
  // ----------------------------------------------------------------------------
  async getReferralPersons(activeOnly: boolean = false): Promise<ReferralPerson[]> {
    const client = getClient();
    let query = client.from('referral_persons').select('*').order('name');
    if (activeOnly) {
      query = query.eq('active', true);
    }
    const { data, error } = await query;
    if (error) {
      // If table not yet created, return empty
      return [];
    }
    return data || [];
  },

  async getReferralPersonsPaged(params?: {
    page?: number;
    pageSize?: number;
    search?: string;
    activeOnly?: boolean;
  }): Promise<PagedResult<ReferralPerson>> {
    const client = getClient();
    const page = Math.max(1, params?.page || 1);
    const pageSize = params?.pageSize || 50;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = client.from('referral_persons').select('*, bookings(*)', { count: 'exact' });

    if (params?.activeOnly) {
      query = query.eq('active', true);
    }
    if (params?.search && params.search.trim()) {
      const s = params.search.trim();
      query = query.or(`name.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%`);
    }

    query = query.order('name').range(from, to);

    const { data, error, count } = await query;
    if (error) {
      return { data: [], totalCount: 0, page, pageSize, totalPages: 1 };
    }

    const formatted: ReferralPerson[] = (data || []).map((rp: any) => {
      const bList = rp.bookings || [];
      const nonCancelled = bList.filter((b: any) => b.status !== 'cancelled');
      const acBookings = nonCancelled.filter((b: any) => b.is_ac).length;
      const nonAcBookings = nonCancelled.filter((b: any) => !b.is_ac).length;
      const totalRev = nonCancelled.reduce((sum: number, b: any) => sum + Number(b.total_amount || 0), 0);
      const payable = nonCancelled
        .filter((b: any) => b.commission_status === 'pending' || b.commission_status === 'approved')
        .reduce((sum: number, b: any) => sum + Number(b.commission_amount || 0), 0);
      const paid = bList
        .filter((b: any) => b.commission_status === 'paid')
        .reduce((sum: number, b: any) => sum + Number(b.commission_amount || 0), 0);
      const pending = nonCancelled
        .filter((b: any) => b.commission_status === 'pending')
        .reduce((sum: number, b: any) => sum + Number(b.commission_amount || 0), 0);

      return {
        id: rp.id,
        name: rp.name,
        phone: rp.phone,
        email: rp.email,
        commission_type: rp.commission_type,
        default_commission_rate: rp.default_commission_rate,
        notes: rp.notes,
        active: rp.active,
        created_at: rp.created_at,
        updated_at: rp.updated_at,
        total_bookings: nonCancelled.length,
        ac_bookings: acBookings,
        non_ac_bookings: nonAcBookings,
        total_revenue: totalRev,
        commission_payable: payable,
        commission_paid: paid,
        commission_pending: pending,
      };
    });

    const totalCount = count || 0;
    return {
      data: formatted,
      totalCount,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
    };
  },

  async saveReferralPerson(rp: Partial<ReferralPerson>): Promise<ReferralPerson> {
    const client = getClient();
    const payload = {
      name: rp.name?.trim(),
      phone: normalizePhoneNumber(rp.phone),
      email: rp.email?.trim() || null,
      commission_type: rp.commission_type || 'percentage',
      default_commission_rate: Number(rp.default_commission_rate || 0),
      notes: rp.notes?.trim() || null,
      active: rp.active ?? true,
      updated_at: new Date().toISOString(),
    };

    if (rp.id) {
      const { data, error } = await client
        .from('referral_persons')
        .update(payload)
        .eq('id', rp.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    } else {
      const { data, error } = await client
        .from('referral_persons')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data;
    }
  },

  async deleteReferralPerson(id: string): Promise<void> {
    const client = getClient();
    const { error } = await client.from('referral_persons').delete().eq('id', id);
    if (error) throw error;
  },

  async updateCommissionStatus(
    bookingId: string,
    status: CommissionStatus,
    notes?: string
  ): Promise<void> {
    const client = getClient();
    const updatePayload: any = {
      commission_status: status,
      updated_at: new Date().toISOString(),
    };

    if (status === 'paid') {
      updatePayload.commission_paid_at = new Date().toISOString();
    }
    if (notes !== undefined) {
      updatePayload.commission_notes = notes;
    }

    const { error } = await client.from('bookings').update(updatePayload).eq('id', bookingId);
    if (error) throw error;
  },

  // ----------------------------------------------------------------------------
  // BOOKINGS (SERVER-SIDE PAGINATION, MULTI-FILTER & HIGH CONCURRENCY SCALING)
  // ----------------------------------------------------------------------------
  async getBookingsPaged(params?: {
    page?: number;
    pageSize?: number;
    homestay_id?: string;
    room_id?: string;
    status?: string;
    unpaid_only?: boolean;
    search?: string;
    is_ac?: boolean;
    referral_person_id?: string;
    direct_only?: boolean;
    has_referral?: boolean;
    commission_status?: string;
    checkout_method?: string;
    check_in_from?: string;
    check_in_to?: string;
    check_out_from?: string;
    check_out_to?: string;
    sort_by?: 'newest' | 'oldest' | 'check_in' | 'check_out';
  }): Promise<PagedResult<Booking>> {
    const client = getClient();
    const page = Math.max(1, params?.page || 1);
    const pageSize = params?.pageSize || 50;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = client
      .from('bookings')
      .select(
        `
        *,
        guest:guests(*),
        room:rooms(*, homestay:homestays(*)),
        referral_person:referral_persons(*),
        payments(*)
      `,
        { count: 'exact' }
      );

    // 1. Status Filter
    if (params?.status && params.status !== 'all') {
      query = query.eq('status', params.status);
    }

    // 2. Room / Property Filter
    if (params?.room_id && params.room_id !== 'all') {
      query = query.eq('room_id', params.room_id);
    }

    // 3. AC / Non-AC Filter
    if (params?.is_ac !== undefined) {
      query = query.eq('is_ac', params.is_ac);
    }

    // 4. Referral Filter
    if (params?.has_referral) {
      // Only bookings that have a referral person ID OR a non-empty manual referral name
      query = query.or('referral_person_id.not.is.null,manual_referral_name.not.is.null');
    } else if (params?.direct_only) {
      query = query.is('referral_person_id', null);
    }
    if (params?.referral_person_id && params.referral_person_id !== 'all') {
      query = query.eq('referral_person_id', params.referral_person_id);
    }

    // 5. Commission Status Filter
    if (params?.commission_status && params.commission_status !== 'all') {
      query = query.eq('commission_status', params.commission_status);
    }

    // 6. Checkout Method Filter
    if (params?.checkout_method && params.checkout_method !== 'all') {
      query = query.eq('checkout_method', params.checkout_method);
    }

    // 7. Date Ranges
    if (params?.check_in_from) {
      query = query.gte('check_in', params.check_in_from);
    }
    if (params?.check_in_to) {
      query = query.lte('check_in', params.check_in_to);
    }
    if (params?.check_out_from) {
      query = query.gte('check_out', params.check_out_from);
    }
    if (params?.check_out_to) {
      query = query.lte('check_out', params.check_out_to);
    }

    // 8. Search across booking number, guest, room, notes
    if (params?.search && params.search.trim()) {
      const s = params.search.trim();
      query = query.or(
        `booking_number.ilike.%${s}%,notes.ilike.%${s}%,manual_referral_name.ilike.%${s}%`
      );
    }

    // 9. Sorting
    switch (params?.sort_by) {
      case 'oldest':
        query = query.order('created_at', { ascending: true });
        break;
      case 'check_in':
        query = query.order('check_in', { ascending: false });
        break;
      case 'check_out':
        query = query.order('check_out', { ascending: false });
        break;
      case 'newest':
      default:
        query = query.order('created_at', { ascending: false });
        break;
    }

    // 10. Database Range Pagination
    query = query.range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;

    let result = (data || []).map((b: any) => {
      const room = Array.isArray(b.room) ? b.room[0] : b.room;
      const guest = Array.isArray(b.guest) ? b.guest[0] : b.guest;
      const referral_person = Array.isArray(b.referral_person) ? b.referral_person[0] : b.referral_person;
      const payments = Array.isArray(b.payments) ? b.payments : [];
      const totalPaid = payments.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
      return {
        ...b,
        booking_number: b.booking_number || `HS-${b.id.substring(0, 8).toUpperCase()}`,
        is_ac: b.is_ac ?? room?.is_ac ?? true,
        room,
        guest,
        referral_person,
        payments,
        total_paid: totalPaid,
        balance_due: Math.max(0, Number(b.total_amount || 0) - totalPaid),
      };
    });

    // Property in-memory guard if filtering by homestay_id on joined room
    if (params?.homestay_id && params.homestay_id !== 'all') {
      result = result.filter((b) => b.room?.homestay_id === params.homestay_id);
    }

    if (params?.unpaid_only) {
      result = result.filter((b) => (b.balance_due || 0) > 0 && b.status !== 'cancelled');
    }

    const totalCount = count || 0;
    return {
      data: result,
      totalCount,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
    };
  },

  async getBookings(filters?: {
    homestay_id?: string;
    status?: string;
    unpaid_only?: boolean;
    search?: string;
    start_date?: string;
    end_date?: string;
    limit?: number;
  }): Promise<Booking[]> {
    const client = getClient();
    let query = client
      .from('bookings')
      .select(
        `
        *,
        guest:guests(*),
        room:rooms(*, homestay:homestays(*)),
        referral_person:referral_persons(*),
        payments(*)
      `
      )
      .order('check_in', { ascending: false });

    if (filters?.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }
    if (filters?.start_date && filters?.end_date) {
      query = query.lte('check_in', filters.end_date).gte('check_out', filters.start_date);
    }

    query = query.limit(filters?.limit || 300);

    const { data, error } = await query;
    if (error) throw error;

    let result = (data || []).map((b: any) => {
      const room = Array.isArray(b.room) ? b.room[0] : b.room;
      const guest = Array.isArray(b.guest) ? b.guest[0] : b.guest;
      const referral_person = Array.isArray(b.referral_person) ? b.referral_person[0] : b.referral_person;
      const payments = Array.isArray(b.payments) ? b.payments : [];
      const totalPaid = payments.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
      return {
        ...b,
        booking_number: b.booking_number || `HS-${b.id.substring(0, 8).toUpperCase()}`,
        is_ac: b.is_ac ?? room?.is_ac ?? true,
        room,
        guest,
        referral_person,
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
          Boolean(b.booking_number?.toLowerCase().includes(s)) ||
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

    // 1. Scalable Conflict Check: Query ONLY overlapping reservations for this specific room
    const { data: overlapping, error: overlapErr } = await client
      .from('bookings')
      .select('id, check_in, check_out, guest:guests(name)')
      .eq('room_id', booking.room_id)
      .neq('status', 'cancelled')
      .lt('check_in', booking.check_out!)
      .gt('check_out', booking.check_in!);

    if (!overlapErr && overlapping && overlapping.length > 0) {
      const conflict = overlapping.find((b: any) => b.id !== booking.id);
      if (conflict) {
        const gName = (conflict.guest as any)?.name || 'another guest';
        throw new Error(
          `Room Conflict: This room is already reserved by ${gName} from ${conflict.check_in} to ${conflict.check_out}. Please choose another room or different dates.`
        );
      }
    }

    // 2. Fetch Room details for AC inheritance if not specified
    let isAc = booking.is_ac;
    if (isAc === undefined && booking.room_id) {
      const { data: rInfo } = await client.from('rooms').select('is_ac').eq('id', booking.room_id).single();
      if (rInfo) isAc = rInfo.is_ac;
    }

    // 3. Commission Snapshot Calculation
    let commissionRate = booking.commission_rate || 0;
    let commissionAmount = booking.commission_amount || 0;
    let commissionType = booking.commission_type || null;

    if (booking.referral_person_id) {
      const { data: refPerson } = await client
        .from('referral_persons')
        .select('*')
        .eq('id', booking.referral_person_id)
        .single();

      if (refPerson) {
        commissionType = commissionType || refPerson.commission_type;
        if (!commissionRate) {
          commissionRate = Number(refPerson.default_commission_rate || 0);
        }
        if (!commissionAmount) {
          if (commissionType === 'percentage') {
            commissionAmount = Math.round(((Number(booking.total_amount || 0) * commissionRate) / 100) * 100) / 100;
          } else {
            commissionAmount = commissionRate;
          }
        }
      }
    }

    const payload: any = {
      guest_id: booking.guest_id,
      room_id: booking.room_id,
      check_in: booking.check_in,
      check_out: booking.check_out,
      num_guests: booking.num_guests || 1,
      rate_per_night: booking.rate_per_night,
      total_amount: booking.total_amount,
      is_ac: isAc ?? true,
      status: booking.status || 'booked',
      source: booking.source || 'phone',
      notes: booking.notes?.trim() || null,
      referral_person_id: booking.referral_person_id || null,
      manual_referral_name: booking.manual_referral_name?.trim() || null,
      commission_type: commissionType,
      commission_rate: commissionRate,
      commission_amount: commissionAmount,
      commission_status: booking.commission_status || (booking.referral_person_id ? 'pending' : undefined),
    };

    if (booking.status === 'checked_in') {
      payload.check_in_at = booking.check_in_at || new Date().toISOString();
    }
    if (booking.status === 'checked_out') {
      payload.actual_checkout_at = booking.actual_checkout_at || new Date().toISOString();
      payload.checkout_method = booking.checkout_method || 'manual';
    }

    try {
      if (booking.id) {
        payload.updated_at = new Date().toISOString();
        const { data, error } = await client
          .from('bookings')
          .update(payload)
          .eq('id', booking.id)
          .select('*, guest:guests(*), room:rooms(*, homestay:homestays(*)), referral_person:referral_persons(*)')
          .single();

        if (error) {
          if (error.code === '23P01' || error.message?.includes('no_overlapping_bookings')) {
            throw new Error('Room Conflict: This room is already booked for the selected dates. Please choose another date or room.');
          }
          throw error;
        }
        return data;
      } else {
        payload.created_by = creatorId;
        const { data, error } = await client
          .from('bookings')
          .insert(payload)
          .select('*, guest:guests(*), room:rooms(*, homestay:homestays(*)), referral_person:referral_persons(*)')
          .single();

        if (error) {
          if (error.code === '23P01' || error.message?.includes('no_overlapping_bookings')) {
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

  async updateBookingStatus(
    bookingId: string,
    status: Booking['status'],
    checkoutMethod: 'manual' | 'automatic' = 'manual'
  ): Promise<void> {
    const client = getClient();
    const { data: bData } = await client
      .from('bookings')
      .select('status, check_in_at, actual_checkout_at')
      .eq('id', bookingId)
      .single();

    if (bData && bData.status === 'checked_out' && status === 'checked_in') {
      throw new Error('This guest has already checked out. A completed reservation cannot be checked in again.');
    }

    const payload: any = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === 'checked_in' && !bData?.check_in_at) {
      payload.check_in_at = new Date().toISOString();
    }
    if (status === 'checked_out') {
      if (!bData?.actual_checkout_at) {
        payload.actual_checkout_at = new Date().toISOString();
      }
      payload.checkout_method = checkoutMethod;
    }
    if (status === 'cancelled') {
      payload.commission_status = 'cancelled';
    }

    const { error } = await client.from('bookings').update(payload).eq('id', bookingId);
    if (error) throw error;
  },

  async deleteBooking(bookingId: string): Promise<void> {
    const client = getClient();
    const { error } = await client.from('bookings').delete().eq('id', bookingId);
    if (error) throw error;
  },

  // ----------------------------------------------------------------------------
  // AUTOMATIC CHECKOUT ENGINE (12:00 PM IST ON SCHEDULED CHECKOUT DATE)
  // ----------------------------------------------------------------------------
  async processAutomaticCheckouts(): Promise<{ success: boolean; updatedCount: number }> {
    const client = getClient();
    try {
      // Invoke PostgreSQL database function
      const { data, error } = await client.rpc('process_automatic_checkouts');
      if (!error && data) {
        return { success: true, updatedCount: data.updated_count || 0 };
      }
    } catch {
      // Fallback in JavaScript if function not yet applied in DB
    }

    // Client-side fallback check
    // Check if current hour in Asia/Kolkata is >= 12
    const now = new Date();
    const kolkataFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = kolkataFormatter.formatToParts(now);
    const hourPart = parts.find((p) => p.type === 'hour')?.value;
    const yearPart = parts.find((p) => p.type === 'year')?.value;
    const monthPart = parts.find((p) => p.type === 'month')?.value;
    const dayPart = parts.find((p) => p.type === 'day')?.value;

    const currentHour = parseInt(hourPart || '0', 10);
    const todayIst = `${yearPart}-${monthPart}-${dayPart}`;

    if (currentHour < 12) {
      return { success: true, updatedCount: 0 };
    }

    // Find checked-in bookings where check_out date <= todayIst
    const { data: eligible } = await client
      .from('bookings')
      .select('id, check_out')
      .eq('status', 'checked_in')
      .lte('check_out', todayIst);

    let updatedCount = 0;
    if (eligible && eligible.length > 0) {
      for (const b of eligible) {
        await client
          .from('bookings')
          .update({
            status: 'checked_out',
            actual_checkout_at: new Date().toISOString(),
            checkout_method: 'automatic',
            updated_at: new Date().toISOString(),
          })
          .eq('id', b.id);
        updatedCount++;
      }
    }

    return { success: true, updatedCount };
  },

  // ----------------------------------------------------------------------------
  // DASHBOARD AGGREGATED STATS (DATABASE-LEVEL AGGREGATION FOR 100,000+ BOOKINGS)
  // ----------------------------------------------------------------------------
  async getDashboardStats(homestayId?: string): Promise<DashboardStats> {
    const client = getClient();
    const pId = homestayId && homestayId !== 'all' ? homestayId : null;

    try {
      const { data, error } = await client.rpc('get_dashboard_stats', { p_homestay_id: pId });
      if (!error && data) {
        return {
          total_bookings: Number(data.total_bookings || 0),
          total_customers: Number(data.total_customers || 0),
          currently_checked_in: Number(data.currently_checked_in || 0),
          today_bookings: Number(data.today_bookings || 0),
          today_checkins: Number(data.today_checkins || 0),
          today_checkouts: Number(data.today_checkouts || 0),
          today_auto_checkouts: Number(data.today_auto_checkouts || 0),
          ac_bookings: Number(data.ac_bookings || 0),
          non_ac_bookings: Number(data.non_ac_bookings || 0),
          direct_bookings: Number(data.direct_bookings || 0),
          referral_bookings: Number(data.referral_bookings || 0),
          commission_payable: Number(data.commission_payable || 0),
          commission_paid: Number(data.commission_paid || 0),
          commission_pending: Number(data.commission_pending || 0),
          total_rooms: Number(data.total_rooms || 1),
          this_month_income: Number(data.this_month_income || 0),
          total_pending_payments: Number(data.total_pending_payments || 0),
        };
      }
    } catch {
      // Fallback if RPC not created yet
    }

    // Safe fallback calculation
    const today = getTodayISO();
    const monthStart = `${today.substring(0, 7)}-01`;

    const [
      { count: totalBookings },
      { count: checkedInCount },
      { count: todayCheckIns },
      { count: todayCheckOuts },
      { count: acCount },
      { count: nonAcCount },
      { count: refCount },
      { count: directCount },
      { count: totalGuests },
    ] = await Promise.all([
      client.from('bookings').select('*', { count: 'exact', head: true }),
      client.from('bookings').select('*', { count: 'exact', head: true }).eq('status', 'checked_in'),
      client.from('bookings').select('*', { count: 'exact', head: true }).eq('check_in', today).neq('status', 'cancelled'),
      client.from('bookings').select('*', { count: 'exact', head: true }).eq('check_out', today).neq('status', 'cancelled'),
      client.from('bookings').select('*', { count: 'exact', head: true }).eq('is_ac', true).neq('status', 'cancelled'),
      client.from('bookings').select('*', { count: 'exact', head: true }).eq('is_ac', false).neq('status', 'cancelled'),
      client.from('bookings').select('*', { count: 'exact', head: true }).not('referral_person_id', 'is', null).neq('status', 'cancelled'),
      client.from('bookings').select('*', { count: 'exact', head: true }).is('referral_person_id', null).neq('status', 'cancelled'),
      client.from('guests').select('*', { count: 'exact', head: true }),
    ]);

    // Commissions sum query
    const { data: commData } = await client
      .from('bookings')
      .select('commission_amount, commission_status')
      .not('referral_person_id', 'is', null)
      .neq('status', 'cancelled');

    let commPayable = 0;
    let commPaid = 0;
    let commPending = 0;
    (commData || []).forEach((c: any) => {
      const amt = Number(c.commission_amount || 0);
      if (c.commission_status === 'pending' || c.commission_status === 'approved') commPayable += amt;
      if (c.commission_status === 'paid') commPaid += amt;
      if (c.commission_status === 'pending') commPending += amt;
    });

    return {
      total_bookings: totalBookings || 0,
      total_customers: totalGuests || 0,
      currently_checked_in: checkedInCount || 0,
      today_bookings: 0,
      today_checkins: todayCheckIns || 0,
      today_checkouts: todayCheckOuts || 0,
      today_auto_checkouts: 0,
      ac_bookings: acCount || 0,
      non_ac_bookings: nonAcCount || 0,
      direct_bookings: directCount || 0,
      referral_bookings: refCount || 0,
      commission_payable: commPayable,
      commission_paid: commPaid,
      commission_pending: commPending,
      total_rooms: 1,
      this_month_income: 0,
      total_pending_payments: 0,
    };
  },

  // ----------------------------------------------------------------------------
  // PAYMENTS (PAGED & RECORDING WITH PROTECTION)
  // ----------------------------------------------------------------------------
  async getPayments(bookingId?: string): Promise<Payment[]> {
    const client = getClient();
    let query = client
      .from('payments')
      .select(
        `
        *,
        booking:bookings(*, guest:guests(*), room:rooms(*, homestay:homestays(*))),
        receiver:profiles(*)
      `
      )
      .order('paid_on', { ascending: false });

    if (bookingId) {
      query = query.eq('booking_id', bookingId);
    }
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async getPaymentsPaged(params?: {
    page?: number;
    pageSize?: number;
    bookingId?: string;
  }): Promise<PagedResult<Payment>> {
    const client = getClient();
    const page = Math.max(1, params?.page || 1);
    const pageSize = params?.pageSize || 50;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = client
      .from('payments')
      .select(
        `
        *,
        booking:bookings(*, guest:guests(*), room:rooms(*, homestay:homestays(*))),
        receiver:profiles(*)
      `,
        { count: 'exact' }
      )
      .order('paid_on', { ascending: false })
      .range(from, to);

    if (params?.bookingId) {
      query = query.eq('booking_id', params.bookingId);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    const totalCount = count || 0;
    return {
      data: data || [],
      totalCount,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
    };
  },

  async recordPayment(payment: Partial<Payment>, receiverId?: string): Promise<Payment> {
    const payAmount = Number(payment.amount);
    if (!payAmount || payAmount <= 0) {
      throw new Error('Payment amount must be greater than zero.');
    }

    const client = getClient();

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
      .select(
        `
        *,
        booking:bookings(*, guest:guests(*), room:rooms(*, homestay:homestays(*))),
        receiver:profiles(*)
      `
      )
      .single();

    if (error) throw error;
    return data;
  },

  // ----------------------------------------------------------------------------
  // EXPENSES (PAGED & RECORDING)
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

  async getExpensesPaged(params?: {
    page?: number;
    pageSize?: number;
    homestay_id?: string;
    category?: string;
  }): Promise<PagedResult<Expense>> {
    const client = getClient();
    const page = Math.max(1, params?.page || 1);
    const pageSize = params?.pageSize || 50;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = client
      .from('expenses')
      .select('*, homestay:homestays(*), creator:profiles(*)', { count: 'exact' })
      .order('spent_on', { ascending: false })
      .range(from, to);

    if (params?.homestay_id && params.homestay_id !== 'all') {
      query = query.eq('homestay_id', params.homestay_id);
    }
    if (params?.category && params.category !== 'all') {
      query = query.eq('category', params.category);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    const totalCount = count || 0;
    return {
      data: data || [],
      totalCount,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
    };
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
    } catch {
      // Edge function not deployed, fallback
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
    } catch {
      // Edge function not deployed, fallback
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
  // ACTIVITY LOG (SUPER ADMIN ONLY - ENFORCED ON BACKEND & API)
  // ----------------------------------------------------------------------------
  async getActivityLogs(): Promise<ActivityLog[]> {
    const client = getClient();
    const { data, error } = await client
      .from('activity_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return data || [];
  },

  async getActivityLogsPaged(params?: {
    page?: number;
    pageSize?: number;
    search?: string;
    table?: string;
  }): Promise<PagedResult<ActivityLog>> {
    const client = getClient();
    const page = Math.max(1, params?.page || 1);
    const pageSize = params?.pageSize || 50;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = client
      .from('activity_log')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (params?.table && params.table !== 'all') {
      query = query.eq('table_name', params.table);
    }
    if (params?.search && params.search.trim()) {
      const s = params.search.trim();
      query = query.or(`action.ilike.%${s}%,record_id.ilike.%${s}%,table_name.ilike.%${s}%`);
    }

    query = query.range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;

    const totalCount = count || 0;
    return {
      data: data || [],
      totalCount,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
    };
  },
};
