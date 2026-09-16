import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// บังคับเลือกโปรก่อนบันทึกคิวใหม่ (16 ก.ย. 2569 เป็นต้นไป)
//
// เจ้าของงานพบว่า ~500 คิว/เดือนพิมพ์ประเภทลูกค้าเป็น "ใช้คอร์ส" แต่ลืมติ๊กโปร
// "ใช้คอร์ส" ทำให้ตกไปกอง "ไม่ระบุโปร" ในหน้าสรุปเงียบ ๆ — ตัดสินใจ: บังคับเลือก
// ไปข้างหน้า ไม่แก้ย้อนหลัง
//
// ตอนแรกวางแผนเพิ่มโปรสำรอง "ไม่มีส่วนลด" (procedure_id เป็น null ใช้ได้ทุกหัตถการ)
// ไว้กันคนที่จ่ายเต็มราคา — เจ้าของงานทักว่าธุรกิจนี้ไม่มีแนวคิดนี้เลย ทุกคิวผูกโปร
// จริงเสมอ จึงตัดออก ผลคือ 2 หัตถการที่ยังไม่มีโปรผูกไว้เลย (Go-Filler, Ulthera —
// ทั้งคู่มีคิวจองจริงอยู่) จะบันทึกคิวใหม่ไม่ได้จนกว่าจะมีคนเพิ่มโปรให้ — เจ้าของงาน
// รับทราบและยืนยันให้ทำต่อแบบนี้ (16 ก.ย. 2569) ไม่ใช่บั๊ก เป็นการตัดสินใจแล้ว

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const app = read("../src/App.jsx");
const booking = read("../src/pages/BookingPage.jsx");
const timeline = read("../src/pages/TimelinePage.jsx");

test("หน้าบันทึกคิว: ขอบเขตต้องตรงตามที่ตกลง — คิวใหม่ + เลือกหัตถการแล้ว + ไม่ใช่คิวรอ", () => {
  const block = app.slice(app.indexOf("─── บังคับเลือกโปร"), app.indexOf("─── ตรวจสอบเตียงรับหัตถการนี้ไหม"));
  assert.match(block, /if \(!editingQueueId && form\.status !== "waiting_queue" && form\.procedureId && !form\.promoId\)/);
});

test("ห้ามบังคับตอนกำลังแก้ไขคิวเก่า — เจ้าของงานยืนยันว่าเอาแค่จากนี้ไปพอ ไม่แก้ย้อนหลัง", () => {
  const block = app.slice(app.indexOf("─── บังคับเลือกโปร"), app.indexOf("─── ตรวจสอบเตียงรับหัตถการนี้ไหม"));
  assert.match(block, /!editingQueueId/, "ต้องมีเงื่อนไขไม่บังคับตอนแก้ไข");
});

test("ห้ามบังคับตอนลงคิวรอ — ต้องลงได้ไวเหมือนเดิม ยังไม่รู้รายละเอียดตอนแรกจับจอง", () => {
  const block = app.slice(app.indexOf("─── บังคับเลือกโปร"), app.indexOf("─── ตรวจสอบเตียงรับหัตถการนี้ไหม"));
  assert.match(block, /form\.status !== "waiting_queue"/);
});

test("Timeline ต้องมีด่านเดียวกันทั้งฝั่งปุ่ม (ปิดปุ่ม) และฝั่งบันทึกจริง (ด่านสำรอง)", () => {
  assert.match(timeline, /\|\| \(!!bookingForm\.procedureId && !bookingForm\.promoId\)/,
    "ปุ่มบันทึกต้องถูกปิดถ้าเลือกหัตถการแล้วแต่ยังไม่เลือกโปร");
  const submitBlock = app.slice(app.indexOf("onSubmitBooking={async"), app.indexOf("// เตียงรับหัตถการนี้ไหม — Timeline"));
  assert.match(submitBlock, /if \(bookingForm\.procedureId && !bookingForm\.promoId\)/,
    "ฝั่งบันทึกจริงต้องมีด่านสำรอง ไม่พึ่งแค่ปุ่มที่ปิดไว้");
});

test("Timeline สร้างคิวใหม่เสมอ ไม่มีคิวรอ จึงไม่ต้องเช็ค status แยก", () => {
  const submitBlock = app.slice(app.indexOf("onSubmitBooking={async"), app.indexOf("// เตียงรับหัตถการนี้ไหม — Timeline"));
  assert.ok(!/waiting_queue/.test(submitBlock), "Timeline ไม่ต้องมีเงื่อนไข waiting_queue");
});

test("ดรอปดาวน์โปรต้องรวมโปรที่ใช้ได้ทุกหัตถการด้วย ไม่งั้นหัตถการที่ไม่มีโปรเฉพาะจะไม่มีทางออก", () => {
  assert.match(booking, /promos\.filter\(\(p\) => p\.active && \(p\.procedureId === form\.procedureId \|\| !p\.procedureId\)\)/);
  // Timeline ทำแบบนี้อยู่แล้วตั้งแต่แรก — เทียบให้แน่ใจว่าสองหน้าใช้กติกาเดียวกัน
  assert.match(timeline, /promos\.filter\(\(p\) => !p\.procedureId \|\| p\.procedureId === bookingForm\.procedureId\)/);
});

test("ห้ามมีโปรสำรองปลอมที่ไม่ตรงกับธุรกิจจริง — ต้องเป็นโปรจริงเท่านั้น", () => {
  // ข้อความเตือนที่ผู้ใช้เห็นต้องไม่ชวนไปเลือกโปรที่ไม่มีอยู่จริง (เคยวางแผนไว้แล้วตัดออก
  // ตามที่เจ้าของงานยืนยัน — คอมเมนต์อธิบายประวัติยังเก็บไว้ได้ ไม่ใช่สิ่งที่ต้องห้าม)
  const toastMessages = [...app.matchAll(/showToast\("error", "([^"]+)"\)/g)].map((m) => m[1]);
  assert.ok(!toastMessages.some((msg) => msg.includes("ไม่มีส่วนลด")),
    "ข้อความเตือนต้องไม่อ้างถึงโปรที่ไม่มีอยู่จริง");
  assert.ok(!/no_discount_promo\.sql/.test(app));
});

test("ข้อความเตือนต้องไม่ชวนกดผ่านด้วยตัวเลือกที่ไม่มีจริง", () => {
  assert.match(app, /กรุณาเลือกโปร\/แพ็กเกจก่อนบันทึกคิว/);
});

test("ทั้งสองหน้าต้องมีตัวบอกผู้ใช้ล่วงหน้าว่าช่องนี้บังคับ ไม่ใช่รู้ตอนโดนเด้งเตือนหลังกดบันทึก", () => {
  assert.match(booking, /!editingQueueId && !isWaitingQueueMode && form\.procedureId && \(/);
  assert.match(timeline, /bookingForm\.procedureId && <span style=\{\{ color: "var\(--red\)" \}\}> \*<\/span>/);
});

test("ทางสร้างคิวหลายแถวจากข้อความ (bulk) ต้องไม่ถูกบังคับ — มีเหตุผลบันทึกไว้ชัดเจน", () => {
  const bulkBlock = app.slice(app.indexOf("onBulkBooking={async"), app.indexOf("onBulkBooking={async") + 1200);
  assert.ok(!/!fields\.promoId/.test(bulkBlock), "ห้ามเพิ่มเงื่อนไขบังคับโปรในทาง bulk");
  assert.match(bulkBlock, /ตั้งใจไม่บังคับเลือกโปรในทางนี้/);
});
