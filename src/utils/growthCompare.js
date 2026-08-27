// ตัวช่วยล้วนๆ ของโซน "เติบโต / ลดลง — ทำไมถึงเปลี่ยน" ในหน้า CEO Dashboard
// ใช้ร่วมกันทั้งโซนสาขาและโซนหัตถการ แยกออกมาจากหน้าเพื่อให้เทสจับเกณฑ์การจัดอันดับได้จริง
// (เกณฑ์พวกนี้ตั้งมาจากเคสจริงที่เคยพัง ถ้าไม่มีเทสคุมจะโดนแก้กลับโดยไม่มีใครรู้)

// ฐานเทียบ (ช่วงก่อนหน้า) น้อยกว่านี้ถือว่า % ไม่มีความหมาย — 1→587 กลายเป็น "+58600%" ซึ่งบอก
// อะไรไม่ได้เลย ทุกจุดที่โชว์ % เปลี่ยนแปลงในหน้านั้นใช้เกณฑ์เดียวกันหมด
export const SMALL_BASE = 10;

export const byCustomerType = (arr) => ({
  new: arr.filter((q) => q.customerType === "new").length,
  old: arr.filter((q) => q.customerType === "old").length,
  course: arr.filter((q) => q.customerType === "course").length,
});

// อัตรายกเลิก+ไม่มา พร้อมตัวตั้ง/ตัวหารดิบ — ต้องส่งตัวหารกลับไปด้วยเสมอ ไม่ใช่แค่ %
// เพราะ % จากคิวไม่กี่ใบไม่มีความหมาย (คิวใบเดียวโดนยกเลิก = "100%" ตัวแดง, ไม่โดน = "0%" ตัวเขียว
// ทั้งที่เป็นคิวใบเดียวกันเรื่องเดียวกัน) ฝั่งแสดงผลต้องเห็นตัวหารถึงจะเลือกได้ว่าจะโชว์ % หรือจำนวน
// rate เป็น null เมื่อไม่มีคิวเลย — ห้ามคืน 0 เพราะ "ไม่มีข้อมูล" ≠ "อัตรายกเลิก 0%"
export const lostStat = (arr) => {
  const total = arr.length;
  const lost = arr.filter((q) => q.status === "no_show" || q.status === "cancelled").length;
  return {
    lost,
    total,
    rate: total > 0 ? Math.round((lost / total) * 100) : null,
    // ฐานพอเชื่อ % ได้หรือยัง — ใช้เส้นเดียวกับ SMALL_BASE ที่ป้าย ▲▼% ใช้ กันหน้าเดียวกันมีสองมาตรฐาน
    reliable: total >= SMALL_BASE,
  };
};

// % เปลี่ยนแปลง — ฐาน 0 แต่มีคิวในช่วงนี้ถือเป็น +100 (ตัวเลขนี้ไม่ได้เอาไปโชว์อยู่ดี เพราะ
// prev=0 < SMALL_BASE จะโชว์เป็นจำนวนคิวแทน แต่ต้องมีค่าให้ตัวเรียงใช้)
export const changePct = (total, prev) => (prev > 0 ? Math.round(((total - prev) / prev) * 100) : (total > 0 ? 100 : 0));

// แยกกลุ่ม "ลดลง" ก่อน "เพิ่มขึ้น" เสมอ (ตัวที่แย่ลงน่าจะอยากเห็นก่อน) ภายในกลุ่มเรียงตาม
// "จำนวนคิวที่เปลี่ยนไปจริง" ไม่ใช่ % — คำถามของหน้านี้คือยอดหายไปไหน คำตอบคือจำนวน ไม่ใช่อัตรา
//
// เดิมเรียงด้วย % แล้วเจ้าของระบบทักว่า "ไม่เห็นว่าตัวไหนจำนวนลดเยอะสุด เห็นแต่ %" — ถูกต้อง
// ข้อมูลจริง 28 วัน: Hifu หาย 204 คิว (มากเป็นอันดับ 2 ทั้งเครือ) แต่ตกไปอันดับ 10 เพราะ -15%
// ดูไม่หวือหวา จนถูกซ่อนหลังปุ่ม "ดูเพิ่ม" ส่วน Oligio หายแค่ 17 คิวแต่ขึ้นอันดับ 1 เพราะ -94%
//
// ผลพลอยได้: พอเรียงด้วยจำนวน ของฐานเล็กก็จมท้ายเองโดยธรรมชาติ (1→2 = ขยับ 1 คิว) ไม่ต้องมีกฎ
// พิเศษดันมันลงเหมือนตอนเรียงด้วย % อีก — เหลือแค่กฎฝั่งแสดงผลที่ไม่โชว์ % เมื่อฐานน้อยกว่า SMALL_BASE
export function sortByChange(a, b) {
  const aDeclining = a.total < a.prev, bDeclining = b.total < b.prev;
  if (aDeclining !== bDeclining) return aDeclining ? -1 : 1;
  const aDelta = Math.abs(a.total - a.prev), bDelta = Math.abs(b.total - b.prev);
  if (aDelta !== bDelta) return bDelta - aDelta;
  // ขยับเท่ากันเป๊ะ — ให้ % ตัดสิน (หาย 5 จาก 10 หนักกว่าหาย 5 จาก 500)
  return Math.abs(b.ch) - Math.abs(a.ch);
}

// "ตัวที่เปลี่ยนแปลงมากสุด" ในกล่องรายละเอียด — นับของสองช่วงแล้วเอา 5 อันดับที่ขยับแรงสุด
// คีย์เป็น id เสมอ ไม่ใช่ชื่อ — ชื่อโปร/สาขาซ้ำกันได้ ใช้ชื่อเป็น React key ตรงๆ เสี่ยงชนกัน
export function topMovers(curCounts, prevCounts, nameOf, limit = 5) {
  return Array.from(new Set([...Object.keys(curCounts), ...Object.keys(prevCounts)]))
    .map((id) => {
      const c = curCounts[id] || 0, p = prevCounts[id] || 0;
      return { id, name: nameOf(id), cur: c, prev: p, delta: c - p };
    })
    .filter((m) => m.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, limit);
}
