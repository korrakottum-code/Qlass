// ตัวจำลอง "ลูกค้าจองเอง" ในหน่วยความจำ (โหมดเดโม) — ทำตามกติกาหลักของ online_booking_*_v1 ใน SQL แบบย่อ
// (ห้องตามประเภท ไม่ชนคิว ก่อนนัด 2 ชม. ไม่เกิน 14 วัน เบอร์ละ 2 วัน วันละ 3 คิว, Pico/Hifu ก่อนฉีด) ไม่ต่อเครือข่าย ข้อมูลหายเมื่อรีเฟรช
import { DB } from "./mockSupabaseService.js";
import { bangkokToday, MAX_DAYS_AHEAD, procedureOrderKind } from "../../src/utils/publicBooking.js";

export const onlineBookingSettingsAvailable = true;
export const getServerSessionToken = () => "demo";

// เปิด Botox/Filler (4 โปรแรก) + HIFU 300 ไว้ให้เห็นกติกา "Hifu ก่อนงานฉีด" ในเดโม
const settings = { branches: { b1: true }, promoIds: new Set([...DB.promos.filter((p) => p.active !== false).slice(0, 4).map((p) => p.id), "pr6"]) };
// ชื่อหัตถการในข้อมูลเดโมสะกดต่างจากระบบจริง (HIFU) — แปลงให้ตรงชื่อจริงเพื่อใช้กติกาเดียวกัน
const realName = (n) => ({ HIFU: "Hifu" })[n] || n;
const booked = [];
const wait = () => new Promise((r) => setTimeout(r, 150));
const fail = (code) => { const e = new Error(code); e.code = code; throw e; };

export async function fetchOnlineBookingSettings() {
  await wait();
  return { branches: Object.entries(settings.branches).map(([branchId, active]) => ({ branchId, active })), promoIds: [...settings.promoIds] };
}
export async function saveOnlineBookingSettings(_token, branches, promoIds) {
  await wait();
  branches.forEach((b) => { settings.branches[b.branchId] = b.active; });
  settings.promoIds = new Set(promoIds);
  return fetchOnlineBookingSettings();
}

