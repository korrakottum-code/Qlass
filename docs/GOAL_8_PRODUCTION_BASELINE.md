# Goal 8: production integrity baseline

Snapshot time: 2026-07-14T18:03:03Z (read-only)

## Scope and safety

This report records the state of the `QLASS` production Supabase project before
later safety work. All database activity used `SELECT` or catalog queries. No
row, schema, policy, secret, Edge Function, Storage object, or deployment was
created, updated, deleted, or restored.

The restore-verification project was also queried read-only. Its direct counts
show 99,247 queues, 180,012 HN customers, and 67 staff records, consistent with
it being an older restore snapshot rather than a production cutover target.

## Control totals

| Item | Production count |
| --- | ---: |
| Branches | 29 |
| Staff | 67 |
| Rooms | 100 |
| Procedures | 32 |
| Promos | 257 |
| Queues | 101,850 |
| Room schedules | 11,468 |
| HN customers | 185,525 |
| App sessions | 298 |
| HN lookup audit records | 5,514 |

Queue statuses are internally complete: `done` 63,492; `no_show` 17,859;
`pending` 9,425; `cancelled` 2,973; `confirmed` 2,512; `rescheduled` 2,471;
`follow1` 1,687; `rescheduled_in` 1,291; `follow2` 98; and `follow3` 42.

All 29 branches have queues. Their queue-count distribution is 20 minimum,
3,483 median, and 8,308 maximum; the total is 101,850. The report deliberately
does not publish branch names or identifiers.

The production date range is `1969-01-12` through `6371-05-23`. Those values
are candidates for later evidence-based reconciliation, not evidence that any
specific row may be changed now.

## Candidate-only integrity observations

These figures deliberately contain no customer, staff, HN, phone, or queue
identifiers. They are not a repair list.

| Check | Result | Interpretation / later Goal |
| --- | ---: | --- |
| Queues with null `price` | 93,665 | Baseline for Goal 9 / Goal 32; historical nullable values may be valid. |
| Queues with null `duration_blocks` | 100,535 | Baseline for Goal 9 / Goal 32; do not backfill without proof. |
| Queues with either field null | 101,565 | Shows why partial status updates need a regression-safe fix first. |
| Queues without a room | 7 | Candidate only; no broken required foreign keys were found. |
| Candidate overlapping room bookings | 1,061 | Derived from active queue intervals; needs business-rule review before any action. |
| Duplicate active room/date/time slot groups | 1,051 | Candidate concurrency failures for Goals 12-15. |
| Extra rows in those duplicate groups | 1,085 | Control total for later proof, not a deletion instruction. |
| Schedules without room | 0 | No orphan detected. |
| Schedules without time bounds | 11,329 | Likely legacy availability-style rows; requires semantic review before labelling defective. |

The schema has no `version`, `request_id`, `rescheduled_from`, `deleted_at`, or
`archived_at` column on `queues`. Therefore concurrent edits, idempotency,
reschedule pairing, and archival cannot yet be audited deterministically. These
are planned as additive work in Goals 12-17.

## Schema and production topology

- Public tables: 18. The largest are `hn_customers` (about 65.7 MB), `queues`
  (about 36.3 MB), and `room_schedules` (about 2.7 MB).
- Edge Functions active: `staff-session`, `search-hn`, and
  `search-hn-recovery`.
- Realtime publication currently contains `queues`, `line_bookings`, and the
  retained `ai_memory` table.
- The `ticket-images` Storage bucket is public, has one object, and has no
  MIME-type or file-size restriction or Storage policy. This is a Goal 27
  finding; it must not be made private without an upload/read migration plan.
- No public-table triggers were found. One `SECURITY DEFINER` function,
  `get_occupied_slots`, is present and Supabase flags its mutable search path.
  This requires a reviewed fix in a later server-boundary Goal.
- Cascade delete paths include `branches -> queues`, `branches -> rooms`, and
  `rooms -> room_schedules`. Later archive protection must replace unsafe hard
  delete behaviour without deleting referenced production data.

## Access-control baseline

Supabase's security advisor currently flags the following, all recorded here
without remediation in this Goal:

- `public.branches` and `public.parse_hints` have RLS disabled. `branches` also
  retains policies, which are ineffective while RLS is off.
- Operational tables including `queues`, `rooms`, `room_schedules`, `staff`,
  `tickets`, `procedures`, `promos`, `procedure_categories`, and
  `activity_logs` retain permissive public write/delete policies.
- `ai_memory`, `line_customers`, and `line_bookings` also have permissive public
  policies. AI data remains retained by the agreed no-deletion policy; its
  access path must be handled in the later authorization sequence.
- Server-only session, login-attempt, HN, and HN-audit tables have RLS enabled
  with no browser policy, as intended for their server-side paths.

Enabling RLS or removing those policies in place can break the live app.
Remediation is intentionally deferred to the staged shadow-authorization and
server-boundary Goals 18-26.

## Repository drift and runtime observations

- The repository contains only three migration files, all from the recent
  session/HN work. Production migration history contains four recent entries,
  with different timestamps and an additional `deny_public_hn_customer_reads`
  entry. The older production schema is not represented by canonical migrations
  in the repository.
- `src/utils/supabaseService.js` still constructs a full queue update object
  from partial input. `src/App.jsx` uses it for status changes, so missing values
  can become null. This validates Goal 9 as the immediate next implementation
  Goal.
- The last-24-hour API sample showed successful Realtime connections and large
  paginated reads spanning the full queue history. It contains no baseline error
  rate or latency metric, so Goal 11 must add measurable, non-PII observability
  and Goal 30 must replace full-history loading with bounded APIs.

## Goal 8 closure gate

The baseline is reproducible with catalog queries, aggregate queries, Supabase
advisor output, Edge Function inventory, and direct counts on the restore
project. It contains only counts, object names, and configuration categories.

No repair is authorized from this report. The next implementation PR must be
Goal 9 only: make queue status updates status-only and prove that all unrelated
queue fields are preserved.

## Rollback

None is required: this Goal performed no production mutation. If rerunning the
aggregate checks causes unexpected database load, stop the queries and use the
recorded control totals until an off-peak window is available.
