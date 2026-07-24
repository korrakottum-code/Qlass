# Goal 13 — Idempotent queue-create rehearsal

## Scope and safety boundary

This work introduces a **new, unused server path** named `create_queue_v1`.
It was rehearsed only on the isolated restore project
`qlass-restore-verification-20260714` (`lsaljbxlccsypsbgxkrg`).

The current application still uses its existing browser write path.  No
production database, Edge Function, frontend environment variable, or queue
data was changed by this rehearsal.

## Contract

The browser must eventually send a caller-generated UUID request ID with a
staff-session token.  `staff-session` verifies that session and calls the
server-only database function with the trusted staff/session identities.

`create_queue_v1` then performs, in one transaction:

1. request-ID locking and idempotent retry lookup;
2. active role and branch-scope validation;
3. branch, room, procedure, promo, date, status, duration, and price checks;
4. per-room/day advisory locking, room-hour/schedule validation, and overlap
   detection;
5. queue creation with immutable effective values; and
6. one metadata-only audit record.

The database function has no `anon` or `authenticated` execute grant.  It is
called only by the server boundary.  Its `SECURITY DEFINER` implementation uses
an explicit `search_path` and validates the supplied session again before a
write.

## Clone evidence

All database probes used a transaction and rolled it back, except the one
end-to-end Edge Function probe which was deleted explicitly afterward.

| Check | Result |
| --- | --- |
| Same request ID retried in one transaction | 1 queue, 1 audit record, same queue ID |
| Invalid session | rejected as `invalid_session` |
| Invalid duration | rejected as `invalid_duration` |
| Closed room | rejected as `room_closed` |
| Overlapping room slot | rejected as `room_conflict` |
| Single-branch role creating for another branch | rejected as `branch_forbidden` |
| Direct execution by `anon` / `authenticated` | denied |
| End-to-end Edge Function retry | returned the original queue and did not overwrite it |
| Cleanup after the Edge probe | 1 queue, 1 audit record, and 1 session deleted |

After cleanup, the clone returned to its pre-rehearsal control totals:

- queues: **99,247**;
- `queue_audit` entries: **0**; and
- temporary test session: **absent**.

The clone's CORS policy rejected an unapproved localhost origin and accepted
the configured Qlass web origin.  This confirms that the new action remains
behind the same origin boundary as the existing server session flow.

## Current user impact

There is no user-visible change in this PR.  The client adapter merely exposes
the new server action for a later cutover; no Booking, Timeline, bulk-import,
or reschedule screen calls it yet.

Keeping reschedule and bulk creation on their existing paths is intentional:

- reschedule becomes atomic only in Goal 15;
- bulk creation needs its own all-or-nothing/idempotency contract; and
- a client cutover needs a stable request ID held with the draft so a retry
  cannot accidentally create a new logical request.

## Rollback and production gate

If a later rollout causes any regression, leave the existing browser path in
place or turn off only the future queue-create feature flag.  Restore the
previous `staff-session` version if required.  Do not delete existing queues,
the additive fields, or audit metadata during an incident.

Before any production cutover, all of these are required in a separate Goal:

1. apply Goal 12's additive schema and its concurrent indexes through the
   production low-lock runbook;
2. deploy `staff-session` with this action and verify its production secret and
   origin configuration;
3. ship the client only behind a disabled-by-default feature flag;
4. verify one authorized create, one retry, one rejected cross-branch request,
   and no direct browser writer; and
5. monitor queue/audit control totals before enabling the flag gradually.
