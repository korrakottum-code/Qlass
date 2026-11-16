// ทางเข้าเดียวของ "ลูกค้าจองเอง" ที่คุยกับเซิร์ฟเวอร์ — โหมดเดโมคู่มือ (scripts/screenshot) สลับไฟล์นี้เป็นตัวจำลองในหน่วยความจำ
//   หน้าลูกค้า (/#book): edge function public-booking (ไม่ต้องล็อกอิน)
//   หน้าตั้งค่า (เมนู "จองออนไลน์"): staff-session online_booking_* (superadmin / head_admin)
import { supabase } from "./supabaseClient";
import { getServerSessionToken, useServerSession, fetchOnlineBookingSettings, saveOnlineBookingSettings } from "./sessionAuth";

export const onlineBookingSettingsAvailable = useServerSession;
export { getServerSessionToken, fetchOnlineBookingSettings, saveOnlineBookingSettings };

// คำตอบที่ไม่ใช่ 2xx มาเป็น FunctionsHttpError — รหัสเหตุผลจริงอยู่ใน body (error หรือ error_code)
async function callPublic(body) {
  const { data, error } = await supabase.functions.invoke("public-booking", { body });
  if (!error) return data;
  let code = null;
  let conflict = null;
  const res = error?.context;
  if (res && typeof res.json === "function") {
    try {
      const parsed = typeof res.clone === "function" ? await res.clone().json() : await res.json();
      code = parsed?.error_code || parsed?.error || null;
      conflict = parsed?.conflict || null; // CUSTOMER_TIME_CONFLICT: คิวของลูกค้าเองที่เวลาทับ
    } catch { /* ไม่ใช่ JSON */ }
  }
  const err = new Error(code || "NETWORK_ERROR");
  err.code = code || "NETWORK_ERROR";
  err.conflict = conflict;
  throw err;
}

export async function fetchPublicBranches() {
  return (await callPublic({ action: "branches" })).branches || [];
}

export async function fetchPublicServices(branchId) {
  return (await callPublic({ action: "catalog", branchId })).services || [];
}

// count = จำนวนคูปอง 1–3 ใบ (เซิร์ฟเวอร์ล็อกเวลา = เวลาหัตถการ × จำนวนใบ)
export async function fetchPublicSlots(branchId, promoId, date, count) {
  return (await callPublic({ action: "slots", branchId, promoId, date, count })).slots || [];
}

export function bookPublic(booking) {
  return callPublic({ action: "book", ...booking });
}
