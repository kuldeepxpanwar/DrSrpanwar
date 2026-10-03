-- Migration: Add explicit deny policies to tables that are intentionally server-only
-- This clears the "RLS Enabled No Policy" (INFO) warning in Supabase Linter
-- by explicitly documenting that these tables are blocked for client access.

CREATE POLICY "Deny all public access to clinic_settings" ON public.clinic_settings FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "Deny all public access to clinic_states" ON public.clinic_states FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "Deny all public access to day_overrides" ON public.day_overrides FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "Deny all public access to default_schedules" ON public.default_schedules FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "Deny all public access to login_attempts" ON public.login_attempts FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "Deny all public access to patient_visits" ON public.patient_visits FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "Deny all public access to queue_entries" ON public.queue_entries FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "Deny all public access to staff_members" ON public.staff_members FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "Deny all public access to week_schedules" ON public.week_schedules FOR ALL TO anon, authenticated USING (false);
