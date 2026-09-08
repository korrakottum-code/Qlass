// supabaseService จำลอง: ข้อมูลสาธิตในหน่วยความจำ ใช้เฉพาะตอนถ่ายภาพประกอบคู่มือ
// (vite.config.js ของโฟลเดอร์นี้ alias ให้แทนตัวจริง) — ห้ามใช้กับ production
import { PROCEDURE_CATEGORIES } from "../../src/utils/constants.js";
import { buildQueueStatusUpdate } from "../../src/utils/queueStatusUpdate.js";

// ─── PRNG คงที่ ให้ภาพเหมือนเดิมทุกครั้ง ───
let seed = 20260907;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const uid = (p) => `${p}-${Math.floor(rnd() * 1e9).toString(36)}`;
const dstr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (s, n) => { const d = new Date(`${s}T00:00:00`); d.setDate(d.getDate() + n); return dstr(d); };
const TODAY = dstr(new Date());

// ─── master data ───
export const DB = {
  branches: [
    { id: "b1", name: "สาขาขอนแก่น" },
    { id: "b2", name: "สาขาสยาม" },
    { id: "b3", name: "สาขาลาดพร้าว" },
  ],
  categories: [...PROCEDURE_CATEGORIES],
  procedures: [
    { id: "p1", name: "Botox", blocks: 3, category: "Injection", roomType: "M" },
    { id: "p2", name: "Filler", blocks: 4, category: "Injection", roomType: "M" },
    { id: "p3", name: "Laser CO2", blocks: 6, category: "Laser", roomType: "T" },
    { id: "p4", name: "IPL", blocks: 4, category: "Laser", roomType: "T" },
    { id: "p5", name: "Ultherapy", blocks: 12, category: "Energy", roomType: "T" },
    { id: "p6", name: "HIFU", blocks: 10, category: "Energy", roomType: "T" },
    { id: "p7", name: "ร้อยไหม", blocks: 8, category: "Lifting", roomType: "M" },
    { id: "p8", name: "Diode Laser (กำจัดขน)", blocks: 6, category: "Laser", roomType: "T" },
    { id: "p9", name: "Facial Treatment", blocks: 6, category: "Skincare", roomType: "T" },
    { id: "p10", name: "IV Drip", blocks: 8, category: "Wellness", roomType: "M" },
    { id: "p11", name: "Meso Fat", blocks: 4, category: "Body", roomType: "M" },
    { id: "p12", name: "Chemical Peel", blocks: 3, category: "Skincare", roomType: "T" },
    { id: "p13", name: "Pico Laser", blocks: 6, category: "Laser", roomType: "T" },
    { id: "p90", name: "ปิดคิว", blocks: 6, category: "Other", roomType: "T" },
    { id: "p91", name: "โปรประจำเดือน (T)", blocks: 6, category: "Other", roomType: "T" },
    { id: "p92", name: "Influencer", blocks: 6, category: "Other", roomType: "T" },
    { id: "p93", name: "ปรึกษาทั่วไป", blocks: 3, category: "Other", roomType: "M" },
  ],
  promos: [
    { id: "pr1", name: "Botox 50u", procedureId: "p1", price: 2500, active: true, sortOrder: 0 },
    { id: "pr2", name: "Botox 100u", procedureId: "p1", price: 4500, active: true, sortOrder: 1 },
    { id: "pr3", name: "Filler 1cc", procedureId: "p2", price: 5900, active: true, sortOrder: 2 },
    { id: "pr4", name: "Filler 2cc", procedureId: "p2", price: 10900, active: true, sortOrder: 3 },
    { id: "pr5", name: "Ultherapy Full Face", procedureId: "p5", price: 25000, active: true, sortOrder: 4 },
    { id: "pr6", name: "HIFU 300 shots", procedureId: "p6", price: 3900, active: true, sortOrder: 5 },
    { id: "pr7", name: "HIFU 600 shots", procedureId: "p6", price: 6900, active: true, sortOrder: 6 },
    { id: "pr8", name: "Laser CO2 Fractional", procedureId: "p3", price: 3500, active: true, sortOrder: 7 },
    { id: "pr9", name: "IPL Full Face", procedureId: "p4", price: 1500, active: true, sortOrder: 8 },
    { id: "pr10", name: "Diode รักแร้", procedureId: "p8", price: 990, active: true, sortOrder: 9 },
    { id: "pr11", name: "Diode ขา Full", procedureId: "p8", price: 2900, active: true, sortOrder: 10 },
    { id: "pr12", name: "ร้อยไหม 10 เส้น", procedureId: "p7", price: 9900, active: true, sortOrder: 11 },
    { id: "pr13", name: "Facial Hydra", procedureId: "p9", price: 1290, active: true, sortOrder: 12 },
    { id: "pr14", name: "IV Drip Glow", procedureId: "p10", price: 1990, active: true, sortOrder: 13 },
    { id: "pr15", name: "Pico ฝ้า กระ", procedureId: "p13", price: 2990, active: true, sortOrder: 14 },
    { id: "pr16", name: "Meso Fat 10cc", procedureId: "p11", price: 1990, active: true, sortOrder: 15 },
    { id: "pr17", name: "Peel หน้าใส (โปรเก่า)", procedureId: "p12", price: 890, active: false, sortOrder: 16 },
  ],
  rooms: [
    { id: "r1", name: "M01", branchId: "b1", type: "M", notes: "", openBlock: 132, closeBlock: 240, sortOrder: 0 },
    { id: "r2", name: "M02", branchId: "b1", type: "M", notes: "", openBlock: 132, closeBlock: 240, sortOrder: 1 },
    { id: "r3", name: "T01", branchId: "b1", type: "T", notes: "", openBlock: 132, closeBlock: 240, sortOrder: 2 },
    { id: "r4", name: "T02", branchId: "b1", type: "T", notes: "เครื่อง Diode", openBlock: 132, closeBlock: 240, sortOrder: 3 },
    { id: "r5", name: "T03", branchId: "b1", type: "T", notes: "รับเฉพาะ HIFU, Pico Laser", openBlock: 132, closeBlock: 240, sortOrder: 4 },
    { id: "r6", name: "M01", branchId: "b2", type: "M", notes: "", openBlock: 132, closeBlock: 240, sortOrder: 0 },
    { id: "r7", name: "T01", branchId: "b2", type: "T", notes: "", openBlock: 132, closeBlock: 240, sortOrder: 1 },
    { id: "r8", name: "T02", branchId: "b2", type: "T", notes: "", openBlock: 132, closeBlock: 240, sortOrder: 2 },
    { id: "r9", name: "M01", branchId: "b3", type: "M", notes: "", openBlock: 132, closeBlock: 240, sortOrder: 0 },
    { id: "r10", name: "T01", branchId: "b3", type: "T", notes: "", openBlock: 132, closeBlock: 240, sortOrder: 1 },
  ],
  roomProcedures: ["p6", "p13", "p90", "p91", "p92", "p93"].map((procedureId) => ({ roomId: "r5", procedureId })),
  roomSchedules: [
    { id: "rs1", roomId: "r4", date: addDays(TODAY, 1), available: false, startBlock: null, endBlock: null, note: "เครื่อง Diode ส่งซ่อม", source: null },
    { id: "rs2", roomId: "r1", date: TODAY, available: true, startBlock: null, endBlock: null, note: "หมอเข้า 14:00 เป็นต้นไป", source: null },
    { id: "rs3", roomId: "r3", date: addDays(TODAY, 2), available: true, startBlock: 132, endBlock: 264, note: "เปิดพิเศษถึง 22:00", source: null },
    { id: "rs4", roomId: "r7", date: TODAY, available: false, startBlock: null, endBlock: null, note: "ปิดเตียง (พนักงานหยุด)", source: "bed_switch" },
  ],
  staff: [
    { id: "s1", name: "ผู้ดูแลระบบ", nickname: "Admin", phone: "", branchId: null, role: "superadmin", pin: "0000", active: true, commissionRates: { new: 0, old: 0, course: 0 } },
    { id: "s2", name: "น้องแนน สมใจ", nickname: "แนน", phone: "0891234567", branchId: "b1", role: "cashier", pin: "1234", active: true, commissionRates: { new: 200, old: 150, course: 100 } },
    { id: "s3", name: "สมชาย ใจดี", nickname: "หมอสม", phone: "0812345678", branchId: null, role: "admin", pin: "5678", active: true, commissionRates: { new: 500, old: 400, course: 300 } },
    { id: "s4", name: "น้องจอย สุขใจ", nickname: "จอย", phone: "0856789012", branchId: "b2", role: "cashier", pin: "9999", active: true, commissionRates: { new: 200, old: 150, course: 100 } },
    { id: "s5", name: "พิมพ์ชนก บุญมา", nickname: "พี่บี", phone: "0861112222", branchId: null, role: "head_admin", pin: "1111", active: true, commissionRates: { new: 0, old: 0, course: 0 } },
    { id: "s6", name: "หมวย แซ่ลิ้ม", nickname: "เจ๊หมวย", phone: "0873334444", branchId: "b1", role: "branch_manager", pin: "2222", active: true, commissionRates: { new: 100, old: 80, course: 50 } },
    { id: "s7", name: "ธนกร วงศ์ดี", nickname: "คุณโบ๊ท", phone: "", branchId: null, role: "ceo", pin: "3333", active: true, commissionRates: { new: 0, old: 0, course: 0 } },
    { id: "s8", name: "มินตรา แก้วใส", nickname: "มิ้นท์", phone: "0895556666", branchId: null, role: "admin", pin: "4444", active: true, commissionRates: { new: 500, old: 400, course: 300 } },
    { id: "s9", name: "ฟ้าใส ทองดี", nickname: "ฟ้า", phone: "0897778888", branchId: null, role: "admin", pin: "5555", active: true, commissionRates: { new: 500, old: 400, course: 300 } },
    { id: "s10", name: "กมล ลาออกแล้ว", nickname: "กมล", phone: "", branchId: "b3", role: "cashier", pin: "6666", active: false, commissionRates: { new: 200, old: 150, course: 100 } },
  ],
  queues: [],
  tickets: [],
  activityLogs: [],
};

