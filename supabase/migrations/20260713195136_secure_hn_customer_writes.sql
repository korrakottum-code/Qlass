-- HN records are synced by GitHub Actions with SUPABASE_SERVICE_KEY, which
-- bypasses RLS. Browser clients must not be able to create, change, delete,
-- or truncate customer records directly.
--
-- This migration is schema/policy-only: it does not modify any hn_customers
-- rows. The matching emergency rollback is in supabase/rollback/.
begin;

drop policy if exists "Allow public insert on hn_customers" on public.hn_customers;
drop policy if exists "Allow public update on hn_customers" on public.hn_customers;
drop policy if exists "Allow public delete on hn_customers" on public.hn_customers;

revoke all privileges on table public.hn_customers from anon, authenticated;

commit;
