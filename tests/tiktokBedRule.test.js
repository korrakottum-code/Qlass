import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  tiktokBedRuleCheck, shouldCheckTiktokBedRule, tiktokBedRuleMessage, tiktokBedRuleCodeFromError,
} from "../src/utils/tiktokBedRule.js";
import { buildRoomProcedureIndex } from "../src/utils/roomProcedures.js";

// b1: M02 ติ๊กเป็นเตียง TikTok · b2: ไม่ติ๊กสักเตียง (ลงปนแบบเดิม)
const rooms = [
  { id: "m1", branchId: "b1", type: "M", name: "M01" },
  { id: "m2", branchId: "b1", type: "M", name: "M02", tiktokOnly: true },
  { id: "m3", branchId: "b1", type: "M", name: "M03" },
  { id: "t1", branchId: "b1", type: "T", name: "T01" },
  { id: "n1", branchId: "b1", type: "N", name: "N01" },
  { id: "x1", branchId: "b2", type: "M", name: "M01" },
  { id: "x2", branchId: "b2", type: "M", name: "M02" },
];
const promos = [
  { id: "tt", name: "TIKTOK BTXA กราม 1490฿" },
  { id: "ttUltra", name: "TIKTOK Ultraformer 200 shot 2990฿" },
  { id: "ttPico", name: "TikTok Pico 990" },
  { id: "ttVit", name: "TIKTOK abutin white 990฿" },
  { id: "reg", name: "Botox 50U" },
];
const procedures = [
  { id: "botox", name: "Botox", roomType: "M" },
  { id: "ultra", name: "Ultraformer", roomType: "M" },
  { id: "pico", name: "Pico", roomType: "T" },
  { id: "vit", name: "วิตามินผิว", roomType: "MN", optInRoomTypes: "M" },
  { id: "consult", name: "ปรึกษาทั่วไป", roomType: "MN" },
];
const ctx = { rooms, promos, procedures, roomProcedureIndex: buildRoomProcedureIndex([]) };
const check = (roomId, promoId, procedureId) => tiktokBedRuleCheck({ roomId, promoId, procedureId }, ctx);

test("TikTok doctor queues (injection and Ultraformer) must use the ticked bed", () => {
  assert.equal(check("m2", "tt", "botox"), "ok");
  assert.equal(check("m1", "tt", "botox"), "tiktok_needs_tiktok_bed");
  assert.equal(check("m3", "ttUltra", "ultra"), "tiktok_needs_tiktok_bed");
  assert.equal(check("m2", "ttUltra", "ultra"), "ok");
});

test("the ticked bed takes TikTok only", () => {
  assert.equal(check("m2", "reg", "botox"), "tiktok_bed_only");
  assert.equal(check("m2", "", "consult"), "tiktok_bed_only");
  assert.equal(check("m1", "reg", "botox"), "ok");
});

test("treatment side is untouched while no T bed is ticked", () => {
  assert.equal(check("t1", "ttPico", "pico"), "ok");
});

test("a branch with no ticked bed mixes as before", () => {
  assert.equal(check("x1", "tt", "botox"), "ok");
  assert.equal(check("x2", "reg", "botox"), "ok");
});

test("TikTok goes elsewhere when the ticked bed cannot do that procedure", () => {
  // วิตามินผิวบนเตียง M ต้องติ๊กรายเตียง — M02 ไม่ได้ติ๊ก จึงไม่บังคับให้ไป M02
  assert.equal(check("n1", "ttVit", "vit"), "ok");
  // ล็อกเครื่อง: M02 รับแค่ Botox → TikTok Ultraformer ลงเตียงอื่นได้
  const locked = { ...ctx, roomProcedureIndex: buildRoomProcedureIndex([{ roomId: "m2", procedureId: "botox" }]) };
  assert.equal(tiktokBedRuleCheck({ roomId: "m1", promoId: "ttUltra", procedureId: "ultra" }, locked), "ok");
  assert.equal(tiktokBedRuleCheck({ roomId: "m1", promoId: "tt", procedureId: "botox" }, locked), "tiktok_needs_tiktok_bed");
});

