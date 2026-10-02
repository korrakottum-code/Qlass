// กติกา "ห้ามลงคิวย้อนหลัง" — pure logic ไม่มี dependency (1 block = 5 นาที นับจากเที่ยงคืน)
// ใช้ร่วมกันทุกทางที่ "สร้าง" คิวใหม่: หน้าบันทึกคิว, Timeline, วางข้อความหลายคิว, เลื่อนนัด
//
// ตรวจเฉพาะ "วันที่" (วันที่ผ่านไปแล้วลงไม่ได้) — เวลาของวันนี้ยังลงย้อนได้
// เหตุผล: ข้อมูลจริง 30 วัน (ก.ย.–ต.ค. 2569) มีคิวที่สาขาลงหลังเวลานัดในวันเดียวกัน ~1,400 คิว
// (~47/วัน ส่วนใหญ่บัญชีผู้จัดการสาขา ปิดเป็น "เสร็จ" แล้ว = ลูกค้ามาทำจริงแล้วลงบันทึกทีหลัง)
// ถ้าห้ามเวลาด้วย งานปกติจะลงไม่ได้ ยอด/ค่าคอมตกหล่น ต้องให้เจ้าของตัดสินใจก่อนเปิด
// เปิดโดยเปลี่ยน BLOCK_PAST_TIME_TODAY เป็น true (ช่องเวลาปัจจุบันยังลงได้เสมอ)

export const BLOCK_PAST_TIME_TODAY = false;

export const BACKDATE_MESSAGE = "ไม่สามารถลงคิวย้อนหลังได้ — วันที่เลือกผ่านไปแล้ว";

function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function currentBlockOf(now = new Date()) {
  return now.getHours() * 12 + Math.floor(now.getMinutes() / 5);
}

export function isPastPlacement(date, timeBlock, now = new Date(), blockPastTime = BLOCK_PAST_TIME_TODAY) {
  if (!date) return false;
  const today = localDateStr(now);
  if (date < today) return true;
  if (date > today || !blockPastTime) return false;
  if (timeBlock === null || timeBlock === undefined || timeBlock === "") return false;
  return Number(timeBlock) < currentBlockOf(now);
}
