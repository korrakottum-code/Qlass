import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const fn = readFileSync(
  new URL("../supabase/functions/deposit-campaign-list/index.ts", import.meta.url),
  "utf8"
);
const fnCode = fn.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const sql = readFileSync(
  new URL("../supabase/migrations/20261128120000_deposit_campaign_list.sql", import.meta.url),
  "utf8"
);
const sqlCode = sql.replace(/^\s*--.*$/gm, "");

// ชื่อ/เบอร์ลูกค้าส่งได้ (เจ้าของสั่ง) แต่สลิป หมายเหตุ และข้อมูลพนักงานยังห้ามออก
const FORBIDDEN = ["slip_path", "note", "cancel_reason", "recorded_by", "booked_by", "cancelled_by", "edit_log"];

test("รายชื่อ: ส่งชื่อ+เบอร์ลูกค้า แต่ไม่อ่านสลิป หมายเหตุ หรือผู้บันทึก", () => {
  for (const column of FORBIDDEN) {
    assert.ok(!new RegExp(`d\\.${column}\\b`).test(sqlCode), `ต้องไม่อ่าน transfer_deposits.${column}`);
  }
  assert.ok(!/d\.\*/.test(sqlCode), "ห้าม select d.*");
  assert.ok(!/'(id|queueId|depositId|staffId|branchId)'/.test(sqlCode), "ต้องไม่ส่ง id ใด ๆ");
  assert.match(sqlCode, /'customerName',\s+m\.customer_name/);
  assert.match(sqlCode, /'customerPhone', m\.customer_phone/);
});

test("รายชื่อ: เกณฑ์จองแล้ว/ยกเลิก เหมือนยอดรวม", () => {
  assert.match(sqlCode, /b\.q_status not in \('cancelled', 'no_show', 'rescheduled'\)/);
  assert.match(sqlCode, /public\.deposit_current_queue\(d\.queue_id\)/);
  assert.match(sqlCode, /where d\.record_date between p_since and p_until/);
});

test("รายชื่อ: กัน 30 วัน อัตราเรียก (นับแยก) และหมดอายุ", () => {
  assert.match(sqlCode, /v_today > date '2026-12-03'/);
  assert.match(sqlCode, /p_since < v_today - 29 or p_until > v_today/);
  assert.match(sqlCode, /deposit_campaign_list_calls where at > now\(\) - interval '1 hour'\) >= 30/);
});

test("รายชื่อ: RPC และตารางนับครั้ง เปิดเฉพาะ service_role", () => {
  assert.match(sql, /security definer/);
  assert.match(sql, /set search_path = ''/);
  for (const role of ["public", "anon", "authenticated"]) {
    assert.match(sql, new RegExp(`revoke all on function public\\.deposit_campaign_list_v1\\(date, date\\) from ${role};`));
  }
  assert.match(sql, /grant execute on function public\.deposit_campaign_list_v1\(date, date\) to service_role;/);
  assert.match(sql, /alter table public\.deposit_campaign_list_calls enable row level security;/);
  assert.match(sql, /revoke all on table public\.deposit_campaign_list_calls from public, anon, authenticated;/);
});

test("รายชื่อ: ใช้คีย์เดียวกับยอดรวม ≥32 ตัว ไม่ซ้ำคีย์ external และ fail closed", () => {
  assert.match(fn, /Deno\.env\.get\("QLASS_DEPOSIT_STATS_API_KEY"\)/);
  assert.match(fn, /apiKey\.length >= MIN_KEY_LENGTH && apiKey !== otherKey/);
  assert.match(fn, /if \(!apiKeyReady\) return response\(\{ error: "api_not_configured" \}, 503\);/);
  assert.match(fn, /constantTimeEqual\(token, apiKey\)/);
});

test("รายชื่อ: อ่านอย่างเดียว server-to-server เรียกแค่ RPC รายชื่อ", () => {
  assert.match(fn, /if \(req\.method !== "GET"\) return response\(\{ error: "method_not_allowed" \}, 405\);/);
  assert.ok(!/Access-Control-Allow-Origin/.test(fnCode));
  for (const write of [".insert(", ".update(", ".upsert(", ".delete(", ".from("]) {
    assert.ok(!fnCode.includes(write), `ต้องไม่มี ${write}`);
  }
  assert.match(fn, /supabase\.rpc\("deposit_campaign_list_v1"/);
  assert.ok(!fnCode.includes("deposit_campaign_stats_v1"));
  assert.match(fn, /const LAST_DAY = "2026-12-03";/);
  assert.ok(!/error: error\.message/.test(fnCode));
});