// ─── สร้างคิวสาธิต 70 วันย้อนหลัง + 10 วันข้างหน้า ───
const FIRST = ["สมหญิง", "วราภรณ์", "ณัฐพร", "กมลชนก", "ศิริพร", "พิมพ์มาดา", "จิราภรณ์", "อรทัย", "ปวีณา", "ธิดารัตน์", "นภัสสร", "ชลธิชา", "รัตนา", "สุภาพร", "เกวลิน", "ปาริชาต", "ณิชา", "ภัทรา", "อัญชลี", "มณีรัตน์"];
const LAST = ["ใจดี", "ทองดี", "สุขสันต์", "แก้วใส", "บุญมา", "วงศ์ดี", "ศรีสุข", "พงษ์พันธ์", "รักษ์ดี", "เจริญสุข"];
const NOTES = ["", "", "", "แพ้ยาชา", "ลูกค้า VIP", "ขอห้องเงียบ", "คอร์สเหลือ 2 ครั้ง", "มาพร้อมเพื่อน", "ติดต่อทาง LINE"];
const ADMINS = ["s3", "s8", "s9", "s8", "s3", "s2", "s4", "s6"];
function genQueues() {
  const out = [];
  for (let off = -70; off <= 10; off++) {
    const date = addDays(TODAY, off);
    const dow = new Date(`${date}T00:00:00`).getDay();
    for (const b of DB.branches) {
      const rooms = DB.rooms.filter((r) => r.branchId === b.id);
      const density = b.id === "b1" ? 1.0 : b.id === "b2" ? 0.7 : 0.45;
      const weekend = dow === 0 || dow === 6 ? 1.3 : 1;
      const future = off > 0 ? Math.max(0.15, 1 - off * 0.12) : 1;
      for (const room of rooms) {
        let block = 132 + Math.floor(rnd() * 4) * 6;
        while (block < 234) {
          if (rnd() < 0.55 * density * weekend * future) {
            const allowed = room.id === "r5" ? ["p6", "p13"] : DB.procedures.filter((p) => p.roomType === room.type && p.id < "p9" || (p.roomType === room.type && ["p9", "p10", "p11", "p12", "p13"].includes(p.id))).map((p) => p.id);
            const procedureId = pick(allowed);
            const proc = DB.procedures.find((p) => p.id === procedureId);
            const promos = DB.promos.filter((p) => p.procedureId === procedureId && p.active);
            const promo = promos.length ? pick(promos) : null;
            const ct = rnd();
            const customerType = ct < 0.45 ? "new" : ct < 0.8 ? "old" : "course";
            let status;
            const s = rnd();
            if (off < 0) status = s < 0.72 ? "done" : s < 0.84 ? "no_show" : s < 0.95 ? "cancelled" : "rescheduled";
            else if (off === 0) status = block < 168 ? (s < 0.7 ? "done" : "confirmed") : (s < 0.5 ? "confirmed" : s < 0.7 ? "pending" : s < 0.85 ? "follow1" : "follow2");
            else status = s < 0.4 ? "confirmed" : s < 0.75 ? "pending" : s < 0.9 ? "follow1" : "follow2";
            const lead = off > 0 ? Math.floor(rnd() * 3) : Math.floor(rnd() * 4);
            const created = new Date(`${addDays(date, -lead)}T${String(9 + Math.floor(rnd() * 10)).padStart(2, "0")}:${String(Math.floor(rnd() * 60)).padStart(2, "0")}:00`);
            out.push({
              id: uid("q"), name: `คุณ${pick(FIRST)} ${pick(LAST)}`, phone: `08${Math.floor(10000000 + rnd() * 89999999)}`,
              branchId: b.id, roomId: room.id, procedureId, promoId: promo?.id || null,
              price: promo ? promo.price : "", note: pick(NOTES), customerType, date, timeBlock: block,
              durationBlocks: null, status, statusNote: status === "follow1" ? "โทรไม่รับสาย" : status === "cancelled" ? "ลูกค้าติดธุระ" : "",
              recordedBy: pick(ADMINS), createdAt: created.toISOString(), statusUpdatedAt: null,
            });
            block += proc.blocks + (rnd() < 0.5 ? 0 : 6);
          } else block += 6;
        }
      }
    }
  }
  // คิวรอ
  out.push({ id: "q-wait-1", name: "คุณอรอนงค์ มีสุข", phone: "0812223333", branchId: "b1", roomId: null, procedureId: "p6", promoId: "pr6", price: 3900, note: "สะดวกช่วงบ่าย", customerType: "new", date: TODAY, timeBlock: null, durationBlocks: null, status: "waiting_queue", statusNote: "", recordedBy: "s8", createdAt: new Date(Date.now() - 3600e3).toISOString(), statusUpdatedAt: null });
  out.push({ id: "q-wait-2", name: "คุณเบญจมาศ ศรีสุข", phone: "0854445555", branchId: "b1", roomId: null, procedureId: "p1", promoId: "pr1", price: 2500, note: "", customerType: "old", date: TODAY, timeBlock: null, durationBlocks: null, status: "waiting_queue", statusNote: `🕐 เดิมนัด M02 11:30 (วันนี้) — ย้ายเข้าคิวรอเพราะยังไม่ยืนยัน`, recordedBy: "s3", createdAt: new Date(Date.now() - 7200e3).toISOString(), statusUpdatedAt: null });
  return out;
}
DB.queues = genQueues();
DB.tickets = [
  { id: "t1", title: "Timeline บนมือถือเลื่อนไม่สุด", description: "เปิดจาก iPhone แล้วปัดตารางไปทางขวาไม่ถึงเตียง T03\nเกิดที่สาขาขอนแก่น วันนี้ช่วงเช้า", category: "bug", priority: "medium", status: "in_progress", branchId: "b1", reportedBy: "s2", assignedTo: null, imageUrls: [], adminNotes: "กำลังตรวจสอบ คาดว่าแก้ในเวอร์ชันถัดไป", createdAt: new Date(Date.now() - 2 * 86400e3).toISOString(), updatedAt: null, resolvedAt: null },
  { id: "t2", title: "อยากให้ Export มีคอลัมน์ชื่อเล่นแอดมิน", description: "ตอนนี้ไฟล์ค่าคอมมีแต่ชื่อเต็ม อ่านยาก", category: "feature", priority: "low", status: "open", branchId: "b2", reportedBy: "s4", assignedTo: null, imageUrls: [], adminNotes: "", createdAt: new Date(Date.now() - 86400e3).toISOString(), updatedAt: null, resolvedAt: null },
  { id: "t3", title: "ลงคิวแล้วขึ้นเวลาชน ทั้งที่ว่าง", description: "ตอน 10:05 ลงคิว T01 15:00 ขึ้นชนกับคิวคุณสมหญิง แต่ในตารางไม่เห็นคิวนั้น", category: "question", priority: "high", status: "resolved", branchId: "b1", reportedBy: "s6", assignedTo: null, imageUrls: [], adminNotes: "เป็นคิวที่เครื่องอื่นเพิ่งลง ระบบทำงานถูกต้อง", createdAt: new Date(Date.now() - 5 * 86400e3).toISOString(), updatedAt: null, resolvedAt: new Date(Date.now() - 4 * 86400e3).toISOString() },
];
DB.activityLogs = [
  { id: "l1", action: "delete_queue", targetType: "queue", targetId: "x1", detail: JSON.stringify({ name: "คุณทดสอบ ซ้ำซ้อน", phone: "0811112222", date: TODAY, timeBlock: 156, roomId: "r1", procedureId: "p1" }), performedBy: "s3", performedByName: "หมอสม", createdAt: new Date(Date.now() - 3 * 3600e3).toISOString() },
  { id: "l2", action: "delete_queue", targetType: "queue", targetId: "x2", detail: JSON.stringify({ name: "คุณลงผิด สาขา", phone: "0833334444", date: addDays(TODAY, 1), timeBlock: 180, roomId: "r3", procedureId: "p6" }), performedBy: "s2", performedByName: "แนน", createdAt: new Date(Date.now() - 5 * 3600e3).toISOString() },
];

