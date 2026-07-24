-- Goal 11D: privacy-safe, server-only client diagnostics.
-- This is additive. No browser role can read or write this table.

create table if not exists public.client_diagnostics (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  release_id text not null check (release_id ~ '^[A-Za-z0-9._-]{1,128}$'),
  event_name text not null check (event_name in (
    'client_error', 'initial_load', 'realtime_status', 'render_error', 'write_outcome'
  )),
  outcome text check (outcome is null or outcome in ('started', 'succeeded', 'failed')),
  stage text check (stage is null or stage in ('staff', 'core', 'history')),
  realtime_status text check (realtime_status is null or realtime_status in (
    'SUBSCRIBED', 'TIMED_OUT', 'CLOSED', 'CHANNEL_ERROR'
  )),
  duration_ms integer check (duration_ms is null or duration_ms between 0 and 600000),
  check (expires_at >= created_at and expires_at <= created_at + interval '14 days')
);

comment on table public.client_diagnostics is
  'Goal 11D operational telemetry only. It deliberately contains no staff, session, customer, phone, HN, PIN, request body, error message, URL, or secret value.';

alter table public.client_diagnostics enable row level security;
revoke all on table public.client_diagnostics from public, anon, authenticated;

create index if not exists client_diagnostics_expires_at_idx
  on public.client_diagnostics (expires_at);

-- Expired rows are removed on each accepted diagnostic write. Before any
-- production enablement, operations must also schedule an independent sweep
-- so an inactive project does not retain expired operational rows.
create or replace function public.purge_expired_client_diagnostics()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.client_diagnostics where expires_at <= now();
  return new;
end;
$$;

revoke all on function public.purge_expired_client_diagnostics() from public, anon, authenticated;

drop trigger if exists client_diagnostics_retention on public.client_diagnostics;
create trigger client_diagnostics_retention
after insert on public.client_diagnostics
for each statement execute function public.purge_expired_client_diagnostics();
