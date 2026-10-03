-- Migration: Enable Row Level Security (RLS) across all tables to secure the Data API

-- 1. Enable RLS on all tables
ALTER TABLE public.clinic_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.default_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.day_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.week_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;

-- 2. Prescriptions Table needs an anon read policy 
-- because the frontend listens to real-time events on this table via supabase.channel().
-- Without a SELECT policy, real-time events are blocked for anon users.

DROP POLICY IF EXISTS "Allow public read access to prescriptions for realtime" ON public.prescriptions;

CREATE POLICY "Allow public read access to prescriptions for realtime" 
ON public.prescriptions
FOR SELECT 
TO anon, authenticated
USING (true);

-- No other policies are created. 
-- Since Next.js API routes connect using the service_role / postgres connection string,
-- they bypass RLS automatically. The client (anon) is now locked out of querying or modifying
-- sensitive tables like clinic_settings or login_attempts directly via the Supabase REST API.
