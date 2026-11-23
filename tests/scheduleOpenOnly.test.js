import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildOpenOnlyRows, planOpenOnly, summarizeOpenOnlyPlan, findQueuesOutsideOpenWindow, describeOpenOnlyBed,
} from "../src/utils/scheduleOpenOnly.js";
import { openBlocksForRoomDay } from "../src/utils/capacity.js";

const room = { id: "m1", openBlock: 132, closeBlock: 240 }; // 11:00–20:00
const D = "2026-12-01";

// กติกาเดียวกับ create_queue_v1 / booking_api_room_status_v1 (SQL) และ helpers.isRoomBlockClosed:
// ปิดทั้งวัน → ปิด; บล็อกเปิดถ้าอยู่ในเวลาปกติ หรือในแถวเปิดต่อเวลา; แต่ถ้าอยู่ในแถวปิดช่วง → ปิด (ปิดชนะ)
function serverOpen(schedules, b) {
  if (schedules.some((s) => !s.available && s.startBlock == null)) return false;
  const inNormal = b >= room.openBlock && b < room.closeBlock;
  const inOpen = schedules.some((s) => s.available && s.startBlock != null && b >= s.startBlock && b < s.endBlock);
  const inClose = schedules.some((s) => !s.available && s.startBlock != null && b >= s.startBlock && b < s.endBlock);
  return (inNormal || inOpen) && !inClose;
}

/** บล็อกที่เปิดจริง — หน้าคิวว่าง (capacity.js) ต้องเห็นตรงกับด่านฝั่งเซิร์ฟเวอร์เสมอ */
function openSet(rows) {
  const schedules = rows.map((r, i) => ({ id: `n${i}`, roomId: room.id, date: D, source: null, ...r }));
  const fromCapacity = [...openBlocksForRoomDay(room, schedules)].sort((a, b) => a - b);
  const fromServer = range(0, 288).filter((b) => serverOpen(schedules, b));
  assert.deepEqual(fromCapacity, fromServer, "หน้าคิวว่างกับด่านเซิร์ฟเวอร์ต้องเห็นตรงกัน");
  return fromServer;
}
const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);

test("หมออยู่ช่วงกลาง 13:00–18:00 → ปิดหน้า + ปิดหลัง แค่ 2 แถว ไม่ต่อเวลา", () => {
  const rows = buildOpenOnlyRows({ room, startBlock: 156, endBlock: 216, note: "หมอ A" });
  assert.deepEqual(rows, [
    { available: false, startBlock: 132, endBlock: 156, noteOnly: false, note: "หมอ A" },
    { available: false, startBlock: 216, endBlock: 240, noteOnly: false, note: "หมอ A" },
  ]);
  assert.deepEqual(openSet(rows), range(156, 216));
});

test("เปิดเฉพาะช่วงที่เลยเวลาปกติ 15:00–22:00 → ปิดเช้า + ต่อเวลาถึง 22:00", () => {
  const rows = buildOpenOnlyRows({ room, startBlock: 180, endBlock: 264 });
  assert.equal(rows.length, 2);
  assert.deepEqual(openSet(rows), range(180, 264));
});

test("เลือกเท่าเวลาปกติ → ไม่ต้องสร้างแถวเลย เปิดตามปกติ", () => {
  assert.deepEqual(buildOpenOnlyRows({ room, startBlock: 132, endBlock: 240 }), []);
});

test("เปิดเช้ากว่าปกติ 09:00–20:00 → ต่อเวลาอย่างเดียว", () => {
  const rows = buildOpenOnlyRows({ room, startBlock: 108, endBlock: 240 });
  assert.deepEqual(rows, [{ available: true, startBlock: 108, endBlock: 240, noteOnly: false, note: "เปิดเฉพาะ 09:00–20:00" }]);
  assert.deepEqual(openSet(rows), range(108, 240));
});

test("ช่วงอยู่นอกเวลาปกติทั้งก้อน 20:00–22:00 → ปิด 11–20 อันเดียว + เปิด 20–22", () => {
  const rows = buildOpenOnlyRows({ room, startBlock: 240, endBlock: 264 });
  assert.deepEqual(rows.map((r) => [r.available, r.startBlock, r.endBlock]), [[false, 132, 240], [true, 240, 264]]);
  assert.deepEqual(openSet(rows), range(240, 264));
});

