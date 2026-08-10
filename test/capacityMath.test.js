import test from "node:test";
import assert from "node:assert/strict";
import {
  openBlocksForRoomDay,
  buildScheduleIndex,
  computeCapacitySummary,
  listDates,
  daysUntilEndOfMonth,
  blocksToHours,
  freePercent,
  segmentOfBlock,
  averageFreePercentByBranch,
} from "../src/utils/capacity.js";

// ห้องเปิด 11:00-20:00 (block 132-240) เหมือนค่า default ของระบบ
const roomM = { id: "rm", branchId: "b1", type: "M", openBlock: 132, closeBlock: 240 };
const roomT = { id: "rt", branchId: "b1", type: "T", openBlock: 132, closeBlock: 240 };

test("open blocks follow base hours, closures, and special opens like the Timeline does", () => {
  // ไม่มี schedule = เปิดตามเวลาปกติ 108 block (9 ชม.)
  assert.equal(openBlocksForRoomDay(roomM, []).length, 108);

  // ปิดทั้งวัน
  assert.equal(openBlocksForRoomDay(roomM, [{ available: false, noteOnly: false, startBlock: null, endBlock: null }]).length, 0);

  // โน้ตอย่างเดียว ไม่กระทบ
  assert.equal(openBlocksForRoomDay(roomM, [{ available: false, noteOnly: true, startBlock: null, endBlock: null }]).length, 108);

  // ปิดช่วง 12:00-13:00 (144-156) = หาย 12 block
  assert.equal(openBlocksForRoomDay(roomM, [{ available: false, noteOnly: false, startBlock: 144, endBlock: 156 }]).length, 96);

  // เปิดพิเศษ 09:00-11:00 (108-132) เพิ่ม 24 block นอกเวลาปกติ
  const blocks = openBlocksForRoomDay(roomM, [{ available: true, noteOnly: false, startBlock: 108, endBlock: 132 }]);
  assert.equal(blocks.length, 132);
  assert.ok(blocks.includes(108));
});

test("summary counts booked only inside open hours and skips inactive statuses", () => {
  const queues = [
    // Botox 3 block (15 นาที) จองจริง
    { roomId: "rm", date: "2026-08-15", timeBlock: 144, durationBlocks: 3, status: "confirmed" },
    // คิวยกเลิก ต้องไม่ครองเวลา
    { roomId: "rm", date: "2026-08-15", timeBlock: 150, durationBlocks: 6, status: "cancelled" },
    // คิวคร่อมเวลาปิดห้อง (จอง 19:30-20:30 แต่ห้องปิด 20:00) — นับเฉพาะส่วนที่อยู่ในเวลาเปิด
    { roomId: "rt", date: "2026-08-15", timeBlock: 234, durationBlocks: 12, status: "pending" },
    // คนละวัน ไม่เกี่ยว
    { roomId: "rm", date: "2026-08-16", timeBlock: 144, durationBlocks: 3, status: "pending" },
  ];
  const { days, totals } = computeCapacitySummary({
    rooms: [roomM, roomT],
    roomSchedules: [],
    queues,
    procedures: [],
    dates: ["2026-08-15"],
  });

  assert.equal(days.length, 1);
  const branch = days[0].byBranch.b1;
  assert.equal(branch.capacity, 216); // 2 ห้อง × 108
  assert.equal(branch.booked, 3 + 6); // Botox 3 + ส่วนในเวลาเปิดของคิวคร่อม 6
  assert.equal(branch.free, 216 - 9);
  assert.equal(branch.byType.M.booked, 3);
  assert.equal(branch.byType.T.booked, 6);
  assert.equal(totals.free, 216 - 9);
});

test("duration falls back to the procedure's blocks when the queue has none", () => {
  const { totals } = computeCapacitySummary({
    rooms: [roomM],
    roomSchedules: [],
    queues: [{ roomId: "rm", date: "2026-08-15", timeBlock: 144, durationBlocks: null, procedureId: "p1", status: "pending" }],
    procedures: [{ id: "p1", blocks: 4 }],
    dates: ["2026-08-15"],
  });
  assert.equal(totals.booked, 4);
});

