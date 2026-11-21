import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// จองออนไลน์: เลิกจำกัดวันล่วงหน้า (เดิมไม่เกิน 14 วัน) — เจ้าของสั่ง 21 พ.ย. 2569
// กติกาที่ต้องยังอยู่: ห้ามย้อนหลัง, ก่อนนัดอย่างน้อย 2 ชั่วโมง, เบอร์ละไม่เกิน 2 วันที่มีคิวค้าง

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20261121120000_online_booking_no_day_limit.sql");
const page = read("../src/pages/PublicBookingPage.jsx");
const utils = read("../src/utils/publicBooking.js");
const settings = read("../src/pages/OnlineBookingSettingsPage.jsx");
const manual = read("../src/manual/manualContent.js");

test("migration แก้ครบ 4 ฟังก์ชัน (slots v1/v2, create v1/v2) ทั้งตัวที่ลูกค้ารุ่นเก่ายังเรียกอยู่", () => {
  for (const name of ["online_booking_slots_v1", "online_booking_slots_v2", "online_booking_create_v1", "online_booking_create_v2"]) {
    assert.ok(migration.includes(`'${name}'`), name);
  }
});

test("migration ตัดเฉพาะเงื่อนไขเพดานวัน และล้มทั้งชุดถ้าแก้ไม่ครบ ไม่แก้เงียบ ๆ", () => {
  assert.match(migration, /c_max_days int := 14;/);
  assert.match(migration, /' or p_date > v_today \+ c_max_days'/);
  assert.match(migration, /' or v_date > v_today \+ c_max_days'/);
  assert.match(migration, /v_new = v_def or v_new like '%c_max_days%'/);
  assert.match(migration, /raise exception/);
});

test("migration ไม่แตะสิทธิ์และไม่เขียนกติกาอื่นซ้ำ (ใช้ฟังก์ชันที่รันอยู่เป็นฐาน)", () => {
  const code = migration.replace(/--.*$/gm, "");
  assert.match(code, /pg_get_functiondef\(v_oid\)/);
  assert.ok(!/\bgrant\b|\brevoke\b/i.test(code), "ไม่ต้องแตะสิทธิ์ ใช้ create or replace จึงคงของเดิม");
  assert.ok(!/c_min_lead|c_max_booked_days/.test(code), "ห้ามมีกติกา 2 ชั่วโมง/เพดานคิวค้างซ้ำในไฟล์นี้");
});

test("หน้าลูกค้า: มีช่องเลือกวันอื่น ห้ามเลือกย้อนหลัง และไม่บอกเพดาน 14 วันอีก", () => {
  assert.match(page, /type="date"/);
  assert.match(page, /min=\{today\}/);
  assert.match(page, /e\.target\.value >= today/);
  assert.ok(!/ไม่เกิน 14 วัน|ถึง 14 วัน/.test(page), "ข้อความเพดาน 14 วันต้องหมดจากหน้าลูกค้า");
  assert.match(page, /OUTSIDE_BOOKING_WINDOW: "[^"]*อย่างน้อย 2 ชั่วโมงค่ะ"/);
});

test("ปุ่มลัด 14 วันยังอยู่ แต่เป็นแค่ปุ่มลัด ไม่ใช่เพดาน", () => {
  assert.match(utils, /export const QUICK_PICK_DAYS = 14;/);
  assert.ok(!/MAX_DAYS_AHEAD/.test(utils + page));
});

test("หน้าตั้งค่าและคู่มือบอกตรงกับของจริง และเตือนเรื่องวันหยุดต้องตั้งล่วงหน้า", () => {
  assert.match(settings, /จองล่วงหน้าได้ไม่จำกัดวัน/);
  assert.ok(!/ไม่เกิน 14 วัน/.test(settings));
  assert.match(manual, /จองล่วงหน้าได้ไม่จำกัดวัน/);
  assert.match(manual, /ตารางห้อง\/เครื่อง/);
});