test("แทนที่ของเดิม: ช่วงปิด/เปิดที่กรอกเองถูกลบทั้งหมด โน้ตไม่ถูกแตะ", () => {
  const schedules = [
    { id: "c1", roomId: "m1", date: D, available: false, startBlock: 132, endBlock: 204, noteOnly: false, source: null },
    { id: "c2", roomId: "m1", date: D, available: false, startBlock: 132, endBlock: 204, noteOnly: false, source: null }, // ซ้ำ
    { id: "o1", roomId: "m1", date: D, available: true, startBlock: 156, endBlock: 216, noteOnly: false, source: null }, // เวลาหมอเก่า ไม่มีผล
    { id: "n1", roomId: "m1", date: D, available: true, startBlock: null, endBlock: null, noteOnly: true, source: null },
    { id: "x1", roomId: "m1", date: "2026-12-02", available: false, startBlock: 132, endBlock: 204, noteOnly: false, source: null },
    { id: "y1", roomId: "m2", date: D, available: false, startBlock: 132, endBlock: 204, noteOnly: false, source: null },
  ];
  const plan = planOpenOnly({ rooms: [room], roomSchedules: schedules, roomIds: ["m1"], dates: [D], startBlock: 180, endBlock: 240 });
  assert.equal(plan.beds.length, 1);
  assert.equal(plan.beds[0].blocked, null);
  assert.deepEqual(plan.beds[0].remove.map((s) => s.id), ["c1", "c2", "o1"]);
  assert.deepEqual(plan.beds[0].create, [{ available: false, startBlock: 132, endBlock: 180, noteOnly: false, note: "เปิดเฉพาะ 15:00–20:00", roomId: "m1", date: D }]);
  // หลังทำตามแผน: เหลือโน้ต + แถวใหม่ → เปิด 15:00–20:00 เท่านั้น
  const after = schedules.filter((s) => !plan.beds[0].remove.includes(s) && s.roomId === "m1" && s.date === D)
    .concat(plan.beds[0].create);
  assert.deepEqual(openSet(after), range(180, 240));
  const sum = summarizeOpenOnlyPlan(plan);
  assert.equal(sum.removeCount, 3);
  assert.equal(sum.createCount, 1);
});

test("ไม่แตะปุ่มปิดเตียง (พนักงานหยุด) และปิดทั้งวัน — เตียงนั้นข้าม ไม่สร้าง ไม่ลบ", () => {
  const schedules = [
    { id: "b1", roomId: "m1", date: D, available: false, startBlock: null, endBlock: null, noteOnly: false, source: "bed_switch" },
    { id: "c1", roomId: "m1", date: D, available: false, startBlock: 132, endBlock: 204, noteOnly: false, source: null },
    { id: "w1", roomId: "m2", date: D, available: false, startBlock: null, endBlock: null, noteOnly: false, source: null },
    { id: "r1", roomId: "m3", date: D, available: false, startBlock: 150, endBlock: 170, noteOnly: false, source: "bed_switch" },
  ];
  const rooms = [room, { id: "m2", openBlock: 132, closeBlock: 240 }, { id: "m3", openBlock: 132, closeBlock: 240 }];
  const plan = planOpenOnly({ rooms, roomSchedules: schedules, roomIds: ["m1", "m2", "m3"], dates: [D], startBlock: 156, endBlock: 216 });
  for (const bed of plan.beds) {
    assert.ok(bed.blocked, `${bed.roomId} ต้องถูกข้าม`);
    assert.deepEqual(bed.create, []);
    assert.deepEqual(bed.remove, []);
  }
  assert.match(plan.beds[0].blocked, /พนักงานหยุด/);
});

test("ช่วงปิดจากปุ่มปิดเตียงที่ไม่ทับช่วงเปิด → ไม่ขวาง และไม่ถูกลบ", () => {
  const schedules = [
    { id: "r1", roomId: "m1", date: D, available: false, startBlock: 132, endBlock: 140, noteOnly: false, source: "bed_switch" },
  ];
  const plan = planOpenOnly({ rooms: [room], roomSchedules: schedules, roomIds: ["m1"], dates: [D], startBlock: 156, endBlock: 216 });
  assert.equal(plan.beds[0].blocked, null);
  assert.deepEqual(plan.beds[0].remove, []);
});

test("ช่วงกลับด้าน/ว่าง → ไม่มีแผน", () => {
  assert.deepEqual(planOpenOnly({ rooms: [room], roomSchedules: [], roomIds: ["m1"], dates: [D], startBlock: 200, endBlock: 200 }).beds, []);
});

