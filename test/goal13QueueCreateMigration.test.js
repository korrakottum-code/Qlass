import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase/migrations/20260724192700_goal13_create_queue_v1.sql", import.meta.url), "utf8");

test("Goal 13 queue creation matches the existing room-occupancy rule and fails closed", () => {
  assert.match(sql, /security definer\s+set search_path = ''/i);
  assert.match(sql, /coalesce\(v_duration, 0\) < 1/i);
  assert.match(sql, /q\.status not in \('cancelled', 'no_show'\)/i);
  assert.match(sql, /revoke all on function public\.create_queue_v1\([^)]*jsonb\) from public, anon, authenticated/i);
});
