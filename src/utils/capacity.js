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

// ═══════════════════════════════════════════════════════════════════════
// "เทียบกับปกติ" (Pace) — สเปกผ่านนักสส 5 รอบแล้ว (ดู scratchpad/pace-feature-spec.md
// ตอนพัฒนา) สรุปกติกา:
//
// ลูกค้าส่วนใหญ่จองล่วงหน้าแค่ 0-2 วัน ก่อนวันนัด (ยืนยันจากข้อมูลจริง ~55-60%) ดังนั้นเทียบ
// "คิวที่จองแล้วตอนนี้" กับ "ยอดสุดท้าย" ไม่ได้ — ต้องเทียบแบบจังหวะต่อจังหวะ: ณ ตอนนี้ห่างจาก
// วันนัดกี่วัน แล้วเทียบกับค่าเฉลี่ยในอดีตที่เคยมีคิวจองแล้วเท่าไหร่ตอนอยู่ในจังหวะเดียวกัน
// (คำนวณต่อสาขาที่เปิดอยู่จริงในแต่ละวัน กันสาขาใหม่ที่ทยอยเปิดมาดันค่าเฉลี่ยเพี้ยน)
//
// เกณฑ์เขียว/เหลือง/แดงขยับทีละ 5 แต้มต่อวันที่ห่างจากวันนัด (ไม่ใช้ตารางเกณฑ์แยกเป็นช่วงๆ
// เพราะจะเกิดรอยต่อกระโดด — พิสูจน์แล้วว่าเกณฑ์ต่อเนื่องแบบนี้ทำให้ป้ายเปลี่ยนได้แค่ทิศทางเดียว
// เสมอ (ยิ่งไกลวันนัด ป้ายดีขึ้นหรือเท่าเดิม ไม่มีทางแย่ลง) ต่างจากตารางเกณฑ์แยกช่วงที่กระโดด
// ได้ทั้งสองทิศทางแบบสุ่ม)

export const PACE_LOOKBACK_WEEKS = 8;
export const PACE_HIGH_THRESHOLD = 200;

