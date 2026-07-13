# Qlass security plan with no data loss

This document is an active safety roadmap for Qlass. Every production change is
one Goal, one pull request, one review, and one explicit production go/no-go.
No goal deletes customer, queue, staff, or operational data, and normal
rollback must never require a database restore.

## Current baseline

- Daily backups have been restored successfully to a separate verification
  project.
- PIN login is verified by the `staff-session` Edge Function and sessions are
  server-checked.
- HN lookup runs through a server-side function; public HN reads and writes are
  disabled.
- The browser client still needs a public Supabase key for non-HN application
  flows. Public browser keys are not secrets: security must remain enforced by
  server-side authorization and RLS.

## Completed safety goals

1. Recovery proof on a separate project.
2. Removal of the unused AI route without deleting retained data.
3. Server-verified staff sessions with a five-failure, fifteen-minute PIN lock.
4. Server-only HN lookup, including audit logging and a recovery route.
5. Removal of public HN table access, while preserving HN sync through the
   server/CI path.

## Goal 7 — migrate away from legacy API keys

Remove legacy key values from tracked source and scripts, require the configured
browser environment value, then migrate browser, Edge Function and CI consumers
to Supabase publishable/secret API keys. The handover must be rehearsed on the
restore-verification project first and must preserve login, booking, HN lookup,
Realtime, sync, and all database rows.

The runbook and rollback are in
[`SUPABASE_KEY_HANDOVER.md`](SUPABASE_KEY_HANDOVER.md).

## Later roadmap

1. Protect staff records further: do not expose PIN or commission columns to
   browser reads; move privileged staff management behind server authorization.
2. Migrate remaining operational writes one operation at a time behind
   server-verified authorization before tightening their table policies.
3. Hash legacy PIN values through a compatible staged migration, without forcing
   a reset for active staff.
4. Expand restore and incident drills, and separately approve any paid recovery
   retention add-on.

## Non-negotiable rollout checks

Before any production enforcement: test on the restore project, compare row
counts, prove denied public access, prove the approved server path works, verify
the live user flow, and retain a single, documented rollback that changes no
application data.
