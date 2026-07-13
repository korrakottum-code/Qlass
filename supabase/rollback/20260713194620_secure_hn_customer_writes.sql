-- Emergency rollback for 20260713194620_secure_hn_customer_writes.sql.
-- Run only if the verified service-role HN sync fails after production rollout.
-- This restores the pre-Goal-6 write surface; it does not restore public reads.
-- It does not modify any hn_customers rows.
begin;

grant insert, update, delete, truncate, references, trigger
  on table public.hn_customers to anon, authenticated;

create policy "Allow public insert on hn_customers"
  on public.hn_customers for insert with check (true);

create policy "Allow public update on hn_customers"
  on public.hn_customers for update using (true) with check (true);

create policy "Allow public delete on hn_customers"
  on public.hn_customers for delete using (true);

commit;
