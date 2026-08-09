-- Goal 18: close the plaintext-PIN / commission read hole.
--
-- All staff reads and writes now go through the staff-session Edge Function
-- (v10, service role) with session-verified role gates. The browser keys no
-- longer need any direct access to public.staff.
--
-- Verified before apply (2026-08-10):
--   - production frontend uses server-session staff reads (Goal 3) and
--     server staff writes (PR #128, live-tested: staff_update succeeded)
--   - the only direct staff usages in the client are the legacy
--     !VITE_USE_SERVER_SESSION path (supabaseService.js), unused in production
--   - no Realtime subscription on staff
--
-- No rows are deleted or modified. Service role retains full access.
--
-- Rollback (explicit security exception only):
--   grant select, insert, update, delete on public.staff to anon, authenticated;
--   (and recreate the dropped policies if row access must return)

drop policy if exists "Enable read access for all users" on public.staff;
drop policy if exists "Allow public insert on staff" on public.staff;
drop policy if exists "Allow public update on staff" on public.staff;
drop policy if exists "Allow public delete on staff" on public.staff;
revoke all on table public.staff from public, anon, authenticated;
