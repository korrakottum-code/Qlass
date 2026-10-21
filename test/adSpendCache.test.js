import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as nodeModule from "node:module";

// ค่าโฆษณารายวันแบบดึงมาเก็บไว้ (ad_spend_daily) — การ์ดอ่านจากตารางของ Qlass ไม่รอ Korrakot-DB/Meta ทุกครั้ง
// เหตุ: ads-spend เดิมช้า 3-25 วินาทีและ 504 ได้เมื่อคำขอแรกหลังเงียบนาน (21 ต.ค. 2569)

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8").split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
const stripComments = (s) => s.replace(/^\s*--.*$/gm, "");

const sql = stripComments(read("../supabase/migrations/20261021120000_ad_spend_cache.sql"));
const edge = read("../supabase/functions/ads-spend-cache/index.ts");
const client = read("../src/utils/adsSpend.js");
const card = read("../src/components/AdSpendCard.jsx");

test("migration: ตารางใหม่ปิดจากคีย์หน้าเว็บ (RLS เปิด ไม่มี policy ถอนสิทธิ์) และไม่แตะตารางเดิม", () => {
  for (const t of ["ad_spend_daily", "ad_spend_sync_state"]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${t}\\b`), t);
    assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security;`), t);
  }
  assert.match(sql, /revoke all on table public\.ad_spend_daily, public\.ad_spend_sync_state from anon, authenticated;/);
  assert.match(sql, /grant all on table public\.ad_spend_daily, public\.ad_spend_sync_state to service_role;/);
  assert.doesNotMatch(sql, /create policy/i);
  assert.doesNotMatch(sql, /\bdrop\b|\btruncate\b|\balter table public\.(queues|rooms|staff|branches|procedures|promos|app_sessions)\b/i);
});

test("migration: ฟังก์ชันทั้งสามเรียกได้เฉพาะ service_role", () => {
  for (const f of ["ad_spend_lease_v1(integer)", "ad_spend_save_v1(jsonb, date)", "ad_spend_fail_v1(text)"]) {
    assert.ok(sql.includes(`public.${f}`), f);
  }
  assert.match(sql, /revoke all on function[\s\S]*from public, anon, authenticated;/);
  assert.match(sql, /grant execute on function[\s\S]*to service_role;/);
});

test("migration: กันศูนย์ทับข้อมูลดี + จำกัดจำนวนแถว + เก็บ backfilled_from ที่เก่าสุด", () => {
  assert.match(sql, /where not \(excluded\.spend = 0 and t\.spend > 0\)/);
  assert.match(sql, /jsonb_array_length\(p_rows\) > 400/);
  assert.match(sql, /least\(backfilled_from, p_backfilled_from\)/);
  assert.match(sql, /distinct on \(r\.day\)/);
});

