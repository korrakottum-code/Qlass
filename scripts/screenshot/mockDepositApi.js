// ตัวจำลอง API "ลูกค้าโอนแล้ว รอจองคิว" ในหน่วยความจำ (โหมดเดโม) — ทำตามกติกาเดียวกับฟังก์ชัน deposit_*_v1 ใน SQL
// ไม่ต่อเครือข่าย ข้อมูลหายเมื่อรีเฟรช ใช้ดูหน้าจอ/ถ่ายภาพคู่มือเท่านั้น
import { DB } from "./mockSupabaseService.js";

export const depositsAvailable = true;
export const getServerSessionToken = () => "demo";

const deposits = [];
const slips = new Map();
let seq = 0;
const fail = (code) => { throw new Error(code); };
const digits = (v) => String(v ?? "").replace(/\D/g, "");
const dstr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const today = () => dstr(new Date());
const shift = (s, n) => { const d = new Date(`${s}T00:00:00`); d.setDate(d.getDate() + n); return dstr(d); };
function me() {
  try { return JSON.parse(localStorage.getItem("qlass_user") || "null"); } catch { return null; }
}
function scopeBranch() {
  const u = me();
  return u && (u.role === "branch_manager" || u.role === "cashier") ? u.branchId : null;
}
// ไล่ตามการเลื่อนนัด (rescheduled → คิวที่ rescheduledFromId ชี้มา)
function currentQueue(queueId) {
  let q = DB.queues.find((x) => x.id === queueId);
  for (let i = 0; q && q.status === "rescheduled" && i < 10; i += 1) {
    const next = DB.queues.find((x) => x.rescheduledFromId === q.id);
    if (!next) break;
    q = next;
  }
  return q || null;
}
function view(d) {
  const q = d.queueId ? currentQueue(d.queueId) : null;
  const staff = DB.staff.find((s) => s.id === d.recordedBy);
  return {
    ...d,
    branchName: DB.branches.find((b) => b.id === d.branchId)?.name || "",
    recordedByName: staff?.nickname || staff?.name || "",
    hasSlip: true,
    booking: q ? { queueId: q.id, date: q.date, timeBlock: q.timeBlock, status: q.status } : null,
  };
}
const qStatus = (d) => (d.queueId ? currentQueue(d.queueId)?.status ?? null : null);
const isBooked = (s) => s != null && s !== "cancelled" && s !== "no_show" && s !== "rescheduled";

export async function listDeposits(_t, { search = "", status = "all", branchId = null, from = null, to = null, limit = 50, offset = 0 } = {}) {
  const scoped = scopeBranch();
  const text = search.trim();
  const num = digits(search);
  const rows = deposits.filter((d) => {
    if ((scoped || branchId) && d.branchId !== (scoped || branchId)) return false;
    if (from && d.recordDate < from) return false;
    if (to && d.recordDate > to) return false;
    if (text && !d.customerName.includes(text) && !(num.length >= 3 && d.customerPhone.includes(num))) return false;
    const s = qStatus(d);
    if (status === "cancelled") return !!d.cancelledAt;
    if (status === "booked") return !d.cancelledAt && isBooked(s);
    if (status === "waiting") return !d.cancelledAt && !isBooked(s);
    return true;
  }).sort((a, b) => b.recordDate.localeCompare(a.recordDate) || b.createdAt.localeCompare(a.createdAt));
  return { total: rows.length, deposits: rows.slice(offset, offset + limit).map(view) };
}

