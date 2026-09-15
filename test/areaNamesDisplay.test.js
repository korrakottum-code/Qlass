import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// บริเวณที่เลือกไว้ (เช่น Diode: รักแร้/ขา) ไม่เคยถูกเก็บไว้เลยหลังบันทึกคิว มีแต่ตัวเลข
// เวลารวมที่บวกไว้แล้ว เจ้าของงานเจอเอง 16 ก.ย. 2569 — "เลือกแล้วไม่มีโชว์ว่าเลือกบริการ
// ไหน มีแต่เวลาที่ปรับตาม" ขอบเขตที่ตกลง: ต่อท้ายชื่อหัตถการ เอาแค่จากนี้ไปพอ ไม่ต้อง
// ย้อนกู้ข้อมูลเก่า (กู้ไม่ได้ด้วย เพราะไม่เคยถูกเก็บไว้)

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

const columnMigration = read("../supabase/migrations/20260916100000_queue_area_names_column.sql");
const rpcMigration = read("../supabase/migrations/20260916110000_create_queue_v1_area_names.sql");
const service = read("../src/utils/supabaseService.js");
const bookingPage = read("../src/pages/BookingPage.jsx");
const timelinePage = read("../src/pages/TimelinePage.jsx");
const queueTablePage = read("../src/pages/QueueTablePage.jsx");
const gate = read("../src/utils/queueCreateGate.js");
const helpers = read("../src/utils/helpers.js");

test("คอลัมน์ใหม่ต้อง nullable ไม่มี default — ห้ามกระทบคิวเก่า 180,000+ แถว", () => {
  const ddl = columnMigration.match(/^alter table public\.queues add column .*;$/m)?.[0] || "";
  assert.match(ddl, /^alter table public\.queues add column area_names text;$/,
    "คำสั่งต้องเป็น ADD COLUMN ธรรมดา ไม่มีอะไรต่อท้ายเลย (ไม่ not null ไม่ default)");
});

test("ทางบันทึกคิวตรง (createQueue/updateQueue) ต้องอ่าน-เขียน area_names ครบทั้งสองทาง", () => {
  for (const fn of ["createQueue", "updateQueue"]) {
    const start = service.indexOf(`export async function ${fn}(`);
    const end = service.indexOf("\n}\n", start);
    const block = service.slice(start, end);
    assert.match(block, /area_names: queue\.areaNames \|\| null/, `${fn} ไม่ได้เขียน area_names`);
    assert.match(block, /areaNames: data\.area_names \|\| ""/, `${fn} ไม่ได้คืน areaNames กลับมา`);
  }
  assert.match(service, /areaNames: q\.area_names \|\| ""/, "mapQueueRow ไม่ได้แปลง area_names");
});

test("ทางบันทึกผ่านเซิร์ฟเวอร์ (กลุ่มทดลอง) ต้องส่ง area_names ไปด้วย ไม่งั้นจะหายเงียบ ๆ เฉพาะกลุ่มนี้", () => {
  assert.match(gate, /area_names: form\.areaNames \|\| ""/);
});

test("เปลี่ยนหัตถการต้องล้าง areaNames ด้วยเสมอ — ไม่งั้นข้อความบริเวณของหัตถการเก่าค้าง", () => {
  // บทเรียนเดียวกับ durationBlocks/areaIds ที่ต้องล้างพร้อมกันตอนสลับหัตถการ (ดู #171)
  for (const [file, src] of [["BookingPage", bookingPage], ["TimelinePage", timelinePage]]) {
    const resetLine = src.match(/procedureId: e\.target\.value[^}]*\}\)\)/);
    assert.ok(resetLine, `${file}: หาบรรทัด reset ตอนเปลี่ยนหัตถการไม่เจอ`);
    assert.match(resetLine[0], /areaNames: ""/, `${file} ไม่ได้ล้าง areaNames ตอนเปลี่ยนหัตถการ`);
  }
});

test("ฟอร์มเปล่าเริ่มต้นต้องมี areaNames เป็นข้อความว่าง ไม่ใช่ undefined", () => {
  assert.match(helpers, /areaNames: "",/);
});

test("ตารางคิวหลักต้องต่อท้ายชื่อหัตถการด้วยบริเวณที่เลือก", () => {
  assert.match(queueTablePage,
    /\{proc\?\.name \|\| "—"\}\{q\.areaNames \? ` \(\$\{q\.areaNames\}\)` : ""\}/);
});

test("ป๊อปอัปรายละเอียดใน Timeline ต้องโชว์บริเวณด้วย ไม่ใช่แค่ตารางคิวหลัก", () => {
  // Timeline เป็นหน้าที่แอดมินใช้จริงเป็นหลัก (ดู memory: procedure-areas-rollout) —
  // แก้แค่ตารางคิวแล้วลืม Timeline คือบั๊กที่เคยเกิดมาแล้วครั้งหนึ่งกับฟีเจอร์นี้ (#169)
  assert.match(timelinePage, /popup\.q\.areaNames && \(/);
});

test("RPC (กลุ่มทดลอง) ต้องเขียน area_names ลงตาราง และเทียบตอนกันคำขอซ้ำด้วย", () => {
  assert.match(rpcMigration, /v_area_names := nullif\(btrim\(coalesce\(p_payload->>'area_names', ''\)\), ''\);/);
  assert.match(rpcMigration, /request_id, effective_duration_blocks, effective_price, effective_commission_rate, area_names/);
  assert.match(rpcMigration, /p_request_id, v_duration, v_price, v_effective_commission, v_area_names/);
  assert.match(rpcMigration,
    /or \(p_queue\)\.area_names is distinct from nullif\(btrim\(coalesce\(p_payload->>'area_names', ''\)\), ''\)/);
});

test("RPC ต้องคงด่านกันคำขอซ้ำเดิมไว้ครบ ไม่ใช่แค่เพิ่มของใหม่แล้วลืมของเก่า", () => {
  assert.match(rpcMigration, /message = 'request_id_stale'/);
  const calls = rpcMigration.match(/public\.queue_payload_unchanged\(v_existing, p_payload\)/g) || [];
  assert.equal(calls.length, 2, "ทั้งทางหลักและทางสำรองต้องยังเรียกฟังก์ชันเทียบอยู่");
  assert.match(rpcMigration, /pg_advisory_xact_lock\(hashtextextended\('queue-request:/);
  assert.match(rpcMigration, /pg_advisory_xact_lock\(hashtextextended\('queue-room-day:/);
});

test("ตั้งเวลาหมดอายุการล็อกไว้ — หน้าร้านเปิดอยู่ ห้ามค้างขวาง", () => {
  assert.match(rpcMigration, /set local lock_timeout = '3s';/);
});
