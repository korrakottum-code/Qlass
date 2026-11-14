import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { MAX_COUPONS, COUPON_COUNTS, couponMinutes } from "../src/utils/publicBooking.js";

// จองออนไลน์: เลือกคูปอง 1–3 ใบ ล็อกเวลาตามจำนวนใบ (เจ้าของสั่ง 14 พ.ย. 2569)
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20261114120000_online_booking_coupon_count.sql");
const original = read("../supabase/migrations/20261103120000_online_self_booking.sql");
const fn = read("../supabase/functions/public-booking/index.ts");
const page = read("../src/pages/PublicBookingPage.jsx");
const api = read("../src/utils/onlineBookingApi.js");
const mock = read("../scripts/screenshot/mockOnlineBookingApi.js");

const body = (sql, name) => {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, name);
  return sql.slice(start, sql.indexOf("\n$$;", start));
};

test("เวลา = เวลาหัตถการเต็ม × จำนวนใบ, สูงสุด 3 ใบ", () => {
  assert.equal(MAX_COUPONS, 3);
  assert.deepEqual(COUPON_COUNTS, [1, 2, 3]);
  assert.equal(couponMinutes({ duration_minutes: 30 }, 3), 90);
  assert.equal(couponMinutes({ duration_minutes: 40 }, 2), 80);
  assert.equal(couponMinutes(null, 2), 0);
});

test("migration: เพิ่มแค่ v2 ไม่แตะ v1 (หน้าจองเก่าในเครื่องลูกค้ายังใช้ได้)", () => {
  assert.doesNotMatch(migration, /function public\.online_booking_(slots|create)_v1\(/);
  assert.doesNotMatch(migration, /^\s*drop function/im);
  for (const f of ["online_booking_slots_v2", "online_booking_create_v2"]) {
    const b = body(migration, f);
    assert.match(b, /c_max_count int := 3;/, f);
    assert.match(b, /p_count < 1 or p_count > c_max_count then raise exception 'INVALID_COUNT'/, f);
    assert.match(b, /r\.dur \* p_count/, f);
  }
});

test("migration: create_v2 = create_v1 ทุกกติกา ต่างแค่จำนวนใบ", () => {
  const v1 = body(original, "online_booking_create_v1");
  const v2 = body(migration, "online_booking_create_v2");
  // บรรทัดกติกาเดิมต้องอยู่ครบ (เตียง, ล็อก, 2 ชม., 14 วัน, 2 คิว/เบอร์, กันกดซ้ำ, audit)
  const mustKeep = [
    "c_min_lead interval := interval '2 hours';", "c_max_days int := 14;", "c_max_upcoming int := 2;",
    "booking_api_candidate_rooms_v1(p_branch_id, v_proc)", "booking_api_room_status_v1(v_cand, v_date, v_block, v_dur) = 'ok'",
    "'queue-room-day:' || v_cand::text || ':' || v_date::text", "'online-booking-phone:' || v_digits",
    "'online-booking-ref:' || v_ref", "if v_upcoming >= c_max_upcoming then", "'TOO_MANY_BOOKINGS'",
    "v_request, v_dur, v_price, 0, null", "'online_booking', v_request", "insert into public.online_booking_requests",
  ];
  for (const line of mustKeep) {
    assert.ok(v1.includes(line), `v1 มี: ${line}`);
    assert.ok(v2.includes(line), `v2 ต้องมี: ${line}`);
  }
  // ราคา = ราคาโปร 1 ใบ เหมือนเดิม (ไม่เปลี่ยนรายงาน)
  assert.match(v2, /v_name, v_digits, p_branch_id, v_proc, v_promo, v_price,/);
  // หมายเหตุบอกจำนวนใบให้หน้าร้านเห็น, กดซ้ำด้วยจำนวนใบต่างกัน ≠ คำขอเดิม
  assert.ok(v2.includes("' คูปอง ' || p_count || ' ใบ'"));
  assert.ok(v2.includes("'count:' || p_count::text"));
});

test("migration: v2 เรียกได้เฉพาะ service_role", () => {
  const revoke = migration.slice(migration.lastIndexOf("revoke all on function"));
  assert.ok(revoke.includes("public.online_booking_slots_v2(uuid, uuid, date, int)"));
  assert.ok(revoke.includes("public.online_booking_create_v2(text, uuid, uuid, timestamptz, text, text, text, text, int)"));
  assert.match(revoke, /from public, anon, authenticated;[\s\S]*to service_role;/);
});

test("public-booking: ไม่ส่ง count = v1 เดิม, ส่ง count ต้อง 1–3 ไม่งั้น INVALID_COUNT", () => {
  assert.match(fn, /const MAX_COUPONS = 3;/);
  assert.match(fn, /if \(value === undefined \|\| value === null\) return null;/);
  assert.match(fn, /Number\.isInteger\(value\)/);
  assert.match(fn, /count === null\s*\? await supabase\.rpc\("online_booking_slots_v1"/);
  assert.match(fn, /: await supabase\.rpc\("online_booking_slots_v2", \{[^}]*p_count: count \}\)/);
  assert.match(fn, /count === null\s*\? await supabase\.rpc\("online_booking_create_v1", args\)/);
  assert.match(fn, /: await supabase\.rpc\("online_booking_create_v2", \{ \.\.\.args, p_count: count \}\)/);
  assert.ok(fn.includes('"INVALID_COUNT"'));
});

test("หน้าจอง: ส่งจำนวนใบทั้งดูเวลาว่างและตอนจอง, หมายเหตุไม่ให้ใส่จำนวนคูปองแล้ว", () => {
  assert.match(api, /callPublic\(\{ action: "slots", branchId, promoId, date, count \}\)/);
  assert.match(page, /fetchPublicSlots\(branchId, promoId, date, couponCount\)/);
  assert.match(page, /\[branchId, promoId, date, couponCount\]/);
  assert.match(page, /count: couponCount,/);
  assert.match(page, /COUPON_COUNTS\.map/);
  assert.ok(page.includes("ระบบไม่ได้จองเวลาไว้ให้"));
  assert.ok(!page.includes("ให้ระบุรายละเอียดโปรแกรมและจำนวนคูปอง"));
  // เปลี่ยนบริการ/สาขา = กลับเป็น 1 ใบ
  assert.match(page, /setPromoId\(id\); setCouponCount\(1\);/);
  assert.match(page, /setPromoId\(""\); setCouponCount\(1\);/);
});

test("โหมดเดโม: ตัวจำลองใช้เวลาตามจำนวนใบเหมือนเซิร์ฟเวอร์", () => {
  assert.match(mock, /const dur = proc\.blocks \* count;/);
  assert.match(mock, /fail\("INVALID_COUNT"\)/);
});

test("กันคนเดียวกันจองเวลาทับกันเอง (คนละเตียง) — ตรวจหลังล็อกเบอร์ ก่อนเลือกเตียง", () => {
  const v2 = body(migration, "online_booking_create_v2");
  const lockAt = v2.indexOf("'online-booking-phone:' || v_digits");
  const clashAt = v2.indexOf("'CUSTOMER_TIME_CONFLICT'");
  const roomAt = v2.indexOf("for v_cand in select");
  assert.ok(lockAt > 0 && clashAt > lockAt && roomAt > clashAt);
  assert.match(v2, /where q\.phone = v_digits and q\.date = v_date/);
  assert.match(v2, /coalesce\(q\.status, 'pending'\) not in \('cancelled', 'no_show', 'rescheduled'\)/);
  assert.match(v2, /v_block < q\.time_block \+ coalesce\(q\.duration_blocks, qp\.blocks, 1\)\s+and q\.time_block < v_block \+ v_dur/);
  // ไม่ได้กรองเฉพาะคิวจองออนไลน์ — คิวที่หน้าร้านลงให้ก็นับ
  const clashQuery = v2.slice(v2.indexOf("into v_clash"), clashAt);
  assert.ok(!clashQuery.includes("recorded_by"));
  assert.match(fn, /data\?\.error_code === "CUSTOMER_TIME_CONFLICT"/);
  assert.match(api, /err\.conflict = conflict;/);
  assert.match(page, /errorText\(err\.code, err\.conflict[,)]/);
  assert.match(page, /err\.code === "CUSTOMER_TIME_CONFLICT"( \|\| err\.code === "[A-Z_]+")*\) \{ setStartTime\(""\); loadSlots\(\); \}/);
  assert.match(mock, /"CUSTOMER_TIME_CONFLICT"/);
});

