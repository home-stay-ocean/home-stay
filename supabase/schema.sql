-- ==============================================================================
-- HOMESTAY MANAGER - SUPABASE POSTGRESQL COMPLETE DATABASE SCHEMA & RLS
-- ==============================================================================

-- 1. Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gist"; -- Required for daterange exclusion constraint

-- 2. Custom Enums
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('super_admin', 'owner', 'manager');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE booking_status AS ENUM ('booked', 'checked_in', 'checked_out', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE booking_source AS ENUM ('walk-in', 'phone', 'online');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_method AS ENUM ('cash', 'upi', 'card', 'bank');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE expense_category AS ENUM ('electricity', 'cleaning', 'staff', 'maintenance', 'other');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- (Optional) If you want to reset and recreate everything completely fresh from scratch:
/*
DROP TABLE IF EXISTS public.payments CASCADE;
DROP TABLE IF EXISTS public.bookings CASCADE;
DROP TABLE IF EXISTS public.guests CASCADE;
DROP TABLE IF EXISTS public.expenses CASCADE;
DROP TABLE IF EXISTS public.activity_log CASCADE;
DROP TABLE IF EXISTS public.rooms CASCADE;
DROP TABLE IF EXISTS public.manager_homestays CASCADE;
DROP TABLE IF EXISTS public.homestays CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
*/

-- ==============================================================================
-- 3. TABLES DEFINITION
-- ==============================================================================

-- Profiles: extends auth.users
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'manager',
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Homestays
CREATE TABLE IF NOT EXISTS public.homestays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    location TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Rooms in Homestays
CREATE TABLE IF NOT EXISTS public.rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    homestay_id UUID NOT NULL REFERENCES public.homestays(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    default_rate NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    room_type TEXT NOT NULL DEFAULT 'Standard',
    is_ac BOOLEAN NOT NULL DEFAULT true,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Manager Homestay assignments (many-to-many)
-- If a manager is listed here, they are restricted to these homestays.
CREATE TABLE IF NOT EXISTS public.manager_homestays (
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    homestay_id UUID NOT NULL REFERENCES public.homestays(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, homestay_id)
);

-- Referral Persons
CREATE TABLE IF NOT EXISTS public.referral_persons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    commission_type TEXT NOT NULL DEFAULT 'percentage' CHECK (commission_type IN ('percentage', 'fixed')),
    default_commission_rate NUMERIC(10,2) NOT NULL DEFAULT 10.00 CHECK (default_commission_rate >= 0),
    notes TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_referral_persons_phone ON public.referral_persons(phone);
CREATE INDEX IF NOT EXISTS idx_referral_persons_active ON public.referral_persons(active);

-- Guests
CREATE TABLE IF NOT EXISTS public.guests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    id_proof_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_guests_phone_unique ON public.guests(phone);
CREATE INDEX IF NOT EXISTS idx_guests_name ON public.guests(name);

-- Booking sequence
CREATE SEQUENCE IF NOT EXISTS booking_number_seq START WITH 1001;

-- Bookings
CREATE TABLE IF NOT EXISTS public.bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_number TEXT UNIQUE NOT NULL,
    guest_id UUID NOT NULL REFERENCES public.guests(id) ON DELETE RESTRICT,
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE RESTRICT,
    check_in DATE NOT NULL,
    check_out DATE NOT NULL,
    num_guests INTEGER NOT NULL DEFAULT 1 CHECK (num_guests > 0),
    rate_per_night NUMERIC(10,2) NOT NULL CHECK (rate_per_night >= 0),
    total_amount NUMERIC(10,2) NOT NULL CHECK (total_amount >= 0),
    is_ac BOOLEAN NOT NULL DEFAULT true,
    status booking_status NOT NULL DEFAULT 'booked',
    source booking_source NOT NULL DEFAULT 'phone',
    referral_person_id UUID REFERENCES public.referral_persons(id) ON DELETE SET NULL,
    manual_referral_name TEXT,
    commission_type TEXT CHECK (commission_type IN ('percentage', 'fixed')),
    commission_rate NUMERIC(10,2) DEFAULT 0,
    commission_amount NUMERIC(10,2) DEFAULT 0,
    commission_status TEXT DEFAULT 'pending' CHECK (commission_status IN ('pending', 'approved', 'paid', 'cancelled')),
    commission_paid_at TIMESTAMPTZ,
    commission_notes TEXT,
    check_in_at TIMESTAMPTZ,
    actual_checkout_at TIMESTAMPTZ,
    checkout_method TEXT DEFAULT 'manual' CHECK (checkout_method IN ('manual', 'automatic')),
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT valid_dates CHECK (check_out > check_in)
);

-- EXCLUSION CONSTRAINT to prevent double bookings
-- Notice: daterange(check_in, check_out, '[)') treats check_out day as free for next guest!
-- Ignored for cancelled bookings.
DO $$ BEGIN
    ALTER TABLE public.bookings
    ADD CONSTRAINT no_overlapping_bookings
    EXCLUDE USING gist (
        room_id WITH =,
        daterange(check_in, check_out, '[)') WITH &&
    )
    WHERE (status <> 'cancelled');
EXCEPTION
    WHEN duplicate_table THEN null;
    WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS idx_bookings_dates ON public.bookings(check_in, check_out);
CREATE INDEX IF NOT EXISTS idx_bookings_room_status ON public.bookings(room_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_guest_id ON public.bookings(guest_id);
CREATE INDEX IF NOT EXISTS idx_bookings_created_at ON public.bookings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_booking_number ON public.bookings(booking_number);
CREATE INDEX IF NOT EXISTS idx_bookings_referral ON public.bookings(referral_person_id);
CREATE INDEX IF NOT EXISTS idx_bookings_commission_status ON public.bookings(commission_status);
CREATE INDEX IF NOT EXISTS idx_bookings_checkout_method ON public.bookings(checkout_method);
CREATE INDEX IF NOT EXISTS idx_bookings_is_ac ON public.bookings(is_ac);
CREATE INDEX IF NOT EXISTS idx_rooms_homestay_active ON public.rooms(homestay_id, active);
CREATE INDEX IF NOT EXISTS idx_rooms_is_ac ON public.rooms(is_ac);

-- Payments
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    method payment_method NOT NULL DEFAULT 'cash',
    paid_on DATE NOT NULL DEFAULT CURRENT_DATE,
    received_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_booking ON public.payments(booking_id);

-- Expenses
CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    homestay_id UUID NOT NULL REFERENCES public.homestays(id) ON DELETE CASCADE,
    category expense_category NOT NULL DEFAULT 'other',
    amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    spent_on DATE NOT NULL DEFAULT CURRENT_DATE,
    note TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_expenses_homestay_date ON public.expenses(homestay_id, spent_on);

-- Activity Log
CREATE TABLE IF NOT EXISTS public.activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON public.activity_log(created_at DESC);

-- ==============================================================================
-- 4. HELPER FUNCTIONS & TRIGGERS
-- ==============================================================================

-- Helper: Get current user's role from profiles table (Security Definer)
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS public.user_role 
LANGUAGE plpgsql 
STABLE 
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_role public.user_role;
BEGIN
    SELECT role INTO v_role
    FROM public.profiles
    WHERE id = auth.uid() AND active = true;
    
    RETURN v_role;
END;
$$;

-- Helper: Check if a user (or manager) has access to a specific homestay
CREATE OR REPLACE FUNCTION public.can_access_homestay(h_id UUID)
RETURNS BOOLEAN 
LANGUAGE plpgsql 
STABLE 
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_role public.user_role;
    v_assigned_count INT;
BEGIN
    v_role := public.get_my_role();
    
    -- super_admin and owner can access all homestays
    IF v_role IN ('super_admin', 'owner') THEN
        RETURN true;
    END IF;

    -- manager: check if restricted by manager_homestays
    IF v_role = 'manager' THEN
        SELECT COUNT(*) INTO v_assigned_count
        FROM public.manager_homestays
        WHERE user_id = auth.uid();

        -- If not explicitly assigned to specific homestays, can access all
        IF v_assigned_count = 0 THEN
            RETURN true;
        END IF;

        -- If assigned, check if this specific homestay is assigned
        RETURN EXISTS (
            SELECT 1 FROM public.manager_homestays
            WHERE user_id = auth.uid() AND homestay_id = h_id
        );
    END IF;

    RETURN false;
END;
$$;

-- Helper trigger for automatic profile creation when user is created in auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_full_name TEXT;
    v_role public.user_role;
BEGIN
    -- Safely extract full_name with fallbacks (prevents null constraint violation)
    v_full_name := COALESCE(
        NULLIF(TRIM(new.raw_user_meta_data->>'full_name'), ''),
        NULLIF(TRIM(split_part(new.email, '@', 1)), ''),
        'User'
    );

    -- Safely determine role (never crashes on invalid enum cast)
    IF new.raw_user_meta_data->>'role' = 'super_admin' THEN
        v_role := 'super_admin'::public.user_role;
    ELSIF new.raw_user_meta_data->>'role' = 'owner' THEN
        v_role := 'owner'::public.user_role;
    ELSE
        v_role := 'manager'::public.user_role;
    END IF;

    -- Upsert into public.profiles
    INSERT INTO public.profiles (id, email, full_name, role, active)
    VALUES (
        new.id,
        new.email,
        v_full_name,
        v_role,
        true
    )
    ON CONFLICT (id) DO UPDATE
    SET 
        email = COALESCE(EXCLUDED.email, public.profiles.email),
        full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name);

    RETURN new;
EXCEPTION
    WHEN OTHERS THEN
        -- Prevent rolling back auth.users creation if profile insertion encounters an unexpected issue
        RAISE WARNING 'handle_new_user trigger exception: %', SQLERRM;
        RETURN new;
END;
$$;

-- Trigger to hook into auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger function for Activity Log
CREATE OR REPLACE FUNCTION public.log_activity_trigger()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_record_id TEXT;
    v_details JSONB;
BEGIN
    IF (TG_OP = 'DELETE') THEN
        v_record_id := OLD.id::TEXT;
        v_details := to_jsonb(OLD);
        INSERT INTO public.activity_log(user_id, action, table_name, record_id, details)
        VALUES (auth.uid(), TG_OP, TG_TABLE_NAME, v_record_id, v_details);
        RETURN OLD;
    ELSIF (TG_OP = 'UPDATE') THEN
        v_record_id := NEW.id::TEXT;
        v_details := jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW));
        INSERT INTO public.activity_log(user_id, action, table_name, record_id, details)
        VALUES (auth.uid(), TG_OP, TG_TABLE_NAME, v_record_id, v_details);
        RETURN NEW;
    ELSIF (TG_OP = 'INSERT') THEN
        v_record_id := NEW.id::TEXT;
        v_details := to_jsonb(NEW);
        INSERT INTO public.activity_log(user_id, action, table_name, record_id, details)
        VALUES (auth.uid(), TG_OP, TG_TABLE_NAME, v_record_id, v_details);
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$;

