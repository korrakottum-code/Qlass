import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// ตัวกลาง public-booking v5 (16 พ.ย. 2569): ไม่นับครั้งที่โดนบล็อกในตัวกันกดถี่ + ส่งนาทีที่ต้องรอ + ตัดตัวอักษรล่องหนจากชื่อ
// หน้าจองรุ่นที่ใช้ตัวนี้ (#258) ถูกย้อนใน #259 (ลูกค้าจาก LINE จองไม่ได้) — หน้าจองปัจจุบันไม่อ่าน retry_after_minutes ก็ใช้ได้ตามเดิม
const edge = fs.readFileSync(new URL("../supabase/functions/public-booking/index.ts", import.meta.url), "utf8");
const page = fs.readFileSync(new URL("../src/pages/PublicBookingPage.jsx", import.meta.url), "utf8");

test("ตัวกลาง public-booking: ไม่นับครั้งที่โดนบล็อก (429) และส่งนาทีที่ต้องรอ", () => {
  // นับ + หาเวลาที่ว่าง ต้องตัด 429 ทั้งสองจุด
  assert.equal((edge.match(/\.neq\("status", 429\)/g) || []).length, 2);
  assert.match(edge, /respond\(\{ error: "RATE_LIMITED", retry_after_minutes: waitMinutes \}, 429, origin\)/);
  assert.match(edge, /if \(error\) return 0; \/\/ นับไม่ได้ = ไม่บล็อกลูกค้าปกติ/);
  // เพดานเท่าเดิม ไม่ได้ผ่อน
  assert.match(edge, /book: \[\[5, 10\], \[20, 24 \* 60\]\],/);
  assert.doesNotMatch(edge, /overRateLimit/);
});

test("ตัวกลาง public-booking: ตัดตัวอักษรล่องหนออกจากชื่อก่อนส่งเข้าระบบ", () => {
  assert.match(edge, /const cleanName = \(v: unknown\) => str\(v, 200\)\.replace\(\/\[\\u200B-\\u200D\\u2060\\uFEFF\]\/g, ""\);/);
  assert.match(edge, /p_name: cleanName\(body\.name\),/);
  const cleanName = (v) => String(v).slice(0, 200).replace(/[\u200B-\u200D\u2060\uFEFF]/g, "");
  assert.equal(cleanName("พัช\u200Bราภรณ์\u200B ขัน\u200Bเงิน\u200B"), "พัชราภรณ์ ขันเงิน");
  assert.equal(cleanName("สมใจ ใจดี"), "สมใจ ใจดี");
});

test("หน้าจองยังเป็นรุ่นก่อน #258 (ย้อนแล้ว) — ห้ามมีที่เก็บในเครื่อง/จุดส้มจนกว่าจะลองใน LINE บนมือถือจริง", () => {
  assert.doesNotMatch(page, /loadMine|qlass_book_mine_v1|localStorage/);
});
