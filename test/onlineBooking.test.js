import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { bookingDates, thaiDateLabel, normalizePhone, isValidMobile, isPublicBookingHash, bangkokToday, MAX_DAYS_AHEAD, BOOKING_HOST, isBookingHost, customerBookingLink } from "../src/utils/publicBooking.js";
import { ALL_ROLES } from "../src/utils/constants.js";

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20261103120000_online_self_booking.sql");
const publicFn = read("supabase/functions/public-booking/index.ts");
const staffSession = read("supabase/functions/staff-session/index.ts");

test("วันให้เลือก: วันนี้ + 14 วัน ข้ามเดือน/ปีถูก", () => {
  const d = bookingDates("2026-12-25");
  assert.equal(d.length, MAX_DAYS_AHEAD + 1);
  assert.equal(d[0], "2026-12-25");
  assert.equal(d[7], "2027-01-01");
  assert.equal(d.at(-1), "2027-01-08");
});

test("วันที่ภาษาไทย พ.ศ.", () => {
  assert.equal(thaiDateLabel("2026-11-04"), "พ. 4 พ.ย. 2569");
});

test("วันนี้ตามเวลาไทย ไม่ใช่เวลาเครื่อง", () => {
  // 2026-11-03 18:30 UTC = 4 พ.ย. 01:30 ที่ไทย
  assert.equal(bangkokToday(new Date(Date.UTC(2026, 10, 3, 18, 30))), "2026-11-04");
});

test("เบอร์มือถือ: รับ 06/08/09 10 หลัก, +66, ขีด; ไม่รับเบอร์บ้าน/เลขซ้ำ", () => {
  assert.equal(normalizePhone("+66 81-234-5678"), "0812345678");
  assert.ok(isValidMobile("081-234-5678"));
  assert.ok(isValidMobile("0612345678"));
  assert.ok(!isValidMobile("021234567"));
  assert.ok(!isValidMobile("0000000000"));
  assert.ok(!isValidMobile("0999999999"));
  assert.ok(!isValidMobile("0899999999"));
  assert.ok(!isValidMobile("0811111111"));
  assert.ok(isValidMobile("0811111112"));
  assert.ok(!isValidMobile("08123"));
});

test("ลิงก์ #book / #book/<สาขา> เท่านั้นที่เป็นหน้าลูกค้า", () => {
  assert.ok(isPublicBookingHash("#book"));
  assert.ok(isPublicBookingHash("#book/0f5efb5c-b7d7-419a-a3c8-e9097f81a24f"));
  assert.ok(!isPublicBookingHash("#booking"));
  assert.ok(!isPublicBookingHash("#queue-table"));
  assert.ok(!isPublicBookingHash(""));
});

test("migration: ตารางปิดจากคีย์หน้าเว็บ ฟังก์ชันเรียกได้เฉพาะ service_role", () => {
  for (const t of ["online_booking_branches", "online_booking_promos", "online_booking_config", "online_booking_requests", "online_booking_log"]) {
    assert.match(migration, new RegExp(`alter table public\\.${t} enable row level security`));
  }
  assert.match(migration, /revoke all on table[\s\S]*from anon, authenticated;/);
  const revoke = migration.slice(migration.lastIndexOf("revoke all on function"));
  for (const f of ["online_booking_resolve_v1", "online_booking_branches_v1", "online_booking_catalog_v1", "online_booking_slots_v1", "online_booking_create_v1"]) {
    assert.ok(revoke.includes(`public.${f}(`), f);
  }
  assert.match(revoke, /from public, anon, authenticated;[\s\S]*to service_role;/);
});

test("migration: ใช้กติกาเตียงชุดเดียวกับ create_queue_v1 + ล็อกห้อง-วันเดียวกัน", () => {
  assert.ok(migration.includes("booking_api_candidate_rooms_v1"));
  assert.ok(migration.includes("booking_api_room_status_v1"));
  assert.ok(migration.includes("'queue-room-day:' || v_cand::text || ':' || v_date::text"));
  assert.match(migration, /c_max_days int := 14;/);
  assert.match(migration, /c_min_lead interval := interval '2 hours';/);
  assert.match(migration, /c_max_upcoming int := 2;/);
  assert.ok(migration.includes("'[จองออนไลน์]'"));
  assert.match(migration, /effective_commission_rate[\s\S]*v_request, v_dur, v_price, 0, null/);
});

test("public-booking: origin allowlist, จำกัดต่อ IP, กับดักบอท, ไม่เก็บชื่อ/เบอร์ใน log", () => {
  assert.ok(publicFn.includes('if (!isAllowedOrigin(origin)) return respond({ error: "origin_not_allowed" }, 403, origin);'));
  assert.match(publicFn, /book: \[\[5, 10\], \[20, 24 \* 60\]\]/);
  assert.ok(publicFn.includes("body.website"));
  const log = publicFn.slice(publicFn.lastIndexOf("await writeLog("));
  assert.ok(!/name|phone/.test(log.split("\n")[0]));
});

test("staff-session: ตั้งค่าจองออนไลน์ได้เฉพาะ superadmin/head_admin และบัญชีจองออนไลน์ห้ามแก้", () => {
  assert.ok(staffSession.includes('const onlineBookingRoles = new Set(["superadmin", "head_admin"]);'));
  const block = staffSession.slice(staffSession.indexOf('body?.action === "online_booking_settings"'));
  assert.ok(block.slice(0, 400).includes("onlineBookingRoles.has"));
  assert.ok(staffSession.includes('"0b0c1a55-5e1f-4b00-8000-000000000001"'));
});

test("เมนูจองออนไลน์: เฉพาะ superadmin/head_admin", () => {
  const withMenu = ALL_ROLES.filter((r) => r.pages.includes("online-booking")).map((r) => r.value).sort();
  assert.deepEqual(withMenu, ["head_admin", "superadmin"]);
});

test("โหมดเดโมสลับ onlineBookingApi เป็นตัวจำลอง (ไม่ต่อ Supabase จริง)", () => {
  const demo = read("scripts/screenshot/vite.config.js");
  assert.ok(demo.includes("utils\\/onlineBookingApi"));
  assert.ok(fs.existsSync(new URL("../scripts/screenshot/mockOnlineBookingApi.js", import.meta.url)));
});

test("ที่อยู่ลูกค้า: เปิดได้แค่หน้าจอง, ลิงก์แจกลูกค้าไม่มีที่อยู่ระบบพนักงาน, ฟังก์ชันจองรับ origin นี้", () => {
  assert.ok(isBookingHost("classclinic-booking.vercel.app"));
  assert.ok(isBookingHost("CLASSCLINIC-BOOKING.vercel.app"));
  assert.ok(!isBookingHost("qlass-gray.vercel.app"));
  assert.equal(customerBookingLink(""), `https://${BOOKING_HOST}/`);
  assert.equal(customerBookingLink("abc"), `https://${BOOKING_HOST}/#book/abc`);
  assert.ok(!customerBookingLink("abc").includes("qlass"));
  assert.ok(publicFn.includes(`const BOOKING_ORIGINS = ["https://${BOOKING_HOST}"];`));
  // ห้ามใส่ที่อยู่ลูกค้าให้ staff-session (เรียกฟังก์ชันพนักงานจากที่อยู่ลูกค้าไม่ได้)
  assert.ok(!staffSession.includes(BOOKING_HOST));
  const root = read("src/Root.jsx");
  assert.ok(root.includes("const bookingOnly = isBookingHost(window.location.hostname);"));
  assert.ok(root.includes("if (bookingOnly) return undefined;"));
});
