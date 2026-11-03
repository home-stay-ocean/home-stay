-- ==============================================================================
-- HOMESTAY MANAGER - DATABASE MIGRATION V2
-- Performance Optimisation, 100,000+ Records, System-Wide Pagination,
-- Referral Person & Commission Tracking, Customer Deduplication,
-- and Automatic Checkout at 12:00 PM IST
-- ==============================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- 2. Update Rooms Table with room_type and is_ac
ALTER TABLE public.rooms 
ADD COLUMN IF NOT EXISTS room_type TEXT NOT NULL DEFAULT 'Standard',
ADD COLUMN IF NOT EXISTS is_ac BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_rooms_homestay_active ON public.rooms(homestay_id, active);
CREATE INDEX IF NOT EXISTS idx_rooms_is_ac ON public.rooms(is_ac);

-- 3. Referral Persons Table
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

-- Enable RLS on referral_persons
ALTER TABLE public.referral_persons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_owner_referral_persons" ON public.referral_persons;
CREATE POLICY "admin_owner_referral_persons" ON public.referral_persons
    FOR ALL TO authenticated
    USING (public.get_my_role() IN ('super_admin', 'owner'));

DROP POLICY IF EXISTS "manager_select_referral_persons" ON public.referral_persons;
CREATE POLICY "manager_select_referral_persons" ON public.referral_persons
    FOR SELECT TO authenticated
    USING (public.get_my_role() = 'manager');

-- 4. Sequential Booking Sequence
CREATE SEQUENCE IF NOT EXISTS booking_number_seq START WITH 1001;

