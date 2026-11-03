// Keyset pagination สำหรับโหลดตาราง queues ทั้งก้อน (Phase 2b) — pure logic ไม่มี dependency
//
// ทำไมไม่ใช้ OFFSET: OFFSET ลึก (เช่น หน้า 140) บังคับให้ Postgres เดินข้ามแถวก่อนหน้าทั้งหมด
// ก่อนคืนผล และการยิงทุกหน้าพร้อมกัน 146 request ทำให้แย่ง connection/CPU กันเองและกับ
// ผู้ใช้จริง จนบาง query รันเกิน statement_timeout 3 วินาทีของ role anon แล้วถูกตัด (SQLSTATE 57014)
//
// ทำไม keyset บน id: id เป็น uuid unique/NOT NULL → ไม่มี tie/NULL ให้แถวหายหรือซ้ำ
// (ORDER BY date,time_block เดิมไม่มี tiebreaker และ time_block เป็น NULL ได้) และ uuid v4 กระจาย
// สม่ำเสมอ จึงแบ่งช่วงให้เดินขนานกันได้โดยไม่ต้องรู้ค่าจริงในตาราง
//
// ใช้กับ "โหลดทั้งตาราง" เท่านั้น — path ที่กรอง date (Phase 2a 30 วัน) ใช้ index date เดิมดีกว่า
// (วัดบน production: keyset-by-id + filter date ทำ Phase 2a ช้าลง 1.0s → 5.0s เพราะต้องเดินทะลุ id ทั้งหมด)

export const HISTORY_PAGE_SIZE = 1000;
// concurrency 4 = ยิงพร้อมกันสูงสุด 4 request (แทน 146) — วัดบน clone 99k แถว: 10s vs 42s แบบทีละหน้า
export const HISTORY_PARALLEL_RANGES = 4;

const UUID_MIN = "00000000-0000-0000-0000-000000000000";
const UUID_MAX = "ffffffff-ffff-ffff-ffff-ffffffffffff";

// แบ่งช่วง uuid ตามหลักแรก (16 ค่า) — รองรับ n ที่ 16 หารลงตัว (1,2,4,8,16) เพื่อให้ทุกช่วงกว้างเท่ากันจริง
// คืน [{ lowerExclusive, upperInclusive }] ช่วงแรกเริ่มจาก UUID_MIN แบบ exclusive
export function buildUuidRanges(n = HISTORY_PARALLEL_RANGES) {
  if (![1, 2, 4, 8, 16].includes(n)) throw new Error("buildUuidRanges: n must be one of 1,2,4,8,16");
  const step = 16 / n;
  const ranges = [];
  let lower = UUID_MIN;
  for (let i = 0; i < n; i++) {
    const upper = i === n - 1
      ? UUID_MAX
      : `${(step * (i + 1) - 1).toString(16)}fffffff-ffff-ffff-ffff-ffffffffffff`;
    ranges.push({ lowerExclusive: lower, upperInclusive: upper });
    lower = upper;
  }
  return ranges;
}

// เดิน keyset ทีละหน้าในช่วงเดียว: fetchPage(afterId, upperInclusive, pageSize) → rows (เรียง id asc)
// fetchPage ต้องใช้ pageSize ที่ส่งให้เป็น limit — เพราะ walkRange ตัดสิน "หมดช่วง" จากค่านี้
// คืน { rows, error } เสมอ — ถ้าหน้าไหนล้ม จะเก็บ rows ที่ได้ก่อนหน้าไว้ + ใส่ error (ไม่ throw)
// เพื่อให้ผู้เรียกไม่ต้องทิ้งของทั้งช่วงเพราะพลาดหน้าเดียว
export async function walkRange(fetchPage, { lowerExclusive, upperInclusive }, pageSize = HISTORY_PAGE_SIZE) {
  const rows = [];
  let cursor = lowerExclusive;
  for (;;) {
    let page;
    try {
      page = await fetchPage(cursor, upperInclusive, pageSize);
    } catch (error) {
      return { rows, error };
    }
    if (!Array.isArray(page) || page.length === 0) break;
    for (const r of page) rows.push(r);
    if (page.length < pageSize) break;
    const last = page[page.length - 1];
    if (!last?.id || last.id === cursor) return { rows, error: new Error("walkRange: cursor did not advance") };
    cursor = last.id;
  }
  return { rows, error: null };
}

