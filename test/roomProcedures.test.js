import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRoomProcedureIndex,
  isRoomConfigured,
  isProcedureAllowedInRoom,
  proceduresForRoom,
  roomsForProcedure,
  unservedProcedures,
  shouldEnforceOnSave,
  ALWAYS_ALLOWED_PROCEDURE_NAMES,
  roomLockLabel,
  noteMentionsOutsideSelection,
} from "../src/utils/roomProcedures.js";

// ผังจำลองตามของจริง: สาขาหนึ่งมีเตียง D/T สองเตียง + Hifu + Pico อย่างละหนึ่ง
const rooms = [
  { id: "t1", name: "T01", branchId: "b1", type: "T" },
  { id: "t2", name: "T02", branchId: "b1", type: "T" },
  { id: "t3", name: "T03", branchId: "b1", type: "T" },
  { id: "t4", name: "T04", branchId: "b1", type: "T" },
  { id: "m1", name: "M01", branchId: "b1", type: "M" },
  { id: "x1", name: "T01", branchId: "b2", type: "T" }, // อีกสาขา ยังไม่ตั้งค่า
];

const procedures = [
  { id: "diode", name: "Diode", roomType: "T" },
  { id: "treat", name: "Treatment", roomType: "T" },
  { id: "hifu", name: "Hifu", roomType: "T" },
  { id: "pico", name: "Pico", roomType: "T" },
  { id: "botox", name: "Botox", roomType: "M" },
];

const links = [
  { roomId: "t1", procedureId: "diode" },
  { roomId: "t1", procedureId: "treat" },
  { roomId: "t2", procedureId: "diode" },
  { roomId: "t2", procedureId: "treat" },
  { roomId: "t3", procedureId: "hifu" },
  { roomId: "t4", procedureId: "pico" },
];

const index = buildRoomProcedureIndex(links);
const byId = (id) => procedures.find((p) => p.id === id);
const room = (id) => rooms.find((r) => r.id === id);

test("เตียงที่ตั้งค่าแล้วรับเฉพาะหัตถการที่ผูกไว้", () => {
  assert.equal(isProcedureAllowedInRoom(index, room("t4"), byId("pico")), true);
  assert.equal(isProcedureAllowedInRoom(index, room("t4"), byId("diode")), false);
});

test("โจทย์ตั้งต้น — pico ลงเตียง diode ไม่ได้", () => {
  assert.equal(isProcedureAllowedInRoom(index, room("t1"), byId("pico")), false);
});

test("เตียงที่ยังไม่ตั้งค่า ใช้กติกาเดิม M/T ไม่ใช่ห้ามหมด", () => {
  // นี่คือข้อที่กันไม่ให้ทั้งเครือลงคิวไม่ได้ในวันที่ deploy
  assert.equal(isRoomConfigured(index, "x1"), false);
  assert.equal(isProcedureAllowedInRoom(index, room("x1"), byId("pico")), true);
  assert.equal(isProcedureAllowedInRoom(index, room("x1"), byId("diode")), true);
  assert.equal(isProcedureAllowedInRoom(index, room("x1"), byId("botox")), false);
});

test("ห้อง M ในสาขาที่ตั้งค่าฝั่ง T แล้ว ยังวิ่งกติกาเดิม", () => {
  assert.equal(isProcedureAllowedInRoom(index, room("m1"), byId("botox")), true);
  assert.equal(isProcedureAllowedInRoom(index, room("m1"), byId("pico")), false);
});

test("index ว่าง = ยังไม่มีใครตั้งค่าเลย ทุกอย่างวิ่งกติกาเดิม", () => {
  const empty = buildRoomProcedureIndex([]);
  rooms.forEach((r) => {
    procedures.forEach((p) => {
      assert.equal(isProcedureAllowedInRoom(empty, r, p), p.roomType === r.type);
    });
  });
});

