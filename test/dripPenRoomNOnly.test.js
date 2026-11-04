import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isProcedureAllowedInRoom, shouldEnforceOnSave } from "../src/utils/roomProcedures.js";

// 5 พ.ย. 2569: ดริป/ปากกา คิวใหม่ลงแค่ห้อง N คิวเดิมบน M ปล่อยไว้
const sql = readFileSync(new URL("../supabase/migrations/20261105100000_drip_pen_room_n_only.sql", import.meta.url), "utf8");
const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

test("migration เปลี่ยนแค่ 3 หัตถการจาก MN เป็น N ไม่แตะตัวอื่นและไม่แตะคิว", () => {
  assert.match(code, /set room_type = 'N'\s+where room_type = 'MN'\s+and name in \('วิตามินผิว', 'Go-ดริปผิว', 'ปากกาลดน้ำหนัก'\);/);
  for (const keep of ["Influencer", "ปรึกษาทั่วไป", "โปรประจำเดือน"]) assert.ok(!code.includes(keep));
  assert.ok(!/queues/i.test(code));
  assert.ok(!/delete/i.test(code));
});

test("หัตถการ N: ลงเตียง N ได้ เตียง M/T ไม่ได้ (เตียงไม่ล็อก)", () => {
  const index = new Map();
  const drip = { id: "drip", name: "วิตามินผิว", roomType: "N" };
  assert.equal(isProcedureAllowedInRoom(index, { id: "n1", type: "N" }, drip), true);
  assert.equal(isProcedureAllowedInRoom(index, { id: "m1", type: "M" }, drip), false);
  assert.equal(isProcedureAllowedInRoom(index, { id: "t1", type: "T" }, drip), false);
});

test("คิวเดิมบน M: แก้ข้อมูล/สถานะ/เวลาบนเตียงเดิมไม่โดนตรวจ; ย้ายเตียงหรือเปลี่ยนหัตถการ = โดนตรวจ", () => {
  const old = { roomId: "m1", procedureId: "drip" };
  assert.equal(shouldEnforceOnSave(old, { roomId: "m1", procedureId: "drip", status: "done", timeBlock: 120 }), false);
  assert.equal(shouldEnforceOnSave(old, { roomId: "m2", procedureId: "drip" }), true);
  assert.equal(shouldEnforceOnSave(old, { roomId: "m1", procedureId: "other" }), true);
  assert.equal(shouldEnforceOnSave(null, { roomId: "m1", procedureId: "drip" }), true);
});