// เกณฑ์ตัดสินว่า "ถูกตัด" (เช่น server max-rows ถูกลดต่ำกว่า pageSize ทำให้ walkRange เข้าใจผิดว่าหมดช่วง):
// ยอมให้ได้น้อยกว่า count(*) ได้เท่ากับ max(ABS_MIN, 2%) แต่ไม่เกิน ABS_MAX แถว
// - พื้น ABS_MIN กันตารางเล็ก (10 แถว ลบ 1 = 10% ไม่ใช่ความผิดพลาด)
// - เพดาน ABS_MAX กันตารางใหญ่ (146k × 2% = 2,920 แถวหายเงียบ ๆ ไม่ควรถือว่าครบ) — การเขียนพร้อมกัน
//   ระหว่างโหลด ~10 วิ ขึ้นกับ write rate ไม่ใช่ขนาดตาราง (วัดจริงบน production: ต่างกัน 1 แถว
//   จึงตั้ง 100 = เผื่อ write rate สูงกว่าที่วัด 100 เท่า แต่ยังจับการตัดหน้าระดับหลายร้อยแถวได้)
// - กรณี max-rows ถูกตัดจะขาดเป็นสิบ ๆ % ไม่ใช่หลักสิบแถว จึงจับได้แน่
export const HISTORY_SHORTFALL_RATIO = 0.02;
export const HISTORY_SHORTFALL_ABS_MIN = 5;
export const HISTORY_SHORTFALL_ABS_MAX = 100;
export function allowedShortfall(expectedCount) {
  return Math.min(HISTORY_SHORTFALL_ABS_MAX, Math.max(HISTORY_SHORTFALL_ABS_MIN, Math.floor(expectedCount * HISTORY_SHORTFALL_RATIO)));
}

export async function fetchAllByUuidRanges(fetchPage, { ranges = buildUuidRanges(), pageSize = HISTORY_PAGE_SIZE, expectedCount = null } = {}) {
  const results = await Promise.all(ranges.map((r) => walkRange(fetchPage, r, pageSize)));
  const rows = [];
  const errors = [];
  for (const res of results) {
    for (const r of res.rows) rows.push(r);
    if (res.error) errors.push(res.error);
  }
  let complete = errors.length === 0;
  if (complete && Number.isInteger(expectedCount) && expectedCount > 0) {
    if (expectedCount - rows.length > allowedShortfall(expectedCount)) {
      complete = false;
      errors.push(new Error(`fetchAllByUuidRanges: expected ~${expectedCount} rows, got ${rows.length} (server page cap below pageSize?)`));
    }
  }
  return { rows, complete, errors };
}

// ─── ช่วงวันที่ใหญ่ (ค่าคอม/CEO/Export/สรุป ย้อนหลังหลายเดือน) — keyset บน (date desc, id) ทีละช่วงวัน ───
//
// เดิม path ที่กรอง date ใช้ OFFSET และยิงทุกหน้าพร้อมกัน (ดู fetchQueues) — ช่วง 30 วันตอนเปิดแอปไม่มีปัญหา
// แต่ช่วงยาว (3 เดือน = 141 หน้า) ทุกหน้าต้องเดินข้ามแถวทั้งช่วง (~0.33s/หน้า บน production 4 พ.ย. 2569)
// แล้วยิงพร้อมกัน 141 request → เกิน statement_timeout 3s ของ anon (log 3 พ.ย.: 53 ครั้งตอนเช้า, 31 ครั้งตอน 22:24)
// เป็นต้นตอเดียวกับที่แก้ Phase 2b ไปเมื่อ 18 ส.ค. แต่ตอนนั้นแก้เฉพาะทาง "ทั้งตาราง"
//
// ทำไมไม่ keyset บน id อย่าง Phase 2b: กรอง date + เรียง id ต้องเดินทะลุ id ทั้งตาราง (วัดได้ช้าลง 5 เท่า)
// keyset บน (date desc, id asc) ใช้ index date เดิม: หน้าถัดไปเริ่มที่ date <= วันล่าสุดที่ได้ แล้วเรียง id
// เฉพาะแถวของวันนั้น (~2,300 แถว) — วัดบน production: 0.014s/หน้า แทน 0.33s
//
// แบ่งช่วงวันแล้วเดินขนานทีละไม่เกิน DATE_SEGMENT_CONCURRENCY ช่วง — keyset ในช่วงเดียวต้องเดินทีละหน้า
// ช่วงจึงต้องสั้น (2 วัน ≈ 3 หน้า) ไม่งั้นต่อคิวรอกันยาว: วัดบน production 4 พ.ย. 2569 ช่วงละ 7 วัน/ขนาน 4
// โหลด 30 วันใช้ 14.7s เทียบทางเดิม 4.8s (เวลาส่วนใหญ่คือรับข้อมูลหน้าละ ~0.4MB ไม่ใช่ฐานข้อมูล ~0.014s/หน้า)
// อนาคตไกล ๆ คิวน้อย ใช้ช่วงยาวขึ้น (ไม่ยิงเปล่าเป็นร้อยครั้ง) และวันที่มั่ว (ปี 0005 / 6371 มีจริงในตาราง) เป็นช่วงเดียว
export const DATE_SEGMENT_DAYS = 2;
export const DATE_SEGMENT_CONCURRENCY = 8;
export const DATE_SEGMENT_CORE_PAST_DAYS = 400;
export const DATE_SEGMENT_NEAR_FUTURE_DAYS = 14;
export const DATE_SEGMENT_FAR_FUTURE_STEP_DAYS = 30;
export const DATE_SEGMENT_CORE_FUTURE_DAYS = 400;

