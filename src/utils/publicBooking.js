// ตัวช่วยของหน้าลูกค้าจองเอง (/#book) — แยกจากหน้าเพื่อให้เทสต์ได้โดยไม่ต้องเรนเดอร์
export const MAX_DAYS_AHEAD = 14; // ตรงกับ c_max_days ใน online_booking_slots_v1
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

// /#book หรือ /#book/<branchId> = หน้าลูกค้าจองเอง (Root.jsx แยกออกจากแอปพนักงาน)
export function isPublicBookingHash(hash) {
  return /^#book(\/|$)/.test(hash || "");
}
