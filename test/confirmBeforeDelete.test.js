import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ปุ่มถังขยะในหน้าตั้งค่า ต้องถามก่อนลบทุกหน้า
//
// เจ้าของงานเจอเองตอนทดสอบ 16 ก.ย. 2569: หน้า "จัดการสาขา" กดปุ่มถังขยะแล้วลบทันที
// ไม่มีจังหวะให้ทบทวน หน้าพนักงานกับหน้าหัตถการถามอยู่แล้ว แต่สาขา ห้อง และโปร ไม่ถาม
//
// ตอนนี้สาขาทุกอันมีคิวผูกอยู่ ฐานข้อมูลเลยกันไว้ให้ (FK RESTRICT จาก #188) แต่สาขาที่
// เพิ่งสร้างยังไม่มีคิว จะลบหลุดได้จริง ๆ ด้วยการกดพลาดครั้งเดียว

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

const PAGES = [
  ["BranchesPage", "สาขา"],
  ["RoomsPage", "ห้อง"],
  ["PromosPage", "โปร"],
  ["StaffPage", "พนักงาน"],
  ["ProceduresPage", "หัตถการ"],
];

for (const [page, label] of PAGES) {
  test(`${label}: ปุ่มลบต้องถามก่อน`, () => {
    const src = read(`../src/pages/${page}.jsx`);
    assert.match(src, /window\.confirm\(/, `${page} ไม่มีการถามยืนยัน`);
    // ห้ามมีปุ่มลบที่ยิง onDelete ตรง ๆ โดยไม่ผ่าน confirm
    assert.ok(!/onClick=\{\(\) => onDelete\(/.test(src),
      `${page} ยังมีปุ่มลบที่ยิงทันทีโดยไม่ถาม`);
  });
}

test("เหตุผลที่ลบสาขาไม่ได้ ต้องขุดออกมาจาก body ไม่ใช่อ่านจาก error.message", () => {
  // คำตอบที่ไม่ใช่ 2xx มาถึงเป็น FunctionsHttpError ซึ่ง message เป็นข้อความกลาง ๆ
  // ถ้าเทียบกับ error.message ตรง ๆ จะไม่มีวันตรง หน้าจอจะขึ้น "ลองอีกครั้ง" แทนเหตุผลจริง
  const api = read("../src/utils/sessionApi.js");
  const app = read("../src/App.jsx");
  assert.match(api, /export async function serverErrorCode\(error\)/);
  assert.match(api, /error\?\.context/);
  assert.match(app, /const serverCode = await serverErrorCode\(error\);/);
  assert.match(app, /error\?\.code === "23503" \|\| serverCode === "branch_in_use"/);
  assert.ok(!/error\?\.message === "branch_in_use"/.test(app),
    "ห้ามกลับไปเทียบกับ error.message อีก");
});

// ── ทดสอบการทำงานจริง ไม่ใช่แค่ดูข้อความในไฟล์ ──
// sessionApi.js ไม่ import อะไรเลย จึงเรียกใช้ตรง ๆ ใน node ได้
const { serverErrorCode } = await import("../src/utils/sessionApi.js");

function fakeHttpError(status, body) {
  return {
    message: "Edge Function returned a non-2xx status code",
    context: {
      status,
      clone() { return this; },
      json: async () => body,
    },
  };
}

test("ขุดรหัสเหตุผลออกมาจากคำตอบ 409 ได้จริง", async () => {
  assert.equal(await serverErrorCode(fakeHttpError(409, { error: "branch_in_use" })), "branch_in_use");
});

test("คำตอบที่อ่าน body ไม่ได้ ต้องไม่ระเบิด", async () => {
  const broken = {
    message: "boom",
    context: { clone() { return this; }, json: async () => { throw new Error("not json"); } },
  };
  assert.equal(await serverErrorCode(broken), null);
});

test("ข้อผิดพลาดที่ไม่มี context (เช่น เน็ตหลุด) ต้องคืน null เฉย ๆ", async () => {
  assert.equal(await serverErrorCode(new Error("network down")), null);
  assert.equal(await serverErrorCode(null), null);
  assert.equal(await serverErrorCode(undefined), null);
});

test("body ที่ไม่มีช่อง error ต้องคืน null ไม่ใช่เดาเอง", async () => {
  assert.equal(await serverErrorCode(fakeHttpError(500, { message: "oops" })), null);
  assert.equal(await serverErrorCode(fakeHttpError(400, { error: 42 })), null);
});
