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