// ─── helpers ───
const clone = (x) => JSON.parse(JSON.stringify(x));
const delay = () => new Promise((r) => setTimeout(r, 30));
const upsert = (arr, item) => { const i = arr.findIndex((x) => x.id === item.id); if (i >= 0) arr[i] = item; else arr.push(item); return item; };
const remove = (arr, id) => { const i = arr.findIndex((x) => x.id === id); if (i >= 0) arr.splice(i, 1); };

// ─── branches / procedures / promos / rooms ───
export async function fetchBranches() { await delay(); return clone(DB.branches); }
export async function createBranch(b) { return upsert(DB.branches, { ...b, id: uid("b") }); }
export async function updateBranch(id, b) { return upsert(DB.branches, { ...DB.branches.find((x) => x.id === id), ...b, id }); }
export async function deleteBranch(id) { remove(DB.branches, id); }
export async function fetchProcedures() { await delay(); return clone(DB.procedures); }
export async function createProcedure(p) { return upsert(DB.procedures, { ...p, id: uid("p") }); }
export async function updateProcedure(id, p) { return upsert(DB.procedures, { ...DB.procedures.find((x) => x.id === id), ...p, id }); }
export async function deleteProcedure(id) { remove(DB.procedures, id); }
export async function fetchPromos() { await delay(); return clone(DB.promos); }
export async function createPromo(p) { return upsert(DB.promos, { active: true, sortOrder: DB.promos.length, ...p, id: uid("pr") }); }
export async function updatePromo(id, p) { return upsert(DB.promos, { ...DB.promos.find((x) => x.id === id), ...p, id }); }
export async function deletePromo(id) { remove(DB.promos, id); }
export async function fetchRooms() { await delay(); return clone(DB.rooms); }
export async function createRoom(r) { return upsert(DB.rooms, { sortOrder: 0, ...r, id: uid("r") }); }
export async function updateRoom(id, r) { return upsert(DB.rooms, { ...DB.rooms.find((x) => x.id === id), ...r, id }); }
export async function deleteRoom(id) { remove(DB.rooms, id); }

