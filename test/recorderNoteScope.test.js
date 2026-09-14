import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// helpers.js import "./constants" แบบไม่มีนามสกุล — node ESM resolve ไม่ได้
// จึงอ่านเป็นข้อความแทนการ import (แบบเดียวกับ guard อื่นในโปรเจกต์)
//
// "ชื่อผู้บันทึกจริง" เป็นของคิว ไม่ใช่ของคนที่เปิดฟอร์ม
//
// หน้าร้านล็อกอินค้างด้วยบัญชีผู้จัดการสาขาบัญชีเดียวใช้ร่วมกันหลายคน งานประจำวันคือ
// เปิดคิวที่แอดมินลงมาให้แล้วกดปิดเป็น "เสร็จแล้ว" ตอนที่บังคับกรอกชื่อทุกครั้งที่แก้ไข
// ชื่อคนกดปิดจะไปเกาะคิวของแอดมิน แล้วช่องผู้บันทึกขึ้นเป็น "เอมมี่(ยอน)" ซึ่งอ่านแล้ว
// เหมือนเอมมี่ลงคิวด้วยบัญชียอน ทั้งที่ยอนเป็นคนลงคิว เอมมี่แค่มาแก้ทีหลัง
// (เจอจริงบนโปรดักชัน 10 ก.ย. 2569 — ตอนนั้นมี 20 คิวที่ชื่อเพี้ยนแบบนี้)

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const helpers = read("../src/utils/helpers.js");
const app = read("../src/App.jsx");
const bookingPage = read("../src/pages/BookingPage.jsx");
const timelinePage = read("../src/pages/TimelinePage.jsx");

// รันฟังก์ชันจริงจาก helpers.js — ตัวมันไม่พึ่งอะไรในไฟล์เลย ตัดออกมา eval ได้ตรง ๆ
function loadRequiresRecorderNote() {
  const start = helpers.indexOf("export function requiresRecorderNote");
  assert.ok(start > 0, "หา requiresRecorderNote ใน helpers.js ไม่เจอ");
  const end = helpers.indexOf("\n}", start) + 2;
  const src = helpers.slice(start, end).replace("export function", "function");
  return new Function(`${src}; return requiresRecorderNote;`)();
}

const MANAGER = { id: "mgr-1", role: "branch_manager" };
const ADMIN = { id: "adm-1", role: "admin" };

test("ลงคิวใหม่ด้วยบัญชีผู้จัดการสาขา ต้องกรอกชื่อผู้บันทึกจริง", () => {
  const requiresRecorderNote = loadRequiresRecorderNote();
  assert.equal(requiresRecorderNote(MANAGER, null), true);
});

test("แก้คิวที่บัญชีตัวเองลงไว้เอง ยังต้องกรอก", () => {
  const requiresRecorderNote = loadRequiresRecorderNote();
  assert.equal(requiresRecorderNote(MANAGER, { recordedBy: "mgr-1", recordedNote: "โย" }), true);
});

test("แก้คิวที่บัญชีอื่นลงไว้ ต้องไม่ถาม — ไม่งั้นชื่อคนกดปิดไปเกาะคิวของแอดมิน", () => {
  const requiresRecorderNote = loadRequiresRecorderNote();
  assert.equal(requiresRecorderNote(MANAGER, { recordedBy: "adm-1", recordedNote: "" }), false);
});

test("บัญชีบทบาทอื่นไม่มีช่องนี้เลย ไม่ว่าคิวไหน", () => {
  const requiresRecorderNote = loadRequiresRecorderNote();
  assert.equal(requiresRecorderNote(ADMIN, null), false);
  assert.equal(requiresRecorderNote(ADMIN, { recordedBy: "adm-1" }), false);
  assert.equal(requiresRecorderNote(null, null), false);
});

test("ทุกจุดต้องเรียก requiresRecorderNote ไม่ใช่เช็ค role ตรง ๆ", () => {
  // เช็ค role ตรง ๆ = กลับไปบังคับกรอกตอนแก้คิวของคนอื่นอีกรอบ
  for (const [label, source] of [["App.jsx", app], ["หน้าบันทึกคิว", bookingPage], ["ป๊อปอัป Timeline", timelinePage]]) {
    assert.ok(!/role === "branch_manager" && !\w*[Bb]ookingForm|role === "branch_manager" && !form/.test(source),
      `${label}: ยังมีการเช็ค role ตรง ๆ คู่กับ recordedNote อยู่`);
    assert.match(source, /requiresRecorderNote\(/, `${label}: ต้องใช้ requiresRecorderNote`);
  }
});

test("แก้คิวของคนอื่นต้องส่งชื่อเดิมกลับไป ไม่ใช่ค่าว่างจากฟอร์ม", () => {
  // ฟอร์มของคนที่ไม่เห็นช่องนี้จะมี recordedNote เป็นค่าว่างเสมอ ปล่อยไปตามฟอร์ม
  // = ล้างชื่อผู้บันทึกจริงของคิวคนอื่นทิ้งเงียบ ๆ ทุกครั้งที่หน้าร้านกดแก้
  assert.match(app, /recordedNote: editingOriginal\?\.recordedNote \|\| ""/);
  assert.match(app, /updateQueue\(editingQueueId, recorderNoteRequired/);
});
