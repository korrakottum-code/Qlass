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

test("ไฟล์ seed ผูกด้วยชื่อหัตถการ ครอบทั้งสองตัวที่เปิดใช้จริง และรันซ้ำได้", () => {
  // ของจริงบนโปรดักชันเปิดทั้ง Diode และ Go-Diode — ไฟล์ต้องตรงกับความจริง
  // ไม่งั้นรันไฟล์นี้ตอนกู้คืนแล้วได้ไม่ครบ
  assert.match(seed, /where p\.name in \('Diode', 'Go-Diode'\)/);
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

// ─── กันสวิตช์ฉุกเฉินหาย / ลบพลาดโดยไม่ถาม ───
// เป็น text guard แบบเดียวกับ guard อื่นในโปรเจกต์ (ไม่มี test renderer ในนี้)

const proceduresPage = readFileSync(new URL("../src/pages/ProceduresPage.jsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");

test("ลบบริเวณเดี่ยวต้องถามยืนยันก่อน ไม่ลบทันทีที่กด", () => {
  assert.match(proceduresPage, /window\.confirm\([^)]*ลบบริเวณ[\s\S]{0,400}?onDeleteArea\?\.\(a\.id\)/);
});

test("ต้องมีสวิตช์ปิดฉุกเฉินแบบกดครั้งเดียว ไม่ใช่ไล่ลบทีละอัน", () => {
  assert.match(proceduresPage, /ปิดบริเวณทั้งหมด/);
  assert.match(proceduresPage, /onDisableAreas\?\.\(p\.id\)/);
});

test("สวิตช์ฉุกเฉินต้องถามยืนยัน และบอกว่าคิวที่ลงแล้วไม่ขยับ", () => {
  // ข้อความยืนยันอยู่ "ก่อน" ประโยคนี้ในโค้ด จึงต้องมองย้อนขึ้นไป ไม่ใช่มองต่อจากมัน
  const before = proceduresPage.slice(
    Math.max(0, proceduresPage.indexOf("ปิดบริเวณทั้งหมดของ") - 200),
    proceduresPage.indexOf("ปิดบริเวณทั้งหมดของ")
  );
  assert.match(before, /window\.confirm\(/);
  assert.match(proceduresPage, /คิวที่ลงไปแล้วไม่ขยับ/);
});

test("ปิดฉุกเฉินล้มบางแถวต้องบอกจำนวนที่เหลือ ไม่เงียบ", () => {
  assert.match(app, /allSettled/);
  assert.match(app, /ปิดได้ \$\{goneIds\.size\} จาก \$\{targets\.length\} บริเวณ/);
});

// ─── ทุกหน้าที่ลงคิวได้ต้องมีปุ่มบริเวณ ───
// เจอตอนเปิดใช้จริง: ทำแต่หน้าบันทึกคิว ลืมป๊อปอัปใน Timeline ซึ่งเป็นหน้าที่แอดมิน
// ใช้ลงคิวเป็นหลัก ผลคือคิว Diode จาก Timeline ได้ 15 นาทีเสมอ เปลี่ยนไม่ได้เลย
// ถ้ามีหน้าลงคิวเพิ่มในอนาคต ต้องเพิ่มเข้ามาในเทสต์นี้ด้วย

const timelinePage = readFileSync(new URL("../src/pages/TimelinePage.jsx", import.meta.url), "utf8");
const bookingPage = readFileSync(new URL("../src/pages/BookingPage.jsx", import.meta.url), "utf8");

test("App ส่ง procedureAreaIndex ให้ทุกหน้าที่ลงคิวได้ ไม่ใช่แค่หน้าเดียว", () => {
  const passes = app.match(/procedureAreaIndex=\{procedureAreaIndex\}/g) || [];
  assert.ok(passes.length >= 2, `ส่งให้แค่ ${passes.length} หน้า — ต้องครบทั้งหน้าบันทึกคิวและ Timeline`);
});

for (const [label, source] of [["หน้าบันทึกคิว", bookingPage], ["ป๊อปอัป Timeline", timelinePage]]) {
  test(`${label}: มีปุ่มบริเวณ และเขียนเวลารวมลง durationBlocks`, () => {
    assert.match(source, /areasForProcedure/, "ต้องอ่านบริเวณของหัตถการที่เลือก");
    assert.match(source, /durationBlocks: durationFromAreas\(/, "ต้องเขียนเวลารวมลงช่องเดิม");
  });

  test(`${label}: เปลี่ยนหัตถการแล้วบริเวณเก่าต้องหลุด ไม่ค้างเวลาผิด`, () => {
    assert.match(source, /procedureId: e\.target\.value[^}]*areaIds: \[\]/);
    assert.match(source, /keepValidAreaIds\(/);
  });
}
