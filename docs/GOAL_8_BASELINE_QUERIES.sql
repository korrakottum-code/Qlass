-- Goal 8 production-integrity baseline.
-- READ ONLY: every statement is SELECT / catalog inspection. Run one statement
-- at a time, preferably off-peak. Results intentionally contain no PII.

-- 1. Direct control totals. Do not use catalogue row estimates as controls.
select
  (select count(*)::bigint from public.branches) as branches,
  (select count(*)::bigint from public.staff) as staff,
  (select count(*)::bigint from public.rooms) as rooms,
  (select count(*)::bigint from public.procedures) as procedures,
  (select count(*)::bigint from public.promos) as promos,
  (select count(*)::bigint from public.queues) as queues,
  (select count(*)::bigint from public.room_schedules) as room_schedules,
  (select count(*)::bigint from public.hn_customers) as hn_customers,
  (select count(*)::bigint from public.app_sessions) as app_sessions,
  (select count(*)::bigint from public.hn_lookup_audit) as hn_lookup_audit;

-- 2. Queue state, date range, nullable business fields, and branch distribution.
select coalesce(status, '<null>') as status, count(*)::bigint as queue_count
from public.queues
group by status
order by status;

select
  min(date) as min_date,
  max(date) as max_date,
  count(*) filter (where price is null)::bigint as null_price,
  count(*) filter (where duration_blocks is null)::bigint as null_duration,
  count(*) filter (where price is null or duration_blocks is null)::bigint
    as incomplete_pricing,
  count(*) filter (where room_id is null)::bigint as null_room
from public.queues;

with per_branch as (
  select branch_id, count(*)::bigint as queue_count
  from public.queues
  group by branch_id
)
select
  count(*)::bigint as branch_groups,
  min(queue_count)::bigint as min_queues,
  percentile_cont(0.5) within group (order by queue_count) as median_queues,
  max(queue_count)::bigint as max_queues,
  sum(queue_count)::bigint as total_queues
from per_branch;

-- 3. Candidate-only consistency checks. None of these authorizes a repair.
with ordered as (
  select room_id, date, id, time_block, duration_blocks,
         lag(time_block + greatest(coalesce(duration_blocks, 1), 1)) over
           (partition by room_id, date order by time_block, created_at, id)
           as prior_end
  from public.queues
  where room_id is not null
    and date is not null
    and status not in ('cancelled', 'rescheduled')
)
select count(*)::bigint as overlapping_queue_candidates
from ordered
where prior_end > time_block;

select
  count(*)::bigint as duplicate_slot_groups,
  coalesce(sum(row_count - 1), 0)::bigint as extra_rows_in_duplicate_slot_groups
from (
  select branch_id, room_id, date, time_block, count(*)::bigint as row_count
  from public.queues
  where branch_id is not null
    and room_id is not null
    and date is not null
    and status not in ('cancelled', 'rescheduled')
  group by branch_id, room_id, date, time_block
  having count(*) > 1
) duplicate_slots;

select
  count(*) filter (where r.id is null)::bigint as schedules_without_room,
  count(*) filter (where s.start_block is null or s.end_block is null)::bigint
    as schedules_missing_bounds,
  count(*) filter (where s.start_block >= s.end_block)::bigint
    as schedules_invalid_bounds
from public.room_schedules s
left join public.rooms r on r.id = s.room_id;

select
  count(*) filter (where r.id is null)::bigint as queues_without_room,
  count(*) filter (where b.id is null)::bigint as queues_without_branch,
  count(*) filter (where p.id is null and q.procedure_id is not null)::bigint
    as queues_with_missing_procedure,
  count(*) filter (where s.id is null and q.recorded_by is not null)::bigint
    as queues_with_missing_staff
from public.queues q
left join public.rooms r on r.id = q.room_id
left join public.branches b on b.id = q.branch_id
left join public.procedures p on p.id = q.procedure_id
left join public.staff s on s.id = q.recorded_by;

-- 4. Schema/access inventory. These are catalogue reads only.
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;

select c.relname as table_name,
       c.reltuples::bigint as estimated_rows,
       pg_total_relation_size(c.oid) as total_bytes,
       c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by pg_total_relation_size(c.oid) desc;

select tc.table_name, kcu.column_name,
       ccu.table_name as foreign_table, ccu.column_name as foreign_column,
       rc.delete_rule, rc.update_rule, tc.constraint_name
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
join information_schema.referential_constraints rc
  on tc.constraint_name = rc.constraint_name and tc.constraint_schema = rc.constraint_schema
join information_schema.constraint_column_usage ccu
  on rc.unique_constraint_name = ccu.constraint_name
 and rc.unique_constraint_schema = ccu.constraint_schema
where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
order by tc.table_name, tc.constraint_name, kcu.ordinal_position;

select schemaname, tablename as table_name, indexname as index_name, indexdef
from pg_indexes
where schemaname = 'public'
order by tablename, indexname;

select event_object_table as table_name, trigger_name, event_manipulation as event,
       action_timing, action_statement
from information_schema.triggers
where event_object_schema = 'public'
order by event_object_table, trigger_name;

select tablename as table_name, policyname, permissive, roles, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

select grantee, table_name,
       string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'service_role')
group by grantee, table_name
order by table_name, grantee;

select p.pubname as publication, c.relname as table_name
from pg_publication p
join pg_publication_rel pr on pr.prpubid = p.oid
join pg_class c on c.oid = pr.prrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
order by p.pubname, c.relname;

select n.nspname as schema_name, p.proname as function_name,
       p.prosecdef as security_definer,
       pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname;

select id, public, file_size_limit, allowed_mime_types
from storage.buckets
order by id;

select count(*)::bigint as storage_policy_count
from pg_policies
where schemaname = 'storage';
