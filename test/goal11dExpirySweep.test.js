import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase/migrations/20260724192800_goal11d_client_observability.sql", import.meta.url), "utf8");

test("Goal 11D has an independent, private hourly expiry sweep", () => {
  assert.match(sql, /create extension if not exists pg_cron/i);
  assert.match(sql, /delete from public\.client_diagnostics where expires_at <= now\(\)/i);
  assert.match(sql, /cron\.schedule\([\s\S]*'17 \* \* \* \*'/i);
  assert.doesNotMatch(sql, /security definer/i);
  assert.doesNotMatch(sql, /cron\.schedule\([\s\S]*(?:insert into|update public\.|select \* from)/i);
});
