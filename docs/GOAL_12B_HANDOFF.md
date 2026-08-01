# Goal 12B — Production closure record

## Current status

**Completed and reconciled.** The production rollout was completed and
verified; its source changes merged in PR #111 (runbook), PR #112 (corrective
metadata trigger and index helper), and PR #113 (migration-history alignment).

Do not repeat the production migration, trigger replacement, or index
operation.

## Production evidence

Project: `QLASS` (`hjuvtsjjtucdirlkdgwa`)

- Queue count before rollout: **114,404**.
- Queue count after foundations, corrective trigger, and indexes: **114,404**.
- No queue record was inserted, updated, or deleted by this rollout.
- `queue_audit` is private (RLS enabled; no `anon` or `authenticated` grants).
- The queue metadata trigger exists and browser roles cannot call its function.
- A transaction-only synthetic insert was rolled back after confirming that
  `version` is forced to `1` and `updated_at` is server-owned.
- Both indexes exist and are `indisvalid = true` and `indisready = true`:
  - `queues_request_id_unique_idx`
  - `queues_room_date_time_idx`

## Read-only production recheck (2026-08-02)

This recheck made no database changes and read no customer values.

- Queue count: **124,537** (normal operational growth since rollout).
- `queue_audit`: exists, RLS enabled, **0 rows**.
- All ten Goal 12 additive metadata columns exist.
- `queues_set_concurrency_metadata` exists; `PUBLIC`, `anon`, and
  `authenticated` cannot execute its function directly.
- `queues_request_id_unique_idx` and `queues_room_date_time_idx` are both
  valid and ready.

This proves the foundation remains present and private. It does not claim that
the current count should equal the historical rollout count; active users have
continued creating normal bookings since then.

## Production changes already applied

1. Additive Goal 12 queue foundation (nullable metadata fields, private audit
   table, trigger).
2. Corrective trigger replacement.  This ensures a legacy browser client
   cannot supply its own first `version` or `updated_at` value on queue insert.
3. The two indexes above, created with `CREATE INDEX CONCURRENTLY` via the
   Session pooler.  This avoids blocking normal queue writes.

## Source-control reconciliation

The source branch mentioned in the original handoff was merged in PR #112.
PR #113 then aligned the source migration history with the already-applied
production history. No migration-history record was edited on production.

No additional Goal 12 pull request or production deployment is required.

## Important follow-up: migration history alignment

Goal 12C reconciles this history **from source control**, rather than editing
the production migration-history table. See
[`GOAL_12C_MIGRATION_HISTORY_REHEARSAL.md`](GOAL_12C_MIGRATION_HISTORY_REHEARSAL.md).
Until that source-only PR is merged and its verification has passed, do not run
`supabase db push` against production.
