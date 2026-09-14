import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildActivationReport, isAppointmentQueue } from "../src/utils/statusActivation.js";

const page = readFileSync(new URL("../src/pages/SummaryPage.jsx", import.meta.url), "utf8");

// เคสจริงย่อส่วนจาก 12 ก.ย. 2569: การ์ดเคยขึ้น 1,855 รายงานขึ้น 1,843 ต่างกัน 12 = คิวรอ
const DAY = "2026-09-12";
const TODAY = "2026-09-13";
const queues = [
  { id: "1", status: "done", date: DAY, branchId: "b1" },
  { id: "2", status: "no_show", date: DAY, branchId: "b1" },
  { id: "3", status: "cancelled", date: DAY, branchId: "b2" },
  { id: "4", status: "waiting_queue", date: DAY, branchId: "b1" },
  { id: "5", status: "waiting_queue", date: DAY, branchId: "b2" },
];

test("คิวรอไม่นับเป็นนัด สถานะอื่นนับหมด", () => {
  assert.equal(isAppointmentQueue({ status: "done" }), true);
  assert.equal(isAppointmentQueue({ status: "pending" }), true);
  assert.equal(isAppointmentQueue({ status: "rescheduled_in" }), true);
  assert.equal(isAppointmentQueue({ status: "waiting_queue" }), false);
  assert.equal(isAppointmentQueue({}), false, "ไม่มีสถานะ = ตัดออกเหมือนที่รายงานตัด");
});

test("ยอดการ์ดคิวนัดทำต้องเท่ากับยอดรวมในรายงานแอคทีฟ", () => {
  const cardCount = queues.filter((q) => isAppointmentQueue(q)).length;
  const report = buildActivationReport(queues, { today: TODAY, branches: [] });
  assert.equal(cardCount, 3);
  assert.equal(report.total.total, cardCount, "สองเลขบนหน้าเดียวกันต้องตรงกัน");
});

test("จำนวนคิวรอที่ตัดออก = ส่วนต่างเดิมของสองเลขนั้น", () => {
  const waiting = queues.filter((q) => !isAppointmentQueue(q)).length;
  const report = buildActivationReport(queues, { today: TODAY, branches: [] });
  assert.equal(queues.length - report.total.total, waiting);
});

test("หน้าสรุปกรองคิวรอออกจาก appointmentQueues ด้วยกติกากลาง", () => {
  assert.match(page, /isAppointmentQueue\(q\) && inRange\(q\.date\)/);
  assert.doesNotMatch(page, /filteredQueues\s*\n\s*\.filter\(\(q\) => inRange\(q\.date\)\)/);
});

test("หน้าสรุปต้องบอกจำนวนคิวรอที่ตัดออก ไม่ใช่หายเงียบ", () => {
  assert.match(page, /waitingInRange/);
  assert.match(page, /ช่วงนี้มีคิวรออีก/);
});