-- Attach Activity Log triggers
DROP TRIGGER IF EXISTS audit_bookings ON public.bookings;
CREATE TRIGGER audit_bookings
    AFTER INSERT OR UPDATE OR DELETE ON public.bookings
    FOR EACH ROW EXECUTE FUNCTION public.log_activity_trigger();

DROP TRIGGER IF EXISTS audit_payments ON public.payments;
CREATE TRIGGER audit_payments
    AFTER INSERT OR UPDATE OR DELETE ON public.payments
    FOR EACH ROW EXECUTE FUNCTION public.log_activity_trigger();

DROP TRIGGER IF EXISTS audit_expenses ON public.expenses;
CREATE TRIGGER audit_expenses
    AFTER INSERT OR UPDATE OR DELETE ON public.expenses
    FOR EACH ROW EXECUTE FUNCTION public.log_activity_trigger();

DROP TRIGGER IF EXISTS audit_rooms ON public.rooms;
CREATE TRIGGER audit_rooms
    AFTER INSERT OR UPDATE OR DELETE ON public.rooms
    FOR EACH ROW EXECUTE FUNCTION public.log_activity_trigger();

DROP TRIGGER IF EXISTS audit_homestays ON public.homestays;
CREATE TRIGGER audit_homestays
    AFTER INSERT OR UPDATE OR DELETE ON public.homestays
    FOR EACH ROW EXECUTE FUNCTION public.log_activity_trigger();