function shiftDate(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  const yy = dt.getUTCFullYear();
  return `${yy < 1000 ? String(yy).padStart(4, "0") : yy}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}
const minDate = (a, b) => (a < b ? a : b);
const maxDate = (a, b) => (a > b ? a : b);

// ตัด [from, to] เป็นช่วงละ step วัน จากใหม่ไปเก่า
function stepSegments(from, to, step) {
  const out = [];
  if (from > to) return out;
  for (let end = to; ;) {
    const start = maxDate(from, shiftDate(end, -(step - 1)));
    out.push({ from: start, to: end });
    if (start === from) break;
    end = shiftDate(start, -1);
  }
  return out;
}

// แบ่ง [first, last] (วันที่จริงที่มีข้อมูล ทั้งสองปลายรวม) เป็นช่วงต่อกันไม่มีรู ไม่ทับ
// คืน [{ from, to }] เรียงจากใหม่ไปเก่า: [อนาคตเกิน 400 วัน] [อนาคต 15–400 วัน ช่วงละ 30 วัน]
// [ย้อนหลัง 400 วัน ถึงอีก 14 วัน ช่วงละ 2 วัน] [เก่ากว่า 400 วัน]
export function buildDateSegments(first, last, {
  today, days = DATE_SEGMENT_DAYS, corePastDays = DATE_SEGMENT_CORE_PAST_DAYS,
  nearFutureDays = DATE_SEGMENT_NEAR_FUTURE_DAYS, farStepDays = DATE_SEGMENT_FAR_FUTURE_STEP_DAYS,
  coreFutureDays = DATE_SEGMENT_CORE_FUTURE_DAYS,
} = {}) {
  if (!first || !last || first > last) return [];
  if (!today) throw new Error("buildDateSegments: today is required");
  const coreFrom = shiftDate(today, -corePastDays);
  const nearTo = shiftDate(today, nearFutureDays);
  const coreTo = shiftDate(today, coreFutureDays);
  const segments = [];
  if (last > coreTo) segments.push({ from: maxDate(first, shiftDate(coreTo, 1)), to: last });
  segments.push(...stepSegments(maxDate(first, shiftDate(nearTo, 1)), minDate(last, coreTo), farStepDays));
  segments.push(...stepSegments(maxDate(first, coreFrom), minDate(last, nearTo), days));
  if (first < coreFrom) segments.push({ from: first, to: minDate(last, shiftDate(coreFrom, -1)) });
  return segments;
}

// เดิน keyset ในช่วงวันเดียว: fetchPage({ from, to, cursor, pageSize }) → rows เรียง date desc, id asc
// cursor = null (หน้าแรก) หรือ { date, id } ของแถวสุดท้ายหน้าก่อน; fetchPage ต้องคืนแถวที่
// from <= date <= to และ (date < cursor.date หรือ (date = cursor.date และ id > cursor.id))
// คืน { rows, error } ไม่ throw — เหมือน walkRange
export async function walkDateSegment(fetchPage, { from, to }, pageSize = HISTORY_PAGE_SIZE) {
  const rows = [];
  let cursor = null;
  for (;;) {
    let page;
    try {
      page = await fetchPage({ from, to, cursor, pageSize });
    } catch (error) {
      return { rows, error };
    }
    if (!Array.isArray(page) || page.length === 0) break;
    for (const r of page) rows.push(r);
    if (page.length < pageSize) break;
    const last = page[page.length - 1];
    if (!last?.id || !last?.date || (cursor && last.date === cursor.date && last.id === cursor.id)) {
      return { rows, error: new Error("walkDateSegment: cursor did not advance") };
    }
    cursor = { date: last.date, id: last.id };
  }
  return { rows, error: null };
}

// เดินทุกช่วงโดยมี request ค้างพร้อมกันไม่เกิน concurrency — คืน { rows, complete, errors } แบบ fetchAllByUuidRanges
export async function fetchAllByDateSegments(fetchPage, segments, { concurrency = DATE_SEGMENT_CONCURRENCY, pageSize = HISTORY_PAGE_SIZE, expectedCount = null } = {}) {
  const results = new Array(segments.length);
  let next = 0;
  const worker = async () => {
    while (next < segments.length) {
      const i = next++;
      results[i] = await walkDateSegment(fetchPage, segments[i], pageSize);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, segments.length)) }, worker));
  const byId = new Map();
  const errors = [];
  for (const res of results) {
    if (!res) continue;
    for (const r of res.rows) byId.set(r.id, r);
    if (res.error) errors.push(res.error);
  }
  const rows = Array.from(byId.values());
  let complete = errors.length === 0;
  if (complete && Number.isInteger(expectedCount) && expectedCount > 0 && expectedCount - rows.length > allowedShortfall(expectedCount)) {
    complete = false;
    errors.push(new Error(`fetchAllByDateSegments: expected ~${expectedCount} rows, got ${rows.length} (server page cap below pageSize?)`));
  }
  return { rows, complete, errors };
}
