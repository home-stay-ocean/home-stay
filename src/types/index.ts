export type UserRole = 'super_admin' | 'owner' | 'manager';

export type BookingStatus = 'booked' | 'checked_in' | 'checked_out' | 'cancelled';

export type BookingSource = 'walk-in' | 'phone' | 'online';

export type PaymentMethod = 'cash' | 'upi' | 'card' | 'bank';

export type ExpenseCategory = 'electricity' | 'cleaning' | 'staff' | 'maintenance' | 'other';

export type CommissionType = 'percentage' | 'fixed';

export type CommissionStatus = 'pending' | 'approved' | 'paid' | 'cancelled';

export type CheckoutMethod = 'manual' | 'automatic';

export interface Profile {
  id: string;
  email?: string;
  full_name: string;
  role: UserRole;
  active: boolean;
  created_at: string;
  assigned_homestay_ids?: string[];
}

export interface Homestay {
  id: string;
  name: string;
  location: string;
  created_at?: string;
  rooms_count?: number;
}

export interface Room {
  id: string;
  homestay_id: string;
  name: string;
  default_rate: number;
  room_type?: string;
  is_ac?: boolean;
  active: boolean;
  created_at?: string;
  homestay?: Homestay;
}

export interface ManagerHomestay {
  user_id: string;
  homestay_id: string;
  created_at?: string;
}

export interface Guest {
  id: string;
  name: string;
  phone: string;
  id_proof_note?: string | null;
  created_at?: string;
  bookings_count?: number;
  total_spent?: number;
  last_booking_date?: string;
}

export interface ReferralPerson {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  commission_type: CommissionType;
  default_commission_rate: number;
  notes?: string | null;
  active: boolean;
  created_at?: string;
  updated_at?: string;
  total_bookings?: number;
  ac_bookings?: number;
  non_ac_bookings?: number;
  total_revenue?: number;
  commission_payable?: number;
  commission_paid?: number;
  commission_pending?: number;
}

export interface Booking {
  id: string;
  booking_number?: string;
  guest_id: string;
  room_id: string;
  check_in: string; // YYYY-MM-DD
  check_out: string; // YYYY-MM-DD
  num_guests: number;
  rate_per_night: number;
  total_amount: number;
  is_ac?: boolean;
  status: BookingStatus;
  source: BookingSource;
  referral_person_id?: string | null;
  manual_referral_name?: string | null;
  commission_type?: CommissionType | null;
  commission_rate?: number;
  commission_amount?: number;
  commission_status?: CommissionStatus;
  commission_paid_at?: string | null;
  commission_notes?: string | null;
  check_in_at?: string | null;
  actual_checkout_at?: string | null;
  checkout_method?: CheckoutMethod;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at?: string;
  guest?: Guest;
  room?: Room;
  referral_person?: ReferralPerson | null;
  payments?: Payment[];
  total_paid?: number;
  balance_due?: number;
}

export interface Payment {
  id: string;
  booking_id: string;
  amount: number;
  method: PaymentMethod;
  paid_on: string; // YYYY-MM-DD
  received_by?: string | null;
  note?: string | null;
  created_at: string;
  receiver?: Profile;
  booking?: Booking;
}

export interface Expense {
  id: string;
  homestay_id: string;
  category: ExpenseCategory;
  amount: number;
  spent_on: string; // YYYY-MM-DD
  note?: string | null;
  created_by?: string | null;
  created_at: string;
  homestay?: Homestay;
  creator?: Profile;
}

export interface ActivityLog {
  id: string;
  user_id?: string | null;
  action: string;
  table_name: string;
  record_id: string;
  details?: any;
  created_at: string;
  user_profile?: Profile;
}

export interface DashboardStats {
  total_bookings: number;
  total_customers: number;
  currently_checked_in: number;
  today_bookings: number;
  today_checkins: number;
  today_checkouts: number;
  today_auto_checkouts: number;
  ac_bookings: number;
  non_ac_bookings: number;
  direct_bookings: number;
  referral_bookings: number;
  commission_payable: number;
  commission_paid: number;
  commission_pending: number;
  total_rooms: number;
  this_month_income: number;
  total_pending_payments: number;
}

export interface PagedResult<T> {
  data: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export type ActiveScreen = 
  | 'dashboard'
  | 'bookings'
  | 'calendar'
  | 'analytics'
  | 'basic_stats'
  | 'expenses'
  | 'setup'
  | 'users'
  | 'activity_log'
  | 'customers'
  | 'referrals'
  | 'commissions';