-- ==============================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homestays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manager_homestays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_persons ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- REFERRAL PERSONS POLICIES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "admin_owner_referral_persons" ON public.referral_persons;
CREATE POLICY "admin_owner_referral_persons" ON public.referral_persons
    FOR ALL TO authenticated
    USING (public.get_my_role() IN ('super_admin', 'owner'));

DROP POLICY IF EXISTS "manager_select_referral_persons" ON public.referral_persons;
CREATE POLICY "manager_select_referral_persons" ON public.referral_persons
    FOR SELECT TO authenticated
    USING (public.get_my_role() = 'manager');

-- ------------------------------------------------------------------------------
-- PROFILES POLICIES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "users_read_own_profile" ON public.profiles;
CREATE POLICY "users_read_own_profile" ON public.profiles
    FOR SELECT TO authenticated
    USING (id = auth.uid());

DROP POLICY IF EXISTS "super_admin_manage_profiles" ON public.profiles;
CREATE POLICY "super_admin_manage_profiles" ON public.profiles
    FOR ALL TO authenticated
    USING (public.get_my_role() = 'super_admin');

DROP POLICY IF EXISTS "owners_read_profiles" ON public.profiles;
CREATE POLICY "owners_read_profiles" ON public.profiles
    FOR SELECT TO authenticated
    USING (public.get_my_role() = 'owner');

