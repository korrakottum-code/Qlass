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
  // เปลี่ยนรหัสของสาขาที่มีรหัสอยู่แล้ว = update แถวเดิม (ชนแล้วแถวเดิมยังอยู่) ไม่ใช่ลบแล้ว insert ใหม่
  // (insert ชน 23505 ตอนนั้นแถวเดิมหายไปแล้ว สาขาตกจาก /v1/branches ทั้งที่ตอบ 409)
  assert.match(save, /existing\s*\?\s*await supabase\.from\("booking_api_branches"\)\.update\(\{ code, active \}\)\.eq\("branch_id", branchId\)/);
  assert.match(save, /:\s*await supabase\.from\("booking_api_branches"\)\.insert\(\{ code, branch_id: branchId, active \}\)/);
  assert.doesNotMatch(save.slice(save.indexOf("if (existing?.code === code")), /\.delete\(\)/, "ทางเปลี่ยนรหัสต้องไม่มี delete");
  assert.match(save, /=== "23505"\) return "in_use"/);
  assert.match(edge, /booking_code_in_use/);
  // เช็ครหัสซ้ำ "ก่อน" แตะตาราง branches ทั้งทางสร้างและทางแก้ — ไม่งั้นสาขาเกิด/ชื่อเปลี่ยนใน DB แล้ว แต่ตอบ 409
  const update = edge.slice(edge.indexOf('body.action === "branch_update"'), edge.indexOf("// เช็ครหัสซ้ำก่อนสร้างสาขา"));
  const updateBranchAt = update.indexOf('from("branches").update');
  const updateTakenAt = update.indexOf('.eq("code", code).neq("branch_id", body.branchId).maybeSingle()');
  assert.ok(updateTakenAt > -1 && updateTakenAt < updateBranchAt, "ทางแก้ไขต้องเช็ครหัสชนสาขาอื่นก่อนแก้ชื่อ");
  const create = edge.slice(edge.indexOf("// เช็ครหัสซ้ำก่อนสร้างสาขา"), edge.indexOf('body?.action === "branch_booking_list"'));
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
  // รหัสเดิมเท่ากัน active เท่ากัน → ไม่เขียนอะไรเลย
  assert.match(save, /if \(existing\?\.code === code && existing\.active === active\) return \{ code, active \};/);
});

test("ยังไม่รู้รหัส (โหลดไม่เสร็จ/ล้ม) ต้องซ่อนช่องรหัส ไม่ใช่ให้ฟอร์มส่งค่าว่างไปลบรหัสจริง", () => {
  // ถ้า state เริ่มเป็น {} ฟอร์มจะเห็นทุกสาขาเป็น "ไม่มีรหัส" แล้วส่ง bookingApiCode: "" ตอนแก้ชื่อ → เซิร์ฟเวอร์ลบแถวทิ้ง
  assert.match(app, /const \[branchBookingCodes, setBranchBookingCodes\] = useState\(null\);/);
  assert.match(app, /bookingEnabled=\{useServerSession && branchBookingCodes !== null\}/);
  assert.match(app, /booking=\{modal\.data && branchBookingCodes \? branchBookingCodes\[modal\.data\.id\] : undefined\}/);
  // โหลดล้มต้องมีเสียง ไม่ใช่กลืนเงียบ
  const effect = app.slice(app.indexOf("fetchBranchBookingCodes(getServerSessionToken())"), app.indexOf("const saveBranch = useCallback("));
  assert.match(effect, /\.catch\(\(\) => \{[\s\S]*?showToast\("error"/);
  // ฟอร์มต้องล็อกค่า bookingEnabled ตอนเปิด: รายการรหัสที่มาถึงหลังเปิดฟอร์มห้ามทำให้ช่องรหัสโผล่ว่าง ๆ
  // แล้วบันทึกชื่อเฉย ๆ กลายเป็นส่งค่าว่างไปลบรหัสจริง
  assert.match(modal, /const \[enabled\] = useState\(bookingEnabled\);/);
  assert.match(modal, /if \(!enabled\) return onSave\(\{ id: data\?\.id, name: name\.trim\(\) \}\)/);
  assert.doesNotMatch(modal.slice(modal.indexOf("function handleSave")), /\bbookingEnabled\b/, "หลังประกาศ enabled ห้ามอ่าน prop สดอีก");
  // คำตอบ save/delete ห้ามเปลี่ยน null เป็นแผนที่บางส่วน
  const save = app.slice(app.indexOf("const saveBranch = useCallback("), app.indexOf("const saveProcedure = useCallback("));
  assert.match(save, /if \(prev === null\) return prev;/);
  const del = app.slice(app.indexOf("const deleteBranch = useCallback("), app.indexOf("const deleteProcedure = useCallback("));
  assert.match(del, /if \(prev === null\) return prev;/);
});

test("ฝั่งแอป: โหลดรหัสผ่านเซิร์ฟเวอร์เฉพาะผู้ดูแลระบบ และส่งรหัสไปกับฟอร์มสาขา", () => {
  assert.ok(api.includes("async fetchBranchBookingCodes("), "sessionApi ขาด fetchBranchBookingCodes");
  assert.match(api, /action: "branch_booking_list"/);
  assert.ok(auth.includes("fetchBranchBookingCodes"), "sessionAuth ไม่ได้ export fetchBranchBookingCodes");
  assert.match(app, /if \(!useServerSession \|\| currentUser\?\.role !== "superadmin"\) return undefined;/);
  assert.match(app, /fetchBranchBookingCodes\(getServerSessionToken\(\)\)/);
  assert.match(app, /bookingCodes=\{useServerSession \? branchBookingCodes : null\}/);
  // ฟอร์มส่ง bookingApiCode/bookingApiActive เฉพาะโหมดเซิร์ฟเวอร์ — โหมดเขียนตรงไม่มีทางแตะตารางนี้
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
