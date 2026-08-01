# Goal 12C — Migration history source alignment

## Outcome

Align the migration filenames in Git with the versions already recorded by the
QLASS production project. This is a **source-only** change: it does not run
SQL against production, deploy an Edge Function, change RLS, or modify any
application or customer data.

The chosen method deliberately avoids `supabase migration repair` on
production. The repair command is valid for metadata recovery, but it is not
needed when the source filenames can be made canonical instead.

## Evidence collected before the change

Production project: `QLASS` (`hjuvtsjjtucdirlkdgwa`). Its migration history
contains exactly these applied versions:

| Production version | Canonical Git migration after this PR | Status |
| --- | --- | --- |
| `20260713182837` | `20260713182837_server_verified_staff_sessions.sql` | applied |
| `20260713191415` | `20260713191415_hn_lookup_audit.sql` | applied |
| `20260713191833` | `20260713191833_deny_public_hn_customer_reads.sql` | applied |
| `20260713195136` | `20260713195136_secure_hn_customer_writes.sql` | applied |
| `20260724192100` | `20260724192100_goal12_queue_audit_foundations.sql` | applied |
| `20260724192606` | `20260724192606_goal12_force_queue_metadata.sql` | applied |

Two source migrations remain intentionally **pending** on production and must
not be marked applied by this Goal:

| Pending Git migration | Reason |
| --- | --- |
| `20260724192700_goal13_create_queue_v1.sql` | Goal 13 has not had its own production Go decision. |
| `20260724192800_goal11d_client_observability.sql` | Goal 11D has not had its own production Go decision. |

The historical public-read policy removal existed only in the dashboard
history. This PR recovers it as a canonical migration file. Its SQL only
removes the old public-read policy; it does not access HN rows.

## Restore-project rehearsal

Rehearsal project: `qlass-restore-verification-20260714`
(`lsaljbxlccsypsbgxkrg`). This project is isolated from production.

Before rehearsal:

- queues: `99,247`
- staff: `67`
- HN customers: `180,012`
- migration history entries: `4`
- `queue_audit` table and `queues_set_concurrency_metadata` trigger existed.

A temporary entry (`20990101000000`, `goal12c_rehearsal_only`) was inserted
inside one transaction and then rolled back. Afterward, the entry was absent,
all four counts/objects above were unchanged, and no application table was
written. This proves the metadata-only rollback gate used to evaluate this
Goal. It is not a production operation.

The restore project has intentionally different `*_clone_test` migration
versions, so it must not itself be renamed or "repaired" to mimic production.

## Why filenames change

The earlier migrations were applied through controlled dashboard/API tooling
at a later timestamp than their first local filename. The database is already
correct; only the identifiers used by the local migration tool differed.

Goal 13 and Goal 11D are moved *after* the corrected Goal 12 versions so a
new database will run the queue foundations before either pending feature. No
SQL body is changed in those files.

## PR review checklist

Before merge, confirm all of the following:

1. The diff contains only migration filename moves, the recovered historical
   HN read-policy file, and documentation.
2. The content of each moved migration is unchanged.
3. The recovered migration contains only:
   `drop policy if exists "Allow public read access on hn_customers" on public.hn_customers;`
4. The local migration versions, in order, are the six production versions
   above followed only by the two pending Goal 13/11D versions.
5. `npm test` and `npm run build` pass.
6. No CI job, script, or person runs `supabase db push`, `supabase db reset`,
   `supabase migration repair`, or direct production SQL for this PR.

## Post-merge verification (read-only)

Run `supabase migration list --linked` while the CLI is linked to the QLASS
production project, entering the database password locally when prompted. The
expected state is:

- six versions match on both local and remote;
- `20260724192700` and `20260724192800` appear as local-only/pending;
- no remote-only versions remain.

This command only reads migration history. If the output differs, stop; do not
run `db push` and do not use `migration repair` as a shortcut.

## Stop and rollback plan

### Stop immediately if

- a version other than the six listed applied production versions appears;
- any pending Goal 13/11D migration is reported remote-applied;
- the diff includes a SQL-body change other than the recovered one-line policy
  migration; or
- verification asks to apply a migration or change the database.

### Rollback

No production rollback is required because this Goal makes no production
change. Reverting this PR restores the prior filenames and documentation only.
After a revert, keep the existing prohibition on `supabase db push` until a
new reviewed reconciliation plan is approved.

## Explicit boundary for later Goals

Any future production schema change still requires its own Goal, PR, explicit
production Go, backup/rollback assessment, and post-change verification. Goal
12C grants no permission to deploy Goal 13 or Goal 11D.
