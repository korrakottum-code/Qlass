import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildRoomProcedureIndex,
  isProcedureAllowedInRoom,
  proceduresForRoom,
  roomsForProcedure,
  unservedProcedures,
  procedureRoomTypes,
  procedureFitsRoomType,
  encodeProcedureRoomTypes,
} from "../src/utils/roomProcedures.js";

// หัตถการที่ลงได้ทั้งห้อง M และห้อง T เก็บเป็น room_type = "MT"

const rooms = [
  { id: "m1", name: "M01", branchId: "b1", type: "M" },
  { id: "t1", name: "T01", branchId: "b1", type: "T" },
  { id: "t2", name: "T02", branchId: "b1", type: "T" },
];
const both = { id: "both", name: "Meso", roomType: "MT" };
const onlyM = { id: "botox", name: "Botox", roomType: "M" };
const onlyT = { id: "diode", name: "Diode", roomType: "T" };
const procedures = [both, onlyM, onlyT];

test("procedureRoomTypes อ่าน M, T และ MT", () => {
  assert.deepEqual(procedureRoomTypes(onlyM), ["M"]);
  assert.deepEqual(procedureRoomTypes(onlyT), ["T"]);
  assert.deepEqual(procedureRoomTypes(both), ["M", "T"]);
  assert.deepEqual(procedureRoomTypes({ roomType: null }), []);
  assert.deepEqual(procedureRoomTypes(null), []);
});

test("encodeProcedureRoomTypes เรียงเป็น M ก่อน T เสมอ", () => {
  assert.equal(encodeProcedureRoomTypes(["T", "M"]), "MT");
  assert.equal(encodeProcedureRoomTypes(["M"]), "M");
  assert.equal(encodeProcedureRoomTypes(["T", "T"]), "T");
  assert.equal(encodeProcedureRoomTypes([]), "");
});

test("หัตถการ M หรือ T ล้วนได้ผลเหมือนเดิม", () => {
  assert.equal(procedureFitsRoomType(onlyM, "M"), true);
  assert.equal(procedureFitsRoomType(onlyM, "T"), false);
  assert.equal(procedureFitsRoomType(onlyT, "T"), true);
  assert.equal(procedureFitsRoomType(onlyT, "M"), false);
});

test("หัตถการ MT ลงเตียงที่ยังไม่ตั้งค่าได้ทั้งห้อง M และ T", () => {
  const index = buildRoomProcedureIndex([]);
  assert.equal(isProcedureAllowedInRoom(index, rooms[0], both), true);
  assert.equal(isProcedureAllowedInRoom(index, rooms[1], both), true);
  assert.deepEqual(roomsForProcedure(index, rooms, both, "b1").map((r) => r.id), ["m1", "t1", "t2"]);
  assert.deepEqual(proceduresForRoom(index, rooms[0], procedures).map((p) => p.id), ["both", "botox"]);
  assert.deepEqual(proceduresForRoom(index, rooms[1], procedures).map((p) => p.id), ["both", "diode"]);
});

test("เตียงที่ตั้งค่ารายเตียงแล้ว ยังยึดตามที่ติ๊กไว้ แม้หัตถการเป็น MT", () => {
  const index = buildRoomProcedureIndex([
    { roomId: "t1", procedureId: "diode" },
    { roomId: "t2", procedureId: "diode" },
  ]);
  assert.equal(isProcedureAllowedInRoom(index, rooms[1], both), false);
  assert.equal(isProcedureAllowedInRoom(index, rooms[0], both), true); // M01 ยังไม่ตั้งค่า
});

test("เตือนเมื่อหัตถการ MT ไม่มีเตียงไหนรับเลย", () => {
  const index = buildRoomProcedureIndex([
    { roomId: "m1", procedureId: "botox" },
    { roomId: "t1", procedureId: "diode" },
    { roomId: "t2", procedureId: "diode" },
  ]);
  assert.deepEqual(unservedProcedures(index, rooms, procedures, "b1").map((p) => p.id), ["both"]);
});

test("ไม่มีที่ไหนเทียบ roomType กับ type ของห้องตรง ๆ อีก", () => {
  for (const file of [
    "src/utils/roomProcedures.js",
    "src/components/modals/RoomModal.jsx",
  ]) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /roomType\s*===\s*(room\.)?type\b/, file);
    assert.doesNotMatch(source, /room\.type\s*===\s*procedure\.roomType/, file);
  }
});

test("migration รับ MT ทั้งตอนลงคิวและใน Booking API", () => {
  const sql = readFileSync(
    new URL("../supabase/migrations/20261031120000_room_type_nurse_and_multi.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /check \(room_type is null or \(room_type <> '' and room_type ~ '\^M\?T\?N\?\$'\)\)/);
  assert.match(sql, /check \(type = any \(array\['M'::text, 'T'::text, 'N'::text\]\)\)/);
  assert.match(sql, /coalesce\(strpos\(v_procedure\.room_type, v_room\.type\), 0\) = 0/);
  assert.match(sql, /coalesce\(strpos\(p\.room_type, r\.type\), 0\) > 0/);
  // ไม่ให้ไฟล์ปลดล็อกกฎเตียง→หัตถการไปด้วย
  assert.match(sql, /rp\.room_id = v_room_id and rp\.procedure_id = v_procedure_id/);
  assert.match(sql, /revoke all on function public\.create_queue_v1\(uuid, uuid, uuid, jsonb\) from public, anon, authenticated;/);
});

test("ห้องพยาบาล N: หัตถการ MN ลงได้ห้อง M และ N แต่ไม่ลงห้อง T", () => {
  const nurseRooms = [...rooms, { id: "n1", name: "N01", branchId: "b1", type: "N" }];
  const drip = { id: "drip", name: "วิตามินผิว", roomType: "MN" };
  const index = buildRoomProcedureIndex([]);
  assert.deepEqual(procedureRoomTypes(drip), ["M", "N"]);
  assert.equal(encodeProcedureRoomTypes(["N", "T", "M"]), "MTN");
  assert.equal(encodeProcedureRoomTypes(["N", "M"]), "MN");
  assert.deepEqual(roomsForProcedure(index, nurseRooms, drip, "b1").map((r) => r.id), ["m1", "n1"]);
  // หัตถการเดิมที่เป็น M ล้วน ไม่ไหลไปห้อง N เอง
  assert.equal(isProcedureAllowedInRoom(index, nurseRooms[3], onlyM), false);
});

test("ประเภทห้องใน constants ตรงกับ roomProcedures และ migration", async () => {
  const { ROOM_TYPE_VALUES, roomTypeMeta } = await import("../src/utils/constants.js");
  const { PROCEDURE_ROOM_TYPE_VALUES } = await import("../src/utils/roomProcedures.js");
  assert.deepEqual(ROOM_TYPE_VALUES, PROCEDURE_ROOM_TYPE_VALUES);
  assert.deepEqual(ROOM_TYPE_VALUES, ["M", "T", "N"]);
  assert.equal(roomTypeMeta("M").short, "ห้องแพทย์");
  assert.equal(roomTypeMeta("N").short, "ห้องพยาบาล");
  assert.equal(roomTypeMeta("X").value, "X");
});
