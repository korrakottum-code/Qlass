import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

// xlsx (SheetJS) บน npm หยุดที่ 0.18.5 ซึ่งมีช่องโหว่ระดับสูง 2 รายการ (Prototype Pollution + ReDoS ตอน "อ่านไฟล์")
// เวอร์ชันที่แก้แล้ว (0.20.3+) แจกผ่านเว็บของ SheetJS เท่านั้น ไม่มีบน npm — เก็บไฟล์ติดตั้งไว้ใน vendor/
// เพื่อให้ build/deploy ไม่ต้องพึ่งเว็บภายนอก (25 ก.ย. 2569, ผลเช็คสุขภาพ)
// ถ้าใครรัน `npm install xlsx` เฉย ๆ จะได้ 0.18.5 กลับมา เทสต์นี้กันไว้

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("xlsx ต้องชี้ไปที่ไฟล์ใน vendor/ ไม่ใช่เวอร์ชันบน npm", () => {
  assert.match(pkg.dependencies.xlsx, /^file:vendor\/xlsx-\d+\.\d+\.\d+\.tgz$/);
  const file = pkg.dependencies.xlsx.replace(/^file:/, "");
  assert.ok(existsSync(new URL(`../${file}`, import.meta.url)), `ไม่พบ ${file}`);
});

test("เวอร์ชัน xlsx ที่ติดตั้งต้องไม่ต่ำกว่า 0.20.3 (เวอร์ชันแรกที่แก้ช่องโหว่)", () => {
  const installed = JSON.parse(readFileSync(new URL("../node_modules/xlsx/package.json", import.meta.url), "utf8")).version;
  const [maj, min, patch] = installed.split(".").map(Number);
  const ok = maj > 0 || min > 20 || (min === 20 && patch >= 3);
  assert.ok(ok, `xlsx ${installed} มีช่องโหว่ — ต้อง >= 0.20.3`);
});

test("แอปใช้ xlsx เขียนไฟล์อย่างเดียว ห้ามเอาไปอ่านไฟล์ที่ผู้ใช้ส่งมา (เว้นแต่ตรวจแล้ว)", () => {
  // ช่องโหว่ของ 0.18.5 เกิดตอนแปลงไฟล์ที่ไม่น่าเชื่อถือ — ถ้าวันหนึ่งมีฟีเจอร์นำเข้าไฟล์ ให้คิดเรื่องนี้ก่อน
  const svc = readFileSync(new URL("../src/utils/exportService.js", import.meta.url), "utf8");
  assert.ok(!/XLSX\.read\(|XLSX\.readFile\(|sheet_to_json\(/.test(svc), "exportService เริ่มอ่านไฟล์แล้ว");
});
