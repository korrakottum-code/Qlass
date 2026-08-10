// คำนวณ "คิวว่าง" (capacity): ความจุเปิดจริงของห้อง − คิวที่จองแล้ว
// โมดูลล้วน ไม่มี import — ทดสอบด้วย node ได้ตรง ๆ
//
// กติกาเวลาเปิดห้องต้องตรงกับ isRoomBlockClosed ใน helpers.js:
// - ปิดทั้งวัน:   !available && !noteOnly && startBlock == null
// - ปิดช่วงเวลา:  !available && !noteOnly && start..end
// - เปิดพิเศษ:    available && !noteOnly && start..end (เปิดได้นอกเวลาปกติ)
// - noteOnly = โน้ตอย่างเดียว ไม่กระทบความว่าง

// สถานะคิวที่ไม่ครองเวลาแล้ว — ต้องตรงกับ INACTIVE_QUEUE_STATUSES ใน helpers.js
const INACTIVE_STATUSES = ["cancelled", "no_show", "rescheduled"];

export const DAY_SEGMENTS = [
  { key: "morning", label: "เช้า (ก่อน 12:00)", from: 0, to: 144 },
  { key: "afternoon", label: "บ่าย (12:00-17:00)", from: 144, to: 204 },
  { key: "evening", label: "เย็น (17:00 เป็นต้นไป)", from: 204, to: 288 },
];

export function segmentOfBlock(block) {
  if (block < 144) return "morning";
  if (block < 204) return "afternoon";
  return "evening";
}

// รายการ block ที่ห้องเปิดจริงในวันนั้น
export function openBlocksForRoomDay(room, daySchedules) {
  const rules = (daySchedules || []).filter((s) => !s.noteOnly);
  const closedAllDay = rules.some(
    (s) => !s.available && (s.startBlock === null || s.startBlock === undefined)
  );
  if (closedAllDay) return [];

  const openBase = { from: room.openBlock ?? 132, to: room.closeBlock ?? 240 };
  const specialOpens = rules.filter(
    (s) => s.available && s.startBlock != null && s.endBlock != null
  );
  const closedRanges = rules.filter(
    (s) => !s.available && s.startBlock != null && s.endBlock != null
  );

  let min = openBase.from;
  let max = openBase.to;
  specialOpens.forEach((s) => {
    if (s.startBlock < min) min = s.startBlock;
    if (s.endBlock > max) max = s.endBlock;
  });

  const blocks = [];
  for (let b = min; b < max; b++) {
    const inBase = b >= openBase.from && b < openBase.to;
    const inSpecial = specialOpens.some((s) => b >= s.startBlock && b < s.endBlock);
    if (!inBase && !inSpecial) continue;
    const isClosed = closedRanges.some((s) => b >= s.startBlock && b < s.endBlock);
    if (isClosed) continue;
    blocks.push(b);
  }
  return blocks;
}

// ดัชนี: roomId -> รายการ schedule (แถวที่ date ว่าง = ใช้ทุกวัน)
export function buildScheduleIndex(roomSchedules) {
  const byRoom = {};
  (roomSchedules || []).forEach((s) => {
    if (!byRoom[s.roomId]) byRoom[s.roomId] = [];
    byRoom[s.roomId].push(s);
  });
  return byRoom;
}

function schedulesForRoomDay(scheduleIndex, roomId, date) {
  return (scheduleIndex[roomId] || []).filter((s) => s.date === date || !s.date);
}

