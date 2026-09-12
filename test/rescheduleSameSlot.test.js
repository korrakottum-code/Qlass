import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildRescheduledQueue, isSameRescheduleSlot } from "../src/utils/rescheduleQueue.js";

// เลื่อนคิวไปช่องเดิม = ไม่ได้เลื่อนจริง
//
// หน้าต่างเปลี่ยนสถานะเติม "วันเดิม/เวลาเดิม" ไว้ในช่องให้ล่วงหน้า กดยืนยันเฉย ๆ โดยไม่แก้
// ระบบจะปิดคิวเดิมเป็น "เลื่อนออก" แล้วสร้างคิวใหม่ "เลื่อนมา" ทับลงช่องเดิมเป๊ะ ๆ
// ตรวจฐานข้อมูลจริง 12 ก.ย. 2569: เกิดมาแล้ว 508 ครั้งตั้งแต่ เม.ย. ในนั้น 13 แถว
// อยู่ในวันที่ยังไม่ถึงและกินเตียงจริง ทั้งที่ไม่มีลูกค้าคนไหนจะมา

const QUEUE = { id: "q1", name: "ก", date: "2026-09-11", timeBlock: 214, roomId: "r1" };

test("ช่องเดิมเป๊ะ ๆ ต้องถือว่าไม่ได้เลื่อน", () => {
  assert.equal(isSameRescheduleSlot(QUEUE, "2026-09-11", 214), true);
  // ไม่ได้ส่งมาเลย = ใช้ค่าเดิม ก็ยังเท่ากับไม่ได้เลื่อน
  assert.equal(isSameRescheduleSlot(QUEUE, undefined, undefined), true);
  assert.equal(isSameRescheduleSlot(QUEUE, "2026-09-11", undefined), true);
});

test("เปลี่ยนวันหรือเปลี่ยนเวลาอย่างใดอย่างหนึ่ง ถือว่าเลื่อนจริง", () => {
  assert.equal(isSameRescheduleSlot(QUEUE, "2026-09-14", 214), false);
  assert.equal(isSameRescheduleSlot(QUEUE, "2026-09-11", 226), false);
});

test("สร้างคิวใหม่ที่ช่องเดิมไม่ได้", () => {
  assert.equal(buildRescheduledQueue(QUEUE, { date: "2026-09-11", timeBlock: 214 }, "2026-09-12"), null);
});

test("เลื่อนจริงยังสร้างคิวใหม่ได้เหมือนเดิม", () => {
  const made = buildRescheduledQueue(QUEUE, { date: "2026-09-14", timeBlock: 226, statusNote: "เลื่อนมา" }, "2026-09-12");
  assert.equal(made.date, "2026-09-14");
  assert.equal(made.timeBlock, 226);
  assert.equal(made.status, "rescheduled_in");
  assert.equal(made.statusNote, "เลื่อนมา");
  assert.equal(made.id, undefined, "ต้องไม่ติด id ของใบเดิมมาด้วย");
});

const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const modal = readFileSync(new URL("../src/components/modals/StatusModal.jsx", import.meta.url), "utf8");

test("หน้าต่างเปลี่ยนสถานะต้องบล็อกก่อนถึงฐานข้อมูล", () => {
  assert.match(modal, /if \(isSameRescheduleSlot\(queue, nd, nb\)\) \{/);
  assert.match(modal, /ยังไม่ได้เปลี่ยนวันหรือเวลา/);
});

test("คิวที่เลื่อนออกไปแล้ว ต้องเลื่อนซ้ำไม่ได้", () => {
  // ใบนั้นปล่อยช่องเวลาไปแล้ว เลื่อนซ้ำได้แต่แถวงอก ต้องไปจัดการที่ใบใหม่แทน
  assert.match(modal, /\["waiting_queue", "rescheduled"\]\.includes\(currentStatus\)/);
});

test("ต้องสร้างใบใหม่ให้ได้ก่อน ค่อยปิดใบเดิม", () => {
  // ปิดใบเดิมไปแล้วเพิ่งรู้ว่าไม่มีช่องใหม่ = คิวหายจากตารางทั้งใบ อันตรายกว่าแถวงอก
  const start = app.indexOf('if (payload.status === "rescheduled") {');
  assert.ok(start > 0);
  const block = app.slice(start, app.indexOf("} else {", start));
  const buildAt = block.indexOf("buildRescheduledQueue(");
  const closeAt = block.indexOf("updateQueueStatusDB(");
  assert.ok(buildAt > 0 && closeAt > buildAt, "ต้องเรียก buildRescheduledQueue ก่อน updateQueueStatusDB");
  assert.match(block, /showToast\("error", "ยังไม่ได้เปลี่ยนวันหรือเวลา/);
});
