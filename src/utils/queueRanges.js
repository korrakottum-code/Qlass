// ช่วงวันที่ของ queues ที่โหลดเข้า state แล้ว — pure logic (unit test ได้ตรง ๆ)
//
// แอปโหลด 30 วันล่าสุดตอนเปิด แล้วหน้าที่ต้องการข้อมูลเก่ากว่านั้น (ค่าคอม/Export/CEO/สรุป/Capacity)
// บอกช่วงที่ต้องการมา → App ดึงเฉพาะ "ช่องว่าง" ที่ยังไม่มี แล้วจดไว้ว่าโหลดแล้ว จะได้ไม่ดึงซ้ำ
// วันที่ทุกตัวเป็น "YYYY-MM-DD" (เทียบ string ตรง ๆ ได้)

const DAY_MS = 86400000;

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function daysBetween(a, b) {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((new Date(by, bm - 1, bd) - new Date(ay, am - 1, ad)) / DAY_MS);
}

// รวมช่วงที่ทับกันหรือติดกัน (ห่างกัน 1 วัน) ให้เป็นก้อนเดียว คืนลิสต์ใหม่เรียงตาม from
export function mergeRanges(ranges) {
  const sorted = [...ranges].filter((r) => r && r.from && r.to && r.from <= r.to).sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  const out = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && daysBetween(last.to, r.from) <= 1) {
      if (r.to > last.to) last.to = r.to;
    } else {
      out.push({ from: r.from, to: r.to });
    }
  }
  return out;
}

// ช่วงย่อยของ [from,to] ที่ยังไม่ถูกครอบด้วย loaded (loaded ต้องผ่าน mergeRanges มาแล้วหรือไม่ก็ได้)
// คืน [] ถ้าครอบครบแล้ว — caller ไม่ต้องยิงอะไร
export function findUncoveredRanges(loaded, from, to) {
  if (!from || !to || from > to) return [];
  const merged = mergeRanges(loaded);
  const gaps = [];
  let cursor = from;
  for (const r of merged) {
    if (r.to < cursor) continue;
    if (r.from > to) break;
    if (r.from > cursor) gaps.push({ from: cursor, to: addDays(r.from, -1) });
    // r ครอบถึง to แล้ว → จบ (เช็คก่อน addDays: ขอบบน "9999-12-31" บวก 1 วันจะได้ปี 5 หลัก เทียบ string ไม่ได้)
    if (r.to >= to) return gaps;
    cursor = addDays(r.to, 1);
  }
  gaps.push({ from: cursor, to });
  return gaps;
}
