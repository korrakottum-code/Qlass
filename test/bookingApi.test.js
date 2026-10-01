import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Windows checkout = CRLF, CI บน Linux = LF → แปลงเป็น LF ก่อนทุกครั้ง
const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8").split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
const stripComments = (s) => s.replace(/^\s*--.*$/gm, "");

const sql = stripComments(read("../supabase/migrations/20261001100000_booking_api.sql"));
const original = stripComments(read("../supabase/migrations/20260916110000_create_queue_v1_area_names.sql"));
const edge = read("../supabase/functions/booking-api/index.ts");
const staffSession = read("../supabase/functions/staff-session/index.ts");

// ตัดชื่อตัวแปรที่ต่างกันระหว่างสองฟังก์ชันให้เป็นคำกลาง แล้วบีบช่องว่าง เพื่อเทียบ "กติกา" แบบข้อความต่อข้อความ
const norm = (s) => s
  .replace(/\bv_time_block\b|\bp_start\b|\bg\.blk\b/g, "START")
  .replace(/\bv_duration\b|\bp_dur\b|\bv_dur\b/g, "DUR")
  .replace(/\bv_room_id\b|\bp_room_id\b|\bv_cand\b/g, "ROOM")
  .replace(/\bv_date\b|\bp_date\b/g, "DATE")
  .replace(/\bq_procedure\b|\bqp\b/g, "qp")
  .replace(/\s+/g, " ");
const nSql = norm(sql);
const nOrig = norm(original);

const TABLES = ["booking_api_branches", "booking_api_skus", "booking_api_config", "booking_api_counters", "booking_api_requests", "booking_api_log"];
const FUNCTIONS = [
  "booking_api_candidate_rooms_v1", "booking_api_room_status_v1", "booking_api_free_rooms_v1", "booking_api_day_range_v1",
  "booking_api_branches_v1", "booking_api_resolve_v1", "booking_api_evaluate_v1", "booking_api_check_v1", "booking_api_slots_v1", "booking_api_create_v1",
];

