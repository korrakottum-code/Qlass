// หาเบอร์มือถือไทยในข้อความที่วาง (LINE/แชท) — โมดูลล้วน ไม่มี import ทดสอบด้วย node ได้ตรง ๆ
// (smartParser.js import ตรง ๆ ใน node ไม่ได้ เพราะ import ไฟล์ข้างเคียงแบบไม่มีนามสกุล)
//
// ที่มา (26 ก.ย. 2569): ตัวอ่านเดิมต้องมีตัวเลขติดกัน 3 ตัวแรก (0[689]\d) จึงอ่าน "08-9999-1111" และ "06 1234 5678"
// ไม่ออก ทั้งที่พนักงานพิมพ์แบบนี้บ่อย → ช่องเบอร์ว่าง ต้องกรอกเอง (ต้นทางหนึ่งของเบอร์ปลอม ดู memory junk-phone-placeholders)
//
// กติกา "ไม่แย่ลงกว่าเดิม": ตรรกะเดิมทุกบรรทัดคงไว้ (LEGACY_PATTERNS) เพิ่มเฉพาะรูปแบบที่คั่นหลัก 2 ตัวแรกด้วยขีด/เว้นวรรค
// แล้วเลือกตัวที่อยู่ซ้ายสุดในข้อความ (เท่ากัน = ตัวเดิม) เหมือนที่ตัวเดิมเลือกเบอร์แรกในบรรทัด
// รูปแบบใหม่เข้มโดยตั้งใจ (4-4 หรือ 8 หลักติดกันหลังตัวคั่น) และกันวันที่/เวลา: ไม่ให้ติดหลัง/หน้า ตัวเลข / : .
// เช่น "08-09-2569", "06 05 2569", "5/06 1234 5678" จะไม่ถูกอ่านเป็นเบอร์

export const LEGACY_PATTERNS = [
  /(?:เบอร์|โทร|tel|phone)?[:\s]*(0[689]\d[\d\s-]{7,12})/i,
  /(0[689]\d{8})/,
];

// 08-9999-1111 / 06 1234 5678 / 08-99991111
const SEPARATED_PATTERN = /(?<![\d/:.])(0[689][\s-](?:\d{4}[\s-]\d{4}|\d{8}))(?![\d/:])/;

const digitsOf = (s) => s.replace(/[\s-]/g, "");
const validLength = (d) => d.length >= 9 && d.length <= 10;

function legacyMatch(text) {
  for (const pat of LEGACY_PATTERNS) {
    const m = text.match(pat);
    if (!m) continue;
    const digits = digitsOf(m[1]);
    if (validLength(digits)) return { digits, index: m.index + m[0].indexOf(m[1]) };
  }
  return null;
}

function separatedMatch(text) {
  const m = text.match(SEPARATED_PATTERN);
  if (!m) return null;
  const digits = digitsOf(m[1]);
  return validLength(digits) ? { digits, index: m.index + m[0].indexOf(m[1]) } : null;
}

/** เบอร์ตัวแรก (ซ้ายสุด) ในข้อความ เป็นตัวเลขล้วน หรือ null */
export function extractPhone(text) {
  const legacy = legacyMatch(text);
  const separated = separatedMatch(text);
  if (legacy && separated) return (separated.index < legacy.index ? separated : legacy).digits;
  return (legacy || separated)?.digits ?? null;
}

/** บรรทัดนี้ทั้งบรรทัดเป็นเบอร์โทรหรือไม่ (ใช้แยกหลายคนที่วางมาพร้อมกัน) */
export function isPhoneOnlyLine(line) {
  return /^\s*0[689]\d[\d\s-]{7,12}$/.test(line) || /^\s*0[689][\s-](?:\d{4}[\s-]\d{4}|\d{8})\s*$/.test(line);
}

/** ข้อความมีเบอร์อยู่ในตัวหรือไม่ (ใช้กันไม่ให้เอาเบอร์ไปเรียนเป็นชื่อเล่น/alias) */
export function containsPhone(text) {
  return /0[689]\d{8}/.test(text) || separatedMatch(text) !== null;
}
