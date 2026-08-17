import test from "node:test";
import assert from "node:assert/strict";
import {
  BED_SWITCH_SOURCE,
  BED_SWITCH_DEFAULT_NOTE,
  isFullDayClosure,
  buildBedSwitchClosure,
  getBedSwitchState,
  listQueuesOnBed,
  summarizeQueueList,
} from "../src/utils/bedSwitch.js";
import { roleAtLeastForRoles } from "../src/utils/accessControl.js";
import { readFileSync } from "node:fs";

// helpers.js ใช้ import แบบไม่มีนามสกุล (Vite) จึง import ใต้ node ตรง ๆ ไม่ได้ (ไม่มีเทสต์ไหนทำ)
// เทสต์นี้จึงยืนยันสองทางแทน: (1) อ่านซอร์สว่า isRoomBlockClosed เรียก isFullDayClosure จริง
// (2) จำลอง INACTIVE_QUEUE_STATUSES / ROLES ตามค่าจริงในซอร์ส
const helpersSrc = readFileSync(new URL("../src/utils/helpers.js", import.meta.url), "utf8");
const constantsSrc = readFileSync(new URL("../src/utils/constants.js", import.meta.url), "utf8");
const INACTIVE = ["cancelled", "no_show", "rescheduled"];
const isActiveQueueStatus = (status) => !INACTIVE.includes(status);
const ROLE_ORDER = ["ceo", "superadmin", "head_admin", "admin", "branch_manager", "cashier"];
const ROLES = ROLE_ORDER.map((value) => ({ value }));
const roleAtLeast = (user, minRole) => roleAtLeastForRoles(user, minRole, ROLES);

// ─── isFullDayClosure: คำนิยามเดียวของ "ปิดทั้งวัน" ───

test("ปิดทั้งวัน = available false + startBlock null และไม่ใช่ noteOnly", () => {
  assert.equal(isFullDayClosure({ available: false, noteOnly: false, startBlock: null, endBlock: null }), true);
  assert.equal(isFullDayClosure({ available: false, noteOnly: false }), true); // undefined ก็นับ
});

test("ไม่ใช่ปิดทั้งวัน: ปิดบางช่วง / noteOnly / เปิดพิเศษ / null", () => {
  assert.equal(isFullDayClosure({ available: false, noteOnly: false, startBlock: 144, endBlock: 156 }), false);
  assert.equal(isFullDayClosure({ available: true, noteOnly: true, startBlock: null, endBlock: null }), false);
  assert.equal(isFullDayClosure({ available: true, noteOnly: false, startBlock: 168, endBlock: 240 }), false);
  assert.equal(isFullDayClosure(null), false);
});

// ─── buildBedSwitchClosure ───

test("แถวที่ปุ่มสร้างใช้ encoding ปิดทั้งวันเป๊ะ + ติดป้าย source", () => {
  const row = buildBedSwitchClosure({ roomId: "r1", date: "2026-08-20", note: "" });
  assert.deepEqual(row, {
    roomId: "r1", date: "2026-08-20",
    available: false, startBlock: null, endBlock: null, noteOnly: false,
    note: BED_SWITCH_DEFAULT_NOTE, source: BED_SWITCH_SOURCE,
  });
  assert.equal(isFullDayClosure(row), true);
});

test("หมายเหตุที่พิมพ์เองถูก trim, ว่าง → ใช้ค่า default", () => {
  assert.equal(buildBedSwitchClosure({ roomId: "r1", date: "d", note: "  ช่างมาซ่อม  " }).note, "ช่างมาซ่อม");
  assert.equal(buildBedSwitchClosure({ roomId: "r1", date: "d", note: "   " }).note, BED_SWITCH_DEFAULT_NOTE);
  assert.equal(buildBedSwitchClosure({ roomId: "r1", date: "d" }).note, BED_SWITCH_DEFAULT_NOTE);
});

test("agreement: helpers.isRoomBlockClosed ใช้ isFullDayClosure ตัวเดียวกันเป็น step 1", () => {
  // กันคนมาเขียนกติกา "ปิดทั้งวัน" ซ้ำใน helpers ทีหลังจนสองที่หลุดกัน
  assert.match(helpersSrc, /import \{ isFullDayClosure \} from "\.\/bedSwitch"/);
  assert.match(helpersSrc, /const isClosedAllDay = schedules\.some\(isFullDayClosure\)/);
  // และห้ามมีสูตรเดิมหลงเหลืออยู่ในไฟล์
  assert.doesNotMatch(helpersSrc, /!s\.available && !s\.noteOnly && \(s\.startBlock === null \|\| s\.startBlock === undefined\)/);
});

test("agreement: ค่าที่เทสต์นี้จำลองไว้ตรงกับซอร์สจริง (กันเทสต์เก่าเมื่อค่าเปลี่ยน)", () => {
  assert.match(helpersSrc, /INACTIVE_QUEUE_STATUSES = \["cancelled", "no_show", "rescheduled"\]/);
  const valuesInOrder = [...constantsSrc.matchAll(/^\s+value: "(ceo|superadmin|head_admin|admin|branch_manager|cashier)",/gm)].map((m) => m[1]);
  assert.deepEqual(valuesInOrder, ROLE_ORDER);
});

// ─── getBedSwitchState ───

const D = "2026-08-20";
const sw = (over = {}) => ({ id: "sw", ...buildBedSwitchClosure({ roomId: "r1", date: D }), ...over });
const hand = (over = {}) => ({ id: "h", roomId: "r1", date: D, available: false, noteOnly: false, startBlock: null, endBlock: null, note: "ซ่อม", source: null, ...over });