test("proceduresForRoom กรอง dropdown ให้เหลือเฉพาะที่เตียงรับ", () => {
  assert.deepEqual(proceduresForRoom(index, room("t1"), procedures).map((p) => p.id), ["diode", "treat"]);
  assert.deepEqual(proceduresForRoom(index, room("t3"), procedures).map((p) => p.id), ["hifu"]);
});

test("roomsForProcedure หาเตียงที่รับหัตถการนี้ ภายในสาขาเดียวกัน", () => {
  assert.deepEqual(roomsForProcedure(index, rooms, byId("diode"), "b1").map((r) => r.id), ["t1", "t2"]);
  assert.deepEqual(roomsForProcedure(index, rooms, byId("pico"), "b1").map((r) => r.id), ["t4"]);
  // ข้ามสาขาไม่ได้
  assert.equal(roomsForProcedure(index, rooms, byId("pico"), "b1").some((r) => r.branchId !== "b1"), false);
});

test("เตียงรวม hifu+pico แบบสาขาเล็ก ตั้งค่าได้", () => {
  const small = buildRoomProcedureIndex([
    { roomId: "s1", procedureId: "diode" },
    { roomId: "s1", procedureId: "treat" },
    { roomId: "s2", procedureId: "hifu" },
    { roomId: "s2", procedureId: "pico" },
  ]);
  const s2 = { id: "s2", name: "T02", branchId: "b9", type: "T" };
  assert.equal(isProcedureAllowedInRoom(small, s2, byId("hifu")), true);
  assert.equal(isProcedureAllowedInRoom(small, s2, byId("pico")), true);
  assert.equal(isProcedureAllowedInRoom(small, s2, byId("diode")), false);
});

test("เตือนเมื่อมีหัตถการที่ไม่มีเตียงไหนรองรับเลยในสาขา", () => {
  // ผังเต็มข้างบนครอบคลุมทุกหัตถการ T แล้ว → ไม่มีอะไรค้าง
  assert.deepEqual(unservedProcedures(index, rooms, procedures, "b1"), []);

  // ตั้งค่าครบทุกเตียงแล้ว แต่ลืมผูก pico ไว้กับเตียงไหนเลย → ต้องเตือน
  const missingPico = buildRoomProcedureIndex([
    ...links.filter((l) => l.procedureId !== "pico"),
    { roomId: "t4", procedureId: "hifu" }, // t4 ถูกตั้งเป็นเตียง hifu ตัวที่สอง ไม่ใช่ pico
  ]);
  assert.deepEqual(
    unservedProcedures(missingPico, rooms, procedures, "b1").map((p) => p.id),
    ["pico"]
  );
});

test("เตียงที่ยังไม่ถูกแตะในสาขาที่ตั้งค่าบางส่วน ยังอุดช่องว่างให้อยู่", () => {
  // t4 ไม่มีแถวเลย → ยังวิ่งกติกาเดิม รับ T ได้ทุกตัว pico จึงยังลงได้ ไม่ต้องเตือน
  const partial = buildRoomProcedureIndex(links.filter((l) => l.roomId !== "t4"));
  assert.equal(isProcedureAllowedInRoom(partial, room("t4"), byId("pico")), true);
  assert.deepEqual(unservedProcedures(partial, rooms, procedures, "b1"), []);
});

test("สาขาที่ยังไม่แตะเลย ไม่ต้องเตือน (ยังวิ่งกติกาเดิม ไม่มีอะไรพัง)", () => {
  assert.deepEqual(unservedProcedures(index, rooms, procedures, "b2"), []);
});

// ─── สกรีนเฉพาะของที่ลงใหม่ (ช่วงเปลี่ยนผ่าน ส.ค. 2569) ───

test("สร้างคิวใหม่ ตรวจเสมอ", () => {
  assert.equal(shouldEnforceOnSave(null, { roomId: "t1", procedureId: "pico" }), true);
});

test("แก้คิวเก่าแค่เวลา ไม่ตรวจ — คิวที่วางตามผังเดิมยังแก้ได้", () => {
  const original = { id: "q1", roomId: "t1", procedureId: "pico", timeBlock: 150 };
  assert.equal(shouldEnforceOnSave(original, { roomId: "t1", procedureId: "pico", timeBlock: 168 }), false);
});