test("promo name snapshot is used when the promo is no longer in the list; no room = not checked", () => {
  assert.equal(tiktokBedRuleCheck({ roomId: "m1", promoId: "gone", promoNameSnapshot: "TIKTOK old", procedureId: "botox" }, ctx), "tiktok_needs_tiktok_bed");
  assert.equal(check("", "tt", "botox"), "ok");
});

test("old queues are not re-checked unless bed / promo / procedure changes", () => {
  const original = { roomId: "m2", promoId: "reg", procedureId: "botox" };
  assert.equal(shouldCheckTiktokBedRule({ ...original, timeBlock: 150, status: "confirmed" }, original), false);
  assert.equal(shouldCheckTiktokBedRule({ ...original, roomId: "m1" }, original), true);
  assert.equal(shouldCheckTiktokBedRule({ ...original, promoId: "tt" }, original), true);
  assert.equal(shouldCheckTiktokBedRule({ ...original }, null), true);
  assert.equal(shouldCheckTiktokBedRule({ ...original, roomId: "" }, original), false);
});

test("a queue booked before the tick may change promo while staying on its bed", () => {
  const oldTtOnM01 = { roomId: "m1", promoId: "tt", procedureId: "botox" };
  assert.equal(shouldCheckTiktokBedRule({ ...oldTtOnM01, promoId: "ttUltra", procedureId: "ultra" }, oldTtOnM01, ctx), false);
  assert.equal(shouldCheckTiktokBedRule({ ...oldTtOnM01, roomId: "m3" }, oldTtOnM01, ctx), true);
  const okRegOnM01 = { roomId: "m1", promoId: "reg", procedureId: "botox" };
  assert.equal(shouldCheckTiktokBedRule({ ...okRegOnM01, promoId: "tt" }, okRegOnM01, ctx), true);
});

test("messages name the ticked bed", () => {
  assert.match(tiktokBedRuleMessage("tiktok_needs_tiktok_bed", { rooms, roomId: "m1" }), /M02/);
  assert.match(tiktokBedRuleMessage("tiktok_bed_only", { rooms, roomId: "m2" }), /เตียง M02 รับเฉพาะคิวโปร TikTok/);
  assert.equal(tiktokBedRuleMessage("ok", {}), null);
});

test("database error is recognised", () => {
  assert.equal(tiktokBedRuleCodeFromError({ message: "TIKTOK_BED_RULE:tiktok_bed_only" }), "tiktok_bed_only");
  assert.equal(tiktokBedRuleCodeFromError({ message: "TIKTOK_BED_RULE:tiktok_needs_tiktok_bed" }), "tiktok_needs_tiktok_bed");
  assert.equal(tiktokBedRuleCodeFromError({ message: "duplicate key" }), null);
  assert.equal(tiktokBedRuleCodeFromError(null), null);
});

test("migration: no bed ticked by default, kill switch, locked down, old queues untouched", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261119120000_tiktok_bed_rule.sql", import.meta.url), "utf8");
  assert.match(sql, /add column if not exists tiktok_only boolean not null default false/);
  assert.doesNotMatch(sql, /update public\.rooms/i);
  assert.doesNotMatch(sql, /'M02'/);
  assert.match(sql, /tiktok_bed_rule_settings/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on function public\.tiktok_bed_rule_v1\(uuid, uuid, uuid, text\) from public, anon, authenticated/);
  assert.match(sql, /revoke all on function public\.queues_tiktok_bed_rule\(\) from public, anon, authenticated/);
  assert.match(sql, /'rescheduled_in'\) then return new/);
  assert.match(sql, /new\.room_id is not distinct from old\.room_id/);
  assert.match(sql, /booking_api_candidate_rooms_v1\(r\.branch_id, p_procedure_id\)/);
  assert.match(sql, /pattern not found/);
});