test("ไม่มีแถว → open", () => {
  assert.equal(getBedSwitchState([], "r1", D).state, "open");
});

test("มีแถวจากปุ่ม → closed_by_switch พร้อมแถวให้ลบ", () => {
  const st = getBedSwitchState([sw()], "r1", D);
  assert.equal(st.state, "closed_by_switch");
  assert.equal(st.switchRows.length, 1);
  assert.equal(st.handRows.length, 0);
});

test("มีแถวจาก ScheduleModal (source ว่าง) → closed_by_hand", () => {
  assert.equal(getBedSwitchState([hand()], "r1", D).state, "closed_by_hand");
});

test("มีทั้งสองแบบ → hand ชนะ (เปิดคืนจากปุ่มจะไม่ทำให้เตียงเปิดจริง)", () => {
  const st = getBedSwitchState([sw(), hand()], "r1", D);
  assert.equal(st.state, "closed_by_hand");
  assert.equal(st.switchRows.length, 1);
  assert.equal(st.handRows.length, 1);
});

test("แถว 'ทุกวัน' (date ว่าง) ถือเป็น hand แม้จะติด source ก็ตาม — ปุ่มไม่เคยสร้างแถวแบบนี้", () => {
  assert.equal(getBedSwitchState([hand({ date: "" })], "r1", D).state, "closed_by_hand");
  assert.equal(getBedSwitchState([sw({ date: "" })], "r1", D).state, "closed_by_hand");
});

test("แถวปิดของวันอื่น / ห้องอื่น ไม่นับ", () => {
  assert.equal(getBedSwitchState([sw({ date: "2026-08-21" })], "r1", D).state, "open");
  assert.equal(getBedSwitchState([sw({ roomId: "r2" })], "r1", D).state, "open");
});

test("แถว bed_switch ที่ถูกแก้เป็นปิดบางช่วงทีหลัง ไม่ใช่ปิดทั้งวันแล้ว → open", () => {
  assert.equal(getBedSwitchState([sw({ startBlock: 144, endBlock: 156 })], "r1", D).state, "open");
});

test("แถว noteOnly ไม่นับเป็นปิด", () => {
  assert.equal(getBedSwitchState([hand({ available: true, noteOnly: true })], "r1", D).state, "open");
});

// ─── listQueuesOnBed / summarizeQueueList ───

const queues = [
  { id: 1, roomId: "r1", date: D, timeBlock: 168, name: "บ่าย", status: "pending" },
  { id: 2, roomId: "r1", date: D, timeBlock: 144, name: "เที่ยง", status: "confirmed" },
  { id: 3, roomId: "r1", date: D, timeBlock: 132, name: "ยกเลิก", status: "cancelled" },
  { id: 4, roomId: "r1", date: D, timeBlock: null, name: "ไม่มีเวลา", status: "pending" },
  { id: 5, roomId: "r2", date: D, timeBlock: 140, name: "ห้องอื่น", status: "pending" },
  { id: 6, roomId: "r1", date: "2026-08-21", timeBlock: 140, name: "วันอื่น", status: "pending" },
];

test("listQueuesOnBed กรองห้อง+วัน ตัดคิวที่ไม่ครองเวลา เรียงตามเวลา null ท้ายสุด", () => {
  const out = listQueuesOnBed({ queues, roomId: "r1", date: D, isActiveQueueStatus });
  assert.deepEqual(out.map((q) => q.name), ["เที่ยง", "บ่าย", "ไม่มีเวลา"]);
});

test("ไม่ส่ง predicate → นับทุกสถานะ (fail-open ปลอดภัยกว่าซ่อนคิว)", () => {
  const out = listQueuesOnBed({ queues, roomId: "r1", date: D });
  assert.equal(out.length, 4);
});

test("summarizeQueueList ตัดที่ cap และนับที่ซ่อน", () => {
  const list = Array.from({ length: 11 }, (_, i) => ({ id: i }));
  const s = summarizeQueueList(list, 8);
  assert.equal(s.shown.length, 8);
  assert.equal(s.hiddenCount, 3);
  assert.deepEqual(summarizeQueueList([], 8), { shown: [], hiddenCount: 0 });
});

// ─── roleAtLeast ───


test("branch_manager ขึ้นไปกดปุ่มปิดเตียงได้ แคชเชียร์ไม่ได้", () => {
  for (const role of ["ceo", "superadmin", "head_admin", "admin", "branch_manager"]) {
    assert.equal(roleAtLeast({ role }, "branch_manager"), true, role);
  }
  assert.equal(roleAtLeast({ role: "cashier" }, "branch_manager"), false);
});

test("roleAtLeast ตอบ false เมื่อไม่มี user / role แปลก / minRole แปลก — ไม่เดา", () => {
  assert.equal(roleAtLeast(null, "branch_manager"), false);
  assert.equal(roleAtLeast({}, "branch_manager"), false);
  assert.equal(roleAtLeast({ role: "ghost" }, "branch_manager"), false);
  assert.equal(roleAtLeast({ role: "ceo" }, "ghost"), false);
});

test("role ต่ำกว่าไม่นับว่าอย่างน้อยเท่ากับ role สูงกว่า", () => {
  assert.equal(roleAtLeast({ role: "branch_manager" }, "admin"), false);
  assert.equal(roleAtLeast({ role: "admin" }, "admin"), true);
});
