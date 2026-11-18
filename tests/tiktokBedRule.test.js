import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  tiktokBedRuleCheck, shouldCheckTiktokBedRule, tiktokBedRuleMessage, tiktokBedRuleCodeFromError, isTiktokBed,
} from "../src/utils/tiktokBedRule.js";

const rooms = [
  { id: "m1", branchId: "b1", type: "M", name: "M01" },
  { id: "m2", branchId: "b1", type: "M", name: "M02" },
  { id: "m3", branchId: "b1", type: "M", name: "M03" },
  { id: "p1", branchId: "b1", type: "P", name: "P01" },
  { id: "n1", branchId: "b2", type: "M", name: "M01" },
];
const promos = [
  { id: "tt", name: "TIKTOK BTXA กราม 1490฿" },
  { id: "ttPico", name: "TikTok Pico 990" },
  { id: "reg", name: "Botox 50U" },
];
const procedures = [
  { id: "botox", name: "Botox" }, { id: "gofiller", name: "Go-Filler" }, { id: "pico", name: "Pico" },
];
const ctx = { rooms, promos, procedures };

test("TikTok injection must be on M02", () => {
  assert.equal(tiktokBedRuleCheck({ roomId: "m2", promoId: "tt", procedureId: "botox" }, ctx), "ok");
  assert.equal(tiktokBedRuleCheck({ roomId: "m1", promoId: "tt", procedureId: "botox" }, ctx), "tiktok_needs_m02");
  assert.equal(tiktokBedRuleCheck({ roomId: "m3", promoId: "tt", procedureId: "gofiller" }, ctx), "tiktok_needs_m02");
});

test("M02 takes TikTok only", () => {
  assert.equal(tiktokBedRuleCheck({ roomId: "m2", promoId: "reg", procedureId: "botox" }, ctx), "m02_tiktok_only");
  assert.equal(tiktokBedRuleCheck({ roomId: "m2", promoId: "", procedureId: "botox" }, ctx), "m02_tiktok_only");
  assert.equal(tiktokBedRuleCheck({ roomId: "m1", promoId: "reg", procedureId: "botox" }, ctx), "ok");
});

test("TikTok non-injection is free to use other beds; no room = not checked", () => {
  assert.equal(tiktokBedRuleCheck({ roomId: "p1", promoId: "ttPico", procedureId: "pico" }, ctx), "ok");
  assert.equal(tiktokBedRuleCheck({ roomId: "", promoId: "tt", procedureId: "botox" }, ctx), "ok");
});

test("promo name snapshot is used when the promo is no longer in the list", () => {
  assert.equal(tiktokBedRuleCheck({ roomId: "m1", promoId: "gone", promoNameSnapshot: "TIKTOK old", procedureId: "botox" }, ctx), "tiktok_needs_m02");
});

test("old queues are not re-checked unless bed / promo / procedure changes", () => {
  const original = { roomId: "m2", promoId: "reg", procedureId: "botox" };
  assert.equal(shouldCheckTiktokBedRule({ ...original, timeBlock: 150, status: "confirmed" }, original), false);
  assert.equal(shouldCheckTiktokBedRule({ ...original, roomId: "m1" }, original), true);
  assert.equal(shouldCheckTiktokBedRule({ ...original, promoId: "tt" }, original), true);
  assert.equal(shouldCheckTiktokBedRule({ ...original }, null), true);
  assert.equal(shouldCheckTiktokBedRule({ ...original, roomId: "" }, original), false);
});

test("messages: branch without M02 is told it cannot take TikTok injection", () => {
  assert.match(tiktokBedRuleMessage("tiktok_needs_m02", { rooms, branchId: "b1" }), /เฉพาะเตียง M02/);
  assert.match(tiktokBedRuleMessage("tiktok_needs_m02", { rooms, branchId: "b2" }), /ไม่มีเตียง M02/);
  assert.match(tiktokBedRuleMessage("m02_tiktok_only", {}), /รับเฉพาะคิวโปร TikTok/);
  assert.equal(tiktokBedRuleMessage("ok", {}), null);
});

test("database error is recognised", () => {
  assert.equal(tiktokBedRuleCodeFromError({ message: "TIKTOK_BED_RULE:m02_tiktok_only" }), "m02_tiktok_only");
  assert.equal(tiktokBedRuleCodeFromError({ message: "duplicate key" }), null);
  assert.equal(tiktokBedRuleCodeFromError(null), null);
  assert.equal(isTiktokBed({ type: "N", name: "M02" }), false);
});

test("migration: kill switch, locked down, and old queues untouched", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261118120000_tiktok_m02_bed_rule.sql", import.meta.url), "utf8");
  assert.match(sql, /tiktok_bed_rule_settings/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on function public\.tiktok_bed_rule_v1\(uuid, uuid, uuid, text\) from public, anon, authenticated/);
  assert.match(sql, /revoke all on function public\.queues_tiktok_bed_rule\(\) from public, anon, authenticated/);
  assert.match(sql, /'rescheduled_in'\) then return new/);
  assert.match(sql, /new\.room_id is not distinct from old\.room_id/);
  // the procedure list must match the app helper
  for (const name of ["'Botox'", "'Filler'", "'Meso'", "'Go-Botox'", "'Go-Filler'"]) assert.ok(sql.includes(name));
  // fail closed if the live function text changed
  assert.match(sql, /pattern not found/);
});