test("ย้ายเตียง = วางคิวใหม่ ต้องตรวจ", () => {
  const original = { id: "q1", roomId: "t1", procedureId: "pico" };
  assert.equal(shouldEnforceOnSave(original, { roomId: "t2", procedureId: "pico" }), true);
});

test("เปลี่ยนหัตถการ ต้องตรวจ", () => {
  const original = { id: "q1", roomId: "t1", procedureId: "diode" };
  assert.equal(shouldEnforceOnSave(original, { roomId: "t1", procedureId: "pico" }), true);
});

test("คิวเก่าที่ผิดผัง ย้ายไปเตียงที่รับไม่ได้ ยังต้องโดนบล็อก", () => {
  // คิว pico บนเตียง D/T จากผังเดิม — ย้ายไปเตียง D/T อีกใบต้องไม่ผ่าน
  const original = { id: "q1", roomId: "t1", procedureId: "pico" };
  const next = { roomId: "t2", procedureId: "pico" };
  assert.equal(shouldEnforceOnSave(original, next), true);
  assert.equal(isProcedureAllowedInRoom(index, room("t2"), byId("pico")), false);
});

test("ข้อมูลเสียไม่ทำให้ index พัง", () => {
  const dirty = buildRoomProcedureIndex([
    null,
    { roomId: "t1" },
    { procedureId: "pico" },
    { roomId: "t1", procedureId: "diode" },
  ]);
  assert.equal(dirty.size, 1);
  assert.equal(dirty.get("t1").size, 1);
});

test("รายชื่อหัตถการกลางคงที่ — หน้าตั้งค่าใช้บังคับติ๊กให้ทุกเตียง", () => {
  // จับด้วยชื่อเพราะ ปิดคิว/Influencer มีทั้งเวอร์ชัน M และ T (คนละ id)
  // ถ้าเทสต์นี้พัง แปลว่ามีคนแก้รายชื่อ — ต้องแน่ใจว่าตั้งใจ และหน้าตั้งค่ายังครอบ ปิดคิว อยู่
  assert.deepEqual(
    [...ALWAYS_ALLOWED_PROCEDURE_NAMES].sort(),
    ["Influencer", "ปรึกษาทั่วไป", "ปิดคิว", "โปรประจำเดือน (T)"].sort()
  );
});

// ─── ป้ายจากตัวล็อก — ต้องมาจากแหล่งเดียวกับที่ใช้บล็อก ไม่ใช่โน้ตที่พิมพ์เอง ───

test("ป้ายของเตียงที่ตั้งค่าแล้ว บอกชื่อหัตถการที่รับ", () => {
  assert.equal(roomLockLabel(index, room("t4"), procedures), "Pico");
  assert.equal(roomLockLabel(index, room("t1"), procedures), "Diode, Treatment");
});

test("เตียงที่ยังไม่ตั้งค่า ไม่มีป้าย — ไม่มีอะไรจะบอก", () => {
  assert.equal(roomLockLabel(index, room("x1"), procedures), null);
  assert.equal(roomLockLabel(buildRoomProcedureIndex([]), room("t1"), procedures), null);
});

test("ป้ายซ่อนหัตถการกลาง เพราะทุกเตียงมีเหมือนกัน ใส่ไปไม่ช่วยแยก", () => {
  const withGeneric = [
    ...procedures,
    { id: "close", name: "ปิดคิว", roomType: "T" },
    { id: "infl", name: "Influencer", roomType: "T" },
  ];
  const idx = buildRoomProcedureIndex([
    { roomId: "t4", procedureId: "pico" },
    { roomId: "t4", procedureId: "close" },
    { roomId: "t4", procedureId: "infl" },
  ]);
  assert.equal(roomLockLabel(idx, room("t4"), withGeneric), "Pico");
});

