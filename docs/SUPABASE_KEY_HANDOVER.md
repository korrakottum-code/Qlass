# Supabase key handover runbook

This runbook removes the legacy JWT-based browser key from Qlass without a
database restore or application-data change. It is a deployment/configuration
handover, not a schema migration.

## Current consumer inventory

| Consumer | Required configuration | Target key type |
| --- | --- | --- |
| Qlass browser build (Vercel production, preview and local) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Publishable key |
| `staff-session`, `search-hn`, `search-hn-recovery` Edge Functions | Supabase-managed URL plus `SUPABASE_SERVICE_ROLE_KEY` | Secret key |
| GitHub Actions HN sync | `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, optionally `SUPABASE_DB_URL` | Secret key / database credential |
| `scripts/perf_probe.mjs` | caller-provided `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Publishable key |

The browser key is intentionally public in the generated JavaScript bundle; it
is not a service credential. Its safety depends on server-side authorization
and RLS. A service or database credential must never be placed in a `VITE_`
variable.

## Required order

1. Confirm every Vercel environment has the browser URL and key variables.
   Do not remove a source fallback until this is confirmed.
2. Deploy the environment-only client change and verify the production build
   loads with the existing configured key.
3. On the restore-verification project, create new publishable and secret API
   keys. Keep legacy keys active during the rehearsal.
4. Update the clone browser variable, Edge Function secret, and any clone sync
   credentials. A function that receives browser calls must be tested with the
   new publishable key before production because legacy JWT verification and
   opaque API keys have different gateway behavior.
5. Rehearse: login, session refresh, logout, HN lookup, booking create/update,
   Realtime update, and HN sync. Record row counts before and after.
6. After the PR is merged and a production go/no-go is given, repeat the same
   configuration changes in production. Verify those flows and monitoring.
7. Only after all deployed consumers have used the new keys successfully,
   deactivate the legacy keys in Supabase. Do not delete them during the
   observation window.

## Rollback

No database rollback is involved. If a deployment or key handover fails:

1. Restore the last known-good Vercel deployment/environment value.
2. Keep or reactivate the legacy key in Supabase.
3. Restore only the affected Edge Function secret or GitHub Actions secret.
4. Re-run login, booking, HN lookup and HN sync checks before continuing.

This rollback changes credentials and deployments only; it does not write,
delete, or restore customer, queue, staff, or operational data.
