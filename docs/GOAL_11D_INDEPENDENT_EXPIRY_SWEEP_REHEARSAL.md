# Goal 11D — Independent diagnostic expiry sweep rehearsal

## In plain language

Goal 11D adds an empty, private technical log table that can later tell the
team whether the application had a load, rendering, write, or Realtime
problem. It does **not** contain a booking, customer, HN, phone number, PIN,
staff identity, session, error text, request body, URL, or secret.

This follow-up makes sure that technical logs delete themselves after 14 days
even if nobody opens the application again. It is like an automatic cleanup
timer for an otherwise empty wastebasket.

## What the proposed migration does

When explicitly applied in a later production Go:

1. Enables the built-in `pg_cron` scheduler.
2. Creates the already-reviewed private `client_diagnostics` table.
3. Creates one indexed hourly job, at minute 17, that runs only:

   ```sql
   delete from public.client_diagnostics where expires_at <= now();
   ```

It does not create a public function, a browser grant, an HTTP request, or a
job that can read/write queues, customers, HN records, staff, rooms, or
bookings.

## Restore-project proof

Rehearsal project: `qlass-restore-verification-20260714`
(`lsaljbxlccsypsbgxkrg`), never production.

1. Enabled `pg_cron`, created the private diagnostic table, and scheduled the
   exact cleanup statement.
2. Temporarily changed the clone-only job to run every 10 seconds.
3. Inserted two synthetic, non-PII events:
   - one created 15 days ago and expired one day ago;
   - one current event, which was not expired.
4. The scheduler deleted the expired event without a new diagnostic write.
   The current event remained, proving it does not delete live rows.
5. Changed the temporary job to delete the two rehearsal rows, confirmed zero
   remained, then unscheduled it.
6. Dropped the clone-only table, extension, and temporary probe function.

Control totals before and after cleanup were identical:

| Control | Before | After |
| --- | ---: | ---: |
| queues | 99,247 | 99,247 |
| staff | 67 | 67 |
| HN customers | 180,012 | 180,012 |
| migration history | 4 | 4 |

The existing `queue_audit` table and queue metadata trigger also remained
present. The clone finished with no `client_diagnostics` table, no `pg_cron`
extension, no temporary function, and no scheduled rehearsal job.

## Production impact if later approved

While both telemetry flags remain unset/false, users see **no change**. The
application does not send diagnostics and no refresh banner appears. Booking,
queue editing, staff login, HN lookup, reports, and customer records keep their
current paths.

If telemetry is enabled later in its own canary, the only additional work is a
small, private technical event write. The hourly cleanup can briefly take a
small lock only on that new diagnostic table, never on a booking table.

## Important deployment stop gate

`20260724192700_goal13_create_queue_v1.sql` is pending immediately before this
Goal 11D migration. Therefore **do not run `supabase db push`** to apply this
Goal: it could also apply the unapproved Goal 13 queue-create migration.

Before any production action, prepare a separate operator runbook that applies
only the reviewed Goal 11D SQL, records its history safely, verifies the cron
job, and keeps all telemetry/refresh flags disabled. That runbook needs its own
explicit production Go.

## Stop and rollback

Stop immediately if the proposed SQL targets a table other than
`client_diagnostics`, if the job cannot be observed, or if telemetry flags are
enabled unexpectedly.

Rollback is safe and does not touch business data:

1. Keep telemetry and controlled refresh flags disabled.
2. Unschedule only `goal11d_purge_expired_client_diagnostics`.
3. If necessary, drop only the diagnostic table and its index after confirming
   it contains no needed incident evidence.
4. Do not alter queues, bookings, customer data, HN data, staff, sessions, or
   the existing Goal 12 objects.
