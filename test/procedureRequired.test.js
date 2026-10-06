import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// บังคับเลือกหัตถการก่อนบันทึกคิวใหม่ (ต.ค. 2569)
//
// กฎบังคับโปรเดิมทำงานเฉพาะตอนเลือกหัตถการแล้ว ถ้าข้ามหัตถการก็ข้ามโปรไปด้วย
// คิวจึงหลุดเข้า "ไม่ระบุหัตถการ/ไม่ระบุโปร" ในหน้าสรุปทุกสัปดาห์ (ก.ย. 2569: 390 / 871 คิว)
// ขอบเขตเท่ากับกฎโปร: เฉพาะคิวใหม่ ไม่ใช่คิวรอ ไม่ย้อนหลังกับคิวเก่าที่กำลังแก้

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const app = read("../src/App.jsx");
const booking = read("../src/pages/BookingPage.jsx");
const timeline = read("../src/pages/TimelinePage.jsx");

const procedureBlock = app.slice(
  app.indexOf("─── บังคับเลือกหัตถการ"),
  app.indexOf("─── บังคับเลือกโปร")
);

test("หน้าบันทึกคิว: คิวใหม่ที่ไม่ใช่คิวรอ ต้องเลือกหัตถการ", () => {
  assert.match(procedureBlock, /if \(!editingQueueId && form\.status !== "waiting_queue" && !form\.procedureId\)/);
  assert.match(procedureBlock, /กรุณาเลือกหัตถการก่อนบันทึกคิว/);
});

test("ด่านหัตถการต้องอยู่ก่อนด่านโปร ไม่งั้นข้ามหัตถการแล้วหลุดทั้งคู่เหมือนเดิม", () => {
  assert.ok(app.indexOf("─── บังคับเลือกหัตถการ") > 0);
  assert.ok(app.indexOf("─── บังคับเลือกหัตถการ") < app.indexOf("─── บังคับเลือกโปร"));
});

test("Timeline: ด่านสำรองฝั่งบันทึกจริง + ปุ่มบันทึกถูกปิดถ้ายังไม่เลือกหัตถการ", () => {
  const submitBlock = app.slice(app.indexOf("onSubmitBooking={async"), app.indexOf("// เตียงรับหัตถการนี้ไหม — Timeline"));
  assert.match(submitBlock, /if \(!bookingForm\.procedureId\) \{/);
  assert.match(timeline, /\|\| !bookingForm\.procedureId\s*\n\s*\|\| \(!!bookingForm\.procedureId && !bookingForm\.promoId\)/);
});

test("ทั้งสองหน้าต้องบอกผู้ใช้ล่วงหน้าว่าหัตถการเป็นช่องบังคับ", () => {
  assert.match(booking, /หัตถการหลักที่สนใจ\{!editingQueueId && !isWaitingQueueMode && <span style=\{\{ color: "var\(--red\)" \}\}> \*<\/span>\}/);
  assert.match(timeline, /หัตถการ <span style=\{\{ color: "var\(--red\)" \}\}> \*<\/span>/);
});
