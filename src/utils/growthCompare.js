// ตัวช่วยล้วนๆ ของโซน "เติบโต / ลดลง — ทำไมถึงเปลี่ยน" ในหน้า CEO Dashboard
// ใช้ร่วมกันทั้งโซนสาขาและโซนหัตถการ แยกออกมาจากหน้าเพื่อให้เทสจับเกณฑ์การจัดอันดับได้จริง
// (เกณฑ์พวกนี้ตั้งมาจากเคสจริงที่เคยพัง ถ้าไม่มีเทสคุมจะโดนแก้กลับโดยไม่มีใครรู้)

// ตัวหารน้อยกว่านี้ถือว่า % ไม่มีความหมาย ใช้เส้นเดียวกันสองที่ (คนละตัวหาร แต่เจตนาเดียวกัน
// คือ "อย่าโชว์ % จากตัวอย่างไม่กี่ชิ้น" — จงใจให้เป็นเลขเดียว ไม่งั้นหน้าเดียวกันมีสองมาตรฐาน):
//   1. ป้าย ▲▼% ใช้กับ "ยอดช่วงก่อนหน้า" — prev=1 → total=587 คือ "+58600%" ซึ่งบอกอะไรไม่ได้
//   2. lostStat ใช้กับ "จำนวนคิวในช่วงนั้น" — คิวใบเดียวโดนยกเลิกคือ "100%" ซึ่งก็บอกอะไรไม่ได้
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

// ทั้งสองโหมดแยกกลุ่ม "ลดลง" ก่อน "เพิ่มขึ้น" เสมอ (ตัวที่แย่ลงน่าจะอยากเห็นก่อน) ต่างกันแค่
// เกณฑ์เรียงภายในกลุ่ม — ไม่มีโหมดไหน "ถูก" กว่าอีกโหมด มันตอบคนละคำถาม:
//
//   จำนวนคิว → "ยอดที่หายไปอยู่ที่ไหน" เหมาะกับหัตถการที่ % กระจายตั้งแต่ -1% ถึง -94%
//   % ตกหนัก → "ใครกำลังแย่ลงเมื่อเทียบกับตัวเอง" เหมาะกับสาขาที่ % เกาะกลุ่มกันที่ -2% ถึง -15%
//                จนการเรียงด้วยจำนวนกลายเป็นเรียงตามขนาดสาขาไปโดยปริยาย
//
// (ข้อมูลจริง 28 วัน: โหมดจำนวนดัน Hifu -204 คิว ขึ้นอันดับ 2 จากที่เคยจมอันดับ 10 เพราะเป็นแค่
// -15% ส่วนโหมด % ดันสุรินทร์ -15% ขึ้นมาจากอันดับ 9 ที่ถูกซ่อนหลังปุ่ม "ดูเพิ่ม")
const decliningFirst = (a, b) => {
  const aDeclining = a.total < a.prev, bDeclining = b.total < b.prev;
  if (aDeclining === bDeclining) return 0;
  return aDeclining ? -1 : 1;
};

// โหมด "จำนวนคิว" — ของฐานเล็กจมท้ายเองโดยธรรมชาติ (1→2 = ขยับ 1 คิว) ไม่ต้องมีกฎพิเศษ
export function sortByQueueCount(a, b) {
  const group = decliningFirst(a, b);
  if (group !== 0) return group;
  const aDelta = Math.abs(a.total - a.prev), bDelta = Math.abs(b.total - b.prev);
  if (aDelta !== bDelta) return bDelta - aDelta;
  // ขยับเท่ากันเป๊ะ — ให้ % ตัดสิน (หาย 5 จาก 10 หนักกว่าหาย 5 จาก 500)
  return Math.abs(b.ch) - Math.abs(a.ch);
}

// โหมด "% ตกหนัก" — ต้องมีกฎดันฐานเล็กลงท้ายกลุ่ม ไม่งั้นของที่ % บวมเทียม (prev=1 → total=587
// คือ "+58600%") แย่งอันดับต้นจากของที่เปลี่ยนแปลงจริง ซึ่งเป็นบั๊กเดิมที่เคยแก้ไปแล้วรอบหนึ่ง
export function sortByPercent(a, b) {
  const group = decliningFirst(a, b);
  if (group !== 0) return group;
  const aSmall = a.prev < SMALL_BASE, bSmall = b.prev < SMALL_BASE;
  if (aSmall !== bSmall) return aSmall ? 1 : -1;
  // ฐานเล็กทั้งคู่ — ch% ไม่มีความหมายสำหรับกลุ่มนี้แล้ว (เหตุผลเดียวกับที่ไม่โชว์ % บนหน้าจอ)
  if (aSmall && bSmall) return Math.abs(b.total - b.prev) - Math.abs(a.total - a.prev);
  if (Math.abs(a.ch) !== Math.abs(b.ch)) return Math.abs(b.ch) - Math.abs(a.ch);
  // % เท่ากันเป๊ะ — ให้จำนวนตัดสิน กันสองสาขาที่ -15% เท่ากันสลับที่กันมั่วทุกครั้งที่ re-render
  return Math.abs(b.total - b.prev) - Math.abs(a.total - a.prev);
}

// "count" = จำนวนคิว (ค่าเริ่มต้น), "pct" = % ตกหนัก — ชื่อโหมดใช้ร่วมกันทั้ง state ในหน้าและที่นี่
export const sorterFor = (mode) => (mode === "pct" ? sortByPercent : sortByQueueCount);

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
