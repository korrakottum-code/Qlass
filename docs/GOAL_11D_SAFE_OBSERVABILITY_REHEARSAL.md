# Goal 11D — safe observability and controlled refresh rehearsal

## Scope and production boundary

This Goal adds an **off-by-default** operational foundation. It does not enable
telemetry, force refreshes, change booking data, or deploy anything to the
production Supabase project.

The only remote rehearsal target was the isolated restore project
`qlass-restore-verification-20260714`. Its temporary test sessions and all
diagnostic rows were deleted after the checks below.

## What is collected when explicitly enabled

`client_diagnostics` accepts only:

- application release identifier;
- event name: client error, render error, initial load, Realtime status, or
  write outcome;
- allowlisted outcome/stage/Realtime status values; and
- bounded duration (0–600,000 ms).

It never accepts or stores staff IDs, sessions, names, phone numbers, HNs,
PINs, error messages, URLs, request bodies, customer fields, or secrets.
The database has no browser grants and has RLS enabled. Rows receive a 14-day
expiry and each accepted diagnostic write removes expired rows. Before any
production enablement, the operator must add and verify an independent expiry
sweep; it is deliberately not enabled in this foundation PR.

The client keeps its existing in-memory buffer of at most 50 sanitized events.
It only sends it after a server session exists **and**
`VITE_ENABLE_SERVER_DIAGNOSTICS=true` has been compiled into a deployment.
The server independently requires `QLASS_OBSERVABILITY_ENABLED=true`.

## Controlled refresh behavior

The normal state is disabled. A refresh banner can appear only when all of the
following are true:

1. the browser was built with `VITE_ENABLE_CONTROLLED_REFRESH=true`;
2. the caller has a valid Qlass server session;
3. the server secret `QLASS_CONTROLLED_REFRESH_ENABLED=true` is set; and
4. `QLASS_REQUIRED_CLIENT_RELEASE` is a valid release identifier different
   from the caller's release.

The banner does not reload automatically, does not log a user out, and has one
user-controlled “refresh now” button. A failed status check has no effect on
the current session or work.

## Restore-clone evidence

- A valid temporary session received `refreshRequired: true` when clone-only
  refresh controls were enabled and its release differed.
- One diagnostic request containing deliberately extraneous dummy phone/HN/PIN
  and error fields inserted exactly one allowlisted row. Inspection showed only
  the allowed release/event/outcome/stage/duration fields.
- Unknown event names were ignored.
- Direct browser-key REST access to `client_diagnostics` was denied (HTTP 401).
- An expired test row was removed by the retention trigger when a later event
  was accepted.
- After unsetting all three clone-only control secrets, the same valid-session
  requests returned `refreshRequired: false` and `enabled: false`.
- Cleanup left zero diagnostic test rows and removed the temporary sessions.

## Production enablement gate

Do not set any of these variables in production in this Goal. A later,
explicitly approved canary Goal must set both browser and server switches,
verify redaction with dummy data, configure and verify the independent expiry
sweep, monitor write/error rate only, and keep the banner informational.

## Rollback

1. Unset `QLASS_OBSERVABILITY_ENABLED`,
   `QLASS_CONTROLLED_REFRESH_ENABLED`, and
   `QLASS_REQUIRED_CLIENT_RELEASE` in the affected Supabase project.
2. Redeploy the prior Vercel artifact, or remove the two `VITE_ENABLE_*`
   build variables and redeploy.
3. Do not restore the database: this feature never changes business rows.
   Keep the restricted diagnostic rows for their short retention period unless
   incident response explicitly authorizes their removal.
