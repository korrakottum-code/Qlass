// เตียงไหนทำหัตถการอะไรได้ — โมดูลล้วน ไม่มี import ทดสอบด้วย node ได้ตรง ๆ
//
// พื้นหลัง: ระบบเดิมล็อกแค่ระดับประเภทห้อง (M = ห้องหมอ / T = เตียงเครื่อง) แปลว่า
// หัตถการฝั่ง T ทุกตัวลงได้ทุกเตียง T — pico จึงลงเตียง diode ได้ ทั้งที่หน้างานทำไม่ได้จริง
// ตารางใหม่ room_procedures ผูก "เตียง → หัตถการที่เตียงนั้นรับ" ต่อสาขา (ห้องผูกสาขาอยู่แล้ว)
//
// ┌── กติกาสำคัญที่สุดของไฟล์นี้ ─────────────────────────────────────────────┐
// │ เตียงที่ "ยังไม่ได้ตั้งค่า" (ไม่มีแถวใน room_procedures เลย) ใช้กติกาเดิม     │
// │ คือเทียบ M/T เหมือนทุกวันนี้ — ไม่ใช่ "ห้ามทุกอย่าง"                          │
// │                                                                          │
// │ เหตุผล: 29 สาขาเปิดใช้พร้อมกันไม่ได้ ต้องทยอยตั้งทีละสาขา ถ้าเตียงที่ยังไม่  │
// │ ตั้งค่าแปลว่าห้ามหมด วันที่ deploy ทั้งเครือจะลงคิวไม่ได้ทันที                  │
// │ กติกานี้ทำให้ deploy แล้วพฤติกรรมไม่เปลี่ยนเลยจนกว่าจะมีคนตั้งค่าเตียงนั้น      │
// └──────────────────────────────────────────────────────────────────────────┘
//
// ทุกจุดที่ลงคิวได้ต้องเรียกผ่านไฟล์นี้ ห้ามเขียนกติกาซ้ำเอง ไม่งั้นจะหลุดกันคนละทาง

/**
 * links: [{ roomId, procedureId }] จาก DB
 * คืน Map<roomId, Set<procedureId>> — เตียงที่ไม่มี key = ยังไม่ตั้งค่า
 */
export function buildRoomProcedureIndex(links) {
  const index = new Map();
  (links || []).forEach((link) => {
    if (!link || !link.roomId || !link.procedureId) return;
    let set = index.get(link.roomId);
    if (!set) {
      set = new Set();
      index.set(link.roomId, set);
    }
    set.add(link.procedureId);
  });
  return index;
}

// เตียงนี้ตั้งค่าไว้แล้วหรือยัง — เตียงที่เคยตั้งแล้วถูกเอาออกจนหมดถือว่า "ยังไม่ตั้งค่า"
// เหมือนกัน (Set ว่างจะไม่ถูกสร้างจาก buildRoomProcedureIndex อยู่แล้ว แต่กันไว้เผื่อผู้เรียก
// ส่ง index ที่ประกอบเอง)
export function isRoomConfigured(index, roomId) {
  const set = index?.get?.(roomId);
  return !!set && set.size > 0;
}

/**
 * หัตถการนี้ลงเตียงนี้ได้ไหม — จุดตัดสินใจเดียวของทั้งระบบ
 * room / procedure เป็น object (ไม่ใช่ id) เพราะต้องใช้ roomType ตอน fallback
 */
export function isProcedureAllowedInRoom(index, room, procedure) {
  if (!room || !procedure) return false;

  // ตั้งค่าแล้ว → ยึดตามที่ตั้ง (ล็อกจริง)
  if (isRoomConfigured(index, room.id)) {
    return index.get(room.id).has(procedure.id);
  }

  // ยังไม่ตั้งค่า → กติกาเดิม M/T
  return procedure.roomType === room.type;
}

/** หัตถการทั้งหมดที่เตียงนี้รับ — ใช้กรอง dropdown ในหน้าลงคิว */
export function proceduresForRoom(index, room, procedures) {
  if (!room) return procedures || [];
  return (procedures || []).filter((procedure) => isProcedureAllowedInRoom(index, room, procedure));
}