test("เตียงที่ติ๊กเฉพาะหัตถการกลาง ถือว่าไม่มีป้าย", () => {
  const withGeneric = [...procedures, { id: "close", name: "ปิดคิว", roomType: "T" }];
  const idx = buildRoomProcedureIndex([{ roomId: "t4", procedureId: "close" }]);
  assert.equal(roomLockLabel(idx, room("t4"), withGeneric), null);
});

test("ป้ายยาวเกิน 3 ตัวถูกย่อ — หัวคอลัมน์ Timeline แคบ", () => {
  const many = ["a", "b", "c", "d", "e"].map((id) => ({ id, name: id.toUpperCase(), roomType: "T" }));
  const idx = buildRoomProcedureIndex(many.map((p) => ({ roomId: "t1", procedureId: p.id })));
  assert.equal(roomLockLabel(idx, room("t1"), many), "A, B, C +2");
});

// ─── ตัวเตือนตัวเดียว ครอบโน้ตทั้งสองแหล่ง ───

test("โน้ตประจำเตียงพูดถึงหัตถการที่ไม่ได้ติ๊ก → เตือน แหล่ง room", () => {
  const out = noteMentionsOutsideSelection({
    selectedIds: ["hifu"], roomNote: "รับ Pico ทุกวัน คิวสุดท้าย 18:30", scheduleNotes: [], procedures,
  });
  assert.deepEqual(out, [{ name: "Pico", sources: ["room"] }]);
});

test("โน้ตรายวันพูดถึงหัตถการที่ไม่ได้ติ๊ก → เตือน แหล่ง schedule", () => {
  const out = noteMentionsOutsideSelection({
    selectedIds: ["hifu"], roomNote: "", scheduleNotes: ["📅 รับเฉพาะคิว pico", "หมอบอล 12:00-20:00"], procedures,
  });
  assert.deepEqual(out, [{ name: "Pico", sources: ["schedule"] }]);
});

test("ขัดทั้งสองแหล่ง → รายงานทั้งคู่ในรายการเดียว พร้อมระบุแหล่งของแต่ละตัว", () => {
  const out = noteMentionsOutsideSelection({
    selectedIds: ["hifu"], roomNote: "รับ pico", scheduleNotes: ["Diode/Treatment", "รับ Pico"], procedures,
  });
  assert.deepEqual(out.map((c) => c.name), ["Diode", "Pico", "Treatment"]);
  assert.deepEqual(out.find((c) => c.name === "Pico").sources, ["room", "schedule"]);
  assert.deepEqual(out.find((c) => c.name === "Diode").sources, ["schedule"]);
});

test("โน้ตพูดถึงหัตถการที่ติ๊กแล้ว → ไม่เตือน (ตรงกันดี)", () => {
  const out = noteMentionsOutsideSelection({
    selectedIds: ["pico"], roomNote: "รับ Pico", scheduleNotes: ["Pico"], procedures,
  });
  assert.deepEqual(out, []);
});

test("ยังไม่ติ๊กอะไรเลย → ไม่เตือน (เตียงยังไม่ตั้งค่า ไม่มีล็อกให้ขัด)", () => {
  const out = noteMentionsOutsideSelection({
    selectedIds: [], roomNote: "รับ Pico", scheduleNotes: ["Hifu"], procedures,
  });
  assert.deepEqual(out, []);
});

test("หัตถการกลางในโน้ตไม่นับเป็นความขัดแย้ง — ทุกเตียงมีอยู่แล้ว", () => {
  const withGeneric = [...procedures, { id: "close", name: "ปิดคิว", roomType: "T" }];
  const out = noteMentionsOutsideSelection({
    selectedIds: ["hifu"], roomNote: "ปิดคิว 12:00", scheduleNotes: [], procedures: withGeneric,
  });
  assert.deepEqual(out, []);
});

test("ตัวย่ออย่าง D/T ไม่ถูกจับ — ข้อจำกัดที่รู้ไว้ ไม่ใช่บั๊ก", () => {
  const out = noteMentionsOutsideSelection({
    selectedIds: ["hifu"], roomNote: "D/T อื่นๆ", scheduleNotes: [], procedures,
  });
  assert.deepEqual(out, []);
});
