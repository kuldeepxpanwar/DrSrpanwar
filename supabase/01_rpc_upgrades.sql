-- Migration: Add advanced RPCs for token issuance and secure PIN verification
-- This brings the atomicity and security from the drnitesh engine into DrSrpanwar

-- 1. Atomic Token Issuance (Fixes Race Conditions)
CREATE OR REPLACE FUNCTION public.issue_token(
  _clinic_id text,
  _name text,
  _mobile text,
  _source text,      -- 'walk-in' | 'booking'
  _day_label text,   -- 'Aaj' | 'Kal'
  _slot_label text,
  _client_request_id text,
  _requires_pharmacy boolean DEFAULT false
)
RETURNS public.queue_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _next_token_num integer;
  _next_queue_order integer;
  _prefix text;
  _token text;
  _booking_id text;
  new_row public.queue_entries;
BEGIN
  -- Lock the clinic state row to prevent concurrent race conditions
  SELECT next_token_number, next_queue_order, clinic_prefix 
  INTO _next_token_num, _next_queue_order, _prefix
  FROM public.clinic_states 
  WHERE clinic_id = _clinic_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Clinic not found';
  END IF;

  -- Generate Token String (e.g. S-047)
  _token := _prefix || '-' || LPAD(_next_token_num::text, 3, '0');
  
  -- Generate Booking ID
  _booking_id := 'BK-' || EXTRACT(EPOCH FROM now())::bigint::text || '-' || floor(random() * 1000)::text;

  -- Insert the new entry
  INSERT INTO public.queue_entries (
    id, clinic_id, client_request_id, queue_order, token, booking_id, 
    name, mobile, source, day_label, slot_label, status, sync_state, 
    created_at, updated_at, requires_pharmacy_follow_up
  ) VALUES (
    gen_random_uuid()::text, _clinic_id, _client_request_id, _next_queue_order, _token, _booking_id,
    _name, _mobile, _source, _day_label, _slot_label, 'waiting', 'synced',
    now(), now(), _requires_pharmacy
  )
  RETURNING * INTO new_row;

  -- Increment the token counters for the clinic
  UPDATE public.clinic_states 
  SET 
    next_token_number = next_token_number + 1,
    next_queue_order = next_queue_order + 1,
    last_updated = now()
  WHERE clinic_id = _clinic_id;

  RETURN new_row;
END $$;


-- 2. Secure Staff/Doctor PIN Verification
-- Returns jsonb { status: 'ok'|'wrong'|'locked', role, id, name, clinic_access, designation }
CREATE OR REPLACE FUNCTION public.verify_member_pin(_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE 
  m public.staff_members;
BEGIN
  IF _pin !~ '^\d{4,6}$' THEN 
    RETURN jsonb_build_object('status', 'wrong'); 
  END IF;

  -- Loop through active members and verify hash
  FOR m IN
    SELECT * FROM public.staff_members
    WHERE status = 'active'
  LOOP
    -- Note: Since the app currently uses node crypto sha256 to hash basic pins
    -- we check against the sha256 digest in Postgres.
    IF m.pin_hash = encode(digest(_pin, 'sha256'), 'hex') THEN
      -- Update last login
      UPDATE public.staff_members SET last_login_at = now() WHERE id = m.id;
      
      RETURN jsonb_build_object(
        'status', 'ok', 
        'role', m.role, 
        'id', m.id, 
        'name', m.name,
        'designation', m.designation,
        'clinic_access', m.clinic_access
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object('status', 'wrong');
END $$;

-- Enable pgcrypto extension if not already enabled (needed for digest)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Set correct permissions
REVOKE ALL ON FUNCTION public.issue_token FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_token TO authenticated, anon;

REVOKE ALL ON FUNCTION public.verify_member_pin FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_member_pin TO authenticated, anon;
