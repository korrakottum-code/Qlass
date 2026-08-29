import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const fn = readFileSync(
  new URL("../supabase/functions/external-queue-stats/index.ts", import.meta.url),
  "utf8"
);
// ตัดคอมเมนต์ออกก่อนตรวจ เพื่อให้ยืนยันได้ว่าเป็นพฤติกรรมของ "โค้ดจริง"
// ไม่ใช่แค่คำที่บังเอิญปรากฏในคำอธิบาย
const fnCode = fn.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const sql = readFileSync(
  new URL("../supabase/migrations/20260829090000_external_queue_stats.sql", import.meta.url),
  "utf8"
);

// คอลัมน์ที่ห้ามหลุดออกจากระบบผ่าน API ภายนอกเด็ดขาด
const FORBIDDEN_COLUMNS = ["name", "phone", "note", "status_note", "price", "recorded_by"];

test("SQL รวมยอดอ่านเฉพาะคอลัมน์ที่ไม่ใช่ข้อมูลส่วนบุคคล", () => {
  // ตัว CTE ที่ดึงจาก queues ต้องหยิบแค่ 4 คอลัมน์นี้เท่านั้น
  assert.match(
    sql,
    /select q\.branch_id, q\.date, q\.status, q\.customer_type\s+from public\.queues q/,
    "scoped CTE ต้องเลือกเฉพาะ branch_id, date, status, customer_type"
  );
  for (const column of FORBIDDEN_COLUMNS) {
    assert.ok(
      !new RegExp(`q\\.${column}\\b`).test(sql),
      `SQL ต้องไม่อ่าน queues.${column} — เป็นข้อมูลส่วนบุคคลหรือราคา`
    );
  }
});

test("SQL ไม่คืน id ของคิวรายแถว จึงย้อนกลับไปหาลูกค้าไม่ได้", () => {
  assert.ok(!/'queueId'/.test(sql));
  assert.ok(!/q\.id\b/.test(sql), "ต้องไม่ส่ง id ของคิวออกไป");
});

test("RPC เป็น security definer ที่ล็อก search_path และให้สิทธิ์เฉพาะ service_role", () => {
  assert.match(sql, /security definer/);
  assert.match(sql, /set search_path = ''/);
  assert.match(sql, /revoke all on function public\.external_queue_stats\(date, date\) from public;/);
  assert.match(sql, /revoke all on function public\.external_queue_stats\(date, date\) from anon;/);
  assert.match(sql, /revoke all on function public\.external_queue_stats\(date, date\) from authenticated;/);
  assert.match(sql, /grant execute on function public\.external_queue_stats\(date, date\) to service_role;/);
});

test("SQL อ้างชื่อตารางแบบเต็ม เพราะ search_path ถูกล็อกไว้ว่าง", () => {
  assert.match(sql, /from public\.queues q/);
  assert.match(sql, /join public\.branches b/);
});

test("Edge Function fail closed เมื่อยังไม่ได้ตั้ง API key หรือคีย์สั้นเกินไป", () => {
  assert.match(fn, /const MIN_KEY_LENGTH = 32;/);
  assert.match(fn, /externalApiKey\.length >= MIN_KEY_LENGTH/);
  assert.match(fn, /if \(!externalApiKeyReady\) return response\(\{ error: "external_api_not_configured" \}, 503\);/);
});

test("Edge Function เทียบคีย์แบบ constant time และใช้คีย์คนละตัวกับ staff-session", () => {
  assert.match(fn, /constantTimeEqual\(token, externalApiKey\)/);
  assert.match(fn, /QLASS_EXTERNAL_API_KEY/);
  assert.ok(
    !/QLASS_ALLOWED_ORIGIN\b/.test(fnCode),
    "เป็น server-to-server ไม่ใช่ฟังก์ชันที่เบราว์เซอร์เรียก จึงไม่ควรมี origin allowlist"
  );
  assert.ok(
    !/Access-Control-Allow-Origin/.test(fnCode),
    "ต้องไม่เปิด CORS ให้เบราว์เซอร์ข้ามโดเมนเรียก"
  );
});

test("Edge Function รับเฉพาะ GET และบังคับ since/until พร้อมเพดานช่วงวันที่", () => {
  assert.match(fn, /if \(req\.method !== "GET"\) return response\(\{ error: "method_not_allowed" \}, 405\);/);
  assert.match(fn, /const MAX_RANGE_DAYS = 370;/);
  assert.match(fn, /error: "since_until_required"/);
  assert.match(fn, /error: "range_too_large"/);
});

test("Edge Function ไม่มีคำสั่งเขียนฐานข้อมูล", () => {
  for (const write of [".insert(", ".update(", ".upsert(", ".delete("]) {
    assert.ok(!fnCode.includes(write), `ต้องไม่มี ${write} — เป็น read-only`);
  }
  assert.match(fn, /supabase\.rpc\("external_queue_stats"/);
});

test("Edge Function ไม่ส่งข้อความ error ดิบจากฐานข้อมูลกลับไปให้ผู้เรียก", () => {
  assert.match(fn, /return response\(\{ error: "query_failed" \}, 500\);/);
  assert.ok(!/error: error\.message/.test(fnCode));
});
