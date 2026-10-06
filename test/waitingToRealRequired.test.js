import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// คิวรอ → คิวจริง ต้องผ่านด่านหัตถการ/โปรเหมือนคิวใหม่ (ต.ค. 2569)
//
// คิวรอไม่ต้องเลือกหัตถการ/โปรตอนลง (ตั้งใจ) และกฎ "บังคับโปร" ใช้เฉพาะคิวใหม่ พอแก้ไขคิวรอ
// ให้มีห้อง/เวลา คิวจึงกลายเป็นคิวจริงโดยไม่เคยผ่านด่านเลย — คิวหลุดทางนี้หลัง 17 ก.ย. 2569

const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");

const start = app.indexOf("─── คิวรอ → คิวจริง");
const end = app.indexOf("─── บังคับเลือกหัตถการ (คิวใหม่");
const block = app.slice(start, end);

test("ด่านคิวรอ→คิวจริงอยู่ก่อนด่านคิวใหม่ และอยู่ใน handleBookingSubmit หลังรู้คิวเดิมแล้ว", () => {
  assert.ok(start > 0 && end > start, "ต้องมีบล็อกคิวรอ→คิวจริงก่อนด่านหัตถการของคิวใหม่");
  assert.ok(app.indexOf("const editingOriginal = editingQueueId") < start, "ต้องรู้คิวเดิมก่อนใช้");
});

test("เงื่อนไข: แก้ไขคิวที่เดิมเป็นคิวรอ + สถานะใหม่ไม่ใช่คิวรอ + มีห้อง (ไม่มีห้อง = ยังเป็นคิวรอ)", () => {
  assert.match(block, /editingOriginal\?\.status === "waiting_queue"/);
  assert.match(block, /form\.status !== "waiting_queue"/);
  assert.match(block, /!!form\.roomId/);
});

test("ต้องเลือกทั้งหัตถการและโปร ด้วยข้อความเดียวกับคิวใหม่", () => {
  assert.match(block, /convertingWaitingToReal && !form\.procedureId/);
  assert.match(block, /กรุณาเลือกหัตถการก่อนบันทึกคิว/);
  assert.match(block, /convertingWaitingToReal && !form\.promoId/);
  assert.match(block, /กรุณาเลือกโปร\/แพ็กเกจก่อนบันทึกคิว/);
});

test("ไม่แตะการแก้ไขคิวทั่วไปและการลงคิวรอ — ด่านเดิมของคิวใหม่ยังอยู่ครบ", () => {
  assert.match(app, /if \(!editingQueueId && form\.status !== "waiting_queue" && !form\.procedureId\)/);
  assert.match(app, /if \(!editingQueueId && form\.status !== "waiting_queue" && form\.procedureId && !form\.promoId\)/);
});
