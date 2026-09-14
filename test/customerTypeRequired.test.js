import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// helpers.js import "./constants" แบบไม่มีนามสกุล — node ESM resolve ไม่ได้
// จึงอ่านเป็นข้อความแทนการ import (แบบเดียวกับ guard อื่นในโปรเจกต์)

// ประเภทลูกค้าต้องมาจากคนเลือกเท่านั้น ห้ามระบบเดาให้ที่จุดไหนเลย
//
// ทำไมถึงคุมเข้มขนาดนี้: ประเภทลูกค้าไปผูกกับ "เรตค่าคอมมิชชั่น" และตัวเลข
// "ต้นทุนต่อลูกค้าใหม่" ในหน้า CEO (จำนวนลูกค้าใหม่ หารกับค่าโฆษณา)
// ข้อมูล 1 มิ.ย. - 8 ก.ย. 2026: คิวที่ไม่ใช่ครั้งแรกของเบอร์นั้นมี 36,583 คิว
// ในจำนวนนี้ 8,065 คิว (22%) ยังถูกติ๊กว่า "ลูกค้าใหม่" เพราะไม่มีใครแก้ค่าที่ระบบเลือกให้

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const bookingPage = read("../src/pages/BookingPage.jsx");
const timelinePage = read("../src/pages/TimelinePage.jsx");
const gate = read("../src/utils/queueCreateGate.js");
const rpc = read("../supabase/migrations/20260909020000_create_queue_v1_require_customer_type.sql");

test("ฟอร์มเปล่าต้องไม่มีประเภทลูกค้าติดมาให้", () => {
  const helpers = read("../src/utils/helpers.js");
  assert.match(helpers, /customerType: "",/);
  assert.ok(!/customerType: "new"/.test(helpers),
    'getEmptyBookingForm ต้องไม่ตั้ง "new" ไว้ล่วงหน้า');
});

for (const [label, source] of [["หน้าบันทึกคิว", bookingPage], ["ป๊อปอัป Timeline", timelinePage]]) {
  test(`${label}: ค้น HN เจอแล้วห้ามเลือกประเภทให้`, () => {
    const start = source.indexOf("onSelect={(c) => {");
    assert.ok(start > 0, "หา handler ของ HnLookup ไม่เจอ");
    const handler = source.slice(start, start + 700);
    assert.match(handler, /name: fullName \|\| f\.name/, "ยังต้องเติมชื่อให้เหมือนเดิม");
    assert.ok(!/customerType:/.test(handler),
      'ห้ามเซ็ต customerType — คนมี HN แล้วมาใช้คอร์สก็เยอะ บอกใบ้ได้ แต่ห้ามเลือกแทน');
  });

  test(`${label}: ส่วนที่เหลือของฟอร์มต้องหุบจนกว่าจะเลือกประเภท`, () => {
    assert.match(source, /const typeChosen = !!(form|bookingForm)\.customerType;/);
    assert.match(source, /typeChosen && \(<>/, "ต้องมีบล็อกที่หุบไว้");
    assert.match(source, /เลือกประเภทลูกค้าก่อน/, "ต้องบอกเหตุผลที่หุบ ไม่ใช่หุบเงียบ ๆ");
  });
}

test("ปุ่มบันทึกต้องหุบไปด้วย ไม่ใช่หุบแค่ช่องกรอก", () => {
  // หุบแต่ช่องกรอกแล้วปล่อยปุ่มบันทึกไว้ = กดบันทึกคิวเปล่าได้
  assert.match(bookingPage, /\{typeChosen && \(\s*\n\s*<div style=\{\{ display: "flex", gap: 10, marginTop: 20/);
  assert.match(timelinePage, /\{typeChosen && \(\s*\n\s*<button\s*\n\s*className="btn btn-primary"/);
});

test("ฝั่งที่ส่งขึ้นเซิร์ฟเวอร์ต้องไม่เติม new ให้เอง", () => {
  assert.ok(!/customer_type: form\.customerType \|\| "new"/.test(gate));
});

test("RPC ต้องปฏิเสธคิวที่ไม่ระบุประเภท ไม่ใช่เติม new ให้", () => {
  assert.ok(!/v_customer_type := coalesce\(nullif\(p_payload->>'customer_type', ''\), 'new'\)/.test(rpc),
    "ต้องไม่ coalesce เป็น 'new' อีกต่อไป");
  assert.match(rpc, /v_customer_type := nullif\(p_payload->>'customer_type', ''\);/);
  // NULL not in (...) ให้ผลเป็น NULL ไม่ใช่ true — ถ้าไม่เช็ค is null แยก if จะไม่ทำงาน
  // แล้วคิวที่ไม่มีประเภทจะหลุดลงตารางเงียบ ๆ (คอลัมน์เป็น nullable ไม่มี default)
  assert.match(rpc, /if v_customer_type is null or v_customer_type not in \('new', 'old', 'course'\)/);
});

test("RPC ตัวใหม่ต้องคัดลอกฟังก์ชันเดิมมาครบ ไม่ใช่เขียนใหม่ตกหล่น", () => {
  const previous = read("../supabase/migrations/20260817160000_create_queue_v1_room_procedure_lock.sql");
  for (const marker of [
    "room_procedures rp",              // ล็อกเตียง-หัตถการ
    "past_date_not_allowed",
    "request_id_forbidden",
    "effective_duration_blocks",
    "revoke all on function public.create_queue_v1",
  ]) {
    assert.ok(previous.includes(marker) && rpc.includes(marker), `หายไปจากตัวใหม่: ${marker}`);
  }
});

test("ป๊อปอัป Timeline ที่เพิ่งเปิดต้องไม่ถือว่ากรอกไปแล้ว", () => {
  // เดิม isBookingFormDirty เทียบ customerType !== "new" เพราะฟอร์มเปล่าเคยตั้ง "new" ไว้ให้
  // พอฟอร์มเปล่าเป็นค่าว่าง เงื่อนไขนั้นจะเป็นจริงตลอด → ป๊อปอัปที่เพิ่งเปิดถือว่า "กรอกแล้ว"
  // แล้วกดนอกกรอบปิดไม่ได้เลย ซึ่งบนมือถือคือกดโดนเองบ่อยมาก
  const start = timelinePage.indexOf("function isBookingFormDirty");
  assert.ok(start > 0, "หา isBookingFormDirty ไม่เจอ");
  const fn = timelinePage.slice(start, start + 700);
  assert.ok(!/customerType !== "new"/.test(fn),
    'ห้ามเทียบกับ "new" อีกต่อไป — ฟอร์มเปล่าไม่ได้เป็น "new" แล้ว');
  assert.match(fn, /Boolean\(f\.customerType\)/);
});
