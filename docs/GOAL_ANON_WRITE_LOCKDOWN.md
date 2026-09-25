# Browser-key write lockdown (anon / authenticated)

## Why

The Supabase key embedded in the web app is public by design (anyone who opens the site can read it).
Supabase's linter does not flag tables whose RLS policy is literally `true`, so these stayed open. Verified on
2026-09-25 by calling PostgREST directly with only that key (with a non-existent row id, so nothing was touched):
`PATCH`/`DELETE` returned `204` (allowed). After a fix the same calls return `401` / `42501 permission denied`.

Repeat that test before and after every table (see "How to prove a table is closed").

## Status

| Table | Browser key can write? | Status |
|---|---|---|
| `branches` | no | closed 2026-09-16 (`20260915182016`) |
| `staff`, `app_*`, `hn_*`, `queue_audit`, `client_diagnostics` | no (RLS on, no policy) | closed |
| `activity_logs` | **INSERT + SELECT only** | closed 2026-09-25 (`20260925010543`) |
| `queues` | yes (insert/update/delete) | open, highest impact, needs write path moved to an edge function first |
| `rooms`, `room_schedules`, `room_procedures` | yes | open |
| `procedures`, `procedure_areas`, `procedure_categories`, `promos` | yes | open |
| `tickets`, `quiz_results`, `quiz_settings` | yes | open |

## Order of work for each remaining table

1. Find every browser write (`supabaseService.js`) and every non-browser writer (scripts, workflows).
2. Move the write to the `staff-session` edge function (role check on the server, like `branch_*`), keeping the
   browser path behind a flag if the table is hot.
3. Owner tests the real screen. 4. Only then revoke the browser key's write privileges (create any needed read
   policy **before** dropping the old ones, in one transaction).
5. Prove with the direct-call test above and with `SET LOCAL ROLE anon` inside a `DO` block that ends in
   `RAISE EXCEPTION` (rolls everything back, leaves no test rows).

Do not revoke on `queues` before step 2: staff create and edit queues through the browser key today.

## Known remaining gaps on `activity_logs` (deliberate, next step)

- Anyone with the key can still INSERT fake log rows and can READ the log (it contains the name and phone of deleted queues).
- A queue deleted directly through the key leaves **no** log row at all. This closes only when `queues` DELETE is revoked.

## How to prove a table is closed

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE "$VITE_SUPABASE_URL/rest/v1/<table>?id=eq.<a-nonexistent-id>" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY"
```

`204` = still open. `401` with `42501` = closed. Use a non-existent id so no real row can be touched.

## Rollback: `activity_logs` (2026-09-25)

```sql
grant update, delete, truncate, references, trigger on public.activity_logs to anon, authenticated;
create policy "allow all" on public.activity_logs for all using (true);
create policy "Allow public update on activity_logs" on public.activity_logs for update using (true) with check (true);
create policy "Allow public delete on activity_logs" on public.activity_logs for delete using (true);
drop policy if exists "activity_logs_read" on public.activity_logs;
```
