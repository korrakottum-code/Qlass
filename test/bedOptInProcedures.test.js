import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  isProcedureAllowedInRoom, roomsForProcedure, proceduresForRoom, buildRoomProcedureIndex,
  procedureNeedsBedOptIn, bedOptInProcedures, unservedProcedures, shouldEnforceOnSave,
} from "../src/utils/roomProcedures.js";

// ดริป/ปากกา: ลงได้ทั้ง M และ N แต่เตียง M ต้องติ๊กรายเตียง (เจ้าของสั่ง 5 พ.ย. 2569)
const drip = { id: "drip", name: "วิตามินผิว", roomType: "MN", optInRoomTypes: "M" };
const pen = { id: "pen", name: "ปากกาลดน้ำหนัก", roomType: "MN", optInRoomTypes: "M" };
const botox = { id: "botox", name: "Botox", roomType: "M", optInRoomTypes: "" };
const consult = { id: "consult", name: "ปรึกษาทั่วไป", roomType: "MN" }; // ไม่มีช่อง = เดิม
const diode = { id: "diode", name: "Diode", roomType: "T" };
const procedures = [drip, pen, botox, consult, diode];

const m1 = { id: "m1", branchId: "b", type: "M", optInProcedureIds: ["drip"] };
const m2 = { id: "m2", branchId: "b", type: "M", optInProcedureIds: [] };
const m3 = { id: "m3", branchId: "b", type: "M" }; // ข้อมูลเก่า ไม่มีช่องนี้
const n1 = { id: "n1", branchId: "b", type: "N" };
const t1 = { id: "t1", branchId: "b", type: "T" };
const rooms = [m1, m2, m3, n1, t1];

// เตียง N ล็อกไว้แล้ว (แบบ production) ส่วนเตียง M ไม่มีเตียงไหนล็อก
const index = buildRoomProcedureIndex([
  { roomId: "n1", procedureId: "drip" }, { roomId: "n1", procedureId: "pen" }, { roomId: "n1", procedureId: "consult" },
  { roomId: "t1", procedureId: "diode" },
]);

test("เตียง M ที่ติ๊กดริป ลงดริปได้ / ไม่ติ๊ก ลงไม่ได้ / ข้อมูลไม่มีช่องติ๊ก = ลงไม่ได้", () => {
  assert.equal(isProcedureAllowedInRoom(index, m1, drip), true);
  assert.equal(isProcedureAllowedInRoom(index, m1, pen), false); // ติ๊กแยกรายตัว
  assert.equal(isProcedureAllowedInRoom(index, m2, drip), false);
  assert.equal(isProcedureAllowedInRoom(index, m3, drip), false);
});

test("เตียง N ลงดริป/ปากกาได้เหมือนเดิมโดยไม่ต้องติ๊ก; เตียง T ยังห้าม", () => {
  assert.equal(isProcedureAllowedInRoom(index, n1, drip), true);
  assert.equal(isProcedureAllowedInRoom(index, n1, pen), true);
  assert.equal(isProcedureAllowedInRoom(index, { id: "n9", type: "N" }, drip), true); // N ที่ยังไม่ล็อก
  assert.equal(isProcedureAllowedInRoom(index, t1, drip), false);
});

test("ติ๊กดริปแล้ว งานหมอบนเตียงนั้นยังลงได้ครบ (ไม่กลายเป็นเตียงล็อก)", () => {
  assert.equal(isProcedureAllowedInRoom(index, m1, botox), true);
  assert.equal(isProcedureAllowedInRoom(index, m1, consult), true);
  assert.deepEqual(proceduresForRoom(index, m1, procedures).map((p) => p.id), ["drip", "botox", "consult"]);
  assert.deepEqual(proceduresForRoom(index, m2, procedures).map((p) => p.id), ["botox", "consult"]);
});

test("หัตถการที่ไม่มีช่องติ๊ก (ทุกตัวอื่น) ได้ผลเหมือนเดิมทุกเตียง", () => {
  for (const room of rooms) {
    for (const p of [botox, consult, diode]) {
      const legacy = { ...p };
      delete legacy.optInRoomTypes;
      assert.equal(isProcedureAllowedInRoom(index, room, p), isProcedureAllowedInRoom(index, room, legacy), `${room.id}/${p.id}`);
    }
  }
});

test("ดริปที่ยังเป็น N ล้วน (ก่อนลงขั้น 2 / แท็บเก่า) ห้ามเตียง M ทุกเตียง แม้ติ๊กแล้ว", () => {
  const dripNOnly = { ...drip, roomType: "N" };
  assert.equal(isProcedureAllowedInRoom(index, m1, dripNOnly), false);
  assert.equal(isProcedureAllowedInRoom(index, n1, dripNOnly), true);
});

test("เลือกเตียงให้หัตถการ: เฉพาะเตียง M ที่ติ๊ก + เตียง N", () => {
  assert.deepEqual(roomsForProcedure(index, rooms, drip, "b").map((r) => r.id), ["m1", "n1"]);
  assert.deepEqual(roomsForProcedure(index, rooms, pen, "b").map((r) => r.id), ["n1"]);
});

