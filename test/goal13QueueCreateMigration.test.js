import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

// ไฟล์ 20260724192700 เป็น "ของเดิมตอนติดตั้งครั้งแรก" (2 ส.ค. 2569) เก็บไว้เป็นประวัติ
// ห้ามแก้ย้อนหลัง เพราะสคริปต์ติดตั้งตรวจ checksum ของไฟล์นี้
// (scripts/goal13_apply_production_function.py) — การแก้ฟังก์ชันทำด้วยไฟล์ migration ใหม่
const original = read("../supabase/migrations/20260724192700_goal13_create_queue_v1.sql");
// ไฟล์ล่าสุดที่นิยามฟังก์ชัน = กติกาที่ใช้จริงตอนนี้
const current = read("../supabase/migrations/20260913100000_create_queue_v1_rescheduled_frees_slot.sql");

test("ไฟล์ติดตั้งครั้งแรกต้องคงเดิม (สคริปต์ติดตั้งตรวจ checksum ไฟล์นี้)", () => {
  assert.match(original, /security definer\s+set search_path = ''/i);
  assert.match(original, /coalesce\(v_duration, 0\) < 1/i);
  assert.match(original, /revoke all on function public\.create_queue_v1\([^)]*jsonb\) from public, anon, authenticated/i);
  // กติกาห้องของวันนั้น — ตอนนี้ล้าสมัยแล้ว ดูเทสต์ถัดไปสำหรับกติกาที่ใช้จริง
  assert.match(original, /q\.status not in \('cancelled', 'no_show'\)/i);
});

test("กติกาห้องที่ใช้จริงต้องตรงกับฝั่งแอป", () => {
  // 6 ส.ค. 2569 ฝั่งแอปเพิ่ม 'rescheduled' เข้าไปในสถานะที่ไม่กินช่องเวลา แต่ฝั่งเซิร์ฟเวอร์
  // ไม่ได้ตามไปแก้ ผลคือแอดมินเห็นช่องว่างแต่ลงคิวไม่ได้ เจอจริง 43 ช่องใน 17 สาขา
  // เทสต์ตัวเก่าที่ตรึงรายการสองสถานะไว้ กลายเป็นตัวช่วยให้ความไม่ตรงกันนี้หลุดไปได้
  assert.match(current, /q\.status not in \('cancelled', 'no_show', 'rescheduled'\)/i,
    "ฝั่งเซิร์ฟเวอร์ต้องนับ 3 สถานะนี้ว่าไม่กินช่องเวลา");

  const helpers = read("../src/utils/helpers.js");
  assert.match(helpers, /INACTIVE_QUEUE_STATUSES = \["cancelled", "no_show", "rescheduled"\]/,
    "ฝั่งแอปต้องเป็นชุดเดียวกัน");

  const service = read("../src/utils/supabaseService.js");
  assert.match(service, /not\("status", "in", "\(cancelled,no_show,rescheduled\)"\)/,
    "การเช็คคิวสดก่อนบันทึกต้องเป็นชุดเดียวกัน");
});

test("'rescheduled_in' ต้องยังกินช่องเวลา — เป็นคิวจริงที่ปลายทาง", () => {
  // ถ้าหลุดเข้าไปในรายการด้วย คู่แฝดเก่า 508 คู่จะเปิดช่องให้จองทับคิวจริงทันที
  assert.ok(!/'rescheduled_in'/.test(current.split("q.status not in")[1]?.slice(0, 200) || ""));
});
