// Goal 13 client cutover gate (pure logic, no environment access).
//
// The Booking page routes a create to the server writer only when every gate
// below passes. After the server rejects a booking for a business reason, the
// caller must never fall back to the direct insert path; the rejection means
// nothing was written and the operator must adjust the form instead.

export function parseStaffAllowlist(raw) {
  return String(raw || "")
    .split(",")
    .map((id) => id.trim().toLowerCase())
    .filter(Boolean);
}

// Goal 13b: a new queue may start 'pending' (normal) or 'confirmed' (the
// client's own same-day auto-confirm rule — see App.jsx sameDayConfirmed).
// create_queue_v1 independently re-derives whether 'confirmed' is valid from
// the booking date rather than trusting this claim; this set just decides
// whether the gate below is even worth evaluating for a given form.
const CREATABLE_STATUSES = new Set(["pending", "confirmed"]);

// The canary contract covers only a new pending-or-same-day-confirmed
// booking made by an explicitly allowlisted operator while the flag is on.
// Anything else stays on the established writer — that is scope selection
// before any server call, not a fallback after a rejection.
export function shouldUseServerQueueCreate({ enabled, allowlist, user, form }) {
  if (!enabled) return false;
  const staffId = String(user?.id || "").trim().toLowerCase();
  if (!staffId || !allowlist.includes(staffId)) return false;
  return CREATABLE_STATUSES.has(form?.status ?? "pending");
}

export function buildServerQueuePayload(form) {
  return {
    name: form.name ?? "",
    phone: form.phone ?? "",
    branch_id: form.branchId || null,
    room_id: form.roomId || null,
    procedure_id: form.procedureId || null,
    promo_id: form.promoId || null,
    price: form.price === "" || form.price == null ? null : String(form.price),
    note: form.note ?? "",
    customer_type: form.customerType || "new",
    status: form.status || "pending",
    date: form.date || null,
    time_block: form.timeBlock ?? null,
    duration_blocks: form.durationBlocks ?? null,
  };
}

export const QUEUE_CREATE_ERROR_MESSAGES = {
  room_conflict: "เวลาชนกับคิวอื่นในห้องนี้ กรุณาเลือกเวลาใหม่",
  room_closed: "ห้องปิดหรืออยู่นอกเวลาเปิดในช่วงที่เลือก",
  past_date_not_allowed: "ไม่สามารถบันทึกคิวย้อนหลังได้",
  invalid_session: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่",
  forbidden: "ไม่มีสิทธิ์บันทึกคิวนี้",
  branch_forbidden: "ไม่มีสิทธิ์บันทึกคิวข้ามสาขา",
  request_id_forbidden: "คำขอนี้ถูกใช้โดยผู้ใช้อื่นแล้ว กรุณาลองใหม่",
  invalid_queue_payload: "ข้อมูลไม่ผ่านการตรวจสอบจากเซิร์ฟเวอร์ กรุณาตรวจสอบฟอร์ม",
  invalid_branch: "สาขาไม่ถูกต้อง",
  invalid_room: "ห้องไม่ถูกต้องหรือไม่อยู่ในสาขาที่เลือก",
  room_required: "กรุณาเลือกห้องเมื่อระบุเวลา",
  invalid_procedure: "หัตถการไม่ถูกต้องหรือไม่ตรงกับประเภทห้อง",
  invalid_duration: "ระยะเวลาไม่ถูกต้อง",
  procedure_required: "กรุณาเลือกหัตถการ",
  invalid_promo: "โปรโมชั่นไม่ถูกต้องหรือไม่ตรงกับหัตถการ",
  invalid_time: "เวลาอยู่นอกช่วงที่ระบบรองรับ",
};

export function queueCreateErrorMessage(code) {
  return QUEUE_CREATE_ERROR_MESSAGES[code]
    || "บันทึกคิวไม่สำเร็จ ข้อมูลในฟอร์มยังอยู่ครบ กรุณาลองอีกครั้ง";
}

// sessionApi throws Error(data.error) for a 2xx body carrying an error code,
// while a non-2xx Edge Function response surfaces as FunctionsHttpError with
// the JSON body still readable from error.context.
export async function extractQueueCreateErrorCode(error) {
  if (!error) return null;
  if (typeof error.message === "string" && QUEUE_CREATE_ERROR_MESSAGES[error.message]) {
    return error.message;
  }
  const res = error.context;
  if (res && typeof res.json === "function") {
    try {
      const body = typeof res.clone === "function" ? await res.clone().json() : await res.json();
      const code = body?.error;
      if (typeof code === "string" && QUEUE_CREATE_ERROR_MESSAGES[code]) return code;
    } catch {
      // Unreadable body — treat as an unknown transport error.
    }
  }
  return null;
}