-- 5. Update Bookings Table
ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS booking_number TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS is_ac BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS referral_person_id UUID REFERENCES public.referral_persons(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS manual_referral_name TEXT,
ADD COLUMN IF NOT EXISTS commission_type TEXT CHECK (commission_type IN ('percentage', 'fixed')),
ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS commission_amount NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS commission_status TEXT DEFAULT 'pending' CHECK (commission_status IN ('pending', 'approved', 'paid', 'cancelled')),
ADD COLUMN IF NOT EXISTS commission_paid_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS commission_notes TEXT,
ADD COLUMN IF NOT EXISTS check_in_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS actual_checkout_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS checkout_method TEXT DEFAULT 'manual' CHECK (checkout_method IN ('manual', 'automatic'));

-- Backfill booking_number for any existing rows that lack one
UPDATE public.bookings
SET booking_number = 'HS-' || TO_CHAR(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY') || '-' || LPAD(SUBSTRING(id::TEXT FROM 1 FOR 6), 6, '0')
WHERE booking_number IS NULL;

-- Make booking_number NOT NULL going forward (enforced via trigger)
ALTER TABLE public.bookings ALTER COLUMN booking_number SET NOT NULL;

-- 6. Essential Performance Indexes for 100,000+ Bookings
CREATE INDEX IF NOT EXISTS idx_bookings_guest_id ON public.bookings(guest_id);
CREATE INDEX IF NOT EXISTS idx_bookings_room_status ON public.bookings(room_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_dates ON public.bookings(check_in, check_out);
CREATE INDEX IF NOT EXISTS idx_bookings_created_at ON public.bookings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_booking_number ON public.bookings(booking_number);
CREATE INDEX IF NOT EXISTS idx_bookings_referral ON public.bookings(referral_person_id);
CREATE INDEX IF NOT EXISTS idx_bookings_commission_status ON public.bookings(commission_status);
CREATE INDEX IF NOT EXISTS idx_bookings_checkout_method ON public.bookings(checkout_method);
CREATE INDEX IF NOT EXISTS idx_bookings_is_ac ON public.bookings(is_ac);
CREATE INDEX IF NOT EXISTS idx_bookings_check_in_at ON public.bookings(check_in_at);
CREATE INDEX IF NOT EXISTS idx_bookings_actual_checkout_at ON public.bookings(actual_checkout_at);

-- 7. Phone Normalization Function (Indian Standards & Global Normalisation)
CREATE OR REPLACE FUNCTION public.normalize_phone(p_phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    cleaned TEXT;
BEGIN
    IF p_phone IS NULL OR TRIM(p_phone) = '' THEN 
        RETURN ''; 
    END IF;
    -- Strip all non-digit and non-plus characters
    cleaned := regexp_replace(p_phone, '[^0-9+]', '', 'g');
    
    -- Handle Indian numbers:
    -- +91XXXXXXXXXX
    IF cleaned ~ '^\+91[0-9]{10}$' THEN
        RETURN cleaned;
    -- 91XXXXXXXXXX
    ELSIF cleaned ~ '^91[0-9]{10}$' THEN
        RETURN '+' || cleaned;
    -- 0XXXXXXXXXX (leading zero + 10 digits)
    ELSIF cleaned ~ '^0[0-9]{10}$' THEN
        RETURN '+91' || substring(cleaned from 2);
    -- 10 digits alone
    ELSIF cleaned ~ '^[0-9]{10}$' THEN
        RETURN '+91' || cleaned;
    END IF;

    -- If already starts with '+', keep as is
    IF cleaned ~ '^\+[0-9]+$' THEN
        RETURN cleaned;
    END IF;

    RETURN cleaned;
END;
$$;

-- 8. Customer Phone Normalisation & Safe Deduplication Migration
DO $$
DECLARE
    r RECORD;
    canonical_id UUID;
    norm_phone TEXT;
BEGIN
    -- Update all phone numbers to normalized form
    UPDATE public.guests
    SET phone = public.normalize_phone(phone)
    WHERE phone IS NOT NULL AND phone <> public.normalize_phone(phone);

    -- Find and safely merge duplicates
    FOR r IN
        SELECT phone, array_agg(id ORDER BY created_at ASC) AS guest_ids
        FROM public.guests
        WHERE phone IS NOT NULL AND phone <> ''
        GROUP BY phone
        HAVING count(*) > 1
    LOOP
        canonical_id := r.guest_ids[1]; -- Pick the earliest created customer profile
        
        -- Relink all bookings pointing to duplicate guest IDs to canonical_id
        UPDATE public.bookings
        SET guest_id = canonical_id
        WHERE guest_id = ANY(r.guest_ids[2:array_length(r.guest_ids, 1)]);

        -- Safe delete of merged redundant guest rows
        DELETE FROM public.guests
        WHERE id = ANY(r.guest_ids[2:array_length(r.guest_ids, 1)]);
    END LOOP;
END $$;

-- Enforce UNIQUE constraint on guests.phone
DROP INDEX IF EXISTS public.idx_guests_phone;
CREATE UNIQUE INDEX IF NOT EXISTS idx_guests_phone_unique ON public.guests(phone);
CREATE INDEX IF NOT EXISTS idx_guests_name ON public.guests(name);

-- 9. Atomic Upsert Customer Function (Prevents Duplication & Race Conditions)
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

    -- Check if existing customer has this normalized phone
    SELECT id INTO v_guest_id
    FROM public.guests
    WHERE phone = v_norm_phone
    LIMIT 1;

    IF v_guest_id IS NOT NULL THEN
        -- Reuse existing profile and update notes/name if provided
        UPDATE public.guests
        SET 
            name = COALESCE(NULLIF(TRIM(p_name), ''), name),
            id_proof_note = COALESCE(NULLIF(TRIM(p_id_proof_note), ''), id_proof_note)
        WHERE id = v_guest_id;
        
        RETURN v_guest_id;
    ELSE
        -- Insert new customer atomically with conflict fallback
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

-- 10. Booking Pre-Save Trigger (Booking Number, Timestamps, AC copy & Commission Snapshot)
CREATE OR REPLACE FUNCTION public.handle_booking_presave()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_room RECORD;
    v_ref RECORD;
BEGIN
    -- 1. Auto-generate human-readable Booking Number if not set
    IF NEW.booking_number IS NULL OR TRIM(NEW.booking_number) = '' THEN
        NEW.booking_number := 'HS-' || TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYYMM') || '-' || LPAD(nextval('booking_number_seq')::TEXT, 5, '0');
    END IF;

    -- 2. Inherit Room AC / Non-AC property if not explicitly set
    SELECT is_ac, room_type INTO v_room FROM public.rooms WHERE id = NEW.room_id;
    IF FOUND AND NEW.is_ac IS NULL THEN
        NEW.is_ac := v_room.is_ac;
    END IF;

    -- 3. Check-In timestamp handling
    IF NEW.status = 'checked_in' AND (OLD IS NULL OR OLD.status <> 'checked_in') THEN
        IF NEW.check_in_at IS NULL THEN
            NEW.check_in_at := NOW();
        END IF;
    END IF;

    -- 4. Check-Out timestamp & method handling
    IF NEW.status = 'checked_out' AND (OLD IS NULL OR OLD.status <> 'checked_out') THEN
        IF NEW.actual_checkout_at IS NULL THEN
            NEW.actual_checkout_at := NOW();
        END IF;
        IF NEW.checkout_method IS NULL THEN
            NEW.checkout_method := 'manual';
        END IF;
    END IF;

    -- 5. Cancelled booking handles commission status
    IF NEW.status = 'cancelled' THEN
        NEW.commission_status := 'cancelled';
    END IF;

    -- 6. Commission Snapshot Calculation
    IF NEW.referral_person_id IS NOT NULL THEN
        -- If commission amount is not yet fixed or rate is empty, take snapshot from referral_persons
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

            -- Calculate snapshot amount
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
        -- Direct booking
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

-- 11. Automatic Checkout Function (12:00 PM IST on Scheduled Checkout Date)
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
    -- Current time and date in Asia/Kolkata
    v_now_ist := (NOW() AT TIME ZONE 'Asia/Kolkata');
    v_today_ist := v_now_ist::DATE;
    v_current_hour := EXTRACT(HOUR FROM v_now_ist);

    -- Automatic checkout occurs once 12:00 PM IST is reached on or after the scheduled checkout date.
    -- Future checkout dates are NEVER checked out early.
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

            -- Immutable audit entry
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

-- 12. Security RLS Update: HIDE AUDIT LOGS & ACTIVE LOGS FROM PARTNERS / MANAGERS
-- Partners (role = 'owner') and Managers must NOT access activity_log!
-- Only super_admin (Admin) has access.
DROP POLICY IF EXISTS "admin_owner_activity_log" ON public.activity_log;
DROP POLICY IF EXISTS "admin_only_activity_log" ON public.activity_log;

CREATE POLICY "admin_only_activity_log" ON public.activity_log
    FOR SELECT TO authenticated
    USING (public.get_my_role() = 'super_admin');

-- 13. Dashboard Aggregations RPC (Lightning-fast KPI generation for 100,000+ bookings)
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

