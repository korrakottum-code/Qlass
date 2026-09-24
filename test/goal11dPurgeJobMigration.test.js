import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

// ตัวลบข้อมูล client_diagnostics เก่า — ขั้นที่ 1 ก่อนเปิดสวิตช์เก็บ error จากเครื่องพนักงาน (25 ก.ย. 2569)
// ลงบนโปรดักชันแล้วเป็นเวอร์ชัน 20260924175906 ตรวจแล้ว: งานอยู่ครบ, anon/authenticated เข้าตารางงานไม่ได้
// (permission denied for schema cron), คำสั่งลบทดสอบกับแถวปลอม 4 แถวได้ผลตรงตามคาด
// เทสต์นี้กันไม่ให้ใครแก้ตัวลบให้กว้างขึ้นหรือชี้ไปตารางอื่นโดยไม่ตั้งใจ

const dir = new URL("../supabase/migrations/", import.meta.url);
const file = readdirSync(dir).find((f) => f.endsWith("_goal11d_client_diagnostics_purge_job.sql"));
const sql = file ? readFileSync(new URL(file, dir), "utf8") : "";
// ตัดคอมเมนต์ออกก่อน จะได้ตรวจเฉพาะ SQL ที่รันจริง
const code = sql.replace(/^\s*--.*$/gm, "");

test("ไฟล์ migration ใช้เลขเวอร์ชันเดียวกับที่บันทึกไว้บนโปรดักชัน", () => {
  assert.equal(file, "20260924175906_goal11d_client_diagnostics_purge_job.sql");
});

test("ติดตั้ง pg_cron ใน pg_catalog (ไม่ใช่ public — ตัวตรวจของ Supabase จะเตือน extension_in_public)", () => {
  assert.match(code, /create extension if not exists pg_cron with schema pg_catalog;/i);
});

test("งานชื่อเดียวกับที่คู่มือ rollback ระบุไว้ และรันทุกชั่วโมง", () => {
  assert.match(code, /'goal11d_purge_expired_client_diagnostics'/);
  assert.match(code, /'17 \* \* \* \*'/);
});

test("ลบเฉพาะตาราง client_diagnostics เฉพาะแถวที่เก่ากว่า 14 วันตาม created_at", () => {
  const commands = code.match(/delete from [^\n$]+/gi) ?? [];
  assert.equal(commands.length, 1, "ต้องมีคำสั่งลบเดียว");
  assert.match(commands[0], /^delete from public\.client_diagnostics where created_at < now\(\) - interval '14 days'$/i);
});

test("ไม่มีอะไรที่แตะตารางธุรกิจหรือทำลายข้อมูล", () => {
  assert.ok(!/\b(truncate|drop|alter|grant)\b/i.test(code), "ห้ามมี truncate/drop/alter/grant");
  assert.ok(!/public\.(queues|staff|hn_customers|branches|rooms|procedures|promos|room_schedules|activity_logs)\b/i.test(code));
  // ตารางบนโปรดักชันไม่มี expires_at (สร้างจาก 20260913080000) ห้ามอ้างถึง ไม่งั้นงานจะพังเงียบ ๆ ทุกชั่วโมง
  assert.ok(!/expires_at/i.test(code));
});
