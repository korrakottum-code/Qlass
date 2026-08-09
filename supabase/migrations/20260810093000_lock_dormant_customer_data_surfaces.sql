-- Lock dormant tables that hold customer data but are no longer used by any
-- code path (verified 2026-08-10: no references in src/, supabase/functions/,
-- or the full git history; last row activity 2026-06-05 or earlier).
--
--   line_customers  (14 rows) - LINE booking prototype, reverted in PR #80
--   line_bookings   ( 9 rows) - LINE booking prototype, reverted in PR #80
--   ai_memory       ( 4 rows) - AI chat removed in Goal 2 (PR #88)
--   parse_hints     ( 1 row ) - PR #78 experiment, reverted in PR #80
--   get_occupied_slots()      - anon-executable SECURITY DEFINER helper for
--                               the same prototype
--
-- No rows are deleted or modified. Browser-key (anon/authenticated) access is
-- revoked; the service role keeps full access, so a future properly built
-- server-side integration is unaffected.
--
-- Rollback (per table, only via an explicit security exception):
--   grant select, insert, update, delete on public.<table> to anon, authenticated;
--   recreate the dropped allow-all policy if row access must return.

-- line_customers -------------------------------------------------------------
drop policy if exists "Allow all for line_customers" on public.line_customers;
revoke all on table public.line_customers from public, anon, authenticated;

-- line_bookings --------------------------------------------------------------
drop policy if exists "Allow all for line_bookings" on public.line_bookings;
revoke all on table public.line_bookings from public, anon, authenticated;

-- ai_memory ------------------------------------------------------------------
drop policy if exists "ai_memory_all" on public.ai_memory;
drop policy if exists "Allow public delete on ai_memory" on public.ai_memory;
drop policy if exists "Allow public insert on ai_memory" on public.ai_memory;
drop policy if exists "Allow public update on ai_memory" on public.ai_memory;
revoke all on table public.ai_memory from public, anon, authenticated;

-- parse_hints ----------------------------------------------------------------
alter table public.parse_hints enable row level security;
revoke all on table public.parse_hints from public, anon, authenticated;

-- get_occupied_slots ---------------------------------------------------------
revoke all on function public.get_occupied_slots(uuid, text) from public, anon, authenticated;
