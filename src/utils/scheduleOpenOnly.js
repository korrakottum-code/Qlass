// "เปิดเฉพาะช่วงเวลา" ในฟอร์มตารางห้อง — โมดูลล้วน ไม่มี import ทดสอบด้วย node ได้ตรง ๆ
//
// ปัญหาที่แก้ (เจ้าของ 23 พ.ย. 2569 "ตอนนี้เรามีปิดบางช่วง แต่อยากได้เปิดบางช่วงเพิ่ม"):
// ข้อมูลจริง 1–23 พ.ย. หน้าร้านกด "ปิดเช้า" + "ปิดเย็น" 2 รอบ ใน 1,820 เตียง-วัน เพื่อบอกว่า
// "หมออยู่แค่ช่วงกลาง" และปุ่ม "✅ เปิด" เดิม (ต่อเวลาอย่างเดียว) ถูกกรอกเป็นเวลาหมอ 605/625 แถว
// ซึ่งไม่มีผลเลย
//
// กติกาที่เจ้าของเคาะ:
//   - กรอกช่วงที่เปิดครั้งเดียว เช่น 13:00–18:00 → เวลาที่เหลือของเตียงวันนั้นปิดให้เอง
//     ถ้าช่วงเลยเวลาปกติของเตียง ก็ต่อเวลาให้ด้วย
//   - วันนั้นมีช่วงปิด/เปิดเดิมที่กรอกเอง → "แทนที่ของเดิม" (โชว์ให้ดูก่อน กดยืนยันแล้วลบ)
//   - ไม่แตะ "ปิดเตียง (พนักงานหยุด)" และ "ปิดทั้งวัน" — เตียงนั้นวันนั้นข้ามไป ต้องเปิดเตียงก่อน
//
// ┌── ไม่มีกติกาใหม่ฝั่งผู้อ่าน ──────────────────────────────────────────────┐
// │ ผลลัพธ์คือแถว room_schedules รูปเดิมล้วน ๆ                                  │
// │   ปิดเฉพาะช่วง { available:false, start, end }  /  เปิดต่อเวลา { available:true, start, end } │
// │ ผู้อ่านทุกตัว (helpers.isRoomBlockClosed, capacity, BookingPage, Timeline,    │
// │ create_queue_v1, booking_api_room_status_v1 ที่จองออนไลน์/บอทใช้) จึงเห็นตรงกันเอง │
// │ ไม่มี migration ไม่แตะ DB schema — แถวที่สร้าง source = null เหมือนกรอกเอง       │
// └──────────────────────────────────────────────────────────────────────────┘

const DEFAULT_OPEN = 132;  // 11:00 — ค่าเดียวกับ helpers.isRoomBlockClosed
const DEFAULT_CLOSE = 240; // 20:00

function hasRange(s) {
  return s && s.startBlock !== null && s.startBlock !== undefined && s.endBlock !== null && s.endBlock !== undefined;
}

/** แถวนี้เป็น "ปิดทั้งวัน" ไหม (คำนิยามเดียวกับ bedSwitch.isFullDayClosure — ซ้ำไว้เพื่อให้ไฟล์ไม่มี import) */
function isWholeDayClosure(s) {
  return !!s && !s.available && !s.noteOnly && !hasRange(s);
}

/** แถวช่วงเวลาที่คนกรอกเอง (ปิดเฉพาะช่วง หรือ เปิดต่อเวลา) — เป็นของที่ "แทนที่" ได้ */
function isReplaceableTimeRow(s) {
  return !!s && !s.noteOnly && hasRange(s) && (s.source === null || s.source === undefined || s.source === "");
}

/**
 * แถวที่ต้องสร้างให้เตียงหนึ่งเปิดเฉพาะ [startBlock, endBlock)
 *   ปิด [เวลาเปิดปกติ, startBlock)  ถ้าเริ่มช้ากว่าเวลาปกติ
 *   ปิด [endBlock, เวลาปิดปกติ)     ถ้าเลิกก่อนเวลาปกติ
 *   เปิด [startBlock, endBlock)     ถ้าช่วงเลยเวลาปกติออกไป (ต่อเวลา)
 */
