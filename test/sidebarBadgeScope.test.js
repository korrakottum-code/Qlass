import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ตัวเลขข้างเมนูในแถบซ้าย
//
// ตั้งแต่ #180 คิวรอถูกโหลดมาครบทั้งก้อน (รวมของที่ค้างมาหลายเดือน) ตัวเลขข้างเมนู
// "คิวรอ" เลยเด้งจากหลักสิบเป็นหลักร้อย เจ้าของเลือกให้กลับไปนับช่วงสั้น ๆ เหมือนเดิม
// และให้นับฐานเดียวกับตัวเลขข้างเมนู "ตารางคิว" ที่นับเดือนนี้อยู่แล้ว จะได้อ่านเทียบกันได้

const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");

test("ตัวเลขคิวรอข้างเมนูต้องนับเฉพาะเดือนนี้ ไม่ใช่ยอดค้างทั้งหมด", () => {
  assert.match(app, /waitingQueueCount=\{filteredQueues\.filter\(q => \(q\.status \|\| "pending"\) === "waiting_queue" && q\.date\?\.startsWith\(thisMonthPrefix\)\)\.length\}/);
});

test("ทั้งสองตัวเลขต้องใช้เดือนเดียวกัน", () => {
  const matches = app.match(/thisMonthPrefix/g) || [];
  assert.ok(matches.length >= 3, "ต้องมีทั้งที่ประกาศและที่ใช้ทั้งสองตัวเลข");
});

test("เดือนต้องคิดตามเวลาไทย ไม่ใช่ UTC", () => {
  // toISOString() เป็น UTC — ต้นเดือนก่อน 07:00 ตามเวลาไทย UTC ยังเป็นเดือนก่อน
  // ตัวเลขจะเพี้ยนทั้งวันโดยไม่มีใครรู้ตัว
  assert.match(app, /const thisMonthPrefix = getTodayStr\(\)\.slice\(0, 7\);/);
  assert.ok(!/startsWith\(new Date\(\)\.toISOString\(\)\.slice\(0, 7\)\)/.test(app),
    "ห้ามกลับไปใช้เดือนแบบ UTC อีก");
});
