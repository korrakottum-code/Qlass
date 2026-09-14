import test from "node:test";
import assert from "node:assert/strict";
import {
  buildProcedureAreaIndex,
  areasForProcedure,
  procedureHasAreas,
  sumAreaBlocks,
  durationFromAreas,
  keepValidAreaIds,
} from "../src/utils/procedureAreas.js";

const DIODE = "proc-diode";
const BOTOX = "proc-botox";

const AREAS = [
  { id: "a-leg", procedureId: DIODE, name: "ขา", blocks: 4, sortOrder: 2, active: true },
  { id: "a-pit", procedureId: DIODE, name: "รักแร้", blocks: 3, sortOrder: 1, active: true },
  { id: "a-holly", procedureId: DIODE, name: "Hollywood", blocks: 6, sortOrder: 3, active: true },
];

test("หัตถการที่ยังไม่ตั้งค่าบริเวณ ต้องเหมือนเดิมทุกอย่าง", () => {
  const index = buildProcedureAreaIndex(AREAS);
  assert.equal(procedureHasAreas(index, BOTOX), false);
  assert.deepEqual(areasForProcedure(index, BOTOX), []);
  // ไม่มีบริเวณ = ไม่กำหนดเวลา ให้ตกไปใช้ค่าปกติของหัตถการ
  assert.equal(durationFromAreas(index, BOTOX, ["a-pit"]), null);
});

test("ตารางว่างทั้งใบ (โหลดล้ม → []) ต้องไม่ทำให้หัตถการไหนเปลี่ยนพฤติกรรม", () => {
  const index = buildProcedureAreaIndex([]);
  assert.equal(procedureHasAreas(index, DIODE), false);
  assert.equal(durationFromAreas(index, DIODE, ["a-pit"]), null);
});

test("เรียงตาม sortOrder ก่อน แล้วค่อยชื่อ", () => {
  const index = buildProcedureAreaIndex(AREAS);
  assert.deepEqual(areasForProcedure(index, DIODE).map((a) => a.name), ["รักแร้", "ขา", "Hollywood"]);
});

test("เลือกหลายบริเวณ เวลาบวกกัน", () => {
  const index = buildProcedureAreaIndex(AREAS);
  assert.equal(durationFromAreas(index, DIODE, ["a-pit"]), 3);
  assert.equal(durationFromAreas(index, DIODE, ["a-pit", "a-leg"]), 7);
  assert.equal(durationFromAreas(index, DIODE, ["a-pit", "a-leg", "a-holly"]), 13);
});

test("ยังไม่เลือกบริเวณ = ใช้ค่าปกติของหัตถการ ไม่ใช่ 0", () => {
  const index = buildProcedureAreaIndex(AREAS);
  assert.equal(durationFromAreas(index, DIODE, []), null);
  assert.equal(durationFromAreas(index, DIODE, undefined), null);
});

test("id ซ้ำนับครั้งเดียว และ id ที่ไม่รู้จักไม่ทำให้เวลาเพี้ยน", () => {
  const areas = areasForProcedure(buildProcedureAreaIndex(AREAS), DIODE);
  assert.equal(sumAreaBlocks(areas, ["a-pit", "a-pit"]), 3);
  assert.equal(sumAreaBlocks(areas, ["a-pit", "ไม่มีจริง"]), 3);
  assert.equal(sumAreaBlocks(areas, ["ไม่มีจริง"]), 0);
  assert.equal(durationFromAreas(buildProcedureAreaIndex(AREAS), DIODE, ["ไม่มีจริง"]), null);
});

test("บริเวณที่ปิดใช้งาน หรือเวลาไม่ถูกต้อง ถือว่าไม่มี", () => {
  const index = buildProcedureAreaIndex([
    ...AREAS,
    { id: "a-off", procedureId: DIODE, name: "เลิกใช้", blocks: 5, sortOrder: 0, active: false },
    { id: "a-zero", procedureId: DIODE, name: "เวลาศูนย์", blocks: 0, sortOrder: 0, active: true },
  ]);
  const names = areasForProcedure(index, DIODE).map((a) => a.name);
  assert.ok(!names.includes("เลิกใช้"));
  assert.ok(!names.includes("เวลาศูนย์"));
  assert.equal(durationFromAreas(index, DIODE, ["a-off", "a-zero"]), null);
});

test("แถวพังจาก DB ไม่ทำให้ทั้งแอปล้ม", () => {
  const index = buildProcedureAreaIndex([null, undefined, {}, { id: "x" }, ...AREAS]);
  assert.equal(areasForProcedure(index, DIODE).length, 3);
});

test("เปลี่ยนหัตถการแล้วบริเวณเก่าต้องหลุด ไม่ค้างเวลาไว้", () => {
  const index = buildProcedureAreaIndex(AREAS);
  assert.deepEqual(keepValidAreaIds(index, BOTOX, ["a-pit", "a-leg"]), []);
  assert.deepEqual(keepValidAreaIds(index, DIODE, ["a-pit", "ไม่มีจริง"]), ["a-pit"]);
});
