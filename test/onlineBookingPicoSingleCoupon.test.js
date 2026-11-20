import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { SINGLE_COUPON, isSingleCoupon, couponMinutes } from "../src/utils/publicBooking.js";

// จองออนไลน์: Pico ไม่จำกัดช็อต ใช้คูปองใบเดียวพอ (เจ้าของสั่ง 15 พ.ย. 2569) — หัตถการอื่นยัง 1–3 ใบ
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
const page = read("../src/pages/PublicBookingPage.jsx");
const mock = read("../scripts/screenshot/mockOnlineBookingApi.js");

test("หน้าจอง: Pico นับ 1 ใบ เวลา 1 รอบ, หัตถการอื่นคูณจำนวนใบเหมือนเดิม", () => {
  assert.deepEqual(SINGLE_COUPON, ["Pico"]);
  const p = { service: "Pico", duration_minutes: 30 };
  const f = { service: "Filler", duration_minutes: 30 };
  assert.equal(isSingleCoupon(p), true);
  assert.equal(isSingleCoupon(f), false);
  assert.equal(isSingleCoupon(null), false);
  assert.equal(isSingleCoupon({ service: "pico" }), false); // ชื่อต้องตรงกับชื่อหัตถการในระบบ
  assert.equal(couponMinutes(p, 3), 30);
  assert.equal(couponMinutes(f, 3), 90);
});

test("หน้าจอง: Pico ไม่ขึ้นปุ่มเลือกจำนวนใบ ส่ง count = 1 เสมอ และข้อแนะนำบอกสั้นๆ", () => {
  assert.match(page, /\{service && !pickService && isSingleCoupon\(service\) && \(/);
  assert.match(page, /\{service && !pickService && !isSingleCoupon\(service\) && \(\s*<div style=\{\{ marginTop: 12 \}\}>\s*<div style=\{\{ fontSize: 14, marginBottom: 6 \}\}>ใช้คูปองกี่ใบคะ/);
  assert.match(page, /ไม่จำกัดช็อตค่ะ ใช้คูปองใบเดียวก็ทำได้เต็มที่/);
  assert.match(page, /count: isSingleCoupon\(service\) \? 1 : couponCount,/);
  assert.match(page, /ใช้คูปองได้คิวละ 1–\{MAX_COUPONS\} ใบ \(บางโปรใช้ได้ครั้งละ 1 สิทธิ์ค่ะ\)/);
});

test("หลังบ้านไม่แตะ: ไม่มี migration ของ Pico (เจ้าของสั่งแก้เฉพาะหน้าจอง)", () => {
  const dir = new URL("../supabase/migrations/", import.meta.url);
  assert.equal(fs.readdirSync(dir).some((f) => /pico/i.test(f)), false);
});

test("โหมดตัวอย่าง: Pico ส่ง 3 ใบได้ 1 ใบ 30 นาที, HIFU 3 ใบยังคูณ", async () => {
  assert.match(mock, /"Pico Laser": "Pico"/);
  assert.match(mock, /"pr15"/);
  const api = await import("../scripts/screenshot/mockOnlineBookingApi.js");
  const day = new Date(Date.now() + 3 * 86400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
  const slotsP = await api.fetchPublicSlots("b1", "pr15", day, 3);
  const slotsP1 = await api.fetchPublicSlots("b1", "pr15", day, 1);
  assert.deepEqual(slotsP.map((s) => s.time), slotsP1.map((s) => s.time));
  const free = slotsP.find((s) => s.available);
  assert.ok(free, "ต้องมีเวลาว่างให้ Pico ในเดโม");
  const r = await api.bookPublic({ branchId: "b1", promoId: "pr15", startTime: free.start_time, name: "ทดสอบ พิโก", phone: "0812345671", customerType: "new", count: 3 });
  assert.equal(r.count, 1);
  const [hh, mm] = free.time.split(":").map(Number);
  assert.equal(r.end_time, `${String(hh + (mm + 30 >= 60 ? 1 : 0)).padStart(2, "0")}:${String((mm + 30) % 60).padStart(2, "0")}`);
  const slotsH = await api.fetchPublicSlots("b1", "pr6", day, 2);
  const freeH = slotsH.filter((s) => s.available).at(-1);
  assert.ok(freeH, "ต้องมีเวลาว่างให้ HIFU 2 ใบในเดโม");
  const h = await api.bookPublic({ branchId: "b1", promoId: "pr6", startTime: freeH.start_time, name: "ทดสอบ ไฮฟู", phone: "0812345672", customerType: "new", count: 2 });
  assert.equal(h.count, 2);
  const startMin = Number(freeH.time.slice(0, 2)) * 60 + Number(freeH.time.slice(3));
  assert.equal(Number(h.end_time.slice(0, 2)) * 60 + Number(h.end_time.slice(3)) - startMin, 100); // 50 นาที × 2
});
