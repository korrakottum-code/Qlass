import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const fn = readFileSync(
  new URL("../supabase/functions/deposit-campaign-stats/index.ts", import.meta.url),
  "utf8"
);
const fnCode = fn.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const sql = readFileSync(
  new URL("../supabase/migrations/20261127120000_deposit_campaign_stats.sql", import.meta.url),
  "utf8"
);
const sqlCode = sql.replace(/^\s*--.*$/gm, "");

// ข้อมูลลูกค้า/พนักงานที่ห้ามออกไปถึงแดชบอร์ดทีมโฆษณา
const FORBIDDEN = ["customer_name", "customer_phone", "slip_path", "note", "cancel_reason", "recorded_by", "booked_by", "cancelled_by", "edit_log"];

test("SQL ไม่อ่านคอลัมน์ข้อมูลลูกค้า สลิป หรือผู้บันทึก", () => {
  for (const column of FORBIDDEN) {
    assert.ok(!new RegExp(`d\\.${column}\\b`).test(sqlCode), `ต้องไม่อ่าน transfer_deposits.${column}`);
  }
  assert.ok(!/d\.\*/.test(sqlCode), "ห้าม select d.*");
  assert.ok(!/'(id|queueId|depositId|staffId|phone|customerName)'/.test(sqlCode), "ต้องไม่ส่ง id รายการ/คิว หรือข้อมูลลูกค้า");
});

test("ส่งเป็นยอดรวมเท่านั้น (group by) ไม่ส่งรายแถว", () => {
  assert.match(sqlCode, /group by m\.record_date, m\.branch_id, m\.promo_name, m\.procedure_name, m\.is_cancelled, m\.is_booked/);
  assert.match(sqlCode, /count\(\*\)::int as cnt, sum\(m\.amount\) as amt/);
});

test("เกณฑ์ 'จองแล้ว' ตรงกับยอดรวมในหน้า Qlass (deposit_stats_v1)", () => {
  assert.match(sqlCode, /b\.q_status not in \('cancelled', 'no_show', 'rescheduled'\)/);
  assert.match(sqlCode, /public\.deposit_current_queue\(d\.queue_id\)/);
  assert.match(sqlCode, /where d\.record_date between p_since and p_until/);
});

test("SQL กันช่วงวัน 30 วัน, อัตราเรียก และวันหมดอายุเอง", () => {
  assert.match(sqlCode, /v_today > date '2026-12-03'/);
  assert.match(sqlCode, /p_since < v_today - 29 or p_until > v_today/);
  assert.match(sqlCode, /interval '1 hour'\) >= 30/);
});

test("RPC และตารางนับครั้งเรียก ปิดจากคีย์หน้าเว็บ เปิดเฉพาะ service_role", () => {
  assert.match(sql, /security definer/);
  assert.match(sql, /set search_path = ''/);
  for (const role of ["public", "anon", "authenticated"]) {
    assert.match(sql, new RegExp(`revoke all on function public\\.deposit_campaign_stats_v1\\(date, date\\) from ${role};`));
  }
  assert.match(sql, /grant execute on function public\.deposit_campaign_stats_v1\(date, date\) to service_role;/);
  assert.match(sql, /alter table public\.deposit_campaign_stats_calls enable row level security;/);
  assert.match(sql, /revoke all on table public\.deposit_campaign_stats_calls from public, anon, authenticated;/);
});

test("Edge Function ใช้คีย์ของตัวเอง ≥32 ตัว ไม่ซ้ำคีย์ external-queue-stats และ fail closed", () => {
  assert.match(fn, /QLASS_DEPOSIT_STATS_API_KEY/);
  assert.match(fn, /apiKey\.length >= MIN_KEY_LENGTH && apiKey !== otherKey/);
  assert.match(fn, /const MIN_KEY_LENGTH = 32;/);
  assert.match(fn, /if \(!apiKeyReady\) return response\(\{ error: "api_not_configured" \}, 503\);/);
  assert.match(fn, /constantTimeEqual\(token, apiKey\)/);
});

test("Edge Function เป็น server-to-server อ่านอย่างเดียว", () => {
  assert.match(fn, /if \(req\.method !== "GET"\) return response\(\{ error: "method_not_allowed" \}, 405\);/);
  assert.ok(!/Access-Control-Allow-Origin/.test(fnCode));
  for (const write of [".insert(", ".update(", ".upsert(", ".delete(", ".from("]) {
    assert.ok(!fnCode.includes(write), `ต้องไม่มี ${write} — เรียกได้แค่ RPC ยอดรวม`);
  }
  assert.match(fn, /supabase\.rpc\("deposit_campaign_stats_v1"/);
});

test("Edge Function กันช่วงวันและวันหมดอายุซ้ำอีกชั้น และไม่ส่ง error ดิบกลับ", () => {
  assert.match(fn, /const WINDOW_DAYS = 30;/);
  assert.match(fn, /const LAST_DAY = "2026-12-03";/);
  assert.match(fn, /if \(today > LAST_DAY\) return response\(\{ error: "api_expired" \}, 410\);/);
  assert.match(fn, /return response\(\{ error: "query_failed" \}, 500\);/);
  assert.ok(!/error: error\.message/.test(fnCode));
});
