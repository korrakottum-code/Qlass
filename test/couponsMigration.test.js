import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ปลายบรรทัดต่างกันตามระบบ (Windows checkout = CRLF, CI บน Linux = LF) แปลงเป็น LF ก่อน
// เทสต์ที่ใช้ regex ข้ามบรรทัดจะได้ไม่เปราะ
const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8").split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));

// คูปองมีชื่อ/เบอร์ลูกค้า จึงต้องปิดจากคีย์หน้าเว็บตั้งแต่วันแรก และทุกทางเข้าต้องผ่าน staff-session
const sql = read("../supabase/migrations/20260929120000_coupons.sql").replace(/^\s*--.*$/gm, "");
const edge = read("../supabase/functions/staff-session/index.ts");

test("ตารางคูปองเปิด RLS โดยไม่มี policy และถอนสิทธิ์จากคีย์หน้าเว็บ", () => {
  assert.match(sql, /alter table public\.coupons enable row level security;/i);
  assert.match(sql, /alter table public\.coupon_redemptions enable row level security;/i);
  assert.match(sql, /revoke all on table public\.coupons, public\.coupon_redemptions from anon, authenticated;/i);
  assert.doesNotMatch(sql, /create policy/i);
});

test("ฟังก์ชัน coupon_*_v1 ทุกตัวถอนสิทธิ์จาก public/anon/authenticated", () => {
  const fns = [...sql.matchAll(/create or replace function public\.(coupon_\w+_v1)\(/gi)].map((m) => m[1]);
  assert.equal(fns.length, 12);
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
  // หมวดไม่ได้เขียนตายใน SQL แล้ว: ตรวจกับตาราง coupon_categories (มีอยู่ + เปิดใช้งาน)
  assert.doesNotMatch(sql, /v_prefix !~ '\^\(T/, "ห้ามมีรายการหมวดเขียนตายใน SQL");
  assert.match(sql, /select active into v_cat_active from public\.coupon_categories where prefix = v_prefix;/);
  assert.match(sql, /if not found then raise exception 'invalid_prefix'; end if;/);
  assert.match(sql, /if not v_cat_active then raise exception 'category_inactive'; end if;/);
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
  const page = read("../src/pages/CouponPage.jsx");
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
  const page = read("../src/pages/CouponPage.jsx");
  assert.match(page, /const ok = value === pending\.expect;/);
  assert.match(page, /disabled=\{!ok \|\| busy\}/);
  assert.match(page, /expect: last3\(found\.code\)/);          // ตัด
  assert.match(page, /expect: last3\(c\.code\)/);              // ยกเลิกรายใบ
  assert.match(page, /expect: last3\(x\.lastCode\)/);          // ยกเลิกทั้งล็อต
  // ตัวที่ทำจริง (do*) ต้องถูกเรียกผ่านหน้าต่างยืนยันเท่านั้น ไม่ผูกกับปุ่มโดยตรง
  assert.doesNotMatch(page, /onClick=\{doRedeem\}|onClick=\{\(\) => doCancel\(|onClick=\{\(\) => doCancelBatch\(/);
});

test("หน้าคูปองไม่ใช้ตารางกว้างที่ต้องเลื่อนซ้ายขวา (รายการ/ล็อตเป็นการ์ดที่ไหลตามความกว้างจอ)", () => {
  const page = read("../src/pages/CouponPage.jsx");
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

test("สถิติ: มีลูกศรเปลี่ยนเดือนและปุ่มเดือนที่แล้ว โดยไม่ใช้ toISOString คำนวณวันที่", () => {
  const page = read("../src/pages/CouponPage.jsx");
  assert.match(page, /aria-label="เดือนก่อนหน้า"/);
  assert.match(page, /aria-label="เดือนถัดไป"/);
  assert.match(page, /เดือนที่แล้ว/);
  assert.match(page, /anchor >= thisMonth/);   // ห้ามกด › ไปเดือนในอนาคต
  // ตรวจเฉพาะโค้ด (ตัดคอมเมนต์บรรทัดออกก่อน — คอมเมนต์อธิบายกฎข้อนี้เองได้)
  const code = page.split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  assert.doesNotMatch(code, /toISOString/);
});

test("edge function: วันที่ผิดรูปแบบ/ไม่มีจริงตอบ 400 (ไม่ใช่ 500) และเบอร์ลูกค้าถูกปิดบังสำหรับแคชเชีย/ผู้จัดการสาขา", () => {
  assert.match(edge, /function validDay\(/);
  assert.match(edge, /return response\(\{ error: "invalid_expiry" \}, 400, origin\)/);
  assert.match(edge, /const maskPhones = role === "branch_manager" \|\| role === "cashier";/);
  // ทุกทางที่ส่งคูปองกลับไปหน้าเว็บ (lookup/redeem/revert/cancel/list) ต้องผ่านตัวปิดบัง
  assert.ok((edge.match(/coupon: maskCoupon\(data\)/g) || []).length >= 4);
  assert.match(edge, /coupons: \(data\.coupons \?\? \[\]\)\.map\(maskCoupon\)/);
});

test("หน้าคูปอง: กันผลโหลดเก่าทับผลใหม่ และไม่โชว์ช่วงรหัสที่คาดเดาเมื่อยังไม่รู้เลขล่าสุด", () => {
  const page = read("../src/pages/CouponPage.jsx");
  assert.match(page, /id === reqId\.current/);
  assert.match(page, /id === listReq\.current/);
  assert.match(page, /if \(alive\)/);
  assert.match(page, /const preview = countersOk &&/);
  assert.match(page, /!countersOk\) \{ onToast/);
});

test("รายการคูปองที่หลักแสนใบ: มีดัชนี trigram (หา schema ของ pg_trgm เอง) และกรองสถานะด้วยเงื่อนไขตรง ๆ", () => {
  // pg_trgm บนโปรเจกต์จริงอยู่ใน public — ห้ามเขียน extensions.gin_trgm_ops ตรง ๆ (จะ error ตอนลง migration)
  assert.doesNotMatch(sql, /extensions\.gin_trgm_ops/);
  assert.match(sql, /from pg_extension e join pg_namespace n on n\.oid = e\.extnamespace/);
  for (const col of ["code", "name", "customer_name", "customer_phone"]) {
    assert.match(sql, new RegExp(`using gin \\(${col} %I\\.gin_trgm_ops\\)`), col);
  }
  const body = sql.slice(sql.indexOf("function public.coupon_list_v1"), sql.indexOf("function public.coupon_batches_v1"));
  assert.doesNotMatch(body, /coupon_status\(c\)/, "ห้ามเรียก coupon_status ทีละแถวใน list");
  assert.match(body, /p_status = 'used_up'\s+and c\.cancelled_at is null and c\.used_count >= c\.total_uses/);
  assert.match(body, /p_status = 'expired'\s+and c\.cancelled_at is null and c\.used_count < c\.total_uses and c\.expiry_date < v_today/);
  assert.match(body, /p_status = 'active'\s+and c\.cancelled_at is null and c\.used_count < c\.total_uses and c\.expiry_date >= v_today/);
});

test("เมนูคูปองซ่อนไว้ก่อนเปิดใช้: ไม่มี coupons ใน pages ของบทบาทใดเมื่อไม่ได้ตั้ง VITE_ENABLE_COUPONS", async () => {
  const { ROLES, COUPONS_ENABLED, NAV_ITEMS } = await import("../src/utils/constants.js");
  assert.equal(COUPONS_ENABLED, false);
  for (const role of ROLES) assert.ok(!role.pages.includes("coupons"), role.value);
  // รายการเมนูยังมีอยู่ (ซ่อนด้วยสิทธิ์ ไม่ได้ลบทิ้ง) เพื่อให้เปิดใช้ได้ด้วยสวิตช์อย่างเดียว
  assert.ok(NAV_ITEMS.some((item) => item.id === "coupons"));
});

test("หมวดรหัส POS เป็นข้อมูลในตาราง: seed ครบ 23 หมวดตามคู่มือ v6.2, รูปแบบรหัสถูกบังคับ, ตารางปิดจากคีย์หน้าเว็บ", () => {
  assert.match(sql, /create table if not exists public\.coupon_categories/);
  assert.match(sql, /revoke all on table public\.coupon_categories from anon, authenticated;/);
  assert.match(sql, /alter table public\.coupon_categories enable row level security;/);
  const seed = sql.slice(sql.indexOf("insert into public.coupon_categories"), sql.indexOf("on conflict (prefix) do nothing;"));
  const seeded = [...seed.matchAll(/\('([A-Z]+\d+)',/g)].map((m) => m[1]);
  assert.deepEqual(seeded, ["T1", "T2", "T3", "T4", "T99", "D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10", "D99", "S1", "S2", "O1", "O2", "O3", "O4", "O9"]);
  // รูปแบบรหัสที่อนุญาต (ตัวเดียวกับ check constraint และตัวตรวจในฟังก์ชันบันทึก)
  const m = sql.match(/check \(prefix ~ '([^']+)'\)/);
  assert.ok(m, "ต้องมี check รูปแบบรหัส");
  const re = new RegExp(m[1]);
  for (const ok of ["D1", "D10", "D11", "T99", "AB12", "ABC123"]) assert.ok(re.test(ok), ok);
  for (const bad of ["", "1D", "D", "D1234", "ABCD1", "d1", "D 1", "D-1"]) assert.ok(!re.test(bad), bad);
  assert.ok((sql.match(/v_prefix !~ '\^\[A-Z\]\{1,3\}\[0-9\]\{1,3\}\$'/g) || []).length >= 1, "ฟังก์ชันบันทึกต้องตรวจรูปแบบซ้ำ");
});

test("จัดการหมวดรหัส: เฉพาะ superadmin/head_admin บันทึกได้ ทุกบทบาทที่ใช้หน้าคูปองอ่านได้ และหน้าจอไม่เขียนหมวดตายในโค้ด", () => {
  const act = edge.slice(edge.indexOf('body.action === "coupon_category_save"'));
  const block = act.slice(0, act.indexOf('body.action === "coupon_counters"'));
  assert.ok(block.indexOf("couponManageRoles.has(role)") >= 0 && block.indexOf("couponManageRoles.has(role)") < block.indexOf("coupon_category_save_v1"));
  const list = edge.slice(edge.indexOf('body.action === "coupon_categories"'), edge.indexOf('body.action === "coupon_category_save"'));
  assert.ok(list.includes("couponUseRoles.has(role)"));
  const page = read("../src/pages/CouponPage.jsx");
  assert.doesNotMatch(page, /POS_CATEGORIES/);
  assert.match(page, /categories\.filter\(\(c\) => c\.active\)/);
  assert.match(page, /tab === "categories" && canManage/);
});
