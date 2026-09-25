import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ดัชนี updated_at ของ queues (25 ก.ย. 2569): ถ้าไม่มี query ของตัวตามข้อมูล/ตัวดึงเป็นระยะจะสแกนทั้งตาราง (~130 ms) ทุก 30 วินาทีจากทุกเครื่อง
const sql = readFileSync(new URL("../supabase/migrations/20260925162031_queues_updated_at_index.sql", import.meta.url), "utf8");
const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

test("migration สร้างดัชนี updated_at ของ queues แบบ idempotent", () => {
  assert.match(code, /create index if not exists idx_queues_updated_at on public\.queues \(updated_at\);/i);
});

test("ไม่มี CONCURRENTLY ในคำสั่งจริง (รันในทรานแซกชันของ migration ไม่ได้) และไม่มีคำสั่งอื่นแอบมาด้วย", () => {
  assert.ok(!/concurrently/i.test(code));
  const statements = code.split(";").map((s) => s.trim()).filter(Boolean);
  assert.equal(statements.length, 1);
});

test("เอกสารในไฟล์ระบุว่าโปรดักชันสร้างด้วย CONCURRENTLY", () => {
  assert.match(sql, /CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_queues_updated_at/);
});
