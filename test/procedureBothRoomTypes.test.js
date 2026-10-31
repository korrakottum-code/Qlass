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

test("ตัวอ่านข้อความจองรู้จักชื่อเตียง N01", async () => {
  const src = readFileSync(new URL("../src/utils/smartParser.js", import.meta.url), "utf8");
  assert.match(src, /const roomRe = \/\\b\(\[MTN\]\\d\{1,2\}\)\\b\/i;/);
  assert.doesNotMatch(src, /\[MT\]\\d/);
});

test("ไฟล์หลักไม่แก้ข้อมูล การเติม N ให้หัตถการกลางแยกเป็นไฟล์ที่ลงทีหลัง", () => {
  const main = readFileSync(
    new URL("../supabase/migrations/20261031120000_room_type_nurse_and_multi.sql", import.meta.url),
    "utf8",
  );
  // หน้าเว็บเก่าเห็น 'MN' แล้วหัตถการหายจากเตียง M — ห้ามแก้ข้อมูลในไฟล์ที่ลงก่อนเว็บใหม่
  assert.doesNotMatch(main, /^\s*update\s+public\.procedures/im);
  const later = readFileSync(
    new URL("../supabase/migrations/20261031120100_nurse_beds_to_room_n.sql", import.meta.url),
    "utf8",
  );
  // หัตถการเป็น MN (ไม่ใช่ N ล้วน) เพราะยังมีคิวบนเตียงหมอ และ 3 สาขาไม่มีเตียงพยาบาล
  assert.match(later, /set room_type = 'MN'\s+where room_type = 'M'/);
  for (const name of ["วิตามินผิว", "Go-ดริปผิว", "ปากกาลดน้ำหนัก", "Influencer", "ปรึกษาทั่วไป", "โปรประจำเดือน"]) {
    assert.ok(later.includes(`'${name}'`), name);
  }
  assert.doesNotMatch(later, /set room_type = 'N'/);
  // หัตถการต้องเปลี่ยนก่อนเตียง ไม่งั้นเตียง N จะรับคิวในล็อกตัวเองไม่ได้
  assert.ok(later.indexOf("update public.procedures") < later.indexOf("update public.rooms set type = 'N'"));
  // เปลี่ยนเฉพาะเตียงที่ทุกหัตถการในล็อกเป็นงานพยาบาล และหยุดทั้งไฟล์ถ้าจำนวนไม่ใช่ 33
  assert.match(later, /not \(p\.name = any \(v_nurse_set\)\)/);
  assert.match(later, /array_length\(v_ids, 1\), 0\) <> 33 then\s+raise exception/);
  // เจ้าของให้เปลี่ยนชื่อเป็น N01 — สาขาละเตียงเดียว และหยุดถ้าสาขามี N01 อยู่แล้ว
  assert.match(later, /set type = 'N', name = 'N01' where id = any \(v_ids \|\| v_owner_named\)/);
  assert.match(later, /having count\(\*\) > 1/);
  // เตียงที่เจ้าของระบุเอง: ตรัง M03, อยุธยา M03 — ปลวกแดงไม่แตะ
  assert.match(later, /'c8ed446a-db7b-48b6-8e6a-53ae04867cef'::uuid/);
  assert.match(later, /'3ada52d1-07c1-49eb-b1fc-c42d1d5cd906'::uuid/);
  assert.match(later, /if v_owner_ok <> 2 then\s+raise exception/);
  assert.doesNotMatch(later, /ปลวกแดง'/);
});

test("ชื่อเตียงใหม่ใช้เลขสูงสุด + 1 ไม่ซ้ำแม้เลขกลางหายไป", async () => {
  const { nextRoomName } = await import("../src/utils/roomNaming.js");
  const rooms = [
    { branchId: "b1", type: "M", name: "M01" },
    { branchId: "b1", type: "M", name: "M02" },
    { branchId: "b1", type: "M", name: "M04" },
    { branchId: "b1", type: "N", name: "N01" },
    { branchId: "b1", type: "T", name: "T01" },
    { branchId: "b2", type: "M", name: "M09" },
  ];
  assert.equal(nextRoomName(rooms, "b1", "M"), "M05"); // เดิมนับจำนวน = M04 ซ้ำ
  assert.equal(nextRoomName(rooms, "b1", "N"), "N02");
  assert.equal(nextRoomName(rooms, "b1", "T"), "T02");
  assert.equal(nextRoomName(rooms, "b3", "N"), "N01");
  assert.equal(nextRoomName(rooms, "", "M"), "");
  // ไม่มีเลขกลางหาย = ผลเหมือนวิธีเดิม
  assert.equal(nextRoomName(rooms.slice(0, 2), "b1", "M"), "M03");
});
