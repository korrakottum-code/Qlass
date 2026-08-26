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

// คืน null เมื่อไม่มีคิวเลย — ห้ามคืน 0 เพราะ "ไม่มีข้อมูล" ≠ "อัตรายกเลิก 0%" (จะโชว์เขียวหลอกๆ)
export const lostRateOf = (arr) => arr.length > 0
  ? Math.round((arr.filter((q) => q.status === "no_show" || q.status === "cancelled").length / arr.length) * 100)
  : null;

// % เปลี่ยนแปลง — ฐาน 0 แต่มีคิวในช่วงนี้ถือเป็น +100 (ตัวเลขนี้ไม่ได้เอาไปโชว์อยู่ดี เพราะ
// prev=0 < SMALL_BASE จะโชว์เป็นจำนวนคิวแทน แต่ต้องมีค่าให้ตัวเรียงใช้)
export const changePct = (total, prev) => (prev > 0 ? Math.round(((total - prev) / prev) * 100) : (total > 0 ? 100 : 0));

// แยกกลุ่ม "ลดลง" ก่อน "เพิ่มขึ้น" เสมอ (ตัวที่แย่ลงน่าจะอยากเห็นก่อน) ภายในแต่ละกลุ่มเรียงตามขนาด
// การเปลี่ยนแปลงมากไปน้อย ไม่ใช่ตามยอดคิวรวม — เพราะหัวข้อคือ "ทำไมถึงเปลี่ยน" ควรเห็นตัวที่ขยับ
// แรงสุดก่อน ไม่ใช่ตัวที่คิวเยอะสุด แถวที่ฐานเทียบน้อยเกินไป (prev<SMALL_BASE, % ไม่มีความหมาย)
// จมไว้ท้ายกลุ่มเสมอ กันไม่ให้ของที่ % บวมเทียม (เช่น 1→587) ไปแย่งอันดับต้นจากของที่เปลี่ยนจริง
export function sortByChange(a, b) {
  const aDeclining = a.total < a.prev, bDeclining = b.total < b.prev;
  if (aDeclining !== bDeclining) return aDeclining ? -1 : 1;
  const aSmall = a.prev < SMALL_BASE, bSmall = b.prev < SMALL_BASE;
  if (aSmall !== bSmall) return aSmall ? 1 : -1;
  // ฐานเล็กทั้งคู่ — ch% ไม่มีความหมายสำหรับกลุ่มนี้แล้ว (เหตุผลเดียวกับที่ไม่โชว์ % บนหน้าจอ)
  // เรียงด้วยจำนวนที่เปลี่ยนไปจริงแทน ไม่ใช่ % ที่บวมเทียม
  if (aSmall && bSmall) return Math.abs(b.total - b.prev) - Math.abs(a.total - a.prev);
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
