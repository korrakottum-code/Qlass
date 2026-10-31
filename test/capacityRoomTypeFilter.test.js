import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// หน้า "คิวว่าง" — เลือกดูประเภทห้องได้ และเลิกวัดด้วยชั่วโมง
//
// เจ้าของงานอ่านการ์ด "ว่าง ห้องฉีด (M) 3,087 ชม. จาก 3,691.5 ชม." แล้วแปลไม่ออกว่าว่างมากหรือน้อย
// ต้องหารในหัวเอง และเทียบสองฝั่งไม่ได้เพราะความจุห้องเครื่องมากกว่าห้องฉีดเกือบสองเท่า
// อีกข้อคือปุ่มเดิมทำได้อย่างเดียวคือแสดงทั้งสองประเภทพร้อมกัน จะดูทีละประเภทไม่ได้

const page = readFileSync(new URL("../src/pages/CapacityPage.jsx", import.meta.url), "utf8");

test("มีปุ่มเลือกประเภทห้อง ครบ ทั้งหมด + ทุกประเภทที่มีห้อง พร้อมคำไทยกำกับ", () => {
  assert.match(page, /\[\["all", "ทั้งหมด"\], \.\.\.shownTypes\.map\(\(t\) => \[t, `\$\{roomTypeMeta\(t\)\.short\} \(\$\{t\}\)`\]\)\]/);
  // ห้องพยาบาล (N) โชว์เฉพาะเมื่อมีห้อง N จริง
  assert.match(page, /rooms\.some\(\(r\) => r\.type === "N"\) \? CAPACITY_ROOM_TYPES : CAPACITY_ROOM_TYPES\.filter\(\(t\) => t !== "N"\)/);
});

test("การเลือกประเภทต้องกรองที่ตัวห้อง ไม่ใช่แค่ซ่อนแถวในตาราง", () => {
  // ถ้ากรองแค่ตอนวาดตาราง ตัวเลขบนการ์ดด้านบนจะยังเป็นของสองประเภทรวมกัน อ่านขัดกันเอง
  assert.match(page, /typeFilter === "all" \|\| capacityRoomType\(r\) === typeFilter/);
  assert.match(page, /\)\), \[rooms, filterBranch, typeFilter\]\);/);
});

test("ห้องที่ไม่ได้ตั้งประเภทต้องถูกนับเป็น T เหมือนฝั่งคำนวณ", async () => {
  const capacity = readFileSync(new URL("../src/utils/capacity.js", import.meta.url), "utf8");
  assert.match(capacity, /const type = capacityRoomType\(room\);/);
  const { capacityRoomType } = await import("../src/utils/capacity.js");
  assert.equal(capacityRoomType({ type: "M" }), "M");
  assert.equal(capacityRoomType({ type: "T" }), "T");
  assert.equal(capacityRoomType({ type: "N" }), "N");
  assert.equal(capacityRoomType({ type: null }), "T");
  assert.equal(capacityRoomType({ type: "X" }), "T");
});

test("การ์ดแยกประเภทห้อง ต้องโชว์ % ว่าง ไม่ใช่ชั่วโมง", () => {
  assert.match(page, /function TypeSplitCard\(\{ byType, types \}\)/);
  assert.match(page, /const pct = freePercent\(side\.cell\);/);
  assert.ok(!/mFree=\{|blocksToHours\(mFree\)|blocksToHours\(tFree\)|blocksToHours\(side\.cell/.test(page),
    "ห้ามกลับไปส่งชั่วโมงเข้าการ์ดแยกประเภทอีก");
});

test("คำแนะนำว่าฝั่งไหนว่างกว่า ต้องเทียบเป็น % ไม่ใช่ชั่วโมงดิบ", () => {
  // ความจุแต่ละฝั่งไม่เท่ากัน ถ้าเทียบชั่วโมงดิบ ฝั่งที่ใหญ่กว่าจะชนะเกือบทุกครั้ง คำแนะนำจะชี้ผิดฝั่ง
  assert.match(page, /\(freePercent\(summary\.totals\.byType\[type\]\) \?\? -1\) > \(freePercent\(summary\.totals\.byType\[best\]\) \?\? -1\)/);
  assert.ok(!/summary\.totals\.byType\.M\.free >= summary\.totals\.byType\.T\.free/.test(page),
    "ห้ามกลับไปเทียบชั่วโมงดิบอีก");
});

test("เลือกประเภทเดียวอยู่ ต้องไม่โชว์การ์ดคู่และคำแนะนำที่เทียบสองฝั่ง", () => {
  assert.match(page, /\{typeFilter === "all" && \(\s*<TypeSplitCard/);
  assert.match(page, /\{summary\.totals\.capacity > 0 && typeFilter === "all" && \(/);
  // ปุ่มแยกสองแถวใช้ไม่ได้ถ้ากรองเหลือประเภทเดียว — ต้องปิดผลของมัน ไม่ใช่ปล่อยให้ตารางว่างครึ่งหนึ่ง
  assert.match(page, /const splitRows = splitByType && typeFilter === "all";/);
});

test("ยังต้องมีโหมดแยกสองแถวของเดิมอยู่", () => {
  assert.match(page, /splitRows \? \(/);
});

test("ตัวย่อ M/T ต้องมีคำไทยกำกับเสมอ", () => {
  // "แยก M/T" เดิมไม่มีที่ไหนบอกว่า M กับ T แปลว่าอะไร
  assert.ok(!/\{splitByType \? "✓ แยก M\/T แล้ว" : "แยก M\/T"\}/.test(page),
    "ห้ามเหลือปุ่มที่เขียนแค่ตัวย่อ");
  assert.match(page, /ห้องฉีด \(M\)/);
  assert.match(page, /ห้องเครื่อง \(T\)/);
});
