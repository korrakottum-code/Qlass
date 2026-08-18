// Keyset pagination สำหรับโหลดตาราง queues ทั้งก้อน — pure logic ไม่มี dependency (unit test ได้ตรง ๆ)
//
// ทำไมไม่ใช้ OFFSET: OFFSET ลึก (เช่น หน้า 140) บังคับให้ Postgres เดินข้ามแถวก่อนหน้าทั้งหมด
// ก่อนคืนผล และการยิงทุกหน้าพร้อมกัน 146 request ทำให้แย่ง connection/CPU กันเองและกับ
// ผู้ใช้จริง จนบาง query รันเกิน statement_timeout 3 วินาทีของ role anon แล้วถูกตัด (SQLSTATE 57014)
//
// ทำไม keyset บน id: id เป็น uuid ที่ unique และ NOT NULL เสมอ → ไม่มีปัญหา tie/NULL ที่จะทำให้
// แถวหายหรือซ้ำ (ORDER BY date,time_block เดิมไม่มี tiebreaker และ time_block เป็น NULL ได้)
// และ uuid v4 กระจายสม่ำเสมอ จึงแบ่งช่วงให้เดินขนานกันได้โดยไม่ต้องรู้ค่าจริงในตาราง
// ลำดับที่ได้ไม่สำคัญ — caller (App.jsx) merge เข้า Map ตาม id แล้วหน้าต่าง ๆ เรียงเองอยู่แล้ว

export const HISTORY_PAGE_SIZE = 1000;
// concurrency 4 = ยิงพร้อมกันสูงสุด 4 request (แทน 146) — วัดบน clone 99k แถว: 10 วิ vs 42 วิ แบบทีละหน้า
export const HISTORY_PARALLEL_RANGES = 4;

const UUID_MIN = "00000000-0000-0000-0000-000000000000";
const UUID_MAX = "ffffffff-ffff-ffff-ffff-ffffffffffff";

// แบ่งช่วง uuid ตามหลักแรก (16 ค่า) ให้ได้ n ช่วงที่กว้างเท่ากัน — ค่าขอบเป็น uuid ที่ถูกรูปแบบเสมอ
// คืน [{ lowerExclusive, upperInclusive }] โดยช่วงแรกเริ่มจาก UUID_MIN แบบ exclusive
// (ไม่มี uuid ใดเท่ากับ 000...0 ได้จริงจาก gen_random_uuid แต่ก็ครอบด้วย gt ไว้ให้ครบตามสัญญา)
export function buildUuidRanges(n = HISTORY_PARALLEL_RANGES) {
  if (!Number.isInteger(n) || n < 1 || n > 16) throw new Error("buildUuidRanges: n must be 1..16");
  const step = 16 / n;
  const ranges = [];
  let lower = UUID_MIN;
  for (let i = 0; i < n; i++) {
    const isLast = i === n - 1;
    let upper;
    if (isLast) {
      upper = UUID_MAX;
    } else {
      const hex = Math.round(step * (i + 1)).toString(16);
      upper = `${hex}fffffff-ffff-ffff-ffff-ffffffffffff`;
    }
    ranges.push({ lowerExclusive: lower, upperInclusive: upper });
    lower = upper;
  }
  return ranges;
}

// เดิน keyset ทีละหน้าในช่วงเดียว: fetchPage(afterId, upperInclusive) → rows (เรียง id asc)
// หยุดเมื่อได้น้อยกว่า pageSize. คืน rows ทั้งช่วง. ถ้าหน้าไหน throw ให้ throw ต่อ (caller ตัดสินใจ)
export async function walkRange(fetchPage, { lowerExclusive, upperInclusive }, pageSize = HISTORY_PAGE_SIZE) {
  const rows = [];
  let cursor = lowerExclusive;
  for (;;) {
    const page = await fetchPage(cursor, upperInclusive);
    if (!Array.isArray(page) || page.length === 0) break;
    rows.push(...page);
    if (page.length < pageSize) break;
    const last = page[page.length - 1];
    if (!last?.id || last.id === cursor) throw new Error("walkRange: cursor did not advance");
    cursor = last.id;
  }
  return rows;
}

// รวมผลจากทุกช่วง: คืน { rows, complete } — complete=false ถ้ามีช่วงไหนล้ม
// เพื่อให้ caller เก็บของที่ได้ไว้ได้ (แทนที่จะทิ้งทั้งชุด) และ "รู้" ว่าไม่ครบ
export async function fetchAllByUuidRanges(fetchPage, { ranges = buildUuidRanges(), pageSize = HISTORY_PAGE_SIZE } = {}) {
  const settled = await Promise.allSettled(ranges.map((r) => walkRange(fetchPage, r, pageSize)));
  const rows = [];
  let complete = true;
  const errors = [];
  for (const s of settled) {
    if (s.status === "fulfilled") rows.push(...s.value);
    else { complete = false; errors.push(s.reason); }
  }
  return { rows, complete, errors };
}
