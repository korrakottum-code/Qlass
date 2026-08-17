import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (name) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");
const col = read("20260817200000_room_schedules_source.sql");
const pub = read("20260817201000_realtime_publish_room_tables.sql");
const service = readFileSync(new URL("../src/utils/supabaseService.js", import.meta.url), "utf8");

test("คอลัมน์ source เป็น nullable text ไม่มี default — แถวเดิมไม่ถูกแตะ", () => {
  assert.match(col, /add column if not exists source text/i);
  assert.doesNotMatch(col, /source text[^;]*default/i);
  assert.doesNotMatch(col, /not null/i);
});

test("มี check จำกัดค่า และ unique index บางส่วนกัน race", () => {
  assert.match(col, /check \(source is null or source in \('bed_switch'\)\)/i);
  assert.match(col, /create unique index if not exists room_schedules_bed_switch_one_per_day\s+on public\.room_schedules \(room_id, date\)\s+where source = 'bed_switch'/i);
});

test("publication เพิ่มทั้งสองตารางแบบ idempotent และไม่แตะ replica identity", () => {
  assert.match(pub, /if not exists[\s\S]*tablename = 'room_procedures'[\s\S]*add table public\.room_procedures/i);
  assert.match(pub, /if not exists[\s\S]*tablename = 'room_schedules'[\s\S]*add table public\.room_schedules/i);
  // ห้ามมีคำสั่งเปลี่ยน replica identity (จะล็อก AccessExclusive โดยไม่จำเป็น) — เอ่ยถึงใน comment ได้
  assert.doesNotMatch(pub, /alter table[^;]*replica identity/i);
});

test("createRoomSchedule ส่ง source เฉพาะเมื่อมีค่า — payload ของ ScheduleModal เดิมไม่เปลี่ยน", () => {
  // ถ้าใครเปลี่ยนเป็น `source: schedule.source ?? null` การบันทึกตารางเดิมจะพังทันทีที่ migration ยังไม่ลง
  assert.match(service, /\.\.\.\(schedule\.source \? \{ source: schedule\.source \} : \{\}\)/);
});

test("deleteBedSwitchClosures กรองครบทั้ง tuple ที่ DB ไม่ใช่แค่ source", () => {
  const fn = service.slice(service.indexOf("export async function deleteBedSwitchClosures"));
  const body = fn.slice(0, fn.indexOf("\n}\n"));
  assert.match(body, /\.eq\("room_id", roomId\)/);
  assert.match(body, /\.eq\("date", date\)/);
  assert.match(body, /\.eq\("source", "bed_switch"\)/);
  assert.match(body, /\.eq\("available", false\)/);
  assert.match(body, /\.is\("start_block", null\)/);
  assert.match(body, /\.is\("end_block", null\)/);
});