test("Edge Function: ตรวจ origin + session + เฉพาะ superadmin ก่อนแตะข้อมูล", () => {
  assert.match(edge, /allowedOrigins\.includes\(origin\)/);
  assert.doesNotMatch(edge, /Access-Control-Allow-Origin": "\*"/);
  assert.match(edge, /const ALLOWED_ROLES = \["superadmin"\];/);
  const iAuth = edge.indexOf("findActiveStaff(req.headers.get");
  const iRole = edge.indexOf("ALLOWED_ROLES.includes");
  const iRead = edge.indexOf('.from("ad_spend_daily")');
  assert.ok(iAuth > 0 && iRole > iAuth && iRead > iRole, "ลำดับ: session -> role -> อ่านตาราง");
});

test("Edge Function: token อยู่ฝั่ง server เท่านั้น ไม่รั่วลง log หรือ response", () => {
  assert.match(edge, /Deno\.env\.get\("QLASS_ADS_SPEND_TOKEN"\)/);
  const responses = edge.match(/response\(\{[\s\S]*?\}, \d{3}, origin\)/g) || [];
  assert.ok(responses.length > 0);
  for (const r of responses) assert.doesNotMatch(r, /adsToken/);
  const logs = edge.match(/console\.(log|error)\([^;]*\);/g) || [];
  assert.ok(logs.length > 0);
  for (const l of logs) assert.doesNotMatch(l, /adsToken/);
  assert.doesNotMatch(client + card, /QLASS_ADS_SPEND_TOKEN|korrakot-db/);
});

test("Edge Function: ขอ lease ก่อนดึง, รอไม่เกินงบเวลาแล้วตอบข้อมูลที่เก็บไว้, ไม่ตอบ ฿0 เมื่อยังไม่เคยดึง", () => {
  const iLease = edge.indexOf('rpc("ad_spend_lease_v1"');
  const iRefresh = edge.indexOf("const recentJob = recent ? refreshRange(");
  assert.ok(iLease > 0 && iRefresh > iLease, "ต้องได้ lease ก่อนดึง");
  assert.match(edge, /WAIT_BUDGET_MS/);
  assert.match(edge, /keepAlive\(fullJob\)/);
  // ย้อนหลังทำเฉพาะเบื้องหลัง และต่อเมื่อช่วงล่าสุดสำเร็จเท่านั้น
  assert.match(edge, /recentJob\.then\(\(ok\) => \(ok && plan\.backfill \? backfillLoop\(/);
  assert.match(edge, /JOB_WALL_BUDGET_MS/);
  assert.match(edge, /rpc\("ad_spend_save_v1"/);
  assert.match(edge, /rpc\("ad_spend_fail_v1"/);
  assert.match(edge, /if \(!state\?\.last_success_at\)[\s\S]*?ads_not_ready/);
});

test("ฝั่งหน้าจอ: การ์ดเรียกผ่านฟังก์ชัน ads-spend-cache เท่านั้น ไม่ดึงเอง และบอกเมื่อข้อมูลเก่า/ยังไม่พร้อม", () => {
  assert.match(client, /invoke\("ads-spend-cache"/);
  assert.doesNotMatch(card, /\bfetch\(/);
  assert.match(card, /ads_not_ready/);
  assert.match(card, /result\?\.stale/);
  assert.match(card, /coverageFrom/);
});

// ───────── ตรรกะล้วนในฟังก์ชัน (ดึงเฉพาะบล็อก <pure> มาแปลงเป็น JS) ─────────
// Node 20 (CI) ยังไม่มี stripTypeScriptTypes จึงข้ามเฉพาะส่วนนี้ ส่วนข้างบนยังรันทุกที่
const canStrip = typeof nodeModule.stripTypeScriptTypes === "function";
const pure = edge.match(/\/\/ <pure>([\s\S]*?)\/\/ <\/pure>/);

async function loadPure() {
  const js = nodeModule.stripTypeScriptTypes(pure[1]) + "\nexport { addDays, bangkokToday, chunkRange, planRefresh, sumDaily };";
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
}

test("Edge Function มีบล็อก <pure> ให้ทดสอบ", () => {
  assert.ok(pure, "ต้องมี // <pure> ... // </pure>");
});

test("pure: addDays / bangkokToday / chunkRange", { skip: !canStrip || !pure }, async () => {
  const { addDays, bangkokToday, chunkRange } = await loadPure();
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  // 18:00 UTC = 01:00 วันถัดไปของไทย
  assert.equal(bangkokToday(Date.UTC(2026, 9, 21, 18, 0)), "2026-10-22");
  assert.equal(bangkokToday(Date.UTC(2026, 9, 21, 16, 59)), "2026-10-21");
  assert.deepEqual(chunkRange("2026-08-01", "2026-10-21", 31), [
    { since: "2026-08-01", until: "2026-08-31" },
    { since: "2026-09-01", until: "2026-10-01" },
    { since: "2026-10-02", until: "2026-10-21" },
  ]);
  assert.deepEqual(chunkRange("2026-10-21", "2026-10-21", 31), [{ since: "2026-10-21", until: "2026-10-21" }]);
  assert.deepEqual(chunkRange("2026-10-22", "2026-10-21", 31), []);
});

test("pure: planRefresh — ครั้งแรกดึงเดือนนี้ก่อน / เก่าแล้วดึง 7 วันล่าสุด / เติมย้อนหลังทีละช่วง", { skip: !canStrip || !pure }, async () => {
  const { planRefresh } = await loadPure();
  const now = Date.UTC(2026, 9, 21, 5, 0); // 12:00 ไทย 21 ต.ค.
  const H = 3600000;
  const fresh = new Date(now - 10 * 60000).toISOString();
  const old = new Date(now - 2 * H).toISOString();
  const plan = (state) => planRefresh(state, now, "2026-08-01", H, 7, 14);

  // ไม่เคยดึงเลย -> ต้นเดือนนี้ (1 ต.ค.) ถึงวันนี้ก่อน แล้วเติมย้อนหลัง 14 วันถัดไป
  assert.deepEqual(plan(null), {
    recent: { since: "2026-10-01", until: "2026-10-21", setsCoverage: true },
    backfill: { since: "2026-09-17", until: "2026-09-30" },
  });
  // ต้นเดือน: ครอบกราฟ 14 วันย้อนหลังด้วย (3 ต.ค. -> 19 ก.ย.)
  assert.equal(planRefresh(null, Date.UTC(2026, 9, 3, 5, 0), "2026-08-01", H, 7, 14).recent.since, "2026-09-19");
  // มีข้อมูลถึง 1 ส.ค. แล้วและยังสด -> ไม่ต้องดึงอะไร
  assert.deepEqual(plan({ last_success_at: fresh, backfilled_from: "2026-08-01" }), { recent: null, backfill: null });
  // มีครบแล้วแต่เก่ากว่า 1 ชม. -> ดึงแค่ 7 วันล่าสุด (ไม่ขยับ coverage)
  assert.deepEqual(plan({ last_success_at: old, backfilled_from: "2026-08-01" }), {
    recent: { since: "2026-10-14", until: "2026-10-21", setsCoverage: false },
    backfill: null,
  });
  // ยังสดแต่ย้อนหลังยังไม่ครบ -> ไม่ดึงช่วงล่าสุด เติมย้อนหลังช่วงถัดไปอย่างเดียว
  assert.deepEqual(plan({ last_success_at: fresh, backfilled_from: "2026-09-17" }), {
    recent: null,
    backfill: { since: "2026-09-03", until: "2026-09-16" },
  });
  // ช่วงสุดท้ายถูกตัดที่ 1 ส.ค. ไม่เลยไป
  assert.deepEqual(plan({ last_success_at: fresh, backfilled_from: "2026-08-06" }).backfill, { since: "2026-08-01", until: "2026-08-05" });
});

test("pure: sumDaily", { skip: !canStrip || !pure }, async () => {
  const { sumDaily } = await loadPure();
  assert.equal(sumDaily([]), 0);
  assert.equal(sumDaily([{ spend: 100.5 }, { spend: 200 }]), 300.5);
});