/** เตียงทั้งหมดในสาขาที่รับหัตถการนี้ — ใช้ตอนเลือกหัตถการก่อนแล้วค่อยเลือกเตียง */
export function roomsForProcedure(index, rooms, procedure, branchId) {
  if (!procedure) return rooms || [];
  return (rooms || []).filter((room) => {
    if (branchId && room.branchId !== branchId) return false;
    return isProcedureAllowedInRoom(index, room, procedure);
  });
}

/**
 * หัตถการที่ "ไม่มีเตียงไหนในสาขานี้รองรับเลย" — ไว้เตือนในหน้าตั้งค่า
 *
 * นี่คือกับดักหลักของฟีเจอร์นี้: ติ๊กพลาดหนึ่งช่องแล้วหัตถการนั้นลงคิวไม่ได้ทั้งสาขา
 * โดยไม่มีใครรู้จนกว่าลูกค้าจะโทรมา — หน้าตั้งค่าต้องเรียกอันนี้แล้วโชว์เสมอ
 *
 * นับเฉพาะสาขาที่ "เริ่มตั้งค่าแล้วอย่างน้อยหนึ่งเตียง" เพราะสาขาที่ยังไม่แตะเลย
 * ยังวิ่งด้วยกติกาเดิม ไม่มีอะไรพัง จึงไม่ต้องเตือน
 */
export function unservedProcedures(index, rooms, procedures, branchId) {
  const branchRooms = (rooms || []).filter((room) => room.branchId === branchId);
  if (branchRooms.length === 0) return [];

  const started = branchRooms.some((room) => isRoomConfigured(index, room.id));
  if (!started) return [];

  return (procedures || []).filter((procedure) => {
    // หัตถการฝั่ง M ยังวิ่งด้วยกติกาเดิม ตราบใดที่ยังไม่มีใครตั้งค่าห้อง M
    const candidates = branchRooms.filter((room) => room.type === procedure.roomType);
    if (candidates.length === 0) return false;
    return !candidates.some((room) => isProcedureAllowedInRoom(index, room, procedure));
  });
}

/**
 * ต้องตรวจกฎนี้กับการบันทึกครั้งนี้ไหม — "สกรีนเฉพาะของที่ลงใหม่"
 *
 * เดือน ส.ค. 2569 คือช่วงเปลี่ยนผ่านจากผังเดิม (M/T ล้วน) มาเป็นแยกเครื่องรายเตียง
 * คิวที่จองไว้ก่อนหน้ายังวางตามผังเก่าอยู่หลายพันคิว ถ้าบังคับกฎกับทุกการบันทึก
 * หน้าร้านจะแก้คิวเก่าไม่ได้เลย ทั้งที่แค่จะเลื่อนเวลาหรือแก้ชื่อ
 *
 * กติกา:
 *   - สร้างใหม่           → ตรวจเสมอ
 *   - แก้ของเดิม           → ตรวจเฉพาะเมื่อ "ย้ายเตียง" หรือ "เปลี่ยนหัตถการ"
 *
 * ไม่ปล่อยผ่านทั้งดุ้นเพราะคิวเก่าจะกลายเป็นช่องโหว่: เปิดคิวเก่าขึ้นมาแล้วย้ายไป
 * เตียงไหนก็ได้โดยไม่โดนตรวจ การย้ายเตียง/เปลี่ยนหัตถการคือการวางคิวใหม่ในทางปฏิบัติ
 */
export function shouldEnforceOnSave(originalQueue, nextForm) {
  if (!originalQueue) return true; // สร้างใหม่

  const movedRoom = (originalQueue.roomId || "") !== (nextForm?.roomId || "");
  const changedProcedure = (originalQueue.procedureId || "") !== (nextForm?.procedureId || "");
  return movedRoom || changedProcedure;
}

/** ข้อความบอกเหตุผลตอนบล็อก — ใช้ถ้อยคำเดียวกันทุกหน้าจอ */
export function procedureRoomBlockMessage(room, procedure) {
  const roomName = room?.name || "เตียงนี้";
  const procedureName = procedure?.name || "หัตถการนี้";
  return `❌ ${roomName} ไม่รับคิว ${procedureName} — กรุณาเลือกเตียงอื่นหรือแก้ที่หน้าจัดการห้อง`;
}
