import test from "node:test";
import assert from "node:assert/strict";
import {
  reconcileRealtimeById,
  reconcileRealtimeQueue,
  reconcileRealtimeRoomProcedure,
} from "../src/utils/realtimeQueueState.js";

// ─── reconcileRealtimeRoomProcedure — key คือคู่ (roomId, procedureId) ───

const L = (roomId, procedureId) => ({ roomId, procedureId });
const base = [L("r1", "diode"), L("r1", "treat"), L("r2", "pico")];

test("INSERT เพิ่มคู่ที่ยังไม่มี", () => {
  const out = reconcileRealtimeRoomProcedure(base, "INSERT", L("r1", "hifu"));
  assert.equal(out.length, 4);
  assert.ok(out.some((l) => l.roomId === "r1" && l.procedureId === "hifu"));
});

test("INSERT คู่ที่มีอยู่แล้ว → คืน reference เดิม (echo จาก optimistic write เป็น no-op)", () => {
  const out = reconcileRealtimeRoomProcedure(base, "INSERT", L("r1", "diode"));
  assert.equal(out, base);
});

test("DELETE ลบเฉพาะคู่นั้น คู่อื่นของห้องเดียวกันยังอยู่", () => {
  const out = reconcileRealtimeRoomProcedure(base, "DELETE", L("r1", "diode"));
  assert.deepEqual(out, [L("r1", "treat"), L("r2", "pico")]);
});

test("DELETE คู่ที่ไม่มี → คืน reference เดิม", () => {
  const out = reconcileRealtimeRoomProcedure(base, "DELETE", L("r9", "x"));
  assert.equal(out, base);
});

test("ข้อมูลเสีย → ไม่แตะ state", () => {
  assert.equal(reconcileRealtimeRoomProcedure(base, "INSERT", null), base);
  assert.equal(reconcileRealtimeRoomProcedure(base, "INSERT", {}), base);
  assert.equal(reconcileRealtimeRoomProcedure(base, "INSERT", { roomId: "r1" }), base);
  assert.equal(reconcileRealtimeRoomProcedure(base, "UPDATE", L("r1", "diode")), base);
});

test("INSERT เก็บเฉพาะสองฟิลด์ที่เป็น key — ฟิลด์แถมจาก payload ไม่หลุดเข้า state", () => {
  const out = reconcileRealtimeRoomProcedure([], "INSERT", { roomId: "r1", procedureId: "p", created_at: "x", junk: 1 });
  assert.deepEqual(out, [L("r1", "p")]);
});

test("interleaving: optimistic replace แล้ว echo ตามมา หรือ echo มาก่อน replace → ผลเท่ากัน", () => {
  // สถานการณ์จริงใน saveRoom: เตียง r1 เดิมมี [diode, treat] เปลี่ยนเป็น [diode, hifu]
  // เซิร์ฟเวอร์ส่ง INSERT hifu + DELETE treat
  const target = [L("r2", "pico"), L("r1", "diode"), L("r1", "hifu")];
  const optimistic = (links) => [...links.filter((l) => l.roomId !== "r1"), L("r1", "diode"), L("r1", "hifu")];
  const echoes = (links) => {
    let s = reconcileRealtimeRoomProcedure(links, "INSERT", L("r1", "hifu"));
    s = reconcileRealtimeRoomProcedure(s, "DELETE", L("r1", "treat"));
    return s;
  };
  const sortKey = (a, b) => (a.roomId + a.procedureId).localeCompare(b.roomId + b.procedureId);

  const A = echoes(optimistic(base)).slice().sort(sortKey);
  const B = optimistic(echoes(base)).slice().sort(sortKey);
  assert.deepEqual(A, target.slice().sort(sortKey));
  assert.deepEqual(B, target.slice().sort(sortKey));
});

// ─── reconcileRealtimeById — ใช้กับ room_schedules ด้วย ───

const rows = [{ id: "a", note: "x" }, { id: "b", note: "y" }];

test("INSERT แถวที่มี id อยู่แล้ว → คืน reference เดิม (กันแถวซ้ำเมื่อ echo มาก่อน HTTP)", () => {
  assert.equal(reconcileRealtimeById(rows, "INSERT", { id: "a", note: "x" }), rows);
});

test("INSERT ใหม่ / UPDATE แทนที่ / UPDATE ที่ไม่มี → เพิ่ม / DELETE ด้วย {id} อย่างเดียว", () => {
  assert.equal(reconcileRealtimeById(rows, "INSERT", { id: "c" }).length, 3);
  assert.equal(reconcileRealtimeById(rows, "UPDATE", { id: "a", note: "z" })[0].note, "z");
  assert.equal(reconcileRealtimeById(rows, "UPDATE", { id: "c" }).length, 3);
  assert.deepEqual(reconcileRealtimeById(rows, "DELETE", { id: "a" }), [{ id: "b", note: "y" }]);
});

test("DELETE id ที่ไม่มี → คืน reference เดิม", () => {
  assert.equal(reconcileRealtimeById(rows, "DELETE", { id: "zz" }), rows);
});

test("reduce แถวใหม่หลายแถวทับ state ที่มี echo บางส่วนอยู่แล้ว → ไม่ซ้ำ", () => {
  // saveRoomSchedule สร้าง 3 แถว, echo ของแถวที่ 2 มาถึงก่อน HTTP กลับ
  const withEcho = [...rows, { id: "n2", note: "echo" }];
  const created = [{ id: "n1" }, { id: "n2", note: "http" }, { id: "n3" }];
  const out = created.reduce((acc, it) => reconcileRealtimeById(acc, "INSERT", it), withEcho);
  assert.equal(out.length, 5);
  assert.equal(out.filter((r) => r.id === "n2").length, 1);
});

test("reconcileRealtimeQueue ยัง export และเป็นตัวเดียวกับ reconcileRealtimeById", () => {
  assert.equal(reconcileRealtimeQueue, reconcileRealtimeById);
});
