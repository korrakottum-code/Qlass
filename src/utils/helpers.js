import { DAY_START_BLOCK, DAY_END_BLOCK, ROLES } from "./constants";
import { canViewAllBranchesForRoles, filterItemsByBranch } from "./accessControl";

// สถานะที่ไม่ควรนับว่า "ครองเวลา" อีกต่อไป — ยกเลิก/ไม่มาตามนัด/เลื่อนออกไปที่อื่นแล้ว
// (คิวที่เลื่อนออก ยัง "ค้าง" อยู่ในระบบที่ช่องเวลาเดิมด้วยสถานะ "rescheduled"
// เพื่อเก็บประวัติ แต่ช่องเวลานั้นต้องว่างให้จองใหม่ได้)
export const INACTIVE_QUEUE_STATUSES = ["cancelled", "no_show", "rescheduled"];
export function isActiveQueueStatus(status) {
  return !INACTIVE_QUEUE_STATUSES.includes(status);
}

// ─── คิวลงล่วงหน้าที่ยังไม่ยืนยันเมื่อถึงวันนัด — เตือน (ไม่ auto ย้าย) ───
// logic ล้วนอยู่ใน waitingQueueRules.js (โมดูลเดี่ยว unit test ได้ตรง ๆ) — re-export ให้หน้าต่าง ๆ ใช้
export { isOverdueUnconfirmed, isOverdueMoveNote, OVERDUE_MOVE_NOTE_PREFIX, UNCONFIRMED_WARNING_BLOCK } from "./waitingQueueRules";
import { OVERDUE_MOVE_NOTE_PREFIX } from "./waitingQueueRules";

export function buildOverdueMoveNote(queue, room) {
  const timeLabel = queue.timeBlock !== null && queue.timeBlock !== undefined ? blockToTime(queue.timeBlock) : "-";
  const base = `${OVERDUE_MOVE_NOTE_PREFIX} ${room?.name || "-"} ${timeLabel} (${formatThaiDate(queue.date)}) — ย้ายเข้าคิวรอเพราะยังไม่ยืนยัน`;
  return queue.statusNote ? `${base}\n${queue.statusNote}` : base;
}

export function genId(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

export function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Convert any ISO timestamp / Date to local YYYY-MM-DD.
// IMPORTANT: do not use .slice(0, 10) on Supabase timestamps — that returns
// the UTC date, which causes Thai-midnight queues to be attributed to the
// wrong day (UTC is 7h behind Thai local time).
export function isoToLocalDateStr(iso) {
  if (!iso) return "";
  const d = iso instanceof Date ? iso : new Date(iso);
  if (isNaN(d.getTime())) {
    // Fall back to first 10 chars if it's already a plain "YYYY-MM-DD..." string
    return String(iso).slice(0, 10);
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatThaiDate(s) {
  if (!s) return "";
  const [y, m, d] = s.split("-");
  const months = [
    "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
    "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
  ];
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${parseInt(y) + 543}`;
}

export function blockToTime(block) {
  const totalMin = block * 5;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function generateWorkBlocks() {
  const blocks = [];
  for (let b = DAY_START_BLOCK; b < DAY_END_BLOCK; b++) {
    blocks.push({ block: b, time: blockToTime(b) });
  }
  return blocks;
}

export const WORK_BLOCKS = generateWorkBlocks();

export function getEmptyBookingForm() {
  return {
    name: "",
    phone: "",
    branchId: "",
    procedureId: "",
    promoId: "",
    price: "",
    note: "",
    customerType: "new",
    date: getTodayStr(),
    timeBlock: null,
    durationBlocks: null,
    roomId: "",
    status: "pending",
    statusNote: "",
  };
}

export function getCustomerBadgeClass(type) {
  if (type === "new") return "badge-new";
  if (type === "old") return "badge-old";
  if (type === "course") return "badge-course";
  return "badge-unknown";
}

export function getEmptyStaff() {
  return {
    name: "",
    nickname: "",
    phone: "",
    branchId: null,
    role: "receptionist",
    pin: "",
    active: true,
    commissionRates: { new: 0, old: 0, course: 0 },
  };
}

// คำนวณค่าคอมของ staff — commissionRates เป็นจำนวนเงิน (฿) ต่อคิว
export function calcCommission(doneQueues, staff) {
  let total = 0;
  const breakdown = { new: 0, old: 0, course: 0 };
  doneQueues.forEach((q) => {
    const type = q.customerType || "new";
    const amount = staff.commissionRates?.[type] || 0;
    breakdown[type] = (breakdown[type] || 0) + amount;
    total += amount;
  });
  return { total, breakdown };
}

// Branch filtering based on user role
export function canViewAllBranches(user) {
  return canViewAllBranchesForRoles(user, ROLES);
}

export function filterByUserBranch(items, user, branchIdField = "branchId") {
  return filterItemsByBranch(items, user, branchIdField, ROLES);
}

/**
 * ตรวจสอบว่าบล็อคเวลา (5 นาที) ในห้องและวันที่ระบุ ปิดบริการ / ไม่พร้อม หรือไม่
 */
export function isRoomBlockClosed(roomSchedules = [], roomId, date, block, room = null) {
  if (!roomId || !date || block === null || block === undefined) return false;

  const schedules = (roomSchedules || []).filter(
    (s) => s.roomId === roomId && (s.date === date || s.date === "")
  );

  // 1. ปิดทั้งวัน (available = false, noteOnly = false, startBlock = null)
  const isClosedAllDay = schedules.some(
    (s) => !s.available && !s.noteOnly && (s.startBlock === null || s.startBlock === undefined)
  );
  if (isClosedAllDay) return true;

  // 2. ปิดเฉพาะช่วงเวลา (available = false, noteOnly = false, startBlock <= block < endBlock)
  const isBlockedBySchedule = schedules.some(
    (s) =>
      !s.available &&
      !s.noteOnly &&
      s.startBlock !== null &&
      s.startBlock !== undefined &&
      s.endBlock !== null &&
      s.endBlock !== undefined &&
      block >= s.startBlock &&
      block < s.endBlock
  );
  if (isBlockedBySchedule) return true;

  // 3. ตรวจสอบเวลาเปิดปกติของห้อง (ถ้ามีข้อมูล room)
  if (room) {
    const openB = room.openBlock ?? 132;
    const closeB = room.closeBlock ?? 240;

    // ตรวจสอบว่ามี Schedule ขยายเวลาเปิดพิเศษหรือไม่ (available = true, noteOnly = false)
    const isSpecialOpen = schedules.some(
      (s) =>
        s.available &&
        !s.noteOnly &&
        s.startBlock !== null &&
        s.startBlock !== undefined &&
        s.endBlock !== null &&
        s.endBlock !== undefined &&
        block >= s.startBlock &&
        block < s.endBlock
    );

    if (!isSpecialOpen && (block < openB || block >= closeB)) {
      return true;
    }
  }

  return false;
}

/**
 * ตรวจสอบว่าช่วงเวลาต่อเนื่อง (startBlock ถึง startBlock + durationBlocks) มีบล็อคใดปิดบริการหรือไม่
 */
export function isRoomRangeClosed(roomSchedules = [], roomId, date, startBlock, durationBlocks = 1, room = null) {
  if (startBlock === null || startBlock === undefined) return false;
  const dur = Math.max(1, durationBlocks || 1);
  for (let i = 0; i < dur; i++) {
    if (isRoomBlockClosed(roomSchedules, roomId, date, startBlock + i, room)) {
      return true;
    }
  }
  return false;
}

