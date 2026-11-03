import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { capacityRangeDates, computeCapacitySummary } from "../src/utils/capacity.js";

test("7 วันที่ผ่านมา = เมื่อวานย้อนไป 7 วัน ไม่รวมวันนี้", () => {
  assert.deepEqual(capacityRangeDates("past7", "2026-11-03"), [
    "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02",
  ]);
  // ข้ามปี
  const jan = capacityRangeDates("past7", "2027-01-02");
  assert.equal(jan[0], "2026-12-26");
  assert.equal(jan[6], "2027-01-01");
});

test("ช่วงเดิม 7 วันข้างหน้า / ถึงสิ้นเดือน ได้วันที่เหมือนเดิม", () => {
  const n = capacityRangeDates("7d", "2026-11-03");
  assert.equal(n.length, 7);
  assert.equal(n[0], "2026-11-03");
  assert.equal(n[6], "2026-11-09");
  const e = capacityRangeDates("eom", "2026-11-03");
  assert.equal(e[0], "2026-11-03");
  assert.equal(e[e.length - 1], "2026-11-30");
  assert.equal(e.length, 28);
});

test("โหมดปกติ (วันข้างหน้า): คิวไม่มา/ยกเลิก นับเป็นว่างเหมือนเดิม", () => {
  const room = { id: "r1", branchId: "b1", type: "M", openBlock: 132, closeBlock: 240 };
  const day = "2026-11-01";
  const q = (status, timeBlock) => ({ id: status + timeBlock, roomId: "r1", branchId: "b1", date: day, timeBlock, durationBlocks: 12, status });
  const s = computeCapacitySummary({
    rooms: [room], roomSchedules: [], procedures: [], dates: [day],
    queues: [q("done", 132), q("no_show", 144), q("cancelled", 156)],
  });
  assert.equal(s.totals.capacity, 108);
  assert.equal(s.totals.booked, 12);
  assert.equal(s.totals.free, 96);
});

test("หน้าคิวว่างมีปุ่ม 7 วันที่ผ่านมา และซ่อนคำแนะนำทำโปรตอนดูย้อนหลัง", () => {
  const page = readFileSync(new URL("../src/pages/CapacityPage.jsx", import.meta.url), "utf8");
  assert.match(page, /\["past7", "7 วันที่ผ่านมา"\]/);
  assert.match(page, /capacityRangeDates\(range, today\)/);
  assert.match(page, /typeFilter === "all" && !isPast && \(/);
});

test("ย้อนหลัง: นับตามที่จองเดิม — ไม่มา/ยกเลิกเป็นช่องที่ถูกจอง แยกยอดไว้ เลื่อนออกไม่นับ", () => {
  const room = { id: "r1", branchId: "b1", type: "M", openBlock: 132, closeBlock: 240 };
  const day = "2026-11-01";
  const q = (status, timeBlock, dur = 12) => ({ id: status + timeBlock, roomId: "r1", branchId: "b1", date: day, timeBlock, durationBlocks: dur, status });
  const s = computeCapacitySummary({
    rooms: [room], roomSchedules: [], procedures: [], dates: [day], countOriginalBookings: true,
    queues: [
      q("done", 132), q("no_show", 144), q("cancelled", 156), q("rescheduled", 168),
      q("done", 180), q("cancelled", 180), // ยกเลิกแล้วมีคนจองแทนช่องเดิม — ไม่นับซ้ำ
      q("no_show", 192, 6), q("cancelled", 192, 12), // ทับกัน — ส่วนที่ทับนับเป็นไม่มา
    ],
  });
  assert.equal(s.totals.capacity, 108);
  assert.equal(s.totals.noShow, 12 + 6);
  assert.equal(s.totals.cancelled, 12 + 6);
  assert.equal(s.totals.booked, 12 + 12 + 12 + 12 + 6 + 6); // done×2, ไม่มา, ยกเลิก, ไม่มา(ทับ), ยกเลิกส่วนที่เหลือ
  assert.equal(s.totals.free, 108 - s.totals.booked);
  const cell = s.days[0].byBranch.b1;
  assert.equal(cell.noShow, 18);
  assert.equal(cell.cancelled, 18);
  assert.equal(cell.byType.M.booked, s.totals.booked);
});

test("หน้าคิวว่างส่ง countOriginalBookings เฉพาะตอนดูย้อนหลัง", () => {
  const page = readFileSync(new URL("../src/pages/CapacityPage.jsx", import.meta.url), "utf8");
  assert.match(page, /countOriginalBookings: isPast/);
  assert.match(page, /const isPast = range === "past7";/);
});