DROP POLICY IF EXISTS "managers_read_profiles" ON public.profiles;
CREATE POLICY "managers_read_profiles" ON public.profiles
    FOR SELECT TO authenticated
    USING (public.get_my_role() = 'manager');

DROP POLICY IF EXISTS "users_update_own_profile" ON public.profiles;
CREATE POLICY "users_update_own_profile" ON public.profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- ------------------------------------------------------------------------------
-- HOMESTAYS POLICIES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "admin_owner_homestays" ON public.homestays;
CREATE POLICY "admin_owner_homestays" ON public.homestays
    FOR ALL TO authenticated
    USING (public.get_my_role() IN ('super_admin', 'owner'));

DROP POLICY IF EXISTS "manager_view_homestays" ON public.homestays;
CREATE POLICY "manager_view_homestays" ON public.homestays
    FOR SELECT TO authenticated
    USING (public.get_my_role() = 'manager' AND public.can_access_homestay(id));

-- ------------------------------------------------------------------------------
-- ROOMS POLICIES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "admin_owner_rooms" ON public.rooms;
CREATE POLICY "admin_owner_rooms" ON public.rooms
    FOR ALL TO authenticated
    USING (public.get_my_role() IN ('super_admin', 'owner'));

DROP POLICY IF EXISTS "manager_view_rooms" ON public.rooms;
CREATE POLICY "manager_view_rooms" ON public.rooms
    FOR SELECT TO authenticated
    USING (public.get_my_role() = 'manager' AND public.can_access_homestay(homestay_id));

-- ------------------------------------------------------------------------------
-- MANAGER_HOMESTAYS POLICIES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "super_admin_manage_assignments" ON public.manager_homestays;
CREATE POLICY "super_admin_manage_assignments" ON public.manager_homestays
    FOR ALL TO authenticated
    USING (public.get_my_role() = 'super_admin');

DROP POLICY IF EXISTS "owner_view_assignments" ON public.manager_homestays;
CREATE POLICY "owner_view_assignments" ON public.manager_homestays
    FOR SELECT TO authenticated
    USING (public.get_my_role() = 'owner');

DROP POLICY IF EXISTS "manager_view_own_assignments" ON public.manager_homestays;
CREATE POLICY "manager_view_own_assignments" ON public.manager_homestays
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

-- ------------------------------------------------------------------------------
-- GUESTS POLICIES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "authenticated_manage_guests" ON public.guests;
CREATE POLICY "authenticated_manage_guests" ON public.guests
    FOR ALL TO authenticated
    USING (public.get_my_role() IN ('super_admin', 'owner', 'manager'));

