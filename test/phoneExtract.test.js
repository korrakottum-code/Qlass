import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractPhone, isPhoneOnlyLine, containsPhone } from "../src/utils/phoneExtract.js";

// อ่านเบอร์จากข้อความที่วาง (26 ก.ย. 2569): เพิ่มรูปแบบ "08-9999-1111" / "06 1234 5678" โดยไม่ทำให้ของเดิมเปลี่ยน
// ความเสียหายที่เทสต์นี้กัน: อ่านวันที่/เวลา/ราคาเป็นเบอร์, ผลของรูปแบบเดิมเปลี่ยนไป, เบอร์ซ้ายสุดถูกข้าม

// ตัวอ้างอิง = ตรรกะเดิมใน smartParser.js ก่อนแก้ (คัดลอกมาตรง ๆ)
function legacyExtract(text) {
  const pats = [
    /(?:เบอร์|โทร|tel|phone)?[:\s]*(0[689]\d[\d\s-]{7,12})/i,
    /(0[689]\d{8})/,
  ];
  for (const pat of pats) {
    const m = text.match(pat);
    if (m) {
      const p = m[1].replace(/[\s-]/g, "");
      if (p.length >= 9 && p.length <= 10) return p;
    }
  }
  return null;
}

test("รูปแบบที่เคยอ่านไม่ออก อ่านได้แล้ว", () => {
  const cases = {
    "แนน 08-9999-1111 Filler": "0899991111",
    "แนน 06 1234 5678 Filler": "0612345678",
    "เบอร์: 06 1234 5678": "0612345678",
    "แนน 08-99991111": "0899991111",
    "089-999-1111": "0899991111", // เดิมอ่านได้อยู่แล้ว ต้องยังได้
  };
  for (const [text, want] of Object.entries(cases)) assert.equal(extractPhone(text), want, text);
});

test("รูปแบบเดิมทุกแบบ ผลเหมือนเดิมเป๊ะ", () => {
  const same = [
    "แนน 0921234567 Filler อุบล 5/4/69 15:00",
    "แนน 092-123-4567 Filler", "แนน 092 123 4567 Filler", "แนน 081 2345678", "แนน 0812 345 678",
    "แนน 091234567", // 9 หลัก เดิมยอมรับ
    "แนน 08999911112 Filler", // 11 หลัก เดิมตัดเอา 10 หลักแรก (คงไว้ ไม่ใช่งานนี้)
    "แนน 0200000000", "ไม่มีเบอร์เลย 5/4/69 15:00 1990 บาท",
    "โทร 0812345678 และ 0899999999",
  ];
  for (const t of same) assert.equal(extractPhone(t), legacyExtract(t), t);
});

test("วันที่/เวลา/ราคา ไม่ถูกอ่านเป็นเบอร์", () => {
  const notPhones = [
    "แนน Filler อุบล 08-09-2569 15:00", "แนน Filler 06 05 2569", "นัด 08-2569 เวลา 15:00",
    "แนน 5/06 1234 5678", "แนน 1990 บาท 08 12", "จอง 06:1234:5678", "รหัส 108-9999-1111",
    "แนน 08 1234 56789", // ยาวเกิน (ต่อท้ายด้วยตัวเลข) ไม่ใช่เบอร์
  ];
  for (const t of notPhones) assert.equal(extractPhone(t), legacyExtract(t), t);
});

test("มีสองเบอร์ในบรรทัด ได้ตัวซ้ายสุด (เหมือนที่ตัวเดิมเลือกเบอร์แรก)", () => {
  assert.equal(extractPhone("0921234567 ต่อ 08-9999-1111"), "0921234567");
  assert.equal(extractPhone("08-9999-1111 ต่อ 0921234567"), "0899991111");
});

test("สุ่มข้อความ 20,000 ชุด: ถ้าไม่มีรูปแบบใหม่ ผลต้องตรงกับของเดิมทุกข้อ และรูปแบบใหม่ที่เพิ่มมาต้องเป็นเบอร์ 10 หลักขึ้นต้น 06/08/09 เสมอ", () => {
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const pieces = ["0", "6", "8", "9", "1", "2", "5", " ", "-", "/", ":", ".", "แนน", "บาท", "15:00", "5/4/69", "08", "06", "09", "089", "0812345678", "08-9999-1111", "1990", "เบอร์", "\n"];
  let differed = 0;
  for (let i = 0; i < 20000; i += 1) {
    const n = 1 + Math.floor(rnd() * 9);
    let t = "";
    for (let k = 0; k < n; k += 1) t += pieces[Math.floor(rnd() * pieces.length)] + (rnd() < 0.4 ? " " : "");
    const got = extractPhone(t);
    const old = legacyExtract(t);
    if (got !== old) {
      differed += 1;
      assert.ok(got && /^0[689]\d{8}$/.test(got), `ผลใหม่ต้องเป็นเบอร์ 10 หลัก: ${JSON.stringify(t)} → ${got}`);
      assert.ok(/0[689][\s-](?:\d{4}[\s-]\d{4}|\d{8})/.test(t), `ต่างจากเดิมได้เฉพาะเมื่อมีรูปแบบใหม่: ${JSON.stringify(t)}`);
    }
  }
  assert.ok(differed > 0, "ชุดสุ่มควรเจอรูปแบบใหม่บ้าง ไม่งั้นเทสต์นี้ไม่ได้พิสูจน์อะไร");
});

test("isPhoneOnlyLine: ทั้งบรรทัดเป็นเบอร์เท่านั้น", () => {
  for (const l of ["0899991111", " 089-999-1111", "08-9999-1111", "06 1234 5678"]) assert.ok(isPhoneOnlyLine(l), l);
  for (const l of ["แนน 0899991111", "08-09-2569", "5/4/69", "Filler", "0899991111 15:00"]) assert.ok(!isPhoneOnlyLine(l), l);
});

test("containsPhone: ใช้กันเอาบรรทัดที่มีเบอร์ไปเรียนเป็น alias", () => {
  assert.ok(containsPhone("แนน 0899991111"));
  assert.ok(containsPhone("แนน 08-9999-1111"));
  assert.ok(!containsPhone("แนน 08-09-2569"));
});

// ─── สายเชื่อมใน smartParser.js ───
const parser = readFileSync(new URL("../src/utils/smartParser.js", import.meta.url), "utf8");
test("smartParser ใช้ตัวอ่านเบอร์ร่วมกัน 3 จุด และไม่เหลือ regex เบอร์แบบเก่ากระจายอยู่", () => {
  assert.match(parser, /import \{ extractPhone, isPhoneOnlyLine, containsPhone \} from "\.\/phoneExtract";/);
  assert.match(parser, /extractPhone\(lines\[i\]\)/);
  assert.match(parser, /extractPhone\(fullText\)/);
  assert.match(parser, /isPhoneOnlyLine\(lines\[i\]\)/);
  assert.match(parser, /containsPhone\(l\)/);
  assert.ok(!/phonePatterns/.test(parser));
  assert.ok(!/\/\^\\s\*0\[689\]/.test(parser));
});