// วันที่จาก timestamp ใดๆ (ISO string หรือ Date) → "YYYY-MM-DD" ตามเวลาเครื่อง
// (ไม่ใช้ .slice(0,10) ตรงๆ กับ ISO timestamp เพราะจะได้วันที่ตาม UTC ไม่ใช่เวลาไทย)
function toDateStr(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return String(value).slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysBetweenDateStr(fromStr, toStr) {
  const [fy, fm, fd] = fromStr.split("-").map(Number);
  const [ty, tm, td] = toStr.split("-").map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.round((to - from) / 86400000);
}

function dowOfDateStr(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

// เกณฑ์เขียว/เหลือง ณ วันที่ห่างจากวันนัด `daysAway` วัน — ขยับ 5 แต้ม/วัน มีขั้นต่ำ/ขั้นสูงกันเผื่อ
// ขยายช่วงแสดงผลไกลกว่า 7 วันในอนาคต (ไม่ได้ทำงานจริงในช่วง 0-6 วันปัจจุบัน — เช็คแล้ว)
export function paceThresholds(daysAway) {
  const yellow = Math.min(90, Math.max(55, 90 - daysAway * 5));
  const red = Math.min(60, Math.max(25, 60 - daysAway * 5));
  return { yellow, red };
}

// ลำดับการเช็ค (ตามสเปก): ไม่มีข้อมูลเทียบก่อนเสมอ (กันหารด้วยศูนย์) → สูงผิดปกติ → เขียว/เหลือง/แดง
export function paceLabelKind(pace, daysAway) {
  if (pace === null || pace === undefined) return "no-data";
  if (pace >= PACE_HIGH_THRESHOLD) return "high";
  const { yellow, red } = paceThresholds(daysAway);
  if (pace >= yellow) return "green";
  if (pace >= red) return "yellow";
  return "red";
}

// จำนวนสาขาที่ "เปิดอยู่จริง" ณ วันที่ dateStr (createdAt <= dateStr) — สาขาที่ไม่มี createdAt
// (ข้อมูลเก่าก่อนมีฟิลด์นี้) ถือว่าเปิดมานานแล้ว นับรวมเสมอ
function activeBranchCount(branches, dateStr) {
  return (branches || []).filter((b) => !b.createdAt || toDateStr(b.createdAt) <= dateStr).length;
}

/**
 * ค่าเฉลี่ยในอดีต (baseline) ต่อสาขา แยกตาม [วันในสัปดาห์][ห่างจากวันนัดกี่วัน]
 * ใช้ข้อมูล "วันที่จบไปแล้ว" ย้อนหลัง PACE_LOOKBACK_WEEKS สัปดาห์ (ไม่รวมวันนี้ เพราะวันนี้ยังจอง
 * ไม่จบ) คืนค่า object: { [dow]: { [leadDays]: เฉลี่ยคิวต่อสาขา หรือ null ถ้าไม่มีข้อมูลเลย } }
 */
export function computeNetworkPaceBaseline({ queues, branches, today, lookbackWeeks = PACE_LOOKBACK_WEEKS }) {
  const lookbackDays = lookbackWeeks * 7;
  const startStr = toDateStr(new Date(new Date(today).getTime() - lookbackDays * 86400000));
  const endStr = toDateStr(new Date(new Date(today).getTime() - 86400000)); // เมื่อวาน — วันสุดท้ายที่ "จบแล้ว"

  // จัดกลุ่มคิว active ในช่วงย้อนหลัง ตามวันนัด (date) — เก็บแค่ lead ของแต่ละคิว (date - createdAt)
  const leadsByDate = {};
  (queues || []).forEach((q) => {
    if (!q.date || q.date < startStr || q.date > endStr) return;
    if (INACTIVE_STATUSES.includes(q.status || "pending")) return;
    const createdStr = toDateStr(q.createdAt) || q.date;
    const lead = daysBetweenDateStr(createdStr, q.date);
    if (lead < 0) return; // กันข้อมูลเพี้ยน (จองหลังวันนัด) ไม่ให้ปนสูตร
    if (!leadsByDate[q.date]) leadsByDate[q.date] = [];
    leadsByDate[q.date].push(lead);
  });

  // สะสมผลรวมต่อ [dow][leadDays] จากทุกวันที่จบแล้วในช่วงย้อนหลัง
  // (ใช้ listDates เดิม — บวกวันแบบ local time ล้วน กัน bug ปนกันระหว่าง UTC/เวลาไทยที่เตือนไว้
  // ในไฟล์อื่นของโปรเจกต์นี้)
  const sums = {}; // sums[dow][leadDays] = { total: จำนวนสาขา-เฉลี่ยรวม, count: จำนวนวันตัวอย่าง }
  const lookbackDates = listDates(startStr, lookbackDays);
  lookbackDates.forEach((cur) => {
    if (cur > endStr) return;
    const dow = dowOfDateStr(cur);
    const activeBranches = activeBranchCount(branches, cur);
    if (activeBranches === 0) return;
    const leads = leadsByDate[cur] || [];
    if (!sums[dow]) sums[dow] = {};
    for (let leadDays = 0; leadDays <= 6; leadDays++) {
      const bookedByThen = leads.filter((l) => l >= leadDays).length;
      if (!sums[dow][leadDays]) sums[dow][leadDays] = { total: 0, count: 0 };
      sums[dow][leadDays].total += bookedByThen / activeBranches;
      sums[dow][leadDays].count += 1;
    }
  });

  const baseline = {};
  Object.entries(sums).forEach(([dow, byLead]) => {
    baseline[dow] = {};
    Object.entries(byLead).forEach(([leadDays, agg]) => {
      baseline[dow][leadDays] = agg.count > 0 ? agg.total / agg.count : null;
    });
  });
  return baseline;
}

/**
 * "เทียบกับปกติ" ของ 7 วันข้างหน้า (วันนี้ถึง +6 วัน) ทั้งเครือข่าย — 1 แถวสรุป ไม่ใช่รายสาขา
 * คืนค่า array 7 แถว: { date, dow, leadDays, bookedSoFar, activeBranches, bookedPerBranch,
 *   baselinePerBranch, pace, kind }
 */
export function computeWeeklyPace({ queues, branches, today }) {
  const baseline = computeNetworkPaceBaseline({ queues, branches, today });
  const dates = listDates(today, 7);

  return dates.map((date, leadDays) => {
    const dow = dowOfDateStr(date);
    const activeBranches = activeBranchCount(branches, date);
    const bookedSoFar = (queues || []).filter(
      (q) => q.date === date && !INACTIVE_STATUSES.includes(q.status || "pending")
    ).length;
    const bookedPerBranch = activeBranches > 0 ? bookedSoFar / activeBranches : null;
    const baselinePerBranch = baseline[dow]?.[leadDays] ?? null;

    const pace = (bookedPerBranch !== null && baselinePerBranch !== null && baselinePerBranch > 0)
      ? Math.round((bookedPerBranch / baselinePerBranch) * 100)
      : null;
    const kind = paceLabelKind(pace, leadDays);

    return { date, dow, leadDays, bookedSoFar, activeBranches, bookedPerBranch, baselinePerBranch, pace, kind };
  });
}
