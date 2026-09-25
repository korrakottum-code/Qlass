# Goal 11D — Production cutover runbook (blocked by Goal 13 order)

## Current production fact

Read-only preflight on 2026-08-02 found:

- 124,537 queues, 69 staff, and 189,555 HN records;
- no `client_diagnostics` table and no `pg_cron` extension;
- no Goal 13 or Goal 11D migration recorded; and
- deployed `staff-session` has neither the diagnostics nor release-status
  action.

No value, booking, session, or configuration was changed by this check.

## Why Goal 11D cannot go first

The canonical source order is:

1. `20260724192700_goal13_create_queue_v1.sql`
2. `20260724192800_goal11d_client_observability.sql`

Applying Goal 11D first would make production history out of order. Running
`supabase db push` today would apply **both** migrations, including the
unapproved Goal 13 function. Neither outcome is acceptable.

Therefore this Goal is deliberately blocked until Goal 13 has its own explicit
production Go, exact migration procedure, and post-change verification. This
is a safety gate, not a product failure: all users remain on the existing,
working paths.

## Required order after Goal 13 is complete

Only after a read-only migration check proves Goal 13 is recorded on production
and Goal 11D is the **only** local pending migration may an operator request a
separate Goal 11D production Go.

At that time:

1. Record a fresh backup/checkpoint, queue/staff/HN totals, and a normal live
   login, HN lookup, queue create, edit, and status check.
2. Confirm `supabase migration list --linked` shows Goal 13 remote-applied and
   Goal 11D as the sole pending local migration. If any other migration is
   pending, stop.
3. Apply only Goal 11D through the reviewed migration path. Reconfirm the
   exact migration list immediately before applying; do not use a dashboard
   query, `migration repair`, or ad-hoc history entry as a shortcut.
4. Verify the private `client_diagnostics` table, RLS, no browser grants, its
   expiry index, and the named hourly `pg_cron` job. Verify business control
   totals did not change.
5. Deploy the reviewed `staff-session` version only with all three controls
   unset/false: `QLASS_OBSERVABILITY_ENABLED`,
   `QLASS_CONTROLLED_REFRESH_ENABLED`, and
   `QLASS_REQUIRED_CLIENT_RELEASE`. Confirm normal login, logout, HN lookup,
   and staff access again.
6. Confirm Vercel has no `VITE_ENABLE_SERVER_DIAGNOSTICS=true` nor
   `VITE_ENABLE_CONTROLLED_REFRESH=true` in Production. No telemetry write or
   refresh banner should be possible at this stage.

## What users will experience

Nothing during the foundation cutover: the flags remain off. Booking, Timeline,
HN lookup, login, staff management, reports, and exports stay on their present
paths. The private log table remains empty until a later, separately approved
telemetry canary.

## Stop and rollback

Stop before any write if the migration list is not exactly as required, a
backup/checkpoint is missing, normal live checks fail, or an unexpected local
migration appears.

After the foundation has applied, stop and restore the preceding
`staff-session` version if a normal session/HN flow fails. Keep the private
table, index, cron job, and empty audit evidence; they do not affect business
records. If a later incident specifically requires removing the foundation,
first disable both browser/server controls, then unschedule only
`goal11d_purge_expired_client_diagnostics` and review the isolated removal in a
separate change. Do not restore the database as normal rollback.

## Production status update — 2026-09-25 (supersedes "Current production fact" above)

The 2026-08-02 preflight is out of date. Verified read-only on 2026-09-25:

- Goal 13 (`create_queue_v1`) has been recorded on production for a long time, and the deployed
  `staff-session` (v20) already contains the `client_diagnostics` action with the allowlist sanitizer.
- `client_diagnostics` exists (created by `20260913080000`, **without** `expires_at`) and is empty,
  RLS on, no browser grants. `20260724192800` was deliberately **not** applied and must not be:
  it would try to create the same table with a different shape.
- Both browser and server switches are still off; the table stays empty.

### Staged enablement (each step needs its own explicit Go)

1. **Purge job (done 2026-09-25, migration `20260924175906`).** `pg_cron` in `pg_catalog`, job
   `goal11d_purge_expired_client_diagnostics`, hourly at minute 17, deletes rows older than 14 days by
   `created_at`. Verified: job active and owned by `postgres`; `anon`/`authenticated` get
   `permission denied for schema cron`; the stored command, run against 4 dummy rows, removed the 20-day
   and 15-day rows and kept the 13-day and fresh rows; business control totals unchanged.
   Rollback: `select cron.unschedule('goal11d_purge_expired_client_diagnostics');`
2. **Server switch:** set `QLASS_OBSERVABILITY_ENABLED=true` on the `staff-session` function. No effect
   until the browser also sends.
3. **Browser switch:** set `VITE_ENABLE_SERVER_DIAGNOSTICS=true` in Vercel Production and redeploy.
   Never set `VITE_ENABLE_CONTROLLED_REFRESH` or `QLASS_CONTROLLED_REFRESH_ENABLED` in this rollout.
4. **Watch 1-2 days:** rows arrive; only `release_id`, `event_name`, `outcome`, `stage`,
   `realtime_status`, `duration_ms`, `created_at` are ever present; rows per day stay small; purge job
   `cron.job_run_details` shows successful hourly runs. Any surprise: undo step 3, then step 2.
