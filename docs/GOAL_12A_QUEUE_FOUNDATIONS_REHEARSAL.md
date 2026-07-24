# Goal 12A — Queue foundations rehearsal

## Scope and safety boundary

This rehearsal ran **only** against the isolated restore project
`qlass-restore-verification-20260714` (`lsaljbxlccsypsbgxkrg`).  It did not
apply a migration, change an API key, deploy an Edge Function, or write queue
data in production.

The schema change is deliberately additive:

- future concurrency, idempotency, archive, rescheduling, and effective-value
  fields on `public.queues`;
- an append-only `public.queue_audit` metadata table; and
- a trigger which populates `version` and `updated_at` only for future writes.

Historical queues are neither backfilled nor rewritten.  In particular, a
missing historical price, duration, or commission value remains missing rather
than being guessed.

## Clone evidence

Before applying the foundation DDL, the clone contained 99,247 queues across
29 branches.  After the rehearsal:

| Check | Result |
| --- | --- |
| Queue count | 99,247 (unchanged) |
| Existing rows with `version` | 0 |
| Existing rows with `request_id` | 0 |
| Existing effective snapshots | 0 |
| Audit entries created by rehearsal | 0 |
| Existing queue update in a transaction, then rollback | 1 row succeeded; legacy null version preserved |

The compatibility update was rolled back inside the database transaction.  It
never persisted a queue change.

The audit table has RLS enabled, grants revoked from `anon` and
`authenticated`, and checks which prevent `name`, `phone`, or `note` from
being recorded as audit field names.  The table stores metadata and field names
only; it does not store customer values.

## Index rehearsal and production rule

Both intended indexes were created and verified on the restore clone:

- `queues_request_id_unique_idx`: unique partial index for non-null request IDs;
- `queues_room_date_time_idx`: partial lookup index for room/date/time.

Supabase SQL Editor and the connector execute statements inside a transaction,
so `CREATE INDEX CONCURRENTLY` was correctly rejected there.  The clone used
the non-concurrent form because it has no live application traffic.  This does
**not** authorize a production regular index build.

For production, a database connection that supports non-transactional SQL must
run these statements separately, with `lock_timeout = '5s'` and
`statement_timeout = '60s'`:

```sql
create unique index concurrently if not exists queues_request_id_unique_idx
  on public.queues (request_id)
  where request_id is not null;

create index concurrently if not exists queues_room_date_time_idx
  on public.queues (room_id, date, time_block)
  where room_id is not null;
```

No production execution is part of Goal 12A.

## Rollback and stop conditions

If a later production rollout shows a regression:

1. Stop routing requests to any new queue action immediately.
2. Disable the trigger or new server action; retain the additive columns and
   audit metadata so no evidence or queue data is lost.
3. Restore the previously deployed application release.
4. Investigate from the audit metadata and control totals before retrying.

Do not drop queue columns or delete audit rows as an incident response.  The
two indexes are additive and can remain while the application is rolled back.

## Explicit non-goals

This rehearsal does not introduce the server-side create, patch, status, or
reschedule API contracts.  Those are Goals 13–15 and require their own preview,
clone, rollout, and rollback gates.
