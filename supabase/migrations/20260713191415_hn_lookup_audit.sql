-- Server-only HN lookup audit trail. Query text and customer data are never stored.
create table if not exists public.hn_lookup_audit (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete restrict,
  query_hash text not null,
  result_count integer not null check (result_count >= 0),
  source text not null check (source in ('proclinic', 'supabase')),
  created_at timestamptz not null default now()
);

create index if not exists hn_lookup_audit_staff_created_idx
  on public.hn_lookup_audit (staff_id, created_at desc);

alter table public.hn_lookup_audit enable row level security;
