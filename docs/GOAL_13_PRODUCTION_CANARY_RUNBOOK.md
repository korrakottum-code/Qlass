# Goal 13 — Queue-create production canary runbook (preparation only)

## Current position

This is **not** permission to change production. It records what must be true
before a separate, explicit production Go.

Read-only production check on 2026-08-02:

- queues: **124,537**;
- `queue_audit`: **0** rows;
- the Goal 12 metadata trigger and both indexes are present and private; and
- `create_queue_v1` does **not** exist yet.

The deployed `staff-session` is version 9 and does not contain the
`create_queue_v1` action. The current Booking page therefore still creates
queues through its existing browser path. No person has been moved to the new
path, and no production data has changed for Goal 13.

## What the later canary is for

The new path gives one booking request a durable request ID. If the browser
retries the same request, it receives the first queue instead of creating a
second one. It also makes the room/time decision inside one transaction, so two
people cannot both reserve the same slot.

It must preserve the current rule that cancelled and no-show queues do not
occupy a room. Invalid/missing duration is rejected without writing a queue.

## What this preparation changes

This preparation changes source code and documentation only:

1. restricts the future privileged function's search path;
2. makes its room rule match the current application; and
3. adds regression coverage and a clone re-rehearsal record.

It does not deploy a function, run a migration, enable a client flag, or alter
any production booking.

## Non-negotiable Go / no-go gate

All items below need an explicit Go in a later Goal. If one is not true, stop
and leave the current booking path unchanged.

1. Review and merge the preparation PR; CI, build, and the clone evidence must
   be green.
2. Take the usual production backup/checkpoint and record a fresh queue/audit
   control total. Verify a normal live booking and edit work before starting.
3. Apply **only** the reviewed Goal 13 SQL through a dedicated, approved
   operator procedure. Do **not** run `supabase db push`: it could apply Goal
   11D as well. Record only the Goal 13 history entry after the exact SQL has
   succeeded.
4. Verify the database function exists, has empty search path, and has no
   `PUBLIC`, `anon`, or `authenticated` execute grant.
5. Deploy `staff-session` only after confirming the current allowed origin and
   secret names are present. Keep all Goal 11D controls disabled.
6. Ship a separate client change with a disabled-by-default, narrowly scoped
   queue-create flag. This repository does not yet route the Booking page to
   `create_queue_v1`; that is deliberate and must be reviewed separately.
7. Enable the flag for one pre-agreed authorized operator and one normal real
   booking. Do not make a fake customer booking in production. Verify the same
   request ID returns the same queue ID, a cross-branch attempt is denied, and
   direct browser execution is denied.
8. Observe only aggregate queue/audit counts and error rate for at least 15
   minutes before considering any wider rollout. Never put PIN, HN, phone,
   customer name, token, or request body in an operator note.

## Stop and rollback

Stop immediately if a normal booking fails, a cancelled/no-show slot behaves
differently, a duplicate is observed, a queue/audit total changes unexpectedly,
or the function is executable by a browser role.

Turn off only the new client flag and restore the previous frontend or
`staff-session` version. Keep the new function, columns, request IDs, and
audit evidence for investigation. Do not delete or edit a customer queue merely
to make totals look normal; pause the affected booking flow and investigate.

## What users experience today

Nothing changes today. Existing Booking, Timeline, edit, status, reschedule,
HN lookup, staff login, commission, and reports keep the same paths. A later
canary may show a clear conflict/retry message to the one opted-in operator
instead of silently creating an overlapping or duplicate booking.
