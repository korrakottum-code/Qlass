import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// คูปองมีชื่อ/เบอร์ลูกค้า จึงต้องปิดจากคีย์หน้าเว็บตั้งแต่วันแรก และทุกทางเข้าต้องผ่าน staff-session
const sql = readFileSync(new URL("../supabase/migrations/20260929120000_coupons.sql", import.meta.url), "utf8").replace(/^\s*--.*$/gm, "");
const edge = readFileSync(new URL("../supabase/functions/staff-session/index.ts", import.meta.url), "utf8");

test("ตารางคูปองเปิด RLS โดยไม่มี policy และถอนสิทธิ์จากคีย์หน้าเว็บ", () => {
  assert.match(sql, /alter table public\.coupons enable row level security;/i);
  assert.match(sql, /alter table public\.coupon_redemptions enable row level security;/i);
  assert.match(sql, /revoke all on table public\.coupons, public\.coupon_redemptions from anon, authenticated;/i);
  assert.doesNotMatch(sql, /create policy/i);
});

test("ฟังก์ชัน coupon_*_v1 ทุกตัวถอนสิทธิ์จาก public/anon/authenticated", () => {
  const fns = [...sql.matchAll(/create or replace function public\.(coupon_\w+_v1)\(/gi)].map((m) => m[1]);
  assert.equal(fns.length, 7);
  for (const fn of fns) assert.match(sql, new RegExp(String.raw`revoke all on function[\s\S]*public\.${fn}\(`, "i"), fn);
});

test("ตัดคูปองล็อกแถวก่อนเช็คสถานะ (กันตัดครั้งสุดท้ายซ้อนกัน)", () => {
  const body = sql.slice(sql.indexOf("function public.coupon_redeem_v1"));
  assert.ok(body.indexOf("for update") < body.indexOf("coupon_status(c)"));
});

test("edge function: ออก/ยกเลิกเฉพาะ superadmin+head_admin และตัดของสาขาบังคับสาขาตัวเอง", () => {
  assert.match(edge, /couponManageRoles = new Set\(\["superadmin", "head_admin"\]\)/);
  assert.doesNotMatch(edge, /couponUseRoles = new Set\([^)]*"ceo"/);
  assert.match(edge, /branchScoped \? String\(current\.user\.branchId/);
});

test("รหัสคูปอง = หมวด POS + เลขรัน 7 หลัก จองช่วงเลขด้วย upsert ตัวนับเดียว", () => {
  assert.match(sql, /create table if not exists public\.coupon_counters/i);
  assert.match(sql, /revoke all on table public\.coupon_counters from anon, authenticated;/i);
  assert.match(sql, /on conflict \(prefix\) do update set last_no = k\.last_no \+ p_quantity/i);
  assert.match(sql, /lpad\(n::text, 7, '0'\)/);
  // ต้องรับทุกหมวดในคู่มือ POS v6.2 และปฏิเสธหมวดที่ไม่มี
  const m = sql.match(/v_prefix !~ '([^']+)'/);
  assert.ok(m, "ต้องมี regex ตรวจหมวด");
  const re = new RegExp(m[1]);
  for (const ok of ["T1", "T4", "T99", "D1", "D10", "D99", "S1", "S2", "O1", "O4", "O9"]) assert.ok(re.test(ok), ok);
  for (const bad of ["T5", "D0", "D11", "S3", "O5", "X1", "", "d1 "]) assert.ok(!re.test(bad), bad);
});
