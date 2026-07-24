# Goal 12B — Handoff state (2026-07-25)

## Current status

The production rollout is technically complete and verified.  The formal Goal
is **not closed yet** because GitHub was experiencing an incident that prevented
creation of the required pull request.

Do not repeat the production migration or index operation.

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

## Production changes already applied

1. Additive Goal 12 queue foundation (nullable metadata fields, private audit
   table, trigger).
2. Corrective trigger replacement.  This ensures a legacy browser client
   cannot supply its own first `version` or `updated_at` value on queue insert.
3. The two indexes above, created with `CREATE INDEX CONCURRENTLY` via the
   Session pooler.  This avoids blocking normal queue writes.

## Source branch awaiting PR

- Branch: `codex/goal-12b-force-queue-metadata`
- Latest commit: `fb7d5f8 Add Goal 12 production index helper`
- Previous commit: `13ca114 Force server-owned queue metadata`
- Comparison URL:
  <https://github.com/korrakottum-code/Qlass/compare/main...codex/goal-12b-force-queue-metadata>

The branch contains only four files:

1. The Goal 12B runbook wording update.
2. The original foundation migration updated for fresh environments.
3. The corrective migration used by the existing production project.
4. The local operator helper used to create the two indexes.  It prompts for
   the password locally and contains no credential.

## Why the PR is missing

On 2026-07-24 at about 19:40 UTC, GitHub declared an incident affecting Pull
Request creation.  Creating this PR failed through the GitHub connector, the
`gh` CLI (GraphQL internal error), and the GitHub web page (Server Error).
Git push and account authentication continued to work.  No PR was created.

## Required next steps

1. Check <https://www.githubstatus.com/> and wait until the Pull Requests
   incident is resolved.
2. Open the comparison URL above and create the PR.  Do **not** push directly
   to `main`.
3. Before merge, verify:
   - the PR still changes only the four files listed above;
   - CI is green;
   - `npm test` (29 tests) and `npm run build` pass;
   - the production proof in this file remains true.
4. Merge the PR.  No additional production deploy is needed; its database
   changes are already live and verified.
5. Mark Goal 12B complete only after the PR has merged.

## Important follow-up: migration history alignment

Before **any future** `supabase db push`, create a separate reviewed Goal to
align the local migration history with the production history.  The SQL is
already applied, but the timestamps recorded in production differ from the
filenames in Git:

| Local Git filename version | Production history version |
| --- | --- |
| `20260724174204_goal12_queue_audit_foundations` | `20260724192100_goal12_queue_audit_foundations` |
| `20260724192319_goal12_force_queue_metadata` | `20260724192606_goal12_force_queue_metadata` |

This does not affect current users or this source-only merge.  It does mean a
future migration tool could try to replay an already-applied migration.  Do
not repair that history manually and do not run `supabase db push` until the
dedicated alignment Goal has an approved rollback plan.