test("จองไม่ผ่านเพราะเวลา: เหตุผลแสดงที่การ์ดวันและเวลา (การ์ดยืนยันหายเมื่อเวลาถูกล้าง)", () => {
  assert.match(page, /\{submitError && !slot && <div style=\{S\.error\}>\{submitError\}<\/div>\}/);
  assert.match(page, /setStartTime\(s\.start_time\); setSubmitError\(""\);/);
});

test("ข้อความถึงลูกค้าไม่บอกว่าตรวจจากเบอร์ (กันเปลี่ยนเบอร์จองหลบ)", () => {
  const messages = page.slice(page.indexOf("const ERROR_TEXT"), page.indexOf("// LINE OA"));
  assert.ok(!messages.includes("เบอร์นี้"));
  assert.ok(messages.includes("คุณลูกค้ามี"));
});

test("เวลาจบ: บวกนาทีข้ามชั่วโมงถูก, ค่าเสียไม่พัง", async () => {
  const { addMinutes } = await import("../src/utils/publicBooking.js");
  assert.equal(addMinutes("15:00", 60), "16:00");
  assert.equal(addMinutes("14:30", 90), "16:00");
  assert.equal(addMinutes("19:30", 45), "20:15");
  assert.equal(addMinutes("09:05", 0), "09:05");
  assert.equal(addMinutes("", 30), "");
  assert.equal(addMinutes(undefined, 30), "");
});

test("หน้าจอง: แสดงช่วงเวลาที่จอง (เริ่ม–จบ) ใต้ช่องเวลาและในสรุป", () => {
  assert.match(page, /จองเวลา <b>\{slot\.time\}–\{addMinutes\(slot\.time, couponMinutes\(service, couponCount\)\)\} น\.<\/b>/);
  assert.match(page, /เวลา \{slot\.time\}–\{addMinutes\(slot\.time, couponMinutes\(service, couponCount\)\)\} น\./);
  assert.ok(page.includes("เวลาบนปุ่มคือเวลาเริ่ม"));
});
