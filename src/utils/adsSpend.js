// ค่าโฆษณา (Meta Ads) — ดึงผ่าน Edge Function `ads-spend` ที่ proxy ไป Korrakot-DB
// logic ล้วน แยกจาก UI เพื่อให้เทสต์ได้ (แบบเดียวกับ hnLookup.js)

const DAY_MS = 86400000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// ปลายทางรับช่วงกว้างสุด 370 วัน — เผื่อไว้ที่ 365 กันคลาดเคลื่อนเรื่อง timezone
export const MAX_ADS_RANGE_DAYS = 365;
// จำนวนวันของกราฟย้อนหลังในการ์ด
export const ADS_CHART_DAYS = 14;

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function endOfMonth(dateStr) {
  const [y, m] = dateStr.split("-").map(Number);
  const dt = new Date(y, m, 0); // วันที่ 0 ของเดือนถัดไป = วันสุดท้ายของเดือนนี้
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

/**
 * ช่วงเดียวที่ครอบทุกตัวเลขในการ์ด — ยิง API ครั้งเดียวพอ:
 * ยอดในช่วงที่เลือก + ยอดทั้งเดือนของ selectedDate + วันนี้ + กราฟ 14 วันย้อนหลัง
 * ถ้าช่วงกว้างเกิน MAX_ADS_RANGE_DAYS จะตัดขอบล่างขึ้นมา (ยอด "ในช่วง" จะไม่ครบ — การ์ดต้องเตือน)
 */
export function computeAdsRange({ dateRange, selectedDate, today }) {
  if (!DATE_RE.test(today || "")) return null;
  const candidatesFrom = [addDays(today, -(ADS_CHART_DAYS - 1))];
  const candidatesTo = [today];
  if (dateRange && DATE_RE.test(dateRange.start || "") && DATE_RE.test(dateRange.end || "")) {
    candidatesFrom.push(dateRange.start);
    candidatesTo.push(dateRange.end);
  }
  if (DATE_RE.test(selectedDate || "")) {
    candidatesFrom.push(`${selectedDate.slice(0, 7)}-01`);
    candidatesTo.push(endOfMonth(selectedDate));
  }
  const until = candidatesTo.reduce((a, b) => (b > a ? b : a));
  let since = candidatesFrom.reduce((a, b) => (b < a ? b : a));
  const span = Math.round((Date.parse(`${until}T00:00:00Z`) - Date.parse(`${since}T00:00:00Z`)) / DAY_MS);
  let truncated = false;
  if (span > MAX_ADS_RANGE_DAYS) {
    since = addDays(until, -MAX_ADS_RANGE_DAYS);
    truncated = true;
  }
  return { since, until, truncated };
}

/** รวมยอดรายวันในช่วง [from,to] (ขอบรวม) จาก map { day: spend } */
export function sumDaily(byDay, from, to) {
  let sum = 0;
  for (const [day, amount] of Object.entries(byDay || {})) {
    if (day >= from && day <= to) sum += amount;
  }
  return sum;
}

/** รวมยอดของทั้งเดือน (prefix "YYYY-MM") */
export function sumMonth(byDay, monthPrefix) {
  if (!monthPrefix) return 0;
  let sum = 0;
  for (const [day, amount] of Object.entries(byDay || {})) {
    if (day.startsWith(monthPrefix)) sum += amount;
  }
  return sum;
}

/** แปลง daily[] จาก API เป็น map { "YYYY-MM-DD": number } — ข้ามแถวที่รูปแบบผิด */
export function toDailyMap(daily) {
  const map = {};
  for (const row of daily || []) {
    const day = String(row?.day ?? "");
    if (!DATE_RE.test(day)) continue;
    const spend = Number(row?.spend);
    if (!Number.isFinite(spend)) continue;
    map[day] = (map[day] || 0) + spend;
  }
  return map;
}

/**
 * เรียก Edge Function — คืน { ok, spend, byDay, hasDaily, asOf, currency } หรือ { ok:false, error }
 * ไม่ throw: การ์ดต้องแสดงสถานะผิดพลาดได้เสมอ ไม่ใช่ค้างหรือโชว์ ฿0 เงียบ ๆ
 */
// supabase-js ถือ non-2xx เป็น error และไม่ parse body ให้ — โค้ดจริง (invalid_session / upstream_error / …)
// อยู่ใน error.context ซึ่งเป็น Response ต้องอ่านเอง ไม่งั้นการ์ดจะโชว์ข้อความ library ที่ผู้ใช้ตีความไม่ได้
async function readFunctionErrorCode(error) {
  const ctx = error?.context;
  if (!ctx || typeof ctx.json !== "function") return null;
  try {
    const body = await ctx.json();
    return typeof body?.error === "string" ? body.error : null;
  } catch {
    return null;
  }
}

export async function fetchAdsSpend({ since, until, token, invoke }) {
  if (!DATE_RE.test(since || "") || !DATE_RE.test(until || "")) return { ok: false, error: "invalid_range" };
  try {
    const { data, error } = await invoke("ads-spend", {
      body: { since, until },
      headers: { "X-Qlass-Session": token || "" },
    });
    if (error) {
      const code = await readFunctionErrorCode(error);
      return { ok: false, error: code || error.message || "request_failed" };
    }
    if (data?.error) return { ok: false, error: data.error };
    const byDay = toDailyMap(data?.daily);
    return {
      ok: true,
      spend: Number(data?.spend) || 0,
      byDay,
      // ปลายทางยังไม่รองรับ groupBy=day → ไม่มีข้อมูลรายวัน (การ์ดซ่อนกราฟแทนที่จะวาดศูนย์)
      hasDaily: Array.isArray(data?.daily),
      asOf: data?.asOf || null,
      currency: data?.currency || "THB",
    };
  } catch (e) {
    return { ok: false, error: e?.message || "request_failed" };
  }
}
