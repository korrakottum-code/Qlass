// ปิดเตียงเป็นช่วงเวลาจากฟอร์ม "ตารางห้อง" — โมดูลล้วน ไม่มี import ทดสอบด้วย node ได้ตรง ๆ
//
// ปัญหาที่แก้ (เจ้าของ 31 ต.ค. 2569): เตียงหมอเปิดตามเวลาคลินิก 11:00–20:00 แต่หมอมาจริง
// เช่น 17:00–20:00 และแต่ละวันไม่เหมือนกัน หน้าคิวว่างเลยโชว์ช่องว่างที่จองไม่ได้จริง
// กติกาที่เจ้าของเคาะ: "ห้องอยู่ของมันปกติ แต่ไปปิดเวลาที่หมอยังไม่มาได้"
//   - เวลาเปิดปกติของเตียงไม่เปลี่ยน
//   - ปุ่ม "ปิด / ไม่พร้อม" เลือกได้ว่า ปิดทั้งวัน หรือ ปิดเฉพาะช่วงเวลา
//
// รูปแถว "ปิดเฉพาะช่วง" = { available: false, startBlock, endBlock } — ผู้อ่านทุกตัวรองรับอยู่แล้ว
// (helpers.isRoomBlockClosed, capacity.openBlocksForRoomDay, BookingPage, create_queue_v1)
// ไฟล์นี้จึงไม่สร้างกติกาใหม่ แค่ช่วยฟอร์มสร้างแถวแบบนั้น และหาคิวที่ค้างอยู่ในช่วงที่จะปิด
//
// ปิดแล้วคิวเดิมไม่ถูกย้าย — เตือนรายชื่อให้ยืนยันก่อน แบบเดียวกับปุ่มปิดเตียงรายวัน (bedSwitch.js)

export const BLOCKS_PER_HOUR = 12;
// ค่าเริ่มต้นตอนเลือก "ปิดเฉพาะช่วงเวลา": 11:00–17:00 (กรณีหมอเข้าเย็นที่เจอบ่อยสุด)
export const DEFAULT_CLOSE_START_BLOCK = 132;
export const DEFAULT_CLOSE_END_BLOCK = 204;

/** ความยาวช่วงเป็นข้อความไทย เช่น 72 บล็อก → "6 ชั่วโมง", 30 บล็อก → "2 ชั่วโมง 30 นาที" */
export function formatBlockDuration(blocks) {
  const minutes = Math.max(0, Math.round(Number(blocks) || 0)) * 5;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} นาที`;
  return m === 0 ? `${h} ชั่วโมง` : `${h} ชั่วโมง ${m} นาที`;
}

/**
 * แถวที่ฟอร์มส่งไปบันทึก ตามโหมดที่เลือก
 *   noteOnly          → available true, ไม่มีช่วงเวลา
 *   เปิด (ต่อเวลา)      → available true + ช่วงเวลา
 *   ปิดทั้งวัน          → available false, ไม่มีช่วงเวลา
 *   ปิดเฉพาะช่วงเวลา    → available false + ช่วงเวลา
 */
export function buildScheduleTiming({ noteOnly, available, closeRange, startBlock, endBlock }) {
  if (noteOnly) return { available: true, startBlock: null, endBlock: null };
  if (available) return { available: true, startBlock, endBlock };
  if (closeRange) return { available: false, startBlock, endBlock };
  return { available: false, startBlock: null, endBlock: null };
}

/**
 * คิวที่ยังครองเวลาอยู่ในเตียง/วันที่จะปิด — ไว้เตือนก่อนบันทึก
 * startBlock = null → ปิดทั้งวัน (ทุกคิวของเตียงนั้นวันนั้นโดน)
 * ช่วงเวลา → คิวที่เวลาทับช่วง [startBlock, endBlock) แม้บางส่วน
 * รับ isActiveQueueStatus จากผู้เรียก (อยู่ใน helpers.js) เพื่อให้ไฟล์นี้ไม่มี import
 */
export function findQueuesInClosure({ queues, procedures, roomIds, dates, startBlock, endBlock, isActiveQueueStatus }) {
  const active = typeof isActiveQueueStatus === "function" ? isActiveQueueStatus : () => true;
  const roomSet = new Set(roomIds || []);
  const dateSet = new Set((dates || []).filter(Boolean));
  if (roomSet.size === 0 || dateSet.size === 0) return [];
  const blocksById = {};
  (procedures || []).forEach((p) => { if (p) blocksById[p.id] = p.blocks; });
  const wholeDay = startBlock === null || startBlock === undefined;

  return (queues || [])
    .filter((q) => {
      if (!q || !roomSet.has(q.roomId) || !dateSet.has(q.date) || !active(q.status)) return false;
      if (wholeDay) return true;
      if (q.timeBlock === null || q.timeBlock === undefined) return false;
      const dur = Math.max(1, q.durationBlocks ?? blocksById[q.procedureId] ?? 1);
      return q.timeBlock < endBlock && q.timeBlock + dur > startBlock;
    })
    .slice()
    .sort((a, b) => (a.date === b.date ? (a.timeBlock ?? 0) - (b.timeBlock ?? 0) : a.date < b.date ? -1 : 1));
}
