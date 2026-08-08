import test from "node:test";
import assert from "node:assert/strict";
import {
  isOverdueUnconfirmed,
  isOverdueMoveNote,
  OVERDUE_MOVE_NOTE_PREFIX,
} from "../src/utils/waitingQueueRules.js";

// 2026-08-09 เวลาต่าง ๆ (local) สำหรับ inject เป็น "ตอนนี้"
const at = (h, m = 0) => new Date(2026, 7, 9, h, m);
const TODAY = "2026-08-09";

test("overdue flag fires only for unconfirmed statuses on the appointment day past 12:00", () => {
  const base = { date: TODAY, status: "pending" };
  assert.equal(isOverdueUnconfirmed(base, at(13, 0)), true);
  assert.equal(isOverdueUnconfirmed(base, at(12, 0)), true, "exactly 12:00 counts as past cutoff");
  assert.equal(isOverdueUnconfirmed(base, at(11, 55)), false);
  // follow-up statuses ยังถือว่ายังไม่ยืนยัน
  assert.equal(isOverdueUnconfirmed({ ...base, status: "follow2" }, at(13, 0)), true);
  // ไม่มี status = pending โดยปริยาย
  assert.equal(isOverdueUnconfirmed({ date: TODAY }, at(13, 0)), true);
});

test("overdue flag never fires for confirmed/done/cancelled or other dates", () => {
  assert.equal(isOverdueUnconfirmed({ date: TODAY, status: "confirmed" }, at(15, 0)), false);
  assert.equal(isOverdueUnconfirmed({ date: TODAY, status: "done" }, at(15, 0)), false);
  assert.equal(isOverdueUnconfirmed({ date: TODAY, status: "cancelled" }, at(15, 0)), false);
  assert.equal(isOverdueUnconfirmed({ date: TODAY, status: "waiting_queue" }, at(15, 0)), false);
  // วันนัดอนาคต/อดีต ไม่เตือน แม้เวลาปัจจุบันเลยเที่ยง
  assert.equal(isOverdueUnconfirmed({ date: "2026-08-10", status: "pending" }, at(15, 0)), false);
  assert.equal(isOverdueUnconfirmed({ date: "2026-08-08", status: "pending" }, at(15, 0)), false);
});

test("overdue-move note prefix separates moved queues from plain walk-in waiting entries", () => {
  assert.equal(isOverdueMoveNote(`${OVERDUE_MOVE_NOTE_PREFIX} T02 11:30 (9 ส.ค. 2569) — ย้ายเข้าคิวรอเพราะยังไม่ยืนยัน`), true);
  assert.equal(isOverdueMoveNote("ลูกค้า VIP แพ้ยาชา"), false);
  assert.equal(isOverdueMoveNote(""), false);
  assert.equal(isOverdueMoveNote(undefined), false);
  assert.equal(isOverdueMoveNote(null), false);
});
