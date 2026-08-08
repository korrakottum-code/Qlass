// กติกาคิวรอ (Waiting Queue) — pure logic ไม่มี dependency เพื่อให้ unit test ได้ตรง ๆ
// (helpers.js re-export ให้ฝั่งแอปใช้ต่อ)

// สถานะที่ยังถือว่า "ยังไม่ยืนยัน" — ต้องรอ/โทรตามอยู่
export const UNCONFIRMED_QUEUE_STATUSES = ["pending", "follow1", "follow2", "follow3"];

// เวลาตัดรอบเตือน = 12:00 (block 144, 1 block = 5 นาที)
export const UNCONFIRMED_WARNING_BLOCK = 144;

// คำนำหน้าคงที่ใน statusNote ไว้บอกว่าคิวนี้ถูกย้ายเข้าคิวรอเพราะเลยเวลายืนยัน
// (ไม่ใช่ walk-in ที่ไม่เคยมีห้อง/เวลามาตั้งแต่แรก) — ใช้แยกแท็บในหน้าคิวรอ โดยไม่ต้องเพิ่มคอลัมน์ใหม่
export const OVERDUE_MOVE_NOTE_PREFIX = "🕐 เดิมนัด";

function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// คิวลงล่วงหน้าที่ยังไม่ยืนยันเมื่อถึงวันนัดและเลยเวลาตัดรอบแล้ว (เตือนเท่านั้น ไม่ auto ย้าย)
export function isOverdueUnconfirmed(queue, now = new Date()) {
  if (queue.date !== localDateStr(now)) return false;
  if (!UNCONFIRMED_QUEUE_STATUSES.includes(queue.status || "pending")) return false;
  const currentBlock = now.getHours() * 12 + Math.floor(now.getMinutes() / 5);
  return currentBlock >= UNCONFIRMED_WARNING_BLOCK;
}

// statusNote นี้เป็นของคิวที่ถูก "ย้ายเข้าคิวรอเพราะเลยเวลายืนยัน" หรือไม่
export function isOverdueMoveNote(statusNote) {
  return (statusNote || "").startsWith(OVERDUE_MOVE_NOTE_PREFIX);
}