// ─── room procedures ───
export function mapRoomProcedureRow(row) { return { roomId: row.room_id, procedureId: row.procedure_id }; }
export async function fetchRoomProcedures() { await delay(); return clone(DB.roomProcedures); }
export async function setRoomProcedures(roomId, procedureIds) {
  DB.roomProcedures = DB.roomProcedures.filter((x) => x.roomId !== roomId);
  for (const procedureId of new Set(procedureIds || [])) DB.roomProcedures.push({ roomId, procedureId });
  return DB.roomProcedures.filter((x) => x.roomId === roomId);
}
export const getAllRoomProcedures = fetchRoomProcedures;

// ─── room schedules ───
export function mapRoomScheduleRow(s) {
  return { id: s.id, roomId: s.room_id, date: s.date || "", available: s.available, startBlock: s.start_block, endBlock: s.end_block, noteOnly: s.start_block === null && s.end_block === null && s.available === true, note: s.note || "", source: s.source ?? null };
}
const normSched = (s) => ({ ...s, date: s.date || "", noteOnly: s.startBlock == null && s.endBlock == null && s.available === true });
export async function fetchRoomSchedules() { await delay(); return clone(DB.roomSchedules.map(normSched)); }
export async function createRoomSchedule(s) { return normSched(upsert(DB.roomSchedules, { source: null, ...s, id: uid("rs") })); }
export async function updateRoomSchedule(id, s) { return normSched(upsert(DB.roomSchedules, { ...DB.roomSchedules.find((x) => x.id === id), ...s, id })); }
export async function deleteRoomSchedule(id) { remove(DB.roomSchedules, id); }
export async function deleteBedSwitchClosures(roomId, date) {
  const hit = DB.roomSchedules.filter((s) => s.roomId === roomId && s.date === date && s.source === "bed_switch" && s.available === false && s.startBlock == null);
  hit.forEach((h) => remove(DB.roomSchedules, h.id));
  return hit.map((h) => ({ id: h.id }));
}