test("คิวเดิมบนเตียง M ที่ไม่ได้ติ๊ก: แก้บนเตียงเดิมไม่โดนตรวจ, ย้ายเตียงโดนตรวจ", () => {
  const old = { roomId: "m2", procedureId: "drip" };
  assert.equal(shouldEnforceOnSave(old, { roomId: "m2", procedureId: "drip" }), false);
  assert.equal(shouldEnforceOnSave(old, { roomId: "m3", procedureId: "drip" }), true);
});

test("ช่องติ๊กในหน้าแก้เตียง: เฉพาะประเภทเตียงที่ต้องติ๊ก", () => {
  assert.deepEqual(bedOptInProcedures(procedures, "M").map((p) => p.id), ["drip", "pen"]);
  assert.deepEqual(bedOptInProcedures(procedures, "N"), []);
  assert.deepEqual(bedOptInProcedures(procedures, "T"), []);
  assert.equal(procedureNeedsBedOptIn(drip, "M"), true);
  assert.equal(procedureNeedsBedOptIn(drip, ""), false);
  assert.equal(procedureNeedsBedOptIn({ optInRoomTypes: null }, "M"), false);
});

test("สาขาที่ไม่มีเตียง N และไม่ติ๊กเตียง M = เตือนว่าไม่มีเตียงรับปากกา", () => {
  const lockedT = buildRoomProcedureIndex([{ roomId: "t1", procedureId: "diode" }]);
  const unserved = unservedProcedures(lockedT, [m2, t1], procedures, "b").map((p) => p.id);
  assert.ok(unserved.includes("drip") && unserved.includes("pen"));
  assert.ok(!unserved.includes("botox"));
});

const migA = fs.readFileSync(new URL("../supabase/migrations/20261105120000_bed_opt_in_procedures.sql", import.meta.url), "utf8");
const migB = fs.readFileSync(new URL("../supabase/migrations/20261105120100_drip_pen_m_beds_opt_in.sql", import.meta.url), "utf8");
const code = (sql) => sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

test("ขั้น 1: เพิ่มคอลัมน์ค่าเริ่มต้นว่าง + ตั้งช่องติ๊ก แต่ไม่เปลี่ยน room_type", () => {
  const sql = code(migA);
  assert.match(sql, /add column if not exists opt_in_room_types text not null default ''/);
  assert.match(sql, /check \(opt_in_room_types ~ '\^M\?T\?N\?\$'\)/);
  assert.match(sql, /add column if not exists opt_in_procedure_ids uuid\[\] not null default '\{\}'/);
  assert.match(sql, /set opt_in_room_types = 'M'\s+where name in \('วิตามินผิว', 'Go-ดริปผิว', 'ปากกาลดน้ำหนัก'\);/);
  assert.doesNotMatch(sql, /set room_type/);
  assert.doesNotMatch(sql, /update public\.queues|delete from/i);
  // ทั้งสองฟังก์ชันได้ข้อห้ามใหม่ และยังมีกติกาเดิมครบ
  assert.equal((sql.match(/opt_in_procedure_ids/g) || []).length >= 3, true);
  assert.match(sql, /v_procedure_id = any\(coalesce\(v_room\.opt_in_procedure_ids, '\{\}'::uuid\[\]\)\)/);
  assert.match(sql, /p_procedure_id = any\(coalesce\(r\.opt_in_procedure_ids, '\{\}'::uuid\[\]\)\)/);
  assert.match(sql, /not exists \(select 1 from public\.room_procedures rp where rp\.room_id = r\.id\)/);
  assert.match(sql, /coalesce\(strpos\(v_procedure\.room_type, v_room\.type\), 0\) = 0/);
  assert.match(sql, /revoke all on function public\.create_queue_v1\(uuid, uuid, uuid, jsonb\) from public, anon, authenticated;/);
});

test("ขั้น 2: เปลี่ยนแค่ 3 หัตถการที่ตั้งช่องติ๊กแล้วเป็น MN", () => {
  const sql = code(migB);
  assert.match(sql, /set room_type = 'MN'\s+where room_type = 'N'\s+and opt_in_room_types = 'M'\s+and name in \('วิตามินผิว', 'Go-ดริปผิว', 'ปากกาลดน้ำหนัก'\);/);
  assert.equal((sql.match(/update /g) || []).length, 1);
  assert.doesNotMatch(sql, /queues|delete/i);
});

test("หน้าเว็บ: ส่งช่องติ๊กเฉพาะตอนเปลี่ยน และล็อกเตียงเติมตัวที่ต้องติ๊กให้เอง", () => {
  const svc = fs.readFileSync(new URL("../src/utils/supabaseService.js", import.meta.url), "utf8");
  assert.match(svc, /if \(room\.optInProcedureIds !== undefined\) payload\.opt_in_procedure_ids = room\.optInProcedureIds;/);
  assert.equal((svc.match(/optInRoomTypes: (p|data)\.opt_in_room_types \|\| ""/g) || []).length, 3);
  assert.equal((svc.match(/optInProcedureIds: Array\.isArray/g) || []).length, 3);
  const modal = fs.readFileSync(new URL("../src/components/modals/RoomModal.jsx", import.meta.url), "utf8");
  assert.match(modal, /\[\.\.\.procIds, \.\.\.genericIds, \.\.\.optInProcIds\]/);
  assert.match(modal, /sameSet\(data\?\.optInProcedureIds \|\| \[\], next\) \? undefined : next/);
});
