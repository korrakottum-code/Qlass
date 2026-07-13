-- Server-verified sessions are intentionally inaccessible through the Data API.
-- Only the staff-session Edge Function uses the service-role key to manage them.
create table if not exists public.app_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  staff_id uuid not null references public.staff(id) on delete cascade,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists app_sessions_active_token_idx
  on public.app_sessions (token_hash, expires_at)
  where revoked_at is null;

alter table public.app_sessions enable row level security;

create table if not exists public.app_login_attempts (
  identifier_hash text primary key,
  failures integer not null default 0 check (failures >= 0),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.app_login_attempts enable row level security;
