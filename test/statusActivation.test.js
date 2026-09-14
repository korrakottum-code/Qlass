import test from "node:test";
import assert from "node:assert/strict";
import {
  ACTIVATED_STATUSES,
  UNACTIVATED_STATUSES,
  ACTIVATION_EXCLUDED_STATUSES,
  classifyActivation,
  buildActivationReport,
  formatRate,
} from "../src/utils/statusActivation.js";
import { QUEUE_STATUSES } from "../src/utils/constants.js";

const TODAY = "2026-09-11";
const PAST = "2026-09-08";
const FUTURE = "2026-09-20";

const branches = [
  { id: "b1", name: "สาขาขอนแก่น" },
  { id: "b2", name: "สาขาสยาม" },
];

function q(over = {}) {
  return { id: over.id || Math.random().toString(36).slice(2), branchId: "b1", date: PAST, timeBlock: 132, status: "done", ...over };
}

test("ทุกสถานะในระบบถูกจัดกลุ่มไว้แล้ว — เพิ่มสถานะใหม่แล้วเทสต์นี้ต้องแดง", () => {
  const covered = new Set([...ACTIVATED_STATUSES, ...UNACTIVATED_STATUSES, ...ACTIVATION_EXCLUDED_STATUSES]);
  for (const s of QUEUE_STATUSES) {
    assert.ok(covered.has(s.value), `สถานะ "${s.value}" ยังไม่ได้ตัดสินว่าอยู่กลุ่มไหน`);
  }
  assert.equal(covered.size, QUEUE_STATUSES.length);
});

test("ค้างไม่แอคทีฟ นับเฉพาะคิวที่วันนัดผ่านไปแล้ว", () => {
  for (const status of ["pending", "follow1", "follow2", "follow3", "confirmed", "rescheduled_in"]) {
    assert.equal(classifyActivation(q({ status, date: PAST }), TODAY), "overdue", status);
    // วันนี้ยังไม่ถือว่าผิด — วันยังไม่จบ
    assert.equal(classifyActivation(q({ status, date: TODAY }), TODAY), "not_due", status);
    assert.equal(classifyActivation(q({ status, date: FUTURE }), TODAY), "not_due", status);
  }
});

test("เลื่อนออก/ยกเลิก/ไม่มา/เสร็จ ถือว่าแอคทีฟแล้ว ส่วนคิวรอไม่นับเลย", () => {
  for (const status of ACTIVATED_STATUSES) {
    assert.equal(classifyActivation(q({ status, date: PAST }), TODAY), "activated", status);
  }
  assert.equal(classifyActivation(q({ status: "waiting_queue", date: PAST }), TODAY), "excluded");
});

test("สถานะแปลกปลอมถือว่ายังไม่ปิดงาน ไม่ถูกกลืนหาย", () => {
  assert.equal(classifyActivation(q({ status: "something_new", date: PAST }), TODAY), "overdue");
});

test("% แอคทีฟ หารด้วยเฉพาะคิวที่ครบกำหนด ส่วน % มาจริง หารด้วยนัดทั้งหมด", () => {
  const { total } = buildActivationReport([
    q({ status: "done", date: PAST }),
    q({ status: "no_show", date: PAST }),
    q({ status: "pending", date: PAST }),      // ค้าง
    q({ status: "confirmed", date: PAST }),    // ค้าง
    q({ status: "pending", date: FUTURE }),    // ยังไม่ครบกำหนด ไม่นับเป็นค้าง
    q({ status: "waiting_queue", date: PAST }),// ไม่นับเลย
  ], { today: TODAY, branches });

  assert.equal(total.total, 5);        // ตัด waiting_queue ออกใบเดียว
  assert.equal(total.dueTotal, 4);     // ตัดคิวอนาคตออกอีกใบ
  assert.equal(total.dueActivated, 2);
  assert.equal(total.overdue, 2);
  assert.equal(formatRate(total.activeRate), "50%");
  assert.equal(formatRate(total.showRate), "20%"); // 1 done จาก 5 นัด
});

test("คิวอนาคตที่ปิดงานไปแล้ว ไม่ถูกนับเข้าตัวหาร % แอคทีฟ", () => {
  const { total } = buildActivationReport([
    q({ status: "cancelled", date: FUTURE }),
    q({ status: "pending", date: PAST }),
  ], { today: TODAY, branches });
  assert.equal(total.dueTotal, 1);
  assert.equal(total.dueActivated, 0);
  assert.equal(formatRate(total.activeRate), "0%");
});

test("ไม่มีคิวครบกำหนดเลย ให้แสดงขีด ไม่ใช่ 0%", () => {
  const { total } = buildActivationReport([q({ status: "pending", date: FUTURE })], { today: TODAY, branches });
  assert.equal(total.activeRate, null);
  assert.equal(formatRate(total.activeRate), "—");
});

test("แยกตามสาขา เรียงสาขาที่ค้างเยอะสุดขึ้นก่อน และมีแถวรวม", () => {
  const { rows, total } = buildActivationReport([
    q({ branchId: "b1", status: "done", date: PAST }),
    q({ branchId: "b2", status: "pending", date: PAST }),
    q({ branchId: "b2", status: "follow2", date: PAST }),
    q({ branchId: null, status: "follow1", date: PAST }),
  ], { today: TODAY, branches });

  assert.deepEqual(rows.map((r) => r.branchName), ["สาขาสยาม", "สาขาขอนแก่น", "ไม่ระบุสาขา"]);
  assert.deepEqual(rows[0].overdueByStatus, { pending: 1, follow2: 1 });
  assert.equal(rows[1].overdue, 0);
  assert.equal(total.overdue, 3);
  assert.equal(total.total, 4);
});