-- ------------------------------------------------------------------------------
-- BOOKINGS POLICIES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "admin_owner_bookings" ON public.bookings;
CREATE POLICY "admin_owner_bookings" ON public.bookings
    FOR ALL TO authenticated
    USING (public.get_my_role() IN ('super_admin', 'owner'));

DROP POLICY IF EXISTS "manager_select_bookings" ON public.bookings;
CREATE POLICY "manager_select_bookings" ON public.bookings
    FOR SELECT TO authenticated
    USING (
        public.get_my_role() = 'manager' AND
        EXISTS (
            SELECT 1 FROM public.rooms r
            WHERE r.id = bookings.room_id AND public.can_access_homestay(r.homestay_id)
        )
    );

DROP POLICY IF EXISTS "manager_insert_bookings" ON public.bookings;
CREATE POLICY "manager_insert_bookings" ON public.bookings
    FOR INSERT TO authenticated
    WITH CHECK (
        public.get_my_role() = 'manager' AND
        EXISTS (
            SELECT 1 FROM public.rooms r
            WHERE r.id = room_id AND public.can_access_homestay(r.homestay_id)
        )
    );

DROP POLICY IF EXISTS "manager_update_bookings" ON public.bookings;
CREATE POLICY "manager_update_bookings" ON public.bookings
    FOR UPDATE TO authenticated
    USING (
        public.get_my_role() = 'manager' AND
        EXISTS (
            SELECT 1 FROM public.rooms r
            WHERE r.id = bookings.room_id AND public.can_access_homestay(r.homestay_id)
        )
    )
    WITH CHECK (
        public.get_my_role() = 'manager' AND
        EXISTS (
            SELECT 1 FROM public.rooms r
            WHERE r.id = room_id AND public.can_access_homestay(r.homestay_id)
        )
    );

-- ------------------------------------------------------------------------------
-- PAYMENTS POLICIES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "admin_owner_payments" ON public.payments;
CREATE POLICY "admin_owner_payments" ON public.payments
    FOR ALL TO authenticated
    USING (public.get_my_role() IN ('super_admin', 'owner'));

DROP POLICY IF EXISTS "manager_insert_payments" ON public.payments;
CREATE POLICY "manager_insert_payments" ON public.payments
    FOR INSERT TO authenticated
    WITH CHECK (
        public.get_my_role() = 'manager' AND
        EXISTS (
            SELECT 1 FROM public.bookings b
            JOIN public.rooms r ON r.id = b.room_id
            WHERE b.id = booking_id AND public.can_access_homestay(r.homestay_id)
        )
    );

DROP POLICY IF EXISTS "manager_select_payments" ON public.payments;
CREATE POLICY "manager_select_payments" ON public.payments
    FOR SELECT TO authenticated
    USING (
        public.get_my_role() = 'manager' AND
        EXISTS (
            SELECT 1 FROM public.bookings b
            JOIN public.rooms r ON r.id = b.room_id
            WHERE b.id = payments.booking_id AND public.can_access_homestay(r.homestay_id)
        )
    );

-- ------------------------------------------------------------------------------
-- EXPENSES POLICIES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "admin_owner_expenses" ON public.expenses;
CREATE POLICY "admin_owner_expenses" ON public.expenses
    FOR ALL TO authenticated
    USING (public.get_my_role() IN ('super_admin', 'owner'));

DROP POLICY IF EXISTS "manager_insert_expenses" ON public.expenses;
CREATE POLICY "manager_insert_expenses" ON public.expenses
    FOR INSERT TO authenticated
    WITH CHECK (
        public.get_my_role() = 'manager' AND
        public.can_access_homestay(homestay_id)
    );

DROP POLICY IF EXISTS "manager_select_expenses" ON public.expenses;
CREATE POLICY "manager_select_expenses" ON public.expenses
    FOR SELECT TO authenticated
    USING (
        public.get_my_role() = 'manager' AND
        public.can_access_homestay(homestay_id)
    );

-- ------------------------------------------------------------------------------
-- ACTIVITY LOG POLICIES (Super Admin ONLY - Hidden from Partners & Managers)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "admin_owner_activity_log" ON public.activity_log;
DROP POLICY IF EXISTS "admin_only_activity_log" ON public.activity_log;
CREATE POLICY "admin_only_activity_log" ON public.activity_log
    FOR SELECT TO authenticated
    USING (public.get_my_role() = 'super_admin');

