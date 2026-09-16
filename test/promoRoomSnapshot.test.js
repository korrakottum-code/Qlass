import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// เก็บชื่อโปร/ห้อง ณ ตอนลงคิว กันประวัติเก่าเพี้ยนเมื่อโปร/ห้องถูกลบทีหลัง
//
// เจ้าของงานสังเกตว่าหน้าสรุปประจำวัน "ไม่ระบุโปร"/"ไม่ระบุห้อง" เยอะขึ้นเรื่อย ๆ —
// ตรวจพบว่ามีคิวสถานะ "เสร็จแล้ว"/"ไม่มาตามนัด" ปะปนอยู่ด้วย ซึ่งเป็นไปไม่ได้ที่จะ
// ไม่เคยมีห้องจริง สรุปว่าห้อง/โปรที่เคยผูกไว้ถูกลบไปทีหลัง (ON DELETE SET NULL)
// ลบเงียบ ไม่มีเตือน และลบย้อนหลังกระทบคิวเก่าที่เสร็จไปแล้วด้วย

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20260916120000_queue_promo_room_snapshots.sql");
const service = read("../src/utils/supabaseService.js");
const summary = read("../src/pages/SummaryPage.jsx");

test("คอลัมน์ใหม่ต้อง nullable ไม่มี default — ห้ามกระทบคิวเก่า 180,000+ แถว", () => {
  for (const col of ["promo_name_snapshot", "room_label_snapshot"]) {
    const ddl = migration.match(new RegExp(`^alter table public\\.queues add column ${col} .*;$`, "m"))?.[0] || "";
    assert.match(ddl, new RegExp(`^alter table public\\.queues add column ${col} text;$`),
      `${col} ต้องเป็น ADD COLUMN ธรรมดา ไม่มีอะไรต่อท้าย`);
  }
});

test("ใช้ trigger ฝั่งฐานข้อมูล ไม่ใช่ JS — กันตกหล่นเวลามีทางเขียนหลายทาง", () => {
  assert.match(migration, /create trigger queues_fill_name_snapshots\s*\n\s*before insert or update of promo_id, room_id on public\.queues/);
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = ''/);
});

test("ห้ามล้าง snapshot เป็นค่าว่างไม่ว่ากรณีใด — นี่คือกติกาข้อเดียวที่ทำให้ฟีเจอร์มีความหมาย", () => {
  const fn = migration.slice(
    migration.indexOf("create or replace function public.queues_fill_name_snapshots"),
    migration.indexOf("$$;\n\ncomment on function public.queues_fill_name_snapshots")
  );
  // เงื่อนไขต้องเช็ค "new.X is not null" ก่อนเขียนเสมอ — ถ้าไม่มี แปลว่ามีทางที่ค่า
  // NULL (จาก FK SET NULL หรือแอดมินเคลียร์เอง) จะไปเขียนทับ snapshot จนกลายเป็นค่าว่าง
  assert.match(fn, /if new\.promo_id is not null\s*\n\s*and \(tg_op = 'INSERT' or new\.promo_id is distinct from old\.promo_id\)/);
  assert.match(fn, /if new\.room_id is not null\s*\n\s*and \(tg_op = 'INSERT' or new\.room_id is distinct from old\.room_id\)/);
  // ห้ามมีบรรทัดไหนเซต snapshot เป็น null ตรง ๆ
  assert.ok(!/promo_name_snapshot\s*:?=\s*null/i.test(fn));
  assert.ok(!/room_label_snapshot\s*:?=\s*null/i.test(fn));
});

test("ฝั่งแอปต้องอ่าน snapshot กลับมาได้ครบทั้งสามจุด (โหลด/สร้าง/แก้ไข)", () => {
  assert.match(service, /promoNameSnapshot: q\.promo_name_snapshot \|\| ""/);
  assert.match(service, /roomLabelSnapshot: q\.room_label_snapshot \|\| ""/);
  const createBlock = service.slice(service.indexOf("export async function createQueue("), service.indexOf("\n}\n", service.indexOf("export async function createQueue(")));
  const updateBlock = service.slice(service.indexOf("export async function updateQueue("), service.indexOf("\n}\n", service.indexOf("export async function updateQueue(")));
  for (const [name, block] of [["createQueue", createBlock], ["updateQueue", updateBlock]]) {
    assert.match(block, /promoNameSnapshot: data\.promo_name_snapshot \|\| ""/, `${name} ไม่ได้คืน promoNameSnapshot`);
    assert.match(block, /roomLabelSnapshot: data\.room_label_snapshot \|\| ""/, `${name} ไม่ได้คืน roomLabelSnapshot`);
  }
});

test("หน้าสรุปประจำวันต้องใช้ snapshot เป็น fallback ก่อนตกไปที่ป้าย ไม่ระบุ ครบทั้ง 4 กราฟ", () => {
  const roomMatches = [...summary.matchAll(/r \? `\[\$\{r\.type\}\] \$\{r\.name\}` : \(q\.roomLabelSnapshot \|\| "ไม่ระบุ"\)/g)];
  const promoMatches = [...summary.matchAll(/p\?\.name \|\| q\.promoNameSnapshot \|\| "ไม่ระบุโปร"/g)];
  assert.equal(roomMatches.length, 2, "ต้องมีทั้งกราฟห้องของส่วน 'บันทึก' และส่วน 'นัด'");
  assert.equal(promoMatches.length, 2, "ต้องมีทั้งกราฟโปรของส่วน 'บันทึก' และส่วน 'นัด'");
});