export async function fetchPublicBranches() {
  await wait();
  return DB.branches.filter((b) => settings.branches[b.id]).map((b) => ({ id: b.id, name: b.name }));
}
function service(branchId, promoId) {
  if (!settings.branches[branchId]) fail("INVALID_BRANCH");
  const promo = DB.promos.find((p) => p.id === promoId && settings.promoIds.has(p.id) && p.active !== false);
  const proc = promo && DB.procedures.find((p) => p.id === promo.procedureId);
  if (!proc) fail("INVALID_SERVICE");
  return { promo, proc, rooms: DB.rooms.filter((r) => r.branchId === branchId && String(proc.roomType || "").includes(r.type)) };
}
export async function fetchPublicServices(branchId) {
  await wait();
  return DB.promos
    .filter((p) => settings.promoIds.has(p.id) && p.active !== false)
    .map((p) => { try { const s = service(branchId, p.id); return s.rooms.length ? s : null; } catch { return null; } })
    .filter(Boolean)
    .map(({ promo, proc }) => ({ id: promo.id, name: promo.name, price: promo.price, service: realName(proc.name), duration_minutes: proc.blocks * 5 }));
}
function roomFree(room, date, start, dur) {
  if (start < (room.openBlock ?? 132) || start + dur > (room.closeBlock ?? 240)) return false;
  return ![...DB.queues, ...booked].some((q) => q.roomId === room.id && q.date === date && q.timeBlock != null
    && !["cancelled", "no_show", "rescheduled"].includes(q.status)
    && start < q.timeBlock + (q.durationBlocks || 1) && q.timeBlock < start + dur);
}
function startMs(date, block) {
  return Date.parse(`${date}T${String(Math.floor(block / 12)).padStart(2, "0")}:${String((block % 12) * 5).padStart(2, "0")}:00+07:00`);
}
export async function fetchPublicSlots(branchId, promoId, date, count = 1) {
  await wait();
  const { proc, rooms } = service(branchId, promoId);
  const dur = proc.blocks * count;
  const slots = [];
  for (let b = 132; b + dur <= 240; b += 6) {
    const hhmm = `${String(Math.floor(b / 12)).padStart(2, "0")}:${String((b % 12) * 5).padStart(2, "0")}`;
    slots.push({
      time: hhmm, start_time: `${date}T${hhmm}:00+07:00`,
      available: startMs(date, b) >= Date.now() + 2 * 3600_000 && rooms.some((r) => roomFree(r, date, b, dur)),
    });
  }
  return slots;
}
export async function bookPublic(b) {
  await wait();
  const { promo, proc, rooms } = service(b.branchId, b.promoId);
  const count = b.count ?? 1;
  if (!Number.isInteger(count) || count < 1 || count > 3) fail("INVALID_COUNT");
  const dur = proc.blocks * count;
  const date = b.startTime.slice(0, 10);
  const [hh, mm] = b.startTime.slice(11, 16).split(":").map(Number);
  const block = hh * 12 + mm / 5;
  const today = bangkokToday();
  const maxDay = new Date(Date.parse(`${today}T00:00:00Z`) + MAX_DAYS_AHEAD * 86400_000).toISOString().slice(0, 10);
  if (startMs(date, block) < Date.now() + 2 * 3600_000 || date > maxDay) fail("OUTSIDE_BOOKING_WINDOW");
  const mine = booked.filter((q) => q.phone === b.phone && q.date >= today);
  const sameDay = mine.filter((q) => q.date === date).length;
  if (sameDay >= 3) fail("TOO_MANY_SAME_DAY");
  if (sameDay === 0 && new Set(mine.map((q) => q.date)).size >= 2) fail("TOO_MANY_DAYS");
  const clash = [...DB.queues, ...booked].find((q) => q.phone === b.phone && q.date === date && q.timeBlock != null
    && !["cancelled", "no_show", "rescheduled"].includes(q.status)
    && block < q.timeBlock + (q.durationBlocks || 1) && q.timeBlock < block + dur);
  if (clash) {
    const hm = (x) => `${String(Math.floor(x / 12)).padStart(2, "0")}:${String((x % 12) * 5).padStart(2, "0")}`;
    const e = new Error("CUSTOMER_TIME_CONFLICT"); e.code = "CUSTOMER_TIME_CONFLICT";
    e.conflict = { service: realName(clash.service || ""), time: hm(clash.timeBlock), end_time: hm(clash.timeBlock + (clash.durationBlocks || 1)) };
    throw e;
  }
  // Pico/Hifu/Ultraformer ต้องจบก่อนงานฉีดเริ่ม — คนเดียวกัน = เบอร์+ชื่อเดียวกัน
  const kind = procedureOrderKind(realName(proc.name));
  if (kind) {
    const key = (s) => String(s || "").replace(/\s+/g, "").toLowerCase();
    const procName = (q) => realName(q.service || DB.procedures.find((p) => p.id === q.procedureId)?.name || "");
    const others = [...DB.queues, ...booked].filter((q) => q.phone === b.phone && q.date === date && q.timeBlock != null
      && !["cancelled", "no_show", "rescheduled"].includes(q.status) && key(q.name) === key(b.name));
    const end = (q) => q.timeBlock + (q.durationBlocks || 1);
    const hit = kind === "first"
      ? others.filter((q) => procedureOrderKind(procName(q)) === "inject" && q.timeBlock < block + dur).sort((x, y) => x.timeBlock - y.timeBlock)[0]
      : others.filter((q) => procedureOrderKind(procName(q)) === "first" && end(q) > block).sort((x, y) => end(y) - end(x))[0];
    if (hit) {
      const hm = (x) => `${String(Math.floor(x / 12)).padStart(2, "0")}:${String((x % 12) * 5).padStart(2, "0")}`;
      const e = new Error("PROCEDURE_ORDER"); e.code = "PROCEDURE_ORDER";
      e.conflict = { service: procName(hit), time: hm(hit.timeBlock), end_time: hm(end(hit)), need: kind === "first" ? "finish_by" : "start_from" };
      throw e;
    }
  }
  const room = rooms.find((r) => roomFree(r, date, block, dur));
  if (!room) fail("SLOT_UNAVAILABLE");
  const ref = Math.random().toString(16).slice(2, 10).toUpperCase();
  booked.push({ roomId: room.id, date, timeBlock: block, durationBlocks: dur, status: "pending", phone: b.phone, name: b.name, service: proc.name });
  const end = block + dur;
  const endTime = `${String(Math.floor(end / 12)).padStart(2, "0")}:${String((end % 12) * 5).padStart(2, "0")}`;
  return { success: true, booking_ref: ref, date, time: b.startTime.slice(11, 16), end_time: endTime, count, branch: DB.branches.find((x) => x.id === b.branchId).name, service: promo.name };
}