DROP POLICY IF EXISTS "system_insert_activity_log" ON public.activity_log;
CREATE POLICY "system_insert_activity_log" ON public.activity_log
    FOR INSERT TO authenticated
    WITH CHECK (true);

-- ==============================================================================
-- 5B. AUTOMATIC CHECKOUT, CUSTOMER UPSERT & DASHBOARD FUNCTIONS
-- ==============================================================================

-- Phone normalizer
CREATE OR REPLACE FUNCTION public.normalize_phone(p_phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    cleaned TEXT;
BEGIN
    IF p_phone IS NULL OR TRIM(p_phone) = '' THEN 
        RETURN ''; 
    END IF;
    cleaned := regexp_replace(p_phone, '[^0-9+]', '', 'g');
    IF cleaned ~ '^\+91[0-9]{10}$' THEN
        RETURN cleaned;
    ELSIF cleaned ~ '^91[0-9]{10}$' THEN
        RETURN '+' || cleaned;
    ELSIF cleaned ~ '^0[0-9]{10}$' THEN
        RETURN '+91' || substring(cleaned from 2);
    ELSIF cleaned ~ '^[0-9]{10}$' THEN
        RETURN '+91' || cleaned;
    END IF;
    IF cleaned ~ '^\+[0-9]+$' THEN
        RETURN cleaned;
    END IF;
    RETURN cleaned;
END;
$$;

-- Atomic Upsert Customer (Prevents duplicate customers during concurrent bookings)
CREATE OR REPLACE FUNCTION public.upsert_customer(
    p_name TEXT,
    p_phone TEXT,
    p_id_proof_note TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_norm_phone TEXT;
    v_guest_id UUID;
BEGIN
    v_norm_phone := public.normalize_phone(p_phone);
    IF v_norm_phone IS NULL OR v_norm_phone = '' THEN
        RAISE EXCEPTION 'A valid phone number is required to register or find a customer.';
    END IF;

    SELECT id INTO v_guest_id
    FROM public.guests
    WHERE phone = v_norm_phone
    LIMIT 1;

    IF v_guest_id IS NOT NULL THEN
        UPDATE public.guests
        SET 
            name = COALESCE(NULLIF(TRIM(p_name), ''), name),
            id_proof_note = COALESCE(NULLIF(TRIM(p_id_proof_note), ''), id_proof_note)
        WHERE id = v_guest_id;
        RETURN v_guest_id;
    ELSE
        INSERT INTO public.guests (name, phone, id_proof_note)
        VALUES (TRIM(p_name), v_norm_phone, NULLIF(TRIM(p_id_proof_note), ''))
        ON CONFLICT (phone) DO UPDATE
        SET 
            name = COALESCE(NULLIF(EXCLUDED.name, ''), public.guests.name),
            id_proof_note = COALESCE(NULLIF(EXCLUDED.id_proof_note, ''), public.guests.id_proof_note)
        RETURNING id INTO v_guest_id;
        RETURN v_guest_id;
    END IF;
END;
$$;

-- Booking Pre-Save Trigger (Booking Number, Timestamps, AC copy & Commission Snapshot)
CREATE OR REPLACE FUNCTION public.handle_booking_presave()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_room RECORD;
    v_ref RECORD;
BEGIN
    IF NEW.booking_number IS NULL OR TRIM(NEW.booking_number) = '' THEN
        NEW.booking_number := 'HS-' || TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYYMM') || '-' || LPAD(nextval('booking_number_seq')::TEXT, 5, '0');
    END IF;

    SELECT is_ac, room_type INTO v_room FROM public.rooms WHERE id = NEW.room_id;
    IF FOUND AND NEW.is_ac IS NULL THEN
        NEW.is_ac := v_room.is_ac;
    END IF;

    IF NEW.status = 'checked_in' AND (OLD IS NULL OR OLD.status <> 'checked_in') THEN
        IF NEW.check_in_at IS NULL THEN
            NEW.check_in_at := NOW();
        END IF;
    END IF;

    IF NEW.status = 'checked_out' AND (OLD IS NULL OR OLD.status <> 'checked_out') THEN
        IF NEW.actual_checkout_at IS NULL THEN
            NEW.actual_checkout_at := NOW();
        END IF;
        IF NEW.checkout_method IS NULL THEN
            NEW.checkout_method := 'manual';
        END IF;
    END IF;

    IF NEW.status = 'cancelled' THEN
        NEW.commission_status := 'cancelled';
    END IF;

    IF NEW.referral_person_id IS NOT NULL THEN
        SELECT commission_type, default_commission_rate INTO v_ref 
        FROM public.referral_persons 
        WHERE id = NEW.referral_person_id;
        
        IF FOUND THEN
            IF NEW.commission_type IS NULL THEN
                NEW.commission_type := v_ref.commission_type;
            END IF;
            IF NEW.commission_rate IS NULL OR NEW.commission_rate = 0 THEN
                NEW.commission_rate := v_ref.default_commission_rate;
            END IF;

            IF NEW.commission_type = 'percentage' THEN
                NEW.commission_amount := ROUND((NEW.total_amount * NEW.commission_rate) / 100.0, 2);
            ELSE
                NEW.commission_amount := NEW.commission_rate;
            END IF;

            IF NEW.commission_status IS NULL THEN
                NEW.commission_status := 'pending';
            END IF;
        END IF;
    ELSE
        NEW.commission_amount := 0;
        NEW.commission_rate := 0;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_booking_presave ON public.bookings;
CREATE TRIGGER trigger_booking_presave
    BEFORE INSERT OR UPDATE ON public.bookings
    FOR EACH ROW EXECUTE FUNCTION public.handle_booking_presave();

-- Automatic Checkout at 12:00 PM IST on Scheduled Checkout Date
CREATE OR REPLACE FUNCTION public.process_automatic_checkouts()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_now_ist TIMESTAMP;
    v_today_ist DATE;
    v_current_hour INT;
    v_updated_count INT := 0;
    v_booking RECORD;
BEGIN
    v_now_ist := (NOW() AT TIME ZONE 'Asia/Kolkata');
    v_today_ist := v_now_ist::DATE;
    v_current_hour := EXTRACT(HOUR FROM v_now_ist);

    IF v_current_hour >= 12 THEN
        FOR v_booking IN
            SELECT id, guest_id, room_id, check_in, check_out
            FROM public.bookings
            WHERE status = 'checked_in'
              AND check_out <= v_today_ist
            FOR UPDATE SKIP LOCKED
        LOOP
            UPDATE public.bookings
            SET 
                status = 'checked_out',
                actual_checkout_at = NOW(),
                checkout_method = 'automatic',
                updated_at = NOW()
            WHERE id = v_booking.id;

            INSERT INTO public.activity_log (
                user_id, action, table_name, record_id, details
            ) VALUES (
                NULL,
                'AUTOMATIC_CHECKOUT',
                'bookings',
                v_booking.id::TEXT,
                jsonb_build_object(
                    'method', 'automatic',
                    'scheduled_checkout', v_booking.check_out,
                    'executed_at_ist', v_now_ist
                )
            );

            v_updated_count := v_updated_count + 1;
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'updated_count', v_updated_count,
        'executed_at_ist', v_now_ist
    );
END;
$$;

-- Dashboard Aggregation RPC
CREATE OR REPLACE FUNCTION public.get_dashboard_stats(p_homestay_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_today_ist DATE;
    v_now_ist TIMESTAMP;
    v_month_start DATE;
    v_result JSONB;
BEGIN
    v_now_ist := (NOW() AT TIME ZONE 'Asia/Kolkata');
    v_today_ist := v_now_ist::DATE;
    v_month_start := date_trunc('month', v_today_ist)::DATE;

    WITH scoped_rooms AS (
        SELECT r.id, r.homestay_id, r.is_ac
        FROM public.rooms r
        WHERE (p_homestay_id IS NULL OR r.homestay_id = p_homestay_id)
          AND r.active = true
    ),
    scoped_bookings AS (
        SELECT b.*
        FROM public.bookings b
        JOIN scoped_rooms sr ON sr.id = b.room_id
    ),
    payment_sums AS (
        SELECT 
            p.booking_id,
            COALESCE(SUM(p.amount), 0) AS total_paid,
            COALESCE(SUM(CASE WHEN p.paid_on >= v_month_start THEN p.amount ELSE 0 END), 0) AS month_paid
        FROM public.payments p
        JOIN scoped_bookings sb ON sb.id = p.booking_id
        GROUP BY p.booking_id
    )
    SELECT jsonb_build_object(
        'total_bookings', COUNT(*),
        'total_customers', (SELECT COUNT(DISTINCT guest_id) FROM scoped_bookings),
        'currently_checked_in', COUNT(*) FILTER (WHERE status = 'checked_in'),
        'today_bookings', COUNT(*) FILTER (WHERE (created_at AT TIME ZONE 'Asia/Kolkata')::DATE = v_today_ist),
        'today_checkins', COUNT(*) FILTER (WHERE check_in = v_today_ist AND status <> 'cancelled'),
        'today_checkouts', COUNT(*) FILTER (WHERE check_out = v_today_ist AND status <> 'cancelled'),
        'today_auto_checkouts', COUNT(*) FILTER (WHERE (actual_checkout_at AT TIME ZONE 'Asia/Kolkata')::DATE = v_today_ist AND checkout_method = 'automatic'),
        'ac_bookings', COUNT(*) FILTER (WHERE is_ac = true AND status <> 'cancelled'),
        'non_ac_bookings', COUNT(*) FILTER (WHERE is_ac = false AND status <> 'cancelled'),
        'direct_bookings', COUNT(*) FILTER (WHERE referral_person_id IS NULL AND status <> 'cancelled'),
        'referral_bookings', COUNT(*) FILTER (WHERE referral_person_id IS NOT NULL AND status <> 'cancelled'),
        'commission_payable', COALESCE(SUM(commission_amount) FILTER (WHERE commission_status IN ('pending', 'approved') AND status <> 'cancelled'), 0),
        'commission_paid', COALESCE(SUM(commission_amount) FILTER (WHERE commission_status = 'paid'), 0),
        'commission_pending', COALESCE(SUM(commission_amount) FILTER (WHERE commission_status = 'pending' AND status <> 'cancelled'), 0),
        'total_rooms', (SELECT COUNT(*) FROM scoped_rooms),
        'this_month_income', COALESCE((SELECT SUM(month_paid) FROM payment_sums), 0),
        'total_pending_payments', COALESCE(SUM(GREATEST(0, total_amount - COALESCE(ps.total_paid, 0))) FILTER (WHERE status <> 'cancelled'), 0)
    ) INTO v_result
    FROM scoped_bookings sb
    LEFT JOIN payment_sums ps ON ps.booking_id = sb.id;

    RETURN v_result;
END;
$$;

-- ------------------------------------------------------------------------------
-- 6. PERMISSIONS & BACKFILL EXISTING AUTH USERS
-- ------------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

-- Backfill any existing auth.users into public.profiles
INSERT INTO public.profiles (id, email, full_name, role, active)
SELECT 
    id, 
    email, 
    COALESCE(NULLIF(TRIM(raw_user_meta_data->>'full_name'), ''), NULLIF(TRIM(split_part(email, '@', 1)), ''), 'User'),
    'manager'::public.user_role,
    true
FROM auth.users
ON CONFLICT (id) DO UPDATE
SET 
    email = COALESCE(EXCLUDED.email, public.profiles.email),
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name);

-- ==============================================================================
-- 7. SQL SNIPPET TO PROMOTE INITIAL USER TO SUPER_ADMIN
-- ==============================================================================
-- Instructions:
-- 1. Create your user in Supabase Dashboard -> Authentication -> Users (Add user: email + password).
-- 2. Run the snippet below replacing 'your-email@example.com' with your actual email:

/*
UPDATE public.profiles
SET role = 'super_admin'
WHERE id = (SELECT id FROM auth.users WHERE email = 'your-email@example.com');
*/

-- (Optional) If you ever need to reset/empty all data and keep only profiles:
-- TRUNCATE TABLE public.payments, public.bookings, public.guests, public.expenses, public.activity_log, public.rooms, public.manager_homestays, public.homestays CASCADE;

