import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ฟังก์ชัน trigger ทุกตัวในระบบต้อง revoke สิทธิ์เรียกตรงจาก anon/authenticated เสมอ
//
// queues_fill_name_snapshots (migration 20260916120000) หลุดข้อนี้ไป — ตัวตรวจของ
// Supabase จับได้ว่า anon/authenticated เรียกตรงผ่าน /rest/v1/rpc/... ได้ ทั้งที่
// เป็น SECURITY DEFINER (ผลกระทบจริงต่ำ เพราะเป็น trigger function เรียกนอก
// trigger context ไม่ได้อยู่แล้ว แต่ต้องปิดให้ตรงกับฟังก์ชันพี่น้องตัวอื่น)

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const revokeMigration = read("../supabase/migrations/20260916140000_revoke_queues_fill_name_snapshots_execute.sql");
const snapshotMigration = read("../supabase/migrations/20260916120000_queue_promo_room_snapshots.sql");

test("migration ก่อนหน้าต้องไม่มี revoke อยู่แล้ว (ยืนยันว่าเป็นช่องที่หลุดจริง ไม่ใช่ซ้ำ)", () => {
  assert.ok(!/revoke all on function public\.queues_fill_name_snapshots/.test(snapshotMigration),
    "ถ้ามี revoke อยู่แล้วในไฟล์เดิม แปลว่า migration นี้ซ้ำซ้อนโดยไม่จำเป็น");
});

test("ต้อง revoke ครบทั้ง public, anon, authenticated", () => {
  assert.match(revokeMigration, /revoke all on function public\.queues_fill_name_snapshots\(\) from public, anon, authenticated;/);
});
