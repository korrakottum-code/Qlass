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
  paceThresholds,
  paceLabelKind,
  computeNetworkPaceBaseline,
  computeWeeklyPace,
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

// ═══ Pace ("เทียบกับปกติ") — เลขทุกตัวตรวจซ้ำด้วยมือแล้วในสเปก (scratchpad/pace-feature-spec.md
// ผ่านรีวิว nak-song-sai 5 รอบ) ก่อนเขียน test ชุดนี้ ===

test("pace thresholds shift exactly 5 points per day, matching the reviewed spec table", () => {
  const expected = [
    [0, 90, 60], [1, 85, 55], [2, 80, 50], [3, 75, 45], [4, 70, 40], [5, 65, 35], [6, 60, 30],
  ];
  for (const [d, yellow, red] of expected) {
    assert.deepEqual(paceThresholds(d), { yellow, red }, `day ${d}`);
  }
});

test("pace thresholds clamp is inert within 0-6 days (documented in spec) but engages further out", () => {
  // ทดสอบว่า clamp ยังทำงานถูกถ้าขยายช่วงในอนาคต แม้ตอนนี้ไม่ได้ใช้จริงในหน้าเว็บ (0-6 วัน)
  assert.deepEqual(paceThresholds(8), { yellow: 55, red: 25 }); // natural 50/20 ถูก clamp ขึ้น
  assert.deepEqual(paceThresholds(20), { yellow: 55, red: 25 });
});

test("pace label kind follows the check order: no-data first, then high, then green/yellow/red", () => {
  assert.equal(paceLabelKind(null, 3), "no-data");
  assert.equal(paceLabelKind(undefined, 0), "no-data");
  assert.equal(paceLabelKind(250, 6), "high"); // สูงผิดปกติ ชนะทุกเกณฑ์อื่น แม้วันไกลๆ ก็ตาม
  assert.equal(paceLabelKind(200, 0), "high"); // ขอบเขต ≥200% นับเป็น high

  assert.equal(paceLabelKind(100, 0), "green");
  assert.equal(paceLabelKind(59, 0), "red"); // <60 (เกณฑ์แดงวันนี้)
  assert.equal(paceLabelKind(60, 0), "yellow"); // =60 ยังไม่ถึงเขียว (90) แต่พ้นแดงแล้ว
});

test("the exact case that broke rev.1: same Pace, adjacent day, must not flip to a worse label", () => {
  // 56% ที่ห่าง 3 วัน vs 4 วัน ต้องได้ป้ายเดียวกัน (🟡 ทั้งคู่) — นี่คือบั๊กที่รีวิวรอบ 1 จับได้
  assert.equal(paceLabelKind(56, 3), "yellow");
  assert.equal(paceLabelKind(56, 4), "yellow");
});

test("the arithmetic error caught in review round 2: 35% at 6 days away is yellow, not red", () => {
  // red(6) = 30; 35 >= 30 จึงยังไม่ถึงแดง — ฉบับร่างแรกเขียนป้ายผิดเป็นแดง ตรวจซ้ำแล้วแก้เป็นเหลือง
  assert.equal(paceLabelKind(35, 6), "yellow");
});

test("label direction is monotonic: farther away can only stay same or improve for a fixed Pace", () => {
  const rank = { red: 0, yellow: 1, green: 2 };
  for (let pace = 0; pace <= 100; pace += 1) {
    let prev = null;
    for (let d = 0; d <= 6; d++) {
      const kind = paceLabelKind(pace, d);
      if (kind === "no-data" || kind === "high") continue;
      if (prev !== null) assert.ok(rank[kind] >= rank[prev], `pace=${pace} regressed at day ${d}`);
      prev = kind;
    }
  }
});

test("computeWeeklyPace: no historical data anywhere returns no-data for every day, never crashes/divides by zero", () => {
  const branches = [{ id: "b1", name: "b1", createdAt: "2020-01-01" }];
  const result = computeWeeklyPace({ queues: [], branches, today: "2026-08-11" });
  assert.equal(result.length, 7);
  result.forEach((row) => {
    assert.equal(row.kind, "no-data");
    assert.equal(row.pace, null);
  });
});