function hhmm(block) {
  const m = block * 5;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** หมายเหตุอัตโนมัติเมื่อไม่ได้กรอก — ให้หน้าร้านเห็นว่าแถวปิดนี้มาจาก "เปิดเฉพาะช่วง" */
export function defaultOpenOnlyNote(startBlock, endBlock) {
  return `เปิดเฉพาะ ${hhmm(startBlock)}–${hhmm(endBlock)}`;
}

export function buildOpenOnlyRows({ room, startBlock, endBlock, note = "" }) {
  const ob = room?.openBlock ?? DEFAULT_OPEN;
  const cb = room?.closeBlock ?? DEFAULT_CLOSE;
  const rows = [];
  const text = String(note ?? "").trim() || defaultOpenOnlyNote(startBlock, endBlock);
  if (startBlock > ob) rows.push({ available: false, startBlock: ob, endBlock: Math.min(startBlock, cb), noteOnly: false, note: text });
  if (endBlock < cb) rows.push({ available: false, startBlock: Math.max(endBlock, ob), endBlock: cb, noteOnly: false, note: text });
  if (startBlock < ob || endBlock > cb) rows.push({ available: true, startBlock, endBlock, noteOnly: false, note: text });
  // startBlock < endBlock เสมอ ช่วงปิดหน้า/หลังจึงไม่ทับกัน; ช่วงที่อยู่นอกเวลาปกติทั้งก้อน
  // (เช่น ปกติ 11–20 เลือก 20–22) ได้ปิด 11–20 อันเดียว + เปิด 20–22
  return rows.filter((r) => r.startBlock < r.endBlock);
}

/**
 * วางแผน "เปิดเฉพาะช่วงเวลา" ให้ทุกเตียง × ทุกวันที่เลือก
 * คืน { beds: [{ roomId, date, create, remove, blocked }] }
 *   create  = แถวใหม่ (ยังไม่มี id) ใส่ roomId/date แล้ว
 *   remove  = แถวเดิมที่จะถูกแทนที่ (ช่วงเวลาที่กรอกเองทั้งหมดของเตียงวันนั้น)
 *   blocked = null หรือเหตุผลภาษาไทยที่ข้ามเตียงนี้ (ไม่สร้าง ไม่ลบอะไรเลย)
 * แถว "โน้ตอย่างเดียว" ไม่ถูกแตะ
 */
export function planOpenOnly({ rooms, roomSchedules, roomIds, dates, startBlock, endBlock, note = "" }) {
  const roomById = new Map((rooms || []).map((r) => [r.id, r]));
  const beds = [];
  if (!(endBlock > startBlock)) return { beds };
  for (const roomId of roomIds || []) {
    const room = roomById.get(roomId);
    for (const date of dates || []) {
      if (!date) continue;
      const sameDay = (roomSchedules || []).filter((s) => s.roomId === roomId && (s.date === date || s.date === "" || s.date === null));
      const wholeDay = sameDay.find(isWholeDayClosure);
      let blocked = null;
      if (wholeDay) {
        blocked = wholeDay.source === "bed_switch"
          ? "เตียงปิดทั้งวัน (ปิดเตียง พนักงานหยุด) — ต้องเปิดเตียงก่อน"
          : "เตียงปิดทั้งวันอยู่ — ต้องลบ \"ปิดทั้งวัน\" ก่อน";
      } else {
        // ช่วงปิดที่ลบไม่ได้ (ปุ่มปิดเตียง / ใช้ทุกวัน) แต่ทับช่วงที่จะเปิด → เปิดไม่ได้จริง ข้ามไปดีกว่าบอกว่าเปิดแล้ว
        const stuck = sameDay.find((s) => !s.available && hasRange(s) && !(isReplaceableTimeRow(s) && s.date === date)
          && s.startBlock < endBlock && startBlock < s.endBlock);
        if (stuck) blocked = "มีช่วงปิดจากปุ่มปิดเตียงทับช่วงที่จะเปิด — ต้องเปิดเตียงก่อน";
      }
      if (blocked) {
        beds.push({ roomId, date, create: [], remove: [], blocked });
        continue;
      }
      const remove = sameDay.filter((s) => s.date === date && isReplaceableTimeRow(s));
      const create = buildOpenOnlyRows({ room, startBlock, endBlock, note }).map((r) => ({ ...r, roomId, date }));
      beds.push({ roomId, date, create, remove, blocked: null });
    }
  }
  return { beds };
}

/** สรุปแผนเป็นตัวเลขไว้โชว์/ยืนยัน */
export function summarizeOpenOnlyPlan(plan) {
  const beds = plan?.beds || [];
  const ok = beds.filter((b) => !b.blocked);
  return {
    bedDays: ok.length,
    blocked: beds.filter((b) => b.blocked),
    createCount: ok.reduce((n, b) => n + b.create.length, 0),
    removeCount: ok.reduce((n, b) => n + b.remove.length, 0),
    replaced: ok.flatMap((b) => b.remove),
  };
}

/**
 * คิวที่ยังครองเวลาอยู่นอกช่วงที่จะเปิด (จะตกไปอยู่ในเวลาปิด) — เตือนก่อนบันทึก คิวไม่ถูกย้าย
 * ดูเฉพาะเตียง-วันที่ไม่ถูกข้าม และนับเฉพาะคิวที่มีเวลา
 */
export function findQueuesOutsideOpenWindow({ plan, queues, procedures, startBlock, endBlock, isActiveQueueStatus }) {
  const active = typeof isActiveQueueStatus === "function" ? isActiveQueueStatus : () => true;
  const keys = new Set((plan?.beds || []).filter((b) => !b.blocked).map((b) => `${b.roomId}|${b.date}`));
  if (keys.size === 0) return [];
  const blocksById = {};
  (procedures || []).forEach((p) => { if (p) blocksById[p.id] = p.blocks; });
  return (queues || [])
    .filter((q) => {
      if (!q || !keys.has(`${q.roomId}|${q.date}`) || !active(q.status)) return false;
      if (q.timeBlock === null || q.timeBlock === undefined) return false;
      const dur = Math.max(1, q.durationBlocks ?? blocksById[q.procedureId] ?? 1);
      return q.timeBlock < startBlock || q.timeBlock + dur > endBlock;
    })
    .slice()
    .sort((a, b) => (a.date === b.date ? (a.timeBlock ?? 0) - (b.timeBlock ?? 0) : a.date < b.date ? -1 : 1));
}
