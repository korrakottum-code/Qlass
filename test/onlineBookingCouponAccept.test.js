import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { couponAcceptedNote, NOTE_MAX } from "../src/utils/publicBooking.js";

// จองออนไลน์: ลูกค้าต้องติ๊กรับทราบเงื่อนไขคูปองก่อนจอง และบันทึกการยอมรับลงหมายเหตุคิว (เจ้าของสั่ง 20 พ.ย. 2569)
const page = fs.readFileSync(new URL("../src/pages/PublicBookingPage.jsx", import.meta.url), "utf8");

test("couponAcceptedNote: ข้อความยอมรับมาก่อน ตามด้วยหมายเหตุลูกค้า", () => {
  assert.equal(couponAcceptedNote(3, ""), "✅ ลูกค้ายอมรับ: ใช้คูปอง 3 ใบตามที่จองเท่านั้น");
  assert.equal(couponAcceptedNote(1, "  มาสาย 5 นาที "), "✅ ลูกค้ายอมรับ: ใช้คูปอง 1 ใบตามที่จองเท่านั้น · มาสาย 5 นาที");
});

test("couponAcceptedNote: หมายเหตุยาวถูกตัดที่ 300 ตัว แต่ข้อความยอมรับยังอยู่ครบ", () => {
  const out = couponAcceptedNote(2, "ก".repeat(400));
  assert.ok(out.length <= NOTE_MAX);
  assert.ok(out.startsWith("✅ ลูกค้ายอมรับ: ใช้คูปอง 2 ใบตามที่จองเท่านั้น · "));
});

test("หน้าจอง: ปุ่มยืนยันต้องติ๊กรับทราบก่อน และติ๊กใหม่เมื่อเปลี่ยนโปร/จำนวนใบ", () => {
  assert.match(page, /customerType && couponAccepted\);/);
  assert.match(page, /useEffect\(\(\) => \{ setCouponAccepted\(false\); \}, \[promoId, bookedCount\]\)/);
  assert.match(page, /type="checkbox" checked=\{couponAccepted\}/);
});

test("หน้าจอง: ส่งจำนวนใบเดียวกับที่ลูกค้ายอมรับ และบันทึกการยอมรับในหมายเหตุ", () => {
  assert.match(page, /note: couponAcceptedNote\(bookedCount, note\)/);
  assert.match(page, /count: isSingleCoupon\(service\) \? 1 : couponCount,/);
  assert.match(page, /bookedCount = service && isSingleCoupon\(service\) \? 1 : couponCount;/);
});
