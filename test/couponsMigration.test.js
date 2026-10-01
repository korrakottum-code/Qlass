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

// ── แก้ข้อมูลล็อต / ลบล็อต (migration 20260930120000) ──
const batchSql = read("../supabase/migrations/20260930120000_coupon_batch_edit_delete.sql").replace(/^\s*--.*$/gm, "");

test("แก้/ลบล็อต: ฟังก์ชันและตารางบันทึกปิดจากคีย์หน้าเว็บ เปิดให้ service_role เท่านั้น", () => {
  assert.match(batchSql, /alter table public\.coupon_batch_log enable row level security;/i);
  assert.match(batchSql, /revoke all on table public\.coupon_batch_log from anon, authenticated;/i);
  assert.doesNotMatch(batchSql, /create policy/i);
  const fns = [...batchSql.matchAll(/create or replace function public\.(coupon_\w+_v1)\(/gi)].map((m) => m[1]);
  assert.deepEqual(fns.sort(), ["coupon_batch_delete_v1", "coupon_batch_update_v1"]);
  for (const fn of fns) assert.match(batchSql, new RegExp(String.raw`revoke all on function[\s\S]*public\.${fn}\([\s\S]*from public, anon, authenticated;`, "i"), fn);
  assert.match(batchSql, /grant execute on function[\s\S]*to service_role;/i);
});

test("ลบล็อต: ต้องเป็นล็อตท้ายสุดของหมวด ไม่มีการใช้/ประวัติ ล็อกตัวนับก่อน และถอยตัวนับไปก่อนล็อตนั้น", () => {
  const body = batchSql.slice(batchSql.indexOf("function public.coupon_batch_delete_v1"));
  // ล็อกล็อต → ล็อกตัวนับ → ล็อกแถวคูปอง แล้วค่อยตรวจ/ลบ (ลำดับเดียวกับออกล็อตที่ล็อกตัวนับก่อนเสมอ ไม่เกิด deadlock)
  const order = ["from public.coupon_batches where id = p_batch_id for update", "from public.coupon_counters where prefix = b.prefix for update", "from public.coupons where batch_id = b.id for update", "raise exception 'batch_has_used'", "delete from public.coupons", "update public.coupon_counters set last_no = b.first_no - 1"].map((s) => body.indexOf(s));
  assert.ok(order.every((n) => n >= 0), "ต้องมีครบทุกขั้น: " + order.join(","));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.match(body, /k\.last_no <> b\.last_no then raise exception 'batch_not_latest'/);
  // ประวัติการตัด (แม้ย้อนแล้ว) ก็ห้ามลบ ไม่งั้นชน FK และประวัติหาย
  assert.match(body, /coupon_redemptions r join public\.coupons c/);
  assert.match(body, /insert into public\.coupon_batch_log/);
});

test("แก้ข้อมูลล็อต: ใบเดียวถูกใช้ = ปฏิเสธทั้งล็อต ตรวจค่าเหมือนตอนออกล็อต และไม่แตะรหัส/จำนวน/สถานะยกเลิก", () => {
  const body = batchSql.slice(batchSql.indexOf("function public.coupon_batch_update_v1"), batchSql.indexOf("function public.coupon_batch_delete_v1"));
  assert.ok(body.indexOf("for update") < body.indexOf("raise exception 'batch_has_used'"));
  for (const code of ["invalid_name", "invalid_price", "invalid_expiry", "batch_not_found"]) assert.ok(body.includes(`'${code}'`), code);
  const upd = body.match(/update public\.coupons\s+set ([^;]+?)\s+where batch_id/);
  assert.ok(upd, "ต้องมี update คูปองทั้งล็อต");
  for (const col of ["code", "used_count", "cancelled_at", "total_uses", "batch_id"]) assert.doesNotMatch(upd[1], new RegExp(`\b${col}\b`), col);
});

test("edge function: แก้/ลบล็อตเฉพาะ superadmin+head_admin และรหัสผิดพลาดตอบ 409 ไม่ใช่ 500", () => {
  for (const action of ["coupon_batch_update", "coupon_batch_delete"]) {
    const act = edge.slice(edge.indexOf(`body.action === "${action}"`));
    const block = act.slice(0, act.indexOf("\n      }\n"));
    assert.ok(block.indexOf("couponManageRoles.has(role)") >= 0 && block.indexOf("couponManageRoles.has(role)") < block.indexOf("supabase.rpc"), action);
  }
  assert.match(edge, /"batch_has_used", "batch_not_latest"/);
});

test("หน้าคูปอง: ปุ่มลบล็อตโชว์เฉพาะล็อตท้ายสุดของหมวด และลบต้องพิมพ์เลข 3 ตัวท้ายยืนยัน", () => {
  const page = read("../src/pages/CouponPage.jsx");
  assert.match(page, /latestOfPrefix\[x\.prefix\] === x\.id/);
  const fn = page.slice(page.indexOf("function handleDeleteBatch"), page.indexOf("// เพิ่ม/แก้ชื่อ/เปิด-ปิดหมวดรหัส"));
  assert.match(fn, /askDigits\(/);
  assert.match(fn, /expect: last3\(x\.lastCode\)/);
  assert.doesNotMatch(fn, /window\.confirm/);
});

// ── แก้/ลบล็อตเมื่อประวัติทั้งหมดถูกย้อนแล้ว (migration 20260930140000) ──
const revSql = read("../supabase/migrations/20260930140000_coupon_batch_reverted_history.sql").replace(/^\s*--.*$/gm, "");

test("ลบ/แก้ล็อต: ประวัติที่ย้อนแล้วไม่ขวาง แต่ประวัติที่ยังใช้อยู่ขวาง และสิทธิ์ยังปิดจากคีย์หน้าเว็บ", () => {
  const fns = [...revSql.matchAll(/create or replace function public\.(coupon_\w+_v1)\(/gi)].map((m) => m[1]).sort();
  assert.deepEqual(fns, ["coupon_batch_delete_v1", "coupon_batch_update_v1"]);
  assert.equal((revSql.match(/r\.reverted_at is null/g) || []).length, 2, "ทั้งสองฟังก์ชันต้องขวางเฉพาะประวัติที่ยังไม่ถูกย้อน");
  assert.match(revSql, /used_count > 0/);
  assert.match(revSql, /revoke all on function[\s\S]*from public, anon, authenticated;/i);
  assert.match(revSql, /grant execute on function[\s\S]*to service_role;/i);
  assert.doesNotMatch(revSql, /create policy|alter table|drop /i);
});

test("ลบล็อต: เก็บสำเนาประวัติที่ย้อนแล้วลงบันทึกก่อนลบ และลบแถวประวัติก่อนคูปอง (FK restrict)", () => {
  const body = revSql.slice(revSql.indexOf("function public.coupon_batch_delete_v1"));
  const order = ["raise exception 'batch_not_latest'", "raise exception 'batch_has_used'", "into v_history", "delete from public.coupon_redemptions", "delete from public.coupons where batch_id", "update public.coupon_counters set last_no = b.first_no - 1", "insert into public.coupon_batch_log"].map((s) => body.indexOf(s));
  assert.ok(order.every((n) => n >= 0), order.join(","));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.match(body, /'redemptions', v_history/);
});

// ── ประวัติการทำรายการ (migration 20260930150000) ──
const auditSql = read("../supabase/migrations/20260930150000_coupon_audit_log.sql").replace(/^\s*--.*$/gm, "");

test("ประวัติคูปอง: ตารางปิดจากคีย์หน้าเว็บ ฟังก์ชันเปิดให้ service_role เท่านั้น และไม่ drop/alter ของเดิม", () => {
  assert.match(auditSql, /alter table public\.coupon_audit_log enable row level security;/i);
  assert.match(auditSql, /revoke all on table public\.coupon_audit_log from anon, authenticated;/i);
  assert.doesNotMatch(auditSql, /create policy|drop |alter table public\.(coupons|coupon_redemptions|coupon_batches|coupon_counters|coupon_categories)\b|truncate|delete from/i);
  const fns = [...auditSql.matchAll(/create or replace function public\.(coupon_\w+_v1)\(/gi)].map((m) => m[1]).sort();
  assert.deepEqual(fns, ["coupon_audit_v1", "coupon_audit_write_v1"]);
  assert.match(auditSql, /revoke all on function[\s\S]*from public, anon, authenticated;/i);
  assert.match(auditSql, /grant execute on function[\s\S]*to service_role;/i);
});

test("ประวัติคูปอง: อ่านรวม 4 แหล่ง แบ่งหน้าแบบจำกัดแหล่งละ offset+limit+1 และจำกัด limit ไม่เกิน 200", () => {
  const body = auditSql.slice(auditSql.indexOf("function public.coupon_audit_v1"));
  for (const src of ["from public.coupon_audit_log", "from public.coupon_batch_log", "from public.coupon_redemptions r join public.coupons c"]) {
    assert.ok(body.includes(src), src);
  }
  assert.equal((body.match(/union all/g) || []).length, 3);
  assert.equal((body.match(/limit v_take/g) || []).length, 4);
  assert.match(body, /least\(greatest\(coalesce\(p_limit, 50\), 1\), 200\)/);
});

test("edge function: ทุกรายการที่แก้ข้อมูลคูปองเขียนประวัติหลังสำเร็จ และเขียนพลาดไม่ทำให้รายการหลักพัง", () => {
  const helper = edge.slice(edge.indexOf("const audit = async"), edge.indexOf('if (body.action === "coupon_lookup")'));
  assert.match(helper, /try \{/);
  assert.match(helper, /catch \(err\)/);
  assert.doesNotMatch(helper, /throw|return response/);
  const cases = [
    ['body.action === "coupon_cancel")', 'audit(body.cancel !== false ? "coupon_cancel"'],
    ['body.action === "coupon_cancel_batch")', 'audit(body.cancel !== false ? "batch_cancel"'],
    ['body.action === "coupon_category_save")', 'audit(c.create === true ? "category_create"'],
    ['body.action === "coupon_generate")', 'audit("generate"'],
  ];
  for (const [start, call] of cases) {
    const act = edge.slice(edge.indexOf(start));
    const block = act.slice(0, act.indexOf("\n      }\n"));
    assert.ok(block.includes(call), start);
    // เขียนประวัติต้องมาหลังรายการหลักสำเร็จ (หลังเช็ค error) เท่านั้น
    assert.ok(block.indexOf("if (error) return fail(error)") < block.indexOf("await audit("), start);
  }
});

test("edge function: อ่านประวัติได้เฉพาะ superadmin/head_admin/admin และตัวกรองประเภทต้องอยู่ในรายการที่รู้จัก", () => {
  const act = edge.slice(edge.indexOf('body.action === "coupon_audit")'));
  const block = act.slice(0, act.indexOf("\n      }\n"));
  assert.ok(block.indexOf("couponStatsRoles.has(role)") >= 0 && block.indexOf("couponStatsRoles.has(role)") < block.indexOf("supabase.rpc"));
  assert.match(block, /known\.includes\(action\)/);
  assert.match(block, /Math\.min\(Math\.max\(body\.limit, 1\), 200\)/);
});

test("หน้าคูปอง: แท็บประวัติเฉพาะผู้ที่ดูสถิติได้ และกันผลโหลดเก่าทับผลใหม่", () => {
  const page = read("../src/pages/CouponPage.jsx");
  assert.match(page, /canStats \? \[\["stats", "📊 สถิติ"\], \["audit", "🧾 ประวัติ"\]\]/);
  assert.match(page, /tab === "audit" && canStats && <AuditView/);
  const view = page.slice(page.indexOf("function AuditView"), page.indexOf("function CategoriesView"));
  assert.match(view, /reqId\.current/);
  assert.match(view, /if \(id !== reqId\.current\) return;/);
});
