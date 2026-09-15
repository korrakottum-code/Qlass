import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ตาราง branches: คีย์หน้าเว็บอ่านได้อย่างเดียว
//
// นี่คือเรื่องระดับ ERROR เรื่องสุดท้ายที่ค้างอยู่ในรายการตรวจของ Supabase

const migration = readFileSync(
  new URL("../supabase/migrations/20260916090000_branches_read_only_for_browser_key.sql", import.meta.url),
  "utf8"
);

test("ต้องสร้าง policy อ่านก่อน แล้วค่อยเปิด RLS", () => {
  // สลับลำดับ = มีจังหวะที่อ่านสาขาไม่ได้ ซึ่งแปลว่าทั้งแอปใช้งานไม่ได้
  const policyAt = migration.indexOf('create policy "branches readable by app"');
  const enableAt = migration.indexOf("enable row level security");
  assert.ok(policyAt > 0 && enableAt > 0);
  assert.ok(policyAt < enableAt, "เปิด RLS ก่อนสร้าง policy อ่าน = แอปล่ม");
});

test("ถอนสิทธิ์เขียนครบทุกแบบ", () => {
  const revoke = migration.slice(migration.indexOf("revoke "));
  for (const priv of ["insert", "update", "delete", "truncate", "references", "trigger"]) {
    assert.ok(revoke.includes(priv), `ยังไม่ได้ถอนสิทธิ์ ${priv}`);
  }
  assert.match(revoke, /from anon, authenticated/);
});

test("ห้ามถอนสิทธิ์อ่าน และห้ามแตะ service_role", () => {
  const revoke = migration.slice(migration.indexOf("revoke "));
  assert.ok(!/\bselect\b/.test(revoke), "ถอนสิทธิ์อ่านไม่ได้ — ทั้งแอปอ่านสาขาตลอดเวลา");
  assert.ok(!/service_role/.test(revoke), "service_role คือทางที่ผู้ดูแลระบบใช้เขียน ห้ามแตะ");
});

test("ห้ามมีคำสั่งที่แตะข้อมูลในไฟล์นี้", () => {
  // ไฟล์นี้ควรแตะแต่สิทธิ์ ถ้ามี insert/update/delete ข้อมูลปนมา แปลว่ามีอะไรผิด
  assert.ok(!/^\s*(insert into|update public|delete from)/im.test(migration));
});

test("ต้องล้าง policy เก่าที่ไม่มีผลออกให้หมด", () => {
  for (const name of ["insert", "update", "delete"]) {
    assert.ok(migration.includes(`drop policy if exists "Allow public ${name} on branches"`),
      `ยังเหลือ policy เก่า ${name}`);
  }
});
