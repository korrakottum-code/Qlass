// บริเวณของหัตถการ (เช่น Diode: รักแร้ / แขน / ขา / hollywood) — โมดูลล้วน ไม่มี import
// ทดสอบด้วย node ได้ตรง ๆ
//
// พื้นหลัง: หัตถการหนึ่งตัวมีเวลาเดียว (procedures.blocks) แต่หน้างานจริง Diode ทำได้
// หลายบริเวณ และแต่ละบริเวณใช้เวลาไม่เท่ากัน ผลคือแอดมินต้องกด +/- แก้เวลาเองทุกคิว
// ซึ่งไม่มีใครทำ — ข้อมูล มี.ค.-ก.ย. 2026 มีคิว Diode 49,773 คิว เป็น 15 นาทีเป๊ะ
// 47,576 คิว (95.6%) ตารางเตียงจึงไม่ตรงกับความจริง
//
// ┌── กติกาสำคัญที่สุดของไฟล์นี้ ─────────────────────────────────────────────┐
// │ หัตถการที่ "ยังไม่ได้ตั้งค่าบริเวณ" (ไม่มีแถวใน procedure_areas เลย)        │
// │ ต้องทำงานเหมือนทุกวันนี้เป๊ะ — ไม่มีปุ่มโผล่ ไม่มีเวลาเปลี่ยน                  │
// │                                                                          │
// │ เหตุผลเดียวกับ room_procedures: ของขึ้น production ตอนมีคนใช้อยู่ ~100 คน   │
// │ ต้องทยอยเปิดทีละหัตถการ/สาขา วันที่ deploy ต้องไม่มีอะไรขยับสักอย่าง         │
// │ สวิตช์ปิดฉุกเฉินคือ "ลบแถวบริเวณทิ้ง" ไม่ต้อง deploy ใหม่                    │
// └──────────────────────────────────────────────────────────────────────────┘
//
// เวลาที่คำนวณได้จากบริเวณจะถูกเขียนลง queues.duration_blocks ช่องเดิมที่ทุกหน้าอ่านอยู่แล้ว
// (ตารางเตียง / เช็คคิวชน / ความจุ / คอมมิชชั่น / export) — ไม่มีหน้าไหนต้องรู้จักคำว่า
// "บริเวณ" และไม่มีคอลัมน์ใหม่ในตาราง queues

/**
 * areas: [{ id, procedureId, name, blocks, sortOrder, active }] จาก DB
 * คืน Map<procedureId, area[]> เรียงตาม sortOrder แล้วชื่อ — เอาเฉพาะที่ active
 * หัตถการที่ไม่มี key = ยังไม่ตั้งค่า
 */
export function buildProcedureAreaIndex(areas) {
  const index = new Map();
  (areas || []).forEach((area) => {
    if (!area || !area.id || !area.procedureId) return;
    if (area.active === false) return;
    if (!(Number(area.blocks) >= 1)) return; // บริเวณที่เวลาไม่ถูกต้องถือว่าไม่มี
    const list = index.get(area.procedureId) || [];
    list.push(area);
    index.set(area.procedureId, list);
  });
  index.forEach((list) => {
    list.sort((a, b) => {
      const sa = a.sortOrder ?? 0, sb = b.sortOrder ?? 0;
      if (sa !== sb) return sa - sb;
      return String(a.name || "").localeCompare(String(b.name || ""), "th");
    });
  });
  return index;
}

/** บริเวณของหัตถการนี้ — ไม่มี = [] เสมอ ผู้เรียกไม่ต้องเช็ค null */
export function areasForProcedure(index, procedureId) {
  if (!procedureId) return [];
  return index?.get?.(procedureId) || [];
}

/** หัตถการนี้เปิดใช้บริเวณแล้วหรือยัง — ตัวตัดสินว่าจะโชว์ปุ่มบริเวณในหน้าลงคิวไหม */
export function procedureHasAreas(index, procedureId) {
  return areasForProcedure(index, procedureId).length > 0;
}

/**
 * รวมเวลาของบริเวณที่เลือก — เลือกหลายจุดเวลาบวกกัน (ลูกค้าทำรักแร้+ขาในคิวเดียว)
 * id ซ้ำนับครั้งเดียว id ที่ไม่รู้จักข้ามไป
 */
export function sumAreaBlocks(areas, selectedIds) {
  const wanted = new Set(selectedIds || []);
  if (wanted.size === 0) return 0;
  let total = 0;
  (areas || []).forEach((area) => {
    if (!area || !wanted.has(area.id)) return;
    const blocks = Number(area.blocks);
    if (blocks >= 1) total += blocks;
  });
  return total;
}

/**
 * เวลาที่ควรใช้ของคิวนี้ จากบริเวณที่เลือก
 * คืน null = "ไม่ได้กำหนดจากบริเวณ" ให้ผู้เรียกใช้ค่าปกติของหัตถการเหมือนเดิม
 * (ยังไม่เลือกบริเวณ / หัตถการนี้ไม่มีบริเวณ / เลือกแต่ id ที่ไม่รู้จัก)
 */
export function durationFromAreas(index, procedureId, selectedIds) {
  const areas = areasForProcedure(index, procedureId);
  if (areas.length === 0) return null;
  const total = sumAreaBlocks(areas, selectedIds);
  return total >= 1 ? total : null;
}

/**
 * ตัดบริเวณที่ไม่ได้อยู่ในหัตถการปัจจุบันทิ้ง — ใช้ตอนผู้ใช้เปลี่ยนหัตถการ
 * กันเวลาค้างจากบริเวณของหัตถการเก่า
 */
export function keepValidAreaIds(index, procedureId, selectedIds) {
  const valid = new Set(areasForProcedure(index, procedureId).map((a) => a.id));
  return (selectedIds || []).filter((id) => valid.has(id));
}
