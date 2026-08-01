-- Historical production migration recovered for source-of-truth alignment.
--
-- This is intentionally the same policy removal that already ran in QLASS
-- production. It does not read, insert, update, or delete HN customer data.
-- Keeping it in Git ensures a newly created database receives the same
-- browser-read protection as the existing production project.
drop policy if exists "Allow public read access on hn_customers" on public.hn_customers;