export async function createDeposit(_t, d) {
  const u = me();
  const name = String(d.customerName || "").trim();
  const phone = digits(d.customerPhone);
  if (!name) fail("invalid_name");
  if (!/^[0-9]{9,10}$/.test(phone) || /^(.)\1+$/.test(phone)) fail("invalid_phone");
  const amount = Number(d.amount);
  if (!(amount > 0 && amount <= 1000000)) fail("invalid_amount");
  if (!d.recordDate || d.recordDate > today() || d.recordDate < shift(today(), -7)) fail("invalid_date");
  const branchId = scopeBranch() || d.branchId;
  if (!DB.branches.some((b) => b.id === branchId)) fail("invalid_branch");
  const promo = DB.promos.find((p) => p.id === d.promoId);
  if (!promo) fail("invalid_promo");
  if (!d.slipBase64) fail("invalid_slip");
  const id = `dep-${++seq}`;
  slips.set(id, `data:image/jpeg;base64,${d.slipBase64}`);
  const row = {
    id, customerName: name, customerPhone: phone, branchId, promoId: promo.id, procedureId: promo.procedureId,
    promoName: promo.name, procedureName: DB.procedures.find((p) => p.id === promo.procedureId)?.name || "",
    amount: Math.round(amount * 100) / 100, recordDate: d.recordDate, note: d.note || null,
    recordedBy: u?.id || null, createdAt: new Date().toISOString(),
    queueId: null, bookedAt: null, cancelledAt: null, cancelReason: null,
  };
  deposits.push(row);
  return view(row);
}

export async function linkDepositQueue(_t, depositId, queueId) {
  const d = deposits.find((x) => x.id === depositId);
  const scoped = scopeBranch();
  if (!d || (scoped && d.branchId !== scoped)) fail("deposit_not_found");
  if (d.cancelledAt) fail("deposit_cancelled");
  if (d.queueId === queueId) return view(d);
  if (isBooked(qStatus(d))) fail("deposit_already_booked");
  const q = DB.queues.find((x) => x.id === queueId);
  if (!q) fail("queue_not_found");
  if (digits(q.phone) !== d.customerPhone) fail("queue_phone_mismatch");
  if (!q.createdAt || q.createdAt < d.createdAt || ["done", "cancelled", "no_show", "rescheduled"].includes(q.status)) fail("queue_not_new");
  if (deposits.some((x) => x.queueId === queueId && x.id !== depositId)) fail("queue_already_linked");
  d.queueId = queueId;
  d.bookedAt = new Date().toISOString();
  return view(d);
}

export async function cancelDeposit(_t, depositId, reason) {
  const d = deposits.find((x) => x.id === depositId);
  if (!d) fail("deposit_not_found");
  if (d.cancelledAt) fail("deposit_cancelled");
  if (String(reason || "").trim().length < 2) fail("invalid_reason");
  d.cancelledAt = new Date().toISOString();
  d.cancelReason = String(reason).trim();
  return view(d);
}

export async function fetchDepositSlipUrl(_t, depositId) {
  return slips.get(depositId) || fail("deposit_not_found");
}

export async function fetchDepositStats(_t, { from = null, to = null } = {}) {
  const u = me();
  const all = ["superadmin", "head_admin", "ceo"].includes(u?.role);
  const per = new Map();
  for (const d of deposits) {
    if (d.cancelledAt || (from && d.recordDate < from) || (to && d.recordDate > to)) continue;
    if (!all && d.recordedBy !== u?.id) continue;
    const s = qStatus(d);
    const r = per.get(d.recordedBy) || { staffId: d.recordedBy, count: 0, amount: 0, bookedCount: 0, bookedAmount: 0, doneCount: 0, doneAmount: 0 };
    r.count += 1; r.amount += d.amount;
    if (isBooked(s)) { r.bookedCount += 1; r.bookedAmount += d.amount; }
    if (s === "done") { r.doneCount += 1; r.doneAmount += d.amount; }
    per.set(d.recordedBy, r);
  }
  const stats = [...per.values()].map((r) => {
    const s = DB.staff.find((x) => x.id === r.staffId);
    return { ...r, staffName: s?.nickname || s?.name || "" };
  }).sort((a, b) => b.amount - a.amount);
  return { stats, scope: all ? "all" : "self" };
}
