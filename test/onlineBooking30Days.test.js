import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MAX_DAYS_AHEAD } from "../src/utils/publicBooking.js";

// จองออนไลน์: ขยายวันล่วงหน้าจาก 14 เป็น 30 วัน — เจ้าของสั่ง 21 พ.ย. 2569
// ค่า 30 ต้องตรงกันทั้งฐานข้อมูล หน้าลูกค้า ข้อความ และคู่มือ ไม่งั้นลูกค้าเลือกวันได้แต่ระบบปฏิเสธ

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20261121120000_online_booking_30_days.sql");
const page = read("../src/pages/PublicBookingPage.jsx");
const settings = read("../src/pages/OnlineBookingSettingsPage.jsx");
const manual = read("../src/manual/manualContent.js");

test("ค่าฝั่งหน้าจอเป็น 30 และหน้าจอไม่เหลือข้อความ 14 วัน", () => {
  assert.equal(MAX_DAYS_AHEAD, 30);
  assert.ok(!/14 วัน/.test(page + settings), "ข้อความ 14 วันต้องหมดจากหน้าลูกค้าและหน้าตั้งค่า");
  assert.match(page, /ล่วงหน้าได้ไม่เกิน 30 วันค่ะ/);
  assert.match(page, /จองล่วงหน้าได้ 2 ชั่วโมง ถึง 30 วันค่ะ/);
  assert.match(settings, /จองได้ล่วงหน้าไม่เกิน 30 วัน/);
  assert.match(manual, /จองได้ล่วงหน้าไม่เกิน 30 วัน/);
});

test("migration เปลี่ยนค่าคงที่ 14 เป็น 30 ครบ 4 ฟังก์ชัน ทั้งตัวที่หน้ารุ่นเก่ายังเรียกอยู่", () => {
  for (const name of ["online_booking_slots_v1", "online_booking_slots_v2", "online_booking_create_v1", "online_booking_create_v2"]) {
    assert.ok(migration.includes(`'${name}'`), name);
  }
  assert.match(migration, /replace\(v_def, 'c_max_days int := 14;', 'c_max_days int := 30;'\)/);
});

test("migration ล้มทั้งชุดถ้าแก้ไม่ครบ และรันซ้ำได้", () => {
  assert.match(migration, /v_new = v_def or v_new not like '%c_max_days int := 30;%'/);
  assert.match(migration, /raise exception/);
  assert.match(migration, /if v_def like '%c_max_days int := 30;%' then\s+continue;/);
});

test("migration ไม่แตะสิทธิ์และไม่เขียนกติกาอื่นซ้ำ (ใช้ฟังก์ชันที่รันอยู่เป็นฐาน)", () => {
  const code = migration.replace(/--.*$/gm, "");
  assert.match(code, /pg_get_functiondef\(v_oid\)/);
  assert.ok(!/\bgrant\b|\brevoke\b/i.test(code));
  assert.ok(!/c_min_lead|c_max_booked_days/.test(code));
});
