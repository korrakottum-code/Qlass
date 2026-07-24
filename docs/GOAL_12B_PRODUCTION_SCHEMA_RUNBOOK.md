# Goal 12B — Production queue-foundation runbook

## Purpose and boundary

This is the only approved procedure for adding the Goal 12 queue foundations
to production. It does not route traffic to a new API, backfill old queues,
delete data, or change browser/RLS grants. Existing users remain on the current
client contract.

Run it only in a low-traffic window, after this PR is merged and after an
explicit production go/no-go. A failed step is a stop condition, never a reason
to retry repeatedly while users are active.

## What changes

- Nullable metadata columns on `public.queues`.
- Private `public.queue_audit`, with RLS enabled and no browser-role grants.
- A server-owned trigger that assigns `version` and `updated_at` only for
  future inserts/material updates.
- Two later, separate concurrent indexes. No queue row values change.

Historical queues remain untouched: `version`, `request_id`, and effective
snapshot fields stay null. `queue_audit` starts empty; Goal 13 is the first
feature allowed to write it.

## Clone evidence and production baseline

The restore clone has 99,247 queues before and after rehearsal, 0 audit rows,
0 historical rows backfilled, and both required indexes. A one-row compatible
update was rolled back; its full statement took about 2.1 ms and the trigger
about 1.1 ms. The trigger function has no browser-role execute grant.

Production was inspected read-only while preparing this runbook: 114,404
queues, and no Goal 12 audit table, version column, or trigger exists.

## Required preflight

Record each item before any production write:

1. A recent scheduled backup timestamp in Supabase.
2. A healthy queue list and one existing booking in the live app.
3. Current `public.queues` control total.
4. No existing Goal 12 object (`queue_audit`, `queues.version`, trigger).
5. No blocker holding `public.queues`; otherwise postpone.
6. Two reviewers agree the period is low traffic.

If any item fails, make no schema change. Users continue normally.

## Step 1 — transactional foundations

Apply `supabase/migrations/20260724174204_goal12_queue_audit_foundations.sql`
once through the approved production migration path. It begins with:

```sql
set local lock_timeout = '5s';
set local statement_timeout = '60s';
```

It must run as one transaction. A timeout rolls the whole migration back; do
not split statements or lengthen timeouts while people are using the system.

Verify immediately: queue total is unchanged; old queues remain null in the
new fields; audit is empty and private; and the trigger exists. Do one
transaction-only compatibility update and roll it back—no customer change is
permitted for that check.

## Step 2 — low-lock indexes

`CREATE INDEX CONCURRENTLY` cannot run in the migration transaction or the
Supabase SQL editor/connector transaction wrapper. Use a direct database
connection that supports non-transactional SQL. Start a fresh session for each
statement; do not use `BEGIN`/`COMMIT`.

```sql
set lock_timeout = '5s';
set statement_timeout = '60s';
create unique index concurrently if not exists queues_request_id_unique_idx
  on public.queues (request_id) where request_id is not null;
```

```sql
set lock_timeout = '5s';
set statement_timeout = '60s';
create index concurrently if not exists queues_room_date_time_idx
  on public.queues (room_id, date, time_block) where room_id is not null;
```

If either index times out or is invalid, stop. Inspect and clean up only an
invalid index in a later reviewed operation; never delete queue rows.

## Step 3 — acceptance and stop/rollback

Keep the current frontend release and do not enable Goal 13 in this Goal.
Confirm: unchanged total, normal create/edit/status workflow works, a changed
queue receives version/timestamp, audit remains empty, indexes are valid, and
there are no elevated errors for 15 minutes. Record aggregates and durations
only—never PII, HN, PIN, tokens, or URLs.

There is no destructive rollback. A Step 1 failure rolls back automatically.
For an index failure, retain all applied foundations and defer just the index.
For a write regression, pause rollout and disable only the metadata trigger in
a separately time-bounded operation; keep columns, indexes, and audit evidence.
For any data-integrity concern, stop affected booking changes, preserve
evidence, compare totals, and use the verified backup only through an
incident-specific recovery decision.

Goal 13 production canary remains separately gated.
