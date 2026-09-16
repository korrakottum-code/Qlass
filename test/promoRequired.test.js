import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// บังคับเลือกโปรก่อนบันทึกคิวใหม่ (16 ก.ย. 2569 เป็นต้นไป)
//
// เจ้าของงานพบว่า ~500 คิว/เดือนพิมพ์ประเภทลูกค้าเป็น "ใช้คอร์ส" แต่ลืมติ๊กโปร
// "ใช้คอร์ส" ทำให้ตกไปกอง "ไม่ระบุโปร" ในหน้าสรุปเงียบ ๆ — ตัดสินใจ: บังคับเลือก
// ไปข้างหน้า ไม่แก้ย้อนหลัง ต้องไม่ทำให้ลูกค้าที่จ่ายเต็มราคาไม่มีส่วนลดบันทึกคิวไม่ได้

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const app = read("../src/App.jsx");
const booking = read("../src/pages/BookingPage.jsx");
const timeline = read("../src/pages/TimelinePage.jsx");
const seed = read("../supabase/seeds/no_discount_promo.sql");

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

test("ต้องมีโปรสำรอง 'ไม่มีส่วนลด' ใช้ได้ทุกหัตถการ ก่อนบังคับเลือกจะมีผลจริง", () => {
  assert.match(seed, /insert into public\.promos \(name, procedure_id, price, active\)/);
  assert.match(seed, /select 'ไม่มีส่วนลด', null, 0, true/);
  // ต้องรันซ้ำได้อย่างปลอดภัย ไม่สร้างซ้ำ
  assert.match(seed, /where not exists \(/);
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
