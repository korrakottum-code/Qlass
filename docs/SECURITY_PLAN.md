# Qlass production-safety roadmap

This is the active execution plan for Qlass. The application is already used by
hundreds of people, so every change must preserve existing data and behaviour.

## Non-negotiable rules

- Execute one Goal at a time: branch -> pull request -> preview/clone checks ->
  review -> merge -> production verification -> close the Goal.
- Do not begin the next Goal until the previous Goal is closed.
- Use expand -> prove parity -> migrate -> contract. Do not combine a cutover
  and destructive cleanup in one release.
- Do not drop, rename, truncate, hard-delete, or repair production data unless a
  later Goal explicitly authorizes the exact rows and has a before-image.
- Database changes must be additive first and must be rehearsed on the restore
  project. Record before/after counts and expected lock behaviour.
- Every behaviour-changing release needs an off-by-default flag or an exact
  previous deployment, measurable acceptance checks, and a data-preserving
  rollback.
- A business error in a new safe write path must not fall back to the old unsafe
  write path.
- Never log PIN, phone, customer name, HN, secret keys, or full request bodies.
- Normal rollback must never require restoring the production database.

## Completed work

### Goal 1 - recovery proof

- Restored a daily production backup into the isolated
  `qlass-restore-verification-20260714` project.
- Kept production unchanged and confirmed the restored database was usable.
- The verification project is not an application cutover target.

### Goal 2 - remove the unused AI route

- Removed the public AI Chat route and UI from the application in PR #88.
- Retained historical `ai_memory` data; no AI-related database rows were
  deleted.
- Permanent data deletion, key revocation, and retention cleanup remain separate
  approval items.

### Goal 3 - server-verified staff sessions

- Moved PIN verification behind the `staff-session` Edge Function in PR #90.
- Added server-checked sessions and a five-failure, fifteen-minute PIN lock.
- Verified head-admin and admin login on the live application.

### Goal 4 - server-only HN lookup

- Moved HN search behind an authenticated Edge Function.
- Added audit logging and a separately deployable recovery function.
- Verified HN lookup using real production user flows.

### Goal 5 - remove direct public HN access

- Removed browser fallback to direct `hn_customers` reads.
- Restricted public HN writes while preserving the approved CI/server sync path.
- Rehearsed the primary/recovery HN routes before production cutover.

### Goal 6 - HN recovery and policy rollout

- Verified the recovery route, returned production to the primary route, and
  checked HN sync after the policy change.
- No HN or queue rows were deleted.

### Goal 7 - modern Supabase API key handover

- Removed hard-coded legacy-key fallbacks in PR #94.
- Added modern secret-key support to all HN sync clients in PR #95.
- Changed the browser to the modern publishable key and Edge Functions/CI to a
  modern secret key.
- Verified login, HN lookup, HN sync, Realtime, and expected denial of the old
  API-key path, then disabled legacy `anon` and `service_role` API keys.
- Rollback is credentials-only: re-enable legacy keys and restore the previous
  Vercel deployment. It does not modify application data.

### Goal 8 - production integrity baseline

- Completed the read-only production baseline in PR #100.
- Recorded schema/data integrity candidates and control totals without changing
  production rows. The baseline remains the evidence source for later schema,
  RLS, and data-reconciliation Goals.

### Goal 9 - status-only queue updates

- Completed in PR #101.
- Status changes now send only status fields and preserve price, duration, and
  other booking fields. Production verification included a real status-only
  update and before/after queue checks.

### Goal 10 - duplicate-submission and failed-draft protection

- Completed in PR #102.
- Added per-action submission guards, preserved failed form drafts, and made
  stale conflict data fail closed rather than creating an unsafe booking.

### Goal 11A-11C - critical-flow protection and safe diagnostics foundation

- Completed across PRs #103, #104, and #105.
- Added critical-flow regression coverage and CI for login, queue preservation,
  retries, conflicts, Realtime reconciliation, authorization, HN denial, and
  export filtering using fixtures only.