// ─── staff ───
export async function fetchStaff() { await delay(); return clone(DB.staff); }
export async function createStaff(s) { return upsert(DB.staff, { active: true, ...s, id: uid("s") }); }
export async function updateStaff(id, s) { return upsert(DB.staff, { ...DB.staff.find((x) => x.id === id), ...s, id }); }
export async function deleteStaff(id) { remove(DB.staff, id); }

// ─── queues ───
export function mapQueueRow(q) {
  return { id: q.id, name: q.name, phone: q.phone, branchId: q.branch_id, procedureId: q.procedure_id, promoId: q.promo_id, price: q.price ? parseFloat(q.price) : "", note: q.note || "", customerType: q.customer_type, date: q.date, timeBlock: q.time_block, durationBlocks: q.duration_blocks ?? null, roomId: q.room_id, status: q.status, statusNote: q.status_note || "", recordedBy: q.recorded_by, createdAt: q.created_at, statusUpdatedAt: q.status_updated_at };
}
export async function fetchQueues(opts = {}) {
  const { sinceDate = null, untilDate = null, onResult = null } = opts;
  await delay();
  const rows = DB.queues.filter((q) => (!sinceDate || q.date >= sinceDate) && (!untilDate || q.date <= untilDate));
  if (typeof onResult === "function") onResult({ complete: true, errors: [], rowCount: rows.length });
  return clone(rows);
}
export async function createQueue(q) {
  const row = { durationBlocks: null, statusNote: "", note: "", ...q, id: uid("q"), createdAt: new Date().toISOString(), statusUpdatedAt: null };
  DB.queues.push(row); return clone(row);
}
export async function updateQueue(id, q) { return clone(upsert(DB.queues, { ...DB.queues.find((x) => x.id === id), ...q, id })); }
export async function updateQueueStatus(id, statusUpdate) {
  const u = buildQueueStatusUpdate(statusUpdate, new Date().toISOString());
  const cur = DB.queues.find((x) => x.id === id);
  return clone(upsert(DB.queues, { ...cur, status: u.status ?? cur.status, statusNote: u.status_note ?? cur.statusNote, statusUpdatedAt: u.status_updated_at }));
}
export async function deleteQueue(id) { remove(DB.queues, id); }
export async function fetchQueuesForRoomDate(roomId, date) {
  if (!roomId || !date) return [];
  return clone(DB.queues.filter((q) => q.roomId === roomId && q.date === date && !["cancelled", "no_show", "rescheduled"].includes(q.status)));
}