test("computeWeeklyPace: reproduces the reviewed real-data scenario by hand (small fixture)", () => {
  // จำลองสถานการณ์แบบย่อ: 1 สาขา, ย้อนหลัง 8 สัปดาห์ทุกวันอังคาร (dow=2) มีคิวจองเข้ามาแล้ว 10 คิว
  // ก่อนวันนัด (lead>=0) เสมอ — วันนี้ (อังคาร 11 ส.ค. 2569) มีคิวเข้ามาแล้ว 10 คิวพอดี = ปกติ 100%
  // 4 ส.ค. 2569 คืออังคารล่าสุดก่อนวันนี้ — ถอยหลังทีละ 7 วัน 8 ครั้ง ให้ครบทุกอังคารในช่วง
  // lookback 56 วัน (16 มิ.ย. - 10 ส.ค.) พอดี ไม่ตกหล่นหรือเกินขอบเขต
  const branches = [{ id: "b1", name: "b1", createdAt: "2020-01-01" }];
  const queues = [];
  for (let w = 0; w <= 7; w++) {
    const tue = new Date(2026, 7, 4 - w * 7);
    const y = tue.getFullYear(), m = String(tue.getMonth() + 1).padStart(2, "0"), d = String(tue.getDate()).padStart(2, "0");
    const dateStr = `${y}-${m}-${d}`;
    for (let i = 0; i < 10; i++) {
      queues.push({ id: `hist_${w}_${i}`, date: dateStr, createdAt: `${dateStr}T09:00:00Z`, status: "pending", branchId: "b1" });
    }
  }
  // วันนี้ (11 ส.ค. 2569 = อังคาร) มีคิวเข้ามาแล้ว 10 คิวพอดี ตอนนี้ (lead=0 เทียบกับ baseline lead=0 เฉลี่ย 10)
  for (let i = 0; i < 10; i++) {
    queues.push({ id: `today_${i}`, date: "2026-08-11", createdAt: "2026-08-11T09:00:00Z", status: "pending", branchId: "b1" });
  }

  const result = computeWeeklyPace({ queues, branches, today: "2026-08-11" });
  const todayRow = result[0];
  assert.equal(todayRow.date, "2026-08-11");
  assert.equal(todayRow.leadDays, 0);
  assert.equal(todayRow.bookedSoFar, 10);
  assert.equal(todayRow.baselinePerBranch, 10);
  assert.equal(todayRow.pace, 100);
  assert.equal(todayRow.kind, "green");
});

test("computeNetworkPaceBaseline excludes today itself (still filling, not settled)", () => {
  const branches = [{ id: "b1", name: "b1", createdAt: "2020-01-01" }];
  // ยัดคิวจำนวนมหาศาลไว้ที่ "วันนี้" เท่านั้น — ถ้าโค้ดพลาดไปนับวันนี้เป็นข้อมูลย้อนหลัง
  // baseline ของอังคารจะเพี้ยนขึ้นสูงลิ่วจาก 500 คิวนี้ทันที
  const queues = Array.from({ length: 500 }, (_, i) => ({
    id: `q${i}`, date: "2026-08-11", createdAt: "2026-08-11T09:00:00Z", status: "pending", branchId: "b1",
  }));
  const baseline = computeNetworkPaceBaseline({ queues, branches, today: "2026-08-11" });
  // มีวันอังคาร 8 วันในช่วง lookback แต่ไม่มีคิวสักใบเดียวตกอยู่ในช่วงนั้น (ทุกคิวอยู่ที่ "วันนี้"
  // ซึ่งถูกตัดออกจากช่วง) — baseline ต้องเป็น 0 (คำนวณได้จริงจาก 8 วันที่ไม่มีคิวเลย) ไม่ใช่เลข
  // ที่ปนเปื้อนจาก 500 คิวที่ยัดไว้ที่วันนี้
  assert.equal(baseline[2]?.[0], 0);
});

test("computeWeeklyPace: brand-new branch with zero eligible historical dates → no-data, not a crash", () => {
  // สาขาเพิ่งเปิดวันนี้พอดี — ทุกวันในช่วง lookback ย้อนหลัง ยังไม่มีสาขานี้อยู่เลย (activeBranches=0
  // ทุกวัน) จึงไม่มี baseline ให้เทียบเลยสักจังหวะ ต้องได้ "no-data" ทุกวัน ไม่ใช่ NaN/Infinity
  const branches = [{ id: "new1", name: "new1", createdAt: "2026-08-11T00:00:00Z" }];
  const queues = [{ id: "q1", date: "2026-08-11", createdAt: "2026-08-11T09:00:00Z", status: "pending", branchId: "new1" }];
  const result = computeWeeklyPace({ queues, branches, today: "2026-08-11" });
  result.forEach((row) => {
    assert.equal(row.kind, "no-data");
    assert.equal(row.pace, null);
    assert.ok(!Number.isNaN(row.bookedPerBranch) || row.bookedPerBranch === null);
  });
});