- Added bounded client-only diagnostics with a release identifier. They retain
  no business data and do not send telemetry remotely.
- The remaining server telemetry and controlled-refresh portion is retained as
  Goal 11D below; it is deliberately not treated as complete.

## Maintenance completed after Goal 7

These releases were necessary production fixes or operational follow-ups. They
do not change the canonical order of the remaining Goals:

- PR #96 corrected staff branch-scope selection. This was a production bug fix
  outside the numbered security sequence.
- PR #97 restored authenticated staff detail and commission reads through the
  `staff-session` server boundary. It is evidence and partial preparation for
  Goal 18, but Goal 18 remains open until all staff record access in its scope
  passes the stated acceptance gate.
- PR #98 added one-click HN cookie refresh and secret verification. It keeps the
  completed HN controls from Goals 4-6 operable, but it is not the recurring
  recovery and incident drill required by Goal 38.

Goal 12A's non-production rehearsal passed and its evidence is recorded in
`docs/GOAL_12A_QUEUE_FOUNDATIONS_REHEARSAL.md` (PR #108).  Production schema
cutover remains a separate, explicitly authorized low-lock operation.  The
Goal 13's clone-only server-create rehearsal passed in PR #109; its production
cutover remains a separate, explicitly authorized canary. Goal 11D is the
current off-by-default observability rehearsal.

## Remaining Goals

The Goal numbers below are the canonical order from this point onward. A Goal
may be split further before implementation if its review shows more than one
independent production risk.

### Goal 8 - freeze a complete production integrity baseline (read-only)

Status: **completed in PR #100**. Retained below as the baseline contract for
later Goals.

Scope:

- Inventory the production schema, columns, foreign keys/delete rules, indexes,
  triggers, functions, grants, RLS policies, Realtime publications, Storage
  buckets/policies, and deployed Edge Functions.
- Record counts by table plus queue counts by branch, status, and date range.
- Produce candidate-only reports for null price/duration, overlapping room
  bookings, duplicate schedules, orphan foreign keys, unknown statuses,
  incomplete reschedule pairs, and duplicate request candidates.
- Compare the repository migrations/schema with production and list every drift.
- Record baseline login/HN/write error rate and latency without PII.

Production impact: read-only queries only; run large checks in bounded pages and
outside the busiest period. No repair is allowed in this Goal.

Acceptance gate: report is reproducible, contains no sensitive values, and the
same checks can run against the restore project. Counts are saved as control
totals for later Goals.

Rollback: none required because this Goal makes no production changes. Stop the
queries if latency or database load rises.

### Goal 9 - make queue status updates status-only

Status: **completed in PR #101**. Retained below as the regression contract for
later queue APIs.

Scope:

- Add a dedicated service method that sends only `status`, `status_note`, and
  `status_updated_at`.
- Change the status modal to use that method; it must never send name, phone,
  price, duration, branch, room, date, time, procedure, promo, or attribution.
- Keep the existing full queue edit path unchanged.
- Add regression tests proving every status transition preserves all non-status
  fields, including null and zero values.

Production impact: status buttons behave the same. This closes the current risk
that a partial payload can overwrite `price` or `duration_blocks` with null.

Acceptance gate: clone test across every status; before/after snapshots match on
all non-status columns; build and critical-flow tests pass; preview is checked by
an admin.

Rollback: redeploy the previous frontend. No schema or data rollback is needed.
If any field changes unexpectedly, stop status updates until the previous build
is restored.

### Goal 10 - prevent duplicate submissions and preserve failed drafts

Status: **completed in PR #102**. Retained below as the regression contract for
all later write paths.

Scope:

- Add per-action saving state to booking, status, master-data, schedule, and
  ticket forms so one user action can have only one in-flight request.
- Disable the relevant save button while pending and show a clear retryable
  error.
- Close/clear a form only after the write and required upload both succeed.
- Preserve ticket text and selected-file metadata when create/upload fails.
- Remove any fallback that proceeds with stale local conflict data when the
  fresh conflict query fails.

Production impact: users may briefly see a disabled Save button. Failed forms
remain open instead of appearing successful.

Acceptance gate: double-click and simulated timeout tests create at most one
request; failures retain the draft; normal booking/status/ticket flows remain
unchanged.

Rollback: previous frontend deployment. No database rollback.

### Goal 11 - add release observability and critical-flow CI

Status: **rehearsal complete; production controls remain off**. Goals 11A-11C
were completed in PRs #103, #104, and #105. Goal 11D's clone evidence and
rollback are recorded in `docs/GOAL_11D_SAFE_OBSERVABILITY_REHEARSAL.md`.
The independent expiry-sweep rehearsal is recorded in
`docs/GOAL_11D_INDEPENDENT_EXPIRY_SWEEP_REHEARSAL.md`. No production telemetry
or forced-refresh control is enabled by this work.

Scope:

- Retain the release/client version and bounded client-only diagnostics already
  shipped in Goal 11B. Do not transmit those events until Goal 11D supplies an
  approved server-side sink with explicit redaction and retention rules.
- In Goal 11D, add a controlled-refresh banner for incompatible old tabs and
  capture only sanitized frontend errors, write outcomes, Realtime
  reconnects, load completeness, and latency.
- Add automated tests for login, status preservation, booking conflict, retry,
  reschedule failure, Realtime reconciliation, role denial, HN denial, and
  export completeness. Tests must use fixtures/clone data, never production
  writes.
- Establish alert/rollback thresholds before later database cutovers.

Production impact: Goals 11A-11C have no business-data change. Goal 11D may add
small telemetry overhead, but must remain off by default until a clone/preview
review confirms redaction and retention behaviour.

Acceptance gate: CI blocks known regressions (completed); Goal 11D events must
contain no PIN/PII/secrets, and the version/error dashboard must distinguish
old and new clients without logging business payloads.

Rollback: disable telemetry/refresh flag or restore previous frontend. Keep CI
tests even if runtime telemetry is disabled. Do not use `supabase db push` to
deploy Goal 11D while Goal 13 remains pending; a separate operator runbook must
apply only the reviewed Goal 11D database work after explicit production Go.

### Goal 12 - add queue concurrency and audit foundations

Status: **Phase A complete; Phase B production runbook ready for review**.
The restore-clone rehearsal passed in PR #108. The follow-up runbook records
the low-lock production procedure and its no-data-loss stop/rollback gates. No
production schema migration, trigger, index, or audit write is authorized until that PR is
merged and an explicit production go/no-go is given.

Phase A rehearsal gate:

- Apply the proposed additive migration only on the restore project.
- Measure migration duration, lock behaviour, query plans, write overhead, and
  before/after control totals.
- Prove the current production artifact operates against the expanded clone
  schema without lost queue fields or changed booking behaviour.
- Prepare an explicit stop/rollback runbook that disables new logic but never
  drops additive columns or audit evidence.

Scope:

- Add nullable/additive `updated_at`, `version`, `request_id`,
  `rescheduled_from_id`, and archive fields required by later APIs.
- Add immutable snapshots for new queue rows where historical reports need the
  effective duration/commission at booking time. Do not backfill uncertain
  historical values.
- Add an append-only audit structure containing row ID, operation, actor/session,
  before/after or changed fields, release ID, request ID, and timestamp.
- Add indexes needed for room/date conflict checks and idempotency using a
  low-lock strategy.
- Add constraints as `NOT VALID` where supported; validation is a later Goal.

Production impact: additive schema and modest write/index overhead. Existing
clients continue using the current contract.

Acceptance gate: rehearse migration/rollback on clone; record lock duration,
query plan, row counts, and trigger overhead; old production artifact works
against the expanded schema.

Rollback: stop using new fields/triggers and disable added trigger logic. Keep
additive columns and audit rows; do not drop them during incident rollback.

### Goal 13 - introduce idempotent transactional queue creation

Status: **clone rehearsal complete in PR #109**. No client cutover or production
deployment is authorized until a separate canary Goal is reviewed and approved.

Scope:

- Add versioned `create_queue_v1` behind server-verified authorization.
- Validate role/branch, required fields, room hours, schedules, duration, and
  allowed status on the server.
- Use a request ID and database uniqueness so retrying the same request returns
  the original queue ID.
- Serialize the room/date conflict decision so two devices cannot reserve the
  same overlapping slot.
- Ship client support behind an off-by-default feature flag; do not fall back to
  direct insert after a business rejection.

Production impact: none while flag is off. During canary, one concurrent user
receives a conflict message instead of creating an overlapping queue.

Acceptance gate: clone concurrency test has exactly one winner; repeated request
ID returns exactly one row; validation failure writes nothing; old path remains
available only as an explicit operational rollback during the canary.

Rollback: turn off the new-create flag and redeploy the previous client. Keep the
function, columns, request records, and audit evidence. Rollback is forbidden if
it would re-open a confirmed data-integrity incident; in that case pause booking.

### Goal 14 - introduce optimistic queue patch and status APIs

Scope:

- Add `patch_queue_v1` with an explicit allowlist of fields and expected version.
- Add `update_queue_status_v1` that can change status fields only.
- Check server session, role, and branch; reject stale versions with a visible
  conflict rather than silently overwriting another user's update.
- Canary status first, then full edit, with independent flags.

Production impact: concurrent editors may receive a refresh/retry message. No
fields are silently overwritten.

Acceptance gate: stale edit cannot overwrite a newer status; status API preserves
all non-status fields; allowed role/branch matrix passes; audit actor is trusted
server identity rather than a client-provided staff ID.

Rollback: turn off the affected flag and restore previous frontend. Preserve
audit/version data and investigate conflicts before any manual repair.

### Goal 15 - make rescheduling atomic

Scope:

- Add `reschedule_queue_v1` that validates the destination, locks the necessary
  slot, marks the source, creates the destination, and links both rows in one
  database transaction.
- Make the operation idempotent and preserve the original booking attribution,
  price, duration, and snapshots.
- Keep ambiguous historical reschedules unchanged.

Production impact: user flow remains one action. If destination creation fails,
the original queue remains unchanged.

Acceptance gate: injected failure at every internal step leaves both sides
unchanged; retry creates no duplicate; conflict creates no partial reschedule;
reports count linked rows according to the agreed business rule.

Rollback: disable reschedule action/new flag and restore previous frontend. Do
not fall back to the current two-write reschedule path after a transactional
failure; temporarily pause rescheduling instead.

### Goal 16 - replace master-data hard delete with archive protection

Scope:

- Confirm actual production foreign-key delete rules before migration.
- Add archive/deactivate behaviour for branches, rooms, procedures, promos,
  staff, and schedules while keeping historical references readable.
- Reject deletion of any master referenced by historical/active operations.
- Change dangerous cascade rules to restrict/archive only after old-client
  compatibility is proven.

Production impact: Delete becomes Archive/Deactivate. Historical reports and
queues remain intact; archived options disappear from new-entry selectors.

Acceptance gate: referenced master cannot be physically deleted; old queues and
reports render correctly; reactivation works; before/after counts are equal.

Rollback: re-enable archived rows and restore previous frontend/policy. Do not
restore cascade deletes and do not physically remove archive columns.

### Goal 17 - transactional room and schedule operations

Scope:

- Move bulk room creation, schedule updates, and room reordering into versioned
  all-or-nothing server operations.
- Centralize open-hour, overlap, ordering, and branch validation.
- Add idempotency to bulk operations and optimistic version checks to edits.

Production impact: an invalid item rejects the complete batch instead of saving
only part of it.

Acceptance gate: injected batch failure writes zero partial rows; duplicate
retry is harmless; room hours and schedule rules match Booking and Timeline.

Rollback: disable the new operation and restore the previous client only if no
integrity issue is reopened; otherwise pause that administrative action.

### Goal 18 - protect staff records behind a server boundary

Scope:

- Stop general browser reads from returning PIN and commission columns.
- Provide a minimal staff directory projection for normal application use.
- Move staff create/edit/archive and commission access behind server-verified
  authorization with explicit role and branch rules.
- Ensure views use `security_invoker` or are not exposed; never rely on a default
  view that can bypass RLS.

Production impact: normal users see the same names/roles needed for work. Only
approved roles can view or edit commission settings. PIN is never returned.

Acceptance gate: browser/direct API cannot read PIN; unauthorized commission
access is denied; authorized staff management works; login still succeeds.

Rollback: temporarily restore the previous staff projection/grant only through
an explicit security rollback, record the exposure window, and keep server APIs.
No staff data is deleted.

### Goal 19 - migrate legacy PINs to hashes without resetting staff PINs

Scope:

- Add nullable hash/version fields and a server-side pepper secret.
- On successful legacy PIN login, write a modern password hash and stop using
  plaintext for that staff record; support mixed legacy/hashed records during
  migration.
- Rate-limit both paths identically and never log either representation.
- Report migration progress as counts only.

Production impact: staff continue using the same PIN. Some users may need one
fresh login; no one is forced to choose a new PIN in this Goal.

Acceptance gate: hashed and unmigrated accounts both login on clone; wrong PIN
lock still works; migrated account no longer requires plaintext comparison;
rollback rehearsal does not expose hashes or pepper.

Rollback: server can temporarily verify the retained legacy value only during
the compatibility window. Do not remove plaintext columns/values until a later
contract Goal and explicit approval.

### Goal 20 - establish shadow authorization and the role/branch matrix

Scope:

- Agree and encode allow/deny rules for all six roles and every page/operation.
- Bind authorization to the trusted server session; never trust role, branch, or
  requestor ID supplied by the browser.
- Run shadow authorization first: compare intended allow/deny with current live
  actions without blocking users and without PII in logs.
- Cover direct API attempts and cross-branch access, not only sidebar visibility.

Production impact: shadow mode does not block. Enforcement is deferred until
false-denial cases are resolved.

Acceptance gate: owner approves the matrix; shadow mismatches are zero or
explained across the agreed soak period; session expiry/re-login behaviour is
documented.

Rollback: disable shadow collection. No database/data rollback.

### Goal 21 - enforce RLS on staff and low-risk reference reads

Scope:

- Confirm every table in the exposed schema has an explicit RLS decision.
- Start with staff projections and low-risk reference tables after all consumers
  use trusted sessions/server APIs.
- Policies must include ownership/role/branch predicates; `TO authenticated`
  alone is not authorization.
- UPDATE policies require both `USING` and `WITH CHECK`; privileged functions
  must not be publicly executable.

Production impact: old or unauthorized direct requests are denied. An approved
login refresh may be required at cutover.

Acceptance gate: canary users pass; direct anonymous/cross-branch tests fail;
authorized reads still work; no zero-row silent UPDATE behaviour.

Rollback: revert only the new policies/grants as a logged security rollback,
retain server APIs, and define the maximum temporary relaxation window.

### Goal 22 - enforce server-authorized queue writes

Scope:

- Prove every queue create/edit/status/reschedule/delete consumer uses the
  approved versioned server API.
- Enforce role and branch in both API and RLS; audit every queue mutation.
- Remove direct browser queue write grants only after old clients are absent.

Production impact: expected user behaviour remains the same; unauthorized or
stale requests become explicit errors.

Acceptance gate: preview/clone pass, canary pass, 24-48 hour soak, zero
unexpected denial/data drift, and direct public queue write is proven denied.

Rollback: queue-only feature/policy rollback with a recorded time limit. Never
fall back to a known non-atomic queue path.

### Goal 23 - enforce server-authorized room and schedule writes

Scope:

- Prove all room, ordering, and schedule consumers use Goal 17 server APIs.
- Enforce role/branch rules and audit all mutations.
- Remove direct browser writes only for `rooms` and `room_schedules`.

Production impact: room/schedule administration remains the same; unauthorized
and partial batch writes are rejected.

Acceptance gate: admin flows, batch atomicity, and branch denial pass on clone
and canary; direct public room/schedule writes are denied.

Rollback: room/schedule-only flag and policy rollback. Queue and other table
policies remain unchanged.

### Goal 24 - enforce server-authorized master-data writes

Scope:

- Move branches, procedures, promos, categories, and their archive/reactivation
  paths behind the approved server boundary.
- Enforce the approved role matrix and audit every mutation.
- Remove direct browser writes only after all consumers and old tabs are clear.

Production impact: approved administrators retain the same forms; unsafe hard
delete and unauthorized mutation are denied.

Acceptance gate: create/edit/archive/reactivate pass for each master type;
historical queues still render; direct public writes fail.

Rollback: master-data-only flag/policy rollback. Do not re-enable hard deletes or
cascade rules.

### Goal 25 - enforce server-authorized ticket writes

Scope:

- Move ticket create/edit/status/assignment/archive behind server authorization.
- Enforce reporter, assignee, role, and branch rules and audit mutations.
- Keep Storage policy changes out of this Goal.

Production impact: ticket workflow remains the same; unauthorized cross-branch
access is rejected and failed requests retain drafts.

Acceptance gate: allow/deny matrix and draft preservation pass; direct public
ticket writes fail; no Storage object is changed by this Goal.

Rollback: ticket-only feature/policy rollback. Storage and other policies remain
unchanged.

### Goal 26 - enforce remaining administrative write boundaries

Scope:

- Inventory any remaining direct writes after Goals 22-25.
- Migrate exactly one homogeneous administrative operation group in this PR; if
  inventory finds multiple groups, create additional numbered Goals before work.
- Enforce trusted identity, role, branch, idempotency where applicable, and
  auditing before removing its direct grant.

Production impact: limited to the explicitly listed operation group.

Acceptance gate: repository search and runtime evidence show no unreviewed direct
writer for that group; authorized path works and public path fails.

Rollback: only that operation group's flag/policy is reverted. No broad grant is
restored.

### Goal 27 - make ticket Storage private and auditable

Scope:

- Inventory bucket policies and all stored object references.
- Introduce private access and signed URLs through authorized server paths.
- Copy existing objects with checksum verification and dual-read before changing
  consumers; do not move/delete the originals during cutover.
- Enforce branch/role access and audit uploads/downloads without logging URLs
  containing credentials.

Production impact: ticket images continue displaying; old public URLs are
retired only after all clients use the private path.

Acceptance gate: object count/checksum parity, authorized display/upload works,
unauthorized access fails, and failed upload retains the ticket draft.

Rollback: switch reads to retained original objects and previous policy. Do not
delete copied or original objects during incident rollback.

### Goal 28 - authorize and audit exports

Scope:

- Move export/commission data access behind server authorization with role,
  branch, and date-range limits.
- Record who exported what scope and when, without storing exported PII in logs.
- Return count/completeness metadata and refuse export when the source dataset is
  incomplete.

Production impact: approved roles keep exporting; large/unbounded or
unauthorized exports are rejected with a clear message.

Acceptance gate: allow/deny matrix passes, totals match a database snapshot, and
an incomplete client cache cannot produce an apparently complete export.

Rollback: restore previous export UI only while retaining server limits where
possible; record any temporary relaxation. No report data is mutated.

### Goal 29 - make Realtime reconnect self-healing

Scope:

- Track subscription state and release/client version.
- On disconnect/reconnect or detected event gap, refetch a bounded authoritative
  snapshot and reconcile INSERT/UPDATE/DELETE by ID.
- Prevent deleted rows from reappearing through stale local state.

Production impact: a reconnect may briefly show a syncing indicator and perform
one bounded refetch.

Acceptance gate: forced disconnect/reconnect produces state equal to database;
no duplicates or resurrected deletes; repeated events are idempotent.

Rollback: disable reconciliation flag and restore previous client. Database is
unchanged.

### Goal 30 - replace full-history loading with bounded data APIs

Scope:

- Measure current row transfer, memory, latency, and query duplication.
- Add cursor/keyset pagination ordered by stable `(date, time_block, id)` keys.
- Make Booking, Timeline, and Queue Table request only the needed date/branch.
- Keep old and new loaders in shadow comparison before cutover.

Production impact: faster/lighter startup; paging/loading indicators may appear.

Acceptance gate: shadow counts/IDs match, no missing/duplicate rows across page
boundaries under concurrent writes, and startup load is materially reduced.

Rollback: feature flag to the old loader for a bounded period. Do not remove the
old loader until all consumers pass and export no longer depends on it.

### Goal 31 - move summaries, commission, and reports to complete server results

Scope:

- Add server aggregates/date-range APIs for dashboards, summaries, commission,
  and exports.
- Use effective snapshots for new data and explicitly label historical values
  whose source is current master data.
- Return control totals and completeness metadata.
- Shadow-compare every total with the existing implementation before display
  cutover.

Production impact: report values should remain equal; discrepancies block the
cutover and are investigated, not silently selected.

Acceptance gate: count and amount totals match agreed database snapshots for
multiple branches/date ranges/statuses; late/realtime changes reconcile.

Rollback: switch display to the prior report while retaining discrepancy logs.
No historical data repair is performed in this Goal.

### Goal 32 - reconcile only proven historical data defects

Scope:

- Start only after Goal 8 candidate reports and later APIs provide reliable
  evidence.
- Create owner-reviewed batches with row ID, old value, proposed value, reason,
  evidence, and batch ID.
- Take the available recovery checkpoint before each approved batch and apply in
  small transactions.
- Leave ambiguous price, duration, commission, reschedule, and attribution values
  unchanged.

Production impact: only explicitly approved rows change; application remains
online unless a batch-specific plan states otherwise.

Acceptance gate: before/after counts and business totals reconcile; every change
has a before-image; independent owner sign-off is recorded.

Rollback: reverse by batch ID from before-images, then reconcile again. Stop at
the first unexplained difference.

### Goal 33 - create canonical migration and operations documentation

Scope:

- Build a canonical migration history from verified production schema without
  replaying mock inserts or unsafe cascade definitions.
- Consolidate deployment/security/runbook documentation.

Production impact: documentation/migration-history only; no production migration
is executed in this Goal.

Acceptance gate: fresh restore/staging can be built from canonical migrations;
schema and function inventories match production; runbooks contain no secrets.

Rollback: revert the documentation/migration-history PR. Production is unchanged.

### Goal 34 - validate constraints and retire unused contracts

Scope:

- Validate deferred constraints only after Goal 8/32 reports are clean.
- Prove no old client uses each legacy RPC/API/grant across at least two stable
  production releases before retiring it.
- Retire one contract family in this PR; create another Goal if more than one
  independent family remains.

Production impact: no visible change for supported clients; truly old clients
may be required to refresh/login.

Acceptance gate: constraints validate without unexplained exceptions; access
logs show zero active consumer; current client critical flows pass.

Rollback: restore only the retired contract/grant as a recorded, time-bounded
security exception. Keep constraints/additive data unless they cause the issue.

### Goal 35 - clear lint and automatically fixable dependency findings

Scope:

- Fix lint errors in bounded, behaviour-preserving batches.
- Update only dependencies with a supported, automated, compatible resolution;
  pin versions and commit the lockfile.
- Keep export-library replacement out of this Goal.

Production impact: no intended behaviour change; bundle differences are reviewed.

Acceptance gate: build, lint, audit, bundle comparison, and critical flows pass;
no new package has an unnecessary install script or broad capability.

Rollback: restore the previous package/lockfile and artifact. Database is
unchanged.

### Goal 36 - replace the vulnerable export library with output parity

Scope:

- Select a maintained spreadsheet/export implementation in a separate review.
- Reproduce all Thai text, formatting, formulas, date ranges, totals, and file
  types currently relied on by users.
- Compare generated files using fixed fixtures and business control totals.

Production impact: exported file implementation changes; visible output should
remain equivalent.

Acceptance gate: owner opens and approves representative files; row counts,
amounts, Thai text, dates, and formulas match; security audit no longer reports
the retired library finding.

Rollback: restore the previous export artifact/library while the replacement is
corrected. No database data is changed.

### Goal 37 - remove retained plaintext PIN compatibility

Scope:

- Start only when Goal 19 reports every active staff record migrated and the
  compatibility window has passed.
- Take an approved recovery checkpoint and separately authorize the sensitive
  cleanup.
- Remove plaintext comparison and then the retained plaintext values/column using
  an audited, staged contract migration.

Production impact: no PIN reset. Any unmigrated account is blocked from cleanup
and handled before this Goal proceeds.

Acceptance gate: 100% active-account hash coverage, login/lock tests pass, no
runtime reference to plaintext remains, and no plaintext PIN can be read.

Rollback: restore server compatibility code only if required; sensitive values
are not reconstructed or copied back casually. A database restore is an
incident-only last resort, not the normal rollback.

### Goal 38 - recurring recovery and incident drills

Scope:

- Define approved RPO/RTO and owners for database, Storage, Edge Functions,
  Vercel configuration, CI secrets, and DNS/application rollback.
- Repeat restore verification on a schedule and compare schema, row counts,
  foreign keys, checksums, and representative samples.
- Test frontend rollback, function rollback, credential rollback, policy
  rollback, and one simulated failed write without touching production data.
- Evaluate paid PITR/retention separately; enabling paid add-ons requires explicit
  cost approval.

Production impact: drills use isolated projects and controlled read-only checks.

Acceptance gate: measured restore meets the agreed RPO/RTO; runbook can be
executed by another operator; differences are resolved before the next risky
Goal.

Rollback: drills do not change production. Delete/cancel a paid verification
resource only after evidence is retained and the owner explicitly approves it.

## Mandatory acceptance suite for all later Goals

- Every status transition preserves price, duration, date/time, attribution, and
  unrelated fields.
- Concurrent booking of one slot has one winner; retrying one request creates one
  queue.
- Failure during reschedule leaves both source and destination unchanged.
- Concurrent edits show a conflict and never silently overwrite.
- Referenced master data is archived/rejected, never cascaded away.
- Realtime reconnect state equals the database.
- Export/commission counts and totals equal an authoritative snapshot.
- Closed room/out-of-hours booking is rejected without touching the original
  queue.
- Failed ticket create/upload keeps the user's draft.
- Every role passes UI and direct-API allow/deny checks including branch
  isolation.
- Unauthorized HN, staff, Storage, and Export access is denied.
- Legacy AI URL redirects safely and no AI secret is present in the artifact.
- Restore verification matches schema, foreign keys, counts, and checksums.

## Goal closure record

Each Goal must record:

1. PR and merge commit.
2. Exact files, migrations, functions, flags, policies, and secrets changed
   (secret names only, never values).
3. Clone/preview/production checks and their timestamps.
4. Before/after control totals and observed user impact.
5. Rollback trigger, operator, exact safe action, and the maximum decision time.
6. Confirmation that no unexpected row was inserted, updated, deleted, or lost.
