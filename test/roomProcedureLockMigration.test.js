import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (name) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");

const schema = read("20260817103000_room_procedures.sql");
const seed = read("20260817140000_seed_room_procedures.sql");
const rpc = read("20260817160000_create_queue_v1_room_procedure_lock.sql");
const previousRpc = read("20260817050038_goal13b_create_queue_v1_confirmed_status.sql");

test("ตารางใหม่ผูกกับ rooms/procedures และลบตามเมื่อแม่ถูกลบ", () => {
  assert.match(schema, /references public\.rooms\(id\)\s+on delete cascade/i);
  assert.match(schema, /references public\.procedures\(id\)\s+on delete cascade/i);
  assert.match(schema, /primary key \(room_id, procedure_id\)/i);
});

test("ลบโครงเก่าที่ค้างใน production ทิ้งพร้อมกัน", () => {
  assert.match(schema, /drop table if exists public\.room_machines/i);
  assert.match(schema, /alter table public\.rooms drop column if exists group_name/i);
});

test("เปิด RLS และให้สิทธิ์ระดับเดียวกับ rooms/procedures", () => {
  assert.match(schema, /alter table public\.room_procedures enable row level security/i);
  assert.match(schema, /grant select, insert, update, delete on table public\.room_procedures to anon, authenticated/i);
});

test("seed ครอบทั้ง 29 สาขา", () => {
  const branches = new Set([...seed.matchAll(/\('(Class [^']+)','T\d\d','(?:DT|HIFU|PICO|HIFUPICO)'\)/g)].map((m) => m[1]));
  assert.equal(branches.size, 29);
});

test("seed ใส่หัตถการกลางให้ทุกเตียง — ไม่งั้นหน้าร้านปิดช่องเวลาไม่ได้", () => {
  // 'ปิดคิว' คือตัวปิดช่องเวลา ไม่ใช่หัตถการ ถ้าหลุดจากกลุ่ม ANY เตียงเครื่องจะปิดคิวไม่ได้
  assert.match(seed, /when p\.name in \('ปิดคิว','โปรประจำเดือน \(T\)','Influencer'\) then 'ANY'/);
  assert.match(seed, /pg\.grp = 'ANY'/);
});

test("seed ล้มทั้ง migration ถ้าตั้งค่าไม่ครบ แทนที่จะเงียบ", () => {
  assert.match(seed, /raise exception 'ตั้งค่าไม่ครบ/);
});

test("seed แยกหัตถการชื่อซ้ำด้วย room_type — ปิดคิว/Influencer มีทั้งเวอร์ชัน M และ T", () => {
  assert.match(seed, /where p\.room_type = 'T'/i);
});

test("ฝั่งเซิร์ฟเวอร์บล็อกหัตถการที่เตียงไม่รับ", () => {
  assert.match(rpc, /from public\.room_procedures rp\s+where rp\.room_id = v_room_id and rp\.procedure_id = v_procedure_id/i);
  assert.match(rpc, /raise exception using errcode = 'P0001', message = 'invalid_procedure'/i);
});

test("เตียงที่ยังไม่ตั้งค่าต้องผ่านฝั่งเซิร์ฟเวอร์ด้วย — ไม่งั้นสาขาที่ยังไม่ตั้งค่าลงคิวไม่ได้เลย", () => {
  // ต้องมีเงื่อนไข "เตียงนี้มีแถวอยู่บ้างไหม" คั่นก่อน ไม่ใช่เช็คคู่ตรง ๆ
  assert.match(rpc, /exists \(select 1 from public\.room_procedures rp where rp\.room_id = v_room_id\)\s*\n\s*and not exists/i);
});

test("ใช้ error code เดิม ไม่สร้างโค้ดใหม่ที่ Edge Function ไม่รู้จัก", () => {
  const codes = [...rpc.matchAll(/message = '([a-z_]+)'/g)].map((m) => m[1]);
  const known = new Set([
    "invalid_queue_payload", "past_date_not_allowed", "invalid_session", "forbidden",
    "request_id_forbidden", "branch_forbidden", "invalid_branch", "invalid_room",
    "room_required", "invalid_procedure", "invalid_duration", "procedure_required",
    "invalid_promo", "invalid_time", "room_closed", "room_conflict",
  ]);
  const unknown = codes.filter((code) => !known.has(code));
  assert.deepEqual(unknown, []);
});

test("ฟังก์ชันที่เขียนทับยังคงกติกาความปลอดภัยเดิมครบ", () => {
  assert.match(rpc, /security definer\s+set search_path = ''/i);
  assert.match(rpc, /revoke all on function public\.create_queue_v1\([^)]*jsonb\) from public, anon, authenticated/i);
  assert.match(rpc, /q\.status not in \('cancelled', 'no_show'\)/i);
  assert.match(rpc, /pg_advisory_xact_lock\(hashtextextended\('queue-room-day:/i);
});

test("คัดลอกฟังก์ชันมาครบ ไม่ตกกติกาใดจากเวอร์ชันก่อนหน้า", () => {
  // create or replace ต้องส่งฟังก์ชันเต็ม การคัดลอกจึงเสี่ยงตกบรรทัด — เทียบว่าทุก
  // guard ของเวอร์ชันก่อนยังอยู่ครบในเวอร์ชันใหม่
  const guardsOf = (src) =>
    [...src.matchAll(/message = '([a-z_]+)'/g)].map((m) => m[1]);
  const before = new Set(guardsOf(previousRpc));
  const after = new Set(guardsOf(rpc));
  const dropped = [...before].filter((code) => !after.has(code));
  assert.deepEqual(dropped, []);
});