test("รายการคิวค้างถูกส่งกลับมาให้ไล่แก้ เรียงตามวันนัดแล้วเวลานัด", () => {
  const { rows } = buildActivationReport([
    q({ id: "late", branchId: "b1", status: "pending", date: "2026-09-09", timeBlock: 150 }),
    q({ id: "early", branchId: "b1", status: "pending", date: "2026-09-09", timeBlock: 120 }),
    q({ id: "older", branchId: "b1", status: "confirmed", date: "2026-09-01", timeBlock: 200 }),
  ], { today: TODAY, branches });
  assert.deepEqual(rows[0].overdueQueues.map((x) => x.id), ["older", "early", "late"]);
});

// ─── การเรียงลำดับ ───
const rowsFixture = () => buildActivationReport([
  q({ branchId: "b1", status: "done", date: PAST }),
  q({ branchId: "b1", status: "done", date: PAST }),
  q({ branchId: "b1", status: "pending", date: PAST }),
  q({ branchId: "b2", status: "no_show", date: PAST }),
  q({ branchId: "b2", status: "pending", date: PAST }),
  q({ branchId: "b2", status: "pending", date: PAST }),
  q({ branchId: null, status: "pending", date: PAST }),
], { today: TODAY, branches }).rows;

test("เรียงตามคอลัมน์ที่เลือกได้ทั้งขึ้นและลง", async (t) => {
  const { sortActivationRows } = await import("../src/utils/statusActivation.js");
  const rows = rowsFixture();
  assert.deepEqual(sortActivationRows(rows, "overdue", "desc").map((r) => r.branchName),
    ["สาขาสยาม", "สาขาขอนแก่น", "ไม่ระบุสาขา"]);
  assert.deepEqual(sortActivationRows(rows, "overdue", "asc").map((r) => r.branchName),
    ["สาขาขอนแก่น", "สาขาสยาม", "ไม่ระบุสาขา"]);
  assert.deepEqual(sortActivationRows(rows, "done", "desc").map((r) => r.branchName),
    ["สาขาขอนแก่น", "สาขาสยาม", "ไม่ระบุสาขา"]);
  assert.deepEqual(sortActivationRows(rows, "branchName", "asc").map((r) => r.branchName),
    ["สาขาขอนแก่น", "สาขาสยาม", "ไม่ระบุสาขา"]);
});

test("ไม่ระบุสาขาอยู่ท้ายเสมอ และการเรียงไม่แก้อาร์เรย์เดิม", async (t) => {
  const { sortActivationRows } = await import("../src/utils/statusActivation.js");
  const rows = rowsFixture();
  const before = rows.map((r) => r.branchName);
  for (const key of ["branchName", "total", "done", "noShow", "overdue", "activeRate", "showRate"]) {
    for (const dir of ["asc", "desc"]) {
      const out = sortActivationRows(rows, key, dir);
      assert.equal(out[out.length - 1].branchName, "ไม่ระบุสาขา", `${key}/${dir}`);
    }
  }
  assert.deepEqual(rows.map((r) => r.branchName), before);
});

test("สาขาที่ยังไม่มีคิวครบกำหนด (% ว่าง) ไปอยู่ท้ายกลุ่ม ไม่ถูกนับเป็นศูนย์", async (t) => {
  const { sortActivationRows } = await import("../src/utils/statusActivation.js");
  const rows = buildActivationReport([
    q({ branchId: "b1", status: "pending", date: FUTURE }),  // ยังไม่ครบกำหนด → activeRate = null
    q({ branchId: "b2", status: "pending", date: PAST }),    // ครบกำหนดแต่ค้าง → 0%
  ], { today: TODAY, branches }).rows;
  assert.deepEqual(sortActivationRows(rows, "activeRate", "asc").map((r) => r.branchName),
    ["สาขาสยาม", "สาขาขอนแก่น"]);
  assert.deepEqual(sortActivationRows(rows, "activeRate", "desc").map((r) => r.branchName),
    ["สาขาสยาม", "สาขาขอนแก่น"]);
});

test("% ไม่มา คิดจากนัดทั้งหมดเหมือน % มาจริง และเรียงได้", async (t) => {
  const { sortActivationRows } = await import("../src/utils/statusActivation.js");
  const { rows, total } = buildActivationReport([
    q({ branchId: "b1", status: "done", date: PAST }),
    q({ branchId: "b1", status: "no_show", date: PAST }),
    q({ branchId: "b1", status: "no_show", date: PAST }),
    q({ branchId: "b1", status: "no_show", date: PAST }),
    q({ branchId: "b2", status: "done", date: PAST }),
    q({ branchId: "b2", status: "no_show", date: PAST }),
  ], { today: TODAY, branches });

  assert.equal(formatRate(total.noShowRate), "67%"); // 4 จาก 6
  const b1 = rows.find((r) => r.branchId === "b1");
  assert.equal(formatRate(b1.noShowRate), "75%");
  assert.equal(formatRate(b1.showRate), "25%");
  assert.deepEqual(sortActivationRows(rows, "noShowRate", "desc").map((r) => r.branchName),
    ["สาขาขอนแก่น", "สาขาสยาม"]);
  assert.deepEqual(sortActivationRows(rows, "noShowRate", "asc").map((r) => r.branchName),
    ["สาขาสยาม", "สาขาขอนแก่น"]);
});

test("สาขาที่ไม่มีคิวเลย % ไม่มา เป็นค่าว่าง ไม่ใช่ 0%", () => {
  const { total } = buildActivationReport([q({ status: "waiting_queue", date: PAST })], { today: TODAY, branches });
  assert.equal(total.noShowRate, null);
});
