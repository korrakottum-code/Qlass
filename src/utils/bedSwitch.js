// ปุ่มปิด/เปิดเตียงรายวันบนหัวคอลัมน์ Timeline — โมดูลล้วน ไม่มี import ทดสอบด้วย node ได้ตรง ๆ
//
// ปัญหาที่แก้: พนักงานหยุด 1 คน = ต้องปิด 1 เตียงในวันนั้น แต่ทางเดียวที่มีคือหน้า
// "ตารางห้อง/เครื่อง" 5 ขั้น หน้าร้านเลยพิมพ์โน้ตมือแทน ("ทรีทเม้นท์หยุด 1 คนค่ะ") ซึ่งไม่ได้
// ปิดเตียงจริง แค่เตือนคน — ปุ่มนี้ทำให้ปิดจริงได้ในคลิกเดียว
//
// ┌── กติกาที่ต้องตรงกับที่อื่นในระบบ ─────────────────────────────────────────┐
// │ "ปิดทั้งวัน" ในตาราง room_schedules คือ                                       │
// │   { available: false, startBlock: null, endBlock: null }  และไม่ใช่ noteOnly   │
// │ ผู้อ่านทุกตัวใช้กติกานี้: helpers.isRoomBlockClosed, capacity.js, BookingPage,  │
// │ App.jsx (2 จุด) และ create_queue_v1 ฝั่งเซิร์ฟเวอร์ — ห้ามเขียนกติกาใหม่        │
// │ isFullDayClosure ด้านล่างคือคำนิยามเดียว helpers.js import ไปใช้                  │
// └──────────────────────────────────────────────────────────────────────────┘
//
// เจ้าของเคาะ (2026-08-17):
//   - ปิดเตียงที่มีคิว → เตือนรายชื่อคิวแล้วให้ยืนยัน ปิดได้ คิวไม่ถูกย้าย หน้าร้านจัดการเอง
//   - กดได้เฉพาะ branch_manager ขึ้นไป
//   - ปุ่มเดียวสลับกลับ เปิดคืน = ลบแถว แต่ลบเฉพาะแถวที่ปุ่มนี้สร้าง (source = 'bed_switch')
//     ห้ามแตะแถวที่คนกรอกเองผ่าน ScheduleModal (source = null)

export const BED_SWITCH_SOURCE = "bed_switch";
export const BED_SWITCH_DEFAULT_NOTE = "ปิดเตียง (พนักงานหยุด)";

/** แถว room_schedules นี้คือ "ปิดทั้งวัน" ไหม — คำนิยามเดียวของทั้งระบบ */
export function isFullDayClosure(s) {
  if (!s) return false;
  return !s.available && !s.noteOnly && (s.startBlock === null || s.startBlock === undefined);
}

/** สร้างแถวปิดเตียงในรูปแบบที่ saveRoomSchedule / createRoomSchedule รับ */
export function buildBedSwitchClosure({ roomId, date, note }) {
  const trimmed = String(note ?? "").trim();
  return {
    roomId,
    date,
    available: false,
    startBlock: null,
    endBlock: null,
    noteOnly: false,
    note: trimmed || BED_SWITCH_DEFAULT_NOTE,
    source: BED_SWITCH_SOURCE,
  };
}

/**
 * สถานะปุ่มสำหรับเตียง+วันนี้
 *   open              → ยังไม่ปิด กดปิดได้
 *   closed_by_switch  → ปิดจากปุ่มนี้ กดเปิดคืนได้ (ลบแถว switchRows)
 *   closed_by_hand    → ปิดจาก ScheduleModal (source ว่าง) หรือแถว "ทุกวัน" (date "")
 *                       ปุ่มต้อง disabled — ถ้ายอมให้ "เปิดคืน" มันจะลบแค่แถวของตัวเอง
 *                       แล้วเตียงยังปิดอยู่เพราะแถว hand ยังอยู่ ผู้ใช้จะงง
 *
 * ดูชุดแถวเดียวกับที่ isRoomBlockClosed ดู: date ตรง หรือ date === "" (ใช้ทุกวัน)
 * แถว switch นับเฉพาะ date ตรงเป๊ะ — ปุ่มไม่เคยสร้างแถว "ทุกวัน"
 */
export function getBedSwitchState(roomSchedules, roomId, date) {
  const candidates = (roomSchedules || []).filter(
    (s) => s && s.roomId === roomId && (s.date === date || s.date === "") && isFullDayClosure(s)
  );
  const switchRows = candidates.filter((s) => s.source === BED_SWITCH_SOURCE && s.date === date);
  const handRows = candidates.filter((s) => !(s.source === BED_SWITCH_SOURCE && s.date === date));

  if (handRows.length > 0) return { state: "closed_by_hand", switchRows, handRows };
  if (switchRows.length > 0) return { state: "closed_by_switch", switchRows, handRows };
  return { state: "open", switchRows, handRows };
}

/**
 * คิวที่จองอยู่บนเตียงนี้ในวันนี้ — ไว้โชว์ใน modal ก่อนปิด
 * รับ isActiveQueueStatus มาจากผู้เรียก (อยู่ใน helpers.js) เพื่อให้ไฟล์นี้ไม่มี import
 * แบบเดียวกับที่ checkFreshRoomBookingConflict รับ fetchQueues
 */
export function listQueuesOnBed({ queues, roomId, date, isActiveQueueStatus }) {
  const active = typeof isActiveQueueStatus === "function" ? isActiveQueueStatus : () => true;
  return (queues || [])
    .filter((q) => q && q.roomId === roomId && q.date === date && active(q.status))
    .slice()
    .sort((a, b) => {
      const ta = a.timeBlock ?? Number.POSITIVE_INFINITY;
      const tb = b.timeBlock ?? Number.POSITIVE_INFINITY;
      return ta - tb;
    });
}

/** ตัดรายการให้พอดี modal — { shown, hiddenCount } */
export function summarizeQueueList(list, cap = 8) {
  const all = list || [];
  return { shown: all.slice(0, cap), hiddenCount: Math.max(0, all.length - cap) };
}