// ─── tickets / categories / logs / HN ───
export async function fetchTickets() { await delay(); return clone(DB.tickets); }
export async function createTicketDB(t) { const row = { imageUrls: [], adminNotes: "", ...t, id: uid("t"), createdAt: new Date().toISOString() }; DB.tickets.unshift(row); return clone(row); }
export async function updateTicketDB(id, t) { return clone(upsert(DB.tickets, { ...DB.tickets.find((x) => x.id === id), ...t, id })); }
export async function deleteTicketDB(id) { remove(DB.tickets, id); }
export async function fetchCategories() { await delay(); return [...DB.categories]; }
export async function createCategory(name) { if (!DB.categories.includes(name)) DB.categories.push(name); return name; }
export async function deleteCategory(name) { DB.categories = DB.categories.filter((c) => c !== name); }
export async function createActivityLog(log) { DB.activityLogs.unshift({ ...log, id: uid("l"), createdAt: new Date().toISOString() }); }
export async function fetchActivityLogs({ limit = 100, date = null } = {}) {
  await delay();
  return clone(DB.activityLogs.filter((l) => !date || l.createdAt.slice(0, 10) === date).slice(0, limit));
}
export async function fetchAllHnCustomers() { return []; }
export async function searchHnCustomers() { return []; }

export const getAllBranches = fetchBranches;
export const getAllProcedures = fetchProcedures;
export const getAllPromos = fetchPromos;
export const getAllRooms = fetchRooms;
export const getAllRoomSchedules = fetchRoomSchedules;
export const getAllStaff = fetchStaff;
export const getAllQueues = fetchQueues;
export const getAllCategories = fetchCategories;
