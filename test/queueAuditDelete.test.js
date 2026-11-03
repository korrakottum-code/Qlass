import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync(new URL("../supabase/migrations/20261103160000_queue_audit_allow_queue_delete.sql", import.meta.url), "utf8");

test("ลบคิวที่มีประวัติใน queue_audit ได้ (set null ไม่ใช่ restrict) และประวัติไม่หาย", () => {
  assert.match(migration, /alter column queue_id drop not null;/);
  assert.match(migration, /references public\.queues\(id\) on delete set null;/);
  assert.ok(!/on delete (restrict|cascade)/.test(migration.replace(/^--.*$/gm, "")));
});
