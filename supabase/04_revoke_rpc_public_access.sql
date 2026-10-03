-- Migration: Revoke public API access to sensitive RPC functions
-- By default, PostgreSQL grants EXECUTE privilege on functions to PUBLIC.
-- Supabase exposes functions in the "public" schema to the REST API.
-- We must revoke this access so that only our server-side code (using service_role/postgres) can execute them.

-- Revoke access for verify_member_pin
REVOKE EXECUTE ON FUNCTION public.verify_member_pin(text) FROM PUBLIC, anon, authenticated;

-- Revoke access for issue_token
REVOKE EXECUTE ON FUNCTION public.issue_token(text, text, text, text, text, text, text, boolean) FROM PUBLIC, anon, authenticated;
