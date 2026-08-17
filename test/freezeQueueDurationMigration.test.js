import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  new URL("../supabase/migrations/20260817180000_freeze_queue_duration.sql", import.meta.url),
  "utf8"
);

test("เติมค่าเฉพาะแถวที่ยังว่าง ไม่ทับค่าที่พนักงานแก้เอง", () => {
  assert.match(sql, /update public\.queues q\s+set duration_blocks = p\.blocks/i);
  assert.match(sql, /and q\.duration_blocks is null/i);
});

test("คิวที่ไม่มีหัตถการต้องปล่อยเป็น null — ไม่มีหัตถการก็ไม่มีระยะเวลา", () => {
  // backfill join กับ procedures จึงข้ามแถวที่ procedure_id เป็น null ให้เองอยู่แล้ว
  assert.match(sql, /where q\.procedure_id = p\.id/i);
  // trigger ต้องออกก่อนถ้าไม่มีหัตถการ ไม่งั้น select จะได้ null มาเขียนทับเปล่า ๆ
  assert.match(sql, /if new\.procedure_id is null then\s+return new;/i);
});

test("trigger เคารพค่าที่ระบุมา ไม่เขียนทับ override", () => {
  assert.match(sql, /if new\.duration_blocks is null then/i);
});

test("เปลี่ยนหัตถการโดยไม่ส่งระยะเวลาใหม่ ต้องคำนวณใหม่ ไม่ใช่เก็บค่าของหัตถการเก่า", () => {
  // ถ้าขาดเงื่อนไขนี้ การยิง SQL เปลี่ยน procedure_id เฉย ๆ จะได้ความยาวของหัตถการเดิมค้างมา
  assert.match(sql, /new\.procedure_id is distinct from old\.procedure_id/i);
  assert.match(sql, /new\.duration_blocks is not distinct from old\.duration_blocks/i);
  assert.match(sql, /tg_op = 'UPDATE'/i);
});

test("trigger ทำงานทั้ง insert และ update", () => {
  assert.match(sql, /before insert or update of duration_blocks, procedure_id on public\.queues/i);
  assert.match(sql, /for each row/i);
});

test("trigger เป็น BEFORE — AFTER จะแก้ NEW ไม่ทัน", () => {
  assert.match(sql, /create trigger queues_freeze_duration\s+before /i);
});

test("ฟังก์ชันตั้ง search_path ตามแนวเดียวกับฟังก์ชันอื่นในโปรเจกต์", () => {
  assert.match(sql, /security definer\s+set search_path = ''/i);
});

test("มีคำสั่ง rollback เขียนไว้ในไฟล์", () => {
  assert.match(sql, /drop trigger if exists queues_freeze_duration on public\.queues/i);
  assert.match(sql, /drop function if exists public\.queues_fill_duration_blocks\(\)/i);
});

test("อธิบายไว้ว่าค่าย้อนหลังที่ถูกต้องกู้ไม่ได้ ไม่ได้อ้างว่า backfill คือค่าจริงตามประวัติ", () => {
  assert.match(sql, /กู้ไม่ได้แล้ว/);
});