export function listDates(startDate, dayCount) {
  const dates = [];
  const [y, m, d] = String(startDate).split("-").map(Number);
  const cur = new Date(y, m - 1, d);
  for (let i = 0; i < dayCount; i++) {
    dates.push(
      `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`
    );
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

export function daysUntilEndOfMonth(startDate) {
  const [y, m, d] = String(startDate).split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return lastDay - d + 1;
}

/**
 * สรุปความจุ/จอง/ว่าง ต่อวัน ต่อสาขา ต่อประเภทห้อง (M/T)
 * คืนค่า:
 * {
 *   days: [{ date, capacity, booked, free,
 *            byBranch: { [branchId]: { capacity, booked, free,
 *              byType: { M: {...}, T: {...} },
 *              bySegment: { morning: {capacity, free}, ... } } } }],
 *   totals: { capacity, booked, free,
 *             byType: { M: {capacity, booked, free}, T: {...} } }
 * }
 * หน่วยทั้งหมดเป็น block (1 block = 5 นาที) — แปลงเป็นชั่วโมงด้วย blocksToHours
 */
export function computeCapacitySummary({ rooms, roomSchedules, queues, procedures, dates }) {
  const scheduleIndex = buildScheduleIndex(roomSchedules);
  const procById = {};
  (procedures || []).forEach((p) => { procById[p.id] = p; });

  // คิว active ที่มีห้อง+เวลา จัดกลุ่มตาม roomId+date
  const queuesByRoomDay = {};
  (queues || []).forEach((q) => {
    if (!q.roomId || q.timeBlock === null || q.timeBlock === undefined) return;
    if (INACTIVE_STATUSES.includes(q.status || "pending")) return;
    const key = `${q.roomId}|${q.date}`;
    if (!queuesByRoomDay[key]) queuesByRoomDay[key] = [];
    queuesByRoomDay[key].push(q);
  });

  const emptyCell = () => ({ capacity: 0, booked: 0, free: 0 });
  const totals = { ...emptyCell(), byType: { M: emptyCell(), T: emptyCell() } };
  const days = [];

  for (const date of dates) {
    const day = { date, capacity: 0, booked: 0, free: 0, byBranch: {} };

    for (const room of rooms || []) {
      const open = openBlocksForRoomDay(room, schedulesForRoomDay(scheduleIndex, room.id, date));
      if (open.length === 0) continue;
      const openSet = new Set(open);

      // block ที่ถูกจอง (เฉพาะที่อยู่ในช่วงเปิดจริง กันนับเกิน/ติดลบ)
      const bookedSet = new Set();
      (queuesByRoomDay[`${room.id}|${date}`] || []).forEach((q) => {
        const dur = q.durationBlocks ?? procById[q.procedureId]?.blocks ?? 1;
        for (let i = 0; i < dur; i++) {
          const b = q.timeBlock + i;
          if (openSet.has(b)) bookedSet.add(b);
        }
      });

      const type = room.type === "M" ? "M" : "T";
      const branchId = room.branchId || "__none__";
      if (!day.byBranch[branchId]) {
        day.byBranch[branchId] = {
          ...emptyCell(),
          byType: { M: emptyCell(), T: emptyCell() },
          bySegment: {
            morning: { capacity: 0, free: 0 },
            afternoon: { capacity: 0, free: 0 },
            evening: { capacity: 0, free: 0 },
          },
        };
      }
      const cell = day.byBranch[branchId];

      const cap = open.length;
      const booked = bookedSet.size;
      const free = cap - booked;

      cell.capacity += cap; cell.booked += booked; cell.free += free;
      cell.byType[type].capacity += cap; cell.byType[type].booked += booked; cell.byType[type].free += free;
      open.forEach((b) => {
        const seg = cell.bySegment[segmentOfBlock(b)];
        seg.capacity += 1;
        if (!bookedSet.has(b)) seg.free += 1;
      });

      day.capacity += cap; day.booked += booked; day.free += free;
      totals.capacity += cap; totals.booked += booked; totals.free += free;
      totals.byType[type].capacity += cap; totals.byType[type].booked += booked; totals.byType[type].free += free;
    }

    days.push(day);
  }

  return { days, totals };
}

export function blocksToHours(blocks) {
  return Math.round((blocks * 5) / 60 * 10) / 10;
}

export function freePercent(cell) {
  if (!cell || cell.capacity === 0) return null;
  return Math.round((cell.free / cell.capacity) * 100);
}

/**
 * % ว่างเฉลี่ยของแต่ละสาขา ตลอดช่วงวันที่ที่ดูอยู่ (รวม capacity/free ทุกวันก่อนหารทีเดียว
 * ไม่ใช่เฉลี่ยของเปอร์เซ็นต์รายวัน — กันวันที่ห้องปิดทั้งวัน (capacity 0) ไปดึงค่าเฉลี่ยเพี้ยน)
 * คืนค่า Map<branchId, percentหรือnull>
 */
export function averageFreePercentByBranch(summary) {
  const totals = {};
  (summary.days || []).forEach((day) => {
    Object.entries(day.byBranch).forEach(([branchId, cell]) => {
      if (!totals[branchId]) totals[branchId] = { capacity: 0, free: 0 };
      totals[branchId].capacity += cell.capacity;
      totals[branchId].free += cell.free;
    });
  });
  const result = {};
  Object.entries(totals).forEach(([branchId, t]) => {
    result[branchId] = freePercent(t);
  });
  return result;
}
