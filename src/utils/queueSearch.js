// ─── การค้นหาคิวด้วยชื่อ/เบอร์ ───
//
// พนักงานหน้าร้านพิมพ์ชื่อลูกค้าเพื่อ "ตามหาคน" ไม่ใช่ "กรองตารางของวันนี้"
// โมดูลนี้เก็บกติกาการจับคู่ไว้ที่เดียว ใช้ร่วมกันทั้งฝั่งที่ค้นในฐานข้อมูล
// (supabaseService.searchQueues) และฝั่งที่กรองข้อมูลที่โหลดมาแล้วในหน้าจอ

// ตัวคั่นของ PostgREST .or() คือ comma กับวงเล็บ ส่วน % _ \ เป็น wildcard ของ ilike
// ถ้าหลุดเข้าไปในคำค้นจะทำให้ query พังหรือค้นมั่ว — ถอดทิ้งตั้งแต่ตรงนี้ที่เดียว
const UNSAFE = /[,()%_\\]/g;

// ตัดคำค้นเป็นคำ ๆ (ตัดช่องว่างซ้ำ/หัวท้ายทิ้ง) แล้วให้ทุกคำต้องเจอครบ
//
// ทำไมต้องแยกคำ: ชื่อในฐานข้อมูลพิมพ์กันมาหลายแบบ บางแถวเว้นวรรคสองครั้ง บางแถวมีคำ
// นำหน้าอย่าง "น.ส." บางแถวมีช่องว่างต่อท้าย พอจับคู่ทั้งประโยคเป็นก้อนเดียว พนักงาน
// ที่พิมพ์ "ชื่อ นามสกุล" จะหาไม่เจอ ต้องลบนามสกุลออกถึงจะเจอ แล้วนั่งเลื่อนหาเอง
// (เจอจริงหน้าร้าน 12 ก.ย. 2569) — แยกคำแล้วลำดับคำกับจำนวนช่องว่างไม่มีผลอีกต่อไป
//
// จำกัดไม่เกิน 4 คำ กันคนวางข้อความยาว ๆ ลงช่องค้นหาแล้วยิง query ยาวเป็นหางว่าว
export function searchWords(term, { maxWords = 4 } = {}) {
  return String(term || "")
    .replace(UNSAFE, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .slice(0, maxWords);
}

// คำค้นสั้นเกินไปไม่ควรยิงหาทั้งตาราง (พิมพ์ตัวเดียวแล้วได้ครึ่งคลินิก)
export function isSearchable(term) {
  const words = searchWords(term);
  return words.length > 0 && words.join("").length >= 2;
}

// จับคู่คิวที่โหลดมาแล้วในหน้าจอ — กติกาเดียวกับฝั่งฐานข้อมูล แต่ค้นชื่อผู้บันทึกได้ด้วย
// (ฝั่งฐานข้อมูลค้นไม่ได้เพราะผู้บันทึกเก็บเป็น id ไม่ใช่ข้อความในตารางคิว)
export function matchesQueueSearch(queue, term, recorderName = "") {
  const words = searchWords(term);
  if (words.length === 0) return true;
  const haystack = `${queue?.name || ""} ${queue?.phone || ""} ${recorderName}`.toLowerCase();
  return words.every((w) => haystack.includes(w.toLowerCase()));
}

// ─── จัดอันดับผลค้นหา ───
//
// พิมพ์ "สุดา" แล้วได้ทั้ง "สุดารัตน์" (ขึ้นต้นด้วยคำที่พิมพ์) และ "เชษฐ์สุดา" กับ
// "พรรณิภา สุดามาตร์" (ไปโผล่กลางคำ) ปนกันมั่ว คนอ่านต้องไล่เองทีละแถว
// ไม่ตัดทิ้งเพราะบางทีที่ต้องการก็อยู่กลางคำจริง ๆ แต่เอาที่ตรงกว่าขึ้นก่อน
//
// คะแนน: เบอร์ตรงเป๊ะ > เบอร์ขึ้นต้นด้วย > ชื่อขึ้นต้นด้วย > คำใดคำหนึ่งในชื่อขึ้นต้นด้วย > โผล่กลางคำ
export function rankQueueMatch(queue, term) {
  const words = searchWords(term);
  if (words.length === 0) return 0;
  const first = words[0].toLowerCase();
  const name = String(queue?.name || "").toLowerCase().trim();
  const phone = String(queue?.phone || "").replace(/[^0-9]/g, "");
  const digits = first.replace(/[^0-9]/g, "");

  if (digits.length >= 4 && phone === digits) return 100;
  if (digits.length >= 4 && phone.startsWith(digits)) return 90;
  if (name.startsWith(first)) return 80;
  if (name.split(/\s+/).some((w) => w.startsWith(first))) return 70;
  return 10;
}

// เรียงผล: ตรงกว่าขึ้นก่อน คะแนนเท่ากันเอาวันที่ใกล้ปัจจุบันขึ้นก่อน
export function sortSearchResults(rows, term) {
  return rows.slice().sort((a, b) => {
    const diff = rankQueueMatch(b, term) - rankQueueMatch(a, term);
    if (diff !== 0) return diff;
    if (a.date !== b.date) return String(b.date || "").localeCompare(String(a.date || ""));
    return (a.timeBlock ?? 0) - (b.timeBlock ?? 0);
  });
}