test("Booking API: ตารางใหม่ปิดจากคีย์หน้าเว็บ (RLS เปิดไม่มี policy ถอนสิทธิ์) และไม่แตะตารางเดิม", () => {
  for (const t of TABLES) {
    assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security;`), t);
    assert.match(sql, new RegExp(`create table if not exists public\\.${t}\\b`), t);
  }
  assert.match(sql, /revoke all on table[\s\S]*from anon, authenticated;/);
  assert.match(sql, /grant all on table[\s\S]*to service_role;/);
  assert.doesNotMatch(sql, /create policy/i);
  // เพิ่มอย่างเดียว: ไม่มี drop/alter/truncate/update/delete บนตารางที่ใช้งานอยู่
  assert.doesNotMatch(sql, /\bdrop\b|\btruncate\b|\balter table public\.(queues|rooms|room_schedules|room_procedures|procedures|promos|staff|branches)\b/i);
  assert.doesNotMatch(sql, /\bupdate public\.(queues|rooms|staff|branches)\b|\bdelete from\b/i);
});

test("Booking API: ฟังก์ชันทั้ง 10 ตัวถอนสิทธิ์จาก public/anon/authenticated และให้ service_role เท่านั้น", () => {
  const created = [...sql.matchAll(/create or replace function public\.(booking_api_\w+)\(/g)].map((m) => m[1]).sort();
  assert.deepEqual(created, [...FUNCTIONS].sort());
  const revoke = sql.slice(sql.indexOf("revoke all on function"), sql.indexOf("grant execute on function"));
  const grant = sql.slice(sql.indexOf("grant execute on function"));
  for (const f of FUNCTIONS) {
    assert.ok(revoke.includes(`public.${f}(`), `revoke ${f}`);
    assert.ok(grant.includes(`public.${f}(`), `grant ${f}`);
  }
  assert.match(revoke, /from public, anon, authenticated;/);
  assert.match(grant, /to service_role;/);
});

test("Booking API: กติกาห้องว่างตรงกับ create_queue_v1 ข้อความต่อข้อความ (กันกติกาเพี้ยน)", () => {
  const shared = [
    "s.available = false and s.start_block is null and s.end_block is null",
    "s.available = true and s.start_block is not null and s.end_block is not null",
    "s.available = false and s.start_block is not null and s.end_block is not null",
    "q.status not in ('cancelled', 'no_show', 'rescheduled')",
    "START < q.time_block + coalesce(q.duration_blocks, qp.blocks, 1)",
    "q.time_block < START + DUR",
    "START < 96",
    "START + DUR > 288",
    "'queue-room-day:' || ROOM::text || ':' || DATE::text",
    "(s.date = DATE or s.date is null)",
    "q.room_id = ROOM",
    "q.date = DATE",
  ];
  for (const frag of shared) {
    assert.ok(nOrig.includes(frag), `create_queue_v1 ไม่มี: ${frag}`);
    assert.ok(nSql.includes(frag), `booking_api ไม่มี: ${frag}`);
  }
  // ห้องต้องประเภทตรงกับบริการ และห้องที่ยังไม่ตั้ง room_procedures = ผ่าน (กติกาเดิม)
  assert.ok(nOrig.includes("v_procedure.room_type is distinct from v_room.type"));
  assert.ok(nSql.includes("r.type = p.room_type"));
  assert.ok(nOrig.includes("exists (select 1 from public.room_procedures rp where rp.room_id = ROOM)"));
  assert.ok(nSql.includes("not exists (select 1 from public.room_procedures rp where rp.room_id = r.id)"));
});

test("Booking API: จองลง queues ด้วยรายการคอลัมน์เดียวกับ create_queue_v1 และสถานะตามกติกาแอดมิน", () => {
  const cols = (src) => {
    const m = src.match(/insert into public\.queues \(\s*([^)]+?)\s*\) values/);
    assert.ok(m, "ไม่พบ insert into queues");
    return m[1].split(",").map((c) => c.trim()).filter(Boolean);
  };
  assert.deepEqual(cols(sql), cols(original));
  assert.match(sql, /case when v_date = \(now\(\) at time zone 'Asia\/Bangkok'\)::date then 'confirmed' else 'pending' end/);
  // ลงเป็นพนักงานบอทที่เป็น role admin เท่านั้น และไม่มีค่าคอมมิชชันนอกเหนือจากอัตราของบอท
  assert.match(sql, /v_bot_staff\.role <> 'admin' then raise exception 'BOT_NOT_CONFIGURED'/);
  assert.match(sql, /commission_rate_new/);
  // audit ของคิวเหมือน create_queue_v1 (รายการฟิลด์ที่เปลี่ยน)
  const fields = (src) => src.match(/changed_fields\s*\)\s*values[\s\S]*?array\[([^\]]+)\]/)[1].replace(/\s+/g, " ").trim();
  assert.equal(fields(sql), fields(original));
});

test("Booking API: จองแล้วล็อกห้อง-วัน ตรวจซ้ำ กันซ้ำด้วย reference_id และ sandbox (dry-run) ไม่เขียนอะไร", () => {
  const body = sql.slice(sql.indexOf("function public.booking_api_create_v1"));
  const order = ["booking-api-ref:", "request_hash = v_hash then return v_existing.response", "raise exception 'REFERENCE_ID_REUSED'",
    "booking_api_evaluate_v1(v_code", "if coalesce(p_dry_run, false) then", "pg_advisory_xact_lock(hashtextextended('queue-room-day:",
    "booking_api_room_status_v1(v_cand", "insert into public.queues", "insert into public.queue_audit", "insert into public.booking_api_requests"]
    .map((s) => body.indexOf(s));
  assert.ok(order.every((n) => n >= 0), order.join(","));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  // dry-run ต้องคืนผลก่อนถึง insert ใด ๆ
  const dry = body.slice(body.indexOf("if coalesce(p_dry_run, false) then"), body.indexOf("insert into public.queues"));
  assert.match(dry, /'SANDBOX-'/);
  assert.match(dry, /return jsonb_build_object\('success', true/);
  assert.match(body, /md5\('booking-api:' \|\| v_ref\)::uuid/);
});

test("Booking API: จองต้องผ่านเงื่อนไขเวลา (60 วัน / 2 ชั่วโมง) ตัวเลขเดียวกันในเช็ก, ช่องเวลา และจอง", () => {
  assert.equal((sql.match(/c_min_lead interval := interval '2 hours'/g) || []).length, 2);
  assert.equal((sql.match(/c_max_days int := 60/g) || []).length, 2);
  assert.match(sql, /p_start < now\(\) \+ c_min_lead or v_date > v_today \+ c_max_days/);
  // บอทมองเห็นเฉพาะ 31 สาขาตามรหัสของคลินิก (HK สำนักงานใหญ่ไม่รับคิว)
  const codes = [...sql.matchAll(/\('([A-Z]{2})','Class [^']+'\)/g)].map((m) => m[1]);
  assert.equal(codes.length, 31);
  assert.equal(new Set(codes).size, 31);
  assert.ok(!codes.includes("HK"));
  for (const c of ["KK", "KC", "BN", "MD", "YS", "SP"]) assert.ok(codes.includes(c), c);
});

test("booking-api (edge): fail closed, คีย์ constant-time, ไม่มี CORS, sandbox = dry-run, ไม่เก็บข้อมูลลูกค้าลง log", () => {
  assert.match(edge, /MIN_KEY_LENGTH = 32/);
  assert.match(edge, /rawSandboxKey === productionKey \? "" : rawSandboxKey/);
  assert.match(edge, /if \(configuredKeys\.length === 0\) return fail\("NOT_CONFIGURED", 503\)/);
  assert.match(edge, /function constantTimeEqual/);
  assert.match(edge, /for \(const k of configuredKeys\) if \(constantTimeEqual\(provided, k\.key\)\) matched = k\.kind/);
  assert.doesNotMatch(edge, /Access-Control/i);
  assert.match(edge, /p_dry_run: kind === "sandbox"/);
  // key ตรวจก่อนทุกอย่าง (ก่อนอ่าน body / เรียกฐานข้อมูล)
  assert.ok(edge.indexOf("authenticate(req)") < edge.indexOf("readJson(req)"));
  // log ไม่มีชื่อ/เบอร์/โน้ต
  const log = edge.slice(edge.indexOf("await writeLog({"), edge.indexOf("return res;"));
  assert.doesNotMatch(log, /name|phone|note|customer/i);
  assert.match(edge, /"POST \/v1\/bookings": 30/);
  assert.match(edge, /ISO_WITH_ZONE/);
});

test("staff-session: บัญชีบอท Saifa AI แก้/ลบจากหน้าจัดการพนักงานไม่ได้", () => {
  assert.match(staffSession, /const protectedStaffIds = new Set\(\["1f43d7fe-19a3-4a17-a5c7-f68a89087345"\]\)/);
  const update = staffSession.slice(staffSession.indexOf('body.action === "staff_update"'));
  assert.ok(update.slice(0, update.indexOf("staff_delete")).includes("protectedStaffIds.has(body.staffId)"));
  const del = staffSession.slice(staffSession.indexOf('body?.action === "staff_delete"'));
  assert.ok(del.slice(0, del.indexOf("branch_create")).includes("protectedStaffIds.has(body.staffId)"));
});

test("Booking API: SKU ทดสอบ TEST-* ใช้ได้เฉพาะ sandbox (dry-run) จองจริงถูกปฏิเสธก่อนแตะข้อมูลใด ๆ", () => {
  const seeds = [...sql.matchAll(/\('(TEST-[A-Z]+)', '/g)].map((m) => m[1]);
  assert.ok(seeds.length >= 6, seeds.join(","));
  const body = sql.slice(sql.indexOf("function public.booking_api_create_v1"));
  const guard = body.indexOf("v_skucode like 'TEST-%' and not coalesce(p_dry_run, false) then raise exception 'INVALID_SKU'");
  assert.ok(guard > 0);
  assert.ok(guard < body.indexOf("pg_advisory_xact_lock"), "ต้องปฏิเสธก่อนล็อก/เขียนอะไร");
  assert.ok(guard < body.indexOf("insert into public.queues"));
});

