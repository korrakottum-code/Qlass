import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// รหัสสาขาสำหรับบอทน้องคลาส (booking-api) ตั้งได้จากหน้า "จัดการสาขา"
//
// เดิมสาขาใหม่จะโผล่ใน GET /v1/branches ก็ต่อเมื่อมีคน insert แถวใน booking_api_branches ด้วยมือ
// (ตารางปิดจากคีย์หน้าเว็บ) — เปิดสาขาเดือนละหลายสาขาแล้วต้องมาขอคนรัน SQL ทุกครั้ง จึงย้ายให้
// ผู้ดูแลระบบตั้งรหัสในฟอร์มสาขาเอง ผ่าน staff-session (ทางเดียวที่เขียนตารางนี้ได้)

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8").split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
const edge = read("../supabase/functions/staff-session/index.ts");
const migration = read("../supabase/migrations/20261001100000_booking_api.sql");
const api = read("../src/utils/sessionApi.js");
const auth = read("../src/utils/sessionAuth.js");
const app = read("../src/App.jsx");
const modal = read("../src/components/modals/BranchModal.jsx");
const page = read("../src/pages/BranchesPage.jsx");

test("รหัสต้องถูกตรวจที่เซิร์ฟเวอร์ด้วยกติกาเดียวกับ check constraint ของตาราง", () => {
  assert.match(migration, /code\s+text primary key check \(code ~ '\^\[A-Z\]\{2,6\}\$'\)/);
  assert.match(edge, /function bookingApiCode\(value: unknown\): string \| null \| undefined/);
  assert.match(edge, /\/\^\[A-Z\]\{2,6\}\$\/\.test\(code\)/);
  assert.match(edge, /invalid_booking_code/);
  // ฝั่งฟอร์มเช็คกติกาเดียวกันก่อนส่ง จะได้บอกผู้ใช้ทันทีโดยไม่ต้องรอเซิร์ฟเวอร์
  assert.match(modal, /const BOOKING_CODE_RE = \/\^\[A-Z\]\{2,6\}\$\//);
});

test("สร้าง/แก้สาขาต้องเขียนรหัสไปด้วยในคำขอเดียว และเฉพาะผู้ดูแลระบบ (สิทธิ์เดิมของหน้าจัดการสาขา)", () => {
  const block = edge.slice(
    edge.indexOf('body?.action === "branch_create" || body?.action === "branch_update"'),
    edge.indexOf('body?.action === "branch_booking_list"'),
  );
  assert.match(block, /branchManagementRoles\.has/);
  assert.match(block, /const code = bookingApiCode\(body\.branch\?\.bookingApiCode\)/);
  assert.match(block, /saveBookingApiBranch\(data\.id, code, active\)/);
  // ทางอ่านรายการรหัสก็ต้องผ่านสิทธิ์เดียวกัน ไม่ใช่ใครมีเซสชันก็ดึงได้
  const list = edge.slice(edge.indexOf('body?.action === "branch_booking_list"'));
  assert.match(list.slice(0, 600), /branchManagementRoles\.has/);
});

test("รหัสซ้ำกับสาขาอื่นต้องตอบเป็นเหตุผล ไม่ใช่แย่งรหัสมาเงียบ ๆ หรือระบบพัง", () => {
  const save = edge.slice(edge.indexOf("async function saveBookingApiBranch("), edge.indexOf("function publicBranch("));
  // code เป็น primary key: upsert on conflict(code) จะย้ายรหัสของสาขาอื่นมาเป็นของเรา — ห้ามใช้
  assert.doesNotMatch(save, /\.upsert\(/);
  assert.match(save, /\.insert\(\{ code, branch_id: branchId, active \}\)/);
  assert.match(save, /=== "23505"\) return "in_use"/);
  assert.match(edge, /booking_code_in_use/);
  // ตอนสร้างสาขาใหม่ เช็ครหัสซ้ำก่อน insert สาขา ไม่งั้นสาขาเกิดแล้วแต่รหัสไม่ติด
  const create = edge.slice(edge.indexOf('body.action === "branch_update"'), edge.indexOf('body?.action === "branch_booking_list"'));
  const insertBranchAt = create.indexOf('from("branches").insert');
  const takenCheckAt = create.indexOf('.eq("code", code).maybeSingle()');
  assert.ok(takenCheckAt > -1 && takenCheckAt < insertBranchAt, "ต้องเช็ครหัสซ้ำก่อนสร้างสาขา");
});

test("ฟอร์มเวอร์ชันเก่าที่ไม่ส่งรหัสมา ต้องไม่ลบรหัสเดิม (คนที่เปิดหน้าเว็บค้างระหว่าง deploy)", () => {
  // ตอน deploy edge function ก่อนหน้าเว็บ ผู้ดูแลที่ยังใช้ bundle เดิมจะส่ง branch: { name } มาเฉย ๆ
  // ถ้าตีความ undefined เป็น "ว่าง" แค่แก้ชื่อสาขาก็ทำให้สาขาหายจาก GET /v1/branches ของบอทเงียบ ๆ
  assert.match(edge, /if \(value === undefined\) return undefined;/);
  const update = edge.slice(edge.indexOf('body.action === "branch_update"'), edge.indexOf("// เช็ครหัสซ้ำก่อนสร้างสาขา"));
  assert.match(update, /code === undefined\s*\?\s*await readBookingApiBranch\(data\.id\)\s*:\s*await saveBookingApiBranch\(data\.id, code, active\)/);
});

test("เว้นรหัสว่าง = ถอนสาขาออกจาก API (ลบแถว) ไม่ใช่เก็บแถวค้างด้วยรหัสว่าง", () => {
  const save = edge.slice(edge.indexOf("async function saveBookingApiBranch("), edge.indexOf("function publicBranch("));
  assert.match(save, /if \(!code\) \{[\s\S]*?\.delete\(\)\.eq\("branch_id", branchId\)/);
  // รหัสเดิมเท่ากัน → แก้แค่ active ไม่ลบ-ใส่ใหม่ (สาขาไม่หายจาก /v1/branches แม้ชั่วขณะ)
  assert.match(save, /if \(existing\?\.code === code\)/);
});

test("ฝั่งแอป: โหลดรหัสผ่านเซิร์ฟเวอร์เฉพาะผู้ดูแลระบบ และส่งรหัสไปกับฟอร์มสาขา", () => {
  assert.ok(api.includes("async fetchBranchBookingCodes("), "sessionApi ขาด fetchBranchBookingCodes");
  assert.match(api, /action: "branch_booking_list"/);
  assert.ok(auth.includes("fetchBranchBookingCodes"), "sessionAuth ไม่ได้ export fetchBranchBookingCodes");
  assert.match(app, /if \(!useServerSession \|\| currentUser\?\.role !== "superadmin"\) return undefined;/);
  assert.match(app, /fetchBranchBookingCodes\(getServerSessionToken\(\)\)/);
  assert.match(app, /bookingEnabled=\{useServerSession\}/);
  assert.match(app, /bookingCodes=\{useServerSession \? branchBookingCodes : null\}/);
  // ฟอร์มส่ง bookingApiCode/bookingApiActive เฉพาะโหมดเซิร์ฟเวอร์ — โหมดเขียนตรงไม่มีทางแตะตารางนี้
  assert.match(modal, /if \(!bookingEnabled\) return onSave\(\{ id: data\?\.id, name: name\.trim\(\) \}\)/);
  assert.match(modal, /bookingApiCode: trimmed, bookingApiActive: active/);
  // คอลัมน์ในตารางสาขาซ่อนเมื่อไม่มีข้อมูล (null) ไม่ใช่โชว์ "ไม่เปิดให้บอท" ผิด ๆ ในโหมดเขียนตรง
  assert.match(page, /const showBooking = bookingCodes !== null;/);
});

test("ข้อความ 'รหัสซ้ำ' ต้องขึ้นจากรหัสใน body ของเซิร์ฟเวอร์ ไม่ใช่ข้อความกลาง ๆ", () => {
  const save = app.slice(app.indexOf("const saveBranch = useCallback("), app.indexOf("const saveProcedure = useCallback("));
  assert.match(save, /const serverCode = await serverErrorCode\(error\)/);
  assert.match(save, /serverCode === "booking_code_in_use"/);
  assert.match(save, /serverCode === "invalid_booking_code"/);
});
