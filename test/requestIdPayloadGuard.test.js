import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// รหัสอ้างอิงเดิม + ข้อมูลเปลี่ยน = ต้องปฏิเสธ ไม่ใช่ส่งใบเก่ากลับพร้อมบอกว่าสำเร็จ
//
// กลไกรหัสอ้างอิงมีไว้กันคิวซ้ำตอนเน็ตกระตุก แต่ของเดิมดูแค่ "เคยเห็นรหัสนี้ไหม"
// ถ้าแอดมินแก้ฟอร์มแล้วกดใหม่ ระบบจะส่งใบเก่ากลับ สิ่งที่แก้ไม่ได้ลงเลย
// ทางนี้กำลังจะขยายจากกลุ่มทดลอง 3 บัญชีไปทั้งระบบ ปล่อยไว้อาการจะกระจายทุกสาขา

const migration = readFileSync(
  new URL("../supabase/migrations/20260913090000_create_queue_v1_request_id_payload_guard.sql", import.meta.url), "utf8");
const gate = readFileSync(new URL("../src/utils/queueCreateGate.js", import.meta.url), "utf8");

test("ต้องเทียบข้อมูลก่อนส่งใบเดิมกลับ", () => {
  const start = migration.indexOf("if found then");
  const end = migration.indexOf("return to_jsonb(v_existing);", start);
  const block = migration.slice(start, end);
  for (const field of ["name", "phone", "branch_id", "room_id", "procedure_id",
                       "promo_id", "date", "time_block", "price", "customer_type", "note"]) {
    assert.ok(block.includes(`v_existing.${field} is distinct from`), `ต้องเทียบ ${field}`);
  }
  assert.match(block, /message = 'invalid_queue_payload'/);
});

test("ต้องไม่เทียบ status — ฝั่งแอปเลื่อนเองตามกฎจองวันนี้", () => {
  // ข้ามเที่ยงคืนระหว่างสองครั้งที่กด status จะเปลี่ยนเอง จะกลายเป็นปฏิเสธผิด ๆ
  const start = migration.indexOf("if found then");
  const end = migration.indexOf("return to_jsonb(v_existing);", start);
  const block = migration.slice(start, end);
  assert.ok(!/v_existing\.status is distinct from/.test(block));
});

test("ความยาวคิวเทียบเฉพาะตอนฝั่งแอปส่งค่ามาจริง", () => {
  // ไม่ส่งมา = เซิร์ฟเวอร์เติมจากหัตถการให้เอง เทียบตรง ๆ จะไม่ตรงเสมอ
  assert.match(migration, /nullif\(p_payload->>'duration_blocks', ''\) is not null\s*\n\s*and v_existing\.duration_blocks is distinct from/);
});

test("ต้องใช้ error code ที่ฝั่งแอปรู้จักอยู่แล้ว", () => {
  // รหัสใหม่ที่ Edge Function/ฝั่งแอปไม่รู้จัก จะถูกตีเป็นเน็ตล่ม แล้วรหัสอ้างอิงเดิม
  // จะถูกเก็บไว้ กดใหม่ก็วนเจอเดิมไม่จบ = ลงคิวไม่ได้เลย แย่กว่าปัญหาเดิม
  assert.match(gate, /invalid_queue_payload:/, "ฝั่งแอปต้องมีข้อความของรหัสนี้");
  const start = migration.indexOf("if found then");
  const end = migration.indexOf("return to_jsonb(v_existing);", start);
  assert.ok(!/request_id_payload_mismatch/.test(migration.slice(start, end)),
    "ห้ามสร้างรหัสใหม่ที่สองฝั่งยังไม่รู้จัก");
});

test("กดซ้ำด้วยข้อมูลเดิมต้องยังได้ใบเดิม ไม่เกิดคิวซ้ำ", () => {
  const start = migration.indexOf("if found then");
  const end = migration.indexOf("end if;", migration.indexOf("return to_jsonb(v_existing);", start));
  assert.match(migration.slice(start, end), /return to_jsonb\(v_existing\);/);
});
