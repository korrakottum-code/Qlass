import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ย้ายการเขียนตาราง "สาขา" ไปฝั่งเซิร์ฟเวอร์
//
// คีย์ที่หน้าเว็บใช้ ฝังอยู่ในไฟล์ที่ใครเปิดหน้าเว็บก็โหลดไปอ่านได้ ตราบใดที่คีย์นั้นยัง
// เขียนตาราง branches ได้ คนนอกก็สร้าง/แก้/ลบสาขาได้เหมือนกัน — ตัวตรวจของ Supabase
// รายงานเรื่องนี้เป็นระดับ ERROR มาตลอด
//
// ปิดสิทธิ์เฉย ๆ ไม่ได้ เพราะหน้า "จัดการสาขา" เขียนตรงจากเบราว์เซอร์ ต้องย้ายทางเขียน
// ไปฝั่งเซิร์ฟเวอร์ให้ครบก่อน (แพทเทิร์นเดียวกับที่ทำกับตารางพนักงานใน Goal 18)

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const edge = read("../supabase/functions/staff-session/index.ts");
const api = read("../src/utils/sessionApi.js");
const auth = read("../src/utils/sessionAuth.js");
const app = read("../src/App.jsx");
const constants = read("../src/utils/constants.js");

test("เซิร์ฟเวอร์ต้องรับทั้งสร้าง แก้ และลบสาขา", () => {
  assert.match(edge, /body\?\.action === "branch_create" \|\| body\?\.action === "branch_update"/);
  assert.match(edge, /body\?\.action === "branch_delete"/);
});

test("เฉพาะผู้ดูแลระบบเท่านั้นที่แก้สาขาได้ และต้องตรงกับเมนูในแอป", () => {
  assert.match(edge, /const branchManagementRoles = new Set\(\["superadmin"\]\);/);
  // เมนู "จัดการสาขา" ต้องอยู่ใน pages ของ superadmin เท่านั้น ถ้าวันหนึ่งเปิดให้ role อื่น
  // แล้วลืมแก้ฝั่งเซิร์ฟเวอร์ คนนั้นจะกดปุ่มแล้วโดนปฏิเสธโดยไม่มีใครรู้ว่าทำไม
  const rolesWithBranchPage = [...constants.matchAll(/value: "(\w+)",[\s\S]*?pages: \[([^\]]*)\]/g)]
    .filter((m) => m[2].includes('"branches"'))
    .map((m) => m[1]);
  assert.deepEqual(rolesWithBranchPage, ["superadmin"]);

  const deleteBlock = edge.slice(edge.indexOf('body?.action === "branch_delete"'));
  assert.match(deleteBlock.slice(0, 500), /branchManagementRoles\.has/,
    "ทางลบต้องเช็คสิทธิ์ด้วย ไม่ใช่เช็คแค่ทางสร้าง/แก้");
});

test("ชื่อสาขาต้องถูกตรวจที่เซิร์ฟเวอร์ ไม่ใช่เชื่อเบราว์เซอร์", () => {
  assert.match(edge, /function branchName\(value: unknown\)/);
  assert.match(edge, /name\.length >= 1 && name\.length <= 80/);
  assert.match(edge, /invalid_branch_payload/);
});

test("ลบสาขาที่ยังมีคิว/ห้องอยู่ ต้องตอบเป็นเหตุผล ไม่ใช่ระบบพัง", () => {
  const deleteBlock = edge.slice(edge.indexOf('body?.action === "branch_delete"'));
  assert.match(deleteBlock, /=== "23503"/);
  assert.match(deleteBlock, /branch_in_use/);
});

test("ฝั่งแอปต้องวิ่งผ่านเซิร์ฟเวอร์เมื่อเปิดโหมดเซสชันเซิร์ฟเวอร์", () => {
  for (const fn of ["createBranchServer", "updateBranchServer", "deleteBranchServer"]) {
    assert.ok(api.includes(`async ${fn}(`), `sessionApi ขาด ${fn}`);
    assert.ok(auth.includes(fn), `sessionAuth ไม่ได้ export ${fn}`);
    assert.ok(app.includes(fn), `App.jsx ไม่ได้เรียก ${fn}`);
  }
  assert.match(app, /useServerSession\s*\?\s*await updateBranchServer/);
  assert.match(app, /useServerSession\s*\?\s*await createBranchServer/);
  assert.match(app, /if \(useServerSession\) await deleteBranchServer/);
});

test("ข้อความ 'ลบไม่ได้เพราะยังมีคิว' ต้องขึ้นได้ทั้งสองทาง", () => {
  // ทางตรงส่งรหัส 23503 ทางเซิร์ฟเวอร์ส่งข้อความ branch_in_use — ถ้ารับแค่ทางเดียว
  // พอสลับทาง ข้อความจะกลายเป็น "ลองอีกครั้ง" แล้วผู้ใช้กดวนไม่จบ
  assert.match(app, /error\?\.code === "23503" \|\| error\?\.message === "branch_in_use"/);
});
