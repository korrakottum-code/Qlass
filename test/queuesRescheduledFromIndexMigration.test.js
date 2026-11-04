import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ดัชนี rescheduled_from_id (4 พ.ย. 2569): ไม่มีดัชนี = ลบคิวแต่ละครั้งต้องสแกนทั้งตาราง queues เพื่อเช็ค foreign key ที่ชี้กลับหาตัวเอง
const sql = readFileSync(new URL("../supabase/migrations/20261104110000_queues_rescheduled_from_index.sql", import.meta.url), "utf8");
const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

test("migration สร้างดัชนี partial ของ rescheduled_from_id แบบ idempotent", () => {
  assert.match(code, /create index if not exists idx_queues_rescheduled_from_id on public\.queues \(rescheduled_from_id\) where rescheduled_from_id is not null;/i);
});

test("ไม่มี CONCURRENTLY ในคำสั่งจริง และไม่มีคำสั่งอื่นแอบมาด้วย", () => {
  assert.ok(!/concurrently/i.test(code));
  const statements = code.split(";").map((s) => s.trim()).filter(Boolean);
  assert.equal(statements.length, 1);
});

test("เอกสารในไฟล์ระบุว่าโปรดักชันสร้างด้วย CONCURRENTLY", () => {
  assert.match(sql, /CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_queues_rescheduled_from_id/);
});