test("segments split the day at 12:00 and 17:00", () => {
  assert.equal(segmentOfBlock(143), "morning");
  assert.equal(segmentOfBlock(144), "afternoon");
  assert.equal(segmentOfBlock(203), "afternoon");
  assert.equal(segmentOfBlock(204), "evening");

  const { days } = computeCapacitySummary({
    rooms: [roomM], roomSchedules: [], queues: [], procedures: [], dates: ["2026-08-15"],
  });
  const seg = days[0].byBranch.b1.bySegment;
  // เปิด 11:00-20:00: เช้า 11:00-12:00 = 12, บ่าย 12:00-17:00 = 60, เย็น 17:00-20:00 = 36
  assert.equal(seg.morning.capacity, 12);
  assert.equal(seg.afternoon.capacity, 60);
  assert.equal(seg.evening.capacity, 36);
});

test("date helpers cover ranges and month ends", () => {
  assert.deepEqual(listDates("2026-08-30", 3), ["2026-08-30", "2026-08-31", "2026-09-01"]);
  assert.equal(daysUntilEndOfMonth("2026-08-11"), 21);
  assert.equal(daysUntilEndOfMonth("2026-02-28"), 1);
  assert.equal(blocksToHours(108), 9);
  assert.equal(blocksToHours(3), 0.3);
  assert.equal(freePercent({ capacity: 200, free: 50 }), 25);
  assert.equal(freePercent({ capacity: 0, free: 0 }), null);
});

test("schedule index routes day-specific and everyday rules to the right room", () => {
  const index = buildScheduleIndex([
    { roomId: "rm", date: "2026-08-15", available: false, noteOnly: false, startBlock: null, endBlock: null },
    { roomId: "rt", date: "", available: false, noteOnly: false, startBlock: 144, endBlock: 156 },
  ]);
  const { days } = computeCapacitySummary({
    rooms: [roomM, roomT],
    roomSchedules: [
      { roomId: "rm", date: "2026-08-15", available: false, noteOnly: false, startBlock: null, endBlock: null },
      { roomId: "rt", date: "", available: false, noteOnly: false, startBlock: 144, endBlock: 156 },
    ],
    queues: [], procedures: [], dates: ["2026-08-15"],
  });
  assert.ok(index.rm.length === 1 && index.rt.length === 1);
  const branch = days[0].byBranch.b1;
  // rm ปิดทั้งวัน = 0, rt โดนหักช่วงเที่ยง = 96
  assert.equal(branch.capacity, 96);
  assert.equal(branch.byType.M.capacity, 0);
});

test("branch average pools capacity/free across days before dividing, not a mean of daily percents", () => {
  const roomB2 = { id: "rb2", branchId: "b2", type: "T", openBlock: 132, closeBlock: 240 };
  const { summary } = (() => {
    const s = computeCapacitySummary({
      rooms: [roomM, roomB2],
      roomSchedules: [
        // b2 ปิดทั้งวันที่สอง — ต้องไม่ถูกนับเป็น 0% ในค่าเฉลี่ย (capacity 0 = ไม่มีข้อมูล ไม่ใช่ "เต็ม")
        { roomId: "rb2", date: "2026-08-16", available: false, noteOnly: false, startBlock: null, endBlock: null },
      ],
      queues: [
        { roomId: "rm", date: "2026-08-15", timeBlock: 132, durationBlocks: 108, status: "confirmed" }, // b1 เต็มวันแรก
      ],
      procedures: [],
      dates: ["2026-08-15", "2026-08-16"],
    });
    return { summary: s };
  })();

  const avg = averageFreePercentByBranch(summary);
  // b1: วันแรกจองเต็ม (free 0/108), วันสองว่างเต็ม (free 108/108) → รวม 108/216 = 50%
  assert.equal(avg.b1, 50);
  // b2: วันแรกว่างเต็ม 108/108, วันสองปิด (capacity 0 ไม่นับ) → รวม 108/108 = 100%
  assert.equal(avg.b2, 100);
});
