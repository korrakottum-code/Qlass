import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  findTreatmentProcedure,
  freeProgramVerdict,
  freeProgramVerdictNow,
  computeFreeProgramReadiness,
  FREE_PROGRAM_THRESHOLDS,
} from "../src/utils/capacity.js";

// หน้า "คิวว่าง" — ตัวกรอง "เตียงทรีตเมนต์" + ตารางความพร้อมโปรแกรมฟรีทรีตเมนต์รายสาขา
//
// ที่มา (21 ก.ย. 2569): เจ้าของจะเปิดโปรฟรีให้ลูกค้าเก่าเข้ามาทำทรีตเมนต์ช่วงที่ห้องว่าง ถามว่าทำตอนไหน
// สาขาไหนไม่ควรทำ และอนาคตจะตัดสินยังไง — ข้อมูลจริง ก.ค.–ก.ย. บอกว่าทรีตเมนต์ลงได้เฉพาะเตียงที่ล็อกให้
// รับ Treatment (เตียง Diode/สิว) ซึ่งเป็นเตียงที่แน่นสุดของเครือ ตัวเลข "ว่างห้องเครื่อง (T)" รวมจึงหลอก
// กติกา: ว่าง ≥85% เปิดได้ / 70–84% เปิดจำกัด / <70% หรือร่วงเกิน 10 จุด ไม่ควรทำ / 0–2 วันข้างหน้าแน่น = พักก่อน

const T = { id: "p-treat", name: "Treatment", blocks: 4, roomType: "T" };
const DIODE = { id: "p-diode", name: "Diode", blocks: 3, roomType: "T" };
const procedures = [T, DIODE];
// จันทร์ 21 ก.ย. 2569 — ฐาน 4 สัปดาห์ = 24 ส.ค.–20 ก.ย. (แนวโน้มเทียบกับ 27 ก.ค.–23 ส.ค.), คิวจริง = 21–23 ก.ย.
const today = "2026-09-21";
const bed = (id, branchId) => ({ id, branchId, type: "T", openBlock: 132, closeBlock: 240 });

// จองเต็มช่วง 13:00–17:00 (48 block) ของเตียงในวันที่กำหนด
const fullBooking = (roomId, date) => ({ roomId, date, timeBlock: 156, durationBlocks: 48, procedureId: DIODE.id, status: "pending" });

test("หาหัตถการทรีตเมนต์ด้วยชื่อ ไม่ผูก id และไม่หยิบฝั่ง M", () => {
  assert.equal(findTreatmentProcedure(procedures)?.id, "p-treat");
  assert.equal(findTreatmentProcedure([{ id: "x", name: "Facial Treatment", roomType: "T" }])?.id, "x");
  assert.equal(findTreatmentProcedure([{ id: "m", name: "Treatment", roomType: "M" }]), null);
  assert.equal(findTreatmentProcedure([DIODE]), null);
});

test("เกณฑ์คำตัดสิน: 85 เปิดได้ / 70 เปิดจำกัด / 69 ไม่ควรทำ / ไม่มีข้อมูล", () => {
  assert.equal(FREE_PROGRAM_THRESHOLDS.open, 85);
  assert.equal(FREE_PROGRAM_THRESHOLDS.limited, 70);
  assert.equal(freeProgramVerdict({ pct: 85, last4: 85, prev4: 85 }), "open");
  assert.equal(freeProgramVerdict({ pct: 84, last4: 84, prev4: 84 }), "limited");
  assert.equal(freeProgramVerdict({ pct: 70, last4: 70, prev4: 70 }), "limited");
  assert.equal(freeProgramVerdict({ pct: 69, last4: 69, prev4: 69 }), "stop");
  assert.equal(freeProgramVerdict({ pct: null, last4: null, prev4: null }), "no-data");
});

test("ร่วงเกิน 10 จุดใน 4 สัปดาห์ล่าสุด = ไม่ควรทำ แม้ตัวเลขเองยังผ่าน (กรณีชัยภูมิ 72→43)", () => {
  assert.equal(freeProgramVerdict({ pct: 76, last4: 76, prev4: 95 }), "stop");
  // ร่วงพอดี 10 จุด ยังไม่ถือว่าร่วง
  assert.equal(freeProgramVerdict({ pct: 85, last4: 85, prev4: 95 }), "open");
});

