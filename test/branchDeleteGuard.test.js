import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ลบสาขาแล้วต้องไม่ลบคิวตามทอด
//
// ตาราง branches ยังไม่ได้เปิด RLS และบัญชีสาธารณะ (anon key ที่ฝังอยู่ในหน้าเว็บ)
// มีสิทธิ์ delete — ตรวจยิงจากภายนอกจริงเมื่อ 12 ก.ย. 2569 สั่งลบได้จริง
// ของเดิม branch_id เป็น CASCADE ทั้ง queues และ rooms = คำสั่งเดียวลบคิวทั้งสาขา

const migration = readFileSync(
  new URL("../supabase/migrations/20260912150000_branch_fk_restrict.sql", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");

test("ความสัมพันธ์ branch_id ต้องเป็น RESTRICT ไม่ใช่ CASCADE", () => {
  for (const tbl of ["queues", "rooms"]) {
    const re = new RegExp(`alter table public\\.${tbl} add constraint ${tbl}_branch_id_fkey[\\s\\S]{0,160}on delete restrict`);
    assert.match(migration, re, `${tbl} ต้องเป็น on delete restrict`);
  }
  // ตัดบรรทัดคอมเมนต์ทิ้งก่อน (คำว่า CASCADE ปรากฏในคำอธิบายว่าของเดิมเป็นแบบไหน)
  const statements = migration.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");
  assert.ok(!/on delete cascade/i.test(statements), "ห้ามมี cascade หลงเหลือในคำสั่งจริง");
});

test("ลบสาขาไม่สำเร็จต้องบอกเหตุผล ไม่ใช่เงียบ", () => {
  // ของเดิมไม่มี try/catch เลย ฐานข้อมูลปฏิเสธแล้วหน้าจอเงียบสนิท กดแล้วไม่รู้ว่าเกิดอะไร
  const start = app.indexOf("const deleteBranch = useCallback");
  assert.ok(start > 0);
  const fn = app.slice(start, app.indexOf("}, [showToast]);", start));
  assert.match(fn, /error\?\.code === "23503"/, "ต้องดักรหัสข้อผิดพลาดของ foreign key");
  assert.match(fn, /ยังมีคิวหรือห้องผูกอยู่/);
  assert.ok(!/setBranches[\s\S]*await deleteBranchDB/.test(fn),
    "ต้องลบในฐานข้อมูลให้สำเร็จก่อน ค่อยเอาออกจากหน้าจอ");
});
