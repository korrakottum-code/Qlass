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
  assert.equal(fns.length, 10);
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
  // ตัวนับเดินหน้าอย่างเดียว: ต่อจาก "มากกว่า" ระหว่างเลขเดิมกับเลขที่ระบุ (กันออกเลขซ้ำกับของเก่า/ของที่ออกไปแล้ว)
  assert.match(sql, /on conflict \(prefix\) do update set last_no = greatest\(k\.last_no, coalesce\(p_start_after, 0\)\) \+ p_quantity/i);
  assert.match(sql, /p_quantity > 20000/);
  assert.match(sql, /lpad\(n::text, 7, '0'\)/);
  // ต้องรับทุกหมวดในคู่มือ POS v6.2 และปฏิเสธหมวดที่ไม่มี
  const m = sql.match(/v_prefix !~ '([^']+)'/);
  assert.ok(m, "ต้องมี regex ตรวจหมวด");
  const re = new RegExp(m[1]);
  for (const ok of ["T1", "T4", "T99", "D1", "D10", "D99", "S1", "S2", "O1", "O4", "O9"]) assert.ok(re.test(ok), ok);
  for (const bad of ["T5", "D0", "D11", "S3", "O5", "X1", "", "d1 "]) assert.ok(!re.test(bad), bad);
});

test("คูปอง 1 ใบใช้ได้ 1 ครั้ง: edge function บังคับ total_uses = 1 ไม่รับค่าจากเบราว์เซอร์", () => {
  assert.match(edge, /p_total_uses: 1,/);
  assert.doesNotMatch(edge, /p_total_uses: Number\(/);
});

test("รายการล็อตส่งหมวดกลับมาด้วย เพื่อออกเพิ่มจากล็อตเดิมโดยไม่ต้องกรอกใหม่", () => {
  const body = sql.slice(sql.indexOf("function public.coupon_batches_v1"));
  assert.match(body, /'category', b\.category/);
});

test("แท็บล็อตหุบรวมเป็นโปรละแถว กางดูช่วงรหัสได้ และปุ่มเพิ่มใช้ล็อตล่าสุดของโปรเป็นต้นแบบ", () => {
  const page = readFileSync(new URL("../src/pages/CouponPage.jsx", import.meta.url), "utf8");
  assert.match(page, /byKey/);
  assert.match(page, /toggleGroup\(g\.key\)/);
  assert.match(page, /const b = g\.latest;/);
  assert.match(page, /handleAddMore\(b\)/);
});

test("ยกเลิกทั้งล็อต: ปิดเฉพาะใบที่ยังไม่เคยใช้ และกู้คืนเฉพาะใบที่ล็อตนี้ยกเลิกเอง", () => {
  const body = sql.slice(sql.indexOf("function public.coupon_cancel_batch_v1"));
  assert.match(body, /for update/i);
  assert.match(body, /where batch_id = b\.id and cancelled_at is null and used_count = 0/);
  assert.match(body, /where batch_id = b\.id and cancelled_at = b\.cancelled_at/);
  // ยกเลิกทั้งล็อตเป็นงานหัวหน้าขึ้นไป: เช็ค role ต้องมาก่อนเรียกฟังก์ชันในบล็อตของ action นี้
  const act = edge.slice(edge.indexOf('body.action === "coupon_cancel_batch"'));
  const block = act.slice(0, act.indexOf('body.action === "coupon_counters"'));
  assert.ok(block.includes("couponManageRoles.has(role)"), "ต้องจำกัด role");
  assert.ok(block.indexOf("couponManageRoles.has(role)") < block.indexOf("coupon_cancel_batch_v1"), "เช็ค role ก่อนเรียกฟังก์ชัน");
});

test("ตัด/ยกเลิกรายใบ/ยกเลิกทั้งล็อต ต้องพิมพ์เลข 3 ตัวท้ายยืนยัน (ไม่ใช้ confirm ธรรมดา)", () => {
  const page = readFileSync(new URL("../src/pages/CouponPage.jsx", import.meta.url), "utf8");
  assert.match(page, /const ok = value === pending\.expect;/);
  assert.match(page, /disabled=\{!ok \|\| busy\}/);
  assert.match(page, /expect: last3\(found\.code\)/);          // ตัด
  assert.match(page, /expect: last3\(c\.code\)/);              // ยกเลิกรายใบ
  assert.match(page, /expect: last3\(x\.lastCode\)/);          // ยกเลิกทั้งล็อต
  // ตัวที่ทำจริง (do*) ต้องถูกเรียกผ่านหน้าต่างยืนยันเท่านั้น ไม่ผูกกับปุ่มโดยตรง
  assert.doesNotMatch(page, /onClick=\{doRedeem\}|onClick=\{\(\) => doCancel\(|onClick=\{\(\) => doCancelBatch\(/);
});

test("หน้าคูปองไม่ใช้ตารางกว้างที่ต้องเลื่อนซ้ายขวา (รายการ/ล็อตเป็นการ์ดที่ไหลตามความกว้างจอ)", () => {
  const page = readFileSync(new URL("../src/pages/CouponPage.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /<table/);
  assert.doesNotMatch(page, /table-scroll/);
  assert.doesNotMatch(page, /overflowX:\s*"auto"/);
});

test("สถิติคูปอง: เฉพาะ superadmin/head_admin/admin และฟังก์ชันปิดจากคีย์หน้าเว็บ", () => {
  assert.match(edge, /couponStatsRoles = new Set\(\["superadmin", "head_admin", "admin"\]\)/);
  const act = edge.slice(edge.indexOf('body.action === "coupon_stats"'));
  const block = act.slice(0, act.indexOf('body.action === "coupon_counters"'));
  assert.ok(block.indexOf("couponStatsRoles.has(role)") >= 0 && block.indexOf("couponStatsRoles.has(role)") < block.indexOf("coupon_stats_v1"));
  // อยู่ในรายการ revoke เดียวกับฟังก์ชันอื่น (รายการเดียวจบด้วย from public, anon, authenticated)
  const revokeBlock = sql.slice(sql.indexOf("revoke all on function\n  public.coupon_generate_v1"));
  assert.ok(revokeBlock.includes("public.coupon_stats_v1(date, date)"));
  assert.match(revokeBlock.trim(), /from public, anon, authenticated;$/);
  // ผลรวมสถานะครบทุกใบ: 4 กลุ่ม (ใช้แล้ว/ใช้ได้/หมดอายุ/ยกเลิก) นับแบบไม่ซ้ำกัน
  assert.match(sql, /'cancelled', count\(\*\) filter \(where cancelled_at is not null\)/);
});