test("ด่านสอง 0–2 วัน: ประวัติผ่านแต่ 3 วันนี้แน่น → พักก่อน, ประวัติไม่ผ่านไม่ต้องดูด่านสอง", () => {
  assert.equal(freeProgramVerdictNow({ verdict: "open", nowPct: 69 }), "pause");
  assert.equal(freeProgramVerdictNow({ verdict: "limited", nowPct: 50 }), "pause");
  assert.equal(freeProgramVerdictNow({ verdict: "open", nowPct: 70 }), "open");
  assert.equal(freeProgramVerdictNow({ verdict: "open", nowPct: null }), "open");
  assert.equal(freeProgramVerdictNow({ verdict: "stop", nowPct: 100 }), "stop");
});

test("ฐานพยากรณ์ = 4 สัปดาห์ที่จบแล้ว (ไม่รวมวันนี้), พยากรณ์ 7 วัน วันนี้ถึง +6", () => {
  const r = computeFreeProgramReadiness({ rooms: [bed("r1", "b1")], roomSchedules: [], queues: [], procedures, today });
  assert.equal(r.from, "2026-08-24");
  assert.equal(r.to, "2026-09-20");
  assert.deepEqual(r.forecastDates, ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27"]);
  const row = r.rows[0];
  assert.equal(row.beds, 1);
  assert.equal(row.pct, 100);
  assert.equal(row.nowPct, 100);
  assert.equal(row.verdict, "open");
  assert.equal(row.verdictNow, "open");
  // ช่วง 13:00–17:00 = 48 block = 12 ช่อง 20 นาที ต่อเตียงต่อวัน
  assert.equal(row.avgSlots, 12);
  // รายวัน: จ–ศ คาด 12 ช่อง, เสาร์–อาทิตย์ไม่แนะนำ = null
  assert.deepEqual(row.forecast.map((f) => f.slots), [12, 12, 12, 12, 12, null, null]);
  assert.deepEqual(row.forecast.map((f) => f.source), ["actual", "actual", "actual", "forecast", "forecast", "weekend", "weekend"]);
});

test("พยากรณ์รายวันใช้ 'วันเดียวกันของสัปดาห์' — วันพฤหัสแน่นทุกสัปดาห์ต้องเห็นเฉพาะช่องพฤหัส", () => {
  // จองเต็มทุกวันพฤหัสของ 4 สัปดาห์ฐาน (27 ส.ค., 3, 10, 17 ก.ย.) และ 4 สัปดาห์ก่อนหน้าด้วย
  // (ไม่งั้นแนวโน้มจะ "ร่วง" จาก 100 → 80 แล้วกลายเป็นไม่ควรทำ ซึ่งเป็นกติกาที่ถูกต้อง แต่ไม่ใช่สิ่งที่เทสต์นี้วัด)
  const queues = ["2026-07-30", "2026-08-06", "2026-08-13", "2026-08-20", "2026-08-27", "2026-09-03", "2026-09-10", "2026-09-17"].map((d) => fullBooking("r1", d));
  const r = computeFreeProgramReadiness({ rooms: [bed("r1", "b1")], roomSchedules: [], queues, procedures, today });
  const f = r.rows[0].forecast;
  assert.equal(f[3].date, "2026-09-24"); // พฤหัส
  assert.equal(f[3].pct, 0);
  assert.equal(f[3].slots, 0);
  assert.equal(f[4].pct, 100); // ศุกร์ไม่กระทบ
  // ฐานรวม จ–ศ = 4 วันเต็มจาก 20 วัน → ว่าง 80% = เปิดจำกัด (แนวโน้ม 80 → 80 ไม่ร่วง)
  assert.equal(r.rows[0].pct, 80);
  assert.equal(r.rows[0].prev4, 80);
  assert.equal(r.rows[0].verdict, "limited");
});

test("วันนี้–มะรืน: คิวจริงเข้ามาแล้วครึ่งหนึ่ง → ใช้ค่าที่ต่ำกว่าระหว่างคิวจริงกับค่าเฉลี่ยวันเดียวกัน", () => {
  // จอง 13:00–15:00 ของพรุ่งนี้ (อังคาร) เหลือ 6 ช่อง แม้ค่าเฉลี่ยวันอังคารจะว่าง 12
  const queues = [{ roomId: "r1", date: "2026-09-22", timeBlock: 156, durationBlocks: 24, procedureId: DIODE.id, status: "pending" }];
  const r = computeFreeProgramReadiness({ rooms: [bed("r1", "b1")], roomSchedules: [], queues, procedures, today });
  const f = r.rows[0].forecast[1];
  assert.equal(f.source, "actual");
  assert.equal(f.pct, 50);
  assert.equal(f.slots, 6);
});

test("ฐานดูเฉพาะจันทร์–ศุกร์: จองเต็มเสาร์–อาทิตย์ทุกสัปดาห์ต้องไม่กระทบ %", () => {
  const queues = [];
  for (let d = 0; d < 56; d++) {
    const date = new Date(2026, 6, 27 + d);
    const str = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    if (date.getDay() === 0 || date.getDay() === 6) queues.push(fullBooking("r1", str));
  }
  const r = computeFreeProgramReadiness({ rooms: [bed("r1", "b1")], roomSchedules: [], queues, procedures, today });
  assert.equal(r.rows[0].pct, 100);
});

test("จองครึ่งช่วงทุกวันธรรมดา → ว่าง 50% = ไม่ควรทำ และช่องว่างต่อวันนับเฉพาะที่ต่อเนื่องครบ 20 นาที", () => {
  const queues = [];
  for (let d = 0; d < 56; d++) {
    const date = new Date(2026, 6, 27 + d);
    const str = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    if (date.getDay() === 0 || date.getDay() === 6) continue;
    // จอง 13:00–15:00 (24 block) เหลือ 15:00–17:00 ว่างต่อเนื่อง 24 block = 6 ช่อง
    queues.push({ roomId: "r1", date: str, timeBlock: 156, durationBlocks: 24, procedureId: DIODE.id, status: "pending" });
  }
  const r = computeFreeProgramReadiness({ rooms: [bed("r1", "b1")], roomSchedules: [], queues, procedures, today });
  assert.equal(r.rows[0].pct, 50);
  assert.equal(r.rows[0].verdict, "stop");
  assert.equal(r.rows[0].avgSlots, 6);
});

test("คิวยกเลิก/ไม่มา/เลื่อนออก ไม่ครองเวลา และคิวนอกช่วง 13:00–17:00 ไม่นับ", () => {
  const queues = [
    { ...fullBooking("r1", "2026-09-18"), status: "cancelled" },
    { ...fullBooking("r1", "2026-09-17"), status: "no_show" },
    { ...fullBooking("r1", "2026-09-16"), status: "rescheduled" },
    // 11:00–13:00 นอกหน้าต่าง
    { roomId: "r1", date: "2026-09-15", timeBlock: 132, durationBlocks: 24, procedureId: DIODE.id, status: "pending" },
  ];
  const r = computeFreeProgramReadiness({ rooms: [bed("r1", "b1")], roomSchedules: [], queues, procedures, today });
  assert.equal(r.rows[0].pct, 100);
});

test("ด่านสองใช้คิวของวันนี้–มะรืนจริง: จองเต็ม 3 วันนี้ → พักก่อน ทั้งที่ประวัติเปิดได้", () => {
  const queues = [fullBooking("r1", "2026-09-21"), fullBooking("r1", "2026-09-22"), fullBooking("r1", "2026-09-23")];
  const r = computeFreeProgramReadiness({ rooms: [bed("r1", "b1")], roomSchedules: [], queues, procedures, today });
  assert.equal(r.rows[0].verdict, "open");
  assert.equal(r.rows[0].nowPct, 0);
  assert.equal(r.rows[0].verdictNow, "pause");
});

test("เตียงปิดทั้งวัน (room_schedules) ไม่นับเป็นความจุ", () => {
  const roomSchedules = [{ roomId: "r1", date: "", available: false, startBlock: null, endBlock: null, noteOnly: false }];
  const r = computeFreeProgramReadiness({ rooms: [bed("r1", "b1")], roomSchedules, queues: [], procedures, today });
  assert.equal(r.rows[0].pct, null);
  assert.equal(r.rows[0].verdict, "no-data");
});

test("แยกรายสาขา และรวมทุกเตียงของสาขาเข้าด้วยกัน", () => {
  const rooms = [bed("r1", "b1"), bed("r2", "b1"), bed("r3", "b2")];
  const r = computeFreeProgramReadiness({ rooms, roomSchedules: [], queues: [], procedures, today });
  const b1 = r.rows.find((x) => x.branchId === "b1");
  assert.equal(b1.beds, 2);
  assert.equal(b1.avgSlots, 24);
  assert.equal(b1.forecast[0].slots, 24);
  assert.equal(r.rows.find((x) => x.branchId === "b2").beds, 1);
});

// ── text guards ─────────────────────────────────────────────────────────
const page = readFileSync(new URL("../src/pages/CapacityPage.jsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");

test("การ์ดรอบฟรีอยู่บนสุดของหน้าคิวว่าง เป็นการ์ดเดียว ไม่มีตัวกรอง/ตารางละเอียดเพิ่ม (เจ้าของขอ 'แค่ภาพนี้')", () => {
  assert.match(page, /return \(\s*<>\s*\{readiness && \(\s*<FreeProgramWeekCard/);
  assert.ok(!page.includes('"treatment"'), "ห้ามกลับมามีตัวกรองประเภทห้อง 'treatment' อีก");
  assert.ok(!/function FreeProgramReadiness|<FreeProgramReadiness|แคปส่งทีม/.test(page), "ห้ามกลับมามีตารางละเอียด/ปุ่มเปิดเต็มจออีก");
});

test("เตียงทรีตเมนต์หาผ่านกติกาล็อกเตียงตัวเดียวกับหน้าลงคิว (roomsForProcedure) จากทุกห้องที่ผู้ใช้เห็น", () => {
  assert.match(page, /import \{ roomsForProcedure \} from "\.\.\/utils\/roomProcedures";/);
  assert.match(page, /roomsForProcedure\(roomProcedureIndex, rooms, treatmentProcedure\)/);
  assert.match(app, /<CapacityPage[\s\S]*?roomProcedureIndex=\{roomProcedureIndex\}[\s\S]*?\/>/);
  // ไม่มีหัตถการทรีตเมนต์ในระบบ → ไม่มีการ์ด
  assert.match(page, /if \(!treatmentProcedure\) return null;/);
});

test("การ์ดแบ่ง 4 กลุ่ม, stop กับ no-data รวมเป็น 'งดรอบฟรี', ตัดคำว่า Class นำหน้าชื่อ, มีคำเตือนห้ามเสาร์–อาทิตย์/หลัง 17:00", () => {
  for (const t of ["🟢 เปิดรอบฟรีได้", "🟡 เปิดจำกัด", "⏸️ พักรอบนี้", "🔴 งดรอบฟรี"]) assert.ok(page.includes(t), `missing ${t}`);
  assert.match(page, /r\.verdictNow === "stop" \|\| r\.verdictNow === "no-data"/);
  assert.match(page, /replace\(\/\^Class\\s\+\/i, ""\)/);
  assert.match(page, /ห้ามเสาร์–อาทิตย์ และหลัง 17:00/);
});

test("โควตา: เปิดได้ = ครึ่งของช่องว่าง, เปิดจำกัด = ไม่เกิน 5, อื่น ๆ ไม่เปิด", () => {
  assert.match(page, /if \(verdictNow === "open"\) return half;/);
  assert.match(page, /if \(verdictNow === "limited"\) return Math\.min\(5, half\);/);
});
