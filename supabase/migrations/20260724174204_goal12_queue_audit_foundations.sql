-- Goal 12A rehearsal migration.
--
-- This is additive only. It intentionally does not backfill historical queue
-- data, rewrite existing rows, change existing queue permissions, or route any
-- application traffic to a new API. It was first rehearsed on the isolated
-- restore project before any production decision.

alter table public.queues
  add column if not exists updated_at timestamptz,
  add column if not exists version integer,
  add column if not exists request_id uuid,
  add column if not exists rescheduled_from_id uuid,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid,
  add column if not exists archive_reason text,
  add column if not exists effective_duration_blocks integer,
  add column if not exists effective_price numeric(10, 2),
  add column if not exists effective_commission_rate numeric(10, 4);

comment on column public.queues.updated_at is
  'Goal 12: server-maintained timestamp for future optimistic updates.';
comment on column public.queues.version is
  'Goal 12: optimistic-concurrency version. Historical rows remain null until changed.';
comment on column public.queues.request_id is
  'Goal 12: idempotency key for future server-created queues.';
comment on column public.queues.rescheduled_from_id is
  'Goal 12: source queue link for future atomic rescheduling.';
comment on column public.queues.effective_duration_blocks is
  'Goal 12: duration snapshot for new server-created queues; historical rows are not backfilled.';
comment on column public.queues.effective_price is
  'Goal 12: price snapshot for new server-created queues; historical rows are not backfilled.';
comment on column public.queues.effective_commission_rate is
  'Goal 12: commission-rate snapshot for new server-created queues; historical rows are not backfilled.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'queues_rescheduled_from_id_fkey'
      and conrelid = 'public.queues'::regclass
  ) then
    alter table public.queues
      add constraint queues_rescheduled_from_id_fkey
      foreign key (rescheduled_from_id)
      references public.queues(id)
      on delete restrict
      not valid;
  end if;
end
$$;

create table if not exists public.queue_audit (
  id uuid primary key default uuid_generate_v4(),
  queue_id uuid not null references public.queues(id) on delete restrict,
  operation text not null check (operation in ('create', 'patch', 'status', 'reschedule', 'archive', 'restore')),
  actor_session_id uuid references public.app_sessions(id) on delete set null,
  actor_staff_id uuid references public.staff(id) on delete set null,
  release_id text,
  request_id uuid,
  changed_fields text[] not null default '{}',
  occurred_at timestamptz not null default now(),
  check (array_position(changed_fields, 'name') is null),
  check (array_position(changed_fields, 'phone') is null),
  check (array_position(changed_fields, 'note') is null)
);

comment on table public.queue_audit is
  'Goal 12 append-only queue mutation metadata. It deliberately stores field names only, never customer values.';

alter table public.queue_audit enable row level security;
revoke all on table public.queue_audit from anon, authenticated;

create or replace function public.queue_set_concurrency_metadata()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.version := coalesce(new.version, 1);
    new.updated_at := coalesce(new.updated_at, now());
    return new;
  end if;

  if (to_jsonb(new) - array['updated_at', 'version'])
       is distinct from
     (to_jsonb(old) - array['updated_at', 'version']) then
    new.version := coalesce(old.version, 0) + 1;
    new.updated_at := now();
  else
    new.version := old.version;
    new.updated_at := old.updated_at;
  end if;

  return new;
end;
$$;

revoke all on function public.queue_set_concurrency_metadata() from public, anon, authenticated;

drop trigger if exists queues_set_concurrency_metadata on public.queues;
create trigger queues_set_concurrency_metadata
before insert or update on public.queues
for each row execute function public.queue_set_concurrency_metadata();

-- CREATE INDEX CONCURRENTLY cannot run inside a transaction. Apply the two
-- low-lock indexes in a separate non-transactional migration operation:
--
-- create unique index concurrently if not exists queues_request_id_unique_idx
--   on public.queues (request_id) where request_id is not null;
-- create index concurrently if not exists queues_room_date_time_idx
--   on public.queues (room_id, date, time_block) where room_id is not null;
--
-- Goal 12A rehearses those statements separately on the restore clone. They
-- are intentionally not enabled in this transactional foundation migration.
