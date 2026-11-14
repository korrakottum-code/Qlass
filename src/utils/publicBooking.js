// ตัวช่วยของหน้าลูกค้าจองเอง (/#book) — แยกจากหน้าเพื่อให้เทสต์ได้โดยไม่ต้องเรนเดอร์
export const MAX_DAYS_AHEAD = 14; // ตรงกับ c_max_days ใน online_booking_slots_v1
// จำนวนคูปองต่อคิว (เจ้าของสั่ง 14 พ.ย. 2569) — ตรงกับ c_max_count ใน online_booking_*_v2; เกินนี้ทักแอดมิน
export const MAX_COUPONS = 3;
export const COUPON_COUNTS = Array.from({ length: MAX_COUPONS }, (_, i) => i + 1);
// 1 ใบ = เวลาหัตถการเต็ม 1 รอบ (ไม่ลดเวลาใบถัดไป)
export function couponMinutes(service, count) {
  return (Number(service?.duration_minutes) || 0) * count;
}
// "15:00" + 60 → "16:00" — เวลาจบที่ระบบจองไว้ (ปุ่มเวลาบอกแค่เวลาเริ่ม ลูกค้างงว่าทำไม 15:00 ได้แต่ 15:30 ไม่ได้)
export function addMinutes(hhmm, minutes) {
  const [h, m] = String(hhmm || "").split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "";
  const total = h * 60 + m + (Number(minutes) || 0);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
const THAI_DAYS = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

// วันที่ตามเวลาไทย (ลูกค้าอาจตั้งโซนเวลาเครื่องผิด)
export function bangkokToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return parts; // YYYY-MM-DD
}
export function bookingDates(today, count = MAX_DAYS_AHEAD + 1) {
  const [y, m, d] = today.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const dt = new Date(Date.UTC(y, m - 1, d + i));
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
  });
}
export function thaiDateLabel(date) {
  const [y, m, d] = date.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${THAI_DAYS[dow]} ${d} ${THAI_MONTHS[m - 1]} ${y + 543}`;
}
export function normalizePhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (/^66\d{9}$/.test(digits)) digits = `0${digits.slice(2)}`;
  return digits;
}
export function isValidMobile(value) {
  const digits = normalizePhone(value);
  return /^0[689]\d{8}$/.test(digits) && !/^(.)\1+$/.test(digits.slice(2));
}

// ที่อยู่สำหรับลูกค้า (ไม่ให้ลูกค้าเห็นที่อยู่ของระบบพนักงาน) — เปิดที่นี่ได้แค่หน้าจอง ไม่มีหน้าล็อกอินพนักงาน
// ต้องตรงกับ BOOKING_ORIGINS ใน supabase/functions/public-booking และโดเมนที่ผูกไว้ในโปรเจกต์ Vercel
export const BOOKING_HOST = "classclinic-booking.vercel.app";
export function isBookingHost(hostname) {
  return String(hostname || "").toLowerCase() === BOOKING_HOST;
}
// ลิงก์ที่แจกลูกค้า: ทั้งหมด หรือเฉพาะสาขา (#book/<id> ใช้ได้ทั้งที่อยู่ลูกค้าและที่อยู่ระบบ)
export function customerBookingLink(branchId) {
  return branchId ? `https://${BOOKING_HOST}/#book/${branchId}` : `https://${BOOKING_HOST}/`;
}

// /#book หรือ /#book/<branchId> = หน้าลูกค้าจองเอง (Root.jsx แยกออกจากแอปพนักงาน)
export function isPublicBookingHash(hash) {
  return /^#book(\/|$)/.test(hash || "");
}

// ค้นหาในหน้าจอง: ไม่สนตัวพิมพ์เล็ก/ใหญ่และช่องว่าง ("class หอ" เจอ "Class หอกาญ", "ivdrip" เจอ "IV drip")
function searchKey(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, "");
}
export function matchesSearch(query, ...fields) {
  const q = searchKey(query);
  return !q || fields.some((f) => searchKey(f).includes(q));
}

// โปรจัดกลุ่มตามบริการ (หัตถการ) เรียงตามลำดับที่เซิร์ฟเวอร์ส่งมา — โปรเป็นร้อยจะได้ไม่ยาวเป็นแถวเดียว
export function groupServices(services) {
  const groups = new Map();
  for (const s of services || []) {
    const key = s.service || "อื่น ๆ";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  return [...groups].map(([service, items]) => ({ service, items }));
}
