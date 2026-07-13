# Qlass security migration plan

## Purpose

This plan moves Qlass away from public browser-to-database access without
interrupting the clinics currently using the application. It is an execution
contract: one goal, one pull request, one review and merge decision at a time.

No production data is deleted as part of this plan. A production restore is an
incident-only action and is never a rollback mechanism for a normal release.

## Non-negotiable safety rules

- Keep the existing booking, queue, room, staff, ticket and reporting flows
  working throughout the migration.
- Make every production-facing change reversible by reverting one deployment or
  disabling one feature flag. Do not use database restores for routine rollback.
- Use the restore-verification project for schema, permission and failure-path
  testing before a production change.
- Do not enable Row Level Security (RLS) on a live table until the replacement
  access path has passed its tests and can be rolled back.
- Do not delete application data, including `ai_memory`, during a feature-removal
  release. Data-retention deletion requires its own approved goal.
- Each goal gets its own branch and pull request. The next goal starts only after
  the previous pull request is approved and merged.

## Known baseline

- Scheduled daily backups are available and a restore to a separate project was
  verified successfully.
- Point-in-Time Recovery is not currently enabled; its cost and retention choice
  need a separate approval.
- The current browser client uses PIN-based login and calls Supabase directly.
- Several public-table policies are permissive, and `branches` plus
  `parse_hints` have RLS disabled. Enabling RLS immediately would risk blocking
  existing users.
- The former public AI chat exposed a full-data route. Its removal is tracked in
  a separate Goal 2 pull request. Its database rows are retained for now.

## Goal sequence and release gates

### Goal 0 — recovery proof

**Status:** completed outside source control.

Verified daily backup availability and restored a backup to a separate,
read-only verification project. This establishes a recovery point; it does not
authorize an in-place production restore.

### Goal 1 — security migration contract

**Scope:** this document only.

**Impact:** none. It does not alter code, environment variables, Supabase
configuration or data.

**Rollback:** revert this documentation-only pull request.

**Exit gate:** this pull request is merged and the team agrees to the sequence
below before any security-enforcement code is started.

### Goal 2 — remove unused AI exposure

**Scope:** remove AI chat routes, UI, browser-side model calls and browser-side
`ai_memory` access. Keep the database rows intact.

**Expected impact:** users of the retired AI route can no longer open it. Queue
management flows remain unchanged.

**Tests:** production build; source scan for AI routes, model calls and
`ai_memory` client calls; preview deployment review.

**Rollback:** revert the single Goal 2 commit/deployment.

**Gate:** merge only after Goal 1 is merged.

### Goal 3 — authenticated server boundary

**Scope:** introduce a real server-verified session and role/branch claims.
Keep the current read/write path active behind a controlled compatibility
layer while the new path is tested.

**Expected impact:** login and session handling change internally; users keep
the same screens and permissions.

**Tests:** login/logout, role matrix, branch isolation, expired-session handling,
and concurrent queue booking on the restore-verification project.

**Rollback:** feature flag or deployment revert to the compatibility path;
no data rollback.

**Gate:** security review confirms that no secret/service key is shipped to the
browser and that server-side authorization is enforced.

### Goal 4 — move high-risk data operations behind the server

**Scope:** migrate HN lookup, staff records, queue writes and sensitive exports
one operation at a time. Each operation gets audit logging, input validation and
an explicit role/branch check.

**Expected impact:** no workflow change for users; requests may move from direct
database access to an application endpoint.

**Tests:** compare old and new responses, permission-denial tests, queue conflict
tests, monitoring for errors/latency, and canary users before full rollout.

**Rollback:** route the operation back to the existing compatibility path with a
feature flag, then revert the deployment if needed.

**Gate:** an operation is migrated only after its canary has no unexplained data
or availability discrepancy.

### Goal 5 — staged RLS enforcement

**Scope:** replace public policies with least-privilege policies only after the
corresponding server path is live. Start with non-critical tables, then
progressively protect operational data.

**Expected impact:** direct browser access is reduced table by table; application
screens continue through the server boundary.

**Tests:** policy matrix by role and branch, read/write/delete denial cases,
Realtime behavior, production canary monitoring and restore-project rehearsal.

**Rollback:** re-enable the previously tested compatibility policy or disable the
new route flag; do not disable all RLS globally as an emergency shortcut.

**Gate:** every table has a documented owner, caller, role matrix and rollback
before its policy changes are merged.

### Goal 6 — remove legacy public access and rotate configuration

**Scope:** remove obsolete public policies/endpoints after the replacement paths
are stable, rotate no-longer-needed AI-related configuration, and re-run security
advisors.

**Expected impact:** no user-facing workflow change. Retired direct endpoints
stop working by design.

**Tests:** full operational smoke test, advisor review, unauthenticated-access
tests and monitoring after rollout.

**Rollback:** restore the last known-good deployment and the specific
compatibility policy only; investigate before any wider rollback.

### Goal 7 — resilience operations

**Scope:** decide whether to purchase Point-in-Time Recovery, document backup
retention, assign incident roles, and rehearse a restore on a separate project.

**Expected impact:** possible approved Supabase cost only; no application
workflow change.

**Tests:** scheduled restore rehearsal, data-integrity checks and recovery-time
recording.

**Rollback:** disable the newly purchased add-on only after confirming the
organization accepts the reduced recovery posture.

## Required PR checklist

Every implementation PR must state:

1. The exact affected user flow and affected Supabase resources.
2. Expected data writes, whether they are reversible, and how data is preserved.
3. Tests run on the restore-verification project and the production-preview
   build.
4. Canary scope, success metrics and monitoring window.
5. The one-step rollback action and the person authorized to use it.
6. Confirmation that production was not directly changed during development.

## Production go/no-go rule

Proceed only when the prior goal is merged, the current PR passes its defined
checks, and the rollback action is ready. If any result could block existing
staff from booking, updating queues or viewing the required branch data, stop
the rollout and use the PR's compatibility rollback.