test("เตือนคิวที่จะตกไปอยู่นอกช่วงเปิด (บางส่วนก็นับ) เฉพาะเตียงที่ไม่ถูกข้าม", () => {
  const plan = { beds: [{ roomId: "m1", date: D, create: [], remove: [], blocked: null }, { roomId: "m2", date: D, blocked: "x", create: [], remove: [] }] };
  const queues = [
    { id: "a", roomId: "m1", date: D, timeBlock: 140, durationBlocks: 6, status: "pending" },  // ก่อนเปิด
    { id: "b", roomId: "m1", date: D, timeBlock: 160, durationBlocks: 6, status: "pending" },  // ในช่วง
    { id: "c", roomId: "m1", date: D, timeBlock: 212, durationBlocks: 6, status: "pending" },  // ล้นออกไป
    { id: "d", roomId: "m1", date: D, timeBlock: 140, durationBlocks: 6, status: "cancelled" },
    { id: "e", roomId: "m2", date: D, timeBlock: 140, durationBlocks: 6, status: "pending" },  // เตียงที่ข้าม
    { id: "f", roomId: "m1", date: D, timeBlock: null, status: "pending" },
  ];
  const hit = findQueuesOutsideOpenWindow({ plan, queues, procedures: [], startBlock: 156, endBlock: 216, isActiveQueueStatus: (s) => s !== "cancelled" });
  assert.deepEqual(hit.map((q) => q.id), ["a", "c"]);
});

test("ไม่มี migration / ไม่มีกติกาใหม่ฝั่งเซิร์ฟเวอร์: แถวที่สร้างเป็นรูปเดิมที่ create_queue_v1 อ่านอยู่แล้ว", () => {
  const src = readFileSync(new URL("../src/utils/scheduleOpenOnly.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /source:\s*["']/, "ห้ามตั้ง source ใหม่ — DB มี CHECK ให้แค่ null/bed_switch");
});

test("แก้แถว \"ปิดทั้งวัน\" ที่กรอกเองแล้วเปลี่ยนเป็นเปิดเฉพาะช่วง → แทนที่แถวนั้นได้ (ไม่ถูกข้าม)", () => {
  const schedules = [
    { id: "w1", roomId: "m1", date: D, available: false, startBlock: null, endBlock: null, noteOnly: false, source: null },
  ];
  const plan = planOpenOnly({ rooms: [room], roomSchedules: schedules, roomIds: ["m1"], dates: [D], startBlock: 156, endBlock: 216, editingId: "w1" });
  assert.equal(plan.beds[0].blocked, null);
  assert.deepEqual(plan.beds[0].remove.map((s) => s.id), ["w1"]);
  // แต่ถ้าแถวปิดทั้งวันมาจากปุ่มปิดเตียง แม้ id ตรงก็ไม่แตะ
  const bs = [{ ...schedules[0], source: "bed_switch" }];
  assert.ok(planOpenOnly({ rooms: [room], roomSchedules: bs, roomIds: ["m1"], dates: [D], startBlock: 156, endBlock: 216, editingId: "w1" }).beds[0].blocked);
});

test("มีแถวใช้ทุกวัน (ไม่มีวันที่) ที่เป็นช่วงเวลา → ข้าม พร้อมเหตุผลที่ถูก", () => {
  const schedules = [{ id: "e1", roomId: "m1", date: "", available: true, startBlock: 240, endBlock: 264, noteOnly: false, source: null }];
  const plan = planOpenOnly({ rooms: [room], roomSchedules: schedules, roomIds: ["m1"], dates: [D], startBlock: 156, endBlock: 216 });
  assert.match(plan.beds[0].blocked, /ทุกวัน/);
});

test("ข้อความผลต่อเตียง", () => {
  const bed = { create: buildOpenOnlyRows({ room, startBlock: 156, endBlock: 264 }) };
  assert.equal(describeOpenOnlyBed(bed), "ปิด 11:00–13:00 · ต่อเวลา 13:00–22:00");
  assert.equal(describeOpenOnlyBed({ create: [] }), "เปิดตามเวลาปกติ");
});

test("ปุ่มเดิม ⛔ / ✅ / 📝 ใน ScheduleModal ไม่ถูกเปลี่ยนความหมาย: เปิดเฉพาะช่วงเป็นปุ่มแยก ไม่เป็นค่าเริ่มต้น", () => {
  const src = readFileSync(new URL("../src/components/modals/ScheduleModal.jsx", import.meta.url), "utf8");
  assert.match(src, /const \[openOnly, setOpenOnly\] = useState\(false\)/);
  assert.match(src, /✅ เปิด \(กำหนดช่วงเวลา\)/);
  assert.match(src, /🕐 เปิดเฉพาะช่วงเวลา/);
});

test("App: ลบแถวเปิดต่อเวลาเดิมก่อนสร้าง แล้วค่อยลบแถวปิดเดิม (ล้มกลางทาง = เปิดน้อยกว่า ไม่เปิดเกิน)", () => {
  const src = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const i = src.indexOf("const applyOpenOnlySchedule");
  const body = src.slice(i, src.indexOf("}, [showToast]);", i));
  const a = body.indexOf("for (const old of oldOpens)");
  const b = body.indexOf("for (const row of bed.create)");
  const c = body.indexOf("for (const old of oldCloses)");
  assert.ok(a > 0 && a < b && b < c);
});
