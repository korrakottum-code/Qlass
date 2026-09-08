import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const schema = readFileSync(new URL("../supabase/migrations/20260908093000_procedure_areas.sql", import.meta.url), "utf8");
const seed = readFileSync(new URL("../supabase/seeds/procedure_areas_diode.sql", import.meta.url), "utf8");
const service = readFileSync(new URL("../src/utils/supabaseService.js", import.meta.url), "utf8");

test("ผูกกับ procedures และลบตามเมื่อหัตถการถูกลบ", () => {
  assert.match(schema, /references public\.procedures\(id\)\s+on delete cascade/i);
});

test("เปิด RLS และมี select policy ตั้งแต่แรก — ตารางที่อ่านไม่ได้ทำแอปพัง", () => {
  assert.match(schema, /alter table public\.procedure_areas enable row level security/i);
  assert.match(schema, /create policy "Allow public read access on procedure_areas"\s+on public\.procedure_areas for select using \(true\)/i);
  assert.match(schema, /grant select, insert, update, delete on table public\.procedure_areas to anon, authenticated/i);
});

test("กันเวลาพิมพ์ผิดจนคิวเดียวกินเตียงทั้งวัน", () => {
  assert.match(schema, /check \(blocks between 1 and 48\)/i);
});

test("ชื่อบริเวณห้ามซ้ำในหัตถการเดียวกัน", () => {
  assert.match(schema, /create unique index[\s\S]*?on public\.procedure_areas \(procedure_id, btrim\(name\)\)/i);
});

test("migration ต้องไม่แตะตาราง queues และไม่แก้ create_queue_v1", () => {
  assert.ok(!/alter table public\.queues/i.test(schema), "migration ต้องไม่ ALTER ตาราง queues");
  // อ้างถึงในคอมเมนต์ได้ (อธิบายว่าทำไมไม่ต้องแก้) แต่ห้ามมีคำสั่งเปลี่ยนตัว RPC จริง
  assert.ok(!/create or replace function public\.create_queue_v1/i.test(schema),
    "migration ต้องไม่แก้ RPC ฝั่งเซิร์ฟเวอร์");
});

test("migration ต้องไม่ seed ข้อมูล — ลงแล้วต้องไม่มีอะไรเปลี่ยนสำหรับคนที่ใช้อยู่", () => {
  assert.ok(!/insert into public\.procedure_areas/i.test(schema),
    "ข้อมูลเปิดใช้ต้องอยู่ในไฟล์ seed แยก ไม่ใช่ใน migration");
});

test("ไฟล์ seed ผูกด้วยชื่อหัตถการ และรันซ้ำได้", () => {
  assert.match(seed, /where p\.name = 'Diode'/);
  assert.match(seed, /on conflict do nothing/i);
});

test("เวลาบริเวณในไฟล์ seed ตรงกับที่เจ้าของยืนยัน", () => {
  const rows = [...seed.matchAll(/\('([^']+)',\s*(\d+),\s*\d+\)/g)].map((m) => [m[1], Number(m[2])]);
  const byName = Object.fromEntries(rows);
  assert.equal(byName["แขน"], 4);        // 20 นาที
  assert.equal(byName["ขา"], 4);         // 20 นาที
  assert.equal(byName["หลัง"], 4);        // 20 นาที
  assert.equal(byName["ขาล่าง"], 4);      // 20 นาที (ยืนยัน 2026-09-09 เท่าขาเต็ม)
  assert.equal(byName["Hollywood"], 6);  // 30 นาที
  assert.equal(byName["รักแร้"], 3);      // 15 นาที (อื่นๆ)
  assert.equal(byName["หนวด"], 3);
  assert.equal(byName["เครา"], 3);
  assert.equal(byName["ใบหน้า"], 3);
  assert.equal(rows.length, 9);
});

test("ฝั่งแอปเขียนเวลาลงช่อง duration_blocks เดิม ไม่เพิ่มคอลัมน์ใหม่ในคิว", () => {
  assert.ok(!/area_ids|area_names|procedure_area_id/i.test(service),
    "ตาราง queues ต้องไม่มีฟิลด์บริเวณในเฟสนี้ — เวลาที่รวมได้ลง duration_blocks ช่องเดิม");
});
