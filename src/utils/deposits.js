// ตัวช่วยล้วน (ไม่มี React / ไม่ต่อเครือข่าย) ของหน้า "ลูกค้าโอนแล้ว รอจองคิว" — เทสต์ได้ด้วย node --test
// ห้าม import helpers.js (import แบบไม่มีนามสกุล node --test เปิดไม่ได้) — ฟอร์มว่างส่งเข้ามาจาก App.jsx
import { addDays } from "./queueRanges.js";

export const DEPOSIT_PAGE_SIZE = 50;
// วันที่บันทึกย้อนได้ไม่เกิน 7 วัน ห้ามล่วงหน้า (ตรงกับ deposit_create_v1)
export const DEPOSIT_BACKDATE_DAYS = 7;
export const MAX_SLIP_BYTES = 1_500_000;

export function phoneDigits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

export function phonesMatch(a, b) {
  const x = phoneDigits(a);
  return x.length > 0 && x === phoneDigits(b);
}

/** คืนข้อความผิดพลาดภาษาไทยข้อแรกที่เจอ หรือ null ถ้าฟอร์มครบ */
export function validateDepositForm(form, { today, branchLocked = false } = {}) {
  const name = String(form?.customerName ?? "").trim();
  if (!name) return "กรุณากรอกชื่อ-นามสกุลลูกค้า";
  if (name.length > 120) return "ชื่อยาวเกิน 120 ตัวอักษร";
  if (!/^[0-9]{9,10}$/.test(phoneDigits(form?.customerPhone))) return "เบอร์โทรต้องเป็นตัวเลข 9–10 หลัก";
  if (!branchLocked && !form?.branchId) return "กรุณาเลือกสาขา";
  if (!form?.promoId) return "กรุณาเลือกโปร/หัตถการ";
  const amount = Number(form?.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) return "ยอดโอนต้องมากกว่า 0 บาท";
  const day = String(form?.recordDate ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "กรุณาเลือกวันที่บันทึก";
  if (today) {
    if (day > today) return "วันที่บันทึกต้องไม่ใช่วันล่วงหน้า";
    if (day < addDays(today, -DEPOSIT_BACKDATE_DAYS)) return `วันที่บันทึกย้อนได้ไม่เกิน ${DEPOSIT_BACKDATE_DAYS} วัน`;
  }
  if (!form?.slipBase64) return "กรุณาแนบสลิปการโอน";
  return null;
}

/**
 * สถานะคอลัมน์ "จองลงคิว"
 *   cancelled — ยกเลิก/คืนเงินแล้ว
 *   waiting   — ยังไม่จอง (ปุ่ม "เลือกวันที่")
 *   lost      — เคยจองแต่คิวถูกยกเลิก/ไม่มา/ถูกลบ (ปุ่ม "เลือกวันที่" ให้จองใหม่)
 *   done      — ลูกค้ามาทำแล้ว
 *   booked    — จองแล้ว (วันเวลาของคิวล่าสุด ไล่ตามการเลื่อนนัดแล้วที่เซิร์ฟเวอร์)
 */
export function depositBookingState(deposit) {
  if (!deposit) return "waiting";
  if (deposit.cancelledAt) return "cancelled";
  const b = deposit.booking;
  if (!b) return deposit.queueId ? "lost" : "waiting";
  if (b.status === "cancelled" || b.status === "no_show") return "lost";
  if (b.status === "done") return "done";
  return "booked";
}

export function canBookDeposit(deposit) {
  const s = depositBookingState(deposit);
  return s === "waiting" || s === "lost";
}

/** ฟอร์มบันทึกคิวที่กรอกล่วงหน้าจากรายการโอน — ประเภทลูกค้ายังว่าง (กติกา: ระบบห้ามเลือกให้) */
export function depositToBookingForm(deposit, { promos = [], procedures = [], emptyForm = {} } = {}) {
  const promo = promos.find((p) => p.id === deposit.promoId && p.active !== false);
  const procedureId = promo?.procedureId || (procedures.some((p) => p.id === deposit.procedureId) ? deposit.procedureId : "");
  return {
    ...emptyForm,
    name: deposit.customerName || "",
    phone: phoneDigits(deposit.customerPhone),
    branchId: deposit.branchId || "",
    procedureId: procedureId || "",
    promoId: promo ? promo.id : "",
    price: promo ? promo.price : "",
    note: `โอนแล้ว ${formatBaht(deposit.amount)} บาท (บันทึกการโอน ${deposit.recordDate || ""})`,
  };
}

export function formatBaht(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

/** แสดงเบอร์แบบ 08X-XXX-XXXX อ่านง่าย */
export function formatPhone(value) {
  const d = phoneDigits(value);
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 9) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
  return d;
}

/** ยอดรวมของตารางสรุป (แถวสุดท้าย "รวม") */
export function sumDepositStats(rows) {
  return (rows || []).reduce((acc, r) => ({
    count: acc.count + Number(r.count || 0),
    amount: acc.amount + Number(r.amount || 0),
    bookedCount: acc.bookedCount + Number(r.bookedCount || 0),
    bookedAmount: acc.bookedAmount + Number(r.bookedAmount || 0),
    doneCount: acc.doneCount + Number(r.doneCount || 0),
    doneAmount: acc.doneAmount + Number(r.doneAmount || 0),
  }), { count: 0, amount: 0, bookedCount: 0, bookedAmount: 0, doneCount: 0, doneAmount: 0 });
}

/**
 * หลังบันทึกคิวสำเร็จ: ผูกกับรายการโอนไหม — ผูกเฉพาะคิวใหม่ (ไม่ใช่การแก้คิว) และเบอร์ตรงกับรายการโอน
 * (เซิร์ฟเวอร์ตรวจซ้ำอีกชั้น) กันผูกผิดคนถ้าพนักงานเปลี่ยนไปลงคิวลูกค้าคนอื่นในฟอร์มเดียวกัน
 */
export function shouldLinkDeposit(pending, { newQueue, editing }) {
  if (!pending || editing || !newQueue?.id) return false;
  return phonesMatch(pending.customerPhone, newQueue.phone);
}
