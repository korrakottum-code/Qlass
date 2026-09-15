import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// รหัสอ้างอิงเดิม + ข้อมูลเปลี่ยน = ปฏิเสธ ทั้งสองทาง และบอกให้ถูกว่าต้องทำอะไรต่อ
//
// 20260913090000 ปิดทางหลักไปแล้ว แต่ปลายฟังก์ชันยังมีทางสำรอง (exception unique_violation)
// ที่คืนใบเดิมกลับโดยไม่เทียบข้อมูลเลย — รูเดียวกันเป๊ะ แค่เกิดยากกว่า
//
// อีกเรื่องคือของเดิมใช้รหัส invalid_queue_payload ร่วมกับอีกหลายกรณี หน้าจอจึงบอกให้
// "ตรวจสอบฟอร์ม" ซึ่งชวนให้กดบันทึกใหม่ ทั้งที่คิวลงไปแล้ว กดใหม่จะได้สองคิว

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20260916080000_create_queue_v1_stale_request_guard.sql");
const edge = read("../supabase/functions/staff-session/index.ts");
const gate = read("../src/utils/queueCreateGate.js");

test("ทางสำรอง (unique_violation) ต้องมีด่านเทียบข้อมูลด้วย", () => {
  const fallback = migration.slice(migration.indexOf("when unique_violation then"));
  assert.match(fallback, /queue_payload_unchanged\(v_existing, p_payload\)/,
    "ทางสำรองยังคืนใบเดิมโดยไม่เทียบข้อมูล");
  assert.match(fallback, /message = 'request_id_stale'/);
});

test("ทั้งสองทางต้องเรียกฟังก์ชันเทียบตัวเดียวกัน ไม่ใช่ก๊อปเงื่อนไขไว้คนละที่", () => {
  // ถ้าแยกกันเขียน วันหนึ่งจะแก้ที่เดียวแล้วอีกที่ค้างของเก่า แบบที่เคยเกิดกับกติกาสถานะ
  const calls = migration.match(/public\.queue_payload_unchanged\(v_existing, p_payload\)/g) || [];
  assert.equal(calls.length, 2, "ต้องเรียกจากสองทาง");
  assert.ok(!/v_existing\.name is distinct from/.test(migration),
    "ห้ามเหลือเงื่อนไขเทียบแบบเขียนสดในฟังก์ชันหลัก");
});

test("ฟังก์ชันเทียบต้องเช็คครบทุกช่องเหมือนเดิม ไม่ผ่อนลง", () => {
  const helper = migration.slice(
    migration.indexOf("create or replace function public.queue_payload_unchanged"),
    migration.indexOf("$fn$;")
  );
  for (const field of ["name", "phone", "branch_id", "room_id", "procedure_id", "promo_id",
    "date", "time_block", "price", "customer_type", "note", "duration_blocks"]) {
    assert.ok(helper.includes(`'${field}'`), `ขาดการเทียบช่อง ${field}`);
  }
  assert.match(helper, /set search_path = ''/);
  assert.match(migration, /revoke all on function public\.queue_payload_unchanged\(public\.queues, jsonb\) from public, anon, authenticated/);
});

test("Edge Function ต้องรู้จักรหัสใหม่ ไม่งั้นจะถูกตีเป็นเน็ตล่ม", () => {
  // รหัสที่ไม่อยู่ใน allowlist จะถูก throw ออกไปเป็น 500 ฝั่งแอปอ่านเป็น transport error
  // แล้วเก็บรหัสอ้างอิงเดิมไว้ กดใหม่ก็เจอเดิมวนไม่จบ
  const list = edge.slice(edge.indexOf("const queueCreateErrors"), edge.indexOf("]);", edge.indexOf("const queueCreateErrors")));
  assert.ok(list.includes('"request_id_stale"'));
});

test("ฝั่งแอปต้องมีข้อความของรหัสใหม่ และห้ามบอกให้กดบันทึกซ้ำ", () => {
  assert.match(gate, /request_id_stale: "/);
  const message = gate.match(/request_id_stale: "([^"]+)"/)[1];
  assert.ok(message.includes("คิวเดิม"), "ต้องบอกให้ไปแก้ที่คิวเดิม");
  assert.ok(!/ลองอีกครั้ง|ลองใหม่|กดบันทึกอีกครั้ง/.test(message),
    "ห้ามชวนให้กดบันทึกซ้ำ เพราะคิวลงไปแล้ว จะกลายเป็นสองคิว");
});

test("รหัสต้องเป็นชุดเดียวกันทั้งสามฝั่ง", () => {
  for (const code of ["request_id_stale", "request_id_forbidden", "invalid_queue_payload"]) {
    assert.ok(edge.includes(`"${code}"`), `Edge Function ไม่รู้จัก ${code}`);
    assert.ok(gate.includes(`${code}: "`), `ฝั่งแอปไม่มีข้อความของ ${code}`);
  }
});
